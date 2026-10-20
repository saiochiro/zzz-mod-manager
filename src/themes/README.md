# Themes

Every theme is a single file in `presets/`. Drop a new file there and it appears on the Themes screen automatically. There's no list to update.

```ts
// presets/midnight-bloom.ts
import type { ThemeDefinition } from '../types';

const theme: ThemeDefinition = {
  id: 'midnight-bloom',            // unique, kebab-case
  name: 'Midnight Bloom',          // mood name shown in the app
  tagline: 'Night garden, soft neon',
  mode: 'dark',                    // or 'light'
  order: 20,                       // position on the Themes screen
  colors: {
    background: '#0e0b14', surface: '#171221', surfaceRaised: '#211a2e',
    primary: '#8b5cf6', secondary: '#f472b6', accent: '#fde68a',
    text: '#f5f0ff', textMuted: '#ab9fc2', border: '#2f2542',
    success: '#4ade80', warning: '#fbbf24', error: '#fb7185',
  },
  gradients: {
    hero: 'linear-gradient(135deg, #2a1846 0%, #181126 55%, #0e0b14 100%)',
    accent: ['#8b5cf6', '#b64391'],    // buttons + app icon
  },
  glow: { color: '#8b5cf6', strength: 0.4 },
  motif: 'petals',                 // stars | snow | waves | sparkles | flames | bubbles | petals | crescents | roses | feathers | leaves
  typography: {
    displayFont: '"Outfit", "Inter", system-ui, sans-serif',
    displayWeight: 600,
  },
};

export default theme;
```

Then run `npm test`. `tests/themes.test.ts` checks every theme against WCAG AA. Text-style colors (muted text, accent text, status colors) are nudged automatically until they pass. The test flags the things it can't fix for you:

- **Button text.** White or near-black text must reach 4.5:1 on `primary` and on both `gradients.accent` stops. Darken or lighten the primary if it fails.
- **Hero text.** Body text must be readable over every hex stop in `gradients.hero`.

If you add a heading font, also add it to the Google Fonts link in `index.html`.
