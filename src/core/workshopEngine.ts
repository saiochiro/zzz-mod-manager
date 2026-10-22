import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { WorkshopRecipe, WorkshopSourceInfo } from '../shared/types';

export type { WorkshopRecipe, WorkshopSourceInfo };

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
/* Build                                                               */
/* ------------------------------------------------------------------ */

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
