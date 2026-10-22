import type { ThemeDefinition } from '../types';

// Inspired by Koleda — demolition crew boss: hazard yellow, asphalt black, hot orange sparks.
const theme: ThemeDefinition = {
  id: 'hard-hat',
  name: 'Hard Hat',
  tagline: 'Small boss, big hammer',
  agent: 'Koleda',
  faction: 'BELOBOG HEAVY INDUSTRIES',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 13,
  colors: {
    background: '#0e0d08',
    surface: '#17150d',
    surfaceRaised: '#211e13',
    primary: '#ffcc1f',
    secondary: '#ff9124',
    accent: '#ff5233',
    text: '#fff8e4',
    textMuted: '#b5aa88',
    border: '#332e1b',
    success: '#4ade80',
    warning: '#fde047',
    error: '#fb7185',
  },
  gradients: {
    hero: 'radial-gradient(120% 140% at 85% -20%, rgba(255,204,31,0.3) 0%, rgba(255,204,31,0) 55%), linear-gradient(140deg, #3a300d 0%, #1b180e 52%, #0e0d08 100%)',
    accent: ['#ffd84d', '#ff9a1f'],
  },
  glow: { color: '#ffcc1f', strength: 0.4 },
  motif: 'gears',
  typography: {
    displayFont: '"Black Ops One", Impact, "Arial Narrow", sans-serif',
    displayWeight: 400,
    displayCase: 'uppercase',
    displayTracking: '0.03em',
  },
};

export default theme;
