/**
 * Content tiers, view rules and the scan's verdict logic. Shared by the backend (scans, stores
 * verdicts, sanitizes files) and the UI (which only reads the result; users can't change labels).
 *
 *  sfw    - checked and completely safe: no nudity, nothing skimpy or suggestive
 *  toggle - "Experimental": a clean SFW outfit that came with NSFW options; ProxyLaunch removes
 *           the NSFW pictures from view and disables the NSFW options in the installed files
 *  nsfw   - everything else that is NSFW, skimpy, lewd, or could not be verified safe
 */

export type NsfwLevel = 'sfw' | 'toggle' | 'nsfw';

/**
 * hide   = SFW only (checked-safe mods only)
 * toggle = SFW + Experimental toggle mods
 * blur   = every mod, NSFW (and not-yet-checked) pictures blurred
 * show   = every mod, no filter, no blur
 */
export type NsfwFilter = 'hide' | 'toggle' | 'blur' | 'show';

/** Who decided the level: GameBanana's rating / keywords (before a scan), or the scan. */
export type NsfwSource = 'gamebanana' | 'ai';

export interface NsfwLabeled {
  is_nsfw?: boolean;
  nsfw_level?: NsfwLevel;
  /** The scan has finished for this mod. */
  nsfw_checked?: boolean;
}

export function nsfwLevelOf(item: NsfwLabeled): NsfwLevel {
  return item.nsfw_level ?? (item.is_nsfw ? 'nsfw' : 'sfw');
}

/** Hidden from lists in this view. Mods not scanned yet never show in the SFW views. */
export function isHiddenByNsfwFilter(item: NsfwLabeled, filter: NsfwFilter): boolean {
  const level = nsfwLevelOf(item);
  if (filter === 'hide') return !item.nsfw_checked || level !== 'sfw';
  if (filter === 'toggle') return !item.nsfw_checked || level === 'nsfw';
  return false;
}

/** Shown blurred until clicked. Only the NSFW view blurs; "Show all" never does. */
export function isBlurredByNsfwFilter(item: NsfwLabeled, filter: NsfwFilter): boolean {
  return filter === 'blur' && (nsfwLevelOf(item) === 'nsfw' || !item.nsfw_checked);
}

/** Only these views may show a mod's unverified or NSFW screenshots. */
export function filterShowsAllPictures(filter: NsfwFilter): boolean {
  return filter === 'blur' || filter === 'show';
}

/** GameBanana API filter: only ask it to drop NSFW posts when the user wants SFW only. */
export function filterHidesAllNsfw(filter: NsfwFilter): boolean {
  return filter === 'hide';
}

export const NSFW_LEVEL_LABEL: Record<NsfwLevel, string> = {
  sfw: 'SFW',
  toggle: 'Experimental',
  nsfw: '18+',
};

/* ------------------------------------------------------------------ */
/* Image scores                                                        */
/* ------------------------------------------------------------------ */

/** Output of the image model, in its class order. Each value 0..1, summing to ~1. */
export interface NsfwScores {
  drawing: number;
  hentai: number;
  neutral: number;
  porn: number;
  sexy: number;
}

export const NSFW_MODEL_CLASSES: Array<keyof NsfwScores> = ['drawing', 'hentai', 'neutral', 'porn', 'sexy'];

/** One picture, scored by both bundled models. */
export interface NsfwImageScores {
  /** InceptionV3 (299 px): the main model, clearly better on ZZZ's 3D renders. */
  inc: NsfwScores;
  /** MobileNetV2 (224 px): second opinion. */
  mob: NsfwScores;
}

export type ImageRating = 'clean' | 'unsure' | 'skimpy' | 'explicit';

/**
 * Thresholds tuned on real ZZZ skin mods from GameBanana (scripts/nsfw-calibrate*.mjs, run in CI).
 * Both models mostly call these renders "drawing", so the nudity classes (porn + hentai) are
 * the useful signal and stay low on safe mods. A picture is clean only if BOTH models say so.
 */
