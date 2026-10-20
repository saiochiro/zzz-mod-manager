import type { ThemeDefinition } from '../types';

// Inspired by Miyabi — midnight navy, glacier cyan, a single sharp crimson accent.
const theme: ThemeDefinition = {
  id: 'frostblade',
  name: 'Frostblade',
  tagline: 'Still air, sharp edges, falling snow',
  agent: 'Miyabi',
  faction: 'SECTION 6',
  cursorShape: 'blade',
  mode: 'dark',
  order: 1,
  colors: {
    background: '#0a1020',
    surface: '#101a2e',
    surfaceRaised: '#17243d',
    primary: '#5cc8ff',
    secondary: '#93b4ff',
    accent: '#ff7a90',
    text: '#eaf6ff',
    textMuted: '#93a8c6',
    border: '#213150',
    success: '#4ade80',
    warning: '#fcd34d',
    error: '#fb7185',
  },
  gradients: {
    hero: 'radial-gradient(120% 140% at 85% -20%, rgba(92,200,255,0.35) 0%, rgba(92,200,255,0) 55%), linear-gradient(140deg, #14305a 0%, #0e1a33 52%, #0a1020 100%)',
    accent: ['#5cc8ff', '#93b4ff'],
  },
  glow: { color: '#5cc8ff', strength: 0.45 },
  motif: 'snow',
  typography: {
    displayFont: '"Chakra Petch", "Inter", system-ui, sans-serif',
    displayWeight: 600,
    displayCase: 'uppercase',
    displayTracking: '0.04em',
  },
  legacyIds: ['miyabi-frost'],
};

export default theme;
