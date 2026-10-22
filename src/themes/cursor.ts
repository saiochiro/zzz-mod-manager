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

const KEY = 'zzz_cursor_v3';
const PREV_KEY = 'zzz_cursor_v2';
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
/* Signature cursors: the pointer, dressed up as each agent            */
/* ------------------------------------------------------------------ */
// Drawn on a 44×44 grid with the tip at (7, 7). Features (ears, wings, tails,
// thrusters...) are extra parts around the pointer; every part gets the same
// white sticker outline, so the whole thing reads as one silhouette.
type Part =
  | { d: string; fill: string; t?: string } // filled shape
  | { d: string; line: number; color: string; t?: string }; // stroked shape (tails, handles)

const SIG_GRID = 44;
const SIG_TIP: [number, number] = [7, 7];
/** On-screen size of the character cursors (normal / large). */
// Chromium drops cursors over 128 device px, so large stays small enough for 200% scaling.
const SIG_PX = { normal: 52, large: 64 } as const;
const POINTER = 'M7 7 L7 30.5 L12.9 25 L17.1 34 L21.5 32 L17.3 23.1 L25.6 23.1 Z';
const INK = '#15161d';
const GOLD = '#e9c46a';
// Local +y runs along the pointer from tip to tail.
const AXIS = 'rotate(-25)';

/** Flame jet pointing down the pointer's axis, rooted at (x, y). */
const jet = (x: number, y: number, len = 9, w = 3.6): Part => ({
  d: `M${-w} 0 C${-w * 0.9} ${len * 0.4} ${-w * 0.3} ${len * 0.75} 0 ${len} C${w * 0.3} ${len * 0.75} ${w * 0.9} ${len * 0.4} ${w} 0 Z`,
  fill: 'url(#flame)',
  t: `translate(${x} ${y}) ${AXIS}`,
});
const FLAME_DEF = `<linearGradient id="flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ff8a1f"/><stop offset="1" stop-color="#e5264f"/></linearGradient>`;

/** Pointed ear sticking out of the pointer's upper edge (which runs at ~40°). */
const ear = (x: number, y: number, h: number, w: number, fill: string, tilt = 0): Part => ({
  d: `M${-w / 2} 1 Q${-w * 0.35} ${-h * 0.5} ${tilt} ${-h} Q${w * 0.35} ${-h * 0.5} ${w / 2} 1 Z`,
  fill,
  t: `translate(${x} ${y}) rotate(40)`,
});
const innerEar = (x: number, y: number, h: number, w: number, color: string, tilt = 0) =>
  `<path transform="translate(${x} ${y}) rotate(40)" d="M${-w / 4} 0 Q${-w * 0.18} ${-h * 0.45} ${tilt * 0.8} ${-h * 0.78} Q${w * 0.18} ${-h * 0.45} ${w / 4} 0 Z" fill="${color}"/>`;

/** One accessory (ears, tail, wings...), drawn at scale k around its attachment point. */
interface Feature {
  k: number;
  at: [number, number];
  back?: Part[];
  front?: Part[];
  detail?: string;
}

interface Signature {
  features: Feature[];
  /** Highlights on the pointer itself (never scaled). */
  shine?: string;
  /** Pointer fill override (default: theme gradient). */
  body?: string;
  /** Glow effects drawn behind everything, without an outline (Phoenix light blades). */
  aura?: string;
}

const F = (k: number, at: [number, number], f: Omit<Feature, 'k' | 'at'>): Feature => ({ k, at, ...f });
const SHINE = '<path d="M9 12 L9 24" stroke="#fff" stroke-opacity=".75" stroke-width="1.2" stroke-linecap="round"/>';

