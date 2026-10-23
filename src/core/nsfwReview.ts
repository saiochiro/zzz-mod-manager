import fs from 'fs';
import path from 'path';
import {
  CODE_LEVEL,
  NSFW_VERDICTS_URL,
  parseVerdictFile,
  type NsfwLevel,
  type NsfwSource,
  type NsfwVerdictEntry,
  type NsfwVerdictFile,
} from '../shared/nsfw';

/**
 * Pre-marked content labels. Mods are scanned ahead of time on GitHub (scripts/nsfw-prescan.mjs,
 * run every hour) and the app only downloads the list (verdicts.json) and applies it. Nothing is
 * scanned on the user's PC, and users can't change a label.
 *
 * Keys: "gb:<GameBanana id>".
 */

/** Fields the labels add to anything with an NSFW label. */
export interface NsfwReviewFields {
  is_nsfw?: boolean;
  nsfw_level?: NsfwLevel;
  nsfw_source?: NsfwSource;
  /** This mod has a pre-scanned label. */
  nsfw_checked?: boolean;
  /** The label GameBanana gave it in the feed. */
  nsfw_flagged?: boolean;
  /** imageKey()s of the pictures rated clean. */
  nsfw_clean_images?: string[];
}

const REFRESH_MS = 60 * 60 * 1000;
let cachePath: string | null = null;
let verdicts = new Map<string, NsfwVerdictEntry>();
let lastFetch = 0;
let lastEtag = '';
let inflight: Promise<boolean> | null = null;
let firstLoad: Promise<unknown> | null = null;
const listeners = new Set<() => void>();

function load(file: NsfwVerdictFile): void {
  verdicts = new Map(Object.entries(file.mods));
}

export function initNsfwReview(appDataPath: string, opts: { fetch?: boolean } = {}): void {
  verdicts = new Map();
  lastFetch = 0;
  lastEtag = '';
  try {
    const dir = path.join(appDataPath, 'cache');
    fs.mkdirSync(dir, { recursive: true });
    cachePath = path.join(dir, 'nsfw_verdicts.json');
    // Results of the old on-device scan aren't used any more.
    for (const old of ['nsfw_review.json', 'nsfw_review_log.jsonl', 'nsfw_review_log.jsonl.1']) {
      fs.rmSync(path.join(dir, old), { force: true });
    }
    if (fs.existsSync(cachePath)) {
      const parsed = parseVerdictFile(JSON.parse(fs.readFileSync(cachePath, 'utf-8')));
      if (parsed) load(parsed);
    }
  } catch (err) {
    console.warn('[Content labels] Could not load the saved list:', err);
  }
  firstLoad = opts.fetch === false ? Promise.resolve() : refreshNsfwVerdicts(true);
}

/** Downloads the latest list (at most once an hour unless forced). True when it changed. */
export function refreshNsfwVerdicts(force = false): Promise<boolean> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastFetch < REFRESH_MS) return Promise.resolve(false);
  inflight = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(NSFW_VERDICTS_URL, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ProxyLaunch', ...(lastEtag ? { 'If-None-Match': lastEtag } : {}) },
      });
      lastFetch = Date.now();
      if (res.status === 304 || !res.ok) return false;
      const text = await res.text();
      const parsed = parseVerdictFile(JSON.parse(text));
      if (!parsed) return false;
      lastEtag = res.headers.get('etag') || '';
      load(parsed);
      if (cachePath) {
        try {
          fs.writeFileSync(cachePath, text, 'utf-8');
        } catch {
          // ignore disk errors
        }
      }
      for (const fn of listeners) fn();
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
  })();
  return inflight;
}

/** Waits (up to a few seconds) for the first download, so Browse opens already labeled. */
export async function nsfwVerdictsReady(ms = 8000): Promise<void> {
  if (!firstLoad) return;
  await Promise.race([firstLoad, new Promise((r) => setTimeout(r, verdicts.size ? 0 : ms))]);
}

export function onNsfwVerdictsUpdated(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** GameBanana-style records of every SFW mod, for serving the SFW view of Browse locally. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSfwCatalog(): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (const v of verdicts.values()) if (v.l === 's' && v.k?._idRow) out.push(v.k);
  return out;
}

export function nsfwVerdictCount(): number {
  return verdicts.size;
}

/** For tests: use this list instead of the downloaded one. */
export function setNsfwVerdictsForTest(file: NsfwVerdictFile): void {
  load(file);
}

export function nsfwKey(item: { gamebanana_id?: number | null; id?: number }): string | null {
  const gb = item.gamebanana_id ?? item.id;
  return gb ? `gb:${gb}` : null;
}

/** Puts the pre-scanned label (if any) on an item. Safe to call more than once. */
export function applyNsfwReview<T extends NsfwReviewFields>(item: T, key: string | null): T & NsfwReviewFields {
  const flagged = item.nsfw_flagged ?? Boolean(item.is_nsfw);
  const st = key?.startsWith('gb:') ? verdicts.get(key.slice(3)) : undefined;
  const out: T & NsfwReviewFields = { ...item, nsfw_flagged: flagged };
  // A label made while GameBanana didn't flag the mod doesn't count once it does: wait for a new scan.
  if (st && !(flagged && !st.f)) {
    const level = CODE_LEVEL[st.l] ?? 'nsfw';
    out.nsfw_level = level;
    out.is_nsfw = level !== 'sfw';
    out.nsfw_source = 'ai';
    out.nsfw_checked = true;
    out.nsfw_clean_images = st.c ?? [];
  } else {
    out.nsfw_level = flagged ? 'nsfw' : 'sfw';
    out.is_nsfw = flagged;
    out.nsfw_source = flagged ? 'gamebanana' : undefined;
    out.nsfw_checked = false;
    out.nsfw_clean_images = [];
  }
  return out;
}
