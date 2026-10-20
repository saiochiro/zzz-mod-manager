import React from 'react';
import { ArrowRight, Split, X } from 'lucide-react';
import type { MultiAgentCandidate } from '../shared/types';
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
