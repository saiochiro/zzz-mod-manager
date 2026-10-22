import React, { useMemo } from 'react';
import type { ThemeDefinition } from './types';
import { G, HERO_GLYPH } from './glyphs';

/**
 * Animated background scene behind the whole app, one per agent theme
 * (falling snow and aurora for Frostblade, waves for Riptide, a rainy city
 * with patrol lights for Night Patrol…). Purely decorative: aria-hidden,
 * no pointer events, transforms/opacity only so it stays cheap to animate.
 * Animations stop when "Moving patterns" is off or the OS asks for reduced motion.
 */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */
const Glows: React.FC<{ colors: string[]; strength?: number }> = ({ colors, strength = 1 }) => (
  <>
    {colors.map((c, i) => (
      <span
        key={i}
        className={`scene-glow scene-glow--${i}`}
        style={{ background: `radial-gradient(circle, ${c} 0%, transparent 65%)`, opacity: 0.5 * strength }}
      />
    ))}
  </>
);

interface ParticleOpts {
  glyph: string;
  count: number;
  colors: string[];
  motion: 'fall' | 'rise' | 'drift';
  size?: [number, number];
  speed?: [number, number]; // seconds per pass
  opacity?: [number, number];
  seed: string;
  /** Horizontal range in % (keeps particles out from behind the sidebar). */
  xRange?: [number, number];
}

