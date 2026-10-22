import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Compass,
  Download,
  FlaskConical,
  Hammer,
  Share2,
  Shirt,
  FolderSearch,
  Library,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { fairyClient } from '../services/fairyClient';
import type { AppConfig, SetupStatus } from '../shared/types';
import { THEMES } from '../themes';
import { ThemeIcon } from './ThemeIcon';
import { useEscape } from '../ui';

const XXMI_URL = 'https://github.com/SpectrumQT/XXMI-Launcher/releases/latest';
// Bump the version to show the tutorial to everyone again after a big new feature.
// v2: Mod Workshop.
const SETUP_KEY = 'proxylaunch_setup_v2';

export function isSetupDone(): boolean {
  try {
    return localStorage.getItem(SETUP_KEY) === 'done';
  } catch {
    return true; // storage unavailable: don't nag on every launch
  }
}
export function markSetupDone() {
  try {
    localStorage.setItem(SETUP_KEY, 'done');
  } catch {
    // ignore
  }
}

type Step = 'welcome' | 'check' | 'theme' | 'workshop' | 'done';
const STEPS: Step[] = ['welcome', 'check', 'theme', 'workshop', 'done'];

interface Props {
  open: boolean;
  activeTheme: string;
  onThemeChange: (id: string) => void;
  /** Persist path changes (also refreshes app state). */
  onSaveConfig: (partial: Partial<AppConfig>) => Promise<void>;
  onClose: () => void;
  /** Experimental Mod Workshop is turned on. */
  workshopEnabled?: boolean;
}

