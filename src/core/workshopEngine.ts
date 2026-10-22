import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  WorkshopPartCheck,
  WorkshopPartNote,
  WorkshopPreview,
  WorkshopPreviewMesh,
  WorkshopRecipe,
  WorkshopSourceInfo,
} from '../shared/types';

export type { WorkshopPartCheck, WorkshopPreview, WorkshopRecipe, WorkshopSourceInfo };

/**
 * Mod Workshop (experimental).
 *
 * Splits installed ZZMI mods into their parts (Hair, Body, Face, ...) using the
 * part hashes ZZMI publishes for every agent, and builds a brand-new mod from
 * parts picked out of different mods. Anything not picked stays as the base model.
 *
 * How a merge works, per source mod:
 *  1. Take the TextureOverride/ShaderOverride sections that belong to the picked parts.
 *  2. Pull in everything they depend on: Resource and CommandList sections, the
 *     variables they read ($vars), the [Key*] sections and [Constants]/[Present]
 *     lines that drive those variables (so the mod's own toggles keep working).
 *  3. Rename every section and variable with a per-source prefix so two mods can
 *     never collide, copy the referenced files into partsN/ and point filename= at them.
 */

export interface WorkshopPart {
  name: string;
  sectionCount: number;
}

export interface WorkshopPick {
  part: string;
  /** Absolute folder of the installed mod the part comes from. */
  modDir: string;
  source: WorkshopSourceInfo;
}

export interface WorkshopBuildResult {
  iniFileName: string;
  sectionsWritten: number;
  filesCopied: number;
  missingFiles: string[];
  warnings: string[];
}

interface Sec {
  name: string;
  lower: string;
  lines: string[]; // body lines, header excluded
  iniDir: string;
  hash?: string;
  part?: string;
  kind: 'override' | 'resource' | 'commandlist' | 'key' | 'constants' | 'present' | 'other';
}

/** A [Constants]/[Present] statement: one line, or a whole if ... endif block. */
interface Unit {
  lines: string[];
  iniDir: string;
}

interface SourceDoc {
  root: string;
  secs: Sec[];
  byName: Map<string, Sec>;
  constants: Unit[];
  present: Unit[];
}

const COMMON_PARTS = ['Hair', 'Face', 'Head', 'Body', 'Torso', 'Jacket', 'Coat', 'Dress', 'Skirt', 'Legs', 'Arms', 'Tail', 'Weapon', 'Accessory', 'Eyes'];
const SECTION_PREFIX = /^(TextureOverride|ShaderOverride|ShaderRegex|Resource|CommandList|CustomShader|Key)(.*)$/i;

function isIgnoredIni(name: string): boolean {
  const n = name.toLowerCase();
  return !n.endsWith('.ini') || n.startsWith('disabled') || n === 'desktop.ini' || n === 'd3dx.ini' || n === 'master_swap.ini';
}

/** All active .ini files in a mod folder (recursive; DISABLED_* files and folders skipped). */
export function listModInis(modDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.toLowerCase().startsWith('disabled')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (!isIgnoredIni(e.name)) out.push(p);
    }
  };
  walk(modDir, 0);
  return out;
}

function kindOf(name: string): Sec['kind'] {
  const n = name.toLowerCase();
  if (n === 'constants') return 'constants';
  if (n === 'present') return 'present';
  if (n.startsWith('textureoverride') || n.startsWith('shaderoverride') || n.startsWith('shaderregex')) return 'override';
  if (n.startsWith('resource')) return 'resource';
  if (n.startsWith('commandlist') || n.startsWith('customshader')) return 'commandlist';
  if (n.startsWith('key')) return 'key';
  return 'other';
}

function stripComment(line: string): string {
  const t = line.trim();
  return t.startsWith(';') ? '' : t;
}

/** Groups lines into statements, keeping if/elif/else/endif blocks together. */
function toUnits(lines: string[], iniDir: string): Unit[] {
  const units: Unit[] = [];
  let depth = 0;
  let cur: string[] = [];
  for (const line of lines) {
    const t = stripComment(line).toLowerCase();
    if (!t) {
      if (depth > 0) cur.push(line);
      continue;
    }
    cur.push(line);
    if (/^if\b/.test(t)) depth++;
    else if (/^endif\b/.test(t)) depth = Math.max(0, depth - 1);
    if (depth === 0) {
      units.push({ lines: cur, iniDir });
      cur = [];
    }
  }
  if (cur.length) units.push({ lines: cur, iniDir });
  return units;
}

function partFromName(sectionName: string, partNames: string[]): string | undefined {
  const rest = sectionName.replace(/^(TextureOverride|ShaderOverride|ShaderRegex)/i, '').toLowerCase();
  const candidates = [...new Set([...partNames, ...COMMON_PARTS])].sort((a, b) => b.length - a.length);
  return candidates.find((p) => rest.includes(p.toLowerCase()));
}

