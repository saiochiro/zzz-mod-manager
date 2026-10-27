/**
 * "Tidy hotkeys": gives mods a simple, clash-free key layout.
 *
 *  1. Inside one mod, every toggle gets its own key, top to bottom: J, K, L, then a fixed list of
 *     spare keys, so two toggles of the same mod never share a key.
 *  2. Keys the game itself uses (WASD, Q, E, R, F, Shift, Space, Tab, M, number keys...) and the
 *     H key (outfit rotation) are never handed out.
 *  3. Every key only works while that mod's character is on screen: pressing J for Ellen's jacket
 *     can't open another character's menu. Mods that already limit their keys keep their own rule.
 *
 * All functions here are pure text transforms on .ini files, so they're easy to test.
 */

/** Spare keys handed out after J/K/L, in order. None of them are game controls. */
export const SPARE_KEYS = ['U', 'I', 'O', 'P', 'Y', 'N', 'VK_NUMPAD1', 'VK_NUMPAD2', 'VK_NUMPAD3', 'VK_NUMPAD4', 'VK_NUMPAD5', 'VK_NUMPAD6', 'VK_NUMPAD7', 'VK_NUMPAD8', 'VK_NUMPAD9'];

/** Never assigned: game controls, H (outfit rotation) and the loader's F-keys. */
export const RESERVED_KEYS = new Set(
  ['W', 'A', 'S', 'D', 'Q', 'E', 'R', 'F', 'T', 'G', 'C', 'V', 'X', 'Z', 'B', 'M', 'H', 'SPACE', 'TAB', 'ESC', 'SHIFT', 'CTRL', 'ALT']
    .concat(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'])
    .concat(Array.from({ length: 12 }, (_, i) => `F${i + 1}`))
);

/** The keys handed out, in order: J, K, L first, then the spare keys. */
export const KEY_ORDER = ['J', 'K', 'L', ...SPARE_KEYS].filter((k) => !RESERVED_KEYS.has(k));

/** Where a toggle lives: its .ini file and section. The keys of a plan from planModKeys. */
export function toggleId(t: { section_name: string; ini_file?: string }): string {
  return `${(t.ini_file || '').toLowerCase()}|${t.section_name.toLowerCase()}`;
}

/**
 * Picks a key for each toggle of one mod, top to bottom in the order the mod lists them (the same
 * order the Hotkeys tab shows): the first option gets J, then K, L, U, I, O, P, Y, N, numpad 1-9.
 *
 * One option = one key. Mods often repeat an option in several .ini files (each part or variant
 * file has its own `$hair`, and the copies must switch together), so toggles with the same
 * variable share a key. Inside a single file, a second section for the same variable (e.g. a
 * "previous" key) gets its own key. Returns toggleId -> key.
 */
export function planModKeys(
  toggles: Array<{ section_name: string; variable?: string; ini_file?: string }>
): Map<string, string> {
  const plan = new Map<string, string>();
  const optionKey = new Map<string, string>(); // option -> key
  const seenInFile = new Map<string, number>(); // file|variable -> how many sections so far
  for (const t of toggles) {
    const id = toggleId(t);
    if (plan.has(id)) continue;
    const variable = (t.variable || t.section_name).replace(/^\$/, '').toLowerCase();
    const fileVar = `${(t.ini_file || '').toLowerCase()}|${variable}`;
    const nth = seenInFile.get(fileVar) ?? 0;
    seenInFile.set(fileVar, nth + 1);
    const option = `${variable}#${nth}`;
    if (!optionKey.has(option)) optionKey.set(option, KEY_ORDER[optionKey.size] ?? KEY_ORDER[KEY_ORDER.length - 1]);
    plan.set(id, optionKey.get(option)!);
  }
  return plan;
}

/**
 * The Hotkeys tab's rows: one per option and key, even when the mod repeats that option in
 * several files. `sections` lists every section to change when the key is edited.
 */
export function groupToggles<T extends { section_name: string; variable: string; current_key: string; ini_file?: string }>(
  toggles: T[]
): Array<{ toggle: T; sections: string[]; files: number }> {
  const rows = new Map<string, { toggle: T; sections: string[]; files: Set<string> }>();
  for (const t of toggles) {
    const k = `${t.variable.toLowerCase()}|${t.current_key.toUpperCase()}`;
    const row = rows.get(k) ?? { toggle: t, sections: [], files: new Set<string>() };
    if (!row.sections.includes(t.section_name)) row.sections.push(t.section_name);
    row.files.add((t.ini_file || '').toLowerCase());
    rows.set(k, row);
  }
  return [...rows.values()].map((r) => ({ toggle: r.toggle, sections: r.sections, files: r.files.size }));
}

interface Section {
  name: string; // without brackets, as written
  start: number; // index of the header line
  end: number; // index after the last line of the section
}

function sectionsOf(lines: string[]): Section[] {
  const out: Section[] = [];
  lines.forEach((line, i) => {
    const m = line.trim().match(/^\[([^\]]+)\]/);
    if (m) {
      if (out.length) out[out.length - 1].end = i;
      out.push({ name: m[1].trim(), start: i, end: lines.length });
    }
  });
  return out;
}

