import { bestOn, ensureContrast, mix, rgba } from './color';
import type { ThemeDefinition } from './types';

/**
 * Turns a ThemeDefinition into the full set of CSS custom properties the UI
 * uses. Text-like colors are run through ensureContrast so every theme meets
 * WCAG AA (4.5:1) for text, even if a palette color is a little too soft.
 */
export interface ThemeTokens {
  vars: Record<string, string>;
  /** Exposed for tests and for the theme preview cards. */
  resolved: {
    bg: string;
    surface: string;
    raised: string;
    hover: string;
    text: string;
    muted: string;
    primary: string;
    onPrimary: string;
    primarySoft: string;
    primaryText: string;
    secondaryText: string;
    accentText: string;
    success: string;
    warning: string;
    error: string;
    successSoft: string;
    warningSoft: string;
    errorSoft: string;
    ctaFrom: string;
    ctaTo: string;
  };
}

const DARK_INK = '#0b0d12';

export function buildTokens(theme: ThemeDefinition): ThemeTokens {
  const c = theme.colors;
  const isDark = theme.mode === 'dark';
  const bg = c.background;
  const surface = c.surface;
  const raised = c.surfaceRaised;
  const hover = mix(raised, c.text, isDark ? 0.06 : 0.04);
  const textBgs = [bg, surface, raised, hover];

  const text = ensureContrast(c.text, textBgs, 7);
  const muted = ensureContrast(c.textMuted, textBgs, 4.5);

  const primary = c.primary;
  const [ctaFrom, ctaTo] = theme.gradients.accent;
  const onPrimary = bestOn(primary, ['#ffffff', DARK_INK]);
  const primarySoft = mix(surface, primary, isDark ? 0.16 : 0.1);
  const primaryText = ensureContrast(primary, [...textBgs, primarySoft], 4.5);
  const secondaryText = ensureContrast(c.secondary, textBgs, 4.5);
  const accentText = ensureContrast(c.accent, textBgs, 4.5);

  const statusSoft = (col: string) => mix(surface, col, isDark ? 0.16 : 0.12);
  const successSoft = statusSoft(c.success);
  const warningSoft = statusSoft(c.warning);
  const errorSoft = statusSoft(c.error);
  const success = ensureContrast(c.success, [...textBgs, successSoft], 4.5);
  const warning = ensureContrast(c.warning, [...textBgs, warningSoft], 4.5);
  const error = ensureContrast(c.error, [...textBgs, errorSoft], 4.5);

  const glowAlpha = theme.glow.strength;
  const shadowInk = isDark ? '#000000' : mix('#1a2440', c.text, 0.3);

  const vars: Record<string, string> = {
    '--bg': bg,
    '--surface': surface,
    '--raised': raised,
    '--hover': hover,
    '--pressed': mix(raised, c.text, isDark ? 0.1 : 0.08),
    '--border': c.border,
    '--border-strong': mix(c.border, c.text, isDark ? 0.14 : 0.18),
    '--text': text,
    '--text-muted': muted,
    '--text-faint': mix(muted, surface, 0.35),

    '--primary': primary,
    '--primary-hover': mix(primary, isDark ? '#ffffff' : '#000000', 0.1),
    '--on-primary': onPrimary,
    '--primary-soft': primarySoft,
    '--primary-text': primaryText,
    '--primary-border': mix(c.border, primary, 0.55),
    '--secondary': c.secondary,
    '--secondary-text': secondaryText,
    '--accent': c.accent,
    '--accent-text': accentText,

    '--success': success,
    '--success-soft': successSoft,
    '--success-solid': c.success,
    '--warning': warning,
    '--warning-soft': warningSoft,
    '--warning-solid': c.warning,
    '--error': error,
    '--error-soft': errorSoft,
    '--error-solid': c.error,

    '--hero': theme.gradients.hero,
    '--cta': `linear-gradient(135deg, ${ctaFrom} 0%, ${ctaTo} 100%)`,
    '--cta-from': ctaFrom,
    '--cta-to': ctaTo,
    '--glow': rgba(theme.glow.color, glowAlpha),
    '--glow-soft': rgba(theme.glow.color, glowAlpha * 0.45),
    '--focus-ring': `0 0 0 2px ${bg}, 0 0 0 4px ${rgba(primaryText, 0.85)}`,

    '--shadow-sm': `0 1px 2px ${rgba(shadowInk, isDark ? 0.4 : 0.08)}`,
    '--shadow-md': `0 6px 18px -6px ${rgba(shadowInk, isDark ? 0.55 : 0.16)}, 0 2px 4px ${rgba(shadowInk, isDark ? 0.3 : 0.06)}`,
    '--shadow-lg': `0 24px 48px -16px ${rgba(shadowInk, isDark ? 0.7 : 0.24)}, 0 4px 12px ${rgba(shadowInk, isDark ? 0.35 : 0.08)}`,
    '--scrim': isDark ? 'rgba(4, 5, 8, 0.66)' : rgba(mix('#1a2440', c.text, 0.4), 0.38),

    '--font-display': theme.typography.displayFont,
    '--display-weight': String(theme.typography.displayWeight),
    '--display-style': theme.typography.displayStyle ?? 'normal',
    '--display-case': theme.typography.displayCase ?? 'none',
    '--display-tracking': theme.typography.displayTracking ?? '0',
  };

  return {
    vars,
    resolved: {
      bg,
      surface,
      raised,
      hover,
      text,
      muted,
      primary,
      onPrimary,
      primarySoft,
      primaryText,
      secondaryText,
      accentText,
      success,
      warning,
      error,
      successSoft,
      warningSoft,
      errorSoft,
      ctaFrom,
      ctaTo,
    },
  };
}
