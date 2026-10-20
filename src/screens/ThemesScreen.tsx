import { HeroDecor } from '../ui/HeroDecor';
import React from 'react';
import { Check, Monitor, MousePointer2, Moon, Sparkles, Sun } from 'lucide-react';
import { buildCursorSvg, type CursorSettings, type CursorShapePref } from '../themes/cursor';
import { svgToDataUrl } from '../themes/appIcon';
import { Segmented, Switch } from '../ui';
import type { EffectsSettings } from '../ui/effects';
import { THEMES } from '../themes/registry';
import { buildTokens } from '../themes/tokens';
import { Motif } from '../themes/Motif';
import type { ThemeDefinition } from '../themes/types';
import { ThemeIcon } from '../components/ThemeIcon';

/** Miniature, fully-colored mock of the app in a given theme. */
const ThemePreview: React.FC<{ theme: ThemeDefinition }> = ({ theme }) => {
  const r = buildTokens(theme).resolved;
  const c = theme.colors;
  return (
    <div className="theme-card__preview" style={{ background: theme.gradients.hero }}>
      <span
        className="theme-card__stripes"
        style={{ background: `repeating-linear-gradient(-45deg, ${c.primary} 0 8px, transparent 8px 16px)` }}
      />
      <Motif
        kind={theme.motif}
        density={16}
        opacity={0.75}
        seed={theme.id}
        colors={[c.accent, c.secondary]}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <div className="mini-app" style={{ background: c.background, border: `1px solid ${c.border}` }}>
        <div className="mini-app__side" style={{ background: c.surface, borderRight: `1px solid ${c.border}` }}>
          <i style={{ background: `linear-gradient(135deg, ${r.ctaFrom}, ${r.ctaTo})`, height: 16, borderRadius: 5 }} />
          <i style={{ background: r.primarySoft, height: 10 }} />
          <i style={{ background: c.surfaceRaised }} />
          <i style={{ background: c.surfaceRaised }} />
          <i style={{ background: c.surfaceRaised, width: '70%' }} />
          <span style={{ flex: 1 }} />
          <i style={{ background: `linear-gradient(135deg, ${r.ctaFrom}, ${r.ctaTo})`, height: 16, borderRadius: 5 }} />
        </div>
        <div className="mini-app__main">
          <div className="mini-app__hero" style={{ background: theme.gradients.hero }}>
            <div
              style={{
                width: '46%',
                height: 9,
                borderRadius: 3,
                background: r.text,
                opacity: 0.9,
              }}
            />
            <div style={{ width: '30%', height: 6, borderRadius: 3, background: r.muted, marginTop: 6 }} />
          </div>
          <div className="mini-app__cards">
            {[c.primary, c.secondary, c.accent].map((col, i) => (
              <div
                key={i}
                style={{
                  background: `linear-gradient(160deg, ${col}55, ${c.surface} 70%)`,
                  border: `1px solid ${c.border}`,
                }}
              >
                <i style={{ background: r.text, width: '80%', opacity: 0.85 }} />
                <i style={{ background: r.muted, width: '50%' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ThemesScreenProps {
  activeThemeId: string;
  onSelect: (id: string) => void;
  cursor: CursorSettings;
  onCursorChange: (patch: Partial<CursorSettings>) => void;
  effects: EffectsSettings;
  onEffectsChange: (patch: Partial<EffectsSettings>) => void;
}

const CursorPreview: React.FC<{ theme: ThemeDefinition; cursor: CursorSettings }> = ({ theme, cursor }) => {
  const opts = { shape: cursor.shape, size: 'normal' as const };
  return (
    <span className="cursor-opt__preview cursor-opt__preview--pair" style={{ background: theme.gradients.hero }}>
      <img src={svgToDataUrl(buildCursorSvg(theme, 'arrow', opts))} alt="" draggable={false} />
      <img src={svgToDataUrl(buildCursorSvg(theme, 'hand', opts))} alt="" draggable={false} />
    </span>
  );
};

const FxRow: React.FC<{ title: string; desc: string; checked: boolean; onChange: () => void }> = ({ title, desc, checked, onChange }) => (
  <div className="setting">
    <div className="setting__text">
      <div className="setting__title">{title}</div>
      <div className="setting__desc">{desc}</div>
    </div>
    <Switch checked={checked} onChange={onChange} label={title} />
  </div>
);

export const ThemesScreen: React.FC<ThemesScreenProps> = ({
  activeThemeId,
  onSelect,
  cursor,
  onCursorChange,
  effects,
  onEffectsChange,
}) => {
  const active = THEMES.find((t) => t.id === activeThemeId) ?? THEMES[0];
  return (
    <div className="screen">
      <div className="scroll">
        <section className="page-hero">
          <Motif kind={active.motif} className="page-hero__motif" density={26} opacity={0.6} seed="themes" animated />
          <HeroDecor />
          <div className="page-hero__glow" />
          <div className="page-hero__content">
            <div className="theme-current">
              <ThemeIcon themeId={active.id} size={72} />
              <div className="min-w-0">
                <div className="eyebrow">Current theme{active.agent ? ` · ${active.agent}` : ''}</div>
                <h1 className="display page-hero__title">{active.name}</h1>
                <p className="page-hero__subtitle">{active.tagline}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="page-body">
          <section className="card card--pad" style={{ marginBottom: 24 }}>
            <div className="row wrap" style={{ alignItems: 'flex-start', gap: 32 }}>
              <div className="stack-4" style={{ flex: '1 1 480px', minWidth: 0 }}>
                <div className="row">
                  <MousePointer2 style={{ width: 18, height: 18, color: 'var(--primary-text)' }} />
                  <h2 style={{ fontWeight: 650, fontSize: 'var(--fs-lead)' }}>Mouse cursor</h2>
                  <span className="caption">Only changes inside this app</span>
                </div>
                <div className="cursor-grid" role="radiogroup" aria-label="Cursor set">
                  <button
                    role="radio"
                    aria-checked={cursor.pref === 'theme'}
                    className={`cursor-opt ${cursor.pref === 'theme' ? 'is-active' : ''}`}
                    onClick={() => onCursorChange({ pref: 'theme' })}
                    title="Always match the current theme"
                  >
                    <CursorPreview theme={active} cursor={cursor} />
                    Match theme
                  </button>
                  <button
                    role="radio"
                    aria-checked={cursor.pref === 'system'}
                    className={`cursor-opt ${cursor.pref === 'system' ? 'is-active' : ''}`}
                    onClick={() => onCursorChange({ pref: 'system' })}
                    title="Use your normal Windows cursor"
                  >
                    <span className="cursor-opt__preview cursor-opt__preview--pair" style={{ background: 'var(--surface)' }}>
                      <Monitor style={{ width: 20, height: 20, color: 'var(--text-muted)' }} />
                    </span>
                    System
                  </button>
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      role="radio"
                      aria-checked={cursor.pref === t.id}
                      className={`cursor-opt ${cursor.pref === t.id ? 'is-active' : ''}`}
                      onClick={() => onCursorChange({ pref: t.id })}
                      title={`${t.name}${t.agent ? ` · ${t.agent}` : ''}`}
                    >
                      <CursorPreview theme={t} cursor={cursor} />
                      <span className="truncate" style={{ maxWidth: '100%' }}>
                        {t.agent ?? t.name}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="row wrap" style={{ gap: 20 }}>
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="field__label">Shape</span>
                    <Segmented<CursorShapePref>
                      ariaLabel="Cursor shape"
                      value={cursor.shape}
                      onChange={(shape) => onCursorChange({ shape })}
                      options={[
                        { value: 'auto', label: 'Agent default' },
                        { value: 'arrow', label: 'Arrow' },
                        { value: 'blade', label: 'Blade' },
                        { value: 'reticle', label: 'Reticle', title: 'Arrow normally, a target reticle over buttons' },
                      ]}
                    />
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="field__label">Size</span>
                    <Segmented<'normal' | 'large'>
                      ariaLabel="Cursor size"
                      value={cursor.size}
                      onChange={(size) => onCursorChange({ size })}
                      options={[
                        { value: 'normal', label: 'Normal' },
                        { value: 'large', label: 'Large' },
                      ]}
                    />
                  </div>
                </div>
              </div>
              <div className="stack" style={{ flex: '0 1 340px', minWidth: 260 }}>
                <div className="row">
                  <Sparkles style={{ width: 18, height: 18, color: 'var(--primary-text)' }} />
                  <h2 style={{ fontWeight: 650, fontSize: 'var(--fs-lead)' }}>Effects</h2>
                </div>
                <div className="fx-switches">
                  <FxRow
                    title="Mouse glow & card tilt"
                    desc="A soft glow follows your mouse; cards lean toward it."
                    checked={effects.glow}
                    onChange={() => onEffectsChange({ glow: !effects.glow })}
                  />
                  <FxRow
                    title="Moving patterns"
                    desc="Snowflakes, petals and other theme shapes drift in headers."
                    checked={effects.motion}
                    onChange={() => onEffectsChange({ motion: !effects.motion })}
                  />
                  <FxRow
                    title="Retro TV lines"
                    desc="A faint CRT scanline texture over the whole app."
                    checked={effects.scanlines}
                    onChange={() => onEffectsChange({ scanlines: !effects.scanlines })}
                  />
                </div>
              </div>
            </div>
          </section>
          <p className="muted" style={{ marginBottom: 20 }}>
            Each theme restyles the whole app — colors, glow, patterns and headings — and the window icon follows along.
          </p>
          <div className="theme-grid" role="radiogroup" aria-label="Themes">
            {THEMES.map((theme, i) => {
              const isActive = theme.id === active.id;
              const c = theme.colors;
              const t = theme.typography;
              return (
                <button
                  key={theme.id}
                  role="radio"
                  aria-checked={isActive}
                  data-tilt
                  className={`theme-card ${isActive ? 'is-active' : ''}`}
                  style={{ background: c.surface, color: c.text, animationDelay: `${i * 35}ms` }}
                  onClick={() => onSelect(theme.id)}
                >
                  {isActive && (
                    <span className="theme-card__check badge" style={{ background: c.primary, color: buildTokens(theme).resolved.onPrimary, border: 0 }}>
                      <Check />
                      Active
                    </span>
                  )}
                  {theme.agent && (
                    <span
                      className="theme-card__tape"
                      style={{ background: theme.colors.primary, color: buildTokens(theme).resolved.onPrimary }}
                    >
                      {theme.agent}
                    </span>
                  )}
                  <ThemePreview theme={theme} />
                  <div className="theme-card__info">
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <div className="min-w-0" style={{ flex: 1 }}>
                        <div
                          className="theme-card__name"
                          style={{
                            fontFamily: t.displayFont,
                            fontWeight: t.displayWeight,
                            fontStyle: t.displayStyle ?? 'normal',
                            textTransform: t.displayCase ?? 'none',
                            letterSpacing: t.displayTracking ?? '0',
                          }}
                        >
                          {theme.name}
                        </div>
                        {theme.faction && (
                          <div className="theme-card__faction" style={{ color: buildTokens(theme).resolved.primaryText }}>
                            {theme.faction}
                          </div>
                        )}
                        <div style={{ color: buildTokens(theme).resolved.muted, fontSize: 'var(--fs-sm)', marginTop: 4 }}>
                          {theme.tagline}
                        </div>
                      </div>
                      <span
                        title={theme.mode === 'dark' ? 'Dark theme' : 'Light theme'}
                        style={{ color: buildTokens(theme).resolved.muted, display: 'grid', placeItems: 'center', paddingTop: 4 }}
                      >
                        {theme.mode === 'dark' ? <Moon style={{ width: 16, height: 16 }} /> : <Sun style={{ width: 16, height: 16 }} />}
                      </span>
                    </div>
                    <div className="theme-card__swatches" aria-hidden="true">
                      {[c.background, c.surface, c.primary, c.secondary, c.accent].map((col, k) => (
                        <span key={k} style={{ background: col }} />
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
