import fs from 'fs';
import path from 'path';
import { AgentHashEntry, ModManifest } from '../shared/types';
import { parseIniContent } from './iniParser';

export interface HSwapCompilationResult {
  agentFolder: string;
  activeCycleCount: number;
  masterSwapPath: string;
  generatedIniContent: string | null;
  isolatedFilesCount: number;
}

/**
 * Generates the 3DMigoto `master_swap.ini` content for a given Agent and list of active cycle mods.
 */
export function buildMasterSwapIniContent(
  agent: AgentHashEntry,
  cycleMods: { manifest: ModManifest; modAbsPath: string }[]
): string {
  const cycleIndices = cycleMods.map((_, idx) => idx).join(',');
  const safeFolder = agent.folder_name.replace(/[^a-zA-Z0-9_]/g, '');

  const lines: string[] = [
    `; ============================================================================`,
    `; FAIRY OS // HDD SYSTEM — AUTO-GENERATED 'H' KEY OUTFIT CYCLER`,
    `; Target Agent : ${agent.display_name} (${agent.faction})`,
    `; Active Cycle : ${cycleMods.map((m, i) => `[${i}] ${m.manifest.title}`).join(' | ')}`,
    `; Generated At : ${new Date().toISOString()}`,
    `; ============================================================================`,
    `namespace = ${safeFolder}_Master_Swap`,
    ``,
    `[Constants]`,
    `global persist $active_outfit = 0`,
    ``,
    `[KeySwapOutfit]`,
    `key = h`,
    `type = cycle`,
    `$active_outfit = ${cycleIndices}`,
    ``,
    `; --- Route draw calls based on $active_outfit index ---`,
    `[TextureOverride${safeFolder}Position]`,
    `hash = ${agent.current_hashes.position_vb}`,
  ];

  // Position VB routing
  cycleMods.forEach((item, idx) => {
    const cond = idx === 0 ? 'if' : 'elif';
    const slug = sanitizeSlotSlug(item.manifest.folder_name, idx);
    lines.push(`${cond} $active_outfit == ${idx}`);
    lines.push(`    vb0 = Resource_${slug}_Position`);
  });
  lines.push(`endif`, ``);

  // Blend VB routing
  lines.push(`[TextureOverride${safeFolder}Blend]`);
  lines.push(`hash = ${agent.current_hashes.blend_vb}`);
  cycleMods.forEach((item, idx) => {
    const cond = idx === 0 ? 'if' : 'elif';
    const slug = sanitizeSlotSlug(item.manifest.folder_name, idx);
    lines.push(`${cond} $active_outfit == ${idx}`);
    lines.push(`    vb1 = Resource_${slug}_Blend`);
    lines.push(`    handling = skip`);
    lines.push(`    draw = 21840, 0`);
  });
  lines.push(`endif`, ``);

  // Texcoord VB routing
  lines.push(`[TextureOverride${safeFolder}Texcoord]`);
  lines.push(`hash = ${agent.current_hashes.texcoord_vb}`);
  cycleMods.forEach((item, idx) => {
    const cond = idx === 0 ? 'if' : 'elif';
    const slug = sanitizeSlotSlug(item.manifest.folder_name, idx);
    lines.push(`${cond} $active_outfit == ${idx}`);
    lines.push(`    vb1 = Resource_${slug}_Texcoord`);
  });
  lines.push(`endif`, ``);

  // Index Buffer (IB) + ZZMI Texture routing
  lines.push(`[TextureOverride${safeFolder}IB]`);
  lines.push(`hash = ${agent.current_hashes.ib}`);
  lines.push(`handling = skip`);
  cycleMods.forEach((item, idx) => {
    const cond = idx === 0 ? 'if' : 'elif';
    const slug = sanitizeSlotSlug(item.manifest.folder_name, idx);
    lines.push(`${cond} $active_outfit == ${idx}`);
    lines.push(`    ib = Resource_${slug}_IB`);
    lines.push(`    Resource\\ZZMI\\Diffuse = ref Resource_${slug}_Diffuse`);
    lines.push(`    Resource\\ZZMI\\NormalMap = ref Resource_${slug}_NormalMap`);
    lines.push(`    Resource\\ZZMI\\LightMap = ref Resource_${slug}_LightMap`);
    lines.push(`    run = CommandList\\ZZMI\\SetTextures`);
    lines.push(`    run = CommandList\\ZZMI\\ORFix`);
    lines.push(`    drawindexed = auto`);
  });
  lines.push(`endif`, ``);

  // Resource Definitions per Outfit Slot
  lines.push(`; --- Namespaced Resource Declarations per Outfit ---`);
  cycleMods.forEach((item, idx) => {
    const slug = sanitizeSlotSlug(item.manifest.folder_name, idx);
    const relFolder = item.manifest.folder_name.replace(/^DISABLED[_-]*/i, '');
    lines.push(
      `[Resource_${slug}_Position]`,
      `type = Buffer`,
      `stride = 40`,
      `filename = .\\${relFolder}\\Position.buf`,
      ``,
      `[Resource_${slug}_Blend]`,
      `type = Buffer`,
      `stride = 32`,
      `filename = .\\${relFolder}\\Blend.buf`,
      ``,
      `[Resource_${slug}_Texcoord]`,
      `type = Buffer`,
      `stride = 20`,
      `filename = .\\${relFolder}\\Texcoord.buf`,
      ``,
      `[Resource_${slug}_IB]`,
      `type = Buffer`,
      `format = DXGI_FORMAT_R32_UINT`,
      `filename = .\\${relFolder}\\Index.buf`,
      ``,
      `[Resource_${slug}_Diffuse]`,
      `filename = .\\${relFolder}\\Diffuse.dds`,
      ``,
      `[Resource_${slug}_NormalMap]`,
      `filename = .\\${relFolder}\\NormalMap.dds`,
      ``,
      `[Resource_${slug}_LightMap]`,
      `filename = .\\${relFolder}\\LightMap.dds`,
      ``
    );
  });

  return lines.join('\n');
}

