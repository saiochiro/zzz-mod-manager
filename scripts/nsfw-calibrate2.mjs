// Calibration v2 (CI only): every picture scored by all three NSFWJS models plus a skin-exposure
// measure, next to GameBanana's own ratings. Output: calibration/results2.json (scores only).
import fs from 'fs';
import path from 'path';
let tf;
try {
  tf = await import('@tensorflow/tfjs-node');
} catch {
  tf = await import('@tensorflow/tfjs');
}
import sharp from 'sharp';

const GAME = 19567, CAT = 30305, UA = { 'User-Agent': 'ProxyLaunch-calibration' };
const MAX_IMAGES = 10;
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
const imgUrl = (img) => (img?._sBaseUrl && img?._sFile ? `${img._sBaseUrl}/530-90_${img._sFile}` : '');

function load(dir, kind) {
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf-8'));
  const shards = json.weightsManifest.flatMap((g) => g.paths).map((p) => fs.readFileSync(path.join(dir, fs.existsSync(path.join(dir, p)) ? p : 'weights.bin')));
  const buf = Buffer.concat(shards);
  const art = { modelTopology: json.modelTopology, format: json.format, weightSpecs: json.weightsManifest.flatMap((g) => g.weights), weightData: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  return kind === 'graph' ? tf.loadGraphModel(tf.io.fromMemory(art)) : tf.loadLayersModel(tf.io.fromMemory(art));
}
const models = {
  v2: { m: await load('public/nsfw-model', 'layers'), size: 224 },
  mid: { m: await load('calib-models/mobilenet_v2_mid', 'graph'), size: 224 },
  inc: { m: await load('calib-models/inception_v3', 'layers'), size: 299 },
};
const CLASSES = ['drawing', 'hentai', 'neutral', 'porn', 'sexy'];

function skin(raw, w, h) {
  // Share of skin-tone pixels in the middle of the picture (where the character usually is).
  let s = 0, n = 0;
  for (let y = Math.floor(h * 0.15); y < h * 0.9; y++)
    for (let x = Math.floor(w * 0.25); x < w * 0.75; x++) {
      const i = (y * w + x) * 3, r = raw[i], g = raw[i + 1], b = raw[i + 2];
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 15 && cr >= 135 && cr <= 173 && cb >= 77 && cb <= 127) s++;
      n++;
    }
  return Math.round((s / n) * 1000) / 1000;
}

async function scoreAll(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`img ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const out = {};
  for (const [name, { m, size }] of Object.entries(models)) {
    const raw = await sharp(bytes).removeAlpha().resize(size, size, { fit: 'fill' }).raw().toBuffer();
    if (name === 'v2') out.skin = skin(raw, size, size);
    const t = tf.tidy(() => {
      const x = tf.tensor3d(new Uint8Array(raw), [size, size, 3], 'int32').toFloat().div(255).reshape([1, size, size, 3]);
      const y = m.predict ? m.predict(x) : m.execute(x);
      return Array.isArray(y) ? y[0] : y;
    });
    let p = Array.from(await t.data());
    t.dispose();
    // graph models may output logits
    if (p.some((v) => v < 0 || v > 1) || Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 0.05) {
      const mx = Math.max(...p), e = p.map((v) => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0);
      p = e.map((v) => v / s);
    }
    out[name] = Object.fromEntries(CLASSES.map((c, i) => [c, Math.round(p[i] * 1000) / 1000]));
  }
  return out;
}

const ids = new Map();
for (const sort of ['Generic_MostLiked', 'Generic_Newest', 'Generic_MostDownloaded', 'Generic_LatestModified']) {
  for (let page = 1; page <= 4; page++) {
    const idx = await getJson(`https://gamebanana.com/apiv11/Mod/Index?_nPerpage=50&_nPage=${page}&_aFilters[Generic_Category]=${CAT}&_aFilters[Generic_Game]=${GAME}&_sSort=${sort}`);
    for (const rec of idx?._aRecords ?? []) if (!ids.has(rec._idRow)) ids.set(rec._idRow, { sort, rec });
  }
}
const all = [...ids.entries()];
console.log('mods', all.length);
const picked = all.slice(0, 260);
const results = [];
for (const [id, { sort, rec }] of picked) {
  const p = await getJson(`https://gamebanana.com/apiv11/Mod/${id}/ProfilePage`);
  if (!p) continue;
  const imgs = (p._aPreviewMedia?._aImages ?? []).map(imgUrl).filter(Boolean).slice(0, MAX_IMAGES);
  const entry = {
    id, sort, name: p._sName, category: p._aCategory?._sName, hasRatings: p._bHasContentRatings ?? null, ratings: p._aContentRatings ?? null,
    visibility: p._sInitialVisibility ?? null, likes: p._nLikeCount, text: String(p._sText || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300),
    files: (p._aFiles ?? []).map((f) => f._sFile), imageTotal: (p._aPreviewMedia?._aImages ?? []).length, images: [],
  };
  for (const u of imgs) {
    try {
      entry.images.push(await scoreAll(u));
    } catch (e) {
      entry.images.push({ error: String(e.message || e) });
    }
  }
  results.push(entry);
  console.log(results.length, id, entry.images.length, entry.name);
}
fs.mkdirSync('calibration', { recursive: true });
fs.writeFileSync('calibration/results2.json', JSON.stringify({ when: new Date().toISOString(), results }, null, 1));
