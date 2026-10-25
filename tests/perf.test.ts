import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractArchiveAsync } from '../src/core/archiveEngine';
import { ModManagerService } from '../src/core/modManagerService';

describe('Speed-ups stay correct', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('cached mods still pick up switches and edited files', () => {
    const service = new ModManagerService(dir);
    service.seedInitialSandboxMods();
    const before = service.scanInstalledMods();
    const mod = before[0];
    // A second scan comes from the cache and is identical.
    expect(service.scanInstalledMods().map((m) => [m.mod_uuid, m.enabled])).toEqual(before.map((m) => [m.mod_uuid, m.enabled]));
    // Switching renames the folder: the new state shows up.
    service.toggleModEnabled(mod.mod_uuid);
    expect(service.scanInstalledMods().find((m) => m.mod_uuid === mod.mod_uuid)!.enabled).toBe(!mod.enabled);
    // Editing an .ini (new key section) shows up without restarting.
    const now = service.scanInstalledMods().find((m) => m.mod_uuid === mod.mod_uuid)!;
    const abs = path.join(dir, 'ZZMI_Root', now.install_path);
    const ini = fs.readdirSync(abs).find((f) => f.endsWith('.ini'))!;
    fs.appendFileSync(path.join(abs, ini), '\n[KeyPerfTest]\nkey = 9\ntype = cycle\n$perf = 0,1\n');
    const after = service.scanInstalledMods().find((m) => m.mod_uuid === mod.mod_uuid)!;
    expect(JSON.stringify(after.sub_toggles)).toContain('KeyPerfTest');
    // Callers can't change the cache by editing what they got back.
    after.title = 'changed by caller';
    expect(service.scanInstalledMods().find((m) => m.mod_uuid === mod.mod_uuid)!.title).not.toBe('changed by caller');
  });

  it('installs take turns', async () => {
    const service = new ModManagerService(dir);
    const order: string[] = [];
    const a = service.acquireInstallLock().then(async (release) => {
      order.push('a start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('a end');
      release();
    });
    const b = service.acquireInstallLock().then((release) => {
      order.push('b start');
      release();
    });
    await Promise.all([a, b]);
    expect(order).toEqual(['a start', 'a end', 'b start']);
  });

  it('unpacks in the background into a folder named like the archive', async () => {
    const zip = new AdmZip();
    zip.addFile('Cool Mod/mod.ini', Buffer.from('[TextureOverrideX]\nhash = 12345678\n'));
    const file = path.join(dir, 'Cool Mod v2.zip');
    zip.writeZip(file);
    const out = await extractArchiveAsync(file, path.join(dir, 'raw'));
    if (out === null) return; // no bundled 7-Zip on this machine: the app falls back to the built-in extractor
    expect(path.basename(out)).toBe('Cool Mod v2');
    expect(fs.existsSync(path.join(out, 'Cool Mod', 'mod.ini'))).toBe(true);
  });
});

describe('Switching several mods at once', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('turns a set of mods off and one on in a single call', () => {
    const service = new ModManagerService(dir);
    service.seedInitialSandboxMods();
    const mods = service.scanInstalledMods();
    const changes = mods.map((m, i) => ({ modUuid: m.mod_uuid, enabled: i === 0 }));
    service.setModsEnabled(changes);
    const after = service.scanInstalledMods();
    for (const c of changes) expect(after.find((m) => m.mod_uuid === c.modUuid)!.enabled).toBe(c.enabled);
    // Nothing left to change: a second call is a no-op.
    expect(service.setModsEnabled(changes)).toBe(0);
  });
});

describe('Library covers', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const png = (w: number, h: number) => {
    const b = Buffer.alloc(33);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(0x0d0a1a0a, 4);
    b.write('IHDR', 12, 'ascii');
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(h, 20);
    return b;
  };

  it('the GameBanana cover beats stray pictures in the folder; a named preview beats both', () => {
    const service = new ModManagerService(dir);
    service.seedInitialSandboxMods();
    const mod = service.scanInstalledMods()[0];
    const abs = path.join(dir, 'ZZMI_Root', mod.install_path);
    const mf = path.join(abs, 'mod_manifest.json');
    const gb = 'https://images.gamebanana.com/img/ss/mods/abc.jpg';
    fs.writeFileSync(mf, JSON.stringify({ ...JSON.parse(fs.readFileSync(mf, 'utf-8')), thumbnail_url: gb, preview_images: [gb] }, null, 2));
    fs.writeFileSync(path.join(abs, 'LAria.png'), png(1920, 1080)); // not a preview: notes, textures...
    expect(service.scanInstalledMods().find((m) => m.mod_uuid === mod.mod_uuid)!.thumbnail_url).toBe(gb);
    fs.writeFileSync(path.join(abs, 'preview.png'), png(800, 450)); // a real preview (or one you set)
    expect(service.scanInstalledMods().find((m) => m.mod_uuid === mod.mod_uuid)!.thumbnail_url).toMatch(/^proxylaunch-img:\/\/f\/.*preview\.png/);
  });
});
