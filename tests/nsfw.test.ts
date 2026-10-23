import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decideNsfwLevel,
  imageKey,
  isBlurredByNsfwFilter,
  isHiddenByNsfwFilter,
  NSFW_FILE_RE,
  NSFW_MODEL_CLASSES,
  rateImage,
  TOGGLE_KEY_RE,
  TOGGLE_TEXT_RE,
  type NsfwScores,
} from '../src/shared/nsfw';
import { applyNsfwReview, initNsfwReview, submitNsfwReview } from '../src/core/nsfwReview';
import { findNsfwToggles, restoreMod, sanitizeMod } from '../src/core/nsfwSanitizer';

const clean: NsfwScores = { drawing: 0.7, hentai: 0.05, neutral: 0.2, porn: 0.02, sexy: 0.03 };
const nude: NsfwScores = { drawing: 0.05, hentai: 0.7, neutral: 0.05, porn: 0.15, sexy: 0.05 };
const skimpy: NsfwScores = { drawing: 0.1, hentai: 0.08, neutral: 0.05, porn: 0.02, sexy: 0.75 };
const meh: NsfwScores = { drawing: 0.4, hentai: 0.3, neutral: 0.1, porn: 0.05, sexy: 0.15 };
const none = { flagged: false, toggleHint: false };

describe('Content tiers', () => {
  it('rates single pictures', () => {
    expect(rateImage(clean)).toBe('clean');
    expect(rateImage(nude)).toBe('explicit');
    expect(rateImage(skimpy)).toBe('skimpy');
    expect(rateImage(meh)).toBe('unsure');
  });

  it('SFW only when every picture is clean and nothing else says NSFW', () => {
    expect(decideNsfwLevel({ ...none, images: [clean, clean, clean] }).level).toBe('sfw');
    expect(decideNsfwLevel({ ...none, images: [] }).level).toBe('sfw');
  });

  it('catches unlabeled mods: a skimpy or unclear cover is never SFW', () => {
    expect(decideNsfwLevel({ ...none, images: [skimpy, clean] }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...none, images: [meh, clean] }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...none, images: [nude] }).level).toBe('nsfw');
  });

  it('never trusts a GameBanana NSFW label just because the pictures look clean', () => {
    expect(decideNsfwLevel({ ...none, flagged: true, images: [clean, clean] }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...none, flagged: true, images: [clean, clean], isSkin: false }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...none, flagged: true, images: [] }).level).toBe('nsfw');
  });

  it('Experimental: clean SFW cover and mostly clean pictures, with NSFW options', () => {
    expect(decideNsfwLevel({ ...none, images: [clean, clean, clean, nude] }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...none, images: [clean, clean], hotkeyNsfw: true }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...none, images: [clean, clean], fileTreeNsfw: true }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...none, images: [clean, clean], toggleHint: true }).level).toBe('toggle');
    // Mostly NSFW pictures, a nude edit, or not a skin: NSFW.
    expect(decideNsfwLevel({ ...none, images: [clean, nude, skimpy] }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...none, images: [clean, clean], nudeEditText: true }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...none, images: [clean, nude], isSkin: false }).level).toBe('nsfw');
  });

  it('reports which pictures are clean, so NSFW screenshots can be removed', () => {
    expect(decideNsfwLevel({ ...none, images: [clean, nude, clean, meh] }).cleanImages).toEqual([true, false, true, false]);
    expect(imageKey('https://images.gamebanana.com/img/ss/mods/530-90_abc.jpg')).toBe(imageKey('https://images.gamebanana.com/img/ss/mods/abc.jpg'));
  });

  it('spots NSFW wording in pages, hotkeys and file names', () => {
    for (const t of ['Includes an NSFW toggle', 'SFW by default, press F5', 'nude toggle on 6', 'Toggleable NSFW', 'comes with SFW and NSFW versions', 'optional nudity']) {
      expect(TOGGLE_TEXT_RE.test(t)).toBe(true);
    }
    expect(TOGGLE_KEY_RE.test('KeyNude')).toBe(true);
    expect(TOGGLE_KEY_RE.test('KeySwapBangs')).toBe(false);
    for (const f of ['Body_Nude.dds', 'NSFW/Body.ini', 'topless.buf', 'Textures/nipples.dds']) expect(NSFW_FILE_RE.test(f)).toBe(true);
    for (const f of ['Body.ini', 'BodyADiffuse.dds', 'Toggle_Jacket.ini', 'Denuded.txt']) expect(NSFW_FILE_RE.test(f)).toBe(false);
  });

  it('views: unscanned mods never show in the SFW views; Show all shows everything unblurred', () => {
    const sfw = { nsfw_level: 'sfw' as const, nsfw_checked: true };
    const pending = { nsfw_level: 'sfw' as const, nsfw_checked: false };
    const exp = { nsfw_level: 'toggle' as const, is_nsfw: true, nsfw_checked: true };
    const nsfw = { nsfw_level: 'nsfw' as const, is_nsfw: true, nsfw_checked: true };
    const all = [sfw, pending, exp, nsfw];
    expect(all.map((m) => isHiddenByNsfwFilter(m, 'hide'))).toEqual([false, true, true, true]);
    expect(all.map((m) => isHiddenByNsfwFilter(m, 'toggle'))).toEqual([false, true, false, true]);
    expect(all.map((m) => isHiddenByNsfwFilter(m, 'blur'))).toEqual([false, false, false, false]);
    expect(all.map((m) => isBlurredByNsfwFilter(m, 'blur'))).toEqual([false, true, false, true]);
    expect(all.map((m) => isHiddenByNsfwFilter(m, 'show'))).toEqual([false, false, false, false]);
    expect(all.map((m) => isBlurredByNsfwFilter(m, 'show'))).toEqual([false, false, false, false]);
  });
});

