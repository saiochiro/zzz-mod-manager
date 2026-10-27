import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, safeStorage, session, shell } from 'electron';
import { pathToFileURL } from 'url';
import fs from 'fs';
import path from 'path';
import { fetchGameBananaModProfile } from '../src/core/gamebananaService';
import { applyNsfwReview, onNsfwVerdictsUpdated, refreshNsfwVerdicts } from '../src/core/nsfwReview';
import { ModManagerService } from '../src/core/modManagerService';
import { CommunityClient, type StoredSession } from '../src/core/communityClient';
import { setupUpdater } from './updater';

// Mod covers on disk are shown through this scheme (instead of copying every picture into the
// app state as text, which made every refresh slow). Must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'proxylaunch-img', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Give the app its own Windows identity so the taskbar shows our icon, not Electron's.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.fairyos.zzzmodmanager');
}

// The app was renamed from "ZZZ Mod Manager" to "ProxyLaunch". Electron names
// the data folder after the product, so pin it to the original folder: every
// user's mods, loadouts and settings stay exactly where they were.
app.setPath('userData', path.join(app.getPath('appData'), 'ZZZ Mod Manager'));

// Only ever one ProxyLaunch. A second launch (desktop icon, or a zzzmgr:// install
// link from the browser) hands its link to the running copy and exits. Without
// this, extra hidden copies piled up and blocked the installer during updates.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.exit(0);
}

let mainWindow: BrowserWindow | null = null;
const workspaceRoot = app.isPackaged ? app.getPath('userData') : path.resolve(__dirname, '../..');
const modService = new ModManagerService(workspaceRoot);
const bootLogPath = path.join(workspaceRoot, 'ZZZ_Mod_Manager_AppData', 'electron_boot.log');

function writeBootLog(msg: string) {
  try {
    fs.appendFileSync(bootLogPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf-8');
  } catch {
    // ignore
  }
}

writeBootLog('Electron main process starting in Frameless Window mode...');

// Register custom OS URI Scheme: zzzmgr://
try {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('zzzmgr', process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient('zzzmgr');
  }
} catch (err) {
  writeBootLog(`Protocol registration warning: ${(err as Error).message}`);
}

function createWindow() {
  writeBootLog('Creating Frameless BrowserWindow (frame: false, titleBarStyle: hidden)...');
  // Default app icon; the renderer swaps in the active theme's variant right after load.
  const appIconPath = path.resolve(
    __dirname,
    process.platform === 'win32' ? '../../assets/icon/icon.ico' : '../../assets/icon/icon.png'
  );
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 940,
    minWidth: 1180,
    minHeight: 740,
    backgroundColor: '#0f1115',
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const builtIndexHtml = path.resolve(__dirname, '../../dist/index.html');

  if (devServerUrl) {
    writeBootLog(`Loading devServerUrl: ${devServerUrl}`);
    mainWindow.loadURL(devServerUrl);
  } else if (fs.existsSync(builtIndexHtml)) {
    writeBootLog(`Loading builtIndexHtml: ${builtIndexHtml}`);
    mainWindow.loadFile(builtIndexHtml);
  } else {
    writeBootLog('Loading fallback http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.webContents.on('did-finish-load', () => {
    writeBootLog('BrowserWindow did-finish-load complete! Frameless window is visible.');
  });

  // Links with target="_blank" (mod pages, XXMI download…) open in the user's
  // web browser instead of a bare Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Intercept GameBanana download URLs or zzzmgr:// deep links in embedded webviews
  mainWindow.webContents.on('will-navigate', async (event, url) => {
    if (url.startsWith('zzzmgr://') || /gamebanana\.com\/dl\//i.test(url)) {
      event.preventDefault();
      await modService.ingestPackage(url);
      mainWindow?.webContents.send('zzz:stateUpdated', modService.getFullState());
    }
  });

  // Setup real-time file watcher on ZZMI Mods folder
  setupModsDirectoryWatcher();
}

/**
 * The folder watcher only reports changes made outside the app. While (and just after) the app
 * itself changes mod folders, its own renames and writes are not reported back as "external".
 */
let ownChangesInFlight = 0;
let ownChangesQuietUntil = 0;
function handleIpc(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) {
  ipcMain.handle(channel, async (e, ...args) => {
    ownChangesInFlight++;
    try {
      return await fn(e, ...args);
    } finally {
      ownChangesInFlight--;
      ownChangesQuietUntil = Date.now() + 1500;
    }
  });
}

let modsWatcher: fs.FSWatcher | null = null;
let watcherDebounceTimer: NodeJS.Timeout | null = null;

function setupModsDirectoryWatcher() {
  try {
    const cfg = modService.getConfig();
    const modsDir = path.join(cfg.zzmiRootPath, 'Mods');
    if (fs.existsSync(modsDir) && !modsWatcher) {
      modsWatcher = fs.watch(modsDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        // Ignore internal temp or swap files to prevent infinite loops
        if (filename.includes('master_swap.ini') || filename.includes('staging_temp') || filename.includes('.tmp')) {
          return;
        }
        modService.invalidateModCache(path.join(modsDir, String(filename)));
        if (ownChangesInFlight > 0 || Date.now() < ownChangesQuietUntil) return;

        if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
        watcherDebounceTimer = setTimeout(() => {
          writeBootLog(`[FS Watcher] Detected external change in Mods directory (${filename}). Refreshing state...`);
          try {
            const newState = modService.getFullState();
            mainWindow?.webContents.send('zzz:stateUpdated', newState);
          } catch (err) {
            writeBootLog(`Watcher state update error: ${(err as Error).message}`);
          }
        }, 500);
      });
      writeBootLog(`Active filesystem watcher attached to [${modsDir}]`);
    }
  } catch (err) {
    writeBootLog(`Directory watcher error: ${(err as Error).message}`);
  }
}

