// Content pre-scan. Runs on GitHub Actions only (.github/workflows/nsfw-prescan.yml), never in the app.
//
// Labels every Zenless Zone Zero mod on GameBanana ahead of time, so the app only downloads the
// result (verdicts.json on the nsfw-verdicts branch) and nothing is scanned on users' PCs.
// Uses the same rules as the app (src/shared/nsfw.ts, bundled to a plain .mjs by the workflow).
//
// node nsfw-prescan.mjs <nsfw.mjs> <models dir> <verdicts.json>
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as tf from '@tensorflow/tfjs-node';
import sharp from 'sharp';

const [, , libPath, modelsDir, outFile] = process.argv;
const N = await import(pathToFileURL(path.resolve(libPath)).href);

const GAME = 19567;
const UA = { 'User-Agent': 'ProxyLaunch-prescan (github.com/saiochiro/zzz-mod-manager)' };
const MAX_IMAGES = 10;
const PARALLEL = 4;
const started = Date.now();
const budgetMs = (Number(process.env.BUDGET_MIN) || 45) * 60 * 1000;
const outOfTime = () => Date.now() - started > budgetMs;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      if (r.status === 404 || r.status === 403) return null;
    } catch {
      // retry
    }
    await sleep(1000 * (i + 1));
  }
  return null;
}

/* ------------------------------ models ------------------------------ */

function loadModel(dir) {
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf-8'));
  const buf = fs.readFileSync(path.join(dir, 'weights.bin'));
  return tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      format: json.format,
      weightSpecs: json.weightsManifest.flatMap((g) => g.weights),
      weightData: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    })
  );
}
const inc = await loadModel(path.join(modelsDir, 'inception'));
const mob = await loadModel(path.join(modelsDir, 'mobilenet'));

async function classify(model, bytes, size) {
  const raw = await sharp(bytes).removeAlpha().resize(size, size, { fit: 'fill' }).raw().toBuffer();
  const t = tf.tidy(() => model.predict(tf.tensor3d(new Uint8Array(raw), [size, size, 3], 'int32').toFloat().div(255).expandDims(0)));
  const p = Array.from(await t.data());
  t.dispose();
  return Object.fromEntries(N.NSFW_MODEL_CLASSES.map((c, i) => [c, p[i] ?? 0]));
}

async function scoreImage(url) {
  // The 530 px version is plenty for 299 px models; fall back to the full picture.
  const small = url.replace(/(\/img\/ss\/mods\/)(?!\d+-\d+_)([^/]+)$/i, '$1530-90_$2');
  let bytes = null;
  for (const u of small !== url ? [small, url] : [url]) {
    try {
      const r = await fetch(u, { headers: UA });
      if (r.ok) {
        bytes = Buffer.from(await r.arrayBuffer());
        break;
      }
    } catch {
      // next
    }
  }
  if (!bytes) throw new Error('download failed');
  return { inc: await classify(inc, bytes, 299), mob: await classify(mob, bytes, 224) };
}

/* --------------------------- previous list -------------------------- */

let mods = {};
let generatedAt = new Date().toISOString();
try {
  const prev = N.parseVerdictFile(JSON.parse(fs.readFileSync(outFile, 'utf-8')));
  if (prev) ({ mods, generatedAt } = prev);
} catch {
  // first run
}
const before = JSON.stringify(mods);
const save = () => {
  // Same list = same file, so apps get "not modified" and download nothing.
  if (JSON.stringify(mods) !== before) generatedAt = new Date().toISOString();
  fs.writeFileSync(outFile, JSON.stringify({ version: 1, generatedAt, mods }));
};

/* ------------------------------ listing ----------------------------- */

const modifiedOf = (r) => Number(r._tsDateModified || r._tsDateUpdated || r._tsDateAdded || 0);

async function listAll(sort, maxPages = Infinity) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const d = await getJson(`https://gamebanana.com/apiv11/Mod/Index?_nPerpage=50&_nPage=${page}&_aFilters[Generic_Game]=${GAME}&_sSort=${sort}`);
    const recs = d?._aRecords ?? [];
    if (!d) return { recs: out, complete: false };
    out.push(...recs);
    if (recs.length < 50 || d._aMetadata?._bIsComplete) return { recs: out, complete: true };
  }
  return { recs: out, complete: false };
}

