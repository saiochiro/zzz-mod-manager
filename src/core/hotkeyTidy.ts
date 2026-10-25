/**
 * "Tidy hotkeys": gives mods a simple, clash-free key layout.
 *
 *  1. Inside one mod, every toggle gets its own key (J/K/L by kind of part first, then a fixed
 *     list of spare keys), so two toggles of the same mod never share a key.
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

export function preferredSlot(label: string, variable: string): 'J' | 'K' | 'L' {
  const t = `${label} ${variable}`.toLowerCase();
  if (/glass|mask|hat|hair|visor|horn|monocle|ear|headphone|ribbon|tail|bang|face/.test(t)) return 'K';
  if (/weapon|blade|sword|katana|glow|fx|shield|scissor|gun|stinger|flame/.test(t)) return 'L';
  return 'J';
}

/**
 * Picks a key for each toggle of one mod: its preferred J/K/L slot if still free, otherwise the
 * next free spare key. Returns section name -> key.
 */
export function planModKeys(toggles: Array<{ section_name: string; label: string; variable: string }>): Map<string, string> {
  const used = new Set<string>();
  const plan = new Map<string, string>();
  const take = (k: string) => {
    used.add(k);
    return k;
  };
  for (const t of toggles) {
    if (plan.has(t.section_name.toLowerCase())) continue;
    const pref = preferredSlot(t.label, t.variable);
    const key = !used.has(pref) ? take(pref) : take(['J', 'K', 'L', ...SPARE_KEYS].find((k) => !used.has(k) && !RESERVED_KEYS.has(k)) ?? pref);
    plan.set(t.section_name.toLowerCase(), key);
  }
  return plan;
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
