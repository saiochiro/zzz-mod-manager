import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unpackAndLocalizeModArchive } from '../src/core/archiveEngine';
import { buildMasterSwapIniContent, syncAgentHSwapOnDisk } from '../src/core/hSwapEngine';
import {
  classifyStandardKeySlot,
  formatReadableKey,
  parseIniContent,
  rewriteIniKeybind,
} from '../src/core/iniParser';
import { ModManagerService } from '../src/core/modManagerService';
import { repairModOnDisk, undoModRepairOnDisk } from '../src/core/repairEngine';
import { matchHashesToAgent } from '../src/core/routerEngine';
import { DEFAULT_HASH_DB } from '../src/shared/defaultHashDb';

describe('ZZZ Mod Manager Core Engines (Fairy OS)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zzzmgr-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('parses 3DMigoto .ini AST, extracts buffer hashes, translates VK keys, and rewrites keybinds safely', () => {
    const sampleIni = `
[Constants]
global persist $jacket = 0

[KeyToggleJacket]
key = VK_OEM_6
type = cycle
$jacket = 0,1

[TextureOverrideEllenPosition]
hash = 6291a8c4
vb0 = ResourceEllenPosition

[TextureOverrideEllenIB]
hash = 9f4e21b0
handling = skip
ps-t0 = ResourceEllenDiffuse
drawindexed = auto
`;

    const parsed = parseIniContent(sampleIni, 'Streetwear_Ellen.ini');
    expect(parsed.detectedHashes).toEqual(['6291a8c4', '9f4e21b0']);
    expect(parsed.hasLegacyShaderSlots).toBe(true);
    expect(parsed.subToggles).toHaveLength(1);
    expect(parsed.subToggles[0]).toMatchObject({
      section_name: 'KeyToggleJacket',
      variable: '$jacket',
      label: 'Jacket',
      original_key: ']',
      current_key: ']',
      states: ['0', '1'],
    });

    // Rewrite keybind to J and verify original key comment preservation
    const rewritten = rewriteIniKeybind(sampleIni, 'KeyToggleJacket', 'J');
    const reparsed = parseIniContent(rewritten, 'Streetwear_Ellen.ini');
    expect(reparsed.subToggles[0].current_key).toBe('J');
    expect(reparsed.subToggles[0].original_key).toBe(']');
    expect(formatReadableKey('VK_UP')).toBe('UP');
    expect(classifyStandardKeySlot('Jacket', '$jacket')).toBe('J');
    expect(classifyStandardKeySlot('Glasses', '$glasses')).toBe('K');
    expect(classifyStandardKeySlot('Katana Glow', '$weapon')).toBe('L');
  });

  it('fingerprints current and legacy buffer hashes against hash_db.json', () => {
    const ellenMatch = matchHashesToAgent(['6291a8c4', '9f4e21b0'], DEFAULT_HASH_DB);
    expect(ellenMatch.agent?.agent_id).toBe('ellen_joe');
    expect(ellenMatch.matchedCurrentHashes).toEqual(['6291a8c4', '9f4e21b0']);
    expect(ellenMatch.matchedLegacyHashes).toHaveLength(0);

    const legacyMiyabiMatch = matchHashesToAgent(['deadbeef', 'b40192f1'], DEFAULT_HASH_DB);
    expect(legacyMiyabiMatch.agent?.agent_id).toBe('miyabi');
    expect(legacyMiyabiMatch.matchedLegacyHashes).toEqual(['deadbeef', 'b40192f1']);
  });

  it('unpacks nested archives, strips rogue .dll/.exe files, and localizes the true Mod Root', () => {
    const zipPath = path.join(tempDir, 'NestedMod.zip');
    const zip = new AdmZip();
    zip.addFile(
      'OuterWrapper/NestedFolder/TrueModRoot/EllenMod.ini',
      Buffer.from('[TextureOverrideEllenPosition]\nhash = 6291a8c4\n', 'utf-8')
    );
    zip.addFile(
      'OuterWrapper/NestedFolder/TrueModRoot/malicious_hook.dll',
      Buffer.from('FAKE_DLL', 'utf-8')
    );
    zip.writeZip(zipPath);

    const stagingDir = path.join(tempDir, 'staging');
    const res = unpackAndLocalizeModArchive(zipPath, stagingDir, DEFAULT_HASH_DB);

    expect(res.localizedRoots).toHaveLength(1);
    expect(res.localizedRoots[0].folderName).toBe('TrueModRoot');
    expect(res.localizedRoots[0].matchedAgentId).toBe('ellen_joe');
    expect(res.sanitizedWarnings).toHaveLength(1);
    expect(
      fs.existsSync(path.join(res.localizedRoots[0].rootPath, 'malicious_hook.dll'))
    ).toBe(false);
  });

  it('initializes sandbox workspace, compiles master_swap.ini for H-key cycling, and performs 3-Stage Repair + 1-Click Rollback', () => {
    const service = new ModManagerService(tempDir);
    service.seedInitialSandboxMods();
    const initialState = service.getFullState();

    expect(initialState.mods.length).toBeGreaterThanOrEqual(6);

    // Verify Ellen's master_swap.ini was generated on disk
    const ellenMasterSwap = path.join(
      tempDir,
      'ZZMI_Root',
      'Mods',
      '_ZZZMM_Managed',
      'Ellen',
      'master_swap.ini'
    );
    expect(fs.existsSync(ellenMasterSwap)).toBe(true);
    const swapText = fs.readFileSync(ellenMasterSwap, 'utf-8');
    expect(swapText).toContain('namespace = Ellen_Master_Swap');
    expect(swapText).toContain('key = h');
    expect(swapText).toContain('$active_outfit = 0,1');

    // Find broken Miyabi mod and run 1-Click Repair
    const brokenMiyabi = initialState.mods.find((m) => m.agent_id === 'miyabi')!;
    expect(brokenMiyabi.broken_hashes).toContain('deadbeef');
    expect(brokenMiyabi.needs_orfix).toBe(true);

    const repairRes = service.repairMod(brokenMiyabi.mod_uuid);
    expect(repairRes.success).toBe(true);
    expect(repairRes.appliedFixes).toContain('HASH_MIGRATION_2.4');
    expect(repairRes.appliedFixes).toContain('ZZMI_ORFIX_INJECT');
    expect(repairRes.manifest.broken_hashes).toHaveLength(0);
    expect(repairRes.manifest.repair_state.is_repaired).toBe(true);

    // Now test 1-Click Undo (Instant Rollback)
    const undoRes = service.undoModRepair(brokenMiyabi.mod_uuid);
    expect(undoRes.success).toBe(true);
    expect(undoRes.manifest.repair_state.is_repaired).toBe(false);
    expect(undoRes.manifest.broken_hashes).toContain('deadbeef');
  });
});
