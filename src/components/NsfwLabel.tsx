import React, { useState } from 'react';
import { Bot, Loader2, RotateCcw, ShieldAlert, ShieldCheck, ToggleRight } from 'lucide-react';
import { fairyClient, type FullAppState } from '../services/fairyClient';
import { NSFW_LEVEL_LABEL, nsfwKeyOf, nsfwLevelOf, type NsfwLevel, type NsfwSource } from '../shared/nsfw';
import { Segmented, useToast } from '../ui';

interface Labeled {
  id?: number;
  gamebanana_id?: number | null;
  mod_uuid?: string;
  is_nsfw?: boolean;
  nsfw_level?: NsfwLevel;
  nsfw_reason?: string;
  nsfw_source?: NsfwSource;
  nsfw_flagged?: boolean;
}

/** Small badge for cards: nothing for SFW, "NSFW toggle" or "18+" otherwise. */
export const NsfwBadge: React.FC<{ item: Labeled; className?: string }> = ({ item, className = '' }) => {
  const level = nsfwLevelOf(item);
  if (level === 'sfw') return null;
  return (
    <span
      className={`badge ${level === 'toggle' ? 'badge--warning' : 'badge--error'} nsfw-badge ${className}`}
      title={item.nsfw_reason || (level === 'toggle' ? 'Safe by default, with NSFW options you can turn on in game.' : 'Shows nudity or skimpy clothing.')}
    >
      {level === 'toggle' ? <ToggleRight /> : null}
      {NSFW_LEVEL_LABEL[level]}
    </span>
  );
};

const SOURCE_LABEL: Record<NsfwSource, string> = {
  gamebanana: 'GameBanana rating',
  ai: 'AI check on your PC',
  you: 'You',
};

/** The label, why it was given, and buttons to change it. */
export const NsfwLabelControl: React.FC<{ item: Labeled; onChanged: (s: FullAppState) => void; onLevel?: (l: NsfwLevel | null) => void }> = ({
  item,
  onChanged,
  onLevel,
}) => {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const key = nsfwKeyOf(item);
  if (!key) return null;
  const level = nsfwLevelOf(item);
  const source: NsfwSource | undefined = item.nsfw_source ?? (level !== 'sfw' ? 'gamebanana' : undefined);

  const set = async (next: NsfwLevel | null) => {
    setBusy(true);
    try {
      const res = await fairyClient.nsfwSetLevel(key, next, Boolean(item.nsfw_flagged ?? item.is_nsfw));
      onChanged(res.state);
      onLevel?.(next);
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t change the label', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nsfw-label">
      <div className="row" style={{ gap: 8 }}>
        <span className="eyebrow" style={{ flex: 1 }}>
          Content label
        </span>
        {busy && <Loader2 className="spin" style={{ width: 14, height: 14 }} />}
      </div>
      <Segmented<NsfwLevel>
        ariaLabel="Content label"
        value={level}
        onChange={(v) => v !== level && set(v)}
        options={[
          { value: 'sfw', label: 'SFW', icon: <ShieldCheck /> },
          { value: 'toggle', label: 'NSFW toggle', icon: <ToggleRight /> },
          { value: 'nsfw', label: '18+', icon: <ShieldAlert /> },
        ]}
      />
      {(item.nsfw_reason || source) && (
        <p className="caption nsfw-label__why">
          {source === 'ai' ? <Bot /> : null}
          <span>
            {source ? <b>{SOURCE_LABEL[source]}: </b> : null}
            {item.nsfw_reason || (level === 'sfw' ? 'Not labeled.' : 'Labeled by its content rating or title.')}
          </span>
        </p>
      )}
      {source === 'you' && (
        <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => set(null)}>
          <RotateCcw /> Go back to the automatic label
        </button>
      )}
    </div>
  );
};
