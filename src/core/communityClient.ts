import crypto from 'crypto';
import http from 'http';
import {
  AUTH_CALLBACK_PORT,
  AUTH_CALLBACK_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  type CommunityPage,
  type CommunityPost,
  type CommunityProfile,
  type CommunityQuery,
} from '../shared/community';
import type { WorkshopRecipe } from '../shared/types';

/**
 * Talks to the ProxyLaunch community database (Supabase) from the main process.
 * No SDK: plain REST calls, plus Discord sign-in with PKCE through a one-shot
 * local callback server, so tokens never pass through the renderer.
 */

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  /** Unix seconds */
  expires_at: number;
  user_id: string;
}

export interface SessionStore {
  load(): StoredSession | null;
  save(session: StoredSession | null): void;
}

const PAGE_SIZE = 24;
const POST_FIELDS =
  'id,author_id,agent_id,name,description,recipe,part_names,source_gb_ids,thumbnail_url,is_nsfw,nsfw_reasons,status,like_count,report_count,created_at,author:profiles(display_name,avatar_url)';

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function friendlyError(status: number, body: any): Error {
  const msg: string = body?.message || body?.msg || body?.error_description || body?.error || '';
  if (status === 409 || body?.code === '23505') return new Error('You already did that.');
  if (status === 401 || body?.code === '28000') return new Error(msg && !/jwt/i.test(msg) ? msg : 'Sign in with Discord first.');
  if (body?.code === 'PGRST202' || body?.code === '42P01' || /relation .* does not exist|could not find the function/i.test(msg)) {
    return new Error('The community page isn’t set up yet. The database setup hasn’t been run.');
  }
  return new Error(msg || `Community server error (${status}).`);
}

export class CommunityClient {
  private pendingSignIn: Promise<CommunityProfile> | null = null;

  constructor(
    private readonly store: SessionStore,
    private readonly openExternal: (url: string) => Promise<void> | void
  ) {}

  /* ------------------------------------------------------------ auth */

