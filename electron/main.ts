import { app, BrowserWindow, dialog, ipcMain, nativeImage, session, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { fetchGameBananaModProfile } from '../src/core/gamebananaService';
import { ModManagerService } from '../src/core/modManagerService';
import { setupUpdater } from './updater';

// Give the app its own Windows identity so the taskbar shows our icon, not Electron's.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.fairyos.zzzmodmanager');
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
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
  return true;
});

ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  } else {
    mainWindow.maximize();
    return true;
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
  return true;
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow?.isMaximized() || false;
});

// ============================================================================
// IPC Handlers: Theme & OS Icon System
// ============================================================================
ipcMain.handle('theme:update-icon', async (_e, themeId: string, iconDataUrl?: string) => {
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
ipcMain.handle('zzz:getState', async () => {
  return modService.getFullState();
});

ipcMain.handle('zzz:toggleEnabled', async (_e, modUuid: string) => {
  const res = modService.toggleModEnabled(modUuid);
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:toggleHCycle', async (_e, modUuid: string) => {
  const res = modService.toggleModHCycle(modUuid);
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:inspectMod', async (_e, modUuid: string) => {
  return modService.inspectMod(modUuid);
});

ipcMain.handle(
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

ipcMain.handle('zzz:standardizeHotkeys', async () => {
  const res = modService.standardizeAllModHotkeys();
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:repairMod', async (_e, modUuid: string) => {
  const res = modService.repairMod(modUuid);
  return {
    ...res,
    inspection: modService.inspectMod(modUuid),
    state: modService.getFullState(),
  };
});

ipcMain.handle('zzz:repairAll', async () => {
  const results = modService.repairAllBrokenMods();
  return { results, state: modService.getFullState() };
});

ipcMain.handle('zzz:undoRepair', async (_e, modUuid: string) => {
  const res = modService.undoModRepair(modUuid);
  return {
    ...res,
    inspection: modService.inspectMod(modUuid),
    state: modService.getFullState(),
  };
});

ipcMain.handle('zzz:deleteMod', async (_e, modUuid: string) => {
  modService.deleteMod(modUuid);
  return { state: modService.getFullState() };
});

ipcMain.handle('zzz:ingestPackage', async (_e, sourceInput: string, options?: any) => {
  const res = await modService.ingestPackage(sourceInput, options);
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:confirmMultiAgentSplit', async (_e, stagingId: string) => {
  const res = modService.confirmMultiAgentSplit(stagingId);
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:getGameBananaFeed', async (_e, options?: any) => {
  return await modService.getGameBananaFeed(options);
});

ipcMain.handle('zzz:importExistingFolder', async (_e, folderPath: string, mode?: 'copy' | 'symlink') => {
  const res = modService.importExistingModFolder(folderPath, mode || 'copy');
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:scanExternalLaunchers', async () => {
  return modService.scanForExternalModLaunchers();
});

ipcMain.handle('zzz:detectExternalLaunchersDetailed', async () => {
  return modService.detectExternalLaunchersDetailed();
});

ipcMain.handle('zzz:setCustomThumbnail', async (_e, modUuid: string, imageSource: string) => {
  const mod = modService.setCustomModThumbnail(modUuid, imageSource);
  return { mod, state: modService.getFullState() };
});

ipcMain.handle('zzz:saveProfile', async (_e, profileName: string) => {
  const res = modService.saveLoadoutProfile(profileName);
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:applyProfile', async (_e, profileName: string) => {
  const res = modService.applyLoadoutProfile(profileName);
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:deleteProfile', async (_e, profileName: string) => {
  const res = modService.deleteLoadoutProfile(profileName);
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:renameProfile', async (_e, oldName: string, newName: string) => {
  const res = modService.renameLoadoutProfile(oldName, newName);
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:organizeFolders', async () => {
  const res = modService.organizeAndStandardizeFolders();
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:undoOrganizeFolders', async () => {
  const res = modService.undoOrganizeFolders();
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:fetchGameBananaMod', async (_e, modId: number) => {
  return fetchGameBananaModProfile(modId);
});

// XXMI Sync & Auto-Thumbnail Fetching
ipcMain.handle('xxmi:sync', async () => {
  modService.scanInstalledMods();
  return { state: modService.getFullState() };
});

ipcMain.handle('xxmi:fetchMissingPreviews', async () => {
  const res = await modService.fetchMissingPreviewsForLocalMods();
  return res;
});

ipcMain.handle('xxmi:detectPaths', async () => {
  return modService.detectXxmiModsPath();
});

ipcMain.handle('zzz:syncHashDb', async () => {
  const res = modService.syncHashDatabaseFromCloud();
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:autoDiscoverPaths', async () => {
  const res = modService.autoDiscoverSystemPaths();
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:updateConfig', async (_e, partial: any) => {
  modService.updateConfig(partial);
  return { state: modService.getFullState() };
});

ipcMain.handle('zzz:launchGame', async (_e, mode?: 'modded' | 'vanilla') => {
  const res = modService.launchNewEridu(mode || 'modded');
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:moderateModImage', async (_e, mod: any) => {
  return await modService.moderateModImage(mod);
});

ipcMain.handle('zzz:recordVisionResult', async (_e, result: any) => {
  return modService.recordClientVisionResult(result);
});

ipcMain.handle('zzz:sendF10', async () => {
  const res = modService.sendLiveReloadF10();
  return { ...res, state: modService.getFullState() };
});

ipcMain.handle('zzz:selectLocalArchiveOrFolder', async (_e, mode: 'file' | 'folder' | 'image' | 'exe') => {
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
ipcMain.handle('mods:archive', async (_e, modUuid: string) => {
  const mods = modService.scanInstalledMods();
  const target = mods.find((m) => m.mod_uuid === modUuid);
  if (!target) return { state: modService.getFullState(), archivedTo: null };
  const cfg = modService.getConfig();
  const src = path.join(cfg.zzmiRootPath, target.install_path);
  const destRoot = path.join(cfg.appDataPath, 'backups', 'mod-updates');
  fs.mkdirSync(destRoot, { recursive: true });
  const dest = path.join(destRoot, `${path.basename(src)}__${new Date().toISOString().replace(/[:.]/g, '-')}`);
  if (fs.existsSync(src)) {
    try {
      fs.renameSync(src, dest);
    } catch {
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    }
  }
  if (target.agent_id !== 'uncategorized') modService.syncAgentHSwap(target.agent_id);
  modService.syncModsToXxmiLauncher();
  modService.addLog('info', 'ROUTER', `Kept a backup of the previous version of [${target.title}].`);
  return { state: modService.getFullState(), archivedTo: dest };
});

ipcMain.handle('zzz:openModFolder', async (_e, relInstallPath: string) => {
  const cfg = modService.getConfig();
  const absPath = path.join(cfg.zzmiRootPath, relInstallPath);
  await shell.openPath(absPath);
  return true;
});

app.whenReady().then(() => {
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
  setupUpdater(() => mainWindow, writeBootLog);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (modsWatcher) {
    modsWatcher.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
