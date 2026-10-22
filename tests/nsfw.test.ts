import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decideNsfwLevel,
  isBlurredByNsfwFilter,
  isHiddenByNsfwFilter,
  NSFW_MODEL_CLASSES,
  rateImage,
  TOGGLE_KEY_RE,
  TOGGLE_TEXT_RE,
  type NsfwScores,
} from '../src/shared/nsfw';
import { applyNsfwReview, initNsfwReview, resetNsfwAiResults, setNsfwOverride, submitNsfwReview } from '../src/core/nsfwReview';

const clean: NsfwScores = { drawing: 0.7, hentai: 0.05, neutral: 0.2, porn: 0.02, sexy: 0.03 };
const nude: NsfwScores = { drawing: 0.05, hentai: 0.7, neutral: 0.05, porn: 0.15, sexy: 0.05 };
const skimpy: NsfwScores = { drawing: 0.1, hentai: 0.08, neutral: 0.05, porn: 0.02, sexy: 0.75 };
const meh: NsfwScores = { drawing: 0.4, hentai: 0.3, neutral: 0.1, porn: 0.05, sexy: 0.15 };
const base = { flagged: true, toggleHint: false, strongRating: false };

describe('NSFW verdicts', () => {
  it('rates single pictures', () => {
    expect(rateImage(clean)).toBe('clean');
    expect(rateImage(nude)).toBe('explicit');
    expect(rateImage(skimpy)).toBe('skimpy');
    expect(rateImage(meh)).toBe('unsure');
  });

  it('removes the label when every picture is clean', () => {
    expect(decideNsfwLevel({ ...base, images: [clean, clean, clean] }).level).toBe('sfw');
  });

  it('calls it a toggle when only some screenshots are NSFW, or the page says so', () => {
    expect(decideNsfwLevel({ ...base, images: [clean, clean, nude] }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...base, images: [clean, meh] }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...base, images: [clean], toggleHint: true }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...base, images: [clean], strongRating: true }).level).toBe('toggle');
  });

  it('keeps the label when the cover is NSFW or unclear', () => {
    expect(decideNsfwLevel({ ...base, images: [nude, clean] }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...base, images: [skimpy] }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...base, images: [meh, clean] }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...base, images: [] }).level).toBe('nsfw');
  });

  it('puts real outfit mods that are a bit revealing under NSFW toggle', () => {
    // Like a full new outfit with a revealing cover, many screenshots, at most one nude shot.
    const outfit = [skimpy, skimpy, clean, skimpy, nude, clean, skimpy, clean];
    expect(decideNsfwLevel({ ...base, images: outfit.slice(0, 6), pictureCount: 16 }).level).toBe('toggle');
    // Same pictures, but the page reads like a nude edit.
    expect(decideNsfwLevel({ ...base, images: outfit.slice(0, 6), pictureCount: 16, nudeEditText: true }).level).toBe('nsfw');
    // A revealing cover with just one or two pictures: not enough to tell, stays 18+.
    expect(decideNsfwLevel({ ...base, images: [skimpy, clean], pictureCount: 2 }).level).toBe('nsfw');
    // Mostly nudity.
    expect(decideNsfwLevel({ ...base, images: [clean, nude, nude, clean], pictureCount: 10 }).level).toBe('nsfw');
  });

  it('only lets skins be NSFW toggle', () => {
    expect(decideNsfwLevel({ ...base, images: [clean, nude, clean], isSkin: false }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...base, images: [clean, clean], isSkin: false }).level).toBe('sfw');
  });

  it('never adds a label to a mod that had none', () => {
    expect(decideNsfwLevel({ ...base, flagged: false, images: [nude] }).level).toBe('sfw');
  });

  it('spots toggle wording on mod pages and hotkeys', () => {
    for (const t of ['Includes an NSFW toggle', 'SFW by default, press F5', 'nude toggle on 6', 'Toggleable NSFW', 'comes with SFW and NSFW versions', 'optional nudity']) {
      expect(TOGGLE_TEXT_RE.test(t)).toBe(true);
    }
    for (const t of ['NSFW', 'A cute SFW outfit', 'Full nude mod']) expect(TOGGLE_TEXT_RE.test(t)).toBe(false);
    expect(TOGGLE_KEY_RE.test('KeyNude')).toBe(true);
    expect(TOGGLE_KEY_RE.test('KeySwapBangs')).toBe(false);
  });

  it('filters and blurs by level', () => {
    const sfw = { nsfw_level: 'sfw' as const };
    const toggle = { nsfw_level: 'toggle' as const, is_nsfw: true };
    const nsfw = { is_nsfw: true };
    expect([sfw, toggle, nsfw].map((m) => isHiddenByNsfwFilter(m, 'hide'))).toEqual([false, true, true]);
    expect([sfw, toggle, nsfw].map((m) => isHiddenByNsfwFilter(m, 'toggle'))).toEqual([false, false, true]);
    expect([sfw, toggle, nsfw].map((m) => isHiddenByNsfwFilter(m, 'blur'))).toEqual([false, false, false]);
    expect([sfw, toggle, nsfw].map((m) => isBlurredByNsfwFilter(m, 'blur'))).toEqual([false, false, true]);
  });
});

describe('NSFW review store', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nsfw-'));
    initNsfwReview(tmp);
    resetNsfwAiResults();
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('applies AI verdicts, keeps your own calls on top, and survives a restart', async () => {
    const item = { id: 5, is_nsfw: true };
    expect(applyNsfwReview(item, 'gb:5')).toMatchObject({ nsfw_level: 'nsfw', nsfw_checked: false, nsfw_source: 'gamebanana' });

    const res = await submitNsfwReview({ key: 'gb:5', flagged: true, title: 'Cute outfit', scores: [clean, clean] });
    expect(res.level).toBe('sfw');
    const cleared = applyNsfwReview(item, 'gb:5');
    expect(cleared).toMatchObject({ nsfw_level: 'sfw', is_nsfw: false, nsfw_checked: true, nsfw_source: 'ai', nsfw_flagged: true });
    // Applying twice changes nothing.
    expect(applyNsfwReview(cleared, 'gb:5')).toEqual(cleared);

    setNsfwOverride('gb:5', 'toggle', true);
    initNsfwReview(tmp); // reload from disk
    expect(applyNsfwReview(item, 'gb:5')).toMatchObject({ nsfw_level: 'toggle', is_nsfw: true, nsfw_source: 'you' });
    // The AI doesn't overrule you.
    expect((await submitNsfwReview({ key: 'gb:5', flagged: true, title: 'x', scores: [clean] })).source).toBe('you');
  });

  it('looks again when a mod gets labeled after a clean check', async () => {
    await submitNsfwReview({ key: 'gb:9', flagged: false, title: 'Outfit', scores: [clean] });
    expect(applyNsfwReview({ id: 9, is_nsfw: false }, 'gb:9').nsfw_checked).toBe(true);
    expect(applyNsfwReview({ id: 9, is_nsfw: true }, 'gb:9')).toMatchObject({ nsfw_checked: false, nsfw_level: 'nsfw' });
  });

  it('uses hotkey names as toggle hints', async () => {
    const res = await submitNsfwReview({ key: 'local:a', flagged: true, title: 'Outfit', hotkeyNames: ['KeyNude'], scores: [clean] });
    expect(res.level).toBe('toggle');
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
