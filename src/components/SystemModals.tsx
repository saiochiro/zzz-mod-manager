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

/** A GameBanana page with several files (variants, optional parts): pick the one to install. */
export const FilePickModal: React.FC<FilePickModalProps> = ({ prompt, onPick, onCancel }) => {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(prompt?.files[0]?.id ?? null), [prompt]);
  if (!prompt) return null;
  return (
    <Modal open onClose={onCancel} labelledBy="filepick-title">
      <div className="modal__header modal__header--hero">
        <span className="card__icon">
          <FileArchive />
        </span>
        <div style={{ flex: 1 }}>
          <h2 id="filepick-title" className="h3">
            Which file of “{prompt.title}”?
          </h2>
          <p className="small muted">
            This mod has {prompt.files.length} downloads. {prompt.isUpdate ? 'Pick the one you use. ' : ''}ProxyLaunch remembers your choice for
            updates and repairs.
          </p>
        </div>
        <button className="icon-btn" onClick={onCancel} aria-label="Close">
          <X />
        </button>
      </div>
      <div className="modal__body">
        <div className="stack" role="radiogroup" aria-labelledby="filepick-title">
          {prompt.files.map((f) => (
            <label
              key={f.id}
              className="row-3"
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                background: 'var(--raised)',
                cursor: 'pointer',
                outline: picked === f.id ? '2px solid var(--primary)' : 'none',
              }}
            >
              <input type="radio" name="gb-file" checked={picked === f.id} onChange={() => setPicked(f.id)} />
              <span className="min-w-0" style={{ flex: 1 }}>
                <span className="truncate" style={{ display: 'block', fontWeight: 650 }} title={f.name}>
                  {f.name}
                </span>
                {f.description && (
                  <span className="caption truncate" style={{ display: 'block' }} title={f.description}>
                    {f.description}
                  </span>
                )}
              </span>
              <span className="caption">{f.size ? sizeLabel(f.size) : ''}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="modal__footer">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--primary" disabled={picked === null} onClick={() => picked !== null && onPick(picked)}>
          {prompt.isUpdate ? 'Update with this file' : 'Install this file'}
          <ArrowRight />
        </button>
      </div>
    </Modal>
  );
};
