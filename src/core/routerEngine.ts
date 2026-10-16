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
      Object.values(agent.current_hashes).map((h) => h.toLowerCase())
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
