import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeModParts, buildWorkshopMod, checkModParts, decodeRecipe, encodeRecipe, extractModPreview } from '../src/core/workshopEngine';
import { ZZMI_COMPONENTS } from '../src/shared/zzmiComponents';
import type { WorkshopRecipe } from '../src/shared/types';

// Real ZZMI hashes for Jane's hair and body.
const HAIR = { draw: '74bc0b7f', pos: '33a09cfe', ib: '3275b812' };
const BODY = { draw: '0e1c6740', pos: '10050266', ib: 'ba4255a5' };
const index = ZZMI_COMPONENTS.jane_doe;

/** A small but realistic ZZMI mod: hair + body, a toggle on the body, shared [Constants]/[Present]. */
function makeMod(dir: string, tag: string) {
  fs.mkdirSync(path.join(dir, 'Meshes'), { recursive: true });
  for (const f of ['HairPosition.buf', 'HairIB.buf', 'BodyPosition.buf', 'BodyIB.buf', 'BodyJacket.buf']) {
    fs.writeFileSync(path.join(dir, 'Meshes', f), `${tag}-${f}`);
  }
  fs.writeFileSync(path.join(dir, 'HairDiffuse.dds'), `${tag}-hairtex`);
  const ini = `namespace = ${tag}
[Constants]
global persist $jacket = 1
global $time = 0

[Present]
post $time = 0

[KeyJacket]
key = VK_F6
type = cycle
$jacket = 0,1

[TextureOverrideJaneHairPosition]
hash = ${HAIR.pos}
vb0 = ResourceHairPosition

[TextureOverrideJaneHairVertexLimitRaise]
hash = ${HAIR.draw}

[TextureOverrideJaneHairIB]
hash = ${HAIR.ib}
handling = skip
ib = ResourceHairIB
ps-t3 = ResourceHairDiffuse
run = CommandList\\ZZMI\\SetTextures
drawindexed = auto

[TextureOverrideJaneBodyPosition]
hash = ${BODY.pos}
vb0 = ResourceBodyPosition

[TextureOverrideJaneBodyIB]
hash = ${BODY.ib}
handling = skip
ib = ResourceBodyIB
run = CommandListBodyDraw

[CommandListBodyDraw]
drawindexed = auto
if $jacket == 1
  ib = ResourceBodyJacket
  drawindexed = auto
endif

[ResourceHairPosition]
type = Buffer
stride = 40
filename = Meshes/HairPosition.buf

[ResourceHairIB]
type = Buffer
format = DXGI_FORMAT_R32_UINT
filename = Meshes/HairIB.buf

[ResourceHairDiffuse]
filename = HairDiffuse.dds

[ResourceBodyPosition]
type = Buffer
filename = Meshes/BodyPosition.buf

[ResourceBodyIB]
type = Buffer
filename = Meshes/BodyIB.buf

[ResourceBodyJacket]
type = Buffer
filename = Meshes/BodyJacket.buf
`;
  fs.writeFileSync(path.join(dir, `${tag}.ini`), ini);
  // A file XXMI disabled must be ignored.
  fs.writeFileSync(path.join(dir, 'DISABLED_old.ini'), `[TextureOverrideX]\nhash = ${HAIR.ib}\n`);
}

const recipe = (): WorkshopRecipe => ({
  format: 'proxylaunch-recipe',
  version: 1,
  name: 'Mix',
  agent_id: 'jane_doe',
  is_nsfw: false,
  created_at: '2026-10-21T00:00:00Z',
  parts: [],
});

