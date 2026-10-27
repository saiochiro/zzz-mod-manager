import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickGameBananaFile } from '../src/core/gamebananaService';
import { ModManagerService, reapplyHotkeys } from '../src/core/modManagerService';
import type { ModManifest } from '../src/shared/types';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

const read = (p: string) => fs.readFileSync(p, 'utf-8');
const modDir = (m: Pick<ModManifest, 'install_path'>) => path.join(dir, 'ZZMI_Root', m.install_path);
/** The `key = ...` value of one [Key...] section. */
function keyOf(text: string, section: string): string | null {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim().toLowerCase() === `[${section.toLowerCase()}]`);
  if (at < 0) return null;
  for (const l of lines.slice(at + 1)) {
    if (/^\s*\[/.test(l)) break;
    const m = l.match(/^\s*key\s*=\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}
function writeMod(folder: string, ini: string, extra: Record<string, string | Buffer> = {}): string {
  const src = path.join(dir, 'src', crypto.randomUUID(), folder);
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'mod.ini'), ini);
  for (const [f, v] of Object.entries(extra)) fs.writeFileSync(path.join(src, f), v);
  return src;
}
function patchManifest(service: ModManagerService, m: ModManifest, patch: Partial<ModManifest>): void {
  for (const f of ['mod_manifest.json', 'mod.json']) {
    const p = path.join(modDir(m), f);
    if (fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(read(p)), ...patch }, null, 2));
  }
  service.invalidateModCache();
}
const byId = (service: ModManagerService, id: string) => service.scanInstalledMods().find((m) => m.mod_uuid === id)!;

const SKIN_V1 = [
  '[Constants]',
  'global $hair = 0',
  'global $tail = 0',
  '[KeyHair]',
  'key = K',
  '$hair = 0,1',
  '[KeyTail]',
  'key = O',
  '$tail = 0,1',
  '[TextureOverrideBody]',
  'hash = 1a2b3c4d',
  '[Present]',
  '',
].join('\n');
const SKIN_V2 = SKIN_V1.replace('[TextureOverrideBody]', '[KeyFace]\nkey = Y\n$face = 0,1\n[TextureOverrideBody]').replace(
  'global $tail = 0',
  'global $tail = 0\nglobal $face = 0'
);

describe('Updates keep the mod identity', () => {
  it('keeps the id, cover, outfit rotation, loadouts and the user keys', async () => {
    const service = new ModManagerService(dir);
    const v1 = (await service.ingestPackage(writeMod('Cool Skin', SKIN_V1))).installedMods[0];
    const id = v1.mod_uuid;

    // The user's setup: Tidy keys, then their own key for hair, a cover, rotation, a loadout.
    service.standardizeAllModHotkeys();
    service.remapModSubToggle(id, 'KeyHair', 'VK_NUMPAD1');
    const tailKey = keyOf(read(path.join(modDir(byId(service, id)), 'mod.ini')), 'KeyTail');
    service.setCustomModThumbnail(id, `data:image/png;base64,${Buffer.from('CUSTOM COVER').toString('base64')}`);
    service.toggleModHCycle(id);
    const rotation = byId(service, id).in_h_swap_cycle;
    service.saveLoadoutProfile('Mine');

    // The new version ships its own preview and a new toggle.
    const res = await service.ingestPackage(writeMod('Cool Skin', SKIN_V2, { 'preview.png': 'AUTHOR COVER' }), { replaceModUuid: id });
    expect(res.installedMods).toHaveLength(1);
    expect(res.installedMods[0].mod_uuid).toBe(id);

    const now = byId(service, id);
    expect(service.scanInstalledMods().filter((m) => m.mod_uuid === id)).toHaveLength(1);
    expect(now.in_h_swap_cycle).toBe(rotation);
    expect(now.custom_cover).toBe('preview.png');
    expect(read(path.join(modDir(now), 'preview.png'))).toBe('CUSTOM COVER');
    const ini = read(path.join(modDir(now), 'mod.ini'));
    expect(keyOf(ini, 'KeyHair')).toBe('VK_NUMPAD1');
    expect(keyOf(ini, 'KeyTail')).toBe(tailKey);
    expect(keyOf(ini, 'KeyFace')).toBe('Y'); // new in this version: the author's key
    expect(ini).toMatch(/condition\s*=\s*\$pl_active == 1/i); // Tidy keys' "only on screen" is back

    // The saved loadout still knows the mod.
    service.setModsEnabled([{ modUuid: id, enabled: false }]);
    service.applyLoadoutProfile('Mine');
    expect(byId(service, id).enabled).toBe(true);
  });

  it('matches keys by section, then by variable', () => {
    const a = path.join(dir, 'a');
    const b = path.join(dir, 'b');
    fs.mkdirSync(a);
    fs.mkdirSync(b);
    fs.writeFileSync(path.join(a, 'Skin.ini'), '[KeyHair]\nkey = VK_NUMPAD3\n$hair = 0,1\n[KeyOld]\nkey = P\n$tail = 0,1\n');
    fs.writeFileSync(path.join(b, 'Skin_v2.ini'), '[KeyHair]\nkey = K\n$hair = 0,1\n[KeyTailRenamed]\nkey = O\n$tail = 0,1\n');
    expect(reapplyHotkeys(a, b, false)).toBe(2);
    const t = read(path.join(b, 'Skin_v2.ini'));
    expect(keyOf(t, 'KeyHair')).toBe('VK_NUMPAD3');
    expect(keyOf(t, 'KeyTailRenamed')).toBe('P');
  });
});

