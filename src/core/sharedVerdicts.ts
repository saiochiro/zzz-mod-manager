import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../shared/community';
import type { NsfwLevel } from '../shared/nsfw';

/**
 * Content-scan results shared between all ProxyLaunch users (Supabase table mod_verdicts, see
 * supabase/verdicts.sql). Only NSFW / Experimental results are shared, and they only ever make a
 * mod stricter: "SFW" is never taken from another PC, every PC verifies that itself.
 */

export const SCAN_VERSION = 3;
const TTL_MS = 30 * 60 * 1000;
const shared = new Map<number, { level: Exclude<NsfwLevel, 'sfw'> | null; at: number }>();
let disabled = false; // table not set up yet: stop asking

const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };

async function req(url: string, init: RequestInit = {}, ms = 3000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, headers, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Loads shared verdicts for these GameBanana ids (cached for 30 minutes). */
export async function prefetchSharedVerdicts(ids: number[]): Promise<void> {
  if (disabled) return;
  const now = Date.now();
  const todo = [...new Set(ids)].filter((id) => id > 0 && !(shared.get(id) && now - shared.get(id)!.at < TTL_MS));
  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    const res = await req(`${SUPABASE_URL}/rest/v1/mod_verdicts?select=gb_id,level&gb_id=in.(${chunk.join(',')})`);
    if (!res) return;
    if (res.status === 404 || res.status === 400) {
      disabled = true;
      return;
    }
    if (!res.ok) return;
    const rows = (await res.json()) as Array<{ gb_id: number; level: string }>;
    for (const id of chunk) shared.set(id, { level: null, at: now });
    for (const r of rows) if (r.level === 'nsfw' || r.level === 'toggle') shared.set(Number(r.gb_id), { level: r.level, at: now });
  }
}

export function sharedLevel(gbId: number | null | undefined): Exclude<NsfwLevel, 'sfw'> | null {
  return gbId ? shared.get(gbId)?.level ?? null : null;
}

/** Tells everyone else this mod isn't SFW. SFW results are never sent. */
export function reportSharedVerdict(gbId: number, level: NsfwLevel): void {
  if (disabled || !gbId || level === 'sfw') return;
  const cur = shared.get(gbId)?.level;
  if (cur === 'nsfw' || cur === level) return;
  shared.set(gbId, { level: level === 'nsfw' ? 'nsfw' : 'toggle', at: Date.now() });
  void req(`${SUPABASE_URL}/rest/v1/rpc/report_mod_verdict`, {
    method: 'POST',
    body: JSON.stringify({ p_gb_id: gbId, p_level: level, p_scan_version: SCAN_VERSION }),
  }).then((res) => {
    if (res && res.status === 404) disabled = true;
  });
}
