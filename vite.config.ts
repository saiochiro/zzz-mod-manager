import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { ModManagerService } from './src/core/modManagerService';
import { fetchGameBananaModProfile } from './src/core/gamebananaService';

function fairyBackendMiddlewarePlugin(): Plugin {
  let modService: ModManagerService | null = null;
  const getService = () => {
    if (!modService) {
      modService = new ModManagerService(process.cwd());
    }
    return modService;
  };

  return {
    name: 'fairy-backend-middleware',
    configureServer(server) {
      server.middlewares.use('/api/zzz', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const svc = getService();

        try {
          let bodyStr = '';
          if (req.method === 'POST') {
            bodyStr = await new Promise<string>((resolve) => {
              let data = '';
              req.on('data', (chunk) => (data += chunk));
              req.on('end', () => resolve(data));
            });
          }
          const payload = bodyStr ? JSON.parse(bodyStr) : {};
          const channel = payload.channel || req.url?.replace(/^\//, '');
          const args = payload.args || [];

          let result: any;
          switch (channel) {
            case 'zzz:getState':
              result = svc.getFullState();
              break;
            case 'zzz:toggleEnabled':
              result = { ...svc.toggleModEnabled(args[0]), state: svc.getFullState() };
              break;
            case 'zzz:toggleHCycle':
              result = { ...svc.toggleModHCycle(args[0]), state: svc.getFullState() };
              break;
            case 'zzz:inspectMod':
              result = svc.inspectMod(args[0]);
              break;
            case 'zzz:remapSubToggle': {
              const mod = svc.remapModSubToggle(args[0], args[1], args[2]);
              result = {
                mod,
                inspection: svc.inspectMod(args[0]),
                state: svc.getFullState(),
              };
              break;
            }
            case 'zzz:standardizeHotkeys':
              result = { ...svc.standardizeAllModHotkeys(), state: svc.getFullState() };
              break;
            case 'zzz:repairMod':
              result = {
                ...svc.repairMod(args[0]),
                inspection: svc.inspectMod(args[0]),
                state: svc.getFullState(),
              };
              break;
            case 'zzz:repairAll':
              result = { results: svc.repairAllBrokenMods(), state: svc.getFullState() };
              break;
            case 'zzz:undoRepair':
              result = {
                ...svc.undoModRepair(args[0]),
                inspection: svc.inspectMod(args[0]),
                state: svc.getFullState(),
              };
              break;
            case 'zzz:deleteMod':
              svc.deleteMod(args[0]);
              result = { state: svc.getFullState() };
              break;
            case 'zzz:ingestPackage':
              result = {
                ...(await svc.ingestPackage(args[0], args[1])),
                state: svc.getFullState(),
              };
              break;
            case 'zzz:confirmMultiAgentSplit':
              result = {
                ...svc.confirmMultiAgentSplit(args[0]),
                state: svc.getFullState(),
              };
              break;
            case 'zzz:getGameBananaFeed':
              result = await svc.getGameBananaFeed(args[0]);
              break;
            case 'zzz:importExistingFolder':
              result = { ...svc.importExistingModFolder(args[0], args[1] || 'copy'), state: svc.getFullState() };
              break;
            case 'zzz:scanExternalLaunchers':
              result = svc.scanForExternalModLaunchers();
              break;
            case 'zzz:detectExternalLaunchersDetailed':
              result = svc.detectExternalLaunchersDetailed();
              break;
            case 'zzz:setCustomThumbnail':
              result = { mod: svc.setCustomModThumbnail(args[0], args[1]), state: svc.getFullState() };
              break;
            case 'zzz:saveProfile':
              result = { ...svc.saveLoadoutProfile(args[0]), state: svc.getFullState() };
              break;
            case 'zzz:applyProfile':
              result = { ...svc.applyLoadoutProfile(args[0]), state: svc.getFullState() };
              break;
            case 'zzz:deleteProfile':
              result = { ...svc.deleteLoadoutProfile(args[0]), state: svc.getFullState() };
              break;
            case 'zzz:renameProfile':
              result = { ...svc.renameLoadoutProfile(args[0], args[1]), state: svc.getFullState() };
              break;
            case 'zzz:organizeFolders':
              result = { ...svc.organizeAndStandardizeFolders(), state: svc.getFullState() };
              break;
            case 'zzz:undoOrganizeFolders':
              result = { ...svc.undoOrganizeFolders(), state: svc.getFullState() };
              break;
            case 'zzz:fetchGameBananaMod':
              result = await fetchGameBananaModProfile(Number(args[0]));
              break;
            case 'xxmi:sync':
              svc.scanInstalledMods();
              result = { state: svc.getFullState() };
              break;
            case 'xxmi:fetchMissingPreviews':
              result = await svc.fetchMissingPreviewsForLocalMods();
              break;
            case 'xxmi:detectPaths':
              result = svc.detectXxmiModsPath();
              break;
            case 'zzz:syncHashDb':
              result = { ...svc.syncHashDatabaseFromCloud(), state: svc.getFullState() };
              break;
            case 'setup:status':
              result = svc.getSetupStatus();
              break;
            case 'zzz:autoDiscoverPaths':
              result = { ...svc.autoDiscoverSystemPaths(), state: svc.getFullState() };
              break;
            case 'zzz:updateConfig':
              svc.updateConfig(args[0]);
              result = { state: svc.getFullState() };
              break;
            case 'zzz:launchGame':
              result = { ...svc.launchNewEridu(args[0] || 'modded'), state: svc.getFullState() };
              break;
            case 'zzz:moderateModImage':
              result = await svc.moderateModImage(args[0]);
              break;
            case 'zzz:recordVisionResult':
              result = svc.recordClientVisionResult(args[0]);
              break;
            case 'zzz:sendF10':
              result = { ...svc.sendLiveReloadF10(), state: svc.getFullState() };
              break;
            default:
              result = svc.getFullState();
          }

          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fairyBackendMiddlewarePlugin()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
