import React, { useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  FlaskConical,
  Library,
  Loader2,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Motif } from '../themes/Motif';
import type { MotifKind } from '../themes/types';
import { usePopover } from '../ui';

export type ScreenId = 'library' | 'browse' | 'sync' | 'themes' | 'workshop' | 'settings';

export type SyncHealth = 'ok' | 'warning' | 'error' | 'busy' | 'unknown';

interface SidebarProps {
  screen: ScreenId;
  onNavigate: (s: ScreenId) => void;
  motif: MotifKind;
  modsCount: number;
  needsAttention: number;
  downloadsCount: number;
  // profiles
  activeProfile: string;
  savedProfiles: string[];
  onApplyProfile: (name: string) => void;
  onSaveProfile: (name: string) => void;
  onDeleteProfile: (name: string) => void;
  onRenameProfile: (oldName: string, newName: string) => void;
  activeModsCount: number;
  // sync
  syncHealth: SyncHealth;
  syncLabel: string;
  // launch
  onLaunch: (mode: 'modded' | 'vanilla') => void;
  onReloadInGame: () => void;
  isLaunching: boolean;
  /** Experimental Mod Workshop page is turned on in Settings. */
  showWorkshop?: boolean;
}

const BUILT_IN_PROFILES = ['Default', 'Stream Safe', 'Main Team'];

const NAV: Array<{ id: ScreenId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'library', label: 'Library', icon: Library },
  { id: 'browse', label: 'Browse', icon: Compass },
  { id: 'sync', label: 'Sync', icon: RefreshCw },
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'workshop', label: 'Workshop', icon: FlaskConical },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const ProfileSwitcher: React.FC<
  Pick<
    SidebarProps,
    'activeProfile' | 'savedProfiles' | 'onApplyProfile' | 'onSaveProfile' | 'onDeleteProfile' | 'onRenameProfile' | 'activeModsCount'
  >
