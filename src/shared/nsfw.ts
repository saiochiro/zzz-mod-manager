/**
 * Content tiers, view rules and the scan's verdict logic. The scan runs ahead of time on GitHub
 * (scripts/nsfw-prescan.mjs); the app only downloads the verdicts and applies them in Browse.
 * Users can't change labels, and the Library is never filtered.
 *
 *  sfw    - checked and completely safe: no nudity, nothing skimpy or suggestive
 *  toggle - "Experimental": a clean SFW outfit that came with NSFW options; only its clean
 *           pictures are shown
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

/**
 * The views users can pick. "toggle" (SFW + Experimental) is on hold for now: saved settings
 * that still say "toggle" act as SFW only, and Experimental mods count as NSFW everywhere.
 */
export const NSFW_FILTERS: NsfwFilter[] = ['hide', 'blur', 'show'];
export function normalizeNsfwFilter(f: unknown): NsfwFilter {
  return f === 'blur' || f === 'show' ? f : 'hide';
}

/** Hidden from lists in this view. Mods not scanned yet never show in the SFW view. */
export function isHiddenByNsfwFilter(item: NsfwLabeled, filter: NsfwFilter): boolean {
  const f = normalizeNsfwFilter(filter);
  if (f === 'hide') return !item.nsfw_checked || nsfwLevelOf(item) !== 'sfw';
  return false;
}

/** Shown blurred until clicked. Only the NSFW view blurs; "Show all" never does. */
export function isBlurredByNsfwFilter(item: NsfwLabeled, filter: NsfwFilter): boolean {
  return normalizeNsfwFilter(filter) === 'blur' && (nsfwLevelOf(item) !== 'sfw' || !item.nsfw_checked);
}

/** Only these views may show a mod's unverified or NSFW screenshots. */
export function filterShowsAllPictures(filter: NsfwFilter): boolean {
  const f = normalizeNsfwFilter(filter);
  return f === 'blur' || f === 'show';
}

/** GameBanana API filter: only ask it to drop NSFW posts when the user wants SFW only. */
export function filterHidesAllNsfw(filter: NsfwFilter): boolean {
  return normalizeNsfwFilter(filter) === 'hide';
}

export const NSFW_LEVEL_LABEL: Record<NsfwLevel, string> = {
  sfw: 'SFW',
  toggle: '18+', // Experimental is on hold: shown as NSFW
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
  /** The title itself names NSFW content (skimpy, swimsuit, lewd, "-NSFW", bottom heavy...). */
  nsfwTitle?: boolean;
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
 *                cover and most pictures are clean. Only its clean pictures are shown.
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
  // A mod named after its NSFW content isn't an SFW redesign, whatever its toggles.
  if (e.nsfwTitle) return v('nsfw', `NSFW words in the title; ${ctx}`);
  if (rated.length === 0) return !e.flagged && !toggleEvidence ? v('sfw', `no pictures; ${ctx}`) : v('nsfw', `no pictures; ${ctx}`);
  if (rated[0] !== 'clean') return v('nsfw', `cover is ${rated[0]}; ${ctx}`);

  const allClean = cleanImages.every(Boolean);
  if (allClean && !e.flagged && !toggleEvidence) return v('sfw', ctx);

  const cleanShare = cleanImages.filter(Boolean).length / rated.length;
  if (e.isSkin !== false && toggleEvidence && cleanShare >= 0.6) return v('toggle', `clean SFW base with NSFW toggle; ${ctx}`);
  return v('nsfw', `${!toggleEvidence ? 'NSFW signals without a toggle' : e.isSkin === false ? 'not a skin' : 'mostly NSFW pictures'}; ${ctx}`);
}

/** What the pre-scan knows about a mod page before looking at pictures. */
export interface NsfwPageInput {
  title: string;
  /** The short description under the title. */
  description?: string;
  /** Full page text, and file names/descriptions. */
  pageText: string;
  fileNames: string[];
  /** GameBanana content-rating labels. */
  ratings: string[];
  /** GameBanana says the mod has content ratings. */
  hasRatings: boolean;
  /** Something else (feed visibility, keywords) already marked it NSFW. */
  flagged?: boolean;
  category?: string;
}

