import fs from 'fs';
import path from 'path';
import {
  decideNsfwLevel,
  imageKey,
  NSFW_FILE_RE,
  NSFW_WORDS_RE,
  NUDE_EDIT_RE,
  nsfwKeyOf,
  STRONG_RATING_RE,
  TOGGLE_KEY_RE,
  TOGGLE_TEXT_RE,
  type NsfwLevel,
  type NsfwImageScores,
  type NsfwSource,
} from '../shared/nsfw';
import { reportSharedVerdict, sharedLevel } from './sharedVerdicts';

/**
 * The content scan's memory: what the scan decided about each mod, applied to GameBanana items
 * and installed mods. Users can't change these. Every verdict is also written, with the evidence,
 * to a developer log (cache/nsfw_review_log.jsonl) that is never shown in the app.
 *
 * Keys: "gb:<GameBanana id>" (shared by Browse and the Library) or "local:<mod uuid>".
 */

interface StoredVerdict {
  level: NsfwLevel;
  /** Was GameBanana marking it NSFW when it was scanned? A new label later means a new scan. */
  flagged: boolean;
  /** imageKey()s of the pictures the scan rated clean. Only these show in the SFW views. */
  cleanImages: string[];
  checkedAt: string;
}

/** Fields the scan adds to anything with an NSFW label. */
export interface NsfwReviewFields {
  is_nsfw?: boolean;
  nsfw_level?: NsfwLevel;
  nsfw_source?: NsfwSource;
  /** The scan has finished for this mod. */
  nsfw_checked?: boolean;
  /** The label GameBanana gave it before the scan. */
  nsfw_flagged?: boolean;
  /** imageKey()s of the pictures rated clean. */
  nsfw_clean_images?: string[];
}

// 3: zero-tolerance pipeline (every mod scanned, no user overrides). Older results are dropped.
const VERSION = 3;
let filePath: string | null = null;
let logPath: string | null = null;
const store = new Map<string, StoredVerdict>();

export function initNsfwReview(appDataPath: string): void {
  try {
    const dir = path.join(appDataPath, 'cache');
    fs.mkdirSync(dir, { recursive: true });
    filePath = path.join(dir, 'nsfw_review.json');
    logPath = path.join(dir, 'nsfw_review_log.jsonl');
    store.clear();
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (raw?.version === VERSION && raw.items && typeof raw.items === 'object') {
        for (const [k, v] of Object.entries(raw.items)) store.set(k, v as StoredVerdict);
      }
    }
  } catch (err) {
    console.warn('[NSFW scan] Could not load saved results:', err);
  }
}

function persist(): void {
  if (!filePath) return;
  try {
    fs.writeFileSync(filePath, JSON.stringify({ version: VERSION, items: Object.fromEntries(store) }), 'utf-8');
  } catch {
    // ignore disk errors
  }
}

/** Developer diagnostics: one JSON line per verdict. Rotates at 5 MB. */
function devLog(entry: Record<string, unknown>): void {
  if (!logPath) return;
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5 * 1024 * 1024) fs.renameSync(logPath, `${logPath}.1`);
    fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf-8');
  } catch {
    // ignore
  }
  if (process.env.PROXYLAUNCH_DEV) console.log('[NSFW scan]', entry.key, entry.level, entry.reason);
}

export const nsfwKey = nsfwKeyOf;

/** Puts the stored verdict (if any) on an item. Safe to call more than once. */
export function applyNsfwReview<T extends NsfwReviewFields>(item: T, key: string | null): T & NsfwReviewFields {
  const flagged = item.nsfw_flagged ?? Boolean(item.is_nsfw);
  const st = key ? store.get(key) : undefined;
  const out: T & NsfwReviewFields = { ...item, nsfw_flagged: flagged };
  // A verdict made while unflagged doesn't count once GameBanana flags the mod: scan again.
  if (st && !(flagged && !st.flagged)) {
    out.nsfw_level = st.level;
    out.is_nsfw = st.level !== 'sfw';
    out.nsfw_source = 'ai';
    out.nsfw_checked = true;
    out.nsfw_clean_images = st.cleanImages;
  } else {
    out.nsfw_level = flagged ? 'nsfw' : 'sfw';
    out.is_nsfw = flagged;
    out.nsfw_source = flagged ? 'gamebanana' : undefined;
    out.nsfw_checked = false;
    out.nsfw_clean_images = [];
  }
  // Another ProxyLaunch user's scan found this mod NSFW / Experimental: at least that strict here too.
  const gbId = key?.startsWith('gb:') ? Number(key.slice(3)) : null;
  const sh = sharedLevel(gbId);
  const rank = { sfw: 0, toggle: 1, nsfw: 2 } as const;
  if (sh && rank[sh] > rank[out.nsfw_level ?? 'sfw']) {
    out.nsfw_level = sh;
    out.is_nsfw = true;
    // A shared NSFW result is enough to hide or blur it; Experimental still needs this PC's own scan
    // (it decides which pictures are clean).
    if (sh === 'nsfw') out.nsfw_checked = true;
  }
  return out;
}

export function getStoredNsfwVerdict(key: string): StoredVerdict | undefined {
  return store.get(key);
}

