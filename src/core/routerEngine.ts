import { AgentHashEntry, HashDatabase } from '../shared/types';

export interface HashMatchResult {
  agent: AgentHashEntry | null;
  matchedCurrentHashes: string[];
  matchedLegacyHashes: string[]; // hashes that need migration repair
}

/**
 * Matches a list of 8-char hex hashes extracted from a mod's .ini files
 * against the HashDatabase (`hash_db.json`).
 */
export function matchHashesToAgent(
  hashes: string[],
  hashDb: HashDatabase
): HashMatchResult {
  const normalized = hashes.map((h) => h.toLowerCase());

  let bestAgent: AgentHashEntry | null = null;
  let bestScore = 0;
  let bestCurrent: string[] = [];
  let bestLegacy: string[] = [];

  for (const agent of Object.values(hashDb.agents)) {
    const currentSet = new Set(
      [...Object.values(agent.current_hashes), ...(agent.component_hashes ?? [])]
        .filter(Boolean)
        .map((h) => h.toLowerCase())
    );
    const legacyMap = agent.legacy_hash_migrations || {};

    const matchedCurrent: string[] = [];
    const matchedLegacy: string[] = [];

    for (const h of normalized) {
      if (currentSet.has(h)) {
        matchedCurrent.push(h);
      } else if (legacyMap[h]) {
        matchedLegacy.push(h);
      }
    }

    const totalScore = matchedCurrent.length + matchedLegacy.length;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestAgent = agent;
      bestCurrent = matchedCurrent;
      bestLegacy = matchedLegacy;
    }
  }

  return {
    agent: bestAgent,
    matchedCurrentHashes: bestCurrent,
    matchedLegacyHashes: bestLegacy,
  };
}

/**
 * Sanitizes a folder or file name, stripping illegal characters and
 * removing any leading DISABLED_ prefix when normalizing.
 */
export function sanitizeModFolderName(rawName: string): string {
  const cleaned = rawName
    .replace(/^DISABLED[_-]*/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'Unnamed_Mod';
}

export function formatDisabledFolderName(cleanFolderName: string): string {
  const base = cleanFolderName.replace(/^DISABLED[_-]*/i, '');
  return `DISABLED_${base}`;
}

export function isFolderDisabled(folderName: string): boolean {
  return /^DISABLED[_-]*/i.test(folderName);
}

/**
 * Matches an agent from the database using a GameBanana category ID.
 */
export function matchAgentByGbCategory(
  gbCategoryId: number | undefined | null,
  hashDb: HashDatabase
): AgentHashEntry | null {
  if (!gbCategoryId || !hashDb?.agents) return null;
  for (const agent of Object.values(hashDb.agents)) {
    if (agent.gb_category_id === gbCategoryId) {
      return agent;
    }
  }
  return null;
}

export const AGENT_ALIASES: Record<string, string> = {
  clarette: 'claret_flint',
  claret: 'claret_flint',
  aria: 'aria',
  roxy: 'roxy_ifrita_pryce',
  phoenix: 'phoenix_reffaella',
  ifrita: 'roxy_ifrita_pryce',
  lucia: 'lucia_elowen',
  alice: 'alice_thymefield',
  vivian: 'vivian_banshee',
  hugo: 'hugo_vlad',
  vlad: 'hugo_vlad',
  seed: 'seed',
  orphie: 'orphie_magnusson',
  magnusson: 'orphie_magnusson',
  banyue: 'banyue',
  dialyn: 'dialyn',
  zhao: 'zhao',
  cissia: 'cissia',
  promeia: 'promeia',
  norma: 'norma_hollowell',
  velina: 'velina_airgid',
  airgid: 'velina_airgid',
  pyrois: 'pyrois',
  remielle: 'remielle_dan',
  sigrid: 'sigrid_de_lazur',
  lazur: 'sigrid_de_lazur',
  yuzuha: 'yuzuha_ukinami',
  ukinami: 'yuzuha_ukinami',
  komano: 'komano_manato',
  manato: 'komano_manato',
  nangong: 'nangong_yu',
  sunna: 'sunna',
};

/**
 * Matches an agent from the database using text hints, folder name, or title.
 */
export function matchAgentByHintOrName(
  textHint: string | undefined | null,
  hashDb: HashDatabase
): AgentHashEntry | null {
  if (!textHint || !hashDb?.agents) return null;
  const clean = textHint.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Direct alias check for known character nicknames & single keywords
  for (const token of tokens) {
    const targetAgentId = AGENT_ALIASES[token];
    if (targetAgentId && hashDb.agents[targetAgentId]) {
      return hashDb.agents[targetAgentId];
    }
  }

  let bestMatch: AgentHashEntry | null = null;
  let bestScore = 0;

  for (const agent of Object.values(hashDb.agents)) {
    let score = 0;
    const agentIdNorm = agent.agent_id.toLowerCase().replace(/_/g, ' ');
    const displayNorm = agent.display_name.toLowerCase();
    const folderNorm = agent.folder_name.toLowerCase();

    if (clean.includes(displayNorm)) {
      score += 50;
    } else if (clean.includes(folderNorm)) {
      score += 40;
    } else if (clean.includes(agentIdNorm)) {
      score += 40;
    } else {
      const nameParts = displayNorm
        .split(/\s+/)
        .filter((p) => p.length > 2 && p !== 'von' && p !== 'the' && p !== 'proxy');
      for (const part of nameParts) {
        if (tokens.includes(part)) {
          score += 25;
        } else if (clean.includes(part)) {
          score += 15;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = agent;
    }
  }

  return bestScore >= 20 ? bestMatch : null;
}

