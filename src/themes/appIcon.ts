import type { ThemeDefinition } from './types';
import { G, HERO_GLYPH } from './glyphs';
import { contrast, mix } from './color';

/**
 * App icon for ProxyLaunch: a dark ether Hollow — a glowing sphere with an
 * orbit ring wrapped around it — on a tile in the theme's accent gradient.
 * Inside the Hollow floats the agent's own glyph (snowflake for Frostblade,
 * flame for Ember Rush…), so the icon changes with the theme.
 *
 * Detail steps down with size: 25–48 px drops the glyph, halftone and inner
 * ripples; 24 px and below (`simplified`) is just tile, sphere and ring.
 */

type IconTheme = Pick<ThemeDefinition, 'id' | 'gradients' | 'colors' | 'motif' | 'mode'>;

function iconColors(theme: IconTheme) {
  let [from, to] = theme.gradients.accent;
  const ink = theme.mode === 'dark' ? theme.colors.background : '#17151b';
  // Pale tiles (icy blue, gold, mint) are deepened a touch so the white ring
  // and dark sphere read the same in every theme.
  const deep = (c: string) => {
    let out = c;
    for (let i = 1; i <= 10 && contrast('#ffffff', out) < 2.4; i++) out = mix(c, '#141226', i * 0.07);
    return out;
  };
  from = deep(from);
  to = deep(to);
  const candidates = [theme.colors.accent, theme.colors.secondary, theme.colors.primary, '#ffffff'];
  const sorted = [...candidates].sort((a, b) => contrast(b, ink) - contrast(a, ink));
  const glow = sorted.find((c) => contrast(c, ink) >= 4) ?? '#ffffff';
  const glow2 = sorted.find((c) => c !== glow && contrast(c, ink) >= 3) ?? glow;
  return { from, to, ink, glow, glow2 };
}

const sparkle = (x: number, y: number, r: number, op = 1) =>
  `<path d="M${x} ${y - r} Q${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y} Q${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r} Q${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y} Q${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r} Z" fill="#ffffff" fill-opacity="${op}"/>`;

