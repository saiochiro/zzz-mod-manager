import { HeroDecor } from '../ui/HeroDecor';
import React, { useMemo, useState } from 'react';
import {
  ArrowUpCircle,
  CheckCircle2,
  FolderInput,
  FolderSearch,
  Gamepad2,
  History,
  ImageDown,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { AppConfig, FairyLogEntry, HashDatabase } from '../shared/types';
import type { ThemeDefinition } from '../themes/types';
import { Motif } from '../themes/Motif';
import { ActivityItem } from '../components/FairyAssistantHud';
import { EmptyState, Segmented, relativeTime, shortVersion } from '../ui';

export interface FolderStatus {
  path: string;
  isValid: boolean;
  detectedVia: string;
}

interface SyncScreenProps {
  modUpdateCount: number;
  modUpdatesLastChecked: string | null;
  checkingModUpdates: boolean;
  onCheckModUpdates: () => void;
  onUpdateAllMods: () => void;
  updatingMods: boolean;
  theme: ThemeDefinition;
  config: AppConfig;
  hashDb: HashDatabase;
  logs: FairyLogEntry[];
  modsCount: number;
  folderStatus: FolderStatus | null;
  folderStatusError: string | null;
  lastSyncAt: Date | null;
  isSyncing: boolean;
  onSync: () => void;
  onAutoDetect: () => Promise<void>;
  onOpenImport: () => void;
  onFetchPreviews: () => Promise<string>;
  onUpdateHashDb: () => Promise<void>;
  onSelectMod: (uuid: string) => void;
  onOpenSettings: () => void;
}

function shortPath(p: string): string {
  if (!p) return '';
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…\\${parts.slice(-3).join('\\')}` : p;
}

export const SyncScreen: React.FC<SyncScreenProps> = (p) => {
  const [logFilter, setLogFilter] = useState<'all' | 'problems'>('all');
  const [busy, setBusy] = useState<null | 'detect' | 'previews' | 'hashdb'>(null);
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  const status = p.folderStatus;
  const connected = Boolean(status?.isValid);
  const checking = !status && !p.folderStatusError;
  const gameSet = Boolean(p.config.zzzExePath);
  const loaderSet = Boolean(p.config.zzmiLoaderPath);

  const logs = useMemo(
    () => (logFilter === 'problems' ? p.logs.filter((l) => l.level === 'warning' || l.level === 'error') : p.logs),
    [p.logs, logFilter]
  );

  const run = async (kind: 'detect' | 'previews' | 'hashdb', fn: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const heroTitle = checking ? 'Checking your setup…' : connected ? 'Everything’s connected' : 'Mods folder not found';
  const heroSub = checking
    ? 'Looking for your mods folder.'
    : connected
    ? `${p.modsCount} mod${p.modsCount === 1 ? '' : 's'} in sync${p.lastSyncAt ? ` · last checked ${relativeTime(p.lastSyncAt)}` : ''}.`
    : 'Point the app at your mod loader’s Mods folder so changes reach the game.';

  return (
    <div className="screen">
      <div className="scroll">
        <section className="page-hero">
          <Motif kind={p.theme.motif} className="page-hero__motif" density={20} opacity={0.5} seed="sync" animated />
          <HeroDecor />
          <div className="page-hero__glow" />
          <div className="page-hero__content">
            <div className="row-3 min-w-0" style={{ alignItems: 'center', gap: 20 }}>
              <span
                className={`empty__art ${connected ? '' : checking ? 'empty__art--muted' : 'empty__art--error'}`}
                style={{ margin: 0, animation: 'none', width: 64, height: 64, borderRadius: 20 }}
              >
                {checking ? <Loader2 className="spin" /> : connected ? <ShieldCheck /> : <XCircle />}
              </span>
              <div className="min-w-0">
                <div className="eyebrow">Sync</div>
                <h1 className="display page-hero__title">{heroTitle}</h1>
                <p className="page-hero__subtitle">{heroSub}</p>
              </div>
            </div>
            <div className="row wrap">
              {!connected && !checking && (
                <button className="btn btn--secondary" onClick={() => run('detect', p.onAutoDetect)} disabled={busy === 'detect'}>
                  {busy === 'detect' ? <Loader2 className="spin" /> : <FolderSearch />}
                  Find automatically
                </button>
              )}
              <button className="btn btn--primary" onClick={p.onSync} disabled={p.isSyncing}>
                <RefreshCw className={p.isSyncing ? 'spin' : ''} />
                {p.isSyncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          </div>
        </section>

        <div className="page-body stack-6">
          {p.folderStatusError && (
            <div className="banner banner--error">
              <XCircle />
              <span style={{ flex: 1 }}>Couldn’t check the mods folder: {p.folderStatusError}</span>
              <button className="btn btn--sm btn--secondary" onClick={p.onOpenSettings}>
                Open settings
              </button>
            </div>
          )}

          <div className="sync-grid">
            <div className="card card--pad">
              <div className="card__header">
                <span className={`card__icon ${p.modUpdateCount ? '' : 'card__icon--success'}`}>
                  <ArrowUpCircle />
                </span>
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>Mod updates</div>
                  <div className="caption">
                    {p.checkingModUpdates
                      ? 'Checking GameBanana…'
                      : p.modUpdatesLastChecked
                      ? `Last checked ${relativeTime(p.modUpdatesLastChecked)}`
                      : 'Checks automatically every few hours'}
                  </div>
                </div>
                {p.modUpdateCount > 0 ? (
                  <span className="badge badge--primary">{p.modUpdateCount} available</span>
                ) : (
                  <span className="badge badge--success">
                    <CheckCircle2 />
                    Up to date
                  </span>
                )}
              </div>
              <div className="row">
                <button className="btn btn--secondary btn--sm" onClick={p.onCheckModUpdates} disabled={p.checkingModUpdates}>
                  {p.checkingModUpdates ? <Loader2 className="spin" /> : <RefreshCw />}
                  Check now
                </button>
                {p.modUpdateCount > 0 && (
                  <button className="btn btn--primary btn--sm" onClick={p.onUpdateAllMods} disabled={p.updatingMods}>
                    {p.updatingMods ? <Loader2 className="spin" /> : <ArrowUpCircle />}
                    Update all
                  </button>
                )}
              </div>
            </div>

            <div className="card card--pad">
              <div className="card__header">
                <span className={`card__icon ${connected ? 'card__icon--success' : checking ? '' : 'card__icon--error'}`}>
                  <FolderInput />
                </span>
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>Mods folder</div>
                  <div className="caption">{status?.detectedVia ? `Found via ${status.detectedVia}` : 'Where your loader reads mods from'}</div>
                </div>
                {checking ? (
                  <span className="badge">Checking…</span>
                ) : connected ? (
                  <span className="badge badge--success">
                    <CheckCircle2 />
                    Connected
                  </span>
                ) : (
                  <span className="badge badge--error">
                    <XCircle />
                    Not found
                  </span>
                )}
              </div>
              {status?.path && (
                <div className="mono small truncate muted" title={status.path} style={{ marginBottom: 12 }}>
                  {shortPath(status.path)}
                </div>
              )}
              <div className="row">
                <button className="btn btn--secondary btn--sm" onClick={p.onOpenSettings}>
                  <Settings2 />
                  Change folder
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => run('detect', p.onAutoDetect)} disabled={busy === 'detect'}>
                  {busy === 'detect' ? <Loader2 className="spin" /> : <FolderSearch />}
                  Auto-detect
                </button>
              </div>
            </div>

            <div className="card card--pad">
              <div className="card__header">
                <span className={`card__icon ${gameSet && loaderSet ? 'card__icon--success' : 'card__icon--warning'}`}>
                  <Gamepad2 />
                </span>
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>Game &amp; loader</div>
                  <div className="caption">Needed for the Play button</div>
                </div>
              </div>
              <div className="stack" style={{ marginBottom: 12 }}>
                <div className="row">
                  <span style={{ flex: 1 }}>Game</span>
                  <span className={`badge ${gameSet ? 'badge--success' : 'badge--warning'}`}>{gameSet ? 'Set' : 'Not set'}</span>
                </div>
                <div className="row">
                  <span style={{ flex: 1 }}>Mod loader</span>
                  <span className={`badge ${loaderSet ? 'badge--success' : 'badge--warning'}`}>{loaderSet ? 'Set' : 'Not set'}</span>
                </div>
              </div>
              <button className="btn btn--secondary btn--sm" onClick={p.onOpenSettings}>
                <Settings2 />
                Set up
              </button>
            </div>

            <div className="card card--pad">
              <div className="card__header">
                <span className="card__icon">
                  <ShieldCheck />
                </span>
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>Compatibility data</div>
                  <div className="caption">Keeps the auto-fixer up to date after game patches</div>
                </div>
              </div>
              <div className="row" style={{ marginBottom: 12 }}>
                <span className="badge badge--primary truncate" style={{ maxWidth: '60%' }} title={p.hashDb.game_patch}>
                  Game version {shortVersion(p.hashDb.game_patch)}
                </span>
                <span className="caption">updated {relativeTime(p.hashDb.last_synced) || 'never'}</span>
              </div>
              <button className="btn btn--secondary btn--sm" onClick={() => run('hashdb', p.onUpdateHashDb)} disabled={busy === 'hashdb'}>
                {busy === 'hashdb' ? <Loader2 className="spin" /> : <RefreshCw />}
                Check for updates
              </button>
            </div>

            <div className="card card--pad">
              <div className="card__header">
                <span className="card__icon">
                  <ImageDown />
                </span>
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>Cover images</div>
                  <div className="caption">Download missing covers for mods you added by hand</div>
                </div>
              </div>
              {previewResult && <p className="small muted" style={{ marginBottom: 12 }}>{previewResult}</p>}
              <div className="row">
                <button
                  className="btn btn--secondary btn--sm"
                  disabled={busy === 'previews'}
                  onClick={() => run('previews', async () => setPreviewResult(await p.onFetchPreviews()))}
                >
                  {busy === 'previews' ? <Loader2 className="spin" /> : <ImageDown />}
                  {busy === 'previews' ? 'Looking…' : 'Find missing covers'}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={p.onOpenImport}>
                  <FolderInput />
                  Import mods
                </button>
              </div>
            </div>
          </div>

          <section className="card card--pad">
            <div className="row" style={{ marginBottom: 8 }}>
              <History style={{ width: 18, height: 18, color: 'var(--primary-text)' }} />
              <h2 style={{ fontWeight: 650, fontSize: 'var(--fs-lead)', flex: 1 }}>Activity</h2>
              <Segmented
                ariaLabel="Filter activity"
                value={logFilter}
                onChange={setLogFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'problems', label: 'Problems' },
                ]}
              />
            </div>
            {logs.length === 0 ? (
              <EmptyState icon={<History />} title={logFilter === 'problems' ? 'No problems' : 'No activity yet'} tone="muted" compact>
                {logFilter === 'problems' ? 'Nothing has gone wrong recently.' : 'Installs, fixes and syncs will appear here.'}
              </EmptyState>
            ) : (
              <div className="timeline">
                {logs.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} onSelectMod={p.onSelectMod} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