// ============================================================================
// IPC Handlers: Frameless Window Controls
// ============================================================================
handleIpc('window:minimize', () => {
  mainWindow?.minimize();
  return true;
});

handleIpc('window:toggle-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  } else {
    mainWindow.maximize();
    return true;
  }
});

handleIpc('window:close', () => {
  mainWindow?.close();
  return true;
});

handleIpc('window:is-maximized', () => {
  return mainWindow?.isMaximized() || false;
});

// ============================================================================
// IPC Handlers: Theme & OS Icon System
// ============================================================================
handleIpc('theme:update-icon', async (_e, themeId: string, iconDataUrl?: string) => {
  try {
    if (iconDataUrl && iconDataUrl.startsWith('data:image')) {
      const img = nativeImage.createFromDataURL(iconDataUrl);
      if (!img.isEmpty()) {
        mainWindow?.setIcon(img);
        if (process.platform === 'darwin' && app.dock) {
          app.dock.setIcon(img);
        }
        writeBootLog(`OS Window & Taskbar icon updated to theme: ${themeId}`);
        return { success: true };
      }
    }
  } catch (err) {
    writeBootLog(`Theme icon update error: ${(err as Error).message}`);
  }
  return { success: false };
});

// ============================================================================
// IPC Handlers: Core ZZZ & XXMI Management
// ============================================================================
handleIpc('zzz:getState', async () => {
  return modService.getFullState();
});

handleIpc('zzz:toggleEnabled', async (_e, modUuid: string) => {
  const res = modService.toggleModEnabled(modUuid);
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:setModsEnabled', async (_e, changes: Array<{ modUuid: string; enabled: boolean }>) => {
  const changed = modService.setModsEnabled(Array.isArray(changes) ? changes : []);
  return { changed, state: modService.getFullState() };
});

handleIpc('zzz:toggleHCycle', async (_e, modUuid: string) => {
  const res = modService.toggleModHCycle(modUuid);
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:inspectMod', async (_e, modUuid: string) => {
  return modService.inspectMod(modUuid);
});

handleIpc(
  'zzz:remapSubToggle',
  async (_e, modUuid: string, sectionName: string, newKey: string) => {
    const mod = modService.remapModSubToggle(modUuid, sectionName, newKey);
    return {
      mod,
      inspection: modService.inspectMod(modUuid),
      state: modService.getFullState(),
    };
  }
);

handleIpc('zzz:standardizeHotkeys', async (_e, agentId?: string) => {
  const res = modService.standardizeAllModHotkeys(typeof agentId === 'string' ? agentId : undefined);
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:repairMod', async (_e, modUuid: string) => {
  const res = modService.repairMod(modUuid);
  return {
    ...res,
    inspection: modService.inspectMod(modUuid),
    state: modService.getFullState(),
  };
});

handleIpc('zzz:repairAll', async () => {
  const results = modService.repairAllBrokenMods();
  return { results, state: modService.getFullState() };
});

handleIpc('zzz:undoRepair', async (_e, modUuid: string) => {
  const res = modService.undoModRepair(modUuid);
  return {
    ...res,
    inspection: modService.inspectMod(modUuid),
    state: modService.getFullState(),
  };
});

