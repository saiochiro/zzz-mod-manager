import type { ThemeDefinition } from '../types';

// Inspired by Phoenix — a judge who can't stay down: crimson fire, molten gold, rose embers, a rebirth halo.
const theme: ThemeDefinition = {
  id: 'undying-flame',
  name: 'Undying Flame',
  tagline: 'Burn out, rise again',
  agent: 'Phoenix',
  faction: 'KRAMPUS COMPLIANCE AUTHORITY',
  cursorShape: 'arrow',
  mode: 'dark',
  order: 15,
  colors: {
    background: '#140a0c',
    surface: '#1e1013',
    surfaceRaised: '#29161a',
    primary: '#ff5b3a',
    secondary: '#ffc65c',
    accent: '#ff4f8b',
    text: '#fff3ee',
    textMuted: '#caa9a3',
    border: '#3e2127',
    success: '#86efac',
    warning: '#fde047',
    error: '#ff7a7a',
  },
  gradients: {
    hero: 'radial-gradient(80% 130% at 50% 115%, rgba(255,91,58,0.42) 0%, rgba(255,91,58,0) 60%), radial-gradient(60% 90% at 85% -10%, rgba(255,198,92,0.22) 0%, rgba(255,198,92,0) 60%), linear-gradient(170deg, #3a1015 0%, #23101a 55%, #140a0c 100%)',
    accent: ['#ff5b3a', '#ffb547'],
  },
  glow: { color: '#ff5b3a', strength: 0.55 },
  motif: 'plumes',
  typography: {
    displayFont: '"Cinzel", "Cormorant Garamond", Georgia, serif',
    displayWeight: 700,
    displayCase: 'uppercase',
    displayTracking: '0.06em',
  },
};

export default theme;
