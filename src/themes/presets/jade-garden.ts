import type { ThemeDefinition } from '../types';

// Inspired by Qingyi — jade plating, tea-garden greens, warm lantern gold.
const theme: ThemeDefinition = {
  id: 'jade-garden',
  name: 'Jade Garden',
  tagline: 'Moss, matcha and morning light',
  agent: 'Qingyi',
  faction: 'CRIMINAL INVESTIGATION',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 10,
  colors: {
    background: '#0a120e',
    surface: '#101b15',
    surfaceRaised: '#17261e',
    primary: '#34d399',
    secondary: '#b5e655',
    accent: '#f2d27a',
    text: '#ecfdf3',
    textMuted: '#9ab5a7',
    border: '#22392d',
    success: '#4ade80',
    warning: '#f2d27a',
    error: '#fb8a8a',
  },
  gradients: {
    hero: 'radial-gradient(100% 120% at 90% 0%, rgba(181,230,85,0.22) 0%, rgba(181,230,85,0) 55%), linear-gradient(140deg, #123a28 0%, #10221a 50%, #0a120e 100%)',
    accent: ['#34d399', '#b5e655'],
  },
  glow: { color: '#34d399', strength: 0.35 },
  motif: 'leaves',
  typography: {
    displayFont: '"Outfit", "Inter", system-ui, sans-serif',
    displayWeight: 600,
    displayTracking: '-0.01em',
  },
  legacyIds: ['matcha-jade'],
};

export default theme;
