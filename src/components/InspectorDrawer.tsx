import { groupToggles } from '../shared/hotkeys';
import React, { useEffect, useState } from 'react';
import {
  ArrowUpCircle,
  Loader2,
  ChevronRight,
  ClipboardPaste,
  ExternalLink,
  FolderOpen,
  ImagePlus,
  Keyboard,
  Repeat,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { AgentHashEntry, GameBananaModItem, ModManifest, ParsedIniDocument } from '../shared/types';
import type { MotifKind } from '../themes/types';
import { Avatar, Switch, ThumbImage, useEscape } from '../ui';
import type { FullAppState } from '../services/fairyClient';
import { formatBytes, getModHealth, HEALTH_META } from '../ui/modStatus';

interface InspectorDrawerProps {
  update?: GameBananaModItem | null;
  isUpdating?: boolean;
  onUpdate?: () => void;
  onIgnoreUpdate?: () => void;
  mod: ModManifest | null;
  agent: AgentHashEntry | null;
  motif: MotifKind;
  iniDocuments: ParsedIniDocument[];
  masterSwapContent: string | null;
  isLoadingDetails: boolean;
  onClose: () => void;
  onToggleEnabled: (modUuid: string) => void;
  onRemapKey: (modUuid: string, sectionName: string, newKey: string) => void;
  onStandardizeAll: () => void;
  onRepairMod: (modUuid: string) => void;
  onUndoRepair: (modUuid: string) => void;
  onToggleHCycle: (modUuid: string) => void;
  /** File Explorer opens with this mod's folder selected. */
  onOpenFolder?: (modUuid: string) => void;
  onSetCustomImageFile?: (modUuid: string) => void;
  onPasteThumbnailFromClipboard?: (modUuid: string) => void;
  /** After you change the mod's content label. */
  onStateChange?: (s: FullAppState) => void;
}

type Tab = 'overview' | 'hotkeys' | 'advanced';

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  update,
  isUpdating,
  onUpdate,
  onIgnoreUpdate,
  mod,
  agent,
  motif,
  iniDocuments,
  masterSwapContent,
  isLoadingDetails,
  onClose,
  onToggleEnabled,
  onRemapKey,
  onStandardizeAll,
  onRepairMod,
  onUndoRepair,
  onToggleHCycle,
  onOpenFolder,
  onSetCustomImageFile,
  onPasteThumbnailFromClipboard,
  onStateChange,
}) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [capturing, setCapturing] = useState<string | null>(null);
  useEscape(onClose, !capturing);
  useEffect(() => {
    setCapturing(null);
  }, [mod?.mod_uuid]);

  if (!mod) return null;

  const health = getModHealth(mod);
  const meta = HEALTH_META[health];
  const HealthIcon = meta.icon;
  const isRepaired = Boolean(mod.repair_state?.is_repaired);
  const parts = mod.parts && mod.parts.length > 0 ? mod.parts : [];
  const size = formatBytes(mod.file_size_bytes);

  /** A row can stand for the same option in several files: change all of them together. */
  const onCaptureKey = (e: React.KeyboardEvent, sections: string[]) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setCapturing(null);
      return;
    }
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    for (const section of sections) onRemapKey(mod.mod_uuid, section, e.key.toUpperCase());
    setCapturing(null);
  };

  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="details-title">
        <div className="details__hero">
          <ThumbImage src={mod.thumbnail_url} fallbacks={mod.preview_images} alt={mod.title} motif={motif} loading="eager" />
          <div className="details__hero-shade" />
          <button className="icon-btn details__close" onClick={onClose} aria-label="Close details">
            <X />
          </button>
        </div>

        <div className="details__head stack">
          <div className="row wrap">
            {agent ? (
              <span className="badge">
                <Avatar src={agent.gb_icon_url} fallbackSrc={agent.portrait_svg} alt={agent.display_name} />
                {agent.display_name}
              </span>
            ) : (
              <span className="badge">{mod.category_tag && mod.category_tag !== 'Skins' ? mod.category_tag : 'UI & effects'}</span>
            )}
            <span className={`badge badge--${meta.tone}`}>
              <HealthIcon />
              {meta.label}
            </span>
          </div>
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div className="min-w-0" style={{ flex: 1 }}>
              <h2 id="details-title" className="h3" style={{ fontSize: '1.4rem' }}>
                {mod.title}
              </h2>
              <div className="muted small">
                by {mod.author || 'Unknown'}
                {mod.version ? ` · v${mod.version}` : ''}
                {size ? ` · ${size}` : ''}
              </div>
            </div>
            <div className="row" style={{ paddingTop: 4 }}>
              <span className="small muted">{mod.enabled ? 'On' : 'Off'}</span>
              <Switch size="lg" checked={mod.enabled} onChange={() => onToggleEnabled(mod.mod_uuid)} label={mod.enabled ? 'Turn off' : 'Turn on'} />
            </div>
          </div>
        </div>

        <div className="details__tabs" role="tablist">
          {(
            [
              ['overview', 'Overview'],
              ['hotkeys', `Hotkeys${mod.sub_toggles.length ? ` · ${groupToggles(mod.sub_toggles).length}` : ''}`],
              ['advanced', 'Advanced'],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="details__body" key={tab} style={{ animation: 'fade-up 220ms var(--ease-out)' }}>
          {tab === 'overview' && (
            <>
              {(update || isUpdating) && (
                <div className="banner" style={{ alignItems: 'flex-start', background: 'var(--primary-soft)', borderColor: 'var(--primary-border)' }}>
                  <ArrowUpCircle style={{ color: 'var(--primary-text)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 650 }}>New version available</div>
                    <div className="muted">
                      {update ? `The creator updated this mod on ${update.updated_at}. ` : ''}Your current version is kept as a
                      backup. Hotkeys and a custom cover may reset.
                    </div>
                  </div>
                  <div className="stack" style={{ gap: 4 }}>
                    <button className="btn btn--primary btn--sm" onClick={onUpdate} disabled={isUpdating}>
                      {isUpdating ? <Loader2 className="spin" /> : <ArrowUpCircle />}
                      {isUpdating ? 'Updating…' : 'Update'}
                    </button>
                    {update && onIgnoreUpdate && !isUpdating && (
                      <button className="btn btn--ghost btn--sm" onClick={onIgnoreUpdate}>
                        Skip this version
                      </button>
                    )}
                  </div>
                </div>
              )}
              {health !== 'working' && (
                <div className={`banner banner--${meta.tone}`} style={{ alignItems: 'flex-start' }}>
                  <HealthIcon />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 650 }}>{meta.label}</div>
                    <div className="muted">{meta.description}</div>
                    {health === 'broken' && mod.missing_resources && mod.missing_resources.length > 0 && (
                      <div className="caption" style={{ marginTop: 6 }}>
                        {mod.missing_resources.length} file{mod.missing_resources.length === 1 ? '' : 's'} missing — see Advanced for the list.
                      </div>
                    )}
                  </div>
                  {health === 'fixable' && (
                    <button className="btn btn--sm" style={{ background: 'var(--warning-solid)', color: '#1a1205' }} onClick={() => onRepairMod(mod.mod_uuid)}>
                      <Wand2 />
                      Fix now
                    </button>
                  )}
                </div>
              )}
              {isRepaired && (
                <div className="banner banner--success">
                  <Sparkles />
                  <span style={{ flex: 1 }}>Updated for the current game version. Your original files are backed up.</span>
                  <button className="btn btn--ghost btn--sm" onClick={() => onUndoRepair(mod.mod_uuid)}>
                    <RotateCcw />
                    Undo
                  </button>
                </div>
              )}

              {mod.description ? (
                <div className="card card--pad">
                  <div className="eyebrow" style={{ marginBottom: 8 }}>
                    About this mod
                  </div>
                  <p className="prose" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {mod.description}
                  </p>
                </div>
              ) : null}

              {parts.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>
                    Changes
                  </div>
                  <div className="chip-row">
                    {parts.map((p) => (
                      <span key={p} className="badge badge--primary">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {agent && (
                <div className="card card--pad">
                  <div className="row-3">
                    <span className="card__icon">
                      <Repeat />
                    </span>
                    <div className="min-w-0" style={{ flex: 1 }}>
                      <div style={{ fontWeight: 650 }}>Outfit rotation</div>
                      <div className="small muted">
                        Swap between {agent.display_name}&apos;s active outfits in game by pressing H.
                      </div>
                    </div>
                    <Switch checked={mod.in_h_swap_cycle} onChange={() => onToggleHCycle(mod.mod_uuid)} label="Include in outfit rotation" />
                  </div>
                </div>
              )}

              <div className="row wrap">
                {onOpenFolder && (
                  <button className="btn btn--secondary btn--sm" onClick={() => onOpenFolder(mod.mod_uuid)}>
                    <FolderOpen />
                    Find in File Explorer
                  </button>
                )}
                {onSetCustomImageFile && (
                  <button className="btn btn--secondary btn--sm" onClick={() => onSetCustomImageFile(mod.mod_uuid)}>
                    <ImagePlus />
                    Change cover
                  </button>
                )}
                {onPasteThumbnailFromClipboard && (
                  <button className="btn btn--secondary btn--sm" onClick={() => onPasteThumbnailFromClipboard(mod.mod_uuid)}>
                    <ClipboardPaste />
                    Paste cover
                  </button>
                )}
                {mod.gamebanana_id && (
                  <a className="btn btn--ghost btn--sm" href={`https://gamebanana.com/mods/${mod.gamebanana_id}`} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Mod page
                  </a>
                )}
              </div>
            </>
          )}

          {tab === 'hotkeys' && (
            <>
              <div className="row">
                <p className="small muted" style={{ flex: 1 }}>
                  Click a key, then press the new key you want. Changes save straight to the mod.
                </p>
                {mod.sub_toggles.length > 0 && (
                  <button className="btn btn--soft btn--sm" onClick={onStandardizeAll} title="Give every mod the same simple J / K / L layout">
                    <Keyboard />
                    Tidy all hotkeys
                  </button>
                )}
              </div>
              {mod.sub_toggles.length === 0 ? (
                <div className="empty" style={{ padding: '32px 20px' }}>
                  <div className="empty__art empty__art--muted">
                    <Keyboard />
                  </div>
                  <h3 style={{ fontSize: '1rem' }}>No hotkeys</h3>
                  <p className="small">This mod doesn&apos;t have any in-game toggles.</p>
                </div>
              ) : (
                <div className="stack">
                  {groupToggles(mod.sub_toggles).map(({ toggle: t, sections, files }) => {
                    const rowId = `${t.variable}|${t.current_key}`;
                    const isCap = capturing === rowId;
                    return (
                      <div key={rowId} className={`hotkey-row ${isCap ? 'is-capturing' : ''}`}>
                        <div className="min-w-0" style={{ flex: 1 }}>
                          <div className="truncate" style={{ fontWeight: 600 }}>
                            {t.label}
                          </div>
                          <div className="caption">
                            {t.states.length > 1 ? `${t.states.length} options` : 'On / off'}
                            {files > 1 ? ` · used in ${files} files` : ''}
                          </div>
                        </div>
                        {isCap ? (
                          <button
                            className="btn btn--primary btn--sm"
                            autoFocus
                            onKeyDown={(e) => onCaptureKey(e, sections)}
                            onBlur={() => setCapturing(null)}
                          >
                            Press a key…
                          </button>
                        ) : (
                          <button className="kbd" onClick={() => setCapturing(rowId)} title="Click to change">
                            {t.current_key}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'advanced' && (
            <>
              <div className="card card--pad">
                <div className="eyebrow" style={{ marginBottom: 12 }}>
                  Files
                </div>
                <dl className="kv">
                  <dt>Folder</dt>
                  <dd className="mono small">{mod.folder_name}</dd>
                  <dt>Location</dt>
                  <dd className="mono small">{mod.install_path}</dd>
                  {mod.previous_folder_name && (
                    <>
                      <dt>Previous name</dt>
                      <dd className="mono small">{mod.previous_folder_name}</dd>
                    </>
                  )}
                  {size && (
                    <>
                      <dt>Size</dt>
                      <dd>{size}</dd>
                    </>
                  )}
                  <dt>Installed</dt>
                  <dd>{mod.installed_at ? new Date(mod.installed_at).toLocaleString() : '—'}</dd>
                </dl>
              </div>

              {health === 'broken' && mod.missing_resources && mod.missing_resources.length > 0 && (
                <div className="card card--pad">
                  <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--error)' }}>
                    Missing files
                  </div>
                  <ul className="stack">
                    {mod.missing_resources.map((f) => (
                      <li key={f} className="mono small truncate" title={f}>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="card card--pad">
                <div className="row" style={{ marginBottom: 12 }}>
                  <span className="eyebrow" style={{ flex: 1 }}>
                    Compatibility
                  </span>
                  <button className="btn btn--secondary btn--sm" onClick={() => onRepairMod(mod.mod_uuid)}>
                    <Wand2 />
                    Run fixer
                  </button>
                  {isRepaired && (
                    <button className="btn btn--ghost btn--sm" onClick={() => onUndoRepair(mod.mod_uuid)}>
                      <RotateCcw />
                      Restore backup
                    </button>
                  )}
                </div>
                <p className="small muted" style={{ marginBottom: 12 }}>
                  The fixer updates outdated references after a game patch and always keeps a backup of the original
                  files.
                </p>
                {mod.detected_hashes.length > 0 && (
                  <details className="disclosure">
                    <summary>
                      <ChevronRight />
                      Detected references ({mod.detected_hashes.length})
                    </summary>
                    <div className="chip-row" style={{ paddingTop: 8 }}>
                      {mod.detected_hashes.map((h) => {
                        const outdated = mod.broken_hashes.includes(h);
                        return (
                          <span key={h} className={`badge mono ${outdated ? 'badge--warning' : ''}`} title={outdated ? 'Outdated' : 'Current'}>
                            {h}
                          </span>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>

              <details className="disclosure">
                <summary>
                  <ChevronRight />
                  Config files ({iniDocuments.length})
                  {isLoadingDetails && <span className="caption">Loading…</span>}
                </summary>
                <div className="stack" style={{ paddingTop: 8 }}>
                  {iniDocuments.map((doc) => (
                    <div key={doc.filePath || doc.fileName} className="code-block">
                      <div className="code-block__head">
                        <span className="mono">{doc.fileName}</span>
                        <span>{doc.sections.length} sections</span>
                      </div>
                      <pre>{doc.rawContent}</pre>
                    </div>
                  ))}
                  {masterSwapContent && (
                    <div className="code-block">
                      <div className="code-block__head">
                        <span className="mono">master_swap.ini</span>
                        <span>Outfit rotation</span>
                      </div>
                      <pre>{masterSwapContent}</pre>
                    </div>
                  )}
                </div>
              </details>
            </>
          )}
        </div>
      </aside>
    </div>
  );
};
