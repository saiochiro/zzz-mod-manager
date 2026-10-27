import { HeroDecor } from '../ui/HeroDecor';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpCircle,
  Loader2,
  AlertTriangle,
  Compass,
  Dices,
  FolderInput,
  Keyboard,
  FolderPlus,
  HardDriveDownload,
  LayoutGrid,
  ListFilter,
  MoreHorizontal,
  PackageOpen,
  Power,
  PowerOff,
  RotateCcw,
  SearchX,
  ShieldCheck,
  Users,
  Wand2,
  Wrench,
  CloudDownload,
  Trash2,
  X,
  CheckSquare,
} from 'lucide-react';
import type { AgentHashEntry, GameBananaModItem, HashDatabase, ModManifest, NsfwFilterState } from '../shared/types';
import { findClashes } from '../shared/clashes';
import { isOutfitMod } from '../shared/outfits';
import type { FullAppState } from '../services/fairyClient';
import { BackupsPanel } from '../components/BackupsPanel';
import type { ThemeDefinition } from '../themes/types';
import { Motif } from '../themes/Motif';
import { AgentRosterSidebar } from '../components/AgentRosterSidebar';
import { ModDeckCard } from '../components/ModDeckCard';
import { EmptyState, Modal, SearchInput, Segmented, Switch, usePopover } from '../ui';
import { getModHealth } from '../ui/modStatus';

type StatusFilter = 'ALL' | 'ON' | 'OFF' | 'ATTENTION';
type CategoryFilter = 'ALL' | 'Skins' | 'Weapons' | 'UI' | 'Audio';
type SortBy = 'alphabetical' | 'newest' | 'updated' | 'size' | 'status';

/** "1 mod", "3 mods". */
function modCount(n: number): string {
  return `${n} mod${n === 1 ? '' : 's'}`;
}