export function buildAppIconSvg(
  theme: IconTheme,
  opts: { size?: number; simplified?: boolean; small?: boolean } = {}
): string {
  const id = `ai-${theme.id.replace(/[^a-z0-9-]/gi, '')}`;
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
  const simple = Boolean(opts.simplified);
  const small = simple || Boolean(opts.small) || (opts.size !== undefined && opts.size <= 48);
  const { from, to, ink, glow, glow2 } = iconColors(theme);
  const g = G[HERO_GLYPH[theme.motif] ?? 'sparkle'];

  // Hollow geometry
  const cx = 512;
  const cy = simple ? 520 : 528;
  const r = simple ? 304 : small ? 296 : 280;
  const ringRx = simple ? 440 : 430;
  const ringRy = simple ? 128 : 118;
  const ringW = simple ? 46 : small ? 34 : 24;
  const tilt = -22;
  // Orbit split into the half behind the sphere and the half in front of it.
  const ringBack = `M${cx - ringRx} ${cy} A${ringRx} ${ringRy} 0 0 1 ${cx + ringRx} ${cy}`;
  const ringFront = `M${cx - ringRx} ${cy} A${ringRx} ${ringRy} 0 0 0 ${cx + ringRx} ${cy}`;

  const glyphScale = 8.6 * (g.mode === 'stroke' ? 0.95 : 1);
  const strokeW = g.mode === 'stroke' ? Math.max((g.w ?? 1.6) * 1.8, 2.4) : 0;
  const glyph = small
    ? ''
    : `<g transform="translate(${cx} ${cy - 8}) scale(${glyphScale}) translate(-12 -12)" filter="url(#${id}-soft)">
      <path d="${g.d}" fill="${g.mode === 'fill' ? `url(#${id}-gl)` : 'none'}" stroke="${g.mode === 'stroke' ? `url(#${id}-gl)` : 'none'}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;

  const ripples = small
    ? ''
    : `<g fill="none" stroke="${glow}" stroke-linecap="round">
      <ellipse cx="${cx + 18}" cy="${cy + 22}" rx="${r * 0.74}" ry="${r * 0.7}" stroke-opacity="0.24" stroke-width="12"/>
      <ellipse cx="${cx + 30}" cy="${cy + 36}" rx="${r * 0.48}" ry="${r * 0.45}" stroke-opacity="0.18" stroke-width="10"/>
    </g>`;

  const dots = small
    ? ''
    : `<rect x="32" y="32" width="960" height="960" rx="232" fill="url(#${id}-dots)" mask="url(#${id}-dm)"/>`;

  const sparkles = simple
    ? ''
    : small
    ? sparkle(806, 214, 64)
    : sparkle(800, 210, 58) + sparkle(222, 268, 30, 0.8) + sparkle(846, 820, 24, 0.6);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"${size}>
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="${id}-hi" cx="0.25" cy="0.08" r="0.95">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.3"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}-orb" cx="0.36" cy="0.3" r="0.82">
      <stop offset="0" stop-color="${mix(ink, glow, 0.26)}"/>
      <stop offset="0.55" stop-color="${mix(ink, glow, 0.06)}"/>
      <stop offset="1" stop-color="${ink}"/>
    </radialGradient>
    <radialGradient id="${id}-core" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${glow}" stop-opacity="0.38"/>
      <stop offset="1" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-gl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${glow}"/>
      <stop offset="1" stop-color="${glow2}"/>
    </linearGradient>
    <filter id="${id}-halo" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${simple ? 0 : 18}"/>
    </filter>
    <filter id="${id}-soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="${id}-dots" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
      <circle cx="22" cy="22" r="8" fill="#ffffff" fill-opacity="0.2"/>
    </pattern>
    <radialGradient id="${id}-dmg" cx="1" cy="0" r="0.7">
      <stop offset="0" stop-color="#fff"/>
      <stop offset="1" stop-color="#000"/>
    </radialGradient>
    <mask id="${id}-dm"><rect width="1024" height="1024" fill="url(#${id}-dmg)"/></mask>
  </defs>
  <rect x="32" y="32" width="960" height="960" rx="232" fill="url(#${id}-bg)"/>
  ${dots}
  <rect x="32" y="32" width="960" height="960" rx="232" fill="url(#${id}-hi)"/>
  <g transform="rotate(${tilt} ${cx} ${cy})">
    <path d="${ringBack}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="${ringW}" stroke-linecap="round"/>
  </g>
  ${simple ? '' : `<circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="${glow}" fill-opacity="0.55" filter="url(#${id}-halo)"/>`}
  <circle cx="${cx + (simple ? 0 : 16)}" cy="${cy + (simple ? 0 : 22)}" r="${r}" fill="#000" fill-opacity="${simple ? 0 : 0.28}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-orb)"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="url(#${id}-core)"/>
  ${ripples}
  ${glyph}
  <circle cx="${cx}" cy="${cy}" r="${r - (simple ? 12 : 9)}" fill="none" stroke="${glow}" stroke-width="${simple ? 24 : 18}"/>
  <g transform="rotate(${tilt} ${cx} ${cy})">
    <path d="${ringFront}" fill="none" stroke="#ffffff" stroke-width="${ringW}" stroke-linecap="round"/>
  </g>
  ${sparkles}
</svg>`;
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Rasterises an SVG string to a PNG data URL in the renderer. Electron's
 * nativeImage (used for the taskbar icon) cannot decode SVG on Windows, so
 * the theme icon must be sent as PNG.
 */
export function rasterizeSvg(svg: string, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Could not render icon'));
      img.src = svgToDataUrl(svg);
    } catch (err) {
      reject(err as Error);
    }
  });
}
