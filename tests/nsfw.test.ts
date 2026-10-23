import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildNsfwEvidence,
  decideNsfwLevel,
  imageKey,
  isModRecordNsfw,
  needsImageScan,
  isBlurredByNsfwFilter,
  isHiddenByNsfwFilter,
  NSFW_FILE_RE,
  NSFW_MODEL_CLASSES,
  rateImage,
  titleNamesNsfw,
  TOGGLE_KEY_RE,
  TOGGLE_TEXT_RE,
  type NsfwImageScores,
  type NsfwScores,
} from '../src/shared/nsfw';
import { applyNsfwReview, initNsfwReview, setNsfwVerdictsForTest } from '../src/core/nsfwReview';
import { fetchLiveGameBananaFeed } from '../src/core/gamebananaService';
import { findNsfwToggles, restoreMod, sanitizeMod } from '../src/core/nsfwSanitizer';

const both = (s: NsfwScores): NsfwImageScores => ({ inc: s, mob: s });
const clean = both({ drawing: 0.96, hentai: 0.02, neutral: 0.01, porn: 0.005, sexy: 0.005 });
const nude = both({ drawing: 0.05, hentai: 0.7, neutral: 0.05, porn: 0.15, sexy: 0.05 });
const skimpy = both({ drawing: 0.1, hentai: 0.04, neutral: 0.05, porn: 0.01, sexy: 0.8 });
const meh = both({ drawing: 0.7, hentai: 0.2, neutral: 0.05, porn: 0.03, sexy: 0.02 });
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

  it('any GameBanana rating keeps a mod out of SFW, even with clean pictures', () => {
    // Rated (skimpy attire, nudity...) and no proof the NSFW part is an option: NSFW.
    expect(decideNsfwLevel({ ...none, flagged: true, images: [clean, clean] }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...none, flagged: true, images: [] }).level).toBe('nsfw');
    // Rated, but the page says it's a toggle and the pictures are clean: Experimental.
    expect(decideNsfwLevel({ ...none, flagged: true, toggleHint: true, images: [clean, clean] }).level).toBe('toggle');
  });

  it('Experimental needs real toggle evidence plus a clean cover and mostly clean pictures', () => {
    expect(decideNsfwLevel({ ...none, images: [clean, clean, clean, nude], toggleHint: true }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...none, images: [clean, clean], hotkeyNsfw: true }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...none, images: [clean, clean], fileTreeNsfw: true }).level).toBe('toggle');
    // NSFW screenshots without any toggle evidence: NSFW, not Experimental.
    expect(decideNsfwLevel({ ...none, images: [clean, clean, clean, nude] }).level).toBe('nsfw');
    // Mostly NSFW pictures, a nude edit, or not a skin: NSFW.
    expect(decideNsfwLevel({ ...none, images: [clean, nude, skimpy], toggleHint: true }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...none, images: [clean, clean], toggleHint: true, nudeEditText: true }).level).toBe('nsfw');
    expect(decideNsfwLevel({ ...none, images: [clean, clean], toggleHint: true, isSkin: false }).level).toBe('nsfw');
  });

  it('a title that names NSFW content is never SFW or Experimental', () => {
    for (const t of ['Yanagi Skimpy Collection', 'Ye Shunguang Swimsuit NSFW Switch', 'Miyabi - Bottom Heavy', 'Anby spy Lewd order nsfw switch', 'Jufufu-Michele-NSFW', 'Ellen Thicc & Simple']) {
      expect(titleNamesNsfw(t)).toBe(true);
    }
    for (const t of ['Sweety Miyabi', 'Burnice Outfit Toggles', 'Velina with Shawl and Skirt', 'Cute outfit (no NSFW)', 'Phoenix with NSFW toggle']) {
      expect(titleNamesNsfw(t)).toBe(false);
    }
    expect(decideNsfwLevel({ ...none, images: [clean, clean], toggleHint: true, nsfwTitle: true }).level).toBe('nsfw');
  });

  it('a picture is clean only if both models agree', () => {
    const incSaysNude: NsfwImageScores = { inc: nude.inc, mob: clean.mob };
    expect(rateImage(incSaysNude)).toBe('explicit');
    const mobUnsure: NsfwImageScores = { inc: clean.inc, mob: meh.mob };
    expect(rateImage(mobUnsure)).not.toBe('clean');
  });

  it('reports which pictures are clean, so NSFW screenshots can be removed', () => {
    expect(decideNsfwLevel({ ...none, images: [clean, nude, clean, meh], toggleHint: true }).cleanImages).toEqual([true, false, true, false]);
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

  it('views: unscanned mods never show in SFW only; Show all shows everything unblurred', () => {
    const sfw = { nsfw_level: 'sfw' as const, nsfw_checked: true };
    const pending = { nsfw_level: 'sfw' as const, nsfw_checked: false };
    const exp = { nsfw_level: 'toggle' as const, is_nsfw: true, nsfw_checked: true };
    const nsfw = { nsfw_level: 'nsfw' as const, is_nsfw: true, nsfw_checked: true };
    const all = [sfw, pending, exp, nsfw];
    expect(all.map((m) => isHiddenByNsfwFilter(m, 'hide'))).toEqual([false, true, true, true]);
    // "SFW + toggles" is on hold: an old saved setting acts as SFW only, Experimental counts as NSFW.
    expect(all.map((m) => isHiddenByNsfwFilter(m, 'toggle'))).toEqual([false, true, true, true]);
    expect(all.map((m) => isHiddenByNsfwFilter(m, 'blur'))).toEqual([false, false, false, false]);
    expect(all.map((m) => isBlurredByNsfwFilter(m, 'blur'))).toEqual([false, true, true, true]);
    expect(all.map((m) => isHiddenByNsfwFilter(m, 'show'))).toEqual([false, false, false, false]);
    expect(all.map((m) => isBlurredByNsfwFilter(m, 'show'))).toEqual([false, false, false, false]);
  });
});