function signature(theme: ThemeDefinition): Signature {
  const c = theme.colors;
  const acc = c.accent;
  switch (theme.id) {
    case 'frostblade': // fox ears and a fluffy tail
      return {
        shine: SHINE,
        features: [
          F(0.8, [14, 12.7], {
            front: [ear(11.2, 10.4, 10.5, 6.4, 'url(#fill)', -1), ear(16.8, 15, 10.5, 6.4, 'url(#fill)', 1)],
            detail: `${innerEar(11.2, 10.4, 10.5, 6.4, acc, -1)}${innerEar(16.8, 15, 10.5, 6.4, acc, 1)}`,
          }),
          F(0.72, [20, 29], {
            back: [{ d: 'M19 31 C22 37.4 30.4 40.4 36.4 36.2 C40 33.6 40.4 28 37.2 23.6 C36.4 26.6 35 28.4 32.6 29.4 C33.6 26.8 33.2 24.4 31.8 22.4 C31 26 28.2 28.8 24.8 29 C22.8 29.2 21 28.6 20 27.6 Z', fill: 'url(#fill)' }],
            detail: `<path d="M37.2 23.6 C40.4 28 40 33.6 36.4 36.2 C37 33 36.4 29.6 34.6 27.8 C36 26.8 36.8 25.4 37.2 23.6 Z" fill="#fff" fill-opacity=".95"/>`,
          }),
        ],
      };
    case 'riptide': // dorsal fin and a shark tail
      return {
        shine: SHINE,
        features: [
          F(0.72, [20.6, 31.4], { back: [{ d: 'M18 31 L13.5 41 C17 39.6 19.5 38.4 21.6 37.6 C24.4 38.4 28 40.4 31.5 42.5 L23.4 30.4 Z', fill: '#4d5d72' }] }),
          F(0.78, [17.6, 15.2], {
            back: [{ d: 'M13.4 12.6 C16.6 8.6 20.4 5.8 24.6 4.6 C23.4 8.6 22.6 12.6 21.6 17.6 Z', fill: '#4d5d72' }],
            detail: `<path d="M15.2 11.6 C17.6 8.8 20.2 7 22.8 6.2" stroke="#9fb3c8" stroke-width="1" fill="none" stroke-linecap="round"/>`,
          }),
          F(1, [0, 0], { detail: `<path d="M14.6 25.6 L16.4 23.6 M16.6 27.6 L18.4 25.6 M18.6 29.6 L20.4 27.6" stroke="#fff" stroke-opacity=".7" stroke-width="1" stroke-linecap="round"/>` }),
        ],
      };
    case 'velvet-heist': // round mouse ears and a long curling tail
      return {
        shine: '<path d="M9 13 L9 24" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>',
        features: [
          F(0.78, [16, 13], {
            back: [
              { d: 'M9.2 8.2 a4.8 4.8 0 1 0 9.6 0 a4.8 4.8 0 1 0 -9.6 0 Z', fill: 'url(#fill)' },
              { d: 'M16.2 12.6 a4.8 4.8 0 1 0 9.6 0 a4.8 4.8 0 1 0 -9.6 0 Z', fill: 'url(#fill)' },
            ],
            detail: `<circle cx="14.4" cy="7.8" r="2.6" fill="${c.secondary}"/><circle cx="21.4" cy="12.2" r="2.6" fill="${c.secondary}"/>`,
          }),
          F(0.75, [20, 33], { back: [{ d: 'M20 33 C23.5 39.5 32.5 40.5 34.5 34.5 C36 30 32 26.5 29.6 29.8', line: 1.8, color: '#e9a6c9' }] }),
          F(1, [0, 0], { detail: `<path d="M11.5 22 l1.4 -1.4 l1.4 1.4 l-1.4 1.4 z" fill="${acc}"/>` }),
        ],
      };
    case 'ember-rush': // twin rocket thrusters with flame jets
      return {
        shine: `${SHINE}<path d="M12 17.5 L15 15.4 M13.5 21 L17.4 18.4" stroke="#fff3b0" stroke-width="1.1" stroke-linecap="round"/>`,
        features: [
          F(0.74, [21, 26], {
            back: [
              jet(20.4, 35.6, 12, 4),
              jet(27.2, 25.4, 11, 3.6),
              { d: 'M-3.8 0 L3.8 0 L4.8 5.6 L-4.8 5.6 Z', fill: '#3a2a20', t: `translate(18 30.6) ${AXIS}` },
              { d: 'M-3.4 0 L3.4 0 L4.3 5 L-4.3 5 Z', fill: '#3a2a20', t: `translate(24.8 20.8) ${AXIS}` },
            ],
            detail: `<defs>${FLAME_DEF}</defs>`,
          }),
        ],
      };
    case 'undying-flame': {
      // Light-blade wings: thin glowing streaks fanning out from the pointer, with a heart.
      const blade = (x: number, y: number, angle: number, len: number, w: number) =>
        `<path transform="translate(${x} ${y}) rotate(${angle})" d="M0 0 C${len * 0.3} ${-w} ${len * 0.7} ${-w * 0.7} ${len} 0 C${len * 0.7} ${w * 0.45} ${len * 0.3} ${w * 0.6} 0 0 Z" fill="url(#blade)"/>`;
      const blades = [
        blade(19, 18, -48, 19, 2.6),
        blade(20, 19.6, -24, 21, 2.4),
        blade(21, 21.4, -2, 18, 2.2),
        blade(19.4, 25, 26, 14, 2),
        blade(11, 27.6, 118, 11, 2),
        blade(10.4, 25, 146, 9, 1.8),
      ].join('');
      return {
        shine: `${SHINE}<path d="M12.6 19.2 c0 -1.6 2.2 -1.8 2.4 -0.4 c0.2 -1.4 2.4 -1.2 2.4 0.4 c0 1.4 -2.4 2.8 -2.4 2.8 c0 0 -2.4 -1.4 -2.4 -2.8 Z" fill="#fff" fill-opacity=".9"/>`,
        aura: `<defs><linearGradient id="blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff4f8"/><stop offset=".35" stop-color="#ff8ac4"/><stop offset=".75" stop-color="#ffb35c"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>
          <g filter="url(#glow)" opacity=".9">${blades}</g><g>${blades}</g>`,
        features: [F(0.72, [19.6, 32.6], { back: [jet(19.8, 33.4, 9, 3.2)], detail: `<defs>${FLAME_DEF}</defs>` })],
      };
    }
    case 'silver-fang': // wolf ears and a red bow tie
      return {
        shine: '<path d="M9 12 L9 19" stroke="#fff" stroke-opacity=".8" stroke-width="1.2" stroke-linecap="round"/>',
        features: [
          F(0.8, [14, 12.6], {
            front: [ear(11, 10.2, 9, 6.6, '#8f949e', -1.6), ear(16.8, 15, 9, 6.6, '#8f949e', 1.6)],
            detail: `${innerEar(11, 10.2, 9, 6.6, '#3a3d45', -1.6)}${innerEar(16.8, 15, 9, 6.6, '#3a3d45', 1.6)}`,
          }),
          F(0.72, [20.5, 29.5], { back: [{ d: 'M19.5 31.5 C24 35 30 35.5 33.5 32 C31.5 31.5 29.5 30.4 28.6 29 C30.6 28.8 32.2 27.8 33 26.4 C29 27.2 24.6 27.6 21 27 Z', fill: '#8f949e' }] }),
          F(0.9, [13, 23.9], {
            front: [{ d: 'M10.4 21.8 L13 23.4 L15.6 21.8 L15.6 26 L13 24.4 L10.4 26 Z', fill: acc }],
            detail: `<circle cx="13" cy="23.9" r="1.1" fill="#fff" fill-opacity=".8"/>`,
          }),
        ],
      };
    case 'sakura-storm': // a polearm haft with a tassel, petals and a spark
      return {
        shine: `<path d="M12.6 15 L10.8 19.4 L12.8 19.2 L11 24" stroke="#f2e9ff" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8.8 10 L8.8 16" stroke="#fff" stroke-opacity=".75" stroke-width="1.1" stroke-linecap="round"/>`,
        features: [
          F(0.72, [18.6, 30.6], {
            back: [
              { d: 'M18.6 30.6 L31.6 42', line: 2.6, color: '#2a1d3f' },
              { d: 'M31 41.2 C33 42.6 35 42.6 36 41 C34.6 40.2 33.4 39.4 32.8 38 Z', fill: c.secondary },
            ],
          }),
          F(0.85, [21, 18], { front: [{ d: 'M20.4 20.4 C18.8 17.8 19.6 15.6 22.4 15.2 C23.4 17.4 23.4 19.4 20.4 20.4 Z', fill: '#ffb3cf' }] }),
        ],
      };
    case 'night-patrol': // police cap with a gold badge
      return {
        shine: '<path d="M9 14 L9 24" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>',
        features: [
          F(0.82, [15.6, 13.8], {
            front: [
              { d: 'M-6.4 0 C-6.6 -5 -4.4 -8 0 -8.4 C5 -8.4 7.8 -6.2 7.8 -2.8 L6.4 0 Z', fill: '#1d2333', t: 'translate(15.6 13.8) rotate(40)' },
              { d: 'M-6.8 0 L9 0 L10.6 2.4 L-5.2 2.4 Z', fill: INK, t: 'translate(15.6 13.8) rotate(40)' },
            ],
            detail: `<g transform="translate(15.6 13.8) rotate(40)"><rect x="-6.4" y="-2.4" width="13.6" height="2" fill="${c.primary}"/>
              <path d="M0.6 -7 L1.4 -5.2 L3.2 -5 L1.8 -3.8 L2.2 -2 L0.6 -3 L-1 -2 L-0.6 -3.8 L-2 -5 L-0.2 -5.2 Z" fill="${GOLD}"/></g>`,
          }),
        ],
      };
    case 'rose-requiem': // a lace parasol and a rose
      return {
        shine: '<path d="M9 12 L9 22" stroke="#fff" stroke-opacity=".75" stroke-width="1.2" stroke-linecap="round"/>',
        features: [
          F(0.7, [21, 18], {
            back: [
              { d: 'M0 0 L0 13', line: 1.4, color: '#2a1630', t: 'translate(27.4 12.6) rotate(28)' },
              { d: 'M-10 0 A10 8.6 0 0 1 10 0 Q7.5 2.2 5 0 Q2.5 2.2 0 0 Q-2.5 2.2 -5 0 Q-7.5 2.2 -10 0 Z', fill: '#2a1630', t: 'translate(27.4 12.6) rotate(28)' },
            ],
            detail: `<g transform="translate(27.4 12.6) rotate(28)"><path d="M-6 -1.4 Q-4 -7 0 -8.6 M6 -1.4 Q4 -7 0 -8.6 M0 -8.6 L0 -0.4" stroke="${c.primary}" stroke-width=".9" fill="none"/></g>`,
          }),
          F(0.85, [13.2, 27.7], {
            front: [{ d: 'M11 26.4 a2.8 2.8 0 1 1 4.4 2.6 a2.8 2.8 0 1 1 -4.4 -2.6 Z', fill: acc }],
            detail: `<circle cx="13.2" cy="27.7" r="1.2" fill="${c.primary}"/>`,
          }),
        ],
      };
    case 'ink-seal': // an ink brush with a red seal
      return {
        body: INK,
        shine: `<path d="M9 12 L9 24" stroke="#fff" stroke-opacity=".35" stroke-width="1.1" stroke-linecap="round"/>
          <rect x="15.6" y="18.4" width="4.4" height="4.4" rx=".8" transform="rotate(12 17.8 20.6)" fill="#d64545"/>
          <path d="M16.6 19.9 h2.4 M17.8 19.5 v2.6" stroke="#fff" stroke-width=".7"/>`,
        features: [
          F(0.74, [18.6, 30.6], {
            back: [
              { d: 'M18.8 31 L28.6 41.6', line: 3.2, color: '#8a5a32' },
              { d: 'M-2.2 0 L2.2 0 L2.2 3.2 L-2.2 3.2 Z', fill: GOLD, t: 'translate(18.4 30.2) rotate(-42)' },
            ],
          }),
          F(1, [0, 0], { detail: `<circle cx="4" cy="34" r="1.3" fill="${INK}"/><circle cx="6.6" cy="37.4" r=".8" fill="${INK}"/>` }),
        ],
      };
    case 'jade-garden': // robot antennae and a bamboo leaf
      return {
        shine: `<path d="M10 19 h5 M10 22 h3.4" stroke="#0a120e" stroke-opacity=".45" stroke-width="1" stroke-linecap="round"/>
          <path d="M9 12 L9 16" stroke="#fff" stroke-opacity=".75" stroke-width="1.2" stroke-linecap="round"/>`,
        features: [
          F(0.8, [14.6, 13.3], {
            front: [
              { d: 'M0 0 L0 -7.6', line: 1.6, color: '#c9f5dc', t: 'translate(11.6 10.8) rotate(40)' },
              { d: 'M0 0 L0 -7.6', line: 1.6, color: '#c9f5dc', t: 'translate(17.6 15.8) rotate(40)' },
              { d: 'M-2.4 0 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0 Z', fill: acc, t: 'translate(11.6 10.8) rotate(40) translate(0 -8.6)' },
              { d: 'M-2.4 0 a2.4 2.4 0 1 0 4.8 0 a2.4 2.4 0 1 0 -4.8 0 Z', fill: acc, t: 'translate(17.6 15.8) rotate(40) translate(0 -8.6)' },
            ],
          }),
          F(0.72, [22, 30], {
            back: [{ d: 'M22 30 C26 27 31 27.4 35 30.4 C31 32.6 26.4 33 22 30 Z', fill: c.secondary }],
            detail: `<path d="M23.6 30 L33 30.2" stroke="#0a120e" stroke-opacity=".5" stroke-width=".7"/>`,
          }),
        ],
      };
    case 'starlight-encore': // a music note and a star
      return {
        shine: SHINE,
        features: [
          F(0.72, [22, 31], {
            back: [{ d: 'M19.2 36.4 a3.6 2.7 -22 1 0 7.2 -1.4 a3.6 2.7 -22 1 0 -7.2 1.4 Z M25.4 34.6 L25.4 23.4 L27 23.4 C27.6 26 30 27 31.4 29.4 C29.4 28 28 27.6 27 27.6 L27 34.6 Z', fill: c.primary }],
            detail: `<path d="M21 35.6 C22 34.6 23.4 34.2 24.4 34.4" stroke="#fff" stroke-opacity=".7" stroke-width=".8" fill="none" stroke-linecap="round"/>`,
          }),
          F(0.72, [26, 22], { back: [{ d: 'M30.6 17 L32.2 21 L36.4 21.4 L33.2 24.1 L34.2 28.2 L30.6 25.9 L27 28.2 L28 24.1 L24.8 21.4 L29 21 Z', fill: GOLD }] }),
        ],
      };
    case 'gale-fletcher': // a real arrow: shaft and teal fletching
      return {
        shine: `${SHINE}<path d="M11 16 L16.6 20.4" stroke="${GOLD}" stroke-width="1.2" stroke-linecap="round"/>`,
        features: [
          F(0.78, [17.4, 25.6], {
            back: [
              { d: 'M17.4 25.6 L34.6 41', line: 2, color: '#eadfc4' },
              { d: 'M28.6 35.6 L27.4 43 L32.4 38.6 Z', fill: 'url(#fill)' },
              { d: 'M29.2 34.4 L36.8 33.4 L32.8 38.4 Z', fill: 'url(#fill)' },
            ],
          }),
        ],
      };
    case 'hard-hat': // a hard hat and a sledgehammer
      return {
        shine: '<path d="M9 14 L9 24" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>',
        features: [
          F(0.8, [15.4, 13.6], {
            front: [
              { d: 'M-6.6 0 C-6.6 -5.4 -3.6 -8.2 0.4 -8.2 C4.4 -8.2 7.2 -5.4 7.2 0 Z', fill: '#ffcc1f', t: 'translate(15.4 13.6) rotate(40)' },
              { d: 'M-8.6 0 L9.4 0 L9.4 1.8 L-8.6 1.8 Z', fill: '#e0a800', t: 'translate(15.4 13.6) rotate(40)' },
            ],
            detail: `<g transform="translate(15.4 13.6) rotate(40)"><path d="M0.4 -8 L0.4 0" stroke="#fff3b0" stroke-width="1.6"/></g>`,
          }),
          F(0.72, [22, 24.6], {
            back: [
              { d: 'M22 24.6 L33.4 36', line: 2.8, color: '#7a4b2a' },
              { d: 'M-5 -2.6 L5 -2.6 L5 2.6 L-5 2.6 Z', fill: '#4a4f5a', t: 'translate(34 36.6) rotate(45)' },
            ],
          }),
        ],
      };
    case 'outlaw-dust': // a round shield behind the pointer
      return {
        shine: '<path d="M9 12 L9 24" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>',
        features: [
          F(0.72, [22, 24], {
            back: [{ d: 'M18 26.5 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 Z', fill: '#7a3a14' }],
            detail: `<circle cx="27" cy="26.5" r="6.4" fill="none" stroke="${c.secondary}" stroke-width="1.4"/>
              <circle cx="27" cy="26.5" r="2.4" fill="${GOLD}" stroke="#4a2410" stroke-width=".6"/>
              <path d="M27 18.6 L27 21 M27 32 L27 34.4 M19.1 26.5 L21.5 26.5 M32.5 26.5 L34.9 26.5" stroke="${GOLD}" stroke-width="1.2" stroke-linecap="round"/>`,
          }),
        ],
      };
    default: // graphite / anything new: the proxy pointer with a Hollow's orbit ring
      return {
        shine: '<path d="M9 12 L9 24" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>',
        features: [
          F(0.9, [15.4, 21], {
            detail: `<ellipse cx="15.4" cy="21" rx="13.4" ry="3.6" transform="rotate(-32 15.4 21)" fill="none" stroke="#fff" stroke-width="2.6"/>
              <ellipse cx="15.4" cy="21" rx="13.4" ry="3.6" transform="rotate(-32 15.4 21)" fill="none" stroke="${acc}" stroke-width="1.2"/>`,
          }),
        ],
      };
  }
}

