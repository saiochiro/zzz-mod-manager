import { ModManagerService } from '../src/core/modManagerService';

const svc = new ModManagerService(process.cwd());
const state = svc.getFullState();
console.log(
  `[FAIRY OS] Sandbox initialized: ${state.mods.length} mods active in ZZMI_Root/Mods/.`
);
