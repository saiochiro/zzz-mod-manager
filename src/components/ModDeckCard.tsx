import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  CloudDownload,
  History,
  PowerOff,
  Check,
} from 'lucide-react';
import type { AgentHashEntry, GameBananaModItem, ModManifest, NsfwFilterState } from '../shared/types';
import { isBlurredByNsfwFilter } from '../shared/nsfw';
import type { ModClash } from '../shared/clashes';
import type { MotifKind } from '../themes/types';
import { Switch, ThumbImage, usePopover } from '../ui';
import { getModHealth, HEALTH_META } from '../ui/modStatus';

/** The card menu opens above its button when at least this much room (px) is above it. */
const MENU_ROOM_ABOVE = 380;
/** Gap (px) between the menu and its button. */
const MENU_OFFSET = 6;
/** Smallest gap (px) between the menu and the right edge of the window. */
const MENU_EDGE_GAP = 8;

interface ModDeckCardProps {
  mod: ModManifest;
  agent: AgentHashEntry | null;
  motif: MotifKind;
  isSelected: boolean;
  /** Mods that are on and change the same things as this one. */
  clashes?: ModClash[];
  onTurnOffMod?: (modUuid: string, title: string) => void;
  /** Set when the version an update replaced can be put back. */
  onUndoUpdate?: () => void;
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
  /** Library bulk select: clicking the card picks it instead of opening it. */
  selectMode?: boolean;
  picked?: boolean;
  onPick?: () => void;
  /** Set when the mod has missing files that can be downloaded from GameBanana again. */
  onDownloadMissing?: () => void;
  isFetchingFiles?: boolean;
}

