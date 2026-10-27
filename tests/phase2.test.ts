import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBugReport, scrubUserText, scrubUserValue } from '../src/core/bugReport';
import { gameBananaCharacterOf } from '../src/core/gamebananaService';
import { ModManagerService } from '../src/core/modManagerService';
import { findClashes } from '../src/shared/clashes';
import { isOutfitMod } from '../src/shared/outfits';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase2-'));
});
afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

const mod = (id: string, over: Record<string, unknown> = {}) => ({
  mod_uuid: id,
  title: id,
  enabled: true,
  agent_id: 'ellen',
  detected_hashes: ['aaaa1111'],
  in_h_swap_cycle: false,
  ...over,
});

describe('Clashes', () => {
  it('finds mods that are on and change the same hashes', () => {
    const c = findClashes([mod('a'), mod('b', { detected_hashes: ['AAAA1111', 'bbbb2222'] }), mod('c', { detected_hashes: ['cccc3333'] })]);
    expect(c.get('a')?.map((x) => x.modUuid)).toEqual(['b']);
    expect(c.get('b')?.map((x) => x.modUuid)).toEqual(['a']);
    expect(c.has('c')).toBe(false);
  });

  it('ignores mods that are off, other characters, and outfits both in the rotation', () => {
    expect(findClashes([mod('a'), mod('b', { enabled: false })]).size).toBe(0);
    expect(findClashes([mod('a'), mod('b', { agent_id: 'miyabi' })]).size).toBe(0);
    expect(findClashes([mod('a', { in_h_swap_cycle: true }), mod('b', { in_h_swap_cycle: true })]).size).toBe(0);
    // UI mods have no rotation: same hashes always clash.
    expect(findClashes([mod('a', { agent_id: 'uncategorized', in_h_swap_cycle: true }), mod('b', { agent_id: 'uncategorized', in_h_swap_cycle: true })]).size).toBe(2);
  });

  it('lists the biggest clash first', () => {
    const c = findClashes([
      mod('a', { detected_hashes: ['h1', 'h2', 'h3'] }),
      mod('small', { detected_hashes: ['h1'] }),
      mod('big', { detected_hashes: ['h1', 'h2', 'h3'] }),
    ]);
    expect(c.get('a')?.map((x) => x.modUuid)).toEqual(['big', 'small']);
  });
});

describe('Outfits', () => {
  it('counts every character mod that changes their look, not only Skins-tagged ones', () => {
    expect(isOutfitMod({ agent_id: 'ellen', category_tag: 'Skins' })).toBe(true);
    expect(isOutfitMod({ agent_id: 'ellen', category_tag: undefined })).toBe(true);
    expect(isOutfitMod({ agent_id: 'ellen', category_tag: 'UI' })).toBe(true); // tagged oddly but routed to her
    expect(isOutfitMod({ agent_id: 'ellen', category_tag: 'Weapons' })).toBe(false);
    expect(isOutfitMod({ agent_id: 'ellen', category_tag: 'Audio' })).toBe(false);
    expect(isOutfitMod({ agent_id: 'uncategorized', category_tag: 'Skins' })).toBe(false);
  });
});

describe('Bug report', () => {
  const user = { homeDir: 'C:\\Users\\saikh.DESKTOP-IIRP65N', username: 'saikh' };

  it('removes the home folder and user name however the path is written', () => {
    expect(scrubUserText('C:\\Users\\saikh.DESKTOP-IIRP65N\\AppData\\Roaming\\x', user)).toBe('%USERPROFILE%\\AppData\\Roaming\\x');
    expect(scrubUserText('c:/users/saikh.desktop-iirp65n/AppData', user)).toBe('%USERPROFILE%/AppData');
    expect(scrubUserText('"C:\\\\Users\\\\saikh.DESKTOP-IIRP65N\\\\Mods"', user)).toBe('"%USERPROFILE%\\\\Mods"');
    expect(scrubUserText('D:\\saikh\\Games and OneDrive - saikh', user)).toBe('D:\\<user>\\Games and OneDrive - <user>');
    expect(scrubUserText('saikhan is a different word', user)).toBe('saikhan is a different word');
    expect(scrubUserValue({ a: ['C:\\Users\\saikh.DESKTOP-IIRP65N\\x'], n: 3 }, user)).toEqual({ a: ['%USERPROFILE%\\x'], n: 3 });
  });

  it('packs the summary, log, settings and mod list with no trace of the user', () => {
    const buf = buildBugReport(
      {
        appVersion: '2.15.0',
        platform: 'win32 10.0.26100 (x64)',
        config: { zzmiRootPath: 'C:\\Users\\saikh.DESKTOP-IIRP65N\\AppData\\Roaming\\XXMI', communityToken: 'secret-token', autoSendF10OnToggle: true },
        logs: [{ timestamp: '12:00:00', level: 'error', source: 'ROUTER', message: 'Could not rename C:\\Users\\saikh.DESKTOP-IIRP65N\\Mods\\A' }],
        mods: [{ title: 'Cool', agent_id: 'ellen', enabled: true, health_status: 'working', gamebanana_id: 1, install_path: 'Mods/_ZZZMM_Managed/Ellen/Cool' }],
        note: 'It broke for saikh',
      },
      user
    );
    const zip = new AdmZip(buf);
    expect(zip.getEntries().map((e) => e.entryName).sort()).toEqual(['activity-log.txt', 'mods.json', 'settings.json', 'summary.txt']);
    const all = zip.getEntries().map((e) => e.getData().toString('utf-8')).join('\n');
    expect(all).not.toMatch(/saikh/i);
    expect(all).not.toContain('secret-token');
    expect(all).toContain('2.15.0');
    expect(all).toContain('%USERPROFILE%');
    expect(JSON.parse(zip.readAsText('mods.json'))[0]).toMatchObject({ title: 'Cool', on: true, gamebanana_id: 1 });
  });
});

