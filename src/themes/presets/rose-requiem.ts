import type { ThemeDefinition } from '../types';

// Inspired by Vivian — gothic plum, lilac lace, silver thorns and roses.
const theme: ThemeDefinition = {
  id: 'rose-requiem',
  name: 'Rose Requiem',
  tagline: 'Black lace, pale roses, a soft final note',
  agent: 'Vivian',
  faction: 'MOCKINGBIRD',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 8,
  colors: {
    background: '#120c14',
    surface: '#1b1220',
    surfaceRaised: '#25192c',
    primary: '#a34a8c',
    secondary: '#c9b8e8',
    accent: '#f3c6dc',
    text: '#f8f0fa',
    textMuted: '#b8a6bf',
    border: '#3a2842',
    success: '#6ee7b7',
    warning: '#f4c95d',
    error: '#ff8a9a',
  },
  gradients: {
    hero: 'radial-gradient(90% 120% at 10% 0%, rgba(201,184,232,0.22) 0%, rgba(201,184,232,0) 50%), linear-gradient(135deg, #3a1638 0%, #231428 50%, #120c14 100%)',
    accent: ['#a34a8c', '#6e3f9e'],
  },
  glow: { color: '#c06aa8', strength: 0.4 },
  motif: 'roses',
  typography: {
    displayFont: '"Fraunces", Georgia, "Times New Roman", serif',
    displayWeight: 600,
    displayStyle: 'italic',
    displayTracking: '-0.01em',
  },
  legacyIds: ['chisa-crimson'],
};

export default theme;