const Particles: React.FC<ParticleOpts> = ({
  glyph,
  count,
  colors,
  motion,
  size = [10, 22],
  speed = [14, 26],
  opacity = [0.5, 0.95],
  seed,
  xRange = [18, 100],
}) => {
  const items = useMemo(() => {
    const r = rng(hash(seed));
    return Array.from({ length: Math.round(count * 1.4) }, () => ({
      x: xRange[0] + r() * (xRange[1] - xRange[0]),
      s: (size[0] + r() * (size[1] - size[0])) * 1.3,
      d: speed[0] + r() * (speed[1] - speed[0]),
      delay: -r() * 30,
      o: opacity[0] + r() * (opacity[1] - opacity[0]),
      rot: Math.round(r() * 360),
      sway: 20 + r() * 60,
      c: colors[Math.floor(r() * colors.length)],
    }));
  }, [count, seed, colors.join(), size[0], size[1], speed[0], speed[1], xRange[0], xRange[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const g = G[glyph] ?? G.sparkle;
  return (
    <>
      {items.map((p, i) => (
        <span
          key={i}
          className={`scene-p scene-p--${motion}`}
          style={
            {
              left: `${p.x}%`,
              width: p.s,
              height: p.s,
              opacity: p.o,
              animationDuration: `${p.d}s`,
              animationDelay: `${p.delay}s`,
              '--sway': `${p.sway}px`,
              '--rot': `${p.rot}deg`,
            } as React.CSSProperties
          }
        >
          <svg viewBox="0 0 24 24" style={{ transform: `rotate(${p.rot}deg)` }}>
            <path
              d={g.d}
              fill={g.mode === 'fill' ? p.c : 'none'}
              stroke={g.mode === 'stroke' ? p.c : 'none'}
              strokeWidth={g.w ?? 1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ))}
    </>
  );
};

/** Full-width SVG pinned to the bottom of the window. */
const Bottom: React.FC<{ children: React.ReactNode; height?: string; className?: string }> = ({ children, height = '42%', className = '' }) => (
  <svg className={`scene-bottom ${className}`} style={{ height }} viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice">
    {children}
  </svg>
);

function skyline(seed: string, base: number, minH: number, maxH: number): string {
  const r = rng(hash(seed));
  let x = 0;
  let d = `M0 400 L0 ${base}`;
  while (x < 1600) {
    const w = 40 + r() * 90;
    const h = minH + r() * (maxH - minH);
    d += ` L${x} ${base - h} L${x + w} ${base - h}`;
    if (r() > 0.7) d += ` L${x + w * 0.5} ${base - h - 18} L${x + w} ${base - h}`;
    x += w;
  }
  return d + ` L1600 ${base} L1600 400 Z`;
}

function windows(seed: string, color: string, base: number): React.ReactNode {
  const r = rng(hash(seed + 'w'));
  return Array.from({ length: 70 }, (_, i) => (
    <rect
      key={i}
      x={r() * 1600}
      y={base - 20 - r() * 160}
      width="5"
      height="7"
      fill={color}
      className={r() > 0.8 ? 'scene-twinkle' : undefined}
      style={{ opacity: 0.25 + r() * 0.5, animationDelay: `${-r() * 6}s` }}
    />
  ));
}

const wavePath = (y: number, amp: number, len: number) => {
  let d = `M0 ${y}`;
  for (let x = 0; x <= 3200; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`;
  return d + ` L3200 400 L0 400 Z`;
};

const Beams: React.FC<{ colors: string[]; from?: 'top' | 'bottom' }> = ({ colors, from = 'top' }) => (
  <div className={`scene-beams scene-beams--${from}`}>
    {colors.map((c, i) => (
      <span key={i} className={`scene-beam scene-beam--${i}`} style={{ background: `linear-gradient(${from === 'top' ? '180deg' : '0deg'}, ${c}, transparent 85%)` }} />
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/* Scene kit v2: one full-window SVG stage per theme                   */
/* ------------------------------------------------------------------ */
// Everything is drawn on a 1600×900 stage that covers the window (slice), so
// layouts hold at any size. The sidebar covers roughly x < 260, so key art sits
// right and low. Animations only touch transform/opacity.

const Stage: React.FC<{ children: React.ReactNode; className?: string; align?: 'mid' | 'max' }> = ({ children, className = '', align = 'max' }) => (
  <svg className={`sx-stage ${className}`} viewBox="0 0 1600 900" preserveAspectRatio={`xMidY${align === 'max' ? 'Max' : 'Mid'} slice`}>
    {children}
  </svg>
);

/** Vertical gradient as a <linearGradient>. stops: [offset 0..1, color, opacity?] */
const VGrad: React.FC<{ id: string; stops: Array<[number, string, number?]>; x2?: number; y2?: number }> = ({ id, stops, x2 = 0, y2 = 1 }) => (
  <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
    {stops.map(([o, c, op], i) => (
      <stop key={i} offset={o} stopColor={c} stopOpacity={op ?? 1} />
    ))}
  </linearGradient>
);

const RGrad: React.FC<{ id: string; stops: Array<[number, string, number?]>; cx?: number; cy?: number; r?: number }> = ({ id, stops, cx = 0.5, cy = 0.5, r = 0.5 }) => (
  <radialGradient id={id} cx={cx} cy={cy} r={r}>
    {stops.map(([o, c, op], i) => (
      <stop key={i} offset={o} stopColor={c} stopOpacity={op ?? 1} />
    ))}
  </radialGradient>
);

/** Jagged mountain ridge from x=0..1600, filled down to the bottom. */
function ridge(seed: string, base: number, amp: number, step = 70, jag = 0.55): string {
  const r = rng(hash(seed));
  let d = `M-20 900 L-20 ${base}`;
  let y = base;
  for (let x = 0; x <= 1640; x += step * (0.6 + r() * 0.8)) {
    const peak = base - amp * (0.25 + r());
    const mid = y + (peak - y) * (0.4 + r() * 0.3);
    d += ` L${x - step * 0.3} ${mid + (r() - 0.5) * amp * jag} L${x} ${peak}`;
    y = peak;
  }
  return d + ' L1640 900 Z';
}

/** Mountain range with clear peaks and valleys. */
function peaks(seed: string, base: number, amp: number, n = 6): string {
  const r = rng(hash(seed));
  const w = 1680 / n;
  let d = `M-40 900 L-40 ${base - amp * 0.15}`;
  for (let i = 0; i < n; i++) {
    const x0 = -40 + i * w;
    const px = x0 + w * (0.35 + r() * 0.3);
    const py = base - amp * (0.5 + r() * 0.5);
    const vx = x0 + w;
    const vy = base - amp * (0.05 + r() * 0.2);
    // a couple of shoulders on each slope
    d += ` L${x0 + (px - x0) * 0.45} ${base - amp * 0.1 - (base - py) * (0.35 + r() * 0.15)}`;
    d += ` L${x0 + (px - x0) * 0.62} ${base - amp * 0.1 - (base - py) * (0.45 + r() * 0.1)}`;
    d += ` L${px} ${py}`;
    d += ` L${px + (vx - px) * 0.35} ${py + (vy - py) * (0.3 + r() * 0.2)}`;
    d += ` L${px + (vx - px) * 0.55} ${py + (vy - py) * (0.5 + r() * 0.1)}`;
    d += ` L${vx} ${vy}`;
  }
  return d + ' L1660 900 Z';
}

/** Rolling hills (smooth). */
function hills(seed: string, base: number, amp: number, n = 5): string {
  const r = rng(hash(seed));
  const w = 1640 / n;
  let d = `M-20 900 L-20 ${base} `;
  for (let i = 0; i < n; i++) {
    const x0 = -20 + i * w;
    const top = base - amp * (0.3 + r() * 0.7);
    d += `Q${x0 + w / 2} ${top - amp * 0.4} ${x0 + w} ${base - amp * 0.2 * r()} `;
  }
  return d + 'L1640 900 Z';
}

/** City skyline for the 1600×900 stage. */
function city(seed: string, base: number, minH: number, maxH: number, spires = 0.3): string {
  const r = rng(hash(seed));
  let x = -20;
  let d = `M-20 900 L-20 ${base}`;
  while (x < 1640) {
    const w = 34 + r() * 80;
    const h = minH + r() * (maxH - minH);
    d += ` L${x} ${base - h} L${x + w} ${base - h}`;
    if (r() < spires) d += ` L${x + w * 0.5} ${base - h - 14 - r() * 40} L${x + w} ${base - h}`;
    x += w + (r() > 0.8 ? 6 : 0);
  }
  return d + ' L1640 900 Z';
}

/** Lit windows for a skyline (twinkling a little). */
const CityLights: React.FC<{ seed: string; base: number; height: number; colors: string[]; count?: number; size?: number }> = ({
  seed,
  base,
  height,
  colors,
  count = 90,
  size = 4,
}) => {
  const r = rng(hash(seed + 'lights'));
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <rect
          key={i}
          x={r() * 1600}
          y={base - 12 - r() * height}
          width={size}
          height={size * 1.4}
          fill={colors[Math.floor(r() * colors.length)]}
          className={r() > 0.75 ? 'sx-twinkle' : undefined}
          style={{ opacity: 0.35 + r() * 0.55, animationDelay: `${-r() * 8}s` }}
        />
      ))}
    </g>
  );
};

const Stars: React.FC<{ seed: string; count?: number; maxY?: number; color?: string }> = ({ seed, count = 90, maxY = 520, color = '#ffffff' }) => {
  const r = rng(hash(seed + 'stars'));
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const big = r() > 0.92;
        return (
          <circle
            key={i}
            cx={r() * 1600}
            cy={r() * maxY}
            r={big ? 1.6 : 0.5 + r() * 0.8}
            fill={color}
            className={r() > 0.6 ? 'sx-twinkle' : undefined}
            style={{ opacity: 0.25 + r() * 0.6, animationDelay: `${-r() * 9}s`, animationDuration: `${3 + r() * 5}s` }}
          />
        );
      })}
    </g>
  );
};

/** Soft cloud/mist band exactly 1600 wide, so two copies tile seamlessly while drifting. */
function cloudPath(seed: string, y: number, h: number): string {
  const r = rng(hash(seed + 'cloud'));
  const widths: number[] = [];
  let total = 0;
  while (total < 1600) {
    const w = 80 + r() * 160;
    widths.push(w);
    total += w;
  }
  const k = 1600 / total;
  let d = `M0 ${y + h}`;
  for (const w of widths) d += ` q${(w * k) / 2} ${-h * (0.6 + r() * 0.8)} ${w * k} 0`;
  return d + ` L1600 ${y + h + 60} L0 ${y + h + 60} Z`;
}

const Clouds: React.FC<{ seed: string; y: number; h: number; fill: string; opacity: number; speed: number; reverse?: boolean; blur?: number }> = ({
  seed,
  y,
  h,
  fill,
  opacity,
  speed,
  reverse,
  blur = 6,
}) => (
  <g className={`sx-drift ${reverse ? 'sx-drift--rev' : ''}`} style={{ animationDuration: `${speed}s` }}>
    <g opacity={opacity} style={{ filter: `blur(${blur}px)` }}>
      <path d={cloudPath(seed, y, h)} fill={fill} />
      <path d={cloudPath(seed, y, h)} fill={fill} transform="translate(1600 0)" />
    </g>
  </g>
);

/** Light rays fanning from a point. */
const Rays: React.FC<{ x: number; y: number; color: string; count?: number; spread?: number; angle?: number; length?: number; opacity?: number; width?: number }> = ({
  x,
  y,
  color,
  count = 7,
  spread = 70,
  angle = 90,
  length = 1100,
  opacity = 0.16,
  width = 34,
}) => (
  <g className="sx-rays" style={{ transformOrigin: `${x}px ${y}px` }}>
    {Array.from({ length: count }, (_, i) => {
      const a = ((angle - spread / 2 + (spread * i) / Math.max(1, count - 1)) * Math.PI) / 180;
      const w = width * (0.6 + ((i * 37) % 10) / 10);
      const ex = x + Math.cos(a) * length;
      const ey = y + Math.sin(a) * length;
      const nx = (-Math.sin(a) * w) / 2;
      const ny = (Math.cos(a) * w) / 2;
      return (
        <path
          key={i}
          d={`M${x} ${y} L${ex + nx * 3} ${ey + ny * 3} L${ex - nx * 3} ${ey - ny * 3} Z`}
          fill={color}
          className="sx-ray"
          style={{ opacity: opacity * (0.5 + ((i * 53) % 10) / 20), animationDelay: `${-i * 1.7}s` }}
        />
      );
    })}
  </g>
);

/** Glowing disc (sun/moon) with bloom. */
const Orb: React.FC<{ id: string; x: number; y: number; r: number; core: string; edge: string; glow: string; glowR?: number; glowOpacity?: number }> = ({
  id,
  x,
  y,
  r,
  core,
  edge,
  glow,
  glowR = 3.2,
  glowOpacity = 0.45,
}) => (
  <g>
    <defs>
      <RGrad id={`${id}-glow`} stops={[[0, glow, glowOpacity], [0.35, glow, glowOpacity * 0.35], [1, glow, 0]]} />
      <RGrad id={`${id}-disc`} cx={0.42} cy={0.4} r={0.6} stops={[[0, core], [0.75, edge], [1, edge, 0.9]]} />
    </defs>
    <circle cx={x} cy={y} r={r * glowR} fill={`url(#${id}-glow)`} className="sx-breathe" />
    <circle cx={x} cy={y} r={r} fill={`url(#${id}-disc)`} />
  </g>
);

/** A flickering flame tongue rooted at (x, base). */
function flamePath(x: number, base: number, w: number, h: number, lean = 0): string {
  // Teardrop with a curling tip: round belly, narrow neck.
  return `M${x - w / 2} ${base} C${x - w * 0.62} ${base - h * 0.35} ${x - w * 0.28} ${base - h * 0.55} ${x - w * 0.1 + lean * 0.5} ${base - h * 0.78} C${x + lean * 0.8} ${base - h * 0.9} ${x + lean * 0.6} ${base - h * 0.96} ${x + lean} ${base - h} C${x + w * 0.3 + lean * 0.6} ${base - h * 0.72} ${x + w * 0.62} ${base - h * 0.42} ${x + w / 2} ${base} Z`;
}

const FlameWall: React.FC<{ id: string; base: number; colors: [string, string, string]; height?: number; count?: number; seed: string }> = ({
  id,
  base,
  colors,
  height = 220,
  count = 22,
  seed,
}) => {
  const r = rng(hash(seed + 'flames'));
  return (
    <g style={{ filter: `drop-shadow(0 0 18px ${colors[1]})` }}>
      <defs>
        <VGrad id={`${id}-flame`} stops={[[0, colors[2], 0], [0.45, colors[1], 0.85], [1, colors[0], 0.95]]} />
      </defs>
      <rect x="-20" y={base - height * 0.35} width="1660" height={height * 0.4} fill={colors[1]} opacity="0.25" style={{ filter: 'blur(30px)' }} />
      {Array.from({ length: count }, (_, i) => {
        const x = (i / (count - 1)) * 1640 - 20 + (r() - 0.5) * 40;
        const h = height * (0.35 + r() * 0.65);
        return (
          <path
            key={i}
            d={flamePath(x, base + 10, 70 + r() * 80, h, (r() - 0.5) * 60)}
            fill={`url(#${id}-flame)`}
            className="sx-flicker"
            style={{ transformOrigin: `${x}px ${base}px`, animationDelay: `${-r() * 2}s`, animationDuration: `${1.2 + r() * 1.4}s`, opacity: 0.55 + r() * 0.4 }}
          />
        );
      })}
    </g>
  );
};

/** Sweeping spotlight cone from (x, y). */
const Spot: React.FC<{ x: number; y: number; color: string; length?: number; width?: number; delay?: number; duration?: number; opacity?: number; from?: number; to?: number }> = ({
  x,
  y,
  color,
  length = 950,
  width = 260,
  delay = 0,
  duration = 9,
  opacity = 0.22,
  from = -18,
  to = 18,
}) => (
  <g
    className="sx-sweep"
    style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${delay}s`, animationDuration: `${duration}s`, ['--from' as string]: `${from}deg`, ['--to' as string]: `${to}deg` } as React.CSSProperties}
  >
    <path d={`M${x} ${y} L${x - width / 2} ${y + length} L${x + width / 2} ${y + length} Z`} fill={color} opacity={opacity} style={{ filter: 'blur(10px)' }} />
  </g>
);

/** Falling rain: a tiled sheet of streaks, slanted, moving exactly one tile per loop. */
function rainTile(seed: string, w: number, h: number, n: number, len: [number, number], width: number, color: string): string {
  const r = rng(hash(seed + 'rain'));
  const lines = Array.from({ length: n }, () => {
    const x = (r() * w).toFixed(1);
    const y = (r() * h).toFixed(1);
    const l = (len[0] + r() * (len[1] - len[0])).toFixed(1);
    const o = (0.25 + r() * 0.6).toFixed(2);
    return `<line x1='${x}' y1='${y}' x2='${x}' y2='${(Number(y) + Number(l)).toFixed(1)}' stroke='${color}' stroke-opacity='${o}' stroke-width='${width}' stroke-linecap='round'/>`;
  });
  // Draw each streak again one tile higher so streaks crossing the bottom edge wrap cleanly.
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${lines.join('')}<g transform='translate(0 -${h})'>${lines.join('')}</g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

const Rain: React.FC<{ seed: string; color?: string; near?: boolean; angle?: number }> = ({ seed, color = '#c8d6ff', near, angle = 12 }) => {
  const tileH = near ? 360 : 240;
  const bg = useMemo(
    () => rainTile(seed + (near ? 'n' : 'f'), near ? 260 : 180, tileH, near ? 14 : 22, near ? [26, 46] : [12, 24], near ? 1.6 : 1, color),
    [seed, near, color, tileH]
  );
  return (
    <div className="sx-rainwrap" style={{ transform: `rotate(${angle}deg)` }}>
      <div className={`sx-rain2 ${near ? 'sx-rain2--near' : ''}`} style={{ backgroundImage: bg, ['--tile' as string]: `${tileH}px` } as React.CSSProperties} />
    </div>
  );
};

/** Little splash rings where rain lands (inside a Stage). */
const Splashes: React.FC<{ seed: string; y: [number, number]; x?: [number, number]; count?: number; color?: string }> = ({ seed, y, x = [260, 1600], count = 26, color = '#d6e2ff' }) => {
  const r = rng(hash(seed + 'splash'));
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <ellipse
          key={i}
          cx={x[0] + r() * (x[1] - x[0])}
          cy={y[0] + r() * (y[1] - y[0])}
          rx={7 + r() * 6}
          ry={1.6 + r() * 1.2}
          fill="none"
          stroke={color}
          strokeWidth="1.2"
          className="sx-splash"
          style={{ animationDelay: `${-r() * 1.4}s`, animationDuration: `${0.9 + r() * 0.7}s` }}
        />
      ))}
    </g>
  );
};

/** Film grain + soft light falloff shared by every scene. */
const Atmos: React.FC<{ light?: boolean }> = ({ light }) => <div className={`sx-grain ${light ? 'sx-grain--light' : ''}`} />;

/* ------------------------------------------------------------------ */
/* Scenes                                                              */
/* ------------------------------------------------------------------ */
function sceneFor(t: ThemeDefinition): React.ReactNode {
  const c = t.colors;
  const glyph = HERO_GLYPH[t.motif] ?? 'sparkle';
  const id = t.id;
  const u = (name: string) => `url(#${id}-${name})`;

  switch (id) {
    /* Miyabi: moonlit snow peaks, aurora, a shrine gate on the ridge */
    case 'frostblade':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#050a18'], [0.55, '#0b1a36'], [1, '#12305a']]} />
              <VGrad id={`${id}-far`} stops={[[0, '#6f9fd6', 0.55], [1, '#1c3560', 0.6]]} />
              <VGrad id={`${id}-mid`} stops={[[0, '#2b4f86'], [1, '#0f2142']]} />
              <VGrad id={`${id}-near`} stops={[[0, '#0d1b33'], [1, '#060c18']]} />
              <VGrad id={`${id}-aur1`} x2={1} y2={0} stops={[[0, c.primary, 0], [0.3, '#7ff5d6', 0.55], [0.6, c.primary, 0.5], [1, '#b49cff', 0]]} />
              <VGrad id={`${id}-aur2`} x2={1} y2={0} stops={[[0, '#b49cff', 0], [0.4, c.secondary, 0.45], [0.75, '#7ff5d6', 0.35], [1, c.primary, 0]]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Stars seed={id} count={120} maxY={480} />
            <g className="sx-aurora">
              <path d="M200 260 C520 120 820 330 1120 170 S1500 120 1700 210 L1700 300 C1460 230 1300 330 1100 280 S640 260 200 340 Z" fill={u('aur1')} style={{ filter: 'blur(14px)' }} />
            </g>
            <g className="sx-aurora sx-aurora--b">
              <path d="M400 200 C700 80 1000 240 1300 120 S1600 90 1750 140 L1750 200 C1500 170 1350 240 1150 210 S700 190 400 260 Z" fill={u('aur2')} style={{ filter: 'blur(18px)' }} />
            </g>
            <Orb id={`${id}-moon`} x={1290} y={230} r={58} core="#ffffff" edge="#cfe6ff" glow="#9fd4ff" glowOpacity={0.35} />
            <path d={peaks(id + 'far', 640, 260, 5)} fill={u('far')} />
            <path d={peaks(id + 'far', 640, 260, 5)} fill="none" stroke="#e8f6ff" strokeOpacity="0.3" strokeWidth="2" />
            <Clouds seed={id + 'fog1'} y={600} h={40} fill="#cfe8ff" opacity={0.08} speed={140} />
            <path d={peaks(id + 'mid', 740, 170, 7)} fill={u('mid')} />
            <g transform="translate(1180 712) scale(0.8)" fill="#0a1426">
              {/* shrine gate */}
              <path d="M-70 0 L-62 -96 L62 -96 L70 0 L60 0 L52 -82 L-52 -82 L-60 0 Z M-92 -104 Q0 -122 92 -104 L96 -94 Q0 -110 -96 -94 Z M-76 -78 L76 -78 L76 -70 L-76 -70 Z" />
            </g>
            <Clouds seed={id + 'fog2'} y={700} h={50} fill="#bfdcff" opacity={0.1} speed={90} reverse />
            <path d={peaks(id + 'near', 860, 90, 9)} fill={u('near')} />
          </Stage>
          <Particles glyph="snow" count={22} colors={['#ffffff', '#cfe8ff']} motion="fall" size={[5, 9]} speed={[22, 36]} opacity={[0.35, 0.7]} seed={id + 'far'} />
          <Particles glyph="snow" count={14} colors={['#ffffff', c.primary]} motion="fall" size={[12, 22]} speed={[12, 20]} seed={id} />
        </>
      );

    /* Ellen: under the surface, light shafts, kelp, a shark gliding past */
    case 'riptide':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sea`} stops={[[0, '#1a5f7a'], [0.35, '#0d3550'], [0.8, '#071a2a'], [1, '#040d16']]} />
              <VGrad id={`${id}-sand`} stops={[[0, '#2a3e4a'], [1, '#0b161e']]} />
              <VGrad id={`${id}-surf`} stops={[[0, '#bdf3ff', 0.6], [1, '#bdf3ff', 0]]} />
            </defs>
            <rect width="1600" height="900" fill={u('sea')} />
            <g className="sx-wave-x">
              <path d={`${wavePath(40, 14, 220).replace(/L3200 400 L0 400 Z$/, 'L3200 0 L0 0 Z')}`} fill={u('surf')} opacity="0.5" />
            </g>
            <g style={{ filter: 'blur(12px)' }}>
              <Rays x={1150} y={-60} color="#d9fbff" count={9} spread={50} angle={100} length={1050} opacity={0.07} width={60} />
            </g>
            {/* shark, swimming right to left */}
            <g className="sx-swim">
              <g transform="translate(0 360)" fill="#05121c" opacity="0.75">
                <path d="M0 40 C60 10 160 0 240 22 C270 8 300 -26 312 -40 C310 -14 304 6 300 26 C330 30 360 36 386 30 C376 44 360 50 338 52 C360 66 388 92 400 112 C366 98 336 78 312 66 C260 84 170 86 92 70 C70 86 40 92 22 92 C36 76 44 66 48 58 C30 54 12 48 0 40 Z" />
                <path d="M130 30 C150 0 170 -34 176 -52 C186 -28 192 0 190 26 Z" />
              </g>
            </g>
            {[260, 1420, 1500].map((x, i) => (
              <g key={x} className="sx-sway" style={{ transformOrigin: `${x}px 900px`, animationDelay: `${-i * 1.6}s` }}>
                <path d={`M${x} 900 C${x - 30} 780 ${x + 40} 700 ${x} ${600 - i * 40} C${x + 20} 700 ${x - 10} 790 ${x + 18} 900 Z`} fill="#0d4a3e" opacity={0.6 - i * 0.1} />
                <path d={`M${x + 30} 900 C${x + 10} 820 ${x + 60} 760 ${x + 40} ${680 - i * 30} C${x + 60} 760 ${x + 30} 830 ${x + 46} 900 Z`} fill="#0f5c4a" opacity={0.5} />
              </g>
            ))}
            <path d={hills(id + 'sand', 840, 50, 4)} fill={u('sand')} />
          </Stage>
          <Particles glyph="bubble" count={20} colors={['#ffffff', '#bdf3ff']} motion="rise" size={[6, 16]} speed={[10, 20]} opacity={[0.25, 0.6]} seed={id} />
          <Particles glyph="dot" count={26} colors={['#d9fbff']} motion="drift" size={[2, 5]} speed={[30, 50]} opacity={[0.15, 0.4]} seed={id + 'dust'} />
        </>
      );

    /* Burnice: retro sunset highway, a wall of fire, rising embers */
    case 'ember-rush':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#150c10'], [0.45, '#4a1a12'], [0.72, '#a3401a'], [1, '#2a120a']]} />
              <VGrad id={`${id}-sun`} stops={[[0, '#ffe27a'], [0.6, '#ff8a1f'], [1, '#ff3d1f']]} />
              <VGrad id={`${id}-mesa`} stops={[[0, '#3a160d'], [1, '#160a06']]} />
              <VGrad id={`${id}-road`} stops={[[0, '#1d0f09'], [1, '#0d0705']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <circle cx="1180" cy="560" r="300" fill="#ff7a1a" opacity="0.18" style={{ filter: 'blur(40px)' }} className="sx-breathe" />
            <g>
              <clipPath id={`${id}-sunclip`}>
                <rect x="900" y="300" width="560" height="300" />
              </clipPath>
              <circle cx="1180" cy="560" r="210" fill={u('sun')} clipPath={`url(#${id}-sunclip)`} />
              {[440, 478, 512, 542, 568, 590].map((y, i) => (
                <rect key={y} x="960" y={y} width="440" height={4 + i * 2.2} fill="#4a1a12" />
              ))}
            </g>
            <path d="M-20 900 L-20 610 L120 610 L150 560 L330 560 L360 610 L620 610 L640 585 L760 585 L790 610 L1640 610 L1640 900 Z" fill={u('mesa')} />
            <path d="M1300 610 L1340 540 L1470 540 L1500 610 Z" fill="#2a110a" />
            <path d="M560 900 L1150 610 L1210 610 L1520 900 Z" fill={u('road')} />
            <path d="M1180 612 L1180 900" stroke="#ffd166" strokeWidth="5" strokeDasharray="26 34" className="sx-road" opacity="0.8" />
            <g className="sx-depart" style={{ transformOrigin: '1180px 612px' }}>
              <circle cx="1180" cy="612" r="5" fill="#ff3d1f" style={{ filter: 'drop-shadow(0 0 8px #ff3d1f)' }} />
            </g>
            <FlameWall id={id} base={900} colors={['#ffe066', '#ff7a1a', '#ff3d1f']} height={240} seed={id} />
          </Stage>
          <div className="sx-haze" />
          <Particles glyph="flame" count={24} colors={['#ffd166', '#ff7a1a', '#ff3d1f']} motion="rise" size={[4, 11]} speed={[7, 14]} seed={id} />
        </>
      );

    /* Jane Doe: neon skyline, searchlights, a laser security grid */
    case 'velvet-heist':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#0c0714'], [0.6, '#2a0f3c'], [1, '#4a1450']]} />
              <VGrad id={`${id}-far`} stops={[[0, '#3a1a52'], [1, '#1e0c2c']]} />
              <VGrad id={`${id}-near`} stops={[[0, '#140a1c'], [1, '#07040b']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Stars seed={id} count={60} maxY={380} />
            <path d="M1290 150 a70 70 0 1 0 60 106 a58 58 0 1 1 -60 -106 Z" fill="#ffe9f6" opacity="0.85" />
            <Spot x={900} y={900} color={c.secondary} length={-900} width={240} duration={11} from={-22} to={14} />
            <Spot x={1380} y={900} color={c.accent} length={-900} width={200} duration={13} delay={-4} from={12} to={-20} />
            <path d={city(id + 'far', 640, 120, 380, 0.4)} fill={u('far')} />
            <CityLights seed={id + 'far'} base={640} height={360} colors={[c.secondary, '#c8a2ff', '#ffd166']} count={110} size={4} />
            <path d={city(id + 'near', 800, 60, 240, 0.15)} fill={u('near')} />
            <CityLights seed={id + 'near'} base={800} height={220} colors={[c.accent, c.secondary]} count={50} size={6} />
            {/* rooftop water tower */}
            <g transform="translate(1380 560)" fill="#07040b">
              <path d="M-50 0 L-46 -96 Q0 -116 46 -96 L50 0 Z M-44 0 L-60 120 L-52 120 L-36 0 Z M44 0 L60 120 L52 120 L36 0 Z M-40 50 L40 50 L40 56 L-40 56 Z" />
            </g>
            {/* neon sign */}
            <g transform="translate(1040 470)" className="sx-neon">
              <rect x="-36" y="-28" width="72" height="56" rx="10" fill="none" stroke={c.secondary} strokeWidth="4" style={{ filter: `drop-shadow(0 0 8px ${c.secondary})` }} />
              <path d="M0 -16 L18 -3 L0 17 L-18 -3 Z M-18 -3 L18 -3 M-8 -3 L0 17 L8 -3 M-8 -3 L0 -16 L8 -3" stroke={c.accent} strokeWidth="3" fill="none" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${c.accent})` }} />
            </g>
            <Splashes seed={id} y={[812, 890]} color="#f0d8ff" />
            <g className="sx-laser">
              {[0, 1, 2, 3, 4].map((i) => (
                <line key={i} x1={300 + i * 260} y1="900" x2={700 + i * 230} y2="420" stroke="#ff3d7f" strokeWidth="2" opacity="0.5" style={{ filter: 'drop-shadow(0 0 6px #ff3d7f)' }} />
              ))}
            </g>
          </Stage>
          <Rain seed={id} color="#e6d4ff" />
          <Rain seed={id} color="#f3e8ff" near />
          <Particles glyph="gem" count={6} colors={[c.accent, '#ffffff', c.secondary]} motion="drift" size={[10, 16]} speed={[20, 34]} opacity={[0.3, 0.7]} seed={id} />
        </>
      );

    /* Astra Yao: concert stage, sweeping spotlights, a sea of light sticks */
    case 'starlight-encore':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#fff6fa'], [0.6, '#fbe3ee'], [1, '#f3cfe0']]} />
              <RGrad id={`${id}-floor`} cy={0.5} stops={[[0, '#ffd36b', 0.7], [0.5, c.secondary, 0.25], [1, c.secondary, 0]]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Spot x={700} y={60} color={c.primary} length={900} width={320} duration={8} from={-24} to={20} opacity={0.18} />
            <Spot x={1050} y={60} color="#ffcf5a" length={900} width={300} duration={10} delay={-3} from={20} to={-18} opacity={0.24} />
            <Spot x={1400} y={60} color={c.accent} length={900} width={300} duration={9} delay={-6} from={-16} to={22} opacity={0.16} />
            <rect x="260" y="40" width="1400" height="18" fill="#2a1622" opacity="0.75" />
            {[460, 700, 940, 1180, 1420].map((x) => (
              <g key={x} fill="#2a1622" opacity="0.85">
                <rect x={x - 14} y="56" width="28" height="24" rx="4" />
                <circle cx={x} cy="84" r="8" fill="#fff4c7" />
              </g>
            ))}
            <ellipse cx="1100" cy="780" rx="560" ry="90" fill={u('floor')} className="sx-breathe" />
            {/* crowd */}
            <path d={hills(id + 'crowd', 830, 40, 26)} fill="#2a1622" opacity="0.9" />
            <g>
              {Array.from({ length: 34 }, (_, i) => {
                const x = 140 + i * 44 + (i % 3) * 7;
                return (
                  <g key={i} className="sx-wave-stick" style={{ transformOrigin: `${x}px 820px`, animationDelay: `${-(i % 7) * 0.35}s` }}>
                    <line x1={x} y1="820" x2={x + 6} y2="760" stroke={[c.primary, '#ffcf5a', c.accent][i % 3]} strokeWidth="5" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${[c.primary, '#ffcf5a', c.accent][i % 3]})` }} />
                  </g>
                );
              })}
            </g>
          </Stage>
          <Particles glyph="sparkle" count={20} colors={['#ffcf5a', c.primary, c.accent]} motion="fall" size={[6, 14]} speed={[10, 18]} seed={id + 's'} />
          <Particles glyph="note" count={10} colors={[c.primary, c.accent]} motion="rise" size={[12, 20]} speed={[14, 24]} opacity={[0.3, 0.6]} seed={id} />
        </>
      );

    /* Yanagi: storm clouds over the moon, a blossoming branch, lightning */
    case 'sakura-storm':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#0b0816'], [0.55, '#21143e'], [1, '#3a1f52']]} />
              <VGrad id={`${id}-hill1`} stops={[[0, '#3b2463'], [1, '#1d1236']]} />
              <VGrad id={`${id}-hill2`} stops={[[0, '#1b1030'], [1, '#0b0716']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Stars seed={id} count={70} maxY={420} />
            <Orb id={`${id}-moon`} x={1220} y={260} r={95} core="#fff6fb" edge="#ffd2e6" glow={c.secondary} glowOpacity={0.3} />
            <Clouds seed={id + 'c1'} y={190} h={60} fill="#3a2a5c" opacity={0.55} speed={120} blur={8} />
            <Clouds seed={id + 'c2'} y={330} h={46} fill="#2a1c48" opacity={0.6} speed={90} reverse blur={6} />
            <g className="sx-bolt">
              <path d="M900 120 L860 260 L905 255 L850 420 L960 230 L912 236 L955 120 Z" fill="#f2e9ff" style={{ filter: 'drop-shadow(0 0 12px #c9a8ff)' }} />
            </g>
            <path d={hills(id + 'h1', 640, 120, 4)} fill={u('hill1')} />
            <path d={hills(id + 'h2', 760, 90, 5)} fill={u('hill2')} />
            {/* blossoming branch from the top right corner */}
            <g className="sx-sway sx-sway--slow" style={{ transformOrigin: '1640px 0px' }}>
              <path d="M1640 40 C1500 70 1420 120 1330 210 C1300 240 1260 260 1210 270 M1450 100 C1420 60 1390 40 1350 30 M1360 180 C1380 230 1380 270 1360 310 M1520 70 C1520 130 1540 170 1570 200" stroke="#3a2450" strokeWidth="14" strokeLinecap="round" fill="none" />
              {Array.from({ length: 46 }, (_, i) => {
                const r = rng(hash(id + 'bloom' + i));
                const pts = [
                  [1640 - i * 9, 40 + i * 4.8],
                  [1450 - r() * 100, 40 + r() * 70],
                  [1360 + r() * 20, 180 + r() * 130],
                  [1520 + r() * 50, 70 + r() * 130],
                ];
                const [x, y] = pts[i % 4];
                return <circle key={i} cx={x + (r() - 0.5) * 30} cy={y + (r() - 0.5) * 24} r={6 + r() * 7} fill={['#ffb3cf', '#ff8fb7', '#ffd6e6'][i % 3]} opacity={0.75 + r() * 0.25} />;
              })}
            </g>
          </Stage>
          <div className="sx-flash" />
          <Particles glyph="petal" count={18} colors={['#ffc4dd', c.secondary]} motion="drift" size={[6, 10]} speed={[18, 30]} opacity={[0.35, 0.65]} seed={id + 'far'} />
          <Particles glyph="petal" count={14} colors={['#ffc4dd', c.secondary, '#ffffff']} motion="drift" size={[12, 18]} speed={[10, 18]} seed={id} />
        </>
      );

    /* Zhu Yuan: rain over the city, wet street glow, patrol lights and a helicopter beam */
    case 'night-patrol':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#07070b'], [0.6, '#141826'], [1, '#1e2232']]} />
              <VGrad id={`${id}-far`} stops={[[0, '#1d2333'], [1, '#121520']]} />
              <VGrad id={`${id}-near`} stops={[[0, '#0b0c12'], [1, '#050507']]} />
              <VGrad id={`${id}-street`} stops={[[0, '#141724'], [1, '#07080c']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Spot x={1250} y={-40} color="#e9f0ff" length={900} width={180} duration={10} from={-26} to={10} opacity={0.12} />
            <path d={city(id + 'far', 640, 160, 420, 0.25)} fill={u('far')} />
            <CityLights seed={id + 'far'} base={640} height={400} colors={['#ffd27a', '#9fb8ff']} count={120} />
            <path d={city(id + 'near', 760, 80, 260, 0.1)} fill={u('near')} />
            <CityLights seed={id + 'near'} base={760} height={240} colors={['#ffd27a']} count={40} size={6} />
            <rect x="-20" y="760" width="1660" height="160" fill={u('street')} />
            {/* reflections on the wet street */}
            <g opacity="0.5" style={{ filter: 'blur(6px)' }}>
              <rect x="980" y="770" width="16" height="110" fill={c.primary} className="sx-siren-r" />
              <rect x="1040" y="770" width="16" height="110" fill="#3d7bff" className="sx-siren-b" />
              <rect x="600" y="772" width="8" height="90" fill="#ffd27a" opacity="0.6" />
              <rect x="1320" y="772" width="8" height="90" fill="#ffd27a" opacity="0.5" />
            </g>
            <Splashes seed={id} y={[790, 890]} />
            <circle cx="1000" cy="740" r="140" fill={c.primary} className="sx-siren-r" style={{ filter: 'blur(50px)' }} />
            <circle cx="1060" cy="740" r="140" fill="#3d7bff" className="sx-siren-b" style={{ filter: 'blur(50px)' }} />
          </Stage>
          <Rain seed={id} />
          <Rain seed={id} near />
        </>
      );

    /* Vivian: a glowing rose window, light through the nave, thorned roses */
    case 'rose-requiem':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#0c0710'], [0.6, '#1d0f22'], [1, '#2a1230']]} />
              <RGrad id={`${id}-glass`} stops={[[0, '#ffe2f2'], [0.35, c.accent, 0.95], [0.7, c.primary, 0.9], [1, '#4a1c4a', 0.9]]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Rays x={1180} y={300} color={c.accent} count={8} spread={60} angle={115} length={900} opacity={0.1} width={60} />
            <g transform="translate(1180 300)">
              <circle r="200" fill="#09050c" />
              <circle r="176" fill={u('glass')} className="sx-breathe" />
              {Array.from({ length: 12 }, (_, i) => (
                <g key={i} transform={`rotate(${i * 30})`}>
                  <path d="M0 -20 Q22 -90 0 -172 Q-22 -90 0 -20 Z" fill="none" stroke="#09050c" strokeWidth="9" />
                  <circle cy="-140" r="20" fill="none" stroke="#09050c" strokeWidth="7" />
                </g>
              ))}
              <circle r="34" fill="#09050c" />
              <circle r="20" fill={c.accent} opacity="0.8" />
              <circle r="176" fill="none" stroke="#09050c" strokeWidth="10" />
            </g>
            {/* nave pillars */}
            {[1500, 760].map((x, i) => (
              <path key={x} d={`M${x} 900 L${x} 300 Q${x} 160 ${x + 90} 110 Q${x + 180} 160 ${x + 180} 300 L${x + 180} 900 L${x + 150} 900 L${x + 150} 310 Q${x + 150} 190 ${x + 90} 150 Q${x + 30} 190 ${x + 30} 310 L${x + 30} 900 Z`} fill="#07040a" opacity={0.85 - i * 0.2} />
            ))}
            {/* thorned rose vines */}
            {[
              ['M1640 900 C1520 800 1560 700 1460 640 C1400 600 1360 640 1330 600', 1330, 600],
              ['M260 900 C340 820 300 740 400 700 C460 676 480 700 520 660', 520, 660],
            ].map(([d, x, y], i) => (
              <g key={i}>
                <path d={d as string} stroke="#12070f" strokeWidth="8" fill="none" strokeLinecap="round" />
                <g transform={`translate(${x} ${y})`}>
                  {[0, 72, 144, 216, 288].map((a) => (
                    <ellipse key={a} rx="16" ry="26" transform={`rotate(${a}) translate(0 -14)`} fill={c.primary} opacity="0.9" />
                  ))}
                  <circle r="12" fill="#5c1a3e" />
                </g>
              </g>
            ))}
          </Stage>
          <div className="sx-mist" />
          <Particles glyph="rose" count={10} colors={[c.primary, c.accent]} motion="fall" size={[10, 16]} speed={[18, 30]} opacity={[0.3, 0.6]} seed={id} />
          <Particles glyph="feather" count={6} colors={['#ffffff', c.secondary]} motion="fall" size={[14, 22]} speed={[22, 36]} opacity={[0.2, 0.45]} seed={id + 'f'} />
        </>
      );

    /* Yi Xuan: ink-wash mountains in mist, a red seal sun, cranes overhead */
    case 'ink-seal':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-paper`} stops={[[0, '#f7f3ea'], [1, '#ece5d6']]} />
              <VGrad id={`${id}-m1`} stops={[[0, '#9a958d', 0.55], [1, '#9a958d', 0]]} />
              <VGrad id={`${id}-m2`} stops={[[0, '#5c5852', 0.7], [1, '#5c5852', 0.05]]} />
              <VGrad id={`${id}-m3`} stops={[[0, '#26232a', 0.85], [1, '#26232a', 0.2]]} />
            </defs>
            <rect width="1600" height="900" fill={u('paper')} />
            <circle cx="1230" cy="250" r="78" fill={c.primary} opacity="0.85" />
            <path d={peaks(id + 'm1', 560, 300, 4)} fill={u('m1')} style={{ filter: 'blur(3px)' }} />
            <Clouds seed={id + 'mist1'} y={480} h={40} fill="#f7f3ea" opacity={0.85} speed={160} blur={10} />
            <path d={peaks(id + 'm2', 700, 220, 6)} fill={u('m2')} style={{ filter: 'blur(1.5px)' }} />
            <Clouds seed={id + 'mist2'} y={630} h={44} fill="#f7f3ea" opacity={0.8} speed={110} reverse blur={10} />
            <path d="M1640 900 L1640 600 C1560 610 1500 650 1460 700 C1420 740 1360 760 1300 900 Z" fill={u('m3')} />
            {/* cranes */}
            <g className="sx-fly">
              {[0, 1, 2].map((i) => (
                <path key={i} transform={`translate(${i * 60} ${i * 22})`} d="M0 0 Q18 -14 34 -4 Q50 -16 70 -8 Q50 -6 36 4 Q20 -4 0 0 Z" fill="#26232a" opacity="0.75" />
              ))}
            </g>
          </Stage>
          <Particles glyph="cloud" count={4} colors={['#26232a']} motion="drift" size={[70, 120]} speed={[60, 90]} opacity={[0.04, 0.08]} seed={id} />
        </>
      );

    /* Qingyi: bamboo grove in layers, a round moon gate, fireflies */
    case 'jade-garden':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#0d2a1e'], [0.6, '#0a1a12'], [1, '#050d09']]} />
              <VGrad id={`${id}-b1`} x2={1} y2={0} stops={[[0, '#2f7a52', 0.35], [1, '#4fa36f', 0.35]]} />
              <VGrad id={`${id}-b2`} x2={1} y2={0} stops={[[0, '#1d5a3a', 0.8], [1, '#2f7a52', 0.8]]} />
              <VGrad id={`${id}-b3`} x2={1} y2={0} stops={[[0, '#081a10'], [1, '#0f2a1a']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Rays x={1500} y={-80} color="#d9ffb0" count={8} spread={40} angle={118} length={1100} opacity={0.08} width={80} />
            {/* moon gate */}
            <g transform="translate(1100 560)">
              <path d="M-300 340 L-300 -200 L300 -200 L300 340 Z M0 -160 A170 170 0 1 0 0.1 -160 Z" fill="#071209" fillRule="evenodd" opacity="0.7" />
              <path d="M-330 -200 L330 -200 L310 -230 L-310 -230 Z" fill="#071209" opacity="0.8" />
            </g>
            {[
              { id: 'b1', n: 14, w: 14, op: 1 },
              { id: 'b2', n: 9, w: 24, op: 1 },
              { id: 'b3', n: 5, w: 44, op: 1 },
            ].map((layer, li) => {
              const r = rng(hash(id + layer.id));
              return (
                <g key={layer.id} className="sx-sway sx-sway--slow" style={{ transformOrigin: '800px 900px', animationDelay: `${-li * 2}s` }}>
                  {Array.from({ length: layer.n }, (_, i) => {
                    const x = (li === 2 ? [180, 300, 1380, 1500, 1570] : [])[i] ?? 260 + r() * 1360;
                    return (
                      <g key={i} fill={u(layer.id)}>
                        <rect x={x} y="-20" width={layer.w} height="940" rx={layer.w / 3} />
                        {[120, 300, 480, 660, 840].map((y) => (
                          <rect key={y} x={x - 2} y={y + r() * 60} width={layer.w + 4} height={4 + layer.w / 8} rx="2" opacity="0.9" />
                        ))}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            <Clouds seed={id + 'mist'} y={720} h={60} fill="#cff5dc" opacity={0.07} speed={120} blur={12} />
          </Stage>
          <Particles glyph="dot" count={22} colors={['#e9ff9a', '#b8f27a']} motion="drift" size={[4, 8]} speed={[20, 34]} opacity={[0.4, 0.9]} seed={id + 'fly'} />
          <Particles glyph="leaf" count={12} colors={[c.primary, c.secondary]} motion="drift" size={[10, 16]} speed={[16, 26]} seed={id} />
        </>
      );

    /* Lycaon: full moon over a manor, clouds crossing, an iron fence */
    case 'silver-fang':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#060608'], [0.6, '#15161b'], [1, '#202229']]} />
              <VGrad id={`${id}-manor`} stops={[[0, '#121318'], [1, '#08080b']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Stars seed={id} count={80} maxY={420} color="#e9e9ee" />
            <Orb id={`${id}-moon`} x={1200} y={260} r={120} core="#ffffff" edge="#cfd2da" glow="#ffffff" glowOpacity={0.22} />
            <Clouds seed={id + 'c1'} y={250} h={50} fill="#2b2d35" opacity={0.75} speed={150} blur={7} />
            <Clouds seed={id + 'c2'} y={380} h={40} fill="#1c1d23" opacity={0.7} speed={100} reverse blur={5} />
            {/* manor */}
            <path d="M700 900 L700 560 L820 470 L940 560 L940 520 L1100 400 L1260 520 L1260 560 L1380 470 L1500 560 L1500 900 Z" fill={u('manor')} />
            {[760, 860, 1000, 1060, 1140, 1200, 1300, 1420].map((x, i) => (
              <rect key={x} x={x} y={i % 2 ? 640 : 600} width="22" height="46" rx="11" fill="#ffd9a0" opacity={0.25 + (i % 3) * 0.12} className={i % 3 === 0 ? 'sx-twinkle' : undefined} />
            ))}
            {/* iron fence */}
            <g fill="#050506">
              <rect x="-20" y="800" width="1660" height="10" />
              <rect x="-20" y="860" width="1660" height="10" />
              {Array.from({ length: 52 }, (_, i) => (
                <path key={i} d={`M${i * 32 - 10} 900 L${i * 32 - 10} 770 L${i * 32 - 16} 770 L${i * 32 - 6} 748 L${i * 32 + 4} 770 L${i * 32 - 2} 770 L${i * 32 - 2} 900 Z`} />
              ))}
            </g>
          </Stage>
          <Particles glyph="dot" count={26} colors={['#ffffff']} motion="drift" size={[3, 6]} speed={[26, 44]} opacity={[0.2, 0.5]} seed={id + 'd'} />
          <Particles glyph="paw" count={4} colors={['#ffffff', c.accent]} motion="drift" size={[12, 16]} speed={[26, 38]} opacity={[0.12, 0.3]} seed={id} />
        </>
      );

    /* Harumasa: clouds racing over rooftops, gusts and loosed arrows */
    case 'gale-fletcher':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#04100f'], [0.55, '#0b2f2c'], [1, '#14524a']]} />
              <VGrad id={`${id}-roof`} stops={[[0, '#082220'], [1, '#030b0a']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Stars seed={id} count={50} maxY={300} />
            <Clouds seed={id + 'c1'} y={180} h={50} fill="#1d6a60" opacity={0.35} speed={60} blur={8} />
            <Clouds seed={id + 'c2'} y={330} h={60} fill="#2a8a7c" opacity={0.25} speed={40} blur={10} />
            <Clouds seed={id + 'c3'} y={480} h={50} fill="#0f3d38" opacity={0.6} speed={28} blur={6} />
            {/* tiled rooftops */}
            {[
              [300, 700, 260],
              [900, 640, 300],
              [1380, 680, 280],
            ].map(([x, y, w], i) => (
              <g key={i} fill={u('roof')}>
                <path d={`M${x - w} ${y + 30} Q${x - w / 2} ${y + 10} ${x} ${y - 50} Q${x + w / 2} ${y + 10} ${x + w} ${y + 30} L${x + w - 30} ${y + 40} L${x - w + 30} ${y + 40} Z`} />
                <rect x={x - w + 40} y={y + 40} width={w * 2 - 80} height={900 - y} />
              </g>
            ))}
            <path d={hills(id + 'g', 860, 40, 6)} fill="#020807" />
          </Stage>
          <div className="scene-wind">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} style={{ top: `${6 + i * 9}%`, animationDelay: `${-i * 1.1}s`, animationDuration: `${2.8 + (i % 3)}s`, background: `linear-gradient(90deg, transparent, ${i % 2 ? c.secondary : '#ffffff'}, transparent)` }} />
            ))}
          </div>
          <Particles glyph="arrow" count={6} colors={[c.accent, c.primary]} motion="drift" size={[16, 24]} speed={[6, 11]} opacity={[0.4, 0.8]} seed={id} />
          <Particles glyph="feather" count={10} colors={['#ffffff', c.primary]} motion="drift" size={[10, 18]} speed={[12, 22]} opacity={[0.25, 0.55]} seed={id + 'f'} />
        </>
      );

    /* Koleda: a site at dusk, tower cranes, floodlights, welding sparks */
    case 'hard-hat':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#0e0c08'], [0.55, '#3a2410'], [1, '#7a4a14']]} />
              <VGrad id={`${id}-bld`} stops={[[0, '#1c160b'], [1, '#0b0905']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Stars seed={id} count={40} maxY={260} />
            <circle cx="1000" cy="720" r="320" fill="#ff9124" opacity="0.14" style={{ filter: 'blur(50px)' }} />
            {/* building under construction */}
            <g fill={u('bld')}>
              <rect x="820" y="330" width="380" height="570" />
            </g>
            <g stroke="#0b0905" strokeWidth="6" fill="none">
              {[400, 470, 540, 610, 680, 750, 820].map((y) => (
                <line key={y} x1="820" y1={y} x2="1200" y2={y} />
              ))}
            </g>
            <g fill="#ffcf5a">
              {[[880, 420], [1020, 560], [1120, 490], [940, 700], [1080, 770]].map(([x, y], i) => (
                <rect key={i} x={x} y={y} width="40" height="34" opacity={0.25 + (i % 3) * 0.15} className={i === 1 ? 'sx-twinkle' : undefined} />
              ))}
            </g>
            {/* tower cranes */}
            {[
              { x: 1340, top: 130, jib: -520, counter: 160 },
              { x: 560, top: 240, jib: 360, counter: -120 },
            ].map((k, i) => (
              <g key={i} fill="#0b0905" stroke="#0b0905">
                <rect x={k.x - 12} y={k.top} width="24" height={900 - k.top} />
                <path d={`M${k.x - 12} ${k.top} L${k.x} ${k.top - 60} L${k.x + 12} ${k.top} Z`} />
                <rect x={Math.min(k.x, k.x + k.jib)} y={k.top} width={Math.abs(k.jib)} height="14" />
                <rect x={Math.min(k.x, k.x + k.counter)} y={k.top} width={Math.abs(k.counter)} height="22" />
                <path d={`M${k.x} ${k.top - 60} L${k.x + k.jib} ${k.top}`} strokeWidth="3" fill="none" />
                <g className="sx-swing" style={{ transformOrigin: `${k.x + k.jib * 0.7}px ${k.top + 14}px`, animationDelay: `${-i * 2}s` }}>
                  <line x1={k.x + k.jib * 0.7} y1={k.top + 14} x2={k.x + k.jib * 0.7} y2={k.top + 220} strokeWidth="2" />
                  <rect x={k.x + k.jib * 0.7 - 50} y={k.top + 220} width="100" height="16" fill="#3a2a10" stroke="none" />
                </g>
              </g>
            ))}
            {/* floodlight cones */}
            <Spot x={1340} y={150} color="#fff1c2" length={760} width={300} duration={14} from={8} to={22} opacity={0.12} />
            <circle cx="1060" cy="470" r="18" fill="#fff6d0" className="sx-weld" style={{ filter: 'blur(4px)' }} />
            <rect x="-20" y="860" width="1660" height="40" fill="#0b0905" />
          </Stage>
          <div className="scene-hazard" />
          <Particles glyph="flame" count={18} colors={['#fff1a8', c.primary, c.secondary]} motion="rise" size={[3, 7]} speed={[5, 10]} xRange={[60, 72]} seed={id} />
          <svg className="scene-gear scene-gear--1" viewBox="0 0 24 24"><path d={G.gear.d} fill="none" stroke={c.primary} strokeWidth="0.9" /></svg>
        </>
      );

    /* Caesar: desert sunset, layered buttes, the open road, blowing dust */
    case 'outlaw-dust':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#f6e7cb'], [0.5, '#f2c78f'], [0.8, '#e89a5c'], [1, '#d97a46']]} />
              <VGrad id={`${id}-sun`} stops={[[0, '#fff3c4'], [1, '#ffb35c']]} />
              <VGrad id={`${id}-b1`} stops={[[0, '#c97a4a', 0.75], [1, '#b0613a', 0.75]]} />
              <VGrad id={`${id}-b2`} stops={[[0, '#9a4e26'], [1, '#7a3a18']]} />
              <VGrad id={`${id}-ground`} stops={[[0, '#c88a52'], [1, '#8b5228']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <circle cx="1150" cy="470" r="260" fill="#fff0b0" opacity="0.35" style={{ filter: 'blur(40px)' }} className="sx-breathe" />
            <circle cx="1150" cy="470" r="130" fill={u('sun')} />
            <Clouds seed={id + 'c'} y={250} h={30} fill="#fff6e4" opacity={0.5} speed={150} blur={6} />
            <path d="M-20 900 L-20 560 L80 560 L110 470 L300 470 L330 560 L600 560 L620 520 L720 520 L740 560 L1640 560 L1640 900 Z" fill={u('b1')} />
            <path d="M1200 600 L1240 430 L1300 410 L1440 410 L1480 600 Z M1500 600 L1520 500 L1590 500 L1610 600 Z" fill={u('b1')} />
            <path d={hills(id + 'g', 640, 40, 4)} fill={u('b2')} />
            <path d="M-20 900 L-20 680 L1640 680 L1640 900 Z" fill={u('ground')} />
            <path d="M620 900 L1130 640 L1170 640 L1480 900 Z" fill="#4a2e1c" />
            <path d="M1150 642 L1150 900" stroke="#f8f0e1" strokeWidth="5" strokeDasharray="22 30" className="sx-road" opacity="0.85" />
            <g className="sx-approach" style={{ transformOrigin: '1150px 652px' }}>
              <circle cx="1150" cy="652" r="4" fill="#fffbe8" style={{ filter: 'drop-shadow(0 0 6px #fff)' }} />
            </g>
          </Stage>
          <div className="sx-dust" />
          <Particles glyph="dot" count={30} colors={[c.primary, c.secondary, '#f8e4c2']} motion="drift" size={[3, 8]} speed={[8, 16]} opacity={[0.2, 0.5]} seed={id} />
        </>
      );

    /* Phoenix: blazing wings around the rebirth halo, fire below, falling ash */
    case 'undying-flame':
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#0c0507'], [0.6, '#2a0a10'], [1, '#4a1210']]} />
              <VGrad id={`${id}-feather`} stops={[[0, '#fff1b8', 0.95], [0.4, c.secondary, 0.85], [0.75, c.primary, 0.6], [1, c.accent, 0]]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <g transform="translate(1120 560) scale(0.85)">
              {[-1, 1].map((side) => (
                <g key={side} className="sx-wing" style={{ transformOrigin: '0px 0px', ['--side' as string]: side } as React.CSSProperties}>
                  <g transform={`scale(${side} 1)`}>
                    {/* long flight feathers along the wing arm, then a shorter covert row */}
                    {[0, 1].map((row) =>
                      Array.from({ length: 11 }, (_, i) => {
                        const bx = 70 + i * 34;
                        const by = -40 - i * 26 + i * i * 1.4;
                        const a = -62 + i * 11 + row * 6;
                        const len = (row ? 110 : 230) + i * (row ? 8 : 16) - (i > 7 ? (i - 7) * (row ? 20 : 46) : 0);
                        const w = row ? 16 : 22;
                        return (
                          <path
                            key={`${row}-${i}`}
                            transform={`translate(${bx} ${by}) rotate(${a})`}
                            d={`M0 0 C${len * 0.3} ${-w} ${len * 0.75} ${-w * 0.8} ${len} 0 C${len * 0.75} ${w * 0.5} ${len * 0.3} ${w * 0.6} 0 0 Z`}
                            fill={u('feather')}
                            opacity={row ? 0.9 : 0.7}
                          />
                        );
                      })
                    )}
                    <path d="M40 0 C120 -40 260 -170 420 -250" stroke="#fff1b8" strokeOpacity="0.5" strokeWidth="6" fill="none" strokeLinecap="round" />
                  </g>
                </g>
              ))}
              <circle r="120" fill="none" stroke={c.secondary} strokeWidth="6" opacity="0.8" className="sx-rebirth" style={{ filter: `drop-shadow(0 0 18px ${c.primary})` }} />
              <circle r="72" fill={c.secondary} opacity="0.25" style={{ filter: 'blur(20px)' }} className="sx-breathe" />
            </g>
            <FlameWall id={id} base={900} colors={['#fff1b8', c.primary, c.accent]} height={200} count={20} seed={id} />
          </Stage>
          <Particles glyph="flame" count={22} colors={['#ffe08a', c.primary, c.accent]} motion="rise" size={[4, 11]} speed={[8, 15]} seed={id} />
          <Particles glyph="plume" count={8} colors={[c.secondary, '#ffd9a0', c.accent]} motion="fall" size={[14, 24]} speed={[20, 34]} opacity={[0.25, 0.55]} seed={id + 'p'} />
          <Particles glyph="dot" count={16} colors={['#b9a7a4']} motion="rise" size={[3, 6]} speed={[16, 28]} opacity={[0.15, 0.35]} seed={id + 'a'} />
        </>
      );

    /* Default (Graphite): New Eridu at dusk under a Hollow */
    default:
      return (
        <>
          <Stage>
            <defs>
              <VGrad id={`${id}-sky`} stops={[[0, '#07080c'], [0.6, '#12152a'], [1, '#1b1f3a']]} />
              <RGrad id={`${id}-hollow`} cx={0.42} cy={0.38} r={0.62} stops={[[0, '#2a2f55'], [0.6, '#0c0e1a'], [1, '#05060a']]} />
              <VGrad id={`${id}-far`} stops={[[0, '#1a1e34'], [1, '#10121e']]} />
              <VGrad id={`${id}-near`} stops={[[0, '#0b0c13'], [1, '#050609']]} />
            </defs>
            <rect width="1600" height="900" fill={u('sky')} />
            <Stars seed={id} count={70} maxY={420} />
            <g transform="translate(1180 420)">
              <circle r="340" fill={c.primary} opacity="0.16" style={{ filter: 'blur(40px)' }} className="sx-breathe" />
              <circle r="230" fill={u('hollow')} />
              <circle r="230" fill="none" stroke={c.secondary} strokeOpacity="0.5" strokeWidth="2" />
              <g transform="rotate(-18)">
                <ellipse rx="360" ry="70" fill="none" stroke={c.primary} strokeWidth="10" strokeOpacity="0.6" strokeDasharray="40 18" className="sx-orbit" />
                <ellipse rx="360" ry="70" fill="none" stroke={c.secondary} strokeWidth="2" strokeOpacity="0.8" />
              </g>
            </g>
            <path d={city(id + 'far', 680, 140, 400, 0.3)} fill={u('far')} />
            <CityLights seed={id + 'far'} base={680} height={380} colors={[c.secondary, '#c4b5fd', '#ffd27a']} count={110} />
            <path d={city(id + 'near', 800, 60, 220, 0.1)} fill={u('near')} />
            <CityLights seed={id + 'near'} base={800} height={200} colors={['#ffd27a', c.secondary]} count={40} size={6} />
          </Stage>
          <span className="scene-scan" style={{ background: `linear-gradient(90deg, transparent, ${c.primary}55, transparent)` }} />
          <Particles glyph={glyph} count={10} colors={[c.primary, c.accent]} motion="drift" size={[8, 14]} speed={[18, 30]} opacity={[0.2, 0.5]} seed={id} />
        </>
      );
  }
}

export const ThemeScene: React.FC<{ theme: ThemeDefinition }> = ({ theme }) => (
  <div className={`scene scene--${theme.id} scene--${theme.mode}`} aria-hidden="true">
    {sceneFor(theme)}
    <Atmos light={theme.mode === 'light'} />
    <div className="scene-vignette" />
  </div>
);
