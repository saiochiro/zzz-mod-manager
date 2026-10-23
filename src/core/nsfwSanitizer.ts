import fs from 'fs';
import path from 'path';
import { NSFW_FILE_RE, TOGGLE_KEY_RE } from '../shared/nsfw';
import { listModInis } from './workshopEngine';

/**
 * Finds and disables NSFW hotkey toggles inside an installed mod (for "Experimental" mods).
 *
 * A toggle is NSFW when its [Key...] section, variable, or nearby comments use NSFW words, or when
 * one of its states switches to files with NSFW names. Sanitizing:
 *   - pins the variable to its safe state in [Constants] (and drops "persist", so a saved NSFW
 *     state in d3dx_user.ini can't come back),
 *   - comments out the [Key...] section so the hotkey does nothing,
 *   - empties Resource sections that point at NSFW-named files and moves those files out of the mod.
 * Originals are kept in a backup folder so the mod can be restored in the NSFW / Show all views.
 */

const MARK = '; ProxyLaunch removed NSFW toggle: ';
const BACKUP_INFO = 'sanitize.json';

interface Section {
  header: string; // raw header line
  name: string; // lower-case section name
  start: number; // index of header line
  end: number; // index after last body line
  comment: string; // comment lines right above the header
}

interface ParsedIni {
  file: string;
  lines: string[];
  eol: string;
  sections: Section[];
}

function parse(file: string): ParsedIni {
  const raw = fs.readFileSync(file, 'utf-8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.replace(/^﻿/, '').split(/\r?\n/);
  const sections: Section[] = [];
  lines.forEach((l, i) => {
    const m = l.trim().match(/^\[([^\]]+)\]/);
    if (!m) return;
    if (sections.length) sections[sections.length - 1].end = i;
    let c = i - 1;
    const comment: string[] = [];
    while (c >= 0 && /^\s*;/.test(lines[c])) comment.unshift(lines[c--]);
    sections.push({ header: l, name: m[1].trim().toLowerCase(), start: i, end: lines.length, comment: comment.join(' ') });
  });
  return { file, lines, eol, sections };
}

const code = (l: string) => (l.trim().startsWith(';') ? '' : l.trim());
const body = (ini: ParsedIni, s: Section) => ini.lines.slice(s.start + 1, s.end);

export interface NsfwToggle {
  ini: string;
  keySection: string;
  variable: string;
  values: number[];
  safeValue: number;
  /** Why it counts as NSFW (developer diagnostics). */
  why: string;
}

/** Resource section names (lower case) whose file names look NSFW, per ini. */
function nsfwResources(ini: ParsedIni): Set<string> {
  const out = new Set<string>();
  for (const s of ini.sections) {
    if (!s.name.startsWith('resource')) continue;
    const file = body(ini, s)
      .map(code)
      .map((l) => l.match(/^filename\s*=\s*(.+)$/i)?.[1])
      .find(Boolean);
    if (NSFW_FILE_RE.test(s.name.replace(/^resource/, '')) || (file && NSFW_FILE_RE.test(file))) out.add(s.name);
  }
  return out;
}

/** For `$var`, which values' if-branches switch to NSFW resources. */
function nsfwValuesFor(ini: ParsedIni, variable: string, bad: Set<string>): Set<number> {
  const out = new Set<number>();
  if (!bad.size) return out;
  const eq = new RegExp(`\\$${variable}\\s*==\\s*(-?\\d+)`, 'gi');
  for (const s of ini.sections) {
    const stack: Array<number[]> = [];
    for (const raw of body(ini, s)) {
      const t = code(raw);
      if (!t) continue;
      const lo = t.toLowerCase();
      if (/^(if|elif|else\s+if)\b/.test(lo)) {
        const vals = [...t.matchAll(eq)].map((m) => Number(m[1]));
        if (/^if\b/.test(lo)) stack.push(vals);
        else if (stack.length) stack[stack.length - 1] = vals;
      } else if (/^else\s*$/.test(lo)) {
        if (stack.length) stack[stack.length - 1] = [];
      } else if (/^endif\b/.test(lo)) stack.pop();
      else if (stack.length && stack[stack.length - 1].length) {
        const refs = t.toLowerCase().match(/resource[\w.]*/g) ?? [];
        if (refs.some((r) => bad.has(r))) stack[stack.length - 1].forEach((v) => out.add(v));
      }
    }
  }
  return out;
}

function defaultValue(ini: ParsedIni, variable: string): number | null {
  const re = new RegExp(`\\$${variable}\\b(?:\\s*=\\s*(-?\\d+))?`, 'i');
  for (const s of ini.sections) {
    if (s.name !== 'constants') continue;
    for (const l of body(ini, s)) {
      const t = code(l);
      if (!/^(global|local|persist|\$)/i.test(t)) continue;
      const m = t.match(re);
      if (m) return m[1] !== undefined ? Number(m[1]) : 0;
    }
  }
  return null;
}

