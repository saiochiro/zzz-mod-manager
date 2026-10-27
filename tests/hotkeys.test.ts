import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { groupToggles, planModKeys, RESERVED_KEYS, scopeKeysToCharacter, toggleId } from '../src/shared/hotkeys';
import { parseIniContent } from '../src/core/iniParser';
import { ModManagerService } from '../src/core/modManagerService';

const MOD = [
  '[Constants]',
  'global persist $jacket = 1',
  'global persist $hair = 0',
  'global persist $bangs = 0',
  '',
  '[KeyJacket]',
  'key = J',
  'type = cycle',
  '$jacket = 0,1',
  '',
  '[KeyHair]',
  'key = K',
  'type = cycle',
  '$hair = 0,1',
  '',
  '[KeyBangs]',
  'key = K',
  'type = cycle',
  '$bangs = 0,1',
  '',
  '[TextureOverrideEllenPosition]',
  'hash = b78f3616',
  'vb0 = ResourceEllenPosition',
  '',
].join('\n');

describe('Tidy hotkeys', () => {
  it('gives every toggle of a mod its own key, never a game control or H', () => {
    const toggles = parseIniContent(MOD, 'mod.ini').subToggles;
    const plan = planModKeys(toggles);
    const keys = [...plan.values()];
    expect(new Set(keys).size).toBe(keys.length); // no two toggles on one key
    // Top to bottom: J, K, L...
    expect([...plan.values()]).toEqual(['J', 'K', 'L']);
    for (const k of keys) expect(RESERVED_KEYS.has(k)).toBe(false);
  });

  it('an option repeated in several files keeps one key everywhere, and shows as one row', () => {
    const hairA = { section_name: 'KeyHair', variable: '$hair', ini_file: 'hair/a.ini', current_key: 'K', states: ['0', '1'], label: 'hair' };
    const hairB = { ...hairA, section_name: 'KeyHairSwap', ini_file: 'hair/b.ini' };
    const tail = { ...hairA, section_name: 'KeyTail', variable: '$tail', ini_file: 'hair/b.ini' };
    const plan = planModKeys([hairA, hairB, tail]);
    expect(plan.get(toggleId(hairA))).toBe('J');
    expect(plan.get(toggleId(hairB))).toBe('J'); // same option, other file: same key
    expect(plan.get(toggleId(tail))).toBe('K');
    const rows = groupToggles([{ ...hairA, current_key: 'J' }, { ...hairB, current_key: 'J' }, { ...tail, current_key: 'K' }]);
    expect(rows.map((r) => [r.toggle.variable, r.sections, r.files])).toEqual([
      ['$hair', ['KeyHair', 'KeyHairSwap'], 2],
      ['$tail', ['KeyTail'], 1],
    ]);
  });

  it("makes keys work only while the mod's character is on screen", () => {
    const { text, scoped } = scopeKeysToCharacter(MOD);
    expect(scoped).toBe(3);
    expect(text).toMatch(/\[KeyJacket\]\ncondition = \$pl_active == 1/);
    expect(text).toMatch(/hash = b78f3616\n\$pl_active = 1/);
    expect(text).toMatch(/global \$pl_active = 0/);
    expect(text).toMatch(/\[Present\]\npost \$pl_active = 0/);
    // Running it again changes nothing.
    expect(scopeKeysToCharacter(text).text).toBe(text);
  });

  it("uses the mod's own $active flag when it has one, and leaves keys that already have a condition", () => {
    const own = MOD.replace('global persist $bangs = 0', 'global persist $bangs = 0\nglobal $active = 0')
      .replace('vb0 = ResourceEllenPosition', 'vb0 = ResourceEllenPosition\n$active = 1')
      .replace('[KeyBangs]\nkey = K', '[KeyBangs]\ncondition = $active == 1\nkey = K');
    const { text, scoped } = scopeKeysToCharacter(own);
    expect(scoped).toBe(2);
    expect(text).toMatch(/\[KeyJacket\]\ncondition = \$active == 1/);
    expect(text).not.toMatch(/pl_active/);
    expect(text.match(/condition = \$active == 1/g)).toHaveLength(3);
  });

  it('leaves files without a character override alone', () => {
    const keysOnly = '[KeyMenu]\nkey = J\ntype = cycle\n$menu = 0,1\n';
    expect(scopeKeysToCharacter(keysOnly)).toEqual({ text: keysOnly, scoped: 0 });
  });
});

describe('Updating a mod keeps its on/off state', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('replaces a switched-off mod with a switched-off new version and keeps the old one in backups', async () => {
    const service = new ModManagerService(dir);
    const make = (name: string) => {
      const src = path.join(dir, 'src', name);
      fs.mkdirSync(src, { recursive: true });
      fs.writeFileSync(path.join(src, 'EllenMod.ini'), MOD);
      return src;
    };
    const first = await service.ingestPackage(make('Cool Ellen'));
    expect(first.success).toBe(true);
    const old = first.installedMods[0];
    service.toggleModEnabled(old.mod_uuid); // off
    const res = await service.ingestPackage(make('Cool Ellen v2'), { replaceModUuid: old.mod_uuid });
    expect(res.success).toBe(true);
    const mods = service.scanInstalledMods();
    // Same mod (same id), new files; the old files are in backups.
    expect(res.installedMods[0].mod_uuid).toBe(old.mod_uuid);
    const fresh = mods.find((m) => m.mod_uuid === old.mod_uuid)!;
    expect(fresh.folder_name).toBe('Cool_Ellen_v2');
    expect(mods.filter((m) => m.mod_uuid === old.mod_uuid)).toHaveLength(1);
    expect(fresh.enabled).toBe(false);
    expect(fs.readdirSync(path.join(dir, 'ZZZ_Mod_Manager_AppData', 'backups', 'mod-updates')).length).toBe(1);
  });
});
