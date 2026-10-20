import type { ThemeDefinition } from './types';
import { G, HERO_GLYPH } from './glyphs';
import { svgToDataUrl } from './appIcon';
import { getTheme } from './registry';

/**
 * Themed mouse cursors (inside the app only — the Windows cursor is untouched).
 * Sticker-style: chunky white outline, hard drop shadow, theme gradient fill.
 *   arrow   — normal pointer
 *   hand    — over anything clickable: adds a round sticker with the theme's glyph
 * Shapes: classic arrow, slim "blade", or a targeting reticle for clickables.
 */

export type CursorPref = 'theme' | 'system' | string; // theme id = always use that theme's cursor
export type CursorShape = 'signature' | 'arrow' | 'blade' | 'reticle';
export type CursorShapePref = 'auto' | CursorShape;
export type CursorSize = 'normal' | 'large';

export interface CursorSettings {
  pref: CursorPref;
  shape: CursorShapePref;
  size: CursorSize;
}

const KEY = 'zzz_cursor_v2';
const LEGACY_KEY = 'zzz_cursor';

const PATHS: Record<'arrow' | 'blade', string> = {
  arrow: 'M5 3.5 L5 24.5 L10.6 19.4 L14.4 27.6 L18.3 25.8 L14.6 17.7 L22 17.7 Z',
  blade: 'M5 2.5 L5 26.5 L9.4 22.3 L12.9 29.6 L15.4 28.5 L12 21.2 L17.8 20.8 Z',
};

