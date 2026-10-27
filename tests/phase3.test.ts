import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureFreeSpace, ModManagerService, setFreeSpaceProbeForTest } from '../src/core/modManagerService';
import { isOfflineError } from '../src/ui/online';

const MB = 1024 * 1024;
const GB = 1024 ** 3;

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase3-'));
});
afterEach(() => {
  setFreeSpaceProbeForTest(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('Disk space check', () => {
  it('stops with a plain message when the drive is too full, and lets it through otherwise', () => {
    setFreeSpaceProbeForTest(() => 50 * MB);
    expect(() => ensureFreeSpace(dir, 10 * MB, 'unpack')).toThrow(/Not enough free space .* to unpack this mod: about 10 MB is needed and 50 MB is free/);
    setFreeSpaceProbeForTest(() => 10 * GB);
    expect(() => ensureFreeSpace(dir, 10 * MB, 'unpack')).not.toThrow();
    setFreeSpaceProbeForTest(() => null); // can't tell: don't block
    expect(() => ensureFreeSpace(dir, 10 * GB, 'unpack')).not.toThrow();
  });

  it('refuses to unpack an archive that would not fit, without installing anything', async () => {
    const service = new ModManagerService(dir);
    const zip = new AdmZip();
    zip.addFile('Big/mod.ini', Buffer.from('[TextureOverrideX]\nhash = 1a2b3c4d\n'));
    zip.addFile('Big/tex.dds', crypto.randomBytes(64 * 1024));
    const file = path.join(dir, 'Big.zip');
    zip.writeZip(file);
    setFreeSpaceProbeForTest(() => MB); // 1 MB free
    const res = await service.ingestPackage(file);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Not enough free space/);
    expect(service.scanInstalledMods()).toEqual([]);
  });
});

describe('Offline detection', () => {
  it('tells "no internet" apart from other errors', () => {
    for (const m of ['TypeError: fetch failed', 'getaddrinfo ENOTFOUND gamebanana.com', 'net::ERR_INTERNET_DISCONNECTED', 'Failed to fetch']) {
      expect(isOfflineError(m)).toBe(true);
    }
    for (const m of ['GameBanana Mod #5 belongs to another game', 'HTTP 404']) expect(isOfflineError(m)).toBe(false);
  });
});
