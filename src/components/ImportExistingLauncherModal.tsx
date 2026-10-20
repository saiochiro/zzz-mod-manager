import React, { useEffect, useState } from 'react';
import { ExternalLauncherDetection } from '../shared/types';
import { fairyClient } from '../services/fairyClient';
import { ArrowRightLeft, CheckCircle2, Copy, FolderOpen, FolderSearch, Link2, Loader2, X, XCircle } from 'lucide-react';
import { Modal, Switch } from '../ui';

interface ImportExistingLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (count: number) => void;
}

export const ImportExistingLauncherModal: React.FC<ImportExistingLauncherModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [detectedLaunchers, setDetectedLaunchers] = useState<ExternalLauncherDetection[]>([]);
  const [customPath, setCustomPath] = useState('');
  const [transferMode, setTransferMode] = useState<'copy' | 'symlink'>('copy');
  const [setAsDefaultHandler, setSetAsDefaultHandler] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      scanForLaunchers();
      setLogs([]);
      setError(null);
    }
  }, [isOpen]);

  const scanForLaunchers = async () => {
    setIsScanning(true);
    try {
      const detailed = await fairyClient.detectExternalLaunchersDetailed();
      setDetectedLaunchers(detailed || []);
      if (detailed && detailed.length > 0 && !customPath) {
        setCustomPath(detailed[0].path);
      }
    } catch {
      const paths = await fairyClient.scanExternalLaunchers();
      setDetectedLaunchers(
        paths.map((p) => ({
          id: p,
          name: 'External Mods Folder',
          type: '3DMigoto',
          path: p,
          modsCount: 0,
          description: 'Detected local Mods folder',
        }))
      );
      if (paths.length > 0 && !customPath) {
        setCustomPath(paths[0]);
      }
    } finally {
      setIsScanning(false);
    }
  };

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    const selected = await fairyClient.selectLocalArchiveOrFolder('folder');
    if (selected) {
      setCustomPath(selected);
    }
  };

  const handleRunMigration = async (targetPath: string) => {
    if (!targetPath.trim()) return;
    setIsImporting(true);
    setError(null);
    try {
      if (setAsDefaultHandler) {
        await fairyClient.updateConfig({ defaultModHandler: true });
      }
      const res = await fairyClient.importExistingFolder(targetPath.trim(), transferMode);
      setLogs(res.logs);
      if (res.importedCount > 0) {
        setTimeout(() => {
          onImportSuccess(res.importedCount);
          onClose();
        }, 1000);
      } else {
        setError('No mod folders containing .ini files were found in that directory.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to migrate mods from folder.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} size="wide" labelledBy="import-title">
      <div className="modal__header modal__header--hero">
        <span className="card__icon">
          <ArrowRightLeft />
        </span>
        <div style={{ flex: 1 }}>
          <h2 id="import-title" className="h3">
            Import your existing mods
          </h2>
          <p className="small muted">Bring in mods from another launcher. Your originals stay where they are.</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <X />
        </button>
      </div>

      <div className="modal__body">
        <div className="stack">
          <span className="field__label">1. Pick where your mods are</span>
          {isScanning ? (
            <div className="row small muted" style={{ padding: '12px 0' }}>
              <Loader2 className="spin" style={{ width: 18, height: 18 }} />
              Looking for other launchers on this PC…
            </div>
          ) : detectedLaunchers.length === 0 ? (
            <div className="banner">
              <FolderSearch />
              <span>No other launchers found automatically. Choose the folder yourself below.</span>
            </div>
          ) : (
            <div className="stack" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {detectedLaunchers.map((launcher) => {
                const selected = customPath === launcher.path;
                return (
                  <button
                    key={launcher.id}
                    type="button"
                    onClick={() => setCustomPath(launcher.path)}
                    className="row-3"
                    aria-pressed={selected}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      textAlign: 'left',
                      background: selected ? 'var(--primary-soft)' : 'var(--raised)',
                      border: `1px solid ${selected ? 'var(--primary-border)' : 'var(--border)'}`,
                      transition: 'background var(--t-fast), border-color var(--t-fast)',
                    }}
                  >
                    <span className="card__icon" style={{ width: 36, height: 36 }}>
                      <FolderOpen />
                    </span>
                    <span className="min-w-0" style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: 650 }}>{launcher.name}</span>
                      <span className="caption truncate" style={{ display: 'block' }} title={launcher.path}>
                        {launcher.modsCount} mod folder{launcher.modsCount === 1 ? '' : 's'} · {launcher.path}
                      </span>
                    </span>
                    {selected && <CheckCircle2 style={{ width: 20, height: 20, color: 'var(--primary-text)' }} />}
                  </button>
                );
              })}
            </div>
          )}
          <div className="path-field">
            <input
              className="input input--mono"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="C:\Users\You\AppData\Roaming\XXMI Launcher\ZZMI\Mods"
              aria-label="Folder to import from"
              spellCheck={false}
            />
            <button type="button" className="btn btn--secondary" onClick={handleBrowseFolder}>
              <FolderOpen />
              Browse
            </button>
          </div>
        </div>

        <div className="stack">
          <span className="field__label">2. Copy or link?</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {(
              [
                { id: 'copy', icon: Copy, title: 'Copy them', desc: 'Safest. Makes a separate copy; the other launcher is untouched.' },
                { id: 'symlink', icon: Link2, title: 'Link them', desc: 'Uses no extra disk space. Both launchers share the same files.' },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = transferMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTransferMode(opt.id)}
                  className="row-3"
                  style={{
                    alignItems: 'flex-start',
                    padding: 14,
                    borderRadius: 14,
                    textAlign: 'left',
                    background: selected ? 'var(--primary-soft)' : 'var(--raised)',
                    border: `1px solid ${selected ? 'var(--primary-border)' : 'var(--border)'}`,
                  }}
                >
                  <Icon style={{ width: 20, height: 20, color: 'var(--primary-text)', flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <span style={{ display: 'block', fontWeight: 650 }}>{opt.title}</span>
                    <span className="small muted">{opt.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="setting" style={{ paddingBottom: 0 }}>
          <div className="setting__text">
            <div className="setting__title">Make this app my main mod manager</div>
            <div className="setting__desc">Avoids two launchers loading mods at the same time.</div>
          </div>
          <Switch checked={setAsDefaultHandler} onChange={() => setSetAsDefaultHandler(!setAsDefaultHandler)} label="Make this app my main mod manager" />
        </div>

        {error && (
          <div className="banner banner--error">
            <XCircle />
            <span>{error}</span>
          </div>
        )}

        {logs.length > 0 && (
          <div className="banner banner--success" style={{ alignItems: 'flex-start' }}>
            <CheckCircle2 />
            <div className="stack" style={{ gap: 2, maxHeight: 120, overflowY: 'auto' }}>
              {logs.map((l, i) => (
                <span key={i} className="small">
                  {l}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="modal__footer">
        <button className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn--primary" onClick={() => handleRunMigration(customPath)} disabled={!customPath.trim() || isImporting}>
          {isImporting ? <Loader2 className="spin" /> : transferMode === 'symlink' ? <Link2 /> : <Copy />}
          {isImporting ? 'Importing…' : transferMode === 'symlink' ? 'Link mods' : 'Import mods'}
        </button>
      </div>
    </Modal>
  );
};