describe('Switching mods on and off', () => {
  it('moves a leftover folder out of the way instead of failing or turning the wrong copy on', async () => {
    const service = new ModManagerService(dir);
    const mod = (await service.ingestPackage(writeMod('Neat Skin', SKIN_V1))).installedMods[0];
    service.toggleModEnabled(mod.mod_uuid); // off: DISABLED_Neat_Skin
    const off = byId(service, mod.mod_uuid);
    expect(off.enabled).toBe(false);
    // A leftover with the "on" name (an old copy, no .ini left in it).
    const leftover = path.join(path.dirname(modDir(off)), mod.folder_name);
    fs.mkdirSync(leftover, { recursive: true });
    fs.writeFileSync(path.join(leftover, 'old.txt'), 'old');
    service.invalidateModCache();

    service.toggleModEnabled(mod.mod_uuid);
    const on = byId(service, mod.mod_uuid);
    expect(on.enabled).toBe(true);
    expect(fs.existsSync(path.join(modDir(on), 'mod.ini'))).toBe(true);
    expect(service.listBackups().some((b) => b.kind === 'leftover')).toBe(true);
  });

  it('gives the mod a free name when the name belongs to a different mod', async () => {
    const service = new ModManagerService(dir);
    const a = (await service.ingestPackage(writeMod('Same Name', SKIN_V1))).installedMods[0];
    service.setModsEnabled([{ modUuid: a.mod_uuid, enabled: false }]);
    const other = (await service.ingestPackage(writeMod('Same Name', SKIN_V1.replace('1a2b3c4d', '99999999')))).installedMods[0];
    expect(byId(service, other.mod_uuid).enabled).toBe(true);

    service.setModsEnabled([{ modUuid: a.mod_uuid, enabled: true }]);
    const aOn = byId(service, a.mod_uuid);
    expect(aOn.enabled).toBe(true);
    expect(aOn.install_path).not.toBe(byId(service, other.mod_uuid).install_path);
    expect(byId(service, other.mod_uuid).enabled).toBe(true);
  });
});

