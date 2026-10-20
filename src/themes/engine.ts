import { getTheme } from './registry';
import { buildTokens } from './tokens';
import { buildAppIconSvg, svgToDataUrl } from './appIcon';
import type { ThemeDefinition } from './types';

const STORAGE_KEY = 'zzz_theme';
let hasAppliedOnce = false;
let lastPointer: { x: number; y: number } | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastPointer = { x: e.clientX, y: e.clientY };
    },
    { capture: true, passive: true }
  );
}

function readStoredThemeId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable — the backend config copy still persists the choice
  }
}

function writeVars(theme: ThemeDefinition): void {
  const root = document.documentElement;
  const { vars } = buildTokens(theme);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  root.dataset.motif = theme.motif;
  root.style.setProperty('--faction', JSON.stringify(theme.faction ?? ''));
  root.style.colorScheme = theme.mode;
  updateFavicon(theme);
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Applies a theme to the whole document. After the first paint, switching
 * themes cross-fades (View Transitions when available, CSS transitions otherwise).
 */
export function applyTheme(theme: ThemeDefinition, opts: { animate?: boolean } = {}): void {
  const animate = (opts.animate ?? hasAppliedOnce) && !prefersReducedMotion();
  hasAppliedOnce = true;

  if (!animate) {
    writeVars(theme);
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition === 'function') {
    // New theme washes over the app in a circle from wherever you clicked.
    const root = document.documentElement;
    const origin = lastPointer ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    root.style.setProperty('--vt-x', `${origin.x}px`);
    root.style.setProperty('--vt-y', `${origin.y}px`);
    root.classList.add('vt-reveal');
    const vt = doc.startViewTransition(() => writeVars(theme));
    vt.finished.finally(() => root.classList.remove('vt-reveal'));
    return;
  }

  const root = document.documentElement;
  root.classList.add('theme-fading');
  writeVars(theme);
  window.setTimeout(() => root.classList.remove('theme-fading'), 450);
}

/** Call before React renders so the first frame already uses the saved theme. */
export function bootstrapTheme(): ThemeDefinition {
  const theme = getTheme(readStoredThemeId());
  applyTheme(theme, { animate: false });
  return theme;
}

export function updateFavicon(theme: ThemeDefinition): void {
  try {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = svgToDataUrl(buildAppIconSvg(theme));
  } catch {
    // not in a browser context
  }
}