export const NSFW_THRESHOLDS = {
  /** InceptionV3 porn + hentai at or above this = explicit (nudity-rated mods: median picture 0.44) */
  incExplicit: 0.6,
  /** MobileNet porn + hentai at or above this = explicit */
  mobExplicit: 0.4,
  /** either model's "sexy" at or above this = skimpy (hot pants / swimsuit shots score 0.9+) */
  skimpy: 0.5,
  /** clean only when InceptionV3 porn + hentai is below this (plain outfits stay under ~0.12;
   *  revealing ones like "high waisted" / "2B" / "thicc" score 0.5-0.9) ... */
  incCleanMax: 0.2,
  /** ... and MobileNet porn + hentai is below this ... */
  mobCleanMax: 0.1,
  /** ... and both models' "sexy" is below this */
  sexyCleanMax: 0.15,
};

export function rateImage(s: NsfwImageScores, t = NSFW_THRESHOLDS): ImageRating {
  const inc = s.inc.porn + s.inc.hentai;
  const mob = s.mob.porn + s.mob.hentai;
  const sexy = Math.max(s.inc.sexy, s.mob.sexy);
  if (inc >= t.incExplicit || mob >= t.mobExplicit) return 'explicit';
  if (sexy >= t.skimpy) return 'skimpy';
  if (inc < t.incCleanMax && mob < t.mobCleanMax && sexy < t.sexyCleanMax) return 'clean';
  return 'unsure';
}

/* ------------------------------------------------------------------ */
/* Verdict                                                             */
/* ------------------------------------------------------------------ */

export interface NsfwEvidence {
  /** GameBanana gave it ANY content rating (skimpy attire, nudity, lewd poses...) or NSFW words. */
  flagged: boolean;
  /** Scores per picture, cover first. */
  images: NsfwImageScores[];
  /** The mod page says the NSFW part is optional (toggle, SFW version...). */
  toggleHint: boolean;
  /** The archive's file and folder names contain NSFW words (nude, topless, ...). */
  fileTreeNsfw?: boolean;
  /** The installed mod has hotkeys whose names or switched files are NSFW (KeyNude, ...). */
  hotkeyNsfw?: boolean;
  /** The title or description reads like a nude edit. */
  nudeEditText?: boolean;
  /** A character skin. Only skins can be Experimental; other mods are SFW or NSFW. Default true. */
  isSkin?: boolean;
}

export interface NsfwVerdict {
  level: NsfwLevel;
  /** Developer diagnostics only (log file); never shown to users. */
  reason: string;
  /** Per picture (same order as the input): true when it was rated clean. */
  cleanImages: boolean[];
}

/**
 * Zero tolerance.
 *  SFW:          no GameBanana rating, no NSFW words or files, and every picture clean.
 *  Experimental: a skin with real evidence of an NSFW toggle (page, hotkeys or file names), whose
 *                cover and most pictures are clean. Its NSFW pictures and options get removed.
 *  NSFW:         everything else.
 */
export function decideNsfwLevel(e: NsfwEvidence): NsfwVerdict {
  const rated = e.images.map((s) => rateImage(s));
  const cleanImages = rated.map((r) => r === 'clean');
  const v = (level: NsfwLevel, reason: string): NsfwVerdict => ({ level, reason, cleanImages });

  const toggleEvidence = [e.toggleHint && 'page mentions NSFW toggle/version', e.fileTreeNsfw && 'NSFW file names', e.hotkeyNsfw && 'NSFW hotkeys']
    .filter(Boolean)
    .join(', ');
  const counts = (['clean', 'unsure', 'skimpy', 'explicit'] as ImageRating[]).map((r) => `${r}=${rated.filter((x) => x === r).length}`).join(' ');
  const ctx = `${e.flagged ? 'rated/flagged' : 'unrated'}; pictures ${counts}${toggleEvidence ? `; ${toggleEvidence}` : ''}`;

  if (e.nudeEditText) return v('nsfw', `nude-edit wording; ${ctx}`);
  if (rated.length === 0) return !e.flagged && !toggleEvidence ? v('sfw', `no pictures; ${ctx}`) : v('nsfw', `no pictures; ${ctx}`);
  if (rated[0] !== 'clean') return v('nsfw', `cover is ${rated[0]}; ${ctx}`);

  const allClean = cleanImages.every(Boolean);
  if (allClean && !e.flagged && !toggleEvidence) return v('sfw', ctx);

  const cleanShare = cleanImages.filter(Boolean).length / rated.length;
  if (e.isSkin !== false && toggleEvidence && cleanShare >= 0.5) return v('toggle', `clean SFW base with NSFW toggle; ${ctx}`);
  return v('nsfw', `${!toggleEvidence ? 'NSFW signals without a toggle' : e.isSkin === false ? 'not a skin' : 'mostly NSFW pictures'}; ${ctx}`);
}

