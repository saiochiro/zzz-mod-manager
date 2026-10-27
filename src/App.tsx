import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CloudOff, RefreshCw, UploadCloud } from 'lucide-react';
import { CustomTitleBar } from './components/CustomTitleBar';
import { GameBananaBrowserTab } from './components/GameBananaBrowserTab';
import { InspectorDrawer } from './components/InspectorDrawer';
import { FilePickModal, MultiAgentSplitModal } from './components/SystemModals';
import { ImportExistingLauncherModal } from './components/ImportExistingLauncherModal';
import { Sidebar, ScreenId, SyncHealth } from './layout/Sidebar';
import { LibraryScreen } from './screens/LibraryScreen';
import { SyncScreen, FolderStatus } from './screens/SyncScreen';
import { ThemesScreen } from './screens/ThemesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { WorkshopScreen } from './screens/WorkshopScreen';
import { fairyClient, FullAppState } from './services/fairyClient';
import {
  AgentHashEntry,
  AppConfig,
  DownloadQueueItem,
  GameBananaFile,
  GameBananaModItem,
  IngestionResult,
  MultiAgentCandidate,
  NsfwFilterState,
  ParsedIniDocument,
} from './shared/types';
import { normalizeNsfwFilter } from './shared/nsfw';
import {
  applyTheme,
  getTheme,
  storeThemeId,
  buildAppIconSvg,
  rasterizeSvg,
  Motif,
  applyCursor,
  readCursorSettings,
  storeCursorSettings,
  CursorSettings,
} from './themes';
import { EffectsSettings, readEffectsSettings, storeEffectsSettings, useInteractionEffects, usePauseWhenInactive } from './ui/effects';
import { EmptyState, Skeleton, ToastProvider, useToast, CardSkeletonGrid } from './ui';
import { getModHealth } from './ui/modStatus';
import { AppUpdatePrompt, useAppUpdate, useModUpdates } from './ui/updates';
import { SetupWizard, isSetupDone, markSetupDone } from './components/SetupWizard';
import { ThemeScene } from './themes/Scene';
import { RefreshCw as RestartIcon } from 'lucide-react';
import { version as APP_VERSION } from '../package.json';

const errMsg = (err: unknown) => (err as Error)?.message || String(err);

/** Pushes the theme's icon to the window / taskbar (PNG — Windows can't use SVG there). */
async function syncTaskbarIcon(themeId: string) {
  try {
    const theme = getTheme(themeId);
    const png = await rasterizeSvg(buildAppIconSvg(theme), 256);
    await fairyClient.updateThemeIcon(theme.id, png);
  } catch {
    // Browser preview or icon IPC unavailable — the in-app icon still updates.
  }
}