function glyphPath(theme: ThemeDefinition, cx: number, cy: number, scale: number, color: string, weight = 1.9): string {
  const g = G[HERO_GLYPH[theme.motif] ?? 'sparkle'];
  return `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-12 -12)">
    <path d="${g.d}" fill="${g.mode === 'fill' ? color : 'none'}" stroke="${g.mode === 'stroke' ? color : 'none'}" stroke-width="${(g.w ?? 1.6) * weight}" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function stickerBadge(theme: ThemeDefinition, cx: number, cy: number, r: number): string {
  const [from, to] = theme.gradients.accent;
  return `<circle cx="${cx + 0.9}" cy="${cy + 1.2}" r="${r + 1.4}" fill="#000" fill-opacity="0.45"/>
  <circle cx="${cx}" cy="${cy}" r="${r + 1.4}" fill="#fff"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#bg)"/>
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${to}"/><stop offset="1" stop-color="${from}"/></linearGradient></defs>
  ${glyphPath(theme, cx, cy, (r * 1.45) / 24 * 1.0, '#ffffff', 2.2)}`;
}

/* ------------------------------------------------------------------ */
/* Signature cursors: one silhouette per agent theme                   */
/* ------------------------------------------------------------------ */
// Every design points with its top-left tip at (3, 3) on a 32×32 grid.
type Part =
  | { d: string; fill: string } // filled shape (gets the white sticker outline)
  | { d: string; line: number; color: string }; // stroked shape (handles, poles…)

interface Signature {
  parts: Part[];
  /** Extra detail drawn on top, no outline (shine, facets, glyph accents). */
  detail?: string;
  /** Click point if it isn't the usual (3, 3) tip. */
  hot?: [number, number];
}

const INK = '#15161d';
const GOLD = '#e9c46a';

function signature(theme: ThemeDefinition): Signature {
  const c = theme.colors;
  const acc = c.accent;
  switch (theme.id) {
    case 'frostblade': // katana: icy blade, gold guard, wrapped hilt
      return {
        parts: [
          { d: 'M27.6 27.6 L21.6 21.6', line: 3.6, color: INK },
          { d: 'M3 3 Q12 9.6 20.2 17.2 L17.2 20.2 Q9.6 12 3 3 Z', fill: 'url(#fill)' },
          { d: 'M16.2 21.6 L21.6 16.2 L23.4 18 L18 23.4 Z', fill: GOLD },
        ],
        detail: `<path d="M5.2 5.6 Q11.6 10.6 17.6 16.8" stroke="#fff" stroke-opacity=".85" stroke-width=".9" fill="none" stroke-linecap="round"/>
          <path d="M23 23 l1.6 1.6 M25 25 l1.4 1.4" stroke="${acc}" stroke-width="1.6" stroke-linecap="round"/>`,
      };
    case 'sakura-storm': // curved polearm blade with a petal at the collar
      return {
        parts: [
          { d: 'M28.5 28.5 L16.5 16.5', line: 2.6, color: INK },
          { d: 'M3 3 C9.5 3.2 15 7.5 16.8 14.4 L14.4 16.8 C12.4 11 8.6 6.6 3 3 Z', fill: 'url(#fill)' },
          { d: 'M18 19.5 C15.4 18.4 15.6 15.4 18 14.2 C19.2 16.6 20.4 17.6 18 19.5 Z', fill: acc },
        ],
        detail: `<path d="M5.4 4.6 C10 5.6 13.6 8.8 15 12.8" stroke="#fff" stroke-opacity=".8" stroke-width=".9" fill="none" stroke-linecap="round"/>`,
      };
    case 'ink-seal': // calligraphy brush with a red seal on the handle
      return {
        parts: [
          { d: 'M27.4 27.4 L13.2 13.2', line: 3.4, color: '#7a4b2a' },
          { d: 'M3 3 C8.4 4 13 7.8 13.8 11.6 L11.6 13.8 C7.8 13 4 8.4 3 3 Z', fill: INK },
          { d: 'M11.2 13.4 L13.4 11.2 L15.6 13.4 L13.4 15.6 Z', fill: GOLD },
        ],
        detail: `<rect x="20.6" y="20.6" width="3.4" height="3.4" rx=".6" transform="rotate(45 22.3 22.3)" fill="#d64545"/>
          <path d="M5.2 5.4 C7.6 7.8 9.4 9.6 11 11" stroke="${acc}" stroke-opacity=".7" stroke-width=".8" stroke-linecap="round" fill="none"/>`,
      };
    case 'riptide': // shark fin cutting through a wave
      return {
        parts: [
          { d: 'M3 3 C9.6 8 15.6 15.4 18.4 22.6 L6.4 22.6 C7.4 16.4 6.4 9.4 3 3 Z', fill: 'url(#fill)' },
          { d: 'M3.6 24.2 Q7 21.6 10.4 24.2 T17.2 24.2 T24 24.2 L24 27.6 Q20.6 25.4 17.2 27.6 T10.4 27.6 T3.6 27.6 Z', fill: '#ffffff' },
        ],
        detail: `<path d="M5.4 6.4 C8 10 9.4 14.4 9.2 19.6" stroke="#fff" stroke-opacity=".7" stroke-width="1" fill="none" stroke-linecap="round"/>
          <path d="M4 25.4 Q7 23.4 10.4 25.4 T17.2 25.4 T23.6 25.4" stroke="${acc}" stroke-width="1.2" fill="none"/>`,
      };
    case 'ember-rush': // arrowhead trailing a flame
      return {
        parts: [
          { d: 'M4.4 17.6 C7.6 21.4 10.4 25.6 15.4 28.8 C13.8 26.2 15 24.6 14.8 22.8 C17.4 25.6 21.4 26.6 25.6 28.4 C22.4 24.8 22.6 21.6 20.4 19.6 C22.4 19.4 23.6 18.6 26 19 C22.4 15.8 18.2 14.6 14.6 14.2 Z', fill: 'url(#flame)' },
          { d: 'M3 3 L3 18.6 L7.8 14.6 L15.6 13.8 Z', fill: 'url(#fill)' },
        ],
        detail: `<defs><linearGradient id="flame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset=".55" stop-color="#ff7a1a"/><stop offset="1" stop-color="#e5261a"/></linearGradient></defs>
          <path d="M9.4 19.6 C12 22.4 14.6 24.2 17.6 25.4 M14.6 17.4 C17.4 19.4 19.6 21.6 21.8 24.8" stroke="#fff3b0" stroke-width="1" fill="none" stroke-linecap="round"/>
          <path d="M5 7 L5 14.4" stroke="#fff" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round"/>`,
      };
    case 'velvet-heist': // faceted gem arrow
      return {
        parts: [{ d: 'M3 3 L3 23.4 L8.6 18.6 L12.4 26.8 L16.2 25 L12.6 17.2 L20 17.2 Z', fill: 'url(#fill)' }],
        detail: `<path d="M3 3 L8.6 18.6 M3 3 L12.6 17.2 M3 3 L6.6 12.4 L12.6 17.2 M6.6 12.4 L8.6 18.6" stroke="#fff" stroke-opacity=".55" stroke-width=".7" fill="none"/>
          <path d="M23.4 21 l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#fff"/>`,
      };
    case 'starlight-encore': // shooting star: slim arrow with a star tail
      return {
        parts: [
          { d: 'M3 3 L3 17.6 L7 14.2 L14.4 13.6 Z', fill: 'url(#fill)' },
          { d: 'M20.6 13.4 L22.2 18 L27 18.2 L23.2 21.2 L24.6 25.8 L20.6 23.1 L16.6 25.8 L18 21.2 L14.2 18.2 L19 18 Z', fill: GOLD },
        ],
        detail: `<path d="M7.6 14.6 L15.2 20.4 M10 12.6 L16.6 17" stroke="#fff" stroke-opacity=".75" stroke-width="1" stroke-linecap="round"/>
          <circle cx="26.6" cy="11.6" r="1" fill="#fff"/><circle cx="12" cy="24.6" r=".8" fill="#fff"/>`,
      };
    case 'night-patrol': // tactical arrow with patrol chevrons
      return {
        parts: [{ d: 'M3 3 L3 23.4 L8.6 18.6 L12.4 26.8 L16.2 25 L12.6 17.2 L20 17.2 Z', fill: 'url(#fill)' }],
        detail: `<path d="M3.6 9.6 L7.2 12.6 M3.6 13.4 L7.2 16.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
          <circle cx="12.6" cy="14.2" r="1.3" fill="#7fd4ff"/>`,
      };
    case 'rose-requiem': // quill feather with a dark nib
      return {
        parts: [
          { d: 'M3 3 C11.8 4.2 19.8 10.4 22.6 19.6 C18.8 18.6 17.6 20.6 15.6 18.8 C14 21 11.4 20 10.2 17.4 C7.6 17.2 5.4 14.6 6.2 12.2 C3.4 10.6 3 6.4 3 3 Z', fill: 'url(#fill)' },
          { d: 'M27.8 27.8 L20.6 20.6', line: 1.8, color: INK },
        ],
        detail: `<path d="M3 3 C9.4 8 15.4 13.6 21.4 20.4" stroke="#fff" stroke-opacity=".85" stroke-width="1" fill="none" stroke-linecap="round"/>
          <path d="M3 3 L5.6 4.6 L4.6 5.6 Z" fill="${INK}"/>`,
      };
    case 'jade-garden': // leaf with a midrib and stem
      return {
        parts: [
          { d: 'M28 28 L20.4 20.4', line: 1.8, color: '#3c7a3a' },
          { d: 'M3 3 C13.6 3.6 21.6 10.8 21.2 21.2 C10.8 21.6 3.6 13.6 3 3 Z', fill: 'url(#fill)' },
        ],
        detail: `<path d="M3 3 L20.6 20.6 M9 9 L9.6 14 M12.4 12.4 L13 17.6 M9 9 L14 9.6 M12.4 12.4 L17.6 13" stroke="#fff" stroke-opacity=".7" stroke-width=".8" fill="none" stroke-linecap="round"/>`,
      };
    case 'silver-fang': // polished silver fang with a red-tie glint
      return {
        parts: [{ d: 'M3 3 C9.4 6.2 14.6 11.6 17 19 C17.8 21.6 16.2 23.4 13.8 22.6 C10 21.4 6 13.4 3 3 Z', fill: 'url(#fill)' }],
        detail: `<path d="M5.4 6.4 C8.6 10.8 11.4 15 13.2 19.4" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round"/>
          <path d="M20.8 22.6 l1.6 1.6 -1.6 1.6 -1.6 -1.6z" fill="${acc}"/>`,
      };
    case 'gale-fletcher': // arrow with a gold head and teal fletching
      return {
        parts: [
          { d: 'M8 8 L26.4 26.4', line: 1.8, color: '#eadfc4' },
          { d: 'M3 3 L11.6 5.4 L5.4 11.6 Z', fill: acc },
          { d: 'M21 23.6 L19.4 28.4 L23.4 25.6 Z M23.6 21 L28.4 19.4 L25.6 23.4 Z', fill: 'url(#fill)' },
        ],
        detail: `<path d="M4.6 4.6 L8.6 6.2" stroke="#fff" stroke-opacity=".8" stroke-width=".8" stroke-linecap="round"/>`,
      };
    case 'hard-hat': // demolition hammer
      return {
        parts: [
          { d: 'M9.6 9.6 L27 27', line: 3, color: '#5b3a1e' },
          { d: 'M1.4 8.6 L8.6 1.4 L13 5.8 L5.8 13 Z', fill: 'url(#fill)' },
        ],
        detail: `<path d="M19.6 19.6 l1.2 1.2 M22 22 l1.2 1.2 M24.4 24.4 l1.2 1.2" stroke="${c.primary}" stroke-width="2.6"/>
          <path d="M3.4 8.4 L8.4 3.4" stroke="#fff" stroke-opacity=".8" stroke-width="1.1" stroke-linecap="round"/>`,
        hot: [5, 5],
      };
    case 'outlaw-dust': // kite shield with a brass boss
      return {
        parts: [{ d: 'M3 3 L16 6.4 Q21 13.4 20.4 20.4 Q13.4 21 6.4 16 Z', fill: 'url(#fill)' }],
        detail: `<path d="M5.4 5.4 L14.6 7.8 Q18.4 13.4 18.2 18.2 Q13.4 18.4 7.8 14.6 Z" stroke="#f3d9a8" stroke-opacity=".75" stroke-width=".9" fill="none"/>
          <circle cx="12.6" cy="12.6" r="2.2" fill="#e8b04a" stroke="#5b3a1e" stroke-width=".6"/>`,
      };
    default: // graphite / anything new: sleek proxy arrow with a data line
      return {
        parts: [{ d: 'M3 3 L3 23.4 L8.6 18.6 L12.4 26.8 L16.2 25 L12.6 17.2 L20 17.2 Z', fill: 'url(#fill)' }],
        detail: `<path d="M5.2 8 L5.2 17.6" stroke="#fff" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M8.4 13.2 L11.6 15.6" stroke="${acc}" stroke-width="1.2" stroke-linecap="round"/>`,
      };
  }
}