describe('Pre-scan page rules', () => {
  const page = (o: Partial<Parameters<typeof buildNsfwEvidence>[0]> = {}) =>
    buildNsfwEvidence({ title: 'Cute outfit', pageText: '', fileNames: [], ratings: [], hasRatings: false, ...o });

  it('any GameBanana rating or NSFW wording marks the page flagged', () => {
    expect(page().flagged).toBe(false);
    expect(page({ hasRatings: true }).flagged).toBe(true);
    expect(page({ ratings: ['Skimpy Attire'] }).flagged).toBe(true);
    expect(page({ pageText: 'very lewd' }).flagged).toBe(true);
    expect(page({ title: 'Cute outfit (no NSFW)' }).flagged).toBe(false);
    expect(page({ title: 'Sexy bunny suit' }).nsfwTitle).toBe(true);
  });

  it('skips scoring pictures only when the answer is NSFW anyway', () => {
    expect(needsImageScan(page())).toBe(true); // could be SFW
    expect(needsImageScan(page({ hasRatings: true }))).toBe(false); // rated, no toggle: NSFW
    expect(needsImageScan(page({ hasRatings: true, pageText: 'Includes an NSFW toggle' }))).toBe(true); // maybe Experimental
    expect(needsImageScan(page({ title: 'Nude edit' }))).toBe(false);
    expect(needsImageScan(page({ hasRatings: true, pageText: 'nsfw toggle', category: 'UI' }))).toBe(false);
  });

  it('a pre-scan verdict matches what the old on-device check decided', () => {
    const e = page({ hasRatings: true, pageText: 'SFW by default, NSFW toggle on 6' });
    expect(decideNsfwLevel({ ...e, images: [clean, clean, nude] }).level).toBe('toggle');
    expect(decideNsfwLevel({ ...page(), images: [clean, clean] }).level).toBe('sfw');
  });

  it('reads GameBanana feed records', () => {
    expect(isModRecordNsfw({ _bHasContentRatings: true })).toBe(true);
    expect(isModRecordNsfw({ _sName: 'Bikini skin' })).toBe(true);
    expect(isModRecordNsfw({ _sName: 'Jacket recolor' })).toBe(false);
  });
});