/** NSFW hotkey toggles in a mod folder (all active .ini files). */
export function findNsfwToggles(modDir: string): NsfwToggle[] {
  const out: NsfwToggle[] = [];
  for (const file of listModInis(modDir)) {
    let ini: ParsedIni;
    try {
      ini = parse(file);
    } catch {
      continue;
    }
    const bad = nsfwResources(ini);
    for (const s of ini.sections) {
      if (!s.name.startsWith('key')) continue;
      const lines = body(ini, s);
      const comments = [s.comment, ...lines.filter((l) => /^\s*;/.test(l))].join(' ');
      for (const l of lines) {
        const m = code(l).match(/^\$([A-Za-z_]\w*)\s*=\s*([-\d.,\s]+)$/);
        if (!m) continue;
        const variable = m[1];
        const values = m[2].split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
        if (values.length === 1) values.unshift(0); // type = toggle/hold: off and on
        const byName = TOGGLE_KEY_RE.test(s.name) || TOGGLE_KEY_RE.test(variable) || TOGGLE_KEY_RE.test(comments);
        const hot = nsfwValuesFor(ini, variable, bad);
        if (!byName && hot.size === 0) continue;
        const def = defaultValue(ini, variable) ?? values[0];
        const safe = !hot.has(def) ? def : values.find((v) => !hot.has(v));
        if (safe === undefined) continue; // every state is NSFW: nothing safe to pin
        out.push({
          ini: file,
          keySection: s.name,
          variable,
          values,
          safeValue: safe,
          why: [byName ? 'NSFW name/comment' : '', hot.size ? `states ${[...hot].join(',')} switch to NSFW files` : ''].filter(Boolean).join('; '),
        });
      }
    }
  }
  return out;
}

export interface SanitizeResult {
  changed: boolean;
  toggles: NsfwToggle[];
  movedFiles: string[];
}

/** Disables a mod's NSFW toggles. Safe to run again (already-sanitized mods are left alone). */
export function sanitizeMod(modDir: string, backupDir: string): SanitizeResult {
  const result: SanitizeResult = { changed: false, toggles: [], movedFiles: [] };
  if (fs.existsSync(path.join(backupDir, BACKUP_INFO))) return result;
  const toggles = findNsfwToggles(modDir);
  const byIni = new Map<string, NsfwToggle[]>();
  for (const t of toggles) byIni.set(t.ini, [...(byIni.get(t.ini) ?? []), t]);

  // NSFW-named files referenced by any ini, even without a toggle, also come out.
  const iniFiles = listModInis(modDir);
  const backup = (abs: string) => {
    const dest = path.join(backupDir, path.relative(modDir, abs));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    return dest;
  };
  const touched: string[] = [];
  for (const file of iniFiles) {
    const ini = parse(file);
    const mine = byIni.get(file) ?? [];
    const bad = nsfwResources(ini);
    if (!mine.length && !bad.size) continue;
    const lines = [...ini.lines];
    // 1. Comment out the toggle hotkeys.
    for (const t of mine) {
      const s = ini.sections.find((x) => x.name === t.keySection);
      if (!s) continue;
      for (let i = s.start; i < s.end; i++) if (lines[i].trim() && !lines[i].startsWith(MARK)) lines[i] = MARK + lines[i];
    }
    // 2. Pin the variables to their safe value (no persist).
    const pinned = new Set<string>();
    for (const s of ini.sections) {
      if (s.name !== 'constants') continue;
      for (let i = s.start + 1; i < s.end; i++) {
        const t = mine.find((x) => new RegExp(`\\$${x.variable}\\b`, 'i').test(code(lines[i])) && /^(global|local|persist|\$)/i.test(code(lines[i])));
        if (!t) continue;
        // No inline comment: 3DMigoto doesn't allow comments after a value.
        lines[i] = `global $${t.variable} = ${t.safeValue}`;
        pinned.add(t.variable);
      }
    }
    const missing = mine.filter((t) => !pinned.has(t.variable));
    if (missing.length) {
      const c = ini.sections.find((x) => x.name === 'constants');
      const add = missing.map((t) => `global $${t.variable} = ${t.safeValue}`);
      if (c) lines.splice(c.start + 1, 0, ...add);
      else lines.unshift('[Constants]', ...add, '');
    }
    // 3. Empty NSFW-file resources and move the files out.
    for (const s of ini.sections) {
      if (!bad.has(s.name)) continue;
      for (let i = s.start + 1; i < s.end; i++) {
        const m = code(lines[i]).match(/^filename\s*=\s*(.+)$/i);
        if (!m) continue;
        const abs = path.resolve(path.dirname(file), m[1].replace(/^["']|["']$/g, ''));
        lines[i] = MARK + lines[i];
        if (fs.existsSync(abs) && !path.relative(modDir, abs).startsWith('..')) {
          const dest = backup(abs);
          try {
            fs.renameSync(abs, dest);
          } catch {
            fs.copyFileSync(abs, dest);
            fs.unlinkSync(abs);
          }
          result.movedFiles.push(path.relative(modDir, abs));
        }
      }
    }
    fs.copyFileSync(file, backup(file));
    lines.unshift('; ProxyLaunch: NSFW options in this file were disabled (Experimental mod). The original is kept in ProxyLaunch backups.');
    fs.writeFileSync(file, lines.join(ini.eol), 'utf-8');
    touched.push(path.relative(modDir, file));
  }
  if (touched.length) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(
      path.join(backupDir, BACKUP_INFO),
      JSON.stringify({ when: new Date().toISOString(), inis: touched, movedFiles: result.movedFiles, toggles }, null, 2)
    );
    result.changed = true;
  }
  result.toggles = toggles;
  return result;
}

/** Puts a sanitized mod back the way it was downloaded. */
export function restoreMod(modDir: string, backupDir: string): boolean {
  const infoPath = path.join(backupDir, BACKUP_INFO);
  if (!fs.existsSync(infoPath)) return false;
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8')) as { inis: string[]; movedFiles: string[] };
  for (const rel of [...info.inis, ...info.movedFiles]) {
    const src = path.join(backupDir, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(modDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  fs.rmSync(backupDir, { recursive: true, force: true });
  return true;
}

export function isSanitized(backupDir: string): boolean {
  return fs.existsSync(path.join(backupDir, BACKUP_INFO));
}

/** File paths under a folder (depth-first, capped). */
export function listFilesRecursive(dir: string, max = 4000): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 8 || out.length >= max) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= max) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else out.push(p);
    }
  };
  walk(dir, 0);
  return out;
}
