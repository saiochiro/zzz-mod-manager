import type { ModManifest } from './types';

/**
 * An outfit: anything that changes how a character looks (skins, hair, parts, Workshop mixes),
 * whatever its tag says. Weapons and voice/audio mods aren't outfits, and mods with no character
 * (UI, effects) never are.
 */
export function isOutfitMod(m: Pick<ModManifest, 'agent_id' | 'category_tag'>): boolean {
  return m.agent_id !== 'uncategorized' && m.category_tag !== 'Weapons' && m.category_tag !== 'Audio';
}