/* ------------------------------------------------------------------ */
/* Evidence from GameBanana: page text, ratings, archive file names    */
/* ------------------------------------------------------------------ */

interface GbEvidence {
  text: string;
  ratings: string[];
  hasRatings: boolean;
  fileNames: string[];
}

const UA = { 'User-Agent': 'ProxyLaunch' };
const evidenceCache = new Map<number, Promise<GbEvidence | null>>();

async function getJson(url: string, ms = 6000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: UA });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function gameBananaEvidence(id: number): Promise<GbEvidence | null> {
  if (!evidenceCache.has(id)) {
    evidenceCache.set(
      id,
      (async () => {
        const d = await getJson(`https://gamebanana.com/apiv11/Mod/${id}/ProfilePage`);
        if (!d) return null;
        const files: any[] = Array.isArray(d._aFiles) ? d._aFiles : [];
        const fileNames: string[] = files.flatMap((f) => [f._sFile, f._sDescription].filter(Boolean).map(String));
        // GameBanana has no public API for the files inside an archive (checked: every route 404s or
        // rejects the request), so archive contents are only checked once the mod is installed.
        const ratings = d._aContentRatings && typeof d._aContentRatings === 'object' ? Object.values(d._aContentRatings).map(String) : [];
        return {
          text: [d._sName, d._sDescription, String(d._sText || '').replace(/<[^>]+>/g, ' ')].filter(Boolean).join(' '),
          ratings,
          hasRatings: d._bHasContentRatings === true || ratings.length > 0,
          fileNames,
        };
      })()
    );
  }
  return evidenceCache.get(id)!;
}

/* ------------------------------------------------------------------ */
/* Scan results                                                        */
/* ------------------------------------------------------------------ */

export interface NsfwReviewRequest {
  key: string;
  gamebananaId?: number | null;
  /** GameBanana (or keywords) marked it NSFW before the scan. */
  flagged: boolean;
  title: string;
  description?: string;
  contentRating?: string;
  /** Skins, UI, Audio, Weapons... */
  category?: string;
  /** Installed mods: hotkey section/variable names, and whether the .ini scan found NSFW toggles. */
  hotkeyNames?: string[];
  hotkeyNsfw?: boolean;
  /** Installed mods: file names inside the mod folder. */
  localFileNames?: string[];
  /** Pictures that were scored, cover first, same order as scores. */
  imageUrls: string[];
  scores: NsfwImageScores[];
}

export interface NsfwReviewResult {
  key: string;
  level: NsfwLevel;
  source: NsfwSource;
  cleanImages: string[];
}

export async function submitNsfwReview(req: NsfwReviewRequest): Promise<NsfwReviewResult> {
  const gb = req.gamebananaId ? await gameBananaEvidence(req.gamebananaId) : null;
  // "No NSFW", "non-nsfw", "NSFW-free" are statements that it's safe, not NSFW words.
  const denoise = (t: string) => t.replace(/\b(no|not|non|without|zero|free\s+of)[\s-]*(nsfw|nudity|nude|lewd)\b|\b(nsfw|nudity)[\s-]*free\b/gi, ' ');
  const ownText = denoise(`${req.title} ${req.description ?? ''}`);
  const pageText = `${ownText} ${denoise(gb?.text ?? '')}`;
  const fileNames = [...(gb?.fileNames ?? []), ...(req.localFileNames ?? [])];
  const ratings = [...(req.contentRating ? [req.contentRating] : []), ...(gb?.ratings ?? [])];

  const flagged =
    req.flagged || Boolean(gb?.hasRatings) || NSFW_WORDS_RE.test(pageText) || ratings.some((r) => STRONG_RATING_RE.test(r));
  const evidence = {
    flagged,
    images: req.scores,
    toggleHint: TOGGLE_TEXT_RE.test(pageText),
    fileTreeNsfw: fileNames.some((f) => NSFW_FILE_RE.test(f)),
    hotkeyNsfw: Boolean(req.hotkeyNsfw) || (req.hotkeyNames ?? []).some((h) => TOGGLE_KEY_RE.test(h)),
    nudeEditText: NUDE_EDIT_RE.test(ownText) && !TOGGLE_TEXT_RE.test(ownText),
    isSkin: !req.category || /skin|character|outfit/i.test(req.category),
  };
  const verdict = decideNsfwLevel(evidence);
  const cleanImages = req.imageUrls.filter((_, i) => verdict.cleanImages[i]).map(imageKey);

  store.set(req.key, { level: verdict.level, flagged: req.flagged, cleanImages, checkedAt: new Date().toISOString() });
  if (req.gamebananaId) reportSharedVerdict(req.gamebananaId, verdict.level);
  persist();
  devLog({
    key: req.key,
    title: req.title,
    level: verdict.level,
    reason: verdict.reason,
    evidence: { ...evidence, images: undefined },
    nsfwFiles: fileNames.filter((f) => NSFW_FILE_RE.test(f)).slice(0, 10),
    scores: req.scores.map((s, i) => ({ url: req.imageUrls[i], ...s })),
  });
  return { key: req.key, level: verdict.level, source: 'ai', cleanImages };
}
