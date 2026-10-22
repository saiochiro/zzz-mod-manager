import type { ThemeDefinition } from '../types';

// Inspired by Zhu Yuan — midnight patrol: matte black, siren red, steel blue, a locked-on reticle.
const theme: ThemeDefinition = {
  id: 'night-patrol',
  name: 'Night Patrol',
  tagline: 'Sirens off, sights on target',
  agent: 'Zhu Yuan',
  faction: 'CRIMINAL INVESTIGATION',
  cursorShape: 'reticle',
  mode: 'dark',
  order: 7,
  colors: {
    background: '#0b0a0d',
    surface: '#141217',
    surfaceRaised: '#1d1a21',
    primary: '#d42a3a',
    secondary: '#7f9cc4',
    accent: '#ff5c6c',
    text: '#f3f1f5',
    textMuted: '#a7a1ad',
    border: '#2c2730',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#ff6b7a',
  },
  gradients: {
    hero: 'radial-gradient(70% 120% at 82% 10%, rgba(212,42,58,0.42) 0%, rgba(212,42,58,0) 60%), linear-gradient(150deg, #1d1220 0%, #141117 55%, #0b0a0d 100%)',
    accent: ['#d42a3a', '#8a1c2b'],
  },
  glow: { color: '#d42a3a', strength: 0.45 },
  motif: 'crosshairs',
  typography: {
    displayFont: '"Rajdhani", "Inter", system-ui, sans-serif',
    displayWeight: 700,
    displayCase: 'uppercase',
    displayTracking: '0.06em',
  },
  legacyIds: ['crimson-flame', 'crimson-eclipse'],
};

export default theme;
