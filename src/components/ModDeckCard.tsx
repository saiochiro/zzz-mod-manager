import React, { useState } from 'react';
import {
  ArrowUpCircle,
  Loader2,
  AlertTriangle,
  ClipboardPaste,
  EyeOff,
  FolderOpen,
  ImagePlus,
  MoreHorizontal,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { AgentHashEntry, GameBananaModItem, ModManifest, NsfwFilterState } from '../shared/types';
import type { MotifKind } from '../themes/types';
import { Switch, ThumbImage, usePopover } from '../ui';
import { getModHealth, HEALTH_META } from '../ui/modStatus';

interface ModDeckCardProps {
  mod: ModManifest;
  agent: AgentHashEntry | null;
  motif: MotifKind;
  isSelected: boolean;
  isConflicting?: boolean;
  nsfwFilterState?: NsfwFilterState;
  index?: number;
  onOpenInspector: () => void;
  onToggleEnabled: () => void;
  onRepair: () => void;
  onSetCustomImageFile: () => void;
  onPasteThumbnailFromClipboard: () => void;
  onDelete: () => void;
  onOpenFolder: () => void;
  update?: GameBananaModItem | null;
  isUpdating?: boolean;
  onUpdate?: () => void;
}

export const ModDeckCard: React.FC<ModDeckCardProps> = ({
  mod,
  agent,
  motif,
  isSelected,
  isConflicting,
  nsfwFilterState = 'hide',
  index = 0,
  onOpenInspector,
  onToggleEnabled,
  onRepair,
  onSetCustomImageFile,
  onPasteThumbnailFromClipboard,
  onDelete,
  onOpenFolder,
  update,
  isUpdating,
  onUpdate,
}) => {
  const menu = usePopover();
  const [revealed, setRevealed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const health = getModHealth(mod);
  const meta = HEALTH_META[health];
  const HealthIcon = meta.icon;
  const blurred = Boolean(mod.is_nsfw && nsfwFilterState === 'blur' && !revealed);
  const target = agent?.display_name || (mod.category_tag && mod.category_tag !== 'Skins' ? mod.category_tag : 'UI & effects');

  return (
    <article
      data-tilt
      className={`mod-card ${isSelected ? 'is-selected' : ''} ${mod.enabled ? '' : 'is-off'}`}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
      onClick={onOpenInspector}
      onContextMenu={(e) => {
        e.preventDefault();
        menu.setOpen(true);
      }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpenInspector();
      }}
      aria-label={`${mod.title}, ${mod.enabled ? 'on' : 'off'}, ${meta.label}`}
    >
      <div className="mod-card__thumb">
        <ThumbImage src={mod.thumbnail_url} alt={mod.title} motif={motif} />
        {blurred && (
          <button
            className="nsfw-cover"
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(true);
            }}
          >
            <EyeOff />
            <span>Sensitive preview</span>
            <span className="caption" style={{ color: 'rgba(255,255,255,.8)' }}>
              Click to show
            </span>
          </button>
        )}
        <div className="mod-card__tl">
          <span className="badge badge--glass truncate" style={{ maxWidth: '60%' }}>
            {target}
          </span>
          {health !== 'working' ? (
            <span className={`badge badge--glass badge--${meta.tone}`} title={meta.description}>
              <HealthIcon />
              {meta.label}
            </span>
          ) : isConflicting && mod.enabled ? (
            <span className="badge badge--glass badge--warning" title="Another skin for this character is also on">
              <AlertTriangle />
              Overlaps
            </span>
          ) : null}
        </div>
        {(update || isUpdating) && health !== 'fixable' && (
          <div className="mod-card__fix">
            <button
              className="btn btn--sm btn--primary"
              disabled={isUpdating}
              onClick={(e) => {
                e.stopPropagation();
                onUpdate?.();
              }}
              title={update ? `A newer version was posted on ${update.updated_at}` : 'Updating…'}
            >
              {isUpdating ? <Loader2 className="spin" /> : <ArrowUpCircle />}
              {isUpdating ? 'Updating…' : 'Update'}
            </button>
          </div>
        )}
        {health === 'fixable' && (
          <div className="mod-card__fix">
            <button
              className="btn btn--sm"
              style={{ background: 'var(--warning-solid)', color: '#1a1205' }}
              onClick={(e) => {
                e.stopPropagation();
                onRepair();
              }}
              title="Update this mod for the current game version (keeps a backup)"
            >
              <Wrench />
              Fix now
            </button>
          </div>
        )}
      </div>

      <div className="mod-card__body">
        <div className="min-w-0" style={{ flex: 1 }}>
          <div className="mod-card__title truncate" title={mod.title}>
            {mod.title}
          </div>
          <div className="mod-card__sub truncate">by {mod.author || 'Unknown'}</div>
        </div>
        <Switch checked={mod.enabled} onChange={onToggleEnabled} label={mod.enabled ? `Turn off ${mod.title}` : `Turn on ${mod.title}`} />
        <div ref={menu.ref} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-btn icon-btn--sm"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menu.open}
            onClick={() => {
              setConfirmDelete(false);
              menu.setOpen(!menu.open);
            }}
          >
            <MoreHorizontal />
          </button>
          {menu.open && (
            <div className="popover" style={{ right: 0, bottom: 'calc(100% + 6px)', width: 240, transformOrigin: 'bottom right' }} role="menu">
              <button className="menu-item" role="menuitem" onClick={() => (menu.setOpen(false), onOpenInspector())}>
                <SlidersHorizontal />
                Details &amp; hotkeys
              </button>
              {update && onUpdate && (
                <button className="menu-item" role="menuitem" onClick={() => (menu.setOpen(false), onUpdate())}>
                  <ArrowUpCircle />
                  Update to latest version
                </button>
              )}
              {health === 'fixable' && (
                <button className="menu-item" role="menuitem" onClick={() => (menu.setOpen(false), onRepair())}>
                  <Wrench />
                  Fix for current version
                </button>
              )}
              <button className="menu-item" role="menuitem" onClick={() => (menu.setOpen(false), onSetCustomImageFile())}>
                <ImagePlus />
                Change cover image…
              </button>
              <button className="menu-item" role="menuitem" onClick={() => (menu.setOpen(false), onPasteThumbnailFromClipboard())}>
                <ClipboardPaste />
                Paste cover from clipboard
              </button>
              <button className="menu-item" role="menuitem" onClick={() => (menu.setOpen(false), onOpenFolder())}>
                <FolderOpen />
                Show in folder
              </button>
              <div className="menu-sep" />
              {confirmDelete ? (
                <button
                  className="menu-item menu-item--danger"
                  role="menuitem"
                  onClick={() => {
                    menu.setOpen(false);
                    setConfirmDelete(false);
                    onDelete();
                  }}
                >
                  <Trash2 />
                  Click again to delete
                </button>
              ) : (
                <button className="menu-item menu-item--danger" role="menuitem" onClick={() => setConfirmDelete(true)}>
                  <Trash2 />
                  Delete mod
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
