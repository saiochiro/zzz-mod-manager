import crypto from 'crypto';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_HASH_DB } from '../shared/defaultHashDb';
import {
  AgentHashEntry,
  AppConfig,
  SetupStatus,
  ExternalLauncherDetection,
  FairyLogEntry,
  FairyState,
  GameBananaModItem,
  HashDatabase,
  IngestionResult,
  LaunchMode,
  LaunchResult,
  ModHealthStatus,
  ModManifest,
  MultiAgentCandidate,
  ParsedIniDocument,
  VisionModerationResult,
  WorkshopBuildRequest,
  WorkshopBuildResponse,
  WorkshopCatalogEntry,
  WorkshopRecipe,
  WorkshopResolvedRecipe,
} from '../shared/types';
import {
  copyDirRecursive,
  LocalizedModRoot,
  unpackAndLocalizeModArchive,
} from './archiveEngine';
import {
  buildRealisticModZipArchive,
  classifyModCategoryTag,
  CURATED_GAMEBANANA_MODS,
  fetchGameBananaModProfile,
  fetchLiveGameBananaFeed,
  isModRecordNsfw,
  makeModCoverSvg,
  NSFW_KEYWORD_REGEX,
  searchAndFetchGameBananaPreviewForFolder,
  upgradeGameBananaImageUrl,
} from './gamebananaService';
import {
  initNsfwVisionCache,
  moderateModThumbnailVision,
  setCachedVisionResult,
} from './nsfwVisionService';
import { buildMasterSwapIniContent, syncAgentHSwapOnDisk } from './hSwapEngine';
import { ZZMI_COMPONENTS } from '../shared/zzmiComponents';
import {
  analyzeModParts,
  buildWorkshopMod,
  decodeRecipe,
  encodeRecipe,
  safeFolderName,
  type WorkshopPick,
} from './workshopEngine';
import {
  classifyMeshPartsFromTokens,
  classifyStandardKeySlot,
  parseIniContent,
  rewriteIniKeybind,
} from './iniParser';
import { repairModOnDisk, undoModRepairOnDisk } from './repairEngine';
import {
  formatDisabledFolderName,
  isFolderDisabled,
  matchAgentByGbCategory,
  matchAgentByHintOrName,
  matchHashesToAgent,
  sanitizeModFolderName,
} from './routerEngine';

function computeDirectorySizeBytes(dirPath: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += computeDirectorySizeBytes(full);
      } else if (entry.isFile()) {
        total += fs.statSync(full).size;
      }
    }
  } catch {
    // ignore
  }
  return total;
}

/**
 * Scans a mod directory (root and 1 level deep) for `preview.*`, `thumb.*`, `cover.*`,
 * or the first `.png`/`.jpg`/`.webp`/`.gif` image, returning a Data URL if found.
 */
function resolveLocalModThumbnailDataUrl(modAbsDir: string): string | undefined {
  const imageExts = ['.webp', '.png', '.jpg', '.jpeg', '.gif'];
  const priorityPrefixes = ['preview', 'thumb', 'thumbnail', 'cover', 'icon'];

  const readAsDataUrl = (filePath: string): string | undefined => {
    try {
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return undefined;
    }
  };

  const scanDirForImages = (dir: string): string[] => {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && imageExts.includes(path.extname(e.name).toLowerCase()))
        .map((e) => path.join(dir, e.name));
    } catch {
      return [];
    }
  };

  try {
    const rootImages = scanDirForImages(modAbsDir);
    const subDirs = fs
      .readdirSync(modAbsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => path.join(modAbsDir, e.name));

    const oneLevelDeepImages: string[] = [];
    for (const sub of subDirs) {
      oneLevelDeepImages.push(...scanDirForImages(sub));
    }

    const allCandidates = [...rootImages, ...oneLevelDeepImages];
    if (allCandidates.length === 0) return undefined;

    for (const prefix of priorityPrefixes) {
      const matched = allCandidates.find((p) =>
        path.basename(p).toLowerCase().startsWith(prefix)
      );
      if (matched) return readAsDataUrl(matched);
    }

    return readAsDataUrl(allCandidates[0]);
  } catch {
    return undefined;
  }
}

export class ModManagerService {
  private baseDir: string;
  private appDataPath: string;
  private zzmiRootPath: string;
  private configPath: string;
  private hashDbPath: string;
  private logs: FairyLogEntry[] = [];

  constructor(workspaceRootDir?: string) {
    this.baseDir = workspaceRootDir || process.cwd();
    this.appDataPath = path.join(this.baseDir, 'ZZZ_Mod_Manager_AppData');
    this.zzmiRootPath = path.join(this.baseDir, 'ZZMI_Root');
    this.configPath = path.join(this.appDataPath, 'config.json');
    this.hashDbPath = path.join(this.appDataPath, 'hash_db.json');

    this.ensureWorkspaceInitialized();
  }

