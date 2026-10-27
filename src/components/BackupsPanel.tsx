import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, History, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import type { BackupEntry, BackupKind } from '../shared/types';
import { fairyClient, type FullAppState } from '../services/fairyClient';
import { EmptyState, Segmented, relativeTime, useToast } from '../ui';

/** What each kind of backup is, in the words the Library uses. */
export const BACKUP_KIND_META: Record<BackupKind, { label: string; one: string; restore: string; tone: string }> = {
  update: { label: 'Previous versions', one: 'Previous version', restore: 'Use this version', tone: 'var(--primary)' },
  deleted: { label: 'Deleted mods', one: 'Deleted mod', restore: 'Put back', tone: 'var(--warning)' },
  hotkeys: { label: 'Keys before Tidy keys', one: 'Keys before Tidy keys', restore: 'Put keys back', tone: 'var(--success)' },
  leftover: { label: 'Leftover folders', one: 'Leftover folder', restore: 'Add to Library', tone: 'var(--text-muted)' },
};
const KIND_ORDER: BackupKind[] = ['update', 'deleted', 'hotkeys', 'leftover'];

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(n >= 10 * 1024 ** 2 ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

interface Summary {
  total_bytes: number;
  count: number;
  by_kind: Record<string, { count: number; bytes: number }>;
}

/**
 * Everything ProxyLaunch keeps a copy of: the size strip (click a part to filter), the list with
 * put back / delete, and cleaning up old ones. `only` limits it to some kinds (Recently deleted).
 */
export const BackupsPanel: React.FC<{
  onStateChange: (s: FullAppState) => void;
  only?: BackupKind[];
  /** Smaller, without the size strip and clean-up (inside a dialog). */
  compact?: boolean;
}> = ({ onStateChange, only, compact }) => {
  const notify = useToast();
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<BackupKind | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [olderThan, setOlderThan] = useState<'7' | '30' | '90'>('30');

  const load = useCallback(async () => {
    try {
      const res = await fairyClient.listBackups();
      setBackups(res.backups);
      setSummary(res.summary);
    } catch (err) {
      setBackups([]);
      notify({ tone: 'error', title: 'Couldn’t read the backups', message: (err as Error).message });
    }
  }, [notify]);
  useEffect(() => {
    void load();
  }, [load]);

  const kinds = only ?? KIND_ORDER;
  const shown = useMemo(
    () => (backups ?? []).filter((b) => kinds.includes(b.kind) && (filter === 'all' || b.kind === filter)),
    [backups, kinds, filter]
  );

  const restore = async (b: BackupEntry) => {
    setBusy(b.id);
    try {
      const res = await fairyClient.restoreBackup(b.id);
      onStateChange(res.state);
      const name = res.restored?.title ?? b.title;
      notify({
        tone: 'success',
        title: b.kind === 'update' ? `Went back to the previous version of “${name}”` : b.kind === 'hotkeys' ? `Put back the keys of “${name}”` : `Put back “${name}”`,
        message: b.kind === 'update' ? 'The version you had is in backups, so you can switch back.' : undefined,
      });
      await load();
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t put that back', message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (b: BackupEntry) => {
    if (confirmDelete !== b.id) {
      setConfirmDelete(b.id);
      return;
    }
    setConfirmDelete(null);
    setBusy(b.id);
    try {
      const res = await fairyClient.deleteBackup(b.id);
      notify({ tone: 'success', title: `Deleted the backup of “${b.title}”`, message: `${formatBytes(res.freed_bytes)} freed.` });
      await load();
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t delete that backup', message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const cleanUp = async () => {
    setBusy('cleanup');
    try {
      const res = await fairyClient.pruneBackups({ olderThanDays: Number(olderThan), keepPerMod: 1 });
      notify({
        tone: 'success',
        title: res.removed ? `Cleaned up ${res.removed} backup${res.removed === 1 ? '' : 's'}` : 'Nothing to clean up',
        message: res.removed ? `${formatBytes(res.freed_bytes)} freed.` : `No backups older than ${olderThan} days, apart from the newest of each mod.`,
      });
      await load();
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t clean up', message: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (backups === null) {
    return (
      <div className="row muted small" style={{ padding: '12px 0' }}>
        <Loader2 className="spin" /> Reading backups…
      </div>
    );
  }

  const total = kinds.reduce((n, k) => n + (summary?.by_kind[k]?.bytes ?? 0), 0);

  return (
    <div className="backups">
      {!compact && summary && summary.count > 0 && (
        <div className="backups__usage">
          <div className="backups__total">
            <span className="backups__total-num">{formatBytes(total)}</span>
            <span className="muted small">
              in {summary.count} backup{summary.count === 1 ? '' : 's'}
            </span>
          </div>
          <div className="backups__strip" role="group" aria-label="Space used by each kind of backup">
            {KIND_ORDER.filter((k) => (summary.by_kind[k]?.count ?? 0) > 0).map((k) => {
              const part = summary.by_kind[k];
              const meta = BACKUP_KIND_META[k];
              return (
                <button
                  key={k}
                  type="button"
                  className={`backups__seg ${filter === k ? 'is-active' : ''}`}
                  style={{ flexGrow: Math.max(part.bytes, total * 0.04), background: meta.tone }}
                  onClick={() => setFilter(filter === k ? 'all' : k)}
                  aria-pressed={filter === k}
                  title={`${meta.label}: ${formatBytes(part.bytes)} in ${part.count}`}
                />
              );
            })}
          </div>
          <div className="backups__legend">
            {KIND_ORDER.filter((k) => (summary.by_kind[k]?.count ?? 0) > 0).map((k) => (
              <button
                key={k}
                type="button"
                className={`backups__key ${filter === k ? 'is-active' : ''}`}
                onClick={() => setFilter(filter === k ? 'all' : k)}
                aria-pressed={filter === k}
              >
                <span className="backups__dot" style={{ background: BACKUP_KIND_META[k].tone }} />
                {BACKUP_KIND_META[k].label}
                <span className="muted">{formatBytes(summary.by_kind[k].bytes)}</span>
              </button>
            ))}
            {filter !== 'all' && (
              <button type="button" className="backups__key" onClick={() => setFilter('all')}>
                Show all
              </button>
            )}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState icon={only?.includes('deleted') ? <Trash2 /> : <Archive />} title={only?.includes('deleted') ? 'Nothing deleted lately' : 'No backups yet'} tone="muted" compact>
          {only?.includes('deleted')
            ? 'Mods you delete from the Library show up here, so you can put them back.'
            : 'When an update replaces a mod, or you delete one, a copy is kept here.'}
        </EmptyState>
      ) : (
        <ul className="backups__list">
          {shown.map((b) => {
            const meta = BACKUP_KIND_META[b.kind];
            return (
              <li key={b.id} className="backups__row">
                <span className="backups__dot" style={{ background: meta.tone }} aria-hidden />
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div className="truncate backups__title" title={b.title}>
                    {b.title}
                  </div>
                  <div className="caption">
                    {meta.one}, {relativeTime(b.created_at)}
                    {!compact && b.size_bytes > 0 ? `, ${formatBytes(b.size_bytes)}` : ''}
                  </div>
                </div>
                <button className="btn btn--secondary btn--sm" disabled={busy !== null} onClick={() => restore(b)}>
                  {busy === b.id ? <Loader2 className="spin" /> : b.kind === 'update' ? <History /> : <RotateCcw />}
                  {meta.restore}
                </button>
                <button
                  className={`btn btn--sm ${confirmDelete === b.id ? 'btn--danger' : 'btn--ghost'}`}
                  disabled={busy !== null}
                  onClick={() => remove(b)}
                  onBlur={() => setConfirmDelete((c) => (c === b.id ? null : c))}
                  aria-label={confirmDelete === b.id ? `Confirm deleting the backup of ${b.title}` : `Delete the backup of ${b.title}`}
                >
                  <Trash2 />
                  {confirmDelete === b.id ? 'Delete for good' : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!compact && summary && summary.count > 0 && (
        <div className="backups__cleanup">
          <div style={{ flex: 1 }}>
            <div className="setting__title">Clean up old backups</div>
            <div className="setting__desc">Deletes backups older than this. The newest copy of each mod is always kept.</div>
          </div>
          <Segmented<'7' | '30' | '90'>
            ariaLabel="Delete backups older than"
            value={olderThan}
            onChange={setOlderThan}
            options={[
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
            ]}
          />
          <button className="btn btn--secondary btn--sm" disabled={busy !== null} onClick={cleanUp}>
            {busy === 'cleanup' ? <Loader2 className="spin" /> : <Trash2 />}
            Clean up
          </button>
        </div>
      )}
    </div>
  );
};
