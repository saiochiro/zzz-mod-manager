import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localImageUrl, resolveLocalModThumbnailUrl } from '../src/core/modManagerService';

/** Just enough of a PNG for the size check. */
function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

describe('mod cover picker', () => {
  it('points the window at the file instead of copying the picture into memory', () => {
    const f = path.join(os.tmpdir(), 'x', 'preview.png');
    expect(localImageUrl(f)).toBe(`proxylaunch-img://f/${encodeURIComponent(path.resolve(f))}`);
  });

  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('never uses a texture as the cover', () => {
    fs.mkdirSync(path.join(dir, 'Textures'));
    fs.writeFileSync(path.join(dir, 'AliceFaceDiffuse.png'), png(1024, 1024));
    fs.writeFileSync(path.join(dir, 'Textures', 'whatever.png'), png(1920, 1080));
    fs.writeFileSync(path.join(dir, 'random.png'), png(2048, 2048));
    expect(resolveLocalModThumbnailUrl(dir)).toBeUndefined();
  });

  it('uses a screenshot-shaped image', () => {
    fs.writeFileSync(path.join(dir, 'AliceFaceDiffuse.png'), png(1024, 1024));
    fs.writeFileSync(path.join(dir, 'ingame.png'), png(1920, 1080));
    expect(resolveLocalModThumbnailUrl(dir)).toBe(localImageUrl(path.join(dir, 'ingame.png')));
  });

  it('always prefers a named preview', () => {
    fs.writeFileSync(path.join(dir, 'ingame.png'), png(1920, 1080));
    fs.writeFileSync(path.join(dir, 'preview.png'), png(512, 512));
    expect(resolveLocalModThumbnailUrl(dir)).toBe(localImageUrl(path.join(dir, 'preview.png')));
  });
});