function renderParts(parts: Part[]): string {
  const shadow = parts
    .map((p) =>
      'fill' in p
        ? `<path d="${p.d}" fill="#000"/>`
        : `<path d="${p.d}" stroke="#000" stroke-width="${p.line}" stroke-linecap="round" fill="none"/>`
    )
    .join('');
  const outline = parts
    .map((p) =>
      'fill' in p
        ? `<path d="${p.d}" fill="#fff" stroke="#fff" stroke-width="3.4" stroke-linejoin="round"/>`
        : `<path d="${p.d}" stroke="#fff" stroke-width="${p.line + 3.4}" stroke-linecap="round" fill="none"/>`
    )
    .join('');
  const color = parts
    .map((p) =>
      'fill' in p
        ? `<path d="${p.d}" fill="${p.fill}" stroke="#0b0d12" stroke-width=".9" stroke-linejoin="round"/>`
        : `<path d="${p.d}" stroke="${p.color}" stroke-width="${p.line}" stroke-linecap="round" fill="none"/>`
    )
    .join('');
  return `<g transform="translate(1.3 1.7)" opacity=".45">${shadow}</g>${outline}${color}`;
}

function signatureSvg(theme: ThemeDefinition, withBadge: boolean): string {
  const [from, to] = theme.gradients.accent;
  const sig = signature(theme);
  return `<defs><linearGradient id="fill" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  ${renderParts(sig.parts)}
  ${sig.detail ?? ''}
  ${withBadge ? stickerBadge(theme, 24, 8, 5.4) : ''}`;
}