function parseSource(modDir: string, partIndex: Record<string, string>): SourceDoc {
  const partNames = [...new Set(Object.values(partIndex))];
  const doc: SourceDoc = { root: modDir, secs: [], byName: new Map(), constants: [], present: [] };
  for (const iniPath of listModInis(modDir)) {
    let raw = '';
    try {
      raw = fs.readFileSync(iniPath, 'utf-8').replace(/^﻿/, '');
    } catch {
      continue;
    }
    const iniDir = path.dirname(iniPath);
    let cur: Sec | null = null;
    const flush = () => {
      if (!cur) return;
      if (cur.kind === 'constants') doc.constants.push(...toUnits(cur.lines, iniDir));
      else if (cur.kind === 'present') doc.present.push(...toUnits(cur.lines, iniDir));
      else if (!doc.byName.has(cur.lower)) {
        doc.secs.push(cur);
        doc.byName.set(cur.lower, cur);
      }
    };
    for (const line of raw.split(/\r?\n/)) {
      const header = line.trim().match(/^\[([^\]]+)\]/);
      if (header) {
        flush();
        const name = header[1].trim();
        cur = { name, lower: name.toLowerCase(), lines: [], iniDir, kind: kindOf(name) };
        continue;
      }
      if (!cur) continue; // e.g. "namespace = ..." before the first section
      cur.lines.push(line);
      const kv = stripComment(line).match(/^hash\s*=\s*([0-9a-fA-F]{8,16})/);
      if (kv) cur.hash = kv[1].toLowerCase();
    }
    flush();
  }
  for (const s of doc.secs) {
    if (s.kind !== 'override' || !s.hash) continue;
    s.part = partIndex[s.hash] ?? partFromName(s.name, partNames) ?? 'Other';
  }
  return doc;
}