describe('Built-in loadouts', () => {
  async function setup() {
    const service = new ModManagerService(dir);
    const agent = Object.values(service.getHashDb().agents)[0];
    const skin = (name: string) => SKIN_V1.replace('1a2b3c4d', agent.current_hashes.position_vb).replace(/\$hair/g, `$${name.replace(/\W/g, '')}`);
    const add = async (name: string, ini: string, patch: Partial<ModManifest>) => {
      const m = (await service.ingestPackage(writeMod(name, ini))).installedMods[0];
      patchManifest(service, m, patch);
      return m.mod_uuid;
    };
    const ids = {
      nsfw: await add('Spicy', skin('a'), { gamebanana_id: 101, is_nsfw: true, h_cycle_order: 1 }),
      safe: await add('Safe', skin('b'), { gamebanana_id: 102, is_nsfw: false, h_cycle_order: 2 }),
      safe2: await add('Safe Two', skin('c'), { gamebanana_id: 103, is_nsfw: false, h_cycle_order: 3 }),
      unlabeled: await add('Hand Made', skin('d'), { gamebanana_id: null }),
      ui: await add('Icons', '[TextureOverrideIcon]\nhash = 7bf57b2b\n', { gamebanana_id: null }),
      offSafe: await add('Off Safe', skin('e'), { gamebanana_id: 104, is_nsfw: false }),
    };
    service.setModsEnabled([{ modUuid: ids.offSafe, enabled: false }]);
    for (const id of Object.values(ids)) if (id !== ids.offSafe) expect(byId(service, id).enabled).toBe(true);
    expect(byId(service, ids.nsfw).agent_id).toBe(agent.agent_id);
    expect(byId(service, ids.ui).agent_id).toBe('uncategorized');
    return { service, ids };
  }

  it('Stream Safe only turns mods off: NSFW ones and unlabeled character mods', async () => {
    const { service, ids } = await setup();
    const res = service.applyLoadoutProfile('Stream Safe');
    const on = (id: string) => byId(service, id).enabled;
    expect(on(ids.nsfw)).toBe(false);
    expect(on(ids.unlabeled)).toBe(false);
    expect(on(ids.safe)).toBe(true);
    expect(on(ids.ui)).toBe(true);
    expect(on(ids.offSafe)).toBe(false); // never turned on
    expect(res.unlabeledOff).toEqual(['Hand Made']);

    // Default brings back what Stream Safe turned off, and nothing else.
    service.applyLoadoutProfile('Default');
    expect(on(ids.nsfw)).toBe(true);
    expect(on(ids.unlabeled)).toBe(true);
    expect(on(ids.offSafe)).toBe(false);
  });

  it('Main Team keeps one outfit per character and leaves UI mods alone', async () => {
    const { service, ids } = await setup();
    service.applyLoadoutProfile('Main Team');
    const on = (id: string) => byId(service, id).enabled;
    const skins = [ids.nsfw, ids.safe, ids.safe2, ids.unlabeled].filter(on);
    expect(skins).toHaveLength(1);
    expect(on(ids.ui)).toBe(true);
    expect(on(ids.offSafe)).toBe(false);
  });

  it('Default with nothing to go back to changes nothing', async () => {
    const { service } = await setup();
    const before = service.scanInstalledMods().map((m) => [m.mod_uuid, m.enabled]);
    const res = service.applyLoadoutProfile('Default');
    expect(res.turnedOff).toBe(0);
    expect(service.scanInstalledMods().map((m) => [m.mod_uuid, m.enabled])).toEqual(before);
  });
});

describe('Choosing the GameBanana file', () => {
  const zipWith = (marker: string) => {
    const zip = new AdmZip();
    zip.addFile('Pack/Skin/mod.ini', Buffer.from(SKIN_V1));
    zip.addFile(`Pack/Skin/${marker}.txt`, Buffer.from(marker));
    zip.addFile('Pack/Skin/pad.bin', crypto.randomBytes(4000));
    return zip.toBuffer();
  };
  function mockGameBanana(files: Array<{ id: number; name: string; marker: string }>) {
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/ProfilePage')) {
        return new Response(
          JSON.stringify({ _idRow: 5555, _sName: 'Two Colors', _aFiles: files.map((f) => ({ _idRow: f.id, _sFile: f.name, _sDownloadUrl: `https://files.test/${f.id}` })) })
        );
      }
      const f = files.find((x) => String(url).endsWith(`/${x.id}`));
      return f ? new Response(zipWith(f.marker)) : new Response('missing', { status: 404 });
    });
  }

  it('picks by id, then by the same name (a re-upload), else only when there is one file', () => {
    const files = [
      { id: 1, name: 'Skin_Red_v1.zip', size: 1, download_url: 'x', added_at: 1 },
      { id: 2, name: 'Skin_Blue_v1.zip', size: 1, download_url: 'x', added_at: 1 },
      { id: 3, name: 'Skin_Blue_v1.2.zip', size: 1, download_url: 'x', added_at: 5 },
    ];
    expect(pickGameBananaFile(files, { id: 2 })?.id).toBe(2);
    expect(pickGameBananaFile(files, { id: 99, name: 'Skin_Blue_v0.9.zip' })?.id).toBe(3);
    expect(pickGameBananaFile(files)).toBeNull();
    expect(pickGameBananaFile([files[0]])?.id).toBe(1);
  });

  it('asks which file, installs the one picked, and updates with the same file', async () => {
    const service = new ModManagerService(dir);
    mockGameBanana([
      { id: 11, name: 'Skin_Red_v1.zip', marker: 'red' },
      { id: 12, name: 'Skin_Blue_v1.zip', marker: 'blue' },
    ]);
    const ask = await service.ingestPackage('gb:5555');
    expect(ask.installedMods).toEqual([]);
    expect(ask.filePrompt?.files.map((f) => f.id)).toEqual([11, 12]);

    const mod = (await service.ingestPackage('gb:5555', { fileId: 12 })).installedMods[0];
    expect(mod.gamebanana_file_id).toBe(12);
    expect(fs.existsSync(path.join(modDir(mod), 'blue.txt'))).toBe(true);

    // The author re-uploads both files: the update finds the blue one again by name.
    mockGameBanana([
      { id: 21, name: 'Skin_Red_v2.zip', marker: 'red' },
      { id: 22, name: 'Skin_Blue_v2.zip', marker: 'blue' },
    ]);
    const upd = await service.ingestPackage('gb:5555', { replaceModUuid: mod.mod_uuid });
    expect(upd.filePrompt).toBeUndefined();
    expect(upd.installedMods[0].mod_uuid).toBe(mod.mod_uuid);
    const now = byId(service, mod.mod_uuid);
    expect(now.gamebanana_file_id).toBe(22);
    expect(fs.existsSync(path.join(modDir(now), 'blue.txt'))).toBe(true);
    expect(fs.existsSync(path.join(modDir(now), 'red.txt'))).toBe(false);
  });
});

