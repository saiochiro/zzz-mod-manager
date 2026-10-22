import fs from 'fs';
import path from 'path';
import {
  decideNsfwLevel,
  NUDE_EDIT_RE,
  nsfwKeyOf,
  STRONG_RATING_RE,
  TOGGLE_KEY_RE,
  TOGGLE_TEXT_RE,
  type NsfwLevel,
  type NsfwScores,
  type NsfwSource,
  type NsfwVerdict,
} from '../shared/nsfw';

/**
 * Stores what the on-device AI check (and the user) decided about each mod's NSFW label,
 * and applies it to GameBanana items and installed mods.
 *
 * Keys: "gb:<GameBanana id>" (shared by Browse and the Library) or "local:<mod uuid>".
 */

interface StoredVerdict {
  level: NsfwLevel;
  reason: string;
  source: Exclude<NsfwSource, 'gamebanana'>;
  /** Was the mod labeled NSFW when the AI looked? A new label later means a fresh look. */
  flagged: boolean;
  checkedAt: string;
}

/** Fields the review adds to anything with an NSFW label. */
export interface NsfwReviewFields {
  is_nsfw?: boolean;
  nsfw_level?: NsfwLevel;
  nsfw_reason?: string;
  nsfw_source?: NsfwSource;
  /** The AI check (or you) already looked at it. */
  nsfw_checked?: boolean;
  /** The label it had before the AI check (GameBanana ratings, keywords). */
  nsfw_flagged?: boolean;
}

// 2: stricter rules (nude edits stay 18+, only skins can be NSFW toggle). Older AI results are
// dropped so mods get checked again; your own calls are kept.
const VERSION = 2;
let filePath: string | null = null;
const store = new Map<string, StoredVerdict>();

export function initNsfwReview(appDataPath: string): void {
  try {
    const dir = path.join(appDataPath, 'cache');
    fs.mkdirSync(dir, { recursive: true });
    filePath = path.join(dir, 'nsfw_review.json');
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (raw?.items && typeof raw.items === 'object') {
        for (const [k, v] of Object.entries(raw.items)) {
          if (raw.version === VERSION || (v as StoredVerdict).source === 'you') store.set(k, v as StoredVerdict);
        }
      }
    }
  } catch (err) {
    console.warn('[NSFW review] Could not load saved results:', err);
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

export const nsfwKey = nsfwKeyOf;

/** Puts the stored verdict (if any) on an item. Safe to call more than once. */
export function applyNsfwReview<T extends NsfwReviewFields>(item: T, key: string | null): T & NsfwReviewFields {
  const flagged = item.nsfw_flagged ?? Boolean(item.is_nsfw);
  const st = key ? store.get(key) : undefined;
  const out: T & NsfwReviewFields = { ...item, nsfw_flagged: flagged };
  if (st && (st.source === 'you' || st.flagged === flagged || (st.flagged && !flagged))) {
    out.nsfw_level = st.level;
    out.is_nsfw = st.level !== 'sfw';
    out.nsfw_reason = st.reason;
    out.nsfw_source = st.source;
    out.nsfw_checked = true;
  } else {
    out.nsfw_level = flagged ? 'nsfw' : 'sfw';
    out.is_nsfw = flagged;
    out.nsfw_source = flagged ? 'gamebanana' : undefined;
    out.nsfw_checked = false;
  }
  return out;
}

export function getStoredNsfwVerdict(key: string): StoredVerdict | undefined {
  return store.get(key);
}

/** The user's own call. null clears it so the AI's (or GameBanana's) label applies again. */
export function setNsfwOverride(key: string, level: NsfwLevel | null, flagged: boolean): void {
  if (level === null) store.delete(key);
  else {
    store.set(key, {
      level,
      reason: level === 'sfw' ? 'You marked this as SFW.' : level === 'toggle' ? 'You marked this as having an NSFW toggle.' : 'You marked this as NSFW.',
      source: 'you',
      flagged,
      checkedAt: new Date().toISOString(),
    });
  }
  persist();
}

/* ------------------------------------------------------------------ */
/* Evidence from the mod page and its hotkeys                          */
/* ------------------------------------------------------------------ */

const profileCache = new Map<number, Promise<{ text: string; ratings: string[] } | null>>();

async function gameBananaProfile(id: number): Promise<{ text: string; ratings: string[] } | null> {
  if (!profileCache.has(id)) {
    profileCache.set(
      id,
      (async () => {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);
          const res = await fetch(`https://gamebanana.com/apiv11/Mod/${id}/ProfilePage`, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'ProxyLaunch' },
          });
          clearTimeout(timer);
          if (!res.ok) return null;
          const d: any = await res.json();
          const files = Array.isArray(d._aFiles) ? d._aFiles.map((f: any) => `${f._sFile || ''} ${f._sDescription || ''}`).join(' ') : '';
          const text = [d._sName, d._sDescription, String(d._sText || '').replace(/<[^>]+>/g, ' '), files].filter(Boolean).join(' ');
          const ratings = d._aContentRatings && typeof d._aContentRatings === 'object' ? Object.values(d._aContentRatings).map(String) : [];
          return { text, ratings };
        } catch {
          return null;
        }
      })()
    );
  }
  return profileCache.get(id)!;
}

export interface NsfwReviewRequest {
  key: string;
  gamebananaId?: number | null;
  flagged: boolean;
  title: string;
  description?: string;
  contentRating?: string;
  /** Names of the mod's hotkeys (installed mods only). */
  hotkeyNames?: string[];
  /** Skins, UI, Audio, Weapons... (GameBanana category or the app's category tag). */
  category?: string;
  /** How many pictures the mod page has. */
  pictureCount?: number;
  scores: NsfwScores[];
}

export interface NsfwReviewResult extends NsfwVerdict {
  key: string;
  source: NsfwSource;
}

export async function submitNsfwReview(req: NsfwReviewRequest): Promise<NsfwReviewResult> {
  const existing = store.get(req.key);
  if (existing?.source === 'you') return { key: req.key, level: existing.level, reason: existing.reason, source: 'you' };

  const ownText = `${req.title} ${req.description ?? ''}`;
  let text = ownText;
  const ratings: string[] = req.contentRating ? [req.contentRating] : [];
  // Only worth a page fetch when the label might come off.
  if (req.flagged && req.gamebananaId) {
    const profile = await gameBananaProfile(req.gamebananaId);
    if (profile) {
      text += ` ${profile.text}`;
      ratings.push(...profile.ratings);
    }
  }
  const verdict = decideNsfwLevel({
    flagged: req.flagged,
    images: req.scores,
    toggleHint: TOGGLE_TEXT_RE.test(text) || (req.hotkeyNames ?? []).some((h) => TOGGLE_KEY_RE.test(h)),
    strongRating: ratings.some((r) => STRONG_RATING_RE.test(r)),
    isSkin: !req.category || /skin|character|outfit/i.test(req.category),
    nudeEditText: NUDE_EDIT_RE.test(ownText) && !TOGGLE_TEXT_RE.test(ownText),
    pictureCount: req.pictureCount,
  });
  store.set(req.key, { ...verdict, source: 'ai', flagged: req.flagged, checkedAt: new Date().toISOString() });
  persist();
  return { key: req.key, ...verdict, source: 'ai' };
}

/** Forget every AI result (keeps the user's own calls), so mods get checked again. */
export function resetNsfwAiResults(): number {
  let n = 0;
  for (const [k, v] of store) {
    if (v.source === 'ai') {
      store.delete(k);
      n++;
    }
  }
  persist();
  return n;
}