const scaleAt = (f: Feature) => `translate(${f.at[0]} ${f.at[1]}) scale(${f.k}) translate(${-f.at[0]} ${-f.at[1]})`;
const placed = (f: Feature, parts?: Part[]): Part[] =>
  (parts ?? []).map((p) => ({ ...p, t: `${scaleAt(f)}${p.t ? ` ${p.t}` : ''}` }));

function renderParts(parts: Part[], layer: 'shadow' | 'outline' | 'color'): string {
  return parts
    .map((p) => {
      const t = p.t ? ` transform="${p.t}"` : '';
      if ('fill' in p) {
        if (layer === 'shadow') return `<path${t} d="${p.d}" fill="#000"/>`;
        if (layer === 'outline') return `<path${t} d="${p.d}" fill="#fff" stroke="#fff" stroke-width="3.6" stroke-linejoin="round"/>`;
        return `<path${t} d="${p.d}" fill="${p.fill}" stroke="#0b0d12" stroke-width=".9" stroke-linejoin="round"/>`;
      }
      if (layer === 'shadow') return `<path${t} d="${p.d}" stroke="#000" stroke-width="${p.line}" stroke-linecap="round" fill="none"/>`;
      if (layer === 'outline') return `<path${t} d="${p.d}" stroke="#fff" stroke-width="${p.line + 3.6}" stroke-linecap="round" fill="none"/>`;
      return `<path${t} d="${p.d}" stroke="${p.color}" stroke-width="${p.line}" stroke-linecap="round" fill="none"/>`;
    })
    .join('');
}

