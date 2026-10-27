import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractArchiveFiles } from '../src/core/archiveEngine';
import { ModManagerService } from '../src/core/modManagerService';
import type { ModManifest } from '../src/shared/types';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix16-'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

const byId = (s: ModManagerService, id: string) => s.scanInstalledMods().find((m) => m.mod_uuid === id)!;
const iniFor = (hash: string, name: string) => `[TextureOverride${name}]\nhash = ${hash}\n[ResourceTex]\nfilename = tex.dds\n`;

/** GameBanana answers: a profile with these files, and each file's zip. */
function mockGameBanana(modId: number, files: Array<{ id: number; name: string; zip: Buffer }>, calls: string[] = []) {
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(String(url));
    if (String(url).includes('/ProfilePage')) {
      return new Response(
        JSON.stringify({ _idRow: modId, _sName: 'Pack', _aFiles: files.map((f) => ({ _idRow: f.id, _sFile: f.name, _nFilesize: f.zip.length, _sDownloadUrl: `https://files.test/${f.id}` })) })
      );
    }
    const f = files.find((x) => String(url).endsWith(`/${x.id}`));
    return f ? new Response(f.zip, { headers: { 'content-length': String(f.zip.length) } }) : new Response('no', { status: 404 });
  });
  return calls;
}

describe('Updating a pack split into one mod per character', () => {
  it('keeps each part on or off as it was, keeps its id, and leaves no duplicates', async () => {
    const service = new ModManagerService(dir);
    const [a, b] = Object.values(service.getHashDb().agents);
    const pack = (version: string) => {
      const zip = new AdmZip();
      zip.addFile(`Pack/${a.folder_name}/mod.ini`, Buffer.from(iniFor(a.current_hashes.position_vb, 'A')));
      zip.addFile(`Pack/${a.folder_name}/tex.dds`, Buffer.from(version + 'a'.repeat(900)));
      zip.addFile(`Pack/${b.folder_name}/mod.ini`, Buffer.from(iniFor(b.current_hashes.position_vb, 'B')));
      zip.addFile(`Pack/${b.folder_name}/tex.dds`, Buffer.from(version + 'b'.repeat(900)));
      zip.addFile('Pack/pad.bin', crypto.randomBytes(2000));
      return zip.toBuffer();
    };
    mockGameBanana(777, [{ id: 1, name: 'Pack_v1.zip', zip: pack('v1') }]);
    const first = await service.ingestPackage('gb:777');
    expect(first.multiAgentPrompt).toBeTruthy();
    const split = service.confirmMultiAgentSplit(first.multiAgentPrompt!.stagingId);
    expect(split.installedMods).toHaveLength(2);
    const partA = split.installedMods.find((m) => m.agent_id === a.agent_id)!;
    const partB = split.installedMods.find((m) => m.agent_id === b.agent_id)!;
    expect(partA.gamebanana_id).toBe(777); // linked to its page, so updates and repairs work
    service.setModsEnabled([{ modUuid: partA.mod_uuid, enabled: false }]);
    const countBefore = service.scanInstalledMods().length;

    mockGameBanana(777, [{ id: 2, name: 'Pack_v2.zip', zip: pack('v2') }]);
    const upd = await service.ingestPackage('gb:777', { replaceModUuid: partA.mod_uuid });
    expect(upd.multiAgentPrompt).toBeTruthy();
    const done = service.confirmMultiAgentSplit(upd.multiAgentPrompt!.stagingId);
    expect(done.replacedModUuids?.sort()).toEqual([partA.mod_uuid, partB.mod_uuid].sort());

    expect(service.scanInstalledMods().length).toBe(countBefore);
    const nowA = byId(service, partA.mod_uuid);
    const nowB = byId(service, partB.mod_uuid);
    expect(nowA.enabled).toBe(false); // was off: stays off
    expect(nowB.enabled).toBe(true);
    const texA = fs.readFileSync(path.join(dir, 'ZZMI_Root', nowA.install_path, 'tex.dds'), 'utf-8');
    expect(texA.startsWith('v2')).toBe(true);
  });

  it('a fixed (repaired) mod that was off stays off', async () => {
    const service = new ModManagerService(dir);
    const src = path.join(dir, 'src', 'Off Mod');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'mod.ini'), '[TextureOverrideX]\nhash = 1a2b3c4d\n');
    const mod = (await service.ingestPackage(src)).installedMods[0];
    service.setModsEnabled([{ modUuid: mod.mod_uuid, enabled: false }]);
    try {
      service.repairMod(mod.mod_uuid);
    } catch {
      // nothing to fix in this mod is fine: what matters is the on/off state
    }
    expect(byId(service, mod.mod_uuid).enabled).toBe(false);
  });
});

