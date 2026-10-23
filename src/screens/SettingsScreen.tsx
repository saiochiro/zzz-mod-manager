import { HeroDecor } from '../ui/HeroDecor';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  RefreshCw,
  Rocket,
  Eye,
  EyeOff,
  FlaskConical,
  FolderCog,
  FolderOpen,
  FolderSearch,
  Info,
  Keyboard,
  Loader2,
  Package,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Wand2,
} from 'lucide-react';
import type { AppConfig, HashDatabase, NsfwFilterState } from '../shared/types';
import type { ThemeDefinition } from '../themes/types';
import { Motif } from '../themes/Motif';
import { ThemeIcon } from '../components/ThemeIcon';
import { fairyClient, AppUpdateStatus } from '../services/fairyClient';
import { Segmented, Switch, shortVersion } from '../ui';

interface SettingsScreenProps {
  appUpdate: AppUpdateStatus;
  onCheckAppUpdate: () => void;
  onDownloadAppUpdate: () => void;
  onInstallAppUpdate: () => void;
  theme: ThemeDefinition;
  config: AppConfig;
  hashDb: HashDatabase;
  appVersion: string;
  nsfwFilterState: NsfwFilterState;
  onChangeNsfw: (s: NsfwFilterState) => void;
  onSaveConfig: (partial: Partial<AppConfig>) => Promise<void>;
  onAutoDiscover: () => Promise<void>;
  /** Re-opens the first-run setup wizard. */
  onRunSetup?: () => void;
  onToggleSingleActive: () => void;
  onStandardizeHotkeys: () => void;
  onOrganizeFolders: () => void;
  onUndoOrganize: () => void;
  canUndoOrganize: boolean;
  onOpenImport: () => void;
  onOpenThemes: () => void;
}

const SECTIONS = [
  { id: 'folders', label: 'Folders & game', icon: FolderCog },
  { id: 'content', label: 'Content filter', icon: ShieldCheck },
  { id: 'mods', label: 'Mod behavior', icon: SlidersHorizontal },
  { id: 'library', label: 'Library tools', icon: Package },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'experimental', label: 'Experimental', icon: FlaskConical },
  { id: 'about', label: 'About', icon: Info },
] as const;

const PathField: React.FC<{
  label: string;
  hint: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onBrowse: () => void;
}> = ({ label, hint, value, placeholder, onChange, onBrowse }) => (
  <div className="field">
    <span className="field__label">{label}</span>
    <div className="path-field">
      <input className="input input--mono" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} aria-label={label} />
      <button type="button" className="btn btn--secondary" onClick={onBrowse}>
        <FolderOpen />
        Browse
      </button>
    </div>
    <span className="field__hint">{hint}</span>
  </div>
);