/** "No NSFW", "non-nsfw", "NSFW-free" are statements that it's safe, not NSFW words. */
export function denoiseNsfwText(t: string): string {
  return t.replace(/\b(no|not|non|without|zero|free\s+of)[\s-]*(nsfw|nudity|nude|lewd)\b|\b(nsfw|nudity)[\s-]*free\b/gi, ' ');
}

/** Everything but the picture scores, from a GameBanana page. */
export function buildNsfwEvidence(p: NsfwPageInput): Omit<NsfwEvidence, 'images'> {
  const own = denoiseNsfwText(`${p.title} ${p.description ?? ''}`);
  const text = `${own} ${denoiseNsfwText(p.pageText)}`;
  return {
    flagged:
      Boolean(p.flagged) || p.hasRatings || p.ratings.length > 0 || NSFW_WORDS_RE.test(text) || p.ratings.some((r) => STRONG_RATING_RE.test(r)),
    toggleHint: TOGGLE_TEXT_RE.test(text),
    fileTreeNsfw: p.fileNames.some((f) => NSFW_FILE_RE.test(f)),
    nudeEditText: NUDE_EDIT_RE.test(own) && !TOGGLE_TEXT_RE.test(own),
    nsfwTitle: titleNamesNsfw(p.title),
    isSkin: !p.category || /skin|character|outfit/i.test(p.category),
  };
}

/** False when the verdict is NSFW whatever the pictures look like, so they needn't be scored. */
export function needsImageScan(e: Omit<NsfwEvidence, 'images'>): boolean {
  if (e.nudeEditText || e.nsfwTitle) return false;
  const toggleEvidence = Boolean(e.toggleHint || e.fileTreeNsfw || e.hotkeyNsfw);
  return toggleEvidence ? e.isSkin !== false : !e.flagged;
}

/* ------------------------------------------------------------------ */
/* Pre-scanned verdicts (made on GitHub, downloaded by the app)        */
/* ------------------------------------------------------------------ */

export const NSFW_VERDICTS_URL = 'https://raw.githubusercontent.com/saiochiro/zzz-mod-manager/nsfw-verdicts/verdicts.json';

export type NsfwLevelCode = 's' | 't' | 'n';
export const LEVEL_CODE: Record<NsfwLevel, NsfwLevelCode> = { sfw: 's', toggle: 't', nsfw: 'n' };
export const CODE_LEVEL: Record<NsfwLevelCode, NsfwLevel> = { s: 'sfw', t: 'toggle', n: 'nsfw' };