/** First-run setup: welcome → find game + XXMI → pick a theme → ready. */
export const SetupWizard: React.FC<Props> = ({ open, activeTheme, onThemeChange, onSaveConfig, onClose, workshopEnabled }) => {
  const [step, setStep] = useState<Step>('welcome');
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const isElectron = Boolean(window.fairyBridge?.isElectron);

  const finish = useCallback(() => {
    markSetupDone();
    onClose();
  }, [onClose]);
  useEscape(finish, open);

  const check = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      setStatus(await fairyClient.getSetupStatus());
    } catch (err) {
      setCheckError((err as Error).message || 'Something went wrong while checking.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setStep('welcome');
      check();
    }
  }, [open, check]);

  const pick = async (key: 'zzzExePath' | 'zzmiLoaderPath') => {
    const file = await fairyClient.selectLocalArchiveOrFolder('exe');
    if (!file) return;
    await onSaveConfig({ [key]: file } as Partial<AppConfig>);
    await check();
  };

  if (!open) return null;

  const idx = STEPS.indexOf(step);
  const allGood = Boolean(status?.game.ok && status?.loader.ok && status?.zzmi.ok);
  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const back = () => setStep(STEPS[Math.max(idx - 1, 0)]);

  return (
    <div className="overlay setup-overlay">
      <div className="setup" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div className="setup__progress" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={i <= idx ? 'is-on' : ''} />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="setup__body setup__body--center">
            <div className="setup__icon">
              <ThemeIcon themeId={activeTheme} size={96} />
            </div>
            <div className="eyebrow setup__tape">Proxy online</div>
            <h1 id="setup-title" className="setup__title">
              Welcome to Proxy<span>Launch</span>
            </h1>
            <p className="setup__lead">
              Let’s get you ready to play with mods. This takes under a minute.
            </p>
          </div>
        )}

        {step === 'check' && (
          <div className="setup__body">
            <h2 id="setup-title" className="setup__h2">
              Finding your game
            </h2>
            <p className="muted">
              ProxyLaunch works together with <b>XXMI Launcher</b>, which loads your mods into the game.
            </p>

            {checkError && (
              <div className="setup-row is-bad" role="alert">
                <XCircle />
                <div className="setup-row__text">
                  <b>Couldn’t check</b>
                  <span>{checkError}</span>
                </div>
              </div>
            )}

            {!status && checking && (
              <div className="setup-row">
                <Loader2 className="spin" />
                <div className="setup-row__text">
                  <b>Looking around…</b>
                  <span>Checking HoYoPlay, XXMI and common install folders.</span>
                </div>
              </div>
            )}

            {status && (
              <div className="stack-3">
                <Row
                  ok={status.game.ok}
                  title="Zenless Zone Zero"
                  okText={status.game.path}
                  badText="Not found. Point us to ZenlessZoneZero.exe (usually in your HoYoPlay games folder)."
                  actions={
                    !status.game.ok && (
                      <button className="btn btn--secondary btn--sm" onClick={() => pick('zzzExePath')} disabled={!isElectron}>
                        <FolderSearch /> Find game
                      </button>
                    )
                  }
                />
                <Row
                  ok={status.loader.ok}
                  title="XXMI Launcher"
                  okText={status.loader.path}
                  badText="Not installed yet. It’s free; download it, install it, then press Check again."
                  actions={
                    !status.loader.ok && (
                      <>
                        <button className="btn btn--primary btn--sm" onClick={() => fairyClient.openExternal(XXMI_URL)}>
                          <Download /> Download XXMI
                        </button>
                        <button className="btn btn--ghost btn--sm" onClick={() => pick('zzmiLoaderPath')} disabled={!isElectron}>
                          I have it, locate it
                        </button>
                      </>
                    )
                  }
                />
                <Row
                  ok={status.zzmi.ok}
                  warn={!status.zzmi.ok && status.loader.ok}
                  title="Zenless Zone Zero set up in XXMI"
                  okText="Ready to load mods"
                  badText={
                    status.loader.ok
                      ? 'Open XXMI Launcher once, pick Zenless Zone Zero and let it install. Then press Check again.'
                      : 'Comes after installing XXMI.'
                  }
                />
              </div>
            )}

            <div className="row setup__subactions">
              <button className="btn btn--ghost btn--sm" onClick={check} disabled={checking}>
                {checking ? <Loader2 className="spin" /> : <RefreshCw />} Check again
              </button>
              {status && !allGood && (
                <span className="small muted">You can finish this later in Settings → Folders &amp; game.</span>
              )}
            </div>
          </div>
        )}

        {step === 'theme' && (
          <div className="setup__body">
            <h2 id="setup-title" className="setup__h2">
              Pick your vibe
            </h2>
            <p className="muted">Each theme is inspired by an agent. You can change it anytime in Themes.</p>
            <div className="setup-themes" role="radiogroup" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={t.id === activeTheme}
                  className={`setup-theme ${t.id === activeTheme ? 'is-active' : ''}`}
                  onClick={() => onThemeChange(t.id)}
                  style={{ background: t.gradients.hero }}
                >
                  <span className="setup-theme__swatch" style={{ background: `linear-gradient(135deg, ${t.gradients.accent[0]}, ${t.gradients.accent[1]})` }} />
                  <span className="setup-theme__name" style={{ color: t.colors.text }}>
                    {t.name}
                  </span>
                  <span className="setup-theme__agent" style={{ color: t.colors.textMuted }}>
                    {t.agent ?? 'Default'}
                  </span>
                  {t.id === activeTheme && <CheckCircle2 className="setup-theme__check" style={{ color: t.colors.primary }} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'workshop' && (
          <div className="setup__body">
            <div className="eyebrow">
              <FlaskConical style={{ width: 14, height: 14, verticalAlign: '-2px' }} /> New · Experimental
            </div>
            <h2 id="setup-title" className="setup__h2">
              Make your own mods
            </h2>
            <p className="muted">
              The <b>Mod Workshop</b> lets you mix parts from mods you already have. Take the hair from one Jane mod and the jacket from
              another, and save it as a new mod.
            </p>
            <div className="setup-tips">
              <Tip icon={<FlaskConical />} title="1. Turn it on" text="Settings → Experimental → Mod Workshop. A Workshop page appears under Themes." />
              <Tip icon={<Shirt />} title="2. Pick parts" text="Choose an agent, then pick a mod for each part. Parts you skip stay as the original model." />
              <Tip icon={<Hammer />} title="3. Build it" text="Name it and build. It lands in your Library like any other mod, already labeled 18+ if any part is." />
              <Tip icon={<Share2 />} title="4. Share it" text="Post it on the Community tab (sign in with Discord) or copy its share code. ProxyLaunch grabs the mods it needs from GameBanana for whoever gets it." />
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className={`btn ${workshopEnabled ? 'btn--secondary' : 'btn--primary'} btn--sm`}
                onClick={() => onSaveConfig({ workshopEnabled: !workshopEnabled })}
              >
                {workshopEnabled ? <CheckCircle2 /> : <FlaskConical />}
                {workshopEnabled ? 'Workshop is on' : 'Turn on the Workshop'}
              </button>
              <span className="small muted">You can change this anytime in Settings.</span>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="setup__body">
            <h2 id="setup-title" className="setup__h2">
              You’re all set
            </h2>
            <p className="muted">Here’s how it works:</p>
            <div className="setup-tips">
              <Tip icon={<Compass />} title="Browse" text="Find mods from GameBanana and install them in one click." />
              <Tip icon={<Library />} title="Library" text="Turn mods on and off. Updates show up here automatically." />
              <Tip icon={<Play />} title="Play" text="Starts XXMI and the game with your mods loaded." />
            </div>
          </div>
        )}

        <div className="setup__footer">
          {step === 'welcome' ? (
            <button className="btn btn--ghost" onClick={finish}>
              Skip setup
            </button>
          ) : (
            <button className="btn btn--ghost" onClick={back}>
              <ArrowLeft /> Back
            </button>
          )}
          <div className="spacer" />
          {step === 'done' ? (
            <button className="btn btn--primary btn--lg" onClick={finish} autoFocus>
              Let’s go <ArrowRight />
            </button>
          ) : (
            <button className="btn btn--primary btn--lg" onClick={next} autoFocus>
              {step === 'welcome' ? 'Get started' : step === 'check' && status && !allGood ? 'Continue anyway' : 'Continue'}
              <ArrowRight />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{
  ok: boolean;
  warn?: boolean;
  title: string;
  okText: string;
  badText: string;
  actions?: React.ReactNode;
}> = ({ ok, warn, title, okText, badText, actions }) => (
  <div className={`setup-row ${ok ? 'is-ok' : warn ? 'is-warn' : 'is-bad'}`}>
    {ok ? <CheckCircle2 /> : warn ? <CircleAlert /> : <XCircle />}
    <div className="setup-row__text">
      <b>{title}</b>
      <span title={ok ? okText : undefined}>{ok ? okText : badText}</span>
    </div>
    {actions && <div className="setup-row__actions">{actions}</div>}
  </div>
);

const Tip: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => (
  <div className="setup-tip">
    <span className="setup-tip__icon">{icon}</span>
    <div>
      <b>{title}</b>
      <p className="small muted">{text}</p>
    </div>
  </div>
);