function sanitizeSlotSlug(folderName: string, idx: number): string {
  const clean = folderName
    .replace(/^DISABLED[_-]*/i, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 22);
  return clean || `Outfit_${idx}`;
}

/**
 * Compiles or cleans up `master_swap.ini` for an Agent folder on disk,
 * and manages `DISABLED_source_*.ini` isolation on participating mods.
 */
export function syncAgentHSwapOnDisk(
  zzmiRootPath: string,
  agent: AgentHashEntry,
  agentMods: ModManifest[]
): HSwapCompilationResult {
  const agentDir = path.join(zzmiRootPath, 'Mods', '_ZZZMM_Managed', agent.folder_name);
  fs.mkdirSync(agentDir, { recursive: true });

  const masterSwapPath = path.join(agentDir, 'master_swap.ini');
  const activeCycleMods = agentMods
    .filter((m) => m.enabled && m.in_h_swap_cycle)
    .sort((a, b) => a.h_cycle_order - b.h_cycle_order);

  let isolatedFilesCount = 0;

  const allHaveCanonicalBuffers =
    activeCycleMods.length >= 2 &&
    activeCycleMods.every((m) => {
      const modAbs = path.join(zzmiRootPath, m.install_path);
      return (
        fs.existsSync(path.join(modAbs, 'Position.buf')) &&
        fs.existsSync(path.join(modAbs, 'Diffuse.dds'))
      );
    });

  if (activeCycleMods.length >= 2 && allHaveCanonicalBuffers) {
    // 1. Isolate raw .ini files inside each active cycle mod by renaming mod.ini -> DISABLED_source_mod.ini
    const cyclePayload: { manifest: ModManifest; modAbsPath: string }[] = [];

    for (const mod of activeCycleMods) {
      const modAbsPath = path.join(zzmiRootPath, mod.install_path);
      cyclePayload.push({ manifest: mod, modAbsPath });

      if (fs.existsSync(modAbsPath)) {
        const entries = fs.readdirSync(modAbsPath);
        for (const entry of entries) {
          if (
            entry.toLowerCase().endsWith('.ini') &&
            !entry.toLowerCase().startsWith('disabled_source_') &&
            entry.toLowerCase() !== 'desktop.ini'
          ) {
            const srcIni = path.join(modAbsPath, entry);
            const isolatedIni = path.join(modAbsPath, `DISABLED_source_${entry}`);
            try {
              fs.renameSync(srcIni, isolatedIni);
              isolatedFilesCount++;
            } catch {
              // Ignore if already isolated
            }
          }
        }
      }
    }

    // Also restore any mod NOT in the active cycle if it was previously isolated
    for (const mod of agentMods) {
      if (!mod.enabled || !mod.in_h_swap_cycle) {
        restoreIsolatedInisInModFolder(path.join(zzmiRootPath, mod.install_path));
      }
    }

    // 2. Write master_swap.ini
    const content = buildMasterSwapIniContent(agent, cyclePayload);
    fs.writeFileSync(masterSwapPath, content, 'utf-8');

    return {
      agentFolder: agent.folder_name,
      activeCycleCount: activeCycleMods.length,
      masterSwapPath,
      generatedIniContent: content,
      isolatedFilesCount,
    };
  } else {
    // Fewer than 2 mods in H-Cycle: restore isolated source .ini files and remove master_swap.ini
    for (const mod of agentMods) {
      restoreIsolatedInisInModFolder(path.join(zzmiRootPath, mod.install_path));
    }
    if (fs.existsSync(masterSwapPath)) {
      fs.unlinkSync(masterSwapPath);
    }
    return {
      agentFolder: agent.folder_name,
      activeCycleCount: activeCycleMods.length,
      masterSwapPath,
      generatedIniContent: null,
      isolatedFilesCount: 0,
    };
  }
}

export function restoreIsolatedInisInModFolder(modAbsPath: string): void {
  if (!fs.existsSync(modAbsPath)) return;
  const entries = fs.readdirSync(modAbsPath);
  for (const entry of entries) {
    if (entry.toLowerCase().startsWith('disabled_source_') && entry.toLowerCase().endsWith('.ini')) {
      const originalName = entry.replace(/^DISABLED_source_/i, '');
      const srcPath = path.join(modAbsPath, entry);
      const dstPath = path.join(modAbsPath, originalName);
      try {
        if (!fs.existsSync(dstPath)) {
          fs.renameSync(srcPath, dstPath);
        }
      } catch {
        // ignore
      }
    }
  }
}
