import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Loader2, RefreshCw, Rocket, X } from 'lucide-react';
import { fairyClient, AppUpdateStatus } from '../services/fairyClient';
import type { GameBananaModItem, ModManifest } from '../shared/types';
import { Modal } from './index';

/* ------------------------------------------------------------------ */
/* App self-update                                                     */
/* ------------------------------------------------------------------ */
export function useAppUpdate() {
  const [status, setStatus] = useState<AppUpdateStatus>({ state: 'idle', current: '' });
  useEffect(() => {
    fairyClient.getUpdateStatus().then(setStatus).catch(() => {});
    return fairyClient.onUpdateStatus(setStatus);
  }, []);
  const check = useCallback(async () => {
    setStatus((s) => ({ ...s, state: s.state === 'unsupported' ? 'unsupported' : 'checking' }));
    const next = await fairyClient.checkForAppUpdates().catch(() => null);
    if (next) setStatus(next);
  }, []);
  const download = useCallback(() => fairyClient.downloadAppUpdate(), []);
  const install = useCallback(() => fairyClient.installAppUpdate(), []);
  return { status, check, download, install };
}

/** Pops up when a new version of the app is published on GitHub. */
export const AppUpdatePrompt: React.FC<{
  status: AppUpdateStatus;
  onDownload: () => void;
  onInstall: () => void;
}> = ({ status, onDownload, onInstall }) => {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const relevant = status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded';
  const open = relevant && dismissed !== `${status.version}:${status.state === 'downloaded' ? 'ready' : 'offer'}`;
  const close = () => setDismissed(`${status.version}:${status.state === 'downloaded' ? 'ready' : 'offer'}`);

  return (
    <Modal open={open} onClose={close} labelledBy="update-title">
      <div className="modal__header modal__header--hero">
        <span className="card__icon">
          <Rocket />
        </span>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">{status.state === 'downloaded' ? 'Ready to install' : 'Update available'}</div>
          <h2 id="update-title" className="h3">
            Version {status.version}
          </h2>
          <p className="small muted">You have version {status.current}.</p>
        </div>
        <button className="icon-btn" onClick={close} aria-label="Close">
          <X />
        </button>
      </div>
      <div className="modal__body">
        {status.notes ? (
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              What’s new
            </div>
            <p className="prose" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {status.notes}
            </p>
          </div>
        ) : (
          <p className="muted">A new version of ProxyLaunch is ready to download.</p>
        )}
        {status.state === 'downloading' && (
          <div className="stack">
            <div className="row small">
              <span style={{ flex: 1 }}>Downloading…</span>
              <span className="muted">{status.percent ?? 0}%</span>
            </div>
            <div className="progress">
              <span style={{ width: `${status.percent ?? 0}%` }} />
            </div>
          </div>
        )}
        <p className="caption">Your mods, settings and themes are kept.</p>
      </div>
      <div className="modal__footer">
        <button className="btn btn--ghost" onClick={close}>
          Later
        </button>
        {status.state === 'downloaded' ? (
          <button className="btn btn--primary" onClick={onInstall}>
            <RefreshCw />
            Restart &amp; update
          </button>
        ) : (
          <button className="btn btn--primary" onClick={onDownload} disabled={status.state === 'downloading'}>
            {status.state === 'downloading' ? <Loader2 className="spin" /> : <ArrowDownToLine />}
            {status.state === 'downloading' ? 'Downloading…' : 'Update now'}
          </button>
        )}
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Mod updates (GameBanana)                                            */
/* ------------------------------------------------------------------ */
const MOD_CHECK_KEY = 'zzz_mod_update_check';
const MOD_IGNORE_KEY = 'zzz_mod_update_ignore';
const AUTO_INTERVAL_MS = 6 * 60 * 60 * 1000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** A GameBanana mod has an update when it was changed on a later day than you installed it. */
function isNewer(profile: GameBananaModItem, mod: ModManifest): boolean {
  if (!profile.is_live_api || !profile.updated_at || !mod.installed_at) return false;
  return profile.updated_at.slice(0, 10) > mod.installed_at.slice(0, 10);
}

export function useModUpdates(mods: ModManifest[] | null) {
  const [updates, setUpdates] = useState<Record<string, GameBananaModItem>>({});
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(() => readJson<{ at?: string }>(MOD_CHECK_KEY, {}).at ?? null);
  const [ignored, setIgnored] = useState<Record<string, string>>(() => readJson(MOD_IGNORE_KEY, {}));
  const modsRef = useRef(mods);
  modsRef.current = mods;
  const runningRef = useRef(false);

  const check = useCallback(async () => {
    const list = (modsRef.current ?? []).filter((m) => m.gamebanana_id);
    if (runningRef.current) return { found: 0, checked: 0 };
    runningRef.current = true;
    setChecking(true);
    const found: Record<string, GameBananaModItem> = {};
    const byId = new Map<number, ModManifest[]>();
    for (const m of list) {
      const id = Number(m.gamebanana_id);
      byId.set(id, [...(byId.get(id) ?? []), m]);
    }
    let checked = 0;
    for (const [id, group] of byId) {
      try {
        const profile = await fairyClient.fetchGameBananaMod(id);
        checked++;
        for (const m of group) {
          if (isNewer(profile, m)) found[m.mod_uuid] = profile;
        }
      } catch {
        // offline or mod removed — skip quietly
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    const at = new Date().toISOString();
    writeJson(MOD_CHECK_KEY, { at });
    setLastChecked(at);
    setUpdates(found);
    setChecking(false);
    runningRef.current = false;
    return { found: Object.keys(found).length, checked };
  }, []);

  // Automatic check shortly after launch, at most every 6 hours.
  const hasMods = Boolean(mods && mods.length);
  useEffect(() => {
    if (!hasMods) return;
    const last = lastChecked ? Date.parse(lastChecked) : 0;
    const due = Date.now() - last > AUTO_INTERVAL_MS;
    const t = window.setTimeout(() => check(), due ? 8000 : 20000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMods]);

  const ignore = useCallback((uuid: string, profile: GameBananaModItem) => {
    setIgnored((prev) => {
      const next = { ...prev, [uuid]: profile.updated_at };
      writeJson(MOD_IGNORE_KEY, next);
      return next;
    });
  }, []);

  const clear = useCallback((uuid: string) => {
    setUpdates((prev) => {
      const next = { ...prev };
      delete next[uuid];
      return next;
    });
  }, []);

  // Drop results for mods that no longer exist; hide ignored ones.
  const visible: Record<string, GameBananaModItem> = {};
  const present = new Set((mods ?? []).map((m) => m.mod_uuid));
  for (const [uuid, p] of Object.entries(updates)) {
    if (present.has(uuid) && ignored[uuid] !== p.updated_at) visible[uuid] = p;
  }

  return { updates: visible, checking, lastChecked, check, ignore, clear };
}