describe('Mod Workshop', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-'));
    makeMod(path.join(tmp, 'ModA'), 'ModA');
    makeMod(path.join(tmp, 'ModB'), 'ModB');
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('splits a mod into parts using the ZZMI part hashes', () => {
    const parts = analyzeModParts(path.join(tmp, 'ModA'), index);
    expect(parts.map((p) => p.name)).toEqual(['Hair', 'Body']);
    expect(parts.find((p) => p.name === 'Hair')!.sectionCount).toBe(3);
  });

  it('merges hair from one mod with the body from another, keeping toggles and files', () => {
    const out = path.join(tmp, 'Out');
    const res = buildWorkshopMod({
      name: 'Mix',
      agentName: 'Jane Doe',
      partIndex: index,
      outDir: out,
      recipe: recipe(),
      picks: [
        { part: 'Hair', modDir: path.join(tmp, 'ModA'), source: { title: 'Mod A', author: 'a', gamebanana_id: 1 } },
        { part: 'Body', modDir: path.join(tmp, 'ModB'), source: { title: 'Mod B', author: 'b', gamebanana_id: 2 } },
      ],
    });
    expect(res.missingFiles).toEqual([]);
    const ini = fs.readFileSync(path.join(out, res.iniFileName), 'utf-8');

    // Hair came from A, body from B; each source's other part is left out.
    const files = (p: string) => fs.readFileSync(path.join(out, p), 'utf-8');
    expect(files('parts0/Meshes/HairPosition.buf')).toBe('ModA-HairPosition.buf');
    expect(files('parts1/Meshes/BodyPosition.buf')).toBe('ModB-BodyPosition.buf');
    expect(fs.existsSync(path.join(out, 'parts0/Meshes/BodyPosition.buf'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'parts1/Meshes/HairPosition.buf'))).toBe(false);
    expect(ini.match(new RegExp(`hash = ${HAIR.ib}`, 'g'))).toHaveLength(1);
    expect(ini.match(new RegExp(`hash = ${BODY.ib}`, 'g'))).toHaveLength(1);

    // Every section and variable is renamed so it can't clash with the originals.
    expect(ini).not.toMatch(/^\[TextureOverrideJane/m);
    expect(ini).toMatch(/^\[KeyW[0-9a-f]{6}1_Jacket\]$/m);
    expect(ini).toMatch(/global persist \$w[0-9a-f]{6}1_jacket = 1/);
    expect(ini).toMatch(/if \$w[0-9a-f]{6}1_jacket == 1/);
    expect(ini).toMatch(/run = CommandListW[0-9a-f]{6}1_BodyDraw/);
    // Global ZZMI command lists are left alone; the hair's source has no jacket toggle copied.
    expect(ini).toContain('run = CommandList\\ZZMI\\SetTextures');
    expect(ini).not.toMatch(/\$w[0-9a-f]{6}0_jacket/);
    // Credits in the header, recipe saved next to it.
    expect(ini).toContain('Hair: "Mod A" by a (gamebanana.com/mods/1)');
    expect(fs.existsSync(path.join(out, 'workshop_recipe.json'))).toBe(true);
    // Section references all resolve to sections that exist in the file.
    const defined = new Set([...ini.matchAll(/^\[([^\]]+)\]/gm)].map((m) => m[1].toLowerCase()));
    for (const m of ini.matchAll(/(?<![\\\w])((?:Resource|CommandList)\w+)/g)) {
      expect(defined.has(m[1].toLowerCase())).toBe(true);
    }
  });

  it('refuses the same part twice and cleans up on failure', () => {
    const out = path.join(tmp, 'Out2');
    const pick = { modDir: path.join(tmp, 'ModA'), source: { title: 'A', author: '', gamebanana_id: null } };
    expect(() =>
      buildWorkshopMod({ name: 'X', agentName: 'Jane', partIndex: index, outDir: out, recipe: recipe(), picks: [{ part: 'Hair', ...pick }, { part: 'Hair', ...pick }] })
    ).toThrow(/picked twice/);
    expect(() =>
      buildWorkshopMod({ name: 'X', agentName: 'Jane', partIndex: index, outDir: out, recipe: recipe(), picks: [{ part: 'Tail', ...pick }] })
    ).toThrow(/None of the picked parts/);
    expect(fs.existsSync(out)).toBe(false);
  });

  it('round-trips share codes and rejects junk', () => {
    const r = { ...recipe(), parts: [{ part: 'Hair', source: { title: 'A', author: 'x', gamebanana_id: 5 } }] };
    expect(decodeRecipe(encodeRecipe(r))).toEqual(r);
    expect(() => decodeRecipe('hello')).toThrow();
    expect(() => decodeRecipe('PLR1:!!!')).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Part checks, switch fix and preview (shaped like real Alice mods)   */
/* ------------------------------------------------------------------ */

const alice = ZZMI_COMPONENTS.alice_thymefield;

function positions(n: number): Buffer {
  const b = Buffer.alloc(n * 40);
  for (let i = 0; i < n; i++) {
    b.writeFloatLE(i * 0.1, i * 40);
    b.writeFloatLE(0, i * 40 + 4);
    b.writeFloatLE(i, i * 40 + 8);
  }
  return b;
}

function indices(list: number[]): Buffer {
  const b = Buffer.alloc(list.length * 4);
  list.forEach((v, i) => b.writeUInt32LE(v, i * 4));
  return b;
}

/**
 * Hair whose hotkey only works while the face is drawn ($active is set in the face section),
 * and whose saved default ($bangs = 5) has no textures. Body has a mesh that points past its vertices.
 */
function makeAliceMod(dir: string, opts: { brokenBody?: boolean } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'HeadPosition.buf'), positions(4));
  fs.writeFileSync(path.join(dir, 'HeadA.ib'), indices([0, 1, 2, 1, 2, 3]));
  fs.writeFileSync(path.join(dir, 'BodyPosition.buf'), positions(3));
  fs.writeFileSync(path.join(dir, 'BodyA.ib'), indices(opts.brokenBody ? [0, 1, 7] : [0, 1, 2]));
  for (const f of ['Blonde.dds', 'Black.dds', 'Face.dds', 'BodyDiffuse.dds']) fs.writeFileSync(path.join(dir, f), 'tex');
  fs.writeFileSync(
    path.join(dir, 'Alice.ini'),
    `[Constants]
global $active
global persist $bangs = 5

[Present]
post $active = 0

[KeySwapBangs]
key = J
condition = $active == 1
type = cycle
$bangs = 1,2,5

[TextureOverrideAliceFaceC]
hash = b078ff22
match_first_index = 10074
$active = 1
Resource\\ZZMI\\Diffuse = ref ResourceFace
run = CommandList\\ZZMI\\SetTextures

[TextureOverrideAliceHeadBlend]
hash = cf1202fd
if DRAW_TYPE == 1
  vb0 = ResourceHeadPosition
  draw = 4, 0
endif

[TextureOverrideAliceHeadVertexLimitRaise]
hash = d515e182
override_vertex_count = 4
override_byte_stride = 40

[TextureOverrideAliceHeadA]
hash = d131acb1
match_first_index = 0
ib = ResourceHeadAIB
if $bangs == 1
  Resource\\ZZMI\\Diffuse = ref ResourceBlonde
else if $bangs == 2
  Resource\\ZZMI\\Diffuse = ref ResourceBlack
endif
run = CommandList\\ZZMI\\SetTextures
if $bangs == 1
  drawindexed = 3, 0, 0
else
  drawindexed = 6, 0, 0
endif

[TextureOverrideAliceBodyBlend]
hash = 15935e48
if DRAW_TYPE == 1
  vb0 = ResourceBodyPosition
  draw = 3, 0
endif

[TextureOverrideAliceBodyA]
hash = 8a512b21
match_first_index = 0
ib = ResourceBodyAIB
Resource\\ZZMI\\Diffuse = ref ResourceBodyDiffuse
run = CommandList\\ZZMI\\SetTextures
drawindexed = 3, 0, 0

[TextureOverrideAliceSensorIB]
hash = 993d2ddd
handling = skip

[ResourceHeadPosition]
type = Buffer
stride = 40
filename = HeadPosition.buf

[ResourceHeadAIB]
type = Buffer
format = DXGI_FORMAT_R32_UINT
filename = HeadA.ib

[ResourceBodyPosition]
type = Buffer
stride = 40
filename = BodyPosition.buf

[ResourceBodyAIB]
type = Buffer
format = DXGI_FORMAT_R32_UINT
filename = BodyA.ib

[ResourceBlonde]
filename = Blonde.dds
[ResourceBlack]
filename = Black.dds
[ResourceFace]
filename = Face.dds
[ResourceBodyDiffuse]
filename = BodyDiffuse.dds
`
  );
}

describe('Mod Workshop part checks', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-check-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('rates parts and explains why', () => {
    const dir = path.join(tmp, 'Edits');
    makeAliceMod(dir, { brokenBody: true });
    const checks = checkModParts(dir, alice);

    expect(checks.Hair.status).toBe('risky');
    const hair = checks.Hair.notes.map((n) => n.text).join('\n');
    expect(hair).toMatch(/only work while the Face part/);
    expect(hair).toMatch(/bangs = 5/);

    expect(checks.Body.status).toBe('bad');
    expect(checks.Body.notes.some((n) => /past the end of its vertex file/.test(n.text))).toBe(true);

    expect(checks.Face.status).toBe('good');
    expect(checks.Sensor.notes[0].text).toMatch(/hides this piece/);
  });

  it('rates a clean mod as good', () => {
    const dir = path.join(tmp, 'Clean');
    makeAliceMod(dir);
    expect(checkModParts(dir, alice).Body).toEqual({ status: 'good', notes: [] });
  });

  it('copies a switch set by another part into the picked part', () => {
    const dir = path.join(tmp, 'Edits');
    makeAliceMod(dir);
    const out = path.join(tmp, 'Out');
    const res = buildWorkshopMod({
      name: 'Hair only',
      agentName: 'Alice',
      partIndex: alice,
      outDir: out,
      recipe: recipe(),
      picks: [{ part: 'Hair', modDir: dir, source: { title: 'Edits', author: '', gamebanana_id: null } }],
    });
    const ini = fs.readFileSync(path.join(out, res.iniFileName), 'utf-8');
    // The face section is not copied, but its switch is, inside the hair's draw sections.
    expect(ini).not.toContain('b078ff22');
    const head = ini.split(/^\[/m).find((s) => s.startsWith('TextureOverrideW') && s.includes('d131acb1'))!;
    expect(head).toMatch(/^\$w[0-9a-f]{6}0_active = 1$/m);
    expect(ini).toMatch(/condition = \$w[0-9a-f]{6}0_active == 1/);
    // The vertex-count hook doesn't need it.
    const vlr = ini.split(/^\[/m).find((s) => s.includes('d515e182'))!;
    expect(vlr).not.toMatch(/_active = 1/);
  });

  it('extracts meshes per part for the 3D preview', () => {
    const dir = path.join(tmp, 'Edits');
    makeAliceMod(dir);
    const prev = extractModPreview(dir, alice);
    const hair = prev.meshes.find((m) => m.part === 'Hair')!;
    expect(hair.positions.length).toBe(12);
    expect(Array.from(hair.positions.slice(3, 6))).toEqual([expect.closeTo(0.1, 5), 0, 1]);
    // Union of both drawindexed ranges: 2 triangles.
    expect(Array.from(hair.indices)).toEqual([0, 1, 2, 1, 2, 3]);
    expect(prev.meshes.find((m) => m.part === 'Body')!.indices.length).toBe(3);
    expect(prev.meshlessParts.sort()).toEqual(['Face', 'Sensor']);
  });
});