const isKey = (s: Section) => /^key/i.test(s.name);
const isOverride = (s: Section, lines: string[]) =>
  /^textureoverride/i.test(s.name) && lines.slice(s.start + 1, s.end).some((l) => /^\s*hash\s*=/i.test(l));
const hasLine = (s: Section, lines: string[], re: RegExp) => lines.slice(s.start + 1, s.end).some((l) => re.test(l));

/**
 * Makes the keys in one .ini file work only while its character is on screen.
 * Uses the mod's own "$active"-style variable when it has one; otherwise adds `$pl_active`
 * (set by the mod's TextureOverride sections each frame, cleared after the frame).
 * Key sections that already have a `condition` are left alone. Files without TextureOverride
 * sections (key-only files) can't tell when the character is drawn and are left as they are.
 */
export function scopeKeysToCharacter(text: string): { text: string; scoped: number } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let lines = text.split(/\r?\n/);
  const sections = sectionsOf(lines);
  const keys = sections.filter((s) => isKey(s) && hasLine(s, lines, /^\s*key\s*=/i) && !hasLine(s, lines, /^\s*condition\s*=/i));
  const overrides = sections.filter((s) => isOverride(s, lines));
  if (!keys.length || !overrides.length) return { text, scoped: 0 };

  // The mod's own "character is drawn" variable: declared global and set to 1 in an override.
  let variable: string | null = null;
  for (const o of overrides) {
    for (const l of lines.slice(o.start + 1, o.end)) {
      const m = l.match(/^\s*\$([A-Za-z_]*active[A-Za-z0-9_]*)\s*=\s*1\s*$/i);
      if (m && new RegExp(`^\\s*global\\s+(persist\\s+)?\\$${m[1]}\\b`, 'im').test(text)) {
        variable = m[1];
        break;
      }
    }
    if (variable) break;
  }

  // Insert from the bottom up so earlier indexes stay valid.
  const inserts: Array<{ at: number; line: string }> = [];
  for (const k of keys) inserts.push({ at: k.start + 1, line: `condition = $${variable ?? 'pl_active'} == 1` });

  if (!variable) {
    variable = 'pl_active';
    if (!/\$pl_active\b/.test(text)) {
      for (const o of overrides) {
        const hashAt = lines.findIndex((l, i) => i > o.start && i < o.end && /^\s*hash\s*=/i.test(l));
        inserts.push({ at: hashAt + 1, line: '$pl_active = 1' });
      }
      const present = sections.find((s) => /^present$/i.test(s.name));
      if (present) inserts.push({ at: present.start + 1, line: 'post $pl_active = 0' });
      const constants = sections.find((s) => /^constants$/i.test(s.name));
      if (constants) inserts.push({ at: constants.start + 1, line: 'global $pl_active = 0' });
    }
  }

  inserts.sort((a, b) => b.at - a.at);
  for (const ins of inserts) lines.splice(ins.at, 0, ins.line);

  if (variable === 'pl_active' && !/^\s*\[present\]/im.test(lines.join('\n'))) {
    lines.push('', '; ProxyLaunch: clears the "character on screen" flag after every frame', '[Present]', 'post $pl_active = 0');
  }
  if (variable === 'pl_active' && !/^\s*\[constants\]/im.test(lines.join('\n'))) {
    lines = ['; ProxyLaunch: this mod\'s keys only work while its character is on screen', '[Constants]', 'global $pl_active = 0', '', ...lines];
  }
  return { text: lines.join(eol), scoped: keys.length };
}