/** The parts a mod changes, e.g. [{ name: 'Hair', sectionCount: 6 }, ...]. */
export function analyzeModParts(modDir: string, partIndex: Record<string, string>): WorkshopPart[] {
  const doc = parseSource(modDir, partIndex);
  const counts = new Map<string, number>();
  for (const s of doc.secs) {
    if (s.part) counts.set(s.part, (counts.get(s.part) ?? 0) + 1);
  }
  const order = (p: string) => {
    const i = COMMON_PARTS.indexOf(p);
    return p === 'Other' ? 999 : i === -1 ? 500 : i;
  };
  return [...counts.entries()]
    .map(([name, sectionCount]) => ({ name, sectionCount }))
    .sort((a, b) => order(a.name) - order(b.name) || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* Dependency closure                                                  */
/* ------------------------------------------------------------------ */

const SECTION_REF = /(?<![\\\w])((?:Resource|CommandList|CustomShader)[\w.]*)/gi;
const VAR_REF = /(?<![\\\w$])\$([A-Za-z_]\w*)/g;

function refsIn(lines: string[]): { sections: string[]; vars: string[] } {
  const sections: string[] = [];
  const vars: string[] = [];
  for (const line of lines) {
    const t = stripComment(line);
    if (!t || /^filename\s*=/i.test(t)) continue;
    for (const m of t.matchAll(SECTION_REF)) sections.push(m[1].toLowerCase());
    for (const m of t.matchAll(VAR_REF)) vars.push(m[1].toLowerCase());
  }
  return { sections, vars };
}

function assignsVar(lines: string[], v: string): boolean {
  const re = new RegExp(`^\\$${v}\\s*=`, 'i');
  return lines.some((l) => re.test(stripComment(l)));
}

function declaresVar(lines: string[], v: string): boolean {
  const re = new RegExp(`(^|\\s)\\$${v}\\b`, 'i');
  return lines.some((l) => {
    const t = stripComment(l);
    return /^(global|local|persist|\$)/i.test(t) && re.test(t);
  });
}

interface Selection {
  secs: Set<Sec>;
  vars: Set<string>;
  constants: Set<Unit>;
  present: Set<Unit>;
}

function closeOver(doc: SourceDoc, parts: Set<string>): Selection {
  const sel: Selection = { secs: new Set(), vars: new Set(), constants: new Set(), present: new Set() };
  for (const s of doc.secs) if (s.kind === 'override' && s.part && parts.has(s.part)) sel.secs.add(s);

  let changed = true;
  while (changed) {
    changed = false;
    const addRefs = (lines: string[]) => {
      const r = refsIn(lines);
      for (const name of r.sections) {
        const dep = doc.byName.get(name);
        if (dep && !sel.secs.has(dep)) {
          sel.secs.add(dep);
          changed = true;
        }
      }
      for (const v of r.vars) {
        if (!sel.vars.has(v)) {
          sel.vars.add(v);
          changed = true;
        }
      }
    };
    for (const s of [...sel.secs]) addRefs(s.lines);
    for (const u of [...sel.constants, ...sel.present]) addRefs(u.lines);

    for (const v of [...sel.vars]) {
      for (const s of doc.secs) {
        if (s.kind === 'key' && !sel.secs.has(s) && assignsVar(s.lines, v)) {
          sel.secs.add(s);
          changed = true;
        }
      }
      for (const u of doc.constants) {
        if (!sel.constants.has(u) && declaresVar(u.lines, v)) {
          sel.constants.add(u);
          changed = true;
        }
      }
    }
    // [Present] statements that drive anything we kept (animation timers, resets...)
    const keptNames = new Set([...sel.secs].map((s) => s.lower));
    for (const u of doc.present) {
      if (sel.present.has(u)) continue;
      const r = refsIn(u.lines);
      if (r.vars.some((v) => sel.vars.has(v)) || r.sections.some((n) => keptNames.has(n))) {
        sel.present.add(u);
        changed = true;
      }
    }
  }
  return sel;
}

/* ------------------------------------------------------------------ */
/* Cross-part switches                                                 */
/* ------------------------------------------------------------------ */

const NUM = '-?\\d+(?:\\.\\d+)?';

/** Top-level (not inside if/endif) `$v = <number>` lines of a section. */
function topLevelConstAssigns(lines: string[]): Map<string, string> {
  const out = new Map<string, string>();
  let depth = 0;
  const re = new RegExp(`^\\$([A-Za-z_]\\w*)\\s*=\\s*(${NUM})\\s*$`);
  for (const line of lines) {
    const t = stripComment(line);
    if (!t) continue;
    const lo = t.toLowerCase();
    if (/^if\b/.test(lo)) depth++;
    else if (/^endif\b/.test(lo)) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const m = t.match(re);
      if (m) out.set(m[1].toLowerCase(), m[2]);
    }
  }
  return out;
}

/** Variables the selection reads in a condition (if/elif or a Key's condition =). */
function conditionVars(secs: Iterable<Sec>): Set<string> {
  const out = new Set<string>();
  for (const s of secs) {
    for (const line of s.lines) {
      const t = stripComment(line);
      if (!/^(if|elif|else\s+if|condition)\b/i.test(t)) continue;
      for (const m of t.matchAll(VAR_REF)) out.add(m[1].toLowerCase());
    }
  }
  return out;
}

interface ForeignSwitch {
  v: string;
  value: string;
  fromSection: string;
  fromPart: string;
}

/**
 * Switches like `$active = 1` that a mod sets while drawing ONE part (often the face)
 * but that gate hotkeys or looks of another part. Taking that other part alone would
 * leave the switch at 0 forever, so the merge copies the assignment over.
 */
function foreignSwitches(doc: SourceDoc, sel: Selection): ForeignSwitch[] {
  const readVars = conditionVars(sel.secs);
  const setInside = new Set<string>();
  for (const s of sel.secs) if (s.kind === 'override') for (const v of topLevelConstAssigns(s.lines).keys()) setInside.add(v);
  const out: ForeignSwitch[] = [];
  const seen = new Set<string>();
  for (const s of doc.secs) {
    if (s.kind !== 'override' || sel.secs.has(s)) continue;
    for (const [v, value] of topLevelConstAssigns(s.lines)) {
      if (!readVars.has(v) || setInside.has(v) || seen.has(v)) continue;
      seen.add(v);
      out.push({ v, value, fromSection: s.name, fromPart: s.part ?? 'another' });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Resources and buffers                                               */
/* ------------------------------------------------------------------ */

interface ResInfo {
  sec: Sec;
  type?: string;
  stride?: number;
  format?: string;
  file?: string; // absolute
  rel?: string;
}

function resInfo(sec: Sec): ResInfo {
  const info: ResInfo = { sec };
  for (const line of sec.lines) {
    const t = stripComment(line);
    const kv = t.match(/^(\w+)\s*=\s*(.+?)\s*$/);
    if (!kv) continue;
    const k = kv[1].toLowerCase();
    if (k === 'type') info.type = kv[2].toLowerCase();
    else if (k === 'stride') info.stride = Number(kv[2]) || undefined;
    else if (k === 'format') info.format = kv[2].toUpperCase();
    else if (k === 'filename') {
      info.rel = kv[2].replace(/^["']|["']$/g, '');
      info.file = path.resolve(sec.iniDir, info.rel);
    }
  }
  return info;
}

/** `key = ResourceX` lines (vb0, ib, ...) at any depth. */
function boundResources(lines: string[], key: string): string[] {
  const re = new RegExp(`^${key}\\s*=\\s*(?:ref\\s+)?(Resource[\\w.]*)`, 'i');
  const out: string[] = [];
  for (const line of lines) {
    const m = stripComment(line).match(re);
    if (m) out.push(m[1].toLowerCase());
  }
  return out;
}

function fileSize(file: string): number | null {
  try {
    return fs.statSync(file).size;
  } catch {
    return null;
  }
}

function ibElemSize(format?: string): number {
  return format && /R16/.test(format) ? 2 : 4;
}

const ibCache = new Map<string, { key: string; max: number; count: number }>();

/** Highest vertex index an index buffer uses (cached by size + mtime). */
function ibMaxIndex(file: string, format?: string): { max: number; count: number } | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const key = `${st.size}:${st.mtimeMs}:${format ?? ''}`;
  const hit = ibCache.get(file);
  if (hit && hit.key === key) return hit;
  const idx = readIndices(file, format);
  if (!idx) return null;
  let max = -1;
  for (let i = 0; i < idx.length; i++) if (idx[i] > max) max = idx[i];
  const res = { key, max, count: idx.length };
  ibCache.set(file, res);
  return res;
}

function readIndices(file: string, format?: string): Uint32Array | null {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  const el = ibElemSize(format);
  const n = Math.floor(buf.length / el);
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = el === 2 ? buf.readUInt16LE(i * 2) : buf.readUInt32LE(i * 4);
  return out;
}

/** Numeric `drawindexed = count, first, base` lines; null when one says auto. */
function drawIndexedRanges(lines: string[]): Array<{ count: number; first: number }> | null {
  const out: Array<{ count: number; first: number }> = [];
  for (const line of lines) {
    const t = stripComment(line);
    const m = t.match(/^drawindexed\s*=\s*(.+)$/i);
    if (!m) continue;
    const nums = m[1].split(',').map((x) => Number(x.trim()));
    if (nums.length < 2 || nums.some((x) => !Number.isFinite(x))) return null;
    out.push({ count: nums[0], first: nums[1] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Toggle states                                                       */
/* ------------------------------------------------------------------ */

const TEXTURE_LINE = /^(this\s*=|Resource\\ZZMI\\|ps-t\d+\s*=|Resource\\[\w\\]*(Diffuse|NormalMap|LightMap|MaterialMap)\s*=)/i;
/** The texture that decides the colors: the diffuse map (or a direct texture replacement). */
const DIFFUSE_LINE = /^(this\s*=|ps-t0\s*=|Resource\\[\w\\]*Diffuse\s*=)/i;

/**
 * For a variable, which values the color-setting if-chains handle. Only chains that
 * pick the diffuse texture count (a chain that just picks a draw range doesn't decide the look).
 * `open` means such a chain has an else or a comparison we can't enumerate (!=, <, ...).
 */
function handledValues(secs: Iterable<Sec>, v: string): { values: Set<number>; open: boolean; used: boolean } {
  const values = new Set<number>();
  let open = false;
  let used = false;
  const eq = new RegExp(`\\$${v}\\s*==\\s*(${NUM})|(${NUM})\\s*==\\s*\\$${v}(?!\\w)`, 'gi');
  const mention = new RegExp(`\\$${v}(?!\\w)`, 'i');
  interface Chain {
    mentions: boolean;
    values: number[];
    open: boolean;
    textures: boolean;
  }
  const close = (c: Chain) => {
    if (!c.mentions || !c.textures) return;
    used = true;
    c.values.forEach((x) => values.add(x));
    if (c.open) open = true;
  };
  for (const s of secs) {
    if (s.kind !== 'override' && s.kind !== 'commandlist') continue;
    const stack: Chain[] = [];
    for (const line of s.lines) {
      const t = stripComment(line);
      if (!t) continue;
      const lo = t.toLowerCase();
      const isIf = /^if\b/.test(lo);
      const isElif = /^(elif|else\s+if)\b/.test(lo);
      if (isIf || isElif) {
        if (isIf) stack.push({ mentions: false, values: [], open: false, textures: false });
        const c = stack[stack.length - 1];
        if (!c) continue;
        const cond = t.replace(/^(if|elif|else\s+if)\b/i, '');
        if (mention.test(cond)) {
          c.mentions = true;
          const rest = cond.replace(eq, (_m, a, b) => {
            c.values.push(Number(a ?? b));
            return ' ';
          });
          if (mention.test(rest)) c.open = true; // other operators on the same variable
        }
      } else if (/^else\s*$/.test(lo)) {
        if (stack.length) stack[stack.length - 1].open = true;
      } else if (/^endif\b/.test(lo)) {
        const c = stack.pop();
        if (c) close(c);
      } else if (DIFFUSE_LINE.test(t)) {
        stack.forEach((c) => (c.textures = true));
      }
    }
    stack.forEach(close);
  }
  return { values, open, used };
}

/** Values a [Key] cycles a variable through, e.g. `$bangs = 0,1,2`. */
function keyValues(secs: Iterable<Sec>, v: string): number[] {
  const re = new RegExp(`^\\$${v}\\s*=\\s*([-\\d.,\\s]+)$`, 'i');
  const out: number[] = [];
  for (const s of secs) {
    if (s.kind !== 'key') continue;
    for (const line of s.lines) {
      const m = stripComment(line).match(re);
      if (m) out.push(...m[1].split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)));
    }
  }
  return out;
}

function defaultValue(doc: SourceDoc, v: string): number | null {
  const re = new RegExp(`\\$${v}\\b(?:\\s*=\\s*(${NUM}))?`, 'i');
  for (const u of doc.constants) {
    for (const line of u.lines) {
      const t = stripComment(line);
      if (!/^(global|local|persist|\$)/i.test(t)) continue;
      const m = t.match(re);
      if (m) return m[1] !== undefined ? Number(m[1]) : 0;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Compatibility check                                                 */
/* ------------------------------------------------------------------ */

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Rates every part of a mod on how well it comes out on its own:
 * good = clean, risky = may look off in a merge, bad = broken files.
 */
export function checkModParts(modDir: string, partIndex: Record<string, string>): Record<string, WorkshopPartCheck> {
  const doc = parseSource(modDir, partIndex);
  const parts = [...new Set(doc.secs.filter((s) => s.part).map((s) => s.part!))];
  const hasIndex = Object.keys(partIndex).length > 0;

  // Which parts bind each mesh buffer directly.
  const bufferParts = new Map<string, Set<string>>();
  for (const s of doc.secs) {
    if (s.kind !== 'override' || !s.part) continue;
    for (const key of ['vb0', 'vb1', 'vb2', 'ib']) {
      for (const r of boundResources(s.lines, key)) {
        bufferParts.set(r, new Set([...(bufferParts.get(r) ?? []), s.part]));
      }
    }
  }

  const out: Record<string, WorkshopPartCheck> = {};
  for (const part of parts) {
    const notes: WorkshopPartNote[] = [];
    const add = (level: WorkshopPartNote['level'], text: string) => {
      if (!notes.some((n) => n.text === text)) notes.push({ level, text });
    };
    const own = doc.secs.filter((s) => s.kind === 'override' && s.part === part);
    const sel = closeOver(doc, new Set([part]));

    if (part === 'Other') add('warn', "ProxyLaunch can't tell which piece of the model this is, so it may not go where you expect.");
    else if (hasIndex && !own.some((s) => s.hash && partIndex[s.hash])) {
      add('warn', "Its hashes don't match this agent's current model. The mod may be made for an older game version and might not show up.");
    }

    // Hidden piece / recolor only
    const ownLines = own.flatMap((s) => s.lines.map(stripComment));
    const drawsMesh = ownLines.some((t) => /^(vb0|ib)\s*=|^draw(indexed)?\s*=/i.test(t));
    if (!drawsMesh) {
      const skips = ownLines.some((t) => /^handling\s*=\s*skip/i.test(t));
      const textures = ownLines.some((t) => TEXTURE_LINE.test(t));
      if (skips && !textures) add('info', 'This mod hides this piece. Taking it removes the piece from your mod.');
      else if (textures) add('info', 'Recolor only. It keeps the shape of the base model.');
    }

    // Switches that live in other parts (fixed automatically when merging).
    for (const f of foreignSwitches(doc, sel)) {
      add('info', `Its hotkeys only work while the ${f.fromPart} part is on screen. ProxyLaunch copies that switch over so they keep working.`);
    }

    // Toggle states with nothing to show.
    for (const v of sel.vars) {
      const h = handledValues(sel.secs, v);
      if (!h.used || h.open) continue;
      const def = defaultValue(doc, v);
      const cycle = keyValues(sel.secs, v);
      const missing = [...new Set(cycle)].filter((x) => !h.values.has(x));
      if (def !== null && !h.values.has(def) && (cycle.length > 0 || h.values.size > 1)) {
        add('warn', `It starts on a setting (${v} = ${def}) that sets no textures, so it can show the game's own colors or look metallic until you press its hotkey.`);
      } else if (missing.length) {
        add('warn', `${plural(missing.length, 'hotkey setting')} of ${v} (${missing.join(', ')}) set no textures and may look wrong.`);
      }
    }

    // Shared mesh buffers
    for (const s of own) {
      for (const key of ['vb0', 'vb1', 'vb2', 'ib']) {
        for (const r of boundResources(s.lines, key)) {
          const others = [...(bufferParts.get(r) ?? [])].filter((p) => p !== part);
          if (others.length) add('warn', `Shares mesh files with the ${others.join(', ')} part. Taking it alone can leave gaps or stretched pieces.`);
        }
      }
    }

    // Custom shaders
    if (
      [...sel.secs].some((s) => /^(customshader|shaderoverride|shaderregex)/i.test(s.name)) ||
      [...sel.secs].some((s) => s.lines.some((l) => /^(ps|vs|cs)\s*=/i.test(stripComment(l))))
    ) {
      add('warn', 'Uses custom shader effects, which may not carry over to a merged mod.');
    }

    // Files
    const missing: string[] = [];
    const broken: string[] = [];
    for (const s of sel.secs) {
      if (s.kind !== 'resource') continue;
      const r = resInfo(s);
      if (!r.file) continue;
      const size = fileSize(r.file);
      if (size === null) {
        missing.push(path.basename(r.rel!));
        continue;
      }
      if (r.stride && size % r.stride !== 0) broken.push(path.basename(r.rel!));
      else if (/\.ib$/i.test(r.file) && size % ibElemSize(r.format) !== 0) broken.push(path.basename(r.rel!));
    }
    if (missing.length) {
      const list = missing.slice(0, 3).join(', ') + (missing.length > 3 ? ` and ${missing.length - 3} more` : '');
      add(missing.length > 3 || missing.some((m) => /\.(buf|ib)$/i.test(m)) ? 'bad' : 'warn', `Missing ${plural(missing.length, 'file')}: ${list}.`);
    }
    if (broken.length) add('bad', `${broken.join(', ')} looks damaged (wrong size).`);

    // Vertex and index ranges
    const posCounts: number[] = [];
    for (const s of own) {
      for (const r of boundResources(s.lines, 'vb0')) {
        const res = doc.byName.get(r);
        if (!res) continue;
        const info = resInfo(res);
        const size = info.file ? fileSize(info.file) : null;
        if (size === null) continue;
        posCounts.push(Math.floor(size / (info.stride || 40)));
      }
    }
    if (posCounts.length) {
      const maxVerts = Math.max(...posCounts);
      for (const s of own) {
        for (const line of s.lines) {
          const t = stripComment(line);
          const vc = t.match(/^override_vertex_count\s*=\s*(\d+)/i);
          if (vc && !posCounts.includes(Number(vc[1]))) add('bad', "Its vertex count doesn't match its mesh file, so it will look torn in game.");
          const dr = t.match(/^draw\s*=\s*(\d+)\s*,/i);
          if (dr && Number(dr[1]) > maxVerts) add('bad', 'It draws more points than its mesh file has, so it will look torn in game.');
        }
        for (const r of boundResources(s.lines, 'ib')) {
          const res = doc.byName.get(r);
          if (!res) continue;
          const info = resInfo(res);
          if (!info.file) continue;
          const ib = ibMaxIndex(info.file, info.format);
          if (!ib) continue;
          if (ib.max >= maxVerts) add('bad', 'Its mesh points past the end of its vertex file, so it will look torn or spiky in game.');
          const ranges = drawIndexedRanges(s.lines) ?? [];
          if (ranges.some((x) => x.first + x.count > ib.count)) add('bad', 'It draws past the end of its mesh file.');
        }
      }
    }

    const status = notes.some((n) => n.level === 'bad') ? 'bad' : notes.some((n) => n.level === 'warn') ? 'risky' : 'good';
    out[part] = { status, notes };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 3D preview                                                          */
/* ------------------------------------------------------------------ */

const PREVIEW_MAX_VERTS = 600_000;

function stem(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(textureoverride|resource)/, '')
    .replace(/(position|ib|[a-z]?ib)$/, '');
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** The meshes a mod draws, grouped by part, for the Workshop's 3D preview. */
export function extractModPreview(modDir: string, partIndex: Record<string, string>): WorkshopPreview {
  const doc = parseSource(modDir, partIndex);
  const parts = [...new Set(doc.secs.filter((s) => s.part).map((s) => s.part!))];
  const meshes: WorkshopPreviewMesh[] = [];
  const meshlessParts: string[] = [];
  let totalVerts = 0;
  const posCache = new Map<string, Float32Array | null>();

  const readPositions = (res: Sec): Float32Array | null => {
    if (posCache.has(res.lower)) return posCache.get(res.lower)!;
    const info = resInfo(res);
    let out: Float32Array | null = null;
    try {
      if (info.file) {
        const buf = fs.readFileSync(info.file);
        const stride = info.stride || 40;
        const n = Math.floor(buf.length / stride);
        if (n > 0 && totalVerts + n <= PREVIEW_MAX_VERTS) {
          out = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            out[i * 3] = buf.readFloatLE(i * stride);
            out[i * 3 + 1] = buf.readFloatLE(i * stride + 4);
            out[i * 3 + 2] = buf.readFloatLE(i * stride + 8);
          }
          totalVerts += n;
        }
      }
    } catch {
      out = null;
    }
    posCache.set(res.lower, out);
    return out;
  };

  for (const part of parts) {
    const own = doc.secs.filter((s) => s.kind === 'override' && s.part === part);
    const positions = [...new Set(own.flatMap((s) => boundResources(s.lines, 'vb0')))]
      .map((n) => doc.byName.get(n))
      .filter((s): s is Sec => Boolean(s));
    const groups = new Map<Sec, number[]>();
    for (const s of own) {
      for (const ibName of boundResources(s.lines, 'ib')) {
        const ibSec = doc.byName.get(ibName);
        if (!ibSec || positions.length === 0) continue;
        const target =
          positions.length === 1
            ? positions[0]
            : [...positions].sort((a, b) => commonPrefix(stem(b.name), stem(s.name)) - commonPrefix(stem(a.name), stem(s.name)))[0];
        const info = resInfo(ibSec);
        const idx = info.file ? readIndices(info.file, info.format) : null;
        if (!idx) continue;
        const ranges = drawIndexedRanges(s.lines);
        const list = groups.get(target) ?? [];
        // Union of the drawn ranges, so every toggle state shows once.
        const tri = new Uint8Array(Math.floor(idx.length / 3));
        if (!ranges || ranges.length === 0) tri.fill(1);
        else {
          for (const r of ranges) {
            const from = Math.max(0, Math.floor(r.first / 3));
            const to = Math.min(tri.length, Math.floor((r.first + r.count) / 3));
            for (let t = from; t < to; t++) tri[t] = 1;
          }
        }
        for (let t = 0; t < tri.length; t++) if (tri[t]) list.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
        groups.set(target, list);
      }
    }
    let added = false;
    for (const [posSec, list] of groups) {
      const pos = readPositions(posSec);
      if (!pos) continue;
      const n = pos.length / 3;
      const tris: number[] = [];
      for (let i = 0; i + 2 < list.length; i += 3) {
        if (list[i] < n && list[i + 1] < n && list[i + 2] < n) tris.push(list[i], list[i + 1], list[i + 2]);
      }
      if (!tris.length) continue;
      meshes.push({ part, name: posSec.name.replace(/^Resource/i, ''), positions: pos, indices: Uint32Array.from(tris) });
      added = true;
    }
    if (!added) meshlessParts.push(part);
  }
  return { meshes, meshlessParts };
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/** Sections that run when the part is actually drawn (not just texture or vertex-count hooks). */
function drawsSomething(s: Sec): boolean {
  return s.lines.some((l) => /^(ib|vb0)\s*=|^draw(indexed)?\s*=|^match_first_index\s*=/i.test(stripComment(l)));
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function safeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Workshop Mod';
}

/**
 * Writes a new mod into outDir made of the picked parts. outDir must not exist yet.
 */
export function buildWorkshopMod(opts: {
  name: string;
  agentName: string;
  picks: WorkshopPick[];
  partIndex: Record<string, string>;
  outDir: string;
  recipe: WorkshopRecipe;
}): WorkshopBuildResult {
  const { name, picks, partIndex, outDir } = opts;
  if (picks.length === 0) throw new Error('Pick at least one part.');
  const seenParts = new Set<string>();
  for (const p of picks) {
    if (seenParts.has(p.part)) throw new Error(`"${p.part}" is picked twice. Choose one mod for each part.`);
    seenParts.add(p.part);
  }
  if (fs.existsSync(outDir)) throw new Error('A mod with this name already exists for this agent. Pick another name.');

  // Group picks by source mod, keeping the order parts were picked in.
  const bySource = new Map<string, WorkshopPick[]>();
  for (const p of picks) {
    const key = path.resolve(p.modDir).toLowerCase();
    bySource.set(key, [...(bySource.get(key) ?? []), p]);
  }

  const tag = crypto.createHash('sha1').update(`${name}|${Date.now()}`).digest('hex').slice(0, 6);
  const header: string[] = [
    '; ============================================================================',
    `; ${name}`,
    `; Made with the ProxyLaunch Mod Workshop for ${opts.agentName}.`,
    '; Parts:',
  ];
  const constantsOut: string[] = [];
  const presentOut: string[] = [];
  const body: string[] = [];
  const result: WorkshopBuildResult = { iniFileName: '', sectionsWritten: 0, filesCopied: 0, missingFiles: [], warnings: [] };
  const copied = new Map<string, string>();

  fs.mkdirSync(outDir, { recursive: true });
  try {
    let srcIdx = 0;
    for (const group of bySource.values()) {
      const srcRoot = group[0].modDir;
      const doc = parseSource(srcRoot, partIndex);
      const wanted = new Set(group.map((g) => g.part));
      const found = new Set(doc.secs.filter((s) => s.part && wanted.has(s.part)).map((s) => s.part!));
      for (const g of group) {
        if (!found.has(g.part)) result.warnings.push(`"${g.source.title}" has no ${g.part} part anymore, so it was skipped.`);
        const gb = g.source.gamebanana_id ? ` (gamebanana.com/mods/${g.source.gamebanana_id})` : '';
        header.push(`;   ${g.part}: "${g.source.title}" by ${g.source.author || 'unknown'}${gb}`);
      }
      const sel = closeOver(doc, wanted);
      const switches = foreignSwitches(doc, sel);
      const prefix = `W${tag}${srcIdx}`;
      const varPrefix = `w${tag}${srcIdx}_`;
      const partsDir = `parts${srcIdx}`;

      // Rename maps
      const secRename = new Map<string, string>();
      for (const s of sel.secs) {
        const m = s.name.match(SECTION_PREFIX);
        secRename.set(s.lower, m ? `${m[1]}${prefix}_${m[2]}` : `${prefix}_${s.name}`);
      }
      const secNames = [...secRename.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
      const secRe = secNames.length ? new RegExp(`(?<![\\\\\\w])(${secNames.join('|')})(?![\\w.])`, 'gi') : null;
      const varRe = /(?<![\\\w$])\$([A-Za-z_]\w*)/g;

      const rewrite = (line: string, iniDir: string): string => {
        const t = line.trim();
        if (t.startsWith(';')) return line;
        const fm = line.match(/^(\s*filename\s*=\s*)(.+?)\s*$/i);
        if (fm) {
          const rel = fm[2].replace(/^["']|["']$/g, '');
          const abs = path.resolve(iniDir, rel);
          const inRoot = path.relative(srcRoot, abs);
          if (!fs.existsSync(abs) || inRoot.startsWith('..') || path.isAbsolute(inRoot)) {
            result.missingFiles.push(rel);
            return line;
          }
          const destRel = path.posix.join(partsDir, inRoot.split(path.sep).join('/'));
          if (!copied.has(abs.toLowerCase())) {
            const dest = path.join(outDir, destRel);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(abs, dest);
            copied.set(abs.toLowerCase(), destRel);
            result.filesCopied++;
          }
          return `${fm[1]}${destRel}`;
        }
        let out = secRe ? line.replace(secRe, (m) => secRename.get(m.toLowerCase()) ?? m) : line;
        out = out.replace(varRe, (m, v: string) => (sel.vars.has(v.toLowerCase()) ? `$${varPrefix}${v}` : m));
        return out;
      };

      for (const u of doc.constants) if (sel.constants.has(u)) constantsOut.push(...u.lines.map((l) => rewrite(l, u.iniDir)));
      for (const u of doc.present) if (sel.present.has(u)) presentOut.push(...u.lines.map((l) => rewrite(l, u.iniDir)));
      for (const s of doc.secs) {
        if (!sel.secs.has(s)) continue;
        body.push(`[${secRename.get(s.lower)}]`);
        if (switches.length && s.kind === 'override' && s.part && wanted.has(s.part) && drawsSomething(s)) {
          for (const f of switches) {
            body.push(`; ProxyLaunch: copied from [${f.fromSection}] so this part's hotkeys keep working`);
            body.push(rewrite(`$${f.v} = ${f.value}`, s.iniDir));
          }
        }
        body.push(...s.lines.map((l) => rewrite(l, s.iniDir)));
        if (body[body.length - 1]?.trim() !== '') body.push('');
        result.sectionsWritten++;
      }
      srcIdx++;
    }

    if (result.sectionsWritten === 0) throw new Error('None of the picked parts were found in those mods.');

    header.push('; ============================================================================', '');
    const ini = [
      ...header,
      ...(constantsOut.length ? ['[Constants]', ...constantsOut, ''] : []),
      ...(presentOut.length ? ['[Present]', ...presentOut, ''] : []),
      ...body,
    ].join('\r\n');
    result.iniFileName = `${safeFolderName(name).replace(/\s+/g, '_')}.ini`;
    fs.writeFileSync(path.join(outDir, result.iniFileName), ini, 'utf-8');
    fs.writeFileSync(path.join(outDir, 'workshop_recipe.json'), JSON.stringify(opts.recipe, null, 2), 'utf-8');
    result.missingFiles = [...new Set(result.missingFiles)];
    return result;
  } catch (err) {
    fs.rmSync(outDir, { recursive: true, force: true });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Share codes                                                         */
/* ------------------------------------------------------------------ */

const CODE_PREFIX = 'PLR1:';

export function encodeRecipe(recipe: WorkshopRecipe): string {
  return CODE_PREFIX + Buffer.from(JSON.stringify(recipe), 'utf-8').toString('base64url');
}

export function decodeRecipe(code: string): WorkshopRecipe {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) throw new Error('That isn’t a ProxyLaunch recipe code.');
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(trimmed.slice(CODE_PREFIX.length), 'base64url').toString('utf-8'));
  } catch {
    throw new Error('That recipe code is damaged. Ask for it again.');
  }
  if (parsed?.format !== 'proxylaunch-recipe' || !Array.isArray(parsed.parts) || typeof parsed.agent_id !== 'string') {
    throw new Error('That recipe code is damaged. Ask for it again.');
  }
  return {
    format: 'proxylaunch-recipe',
    version: 1,
    name: String(parsed.name || 'Shared mod').slice(0, 80),
    agent_id: parsed.agent_id,
    is_nsfw: Boolean(parsed.is_nsfw),
    created_at: String(parsed.created_at || ''),
    parts: parsed.parts.slice(0, 32).map((p: any) => ({
      part: String(p?.part || ''),
      source: {
        title: String(p?.source?.title || 'Unknown mod').slice(0, 120),
        author: String(p?.source?.author || '').slice(0, 80),
        gamebanana_id: Number.isInteger(p?.source?.gamebanana_id) ? p.source.gamebanana_id : null,
      },
    })),
  };
}
