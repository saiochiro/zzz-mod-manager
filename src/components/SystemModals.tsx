import React, { useEffect, useState } from 'react';
import { ArrowRight, FileArchive, Split, X } from 'lucide-react';
import type { GameBananaFile, MultiAgentCandidate } from '../shared/types';
import { Modal } from '../ui';

/**
 * Settings moved to a full screen (src/screens/SettingsScreen.tsx).
 * This module keeps the multi-character pack prompt.
 */

interface MultiAgentSplitModalProps {
  promptData: {
    stagingId: string;
    archiveName: string;
    candidates: MultiAgentCandidate[];
  } | null;
  onConfirmSplit: (stagingId: string) => void;
  onCancel: () => void;
}

export const MultiAgentSplitModal: React.FC<MultiAgentSplitModalProps> = ({ promptData, onConfirmSplit, onCancel }) => {
  if (!promptData) return null;
  const count = promptData.candidates.length;
  return (
    <Modal open onClose={onCancel} labelledBy="split-title">
      <div className="modal__header modal__header--hero">
        <span className="card__icon">
          <Split />
        </span>
        <div style={{ flex: 1 }}>
          <h2 id="split-title" className="h3">
            This pack has {count} characters
          </h2>
          <p className="small muted">
            “{promptData.archiveName}” will be installed as {count} separate mods, one per character, so you can turn each on
            and off on its own.
          </p>
        </div>
        <button className="icon-btn" onClick={onCancel} aria-label="Close">
          <X />
        </button>
      </div>
      <div className="modal__body">
        <div className="stack">
          {promptData.candidates.map((c) => (
            <div key={c.subfolder_name} className="row-3" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--raised)' }}>
              <span style={{ fontWeight: 650, flex: 1 }}>{c.agent_name}</span>
              <span className="caption truncate" style={{ maxWidth: 220 }} title={c.subfolder_name}>
                {c.subfolder_name}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="modal__footer">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel install
        </button>
        <button className="btn btn--primary" onClick={() => onConfirmSplit(promptData.stagingId)}>
          Install {count} mods
          <ArrowRight />
        </button>
      </div>
    </Modal>
  );
};

interface FilePickModalProps {
  prompt: { title: string; files: GameBananaFile[]; isUpdate: boolean } | null;
  onPick: (fileId: number) => void;
  onCancel: () => void;
}

const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const dayLabel = (ts?: number) => (ts ? new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * A GameBanana page with several downloads (variants, optional parts): pick the one to install.
 * The newest upload is picked to start with; each file shows what the author wrote about it.
 */
export const FilePickModal: React.FC<FilePickModalProps> = ({ prompt, onPick, onCancel }) => {
  const [picked, setPicked] = useState<number | null>(null);
  const newest = prompt?.files.reduce<GameBananaFile | null>((a, f) => (!a || (f.added_at || 0) > (a.added_at || 0) ? f : a), null) ?? null;
  const mostUsed = prompt?.files.reduce<GameBananaFile | null>((a, f) => (!a || (f.downloads || 0) > (a.downloads || 0) ? f : a), null) ?? null;
  useEffect(() => setPicked(newest?.id ?? prompt?.files[0]?.id ?? null), [prompt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!prompt) return null;
  return (
    <Modal open onClose={onCancel} labelledBy="filepick-title">
      <div className="modal__header modal__header--hero">
        <span className="card__icon">
          <FileArchive />
        </span>
        <div style={{ flex: 1 }}>
          <h2 id="filepick-title" className="h3">
            {prompt.isUpdate ? `Which file do you use for “${prompt.title}”?` : `Which version of “${prompt.title}”?`}
          </h2>
          <p className="small muted">
            The author posted {prompt.files.length} downloads. ProxyLaunch remembers the one you pick for updates and for getting missing
            files.
          </p>
        </div>
        <button className="icon-btn" onClick={onCancel} aria-label="Close">
          <X />
        </button>
      </div>
      <div className="modal__body">
        <div className="file-pick__list" role="radiogroup" aria-labelledby="filepick-title">
          {prompt.files.map((f) => {
            const tags = [
              f === newest && prompt.files.length > 1 && f.added_at ? 'Newest' : null,
              f === mostUsed && prompt.files.length > 1 && (f.downloads || 0) > 0 ? 'Most downloaded' : null,
            ].filter(Boolean);
            return (
              <label key={f.id} className={`file-pick__option ${picked === f.id ? 'is-picked' : ''}`}>
                <input type="radio" name="gb-file" checked={picked === f.id} onChange={() => setPicked(f.id)} />
                <span className="min-w-0" style={{ flex: 1 }}>
                  <span className="file-pick__name" style={{ display: 'block' }}>
                    {f.name}
                  </span>
                  {f.description && <span className="file-pick__desc" style={{ display: 'block' }}>{f.description}</span>}
                  <span className="file-pick__facts">
                    {f.size ? <span>{sizeLabel(f.size)}</span> : null}
                    {f.added_at ? <span>Posted {dayLabel(f.added_at)}</span> : null}
                    {f.downloads ? <span>{f.downloads.toLocaleString()} downloads</span> : null}
                    {tags.map((t) => (
                      <span key={t} className="file-pick__tag">
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="modal__footer">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--primary" disabled={picked === null} onClick={() => picked !== null && onPick(picked)}>
          {prompt.isUpdate ? 'Update with this file' : 'Install this file'}
        </button>
      </div>
    </Modal>
  );
};