describe('Content scan store', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nsfw-'));
    initNsfwReview(tmp);
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('applies verdicts, keeps clean picture lists, survives a restart and writes a developer log', async () => {
    const item = { id: 5, is_nsfw: false };
    expect(applyNsfwReview(item, 'gb:5')).toMatchObject({ nsfw_checked: false });
    const res = await submitNsfwReview({
      key: 'gb:5',
      flagged: false,
      title: 'Cute outfit',
      imageUrls: ['https://x/a.jpg', 'https://x/b.jpg'],
      scores: [clean, clean],
    });
    expect(res.level).toBe('sfw');
    initNsfwReview(tmp);
    expect(applyNsfwReview(item, 'gb:5')).toMatchObject({ nsfw_level: 'sfw', nsfw_checked: true, nsfw_clean_images: ['a.jpg', 'b.jpg'] });
    const log = fs.readFileSync(path.join(tmp, 'cache', 'nsfw_review_log.jsonl'), 'utf-8');
    expect(log).toContain('"key":"gb:5"');
  });

  it('scans again when GameBanana labels a mod after a clean scan', async () => {
    await submitNsfwReview({ key: 'gb:9', flagged: false, title: 'Outfit', imageUrls: ['u'], scores: [clean] });
    expect(applyNsfwReview({ id: 9, is_nsfw: true }, 'gb:9')).toMatchObject({ nsfw_checked: false, nsfw_level: 'nsfw' });
  });

  it('NSFW words in the title keep a mod out of SFW, but "no NSFW" does not', async () => {
    expect((await submitNsfwReview({ key: 'a', flagged: false, title: 'Sexy bunny suit', imageUrls: ['u'], scores: [clean] })).level).not.toBe('sfw');
    expect((await submitNsfwReview({ key: 'b', flagged: false, title: 'Cute outfit (no NSFW)', imageUrls: ['u'], scores: [clean] })).level).toBe('sfw');
  });
});

