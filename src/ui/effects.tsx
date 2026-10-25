import { useEffect } from 'react';

/**
 * Ambient interactions (no click effects):
 *  - glow: a soft halo follows the mouse and swells over clickable things
 *  - tilt: cards marked data-tilt lean toward the mouse with a light sheen
 *  - scanlines: a faint retro-TV line texture over the whole app
 *  - motion: decorative theme patterns drift slowly
 * Defaults respect the system "reduce motion" setting.
 */

export interface EffectsSettings {
  glow: boolean;
  scanlines: boolean;
  motion: boolean;
  /** 'scene' = animated agent background scene; 'plain' = flat theme color. */
  background: 'scene' | 'plain';
}

const KEY = 'zzz_effects_v2';

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function readEffectsSettings(): EffectsSettings {
  const rm = reducedMotion();
  const fallback: EffectsSettings = { glow: !rm, scanlines: false, motion: !rm, background: 'scene' };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
    if (localStorage.getItem('zzz_effects') === 'off') return { ...fallback, glow: false, motion: false };
  } catch {
    // ignore
  }
  return fallback;
}

export function storeEffectsSettings(s: EffectsSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

const INTERACTIVE =
  'button, a, [role="button"], [role="tab"], [role="radio"], [role="switch"], select, summary, label, .mod-card, .gb-card, .char-tile, .spotlight__item';

export function useInteractionEffects(settings: EffectsSettings) {
  // Flags read by CSS
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-scanlines', settings.scanlines);
    root.toggleAttribute('data-still', !settings.motion);
  }, [settings.scanlines, settings.motion]);

  // Cursor glow + card tilt
  useEffect(() => {
    if (!settings.glow) return;
    const glow = document.createElement('div');
    glow.className = 'fx-glow';
    document.body.appendChild(glow);
    let x = -300;
    let y = -300;
    let gx = x;
    let gy = y;
    let raf = 0;
    let tiltEl: HTMLElement | null = null;

    // Only animates while the glow is catching up with the cursor; idle = no work at all.
    const loop = () => {
      gx += (x - gx) * 0.22;
      gy += (y - gy) * 0.22;
      glow.style.transform = `translate(${gx}px, ${gy}px) translate(-50%, -50%)`;
      raf = Math.abs(x - gx) + Math.abs(y - gy) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const resetTilt = () => {
      if (tiltEl) {
        tiltEl.style.removeProperty('--rx');
        tiltEl.style.removeProperty('--ry');
        tiltEl.classList.remove('is-tilting');
        tiltEl = null;
      }
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      wake();
      const target = e.target as Element | null;
      glow.classList.toggle('is-hot', Boolean(target?.closest(INTERACTIVE)));
      const card = target?.closest<HTMLElement>('[data-tilt]') ?? null;
      if (card !== tiltEl) resetTilt();
      if (card) {
        tiltEl = card;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--rx', `${(0.5 - py) * 7}deg`);
        card.style.setProperty('--ry', `${(px - 0.5) * 9}deg`);
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
        card.classList.add('is-tilting');
      }
    };
    const onLeave = () => {
      x = -300;
      y = -300;
      wake();
      resetTilt();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      resetTilt();
      glow.remove();
    };
  }, [settings.glow]);
}

/**
 * Pauses every animation (background scene, patterns, glows) while ProxyLaunch isn't the window
 * you're using: tabbed out, behind another window, or minimized. Animations pick up where they left
 * off when you come back, so the app costs next to nothing while it sits in the background.
 */
export function usePauseWhenInactive() {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      const active = document.visibilityState === 'visible' && document.hasFocus();
      if (active) root.removeAttribute('data-paused');
      // A short delay so clicking a file dialog or a tooltip doesn't flicker the scene.
      else timer = window.setTimeout(() => root.setAttribute('data-paused', ''), 400);
    };
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
      root.removeAttribute('data-paused');
    };
  }, []);
}