/** Classic shapes (when the user picks Arrow / Blade instead of the signature). */
function arrowSvg(theme: ThemeDefinition, shape: 'arrow' | 'blade', withBadge: boolean): string {
  const [from, to] = theme.gradients.accent;
  const d = PATHS[shape];
  const shine =
    shape === 'blade'
      ? `<path d="M6.4 6 L6.4 21.5" stroke="#fff" stroke-opacity="0.75" stroke-width="1.1" stroke-linecap="round"/>`
      : `<path d="M6.5 7.5 L6.5 17" stroke="#fff" stroke-opacity="0.6" stroke-width="1.2" stroke-linecap="round"/>`;
  return `<defs><linearGradient id="fill" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <path d="${d}" transform="translate(1.4 1.8)" fill="#000" fill-opacity="0.5"/>
  <path d="${d}" fill="#fff" stroke="#fff" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="${d}" fill="url(#fill)" stroke="#0b0d12" stroke-width="1" stroke-linejoin="round"/>
  ${shine}
  ${withBadge ? stickerBadge(theme, 23, 8.5, 5.6) : glyphPath(theme, 24, 7.5, 0.3, theme.colors.accent)}`;
}

function reticleSvg(theme: ThemeDefinition): string {
  const c = theme.colors.primary;
  return `<circle cx="16.8" cy="17.2" r="8.5" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="3.5"/>
  <circle cx="16" cy="16" r="8.5" fill="none" stroke="#fff" stroke-width="4"/>
  <circle cx="16" cy="16" r="8.5" fill="none" stroke="${c}" stroke-width="2"/>
  <path d="M16 2.5v6M16 23.5v6M2.5 16h6M23.5 16h6" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <path d="M16 2.5v6M16 23.5v6M2.5 16h6M23.5 16h6" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
  <circle cx="16" cy="16" r="2.2" fill="#fff"/><circle cx="16" cy="16" r="1.3" fill="${c}"/>`;
}

