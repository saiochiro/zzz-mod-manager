// Calibration for the on-device NSFW check (run in CI, not shipped).
// Scores real ZZZ skin mods from GameBanana with the bundled model and records the scores next to
// GameBanana's own content ratings, plus what the archive file-list API returns.
// Output: calibration/results.json (no images are stored, only scores and metadata).
import fs from 'fs';
import path from 'path';
import * as tf from '@tensorflow/tfjs';
import sharp from 'sharp';

const GAME = 19567;
const CAT = 30305;
const UA = { 'User-Agent': 'ProxyLaunch-calibration' };
const MAX_IMAGES = 8;
const MODS_PER_SORT = 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch {}
    await sleep(800 * (i + 1));
  }
  return null;
}
const imgUrl = (img) => (img?._sBaseUrl && img?._sFile ? `${img._sBaseUrl}/${img._sFile}` : '');

const dir = path.resolve('public/nsfw-model');
const json = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf-8'));
const w = fs.readFileSync(path.join(dir, 'weights.bin'));
await tf.setBackend('cpu');
const model = await tf.loadLayersModel(
  tf.io.fromMemory({ modelTopology: json.modelTopology, weightSpecs: json.weightsManifest.flatMap((g) => g.weights), weightData: w.buffer.slice(w.byteOffset, w.byteOffset + w.byteLength) })
);
const CLASSES = ['drawing', 'hentai', 'neutral', 'porn', 'sexy'];
async function score(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`img ${r.status}`);
  const raw = await sharp(Buffer.from(await r.arrayBuffer())).removeAlpha().resize(224, 224, { fit: 'fill' }).raw().toBuffer();
  const out = tf.tidy(() => model.predict(tf.tensor3d(new Uint8Array(raw), [224, 224, 3], 'int32').toFloat().div(255).reshape([1, 224, 224, 3])));
  const p = Array.from(await out.data());
  out.dispose();
  return Object.fromEntries(CLASSES.map((c, i) => [c, Math.round(p[i] * 1000) / 1000]));
}

const ids = new Map();
for (const sort of ['Generic_MostLiked', 'Generic_Newest', 'Generic_MostDownloaded']) {
  for (let page = 1; page <= 3 && [...ids.values()].filter((v) => v === sort).length < MODS_PER_SORT; page++) {
    const idx = await getJson(
      `https://gamebanana.com/apiv11/Mod/Index?_nPerpage=50&_nPage=${page}&_aFilters[Generic_Category]=${CAT}&_aFilters[Generic_Game]=${GAME}&_sSort=${sort}`
    );
    for (const rec of idx?._aRecords ?? []) if (!ids.has(rec._idRow)) ids.set(rec._idRow, sort);
  }
}
console.log('mods', ids.size);

const results = [];
let probe = null;
for (const [id, sort] of ids) {
  const p = await getJson(`https://gamebanana.com/apiv11/Mod/${id}/ProfilePage`);
  if (!p) continue;
  const files = Array.isArray(p._aFiles) ? p._aFiles : [];
  const entry = {
    id,
    sort,
    name: p._sName,
    category: p._aCategory?._sName,
    hasRatings: p._bHasContentRatings ?? null,
    ratings: p._aContentRatings ?? null,
    visibility: p._sInitialVisibility ?? null,
    nsfwFlag: p._bIsNsfw ?? null,
    likes: p._nLikeCount,
    textLen: String(p._sText || '').length,
    text: String(p._sText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400),
    files: files.map((f) => ({ id: f._idRow, name: f._sFile, desc: f._sDescription, size: f._nFilesize, keys: Object.keys(f) })),
    images: [],
  };
  // Probe archive contents APIs once (we don't know the exact shape yet).
  if (!probe && files[0]?._idRow) {
    probe = {};
    for (const u of [
      `https://gamebanana.com/apiv11/File/${files[0]._idRow}`,
      `https://gamebanana.com/apiv11/File/${files[0]._idRow}/RawFileTree`,
      `https://gamebanana.com/apiv11/File/${files[0]._idRow}/Contents`,
      `https://api.gamebanana.com/Core/Item/Data?itemtype=File&itemid=${files[0]._idRow}&fields=Metadata().aArchiveFileTree()`,
    ]) {
      const j = await getJson(u);
      probe[u] = j ? JSON.stringify(j).slice(0, 4000) : null;
    }
  }
  // File tree for every mod, using whichever endpoint answered.
  if (files[0]?._idRow) {
    const ft = await getJson(`https://api.gamebanana.com/Core/Item/Data?itemtype=File&itemid=${files[0]._idRow}&fields=Metadata().aArchiveFileTree()`);
    entry.fileTree = ft ? JSON.stringify(ft).slice(0, 6000) : null;
  }
  const imgs = (p._aPreviewMedia?._aImages ?? []).map(imgUrl).filter(Boolean).slice(0, MAX_IMAGES);
  entry.imageTotal = (p._aPreviewMedia?._aImages ?? []).length;
  for (const u of imgs) {
    try {
      entry.images.push(await score(u));
    } catch (e) {
      entry.images.push({ error: String(e.message || e) });
    }
  }
  results.push(entry);
  console.log(id, entry.images.length, entry.name);
}
fs.mkdirSync('calibration', { recursive: true });
fs.writeFileSync('calibration/results.json', JSON.stringify({ when: new Date().toISOString(), probe, results }, null, 1));
