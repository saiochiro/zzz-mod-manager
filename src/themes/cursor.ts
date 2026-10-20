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
export type CursorShape = 'arrow' | 'blade' | 'reticle';
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

export function resolveShape(theme: ThemeDefinition, shapePref: CursorShapePref = 'auto'): CursorShape {
  return shapePref === 'auto' ? theme.cursorShape ?? 'arrow' : shapePref;
}

export function buildCursorSvg(
  theme: ThemeDefinition,
  kind: 'arrow' | 'hand',
  opts: { shape?: CursorShapePref; size?: CursorSize } = {}
): string {
  const shape = resolveShape(theme, opts.shape);
  const px = opts.size === 'large' ? 48 : 32;
  const inner =
    kind === 'hand' && shape === 'reticle'
      ? reticleSvg(theme)
      : arrowSvg(theme, shape === 'blade' ? 'blade' : 'arrow', kind === 'hand');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">${inner}</svg>`;
}

export function cursorCss(theme: ThemeDefinition, kind: 'arrow' | 'hand', opts: { shape?: CursorShapePref; size?: CursorSize } = {}): string {
  const shape = resolveShape(theme, opts.shape);
  const k = opts.size === 'large' ? 1.5 : 1;
  const [hx, hy] = kind === 'hand' && shape === 'reticle' ? [16, 16] : [5, 3];
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
