import {
  AppConfig,
  ExternalLauncherDetection,
  FairyLogEntry,
  FairyState,
  GameBananaModItem,
  HashDatabase,
  IngestionResult,
  ModManifest,
  ParsedIniDocument,
} from '../shared/types';

declare global {
  interface Window {
    fairyBridge?: {
      isElectron: boolean;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      onStateUpdated: (cb: (state: FullAppState) => void) => () => void;
      on?: (channel: string, cb: (payload: any) => void) => () => void;
    };
  }
}

export interface AppUpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'downloaded' | 'error' | 'unsupported';
  current: string;
  version?: string;
  notes?: string;
  percent?: number;
  message?: string;
  checkedAt?: string;
}

export interface FullAppState {
  config: AppConfig;
  hashDb: HashDatabase;
  mods: ModManifest[];
  logs: FairyLogEntry[];
  fairyState: FairyState;
}

async function invokeBackend<T = any>(channel: string, ...args: any[]): Promise<T> {
  if (window.fairyBridge?.isElectron) {
    return window.fairyBridge.invoke(channel, ...args);
  }

  const res = await fetch('/api/zzz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, args }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Backend call failed: ${channel}`);
  }
  return res.json();
}

export const fairyClient = {
  getState: (): Promise<FullAppState> => invokeBackend('zzz:getState'),

  toggleEnabled: (
    modUuid: string
  ): Promise<{
    mod: ModManifest;
    elapsedMs: number;
    masterSwapCompiled: boolean;
    autoDisabledMods?: string[];
    state: FullAppState;
  }> => invokeBackend('zzz:toggleEnabled', modUuid),

  toggleHCycle: (
    modUuid: string
  ): Promise<{ mod: ModManifest; masterSwapContent: string | null; state: FullAppState }> =>
    invokeBackend('zzz:toggleHCycle', modUuid),

  inspectMod: (
    modUuid: string
  ): Promise<{
    manifest: ModManifest;
    iniDocuments: ParsedIniDocument[];
    masterSwapContent: string | null;
  }> => invokeBackend('zzz:inspectMod', modUuid),

  remapSubToggle: (
    modUuid: string,
    sectionName: string,
    newKey: string
  ): Promise<{
    mod: ModManifest;
    inspection: {
      manifest: ModManifest;
      iniDocuments: ParsedIniDocument[];
      masterSwapContent: string | null;
    };
    state: FullAppState;
  }> => invokeBackend('zzz:remapSubToggle', modUuid, sectionName, newKey),

  standardizeHotkeys: (): Promise<{
    updatedModsCount: number;
    totalKeysRemapped: number;
    state: FullAppState;
  }> => invokeBackend('zzz:standardizeHotkeys'),

  repairMod: (
    modUuid: string
  ): Promise<{
    success: boolean;
    manifest: ModManifest;
    appliedFixes: string[];
    inspection: {
      manifest: ModManifest;
      iniDocuments: ParsedIniDocument[];
      masterSwapContent: string | null;
    };
    state: FullAppState;
  }> => invokeBackend('zzz:repairMod', modUuid),

  repairAll: (): Promise<{ results: any[]; state: FullAppState }> =>
    invokeBackend('zzz:repairAll'),

  undoRepair: (
    modUuid: string
  ): Promise<{
    success: boolean;
    manifest: ModManifest;
    message: string;
    inspection: {
      manifest: ModManifest;
      iniDocuments: ParsedIniDocument[];
      masterSwapContent: string | null;
    };
    state: FullAppState;
  }> => invokeBackend('zzz:undoRepair', modUuid),

  deleteMod: (modUuid: string): Promise<{ state: FullAppState }> =>
    invokeBackend('zzz:deleteMod', modUuid),

  ingestPackage: (
    sourceInput: string,
    options?: any
  ): Promise<IngestionResult & { state: FullAppState }> =>
    invokeBackend('zzz:ingestPackage', sourceInput, options),

  confirmMultiAgentSplit: (
    stagingId: string
  ): Promise<IngestionResult & { state: FullAppState }> =>
    invokeBackend('zzz:confirmMultiAgentSplit', stagingId),

  getGameBananaFeed: (options?: any): Promise<GameBananaModItem[]> =>
    invokeBackend('zzz:getGameBananaFeed', options),

  importExistingFolder: (
    folderPath: string,
    mode: 'copy' | 'symlink' = 'copy'
  ): Promise<{
    importedCount: number;
    importedMods: ModManifest[];
    logs: string[];
    state: FullAppState;
  }> => invokeBackend('zzz:importExistingFolder', folderPath, mode),

  scanExternalLaunchers: (): Promise<string[]> =>
    invokeBackend('zzz:scanExternalLaunchers'),

  detectExternalLaunchersDetailed: (): Promise<ExternalLauncherDetection[]> =>
    invokeBackend('zzz:detectExternalLaunchersDetailed'),

  setCustomThumbnail: (
    modUuid: string,
    imageSource: string
  ): Promise<{ mod: ModManifest; state: FullAppState }> =>
    invokeBackend('zzz:setCustomThumbnail', modUuid, imageSource),

  saveProfile: (
    profileName: string
  ): Promise<{ profileName: string; enabledCount: number; state: FullAppState }> =>
    invokeBackend('zzz:saveProfile', profileName),

  applyProfile: (
    profileName: string
  ): Promise<{ profileName: string; enabledCount: number; message: string; state: FullAppState }> =>
    invokeBackend('zzz:applyProfile', profileName),

  deleteProfile: (
    profileName: string
  ): Promise<{ success: boolean; remainingProfiles: string[]; activeProfile: string; state: FullAppState }> =>
    invokeBackend('zzz:deleteProfile', profileName),

  renameProfile: (
    oldName: string,
    newName: string
  ): Promise<{ success: boolean; newName: string; state: FullAppState }> =>
    invokeBackend('zzz:renameProfile', oldName, newName),

  organizeFolders: (): Promise<{
    renamedCount: number;
    mappings: Array<{ modUuid: string; oldName: string; newName: string }>;
    message: string;
    state: FullAppState;
  }> => invokeBackend('zzz:organizeFolders'),

  undoOrganizeFolders: (): Promise<{
    restoredCount: number;
    message: string;
    state: FullAppState;
  }> => invokeBackend('zzz:undoOrganizeFolders'),

  fetchGameBananaMod: (modId: number): Promise<GameBananaModItem> =>
    invokeBackend('zzz:fetchGameBananaMod', modId),

  syncWithXxmi: (): Promise<{ state: FullAppState }> =>
    invokeBackend('xxmi:sync'),

  fetchMissingPreviews: (): Promise<{
    scannedCount: number;
    fetchedCount: number;
    logs: string[];
    state: FullAppState;
  }> => invokeBackend('xxmi:fetchMissingPreviews'),

  detectXxmiPaths: (): Promise<{ path: string; isValid: boolean; detectedVia: string }> =>
    invokeBackend('xxmi:detectPaths'),

  updateThemeIcon: (themeId: string, iconDataUrl: string): Promise<{ success: boolean }> =>
    invokeBackend('theme:update-icon', themeId, iconDataUrl),

  windowMinimize: (): Promise<boolean> => invokeBackend('window:minimize'),
  windowToggleMaximize: (): Promise<boolean> => invokeBackend('window:toggle-maximize'),
  windowClose: (): Promise<boolean> => invokeBackend('window:close'),
  windowIsMaximized: (): Promise<boolean> => invokeBackend('window:is-maximized'),

  syncHashDb: (): Promise<{ hashDb: HashDatabase; message: string; state: FullAppState }> =>
    invokeBackend('zzz:syncHashDb'),

  autoDiscoverPaths: (): Promise<{
    zzzExePath: string;
    zzmiRootPath: string;
    zzmiLoaderPath?: string;
    discoveredVia: string;
    state: FullAppState;
  }> => invokeBackend('zzz:autoDiscoverPaths'),

  updateConfig: (partial: Partial<AppConfig>): Promise<{ state: FullAppState }> =>
    invokeBackend('zzz:updateConfig', partial),

  launchGame: (
    mode: 'modded' | 'vanilla' = 'modded'
  ): Promise<{
    success: boolean;
    mode?: 'modded' | 'vanilla';
    compiledAgents: string[];
    activeModsCount: number;
    message: string;
    error?: string;
    state: FullAppState;
  }> => invokeBackend('zzz:launchGame', mode),

  moderateModImage: (mod: {
    id: number;
    thumbnail_url: string;
    title: string;
    category?: string;
  }): Promise<{
    modId: number;
    thumbnailUrl: string;
    isNsfw: boolean;
    confidence: number;
    reason: string;
    checkedAt: string;
  }> => invokeBackend('zzz:moderateModImage', mod),

  recordVisionResult: (result: {
    modId: number;
    thumbnailUrl: string;
    isNsfw: boolean;
    confidence: number;
    reason: string;
    checkedAt: string;
  }): Promise<any> => invokeBackend('zzz:recordVisionResult', result),

  sendF10: (): Promise<{
    success: boolean;
    hwndFound: boolean;
    gameRunning?: boolean;
    message: string;
    state: FullAppState;
  }> => invokeBackend('zzz:sendF10'),

  selectLocalArchiveOrFolder: async (
    mode: 'file' | 'folder' | 'image' | 'exe'
  ): Promise<string | null> => {
    if (window.fairyBridge?.isElectron) {
      return window.fairyBridge.invoke('zzz:selectLocalArchiveOrFolder', mode);
    }
    return null;
  },

  /** Moves a mod's folder into backups (used after updating it to a newer version). */
  archiveMod: (modUuid: string): Promise<{ state: FullAppState; archivedTo: string | null }> =>
    invokeBackend('mods:archive', modUuid),

  // ---- App self-update (installed app only) ----
  getAppVersion: async (): Promise<string | null> =>
    window.fairyBridge?.isElectron ? window.fairyBridge.invoke('app:getVersion') : null,
  getUpdateStatus: async (): Promise<AppUpdateStatus> =>
    window.fairyBridge?.isElectron
      ? window.fairyBridge.invoke('app:getUpdateStatus')
      : { state: 'unsupported', current: '' },
  checkForAppUpdates: async (): Promise<AppUpdateStatus> =>
    window.fairyBridge?.isElectron
      ? window.fairyBridge.invoke('app:checkForUpdates')
      : { state: 'unsupported', current: '' },
  downloadAppUpdate: async (): Promise<boolean> =>
    window.fairyBridge?.isElectron ? window.fairyBridge.invoke('app:downloadUpdate') : false,
  installAppUpdate: async (): Promise<boolean> =>
    window.fairyBridge?.isElectron ? window.fairyBridge.invoke('app:installUpdate') : false,
  onUpdateStatus: (cb: (s: AppUpdateStatus) => void): (() => void) =>
    window.fairyBridge?.on ? window.fairyBridge.on('app:update-status', cb) : () => {},

  openModFolder: async (relInstallPath: string): Promise<boolean> => {
    if (window.fairyBridge?.isElectron) {
      return window.fairyBridge.invoke('zzz:openModFolder', relInstallPath);
    }
    return false;
  },
};