export const ModDeckCard: React.FC<ModDeckCardProps> = ({
  mod,
  agent,
  motif,
  isSelected,
  clashes,
  onTurnOffMod,
  onUndoUpdate,
  nsfwFilterState = 'show', // Library cards are never filtered or blurred
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
  selectMode,
  picked,
  onPick,
  onDownloadMissing,
  isFetchingFiles,
}) => {
  const menu = usePopover();
  // The menu is drawn at the top level (not inside the card), so the sticky toolbar and the cards
  // around it can't cover it. Opens above the button when there's room, else below.
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<React.CSSProperties | null>(null);
  useEffect(() => {
    if (!menu.open) {
      setMenuPos(null);
      return;
    }
    // The side (above or below) is picked once when it opens; after that the menu just follows
    // its button when the page scrolls or the window resizes.
    let fitsAbove: boolean | null = null;
    const place = () => {
      const r = menuBtnRef.current?.getBoundingClientRect();
      if (!r) return;
      if (fitsAbove === null) fitsAbove = r.top > MENU_ROOM_ABOVE;
      const right = Math.max(MENU_EDGE_GAP, window.innerWidth - r.right);
      setMenuPos(fitsAbove ? { right, bottom: window.innerHeight - r.top + MENU_OFFSET } : { right, top: r.bottom + MENU_OFFSET });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.open]);
  const [revealed, setRevealed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const health = getModHealth(mod);
  const meta = HEALTH_META[health];
  const HealthIcon = meta.icon;
  const blurred = isBlurredByNsfwFilter(mod, nsfwFilterState) && !revealed;
  // A character ZZMI doesn't know yet (named by GameBanana) isn't a UI mod.
  const unsupported = !agent && mod.agent_id === 'uncategorized' ? mod.unsupported_character : undefined;
  const target =
    agent?.display_name || unsupported || (mod.category_tag && mod.category_tag !== 'Skins' ? mod.category_tag : 'UI & effects');
  const clash = mod.enabled ? clashes?.[0] : undefined;
  const moreClashes = (clashes?.length ?? 0) - 1;
  let clashText = '';
  if (clash) clashText = moreClashes > 0 ? `Clashes with “${clash.title}” and ${moreClashes} more` : `Clashes with “${clash.title}”`;
  const turnOffClash = clash && onTurnOffMod ? () => onTurnOffMod(clash.modUuid, clash.title) : undefined;
  // Where the bottom of the cover is free, the clash gets a strip with Turn off; otherwise a badge.
  const showClashStrip = Boolean(clash) && health === 'working' && !update && !isUpdating;

  return (
    <article
      data-tilt
      className={`mod-card ${isSelected ? 'is-selected' : ''} ${mod.enabled ? '' : 'is-off'} ${selectMode ? 'is-selecting' : ''} ${picked ? 'is-picked' : ''}`}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
      onClick={selectMode ? onPick : onOpenInspector}
      onContextMenu={(e) => {
        if (selectMode) return;
        e.preventDefault();
        menu.setOpen(true);
      }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || (selectMode && e.key === ' ')) {
          e.preventDefault();
          if (selectMode) onPick?.();
          else onOpenInspector();
        }
      }}
      aria-label={`${mod.title}, ${mod.enabled ? 'on' : 'off'}, ${meta.label}`}
      aria-pressed={selectMode ? picked : undefined}
      data-mod-uuid={mod.mod_uuid}
    >
      {selectMode && (
        <span className="mod-card__pick" aria-hidden="true">
          {picked && <Check />}
        </span>
      )}
      <div className="mod-card__thumb">
        <ThumbImage src={mod.thumbnail_url} fallbacks={mod.preview_images} alt={mod.title} motif={motif} />
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
          <span
            className={`badge badge--glass truncate ${unsupported ? 'badge--warning' : ''}`}
            style={{ maxWidth: '60%' }}
            title={unsupported ? 'Character not supported by ZZMI yet: this mod does nothing in game until ZZMI adds them.' : undefined}
          >
            {target}
          </span>
          {unsupported && health === 'working' && (
            <span className="badge badge--glass badge--warning" title="Character not supported by ZZMI yet">
              <AlertTriangle />
              Not in ZZMI yet
            </span>
          )}
          {health !== 'working' ? (
            <span className={`badge badge--glass badge--${meta.tone}`} title={meta.description}>
              <HealthIcon />
              {meta.label}
            </span>
          ) : clash && !showClashStrip ? (
            <span className="badge badge--glass badge--warning" title={clashText}>
              <AlertTriangle />
              Clashes
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
        {showClashStrip && clash && (
          <div className="mod-card__clash" role="status" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle />
            <span className="truncate" style={{ flex: 1 }} title={`${clashText}. Both change the same parts, so only one shows in game.`}>
              {clashText}
            </span>
            {turnOffClash && (
              <button
                className="btn btn--sm btn--secondary"
                onClick={turnOffClash}
                title={`Turn off “${clash.title}” so this one shows`}
              >
                <PowerOff />
                Turn that off
              </button>
            )}
          </div>
        )}
        {health === 'broken' && onDownloadMissing && (
          <div className="mod-card__fix">
            <button
              className="btn btn--sm"
              style={{ background: 'var(--warning-solid)', color: '#1a1205' }}
              disabled={isFetchingFiles}
              onClick={(e) => {
                e.stopPropagation();
                onDownloadMissing();
              }}
              title="Download this mod's missing files from GameBanana. Nothing else is changed."
            >
              <CloudDownload />
              {isFetchingFiles ? 'Downloading…' : 'Get missing files'}
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
            ref={menuBtnRef}
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
          {menu.open && menuPos && createPortal(
            <div className="popover popover--floating" data-popover-portal style={{ position: 'fixed', ...menuPos, width: 240, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }} role="menu">
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
              {health === 'broken' && onDownloadMissing && (
                <button className="menu-item" role="menuitem" disabled={isFetchingFiles} onClick={() => (menu.setOpen(false), onDownloadMissing())}>
                  <CloudDownload />
                  Download missing files
                </button>
              )}
              {health === 'fixable' && (
                <button className="menu-item" role="menuitem" onClick={() => (menu.setOpen(false), onRepair())}>
                  <Wrench />
                  Fix for current version
                </button>
              )}
              {onUndoUpdate && (
                <button className="menu-item" role="menuitem" onClick={() => (menu.setOpen(false), onUndoUpdate())}>
                  <History />
                  Go back to the previous version
                </button>
              )}
              {clash && turnOffClash && (
                <button className="menu-item" role="menuitem" onClick={() => (menu.setOpen(false), turnOffClash())}>
                  <PowerOff />
                  <span className="truncate">Turn off “{clash.title}”</span>
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
                Find in File Explorer
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
            ,
            document.body
          )}
        </div>
      </div>
    </article>
  );
};
