import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveLocalModThumbnailDataUrl } from '../src/core/modManagerService';

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
    expect(resolveLocalModThumbnailDataUrl(dir)).toBeUndefined();
  });

  it('uses a screenshot-shaped image', () => {
    fs.writeFileSync(path.join(dir, 'AliceFaceDiffuse.png'), png(1024, 1024));
    fs.writeFileSync(path.join(dir, 'ingame.png'), png(1920, 1080));
    expect(resolveLocalModThumbnailDataUrl(dir)).toBe(`data:image/png;base64,${png(1920, 1080).toString('base64')}`);
  });

  it('always prefers a named preview', () => {
    fs.writeFileSync(path.join(dir, 'ingame.png'), png(1920, 1080));
    fs.writeFileSync(path.join(dir, 'preview.png'), png(512, 512));
    expect(resolveLocalModThumbnailDataUrl(dir)).toBe(`data:image/png;base64,${png(512, 512).toString('base64')}`);
  });
});
