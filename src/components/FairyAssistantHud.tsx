import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { FairyLogEntry } from '../shared/types';
import { usePopover } from '../ui';

/**
 * Activity center (replaces the old bottom status dock): a bell in the title
 * bar that opens a friendly list of recent events. The full history lives on
 * the Sync screen.
 */

export const LOG_META: Record<
  FairyLogEntry['level'],
  { icon: React.ComponentType<{ className?: string }>; tone: 'success' | 'warning' | 'error' | 'info' }
> = {
  success: { icon: CheckCircle2, tone: 'success' },
  warning: { icon: AlertTriangle, tone: 'warning' },
  error: { icon: XCircle, tone: 'error' },
  info: { icon: Info, tone: 'info' },
  cyan: { icon: Info, tone: 'info' },
};

export const ActivityItem: React.FC<{ entry: FairyLogEntry; onSelectMod?: (uuid: string) => void }> = ({
  entry,
  onSelectMod,
}) => {
  const meta = LOG_META[entry.level] ?? LOG_META.info;
  const Icon = meta.icon;
  const clickable = Boolean(entry.modUuid && onSelectMod);
  return (
    <div
      className={`timeline__item ${clickable ? 'is-clickable' : ''}`}
      onClick={() => clickable && onSelectMod?.(entry.modUuid!)}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) onSelectMod?.(entry.modUuid!);
      }}
    >
      <span className={`timeline__icon timeline__icon--${meta.tone}`}>
        <Icon />
      </span>
      <div className="min-w-0" style={{ flex: 1 }}>
        <div className="small clamp-2" style={{ fontWeight: 500 }}>
          {entry.message}
        </div>
        <div className="caption">{entry.timestamp}</div>
      </div>
      {clickable && <ArrowRight style={{ width: 16, height: 16, color: 'var(--text-muted)', flexShrink: 0, marginTop: 6 }} />}
    </div>
  );
};

interface ActivityCenterProps {
  logs: FairyLogEntry[];
  unseenCount: number;
  onOpened: () => void;
  onSelectMod: (modUuid: string) => void;
  onViewAll: () => void;
}

export const FairyAssistantHud: React.FC<ActivityCenterProps> = ({
  logs,
  unseenCount,
  onOpened,
  onSelectMod,
  onViewAll,
}) => {
  const { open, setOpen, ref } = usePopover();
  const recent = logs.slice(0, 8);
  // The panel is drawn on top of the whole app (not inside the title bar), so page headers,
  // drawers and theme effects can never cover it.
  const [pos, setPos] = React.useState<{ top: number; right: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  return (
    <div className="titlebar-no-drag" ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        aria-label={`Activity${unseenCount ? ` (${unseenCount} new)` : ''}`}
        title="Activity"
        onClick={() => {
          setOpen(!open);
          if (!open) onOpened();
        }}
      >
        <Bell />
        {unseenCount > 0 && <span className="icon-btn__badge">{unseenCount > 9 ? '9+' : unseenCount}</span>}
      </button>
      {open && pos && createPortal(
        <div
          className="popover popover--floating"
          data-popover-portal
          style={{ position: 'fixed', right: pos.right, top: pos.top, width: 380, maxWidth: 'calc(100vw - 16px)' }}
          role="dialog"
          aria-label="Recent activity"
        >
          <div className="row" style={{ padding: '8px 10px 6px' }}>
            <span style={{ fontWeight: 650 }}>Recent activity</span>
            <span className="spacer" />
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setOpen(false);
                onViewAll();
              }}
            >
              View all
            </button>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {recent.length === 0 ? (
              <div className="caption" style={{ padding: '24px 12px', textAlign: 'center' }}>
                Nothing yet — installs, fixes and syncs will show up here.
              </div>
            ) : (
              recent.map((entry) => (
                <ActivityItem
                  key={entry.id}
                  entry={entry}
                  onSelectMod={(uuid) => {
                    setOpen(false);
                    onSelectMod(uuid);
                  }}
                />
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export { Bell as ActivityIcon };