/** One mod in verdicts.json. */
export interface NsfwVerdictEntry {
  /** level */
  l: NsfwLevelCode;
  /** 1 when GameBanana rated or keywords flagged it */
  f: 0 | 1;
  /** imageKey()s of clean pictures (SFW and Experimental only) */
  c?: string[];
  /** GameBanana's modified time when it was scanned */
  m?: number;
  /** SFW mods only: a GameBanana-style record with what Browse shows (title, author, pictures, counts) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  k?: Record<string, any>;
}

export interface NsfwVerdictFile {
  version: 1;
  generatedAt: string;
  mods: Record<string, NsfwVerdictEntry>;
}

export function parseVerdictFile(raw: unknown): NsfwVerdictFile | null {
  const r = raw as NsfwVerdictFile;
  if (!r || r.version !== 1 || !r.mods || typeof r.mods !== 'object') return null;
  return r;
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
  /\b(nsfw|18\+|r18|r-18|nude|nudity|naked|topless|bottomless|uncensored|explicit|adult|skimpy|lewd|hentai|ecchi|erotic|sex|sexual|sexy|strip|lingerie|bikini|microbikini|thong|bondage|bdsm|fetish|latex|boob|boobs|breasts|ass|butt|nipple|pussy|penis|futa|ahegao|bunny\s*suit|bunny\s*girl|slingshot|pasties|lewd|thicc|thick|curvy|busty|oppai|jiggle|bouncy|bottom\s*heavy|big\s*(ass|butt|boobs?|breasts?)|swimsuit|swimwear|hot\s*pants|micro|sheer|see[\s-]*through|underboob|sideboob|cleavage|leotard|bodysuit|garter)\b/i;

/** GameBanana content-rating labels that mean more than skimpy clothing. */
export const STRONG_RATING_RE = /nud(e|ity)|sexual|explicit|porn|genital|intercourse/i;

/**
 * NSFW words in a title, ignoring phrases that only say an NSFW toggle exists ("NSFW toggle",
 * "SFW/NSFW versions") and statements that it's safe ("no NSFW", "SFW").
 */
export function titleNamesNsfw(title: string): boolean {
  const t = title
    .replace(/\b(no|not|non|without)[\s-]*nsfw\b/gi, ' ')
    .replace(/\bnsfw[\s-]*(toggle|toggles|switch|option|options|key)s?\b/gi, ' ')
    .replace(/\b(sfw\s*(\/|&|and|\+)\s*nsfw|nsfw\s*(\/|&|and|\+)\s*sfw)\b/gi, ' ');
  return NSFW_WORDS_RE.test(t);
}

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

/* ------------------------------------------------------------------ */
/* GameBanana record labels (feed items and mod pages)                 */
/* ------------------------------------------------------------------ */

export const NSFW_KEYWORD_REGEX =
  /\b(nsfw|18\+|r18|r-18|nude|nudity|naked|topless|bottomless|uncensored|explicit|adult|skimpy|lewd|hentai|ecchi|erotic|sex|sexual|strip|lingerie|bikini|microbikini|thong|bondage|bdsm|fetish|boob|boobs|breasts|ass|butt|nipple|pussy|penis|futa|ahegao|bunny\s*suit|slingshot|pasties)\b/i;

/**
 * Layer 1 (GameBanana API Metadata + Keyword/Tag Blacklist):
 * Checks all GameBanana content rating fields:
 * - _bHasContentRatings (boolean returned on Subfeed & Mod/Index)
 * - _bIsNsfw / is_nsfw
 * - _sInitialVisibility ('hide', 'warn', 'nsfw', 'mature', '18+')
 * - _aContentRatings (st, sc, sa, lp, pn, nu, etc.)
 * - _sContentRating
 * - Category, RootCategory, SubCategory, Tags, and Title regex
 */
export function isModRecordNsfw(rec: any): boolean {
  if (!rec) return false;
  if (rec._bHasContentRatings === true) return true;
  if (rec._bIsNsfw === true || rec.is_nsfw === true) return true;

  const rating = String(rec._sContentRating || rec.content_rating || '').toLowerCase();
  if (
    rating.includes('mature') ||
    rating.includes('adult') ||
    rating.includes('nsfw') ||
    rating.includes('18+') ||
    rating.includes('explicit') ||
    rating.includes('sexual') ||
    rating.includes('nudity')
  ) {
    return true;
  }

  const vis = String(rec._sInitialVisibility || '').toLowerCase().trim();
  if (
    vis === 'hide' ||
    vis === 'warn' ||
    vis.includes('nsfw') ||
    vis.includes('mature') ||
    vis.includes('18+') ||
    vis.includes('adult')
  ) {
    return true;
  }

  if (rec._aContentRatings && typeof rec._aContentRatings === 'object') {
    for (const key of Object.keys(rec._aContentRatings)) {
      const val = String(rec._aContentRatings[key] || '').toLowerCase().trim();
      if (val && !['none', 'everyone', 'safe', 'false', '0'].includes(val)) {
        return true;
      }
    }
  }

  const combinedText = [
    rec._sName,
    rec.title,
    rec._aSubCategory?._sName,
    rec._aRootCategory?._sName,
    rec._aCategory?._sName,
    rec.category,
    Array.isArray(rec._aTags)
      ? rec._aTags.map((t: any) => (typeof t === 'string' ? t : t?._sTitle || t?._sName || '')).join(' ')
      : '',
    Array.isArray(rec.tags) ? rec.tags.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (NSFW_KEYWORD_REGEX.test(combinedText)) {
    return true;
  }

  return false;
}