/** Little "click" burst at the tip, shown when hovering anything clickable. */
const CLICK_BURST = `<g stroke-linecap="round">
  <path d="M4.2 7 L1.4 7 M7 4.2 L7 1.4 M4.9 4.9 L2.8 2.8" stroke="#fff" stroke-width="3.4"/>
  <path d="M4.2 7 L1.4 7 M7 4.2 L7 1.4 M4.9 4.9 L2.8 2.8" stroke="#0b0d12" stroke-width="1.5"/></g>`;

function signatureSvg(theme: ThemeDefinition, hand: boolean): string {
  const [from, to] = theme.gradients.accent;
  const sig = signature(theme);
  const pointer: Part = { d: POINTER, fill: sig.body ?? 'url(#fill)' };
  const back = sig.features.flatMap((f) => placed(f, f.back));
  const front = sig.features.flatMap((f) => placed(f, f.front));
  const all = [...back, pointer, ...front];
  const details = sig.features.map((f) => (f.detail ? `<g transform="${scaleAt(f)}">${f.detail}</g>` : '')).join('');
  return `<defs><linearGradient id="fill" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  ${sig.aura ?? ''}
  <g transform="translate(1.3 1.7)" opacity=".4">${renderParts(all, 'shadow')}</g>
  ${renderParts(all, 'outline')}
  ${renderParts(back, 'color')}${renderParts([pointer], 'color')}${renderParts(front, 'color')}
  ${details}
  ${sig.shine ?? ''}
  ${hand ? CLICK_BURST : ''}`;
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
  const reticleHand = kind === 'hand' && (shape === 'reticle' || (shape === 'signature' && theme.cursorShape === 'reticle'));
  if (shape === 'signature' && !reticleHand) {
    const px = SIG_PX[opts.size === 'large' ? 'large' : 'normal'];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${SIG_GRID} ${SIG_GRID}">${signatureSvg(theme, kind === 'hand')}</svg>`;
  }
  const px = opts.size === 'large' ? 48 : 32;
  const inner = reticleHand ? reticleSvg(theme) : arrowSvg(theme, shape === 'blade' ? 'blade' : 'arrow', kind === 'hand');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">${inner}</svg>`;
}

