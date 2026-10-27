import type { ModManifest } from './types';

export interface ModClash {
  /** The other mod that is on and changes the same things. */
  modUuid: string;
  title: string;
  /** How many game hashes both mods change. */
  shared: number;
}

type ClashMod = Pick<ModManifest, 'mod_uuid' | 'title' | 'enabled' | 'agent_id' | 'detected_hashes' | 'in_h_swap_cycle'>;

/**
 * Mods that are on and change the same game hashes, so only one of them can show in game.
 * Outfits of a character that are both in its outfit rotation don't clash: the rotation key shows
 * one at a time. Returns, for each mod with a clash, the mods it clashes with (most shared first).
 */
export function findClashes(mods: ClashMod[]): Map<string, ModClash[]> {
  const out = new Map<string, ModClash[]>();
  const groups = new Map<string, ClashMod[]>();
  for (const m of mods) {
    if (!m.enabled || !(m.detected_hashes || []).length) continue;
    groups.set(m.agent_id, [...(groups.get(m.agent_id) || []), m]);
  }
  for (const [agentId, list] of groups) {
    const sets = list.map((m) => new Set(m.detected_hashes.map((h) => h.toLowerCase())));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (agentId !== 'uncategorized' && a.in_h_swap_cycle && b.in_h_swap_cycle) continue;
        let shared = 0;
        for (const h of sets[i]) if (sets[j].has(h)) shared++;
        if (!shared) continue;
        out.set(a.mod_uuid, [...(out.get(a.mod_uuid) || []), { modUuid: b.mod_uuid, title: b.title, shared }]);
        out.set(b.mod_uuid, [...(out.get(b.mod_uuid) || []), { modUuid: a.mod_uuid, title: a.title, shared }]);
      }
    }
  }
  for (const list of out.values()) list.sort((x, y) => y.shared - x.shared);
  return out;
}