  private async token(grant: 'pkce' | 'refresh_token', body: Record<string, string>): Promise<StoredSession> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw friendlyError(res.status, data);
    const session: StoredSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user_id: data.user?.id,
    };
    this.store.save(session);
    return session;
  }

  /** A valid session, refreshed if it's about to expire; null when signed out. */
  private async session(): Promise<StoredSession | null> {
    const s = this.store.load();
    if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    try {
      return await this.token('refresh_token', { refresh_token: s.refresh_token });
    } catch (err) {
      // Refresh token revoked or expired: sign out. Network errors keep the session.
      if ((err as Error).message && !/fetch failed|network|ENOTFOUND|ECONN/i.test((err as Error).message)) {
        this.store.save(null);
        return null;
      }
      throw new Error('Can’t reach the community server. Check your internet connection.');
    }
  }

  signIn(): Promise<CommunityProfile> {
    if (!this.pendingSignIn) {
      this.pendingSignIn = this.runSignIn().finally(() => {
        this.pendingSignIn = null;
      });
    }
    return this.pendingSignIn;
  }

  private async runSignIn(): Promise<CommunityProfile> {
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

    const code = await new Promise<string>((resolve, reject) => {
      const page = (title: string, text: string) =>
        `<!doctype html><meta charset="utf-8"><title>ProxyLaunch</title><body style="font-family:system-ui,sans-serif;background:#15161d;color:#f2f2f5;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:22px">${title}</h1><p style="color:#a7a9b6">${text}</p></div>`;
      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', AUTH_CALLBACK_URL);
        if (url.pathname !== '/auth/callback') {
          res.writeHead(404).end();
          return;
        }
        const gotCode = url.searchParams.get('code');
        const err = url.searchParams.get('error_description') || url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          gotCode
            ? page('You’re signed in', 'You can close this tab and go back to ProxyLaunch.')
            : page('Sign-in didn’t finish', 'Close this tab and try again in ProxyLaunch.')
        );
        cleanup();
        if (gotCode) resolve(gotCode);
        else reject(new Error(err ? `Discord sign-in failed: ${err}` : 'Discord sign-in was cancelled.'));
      });
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Sign-in timed out. Try again.'));
      }, 5 * 60 * 1000);
      const cleanup = () => {
        clearTimeout(timer);
        server.close();
      };
      server.once('error', (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          new Error(
            e.code === 'EADDRINUSE'
              ? `Sign-in needs port ${AUTH_CALLBACK_PORT}, which another program is using. Close other ProxyLaunch windows and try again.`
              : `Couldn’t start sign-in: ${e.message}`
          )
        );
      });
      server.listen(AUTH_CALLBACK_PORT, '127.0.0.1', () => {
        const authorize =
          `${SUPABASE_URL}/auth/v1/authorize?provider=discord` +
          `&redirect_to=${encodeURIComponent(AUTH_CALLBACK_URL)}` +
          `&code_challenge=${challenge}&code_challenge_method=s256`;
        Promise.resolve(this.openExternal(authorize)).catch((e) => {
          cleanup();
          reject(e);
        });
      });
    });

    await this.token('pkce', { auth_code: code, code_verifier: verifier });
    const me = await this.me();
    if (!me) throw new Error('Signed in, but your profile couldn’t be loaded. Try again.');
    return me;
  }

  signOut(): void {
    const s = this.store.load();
    this.store.save(null);
    if (s) {
      fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}` },
      }).catch(() => {});
    }
  }

  /* ------------------------------------------------------------ REST */

  private async rest<T = any>(
    path: string,
    opts: { method?: string; body?: unknown; prefer?: string; requireAuth?: boolean } = {}
  ): Promise<{ data: T; count: number | null }> {
    const s = await this.session();
    if (opts.requireAuth && !s) throw new Error('Sign in with Discord first.');
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: opts.method || 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${s?.access_token || SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          ...(opts.prefer ? { Prefer: opts.prefer } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch {
      throw new Error('Can’t reach the community server. Check your internet connection.');
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw friendlyError(res.status, data);
    const range = res.headers.get('content-range');
    const count = range && range.includes('/') ? Number(range.split('/')[1]) || null : null;
    return { data, count };
  }

  async me(): Promise<CommunityProfile | null> {
    const s = await this.session();
    if (!s) return null;
    const { data } = await this.rest<CommunityProfile[]>(`profiles?id=eq.${s.user_id}&select=id,display_name,avatar_url,is_admin,banned`);
    return data?.[0] ?? { id: s.user_id, display_name: 'Proxy', avatar_url: null, is_admin: false, banned: false };
  }

  async list(q: CommunityQuery): Promise<CommunityPage> {
    const s = await this.session();
    const params = new URLSearchParams({ select: POST_FIELDS });
    if (q.view === 'mine') {
      if (!s) return { posts: [], likedIds: [], reports: {}, hasMore: false };
      params.append('author_id', `eq.${s.user_id}`);
      params.append('status', 'neq.removed');
    } else if (q.view === 'moderation') {
      params.append('or', '(status.eq.hidden,and(status.eq.published,report_count.gt.0))');
    } else {
      params.append('status', 'eq.published');
    }
    if (q.agentId) params.append('agent_id', `eq.${q.agentId}`);
    if (q.hideNsfw && q.view === 'all') params.append('is_nsfw', 'eq.false');
    params.append('order', q.sort === 'top' ? 'like_count.desc,created_at.desc' : 'created_at.desc');
    params.append('limit', String(PAGE_SIZE + 1));
    params.append('offset', String(Math.max(0, q.page) * PAGE_SIZE));

    const { data } = await this.rest<CommunityPost[]>(`posts?${params.toString()}`);
    const posts = (data || []).slice(0, PAGE_SIZE);
    const ids = posts.map((p) => p.id);

    let likedIds: string[] = [];
    if (s && ids.length) {
      const liked = await this.rest<Array<{ post_id: string }>>(`likes?select=post_id&user_id=eq.${s.user_id}&post_id=in.(${ids.join(',')})`);
      likedIds = (liked.data || []).map((l) => l.post_id);
    }
    const reports: CommunityPage['reports'] = {};
    if (q.view === 'moderation' && ids.length) {
      const r = await this.rest<Array<{ post_id: string; reason: string; created_at: string }>>(
        `reports?select=post_id,reason,created_at&resolved=eq.false&post_id=in.(${ids.join(',')})&order=created_at.desc`
      );
      for (const row of r.data || []) (reports[row.post_id] ||= []).push({ reason: row.reason, created_at: row.created_at });
    }
    return { posts, likedIds, reports, hasMore: (data || []).length > PAGE_SIZE };
  }

  async publish(recipe: WorkshopRecipe, description: string): Promise<CommunityPost> {
    const { data } = await this.rest<CommunityPost>('rpc/publish_post', {
      method: 'POST',
      body: { p_recipe: recipe, p_description: description },
      requireAuth: true,
    });
    return data;
  }

  async setLiked(postId: string, liked: boolean): Promise<void> {
    const s = await this.session();
    if (!s) throw new Error('Sign in with Discord to like posts.');
    if (liked) {
      await this.rest('likes', { method: 'POST', body: { post_id: postId, user_id: s.user_id }, prefer: 'return=minimal' }).catch((e) => {
        if (!/already did/i.test((e as Error).message)) throw e;
      });
    } else {
      await this.rest(`likes?post_id=eq.${postId}&user_id=eq.${s.user_id}`, { method: 'DELETE' });
    }
  }

  async report(postId: string, reason: string): Promise<void> {
    const s = await this.session();
    if (!s) throw new Error('Sign in with Discord to report posts.');
    await this.rest('reports', {
      method: 'POST',
      body: { post_id: postId, reporter_id: s.user_id, reason: reason.slice(0, 300) },
      prefer: 'return=minimal',
    }).catch((e) => {
      if (/already did/i.test((e as Error).message)) throw new Error('You already reported this post.');
      throw e;
    });
  }

  async remove(postId: string): Promise<void> {
    const { data } = await this.rest<any[]>(`posts?id=eq.${postId}`, { method: 'DELETE', prefer: 'return=representation', requireAuth: true });
    if (!data?.length) throw new Error('You can only delete your own posts.');
  }

  async moderate(postId: string, status: 'published' | 'hidden' | 'removed' | null, isNsfw: boolean | null): Promise<CommunityPost> {
    const { data } = await this.rest<CommunityPost>('rpc/moderate_post', {
      method: 'POST',
      body: { p_post: postId, p_status: status, p_is_nsfw: isNsfw },
      requireAuth: true,
    });
    return data;
  }

  async setBanned(userId: string, banned: boolean): Promise<void> {
    await this.rest('rpc/set_user_banned', { method: 'POST', body: { p_user: userId, p_banned: banned }, requireAuth: true });
  }
}