handleIpc('zzz:deleteMod', async (_e, modUuid: string) => {
  modService.deleteMod(modUuid);
  return { state: modService.getFullState() };
});

handleIpc('zzz:ingestPackage', async (_e, sourceInput: string, options?: any) => {
  const res = await modService.ingestPackage(sourceInput, options);
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:confirmMultiAgentSplit', async (_e, stagingId: string) => {
  const release = await modService.acquireInstallLock();
  try {
    const res = modService.confirmMultiAgentSplit(stagingId);
    return { ...res, state: modService.getFullState() };
  } finally {
    release();
  }
});

handleIpc('zzz:getGameBananaFeed', async (_e, options?: any) => {
  return await modService.getGameBananaFeed(options);
});

handleIpc('zzz:importExistingFolder', async (_e, folderPath: string, mode?: 'copy' | 'symlink') => {
  const release = await modService.acquireInstallLock();
  try {
    const res = modService.importExistingModFolder(folderPath, mode || 'copy');
    return { ...res, state: modService.getFullState() };
  } finally {
    release();
  }
});

handleIpc('zzz:scanExternalLaunchers', async () => {
  return modService.scanForExternalModLaunchers();
});

handleIpc('zzz:detectExternalLaunchersDetailed', async () => {
  return modService.detectExternalLaunchersDetailed();
});

handleIpc('zzz:setCustomThumbnail', async (_e, modUuid: string, imageSource: string) => {
  const mod = modService.setCustomModThumbnail(modUuid, imageSource);
  return { mod, state: modService.getFullState() };
});

handleIpc('zzz:saveProfile', async (_e, profileName: string) => {
  const res = modService.saveLoadoutProfile(profileName);
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:applyProfile', async (_e, profileName: string) => {
  const res = modService.applyLoadoutProfile(profileName);
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:deleteProfile', async (_e, profileName: string) => {
  const res = modService.deleteLoadoutProfile(profileName);
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:renameProfile', async (_e, oldName: string, newName: string) => {
  const res = modService.renameLoadoutProfile(oldName, newName);
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:organizeFolders', async () => {
  const res = modService.organizeAndStandardizeFolders();
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:undoOrganizeFolders', async () => {
  const res = modService.undoOrganizeFolders();
  return { ...res, state: modService.getFullState() };
});

// Mod Workshop (experimental)
handleIpc('workshop:catalog', async (_e, agentId: string) => modService.getWorkshopCatalog(agentId));
handleIpc('workshop:build', async (_e, req: any) => {
  const res = await modService.buildWorkshopMod(req);
  return { ...res, state: modService.getFullState() };
});
handleIpc('workshop:rebuild', async (_e, modUuid: string) => {
  const res = await modService.rebuildWorkshopMod(modUuid);
  return { ...res, state: modService.getFullState() };
});
handleIpc('workshop:preview', async (_e, modUuid: string) => modService.getWorkshopPreview(modUuid));
handleIpc('workshop:shareCode', async (_e, modUuid: string) => modService.getWorkshopShareCode(modUuid));
handleIpc('workshop:resolveCode', async (_e, code: string) => modService.resolveWorkshopCode(code));
handleIpc('workshop:resolveRecipe', async (_e, recipe: any) => modService.resolveWorkshopRecipe(recipe));