describe('Characters ZZMI does not know yet', () => {
  it('reads the character from the GameBanana category, not kinds of mod', () => {
    expect(gameBananaCharacterOf({ category: 'Phoenix', root_category: 'Skins' })).toBe('Phoenix');
    expect(gameBananaCharacterOf({ category: 'Skins', root_category: 'Skins' })).toBeNull();
    expect(gameBananaCharacterOf({ category: 'Other/Misc', root_category: 'Skins' })).toBeNull();
    expect(gameBananaCharacterOf({ category: 'HUD', root_category: 'UI' })).toBeNull();
    expect(gameBananaCharacterOf({ category: 'Phoenix', root_category: 'Sounds' })).toBeNull();
  });

  function mockPage(category: string) {
    const zip = new AdmZip();
    zip.addFile('Phoenix Skin/mod.ini', Buffer.from('[TextureOverrideBody]\nhash = 0badf00d\n'));
    zip.addFile('Phoenix Skin/pad.bin', crypto.randomBytes(3000));
    const buf = zip.toBuffer();
    vi.stubGlobal('fetch', async (url: string) =>
      String(url).includes('/ProfilePage')
        ? new Response(
            JSON.stringify({
              _idRow: 777,
              _sName: 'Phoenix Outfit',
              _aCategory: { _idRow: 99999, _sName: category },
              _aRootCategory: { _sName: 'Skins' },
              _aFiles: [{ _idRow: 1, _sFile: 'phoenix.zip', _sDownloadUrl: 'https://files.test/1' }],
            })
          )
        : new Response(buf)
    );
  }

  it('labels a new install for a character ZZMI does not know', async () => {
    const service = new ModManagerService(dir);
    mockPage('Phoenix');
    const m = (await service.ingestPackage('gb:777')).installedMods[0];
    expect(m.agent_id).toBe('uncategorized');
    expect(m.unsupported_character).toBe('Phoenix');
    expect(service.scanInstalledMods().find((x) => x.mod_uuid === m.mod_uuid)?.unsupported_character).toBe('Phoenix');
  });

  it('labels older installs once, by asking GameBanana', async () => {
    const service = new ModManagerService(dir);
    mockPage('Phoenix');
    const m = (await service.ingestPackage('gb:777')).installedMods[0];
    const file = path.join(dir, 'ZZMI_Root', m.install_path, 'mod_manifest.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    delete raw.unsupported_character;
    delete raw.unsupported_checked;
    fs.writeFileSync(file, JSON.stringify(raw));
    service.invalidateModCache();

    expect(await service.backfillUnsupportedCharacters()).toBe(1);
    expect(service.scanInstalledMods().find((x) => x.mod_uuid === m.mod_uuid)?.unsupported_character).toBe('Phoenix');
    expect(await service.backfillUnsupportedCharacters()).toBe(0); // asked once
  });
});

describe('Backups in the app state', () => {
  it('points each updated mod at its previous version and counts deleted mods', async () => {
    const service = new ModManagerService(dir);
    const make = (folder: string, extra = '') => {
      const src = path.join(dir, 'src', crypto.randomUUID(), folder);
      fs.mkdirSync(src, { recursive: true });
      fs.writeFileSync(path.join(src, 'mod.ini'), `[TextureOverrideX]\nhash = 12345678\n${extra}`);
      return src;
    };
    const a = (await service.ingestPackage(make('Alpha'))).installedMods[0];
    const b = (await service.ingestPackage(make('Beta'))).installedMods[0];
    expect(service.getFullState().previousVersions).toEqual({});

    await service.ingestPackage(make('Alpha', '; v2\n'), { replaceModUuid: a.mod_uuid });
    service.deleteMod(b.mod_uuid);
    const state = service.getFullState();
    expect(Object.keys(state.previousVersions)).toEqual([a.mod_uuid]);
    expect(state.deletedBackups).toBe(1);

    service.restoreBackup(state.previousVersions[a.mod_uuid]);
    const ini = fs.readFileSync(path.join(dir, 'ZZMI_Root', service.scanInstalledMods().find((m) => m.mod_uuid === a.mod_uuid)!.install_path, 'mod.ini'), 'utf-8');
    expect(ini).not.toContain('v2');
    // The newer version is the "previous" one now, so going back can be undone.
    expect(service.getFullState().previousVersions[a.mod_uuid]).toBeTruthy();
  });
});
