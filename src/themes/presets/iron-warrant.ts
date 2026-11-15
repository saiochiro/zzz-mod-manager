import type { ThemeDefinition } from '../types';

// Inspired by Severian — a public security swordsman with a cursed arm: night-slate steel,
// wind-jade gusts, a warning-light red, searchlights over the city.
const theme: ThemeDefinition = {
  id: 'iron-warrant',
  name: 'Iron Warrant',
  tagline: 'The wind serves the warrant',
  agent: 'Severian',
  faction: 'METROPOLITAN ORDER DIVISION',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 16,
  colors: {
    background: '#070b10',
    surface: '#0e151c',
    surfaceRaised: '#152029',
    primary: '#3ee6b5',
    secondary: '#c9d6e3',
    accent: '#ff4d5e',
    text: '#eef6f8',
    textMuted: '#93a7b4',
    border: '#1f2e39',
    success: '#4ade80',
    warning: '#fcd34d',
    error: '#ff7a85',
  },
  gradients: {
    hero: 'radial-gradient(90% 120% at 15% -10%, rgba(62,230,181,0.28) 0%, rgba(62,230,181,0) 58%), radial-gradient(60% 80% at 95% 110%, rgba(255,77,94,0.22) 0%, rgba(255,77,94,0) 60%), linear-gradient(160deg, #0f2027 0%, #0b141b 55%, #070b10 100%)',
    accent: ['#3ee6b5', '#22b8cf'],
  },
  glow: { color: '#3ee6b5', strength: 0.45 },
  motif: 'leaves',
  typography: {
    displayFont: '"Bebas Neue", "Rajdhani", "Inter", system-ui, sans-serif',
    displayWeight: 400,
    displayCase: 'uppercase',
    displayTracking: '0.08em',
  },
};

export default theme;
