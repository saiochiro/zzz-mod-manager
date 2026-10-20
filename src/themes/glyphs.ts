import type { MotifKind } from './types';

/** Shared vector glyphs (24×24 box) used by motifs, the app icon, cursors and click effects. */
export type Glyph = { d: string; mode: 'fill' | 'stroke'; w?: number };

export const G: Record<string, Glyph> = {
  sparkle: { d: 'M12 1C13.2 8.6 15.4 10.8 23 12 15.4 13.2 13.2 15.4 12 23 10.8 15.4 8.6 13.2 1 12 8.6 10.8 10.8 8.6 12 1Z', mode: 'fill' },
  dot: { d: 'M12 9.6a2.4 2.4 0 1 0 0.01 0Z', mode: 'fill' },
  snow: {
    d: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M12 2 9.8 4.2M12 2l2.2 2.2M12 22l-2.2-2.2M12 22l2.2-2.2M3.3 7l3 .8M3.3 7l.8-3M20.7 17l-3-.8M20.7 17l-.8 3M3.3 17l.8 3M3.3 17l3-.8M20.7 7l-.8-3M20.7 7l-3 .8',
    mode: 'stroke',
    w: 1.5,
  },
  wave: { d: 'M1 13c2.6-4 5.4-4 8 0s5.4 4 8 0 4-3 6-3', mode: 'stroke', w: 1.8 },
  flame: { d: 'M12 1.5c1.2 4.3 6.5 6.4 6.5 12.7a6.5 6.5 0 0 1-13 0c0-3.2 1.9-5.3 3.2-6.4 0 2.2 1.1 3.3 2.2 3.3 0-3.4-1.3-6.3 1.1-9.6Z', mode: 'fill' },
  bubble: { d: 'M12 3.5a8.5 8.5 0 1 0 .01 0ZM7.6 9.3a5 5 0 0 1 3.2-2.8', mode: 'stroke', w: 1.5 },
  petal: { d: 'M12 4.2 10.7 2C6.8 5.2 5.3 10.3 8.4 15.3c1.1 1.9 2.3 3.4 3.6 3.4s2.5-1.5 3.6-3.4c3.1-5 1.6-10.1-2.3-13.3Z', mode: 'fill' },
  crescent: { d: 'M15.5 2.5a9.5 9.5 0 1 0 6 16.6A8 8 0 0 1 15.5 2.5Z', mode: 'fill' },
  rose: { d: 'M12 3a9 9 0 1 0 9 9M12 6.8a5.2 5.2 0 1 0 5.2 5.2M12 10.2a1.8 1.8 0 1 0 1.8 1.8', mode: 'stroke', w: 1.6 },
  feather: { d: 'M21 2.5c-9 .3-15.2 6.4-16.3 15.4l1.6 1.6C8.6 11.7 13.5 6.7 21 2.5ZM4.5 21.5l9.5-9.5', mode: 'stroke', w: 1.6 },
  leaf: { d: 'M4.5 19.5C4.5 9.6 10.6 4 20 4c0 9.4-5.6 15.5-15.5 15.5ZM4.5 19.5 14.6 9.4', mode: 'stroke', w: 1.6 },
  note: { d: 'M9 18.5a3 3 0 1 1-3-3 3 3 0 0 1 3 3ZM9 18.5V4.5l11-2.5v13.5M20 15.5a3 3 0 1 1-3-3 3 3 0 0 1 3 3ZM9 8.5l11-2.5', mode: 'stroke', w: 1.7 },
  crosshair: { d: 'M12 4.5a7.5 7.5 0 1 0 .01 0ZM12 1v6M12 17v6M1 12h6M17 12h6M12 10.8a1.2 1.2 0 1 0 .01 0Z', mode: 'stroke', w: 1.6 },
  waves2: { d: 'M2 9.5c2.5-3.2 5-3.2 7.5 0s5 3.2 7.5 0 3.8-2.6 5-2.6M2 16c2.5-3.2 5-3.2 7.5 0s5 3.2 7.5 0 3.8-2.6 5-2.6', mode: 'stroke', w: 2 },
  gem: { d: 'M6.5 3.5h11L22 9l-10 12L2 9l4.5-5.5ZM2 9h20M9.5 3.5 12 9l2.5-5.5M12 9v12', mode: 'stroke', w: 1.6 },
  cloud: { d: 'M2 15.5c2-.2 3.2-1.4 3.4-3.2.3-2.6 2.6-4.4 5.2-4 1.2-2.3 4.4-3 6.4-1.2 1.4 1.2 1.8 3 1.2 4.6 1.8.2 3.2 1.6 3.4 3.4M5.5 19.5c3.5 0 4.5-2 8-2s4.5 2 8.5 2', mode: 'stroke', w: 1.6 },
};

export const SETS: Record<MotifKind, string[]> = {
  stars: ['dot', 'dot', 'sparkle', 'dot'],
  snow: ['snow', 'dot', 'snow', 'sparkle'],
  waves: ['wave', 'wave', 'dot'],
  sparkles: ['sparkle', 'sparkle', 'dot'],
  flames: ['flame', 'dot', 'flame'],
  bubbles: ['bubble', 'dot', 'bubble'],
  petals: ['petal', 'petal', 'dot'],
  crescents: ['crescent', 'dot', 'sparkle'],
  roses: ['rose', 'petal', 'dot'],
  feathers: ['feather', 'dot', 'feather'],
  leaves: ['leaf', 'leaf', 'dot'],
  notes: ['note', 'sparkle', 'note', 'dot'],
  crosshairs: ['crosshair', 'dot', 'dot'],
  clouds: ['cloud', 'dot', 'cloud'],
};

/** The single most recognisable glyph for each motif (used on the app icon and cursor). */
export const HERO_GLYPH: Record<MotifKind, string> = {
  stars: 'sparkle',
  snow: 'snow',
  waves: 'waves2',
  sparkles: 'gem',
  flames: 'flame',
  bubbles: 'bubble',
  petals: 'petal',
  crescents: 'crescent',
  roses: 'rose',
  feathers: 'feather',
  leaves: 'leaf',
  notes: 'note',
  crosshairs: 'crosshair',
  clouds: 'cloud',
};