interface LibraryScreenProps {
  modUpdates: Record<string, GameBananaModItem>;
  updatingIds: Set<string>;
  onUpdateMod: (uuid: string) => void;
  onUpdateAllMods: () => void;
  theme: ThemeDefinition;
  mods: ModManifest[];
  hashDb: HashDatabase;
  nsfwFilterState: NsfwFilterState;
  singleActivePerAgent: boolean;
  selectedModUuid: string | null;
  resolveAgent: (agentId: string, title?: string) => AgentHashEntry | null;
  /** mod id -> backup of its previous version. */
  previousVersions: Record<string, string>;
  onUndoUpdate: (uuid: string) => void;
  /** Deleted mods that can be put back. */
  deletedBackups: number;
  onStateChange: (s: FullAppState) => void;
  onOpenMod: (uuid: string) => void;
  onToggleEnabled: (uuid: string) => void;
  onRepair: (uuid: string) => void;
  onRepairAll: () => void;
  /** Mods with missing files that came from GameBanana. */
  canFetchMissing: (m: ModManifest) => boolean;
  fetchingIds: Set<string>;
  onDownloadMissing: (uuid: string) => void;
  onDownloadAllMissing: () => void;
  onSetCustomImage: (uuid: string) => void;
  onPasteThumbnail: (uuid: string) => void;
  onDelete: (uuid: string) => void;
  /** Deletes several mods at once (bulk select); one message for all of them. */
  onDeleteMods: (uuids: string[]) => void;
  onOpenFolder: (installPath: string) => void;
  onInstallArchive: () => void;
  onOpenImport: () => void;
  onBrowse: () => void;
  onToggleSingleActive: () => void;
  onOrganizeFolders: () => void;
  onUndoOrganize: () => void;
  canUndoOrganize: boolean;
  /** Turns several mods on/off at once; `message` is shown when it's done. */
  /** `undoable`: the toast offers Undo. */
  onSetModsEnabled: (changes: Array<{ modUuid: string; enabled: boolean }>, message: string, undoable?: boolean) => void;
  /** Tidy hotkeys for one character (or every mod when no character is picked). */
  onTidyHotkeys: (agentId?: string) => void;
  /** Mods the game loads from outside ProxyLaunch, and what to do with one. */
  unmanagedGameMods: Array<{ name: string; path: string }>;
  onResolveUnmanaged: (modPath: string, action: 'import' | 'disable') => void;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = (p) => {
  const [agentId, setAgentIdState] = useState<string>(() => {
    try {
      return localStorage.getItem('pl_library_agent') || 'ALL';
    } catch {
      return 'ALL';
    }
  });
  const setAgentId = (id: string) => {
    setAgentIdState(id);
    try {
      localStorage.setItem('pl_library_agent', id);
    } catch {
      // per-viewer convenience only
    }
  };
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('alphabetical');
  const [query, setQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const more = usePopover();

  // The content filter is for Browse only: the Library always shows every installed mod.
  const visibleMods = p.mods;
  // The pills count what you're looking at: the picked character, or everything.
  const scopedMods = agentId === 'ALL' ? visibleMods : visibleMods.filter((m) => m.agent_id === agentId);
  const onCount = scopedMods.filter((m) => m.enabled).length;
  const attentionCount = scopedMods.filter((m) => getModHealth(m) !== 'working').length;
  const fixableCount = scopedMods.filter((m) => getModHealth(m) === 'fixable').length;
  const missingCount = visibleMods.filter(p.canFetchMissing).length;

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of scopedMods) {
      const k = m.category_tag || 'Skins';
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [scopedMods]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleMods
      .filter((m) => {
        if (agentId !== 'ALL' && m.agent_id !== agentId) return false;
        if (category !== 'ALL' && (m.category_tag || 'Skins') !== category) return false;
        if (status === 'ON' && !m.enabled) return false;
        if (status === 'OFF' && m.enabled) return false;
        if (status === 'ATTENTION' && getModHealth(m) === 'working') return false;
        if (q) {
          const hit =
            m.title.toLowerCase().includes(q) ||
            (m.author || '').toLowerCase().includes(q) ||
            (m.parts || []).some((x) => x.toLowerCase().includes(q)) ||
            (p.resolveAgent(m.agent_id, m.title)?.display_name || '').toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const byName = () => a.title.localeCompare(b.title);
        switch (sortBy) {
          case 'newest':
            return (b.installed_at || '').localeCompare(a.installed_at || '');
          case 'updated':
            return (b.updated_at || b.installed_at || '').localeCompare(a.updated_at || a.installed_at || '');
          case 'size':
            return (b.file_size_bytes || 0) - (a.file_size_bytes || 0) || byName();
          case 'status':
            return Number(b.enabled) - Number(a.enabled) || byName();
          default:
            return byName();
        }
      });
  }, [visibleMods, agentId, category, status, query, sortBy, p]);

  // "Surprise me": a random outfit for the picked character (any mod that changes how they look,
  // whatever it's tagged); its other outfits go off.
  const outfitChoices = scopedMods.filter((m) => isOutfitMod(m) && getModHealth(m) !== 'broken');
  const surpriseOutfit = () => {
    const current = outfitChoices.filter((m) => m.enabled).map((m) => m.mod_uuid);
    const pool = outfitChoices.filter((m) => !(current.length === 1 && current[0] === m.mod_uuid));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) return;
    p.onSetModsEnabled(
      outfitChoices.map((m) => ({ modUuid: m.mod_uuid, enabled: m.mod_uuid === pick.mod_uuid })),
      `Wearing “${pick.title}”`
    );
  };