describe('Backups', () => {
  it('deleting keeps a copy that can be listed, measured and put back', async () => {
    const service = new ModManagerService(dir);
    const mod = (await service.ingestPackage(writeMod('Keep Me', SKIN_V1))).installedMods[0];
    service.deleteMod(mod.mod_uuid);
    expect(service.scanInstalledMods().find((m) => m.mod_uuid === mod.mod_uuid)).toBeUndefined();

    const deleted = service.listBackups().filter((b) => b.kind === 'deleted');
    expect(deleted).toHaveLength(1);
    expect(deleted[0].title).toBe(mod.title);
    const summary = service.getBackupsSummary();
    expect(summary.by_kind.deleted.count).toBe(1);
    expect(summary.total_bytes).toBeGreaterThan(0);

    service.restoreBackup(deleted[0].id);
    const back = byId(service, mod.mod_uuid);
    expect(back.enabled).toBe(true);
    expect(fs.existsSync(path.join(modDir(back), 'mod.ini'))).toBe(true);
    expect(service.listBackups().filter((b) => b.kind === 'deleted')).toHaveLength(0);
  });

  it('putting back a previous version swaps it with the installed one (so it can be undone)', async () => {
    const service = new ModManagerService(dir);
    const v1 = (await service.ingestPackage(writeMod('Swap', SKIN_V1))).installedMods[0];
    await service.ingestPackage(writeMod('Swap', SKIN_V2), { replaceModUuid: v1.mod_uuid });
    expect(read(path.join(modDir(byId(service, v1.mod_uuid)), 'mod.ini'))).toContain('KeyFace');

    const prev = service.listBackups().find((b) => b.kind === 'update' && b.mod_uuid === v1.mod_uuid)!;
    service.restoreBackup(prev.id);
    const now = byId(service, v1.mod_uuid);
    expect(read(path.join(modDir(now), 'mod.ini'))).not.toContain('KeyFace');
    expect(service.scanInstalledMods().filter((m) => m.mod_uuid === v1.mod_uuid)).toHaveLength(1);
    expect(service.listBackups().some((b) => b.kind === 'update' && b.mod_uuid === v1.mod_uuid)).toBe(true);
  });

  it('Tidy keys keeps no copies, and Original keys puts the file back exactly', async () => {
    const service = new ModManagerService(dir);
    const mod = (await service.ingestPackage(writeMod('Keys', SKIN_V1))).installedMods[0];
    service.standardizeAllModHotkeys();
    const file = path.join(modDir(byId(service, mod.mod_uuid)), 'mod.ini');
    expect(read(file)).not.toBe(SKIN_V1);
    expect(service.listBackups().filter((b) => b.kind === 'hotkeys')).toEqual([]);
    const res = service.restoreOriginalHotkeys();
    expect(res.updatedModsCount).toBe(1);
    expect(read(file)).toBe(SKIN_V1);
  });

  it('prunes old backups but keeps the newest of each mod', () => {
    const service = new ModManagerService(dir);
    const root = path.join(dir, 'ZZZ_Mod_Manager_AppData', 'backups', 'mod-updates');
    const make = (name: string, daysAgo: number) => {
      const stamp = new Date(Date.now() - daysAgo * 86400000).toISOString().replace(/[:.]/g, '-');
      const d = path.join(root, `${name}__${stamp}`);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'mod.ini'), 'x'.repeat(1000));
    };
    make('Alpha', 90);
    make('Alpha', 60);
    make('Alpha', 1);
    make('Beta', 90); // the only copy of Beta: kept
    const res = service.pruneBackups({ olderThanDays: 30, keepPerMod: 1 });
    expect(res.removed).toBe(2);
    const left = service.listBackups().map((b) => b.folder_name).sort();
    expect(left).toEqual(['Alpha', 'Beta']);
    expect(service.pruneBackups({ olderThanDays: 0, keepPerMod: 0, maxTotalBytes: 0 }).removed).toBe(2);
    expect(service.listBackups()).toEqual([]);
  });
});