describe('Get missing files is quick', () => {
  it('unpacks only the files it needs from a big archive', async () => {
    const zip = new AdmZip();
    zip.addFile('Mod/Textures/needed.dds', Buffer.from('N'));
    zip.addFile('Mod/Textures/huge_other.dds', crypto.randomBytes(200_000));
    zip.addFile('Mod/mod.ini', Buffer.from('[TextureOverrideX]\nhash = 1\n'));
    const file = path.join(dir, 'big.zip');
    zip.writeZip(file);
    const out = path.join(dir, 'out');
    expect(await extractArchiveFiles(file, out, ['Textures/needed.dds'])).toBe(true);
    const found: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : found.push(e.name);
    };
    walk(out);
    expect(found).toEqual(['needed.dds']);
  });

  it('downloads its own file and at most two others, never the whole page, and reports progress', async () => {
    const service = new ModManagerService(dir);
    const src = path.join(dir, 'src', 'Cool Skin');
    fs.mkdirSync(src, { recursive: true });
    const ini = '[TextureOverrideBody]\nhash = 1a2b3c4d\n[ResourceA]\nfilename = a.dds\n[ResourceB]\nfilename = gone.dds\n';
    fs.writeFileSync(path.join(src, 'mod.ini'), ini);
    fs.writeFileSync(path.join(src, 'a.dds'), 'a');
    const mod = (await service.ingestPackage(src)).installedMods[0];
    const modDir = path.join(dir, 'ZZMI_Root', mod.install_path);
    const manifest = path.join(modDir, 'mod_manifest.json');
    fs.writeFileSync(manifest, JSON.stringify({ ...(JSON.parse(fs.readFileSync(manifest, 'utf-8')) as ModManifest), gamebanana_id: 5150, gamebanana_file_id: 1 }));
    fs.rmSync(path.join(modDir, 'a.dds'));
    service.invalidateModCache();

    const zipOf = (withA: boolean) => {
      const z = new AdmZip();
      z.addFile('Cool Skin/mod.ini', Buffer.from(ini));
      if (withA) z.addFile('Cool Skin/a.dds', Buffer.from('A'.repeat(1500)));
      z.addFile('Cool Skin/pad.bin', crypto.randomBytes(1500));
      return z.toBuffer();
    };
    // Its own file has a.dds; gone.dds is in no download at all (the author's mistake).
    const files = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: `Variant_${id}.zip`, zip: zipOf(id === 1) }));
    const calls = mockGameBanana(5150, files);
    const progress: number[] = [];
    service.onDownloadProgress = (p) => progress.push(p.received);

    const res = await service.downloadMissingFiles(mod.mod_uuid);
    expect(res.restored).toEqual(['a.dds']);
    expect(res.stillMissing).toEqual(['gone.dds']);
    const downloads = calls.filter((u) => u.startsWith('https://files.test/'));
    expect(downloads[0]).toBe('https://files.test/1');
    expect(downloads.length).toBeLessThanOrEqual(3);
    expect(progress.length).toBeGreaterThan(0);
  });
});
