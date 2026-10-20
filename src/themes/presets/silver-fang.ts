import type { ThemeDefinition } from '../types';

// Inspired by Lycaon — black tie and white gloves: monochrome, polished silver, one red accent.
const theme: ThemeDefinition = {
  id: 'silver-fang',
  name: 'Silver Fang',
  tagline: 'Impeccable manners, sharper teeth',
  agent: 'Lycaon',
  faction: 'VICTORIA HOUSEKEEPING',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 11,
  colors: {
    background: '#0b0b0d',
    surface: '#141417',
    surfaceRaised: '#1c1c21',
    primary: '#e9e9ee',
    secondary: '#a3a8b3',
    accent: '#e5484d',
    text: '#f4f4f6',
    textMuted: '#9d9da6',
    border: '#2a2a31',
    success: '#4ade80',
    warning: '#fcd34d',
    error: '#f87171',
  },
  gradients: {
    hero: 'radial-gradient(110% 140% at 85% -20%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 55%), linear-gradient(140deg, #2a2a30 0%, #151518 55%, #0b0b0d 100%)',
    accent: ['#f6f6f8', '#8d929c'],
  },
  glow: { color: '#e9e9ee', strength: 0.3 },
  motif: 'paws',
  typography: {
    displayFont: '"Bodoni Moda", Didot, Georgia, serif',
    displayWeight: 700,
    displayCase: 'uppercase',
    displayTracking: '0.06em',
  },
};

export default theme;
