import type { ThemeDefinition } from '../types';

// Inspired by Astra Yao — a bright stage: pearl white, rose spotlight, gold trim, music in the air.
const theme: ThemeDefinition = {
  id: 'starlight-encore',
  name: 'Starlight Encore',
  tagline: 'Spotlights up — one more song',
  agent: 'Astra Yao',
  faction: 'STARS OF LYRA',
  cursorShape: 'arrow',
  mode: 'light',
  order: 5,
  colors: {
    background: '#f8f1f4',
    surface: '#ffffff',
    surfaceRaised: '#f8eff3',
    primary: '#b02e6a',
    secondary: '#c08a1e',
    accent: '#6c4ad0',
    text: '#2a1622',
    textMuted: '#6c5463',
    border: '#ead9e1',
    success: '#15803d',
    warning: '#a16207',
    error: '#c62828',
  },
  gradients: {
    hero: 'radial-gradient(90% 120% at 100% 0%, rgba(232,190,90,0.38) 0%, rgba(232,190,90,0) 55%), linear-gradient(135deg, #fbd9e8 0%, #fbeef4 50%, #fffaf6 100%)',
    accent: ['#b02e6a', '#8a3fb0'],
  },
  glow: { color: '#e05a9a', strength: 0.2 },
  motif: 'notes',
  typography: {
    displayFont: '"Fraunces", Georgia, "Times New Roman", serif',
    displayWeight: 600,
    displayTracking: '-0.01em',
  },
  legacyIds: ['furina-salon', 'grand-encore'],
};

export default theme;
