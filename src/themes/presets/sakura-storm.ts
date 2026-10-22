import type { ThemeDefinition } from '../types';

// Inspired by Yanagi — storm-cloud violet, crimson lightning, falling petals.
const theme: ThemeDefinition = {
  id: 'sakura-storm',
  name: 'Sakura Storm',
  tagline: 'Petals on the wind before the thunder',
  agent: 'Yanagi',
  faction: 'SECTION 6',
  cursorShape: 'blade',
  mode: 'dark',
  order: 6,
  colors: {
    background: '#110d1c',
    surface: '#1a1429',
    surfaceRaised: '#241c38',
    primary: '#7a4cf5',
    secondary: '#ff5c8a',
    accent: '#ffb3cf',
    text: '#f6f1ff',
    textMuted: '#afa2ca',
    border: '#33284f',
    success: '#6ee7b7',
    warning: '#fcd34d',
    error: '#ff8fa3',
  },
  gradients: {
    hero: 'radial-gradient(100% 130% at 85% 0%, rgba(255,92,138,0.28) 0%, rgba(255,92,138,0) 55%), linear-gradient(140deg, #2c1b56 0%, #1d1534 50%, #110d1c 100%)',
    accent: ['#7a4cf5', '#b6306a'],
  },
  glow: { color: '#a67bff', strength: 0.45 },
  motif: 'petals',
  typography: {
    displayFont: '"Shippori Mincho B1", "Noto Serif JP", Georgia, serif',
    displayWeight: 700,
    displayTracking: '0.02em',
  },
  legacyIds: ['raiden-euthymia', 'midnight-purple'],
};

export default theme;
