import type { ThemeDefinition } from '../types';

// Inspired by Caesar — outskirts biker boss: sun-baked sand, saddle leather, a turquoise sky.
const theme: ThemeDefinition = {
  id: 'outlaw-dust',
  name: 'Outlaw Dust',
  tagline: 'Open road, iron shield, no retreat',
  agent: 'Caesar',
  faction: 'SONS OF CALYDON',
  cursorShape: 'arrow',
  mode: 'light',
  order: 14,
  colors: {
    background: '#ecdfc6',
    surface: '#f8f0e1',
    surfaceRaised: '#efe2c9',
    primary: '#8b4a1f',
    secondary: '#c48a2c',
    accent: '#2f7f8c',
    text: '#2a1d12',
    textMuted: '#6b5640',
    border: '#dcc9a6',
    success: '#2f7d32',
    warning: '#9a5b00',
    error: '#b3261e',
  },
  gradients: {
    hero: 'radial-gradient(110% 140% at 85% -20%, rgba(232,160,72,0.4) 0%, rgba(232,160,72,0) 55%), linear-gradient(140deg, #f3d9a8 0%, #ecdfc6 55%, #e6d5b5 100%)',
    accent: ['#b0612a', '#7a3a14'],
  },
  glow: { color: '#c48a2c', strength: 0.28 },
  motif: 'shields',
  typography: {
    displayFont: '"Rye", Rockwell, Georgia, serif',
    displayWeight: 400,
    displayCase: 'uppercase',
    displayTracking: '0.04em',
  },
};

export default theme;
