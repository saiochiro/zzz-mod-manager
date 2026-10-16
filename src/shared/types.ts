export type FairyState = 'idle' | 'processing' | 'alert';

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
  sub_toggles: SubToggle[];
  repair_state: RepairState;
  thumbnail_url?: string;
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
  element: 'Ice' | 'Fire' | 'Electric' | 'Physical' | 'Ether' | 'Frost';
  accent_color: string;
  portrait_svg: string;
  current_hashes: AgentHashes;
  legacy_hash_migrations: Record<string, string>;
  stride_patch?: StridePatchRule;
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
  rawContent: string;
}

export interface GameBananaModItem {
  id: number;
  title: string;
  author: string;
  category: string;
  agent_hint?: string;
  likes: number;
  downloads: number;
  views: number;
  updated_at: string;
  thumbnail_url: string;
  profile_url: string;
  download_url: string;
  file_name: string;
  file_size: number;
  md5_checksum: string;
  description: string;
  is_live_api?: boolean;
  preset_scenario?: 'clean_ellen' | 'broken_miyabi' | 'multi_pack' | 'jane_cyber' | 'zhuyuan_tactical' | 'burnice_biker' | 'ui_hud';
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
