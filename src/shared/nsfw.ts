/**
 * NSFW levels, filter rules and the AI check's verdict logic.
 * Shared by the backend (stores verdicts) and the UI (filters, badges).
 *
 *  sfw    - safe to show anywhere
 *  toggle - safe by default, but the mod has NSFW options you switch on in game
 *  nsfw   - the mod itself shows nudity or skimpy clothing
 */

export type NsfwLevel = 'sfw' | 'toggle' | 'nsfw';

/** What the user wants to see. 'toggle' = SFW mods plus mods with NSFW toggles. */
export type NsfwFilter = 'hide' | 'toggle' | 'blur' | 'show';

/** Who decided the level. */
export type NsfwSource = 'gamebanana' | 'ai' | 'you';

export interface NsfwLabeled {
  is_nsfw?: boolean;
  nsfw_level?: NsfwLevel;
}

export function nsfwLevelOf(item: NsfwLabeled): NsfwLevel {
  return item.nsfw_level ?? (item.is_nsfw ? 'nsfw' : 'sfw');
}

/** Hidden from lists under this filter. */
export function isHiddenByNsfwFilter(item: NsfwLabeled, filter: NsfwFilter): boolean {
  const level = nsfwLevelOf(item);
  if (filter === 'hide') return level !== 'sfw';
  if (filter === 'toggle') return level === 'nsfw';
  return false;
}

/** Shown, but with the picture blurred until clicked. Toggle mods have a safe cover, so they never blur. */
export function isBlurredByNsfwFilter(item: NsfwLabeled, filter: NsfwFilter): boolean {
  return filter === 'blur' && nsfwLevelOf(item) === 'nsfw';
}

/** GameBanana API filter: only ask it to drop NSFW posts when the user wants SFW only. */
export function filterHidesAllNsfw(filter: NsfwFilter): boolean {
  return filter === 'hide';
}

export const NSFW_LEVEL_LABEL: Record<NsfwLevel, string> = {
  sfw: 'SFW',
  toggle: 'NSFW toggle',
  nsfw: '18+',
};

/* ------------------------------------------------------------------ */
/* AI image scores -> verdict                                          */
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

export type ImageRating = 'clean' | 'unsure' | 'explicit' | 'skimpy';

/** How one picture looks to the model. Tuned to only call a picture clean when it clearly is. */
export function rateImage(s: NsfwScores): ImageRating {
  const explicit = s.porn + s.hentai;
  if (explicit >= 0.6 || s.porn >= 0.45) return 'explicit';
  if (s.sexy >= 0.65) return 'skimpy';
  if (explicit < 0.2 && s.sexy < 0.35) return 'clean';
  return 'unsure';
}

export interface NsfwEvidence {
  /** Labeled NSFW before the AI looked (GameBanana ratings, keywords). */
  flagged: boolean;
  /** Scores per picture, cover first. */
  images: NsfwScores[];
  /** The mod page or its hotkeys mention an NSFW toggle / SFW version. */
  toggleHint: boolean;
  /** GameBanana content ratings list nudity or sexual content (not just skimpy clothing). */
  strongRating: boolean;
  /** A character skin. Only skins can be "NSFW toggle"; UI and other mods are SFW or 18+. Default true. */
  isSkin?: boolean;
  /** The title or page reads like a nude edit (nude, naked, topless...) and doesn't say it's optional. */
  nudeEditText?: boolean;
  /** How many pictures the mod page has. A real outfit mod usually shows it off from several angles. */
  pictureCount?: number;
}

export interface NsfwVerdict {
  level: NsfwLevel;
  reason: string;
}

const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;

/**
 * "NSFW toggle" is for real outfit mods that are only a little NSFW: safe by default with an
 * NSFW option, or a full new outfit that's a bit revealing. Nude edits and mods whose pictures
 * are mostly nudity stay 18+.
 */
