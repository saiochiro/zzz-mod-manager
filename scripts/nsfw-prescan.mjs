// GameBanana label list. Runs on GitHub Actions only (.github/workflows/nsfw-prescan.yml), never in the app.
//
// Lists every Zenless Zone Zero mod on GameBanana with GameBanana's own label (content ratings,
// NSFW visibility, NSFW words in title or tags: isModRecordNsfw in src/shared/nsfw.ts). No AI.
// SFW mods also get a card (what Browse shows), so the app's "SFW only" view can show all of them
// at once instead of paging through GameBanana and hiding most of every page.
// Output: verdicts.json on the nsfw-verdicts branch, downloaded by the app.
//
// node nsfw-prescan.mjs <nsfw.mjs> <verdicts.json>
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const [, , libPath, outFile] = process.argv;
const N = await import(pathToFileURL(path.resolve(libPath)).href);

const GAME = 19567;
const UA = { 'User-Agent': 'ProxyLaunch-labels (github.com/saiochiro/zzz-mod-manager)' };
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

/* --------------------------- previous list -------------------------- */

let mods = {};
let generatedAt = new Date().toISOString();
try {
  const prev = N.parseVerdictFile(JSON.parse(fs.readFileSync(outFile, 'utf-8')));
  if (prev) ({ mods, generatedAt } = prev);
} catch {
  // first run
}
// Entries from the old AI check (no "g" mark) are labeled again from GameBanana.
for (const [id, e] of Object.entries(mods)) if (!e.g) delete mods[id];
const before = JSON.stringify(mods);
const save = () => {
  // Same list = same file, so apps get "not modified" and download nothing.
  if (JSON.stringify(mods) !== before) generatedAt = new Date().toISOString();
  fs.writeFileSync(outFile, JSON.stringify({ version: 1, generatedAt, mods }));
};

/* ------------------------------ listing ----------------------------- */

const modifiedOf = (r) => Number(r._tsDateModified || r._tsDateUpdated || r._tsDateAdded || 0);

async function listAll(sort) {
  const out = [];
  for (let page = 1; ; page++) {
    const d = await getJson(`https://gamebanana.com/apiv11/Mod/Index?_nPerpage=50&_nPage=${page}&_aFilters[Generic_Game]=${GAME}&_sSort=${sort}`);
    if (!d) return { recs: out, complete: false };
    const recs = d._aRecords ?? [];
    out.push(...recs);
    if (recs.length < 50 || d._aMetadata?._bIsComplete) return { recs: out, complete: true };
  }
}

const everything = await listAll('Generic_Newest');
const seen = new Map();
for (const r of everything.recs) if (r?._idRow && !seen.has(r._idRow)) seen.set(r._idRow, r);
console.log(`mods on GameBanana: ${seen.size} (complete listing: ${everything.complete})`);

// Removed mods drop out, but only when the full listing came through.
if (everything.complete && everything.recs.length > 100) {
  for (const id of Object.keys(mods)) if (!seen.has(Number(id))) delete mods[id];
}

/* ------------------------------- cards ------------------------------ */

function cardOf(p, rec) {
  const pick = (o, keys) => (o ? Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) : undefined);
  const images = (p._aPreviewMedia?._aImages ?? rec._aPreviewMedia?._aImages ?? [])
    .slice(0, MAX_IMAGES)
    .map((img) => pick(img, ['_sBaseUrl', '_sFile']))
    .filter((img) => img?._sBaseUrl && img?._sFile);
  return {
    _idRow: p._idRow ?? rec._idRow,
    _sName: p._sName ?? rec._sName,
    _sDescription: String(p._sDescription || '').slice(0, 200) || undefined,
    _sProfileUrl: p._sProfileUrl ?? rec._sProfileUrl,
    _aSubmitter: pick(p._aSubmitter ?? rec._aSubmitter, ['_idRow', '_sName', '_sAvatarUrl', '_sHdAvatarUrl', '_sProfileUrl']),
    _aCategory: pick(p._aCategory ?? rec._aCategory, ['_idRow', '_sName']),
    _aSubCategory: pick(rec._aSubCategory, ['_idRow', '_sName']),
    _aRootCategory: pick(p._aRootCategory ?? rec._aRootCategory, ['_idRow', '_sName']),
    _nLikeCount: rec._nLikeCount ?? p._nLikeCount ?? 0,
    _nDownloadCount: p._nDownloadCount ?? rec._nDownloadCount ?? 0,
    _nViewCount: rec._nViewCount ?? p._nViewCount ?? 0,
    _tsDateAdded: p._tsDateAdded ?? rec._tsDateAdded,
    _tsDateModified: p._tsDateModified ?? rec._tsDateModified,
    _aPreviewMedia: { _aImages: images },
  };
}

/* ------------------------------ labels ------------------------------ */

const stats = { s: 0, n: 0, pages: 0, failed: 0 };
const todo = [];
for (const r of seen.values()) {
  const old = mods[r._idRow];
  const m = modifiedOf(r);
  if (N.isModRecordNsfw(r)) {
    // GameBanana's listing already says NSFW: no page needed.
    mods[r._idRow] = { l: 'n', f: 1, m, g: 1 };
    continue;
  }
  if (old && old.l === 's' && old.m === m && old.k) {
    // Keep the counts current (they come with the listing).
    if (r._nLikeCount !== undefined) old.k._nLikeCount = r._nLikeCount;
    if (r._nViewCount !== undefined) old.k._nViewCount = r._nViewCount;
    if (r._nDownloadCount !== undefined) old.k._nDownloadCount = r._nDownloadCount;
    continue;
  }
  if (old && old.l === 'n' && old.m === m) continue; // rated on its page; unchanged since
  todo.push(r);
}
console.log(`pages to read: ${todo.length}`);

// Not flagged in the listing: read the mod page (its content ratings) and build the card.
async function labelFromPage(rec) {
  const p = await getJson(`https://gamebanana.com/apiv11/Mod/${rec._idRow}/ProfilePage`);
  if (!p) {
    stats.failed++;
    return; // left out for now (hidden in SFW only), tried again next run
  }
  stats.pages++;
  const m = modifiedOf(rec);
  if (N.isModRecordNsfw(p)) {
    mods[rec._idRow] = { l: 'n', f: 1, m, g: 1 };
    stats.n++;
  } else {
    mods[rec._idRow] = { l: 's', f: 0, m, g: 1, k: cardOf(p, rec) };
    stats.s++;
  }
}

let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < todo.length && !outOfTime()) {
      const rec = todo[next++];
      try {
        await labelFromPage(rec);
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
const all = Object.values(mods);
console.log(`labels in list: ${all.length} (SFW ${all.filter((e) => e.l === 's').length}, NSFW ${all.filter((e) => e.l === 'n').length})`);