// Community page (Supabase). Tokens stay in the main process, encrypted with the OS keychain.
const communitySessionFile = () => path.join(app.getPath('userData'), 'community_session.bin');
const community = new CommunityClient(
  {
    load: () => {
      try {
        const raw = fs.readFileSync(communitySessionFile());
        const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf-8');
        return JSON.parse(json) as StoredSession;
      } catch {
        return null;
      }
    },
    save: (s) => {
      try {
        if (!s) {
          fs.rmSync(communitySessionFile(), { force: true });
          return;
        }
        const json = JSON.stringify(s);
        fs.writeFileSync(communitySessionFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf-8'));
      } catch {
        // session just won't persist
      }
    },
  },
  (url) => shell.openExternal(url)
);
handleIpc('community:me', async () => community.me());
handleIpc('community:signIn', async () => {
  const me = await community.signIn();
  mainWindow?.show();
  mainWindow?.focus();
  return me;
});
handleIpc('community:signOut', async () => community.signOut());
handleIpc('community:list', async (_e, q: any) => community.list(q));
handleIpc('community:publish', async (_e, modUuid: string, description: string) =>
  community.publish(modService.getWorkshopRecipe(modUuid), String(description || ''))
);
handleIpc('community:like', async (_e, postId: string, liked: boolean) => community.setLiked(postId, liked));
handleIpc('community:report', async (_e, postId: string, reason: string) => community.report(postId, String(reason || '')));
handleIpc('community:remove', async (_e, postId: string) => community.remove(postId));
handleIpc('community:moderate', async (_e, postId: string, status: any, isNsfw: any) => community.moderate(postId, status ?? null, isNsfw ?? null));
handleIpc('community:ban', async (_e, userId: string, banned: boolean) => community.setBanned(userId, banned));

handleIpc('zzz:fetchGameBananaMod', async (_e, modId: number) => {
  return applyNsfwReview(await fetchGameBananaModProfile(modId), `gb:${modId}`);
});

// XXMI Sync & Auto-Thumbnail Fetching
handleIpc('xxmi:sync', async () => {
  modService.scanInstalledMods();
  return { state: modService.getFullState() };
});

handleIpc('xxmi:fetchMissingPreviews', async () => {
  const res = await modService.fetchMissingPreviewsForLocalMods();
  return res;
});

handleIpc('xxmi:detectPaths', async () => {
  return modService.detectXxmiModsPath();
});

handleIpc('zzz:syncHashDb', async () => {
  const res = modService.syncHashDatabaseFromCloud();
  return { ...res, state: modService.getFullState() };
});

handleIpc('setup:status', async () => modService.getSetupStatus());

handleIpc('app:openExternal', async (_e, url: string) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

handleIpc('zzz:autoDiscoverPaths', async () => {
  const res = modService.autoDiscoverSystemPaths();
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:updateConfig', async (_e, partial: any) => {
  modService.updateConfig(partial);
  return { state: modService.getFullState() };
});

handleIpc('zzz:launchGame', async (_e, mode?: 'modded' | 'vanilla') => {
  const res = modService.launchNewEridu(mode || 'modded');
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:moderateModImage', async (_e, mod: any) => {
  return await modService.moderateModImage(mod);
});

handleIpc('zzz:recordVisionResult', async (_e, result: any) => {
  return modService.recordClientVisionResult(result);
});

handleIpc('zzz:sendF10', async () => {
  const res = await modService.sendLiveReloadF10();
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:selectLocalArchiveOrFolder', async (_e, mode: 'file' | 'folder' | 'image' | 'exe') => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title:
      mode === 'exe'
        ? 'Select Executable (.exe)'
        : mode === 'image'
        ? 'Select Custom Preview Image (.png, .jpg, .webp, .gif)'
        : mode === 'file'
        ? 'Select ZZZ Mod Archive (.zip, .7z, .rar)'
        : 'Select Mod Folder',
    properties: mode === 'folder' ? ['openDirectory'] : ['openFile'],
    filters:
      mode === 'exe'
        ? [{ name: 'Executables', extensions: ['exe'] }]
        : mode === 'image'
        ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
        : mode === 'file'
        ? [{ name: 'Mod Archives', extensions: ['zip', '7z', 'rar', 'tar'] }]
        : undefined,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Mod updates: move the previous version into backups instead of deleting it.
handleIpc('mods:archive', async (_e, modUuid: string) => {
  const target = modService.scanInstalledMods().find((m) => m.mod_uuid === modUuid);
  const archivedTo = target ? modService.archiveModToBackups(target) : null;
  return { state: modService.getFullState(), archivedTo };
});

// Opens File Explorer with the mod's folder selected. Looks the mod up by id, so it still works
// after the folder was renamed (switched on/off, updated, tidied).
handleIpc('zzz:resolveUnmanagedMod', async (_e, modPath: string, action: 'import' | 'disable') => {
  const release = await modService.acquireInstallLock();
  try {
    const res = modService.resolveUnmanagedGameMod(String(modPath), action === 'import' ? 'import' : 'disable');
    return { ...res, state: modService.getFullState() };
  } finally {
    release();
  }
});

// Backups: previous versions, deleted mods, Tidy keys copies, leftover folders.
handleIpc('backups:list', async () => ({ backups: modService.listBackups(), summary: modService.getBackupsSummary() }));
handleIpc('backups:restore', async (_e, id: string) => {
  const release = await modService.acquireInstallLock();
  try {
    const res = modService.restoreBackup(String(id));
    return { ...res, state: modService.getFullState() };
  } finally {
    release();
  }
});
handleIpc('backups:delete', async (_e, id: string) => ({ freed_bytes: modService.deleteBackup(String(id)) }));
handleIpc('backups:prune', async (_e, opts?: { olderThanDays?: number; keepPerMod?: number; maxTotalBytes?: number }) =>
  modService.pruneBackups(opts ?? {})
);

handleIpc('zzz:downloadMissingFiles', async (_e, modUuid: string) => {
  const res = await modService.downloadMissingFiles(String(modUuid));
  return { ...res, state: modService.getFullState() };
});

handleIpc('zzz:revealMod', async (_e, modUuid: string) => {
  const mod = modService.scanInstalledMods().find((m) => m.mod_uuid === modUuid);
  if (!mod) throw new Error('That mod is no longer installed.');
  const absPath = path.join(modService.getConfig().zzmiRootPath, mod.install_path);
  if (!fs.existsSync(absPath)) throw new Error("The mod's folder couldn't be found.");
  shell.showItemInFolder(absPath);
  return true;
});

handleIpc('zzz:openModFolder', async (_e, relInstallPath: string) => {
  const cfg = modService.getConfig();
  const absPath = path.join(cfg.zzmiRootPath, relInstallPath);
  await shell.openPath(absPath);
  return true;
});

app.whenReady().then(() => {
  // Only pictures inside the app's own folders (mods, backups) can be loaded.
  protocol.handle('proxylaunch-img', (req) => {
    try {
      const file = path.resolve(decodeURIComponent(new URL(req.url).pathname.slice(1)));
      const cfg = modService.getConfig();
      const roots = [cfg.zzmiRootPath, cfg.appDataPath].filter(Boolean).map((r) => path.resolve(r).toLowerCase() + path.sep);
      const inside = roots.some((r) => file.toLowerCase().startsWith(r));
      if (!inside || !/\.(png|jpe?g|webp|gif)$/i.test(file)) return new Response(null, { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response(null, { status: 400 });
    }
  });

  try {
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['*://*.gamebanana.com/*'] },
      (details, callback) => {
        details.requestHeaders['Referer'] = 'https://gamebanana.com/';
        details.requestHeaders['User-Agent'] =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        callback({ requestHeaders: details.requestHeaders });
      }
    );
  } catch (err) {
    writeBootLog(`webRequest header configuration warning: ${(err as Error).message}`);
  }

  createWindow();
  // Content labels are pre-scanned on GitHub; fetch the newest list every hour and tell Browse.
  onNsfwVerdictsUpdated(() => mainWindow?.webContents.send('nsfw:verdicts-updated', null));
  setInterval(() => void refreshNsfwVerdicts(), 60 * 60 * 1000);
  // Undo the Library edits 2.14.0 made to "Experimental" mods.
  setTimeout(() => {
    try {
      modService.restoreSanitizedMods();
    } catch (err) {
      writeBootLog(`restore sanitized mods: ${(err as Error).message}`);
    }
    try {
      if (modService.restoreWronglyReplacedMods()) mainWindow?.webContents.send('zzz:stateUpdated', modService.getFullState());
    } catch (err) {
      writeBootLog(`restore wrongly replaced mods: ${(err as Error).message}`);
    }
    try {
      if (modService.repairMislabeledUpdates()) mainWindow?.webContents.send('zzz:stateUpdated', modService.getFullState());
    } catch (err) {
      writeBootLog(`repair mislabeled updates: ${(err as Error).message}`);
    }
  }, 3000);
  setupUpdater(() => mainWindow, writeBootLog, () => {
    // Everything that could keep the process alive while the installer runs.
    modsWatcher?.close();
    modsWatcher = null;
  });
  // Launched by an install link while ProxyLaunch was closed.
  const initialLink = deepLinkFrom(process.argv);
  if (initialLink) mainWindow?.webContents.once('did-finish-load', () => openDeepLink(initialLink));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/** Install link passed on the command line (zzzmgr://...). */
function deepLinkFrom(argv: string[]): string | null {
  return argv.find((a) => /^zzzmgr:\/\//i.test(a)) ?? null;
}

async function openDeepLink(url: string | null) {
  if (!url) return;
  try {
    await modService.ingestPackage(url);
    mainWindow?.webContents.send('zzz:stateUpdated', modService.getFullState());
  } catch (err) {
    writeBootLog(`Deep link failed: ${(err as Error).message}`);
  }
}

app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  openDeepLink(deepLinkFrom(argv));
});

app.on('window-all-closed', () => {
  if (modsWatcher) {
    modsWatcher.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