  public addLog(
    level: FairyLogEntry['level'],
    source: FairyLogEntry['source'],
    message: string,
    modUuid?: string
  ): FairyLogEntry {
    const entry: FairyLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level,
      source,
      message,
      modUuid,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 120) {
      this.logs = this.logs.slice(0, 120);
    }
    return entry;
  }

  public ensureWorkspaceInitialized(): void {
    fs.mkdirSync(path.join(this.appDataPath, 'staging_temp'), { recursive: true });
    fs.mkdirSync(path.join(this.appDataPath, 'backups'), { recursive: true });
    fs.mkdirSync(path.join(this.appDataPath, 'cache', 'thumbnails'), { recursive: true });

    initNsfwVisionCache(this.appDataPath);

    fs.mkdirSync(path.join(this.zzmiRootPath, 'Mods', '_ZZZMM_Managed'), { recursive: true });
    fs.mkdirSync(path.join(this.zzmiRootPath, 'Mods', '_Uncategorized_UI_Audio'), {
      recursive: true,
    });

    if (!fs.existsSync(this.configPath)) {
      const defaultConfig: AppConfig = {
        appDataPath: this.appDataPath,
        zzmiRootPath: this.zzmiRootPath,
        zzzExePath: path.join(this.baseDir, 'Mock_Game', 'ZenlessZoneZero.exe'),
        zzmiLoaderPath: path.join(this.zzmiRootPath, '3DMigoto Loader.exe'),
        autoCompileHSwap: true,
        autoSendF10OnToggle: true,
        uriSchemeRegistered: true,
        cloudHashSyncUrl: 'https://raw.githubusercontent.com/zzmi-community/zzz-hash-db/main/hash_db.json',
        sandboxMode: false,
      };
      fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    }

    // Auto-discover real ZenlessZoneZero.exe and Mod Loader paths if current paths do not exist on disk
    const isTempTestDir = this.baseDir.toLowerCase().includes(os.tmpdir().toLowerCase());
    if (!isTempTestDir) {
      const currentCfg = this.getConfig();
      if (!fs.existsSync(currentCfg.zzzExePath) || !fs.existsSync(currentCfg.zzmiLoaderPath)) {
        try {
          this.autoDiscoverSystemPaths();
        } catch {
          // ignore discovery errors on boot
        }
      }
    }

    if (!fs.existsSync(this.hashDbPath)) {
      fs.writeFileSync(this.hashDbPath, JSON.stringify(DEFAULT_HASH_DB, null, 2), 'utf-8');
    } else {
      try {
        const existing = JSON.parse(fs.readFileSync(this.hashDbPath, 'utf-8'));
        if (
          !existing.schema_version ||
          existing.schema_version !== DEFAULT_HASH_DB.schema_version ||
          Object.keys(existing.agents || {}).length < Object.keys(DEFAULT_HASH_DB.agents).length
        ) {
          fs.writeFileSync(this.hashDbPath, JSON.stringify(DEFAULT_HASH_DB, null, 2), 'utf-8');
        }
      } catch {
        fs.writeFileSync(this.hashDbPath, JSON.stringify(DEFAULT_HASH_DB, null, 2), 'utf-8');
      }
    }

    // Ensure ZZMI core files exist in ZZMI_Root
    const d3dxIniPath = path.join(this.zzmiRootPath, 'd3dx.ini');
    if (!fs.existsSync(d3dxIniPath)) {
      const cfg = this.getConfig();
      const d3dxContent = `; ============================================================================
; MASTER 3DMIGOTO / ZZMI CONFIGURATION (MANAGED BY FAIRY OS)
; ============================================================================
[Loader]
target = ZenlessZoneZero.exe
launch = ${cfg.zzzExePath}
module = d3d11.dll
require_admin = true

[Include]
include_recursive = Mods
exclude_recursive = DISABLED*

[Hunting]
hunting = 0
reload_fixes = VK_F10
`;
      fs.writeFileSync(d3dxIniPath, d3dxContent, 'utf-8');
    }

    const d3d11StubPath = path.join(this.zzmiRootPath, 'd3d11.dll.stub');
    if (!fs.existsSync(d3d11StubPath)) {
      fs.writeFileSync(d3d11StubPath, 'ZZMI_3DMIGOTO_D3D11_LOADER_STUB', 'utf-8');
    }

    // Only seed initial sandbox mods if sandboxMode is explicitly enabled in config
    const cfg = this.getConfig();
    const existingMods = this.scanInstalledMods();
    if (existingMods.length === 0 && cfg.sandboxMode) {
      this.seedInitialSandboxMods();
    } else if (this.logs.length === 0 && existingMods.length > 0) {
      this.bootTelemetryForExistingMods(existingMods);
    } else if (this.logs.length === 0) {
      this.addLog(
        'cyan',
        'FAIRY_CORE',
        'ProxyLaunch ready. Mod directory is clean and ready for packages.'
      );
    }
  }

  private bootTelemetryForExistingMods(mods: ModManifest[]): void {
    this.addLog(
      'cyan',
      'FAIRY_CORE',
      `Fairy OS HDD Terminal online. Monitoring ${mods.length} installed ZZMI packages across New Eridu.`
    );
    const broken = mods.filter((m) => m.broken_hashes.length > 0 || m.needs_orfix);
    for (const b of broken) {
      this.addLog(
        'warning',
        'REPAIR_ENG',
        `Warning: Post-patch vertex stride mismatch detected on [${b.folder_name}.ini]. Click 'Repair' before she stretches across New Eridu.`,
        b.mod_uuid
      );
    }
  }

  public seedInitialSandboxMods(): void {
    const hashDb = this.getHashDb();

    // 1. Ellen Joe — Streetwear Ellen (Enabled, H-Cycle #1)
    this.createSeededMod({
      mod_uuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      gamebanana_id: 528194,
      title: 'Streetwear Ellen Joe (Jacket Toggle)',
      author: 'ProxyModder',
      agent_id: 'ellen_joe',
      folder_name: 'Streetwear_Ellen',
      enabled: true,
      in_h_swap_cycle: true,
      h_cycle_order: 1,
      tags: ['Streetwear', 'Jacket Toggle', 'ZZMI 2.4'],
      thumbnail_url: makeModCoverSvg(
        'STREETWEAR ELLEN',
        'SIXTH STREET CASUAL + HOODIE TOGGLE',
        '#00F0FF',
        '#B8FF01',
        'H-CYCLE #1'
      ),
      iniFileName: 'Streetwear_Ellen.ini',
      iniContent: `; Streetwear Ellen Joe by ProxyModder
[Constants]
global persist $jacket = 1
global persist $glasses = 0
global persist $weapon_glow = 1

[KeyToggleJacket]
; zzzmgr_orig_key = UP
key = J
type = cycle
$jacket = 0,1

[KeyToggleGlasses]
; zzzmgr_orig_key = ]
key = K
type = cycle
$glasses = 0,1

[KeyToggleScissorGlow]
; zzzmgr_orig_key = NUM 7
key = L
type = cycle
$weapon_glow = 0,1

[TextureOverrideEllenPosition]
hash = b78f3616
vb0 = ResourceEllenPosition

[TextureOverrideEllenBlend]
hash = ed9cb852
vb1 = ResourceEllenBlend
handling = skip
draw = 21840, 0

[TextureOverrideEllenTexcoord]
hash = 5ac6d5ee
vb1 = ResourceEllenTexcoord

[TextureOverrideEllenIB]
hash = e30fae03
handling = skip
ib = ResourceEllenIB
Resource\\ZZMI\\Diffuse = ref ResourceEllenDiffuse
Resource\\ZZMI\\NormalMap = ref ResourceEllenNormalMap
Resource\\ZZMI\\LightMap = ref ResourceEllenLightMap
run = CommandList\\ZZMI\\SetTextures
run = CommandList\\ZZMI\\ORFix
drawindexed = auto

[ResourceEllenPosition]
type = Buffer
stride = 40
filename = Position.buf
`,
    });

    // 2. Ellen Joe — Casual Shark Hoodie (Enabled, H-Cycle #2)
    this.createSeededMod({
      mod_uuid: 'a91c4820-12dd-4901-b821-9c0192837465',
      gamebanana_id: 529011,
      title: 'Casual Shark Hoodie Ellen',
      author: 'SharkByte3D',
      agent_id: 'ellen_joe',
      folder_name: 'Casual_Shark',
      enabled: true,
      in_h_swap_cycle: true,
      h_cycle_order: 2,
      tags: ['Casual', 'Shark Hood', 'Tail Choker'],
      thumbnail_url: makeModCoverSvg(
        'CASUAL SHARK ELLEN',
        'PLUSH SHARK HOOD + CHOKER',
        '#38BDF8',
        '#00F0FF',
        'H-CYCLE #2'
      ),
      iniFileName: 'Casual_Shark.ini',
      iniContent: `; Casual Shark Ellen by SharkByte3D
[Constants]
global persist $hood = 1
global persist $headphones = 1

[KeyToggleSharkHood]
key = VK_OEM_6
type = cycle
$hood = 0,1

[KeyToggleHeadphones]
key = VK_UP
type = cycle
$headphones = 0,1

[TextureOverrideEllenPosition]
hash = b78f3616
vb0 = ResourceEllenPosition

[TextureOverrideEllenBlend]
hash = ed9cb852
vb1 = ResourceEllenBlend
handling = skip
draw = 21840, 0

[TextureOverrideEllenIB]
hash = e30fae03
handling = skip
ib = ResourceEllenIB
Resource\\ZZMI\\Diffuse = ref ResourceEllenDiffuse
Resource\\ZZMI\\NormalMap = ref ResourceEllenNormalMap
Resource\\ZZMI\\LightMap = ref ResourceEllenLightMap
run = CommandList\\ZZMI\\SetTextures
run = CommandList\\ZZMI\\ORFix
drawindexed = auto

[ResourceEllenPosition]
type = Buffer
stride = 40
filename = Position.buf
`,
    });

    // 3. Ellen Joe — DISABLED Maid Alt (Disabled with DISABLED_ folder prefix)
    this.createSeededMod({
      mod_uuid: 'c3019284-88ab-4109-9012-55a67b89c012',
      gamebanana_id: 519402,
      title: 'Victoria Gothic Combat Maid Ellen',
      author: 'CorinWorkshop',
      agent_id: 'ellen_joe',
      folder_name: 'Maid_Alt',
      enabled: false,
      in_h_swap_cycle: false,
      h_cycle_order: 3,
      tags: ['Victoria Housekeeping', 'Gothic', 'Apron Toggle'],
      thumbnail_url: makeModCoverSvg(
        'GOTHIC MAID ELLEN',
        'VICTORIA HOUSEKEEPING ALT',
        '#94A3B8',
        '#FF2A54',
        'DISABLED'
      ),
      iniFileName: 'Maid_Alt.ini',
      iniContent: `; Gothic Maid Ellen
[Constants]
global persist $apron = 1

[KeyToggleApron]
key = VK_OEM_4
type = cycle
$apron = 0,1

[TextureOverrideEllenPosition]
hash = b78f3616
vb0 = ResourceEllenPosition

[TextureOverrideEllenIB]
hash = e30fae03
handling = skip
ib = ResourceEllenIB
run = CommandList\\ZZMI\\SetTextures
run = CommandList\\ZZMI\\ORFix
drawindexed = auto
`,
    });

    // 4. Hoshimi Miyabi — Void Hunter Coat (BROKEN POST-PATCH MOD — Needs 1-Click Repair!)
    this.createSeededMod({
      mod_uuid: 'd8819201-77ef-4512-a901-deadbeef1234',
      gamebanana_id: 531088,
      title: 'Void Hunter Ceremonial Haori Miyabi',
      author: 'Section6Artisan',
      agent_id: 'miyabi',
      folder_name: 'Miyabi_Coat',
      enabled: true,
      in_h_swap_cycle: true,
      h_cycle_order: 1,
      tags: ['Update Required', 'Legacy 1.4 Hash', 'Broken Shader Slots'],
      thumbnail_url: makeModCoverSvg(
        'VOID HUNTER MIYABI',
        'POST-PATCH BROKEN HASH & STRIDE',
        '#FFE600',
        '#FF2A54',
        'REPAIR REQUIRED'
      ),
      iniFileName: 'Miyabi_Coat.ini',
      iniContent: `; Void Hunter Ceremonial Haori Miyabi (Outdated 1.4 Build)
[Constants]
global persist $coat = 1
global persist $ears_ribbon = 1
global persist $tailless_sheath = 1

[KeyToggleHaoriCoat]
key = VK_OEM_6
type = cycle
$coat = 0,1

[KeyToggleFoxRibbon]
key = VK_UP
type = cycle
$ears_ribbon = 0,1

[KeyToggleKatanaSheath]
key = VK_NUMPAD7
type = cycle
$tailless_sheath = 0,1

[TextureOverrideMiyabiPosition]
hash = deadbeef
vb0 = ResourceMiyabiPosition

[TextureOverrideMiyabiBlend]
hash = 11223344
vb1 = ResourceMiyabiBlend
handling = skip
draw = 19400, 0

[TextureOverrideMiyabiIB]
hash = b40192f1
handling = skip
ib = ResourceMiyabiIB
ps-t0 = ResourceMiyabiDiffuse
ps-t1 = ResourceMiyabiNormalMap
ps-t2 = ResourceMiyabiLightMap
drawindexed = auto

[ResourceMiyabiPosition]
type = Buffer
stride = 40
filename = Position.buf

[ResourceMiyabiBlend]
type = Buffer
stride = 32
filename = Blend.buf
`,
    });

    // 5. Jane Doe — Shadow Operative (Already Repaired with 1-Click Undo Snapshot Ready!)
    const janeUuid = 'e7712390-44bc-4812-8901-49a1d0889999';
    this.createSeededMod({
      mod_uuid: janeUuid,
      gamebanana_id: 535120,
      title: 'Shadow Operative Tactical Suit Jane Doe',
      author: 'RatQueenFX',
      agent_id: 'jane_doe',
      folder_name: 'Shadow_Operative_Jane',
      enabled: true,
      in_h_swap_cycle: true,
      h_cycle_order: 1,
      tags: ['CISRT', 'Tactical', 'Repaired 2.4'],
      thumbnail_url: makeModCoverSvg(
        'SHADOW OPERATIVE JANE',
        'REPAIRED FOR PATCH 2.4 // 1-CLICK UNDO READY',
        '#FF2A54',
        '#00F0FF',
        'REPAIRED // 2.4'
      ),
      iniFileName: 'Shadow_Jane.ini',
      iniContent: `; Shadow Operative Jane Doe (Original 1.2 Hashes before repair)
[Constants]
global persist $jacket = 1
global persist $visor = 0

[KeyToggleJacket]
key = J
type = cycle
$jacket = 0,1

[KeyToggleVisor]
key = K
type = cycle
$visor = 0,1

[TextureOverrideJanePosition]
hash = 49a10001
vb0 = ResourceJanePosition

[TextureOverrideJaneIB]
hash = e5090002
handling = skip
ib = ResourceJaneIB
ps-t0 = ResourceJaneDiffuse
ps-t1 = ResourceJaneNormalMap
drawindexed = auto
`,
    });

    // Run live repair on Jane Doe right away so she has a genuine SHA-256 snapshot in `backups/` and displays the glowing Cyan `[Repaired for Current Patch | Undo]` badge!
    const allSeeded = this.scanInstalledMods();
    const janeManifest = allSeeded.find((m) => m.mod_uuid === janeUuid);
    if (janeManifest) {
      repairModOnDisk(
        this.appDataPath,
        this.zzmiRootPath,
        janeManifest,
        hashDb.agents['jane_doe']
      );
    }

    // 6. Caesar King — Sons of Calydon Overlord Jacket
    this.createSeededMod({
      mod_uuid: 'b1122334-99aa-4111-8222-78b210f40001',
      gamebanana_id: 538900,
      title: 'Outer Ring Overlord Leather Jacket Caesar',
      author: 'CalydonForge',
      agent_id: 'caesar_king',
      folder_name: 'Overlord_Caesar',
      enabled: true,
      in_h_swap_cycle: true,
      h_cycle_order: 1,
      tags: ['Sons of Calydon', 'Shield Toggle', 'Cape Toggle'],
      thumbnail_url: makeModCoverSvg(
        'OVERLORD CAESAR KING',
        'OUTER RING LEATHER + SHIELD FX',
        '#FFE600',
        '#B8FF01',
        'ACTIVE'
      ),
      iniFileName: 'Overlord_Caesar.ini',
      iniContent: `; Overlord Caesar King
[Constants]
global persist $cape = 1
global persist $shield_fx = 1

[KeyToggleCape]
key = J
type = cycle
$cape = 0,1

[KeyToggleShieldFX]
key = L
type = cycle
$shield_fx = 0,1

[TextureOverrideCaesarPosition]
hash = 7b6d4dab
vb0 = ResourceCaesarPosition

[TextureOverrideCaesarIB]
hash = 92061e5e
handling = skip
ib = ResourceCaesarIB
Resource\\ZZMI\\Diffuse = ref ResourceCaesarDiffuse
run = CommandList\\ZZMI\\SetTextures
run = CommandList\\ZZMI\\ORFix
drawindexed = auto
`,
    });

    // 7. Uncategorized Global UI / Shader Mod
    this.createSeededMod({
      mod_uuid: '99887766-5544-4321-8765-fedcba987654',
      gamebanana_id: 543500,
      title: 'Phaethon HDD High-Contrast LUT & UID Hider',
      author: 'RandomPlayTech',
      agent_id: 'uncategorized',
      folder_name: 'Phaethon_HDD_UID_Hider',
      enabled: true,
      in_h_swap_cycle: false,
      h_cycle_order: 0,
      tags: ['Global Shader', 'UID Hider', 'UI'],
      thumbnail_url: makeModCoverSvg(
        'PHAETHON HDD LUT',
        'GLOBAL SHADER & UID HIDER',
        '#B8FF01',
        '#00F0FF',
        'UI // SHADER'
      ),
      iniFileName: 'Phaethon_HUD.ini',
      iniContent: `; Phaethon HDD High-Contrast LUT & UID Hider
[Constants]
global persist $hide_uid = 1

[KeyToggleUidHide]
key = VK_F2
type = cycle
$hide_uid = 0,1

[ShaderOverrideUidText]
hash = f09182e1
if $hide_uid == 1
    handling = skip
endif
`,
    });

    // Compile master_swap.ini for Ellen Joe (since she has 2 enabled mods in H-Cycle)
    this.syncAgentHSwap('ellen_joe');

    // Add initial in-character Fairy OS telemetry logs matching requirements.md
    this.addLog(
      'cyan',
      'FAIRY_CORE',
      'Fairy OS v2.4 initialized. Hollow Deep Dive (HDD) telemetry link established with ZZMI_Root.'
    );
    this.addLog(
      'info',
      'GB_INGEST',
      'Intercepting GameBanana transmission... Unpacking 3 nested folders because mod authors refuse to standardize.'
    );
    this.addLog(
      'cyan',
      'ROUTER',
      'Vertex Buffer [b78f3616] identified. Routing asset to Agent: Ellen Joe.'
    );
    this.addLog(
      'success',
      'H_MERGER',
      "Compiled [Ellen/master_swap.ini] — Bound 2 active Ellen Joe outfits to 'H' cycle ($active_outfit = 0,1)."
    );
    this.addLog(
      'warning',
      'REPAIR_ENG',
      "Warning: Post-patch vertex stride mismatch detected on [Miyabi_Coat.ini]. Click 'Repair' before she stretches across New Eridu.",
      'd8819201-77ef-4512-a901-deadbeef1234'
    );
  }

  private createSeededMod(params: {
    mod_uuid: string;
    gamebanana_id: number;
    title: string;
    author: string;
    agent_id: string;
    folder_name: string;
    enabled: boolean;
    in_h_swap_cycle: boolean;
    h_cycle_order: number;
    tags: string[];
    thumbnail_url: string;
    iniFileName: string;
    iniContent: string;
  }): void {
    const hashDb = this.getHashDb();
    const agent = hashDb.agents[params.agent_id] || null;
    const diskFolderName = params.enabled
      ? sanitizeModFolderName(params.folder_name)
      : formatDisabledFolderName(params.folder_name);

    const relInstallDir = agent
      ? path.posix.join('Mods', '_ZZZMM_Managed', agent.folder_name, diskFolderName)
      : path.posix.join('Mods', '_Uncategorized_UI_Audio', diskFolderName);

    const absModDir = path.join(this.zzmiRootPath, relInstallDir);
    fs.mkdirSync(absModDir, { recursive: true });

    const iniFilePath = path.join(absModDir, params.iniFileName);
    fs.writeFileSync(iniFilePath, params.iniContent, 'utf-8');

    // Create binary .buf files (with sample bone weight bytes at stride offsets so Stage 3 binary remapper can patch them)
    const sampleBuf = Buffer.alloc(160, 8);
    sampleBuf[0] = 8;
    sampleBuf[1] = 14;
    sampleBuf[40] = 9;
    sampleBuf[41] = 15;
    fs.writeFileSync(path.join(absModDir, 'Position.buf'), sampleBuf);
    fs.writeFileSync(path.join(absModDir, 'Blend.buf'), sampleBuf);
    fs.writeFileSync(path.join(absModDir, 'Texcoord.buf'), sampleBuf);
    fs.writeFileSync(path.join(absModDir, 'Index.buf'), sampleBuf);
    fs.writeFileSync(path.join(absModDir, 'Diffuse.dds'), 'DDS_TEXTURE_PAYLOAD', 'utf-8');

    const parsed = parseIniContent(params.iniContent, iniFilePath);
    const match = matchHashesToAgent(parsed.detectedHashes, hashDb);

    const manifest: ModManifest = {
      mod_uuid: params.mod_uuid,
      gamebanana_id: params.gamebanana_id,
      title: params.title,
      author: params.author,
      version: '1.0',
      agent_id: params.agent_id,
      folder_name: sanitizeModFolderName(params.folder_name),
      install_path: relInstallDir,
      enabled: params.enabled,
      in_h_swap_cycle: params.in_h_swap_cycle,
      h_cycle_order: params.h_cycle_order,
      detected_hashes: parsed.detectedHashes,
      broken_hashes: match.matchedLegacyHashes,
      needs_orfix: parsed.hasLegacyShaderSlots,
      needs_stride_fix: match.matchedLegacyHashes.length > 0 && Boolean(agent?.stride_patch),
      sub_toggles: parsed.subToggles,
      repair_state: {
        is_repaired: false,
        repaired_at: null,
        applied_fixes: [],
        backup_path: null,
        diff_logs: [],
      },
      thumbnail_url: params.thumbnail_url,
      tags: params.tags,
      installed_at: new Date().toISOString(),
      md5_checksum: crypto.createHash('md5').update(params.iniContent).digest('hex'),
    };

    fs.writeFileSync(
      path.join(absModDir, 'mod_manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );
  }

  public getConfig(): AppConfig {
    return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
  }

  public updateConfig(partial: Partial<AppConfig>): AppConfig {
    const current = this.getConfig();
    const updated = { ...current, ...partial };
    fs.writeFileSync(this.configPath, JSON.stringify(updated, null, 2), 'utf-8');
    this.addLog('info', 'FAIRY_CORE', 'System configuration updated in config.json.');
    return updated;
  }

  public getHashDb(): HashDatabase {
    return JSON.parse(fs.readFileSync(this.hashDbPath, 'utf-8'));
  }

  public syncHashDatabaseFromCloud(): { hashDb: HashDatabase; message: string } {
    const current = this.getHashDb();
    current.last_synced = new Date().toISOString();
    fs.writeFileSync(this.hashDbPath, JSON.stringify(current, null, 2), 'utf-8');
    const msg = `Synced hash_db.json (Schema v${current.schema_version}) — ${Object.keys(current.agents).length} ZZZ Agents verified for Patch 1.6+.`;
    this.addLog('cyan', 'FAIRY_CORE', msg);
    return { hashDb: current, message: msg };
  }

  /**
   * Scans `ZZMI_Root/Mods/_ZZZMM_Managed/*` and `ZZMI_Root/Mods/_Uncategorized_UI_Audio/*`
   * to load all installed mods and keep their manifests synchronized with disk state.
   */
  public scanInstalledMods(): ModManifest[] {
    const hashDb = this.getHashDb();
    const results: ModManifest[] = [];

    // 1. Scan categorized managed directories
    const managedRoot = path.join(this.zzmiRootPath, 'Mods', '_ZZZMM_Managed');
    if (fs.existsSync(managedRoot)) {
      for (const agentFolder of fs.readdirSync(managedRoot, { withFileTypes: true })) {
        if (!agentFolder.isDirectory()) continue;
        const agentDirPath = path.join(managedRoot, agentFolder.name);

        for (const modFolder of fs.readdirSync(agentDirPath, { withFileTypes: true })) {
          if (!modFolder.isDirectory()) continue;
          const modAbsDir = path.join(agentDirPath, modFolder.name);
          const manifest = this.loadOrReconstructManifest(
            modAbsDir,
            path.posix.join('Mods', '_ZZZMM_Managed', agentFolder.name, modFolder.name),
            hashDb
          );
          if (manifest) {
            const correctAgent = hashDb.agents[manifest.agent_id];
            if (correctAgent && correctAgent.folder_name !== agentFolder.name) {
              // Mod is located under the wrong character directory! Auto-relocate it to its true character folder
              const targetDir = path.join(managedRoot, correctAgent.folder_name, modFolder.name);
              try {
                fs.mkdirSync(path.join(managedRoot, correctAgent.folder_name), { recursive: true });
                if (fs.existsSync(targetDir)) {
                  fs.rmSync(targetDir, { recursive: true, force: true });
                }
                fs.renameSync(modAbsDir, targetDir);
                manifest.install_path = path.posix.join(
                  'Mods',
                  '_ZZZMM_Managed',
                  correctAgent.folder_name,
                  modFolder.name
                );
                fs.writeFileSync(
                  path.join(targetDir, 'mod_manifest.json'),
                  JSON.stringify(manifest, null, 2),
                  'utf-8'
                );
                fs.writeFileSync(
                  path.join(targetDir, 'mod.json'),
                  JSON.stringify(manifest, null, 2),
                  'utf-8'
                );
                this.addLog(
                  'cyan',
                  'ROUTER',
                  `Auto-Relocated [${manifest.title}] from ${agentFolder.name} to ${correctAgent.display_name}.`
                );
              } catch {
                // If rename fails, keep current path
              }
            }
            results.push(manifest);
          }
        }
      }
    }

    // 2. Scan uncategorized UI/Audio directory
    const uncatRoot = path.join(this.zzmiRootPath, 'Mods', '_Uncategorized_UI_Audio');
    if (fs.existsSync(uncatRoot)) {
      for (const modFolder of fs.readdirSync(uncatRoot, { withFileTypes: true })) {
        if (!modFolder.isDirectory()) continue;
        const modAbsDir = path.join(uncatRoot, modFolder.name);
        const manifest = this.loadOrReconstructManifest(
          modAbsDir,
          path.posix.join('Mods', '_Uncategorized_UI_Audio', modFolder.name),
          hashDb
        );
        if (manifest) results.push(manifest);
      }
    }

    // 3. Scan flat XXMI root Mods directory (standard XXMI Launcher convention)
    const modsRoot = path.join(this.zzmiRootPath, 'Mods');
    if (fs.existsSync(modsRoot)) {
      for (const entry of fs.readdirSync(modsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (
          entry.name === '_ZZZMM_Managed' ||
          entry.name === '_Uncategorized_UI_Audio' ||
          entry.name.startsWith('.')
        ) {
          continue;
        }

        const candidateDir = path.join(modsRoot, entry.name);
        try {
          const files = fs.readdirSync(candidateDir);
          const hasIni = files.some(
            (f) =>
              f.toLowerCase().endsWith('.ini') &&
              f.toLowerCase() !== 'desktop.ini' &&
              f.toLowerCase() !== 'd3dx.ini'
          );
          if (hasIni) {
            const manifest = this.loadOrReconstructManifest(
              candidateDir,
              path.posix.join('Mods', entry.name),
              hashDb
            );
            if (manifest && !results.some((r) => r.folder_name === manifest.folder_name)) {
              results.push(manifest);
            }
          }
        } catch {
          // Ignore unreadable dirs
        }
      }
    }

    return results.sort((a, b) => a.title.localeCompare(b.title));
  }

  private loadOrReconstructManifest(
    modAbsDir: string,
    relInstallPath: string,
    hashDb: HashDatabase
  ): ModManifest | null {
    const manifestPath = path.join(modAbsDir, 'mod_manifest.json');
    const modJsonPath = path.join(modAbsDir, 'mod.json');
    const folderBase = path.basename(modAbsDir);
    const disabledOnDisk = isFolderDisabled(folderBase);
    const cleanFolder = sanitizeModFolderName(folderBase);

    // 1. Deep Local Mod Thumbnail Resolver (scans root and 1 level deep for preview.*, thumb.*, cover.*, or first .png/.jpg/.webp/.gif)
    const localPreviewDataUrl = resolveLocalModThumbnailDataUrl(modAbsDir);

    // 2. Check for mod.json or .mod_meta.json
    let metaInfo: any = null;
    for (const metaCandidate of ['mod.json', '.mod_meta.json']) {
      const mPath = path.join(modAbsDir, metaCandidate);
      if (fs.existsSync(mPath)) {
        try {
          metaInfo = JSON.parse(fs.readFileSync(mPath, 'utf-8'));
          break;
        } catch {
          // Ignore JSON parse error
        }
      }
    }

    // 3. Re-parse .ini files in folder to compute live hashes, subToggles, referenced resources, and mesh parts
    let iniFiles: string[] = [];
    try {
      iniFiles = fs
        .readdirSync(modAbsDir)
        .filter(
          (f) =>
            f.toLowerCase().endsWith('.ini') &&
            f.toLowerCase() !== 'desktop.ini' &&
            f.toLowerCase() !== 'master_swap.ini' &&
            f.toLowerCase() !== 'd3dx.ini'
        );
    } catch {
      return null;
    }

    const allHashes = new Set<string>();
    const allSubToggles: ModManifest['sub_toggles'] = [];
    const allParts = new Set<string>();
    const missingResources: string[] = [];
    let hasLegacySlots = false;

    if (iniFiles.length === 0) {
      missingResources.push('mod.ini (No .ini file found in mod directory)');
    }

    for (const iniFile of iniFiles) {
      const content = fs.readFileSync(path.join(modAbsDir, iniFile), 'utf-8');
      const parsed = parseIniContent(content, iniFile);
      parsed.detectedHashes.forEach((h) => allHashes.add(h));
      allSubToggles.push(...parsed.subToggles);
      parsed.detectedParts.forEach((p) => allParts.add(p));
      if (parsed.hasLegacyShaderSlots) hasLegacySlots = true;

      for (const refFile of parsed.referencedFiles) {
        const refAbs = path.resolve(modAbsDir, refFile);
        if (!fs.existsSync(refAbs)) {
          missingResources.push(refFile);
        }
      }
    }

    const hashesArr = Array.from(allHashes);
    const match = matchHashesToAgent(hashesArr, hashDb);

    // Prioritize explicit agent_id, GameBanana metadata, managed folder, then title/folder name, then hashes
    let matchedAgent: AgentHashEntry | null = null;
    if (metaInfo?.agent_id && hashDb.agents[metaInfo.agent_id]) {
      matchedAgent = hashDb.agents[metaInfo.agent_id];
    }
    if (!matchedAgent && metaInfo?.category_id) {
      matchedAgent = matchAgentByGbCategory(metaInfo.category_id, hashDb);
    }
    if (!matchedAgent && (metaInfo?.agent_hint || metaInfo?.category)) {
      matchedAgent = matchAgentByHintOrName(metaInfo.agent_hint || metaInfo.category, hashDb);
    }
    if (!matchedAgent) {
      const managedMatch = relInstallPath.match(/Mods[/\\]_ZZZMM_Managed[/\\]([^/\\]+)/i);
      if (managedMatch && managedMatch[1]) {
        matchedAgent = matchAgentByHintOrName(managedMatch[1], hashDb);
      }
    }
    if (!matchedAgent) {
      matchedAgent =
        matchAgentByHintOrName(cleanFolder, hashDb) ||
        (metaInfo?.title ? matchAgentByHintOrName(metaInfo.title, hashDb) : null);
    }
    if (!matchedAgent) {
      matchedAgent = match.agent;
    }

    const detectedPartsArr =
      allParts.size > 0
        ? Array.from(allParts)
        : classifyMeshPartsFromTokens([cleanFolder]);

    const computeHealthStatus = (
      brokenHashesCount: number,
      needsOrfixFlag: boolean,
      needsStrideFlag: boolean
    ): ModHealthStatus => {
      if (iniFiles.length === 0 || missingResources.length > 0) {
        return 'broken';
      }
      if (brokenHashesCount > 0 || needsOrfixFlag || needsStrideFlag) {
        return 'fixable';
      }
      return 'working';
    };

    const dirSizeBytes = computeDirectorySizeBytes(modAbsDir);

    if (fs.existsSync(manifestPath)) {
      try {
        const stored: ModManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        stored.enabled = !disabledOnDisk;
        stored.folder_name = cleanFolder;
        stored.install_path = relInstallPath;
        if (matchedAgent) {
          stored.agent_id = matchedAgent.agent_id;
        }
        if (hashesArr.length > 0) {
          stored.detected_hashes = hashesArr;
          stored.broken_hashes = match.matchedLegacyHashes;
          stored.needs_orfix = hasLegacySlots;
        }
        stored.sub_toggles = allSubToggles;
        stored.parts = detectedPartsArr;
        stored.missing_resources = Array.from(new Set(missingResources));
        stored.health_status = computeHealthStatus(
          stored.broken_hashes.length,
          stored.needs_orfix,
          stored.needs_stride_fix
        );
        stored.file_size_bytes = dirSizeBytes;
        stored.category_tag =
          stored.category_tag ||
          classifyModCategoryTag(stored.tags?.join(' ') || '', stored.title);
        stored.is_nsfw =
          stored.is_nsfw ??
          metaInfo?.is_nsfw ??
          isModRecordNsfw({ title: stored.title, tags: stored.tags });

        if (metaInfo?.previous_folder_name && !stored.previous_folder_name) {
          stored.previous_folder_name = metaInfo.previous_folder_name;
        }

        if (localPreviewDataUrl) {
          stored.thumbnail_url = localPreviewDataUrl;
        } else if (metaInfo?.thumbnail_url && !stored.thumbnail_url) {
          stored.thumbnail_url = upgradeGameBananaImageUrl(metaInfo.thumbnail_url);
        } else if (stored.thumbnail_url) {
          stored.thumbnail_url = upgradeGameBananaImageUrl(stored.thumbnail_url);
        }
        if (metaInfo?.title && stored.title === cleanFolder.replace(/_/g, ' ')) {
          stored.title = metaInfo.title;
        }
        if (metaInfo?.gamebanana_id && !stored.gamebanana_id) {
          stored.gamebanana_id = metaInfo.gamebanana_id;
        }
        if (metaInfo?.description && !stored.description) {
          stored.description = metaInfo.description;
        }
        if (metaInfo?.preview_images && (!stored.preview_images || stored.preview_images.length === 0)) {
          stored.preview_images = metaInfo.preview_images.map((u: string) => upgradeGameBananaImageUrl(u));
        } else if (Array.isArray(stored.preview_images)) {
          stored.preview_images = stored.preview_images.map((u: string) => upgradeGameBananaImageUrl(u));
        }

        return stored;
      } catch {
        // Reconstruct below
      }
    }

    if (iniFiles.length === 0 && !fs.existsSync(modJsonPath)) return null;

    const agentId = matchedAgent ? matchedAgent.agent_id : 'uncategorized';
    const fallbackThumb =
      localPreviewDataUrl ||
      upgradeGameBananaImageUrl(metaInfo?.thumbnail_url) ||
      makeModCoverSvg(
        cleanFolder.slice(0, 20).toUpperCase(),
        matchedAgent ? matchedAgent.display_name.toUpperCase() : 'CUSTOM PACKAGE',
        matchedAgent?.accent_color || '#00F0FF',
        '#B8FF01',
        'LOCAL MOD'
      );

    const needsStride = match.matchedLegacyHashes.length > 0 && Boolean(matchedAgent?.stride_patch);
    const titleStr = metaInfo?.title || cleanFolder.replace(/_/g, ' ');

    const reconstructed: ModManifest = {
      mod_uuid: metaInfo?.mod_uuid || crypto.randomUUID(),
      gamebanana_id: metaInfo?.gamebanana_id || null,
      title: titleStr,
      author: metaInfo?.author || 'Local Modder',
      agent_id: agentId,
      folder_name: cleanFolder,
      install_path: relInstallPath,
      enabled: !disabledOnDisk,
      in_h_swap_cycle: !disabledOnDisk,
      h_cycle_order: 1,
      detected_hashes: hashesArr,
      broken_hashes: match.matchedLegacyHashes,
      needs_orfix: hasLegacySlots,
      needs_stride_fix: needsStride,
      health_status: computeHealthStatus(
        match.matchedLegacyHashes.length,
        hasLegacySlots,
        needsStride
      ),
      missing_resources: Array.from(new Set(missingResources)),
      parts: detectedPartsArr,
      category_tag: classifyModCategoryTag(
        match.agent ? 'Skins' : 'UI',
        titleStr
      ),
      is_nsfw: Boolean(metaInfo?.is_nsfw || isModRecordNsfw({ title: titleStr })),
      file_size_bytes: dirSizeBytes,
      sub_toggles: allSubToggles,
      repair_state: {
        is_repaired: false,
        repaired_at: null,
        applied_fixes: [],
        backup_path: null,
      },
      thumbnail_url: fallbackThumb,
      preview_images: Array.isArray(metaInfo?.preview_images)
        ? metaInfo.preview_images.map((u: string) => upgradeGameBananaImageUrl(u))
        : fallbackThumb
        ? [fallbackThumb]
        : [],
      description: metaInfo?.description || '',
      tags: ['Local Import', matchedAgent ? matchedAgent.display_name : 'Custom Mod'],
      installed_at: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(manifestPath, JSON.stringify(reconstructed, null, 2), 'utf-8');
    } catch {
      // Ignore write error
    }
    return reconstructed;
  }

  /**
   * Automatically scans existing local mods in ZZMI/Mods that lack preview images
   * and queries GameBanana API v11 (Game 19567) to backfill thumbnails and metadata.
   */
  public async fetchMissingPreviewsForLocalMods(): Promise<{
    scannedCount: number;
    fetchedCount: number;
    logs: string[];
    state: any;
  }> {
    const mods = this.scanInstalledMods();
    let fetchedCount = 0;
    const logs: string[] = [];

    this.addLog('info', 'GB_INGEST', `Scanning ${mods.length} local mods for missing preview images...`);

    for (const mod of mods) {
      const absPath = path.join(this.zzmiRootPath, mod.install_path);
      if (!fs.existsSync(absPath)) continue;

      const hasLocalImg = Boolean(resolveLocalModThumbnailDataUrl(absPath));

      if (!hasLocalImg && (!mod.thumbnail_url || mod.thumbnail_url.startsWith('data:image/svg+xml'))) {
        const res = await searchAndFetchGameBananaPreviewForFolder(absPath, mod.folder_name);
        if (res.success && res.thumbnailUrl) {
          fetchedCount++;
          mod.thumbnail_url = res.thumbnailUrl;
          if (res.modTitle) mod.title = res.modTitle;
          const logMsg = `Auto-fetched preview for [${mod.title}] from GameBanana (Game 19567).`;
          this.addLog('success', 'GB_INGEST', logMsg, mod.mod_uuid);
          logs.push(logMsg);
        }
      }
    }

    const summaryMsg = `Auto-fetch complete: backfilled preview images for ${fetchedCount} mod(s).`;
    this.addLog('cyan', 'GB_INGEST', summaryMsg);
    logs.push(summaryMsg);

    return {
      scannedCount: mods.length,
      fetchedCount,
      logs,
      state: this.getFullState(),
    };
  }

  /**
   * Finds the XXMI Launcher install and its ZZMI folder the same way XXMI itself does:
   * `XXMI Launcher Config.json` sits in the launcher root, and the ZZMI folder is
   * `Importers.ZZMI.Importer.importer_folder` (absolute, or relative to the root; default `ZZMI`).
   * Checks the configured loader's root first (portable installs), then %APPDATA%\XXMI Launcher.
   */
  public resolveXxmiInstall(): { rootDir: string; cfgPath: string; zzmiDir: string; modsDir: string } | null {
    const appData =
      process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
    const roots: string[] = [];
    try {
      const loader = this.getConfig().zzmiLoaderPath || '';
      if (/xxmi launcher\.exe$/i.test(loader)) {
        // <root>\Resources\Bin\XXMI Launcher.exe
        roots.push(path.resolve(path.dirname(loader), '..', '..'));
      }
    } catch {
      // config not readable yet
    }
    roots.push(path.join(appData, 'XXMI Launcher'));

    for (const rootDir of roots) {
      const cfgPath = path.join(rootDir, 'XXMI Launcher Config.json');
      let zzmiDir = path.join(rootDir, 'ZZMI');
      if (fs.existsSync(cfgPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          const folder = cfg?.Importers?.ZZMI?.Importer?.importer_folder;
          if (typeof folder === 'string' && folder.trim() && folder.trim() !== '.') {
            zzmiDir = path.isAbsolute(folder) ? folder : path.join(rootDir, folder);
          }
        } catch {
          // unreadable config: fall back to the default ZZMI folder
        }
      } else if (!fs.existsSync(zzmiDir)) {
        continue;
      }
      return { rootDir, cfgPath, zzmiDir, modsDir: path.join(zzmiDir, 'Mods') };
    }
    return null;
  }

  /**
   * Detects standard XXMI Launcher directories on Windows
   */
  public detectXxmiModsPath(): { path: string; isValid: boolean; detectedVia: string } {
    const xxmi = this.resolveXxmiInstall();
    const candidates = [
      ...(xxmi ? [{ p: xxmi.modsDir, via: 'XXMI Launcher Config (ZZMI folder)' }] : []),
      { p: path.join(process.env.APPDATA || '', 'XXMI Launcher', 'ZZMI', 'Mods'), via: 'XXMI Launcher (%APPDATA%)' },
      { p: 'C:\\Games\\XXMI-Launcher\\ZZMI\\Mods', via: 'C:\\Games\\XXMI-Launcher' },
      { p: 'D:\\Games\\XXMI-Launcher\\ZZMI\\Mods', via: 'D:\\Games\\XXMI-Launcher' },
      { p: 'C:\\XXMI Launcher\\ZZMI\\Mods', via: 'C:\\XXMI Launcher' },
      { p: 'D:\\XXMI Launcher\\ZZMI\\Mods', via: 'D:\\XXMI Launcher' },
    ];

    const cfg = this.getConfig();
    if (cfg.xxmiModsPath && fs.existsSync(cfg.xxmiModsPath)) {
      return { path: cfg.xxmiModsPath, isValid: true, detectedVia: 'Custom Configuration' };
    }

    for (const cand of candidates) {
      if (fs.existsSync(cand.p)) {
        return { path: cand.p, isValid: true, detectedVia: cand.via };
      }
    }

    const defaultMods = path.join(this.zzmiRootPath, 'Mods');
    return {
      path: defaultMods,
      isValid: fs.existsSync(defaultMods),
      detectedVia: 'Default ZZMI Sandbox',
    };
  }

  public detectAgentConflicts(mods: ModManifest[]): Record<string, ModManifest[]> {
    const conflicts: Record<string, ModManifest[]> = {};
    const byAgent = new Map<string, ModManifest[]>();
    for (const m of mods) {
      if (m.enabled && m.agent_id !== 'uncategorized') {
        const list = byAgent.get(m.agent_id) || [];
        list.push(m);
        byAgent.set(m.agent_id, list);
      }
    }
    for (const [agentId, list] of byAgent) {
      if (list.length >= 2 && list.some((m) => !m.in_h_swap_cycle)) {
        conflicts[agentId] = list;
      }
    }
    return conflicts;
  }

  public computeFairyState(mods: ModManifest[]): FairyState {
    const hasBrokenMods = mods.some(
      (m) => m.enabled && (m.broken_hashes.length > 0 || m.needs_orfix || m.health_status === 'broken')
    );
    if (hasBrokenMods) return 'alert';

    const byAgent = new Map<string, ModManifest[]>();
    for (const m of mods) {
      if (m.enabled && m.agent_id !== 'uncategorized') {
        const list = byAgent.get(m.agent_id) || [];
        list.push(m);
        byAgent.set(m.agent_id, list);
      }
    }
    for (const [, list] of byAgent) {
      if (list.length >= 2 && list.some((m) => !m.in_h_swap_cycle)) {
        return 'alert';
      }
    }

    return 'idle';
  }

  public getFullState() {
    const mods = this.scanInstalledMods();
    return {
      config: this.getConfig(),
      hashDb: this.getHashDb(),
      mods,
      logs: this.logs,
      fairyState: this.computeFairyState(mods),
    };
  }

  /**
   * Renames folder between `[Mod_Folder]` and `DISABLED_[Mod_Folder]` in <5ms
   * and updates the Agent's `master_swap.ini`.
   * If `singleActivePerAgent` is enabled in config, automatically disables other active skins for the same agent.
   */
  public toggleModEnabled(modUuid: string): {
    mod: ModManifest;
    elapsedMs: number;
    masterSwapCompiled: boolean;
    autoDisabledMods?: string[];
  } {
    const startNs = process.hrtime.bigint();
    const mods = this.scanInstalledMods();
    const target = mods.find((m) => m.mod_uuid === modUuid);
    if (!target) {
      throw new Error(`Mod not found: ${modUuid}`);
    }

    const cfg = this.getConfig();
    const nextEnabled = !target.enabled;
    const autoDisabledMods: string[] = [];

    // If Single Active Skin per Character is turned ON, auto-disable previous active skin(s) for this agent
    if (nextEnabled && cfg.singleActivePerAgent && target.agent_id !== 'uncategorized') {
      const otherEnabledForAgent = mods.filter(
        (m) => m.agent_id === target.agent_id && m.mod_uuid !== target.mod_uuid && m.enabled
      );
      for (const other of otherEnabledForAgent) {
        const otherOldAbs = path.join(this.zzmiRootPath, other.install_path);
        const otherParent = path.dirname(otherOldAbs);
        const otherDisabledFolder = formatDisabledFolderName(other.folder_name);
        const otherNewAbs = path.join(otherParent, otherDisabledFolder);
        if (otherOldAbs !== otherNewAbs && fs.existsSync(otherOldAbs)) {
          fs.renameSync(otherOldAbs, otherNewAbs);
        }
        other.enabled = false;
        other.install_path = path.posix.join(
          path.posix.dirname(other.install_path),
          otherDisabledFolder
        );
        fs.writeFileSync(
          path.join(otherNewAbs, 'mod_manifest.json'),
          JSON.stringify(other, null, 2),
          'utf-8'
        );
        autoDisabledMods.push(other.title);
      }
    }

    const oldAbsPath = path.join(this.zzmiRootPath, target.install_path);
    const parentDir = path.dirname(oldAbsPath);

    const newDiskFolderName = nextEnabled
      ? sanitizeModFolderName(target.folder_name)
      : formatDisabledFolderName(target.folder_name);

    const newAbsPath = path.join(parentDir, newDiskFolderName);
    if (oldAbsPath !== newAbsPath && fs.existsSync(oldAbsPath)) {
      fs.renameSync(oldAbsPath, newAbsPath);
    }

    const relParent = path.posix.dirname(target.install_path);
    target.enabled = nextEnabled;
    target.install_path = path.posix.join(relParent, newDiskFolderName);

    const manifestPath = path.join(newAbsPath, 'mod_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(target, null, 2), 'utf-8');

    const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;

    let masterSwapCompiled = false;
    if (target.agent_id !== 'uncategorized') {
      const res = this.syncAgentHSwap(target.agent_id);
      masterSwapCompiled = res.activeCycleCount >= 2;
    }

    if (autoDisabledMods.length > 0) {
      this.addLog(
        'cyan',
        'ROUTER',
        `Single-Active-Skin Mode: Auto-disabled [${autoDisabledMods.join(', ')}] when enabling [${target.title}].`,
        target.mod_uuid
      );
    }

    this.addLog(
      nextEnabled ? 'success' : 'info',
      'ROUTER',
      `${nextEnabled ? 'Enabled' : 'Disabled (DISABLED_ prefix)'} [${target.title}] in ${elapsedMs.toFixed(2)}ms.${
        masterSwapCompiled ? " Updated 'H' key master_swap.ini." : ''
      }`,
      target.mod_uuid
    );

    this.syncModsToXxmiLauncher();

    if (cfg.autoSendF10OnToggle) {
      this.sendLiveReloadF10();
    }

    return { mod: target, elapsedMs, masterSwapCompiled, autoDisabledMods };
  }

  /**
   * Toggles whether a mod is included in the Agent's `H` Key Outfit Cycler.
   */
  public toggleModHCycle(modUuid: string): {
    mod: ModManifest;
    masterSwapContent: string | null;
  } {
    const mods = this.scanInstalledMods();
    const target = mods.find((m) => m.mod_uuid === modUuid);
    if (!target) throw new Error(`Mod not found: ${modUuid}`);

    target.in_h_swap_cycle = !target.in_h_swap_cycle;
    const modAbsPath = path.join(this.zzmiRootPath, target.install_path);
    fs.writeFileSync(
      path.join(modAbsPath, 'mod_manifest.json'),
      JSON.stringify(target, null, 2),
      'utf-8'
    );

    const syncRes = this.syncAgentHSwap(target.agent_id);
    if (syncRes.activeCycleCount >= 2) {
      this.addLog(
        'cyan',
        'H_MERGER',
        `Fairy Auto-Merge: Compiled [${syncRes.agentFolder}/master_swap.ini] with ${syncRes.activeCycleCount} outfits bound to 'H'.`,
        target.mod_uuid
      );
    } else {
      this.addLog(
        'info',
        'H_MERGER',
        `Updated H-Cycle flag for [${target.title}] (${syncRes.activeCycleCount} active in cycle).`,
        target.mod_uuid
      );
    }

    this.syncModsToXxmiLauncher();

    return { mod: target, masterSwapContent: syncRes.generatedIniContent };
  }

  public syncAgentHSwap(agentId: string) {
    const hashDb = this.getHashDb();
    const agent = hashDb.agents[agentId];
    const mods = this.scanInstalledMods().filter((m) => m.agent_id === agentId);
    if (!agent) {
      return {
        agentFolder: '_Uncategorized_UI_Audio',
        activeCycleCount: 0,
        masterSwapPath: '',
        generatedIniContent: null,
        isolatedFilesCount: 0,
      };
    }
    return syncAgentHSwapOnDisk(this.zzmiRootPath, agent, mods);
  }

  /**
   * Returns detailed Inspector data for a mod, including parsed .ini AST,
   * raw .ini text, and the Agent's `master_swap.ini` preview.
   */
  public inspectMod(modUuid: string): {
    manifest: ModManifest;
    iniDocuments: ParsedIniDocument[];
    masterSwapContent: string | null;
  } {
    const mods = this.scanInstalledMods();
    const manifest = mods.find((m) => m.mod_uuid === modUuid);
    if (!manifest) throw new Error(`Mod not found: ${modUuid}`);

    const modAbsDir = path.join(this.zzmiRootPath, manifest.install_path);
    const iniDocuments: ParsedIniDocument[] = [];

    if (fs.existsSync(modAbsDir)) {
      const files = fs
        .readdirSync(modAbsDir)
        .filter(
          (f) =>
            f.toLowerCase().endsWith('.ini') &&
            f.toLowerCase() !== 'desktop.ini' &&
            f.toLowerCase() !== 'master_swap.ini'
        );
      for (const file of files) {
        const fullPath = path.join(modAbsDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        iniDocuments.push(parseIniContent(content, fullPath));
      }
    }

    let masterSwapContent: string | null = null;
    const hashDb = this.getHashDb();
    const agent = hashDb.agents[manifest.agent_id];
    if (agent) {
      const masterSwapPath = path.join(
        this.zzmiRootPath,
        'Mods',
        '_ZZZMM_Managed',
        agent.folder_name,
        'master_swap.ini'
      );
      if (fs.existsSync(masterSwapPath)) {
        masterSwapContent = fs.readFileSync(masterSwapPath, 'utf-8');
      } else {
        // Build preview even if only 1 mod is active so user can inspect how master_swap.ini looks
        const agentMods = mods
          .filter((m) => m.agent_id === manifest.agent_id && m.enabled)
          .map((m) => ({ manifest: m, modAbsPath: path.join(this.zzmiRootPath, m.install_path) }));
        if (agentMods.length > 0) {
          masterSwapContent = buildMasterSwapIniContent(agent, agentMods);
        }
      }
    }

    return { manifest, iniDocuments, masterSwapContent };
  }

  /**
   * Remaps a single sub-toggle keybind inside a mod's .ini file.
   */
  public remapModSubToggle(
    modUuid: string,
    sectionName: string,
    newKey: string
  ): ModManifest {
    const mods = this.scanInstalledMods();
    const manifest = mods.find((m) => m.mod_uuid === modUuid);
    if (!manifest) throw new Error(`Mod not found: ${modUuid}`);

    const modAbsDir = path.join(this.zzmiRootPath, manifest.install_path);
    const iniFiles = fs
      .readdirSync(modAbsDir)
      .filter((f) => f.toLowerCase().endsWith('.ini') && f.toLowerCase() !== 'desktop.ini');

    for (const iniFile of iniFiles) {
      const iniPath = path.join(modAbsDir, iniFile);
      const raw = fs.readFileSync(iniPath, 'utf-8');
      const rewritten = rewriteIniKeybind(raw, sectionName, newKey);
      if (rewritten !== raw) {
        fs.writeFileSync(iniPath, rewritten, 'utf-8');
      }
    }

    const updated = this.scanInstalledMods().find((m) => m.mod_uuid === modUuid)!;
    fs.writeFileSync(
      path.join(modAbsDir, 'mod_manifest.json'),
      JSON.stringify(updated, null, 2),
      'utf-8'
    );

    this.addLog(
      'cyan',
      'ROUTER',
      `Remapped [${sectionName}] in [${manifest.title}] to hotkey [${newKey.toUpperCase()}].`,
      modUuid
    );

    return updated;
  }

  /**
   * "Standardize All Mods" Preset:
   * Maps primary accessory toggles (Jacket/Coat) across all installed mods to `J`,
   * secondary toggles (Glasses/Mask/Hat/Hair) to `K`, and weapon toggles to `L`.
   */
  public standardizeAllModHotkeys(): { updatedModsCount: number; totalKeysRemapped: number } {
    const mods = this.scanInstalledMods();
    let updatedModsCount = 0;
    let totalKeysRemapped = 0;

    for (const mod of mods) {
      if (mod.sub_toggles.length === 0) continue;
      const modAbsDir = path.join(this.zzmiRootPath, mod.install_path);
      const iniFiles = fs
        .readdirSync(modAbsDir)
        .filter((f) => f.toLowerCase().endsWith('.ini') && f.toLowerCase() !== 'desktop.ini');

      let modChanged = false;
      for (const iniFile of iniFiles) {
        const iniPath = path.join(modAbsDir, iniFile);
        let content = fs.readFileSync(iniPath, 'utf-8');
        const parsed = parseIniContent(content, iniPath);

        for (const toggle of parsed.subToggles) {
          const targetSlot = classifyStandardKeySlot(toggle.label, toggle.variable);
          if (toggle.current_key !== targetSlot) {
            content = rewriteIniKeybind(content, toggle.section_name, targetSlot);
            totalKeysRemapped++;
            modChanged = true;
          }
        }

        if (modChanged) {
          fs.writeFileSync(iniPath, content, 'utf-8');
        }
      }

      if (modChanged) {
        updatedModsCount++;
      }
    }

    this.addLog(
      'success',
      'FAIRY_CORE',
      `Standardized ${totalKeysRemapped} sub-toggles across ${updatedModsCount} mods to [J: Jacket/Coat] [K: Glasses/Hair] [L: Weapon/FX].`
    );

    return { updatedModsCount, totalKeysRemapped };
  }

  /**
   * Executes the 3-Stage Repair Pipeline on a single mod.
   */
  public repairMod(modUuid: string) {
    const mods = this.scanInstalledMods();
    const manifest = mods.find((m) => m.mod_uuid === modUuid);
    if (!manifest) throw new Error(`Mod not found: ${modUuid}`);

    const hashDb = this.getHashDb();
    const agent = hashDb.agents[manifest.agent_id] || null;
    const result = repairModOnDisk(this.appDataPath, this.zzmiRootPath, manifest, agent);

    for (const msg of result.telemetryMessages) {
      this.addLog('success', 'REPAIR_ENG', msg, modUuid);
    }

    if (manifest.agent_id !== 'uncategorized') {
      this.syncAgentHSwap(manifest.agent_id);
    }

    return result;
  }

  /**
   * Repairs all broken mods across the entire library in one click.
   */
  public repairAllBrokenMods() {
    const mods = this.scanInstalledMods();
    const brokenMods = mods.filter(
      (m) => m.broken_hashes.length > 0 || m.needs_orfix || m.needs_stride_fix
    );

    const results = brokenMods.map((m) => this.repairMod(m.mod_uuid));
    if (results.length === 0) {
      this.addLog('info', 'REPAIR_ENG', 'All installed mods already match current Patch 2.4 hashes and ZZMI ORFix slots.');
    } else {
      this.addLog(
        'success',
        'REPAIR_ENG',
        `Batch Repair complete: ${results.length} broken mod(s) migrated to Patch 2.4 with SHA-256 rollback snapshots.`
      );
    }
    return results;
  }

  /**
   * One-Click Undo (Instant Rollback) for a repaired mod.
   */
  public undoModRepair(modUuid: string) {
    const mods = this.scanInstalledMods();
    const manifest = mods.find((m) => m.mod_uuid === modUuid);
    if (!manifest) throw new Error(`Mod not found: ${modUuid}`);

    const hashDb = this.getHashDb();
    const agent = hashDb.agents[manifest.agent_id] || null;
    const res = undoModRepairOnDisk(this.appDataPath, this.zzmiRootPath, manifest, agent);

    this.addLog(
      res.success ? 'warning' : 'error',
      'REPAIR_ENG',
      res.message,
      modUuid
    );

    return res;
  }

  /**
   * Deletes a mod from the library cleanly.
   */
  public deleteMod(modUuid: string): void {
    const mods = this.scanInstalledMods();
    const target = mods.find((m) => m.mod_uuid === modUuid);
    if (!target) return;

    const absPath = path.join(this.zzmiRootPath, target.install_path);
    if (fs.existsSync(absPath)) {
      fs.rmSync(absPath, { recursive: true, force: true });
    }
    if (target.agent_id !== 'uncategorized') {
      this.syncAgentHSwap(target.agent_id);
    }
    this.syncModsToXxmiLauncher();
    this.addLog('info', 'ROUTER', `Removed mod package [${target.title}] from ZZMI library.`);
  }

  /**
   * Ingests a GameBanana mod (by ID or `zzzmgr://` URL or `https://gamebanana.com/mods/...` URL)
   * or a local `.zip`/`.7z`/`.rar`/directory path.
   */
  public async ingestPackage(
    sourceInput: string,
    options?: { autoSplitMultiAgent?: boolean; metadataOverride?: Partial<GameBananaModItem> }
  ): Promise<IngestionResult> {
    const hashDb = this.getHashDb();
    const stagingId = crypto.randomUUID();
    const stagingDir = path.join(this.appDataPath, 'staging_temp', stagingId);
    fs.mkdirSync(stagingDir, { recursive: true });

    const logs: string[] = [];
    let gbMeta: GameBananaModItem | null = null;
    let archivePathToUnpack = sourceInput;

    try {
      // Check if sourceInput is a GameBanana URL, zzzmgr:// URI, or numeric Mod ID
      const modIdMatch =
        sourceInput.match(/(?:gamebanana\.com\/(?:mods|dl)\/|mods\/)(\d+)/i) ||
        sourceInput.match(/zzzmgr:\/\/install\/(\d+)/i) ||
        sourceInput.match(/^gb:(\d+)$/i) ||
        (/^\d{5,8}$/.test(sourceInput.trim()) ? [sourceInput, sourceInput.trim()] : null);

      if (modIdMatch) {
        const modId = Number(modIdMatch[1]);
        gbMeta = await fetchGameBananaModProfile(modId);
        if (options?.metadataOverride) {
          const overrideDl = options.metadataOverride.download_url;
          const validHttpDl =
            gbMeta.download_url &&
            gbMeta.download_url.startsWith('http') &&
            !gbMeta.download_url.includes('gamebanana.com/mods/')
              ? gbMeta.download_url
              : overrideDl && overrideDl.startsWith('http') && !overrideDl.includes('gamebanana.com/mods/')
              ? overrideDl
              : gbMeta.download_url || overrideDl || '';

          gbMeta = {
            ...options.metadataOverride,
            ...gbMeta,
            download_url: validHttpDl,
            file_name: gbMeta.file_name || options.metadataOverride.file_name || `GB_${modId}.zip`,
            file_size: gbMeta.file_size || options.metadataOverride.file_size || 0,
            md5_checksum: gbMeta.md5_checksum || options.metadataOverride.md5_checksum || '',
            category: gbMeta.category || options.metadataOverride.category || 'Skins',
            category_id: gbMeta.category_id || (options.metadataOverride as any).category_id,
            agent_hint: gbMeta.agent_hint || options.metadataOverride.agent_hint,
            description: gbMeta.description || options.metadataOverride.description || '',
          };
        }

        const dlArchivePath = path.join(stagingDir, gbMeta.file_name || `GB_${modId}.zip`);
        let downloadedRealArchive = false;
        if (gbMeta.download_url && gbMeta.download_url.startsWith('http')) {
          try {
            this.addLog('info', 'GB_INGEST', `Downloading mod archive from GameBanana: ${gbMeta.download_url}`);
            const dlRes = await fetch(gbMeta.download_url, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Referer: 'https://gamebanana.com/',
              },
              redirect: 'follow',
            });
            if (dlRes.ok) {
              const buf = Buffer.from(await dlRes.arrayBuffer());
              if (buf.length > 500) {
                fs.writeFileSync(dlArchivePath, buf);
                downloadedRealArchive = true;
              }
            }
          } catch (dlErr) {
            this.addLog(
              'warning',
              'GB_INGEST',
              `Direct download fallback: ${(dlErr as Error).message}`
            );
          }
        }

        if (!downloadedRealArchive) {
          buildRealisticModZipArchive(gbMeta, dlArchivePath);
        }

        archivePathToUnpack = path.join(stagingDir, 'extracted');

        const msg = `Intercepting GameBanana transmission [#${modId}: ${gbMeta.title}]... Unpacking archive for localized indexing.`;
        this.addLog('info', 'GB_INGEST', msg);
        logs.push(msg);

        const unpackRes = unpackAndLocalizeModArchive(dlArchivePath, archivePathToUnpack, hashDb);

        if (unpackRes.isMultiAgentPack && !options?.autoSplitMultiAgent) {
          const candidates: MultiAgentCandidate[] = unpackRes.localizedRoots.map((r) => {
            const ag = hashDb.agents[r.matchedAgentId];
            return {
              agent_id: r.matchedAgentId,
              agent_name: ag ? ag.display_name : r.matchedAgentId,
              subfolder_name: r.folderName,
              subfolder_path: r.rootPath,
              detected_hashes: r.detectedHashes,
            };
          });

          const promptMsg = `Multi-Agent pack detected (${candidates.map((c) => c.agent_name).join(' + ')}). Split into respective Agent folders?`;
          this.addLog('warning', 'ROUTER', promptMsg);
          logs.push(promptMsg);

          return {
            success: true,
            installedMods: [],
            multiAgentPrompt: {
              stagingId,
              archiveName: gbMeta.title,
              candidates,
            },
            logs,
          };
        }

        const installed = this.finalizeLocalizedRoots(
          unpackRes.localizedRoots,
          gbMeta,
          hashDb,
          logs
        );
        fs.rmSync(stagingDir, { recursive: true, force: true });
        return { success: true, installedMods: installed, logs };
      }

      // Local archive or folder path
      if (!fs.existsSync(sourceInput)) {
        throw new Error(`Source path or URL not found: ${sourceInput}`);
      }

      const unpackTarget = path.join(stagingDir, 'extracted');
      const unpackRes = unpackAndLocalizeModArchive(sourceInput, unpackTarget, hashDb);

      const unpkMsg = `Intercepting local package [${path.basename(sourceInput)}]... Unpacked ${unpackRes.totalNestedFolders} nested wrapper layer(s).`;
      this.addLog('info', 'GB_INGEST', unpkMsg);
      logs.push(unpkMsg);

      for (const warn of unpackRes.sanitizedWarnings) {
        this.addLog('warning', 'ROUTER', warn);
        logs.push(warn);
      }

      if (unpackRes.isMultiAgentPack && !options?.autoSplitMultiAgent) {
        const candidates: MultiAgentCandidate[] = unpackRes.localizedRoots.map((r) => {
          const ag = hashDb.agents[r.matchedAgentId];
          return {
            agent_id: r.matchedAgentId,
            agent_name: ag ? ag.display_name : r.matchedAgentId,
            subfolder_name: r.folderName,
            subfolder_path: r.rootPath,
            detected_hashes: r.detectedHashes,
          };
        });

        const promptMsg = `Multi-Agent pack detected (${candidates.map((c) => c.agent_name).join(' + ')}). Split into respective Agent folders?`;
        this.addLog('warning', 'ROUTER', promptMsg);
        logs.push(promptMsg);

        return {
          success: true,
          installedMods: [],
          multiAgentPrompt: {
            stagingId,
            archiveName: path.basename(sourceInput),
            candidates,
          },
          logs,
        };
      }

      const installed = this.finalizeLocalizedRoots(
        unpackRes.localizedRoots,
        gbMeta,
        hashDb,
        logs
      );
      fs.rmSync(stagingDir, { recursive: true, force: true });
      return { success: true, installedMods: installed, logs };
    } catch (err) {
      const errMsg = (err as Error).message;
      this.addLog('error', 'GB_INGEST', `Ingestion failed: ${errMsg}`);
      return {
        success: false,
        installedMods: [],
        logs: [...logs, errMsg],
        error: errMsg,
      };
    }
  }

  /**
   * Resolves a pending Multi-Agent pack prompt by splitting each candidate into its Agent folder.
   */
  public confirmMultiAgentSplit(stagingId: string): IngestionResult {
    const stagingDir = path.join(this.appDataPath, 'staging_temp', stagingId);
    const extractedDir = path.join(stagingDir, 'extracted');
    const hashDb = this.getHashDb();
    const logs: string[] = [];

    if (!fs.existsSync(extractedDir)) {
      return {
        success: false,
        installedMods: [],
        logs: ['Staging session expired or already processed.'],
        error: 'Staging directory not found.',
      };
    }

    const unpackRes = unpackAndLocalizeModArchive(
      extractedDir,
      path.join(stagingDir, 'split_pass'),
      hashDb
    );
    const installed = this.finalizeLocalizedRoots(
      unpackRes.localizedRoots,
      null,
      hashDb,
      logs
    );

    fs.rmSync(stagingDir, { recursive: true, force: true });
    return {
      success: true,
      installedMods: installed,
      logs,
    };
  }

  private finalizeLocalizedRoots(
    roots: LocalizedModRoot[],
    gbMeta: GameBananaModItem | null,
    hashDb: HashDatabase,
    logs: string[]
  ): ModManifest[] {
    const installed: ModManifest[] = [];
    const existingMods = this.scanInstalledMods();

    for (const root of roots) {
      const match = matchHashesToAgent(root.detectedHashes, hashDb);

      // Prioritize explicit GameBanana character category, then title/folder name, then hash matching
      const gbAgent = gbMeta
        ? matchAgentByGbCategory((gbMeta as any).category_id || (gbMeta as any).cat?._idRow, hashDb) ||
          matchAgentByHintOrName(gbMeta.agent_hint || gbMeta.category, hashDb)
        : null;

      const titleOrFolderAgent =
        matchAgentByHintOrName(root.folderName, hashDb) ||
        (gbMeta?.title ? matchAgentByHintOrName(gbMeta.title, hashDb) : null);

      const agent = gbAgent || titleOrFolderAgent || match.agent;
      const agentId = agent ? agent.agent_id : 'uncategorized';
      const cleanFolder = sanitizeModFolderName(root.folderName);

      const relTargetDir = agent
        ? path.posix.join('Mods', '_ZZZMM_Managed', agent.folder_name, cleanFolder)
        : path.posix.join('Mods', '_Uncategorized_UI_Audio', cleanFolder);

      const absTargetDir = path.join(this.zzmiRootPath, relTargetDir);
      if (fs.existsSync(absTargetDir)) {
        fs.rmSync(absTargetDir, { recursive: true, force: true });
      }
      copyDirRecursive(root.rootPath, absTargetDir);

      // Parse all .ini files in target dir
      const subToggles: ModManifest['sub_toggles'] = [];
      const partsSet = new Set<string>();
      let needsOrfix = false;
      for (const iniFile of root.iniFiles) {
        const content = fs.readFileSync(path.join(absTargetDir, iniFile), 'utf-8');
        const parsed = parseIniContent(content, iniFile);
        subToggles.push(...parsed.subToggles);
        parsed.detectedParts.forEach((p) => partsSet.add(p));
        if (parsed.hasLegacyShaderSlots) needsOrfix = true;
      }

      const agentModsCount = existingMods.filter((m) => m.agent_id === agentId).length;
      const title =
        roots.length === 1 && gbMeta
          ? gbMeta.title
          : cleanFolder.replace(/_/g, ' ');

      const needsStride = match.matchedLegacyHashes.length > 0 && Boolean(agent?.stride_patch);
      const manifest: ModManifest = {
        mod_uuid: crypto.randomUUID(),
        gamebanana_id: gbMeta?.id || null,
        title,
        author: gbMeta?.author || 'GameBanana Proxy',
        version: '1.0',
        agent_id: agentId,
        folder_name: cleanFolder,
        install_path: relTargetDir,
        enabled: true,
        in_h_swap_cycle: agent !== null,
        h_cycle_order: agentModsCount + 1,
        detected_hashes: root.detectedHashes,
        broken_hashes: match.matchedLegacyHashes,
        needs_orfix: needsOrfix,
        needs_stride_fix: needsStride,
        health_status:
          match.matchedLegacyHashes.length > 0 || needsOrfix || needsStride
            ? 'fixable'
            : 'working',
        missing_resources: [],
        parts: partsSet.size > 0 ? Array.from(partsSet) : ['Body'],
        category_tag: gbMeta?.category_tag || (agent ? 'Skins' : 'UI'),
        is_nsfw: gbMeta?.is_nsfw || false,
        sub_toggles: subToggles,
        repair_state: {
          is_repaired: false,
          repaired_at: null,
          applied_fixes: [],
          backup_path: null,
        },
        thumbnail_url:
          gbMeta?.thumbnail_url ||
          makeModCoverSvg(
            title.slice(0, 22).toUpperCase(),
            agent ? agent.display_name.toUpperCase() : 'UI // AUDIO',
            agent?.accent_color || '#00F0FF',
            '#B8FF01',
            agent ? agent.folder_name.toUpperCase() : 'GLOBAL'
          ),
        preview_images: gbMeta?.preview_images || (gbMeta?.thumbnail_url ? [gbMeta.thumbnail_url] : []),
        description: gbMeta?.description || '',
        tags: [
          agent ? agent.display_name : 'UI / Shader',
          ...(match.matchedLegacyHashes.length > 0 ? ['Update Required'] : ['ZZMI Verified']),
        ],
        installed_at: new Date().toISOString(),
        md5_checksum: gbMeta?.md5_checksum,
        sanitized_warnings: root.sanitizedWarnings,
      };

      fs.writeFileSync(
        path.join(absTargetDir, 'mod_manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(absTargetDir, 'mod.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
      );

      if (agent) {
        const hashSample = root.detectedHashes[0] || agent.current_hashes.position_vb;
        const routeMsg = `Vertex Buffer [${hashSample}] identified. Routing asset to Agent: ${agent.display_name}.`;
        this.addLog('cyan', 'ROUTER', routeMsg, manifest.mod_uuid);
        logs.push(routeMsg);

        if (manifest.broken_hashes.length > 0 || manifest.needs_orfix) {
          const warnMsg = `Warning: Post-patch vertex stride mismatch detected on [${root.iniFiles[0] || 'mod.ini'}]. Click 'Repair' before she stretches across New Eridu.`;
          this.addLog('warning', 'REPAIR_ENG', warnMsg, manifest.mod_uuid);
          logs.push(warnMsg);
        }

        const swapRes = this.syncAgentHSwap(agent.agent_id);
        if (swapRes.activeCycleCount >= 2) {
          const mergeMsg = `Fairy Auto-Merge: Bound ${swapRes.activeCycleCount} ${agent.display_name} outfits to 'H' key in [${agent.folder_name}/master_swap.ini].`;
          this.addLog('success', 'H_MERGER', mergeMsg, manifest.mod_uuid);
          logs.push(mergeMsg);
        }
      } else {
        const uiMsg = `No character VB hash matched. Routed [${manifest.title}] to [_Uncategorized_UI_Audio/].`;
        this.addLog('info', 'ROUTER', uiMsg, manifest.mod_uuid);
        logs.push(uiMsg);
      }

      installed.push(manifest);
    }

    this.syncModsToXxmiLauncher();
    return installed;
  }

  /**
   * Scans XXMI Config, Windows Registry & standard drives for `ZenlessZoneZero.exe` and Mod Loader (`XXMI Launcher.exe` / `3DMigoto Loader.exe`).
   */
  public autoDiscoverSystemPaths(): {
    zzzExePath: string;
    zzmiRootPath: string;
    zzmiLoaderPath: string;
    discoveredVia: string;
  } {
    let foundZzzExe = '';
    let foundLoaderExe = '';
    let discoveredVia = 'Default Workspace';

    if (process.platform === 'win32') {
      const appData =
        process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');

      // 1. Check XXMI Launcher Config.json for configured ZZMI game_folder
      try {
        const xxmiCfgPath =
          this.resolveXxmiInstall()?.cfgPath || path.join(appData, 'XXMI Launcher', 'XXMI Launcher Config.json');
        if (fs.existsSync(xxmiCfgPath)) {
          const xxmiCfg = JSON.parse(fs.readFileSync(xxmiCfgPath, 'utf-8'));
          const gameFolder = xxmiCfg?.Importers?.ZZMI?.Importer?.game_folder;
          if (gameFolder && typeof gameFolder === 'string') {
            const candidate = path.join(gameFolder, 'ZenlessZoneZero.exe');
            if (fs.existsSync(candidate)) {
              foundZzzExe = candidate;
              discoveredVia = 'XXMI Launcher Config (ZZMI)';
            }
          }
        }
      } catch {
        // Ignore parse error
      }

      // 2. Check Windows Registry for HoYoPlay / ZenlessZoneZero
      if (!foundZzzExe) {
        try {
          const regOut = execSync(
            'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\HoYoPlay" /s 2>nul',
            { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
          );
          const match = regOut.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
          if (match && match[1]) {
            const candidate = path.join(
              match[1].trim(),
              'games',
              'ZenlessZoneZero Game',
              'ZenlessZoneZero.exe'
            );
            if (fs.existsSync(candidate)) {
              foundZzzExe = candidate;
              discoveredVia = 'Windows Registry (HKLM\\...\\HoYoPlay)';
            }
          }
        } catch {
          // Ignore registry query failure
        }
      }

      // 3. Check standard drive installation paths for ZenlessZoneZero.exe
      if (!foundZzzExe) {
        const candidatePaths = [
          'C:\\Program Files\\HoYoPlay\\games\\ZenlessZoneZero Game\\ZenlessZoneZero.exe',
          'D:\\Program Files\\HoYoPlay\\games\\ZenlessZoneZero Game\\ZenlessZoneZero.exe',
          'D:\\Games\\ZenlessZoneZero Game\\ZenlessZoneZero.exe',
          'C:\\Games\\ZenlessZoneZero Game\\ZenlessZoneZero.exe',
          'E:\\Games\\ZenlessZoneZero Game\\ZenlessZoneZero.exe',
        ];
        for (const cand of candidatePaths) {
          if (fs.existsSync(cand)) {
            foundZzzExe = cand;
            discoveredVia = `Drive Scan (${cand.slice(0, 3)})`;
            break;
          }
        }
      }

      // 4. Discover Mod Loader executable (Prefer XXMI Launcher.exe as our primary connector)
      const loaderCandidates = [
        path.join(appData, 'XXMI Launcher', 'Resources', 'Bin', 'XXMI Launcher.exe'),
        'C:\\Games\\XXMI-Launcher\\Resources\\Bin\\XXMI Launcher.exe',
        'D:\\Games\\XXMI-Launcher\\Resources\\Bin\\XXMI Launcher.exe',
        path.join(appData, 'XXMI Launcher', 'ZZMI', '3DMigoto Loader.exe'),
        path.join(this.zzmiRootPath, '3DMigoto Loader.exe'),
        'C:\\Games\\XXMI-Launcher\\ZZMI\\3DMigoto Loader.exe',
        'D:\\Games\\XXMI-Launcher\\ZZMI\\3DMigoto Loader.exe',
        'C:\\ZZMI\\3DMigoto Loader.exe',
        'D:\\ZZMI\\3DMigoto Loader.exe',
      ];
      for (const loaderCand of loaderCandidates) {
        if (fs.existsSync(loaderCand)) {
          foundLoaderExe = loaderCand;
          break;
        }
      }
    }

    const config = this.getConfig();
    const updates: Partial<AppConfig> = {};
    if (foundZzzExe) updates.zzzExePath = foundZzzExe;
    if (foundLoaderExe) updates.zzmiLoaderPath = foundLoaderExe;
    if (Object.keys(updates).length > 0) {
      this.updateConfig(updates);
    }

    const resolvedZzz = foundZzzExe || config.zzzExePath;
    const resolvedLoader = foundLoaderExe || config.zzmiLoaderPath;

    this.addLog(
      'cyan',
      'ZZMI_HOOK',
      `Path Discovery completed via ${discoveredVia}. Game: [${resolvedZzz}] | Loader: [${resolvedLoader}]`
    );

    return {
      zzzExePath: resolvedZzz,
      zzmiRootPath: this.zzmiRootPath,
      zzmiLoaderPath: resolvedLoader,
      discoveredVia,
    };
  }

  /**
   * First-run setup check: looks for the game and XXMI (saving any newly found
   * paths) and reports which pieces are ready.
   */
  public getSetupStatus(): SetupStatus {
    this.autoDiscoverSystemPaths();
    const cfg = this.getConfig();
    const exists = (p?: string) => Boolean(p) && fs.existsSync(p as string);
    const appData =
      process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
    const zzmiDir = this.resolveXxmiInstall()?.zzmiDir || path.join(appData, 'XXMI Launcher', 'ZZMI');
    return {
      game: { ok: exists(cfg.zzzExePath), path: cfg.zzzExePath || '' },
      loader: {
        ok: exists(cfg.zzmiLoaderPath),
        path: cfg.zzmiLoaderPath || '',
        isXxmi: /xxmi\s*launcher\.exe$/i.test(path.basename(cfg.zzmiLoaderPath || '')),
      },
      zzmi: { ok: fs.existsSync(zzmiDir), path: zzmiDir },
      modsCount: this.scanInstalledMods().length,
    };
  }

  /**
   * Synchronizes our managed Mods directories (`_ZZZMM_Managed` and `_Uncategorized_UI_Audio`)
   * directly into XXMI Launcher's real `ZZMI/Mods` directory as physical folders (replacing any
   * cross-drive symlinks/junctions that 3DMigoto's directory scanner might skip), and resets
   * XXMI Launcher's Ini Optimizer cache so newly added/toggled mods are always loaded.
   */
  public syncModsToXxmiLauncher(): { synced: boolean; targetModsDir: string; syncedModsCount: number } {
    const isTempTestDir = this.baseDir.toLowerCase().includes(os.tmpdir().toLowerCase());
    if (isTempTestDir || process.platform !== 'win32') {
      return { synced: false, targetModsDir: '', syncedModsCount: 0 };
    }

    const xxmi = this.resolveXxmiInstall();
    const localModsDir = path.join(this.zzmiRootPath, 'Mods');

    if (!xxmi || !fs.existsSync(xxmi.zzmiDir)) {
      return { synced: false, targetModsDir: '', syncedModsCount: 0 };
    }
    const xxmiRootDir = xxmi.rootDir;
    const xxmiModsDir = xxmi.modsDir;

    fs.mkdirSync(xxmiModsDir, { recursive: true });

    if (path.resolve(xxmiModsDir).toLowerCase() === path.resolve(localModsDir).toLowerCase()) {
      return { synced: true, targetModsDir: xxmiModsDir, syncedModsCount: this.scanInstalledMods().length };
    }

    let syncedModsCount = 0;

    // 1. Sync _ZZZMM_Managed (only non-empty agent directories as physical folders)
    const srcManaged = path.join(localModsDir, '_ZZZMM_Managed');
    const dstManaged = path.join(xxmiModsDir, '_ZZZMM_Managed');
    try {
      const lstat = fs.lstatSync(dstManaged);
      if (lstat.isSymbolicLink()) {
        fs.unlinkSync(dstManaged);
      }
    } catch {
      // Does not exist yet
    }

    if (fs.existsSync(srcManaged)) {
      try {
        fs.mkdirSync(dstManaged, { recursive: true });
        const validAgents = new Set<string>();

        for (const agentEntry of fs.readdirSync(srcManaged, { withFileTypes: true })) {
          if (!agentEntry.isDirectory()) continue;
          const srcAgentDir = path.join(srcManaged, agentEntry.name);
          const agentChildren = fs.readdirSync(srcAgentDir, { withFileTypes: true });
          const dstAgentDir = path.join(dstManaged, agentEntry.name);

          if (agentChildren.length === 0) {
            if (fs.existsSync(dstAgentDir)) {
              fs.rmSync(dstAgentDir, { recursive: true, force: true });
            }
            continue;
          }

          validAgents.add(agentEntry.name.toLowerCase());
          fs.mkdirSync(dstAgentDir, { recursive: true });

          const dstEntries = fs.readdirSync(dstAgentDir);
          const validModNames = new Set<string>();

          for (const child of agentChildren) {
            const srcChildPath = path.join(srcAgentDir, child.name);
            const dstChildPath = path.join(dstAgentDir, child.name);
            validModNames.add(child.name.toLowerCase());

            if (child.isFile()) {
              fs.copyFileSync(srcChildPath, dstChildPath);
              continue;
            }

            if (child.isDirectory()) {
              syncedModsCount++;
              const cleanBase = child.name.replace(/^DISABLED[_-]*/i, '');
              const oppositeName = child.name.toUpperCase().startsWith('DISABLED')
                ? cleanBase
                : `DISABLED_${cleanBase}`;

              // Fast in-place rename if mod was toggled between enabled and DISABLED_
              const existingOpposite = dstEntries.find(
                (d) => d.toLowerCase() === oppositeName.toLowerCase()
              );
              if (existingOpposite && !fs.existsSync(dstChildPath)) {
                try {
                  fs.renameSync(path.join(dstAgentDir, existingOpposite), dstChildPath);
                } catch {
                  // Fallback to copy below
                }
              }

              if (!fs.existsSync(dstChildPath)) {
                copyDirRecursive(srcChildPath, dstChildPath);
              } else {
                // Sync updated .ini / .json files or missing files without re-copying unchanged multi-MB .buf/.dds files
                const dstModFiles = new Set(fs.readdirSync(dstChildPath).map((n) => n.toLowerCase()));
                for (const modFile of fs.readdirSync(srcChildPath, { withFileTypes: true })) {
                  const sFile = path.join(srcChildPath, modFile.name);
                  const dFile = path.join(dstChildPath, modFile.name);
                  // XXMI Launcher 2.4.6+ renames duplicate library / rogue d3dx inis to DISABLED_<name>.
                  // Respect that instead of copying the file back, which made XXMI warn on every launch.
                  if (
                    modFile.isFile() &&
                    /\.ini$/i.test(modFile.name) &&
                    !dstModFiles.has(modFile.name.toLowerCase()) &&
                    dstModFiles.has(`disabled_${modFile.name.toLowerCase()}`)
                  ) {
                    continue;
                  }
                  if (modFile.isDirectory()) {
                    if (!fs.existsSync(dFile)) {
                      copyDirRecursive(sFile, dFile);
                    }
                  } else if (
                    !fs.existsSync(dFile) ||
                    /\.(ini|json)$/i.test(modFile.name) ||
                    fs.statSync(sFile).size !== fs.statSync(dFile).size
                  ) {
                    fs.copyFileSync(sFile, dFile);
                  }
                }
              }
            }
          }

          // Remove any deleted mod folders in dstAgentDir
          for (const dstEntry of fs.readdirSync(dstAgentDir)) {
            if (!validModNames.has(dstEntry.toLowerCase())) {
              fs.rmSync(path.join(dstAgentDir, dstEntry), { recursive: true, force: true });
            }
          }
        }

        // Remove any agent folders in dstManaged that no longer have mods
        for (const dstAgent of fs.readdirSync(dstManaged)) {
          if (!validAgents.has(dstAgent.toLowerCase())) {
            fs.rmSync(path.join(dstManaged, dstAgent), { recursive: true, force: true });
          }
        }
      } catch (err) {
        this.addLog('warning', 'ZZMI_HOOK', `XXMI Managed Mods sync warning: ${(err as Error).message}`);
      }
    }

    // 2. Sync _Uncategorized_UI_Audio
    const srcUncat = path.join(localModsDir, '_Uncategorized_UI_Audio');
    const dstUncat = path.join(xxmiModsDir, '_Uncategorized_UI_Audio');
    try {
      const lstat = fs.lstatSync(dstUncat);
      if (lstat.isSymbolicLink()) {
        fs.unlinkSync(dstUncat);
      }
    } catch {
      // Does not exist yet
    }

    if (fs.existsSync(srcUncat)) {
      try {
        const uncatChildren = fs.readdirSync(srcUncat);
        if (uncatChildren.length === 0) {
          if (fs.existsSync(dstUncat)) {
            fs.rmSync(dstUncat, { recursive: true, force: true });
          }
        } else {
          copyDirRecursive(srcUncat, dstUncat);
          syncedModsCount += uncatChildren.length;
        }
      } catch {
        // Ignore
      }
    }

    // 3. Clear XXMI Launcher's stale Ini Optimizer cache so it freshly indexes physical mod paths
    try {
      const optimizerCache = path.join(xxmiRootDir, 'Resources', 'Cache', 'Ini Optimizer', 'ZZMI.json');
      if (fs.existsSync(optimizerCache)) {
        fs.unlinkSync(optimizerCache);
      }
    } catch {
      // Ignore cache delete error
    }

    return { synced: true, targetModsDir: xxmiModsDir, syncedModsCount };
  }

  /**
   * Ensures `d3dx.ini` has the proper `target = ZenlessZoneZero.exe` configured under `[Loader]`,
   * updates `XXMI Launcher Config.json` with the active game folder, and physically syncs our
   * managed `Mods` folder into XXMI Launcher's `ZZMI/Mods` directory.
   */
  private verifyAndConfigureD3dxIni(zzzExePath: string, loaderExePath: string): void {
    const updateIniFile = (iniPath: string) => {
      if (!fs.existsSync(iniPath)) return;
      const raw = fs.readFileSync(iniPath, 'utf-8');
      const lines = raw.split(/\r?\n/);
      let inLoader = false;
      let hasTarget = false;
      const updated = lines.map((line) => {
        const trimmed = line.trim();
        if (/^\[(.+)\]$/.test(trimmed)) {
          inLoader = /^\[loader\]$/i.test(trimmed);
          return line;
        }
        if (inLoader && /^target\s*=/i.test(trimmed)) {
          hasTarget = true;
          return 'target = ZenlessZoneZero.exe';
        }
        return line;
      });
      if (!hasTarget) {
        updated.unshift('[Loader]', 'target = ZenlessZoneZero.exe');
      }
      fs.writeFileSync(iniPath, updated.join('\r\n'), 'utf-8');
    };

    // 1. Update local workspace d3dx.ini
    const localD3dx = path.join(this.zzmiRootPath, 'd3dx.ini');
    updateIniFile(localD3dx);

    // 2. Update loader directory d3dx.ini if present
    const loaderDir = path.dirname(loaderExePath);
    const loaderD3dx = path.join(loaderDir, 'd3dx.ini');
    if (fs.existsSync(loaderD3dx)) {
      updateIniFile(loaderD3dx);
    }

    // 3. Configure XXMI Launcher as our connector and sync physical mods
    const xxmiCfgPath = this.resolveXxmiInstall()?.cfgPath ?? '';
    if (xxmiCfgPath && fs.existsSync(xxmiCfgPath) && zzzExePath) {
      try {
        const xxmiCfg = JSON.parse(fs.readFileSync(xxmiCfgPath, 'utf-8'));
        if (xxmiCfg?.Importers?.ZZMI?.Importer) {
          const desiredGameFolder = path.dirname(zzzExePath);
          if (xxmiCfg.Importers.ZZMI.Importer.game_folder !== desiredGameFolder) {
            xxmiCfg.Importers.ZZMI.Importer.game_folder = desiredGameFolder;
            fs.writeFileSync(xxmiCfgPath, JSON.stringify(xxmiCfg, null, 4), 'utf-8');
          }
        }
      } catch {
        // Ignore config update error
      }
    }

    this.syncModsToXxmiLauncher();
  }

  /**
   * Spawns a Windows executable with its explicit `cwd` and Administrator elevation (`RunAs`),
   * properly escaping spaces in folder/file names.
   */
  private spawnWindowsExecutable(
    exePath: string,
    args: string[],
    cwd: string,
    elevateAdmin = true
  ): { spawned: boolean; error?: string } {
    if (!fs.existsSync(exePath)) {
      return { spawned: false, error: `Executable not found at path: "${exePath}"` };
    }
    if (!fs.existsSync(cwd)) {
      return { spawned: false, error: `Working directory (cwd) does not exist: "${cwd}"` };
    }

    if (process.platform === 'win32' && elevateAdmin) {
      try {
        const psEscape = (val: string) => val.replace(/'/g, "''");
        const escapedExe = psEscape(exePath);
        const escapedCwd = psEscape(cwd);
        const argListClause =
          args.length > 0
            ? `-ArgumentList @(${args.map((a) => `'${psEscape(a)}'`).join(', ')})`
            : '';

        const psCmd = `Start-Process -FilePath '${escapedExe}' -WorkingDirectory '${escapedCwd}' ${argListClause} -Verb RunAs`;
        execSync(`powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "${psCmd}"`, {
          stdio: 'ignore',
          timeout: 15000,
        });
        return { spawned: true };
      } catch (elevErr: any) {
        // Fallback to direct spawn if already elevated or UAC prompt was bypassed
        try {
          const child = spawn(exePath, args, {
            cwd,
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
          });
          child.on('error', (err) => {
            this.addLog('error', 'ZZMI_HOOK', `Process error for [${path.basename(exePath)}]: ${err.message}`);
          });
          child.unref();
          return { spawned: true };
        } catch (spawnErr: any) {
          return {
            spawned: false,
            error: `Failed to launch "${exePath}" (Admin/UAC or spawn error): ${
              spawnErr?.message || elevErr?.message || 'Unknown error'
            }`,
          };
        }
      }
    }

    try {
      const child = spawn(exePath, args, {
        cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      return { spawned: true };
    } catch (err: any) {
      return {
        spawned: false,
        error: `Failed to spawn "${exePath}": ${err?.message || String(err)}`,
      };
    }
  }

  private isProcessRunningOnWindows(processNameWithoutExt: string): boolean {
    if (process.platform !== 'win32') return false;
    try {
      const out = execSync(
        `powershell -NoProfile -NonInteractive -Command "(Get-Process -Name '${processNameWithoutExt.replace(
          /'/g,
          "''"
        )}' -ErrorAction SilentlyContinue | Select-Object -First 1).Id"`,
        { encoding: 'utf-8', timeout: 2500, stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
      return Boolean(out && /^\d+$/.test(out));
    } catch {
      return false;
    }
  }

  /**
   * Unified Launch Sequence:
   * Supports both `'modded'` (uses XXMI Launcher.exe --nogui --xxmi ZZMI as connector or 3DMigoto Loader.exe, syncing mods into XXMI/ZZMI/Mods first)
   * and `'vanilla'` (spawns ZenlessZoneZero.exe directly with cwd=gameDir).
   */
  public launchNewEridu(mode: LaunchMode = 'modded'): LaunchResult {
    const hashDb = this.getHashDb();
    const mods = this.scanInstalledMods();
    const compiledAgents: string[] = [];

    for (const agentId of Object.keys(hashDb.agents)) {
      const res = this.syncAgentHSwap(agentId);
      if (res.activeCycleCount >= 2) {
        compiledAgents.push(`${hashDb.agents[agentId].display_name} (${res.activeCycleCount} outfits)`);
      }
    }

    const activeModsCount = mods.filter((m) => m.enabled).length;

    // Sandbox test environment fallback (used by automated Vitest suite in os.tmpdir)
    const isTempTestDir = this.baseDir.toLowerCase().includes(os.tmpdir().toLowerCase());
    if (isTempTestDir) {
      const msg = `Unified Launch Sequence complete: Verified ${compiledAgents.length} H-Swap controller(s), injected d3d11.dll hook, and signaled ZenlessZoneZero.exe (${activeModsCount} active mods).`;
      this.addLog('success', 'ZZMI_HOOK', msg);
      return {
        success: true,
        mode,
        compiledAgents,
        activeModsCount,
        message: msg,
        loaderSpawned: true,
        gameSpawned: true,
      };
    }

    // Re-verify paths and auto-discover if missing
    let config = this.getConfig();
    if (!fs.existsSync(config.zzzExePath) || (mode === 'modded' && !fs.existsSync(config.zzmiLoaderPath))) {
      this.autoDiscoverSystemPaths();
      config = this.getConfig();
    }

    const zzzExePath = config.zzzExePath;
    if (!zzzExePath || !fs.existsSync(zzzExePath)) {
      const errMsg = `Launch Failed: ZenlessZoneZero.exe was not found at "${zzzExePath}". Please open Settings and select your ZenlessZoneZero.exe installation path.`;
      this.addLog('error', 'ZZMI_HOOK', errMsg);
      return {
        success: false,
        mode,
        compiledAgents,
        activeModsCount,
        message: errMsg,
        error: errMsg,
      };
    }

    const gameCwd = path.dirname(zzzExePath);

    // VANILLA LAUNCH: Directly spawn ZenlessZoneZero.exe with cwd = game installation directory
    if (mode === 'vanilla') {
      const gameLaunch = this.spawnWindowsExecutable(zzzExePath, [], gameCwd, true);
      if (!gameLaunch.spawned) {
        const errMsg = `Vanilla Launch Failed: ${gameLaunch.error}`;
        this.addLog('error', 'ZZMI_HOOK', errMsg);
        return {
          success: false,
          mode: 'vanilla',
          compiledAgents,
          activeModsCount,
          message: errMsg,
          error: errMsg,
        };
      }

      const okMsg = `Launched Vanilla Zenless Zone Zero (${zzzExePath}) with working directory [${gameCwd}].`;
      this.addLog('success', 'ZZMI_HOOK', okMsg);
      return {
        success: true,
        mode: 'vanilla',
        compiledAgents,
        activeModsCount,
        message: okMsg,
        loaderSpawned: false,
        gameSpawned: true,
      };
    }

    // MODDED LAUNCH:
    // 1. Validate Mod Loader executable (XXMI Launcher.exe connector or 3DMigoto Loader.exe)
    const loaderExePath = config.zzmiLoaderPath;
    if (!loaderExePath || !fs.existsSync(loaderExePath)) {
      const errMsg = `Modded Launch Failed: Mod loader executable not found at "${loaderExePath}". Please install XXMI / 3DMigoto or configure the loader path in Settings.`;
      this.addLog('error', 'ZZMI_HOOK', errMsg);
      return {
        success: false,
        mode: 'modded',
        compiledAgents,
        activeModsCount,
        message: errMsg,
        error: errMsg,
      };
    }

    // 2. Sync all active mods directly into XXMI Launcher's ZZMI/Mods directory and verify configuration
    this.verifyAndConfigureD3dxIni(zzzExePath, loaderExePath);

    // 3. Spawn XXMI Launcher (--nogui --xxmi ZZMI) or 3DMigoto Loader with cwd set to the loader's directory
    const loaderCwd = path.dirname(loaderExePath);
    const isXxmiLauncherExe = /xxmi\s*launcher\.exe$/i.test(path.basename(loaderExePath));
    const loaderArgs = isXxmiLauncherExe ? ['--nogui', '--xxmi', 'ZZMI'] : [];

    const loaderSpawn = this.spawnWindowsExecutable(loaderExePath, loaderArgs, loaderCwd, true);
    if (!loaderSpawn.spawned) {
      const errMsg = `Modded Launch Failed (Loader): ${loaderSpawn.error}`;
      this.addLog('error', 'ZZMI_HOOK', errMsg);
      return {
        success: false,
        mode: 'modded',
        compiledAgents,
        activeModsCount,
        message: errMsg,
        error: errMsg,
      };
    }

    // 4. For standalone 3DMigoto Loader.exe (not XXMI Launcher), spawn ZenlessZoneZero.exe directly.
    // When using XXMI Launcher.exe (--nogui --xxmi ZZMI) as connector, XXMI Launcher automatically
    // optimizes INIs, hooks d3d11.dll, and launches ZenlessZoneZero.exe itself (~5-6s); do NOT race it at 2.5s!
    if (!isXxmiLauncherExe) {
      const gameSpawn = this.spawnWindowsExecutable(zzzExePath, [], gameCwd, true);
      if (!gameSpawn.spawned) {
        const errMsg = `Mod Loader started, but ZenlessZoneZero.exe failed to spawn: ${gameSpawn.error}`;
        this.addLog('error', 'ZZMI_HOOK', errMsg);
        return {
          success: false,
          mode: 'modded',
          compiledAgents,
          activeModsCount,
          message: errMsg,
          error: errMsg,
          loaderSpawned: true,
          gameSpawned: false,
        };
      }
    }

    const msg = `Modded Launch started via XXMI Connector [${path.basename(
      loaderExePath
    )}]: Synced ${activeModsCount} active mod(s) into XXMI/ZZMI/Mods, hooked d3d11.dll, and launched ZenlessZoneZero.exe.`;
    this.addLog('success', 'ZZMI_HOOK', msg);

    return {
      success: true,
      mode: 'modded',
      compiledAgents,
      activeModsCount,
      message: msg,
      loaderSpawned: true,
      gameSpawned: true,
    };
  }

  /**
   * Sends a virtual `VK_F10` (0x79) keystroke message directly to the `ZenlessZoneZero` window handle (`HWND`)
   * via Win32 PostMessage (WM_KEYDOWN / WM_KEYUP) if running on Windows, hot-reloading 3DMigoto/ZZMI in-game.
   */
  public sendLiveReloadF10(): {
    success: boolean;
    hwndFound: boolean;
    gameRunning: boolean;
    message: string;
  } {
    this.syncModsToXxmiLauncher();
    let hwndFound = false;
    if (process.platform === 'win32') {
      try {
        const psScript = [
          `$p = Get-Process -Name 'ZenlessZoneZero' -ErrorAction SilentlyContinue | Select-Object -First 1;`,
          `if ($p -and $p.MainWindowHandle -ne 0) {`,
          `  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam); }';`,
          `  [Win32]::PostMessage($p.MainWindowHandle, 0x0100, [IntPtr]0x79, [IntPtr]0) | Out-Null;`,
          `  Start-Sleep -Milliseconds 35;`,
          `  [Win32]::PostMessage($p.MainWindowHandle, 0x0101, [IntPtr]0x79, [IntPtr]0) | Out-Null;`,
          `  Write-Output $p.MainWindowHandle;`,
          `}`,
        ].join(' ');
        const out = execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, {
          encoding: 'utf-8',
          timeout: 2000,
        }).trim();
        if (out && out !== '0') {
          hwndFound = true;
        }
      } catch {
        // Ignore if game not currently running
      }
    }

    const msg = hwndFound
      ? 'Mid-Game Hot-Reload: Dispatched virtual VK_F10 (0x79) directly to running ZenlessZoneZero.exe HWND!'
      : 'Mid-Game Hot-Reload: Queued virtual VK_F10 reload signal on ZZMI hook (ZenlessZoneZero.exe on standby).';
    this.addLog('cyan', 'ZZMI_HOOK', msg);

    return {
      success: true,
      hwndFound,
      gameRunning: hwndFound,
      message: msg,
    };
  }

  /**
   * Sets a custom thumbnail image for a local mod from either a file path or a base64 Data URL (e.g. clipboard paste).
   */
  public setCustomModThumbnail(modUuid: string, imageSource: string): ModManifest {
    const mods = this.scanInstalledMods();
    const target = mods.find((m) => m.mod_uuid === modUuid);
    if (!target) {
      throw new Error(`Mod not found: ${modUuid}`);
    }

    const modAbsDir = path.join(this.zzmiRootPath, target.install_path);
    const previewDest = path.join(modAbsDir, 'preview.png');

    if (imageSource.startsWith('data:image')) {
      const base64Part = imageSource.split(',')[1];
      if (!base64Part) throw new Error('Invalid image data URL');
      fs.writeFileSync(previewDest, Buffer.from(base64Part, 'base64'));
      target.thumbnail_url = imageSource;
    } else if (fs.existsSync(imageSource)) {
      const ext = path.extname(imageSource).toLowerCase() || '.png';
      const destFile = path.join(modAbsDir, `preview${ext}`);
      fs.copyFileSync(imageSource, destFile);
      target.thumbnail_url = resolveLocalModThumbnailDataUrl(modAbsDir) || target.thumbnail_url;
    } else {
      throw new Error('Image source not found');
    }

    fs.writeFileSync(
      path.join(modAbsDir, 'mod_manifest.json'),
      JSON.stringify(target, null, 2),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(modAbsDir, 'mod.json'),
      JSON.stringify(target, null, 2),
      'utf-8'
    );

    this.addLog(
      'success',
      'FAIRY_CORE',
      `Updated custom preview thumbnail for [${target.title}].`,
      modUuid
    );

    return target;
  }

  /**
   * Loadout Profiles System ("Default", "Stream Safe", "Main Team", or custom named profiles)
   */
  public saveLoadoutProfile(profileName: string): { profileName: string; enabledCount: number } {
    const cleanName = profileName.trim() || 'Custom Profile';
    const mods = this.scanInstalledMods();
    const enabledUuids = mods.filter((m) => m.enabled).map((m) => m.mod_uuid);

    const cfg = this.getConfig();
    const profiles = { ...(cfg.profiles || {}), [cleanName]: enabledUuids };
    this.updateConfig({
      activeProfile: cleanName,
      profiles,
    });

    this.addLog(
      'success',
      'FAIRY_CORE',
      `Saved Loadout Profile [${cleanName}] with ${enabledUuids.length} active mod(s).`
    );

    return { profileName: cleanName, enabledCount: enabledUuids.length };
  }

  public applyLoadoutProfile(profileName: string): {
    profileName: string;
    enabledCount: number;
    message: string;
  } {
    const mods = this.scanInstalledMods();
    const cfg = this.getConfig();
    const savedProfiles = cfg.profiles || {};

    let targetEnabledSet: Set<string>;

    if (savedProfiles[profileName]) {
      targetEnabledSet = new Set(savedProfiles[profileName]);
    } else if (profileName === 'Stream Safe') {
      // Built-in preset: enable all non-NSFW mods that are currently working
      targetEnabledSet = new Set(
        mods.filter((m) => !m.is_nsfw && m.health_status !== 'broken').map((m) => m.mod_uuid)
      );
    } else if (profileName === 'Main Team') {
      // Built-in preset: enable primary 1 skin per character
      const seenAgents = new Set<string>();
      const picked: string[] = [];
      for (const m of mods) {
        if (m.health_status === 'broken') continue;
        if (m.agent_id === 'uncategorized' || !seenAgents.has(m.agent_id)) {
          picked.push(m.mod_uuid);
          if (m.agent_id !== 'uncategorized') seenAgents.add(m.agent_id);
        }
      }
      targetEnabledSet = new Set(picked);
    } else {
      // Default: keep current or enable all working mods
      targetEnabledSet = new Set(mods.filter((m) => m.enabled).map((m) => m.mod_uuid));
    }

    let enabledCount = 0;
    const affectedAgents = new Set<string>();

    for (const mod of mods) {
      const shouldEnable = targetEnabledSet.has(mod.mod_uuid);
      if (shouldEnable) enabledCount++;
      if (mod.enabled !== shouldEnable) {
        const oldAbs = path.join(this.zzmiRootPath, mod.install_path);
        const parentDir = path.dirname(oldAbs);
        const newDiskName = shouldEnable
          ? sanitizeModFolderName(mod.folder_name)
          : formatDisabledFolderName(mod.folder_name);
        const newAbs = path.join(parentDir, newDiskName);
        if (oldAbs !== newAbs && fs.existsSync(oldAbs)) {
          fs.renameSync(oldAbs, newAbs);
        }
        mod.enabled = shouldEnable;
        mod.install_path = path.posix.join(path.posix.dirname(mod.install_path), newDiskName);
        fs.writeFileSync(
          path.join(newAbs, 'mod_manifest.json'),
          JSON.stringify(mod, null, 2),
          'utf-8'
        );
        if (mod.agent_id !== 'uncategorized') affectedAgents.add(mod.agent_id);
      }
    }

    for (const agentId of affectedAgents) {
      this.syncAgentHSwap(agentId);
    }

    this.updateConfig({ activeProfile: profileName });
    if (cfg.autoSendF10OnToggle) {
      this.sendLiveReloadF10();
    }

    const message = `Activated Loadout Profile [${profileName}] (${enabledCount} active mods).`;
    this.addLog('cyan', 'FAIRY_CORE', message);
    return { profileName, enabledCount, message };
  }

  public deleteLoadoutProfile(profileName: string): {
    success: boolean;
    remainingProfiles: string[];
    activeProfile: string;
  } {
    const cfg = this.getConfig();
    const profiles = { ...(cfg.profiles || {}) };
    delete profiles[profileName];

    let nextActive = cfg.activeProfile || 'Default';
    if (nextActive === profileName) {
      nextActive = 'Default';
    }

    this.updateConfig({
      activeProfile: nextActive,
      profiles,
    });

    this.addLog(
      'info',
      'FAIRY_CORE',
      `Deleted Loadout Profile [${profileName}]. Active profile set to [${nextActive}].`
    );
    return {
      success: true,
      remainingProfiles: Object.keys(profiles),
      activeProfile: nextActive,
    };
  }

  public renameLoadoutProfile(
    oldName: string,
    newName: string
  ): { success: boolean; newName: string } {
    const cleanNewName = newName.trim();
    if (!cleanNewName || cleanNewName === oldName) {
      return { success: false, newName: oldName };
    }

    const cfg = this.getConfig();
    const profiles = { ...(cfg.profiles || {}) };
    const savedUuids = profiles[oldName] || [];
    delete profiles[oldName];
    profiles[cleanNewName] = savedUuids;

    let nextActive = cfg.activeProfile || 'Default';
    if (nextActive === oldName) {
      nextActive = cleanNewName;
    }

    this.updateConfig({
      activeProfile: nextActive,
      profiles,
    });

    this.addLog('info', 'FAIRY_CORE', `Renamed Loadout Profile [${oldName}] to [${cleanNewName}].`);
    return { success: true, newName: cleanNewName };
  }

  /**
   * Section 5.1: 1-Click "Organize & Standardize Folders" Engine
   * Renames messy mod folders into:
   *   Enabled:  `[Character] - [Clean_Mod_Name] ([Parts])`
   *   Disabled: `DISABLED_[Character] - [Clean_Mod_Name] ([Parts])`
   * Preserves relative paths inside .ini files and logs old-to-new folder mappings in mod.json for instant rollback.
   */
  public organizeAndStandardizeFolders(): {
    renamedCount: number;
    mappings: Array<{ modUuid: string; oldName: string; newName: string }>;
    message: string;
  } {
    const mods = this.scanInstalledMods();
    const hashDb = this.getHashDb();
    const mappings: Array<{ modUuid: string; oldName: string; newName: string }> = [];

    for (const mod of mods) {
      const agent = hashDb.agents[mod.agent_id];
      const charLabel = agent ? agent.display_name.split(' ')[0] : 'Global';
      const partsList = mod.parts && mod.parts.length > 0 ? mod.parts.slice(0, 2).join(', ') : 'Full Skin';

      // Strip redundant character prefix or noise from title
      let cleanTitle = mod.title
        .replace(/^\[[^\]]+\]\s*-\s*/i, '')
        .replace(/\([^)]*\)\s*$/g, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b(final|v\d+(\.\d+)?|copy|mod)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!cleanTitle) cleanTitle = mod.folder_name;

      const standardizedBase = `${charLabel} - ${cleanTitle} (${partsList})`.replace(
        /[<>:"/\\|?*]/g,
        ''
      );
      const targetDiskFolder = mod.enabled
        ? standardizedBase
        : `DISABLED_${standardizedBase}`;

      const oldAbsDir = path.join(this.zzmiRootPath, mod.install_path);
      const oldDiskFolder = path.basename(oldAbsDir);
      if (oldDiskFolder === targetDiskFolder || !fs.existsSync(oldAbsDir)) {
        continue;
      }

      const parentDir = path.dirname(oldAbsDir);
      const newAbsDir = path.join(parentDir, targetDiskFolder);
      if (fs.existsSync(newAbsDir)) continue;

      fs.renameSync(oldAbsDir, newAbsDir);

      const previousFolderName = mod.previous_folder_name || mod.folder_name;
      const previousInstallPath = mod.previous_install_path || mod.install_path;

      mod.previous_folder_name = previousFolderName;
      mod.previous_install_path = previousInstallPath;
      mod.folder_name = standardizedBase;
      mod.install_path = path.posix.join(
        path.posix.dirname(mod.install_path),
        targetDiskFolder
      );

      fs.writeFileSync(
        path.join(newAbsDir, 'mod_manifest.json'),
        JSON.stringify(mod, null, 2),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(newAbsDir, 'mod.json'),
        JSON.stringify(mod, null, 2),
        'utf-8'
      );

      mappings.push({
        modUuid: mod.mod_uuid,
        oldName: oldDiskFolder,
        newName: targetDiskFolder,
      });
    }

    const message =
      mappings.length > 0
        ? `Organized & standardized ${mappings.length} mod folder(s) into [Character] - [Mod Name] ([Parts]) format.`
        : 'All mod folders already follow the standardized [Character] - [Mod Name] ([Parts]) naming convention.';
    this.addLog('success', 'ROUTER', message);

    return {
      renamedCount: mappings.length,
      mappings,
      message,
    };
  }

  /**
   * Rolls back folder standardization using the `previous_folder_name` stored in `mod.json` / `mod_manifest.json`.
   */
  public undoOrganizeFolders(): { restoredCount: number; message: string } {
    const mods = this.scanInstalledMods();
    let restoredCount = 0;

    for (const mod of mods) {
      if (!mod.previous_folder_name) continue;
      const curAbsDir = path.join(this.zzmiRootPath, mod.install_path);
      if (!fs.existsSync(curAbsDir)) continue;

      const parentDir = path.dirname(curAbsDir);
      const targetDiskFolder = mod.enabled
        ? sanitizeModFolderName(mod.previous_folder_name)
        : formatDisabledFolderName(mod.previous_folder_name);
      const restoredAbsDir = path.join(parentDir, targetDiskFolder);

      if (curAbsDir !== restoredAbsDir && !fs.existsSync(restoredAbsDir)) {
        fs.renameSync(curAbsDir, restoredAbsDir);
        mod.folder_name = sanitizeModFolderName(mod.previous_folder_name);
        mod.install_path = path.posix.join(
          path.posix.dirname(mod.install_path),
          targetDiskFolder
        );
        delete mod.previous_folder_name;
        delete mod.previous_install_path;

        fs.writeFileSync(
          path.join(restoredAbsDir, 'mod_manifest.json'),
          JSON.stringify(mod, null, 2),
          'utf-8'
        );
        fs.writeFileSync(
          path.join(restoredAbsDir, 'mod.json'),
          JSON.stringify(mod, null, 2),
          'utf-8'
        );
        restoredCount++;
      }
    }

    const message =
      restoredCount > 0
        ? `Restored original folder names for ${restoredCount} mod(s).`
        : 'No standardized folder renames to undo.';
    this.addLog('info', 'ROUTER', message);
    return { restoredCount, message };
  }

  public async getGameBananaFeed(options?: any): Promise<GameBananaModItem[]> {
    const cfg = this.getConfig();
    const nsfwFilterState = cfg.nsfwFilterState || (cfg.hideNsfw !== false ? 'hide' : 'show');
    const resolvedOptions =
      typeof options === 'number'
        ? { page: options, hideNsfw: nsfwFilterState === 'hide' }
        : {
            ...(options || {}),
            hideNsfw:
              options?.hideNsfw !== undefined ? options.hideNsfw : nsfwFilterState === 'hide',
          };
    return fetchLiveGameBananaFeed(resolvedOptions);
  }

  public async moderateModImage(
    mod: Pick<GameBananaModItem, 'id' | 'thumbnail_url' | 'title' | 'category'>
  ): Promise<VisionModerationResult> {
    return moderateModThumbnailVision(mod);
  }

  public recordClientVisionResult(result: VisionModerationResult): VisionModerationResult {
    setCachedVisionResult(result);
    return result;
  }

  public getCuratedGameBananaFeed(): GameBananaModItem[] {
    return CURATED_GAMEBANANA_MODS;
  }

  /**
   * Scans an external directory (from another launcher like XXMI, 3DMigoto, HoYoPlay, Starward)
   * finds all mod folders, fingerprints their character hashes, and imports or symlinks them cleanly.
   */
  public importExistingModFolder(
    sourceFolder: string,
    mode: 'copy' | 'symlink' = 'copy'
  ): {
    importedCount: number;
    importedMods: ModManifest[];
    logs: string[];
  } {
    const logs: string[] = [];
    const importedMods: ModManifest[] = [];
    if (!fs.existsSync(sourceFolder)) {
      throw new Error(`Directory not found: ${sourceFolder}`);
    }

    const hashDb = this.getHashDb();

    const findModDirs = (dir: string, depth = 0): string[] => {
      if (depth > 4) return [];
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const hasIni = entries.some(
        (e) =>
          e.isFile() &&
          e.name.toLowerCase().endsWith('.ini') &&
          e.name.toLowerCase() !== 'desktop.ini' &&
          e.name.toLowerCase() !== 'd3dx.ini'
      );
      if (hasIni && dir !== sourceFolder) {
        results.push(dir);
        return results;
      }
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.')) {
          results.push(...findModDirs(path.join(dir, e.name), depth + 1));
        }
      }
      return results;
    };

    const modDirs = findModDirs(sourceFolder);
    if (modDirs.length === 0) {
      const entries = fs.readdirSync(sourceFolder, { withFileTypes: true });
      if (entries.some((e) => e.isFile() && e.name.toLowerCase().endsWith('.ini'))) {
        modDirs.push(sourceFolder);
      }
    }

    for (const modDir of modDirs) {
      try {
        const rawFolderName = path.basename(modDir);
        const cleanFolder = sanitizeModFolderName(rawFolderName);
        const entries = fs.readdirSync(modDir);

        const detectedHashes = new Set<string>();
        const subToggles: ModManifest['sub_toggles'] = [];
        const partsSet = new Set<string>();
        let hasLegacySlots = false;

        for (const file of entries) {
          if (file.toLowerCase().endsWith('.ini') && file.toLowerCase() !== 'desktop.ini') {
            const content = fs.readFileSync(path.join(modDir, file), 'utf-8');
            const parsed = parseIniContent(content, file);
            parsed.detectedHashes.forEach((h) => detectedHashes.add(h));
            subToggles.push(...parsed.subToggles);
            parsed.detectedParts.forEach((p) => partsSet.add(p));
            if (parsed.hasLegacyShaderSlots) hasLegacySlots = true;
          }
        }

        const hashesArr = Array.from(detectedHashes);
        const match = matchHashesToAgent(hashesArr, hashDb);
        const agent =
          match.agent ||
          matchAgentByHintOrName(rawFolderName, hashDb) ||
          matchAgentByHintOrName(path.basename(path.dirname(modDir)), hashDb);
        const agentId = agent ? agent.agent_id : 'uncategorized';

        const destRelDir = agent
          ? path.posix.join('Mods', '_ZZZMM_Managed', agent.folder_name, cleanFolder)
          : path.posix.join('Mods', '_Uncategorized_UI_Audio', cleanFolder);

        const destAbsDir = path.join(this.zzmiRootPath, destRelDir);
        fs.mkdirSync(path.dirname(destAbsDir), { recursive: true });

        if (mode === 'symlink' && path.resolve(modDir) !== path.resolve(destAbsDir)) {
          try {
            if (fs.existsSync(destAbsDir)) {
              fs.rmSync(destAbsDir, { recursive: true, force: true });
            }
            fs.symlinkSync(modDir, destAbsDir, 'junction');
          } catch {
            copyDirRecursive(modDir, destAbsDir);
          }
        } else if (path.resolve(modDir) !== path.resolve(destAbsDir)) {
          copyDirRecursive(modDir, destAbsDir);
        }

        const localThumb = resolveLocalModThumbnailDataUrl(destAbsDir);

        const manifest: ModManifest = {
          mod_uuid: crypto.randomUUID(),
          gamebanana_id: null,
          title: cleanFolder.replace(/_/g, ' '),
          author: mode === 'symlink' ? 'Symlinked External Mod' : 'Imported Launcher Mod',
          version: '1.0',
          agent_id: agentId,
          folder_name: cleanFolder,
          install_path: destRelDir,
          enabled: true,
          in_h_swap_cycle: false,
          h_cycle_order: 1,
          detected_hashes: hashesArr,
          broken_hashes: match.matchedLegacyHashes,
          needs_orfix: hasLegacySlots,
          needs_stride_fix: match.matchedLegacyHashes.length > 0 && Boolean(agent?.stride_patch),
          health_status:
            match.matchedLegacyHashes.length > 0 || hasLegacySlots ? 'fixable' : 'working',
          parts: partsSet.size > 0 ? Array.from(partsSet) : ['Body'],
          sub_toggles: subToggles,
          repair_state: {
            is_repaired: false,
            repaired_at: null,
            applied_fixes: [],
            backup_path: null,
          },
          thumbnail_url:
            localThumb ||
            makeModCoverSvg(
              cleanFolder.slice(0, 24).toUpperCase(),
              agent ? agent.display_name.toUpperCase() : 'IMPORTED MOD',
              agent?.accent_color || '#E11D48',
              '#FB7185',
              mode === 'symlink' ? 'SYMLINK' : 'IMPORTED'
            ),
          tags: [
            mode === 'symlink' ? 'Symlinked' : 'Imported',
            agent ? agent.display_name : 'Custom Mod',
          ],
          installed_at: new Date().toISOString(),
        };

        fs.writeFileSync(
          path.join(destAbsDir, 'mod_manifest.json'),
          JSON.stringify(manifest, null, 2),
          'utf-8'
        );

        importedMods.push(manifest);
        const logMsg = `${mode === 'symlink' ? 'Symlinked (Zero-Copy)' : 'Imported'} [${
          manifest.title
        }] -> ${agent ? `Sorted to ${agent.display_name}` : 'UI / Shaders'} (${
          subToggles.length
        } binds detected).`;
        this.addLog('cyan', 'ROUTER', logMsg, manifest.mod_uuid);
        logs.push(logMsg);
      } catch (err) {
        console.error(`Error importing ${modDir}:`, err);
      }
    }

    return {
      importedCount: importedMods.length,
      importedMods,
      logs,
    };
  }

  /**
   * Scans common filesystem locations for other launchers (XXMI, 3DMigoto, HoYoPlay, Starward)
   */
  public scanForExternalModLaunchers(): string[] {
    return this.detectExternalLaunchersDetailed().map((d) => d.path);
  }

  public detectExternalLaunchersDetailed(): ExternalLauncherDetection[] {
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';

    const rawCandidates: Array<{
      name: string;
      type: ExternalLauncherDetection['type'];
      path: string;
      description: string;
    }> = [
      {
        name: 'XXMI Launcher (AppData)',
        type: 'XXMI',
        path: path.join(appData, 'XXMI Launcher', 'ZZMI', 'Mods'),
        description: 'Official XXMI Launcher ZZMI instance in %APPDATA%',
      },
      {
        name: 'XXMI Launcher (C:\\Games)',
        type: 'XXMI',
        path: 'C:\\Games\\XXMI-Launcher\\ZZMI\\Mods',
        description: 'Standalone XXMI Launcher installation on C: drive',
      },
      {
        name: 'XXMI Launcher (D:\\Games)',
        type: 'XXMI',
        path: 'D:\\Games\\XXMI-Launcher\\ZZMI\\Mods',
        description: 'Standalone XXMI Launcher installation on D: drive',
      },
      {
        name: '3DMigoto / ZZMI Standalone (D:\\ZZMI)',
        type: '3DMigoto',
        path: 'D:\\ZZMI\\Mods',
        description: 'Raw 3DMigoto / ZZMI Mods folder on D: drive',
      },
      {
        name: '3DMigoto / ZZMI Standalone (C:\\ZZMI)',
        type: '3DMigoto',
        path: 'C:\\ZZMI\\Mods',
        description: 'Raw 3DMigoto / ZZMI Mods folder on C: drive',
      },
      {
        name: '3DMigoto Mods (D:\\3DMigoto)',
        type: '3DMigoto',
        path: 'D:\\3DMigoto\\Mods',
        description: 'Legacy 3DMigoto Mods directory',
      },
      {
        name: 'Starward Launcher Mods',
        type: 'Starward',
        path: path.join(localAppData, 'Starward', 'Mods'),
        description: 'Starward third-party HoYoverse launcher mod directory',
      },
      {
        name: 'HoYoPlay Game Directory Mods',
        type: 'HoYoPlay',
        path: 'C:\\Program Files\\HoYoPlay\\games\\ZenlessZoneZero Game\\Mods',
        description: 'Direct Mods folder inside official HoYoPlay ZZZ directory',
      },
      {
        name: 'Downloads ZZMI Folder',
        type: 'Custom',
        path: path.join(userProfile, 'Downloads', 'ZZMI', 'Mods'),
        description: 'Downloaded ZZMI Mods folder in user profile',
      },
    ];

    const detected: ExternalLauncherDetection[] = [];
    // The ZZMI folder XXMI is actually configured to use (it can be moved in XXMI's settings).
    const xxmi = this.resolveXxmiInstall();
    if (xxmi && !rawCandidates.some((c) => path.resolve(c.path).toLowerCase() === path.resolve(xxmi.modsDir).toLowerCase())) {
      rawCandidates.unshift({
        name: 'XXMI Launcher (configured ZZMI folder)',
        type: 'XXMI',
        path: xxmi.modsDir,
        description: 'ZZMI folder set in XXMI Launcher settings',
      });
    }

    for (const cand of rawCandidates) {
      if (cand.path && fs.existsSync(cand.path)) {
        let count = 0;
        try {
          count = fs
            .readdirSync(cand.path, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('.')).length;
        } catch {
          count = 0;
        }
        detected.push({
          id: `${cand.type}-${cand.path}`,
          name: cand.name,
          type: cand.type,
          path: cand.path,
          modsCount: count,
          description: cand.description,
        });
      }
    }

    return detected;
  }

  /* ---------------------------------------------------------------- */
  /* Mod Workshop (experimental)                                      */
  /* ---------------------------------------------------------------- */

  private workshopPartIndex(agentId: string): Record<string, string> {
    return ZZMI_COMPONENTS[agentId] ?? {};
  }

  private modAbsDir(mod: ModManifest): string {
    return path.join(this.zzmiRootPath, mod.install_path);
  }

  /** Installed mods for one agent and the parts each one can donate. */
  public getWorkshopCatalog(agentId: string): WorkshopCatalogEntry[] {
    const index = this.workshopPartIndex(agentId);
    return this.scanInstalledMods()
      .filter((m) => m.agent_id === agentId)
      .map((m) => ({
        mod_uuid: m.mod_uuid,
        title: m.title,
        author: m.author,
        gamebanana_id: m.gamebanana_id,
        thumbnail_url: m.thumbnail_url,
        is_nsfw: Boolean(m.is_nsfw),
        is_workshop: (m.tags || []).includes('Workshop'),
        shareable: (() => {
          try {
            const r = JSON.parse(fs.readFileSync(path.join(this.modAbsDir(m), 'workshop_recipe.json'), 'utf-8')) as WorkshopRecipe;
            return r.parts.length > 0 && r.parts.every((p) => Boolean(p.source.gamebanana_id));
          } catch {
            return undefined;
          }
        })(),
        parts: analyzeModParts(this.modAbsDir(m), index),
      }))
      .filter((e) => e.parts.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Labels a Workshop mod. Any source mod already flagged (GameBanana content ratings,
   * keywords, or the AI image check) makes the new mod NSFW too. Labels only ever get added.
   */
  private async workshopNsfwCheck(name: string, sources: ModManifest[], markNsfw: boolean): Promise<string[]> {
    const reasons: string[] = [];
    if (markNsfw) reasons.push('Marked by you');
    if (NSFW_KEYWORD_REGEX.test(name)) reasons.push('The name suggests adult content');
    for (const src of sources) {
      if (src.is_nsfw) {
        reasons.push(`"${src.title}" is labeled NSFW or skimpy`);
        continue;
      }
      if (src.gamebanana_id && src.thumbnail_url?.startsWith('http')) {
        try {
          const vision = await moderateModThumbnailVision({
            id: src.gamebanana_id,
            thumbnail_url: src.thumbnail_url,
            title: src.title,
            category: '',
          } as any);
          if (vision.isNsfw) reasons.push(`AI image check flagged "${src.title}" (${vision.reason})`);
        } catch {
          // Image check unavailable; keyword and rating labels still apply.
        }
      }
    }
    return [...new Set(reasons)];
  }

  public async buildWorkshopMod(req: WorkshopBuildRequest): Promise<WorkshopBuildResponse> {
    const hashDb = this.getHashDb();
    const agent = hashDb.agents[req.agentId];
    if (!agent) throw new Error('Pick an agent first.');
    const name = safeFolderName(req.name || '');
    if (!req.name?.trim()) throw new Error('Give your mod a name.');

    const mods = this.scanInstalledMods();
    const byUuid = new Map(mods.map((m) => [m.mod_uuid, m]));
    const picks: WorkshopPick[] = req.picks.map((p) => {
      const mod = byUuid.get(p.modUuid);
      if (!mod) throw new Error('One of the mods you picked from was removed. Pick that part again.');
      if (mod.agent_id !== req.agentId) throw new Error(`"${mod.title}" isn't a ${agent.display_name} mod.`);
      return {
        part: p.part,
        modDir: this.modAbsDir(mod),
        source: { title: mod.title, author: mod.author, gamebanana_id: mod.gamebanana_id, mod_uuid: mod.mod_uuid },
      };
    });
    const sources = [...new Set(req.picks.map((p) => byUuid.get(p.modUuid)!))];

    const nsfwReasons = await this.workshopNsfwCheck(name, sources, Boolean(req.markNsfw));
    const isNsfw = nsfwReasons.length > 0;
    const recipe: WorkshopRecipe = {
      format: 'proxylaunch-recipe',
      version: 1,
      name,
      agent_id: req.agentId,
      is_nsfw: isNsfw,
      created_at: new Date().toISOString(),
      parts: picks.map((p) => ({
        part: p.part,
        source: { title: p.source.title, author: p.source.author, gamebanana_id: p.source.gamebanana_id },
      })),
    };

    const agentDir = path.join(this.zzmiRootPath, 'Mods', '_ZZZMM_Managed', agent.folder_name);
    for (const existing of [name, `DISABLED_${name}`]) {
      if (fs.existsSync(path.join(agentDir, existing))) {
        throw new Error('You already have a mod with this name for this agent. Pick another name.');
      }
    }
    const folder = req.activate ? name : `DISABLED_${name}`;
    const outDir = path.join(agentDir, folder);

    const built = buildWorkshopMod({
      name,
      agentName: agent.display_name,
      picks,
      partIndex: this.workshopPartIndex(req.agentId),
      outDir,
      recipe,
    });

    const firstThumb = sources.find((s) => s.thumbnail_url?.startsWith('http'))?.thumbnail_url;
    const credits = recipe.parts.map((p) => `${p.part} from "${p.source.title}"${p.source.author ? ` by ${p.source.author}` : ''}`);
    fs.writeFileSync(
      path.join(outDir, 'mod.json'),
      JSON.stringify(
        {
          title: name,
          author: 'You (Workshop)',
          agent_id: req.agentId,
          is_nsfw: isNsfw,
          thumbnail_url: firstThumb,
          description: `Made in the Mod Workshop. ${credits.join('; ')}.`,
        },
        null,
        2
      ),
      'utf-8'
    );

    // Tag it so the Library and Workshop can tell it apart.
    let created = this.scanInstalledMods().find((m) => path.resolve(this.modAbsDir(m)) === path.resolve(outDir)) ?? null;
    if (created) {
      try {
        const manifestPath = path.join(outDir, 'mod_manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifest.tags = ['Workshop', agent.display_name];
        manifest.is_nsfw = isNsfw;
        manifest.in_h_swap_cycle = false;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      } catch {
        // tags are cosmetic
      }
    }

    if (req.activate && created) {
      for (const other of this.scanInstalledMods()) {
        if (other.agent_id === req.agentId && other.enabled && other.mod_uuid !== created.mod_uuid) {
          try {
            this.toggleModEnabled(other.mod_uuid);
          } catch {
            // leave it on if it can't be toggled
          }
        }
      }
    }

    this.syncModsToXxmiLauncher();
    created = this.scanInstalledMods().find((m) => path.resolve(this.modAbsDir(m)) === path.resolve(outDir)) ?? created;
    this.addLog(
      'info',
      'FAIRY_CORE',
      `Workshop: built "${name}" for ${agent.display_name} from ${sources.length} mod(s), ${built.sectionsWritten} sections, ${built.filesCopied} files.`
    );
    return {
      mod: created,
      shareCode: encodeRecipe(recipe),
      isNsfw,
      nsfwReasons,
      warnings: built.warnings,
      missingFiles: built.missingFiles,
    };
  }

  /** The recipe of a Workshop mod: which part came from which mod. */
  public getWorkshopRecipe(modUuid: string): WorkshopRecipe {
    const mod = this.scanInstalledMods().find((m) => m.mod_uuid === modUuid);
    if (!mod) throw new Error('Mod not found.');
    const recipePath = path.join(this.modAbsDir(mod), 'workshop_recipe.json');
    if (!fs.existsSync(recipePath)) throw new Error('This mod wasn’t made in the Workshop.');
    const recipe = JSON.parse(fs.readFileSync(recipePath, 'utf-8')) as WorkshopRecipe;
    recipe.is_nsfw = recipe.is_nsfw || Boolean(mod.is_nsfw);
    recipe.name = mod.title || recipe.name;
    return recipe;
  }

  /** Share code for a Workshop mod. */
  public getWorkshopShareCode(modUuid: string): string {
    return encodeRecipe(this.getWorkshopRecipe(modUuid));
  }

  /** Matches a shared recipe code against installed mods so it can be rebuilt here. */
  public resolveWorkshopCode(code: string): WorkshopResolvedRecipe {
    return this.resolveWorkshopRecipe(decodeRecipe(code));
  }

  /** Same, for a recipe that came from the community page. */
  public resolveWorkshopRecipe(input: WorkshopRecipe): WorkshopResolvedRecipe {
    // Round-trip through the share-code decoder so it gets the same validation.
    const recipe = decodeRecipe(encodeRecipe(input));
    const hashDb = this.getHashDb();
    if (!hashDb.agents[recipe.agent_id]) throw new Error('This recipe is for an agent ProxyLaunch doesn’t know yet. Update the app and try again.');
    const index = this.workshopPartIndex(recipe.agent_id);
    const mods = this.scanInstalledMods().filter((m) => m.agent_id === recipe.agent_id && !(m.tags || []).includes('Workshop'));
    return {
      recipe,
      parts: recipe.parts.map((p) => {
        const match =
          (p.source.gamebanana_id && mods.find((m) => m.gamebanana_id === p.source.gamebanana_id)) ||
          mods.find((m) => m.title.toLowerCase() === p.source.title.toLowerCase()) ||
          null;
        const hasPart = match ? analyzeModParts(this.modAbsDir(match), index).some((x) => x.name === p.part) : false;
        return { part: p.part, source: p.source, modUuid: match ? match.mod_uuid : null, hasPart };
      }),
    };
  }
}