/* ------------------------------------------------------------------ */
/* Text and file hints                                                 */
/* ------------------------------------------------------------------ */

/** Mod pages that say the NSFW part is optional. */
export const TOGGLE_TEXT_RE =
  /\b(nsfw|nude|nudity|naked|lewd|18\+|r18|topless|uncensored)\s*[-/ ]?\s*(toggle|toggles|toggleable|option|options|optional|version|variant|key|hotkey|switch)\b|\b(toggle|toggleable|optional|switchable|hotkey|key)\s*(for\s*|to\s*)?(the\s*)?(nsfw|nude|nudity|naked|lewd|topless|uncensored)\b|\bsfw\s*(by\s*default|default|version|variant|and\s*nsfw)\b|\b(includes?|with|has)\s*(an?\s*)?(sfw|nsfw)\s*(and\s*(an?\s*)?(sfw|nsfw)\s*)?(version|variant|option)s?\b/i;

/** Hotkey names inside a mod that switch on NSFW content. */
export const TOGGLE_KEY_RE = /nud(e|ity)|nsfw|naked|lewd|topless|bottomless|nipple|uncensor|strip|lingerie|underwear|xxx|18\+|r18|nake|hentai|sexy|bikini/i;

/**
 * NSFW words in archive file and folder names. Deliberately not "body" or "toggle" on their own:
 * every skin has Body files and most have toggles, so those would flag every mod.
 */
export const NSFW_FILE_RE =
  /(^|[^a-z])(nude|nudes|naked|nsfw|topless|bottomless|nipples?|uncensor(ed)?|lewd|hentai|xxx|r-?18|18\+|strip(ped)?|futa|pussy|penis|genital|lingerie|micro_?bikini|no_?clothes?|noclothes?|nakey|nake)([^a-z]|$)/i;

/** Titles and pages of nude edits (only counts when the page doesn't say the NSFW part is optional). */
export const NUDE_EDIT_RE =
  /\b(nude|naked|nudity|topless|bottomless|nipples?|uncensored|futa(nari)?|hentai|porn|pussy|penis|xxx|lewd|stripped|no\s*clothes|without\s*clothes|bare\s*(body|skin))\b/i;

/** NSFW words in a mod's title, tags or page (same list GameBanana items are labeled with). */
export const NSFW_WORDS_RE =
  /\b(nsfw|18\+|r18|r-18|nude|nudity|naked|topless|bottomless|uncensored|explicit|adult|skimpy|lewd|hentai|ecchi|erotic|sex|sexual|sexy|strip|lingerie|bikini|microbikini|thong|bondage|bdsm|fetish|latex|boob|boobs|breasts|ass|butt|nipple|pussy|penis|futa|ahegao|bunny\s*suit|bunny\s*girl|slingshot|pasties|lewd|thicc|busty|oppai|swimsuit|swimwear|hot\s*pants|micro|sheer|see[\s-]*through|underboob|sideboob|cleavage|leotard|bodysuit|garter)\b/i;

/** GameBanana content-rating labels that mean more than skimpy clothing. */
export const STRONG_RATING_RE = /nud(e|ity)|sexual|explicit|porn|genital|intercourse/i;

/** Where a mod's verdict is stored: by GameBanana id when it has one (shared by Browse and the Library). */
export function nsfwKeyOf(item: { gamebanana_id?: number | null; id?: number; mod_uuid?: string }): string | null {
  const gb = item.gamebanana_id ?? item.id;
  if (gb) return `gb:${gb}`;
  if (item.mod_uuid) return `local:${item.mod_uuid}`;
  return null;
}

/** Same picture, different size variants (GameBanana adds "530-90_" style prefixes). */
export function imageKey(url?: string): string {
  return (url || '').split('?')[0].split('/').pop()!.replace(/^\d+-\d+_/, '').toLowerCase();
}
