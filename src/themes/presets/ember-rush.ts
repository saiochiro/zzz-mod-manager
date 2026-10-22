import type { ThemeDefinition } from '../types';

// Inspired by Burnice — engine-heat orange, sunset amber, road-dust browns.
const theme: ThemeDefinition = {
  id: 'ember-rush',
  name: 'Ember Rush',
  tagline: 'Full throttle, flames in the mirror',
  agent: 'Burnice',
  faction: 'SONS OF CALYDON',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 4,
  colors: {
    background: '#15100c',
    surface: '#1e1712',
    surfaceRaised: '#29201a',
    primary: '#ff8a1f',
    secondary: '#ffc93c',
    accent: '#ff5a4d',
    text: '#fff6ec',
    textMuted: '#c2ad99',
    border: '#3b2d21',
    success: '#86efac',
    warning: '#fde047',
    error: '#ff7a6b',
  },
  gradients: {
    hero: 'radial-gradient(90% 140% at 100% 100%, rgba(255,138,31,0.38) 0%, rgba(255,138,31,0) 60%), linear-gradient(160deg, #3d200c 0%, #24180f 50%, #15100c 100%)',
    accent: ['#ff8a1f', '#ffc93c'],
  },
  glow: { color: '#ff8a1f', strength: 0.5 },
  motif: 'flames',
  typography: {
    displayFont: '"Bungee", "Inter", system-ui, sans-serif',
    displayWeight: 400,
    displayTracking: '0.01em',
  },
  legacyIds: ['burnice-solar', 'hollow-gold'],
};

export default theme;
