import React, { useMemo } from 'react';
import type { MotifKind } from './types';
import { G, SETS, type Glyph } from './glyphs';

/**
 * Decorative, theme-specific pattern (snowflakes, petals, waves…). Purely
 * ornamental: aria-hidden, pointer-events none, colored by theme tokens.
 * Glyphs are drawn in a 24×24 box and scattered deterministically.
 */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface MotifProps {
  kind: MotifKind;
  /** How many glyphs to scatter. */
  density?: number;
  /** Push glyphs toward one side so text on the other side stays clean. */
  bias?: 'none' | 'right' | 'edges';
  /** Overall opacity of the pattern. */
  opacity?: number;
  seed?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Override colors (defaults: accent + secondary tokens). */
  colors?: [string, string];
  /** Gently float glyphs (disabled automatically for reduced motion). */
  animated?: boolean;
}

export const Motif: React.FC<MotifProps> = ({
  kind,
  density = 18,
  bias = 'right',
  opacity = 0.5,
  seed = 'motif',
  className = '',
  style,
  colors,
  animated = false,
}) => {
  const items = useMemo(() => {
    const rand = rng(hash(`${kind}:${seed}`));
    const set = SETS[kind] ?? SETS.stars;
    const out: Array<{ g: Glyph; x: number; y: number; s: number; r: number; o: number; c: 0 | 1; delay: number }> = [];
    for (let i = 0; i < density; i++) {
      let x = rand();
      if (bias === 'right') x = 0.35 + Math.pow(x, 0.7) * 0.68;
      if (bias === 'edges') x = x < 0.5 ? x * 0.36 : 0.64 + (x - 0.5) * 0.72;
      const name = set[i % set.length];
      const g = G[name];
      const isSmall = name === 'dot';
      out.push({
        g,
        x: x * 400,
        y: rand() * 200,
        s: isSmall ? 0.5 + rand() * 0.6 : 0.7 + rand() * 1.3,
        r: name === 'wave' ? -8 + rand() * 16 : rand() * 360,
        o: 0.35 + rand() * 0.65,
        c: rand() > 0.55 ? 1 : 0,
        delay: rand() * 6,
      });
    }
    return out;
  }, [kind, density, bias, seed]);

  const [c0, c1] = colors ?? ['var(--accent)', 'var(--secondary)'];

  return (
    <svg
      className={`motif ${animated ? 'motif--animated' : ''} ${className}`}
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      style={{ opacity, ...style }}
    >
      {items.map((it, i) => {
        const color = it.c ? c1 : c0;
        return (
          <g
            key={i}
            transform={`translate(${it.x} ${it.y}) rotate(${it.r}) scale(${it.s}) translate(-12 -12)`}
            opacity={it.o}
          >
            <path
              d={it.g.d}
              fill={it.g.mode === 'fill' ? color : 'none'}
              stroke={it.g.mode === 'stroke' ? color : 'none'}
              strokeWidth={it.g.w ?? 0}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={animated ? 'motif-glyph' : undefined}
              style={animated ? { animationDelay: `${-it.delay}s` } : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
};
