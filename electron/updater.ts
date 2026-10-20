import { app, BrowserWindow, ipcMain } from 'electron';

/**
 * App self-updates via GitHub Releases (electron-updater).
 * Flow: check ~2 s after launch (and every 6 h) → tell the renderer → user clicks
 * "Update" → download with progress → "Restart & update".
 * Only active in the installed (packaged) app; in development it reports
 * "unsupported" so the UI can explain.
 */

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'none'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported';

export interface UpdateStatus {
  state: UpdateState;
  current: string;
  version?: string;
  notes?: string;
  percent?: number;
  message?: string;
  checkedAt?: string;
}

function cleanNotes(raw: unknown): string | undefined {
  if (!raw) return undefined;
  const text = Array.isArray(raw)
    ? raw.map((n: any) => `${n.version ? `v${n.version}\n` : ''}${n.note ?? ''}`).join('\n\n')
    : String(raw);
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function setupUpdater(getWindow: () => BrowserWindow | null, log: (msg: string) => void) {
  let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'unsupported', current: app.getVersion() };
  let updater: any = null;

  if (app.isPackaged) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      updater = require('electron-updater').autoUpdater;
    } catch (err) {
      status = { state: 'unsupported', current: app.getVersion(), message: 'Updater component is missing from this build.' };
      log(`Updater unavailable: ${(err as Error).message}`);
    }
  }

  const send = (next: Omit<UpdateStatus, 'current'>) => {
    status = { ...next, current: app.getVersion() };
    getWindow()?.webContents.send('app:update-status', status);
  };

  if (updater) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.logger = { info: log, warn: log, error: log, debug: () => {} };

    updater.on('checking-for-update', () => send({ state: 'checking' }));
    updater.on('update-available', (info: any) =>
      send({ state: 'available', version: info?.version, notes: cleanNotes(info?.releaseNotes), checkedAt: new Date().toISOString() })
    );
    updater.on('update-not-available', () => send({ state: 'none', checkedAt: new Date().toISOString() }));
    updater.on('download-progress', (p: any) =>
      send({ state: 'downloading', version: status.version, notes: status.notes, percent: Math.round(p?.percent ?? 0) })
    );
    updater.on('update-downloaded', (info: any) =>
      send({ state: 'downloaded', version: info?.version ?? status.version, notes: status.notes })
    );
    updater.on('error', (err: any) => send({ state: 'error', message: String(err?.message ?? err) }));

    const check = () => updater.checkForUpdates().catch((err: any) => log(`Update check failed: ${err?.message ?? err}`));
    // Check right after launch (the window is up within ~1s), then every 6 h.
    setTimeout(check, 2000);
    setInterval(check, 6 * 60 * 60 * 1000);
  }

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getUpdateStatus', () => status);
  ipcMain.handle('app:checkForUpdates', async () => {
    if (!updater) return status;
    try {
      await updater.checkForUpdates();
    } catch (err) {
      send({ state: 'error', message: (err as Error).message });
    }
    return status;
  });
  ipcMain.handle('app:downloadUpdate', async () => {
    if (!updater) return false;
    send({ state: 'downloading', version: status.version, notes: status.notes, percent: 0 });
    try {
      await updater.downloadUpdate();
      return true;
    } catch (err) {
      send({ state: 'error', message: (err as Error).message });
      return false;
    }
  });
  ipcMain.handle('app:installUpdate', () => {
    if (!updater) return false;
    setImmediate(() => updater.quitAndInstall(false, true));
    return true;
  });
}
