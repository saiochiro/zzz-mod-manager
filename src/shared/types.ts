export type FairyState = 'idle' | 'processing' | 'alert';

export type ModHealthStatus = 'working' | 'fixable' | 'broken';

export type NsfwFilterState = 'hide' | 'blur' | 'show';

export interface FairyLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'cyan' | 'warning' | 'error' | 'success';
  source: 'FAIRY_CORE' | 'ROUTER' | 'H_MERGER' | 'REPAIR_ENG' | 'GB_INGEST' | 'ZZMI_HOOK';
  message: string;
  modUuid?: string;
}

export interface SubToggle {
  section_name: string;
  variable: string;
  label: string;
  original_key: string;
  current_key: string;
  back_key?: string;
  states: string[];
  ini_file?: string;
}

export interface RepairDiffLog {
  file: string;
  line: number;
  stage: 'HASH_MIGRATION' | 'ZZMI_ORFIX_INJECT' | 'VERTEX_STRIDE_REMAP';
  before: string;
  after: string;
}

export interface RepairState {
  is_repaired: boolean;
  repaired_at: string | null;
  applied_fixes: string[];
  backup_path: string | null;
  backup_sha256?: Record<string, string>;
  diff_logs?: RepairDiffLog[];
}

export interface ModManifest {
  mod_uuid: string;
  gamebanana_id: number | null;
  title: string;
  author: string;
  version?: string;
  agent_id: string; // e.g. 'ellen_joe', 'miyabi', 'jane_doe', or 'uncategorized'
  folder_name: string;
  install_path: string; // relative to ZZMI_Root
  enabled: boolean;
  in_h_swap_cycle: boolean;
  h_cycle_order: number;
  detected_hashes: string[];
  broken_hashes: string[]; // hashes matching legacy_hash_migrations
  needs_orfix: boolean;
  needs_stride_fix: boolean;
  health_status?: ModHealthStatus; // 'working' | 'fixable' | 'broken'
  missing_resources?: string[]; // Missing .buf / .ib / .dds / .ini files
  parts?: string[]; // Sub-component mesh parts e.g. ['Hair', 'Body', 'Dress', 'Weapon']
  category_tag?: 'Skins' | 'Weapons' | 'UI' | 'Audio';
  is_nsfw?: boolean;
  file_size_bytes?: number;
  previous_folder_name?: string;
  previous_install_path?: string;
  sub_toggles: SubToggle[];
  repair_state: RepairState;
  thumbnail_url?: string;
  preview_images?: string[];
  description?: string;
  tags: string[];
  installed_at: string;
  md5_checksum?: string;
  sanitized_warnings?: string[];
}

export interface AgentHashes {
  position_vb: string;
  blend_vb: string;
  texcoord_vb: string;
  ib: string;
}

export interface StridePatchRule {
  expected_stride: number;
  bone_index_map: Record<number, number>;
  description: string;
}

export interface AgentHashEntry {
  agent_id: string;
  display_name: string;
  folder_name: string;
  faction: string;
  element: 'Ice' | 'Fire' | 'Electric' | 'Physical' | 'Ether' | 'Frost' | 'Wind' | 'Unknown';
  accent_color: string;
  portrait_svg: string;
  current_hashes: AgentHashes;
  legacy_hash_migrations: Record<string, string>;
  stride_patch?: StridePatchRule;
  gb_category_id?: number;
  gb_icon_url?: string;
}

export interface HashDatabase {
  schema_version: string;
  game_patch: string;
  last_synced: string;
  agents: Record<string, AgentHashEntry>;
}

export interface AppConfig {
  appDataPath: string;
  zzmiRootPath: string;
  zzzExePath: string;
  zzmiLoaderPath: string;
  autoCompileHSwap: boolean;
  autoSendF10OnToggle: boolean;
  uriSchemeRegistered: boolean;
  cloudHashSyncUrl: string;
  sandboxMode: boolean;
  activeTheme?: string;
  hideNsfw?: boolean;
  nsfwMode?: 'hide' | 'blur';
  nsfwFilterState?: NsfwFilterState; // 'hide' | 'blur' | 'show'
  singleActivePerAgent?: boolean;
  activeProfile?: string;
  profiles?: Record<string, string[]>; // profileName -> list of enabled mod_uuids
  defaultModHandler?: boolean;
  xxmiModsPath?: string;
  modStorageLibraryPath?: string;
}

export interface ParsedIniSection {
  name: string; // e.g., "TextureOverrideEllenPosition"
  type: 'TextureOverride' | 'ShaderOverride' | 'Key' | 'Constants' | 'Resource' | 'CommandList' | 'Other';
  startLine: number;
  endLine: number;
  entries: Record<string, string>;
  rawLines: string[];
  hash?: string;
  hasLegacySlots?: boolean;
}

export interface ParsedIniDocument {
  filePath: string;
  fileName: string;
  sections: ParsedIniSection[];
  detectedHashes: string[];
  subToggles: SubToggle[];
  hasLegacyShaderSlots: boolean;
  referencedFiles: string[];
  detectedParts: string[];
  rawContent: string;
}

export interface GameBananaModItem {
  id: number;
  title: string;
  author: string;
  submitter_id?: number;
  author_avatar_url?: string;
  author_profile_url?: string;
  category: string;
  category_id?: number;
  category_tag?: 'Skins' | 'Weapons' | 'UI' | 'Audio';
  agent_hint?: string;
  likes: number;
  downloads: number;
  views: number;
  likes_count?: number;
  downloads_count?: number;
  views_count?: number;
  updated_at: string;
  thumbnail_url: string;
  preview_images?: string[];
  profile_url: string;
  download_url: string;
  file_name: string;
  file_size: number;
  md5_checksum: string;
  description: string;
  is_live_api?: boolean;
  is_nsfw?: boolean;
  nsfw_reason?: string;
  is_featured?: boolean;
  content_rating?: string;
  preset_scenario?: 'clean_ellen' | 'broken_miyabi' | 'multi_pack' | 'jane_cyber' | 'zhuyuan_tactical' | 'burnice_biker' | 'ui_hud';
}

export type LaunchMode = 'modded' | 'vanilla';

export interface LaunchResult {
  success: boolean;
  mode: LaunchMode;
  compiledAgents: string[];
  activeModsCount: number;
  message: string;
  error?: string;
  loaderSpawned?: boolean;
  gameSpawned?: boolean;
}

export interface VisionModerationResult {
  modId: number;
  thumbnailUrl: string;
  isNsfw: boolean;
  confidence: number;
  reason: string;
  checkedAt: string;
}

export interface DownloadQueueItem {
  queue_id: string;
  mod_id: number | null;
  title: string;
  status: 'queued' | 'downloading' | 'unpacking' | 'routing' | 'completed' | 'error';
  progress: number;
  stage_label: string;
  error?: string;
}

export interface MultiAgentCandidate {
  agent_id: string;
  agent_name: string;
  subfolder_name: string;
  subfolder_path: string;
  detected_hashes: string[];
}

export interface IngestionResult {
  success: boolean;
  installedMods: ModManifest[];
  multiAgentPrompt?: {
    stagingId: string;
    archiveName: string;
    candidates: MultiAgentCandidate[];
  };
  logs: string[];
  error?: string;
}

export interface ExternalLauncherDetection {
  id: string;
  name: string;
  type: 'XXMI' | '3DMigoto' | 'HoYoPlay' | 'Starward' | 'Custom';
  path: string;
  modsCount: number;
  description: string;
}
