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
/* Scenes                                                              */
/* ------------------------------------------------------------------ */
function sceneFor(t: ThemeDefinition): React.ReactNode {
  const c = t.colors;
  const glyph = HERO_GLYPH[t.motif] ?? 'sparkle';
  const id = t.id;
  switch (id) {
    case 'frostblade':
      return (
        <>
          <Glows colors={[c.primary, c.secondary, '#9fe7ff']} />
          <div className="scene-aurora">
            <span style={{ background: `linear-gradient(90deg, transparent, ${c.primary}, #9ff3e0, transparent)` }} />
            <span style={{ background: `linear-gradient(90deg, transparent, #b49cff, ${c.primary}, transparent)` }} />
          </div>
          <Bottom height="30%">
            <path d="M0 400 L0 330 L60 250 L110 320 L170 200 L240 310 L300 260 L360 330 L1240 330 L1300 240 L1350 300 L1420 180 L1480 290 L1540 230 L1600 300 L1600 400 Z" fill={c.primary} opacity="0.16" />
            <path d="M0 400 L0 360 L1600 360 L1600 400 Z" fill={c.primary} opacity="0.1" />
          </Bottom>
          <Particles glyph="snow" count={34} colors={['#ffffff', c.primary]} motion="fall" size={[8, 20]} speed={[16, 30]} seed={id} />
        </>
      );
    case 'riptide':
      return (
        <>
          <Glows colors={[c.primary, c.secondary, '#3fd1ff']} />
          <svg className="scene-waves" viewBox="0 0 1600 400" preserveAspectRatio="none">
            <path className="scene-wave scene-wave--1" d={wavePath(250, 26, 400)} fill={c.secondary} opacity="0.18" />
            <path className="scene-wave scene-wave--2" d={wavePath(290, 20, 320)} fill={c.primary} opacity="0.2" />
            <path className="scene-wave scene-wave--3" d={wavePath(330, 16, 260)} fill="#ffffff" opacity="0.08" />
          </svg>
          <Particles glyph="bubble" count={22} colors={['#ffffff', c.primary]} motion="rise" size={[8, 18]} speed={[12, 22]} seed={id} />
        </>
      );
    case 'ember-rush':
      return (
        <>
          <Glows colors={['#ff5a1f', c.primary, '#ffcf4d']} strength={1.2} />
          <div className="scene-heat" style={{ background: `radial-gradient(ellipse at 60% 110%, ${c.primary}55, transparent 60%)` }} />
          <Particles glyph="flame" count={30} colors={['#ffd166', '#ff7a1a', '#ff3d1f']} motion="rise" size={[6, 16]} speed={[9, 18]} seed={id} />
        </>
      );
    case 'velvet-heist':
    case 'night-patrol': {
      const patrol = id === 'night-patrol';
      return (
        <>
          <Glows colors={[c.primary, c.secondary, patrol ? '#3d7bff' : '#ff4fd8']} />
          {!patrol && <Beams colors={[`${c.primary}55`, `${c.accent}44`]} />}
          <Bottom height="40%">
            <path d={skyline(id + 'far', 330, 60, 170)} fill={c.secondary} opacity="0.14" />
            <path d={skyline(id, 380, 40, 140)} fill="#05060a" opacity="0.55" />
            {windows(id, patrol ? '#ffd27a' : c.accent, 380)}
          </Bottom>
          {patrol ? (
            <>
              <div className="scene-rain" />
              <span className="scene-siren scene-siren--red" />
              <span className="scene-siren scene-siren--blue" />
            </>
          ) : (
            <Particles glyph="gem" count={12} colors={[c.accent, '#ffffff']} motion="drift" size={[10, 18]} speed={[18, 30]} opacity={[0.25, 0.6]} seed={id} />
          )}
        </>
      );
    }
    case 'starlight-encore':
      return (
        <>
          <Glows colors={[c.primary, c.secondary, '#ffd36b']} strength={0.9} />
          <Beams colors={[`${c.primary}40`, `${c.secondary}38`, '#ffd36b40']} />
          <Particles glyph="note" count={14} colors={[c.primary, c.secondary]} motion="rise" size={[12, 20]} speed={[14, 24]} opacity={[0.3, 0.6]} seed={id} />
          <Particles glyph="sparkle" count={18} colors={['#ffd36b', c.primary]} motion="drift" size={[6, 14]} speed={[10, 20]} seed={id + 's'} />
        </>
      );
    case 'sakura-storm':
      return (
        <>
          <Glows colors={[c.primary, c.secondary, '#ffb6d9']} />
          <span className="scene-moon" style={{ background: `radial-gradient(circle at 40% 40%, #fff6fb, ${c.primary}66 60%, transparent 70%)` }} />
          <Bottom height="26%">
            <path d="M0 400 L0 300 Q200 240 420 300 T900 280 T1600 290 L1600 400 Z" fill={c.secondary} opacity="0.14" />
          </Bottom>
          <Particles glyph="petal" count={30} colors={['#ffc4dd', c.primary, '#ffffff']} motion="drift" size={[8, 16]} speed={[14, 26]} seed={id} />
        </>
      );
    case 'rose-requiem':
      return (
        <>
          <Glows colors={[c.primary, c.secondary, '#b04fff']} />
          <Bottom height="55%">
            {[1080, 1260, 1440].map((x, i) => (
              <path
                key={i}
                d={`M${x} 400 L${x} 170 Q${x} 60 ${x + 75} 30 Q${x + 150} 60 ${x + 150} 170 L${x + 150} 400 Z M${x + 20} 400 L${x + 20} 175 Q${x + 20} 85 ${x + 75} 58 Q${x + 130} 85 ${x + 130} 175 L${x + 130} 400 Z`}
                fill={c.primary}
                fillRule="evenodd"
                opacity={0.1 + i * 0.03}
              />
            ))}
          </Bottom>
          <div className="scene-mist" />
          <Particles glyph="rose" count={14} colors={[c.primary, '#ff5c8a']} motion="drift" size={[10, 18]} speed={[18, 30]} opacity={[0.25, 0.55]} seed={id} />
          <Particles glyph="feather" count={8} colors={['#ffffff', c.secondary]} motion="fall" size={[12, 20]} speed={[20, 34]} opacity={[0.2, 0.45]} seed={id + 'f'} />
        </>
      );
    case 'ink-seal':
      return (
        <>
          <Glows colors={[c.secondary, c.primary, '#d64545']} strength={0.5} />
          <span className="scene-seal" />
          <Bottom height="48%">
            <path d="M0 400 L0 250 Q120 120 260 210 Q380 90 520 200 Q640 140 760 220 L1600 260 L1600 400 Z" fill={c.text} opacity="0.06" />
            <path d="M0 400 L0 300 L900 290 Q1040 150 1180 250 Q1300 100 1440 220 Q1520 170 1600 230 L1600 400 Z" fill={c.text} opacity="0.1" />
            <path d="M0 400 L0 350 Q400 310 800 340 T1600 330 L1600 400 Z" fill={c.text} opacity="0.12" />
          </Bottom>
          <Particles glyph="cloud" count={6} colors={[c.text]} motion="drift" size={[60, 120]} speed={[50, 80]} opacity={[0.05, 0.1]} seed={id} />
        </>
      );
    case 'jade-garden':
      return (
        <>
          <Glows colors={[c.primary, c.secondary, '#b8f27a']} />
          <div className="scene-rays" style={{ background: `repeating-linear-gradient(115deg, transparent 0 60px, ${c.primary}14 60px 110px)` }} />
          <svg className="scene-bamboo" viewBox="0 0 200 900" preserveAspectRatio="xMaxYMax meet">
            {[30, 90, 150].map((x, i) => (
              <g key={i} opacity={0.12 + i * 0.05} fill={c.primary}>
                <rect x={x} y="0" width="16" height="900" rx="6" />
                {[140, 330, 520, 710].map((y) => (
                  <rect key={y} x={x - 3} y={y + i * 30} width="22" height="6" rx="3" />
                ))}
              </g>
            ))}
          </svg>
          <Particles glyph="leaf" count={18} colors={[c.primary, '#b8f27a']} motion="drift" size={[10, 18]} speed={[16, 28]} seed={id} />
        </>
      );
    case 'silver-fang':
      return (
        <>
          <Glows colors={['#ffffff', c.secondary, c.accent]} strength={0.6} />
          <span className="scene-moon" style={{ background: 'radial-gradient(circle at 40% 40%, #ffffff, #c9ccd4 55%, transparent 70%)', opacity: 0.7 }} />
          <Beams colors={['#ffffff22', '#ffffff18']} />
          <Bottom height="34%">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <rect key={i} x={980 + i * 90} y={140 + (i % 2) * 30} width="34" height={260 - (i % 2) * 30} rx="17" fill="#ffffff" opacity="0.05" />
            ))}
          </Bottom>
          <Particles glyph="dot" count={30} colors={['#ffffff']} motion="drift" size={[4, 8]} speed={[24, 40]} opacity={[0.25, 0.6]} seed={id + 'd'} />
          <Particles glyph="paw" count={6} colors={['#ffffff', c.accent]} motion="drift" size={[12, 18]} speed={[22, 34]} opacity={[0.15, 0.35]} seed={id} />
        </>
      );
    case 'gale-fletcher':
      return (
        <>
          <Glows colors={[c.primary, c.secondary, '#1fa0c4']} />
          <div className="scene-wind">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ top: `${8 + i * 10}%`, animationDelay: `${-i * 1.3}s`, animationDuration: `${3.5 + (i % 3)}s`, background: `linear-gradient(90deg, transparent, ${i % 2 ? c.secondary : '#ffffff'}, transparent)` }} />
            ))}
          </div>
          <Particles glyph="arrow" count={8} colors={[c.accent, c.primary]} motion="drift" size={[14, 22]} speed={[8, 14]} opacity={[0.35, 0.7]} seed={id} />
          <Particles glyph="feather" count={10} colors={['#ffffff', c.primary]} motion="fall" size={[10, 18]} speed={[18, 30]} opacity={[0.25, 0.5]} seed={id + 'f'} />
        </>
      );
    case 'hard-hat':
      return (
        <>
          <Glows colors={[c.primary, c.secondary, c.accent]} strength={0.8} />
          <svg className="scene-gear scene-gear--1" viewBox="0 0 24 24"><path d={G.gear.d} fill="none" stroke={c.primary} strokeWidth="0.9" /></svg>
          <svg className="scene-gear scene-gear--2" viewBox="0 0 24 24"><path d={G.gear.d} fill="none" stroke={c.secondary} strokeWidth="1.1" /></svg>
          <Bottom height="46%">
            <path d="M1180 400 L1180 60 L1196 60 L1196 400 Z M1150 60 L1560 60 L1560 74 L1150 74 Z M1196 60 L1240 20 L1252 20 L1252 60 Z M1500 74 L1500 200" stroke={c.primary} strokeWidth="4" fill={c.primary} opacity="0.16" />
            <path d="M1186 74 L1206 100 L1226 74 L1246 100 L1266 74 L1286 100 L1306 74 L1326 100 L1346 74 L1366 100 L1386 74 L1406 100 L1426 74 L1446 100 L1466 74 L1486 100 L1506 74" stroke={c.primary} strokeWidth="3" fill="none" opacity="0.14" />
          </Bottom>
          <div className="scene-hazard" />
          <Particles glyph="flame" count={22} colors={['#ffe066', c.secondary, c.accent]} motion="rise" size={[4, 10]} speed={[6, 12]} seed={id} />
        </>
      );
    case 'outlaw-dust':
      return (
        <>
          <Glows colors={['#f0a24a', c.secondary, '#e8c48a']} strength={0.7} />
          <span className="scene-sun" />
          <Bottom height="38%">
            <path d="M0 400 L0 250 Q260 200 520 240 T1040 225 T1600 235 L1600 400 Z" fill={c.primary} opacity="0.1" />
            <path d="M0 400 L0 300 Q300 260 640 295 T1300 285 T1600 300 L1600 400 Z" fill={c.primary} opacity="0.14" />
            <path d="M560 400 L760 300 L840 300 L1040 400 Z" fill={c.text} opacity="0.12" />
            <path className="scene-road" d="M800 300 L800 400" stroke="#f8f0e1" strokeWidth="6" strokeDasharray="14 18" opacity="0.7" />
          </Bottom>
          <Particles glyph="dot" count={26} colors={[c.primary, c.secondary]} motion="drift" size={[4, 9]} speed={[10, 20]} opacity={[0.2, 0.5]} seed={id} />
        </>
      );
    case 'undying-flame':
      return (
        <>
          <Glows colors={[c.primary, c.secondary, c.accent]} strength={1.1} />
          {/* Rebirth halo: flares, burns down to ash, then reignites */}
          <span className="scene-rebirth" style={{ '--halo': c.primary, '--halo2': c.secondary } as React.CSSProperties} />
          <div className="scene-heat" style={{ background: `radial-gradient(ellipse at 50% 115%, ${c.primary}66, transparent 62%)` }} />
          <Particles glyph="flame" count={26} colors={['#ffe08a', c.primary, c.accent]} motion="rise" size={[5, 13]} speed={[9, 17]} seed={id} />
          <Particles glyph="plume" count={9} colors={[c.secondary, '#ffd9a0', c.accent]} motion="fall" size={[14, 24]} speed={[20, 34]} opacity={[0.25, 0.55]} seed={id + 'p'} />
          <Particles glyph="dot" count={18} colors={['#b9a7a4']} motion="rise" size={[3, 6]} speed={[16, 28]} opacity={[0.15, 0.35]} seed={id + 'a'} />
        </>
      );
    default:
      return (
        <>
          <Glows colors={[c.primary, c.secondary, c.accent]} />
          <div className="scene-grid" style={{ '--grid': `${c.primary}33` } as React.CSSProperties} />
          <span className="scene-scan" style={{ background: `linear-gradient(90deg, transparent, ${c.primary}55, transparent)` }} />
          <Particles glyph={glyph} count={14} colors={[c.primary, c.accent]} motion="drift" size={[8, 14]} speed={[18, 30]} opacity={[0.2, 0.5]} seed={id} />
        </>
      );
  }
}

export const ThemeScene: React.FC<{ theme: ThemeDefinition }> = ({ theme }) => (
  <div className={`scene scene--${theme.id} scene--${theme.mode}`} aria-hidden="true">
    {sceneFor(theme)}
    <div className="scene-vignette" />
  </div>
);
