// Starts the web build of ProxyLaunch for the Playwright tests, on a throwaway workspace with the
// built-in sample mods (sandbox mode), so tests never touch real mods or the internet for data.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServer } from 'vite';

const port = Number(process.env.E2E_PORT || 5174);
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'proxylaunch-e2e-'));
const appData = path.join(workspace, 'ZZZ_Mod_Manager_AppData');
const zzmiRoot = path.join(workspace, 'ZZMI_Root');
fs.mkdirSync(appData, { recursive: true });
fs.writeFileSync(
  path.join(appData, 'config.json'),
  JSON.stringify(
    {
      appDataPath: appData,
      zzmiRootPath: zzmiRoot,
      zzzExePath: path.join(workspace, 'Mock_Game', 'ZenlessZoneZero.exe'),
      zzmiLoaderPath: path.join(zzmiRoot, '3DMigoto Loader.exe'),
      autoCompileHSwap: true,
      autoSendF10OnToggle: false,
      uriSchemeRegistered: true,
      cloudHashSyncUrl: '',
      sandboxMode: true,
      singleActivePerAgent: false,
    },
    null,
    2
  )
);
process.env.PROXYLAUNCH_WORKSPACE = workspace;

const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1' }, clearScreen: false });
await server.listen();
console.log(`[e2e] ProxyLaunch web build on http://127.0.0.1:${port} (workspace ${workspace})`);

const stop = async () => {
  await server.close();
  fs.rmSync(workspace, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