describe('Sanitizing NSFW toggles', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'san-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const ini = [
    '[Constants]',
    'global persist $nude = 0',
    'global persist $jacket = 1',
    '',
    '[KeyNude]',
    'key = 6',
    'type = cycle',
    '$nude = 0,1',
    '',
    '[KeyJacket]',
    'key = 7',
    '$jacket = 0,1',
    '',
    '[TextureOverrideBody]',
    'hash = 1234abcd',
    'if $nude == 1',
    '  ps-t0 = ResourceBodyNude',
    'else',
    '  ps-t0 = ResourceBody',
    'endif',
    '',
    '[ResourceBodyNude]',
    'filename = Body_Nude.dds',
    '[ResourceBody]',
    'filename = Body.dds',
    '',
  ].join('\n');

  it('disables NSFW hotkeys, pins the safe state, moves NSFW files out, and can restore', () => {
    const mod = path.join(tmp, 'mod');
    fs.mkdirSync(mod);
    fs.writeFileSync(path.join(mod, 'mod.ini'), ini);
    fs.writeFileSync(path.join(mod, 'Body_Nude.dds'), 'x');
    fs.writeFileSync(path.join(mod, 'Body.dds'), 'y');

    const found = findNsfwToggles(mod);
    expect(found.map((t) => [t.keySection, t.variable, t.safeValue])).toEqual([['keynude', 'nude', 0]]);

    const bak = path.join(tmp, 'bak');
    const r = sanitizeMod(mod, bak);
    expect(r.changed).toBe(true);
    const out = fs.readFileSync(path.join(mod, 'mod.ini'), 'utf-8');
    expect(out).toMatch(/^global \$nude = 0$/m); // no "persist": a saved NSFW state can't come back
    expect(out).not.toMatch(/^\[KeyNude\]/m);
    expect(out).toMatch(/^\[KeyJacket\]/m); // normal toggles stay
    expect(out).not.toMatch(/^filename = Body_Nude\.dds/m);
    expect(fs.existsSync(path.join(mod, 'Body_Nude.dds'))).toBe(false);
    expect(fs.existsSync(path.join(mod, 'Body.dds'))).toBe(true);
    // Running again does nothing.
    expect(sanitizeMod(mod, bak).changed).toBe(false);

    expect(restoreMod(mod, bak)).toBe(true);
    expect(fs.readFileSync(path.join(mod, 'mod.ini'), 'utf-8')).toBe(ini);
    expect(fs.existsSync(path.join(mod, 'Body_Nude.dds'))).toBe(true);
  });

  it('leaves mods without NSFW toggles alone', () => {
    const mod = path.join(tmp, 'clean');
    fs.mkdirSync(mod);
    fs.writeFileSync(path.join(mod, 'mod.ini'), '[KeyJacket]\nkey = 7\n$jacket = 0,1\n');
    expect(sanitizeMod(mod, path.join(tmp, 'bak2')).changed).toBe(false);
  });
});

describe('NSFW image model', () => {
  it('loads the bundled model and scores a safe picture as safe', async () => {
    const tf = await import('@tensorflow/tfjs');
    await tf.setBackend('cpu');
    const dir = path.resolve(__dirname, '../public/nsfw-model');
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf-8'));
    const w = fs.readFileSync(path.join(dir, 'weights.bin'));
    const model = await tf.loadLayersModel(
      tf.io.fromMemory({
        modelTopology: json.modelTopology,
        weightSpecs: json.weightsManifest.flatMap((g: any) => g.weights),
        weightData: w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength) as ArrayBuffer,
      })
    );
    const pixels = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures/scene-224.rgb')));
    const out = tf.tidy(() => model.predict(tf.tensor3d(pixels, [224, 224, 3], 'int32').toFloat().div(255).reshape([1, 224, 224, 3])) as any);
    const probs = Array.from((await out.data()) as Float32Array);
    expect(probs).toHaveLength(NSFW_MODEL_CLASSES.length);
    expect(Math.abs(probs.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(0.01);
    const scores = Object.fromEntries(NSFW_MODEL_CLASSES.map((c, i) => [c, probs[i]])) as unknown as NsfwScores;
    console.log('scene scores', scores);
    expect(scores.porn + scores.hentai).toBeLessThan(0.3);
    expect(scores.drawing + scores.neutral).toBeGreaterThan(0.6);
  }, 120_000);
});
