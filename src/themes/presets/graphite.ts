import type { ThemeDefinition } from '../types';

// Neutral default — calm graphite with a soft periwinkle accent.
const theme: ThemeDefinition = {
  id: 'graphite',
  name: 'Graphite',
  tagline: 'Quiet, focused, easy on the eyes',
  faction: 'PROXY NETWORK',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 0,
  colors: {
    background: '#0f1115',
    surface: '#161920',
    surfaceRaised: '#1e222b',
    primary: '#4f5ff0',
    secondary: '#38bdf8',
    accent: '#c4b5fd',
    text: '#eef0f6',
    textMuted: '#9aa3b5',
    border: '#272c37',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
  },
  gradients: {
    hero: 'linear-gradient(135deg, #1f2650 0%, #171b2b 48%, #12141a 100%)',
    accent: ['#4f5ff0', '#2d74c9'],
  },
  glow: { color: '#6b7cff', strength: 0.35 },
  motif: 'stars',
  typography: {
    displayFont: '"Space Grotesk", "Inter", system-ui, sans-serif',
    displayWeight: 700,
    displayTracking: '-0.01em',
  },
  legacyIds: ['cyberpunk-neon'],
};

export default theme;