export function decideNsfwLevel(e: NsfwEvidence): NsfwVerdict {
  if (e.images.length === 0) {
    return e.flagged
      ? { level: 'nsfw', reason: 'No pictures to check, so the label stays.' }
      : { level: 'sfw', reason: 'No pictures to check.' };
  }
  // The AI check only double-checks existing labels. It never adds one: image models like this
  // one sometimes mistake clothed anime-style characters for NSFW.
  if (!e.flagged) return { level: 'sfw', reason: 'Not labeled NSFW.' };

  const rated = e.images.map(rateImage);
  const [cover, ...rest] = rated;
  const total = rated.length;
  const explicit = rated.filter((r) => r === 'explicit').length;
  const allClean = rated.every((r) => r === 'clean');

  if (e.isSkin === false) {
    return allClean
      ? { level: 'sfw', reason: `The AI check found nothing NSFW in ${n(total, 'picture')}, so the label was removed.` }
      : { level: 'nsfw', reason: 'Only character skins can be NSFW toggle. This mod has NSFW pictures, so it stays 18+.' };
  }
  if (cover === 'explicit') return { level: 'nsfw', reason: 'The AI check found nudity in the cover picture.' };
  if (e.nudeEditText && !allClean) return { level: 'nsfw', reason: 'This looks like a nude edit rather than a new outfit, so it stays 18+.' };
  if (explicit / total > 0.34) return { level: 'nsfw', reason: `${n(explicit, 'picture')} out of ${total} show nudity, so it stays 18+.` };

  const effort = (e.pictureCount ?? total) >= 3 && !e.nudeEditText;
  const slight = explicit <= 1 && explicit / total <= 0.2;

  if (cover === 'skimpy' || cover === 'unsure') {
    if (effort && slight) {
      return {
        level: 'toggle',
        reason:
          cover === 'skimpy'
            ? 'A full outfit mod that is a bit revealing, so it shows with NSFW toggles.'
            : "A full outfit mod. The AI check wasn't sure about the cover, so it shows with NSFW toggles, not as SFW.",
      };
    }
    return {
      level: 'nsfw',
      reason: cover === 'skimpy' ? 'The cover is revealing and the mod doesn’t look like a full outfit, so it stays 18+.' : "The AI check couldn't tell if the cover is safe, so the label stays.",
    };
  }

  // Safe cover from here on.
  const hot = rest.filter((r) => r === 'explicit' || r === 'skimpy').length;
  const unsure = rest.filter((r) => r === 'unsure').length;
  if (hot > 0) return { level: 'toggle', reason: `The cover is safe, but ${n(hot, 'screenshot')} show NSFW options.` };
  if (unsure > 0) return { level: 'toggle', reason: `The cover is safe, but the AI check wasn't sure about ${n(unsure, 'screenshot')}.` };
  if (e.toggleHint) {
    return { level: 'toggle', reason: `All ${n(total, 'picture')} look safe, and the mod mentions an NSFW toggle or option.` };
  }
  if (e.strongRating) {
    return { level: 'toggle', reason: `All ${n(total, 'picture')} look safe, but GameBanana lists nudity, so it's likely a toggle.` };
  }
  return { level: 'sfw', reason: `The AI check found nothing NSFW in ${n(total, 'picture')}, so the label was removed.` };
}

/* ------------------------------------------------------------------ */
/* Text hints                                                          */
/* ------------------------------------------------------------------ */

/** Mod pages that say the NSFW part is optional. */
export const TOGGLE_TEXT_RE =
  /\b(nsfw|nude|nudity|naked|lewd|18\+|r18|topless|uncensored)\s*[-/ ]?\s*(toggle|toggles|toggleable|option|options|optional|version|variant|key|hotkey|switch)\b|\b(toggle|toggleable|optional|switchable|hotkey|key)\s*(for\s*|to\s*)?(the\s*)?(nsfw|nude|nudity|naked|lewd|topless|uncensored)\b|\bsfw\s*(by\s*default|default|version|variant|and\s*nsfw)\b|\b(includes?|with|has)\s*(an?\s*)?(sfw|nsfw)\s*(and\s*(an?\s*)?(sfw|nsfw)\s*)?(version|variant|option)s?\b/i;

/** Hotkey names inside a mod that switch on NSFW content. */
export const TOGGLE_KEY_RE = /nud(e|ity)|nsfw|naked|lewd|topless|bottomless|nipple|uncensor|strip|lingerie|underwear|xxx|18\+|r18/i;

/** Titles and pages of nude edits (only counts when the page doesn't say the NSFW part is optional). */
export const NUDE_EDIT_RE =
  /\b(nude|naked|nudity|topless|bottomless|nipples?|uncensored|futa(nari)?|hentai|porn|pussy|penis|xxx|lewd|stripped|no\s*clothes|without\s*clothes|bare\s*(body|skin))\b/i;

/** GameBanana content-rating labels that mean more than skimpy clothing. */
export const STRONG_RATING_RE = /nud(e|ity)|sexual|explicit|porn|genital|intercourse/i;

/** Where a mod's NSFW verdict is stored: by GameBanana id when it has one (shared by Browse and the Library). */
export function nsfwKeyOf(item: { gamebanana_id?: number | null; id?: number; mod_uuid?: string }): string | null {
  const gb = item.gamebanana_id ?? item.id;
  if (gb) return `gb:${gb}`;
  if (item.mod_uuid) return `local:${item.mod_uuid}`;
  return null;
}
