import type { ThemeDefinition } from '../types';

// Inspired by Yi Xuan — rice paper, flowing ink, a vermilion seal, mountain clouds.
const theme: ThemeDefinition = {
  id: 'ink-seal',
  name: 'Ink & Seal',
  tagline: 'Brush strokes, mountain mist, one red seal',
  agent: 'Yi Xuan',
  faction: 'YUNKUI SUMMIT',
  cursorShape: 'blade',
  mode: 'light',
  order: 9,
  colors: {
    background: '#f4f1ea',
    surface: '#fdfbf6',
    surfaceRaised: '#efeae0',
    primary: '#b8321f',
    secondary: '#3f6b5a',
    accent: '#1f1f24',
    text: '#1d1b1f',
    textMuted: '#5e5a56',
    border: '#e0d9cc',
    success: '#2f7d32',
    warning: '#9a5b00',
    error: '#b3261e',
  },
  gradients: {
    hero: 'radial-gradient(80% 130% at 100% 100%, rgba(184,50,31,0.18) 0%, rgba(184,50,31,0) 60%), linear-gradient(135deg, #e3ddd0 0%, #f1ede4 50%, #fbf9f4 100%)',
    accent: ['#b8321f', '#8c2a1c'],
  },
  glow: { color: '#b8321f', strength: 0.16 },
  motif: 'clouds',
  typography: {
    displayFont: '"Shippori Mincho B1", "Noto Serif JP", Georgia, serif',
    displayWeight: 700,
    displayTracking: '0.02em',
  },
  legacyIds: ['vermilion-court', 'changli-phoenix'],
};

export default theme;