export const SettingsScreen: React.FC<SettingsScreenProps> = (p) => {
  const { config } = p;
  const initial = {
    xxmiModsPath: config.xxmiModsPath || '',
    zzzExePath: config.zzzExePath || '',
    zzmiLoaderPath: config.zzmiLoaderPath || '',
  };
  const [paths, setPaths] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('folders');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPaths({
      xxmiModsPath: config.xxmiModsPath || '',
      zzzExePath: config.zzzExePath || '',
      zzmiLoaderPath: config.zzmiLoaderPath || '',
    });
  }, [config.xxmiModsPath, config.zzzExePath, config.zzmiLoaderPath]);

  const dirty =
    paths.xxmiModsPath !== initial.xxmiModsPath ||
    paths.zzzExePath !== initial.zzzExePath ||
    paths.zzmiLoaderPath !== initial.zzmiLoaderPath;

  const browse = async (key: keyof typeof paths, mode: 'folder' | 'exe') => {
    const selected = await fairyClient.selectLocalArchiveOrFolder(mode);
    if (selected) setPaths((prev) => ({ ...prev, [key]: selected }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await p.onSaveConfig(paths);
    } finally {
      setSaving(false);
    }
  };

  const jump = (id: string) => {
    setActiveSection(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActiveSection(vis.target.id.replace('settings-', ''));
      },
      { root, rootMargin: '-20% 0px -70% 0px' }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(`settings-${s.id}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="screen">
      <div className="scroll" ref={scrollRef}>
        <section className="page-hero page-hero--compact">
          <Motif kind={p.theme.motif} className="page-hero__motif" density={16} opacity={0.45} seed="settings" />
          <HeroDecor />
          <div className="page-hero__content">
            <div>
              <h1 className="display page-hero__title">Settings</h1>
              <p className="page-hero__subtitle">Folders, content filters and how mods behave.</p>
            </div>
          </div>
        </section>

        <div className="page-body">
          <div className="settings">
            <nav className="settings__nav" aria-label="Settings sections">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <a key={s.id} className={activeSection === s.id ? 'is-active' : ''} onClick={() => jump(s.id)} role="button" tabIndex={0}>
                    <Icon />
                    {s.label}
                  </a>
                );
              })}
            </nav>

            <div className="stack-6">
              <section id="settings-folders" className="card card--pad stack-4">
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <h2 className="h3">Folders &amp; game</h2>
                    <p className="small muted">Tell the app where your game and mod loader live.</p>
                  </div>
                  <button
                    className="btn btn--soft btn--sm"
                    disabled={detecting}
                    onClick={async () => {
                      setDetecting(true);
                      try {
                        await p.onAutoDiscover();
                      } finally {
                        setDetecting(false);
                      }
                    }}
                  >
                    {detecting ? <Loader2 className="spin" /> : <FolderSearch />}
                    Find automatically
                  </button>
                  {p.onRunSetup && (
                    <button className="btn btn--ghost btn--sm" onClick={p.onRunSetup}>
                      <Wand2 />
                      Run setup again
                    </button>
                  )}
                </div>
                <PathField
                  label="Mods folder"
                  hint="The folder your mod loader reads from. Disabled mods stay here with a DISABLED_ prefix."
                  value={paths.xxmiModsPath}
                  placeholder={config.zzmiRootPath ? `${config.zzmiRootPath}\\Mods` : '%APPDATA%\\XXMI Launcher\\ZZMI\\Mods'}
                  onChange={(v) => setPaths((prev) => ({ ...prev, xxmiModsPath: v }))}
                  onBrowse={() => browse('xxmiModsPath', 'folder')}
                />
                <PathField
                  label="Game"
                  hint="The game’s .exe — used by Play."
                  value={paths.zzzExePath}
                  onChange={(v) => setPaths((prev) => ({ ...prev, zzzExePath: v }))}
                  onBrowse={() => browse('zzzExePath', 'exe')}
                />
                <PathField
                  label="Mod loader"
                  hint="Started before the game when you press Play."
                  value={paths.zzmiLoaderPath}
                  placeholder="%APPDATA%\\XXMI Launcher\\Resources\\Bin\\XXMI Launcher.exe"
                  onChange={(v) => setPaths((prev) => ({ ...prev, zzmiLoaderPath: v }))}
                  onBrowse={() => browse('zzmiLoaderPath', 'exe')}
                />
                {dirty && (
                  <div className="save-bar">
                    <span style={{ flex: 1, fontWeight: 600 }}>You have unsaved changes</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => setPaths(initial)}>
                      Discard
                    </button>
                    <button className="btn btn--primary btn--sm" onClick={save} disabled={saving}>
                      {saving && <Loader2 className="spin" />}
                      Save changes
                    </button>
                  </div>
                )}
              </section>

              <section id="settings-content" className="card card--pad">
                <h2 className="h3">Content filter</h2>
                <p className="small muted" style={{ marginBottom: 16 }}>
                  Choose which mods show up in Browse. Your Library and the mods you install are never filtered or changed.
                </p>
                <Segmented<NsfwFilterState>
                  ariaLabel="Sensitive content"
                  value={p.nsfwFilterState}
                  onChange={p.onChangeNsfw}
                  options={[
                    { value: 'hide', label: 'SFW only', icon: <ShieldCheck /> },
                    { value: 'toggle', label: 'SFW + toggles', icon: <FlaskConical /> },
                    { value: 'blur', label: 'NSFW (blurred)', icon: <EyeOff /> },
                    { value: 'show', label: 'Show all', icon: <Eye /> },
                  ]}
                />
                <p className="caption" style={{ marginTop: 10 }}>
                  {p.nsfwFilterState === 'hide'
                    ? 'Only mods checked as completely safe: no nudity, nothing skimpy or suggestive. Brand new uploads show up once they are checked, usually within an hour.'
                    : p.nsfwFilterState === 'toggle'
                    ? 'Safe mods, plus Experimental mods: safe outfits that come with an optional NSFW toggle. Only their safe pictures are shown.'
                    : p.nsfwFilterState === 'blur'
                    ? 'Every mod, including NSFW ones. NSFW pictures are blurred until you click them.'
                    : 'Every mod with no filtering and no blur.'}
                </p>
              </section>

              <section id="settings-mods" className="card card--pad">
                <h2 className="h3" style={{ marginBottom: 4 }}>
                  Mod behavior
                </h2>
                <div className="setting">
                  <div className="setting__text">
                    <div className="setting__title">One outfit per character</div>
                    <div className="setting__desc">Turning on an outfit turns off that character’s other outfits.</div>
                  </div>
                  <Switch checked={Boolean(config.singleActivePerAgent)} onChange={p.onToggleSingleActive} label="One outfit per character" />
                </div>
                <div className="setting">
                  <div className="setting__text">
                    <div className="setting__title">Apply changes while playing</div>
                    <div className="setting__desc">Reloads mods in the running game every time you switch one on or off.</div>
                  </div>
                  <Switch
                    checked={config.autoSendF10OnToggle ?? true}
                    onChange={() => p.onSaveConfig({ autoSendF10OnToggle: !(config.autoSendF10OnToggle ?? true) })}
                    label="Apply changes while playing"
                  />
                </div>
                <div className="setting">
                  <div className="setting__text">
                    <div className="setting__title">Tidy hotkeys</div>
                    <div className="setting__desc">Gives every mod the same simple J / K / L layout so keys don’t clash.</div>
                  </div>
                  <button className="btn btn--secondary btn--sm" onClick={p.onStandardizeHotkeys}>
                    <Keyboard />
                    Tidy now
                  </button>
                </div>
              </section>

              <section id="settings-library" className="card card--pad">
                <h2 className="h3" style={{ marginBottom: 4 }}>
                  Library tools
                </h2>
                <div className="setting">
                  <div className="setting__text">
                    <div className="setting__title">Tidy folder names</div>
                    <div className="setting__desc">Renames mod folders to “Character – Mod name”. You can undo this.</div>
                  </div>
                  {p.canUndoOrganize && (
                    <button className="btn btn--ghost btn--sm" onClick={p.onUndoOrganize}>
                      Undo
                    </button>
                  )}
                  <button className="btn btn--secondary btn--sm" onClick={p.onOrganizeFolders}>
                    Tidy now
                  </button>
                </div>
                <div className="setting">
                  <div className="setting__text">
                    <div className="setting__title">Import from another launcher</div>
                    <div className="setting__desc">Bring in mods you already have elsewhere — copy or link them.</div>
                  </div>
                  <button className="btn btn--secondary btn--sm" onClick={p.onOpenImport}>
                    Import…
                  </button>
                </div>
              </section>

              <section id="settings-appearance" className="card card--pad">
                <div className="row-3">
                  <ThemeIcon themeId={p.theme.id} size={48} />
                  <div style={{ flex: 1 }}>
                    <h2 className="h3">Appearance</h2>
                    <p className="small muted">
                      Current theme: <strong style={{ color: 'var(--text)' }}>{p.theme.name}</strong>
                    </p>
                  </div>
                  <button className="btn btn--primary btn--sm" onClick={p.onOpenThemes}>
                    <Palette />
                    Browse themes
                  </button>
                </div>
              </section>

              <section id="settings-experimental" className="card card--pad">
                <h2 className="h3" style={{ marginBottom: 4 }}>
                  Experimental
                </h2>
                <p className="small muted" style={{ marginBottom: 8 }}>
                  New features that are still being worked on. They might not work with every mod.
                </p>
                <div className="setting">
                  <div className="setting__text">
                    <div className="setting__title">Mod Workshop</div>
                    <div className="setting__desc">
                      Mix parts from mods you have (hair from one, jacket from another) into your own mod, and share them on the Community tab. Adds a Workshop page under Themes.
                    </div>
                  </div>
                  <Switch
                    checked={Boolean(config.workshopEnabled)}
                    onChange={() => p.onSaveConfig({ workshopEnabled: !config.workshopEnabled })}
                    label="Mod Workshop"
                  />
                </div>
              </section>

              <section id="settings-about" className="card card--pad">
                <h2 className="h3" style={{ marginBottom: 12 }}>
                  About
                </h2>
                <div className="row wrap" style={{ marginBottom: 16, padding: 14, borderRadius: 14, background: 'var(--raised)' }}>
                  <span className="card__icon">
                    <Rocket />
                  </span>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 650 }}>
                      {p.appUpdate.state === 'available'
                        ? `Version ${p.appUpdate.version} is available`
                        : p.appUpdate.state === 'downloading'
                        ? `Downloading ${p.appUpdate.version}… ${p.appUpdate.percent ?? 0}%`
                        : p.appUpdate.state === 'downloaded'
                        ? `Version ${p.appUpdate.version} is ready to install`
                        : p.appUpdate.state === 'installing'
                        ? `Restarting to install ${p.appUpdate.version}…`
                        : p.appUpdate.state === 'checking'
                        ? 'Checking for updates…'
                        : p.appUpdate.state === 'none'
                        ? 'You’re on the latest version'
                        : p.appUpdate.state === 'error'
                        ? 'Couldn’t check for updates'
                        : p.appUpdate.state === 'unsupported'
                        ? 'Automatic updates'
                        : 'App updates'}
                    </div>
                    <div className="small muted">
                      {p.appUpdate.state === 'unsupported'
                        ? 'Works in the installed version of the app (from the Setup file).'
                        : p.appUpdate.state === 'error'
                        ? p.appUpdate.message
                        : 'Click Update now and ProxyLaunch downloads the new version and restarts to install it.'}
                    </div>
                  </div>
                  {p.appUpdate.state === 'available' ? (
                    <button className="btn btn--primary btn--sm" onClick={p.onDownloadAppUpdate}>
                      <ArrowDownToLine />
                      Update now
                    </button>
                  ) : p.appUpdate.state === 'downloaded' ? (
                    <button className="btn btn--primary btn--sm" onClick={p.onInstallAppUpdate}>
                      <RefreshCw />
                      Restart &amp; update
                    </button>
                  ) : (
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={p.onCheckAppUpdate}
                      disabled={p.appUpdate.state === 'unsupported' || p.appUpdate.state === 'checking' || p.appUpdate.state === 'downloading' || p.appUpdate.state === 'installing'}
                    >
                      {p.appUpdate.state === 'checking' ? <Loader2 className="spin" /> : <RefreshCw />}
                      Check for updates
                    </button>
                  )}
                </div>
                <dl className="kv">
                  <dt>Version</dt>
                  <dd>{p.appUpdate.current || p.appVersion}</dd>
                  <dt>Compatibility data</dt>
                  <dd>Game version {shortVersion(p.hashDb.game_patch)}</dd>
                  <dt>Characters known</dt>
                  <dd>{Object.keys(p.hashDb.agents).length}</dd>
                </dl>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
