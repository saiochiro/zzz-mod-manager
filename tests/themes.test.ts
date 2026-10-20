import { describe, expect, it } from 'vitest';
import { THEMES, getTheme, DEFAULT_THEME_ID } from '../src/themes/registry';
import { buildTokens } from '../src/themes/tokens';
import { contrast } from '../src/themes/color';

const AA = 4.5;

describe('theme registry', () => {
  it('ships at least 8 themes with unique ids', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it('falls back to the default theme and resolves legacy ids', () => {
    expect(getTheme('does-not-exist').id).toBe(DEFAULT_THEME_ID);
    expect(getTheme('ellen-joe').id).toBe('riptide');
    expect(getTheme('miyabi-frost').id).toBe('frostblade');
  });

  it('never names a game in a theme name or tagline', () => {
    const banned = /zenless|zzz|genshin|honkai|wuthering|hoyo/i;
    for (const t of THEMES) {
      expect(`${t.name} ${t.tagline}`).not.toMatch(banned);
    }
  });
});

describe.each(THEMES.map((t) => [t.id, t] as const))('theme "%s" meets WCAG AA', (_id, theme) => {
  const r = buildTokens(theme).resolved;
  const surfaces = { background: r.bg, surface: r.surface, raised: r.raised, hover: r.hover };

  it.each(Object.entries(surfaces))('body text on %s', (_name, bg) => {
    expect(contrast(r.text, bg)).toBeGreaterThanOrEqual(AA);
  });

  it.each(Object.entries(surfaces))('muted text on %s', (_name, bg) => {
    expect(contrast(r.muted, bg)).toBeGreaterThanOrEqual(AA);
  });

  it('button labels on primary and on both call-to-action gradient stops', () => {
    expect(contrast(r.onPrimary, r.primary)).toBeGreaterThanOrEqual(AA);
    expect(contrast(r.onPrimary, r.ctaFrom)).toBeGreaterThanOrEqual(AA);
    expect(contrast(r.onPrimary, r.ctaTo)).toBeGreaterThanOrEqual(AA);
  });

  it('accent-colored text and selected states', () => {
    for (const bg of [...Object.values(surfaces), r.primarySoft]) {
      expect(contrast(r.primaryText, bg)).toBeGreaterThanOrEqual(AA);
    }
    expect(contrast(r.text, r.primarySoft)).toBeGreaterThanOrEqual(AA);
  });

  it('status badges (success / warning / error)', () => {
    expect(contrast(r.success, r.successSoft)).toBeGreaterThanOrEqual(AA);
    expect(contrast(r.warning, r.warningSoft)).toBeGreaterThanOrEqual(AA);
    expect(contrast(r.error, r.errorSoft)).toBeGreaterThanOrEqual(AA);
  });

  it('headline text over every solid stop of the hero gradient', () => {
    const stops = theme.gradients.hero.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) {
      expect(contrast(r.text, stop)).toBeGreaterThanOrEqual(AA);
    }
  });
});
