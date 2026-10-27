import AdmZip from 'adm-zip';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Undoing a mod mixed up with another one', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixup-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('puts an icon pack back that an "update" replaced with an unrelated mod', async () => {
    const service = new ModManagerService(dir);
    // HideUID, installed normally.
    const src = path.join(dir, 'src', 'HideUID');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'Config.ini'), '[TextureOverrideUID]\nhash = 11111111\n');
    const hide = (await service.ingestPackage(src)).installedMods[0];
    expect(hide).toBeTruthy();
    const hideManifest = path.join(dir, 'ZZMI_Root', hide.install_path, 'mod_manifest.json');
    fs.writeFileSync(hideManifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(hideManifest, 'utf-8')), title: 'HideUID', gamebanana_id: 553291 }));
    // The icon pack, wrongly named HideUID and moved to backups by that "update".
    const backup = path.join(dir, 'ZZZ_Mod_Manager_AppData', 'backups', 'mod-updates', 'Global_-_GameBanana_ZZZ_#1858613_(Head)__2026');
    fs.mkdirSync(backup, { recursive: true });
    fs.writeFileSync(path.join(backup, 'MindscapeIcons.ini'), '[TextureOverrideIcon]\nhash = 7bf57b2b\n');
    fs.writeFileSync(
      path.join(backup, 'mod_manifest.json'),
      JSON.stringify({
        ...hide,
        mod_uuid: 'icons-1',
        title: 'HideUID',
        gamebanana_id: 553291,
        description: 'Hides your UID', // borrowed from HideUID; only the folder name gives it away
        detected_hashes: ['7bf57b2b'],
        previous_folder_name: 'Mindscape_Icons',
        thumbnail_url: 'https://images.gamebanana.com/img/ss/mods/hideuid.jpg', // HideUID's picture too
        preview_images: ['https://images.gamebanana.com/img/ss/mods/hideuid.jpg'],
        folder_name: 'Global_-_GameBanana_ZZZ_#1858613_(Head)',
        install_path: 'Mods/_Uncategorized_UI_Audio/Global_-_GameBanana_ZZZ_#1858613_(Head)',
        enabled: true,
      })
    );
    expect(service.restoreWronglyReplacedMods()).toBe(1);
    const icons = service.scanInstalledMods().find((m) => m.mod_uuid === 'icons-1')!;
    expect(icons).toMatchObject({ title: 'Mindscape Icons', gamebanana_id: null, enabled: true });
    expect(icons.install_path).toBe('Mods/_Uncategorized_UI_Audio/Mindscape_Icons');
    expect(String(icons.thumbnail_url || '')).not.toContain('hideuid');
    expect(icons.preview_images || []).toEqual([]);
    // HideUID itself is untouched, and running again changes nothing.
    expect(service.scanInstalledMods().find((m) => m.mod_uuid === hide.mod_uuid)?.title).toBe('HideUID');
    expect(service.restoreWronglyReplacedMods()).toBe(0);
  });
});

describe('Mods the game loads from outside ProxyLaunch', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('finds them, and can add one to the Library (turning the outside copy off)', () => {
    const service = new ModManagerService(dir);
    const other = path.join(dir, 'ZZMI_Root', 'Mods', 'Playable Characters', 'Alice Thymefield - Celestian Etiquette', 'Alice');
    fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, 'Alice.ini'), '[TextureOverrideAlice]\nhash = 12345678\n');
    fs.mkdirSync(path.join(dir, 'ZZMI_Root', 'Mods', 'Playable Characters', '.staging', 'x'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'ZZMI_Root', 'Mods', 'Playable Characters', '.staging', 'x', 'a.ini'), '');

    const found = service.findUnmanagedGameMods();
    expect(found.map((m) => m.name)).toEqual(['Alice']);
    expect(service.getFullState().unmanagedGameMods).toHaveLength(1);

    const before = service.scanInstalledMods().length;
    expect(service.resolveUnmanagedGameMod(found[0].path, 'import').imported).toBe(1);
    expect(service.scanInstalledMods().length).toBe(before + 1);
    expect(fs.existsSync(path.join(path.dirname(other), 'DISABLED_Alice'))).toBe(true);
    expect(service.findUnmanagedGameMods()).toEqual([]);
  });
});

describe('Downloading missing files', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-'));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('copies in only the missing files from the GameBanana download and leaves the rest alone', async () => {
    const service = new ModManagerService(dir);
    const src = path.join(dir, 'src', 'Cool Skin');
    fs.mkdirSync(path.join(src, 'Textures'), { recursive: true });
    const ini = '[TextureOverrideBody]\nhash = 1a2b3c4d\n[ResourceA]\nfilename = Textures/a.dds\n[ResourceB]\nfilename = b.buf\n[ResourceC]\nfilename = gone.dds\n';
    fs.writeFileSync(path.join(src, 'mod.ini'), ini);
    fs.writeFileSync(path.join(src, 'Textures', 'a.dds'), 'a');
    fs.writeFileSync(path.join(src, 'b.buf'), 'b');
    const mod = (await service.ingestPackage(src)).installedMods[0];
    const modDir = path.join(dir, 'ZZMI_Root', mod.install_path);
    const manifest = path.join(modDir, 'mod_manifest.json');
    fs.writeFileSync(manifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifest, 'utf-8')), gamebanana_id: 424242 }));
    // The user changed a key (must stay) and a texture went missing.
    fs.writeFileSync(path.join(modDir, 'mod.ini'), ini + '; my edit\n');
    fs.rmSync(path.join(modDir, 'Textures', 'a.dds'));
    service.invalidateModCache();
    expect(service.scanInstalledMods().find((m) => m.mod_uuid === mod.mod_uuid)?.health_status).toBe('broken');

    // GameBanana's copy: the same mod one folder down, without gone.dds (the author's mistake).
    const zip = new AdmZip();
    zip.addFile('Cool Skin v2/Cool Skin/mod.ini', Buffer.from(ini));
    zip.addFile('Cool Skin v2/Cool Skin/Textures/a.dds', Buffer.from('A'.repeat(2000)));
    zip.addFile('Cool Skin v2/Cool Skin/b.buf', Buffer.from('new b'));
    const zipBuf = zip.toBuffer();
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/ProfilePage')) {
        return new Response(JSON.stringify({ _idRow: 424242, _sName: 'Cool Skin', _aFiles: [{ _idRow: 9, _sFile: 'cool.zip', _sDownloadUrl: 'https://gamebanana.com/dl/9' }] }));
      }
      return new Response(zipBuf);
    });

    const res = await service.downloadMissingFiles(mod.mod_uuid);
    expect(res.restored).toEqual(['Textures/a.dds']);
    expect(res.stillMissing).toEqual(['gone.dds']);
    expect(fs.readFileSync(path.join(modDir, 'Textures', 'a.dds'), 'utf-8')).toBe('A'.repeat(2000));
    expect(fs.readFileSync(path.join(modDir, 'b.buf'), 'utf-8')).toBe('b'); // present files aren't touched
    expect(fs.readFileSync(path.join(modDir, 'mod.ini'), 'utf-8')).toContain('; my edit');
  });

  it("refuses mods that didn't come from GameBanana", async () => {
    const service = new ModManagerService(dir);
    const src = path.join(dir, 'src', 'Local');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'mod.ini'), '[TextureOverrideX]\nhash = 12345678\n[ResourceA]\nfilename = a.dds\n');
    const mod = (await service.ingestPackage(src)).installedMods[0];
    await expect(service.downloadMissingFiles(mod.mod_uuid)).rejects.toThrow(/GameBanana/);
  });
});
