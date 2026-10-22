import type { ThemeDefinition } from '../types';

// Inspired by Ellen — shark-fin slate, crisp white trim, a bite of crimson.
const theme: ThemeDefinition = {
  id: 'riptide',
  name: 'Riptide',
  tagline: 'Deep water calm with a sudden bite',
  agent: 'Ellen',
  faction: 'VICTORIA HOUSEKEEPING',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 2,
  colors: {
    background: '#0d0f13',
    surface: '#15181e',
    surfaceRaised: '#1d2129',
    primary: '#d0243f',
    secondary: '#8fa6bd',
    accent: '#ffc2cc',
    text: '#f5f6f8',
    textMuted: '#9fa7b4',
    border: '#2a2e38',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#ff6b81',
  },
  gradients: {
    hero: 'radial-gradient(100% 120% at 90% 0%, rgba(232,48,79,0.32) 0%, rgba(232,48,79,0) 60%), linear-gradient(135deg, #1c2633 0%, #151a22 50%, #0d0f13 100%)',
    accent: ['#d0243f', '#c2185b'],
  },
  glow: { color: '#e8304f', strength: 0.4 },
  motif: 'waves',
  typography: {
    displayFont: '"Fredoka", "Inter", system-ui, sans-serif',
    displayWeight: 700,
    displayTracking: '0.005em',
  },
  legacyIds: ['ellen-joe'],
};

export default theme;
