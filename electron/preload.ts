import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('fairyBridge', {
  isElectron: true,
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  onStateUpdated: (callback: (state: any) => void) => {
    const listener = (_e: any, state: any) => callback(state);
    ipcRenderer.on('zzz:stateUpdated', listener);
    return () => ipcRenderer.removeListener('zzz:stateUpdated', listener);
  },
  on: (channel: string, callback: (payload: any) => void) => {
    const allowed = ['app:update-status', 'nsfw:verdicts-updated'];
    if (!allowed.includes(channel)) return () => {};
    const listener = (_e: any, payload: any) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
