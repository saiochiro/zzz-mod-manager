import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractToDir, unpackAndLocalizeModArchive } from '../src/core/archiveEngine';
import { DEFAULT_HASH_DB } from '../src/shared/defaultHashDb';

/** A Phoenix mod laid out like many real ones: one folder per piece, each with its own .ini. */
function makeSplitMod(root: string) {
  const top = path.join(root, 'SFW 菲欧尼 Ronova');
  const part = (dir: string, ini: string, hash: string) => {
    fs.mkdirSync(path.join(top, dir), { recursive: true });
    fs.writeFileSync(path.join(top, dir, ini), `[TextureOverride${dir}]\nhash = ${hash}\nhandling = skip\n`);
  };
  part('261010BODY', 'Phoenix.ini', '9040e2c4');
  part('hair', 'Hair.ini', 'ad90e710');
  part('weapon', 'weapon.ini', '0bcb1cb4');
  part('face', 'face.ini', 'f15548c2');
  fs.writeFileSync(path.join(top, 'readme.txt'), 'toggles');
  return top;
}

describe('Installing mods', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('recognizes Phoenix and keeps every piece of a mod split into sub-folders', () => {
    makeSplitMod(path.join(tmp, 'src'));
    const res = unpackAndLocalizeModArchive(path.join(tmp, 'src'), path.join(tmp, 'staged'), DEFAULT_HASH_DB);
    expect(res.isMultiAgentPack).toBe(false);
    expect(res.localizedRoots).toHaveLength(1);
    const root = res.localizedRoots[0];
    expect(root.matchedAgentId).toBe('phoenix_reffaella');
    expect(root.folderName).toBe('SFW 菲欧尼 Ronova');
    expect(root.iniFiles.sort()).toEqual(
      [path.join('261010BODY', 'Phoenix.ini'), path.join('face', 'face.ini'), path.join('hair', 'Hair.ini'), path.join('weapon', 'weapon.ini')].sort()
    );
  });

  it('unpacks .7z archives with the bundled 7-Zip, including non-English names', () => {
    const sevenZip: string = createRequire(path.join(process.cwd(), 'index.js'))('7zip-bin').path7za;
    try {
      fs.chmodSync(sevenZip, 0o755);
    } catch {
      // read-only install; it's usually executable already
    }
    const src = makeSplitMod(path.join(tmp, 'src'));
    const archive = path.join(tmp, 'mod.7z');
    execFileSync(sevenZip, ['a', '-t7z', '-m0=lzma2', archive, src], { stdio: 'ignore' });
    const out = path.join(tmp, 'out');
    extractToDir(archive, out);
    expect(fs.readFileSync(path.join(out, 'SFW 菲欧尼 Ronova', 'hair', 'Hair.ini'), 'utf-8')).toContain('ad90e710');
  });

  it('gives a clear error for a file that is not an archive', () => {
    const junk = path.join(tmp, 'broken.7z');
    fs.writeFileSync(junk, 'not an archive');
    expect(() => extractToDir(junk, path.join(tmp, 'x'))).toThrow(/Couldn't unpack broken\.7z/);
  });
});
