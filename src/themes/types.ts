/**
 * A theme is ONE plain object. To add a new theme, create a file in
 * `src/themes/presets/` that default-exports a `ThemeDefinition` — the
 * registry picks it up automatically. Run `npm test` to verify contrast.
 */

export type MotifKind =
  | 'stars'
  | 'snow'
  | 'waves'
  | 'sparkles'
  | 'flames'
  | 'bubbles'
  | 'petals'
  | 'crescents'
  | 'roses'
  | 'feathers'
  | 'leaves'
  | 'notes'
  | 'crosshairs'
  | 'clouds'
  | 'paws'
  | 'arrows'
  | 'gears'
  | 'shields';

export interface ThemeColors {
  /** App background behind everything. */
  background: string;
  /** Cards, panels, sidebar. */
  surface: string;
  /** Inputs, menus, hovered rows, anything sitting on a surface. */
  surfaceRaised: string;
  /** Main brand color: primary buttons, active nav, toggles. */
  primary: string;
  /** Supporting color for secondary highlights and gradients. */
  secondary: string;
  /** Small pops of contrast: badges, motif sparkles, focus details. */
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  error: string;
}

export interface ThemeTypography {
  /** CSS font-family stack for big headings. Body text always uses Inter. */
  displayFont: string;
  displayWeight: number;
  displayStyle?: 'normal' | 'italic';
  displayCase?: 'none' | 'uppercase';
  displayTracking?: string;
}

export interface ThemeDefinition {
  id: string;
  /** Shown on the Themes screen. Mood names only — no character or game names. */
  name: string;
  /** One-line mood description shown under the name. */
  tagline: string;
  /** The agent this theme is based on, shown on the theme card. Omit for neutral themes. */
  agent?: string;
  /** Faction / crew label shown as a big poster-style watermark in page headers. */
  faction?: string;
  /** Default cursor silhouette for this theme. */
  cursorShape?: 'arrow' | 'blade' | 'reticle';
  mode: 'dark' | 'light';
  colors: ThemeColors;
  gradients: {
    /** Header / hero areas. Any CSS background-image value. */
    hero: string;
    /** Used for primary call-to-action fills and the app icon. Two hex stops. */
    accent: [string, string];
  };
  /** Ambient glow behind heroes and focused elements. strength 0 – 1. */
  glow: { color: string; strength: number };
  motif: MotifKind;
  typography: ThemeTypography;
  /** Old theme ids that should resolve to this theme (saved configs keep working). */
  legacyIds?: string[];
  /** Order on the Themes screen (lower first). */
  order?: number;
}