export function cursorCss(theme: ThemeDefinition, kind: 'arrow' | 'hand', opts: { shape?: CursorShapePref; size?: CursorSize } = {}): string {
  const shape = resolveShape(theme, opts.shape);
  const k = opts.size === 'large' ? 1.5 : 1;
  const reticleHand = kind === 'hand' && (shape === 'reticle' || (shape === 'signature' && theme.cursorShape === 'reticle'));
  if (shape === 'signature' && !reticleHand) {
    const scale = SIG_PX[opts.size === 'large' ? 'large' : 'normal'] / SIG_GRID;
    return `url("${svgToDataUrl(buildCursorSvg(theme, kind, opts))}") ${Math.round(SIG_TIP[0] * scale)} ${Math.round(SIG_TIP[1] * scale)}, ${kind === 'arrow' ? 'default' : 'pointer'}`;
  }
  const [hx, hy] = reticleHand ? [16, 16] : [5, 3];
  return `url("${svgToDataUrl(buildCursorSvg(theme, kind, opts))}") ${Math.round(hx * k)} ${Math.round(hy * k)}, ${kind === 'arrow' ? 'default' : 'pointer'}`;
}

export function readCursorSettings(): CursorSettings {
  const fallback: CursorSettings = { pref: 'theme', shape: 'auto', size: 'normal' };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
    // v3 introduced character cursors: keep the old choice of theme/size, but switch
    // everyone to them once (Settings still lets you pick Arrow or Blade again).
    const prev = localStorage.getItem(PREV_KEY);
    if (prev) {
      const old = JSON.parse(prev) as Partial<CursorSettings>;
      return { ...fallback, pref: old.pref ?? fallback.pref, size: old.size ?? fallback.size, shape: 'auto' };
    }
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