  // Bulk select: pick cards, then act on all of them at once.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const pickedMods = visibleMods.filter((m) => picked.has(m.mod_uuid));
  const pickedWithUpdates = pickedMods.filter((m) => p.modUpdates[m.mod_uuid]);
  const allShownPicked = filtered.every((m) => picked.has(m.mod_uuid));
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
    setConfirmBulkDelete(false);
  };
  const togglePick = (id: string) => {
    setConfirmBulkDelete(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const pickAllShown = () => setPicked((prev) => new Set([...prev, ...filtered.map((m) => m.mod_uuid)]));
  const bulkSwitch = (enabled: boolean) => {
    const changes = pickedMods.filter((m) => m.enabled !== enabled).map((m) => ({ modUuid: m.mod_uuid, enabled }));
    p.onSetModsEnabled(changes, `Turned ${enabled ? 'on' : 'off'} ${modCount(changes.length)}`, true);
  };
  const bulkUpdate = () => {
    for (const m of pickedWithUpdates) p.onUpdateMod(m.mod_uuid);
  };
  const bulkDelete = () => {
    p.onDeleteMods(pickedMods.map((m) => m.mod_uuid));
    stopSelecting();
  };
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopSelecting();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting]);

  const hasFilters = agentId !== 'ALL' || category !== 'ALL' || status !== 'ALL' || query.trim() !== '';
  const clearFilters = () => {
    setAgentId('ALL');
    setCategory('ALL');
    setStatus('ALL');
    setQuery('');
  };

  const selectedAgent = agentId !== 'ALL' && agentId !== 'uncategorized' ? p.hashDb.agents[agentId] : null;
  // Mods that are on and change the same things: shown on each card, and summed up per character.
  const clashes = useMemo(() => findClashes(p.mods), [p.mods]);
  const groupName = (m: ModManifest) => (m.agent_id === 'uncategorized' ? 'UI & effects' : p.hashDb.agents[m.agent_id]?.display_name || m.agent_id);
  const conflictNames = Array.from(new Set(p.mods.filter((m) => clashes.has(m.mod_uuid)).map(groupName)));
  const [deletedOpen, setDeletedOpen] = useState(false);
  // "All off": the picked character's mods; with everything shown, every character's mods but not
  // UI & effects mods (UID hiders and the like usually stay on). Undo is one click on the toast.
  const allOffTargets = scopedMods.filter((m) => m.enabled && (agentId !== 'ALL' || m.agent_id !== 'uncategorized'));
  let allOffDone: string;
  let allOffHint: string;
  if (selectedAgent) {
    allOffDone = `Turned off all of ${selectedAgent.display_name}'s mods`;
    allOffHint = `Turn off all of ${selectedAgent.display_name}'s mods`;
  } else if (agentId === 'uncategorized') {
    allOffDone = 'Turned off all UI & effects mods';
    allOffHint = 'Turn off every UI & effects mod';
  } else {
    allOffDone = `Turned off ${allOffTargets.length} character mod${allOffTargets.length === 1 ? '' : 's'}`;
    allOffHint = 'Turn off every character mod (UI & effects mods stay on)';
  }
  const libraryEmpty = p.mods.length === 0;

  const heroTitle = selectedAgent ? selectedAgent.display_name : agentId === 'uncategorized' ? 'UI & effects' : 'Library';

  return (
    <div className="screen">
      <div className={`library ${panelOpen ? 'is-panel-open' : ''}`} style={{ position: 'relative' }}>
        <aside className="charpanel" aria-label="Filter by character">
          <AgentRosterSidebar
            agents={p.hashDb.agents}
            mods={visibleMods}
            selectedAgentId={agentId}
            onSelectAgent={(id) => {
              // Picking a character (or "All mods") shows all of its mods, not just the filtered ones.
              setAgentId(id);
              setStatus('ALL');
              setPanelOpen(false);
            }}
          />
        </aside>
        <div className="charpanel-overlay" onClick={() => setPanelOpen(false)} />

        <div className="library__content scroll">
          <section className="page-hero">
            <Motif kind={p.theme.motif} className="page-hero__motif" density={22} opacity={0.55} seed="library" animated />
            <HeroDecor />
            <div className="page-hero__glow" />
            <div className="page-hero__content">
              <div className="min-w-0">
                <div className="eyebrow">{selectedAgent ? 'Character' : 'Your mods'}</div>
                <h1 className="display page-hero__title">{heroTitle}</h1>
                <div className="page-hero__stats">
                  <button
                    className={`stat-pill ${status === 'ALL' ? '' : 'is-clickable'}`}
                    onClick={() => setStatus('ALL')}
                    style={{ cursor: 'pointer' }}
                    title="Show all mods"
                  >
                    <LayoutGrid style={{ color: 'var(--primary-text)' }} />
                    <strong>{scopedMods.length}</strong> installed
                  </button>
                  <button
                    className={`stat-pill ${status === 'ON' ? 'is-active is-active--on' : ''}`}
                    onClick={() => setStatus(status === 'ON' ? 'ALL' : 'ON')}
                    style={{ cursor: 'pointer' }}
                    title={status === 'ON' ? 'Show all mods' : 'Show only mods that are on'}
                  >
                    <Power style={{ color: 'var(--success)' }} />
                    <strong>{onCount}</strong> on
                  </button>
                  {attentionCount > 0 && (
                    <button
                      className={`stat-pill ${status === 'ATTENTION' ? 'is-active' : ''}`}
                      onClick={() => setStatus(status === 'ATTENTION' ? 'ALL' : 'ATTENTION')}
                      style={{ cursor: 'pointer' }}
                      title={status === 'ATTENTION' ? 'Show all mods' : 'Show only mods that need attention'}
                    >
                      <AlertTriangle style={{ color: 'var(--warning)' }} />
                      <strong>{attentionCount}</strong> need attention
                    </button>
                  )}
                </div>
              </div>
              <div className="row wrap">
                {fixableCount > 0 && (
                  <button className="btn btn--warning" onClick={p.onRepairAll}>
                    <Wand2 />
                    Fix {fixableCount} mod{fixableCount === 1 ? '' : 's'}
                  </button>
                )}
                {missingCount > 0 && (
                  <button
                    className="btn btn--warning"
                    onClick={p.onDownloadAllMissing}
                    disabled={p.fetchingIds.size > 0}
                    title="Download the missing files of every mod that has some, from GameBanana. Nothing else is changed."
                  >
                    <CloudDownload />
                    {p.fetchingIds.size > 0 ? 'Downloading files…' : `Get missing files (${missingCount})`}
                  </button>
                )}
                {selectedAgent && outfitChoices.length >= 2 && (
                  <button className="btn btn--secondary" onClick={surpriseOutfit} title="Turn on a random outfit for this character">
                    <Dices />
                    Surprise me
                  </button>
                )}
                {allOffTargets.length > 0 && (
                  <button
                    className="btn btn--secondary"
                    onClick={() =>
                      p.onSetModsEnabled(
                        allOffTargets.map((m) => ({ modUuid: m.mod_uuid, enabled: false })),
                        allOffDone,
                        true
                      )
                    }
                    title={allOffHint}
                  >
                    <PowerOff />
                    All off
                  </button>
                )}
                {scopedMods.some((m) => m.sub_toggles.length > 0) && (
                  <button
                    className="btn btn--secondary"
                    onClick={() => p.onTidyHotkeys(selectedAgent ? selectedAgent.agent_id : undefined)}
                    title={
                      selectedAgent
                        ? `Give ${selectedAgent.display_name}'s mods clash-free keys that only work while ${selectedAgent.display_name} is on screen`
                        : 'Give every mod clash-free keys that only work while its character is on screen'
                    }
                  >
                    <Keyboard />
                    Tidy keys
                  </button>
                )}
                {p.deletedBackups > 0 && (
                  <button className="btn btn--ghost" onClick={() => setDeletedOpen(true)} title="Put back mods you deleted">
                    <Trash2 />
                    Recently deleted ({p.deletedBackups})
                  </button>
                )}
                <button className="btn btn--primary" onClick={p.onInstallArchive}>
                  <FolderPlus />
                  Add mod
                </button>
              </div>
            </div>
          </section>

          {!libraryEmpty && (
            <div className="page-toolbar">
              <button className="btn btn--secondary btn--sm charpanel-toggle" onClick={() => setPanelOpen(true)}>
                <Users />
                {selectedAgent ? selectedAgent.display_name : 'Characters'}
              </button>
              <SearchInput value={query} onChange={setQuery} placeholder="Search mods, creators, characters" />
              <Segmented<StatusFilter>
                ariaLabel="Filter by status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'ON', label: 'On' },
                  { value: 'OFF', label: 'Off' },
                  {
                    value: 'ATTENTION',
                    label: attentionCount ? `Needs attention · ${attentionCount}` : 'Needs attention',
                  },
                ]}
              />
              <div className="spacer" />
              <label className="row small muted" style={{ gap: 6 }}>
                <ListFilter style={{ width: 16, height: 16 }} />
                <span className="sr-only">Sort</span>
                <select className="select" style={{ height: 32, width: 170 }} value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                  <option value="alphabetical">Name (A–Z)</option>
                  <option value="newest">Date added</option>
                  <option value="updated">Last updated</option>
                  <option value="size">Size (largest first)</option>
                  <option value="status">On first</option>
                </select>
              </label>
              <button
                className={`btn btn--sm ${selecting ? 'btn--primary' : 'btn--secondary'}`}
                onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
                aria-pressed={selecting}
                title="Pick several mods to turn on, turn off, update or delete together"
              >
                <CheckSquare />
                {selecting ? 'Done' : 'Select'}
              </button>
              <div ref={more.ref} style={{ position: 'relative' }}>
                <button className="icon-btn icon-btn--solid" aria-label="Library tools" title="Library tools" onClick={() => more.setOpen(!more.open)}>
                  <MoreHorizontal />
                </button>
                {more.open && (
                  <div className="popover" style={{ right: 0, top: 'calc(100% + 6px)', width: 300 }} role="menu">
                    <div className="menu-item" style={{ cursor: 'default' }}>
                      <ShieldCheck />
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontWeight: 600 }}>One outfit per character</span>
                        <span className="menu-item__sub">Turning one on turns the others off</span>
                      </span>
                      <Switch checked={p.singleActivePerAgent} onChange={p.onToggleSingleActive} label="One outfit per character" />
                    </div>
                    <div className="menu-sep" />
                    <button className="menu-item" onClick={() => (more.setOpen(false), p.onOrganizeFolders())}>
                      <PackageOpen />
                      <span>
                        <span style={{ display: 'block', fontWeight: 600 }}>Tidy folder names</span>
                        <span className="menu-item__sub">Renames folders to “Character – Mod name”</span>
                      </span>
                    </button>
                    {p.canUndoOrganize && (
                      <button className="menu-item" onClick={() => (more.setOpen(false), p.onUndoOrganize())}>
                        <RotateCcw />
                        Undo folder tidy
                      </button>
                    )}
                    <button className="menu-item" onClick={() => (more.setOpen(false), p.onOpenImport())}>
                      <FolderInput />
                      Import from another launcher
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {!libraryEmpty && (
            <div className="page-toolbar" style={{ position: 'static', paddingTop: 0, borderBottom: 0, background: 'transparent', backdropFilter: 'none' }}>
              <div className="chip-row" style={{ paddingTop: 12 }}>
                {(['ALL', 'Skins', 'Weapons', 'UI', 'Audio'] as CategoryFilter[]).map((c) => {
                  const count = c === 'ALL' ? scopedMods.length : categoryCounts[c] || 0;
                  if (c !== 'ALL' && count === 0) return null;
                  return (
                    <button key={c} className={`chip ${category === c ? 'is-active' : ''}`} onClick={() => setCategory(c)} aria-pressed={category === c}>
                      {c === 'ALL' ? 'Everything' : c === 'UI' ? 'Interface' : c}
                      <span className="chip__count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="page-body stack-4" style={{ paddingTop: libraryEmpty ? undefined : 16 }}>
            {Object.keys(p.modUpdates).length > 0 && (
              <div className="banner" style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary-border)' }}>
                <ArrowUpCircle style={{ color: 'var(--primary-text)' }} />
                <span style={{ flex: 1 }}>
                  <strong>
                    {Object.keys(p.modUpdates).length} mod update{Object.keys(p.modUpdates).length === 1 ? '' : 's'} available
                  </strong>{' '}
                  — newer versions were posted on GameBanana. Old versions are kept as a backup.
                </span>
                <button className="btn btn--sm btn--primary" onClick={p.onUpdateAllMods} disabled={p.updatingIds.size > 0}>
                  {p.updatingIds.size > 0 ? <Loader2 className="spin" /> : <ArrowUpCircle />}
                  {p.updatingIds.size > 0 ? 'Updating…' : 'Update all'}
                </button>
              </div>
            )}

            {conflictNames.length > 0 && !p.singleActivePerAgent && (
              <div className="banner banner--warning">
                <AlertTriangle />
                <span style={{ flex: 1 }}>
                  <strong>{conflictNames.join(', ')}</strong> {conflictNames.length === 1 ? 'has' : 'have'} more than one
                  outfit turned on. They may overlap in game.
                </span>
                <button className="btn btn--sm btn--secondary" onClick={p.onToggleSingleActive}>
                  Keep one at a time
                </button>
              </div>
            )}

            {p.unmanagedGameMods.length > 0 && agentId === 'ALL' && (
              <div className="banner banner--warning stack" style={{ marginBottom: 12, alignItems: 'stretch' }}>
                <div className="row" style={{ gap: 10 }}>
                  <AlertTriangle style={{ color: 'var(--warning)' }} />
                  <span style={{ flex: 1 }}>
                    <strong>
                      {p.unmanagedGameMods.length} mod{p.unmanagedGameMods.length === 1 ? ' is' : 's are'} active in the game but not in ProxyLaunch
                    </strong>
                    <span className="small muted" style={{ display: 'block' }}>
                      They're in the game's mod folder (often left by another mod manager), so they load even though you can't see them here.
                    </span>
                  </span>
                </div>
                {p.unmanagedGameMods.map((m) => (
                  <div key={m.path} className="row" style={{ gap: 8, paddingLeft: 30 }}>
                    <span className="truncate" style={{ flex: 1, fontWeight: 600 }} title={m.path}>
                      {m.name}
                    </span>
                    <button className="btn btn--sm btn--secondary" onClick={() => p.onResolveUnmanaged(m.path, 'import')}>
                      Add to Library
                    </button>
                    <button className="btn btn--sm btn--ghost" onClick={() => p.onResolveUnmanaged(m.path, 'disable')}>
                      Turn off
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!libraryEmpty && status === 'ATTENTION' && (
              <div className="banner" style={{ marginBottom: 12 }}>
                <AlertTriangle style={{ color: 'var(--warning)' }} />
                <span style={{ flex: 1 }}>Showing only mods that need attention.</span>
                <button className="btn btn--sm btn--secondary" onClick={() => setStatus('ALL')}>
                  Show all mods
                </button>
              </div>
            )}
            {libraryEmpty ? (
              <EmptyState
                icon={<HardDriveDownload />}
                title="Your library is empty"
                motif={p.theme.motif}
                actions={
                  <>
                    <button className="btn btn--primary btn--lg" onClick={p.onBrowse}>
                      <Compass />
                      Browse mods
                    </button>
                    <button className="btn btn--secondary btn--lg" onClick={p.onInstallArchive}>
                      <FolderPlus />
                      Add from file
                    </button>
                    <button className="btn btn--ghost btn--lg" onClick={p.onOpenImport}>
                      <FolderInput />
                      Import existing mods
                    </button>
                  </>
                }
              >
                Find something you like in Browse, or drop a .zip, .7z or .rar anywhere in this window to install it.
              </EmptyState>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<SearchX />}
                title={selectedAgent && !hasFiltersBeyondAgent(status, category, query) ? `No mods for ${selectedAgent.display_name} yet` : 'Nothing matches'}
                tone="muted"
                compact
                actions={
                  <>
                    <button className="btn btn--secondary" onClick={clearFilters}>
                      Clear filters
                    </button>
                    <button className="btn btn--soft" onClick={p.onBrowse}>
                      <Compass />
                      Find mods
                    </button>
                  </>
                }
              >
                {hasFilters ? 'Try a different search or clear the filters to see everything.' : ''}
              </EmptyState>
            ) : (
              <div className="mod-grid">
                {filtered.map((mod, i) => (
                  <ModDeckCard
                    key={mod.mod_uuid}
                    index={i}
                    mod={mod}
                    motif={p.theme.motif}
                    agent={p.resolveAgent(mod.agent_id, mod.title)}
                    isSelected={p.selectedModUuid === mod.mod_uuid}
                    clashes={clashes.get(mod.mod_uuid)}
                    onTurnOffMod={(id, title) => p.onSetModsEnabled([{ modUuid: id, enabled: false }], `Turned off “${title}”`, true)}
                    onUndoUpdate={p.previousVersions[mod.mod_uuid] ? () => p.onUndoUpdate(mod.mod_uuid) : undefined}
                    onOpenInspector={() => p.onOpenMod(mod.mod_uuid)}
                    onToggleEnabled={() => p.onToggleEnabled(mod.mod_uuid)}
                    onRepair={() => p.onRepair(mod.mod_uuid)}
                    onSetCustomImageFile={() => p.onSetCustomImage(mod.mod_uuid)}
                    onPasteThumbnailFromClipboard={() => p.onPasteThumbnail(mod.mod_uuid)}
                    onDelete={() => p.onDelete(mod.mod_uuid)}
                    onOpenFolder={() => p.onOpenFolder(mod.install_path)}
                    update={p.modUpdates[mod.mod_uuid] ?? null}
                    isUpdating={p.updatingIds.has(mod.mod_uuid)}
                    onUpdate={() => p.onUpdateMod(mod.mod_uuid)}
                    onDownloadMissing={p.canFetchMissing(mod) ? () => p.onDownloadMissing(mod.mod_uuid) : undefined}
                    isFetchingFiles={p.fetchingIds.has(mod.mod_uuid)}
                    selectMode={selecting}
                    picked={picked.has(mod.mod_uuid)}
                    onPick={() => togglePick(mod.mod_uuid)}
                  />
                ))}
              </div>
            )}

            {selecting && (
              <div className="select-bar" role="toolbar" aria-label="Selected mods">
                <span className="select-bar__count">
                  <strong>{pickedMods.length}</strong> selected
                </span>
                <button className="btn btn--ghost btn--sm" onClick={pickAllShown} disabled={allShownPicked}>
                  Select all {filtered.length} shown
                </button>
                {pickedMods.length > 0 && (
                  <button className="btn btn--ghost btn--sm" onClick={() => setPicked(new Set())}>
                    Clear
                  </button>
                )}
                <div className="spacer" />
                {confirmBulkDelete ? (
                  <>
                    <span className="small">Delete {modCount(pickedMods.length)}? They go to Recently deleted.</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => setConfirmBulkDelete(false)}>
                      Keep them
                    </button>
                    <button className="btn btn--danger btn--sm" onClick={bulkDelete}>
                      <Trash2 />
                      Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn--secondary btn--sm" disabled={!pickedMods.some((m) => !m.enabled)} onClick={() => bulkSwitch(true)}>
                      <Power />
                      Turn on
                    </button>
                    <button className="btn btn--secondary btn--sm" disabled={!pickedMods.some((m) => m.enabled)} onClick={() => bulkSwitch(false)}>
                      <PowerOff />
                      Turn off
                    </button>
                    <button className="btn btn--secondary btn--sm" disabled={!pickedWithUpdates.length} onClick={bulkUpdate}>
                      <ArrowUpCircle />
                      Update{pickedWithUpdates.length ? ` (${pickedWithUpdates.length})` : ''}
                    </button>
                    <button className="btn btn--secondary btn--sm select-bar__danger" disabled={!pickedMods.length} onClick={() => setConfirmBulkDelete(true)}>
                      <Trash2 />
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}

            {!libraryEmpty && fixableCount > 0 && status !== 'ATTENTION' && filtered.length > 0 && (
              <div className="banner" style={{ marginTop: 8 }}>
                <Wrench style={{ color: 'var(--warning)' }} />
                <span style={{ flex: 1 }}>
                  {fixableCount} mod{fixableCount === 1 ? ' was' : 's were'} made for an older game version.
                </span>
                <button className="btn btn--sm btn--secondary" onClick={() => setStatus('ATTENTION')}>
                  Review
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Modal open={deletedOpen} onClose={() => setDeletedOpen(false)} labelledBy="deleted-title">
        <div className="modal__header">
          <div style={{ flex: 1 }}>
            <h2 id="deleted-title" className="h3">
              Recently deleted
            </h2>
            <p className="small muted">Put a mod back with its keys, cover and settings as they were. Older ones can be cleaned up in Settings.</p>
          </div>
          <button className="icon-btn" onClick={() => setDeletedOpen(false)} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="modal__body">
          <BackupsPanel only={['deleted']} compact onStateChange={p.onStateChange} />
        </div>
      </Modal>
    </div>
  );
};

function hasFiltersBeyondAgent(status: StatusFilter, category: CategoryFilter, query: string) {
  return status !== 'ALL' || category !== 'ALL' || query.trim() !== '';
}