describe('Downloaded labels', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nsfw-'));
    initNsfwReview(tmp, { fetch: false });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const list = (mods: Record<string, any>) => ({ version: 1 as const, generatedAt: 'x', mods });

  it('applies labels and clean picture lists; mods not in the list stay unchecked', () => {
    setNsfwVerdictsForTest(list({ 5: { l: 's', f: 0, c: ['a.jpg'] }, 6: { l: 't', f: 1, c: ['b.jpg'] }, 7: { l: 'n', f: 1 } }));
    expect(applyNsfwReview({ id: 5, is_nsfw: false }, 'gb:5')).toMatchObject({ nsfw_level: 'sfw', nsfw_checked: true, nsfw_clean_images: ['a.jpg'] });
    expect(applyNsfwReview({ id: 6, is_nsfw: true }, 'gb:6')).toMatchObject({ nsfw_level: 'toggle', is_nsfw: true, nsfw_checked: true });
    expect(applyNsfwReview({ id: 7, is_nsfw: false }, 'gb:7')).toMatchObject({ nsfw_level: 'nsfw', nsfw_checked: true });
    expect(applyNsfwReview({ id: 8, is_nsfw: false }, 'gb:8')).toMatchObject({ nsfw_checked: false });
  });

  it('waits for a new scan when GameBanana flags a mod after a clean label', () => {
    setNsfwVerdictsForTest(list({ 9: { l: 's', f: 0, c: [] } }));
    expect(applyNsfwReview({ id: 9, is_nsfw: true }, 'gb:9')).toMatchObject({ nsfw_checked: false, nsfw_level: 'nsfw' });
  });

  it('serves SFW only Browse from the pre-scanned list: complete, sorted and filtered locally', async () => {
    const card = (id: number, name: string, likes: number, cat: number) => ({
      _idRow: id,
      _sName: name,
      _aSubmitter: { _idRow: 5, _sName: 'Ann' },
      _aCategory: { _idRow: cat, _sName: 'Agent' },
      _nLikeCount: likes,
      _tsDateAdded: 1700000000 + id,
      _aPreviewMedia: { _aImages: [{ _sBaseUrl: 'https://images.gamebanana.com/img/ss/mods', _sFile: `${id}.jpg` }] },
    });
    setNsfwVerdictsForTest(
      list({ 11: { l: 's', f: 0, c: ['11.jpg'], k: card(11, 'Blue jacket', 5, 777) }, 12: { l: 's', f: 0, c: [], k: card(12, 'Red coat', 50, 778) }, 13: { l: 'n', f: 1 } })
    );
    const titles = async (o: object) => (await fetchLiveGameBananaFeed({ page: 1, perPage: 24, hideNsfw: true, ...o })).map((m) => m.title);
    expect(await titles({ sort: 'likes' })).toEqual(['Red coat', 'Blue jacket']);
    expect(await titles({ sort: 'likes', characterSubcatId: 777 })).toEqual(['Blue jacket']);
    expect(await titles({ sort: 'likes', searchQuery: 'coat' })).toEqual(['Red coat']);
    const [first] = await fetchLiveGameBananaFeed({ page: 1, perPage: 24, hideNsfw: true, sort: 'likes' });
    expect(first).toMatchObject({ nsfw_checked: true, nsfw_level: 'sfw', is_nsfw: false });
  });

  it('uses the saved list on the next start, before any download', () => {
    fs.writeFileSync(path.join(tmp, 'cache', 'nsfw_verdicts.json'), JSON.stringify(list({ 3: { l: 's', f: 0, c: [] } })));
    initNsfwReview(tmp, { fetch: false });
    expect(applyNsfwReview({ id: 3, is_nsfw: false }, 'gb:3')).toMatchObject({ nsfw_checked: true, nsfw_level: 'sfw' });
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

describe('NSFW image models', () => {
  async function load(tf: any, dir: string) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf-8'));
    const w = fs.readFileSync(path.join(dir, 'weights.bin'));
    return tf.loadLayersModel(
      tf.io.fromMemory({
        modelTopology: json.modelTopology,
        weightSpecs: json.weightsManifest.flatMap((g: any) => g.weights),
        weightData: w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength) as ArrayBuffer,
      })
    );
  }

  it('both bundled models load and score a safe picture as safe', async () => {
    const tf = await import('@tensorflow/tfjs');
    await tf.setBackend('cpu');
    const pixels = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures/scene-224.rgb')));
    const img = tf.tensor3d(pixels, [224, 224, 3], 'int32').toFloat().div(255);
    const out: Record<string, NsfwScores> = {};
    for (const [name, dir, size] of [
      ['mob', '../prescan/models/mobilenet', 224],
      ['inc', '../prescan/models/inception', 299],
    ] as const) {
      const model = await load(tf, path.resolve(__dirname, dir));
      const y = tf.tidy(() => model.predict(tf.image.resizeBilinear(img as any, [size, size], true).reshape([1, size, size, 3])) as any);
      const probs = Array.from((await y.data()) as Float32Array);
      expect(probs).toHaveLength(NSFW_MODEL_CLASSES.length);
      expect(Math.abs(probs.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(0.01);
      out[name] = Object.fromEntries(NSFW_MODEL_CLASSES.map((c, i) => [c, probs[i]])) as unknown as NsfwScores;
    }
    console.log('scene scores', out);
    // The main model must see this safe picture as safe. (The small one alone flags this dark
    // scene a bit, which is why a picture only counts as clean when both agree.)
    expect(out.inc.porn + out.inc.hentai, JSON.stringify(out)).toBeLessThan(0.1);
    expect(rateImage({ inc: out.inc, mob: out.mob }), JSON.stringify(out)).not.toBe('explicit');
  }, 300_000);
});
