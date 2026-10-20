import type { ThemeDefinition } from '../types';

// Inspired by Harumasa — easy-going archer: sea-glass teal, wind-swept white, a gold arrowhead.
const theme: ThemeDefinition = {
  id: 'gale-fletcher',
  name: 'Gale Fletcher',
  tagline: 'Half asleep, never misses',
  agent: 'Harumasa',
  faction: 'SECTION 6',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 12,
  colors: {
    background: '#061312',
    surface: '#0c1d1c',
    surfaceRaised: '#132a28',
    primary: '#2fd6c3',
    secondary: '#7fe6d6',
    accent: '#f5c451',
    text: '#e8fbf8',
    textMuted: '#8db1ab',
    border: '#1c3734',
    success: '#4ade80',
    warning: '#fcd34d',
    error: '#fb7185',
  },
  gradients: {
    hero: 'radial-gradient(120% 140% at 85% -20%, rgba(47,214,195,0.32) 0%, rgba(47,214,195,0) 55%), linear-gradient(140deg, #0f3a36 0%, #0b2120 52%, #061312 100%)',
    accent: ['#2fd6c3', '#1fa0c4'],
  },
  glow: { color: '#2fd6c3', strength: 0.42 },
  motif: 'arrows',
  typography: {
    displayFont: '"Exo 2", "Inter", system-ui, sans-serif',
    displayWeight: 700,
    displayStyle: 'italic',
    displayCase: 'uppercase',
    displayTracking: '0.03em',
  },
};

export default theme;
