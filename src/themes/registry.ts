import type { ThemeDefinition } from './types';

/**
 * Every file in ./presets that default-exports a ThemeDefinition is a theme.
 * Drop a new file in that folder and it appears on the Themes screen.
 */
const modules = import.meta.glob<{ default: ThemeDefinition }>('./presets/*.ts', { eager: true });

export const THEMES: ThemeDefinition[] = Object.values(modules)
  .map((m) => m.default)
  .filter((t): t is ThemeDefinition => Boolean(t && t.id))
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));

export const DEFAULT_THEME_ID = 'graphite';

const byId = new Map<string, ThemeDefinition>();
for (const t of THEMES) {
  byId.set(t.id, t);
  for (const legacy of t.legacyIds ?? []) {
    if (!byId.has(legacy)) byId.set(legacy, t);
  }
}

/** Resolves current ids and pre-redesign ids; falls back to the default theme. */
export function getTheme(id?: string | null): ThemeDefinition {
  return (id && byId.get(id)) || byId.get(DEFAULT_THEME_ID) || THEMES[0];
}

export function hasTheme(id?: string | null): boolean {
  return Boolean(id && byId.has(id));
}