> = ({ activeProfile, savedProfiles, onApplyProfile, onSaveProfile, onDeleteProfile, onRenameProfile, activeModsCount }) => {
  const { open, setOpen, ref } = usePopover();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const profiles = Array.from(new Set([...BUILT_IN_PROFILES, ...savedProfiles]));
  const current = activeProfile || 'Default';

  const commitRename = (prof: string) => {
    const next = editName.trim();
    if (next && next !== prof) onRenameProfile(prof, next);
    setEditing(null);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="profile-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title={`Loadout: ${current}`}>
        <span className="profile-btn__icon">
          <Bookmark />
        </span>
        <span className="min-w-0 hide-compact" style={{ flex: 1 }}>
          <span className="caption" style={{ display: 'block' }}>
            Loadout
          </span>
          <span className="truncate" style={{ display: 'block', fontWeight: 650 }}>
            {current}
          </span>
        </span>
        <ChevronDown className="hide-compact" style={{ width: 16, height: 16, color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div className="popover" style={{ left: 0, top: 'calc(100% + 6px)', width: 280 }} role="menu">
          <div className="menu-label eyebrow">Switch loadout</div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {profiles.map((prof) => {
              const isActive = prof === current;
              const isBuiltIn = BUILT_IN_PROFILES.includes(prof);
              if (editing === prof) {
                return (
                  <div key={prof} className="row" style={{ padding: '4px 6px' }}>
                    <input
                      className="input"
                      style={{ height: 34 }}
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(prof);
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setEditing(null);
                        }
                      }}
                      aria-label="New loadout name"
                    />
                    <button className="icon-btn icon-btn--sm" onClick={() => commitRename(prof)} aria-label="Save name">
                      <Check />
                    </button>
                    <button className="icon-btn icon-btn--sm" onClick={() => setEditing(null)} aria-label="Cancel">
                      <X />
                    </button>
                  </div>
                );
              }
              return (
                <div key={prof} className="row" style={{ gap: 2 }}>
                  <button
                    className="menu-item"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      onApplyProfile(prof);
                      setOpen(false);
                    }}
                  >
                    <Check style={{ opacity: isActive ? 1 : 0, color: 'var(--primary-text)' }} />
                    <span className="truncate" style={{ flex: 1, fontWeight: isActive ? 650 : 500 }}>
                      {prof}
                    </span>
                  </button>
                  <button
                    className="icon-btn icon-btn--sm"
                    title="Rename"
                    aria-label={`Rename ${prof}`}
                    onClick={() => {
                      setEditing(prof);
                      setEditName(prof);
                    }}
                  >
                    <Pencil />
                  </button>
                  {!isBuiltIn && (
                    <button
                      className="icon-btn icon-btn--sm"
                      title="Delete"
                      aria-label={`Delete ${prof}`}
                      style={{ color: 'var(--error)' }}
                      onClick={() => onDeleteProfile(prof)}
                    >
                      <Trash2 />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="menu-sep" />
          <form
            className="row"
            style={{ padding: '4px 6px 6px' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              onSaveProfile(newName.trim());
              setNewName('');
              setOpen(false);
            }}
          >
            <input
              className="input"
              style={{ height: 34 }}
              placeholder={`Save current (${activeModsCount} on) as…`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-label="New loadout name"
            />
            <button className="btn btn--primary btn--sm" type="submit" disabled={!newName.trim()} aria-label="Save loadout">
              <Plus />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

const LaunchButton: React.FC<Pick<SidebarProps, 'onLaunch' | 'isLaunching'>> = ({ onLaunch, isLaunching }) => {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="play">
        <button className="play__main" onClick={() => onLaunch('modded')} disabled={isLaunching} title="Play with mods">
          {isLaunching ? <Loader2 className="spin" style={{ fill: 'none' }} /> : <Play />}
          <span className="hide-compact">{isLaunching ? 'Starting…' : 'Play'}</span>
        </button>
        <button className="play__more" onClick={() => setOpen(!open)} aria-label="More launch options" aria-haspopup="menu">
          <ChevronDown style={{ width: 16, height: 16 }} />
        </button>
      </div>
      {open && (
        <div className="popover" style={{ left: 0, bottom: 'calc(100% + 8px)', width: 270, transformOrigin: 'bottom' }} role="menu">
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLaunch('modded');
            }}
          >
            <Play />
            <span>
              <span style={{ display: 'block', fontWeight: 600 }}>Play with mods</span>
              <span className="menu-item__sub">Starts the mod loader, then the game</span>
            </span>
          </button>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLaunch('vanilla');
            }}
          >
            <Play style={{ opacity: 0.6 }} />
            <span>
              <span style={{ display: 'block', fontWeight: 600 }}>Play without mods</span>
              <span className="menu-item__sub">Launches the game on its own</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const { screen, onNavigate, motif, modsCount, needsAttention, downloadsCount, syncHealth, syncLabel } = props;

  const counts: Partial<Record<ScreenId, React.ReactNode>> = {
    library:
      needsAttention > 0 ? (
        <span className="nav__count nav__count--alert" title={`${needsAttention} need attention`}>
          {needsAttention}
        </span>
      ) : modsCount > 0 ? (
        <span className="nav__count">{modsCount}</span>
      ) : null,
    browse: downloadsCount > 0 ? <span className="nav__count">{downloadsCount}</span> : null,
  };

  const dotClass =
    syncHealth === 'ok'
      ? 'status-dot'
      : syncHealth === 'busy'
      ? 'status-dot status-dot--busy'
      : syncHealth === 'error'
      ? 'status-dot status-dot--error'
      : 'status-dot status-dot--warning';

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <Motif kind={motif} className="sidebar__motif" bias="none" density={14} opacity={0.22} seed="sidebar" />

      <ProfileSwitcher {...props} />

      <nav className="nav">
        {NAV.filter((item) => item.id !== 'workshop' || props.showWorkshop).map((item) => {
          const Icon = item.icon;
          const active = screen === item.id;
          return (
            <button
              key={item.id}
              className={`nav__item ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
              title={item.label}
            >
              <Icon />
              <span className="hide-compact">{item.label}</span>
              {counts[item.id]}
            </button>
          );
        })}
      </nav>

      <div className="spacer" />

      <button className="sync-mini" onClick={() => onNavigate('sync')} title={syncLabel}>
        <span className={dotClass} />
        <span className="min-w-0 hide-compact" style={{ flex: 1 }}>
          <span className="caption" style={{ display: 'block' }}>
            Mods folder
          </span>
          <span className="truncate small" style={{ display: 'block', fontWeight: 600 }}>
            {syncLabel}
          </span>
        </span>
      </button>

      <button className="btn btn--secondary btn--block" onClick={props.onReloadInGame} title="Apply changes while the game is running (sends F10)">
        <Zap />
        <span className="hide-compact">Reload in game</span>
      </button>

      <LaunchButton onLaunch={props.onLaunch} isLaunching={props.isLaunching} />
    </aside>
  );
};