const AppInner: React.FC = () => {
  const notify = useToast();
  const isElectron = Boolean(window.fairyBridge?.isElectron);

  const [appState, setAppState] = useState<FullAppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreenState] = useState<ScreenId>(() => {
    try {
      const last = localStorage.getItem('pl_last_screen') as ScreenId | null;
      return last && ['library', 'browse', 'sync', 'themes', 'settings', 'workshop'].includes(last) ? last : 'library';
    } catch {
      return 'library';
    }
  });
  const setScreen = useCallback((next: ScreenId) => {
    setScreenState(next);
    try {
      localStorage.setItem('pl_last_screen', next);
    } catch {
      // per-viewer convenience only
    }
  }, []);

  const [activeTheme, setActiveTheme] = useState<string>(() => document.documentElement.dataset.theme || getTheme().id);
  const theme = getTheme(activeTheme);
  const [cursorSettings, setCursorSettings] = useState<CursorSettings>(readCursorSettings);
  const [effects, setEffects] = useState<EffectsSettings>(readEffectsSettings);

  useEffect(() => {
    applyCursor(cursorSettings, theme);
  }, [cursorSettings, theme]);
  useInteractionEffects(effects);
  usePauseWhenInactive();
  useEffect(() => {
    const root = document.documentElement;
    if (effects.background === 'scene') root.dataset.scene = '1';
    else delete root.dataset.scene;
  }, [effects.background]);

  const changeCursor = (patch: Partial<CursorSettings>) => {
    setCursorSettings((prev) => {
      const next = { ...prev, ...patch };
      storeCursorSettings(next);
      return next;
    });
  };
  const changeEffects = (patch: Partial<EffectsSettings>) => {
    setEffects((prev) => {
      const next = { ...prev, ...patch };
      storeEffectsSettings(next);
      return next;
    });
  };

  const [nsfwFilterState, setNsfwFilterState] = useState<NsfwFilterState>(() => {
    try {
      return normalizeNsfwFilter(localStorage.getItem('zzz_nsfw_state'));
    } catch {
      return 'hide';
    }
  });

  // Details drawer
  const [selectedModUuid, setSelectedModUuid] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorDocs, setInspectorDocs] = useState<ParsedIniDocument[]>([]);
  const [inspectorMasterSwap, setInspectorMasterSwap] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Sync
  const [isSyncingXxmi, setIsSyncingXxmi] = useState(false);
  const [folderStatus, setFolderStatus] = useState<FolderStatus | null>(null);
  const [folderStatusError, setFolderStatusError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  // Browse
  const [gbFeed, setGbFeed] = useState<GameBananaModItem[]>([]);
  const [downloadQueue, setDownloadQueue] = useState<DownloadQueueItem[]>([]);

  // Misc
  const [isBusy, setIsBusy] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isDraggingOverWindow, setIsDraggingOverWindow] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /** GameBanana pages with several files waiting for the user to pick one (first is shown). */
  const [filePrompts, setFilePrompts] = useState<Array<{ title: string; files: GameBananaFile[]; isUpdate: boolean; retry: (fileId: number) => void }>>([]);
  const askForFile = (p: NonNullable<IngestionResult['filePrompt']>, retry: (fileId: number) => void) =>
    setFilePrompts((prev) => [...prev, { title: p.title, files: p.files, isUpdate: Boolean(p.replaceModUuid), retry }]);
  const [multiAgentPrompt, setMultiAgentPrompt] = useState<{
    stagingId: string;
    archiveName: string;
    candidates: MultiAgentCandidate[];
  } | null>(null);
  const [lastSeenLogId, setLastSeenLogId] = useState<string | null>(null);

  // Updates
  const appUpdate = useAppUpdate();
  const modUpdates = useModUpdates(appState?.mods ?? null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [setupOpen, setSetupOpen] = useState(false);

  /* ---------------------------------------------------------------- */
  /* Loading                                                          */
  /* ---------------------------------------------------------------- */
  const refreshFolderStatus = useCallback(async () => {
    try {
      setFolderStatusError(null);
      const res = await fairyClient.detectXxmiPaths();
      setFolderStatus(res);
    } catch (err) {
      setFolderStatus(null);
      setFolderStatusError(errMsg(err));
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoadError(null);
    try {
      const state = await fairyClient.getState();
      setAppState(state);
      setLastSyncAt(new Date());
      setLastSeenLogId((prev) => prev ?? state.logs[0]?.id ?? null);

      if (state.config.activeTheme) {
        const resolved = getTheme(state.config.activeTheme);
        if (resolved.id !== document.documentElement.dataset.theme) {
          applyTheme(resolved, { animate: false });
          storeThemeId(resolved.id);
        }
        setActiveTheme(resolved.id);
      }
      if (state.config.nsfwFilterState) setNsfwFilterState(normalizeNsfwFilter(state.config.nsfwFilterState));

      refreshFolderStatus();

      // Show the tutorial on first launch, and once more for everyone whenever
      // it gets a new step (see SETUP_KEY in SetupWizard).
      if (!isSetupDone()) setSetupOpen(true);

      // The feed loads separately so a slow network never blocks the library.
      fairyClient
        .getGameBananaFeed({ page: 1, perPage: 24, sort: 'featured' })
        .then(setGbFeed)
        .catch(() => {});
      Promise.all([
        fairyClient.getGameBananaFeed({ page: 1, perPage: 24, sort: 'likes', categoryFilter: 'all' }),
        fairyClient.getGameBananaFeed({ page: 1, perPage: 24, sort: 'updated', categoryFilter: 'all' }),
      ]).catch(() => {});
    } catch (err) {
      console.error('Failed to initialize state:', err);
      setLoadError(errMsg(err));
    }
  }, [refreshFolderStatus]);

  useEffect(() => {
    syncTaskbarIcon(activeTheme);
    loadInitialData();
    if (window.fairyBridge?.onStateUpdated) {
      return window.fairyBridge.onStateUpdated((newState) => {
        setAppState(newState);
        setLastSyncAt(new Date());
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+1…5 jumps between screens
  useEffect(() => {
    const order: ScreenId[] = ['library', 'browse', 'sync', 'themes', 'settings'];
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < order.length) {
        e.preventDefault();
        setScreen(order[idx]);
        setInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Theme & preferences                                              */
  /* ---------------------------------------------------------------- */
  const handleThemeChange = async (newThemeId: string) => {
    const themeObj = getTheme(newThemeId);
    if (themeObj.id === activeTheme) return;
    setActiveTheme(themeObj.id);
    storeThemeId(themeObj.id);
    applyTheme(themeObj);
    syncTaskbarIcon(themeObj.id);
    try {
      const res = await fairyClient.updateConfig({ activeTheme: themeObj.id });
      setAppState(res.state);
    } catch (err) {
      console.warn('Theme saved locally; backend config update failed:', err);
    }
  };

  const handleChangeNsfwFilterState = (nextState: NsfwFilterState) => {
    setNsfwFilterState(nextState);
    try {
      localStorage.setItem('zzz_nsfw_state', nextState);
    } catch {
      // ignore
    }
    fairyClient
      .updateConfig({
        nsfwFilterState: nextState,
        hideNsfw: nextState === 'hide',
        nsfwMode: nextState === 'blur' ? 'blur' : 'hide',
      })
      .then((res) => setAppState(res.state))
      .catch(() => {});
  };

  const handleToggleSingleActivePerAgent = async () => {
    if (!appState) return;
    const nextVal = !appState.config.singleActivePerAgent;
    try {
      const res = await fairyClient.updateConfig({ singleActivePerAgent: nextVal });
      setAppState(res.state);
      notify({
        tone: 'success',
        title: nextVal ? 'One outfit per character' : 'Multiple outfits allowed',
        message: nextVal
          ? 'Turning an outfit on now turns off that character’s other outfits.'
          : 'You can now have several outfits on for the same character.',
      });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t change that setting', message: errMsg(err) });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Profiles                                                         */
  /* ---------------------------------------------------------------- */
  const handleApplyProfile = async (profileName: string) => {
    setIsBusy(true);
    try {
      const res = await fairyClient.applyProfile(profileName);
      setAppState(res.state);
      notify({ tone: 'success', title: `Switched to “${profileName}”`, message: `${res.message ?? ''} ${res.enabledCount} mods on.`.trim() });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t switch loadout', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveProfile = async (profileName: string) => {
    try {
      const res = await fairyClient.saveProfile(profileName);
      setAppState(res.state);
      notify({ tone: 'success', title: `Saved loadout “${res.profileName}”`, message: `${res.enabledCount} mods on.` });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t save loadout', message: errMsg(err) });
    }
  };

  const handleDeleteProfile = async (profileName: string) => {
    setIsBusy(true);
    try {
      const res = await fairyClient.deleteProfile(profileName);
      setAppState(res.state);
      notify({ tone: 'success', title: `Deleted “${profileName}”`, message: `Now using “${res.activeProfile}”.` });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t delete loadout', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRenameProfile = async (oldName: string, newName: string) => {
    setIsBusy(true);
    try {
      const res = await fairyClient.renameProfile(oldName, newName);
      setAppState(res.state);
      notify({ tone: 'success', title: `Renamed to “${res.newName}”` });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t rename loadout', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Library actions                                                  */
  /* ---------------------------------------------------------------- */
  const handleOrganizeFolders = async () => {
    setIsBusy(true);
    try {
      const res = await fairyClient.organizeFolders();
      setAppState(res.state);
      notify({ tone: 'success', title: 'Folders tidied', message: res.message });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t tidy folders', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleUndoOrganizeFolders = async () => {
    setIsBusy(true);
    try {
      const res = await fairyClient.undoOrganizeFolders();
      setAppState(res.state);
      notify({ tone: 'success', title: 'Folder names restored', message: res.message });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t undo', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSyncXxmi = async () => {
    setIsSyncingXxmi(true);
    try {
      const res = await fairyClient.syncWithXxmi();
      setAppState(res.state);
      setLastSyncAt(new Date());
      notify({ tone: 'success', title: 'Synced', message: `${res.state.mods.length} mods found in your mods folder.` });
    } catch (err) {
      notify({
        tone: 'error',
        title: 'Sync failed',
        message: errMsg(err),
        action: { label: 'Check folders', onClick: () => setScreen('settings') },
      });
    } finally {
      setIsSyncingXxmi(false);
      refreshFolderStatus();
    }
  };

  const handleOpenInspector = async (modUuid: string) => {
    setSelectedModUuid(modUuid);
    setInspectorOpen(true);
    setIsLoadingDetails(true);
    try {
      const inspection = await fairyClient.inspectMod(modUuid);
      setInspectorDocs(inspection.iniDocuments);
      setInspectorMasterSwap(inspection.masterSwapContent);
    } catch (err) {
      console.error('Failed to inspect mod:', err);
      setInspectorDocs([]);
      setInspectorMasterSwap(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const toggleSeqRef = useRef(0);
  const handleToggleEnabled = async (modUuid: string) => {
    // Optimistic flip so the switch responds instantly
    setAppState((prev) =>
      prev ? { ...prev, mods: prev.mods.map((m) => (m.mod_uuid === modUuid ? { ...m, enabled: !m.enabled } : m)) } : prev
    );
    const seq = ++toggleSeqRef.current;
    try {
      const res = await fairyClient.toggleEnabled(modUuid);
      // With several quick clicks, only the newest answer replaces the list (no flicker back).
      if (seq === toggleSeqRef.current) setAppState(res.state);
      if (res.autoDisabledMods && res.autoDisabledMods.length > 0) {
        notify({ tone: 'info', title: `Turned on “${res.mod.title}”`, message: `Turned off: ${res.autoDisabledMods.join(', ')}` });
      }
      if (selectedModUuid === modUuid && inspectorOpen) {
        handleOpenInspector(modUuid);
      }
    } catch (err) {
      setAppState((prev) =>
        prev ? { ...prev, mods: prev.mods.map((m) => (m.mod_uuid === modUuid ? { ...m, enabled: !m.enabled } : m)) } : prev
      );
      notify({ tone: 'error', title: 'Couldn’t switch that mod', message: errMsg(err) });
    }
  };

  // Ctrl+F jumps to the search box of the screen you're on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const box = Array.from(document.querySelectorAll<HTMLInputElement>('.search input')).find((el) => el.offsetParent !== null);
        if (box) {
          e.preventDefault();
          box.focus();
          box.select();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleRevealMod = (modUuid: string) =>
    fairyClient.revealMod(modUuid).catch((err) => notify({ tone: 'error', title: 'Couldn’t open File Explorer', message: errMsg(err) }));
  /** Library cards pass the folder path; find the mod it belongs to and reveal it by id. */
  const handleRevealModByPath = (installPath: string) => {
    const mod = appState?.mods.find((m) => m.install_path === installPath);
    if (mod) handleRevealMod(mod.mod_uuid);
    else fairyClient.openModFolder(installPath);
  };

  /** Mods with missing files that came from GameBanana, so their files can be downloaded again. */
  const canFetchMissing = (m: { health_status?: string; missing_resources?: string[]; gamebanana_id?: number | null }) =>
    m.health_status === 'broken' && Boolean(m.gamebanana_id) && (m.missing_resources?.length ?? 0) > 0;

  const handleDownloadMissing = async (modUuid: string, opts: { quiet?: boolean } = {}): Promise<number> => {
    const mod = appState?.mods.find((m) => m.mod_uuid === modUuid);
    setFetchingIds((prev) => new Set(prev).add(modUuid));
    try {
      const res = await fairyClient.downloadMissingFiles(modUuid);
      setAppState(res.state);
      if (!opts.quiet) {
        const name = mod ? `“${mod.title}”` : 'the mod';
        if (res.restored.length && !res.stillMissing.length) {
          notify({ tone: 'success', title: `Fixed ${name}`, message: `Downloaded ${res.restored.length} missing file${res.restored.length === 1 ? '' : 's'}. Nothing else was changed.` });
        } else if (res.restored.length) {
          notify({
            tone: 'warning',
            title: `Partly fixed ${name}`,
            message: `Downloaded ${res.restored.length} file${res.restored.length === 1 ? '' : 's'}. ${res.stillMissing.length} aren't in the GameBanana download either, so the mod's author would need to fix those.`,
          });
        } else {
          notify({
            tone: 'warning',
            title: `Couldn’t fix ${name}`,
            message: res.stillMissing.length
              ? "The missing files aren't in the GameBanana download either, so the mod's author would need to fix them."
              : 'No missing files were found.',
          });
        }
      }
      return res.restored.length;
    } catch (err) {
      if (!opts.quiet) notify({ tone: 'error', title: 'Couldn’t download the missing files', message: errMsg(err) });
      return 0;
    } finally {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(modUuid);
        return next;
      });
    }
  };

  const handleDownloadAllMissing = async () => {
    const targets = (appState?.mods ?? []).filter(canFetchMissing);
    let fixed = 0;
    let files = 0;
    for (const m of targets) {
      const n = await handleDownloadMissing(m.mod_uuid, { quiet: true });
      if (n) (fixed++, (files += n));
    }
    notify({
      tone: fixed === targets.length ? 'success' : 'warning',
      title: fixed ? `Fixed ${fixed} of ${targets.length} mod${targets.length === 1 ? '' : 's'}` : 'Nothing could be fixed',
      message: fixed
        ? `Downloaded ${files} missing file${files === 1 ? '' : 's'}.${fixed < targets.length ? ' The rest are missing files in their GameBanana download too, or GameBanana could not be reached.' : ''}`
        : "The missing files aren't in the GameBanana downloads either, or GameBanana could not be reached.",
    });
  };

  const handleResolveUnmanaged = async (modPath: string, action: 'import' | 'disable') => {
    try {
      const res = await fairyClient.resolveUnmanagedMod(modPath, action);
      setAppState(res.state);
      notify({
        tone: 'success',
        title: action === 'import' ? 'Added to your Library' : 'Turned off',
        message:
          action === 'import'
            ? 'It now shows in the Library, and the copy outside ProxyLaunch is turned off so it doesn\'t load twice.'
            : 'It no longer loads in the game. Its files are still in the game folder, renamed DISABLED_.',
      });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t change that mod', message: errMsg(err) });
    }
  };

  /** Several mods on/off at once ("All off", "Surprise me"): instant on screen, one sync behind it. */
  const handleSetModsEnabled = async (changes: Array<{ modUuid: string; enabled: boolean }>, message: string, undoable = false) => {
    if (!changes.length) return;
    // What to put back on Undo: only the mods this actually changes.
    const before = new Map((appState?.mods ?? []).map((m) => [m.mod_uuid, m.enabled]));
    const undo = changes
      .filter((c) => before.has(c.modUuid) && before.get(c.modUuid) !== c.enabled)
      .map((c) => ({ modUuid: c.modUuid, enabled: !c.enabled }));
    const want = new Map(changes.map((c) => [c.modUuid, c.enabled]));
    setAppState((prev) =>
      prev ? { ...prev, mods: prev.mods.map((m) => (want.has(m.mod_uuid) ? { ...m, enabled: want.get(m.mod_uuid)! } : m)) } : prev
    );
    const seq = ++toggleSeqRef.current;
    try {
      const res = await fairyClient.setModsEnabled(changes);
      if (seq === toggleSeqRef.current) setAppState(res.state);
      notify({
        tone: 'success',
        title: message,
        action: undoable && undo.length ? { label: 'Undo', onClick: () => void handleSetModsEnabled(undo, 'Put back as it was') } : undefined,
      });
    } catch (err) {
      fairyClient.getState().then(setAppState).catch(() => {});
      notify({ tone: 'error', title: 'Couldn’t switch those mods', message: errMsg(err) });
    }
  };

  const handleToggleHCycle = async (modUuid: string) => {
    try {
      const res = await fairyClient.toggleHCycle(modUuid);
      setAppState(res.state);
      if (selectedModUuid === modUuid && inspectorOpen) {
        setInspectorMasterSwap(res.masterSwapContent);
      }
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t update outfit rotation', message: errMsg(err) });
    }
  };

  const handleRemapKey = async (modUuid: string, sectionName: string, newKey: string) => {
    try {
      const res = await fairyClient.remapSubToggle(modUuid, sectionName, newKey);
      setAppState(res.state);
      if (selectedModUuid === modUuid) {
        setInspectorDocs(res.inspection.iniDocuments);
        setInspectorMasterSwap(res.inspection.masterSwapContent);
      }
      notify({ tone: 'success', title: `Hotkey set to ${newKey}`, duration: 2500 });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t change hotkey', message: errMsg(err) });
    }
  };

  const handleStandardizeAll = async (agentId?: string) => {
    setIsBusy(true);
    try {
      const res = await fairyClient.standardizeHotkeys(agentId);
      setAppState(res.state);
      if (selectedModUuid && inspectorOpen) await handleOpenInspector(selectedModUuid);
      notify({
        tone: 'success',
        title: res.updatedModsCount ? 'Hotkeys tidied' : 'Hotkeys were already tidy',
        message: res.updatedModsCount
          ? `${res.totalKeysRemapped} key${res.totalKeysRemapped === 1 ? '' : 's'} moved in ${res.updatedModsCount} mod${res.updatedModsCount === 1 ? '' : 's'}. Each mod's keys now only work while its character is on screen. The old files are kept in backups.`
          : undefined,
      });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t tidy hotkeys', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRepairMod = async (modUuid: string) => {
    setIsBusy(true);
    try {
      const res = await fairyClient.repairMod(modUuid);
      setAppState(res.state);
      if (selectedModUuid === modUuid && inspectorOpen) {
        setInspectorDocs(res.inspection.iniDocuments);
        setInspectorMasterSwap(res.inspection.masterSwapContent);
      }
      notify({
        tone: 'success',
        title: `Fixed “${res.manifest.title}”`,
        message: 'A backup of the original files was kept.',
        action: { label: 'Undo', onClick: () => handleUndoRepair(modUuid) },
      });
    } catch (err) {
      notify({ tone: 'error', title: 'Fix didn’t work', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRepairAllBroken = async () => {
    setIsBusy(true);
    try {
      const res = await fairyClient.repairAll();
      setAppState(res.state);
      if (selectedModUuid && inspectorOpen) await handleOpenInspector(selectedModUuid);
      notify({
        tone: 'success',
        title: `Fixed ${res.results.length} mod${res.results.length === 1 ? '' : 's'}`,
        message: 'Backups of the original files were kept.',
      });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t fix everything', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleUndoRepair = async (modUuid: string) => {
    setIsBusy(true);
    try {
      const res = await fairyClient.undoRepair(modUuid);
      setAppState(res.state);
      if (selectedModUuid === modUuid && inspectorOpen) {
        setInspectorDocs(res.inspection.iniDocuments);
        setInspectorMasterSwap(res.inspection.masterSwapContent);
      }
      notify({ tone: 'success', title: 'Original files restored', message: res.message });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t restore backup', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSetCustomImageFile = async (modUuid: string) => {
    try {
      const selectedImg = await fairyClient.selectLocalArchiveOrFolder('image');
      if (selectedImg) {
        const res = await fairyClient.setCustomThumbnail(modUuid, selectedImg);
        setAppState(res.state);
        notify({ tone: 'success', title: 'Cover updated' });
      }
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t set cover image', message: errMsg(err) });
    }
  };

  const handlePasteThumbnailFromClipboard = async (modUuid: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            const reader = new FileReader();
            reader.onload = async () => {
              if (typeof reader.result === 'string') {
                const res = await fairyClient.setCustomThumbnail(modUuid, reader.result);
                setAppState(res.state);
                notify({ tone: 'success', title: 'Cover pasted from clipboard' });
              }
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
      }
      await handleSetCustomImageFile(modUuid);
    } catch {
      await handleSetCustomImageFile(modUuid);
    }
  };

  const handleDeleteMods = async (modUuids: string[]) => {
    let done = 0;
    let latest: FullAppState | null = null;
    for (const id of modUuids) {
      try {
        latest = (await fairyClient.deleteMod(id)).state;
        done++;
      } catch (err) {
        notify({ tone: 'error', title: 'Couldn’t delete a mod', message: errMsg(err) });
      }
    }
    if (latest) setAppState(latest);
    if (selectedModUuid && modUuids.includes(selectedModUuid)) {
      setSelectedModUuid(null);
      setInspectorOpen(false);
    }
    if (done) notify({ tone: 'success', title: `Deleted ${done} mod${done === 1 ? '' : 's'}`, message: 'They can be put back from Recently deleted.' });
  };

  const handleDeleteMod = async (modUuid: string) => {
    const title = appState?.mods.find((m) => m.mod_uuid === modUuid)?.title ?? 'Mod';
    try {
      const res = await fairyClient.deleteMod(modUuid);
      setAppState(res.state);
      if (selectedModUuid === modUuid) {
        setSelectedModUuid(null);
        setInspectorOpen(false);
      }
      notify({ tone: 'success', title: `Deleted “${title}”` });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t delete mod', message: errMsg(err) });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Installing                                                       */
  /* ---------------------------------------------------------------- */
  const handleInstallFromGameBanana = async (mod: GameBananaModItem, fileId?: number) => {
    const queueId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDownloadQueue((prev) => [
      ...prev,
      { queue_id: queueId, mod_id: mod.id, title: mod.title, status: 'downloading', progress: 25, stage_label: 'Downloading…' },
    ]);
    try {
      setTimeout(() => {
        setDownloadQueue((prev) =>
          prev.map((q) => (q.queue_id === queueId && q.status === 'downloading' ? { ...q, progress: 65, stage_label: 'Unpacking…' } : q))
        );
      }, 450);

      const res = await fairyClient.ingestPackage(mod.download_url, { metadataOverride: mod, fileId });
      setAppState(res.state);
      if (res.filePrompt) {
        setDownloadQueue((prev) => prev.filter((q) => q.queue_id !== queueId));
        askForFile(res.filePrompt, (id) => handleInstallFromGameBanana(mod, id));
        return;
      }
      if (res.multiAgentPrompt) setMultiAgentPrompt(res.multiAgentPrompt);
      // The backend reports failures in the result instead of throwing.
      if (!res.success) throw new Error(res.error || 'The install failed.');
      if (!res.multiAgentPrompt && res.installedMods.length === 0) throw new Error('Nothing in that download could be installed as a mod.');

      setDownloadQueue((prev) =>
        prev.map((q) => (q.queue_id === queueId ? { ...q, progress: 100, status: 'completed', stage_label: 'Installed' } : q))
      );
      if (!res.multiAgentPrompt) {
        notify({
          tone: 'success',
          title: `Installed “${mod.title}”`,
          action: { label: 'View in library', onClick: () => setScreen('library') },
        });
      }
      setTimeout(() => setDownloadQueue((prev) => prev.filter((q) => q.queue_id !== queueId)), 1500);
    } catch (err) {
      setDownloadQueue((prev) =>
        prev.map((q) => (q.queue_id === queueId ? { ...q, status: 'error', error: errMsg(err), stage_label: 'Failed' } : q))
      );
      notify({ tone: 'error', title: `Couldn’t install “${mod.title}”`, message: errMsg(err) });
      setTimeout(() => setDownloadQueue((prev) => prev.filter((q) => q.queue_id !== queueId)), 6000);
    }
  };

  const handleIngestUrlOrPath = async (source: string, fileId?: number) => {
    setIsBusy(true);
    try {
      const res = await fairyClient.ingestPackage(source, fileId ? { fileId } : undefined);
      setAppState(res.state);
      if (res.filePrompt) {
        askForFile(res.filePrompt, (id) => handleIngestUrlOrPath(source, id));
        return;
      }
      if (res.multiAgentPrompt) setMultiAgentPrompt(res.multiAgentPrompt);
      if (!res.success) throw new Error(res.error || 'The install failed.');
      if (res.installedMods.length > 0) {
        notify({
          tone: 'success',
          title: res.installedMods.length === 1 ? `Installed “${res.installedMods[0].title}”` : `Installed ${res.installedMods.length} mods`,
          action: screen !== 'library' ? { label: 'View in library', onClick: () => setScreen('library') } : undefined,
        });
      }
    } catch (err) {
      notify({ tone: 'error', title: 'Install failed', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  const handleImportArchiveDialog = async () => {
    const selected = await fairyClient.selectLocalArchiveOrFolder('file');
    if (selected) {
      handleIngestUrlOrPath(selected);
    } else if (!isElectron) {
      notify({ tone: 'info', title: 'Drop a file instead', message: 'Drag a .zip, .7z or .rar onto this window to install it.' });
    }
  };

  const handleConfirmMultiAgentSplit = async (stagingId: string) => {
    setMultiAgentPrompt(null);
    setIsBusy(true);
    try {
      const res = await fairyClient.confirmMultiAgentSplit(stagingId);
      setAppState(res.state);
      notify({ tone: 'success', title: `Installed ${res.installedMods.length} mods` });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t split the pack', message: errMsg(err) });
    } finally {
      setIsBusy(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Mod updates                                                      */
  /* ---------------------------------------------------------------- */
  const handleUpdateMod = async (uuid: string, opts: { quiet?: boolean; fileId?: number } = {}): Promise<boolean> => {
    const profile = modUpdates.updates[uuid];
    const old = appState?.mods.find((m) => m.mod_uuid === uuid);
    if (!profile || !old) return false;
    setUpdatingIds((prev) => new Set(prev).add(uuid));
    try {
      // Install by mod id (the download link holds a file number, not the mod's). The backend moves
      // the old version to backups and installs the new one already on or off, like the old one was.
      const res = await fairyClient.ingestPackage(profile.id ? `gb:${profile.id}` : profile.download_url, {
        metadataOverride: profile,
        replaceModUuid: uuid,
        fileId: opts.fileId,
      });
      const latest = res.state;
      setAppState(latest);
      if (res.filePrompt) {
        // A page with several files and no remembered choice: the current version stays until one is picked.
        askForFile(res.filePrompt, (id) => handleUpdateMod(uuid, { ...opts, fileId: id }));
        return false;
      }
      if (res.multiAgentPrompt) {
        setMultiAgentPrompt(res.multiAgentPrompt);
        notify({
          tone: 'info',
          title: 'Choose how to install the new version',
          message: `The current version of “${old.title}” stays installed until you're happy with the new one.`,
        });
        return false;
      }
      if (!res.success) throw new Error(res.error || 'The update failed.');
      if (!res.installedMods.length) throw new Error(res.error || 'The download had no installable files.');
      modUpdates.clear(uuid);
      if (selectedModUuid === uuid) setInspectorOpen(false);
      if (!opts.quiet) {
        // Workshop mixes keep their own copy of the parts, so they keep working; offer the rebuild.
        const mixes = latest.mods.filter((m) => (m.tags || []).includes('Workshop') && m.agent_id === old.agent_id);
        notify({
          tone: 'success',
          title: `Updated “${old.title}”`,
          message: mixes.length
            ? 'The previous version is saved in backups. Workshop mixes that use its parts still work, and you can rebuild them with the update in the Workshop.'
            : 'The previous version is saved in backups.',
          action: mixes.length && latest.config.workshopEnabled !== false ? { label: 'Open Workshop', onClick: () => setScreen('workshop' as ScreenId) } : undefined,
        });
      }
      return true;
    } catch (err) {
      notify({ tone: 'error', title: `Couldn’t update “${old.title}”`, message: errMsg(err) });
      return false;
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(uuid);
        return next;
      });
    }
  };

  /** Puts back the version an update replaced (the newer one goes to backups, so this can be undone too). */
  const handleUndoUpdate = async (uuid: string) => {
    const backupId = appState?.previousVersions?.[uuid];
    const mod = appState?.mods.find((m) => m.mod_uuid === uuid);
    if (!backupId || !mod) return;
    setUpdatingIds((prev) => new Set(prev).add(uuid));
    try {
      const res = await fairyClient.restoreBackup(backupId);
      setAppState(res.state);
      const canSwitchBack = Boolean(res.state.previousVersions?.[uuid]);
      notify({
        tone: 'success',
        title: `Went back to the previous version of “${mod.title}”`,
        message: 'The newer version is in backups.',
        action: canSwitchBack ?{ label: 'Undo', onClick: () => void handleUndoUpdate(uuid) } : undefined,
      });
    } catch (err) {
      notify({ tone: 'error', title: `Couldn’t go back to the previous version of “${mod.title}”`, message: errMsg(err) });
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(uuid);
        return next;
      });
    }
  };

  const handleUpdateAllMods = async () => {
    const ids = Object.keys(modUpdates.updates);
    let ok = 0;
    for (const id of ids) {
      if (await handleUpdateMod(id, { quiet: true })) ok++;
    }
    if (ok > 0) {
      notify({ tone: 'success', title: `Updated ${ok} mod${ok === 1 ? '' : 's'}`, message: 'Previous versions are saved in backups.' });
    }
  };

  const handleCheckModUpdates = async () => {
    const r = await modUpdates.check();
    if (r.offline) {
      notify({ tone: 'info', title: 'You’re offline', message: 'Mod updates are checked on GameBanana, which needs the internet. Your mods work as usual.' });
      return;
    }
    notify({
      tone: r.found ? 'info' : 'success',
      title: r.found ? `${r.found} mod update${r.found === 1 ? '' : 's'} available` : 'All mods are up to date',
      message: r.checked ? `Checked ${r.checked} mod${r.checked === 1 ? '' : 's'} from GameBanana.` : 'No GameBanana mods to check.',
      action: r.found ? { label: 'Show me', onClick: () => setScreen('library') } : undefined,
    });
  };

  /* ---------------------------------------------------------------- */
  /* Game                                                             */
  /* ---------------------------------------------------------------- */
  const handleLaunchGame = async (mode: 'modded' | 'vanilla' = 'modded') => {
    setIsLaunching(true);
    try {
      const res = await fairyClient.launchGame(mode);
      setAppState(res.state);
      if (res.success) {
        notify({ tone: 'success', title: mode === 'modded' ? 'Starting with mods' : 'Starting without mods', message: res.message });
      } else {
        notify({
          tone: 'error',
          title: 'Couldn’t start the game',
          message: res.error || res.message,
          action: { label: 'Check settings', onClick: () => setScreen('settings') },
        });
      }
    } catch (err) {
      notify({
        tone: 'error',
        title: 'Couldn’t start the game',
        message: errMsg(err),
        action: { label: 'Check settings', onClick: () => setScreen('settings') },
      });
    } finally {
      setIsLaunching(false);
    }
  };

  const handleSendF10 = async () => {
    try {
      const res = await fairyClient.sendF10();
      setAppState(res.state);
      notify({
        tone: res.success ? 'success' : 'warning',
        title: res.success ? 'Reloaded in game' : 'Game isn’t running',
        message: res.success ? undefined : 'Start the game first, then reload.',
      });
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t reload in game', message: errMsg(err) });
    }
  };

  /* ---------------------------------------------------------------- */
  /* Drag & drop install                                              */
  /* ---------------------------------------------------------------- */
  const handleWindowDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOverWindow) setIsDraggingOverWindow(true);
  };
  const handleWindowDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.relatedTarget || !(e.currentTarget as Node).contains(e.relatedTarget as Node)) {
      setIsDraggingOverWindow(false);
    }
  };
  const handleWindowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverWindow(false);
    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) {
      const filePath = (file as File & { path?: string }).path;
      if (filePath) await handleIngestUrlOrPath(filePath);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Derived                                                          */
  /* ---------------------------------------------------------------- */
  const resolveAgent = useCallback(
    (agentId: string, title?: string): AgentHashEntry | null => {
      if (!appState) return null;
      const agents = appState.hashDb.agents;
      if (!agentId || agentId === 'uncategorized') return null;
      if (agents[agentId]) return agents[agentId];
      const cleanKey = agentId.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const [k, ag] of Object.entries(agents)) {
        if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey) return ag;
        if (ag.display_name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKey) return ag;
      }
      if (title) {
        const cleanTitle = title.toLowerCase();
        for (const ag of Object.values(agents)) {
          if (cleanTitle.includes(ag.display_name.toLowerCase())) return ag;
        }
      }
      return null;
    },
    [appState]
  );

  /* ---------------------------------------------------------------- */
  /* Loading & fatal error states                                     */
  /* ---------------------------------------------------------------- */
  if (!appState) {
    return (
      <div className="app">
        <CustomTitleBar
          activeTheme={activeTheme}
          logs={[]}
          unseenActivity={0}
          onActivityOpened={() => {}}
          onSelectMod={() => {}}
          onViewActivity={() => {}}
          isElectron={isElectron}
        />
        <div className="shell">
          <aside className="sidebar" aria-hidden="true">
            <Skeleton h={50} r={12} />
            <div className="stack" style={{ marginTop: 8 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} h={36} r={10} />
              ))}
            </div>
            <div className="spacer" />
            <Skeleton h={52} r={16} />
          </aside>
          <main className="main">
            {loadError ? (
              <div className="page-body" style={{ margin: 'auto', width: 'min(640px, 100%)' }}>
                <EmptyState
                  icon={<CloudOff />}
                  title="Couldn’t start the mod manager"
                  tone="error"
                  motif={theme.motif}
                  actions={
                    <button className="btn btn--primary btn--lg" onClick={loadInitialData}>
                      <RefreshCw />
                      Try again
                    </button>
                  }
                >
                  The background service didn’t respond ({loadError}). Your mods are safe — nothing was changed.
                </EmptyState>
              </div>
            ) : (
              <>
                <div className="busy-bar" />
                <section className="page-hero">
                  <Motif kind={theme.motif} className="page-hero__motif" density={22} opacity={0.45} seed="library" />
                  <div className="page-hero__content">
                    <div className="stack" style={{ width: 320 }}>
                      <Skeleton w={120} h={12} />
                      <Skeleton w={220} h={34} r={10} />
                      <Skeleton w={300} h={30} r={99} />
                    </div>
                  </div>
                </section>
                <div className="page-body">
                  <CardSkeletonGrid count={8} />
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    );
  }

  const { config, hashDb, mods, logs } = appState;
  // The content filter only applies to Browse; the Library always shows everything.
  const needsAttention = mods.filter((m) => getModHealth(m) !== 'working').length;
  const activeModsCount = mods.filter((m) => m.enabled).length;
  const canUndoOrganize = mods.some((m) => Boolean(m.previous_folder_name));
  const selectedMod = mods.find((m) => m.mod_uuid === selectedModUuid) || null;
  const unseenIdx = lastSeenLogId ? logs.findIndex((l) => l.id === lastSeenLogId) : 0;
  const unseenActivity = unseenIdx === -1 ? Math.min(logs.length, 20) : unseenIdx;

  const syncHealth: SyncHealth = isSyncingXxmi
    ? 'busy'
    : folderStatusError
    ? 'error'
    : !folderStatus
    ? 'unknown'
    : folderStatus.isValid
    ? 'ok'
    : 'error';
  const syncLabel =
    syncHealth === 'busy' ? 'Syncing…' : syncHealth === 'ok' ? 'Connected' : syncHealth === 'unknown' ? 'Checking…' : 'Not found';

  const openMod = (uuid: string) => {
    setScreen('library');
    handleOpenInspector(uuid);
  };

  const saveConfig = async (partial: Partial<AppConfig>) => {
    try {
      const res = await fairyClient.updateConfig(partial);
      setAppState(res.state);
      if (partial.nsfwFilterState) setNsfwFilterState(normalizeNsfwFilter(partial.nsfwFilterState));
      if ('xxmiModsPath' in partial || 'zzzExePath' in partial || 'zzmiLoaderPath' in partial) {
        notify({ tone: 'success', title: 'Settings saved' });
        refreshFolderStatus();
      }
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t save settings', message: errMsg(err) });
    }
  };

  const autoDiscover = async () => {
    try {
      const res = await fairyClient.autoDiscoverPaths();
      setAppState(res.state);
      const detected = await fairyClient.detectXxmiPaths().catch(() => null);
      if (detected) setFolderStatus(detected);
      notify({
        tone: detected?.isValid ? 'success' : 'warning',
        title: detected?.isValid ? 'Found your setup' : 'Couldn’t find everything',
        message: detected?.isValid ? `Using ${detected.detectedVia}.` : 'Choose the folders yourself in Settings.',
      });
    } catch (err) {
      notify({ tone: 'error', title: 'Auto-detect failed', message: errMsg(err) });
    }
  };

  return (
    <div className="app" onDragOver={handleWindowDragOver} onDragLeave={handleWindowDragLeave} onDrop={handleWindowDrop}>
      {isDraggingOverWindow && (
        <div className="drop-overlay">
          <div className="drop-overlay__card">
            <Motif kind={theme.motif} bias="edges" density={16} opacity={0.5} seed="drop" animated style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            <div className="empty__art" style={{ position: 'relative' }}>
              <UploadCloud />
            </div>
            <h2 className="display h2" style={{ position: 'relative' }}>
              Drop to install
            </h2>
            <p className="muted" style={{ position: 'relative' }}>
              .zip, .7z and .rar archives — we’ll detect the character and set it up for you.
            </p>
          </div>
        </div>
      )}

      {effects.background === 'scene' && <ThemeScene theme={theme} />}

      <CustomTitleBar
        activeTheme={activeTheme}
        logs={logs}
        unseenActivity={unseenActivity}
        onActivityOpened={() => setLastSeenLogId(logs[0]?.id ?? null)}
        onSelectMod={openMod}
        onViewActivity={() => setScreen('sync')}
        isElectron={isElectron}
        extra={
          appUpdate.status.state === 'downloaded' ? (
            <button className="btn btn--primary btn--sm titlebar-no-drag" onClick={appUpdate.install} title={`Install version ${appUpdate.status.version}`}>
              <RestartIcon />
              Restart to update
            </button>
          ) : null
        }
      />

      <div className="shell">
        <Sidebar
          screen={screen}
          onNavigate={(s) => {
            setScreen(s);
            setInspectorOpen(false);
          }}
          motif={theme.motif}
          modsCount={mods.length}
          needsAttention={needsAttention}
          downloadsCount={downloadQueue.filter((q) => q.status !== 'completed').length}
          activeProfile={config.activeProfile || 'Default'}
          savedProfiles={Object.keys(config.profiles || {})}
          onApplyProfile={handleApplyProfile}
          onSaveProfile={handleSaveProfile}
          onDeleteProfile={handleDeleteProfile}
          onRenameProfile={handleRenameProfile}
          activeModsCount={activeModsCount}
          syncHealth={syncHealth}
          syncLabel={syncLabel}
          onLaunch={handleLaunchGame}
          onReloadInGame={handleSendF10}
          isLaunching={isLaunching}
          showWorkshop={config.workshopEnabled !== false}
        />

        <main className="main" key={screen}>
          {(isBusy || isSyncingXxmi) && <div className="busy-bar" />}

          {screen === 'library' && (
            <LibraryScreen
              modUpdates={modUpdates.updates}
              updatingIds={updatingIds}
              onUpdateMod={(id) => handleUpdateMod(id)}
              onUpdateAllMods={handleUpdateAllMods}
              theme={theme}
              mods={mods}
              hashDb={hashDb}
              nsfwFilterState={nsfwFilterState}
              singleActivePerAgent={Boolean(config.singleActivePerAgent)}
              selectedModUuid={inspectorOpen ? selectedModUuid : null}
              resolveAgent={resolveAgent}
              previousVersions={appState?.previousVersions ?? {}}
              onUndoUpdate={handleUndoUpdate}
              deletedBackups={appState?.deletedBackups ?? 0}
              onStateChange={setAppState}
              onOpenMod={handleOpenInspector}
              onToggleEnabled={handleToggleEnabled}
              onRepair={handleRepairMod}
              onRepairAll={handleRepairAllBroken}
              canFetchMissing={canFetchMissing}
              fetchingIds={fetchingIds}
              onDownloadMissing={(id) => handleDownloadMissing(id)}
              onDownloadAllMissing={handleDownloadAllMissing}
              onSetCustomImage={handleSetCustomImageFile}
              onPasteThumbnail={handlePasteThumbnailFromClipboard}
              onDelete={handleDeleteMod}
              onDeleteMods={handleDeleteMods}
              onOpenFolder={handleRevealModByPath}
              onInstallArchive={handleImportArchiveDialog}
              onOpenImport={() => setImportOpen(true)}
              onBrowse={() => setScreen('browse')}
              onToggleSingleActive={handleToggleSingleActivePerAgent}
              onOrganizeFolders={handleOrganizeFolders}
              onUndoOrganize={handleUndoOrganizeFolders}
              canUndoOrganize={canUndoOrganize}
              onSetModsEnabled={handleSetModsEnabled}
              onTidyHotkeys={handleStandardizeAll}
              unmanagedGameMods={appState?.unmanagedGameMods ?? []}
              onResolveUnmanaged={handleResolveUnmanaged}
            />
          )}

          {screen === 'browse' && (
            <GameBananaBrowserTab
              feed={gbFeed}
              installedMods={mods}
              queue={downloadQueue}
              nsfwFilterState={nsfwFilterState}
              agents={hashDb.agents}
              motif={theme.motif}
              onInstallWithFairy={handleInstallFromGameBanana}
              onFetchLiveModId={handleIngestUrlOrPath}
              onStateChange={setAppState}
            />
          )}

          {screen === 'sync' && (
            <SyncScreen
              modUpdateCount={Object.keys(modUpdates.updates).length}
              modUpdatesLastChecked={modUpdates.lastChecked}
              checkingModUpdates={modUpdates.checking}
              onCheckModUpdates={handleCheckModUpdates}
              onUpdateAllMods={handleUpdateAllMods}
              updatingMods={updatingIds.size > 0}
              theme={theme}
              config={config}
              hashDb={hashDb}
              logs={logs}
              modsCount={mods.length}
              folderStatus={folderStatus}
              folderStatusError={folderStatusError}
              lastSyncAt={lastSyncAt}
              isSyncing={isSyncingXxmi}
              onSync={handleSyncXxmi}
              onAutoDetect={autoDiscover}
              onOpenImport={() => setImportOpen(true)}
              onFetchPreviews={async () => {
                try {
                  const res = await fairyClient.fetchMissingPreviews();
                  setAppState(res.state);
                  return res.fetchedCount > 0
                    ? `Added ${res.fetchedCount} cover${res.fetchedCount === 1 ? '' : 's'} (checked ${res.scannedCount} mods).`
                    : `All ${res.scannedCount} mods already have covers we could find.`;
                } catch (err) {
                  return `Couldn’t fetch covers: ${errMsg(err)}`;
                }
              }}
              onUpdateHashDb={async () => {
                try {
                  const res = await fairyClient.syncHashDb();
                  setAppState(res.state);
                  notify({ tone: 'success', title: 'Compatibility data updated', message: res.message });
                } catch (err) {
                  notify({ tone: 'error', title: 'Couldn’t update compatibility data', message: errMsg(err) });
                }
              }}
              onSelectMod={openMod}
              onOpenSettings={() => setScreen('settings')}
            />
          )}

          {screen === 'themes' && (
            <ThemesScreen
              activeThemeId={theme.id}
              onSelect={handleThemeChange}
              cursor={cursorSettings}
              onCursorChange={changeCursor}
              effects={effects}
              onEffectsChange={changeEffects}
            />
          )}

          {screen === 'workshop' && config.workshopEnabled !== false && (
            <WorkshopScreen
              theme={theme}
              mods={mods}
              hashDb={hashDb}
              nsfwFilterState={nsfwFilterState}
              onState={setAppState}
              onOpenLibrary={() => setScreen('library')}
              onDownloadGameBananaMod={async (id) => {
                try {
                  const item = await fairyClient.fetchGameBananaMod(id);
                  await handleInstallFromGameBanana(item);
                } catch (err) {
                  notify({ tone: 'error', title: 'Couldn’t download that mod', message: errMsg(err) });
                }
              }}
            />
          )}

          {screen === 'settings' && (
            <SettingsScreen
              appUpdate={appUpdate.status}
              onCheckAppUpdate={appUpdate.check}
              onDownloadAppUpdate={appUpdate.download}
              onInstallAppUpdate={appUpdate.install}
              theme={theme}
              config={config}
              hashDb={hashDb}
              appVersion={APP_VERSION}
              nsfwFilterState={nsfwFilterState}
              onChangeNsfw={handleChangeNsfwFilterState}
              onSaveConfig={saveConfig}
              onAutoDiscover={autoDiscover}
              onToggleSingleActive={handleToggleSingleActivePerAgent}
              onStandardizeHotkeys={handleStandardizeAll}
              onOrganizeFolders={handleOrganizeFolders}
              onUndoOrganize={handleUndoOrganizeFolders}
              canUndoOrganize={canUndoOrganize}
              onOpenImport={() => setImportOpen(true)}
              onOpenThemes={() => setScreen('themes')}
              onStateChange={setAppState}
              onRunSetup={() => setSetupOpen(true)}
            />
          )}
        </main>
      </div>

      {inspectorOpen && selectedMod && screen === 'library' && (
        <InspectorDrawer
          update={modUpdates.updates[selectedMod.mod_uuid] ?? null}
          isUpdating={updatingIds.has(selectedMod.mod_uuid)}
          onUpdate={() => handleUpdateMod(selectedMod.mod_uuid)}
          onIgnoreUpdate={() => {
            const p = modUpdates.updates[selectedMod.mod_uuid];
            if (p) modUpdates.ignore(selectedMod.mod_uuid, p);
          }}
          mod={selectedMod}
          agent={resolveAgent(selectedMod.agent_id, selectedMod.title)}
          motif={theme.motif}
          iniDocuments={inspectorDocs}
          masterSwapContent={inspectorMasterSwap}
          isLoadingDetails={isLoadingDetails}
          onClose={() => setInspectorOpen(false)}
          onToggleEnabled={handleToggleEnabled}
          onRemapKey={handleRemapKey}
          onStandardizeAll={handleStandardizeAll}
          onRepairMod={handleRepairMod}
          onUndoRepair={handleUndoRepair}
          onToggleHCycle={handleToggleHCycle}
          onOpenFolder={handleRevealMod}
          onDownloadMissing={canFetchMissing(selectedMod) ? (id) => handleDownloadMissing(id) : undefined}
          isFetchingFiles={fetchingIds.has(selectedMod.mod_uuid)}
          onSetCustomImageFile={handleSetCustomImageFile}
          onPasteThumbnailFromClipboard={handlePasteThumbnailFromClipboard}
          onStateChange={setAppState}
        />
      )}

      <FilePickModal
        prompt={filePrompts[0] ?? null}
        onPick={(id) => {
          const p = filePrompts[0];
          setFilePrompts((prev) => prev.slice(1));
          p?.retry(id);
        }}
        onCancel={() => setFilePrompts((prev) => prev.slice(1))}
      />
      <MultiAgentSplitModal promptData={multiAgentPrompt} onConfirmSplit={handleConfirmMultiAgentSplit} onCancel={() => setMultiAgentPrompt(null)} />

      <AppUpdatePrompt status={appUpdate.status} onDownload={appUpdate.download} onInstall={appUpdate.install} />

      <SetupWizard
        open={setupOpen}
        workshopEnabled={appState?.config.workshopEnabled !== false}
        activeTheme={activeTheme}
        onThemeChange={handleThemeChange}
        onSaveConfig={async (partial) => {
          const res = await fairyClient.updateConfig(partial);
          setAppState(res.state);
          refreshFolderStatus();
        }}
        onClose={() => {
          setSetupOpen(false);
          refreshFolderStatus();
          fairyClient.getState().then(setAppState).catch(() => {});
        }}
      />

      <ImportExistingLauncherModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImportSuccess={(count) => {
          loadInitialData();
          notify({ tone: 'success', title: `Imported ${count} mod${count === 1 ? '' : 's'}` });
        }}
      />
    </div>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <AppInner />
  </ToastProvider>
);