const popular = [...(await listAll('Generic_MostLiked', 6)).recs, ...(await listAll('Generic_MostDownloaded', 6)).recs];
const everything = await listAll('Generic_Newest');
if (everything.recs[0]) console.log('index record fields:', Object.keys(everything.recs[0]).join(','));
const seen = new Map();
for (const r of [...popular, ...everything.recs]) if (r?._idRow && !seen.has(r._idRow)) seen.set(r._idRow, r);
console.log(`mods on GameBanana: ${seen.size} (complete listing: ${everything.complete})`);

// Removed mods drop out, but only when the full listing came through.
if (everything.complete && everything.recs.length > 100) {
  for (const id of Object.keys(mods)) if (!seen.has(Number(id))) delete mods[id];
}

const todo = [...seen.values()].filter((r) => {
  const old = mods[r._idRow];
  if (!old) return true;
  if (old.m !== modifiedOf(r)) return true;
  return N.isModRecordNsfw(r) && !old.f; // GameBanana flagged it after the scan
});
console.log(`to scan: ${todo.length}`);

/* ------------------------------- scan ------------------------------- */

const stats = { s: 0, t: 0, n: 0, imagesScored: 0, skipped: 0, failed: 0 };

async function scanMod(rec) {
  const id = rec._idRow;
  const p = await getJson(`https://gamebanana.com/apiv11/Mod/${id}/ProfilePage`);
  if (!p) {
    stats.failed++;
    return;
  }
  const files = Array.isArray(p._aFiles) ? p._aFiles : [];
  const ratings = p._aContentRatings && typeof p._aContentRatings === 'object' ? Object.values(p._aContentRatings).map(String) : [];
  const tags = Array.isArray(p._aTags) ? p._aTags.map((t) => (typeof t === 'string' ? t : t?._sTitle || t?._sValue || '')).join(' ') : '';
  const category = [p._aCategory?._sName, p._aRootCategory?._sName].filter(Boolean).join(' ');
  const evidence = N.buildNsfwEvidence({
    title: String(p._sName || rec._sName || ''),
    description: String(p._sDescription || ''),
    pageText: [String(p._sText || '').replace(/<[^>]+>/g, ' '), tags, ...files.flatMap((f) => [f._sFile, f._sDescription])].filter(Boolean).join(' '),
    fileNames: files.flatMap((f) => [f._sFile, f._sDescription].filter(Boolean).map(String)),
    ratings,
    hasRatings: p._bHasContentRatings === true || ratings.length > 0,
    flagged: N.isModRecordNsfw(rec) || N.isModRecordNsfw(p),
    category: /skin|character|outfit/i.test(category) || !category ? 'Skins' : category,
  });

  const urls = (p._aPreviewMedia?._aImages ?? [])
    .map((img) => (img?._sBaseUrl && img?._sFile ? `${img._sBaseUrl}/${img._sFile}` : ''))
    .filter(Boolean)
    .slice(0, MAX_IMAGES);

  const scores = [];
  const scored = [];
  if (N.needsImageScan(evidence)) {
    for (const u of urls) {
      try {
        scores.push(await scoreImage(u));
        scored.push(u);
        stats.imagesScored++;
      } catch {
        if (scored.length === 0) {
          // No cover score: leave it unlabeled (hidden in the SFW views) and try next run.
          stats.failed++;
          return;
        }
      }
    }
  } else {
    stats.skipped++;
  }

  const v = N.decideNsfwLevel({ ...evidence, images: scores });
  const entry = { l: N.LEVEL_CODE[v.level], f: evidence.flagged ? 1 : 0, m: modifiedOf(rec) };
  if (v.level !== 'nsfw') entry.c = scored.filter((_, i) => v.cleanImages[i]).map(N.imageKey);
  mods[id] = entry;
  stats[entry.l]++;
}

let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < todo.length && !outOfTime()) {
      const rec = todo[next++];
      try {
        await scanMod(rec);
      } catch (e) {
        stats.failed++;
        console.warn(`mod ${rec._idRow}: ${e?.message || e}`);
      }
      if (++done % 200 === 0) {
        save();
        console.log(`${done}/${todo.length}`, JSON.stringify(stats));
      }
    }
  })
);
save();
console.log(`done ${done}/${todo.length} in ${Math.round((Date.now() - started) / 60000)} min`, JSON.stringify(stats));
console.log(`labels in list: ${Object.keys(mods).length}`);
