import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Download,
  EyeOff,
  Flag,
  Heart,
  Loader2,
  LogIn,
  LogOut,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  WifiOff,
} from 'lucide-react';
import { Avatar, EmptyState, Modal, Segmented, ThumbImage, formatCount, relativeTime, useToast } from '../ui';
import type { ThemeDefinition } from '../themes/types';
import { fairyClient } from '../services/fairyClient';
import type { HashDatabase, NsfwFilterState, WorkshopRecipe } from '../shared/types';
import type { CommunityPost, CommunityProfile, CommunityView } from '../shared/community';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const REPORT_REASONS = [
  'Should be labeled 18+',
  'Doesn’t work / broken',
  'Credits are wrong',
  'Spam or offensive name',
  'Something else',
];

interface Props {
  theme: ThemeDefinition;
  hashDb: HashDatabase;
  nsfwFilterState: NsfwFilterState;
  /** Load a post's recipe into the Workshop (downloads missing mods, then builds). */
  onGet: (recipe: WorkshopRecipe) => void;
  /** Bumped after posting so lists refresh. */
  refreshKey: number;
  me: CommunityProfile | null;
  onMeChange: (me: CommunityProfile | null) => void;
}

export const CommunityPanel: React.FC<Props> = ({ theme, hashDb, nsfwFilterState, onGet, refreshKey, me, onMeChange }) => {
  const notify = useToast();
  const [view, setView] = useState<CommunityView>('all');
  const [sort, setSort] = useState<'new' | 'top'>('new');
  const [agentId, setAgentId] = useState<string>('');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<Record<string, Array<{ reason: string; created_at: string }>>>({});
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [reporting, setReporting] = useState<CommunityPost | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fairyClient.communityList({
          view,
          sort,
          agentId: agentId || null,
          hideNsfw: nsfwFilterState === 'hide' || nsfwFilterState === 'toggle',
          page: nextPage,
        });
        setPosts((prev) => (nextPage === 0 ? res.posts : [...prev, ...res.posts]));
        setLiked((prev) => new Set([...(nextPage === 0 ? [] : prev), ...res.likedIds]));
        setReports((prev) => (nextPage === 0 ? res.reports : { ...prev, ...res.reports }));
        setHasMore(res.hasMore);
        setPage(nextPage);
      } catch (e) {
        setError(errMsg(e));
        if (nextPage === 0) setPosts([]);
      } finally {
        setLoading(false);
      }
    },
    [view, sort, agentId, nsfwFilterState]
  );

  useEffect(() => {
    load(0);
  }, [load, refreshKey, me?.id]);

  const signIn = async () => {
    setSigningIn(true);
    try {
      const profile = await fairyClient.communitySignIn();
      onMeChange(profile);
      notify({ tone: 'success', title: `Signed in as ${profile.display_name}` });
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t sign in', message: errMsg(e) });
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    await fairyClient.communitySignOut().catch(() => {});
    onMeChange(null);
    if (view !== 'all') setView('all');
  };

  const toggleLike = async (p: CommunityPost) => {
    if (!me) return signIn();
    const on = !liked.has(p.id);
    setLiked((s) => {
      const n = new Set(s);
      if (on) n.add(p.id);
      else n.delete(p.id);
      return n;
    });
    setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, like_count: Math.max(0, x.like_count + (on ? 1 : -1)) } : x)));
    try {
      await fairyClient.communityLike(p.id, on);
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t save that', message: errMsg(e) });
      load(0);
    }
  };

  const act = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      notify({ tone: 'success', title: label });
      load(0);
    } catch (e) {
      notify({ tone: 'error', title: 'That didn’t work', message: errMsg(e) });
    }
  };

  const agentsWithNames = Object.values(hashDb.agents).sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <div className="stack-4">
      <section className="card card--pad">
        <div className="row wrap" style={{ gap: 12 }}>
          {me ? (
            <>
              <Avatar src={me.avatar_url} alt={me.display_name} />
              <div className="min-w-0">
                <div style={{ fontWeight: 650 }}>{me.display_name}</div>
                <div className="caption">{me.is_admin ? 'Moderator' : me.banned ? 'Can’t post' : 'Signed in with Discord'}</div>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={signOut}>
                <LogOut /> Sign out
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0" style={{ flex: 1 }}>
                <div style={{ fontWeight: 650 }}>Browse mods other people made</div>
                <div className="caption">Sign in with Discord to post, like and report.</div>
              </div>
              <button className="btn btn--primary btn--sm" onClick={signIn} disabled={signingIn}>
                {signingIn ? <Loader2 className="spin" /> : <LogIn />}
                {signingIn ? 'Finish in your browser…' : 'Sign in with Discord'}
              </button>
            </>
          )}
          <div className="spacer" />
          {me && (
            <Segmented<CommunityView>
              ariaLabel="Which posts"
              value={view}
              onChange={setView}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'mine', label: 'My posts' },
                ...(me.is_admin ? [{ value: 'moderation' as const, label: 'Reports', icon: <ShieldAlert /> }] : []),
              ]}
            />
          )}
        </div>
        <div className="row wrap" style={{ gap: 12, marginTop: 16 }}>
          <select className="select" style={{ width: 220 }} value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Agent">
            <option value="">All agents</option>
            {agentsWithNames.map((a) => (
              <option key={a.agent_id} value={a.agent_id}>
                {a.display_name}
              </option>
            ))}
          </select>
          <Segmented<'new' | 'top'>
            ariaLabel="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'new', label: 'Newest' },
              { value: 'top', label: 'Most liked' },
            ]}
          />
          {(nsfwFilterState === 'hide' || nsfwFilterState === 'toggle') && view === 'all' && (
            <span className="caption">
              <EyeOff style={{ width: 13, height: 13, verticalAlign: '-2px' }} /> 18+ posts are hidden (Settings → Content filter)
            </span>
          )}
        </div>
      </section>

      {error ? (
        <EmptyState icon={<WifiOff />} title="Couldn’t load the community page" tone="error" actions={<button className="btn btn--secondary" onClick={() => load(0)}>Try again</button>}>
          {error}
        </EmptyState>
      ) : posts.length === 0 && !loading ? (
        <EmptyState icon={view === 'moderation' ? <ShieldCheck /> : <Users />} title={view === 'moderation' ? 'Nothing to review' : view === 'mine' ? 'You haven’t posted yet' : 'No posts yet'} motif={theme.motif}>
          {view === 'moderation'
            ? 'Reported posts show up here.'
            : 'Build a mod in the Workshop, then press Post under “Made by you”.'}
        </EmptyState>
      ) : (
        <div className="cm-grid">
          {posts.map((p) => {
            const agent = hashDb.agents[p.agent_id];
            const blurred = p.is_nsfw && nsfwFilterState !== 'show' && !revealed.has(p.id);
            const mine = me?.id === p.author_id;
            return (
              <article key={p.id} className={`card cm-card ${p.status !== 'published' ? 'is-hidden' : ''}`}>
                <div className={`cm-card__thumb ${blurred ? 'is-blurred' : ''}`}>
                  <ThumbImage src={p.thumbnail_url} alt={p.name} motif={theme.motif} />
                  {p.is_nsfw && (
                    <span className="badge badge--error cm-card__flag" title={p.nsfw_reasons.join('\n')}>
                      18+
                    </span>
                  )}
                  {blurred && (
                    <button className="cm-card__reveal" onClick={() => setRevealed((s) => new Set(s).add(p.id))}>
                      Show
                    </button>
                  )}
                  {p.status !== 'published' && <span className="badge badge--warning cm-card__status">{p.status === 'hidden' ? 'Hidden' : 'Removed'}</span>}
                </div>
                <div className="cm-card__body">
                  <div className="cm-card__title truncate" title={p.name}>
                    {p.name}
                  </div>
                  <div className="caption truncate">
                    {agent?.display_name ?? p.agent_id} · by {p.author?.display_name ?? 'Proxy'} · {relativeTime(p.created_at)}
                  </div>
                  {p.description && <p className="small muted cm-card__desc">{p.description}</p>}
                  <ul className="cm-card__parts">
                    {p.recipe.parts.map((part) => (
                      <li key={part.part} title={`${part.source.title}${part.source.author ? ` by ${part.source.author}` : ''}`}>
                        <b>{part.part === 'Other' ? 'Extras' : part.part}</b>
                        <span className="truncate">{part.source.title}</span>
                      </li>
                    ))}
                  </ul>
                  {view === 'moderation' && reports[p.id]?.length ? (
                    <div className="ws-note ws-note--warn">
                      <Flag />
                      <div className="small">
                        {reports[p.id].map((r, i) => (
                          <div key={i}>{r.reason || 'No reason given'}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="row cm-card__actions">
                    <button className={`btn btn--ghost btn--sm cm-like ${liked.has(p.id) ? 'is-on' : ''}`} onClick={() => toggleLike(p)} aria-pressed={liked.has(p.id)} title="Like">
                      <Heart /> {formatCount(p.like_count)}
                    </button>
                    <div className="spacer" />
                    {!mine && me && view !== 'moderation' && (
                      <button className="btn btn--ghost btn--sm" title="Report" onClick={() => setReporting(p)}>
                        <Flag />
                      </button>
                    )}
                    {(mine || me?.is_admin) && (
                      <button
                        className="btn btn--ghost btn--sm"
                        title="Delete post"
                        onClick={() => act('Post deleted', () => fairyClient.communityRemove(p.id))}
                      >
                        <Trash2 />
                      </button>
                    )}
                    <button className="btn btn--primary btn--sm" onClick={() => onGet(p.recipe)}>
                      <Download /> Get
                    </button>
                  </div>
                  {me?.is_admin && (
                    <div className="row wrap cm-card__mod">
                      {p.status === 'published' ? (
                        <button className="btn btn--secondary btn--sm" onClick={() => act('Post hidden', () => fairyClient.communityModerate(p.id, 'hidden', null))}>
                          <EyeOff /> Hide
                        </button>
                      ) : (
                        <button className="btn btn--secondary btn--sm" onClick={() => act('Post restored', () => fairyClient.communityModerate(p.id, 'published', null))}>
                          <RotateCcw /> Restore
                        </button>
                      )}
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => act(p.is_nsfw ? '18+ label removed' : 'Labeled 18+', () => fairyClient.communityModerate(p.id, null, !p.is_nsfw))}
                      >
                        <ShieldAlert /> {p.is_nsfw ? 'Not 18+' : 'Label 18+'}
                      </button>
                      {!mine && (
                        <button className="btn btn--ghost btn--sm" onClick={() => act('User banned and posts removed', () => fairyClient.communityBan(p.author_id, true))}>
                          <Ban /> Ban author
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {(loading || hasMore) && !error && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn--secondary" disabled={loading} onClick={() => load(page + 1)}>
            {loading ? <Loader2 className="spin" /> : null}
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      <ReportDialog
        post={reporting}
        onClose={() => setReporting(null)}
        onSubmit={async (reason) => {
          const p = reporting!;
          setReporting(null);
          try {
            await fairyClient.communityReport(p.id, reason);
            notify({ tone: 'success', title: 'Thanks, report sent', message: 'A moderator will take a look.' });
          } catch (e) {
            notify({ tone: 'error', title: 'Couldn’t send the report', message: errMsg(e) });
          }
        }}
      />
    </div>
  );
};

const ReportDialog: React.FC<{ post: CommunityPost | null; onClose: () => void; onSubmit: (reason: string) => void }> = ({ post, onClose, onSubmit }) => {
  const [choice, setChoice] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  useEffect(() => {
    if (post) {
      setChoice(REPORT_REASONS[0]);
      setDetails('');
    }
  }, [post]);
  return (
    <Modal open={Boolean(post)} onClose={onClose} labelledBy="cm-report-title">
      <div className="stack-4" style={{ padding: 24 }}>
        <h2 id="cm-report-title" className="h3">
          Report “{post?.name}”
        </h2>
        <div className="stack" role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map((r) => (
            <label key={r} className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="radio" name="report-reason" checked={choice === r} onChange={() => setChoice(r)} />
              {r}
            </label>
          ))}
        </div>
        <textarea className="input" rows={3} maxLength={240} placeholder="Anything else? (optional)" value={details} onChange={(e) => setDetails(e.target.value)} style={{ height: 'auto', paddingTop: 8 }} />
        <div className="row">
          <div className="spacer" />
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={() => onSubmit(details.trim() ? `${choice}: ${details.trim()}` : choice)}>
            <Flag /> Send report
          </button>
        </div>
      </div>
    </Modal>
  );
};

/** Posting a Workshop mod. 18+ labels are decided by the server; this just explains them. */
export const PostDialog: React.FC<{
  mod: { mod_uuid: string; title: string; gamebanana_ok: boolean } | null;
  me: CommunityProfile | null;
  onSignIn: () => Promise<void>;
  onClose: () => void;
  onPosted: (post: CommunityPost) => void;
}> = ({ mod, me, onSignIn, onClose, onPosted }) => {
  const notify = useToast();
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mod) setDescription('');
  }, [mod]);

  const post = async () => {
    if (!mod) return;
    setBusy(true);
    try {
      const p = await fairyClient.communityPublish(mod.mod_uuid, description.trim());
      onPosted(p);
      notify({
        tone: p.is_nsfw ? 'warning' : 'success',
        title: 'Posted to the community',
        message: p.is_nsfw ? `Labeled 18+: ${p.nsfw_reasons.join('; ')}` : undefined,
      });
      onClose();
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t post it', message: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(mod)} onClose={onClose} labelledBy="cm-post-title">
      <div className="stack-4" style={{ padding: 24 }}>
        <h2 id="cm-post-title" className="h3">
          Post “{mod?.title}” to the community
        </h2>
        <p className="small muted">
          Your post shares which part came from which GameBanana mod, with credit to each creator. People who get it download those mods from GameBanana.
        </p>
        {!mod?.gamebanana_ok && (
          <div className="ws-note ws-note--warn">
            <ShieldAlert />
            <p className="small">Some parts come from mods that aren’t on GameBanana, so others couldn’t get them. Rebuild it using GameBanana mods to post it.</p>
          </div>
        )}
        <label className="stack" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 650 }}>
            Description (optional)
          </span>
          <textarea className="input" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} style={{ height: 'auto', paddingTop: 8 }} />
        </label>
        <p className="caption">
          18+ labels are checked automatically against each mod’s GameBanana content ratings. Posts can be reported, and 3 reports hide a post until a moderator reviews it.
        </p>
        <div className="row">
          <div className="spacer" />
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          {me ? (
            <button className="btn btn--primary" onClick={post} disabled={busy || !mod?.gamebanana_ok || me.banned}>
              {busy ? <Loader2 className="spin" /> : <Users />} {busy ? 'Checking and posting…' : 'Post'}
            </button>
          ) : (
            <button className="btn btn--primary" onClick={onSignIn}>
              <LogIn /> Sign in with Discord
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
