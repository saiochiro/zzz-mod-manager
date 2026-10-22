import type { ThemeDefinition } from '../types';

// Inspired by Jane — velvet violet, neon magenta, a glint of stolen gold.
const theme: ThemeDefinition = {
  id: 'velvet-heist',
  name: 'Velvet Heist',
  tagline: 'Neon alleys and a perfect getaway',
  agent: 'Jane Doe',
  faction: 'CRIMINAL INVESTIGATION',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 3,
  colors: {
    background: '#120c18',
    surface: '#1b1324',
    surfaceRaised: '#251a31',
    primary: '#a93fdc',
    secondary: '#ff6fb5',
    accent: '#ffd166',
    text: '#faf3ff',
    textMuted: '#b5a4c6',
    border: '#35274a',
    success: '#4ade80',
    warning: '#ffd166',
    error: '#ff7096',
  },
  gradients: {
    hero: 'radial-gradient(110% 130% at 0% 0%, rgba(255,111,181,0.28) 0%, rgba(255,111,181,0) 55%), linear-gradient(130deg, #3a1656 0%, #21142f 50%, #120c18 100%)',
    accent: ['#a93fdc', '#c4378a'],
  },
  glow: { color: '#d36bff', strength: 0.45 },
  motif: 'sparkles',
  typography: {
    displayFont: '"Syne", "Inter", system-ui, sans-serif',
    displayWeight: 800,
    displayTracking: '-0.01em',
  },
  legacyIds: ['jane-doe'],
};

export default theme;