/** 'auto' = the theme's signature cursor (reticle on clickables for themes that ask for it). */
export function resolveShape(_theme: ThemeDefinition, shapePref: CursorShapePref = 'auto'): CursorShape {
  return shapePref === 'auto' ? 'signature' : shapePref;
}

export function buildCursorSvg(
  theme: ThemeDefinition,
  kind: 'arrow' | 'hand',
  opts: { shape?: CursorShapePref; size?: CursorSize } = {}
): string {
  const shape = resolveShape(theme, opts.shape);
  const px = opts.size === 'large' ? 48 : 32;
  const reticleHand = kind === 'hand' && (shape === 'reticle' || (shape === 'signature' && theme.cursorShape === 'reticle'));
  const inner = reticleHand
    ? reticleSvg(theme)
    : shape === 'signature'
    ? signatureSvg(theme, kind === 'hand')
    : arrowSvg(theme, shape === 'blade' ? 'blade' : 'arrow', kind === 'hand');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">${inner}</svg>`;
}

export function cursorCss(theme: ThemeDefinition, kind: 'arrow' | 'hand', opts: { shape?: CursorShapePref; size?: CursorSize } = {}): string {
  const shape = resolveShape(theme, opts.shape);
  const k = opts.size === 'large' ? 1.5 : 1;
  const reticleHand = kind === 'hand' && (shape === 'reticle' || (shape === 'signature' && theme.cursorShape === 'reticle'));
  const [hx, hy] = reticleHand ? [16, 16] : shape === 'signature' ? signature(theme).hot ?? [3, 3] : [5, 3];
  return `url("${svgToDataUrl(buildCursorSvg(theme, kind, opts))}") ${Math.round(hx * k)} ${Math.round(hy * k)}, ${kind === 'arrow' ? 'default' : 'pointer'}`;
}

export function readCursorSettings(): CursorSettings {
  const fallback: CursorSettings = { pref: 'theme', shape: 'auto', size: 'normal' };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return { ...fallback, pref: legacy };
  } catch {
    // ignore
  }
  return fallback;
}

export function storeCursorSettings(s: CursorSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

/** Applies the cursor for the current settings + active theme. */
export function applyCursor(settings: CursorSettings, activeTheme: ThemeDefinition): void {
  const root = document.documentElement;
  if (settings.pref === 'system') {
    delete root.dataset.cursor;
    root.style.removeProperty('--cursor-default');
    root.style.removeProperty('--cursor-pointer');
    return;
  }
  const theme = settings.pref === 'theme' ? activeTheme : getTheme(settings.pref);
  const opts = { shape: settings.shape, size: settings.size };
  root.style.setProperty('--cursor-default', cursorCss(theme, 'arrow', opts));
  root.style.setProperty('--cursor-pointer', cursorCss(theme, 'hand', opts));
  root.dataset.cursor = 'custom';
}
