import fs from 'fs';
import path from 'path';
import {
  NSFW_VERDICTS_URL,
  parseVerdictFile,
  type NsfwLevel,
  type NsfwSource,
  type NsfwVerdictEntry,
  type NsfwVerdictFile,
} from '../shared/nsfw';

/**
 * Content labels come straight from GameBanana. A GitHub job (scripts/nsfw-prescan.mjs, hourly)
 * lists every ZZZ mod with GameBanana's label and keeps the cards of the SFW ones, so the
 * "SFW only" view of Browse can show all of them at once. The app downloads that list
 * (verdicts.json); nothing is scanned on users' PCs and users can't change a label.
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
  // An older saved list (no safe-mod cards yet) isn't enough for the SFW view: wait for the new one.
  const ready = verdicts.size > 0 && [...verdicts.values()].some((v) => v.k);
  await Promise.race([firstLoad, new Promise((r) => setTimeout(r, ready ? 0 : ms))]);
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

/**
 * Puts the label on an item. The label is GameBanana's own: content ratings, NSFW visibility,
 * or NSFW words in the title or tags (gamebananaService isModRecordNsfw). No AI is involved.
 * Safe to call more than once. `key` is kept for callers; labels don't depend on it any more.
 */
export function applyNsfwReview<T extends NsfwReviewFields>(item: T, _key?: string | null): T & NsfwReviewFields {
  const flagged = item.nsfw_flagged ?? Boolean(item.is_nsfw);
  return {
    ...item,
    nsfw_flagged: flagged,
    nsfw_level: flagged ? 'nsfw' : 'sfw',
    is_nsfw: flagged,
    nsfw_source: 'gamebanana',
    nsfw_checked: true,
    nsfw_clean_images: [],
  };
}
