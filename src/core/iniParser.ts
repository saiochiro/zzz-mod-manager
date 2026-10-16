import { ParsedIniDocument, ParsedIniSection, SubToggle } from '../shared/types';

export const VK_TO_READABLE: Record<string, string> = {
  VK_OEM_4: '[',
  VK_OEM_6: ']',
  VK_OEM_5: '\\',
  VK_OEM_1: ';',
  VK_OEM_7: "'",
  VK_OEM_COMMA: ',',
  VK_OEM_PERIOD: '.',
  VK_OEM_2: '/',
  VK_OEM_MINUS: '-',
  VK_OEM_PLUS: '=',
  VK_UP: 'UP',
  VK_DOWN: 'DOWN',
  VK_LEFT: 'LEFT',
  VK_RIGHT: 'RIGHT',
  VK_PRIOR: 'PGUP',
  VK_NEXT: 'PGDN',
  VK_HOME: 'HOME',
  VK_END: 'END',
  VK_INSERT: 'INS',
  VK_DELETE: 'DEL',
  VK_NUMPAD0: 'NUM 0',
  VK_NUMPAD1: 'NUM 1',
  VK_NUMPAD2: 'NUM 2',
  VK_NUMPAD3: 'NUM 3',
  VK_NUMPAD4: 'NUM 4',
  VK_NUMPAD5: 'NUM 5',
  VK_NUMPAD6: 'NUM 6',
  VK_NUMPAD7: 'NUM 7',
  VK_NUMPAD8: 'NUM 8',
  VK_NUMPAD9: 'NUM 9',
  VK_MULTIPLY: 'NUM *',
  VK_ADD: 'NUM +',
  VK_SUBTRACT: 'NUM -',
  VK_DECIMAL: 'NUM .',
  VK_DIVIDE: 'NUM /',
  VK_RETURN: 'ENTER',
  VK_SPACE: 'SPACE',
  VK_TAB: 'TAB',
  VK_BACK: 'BACKSPACE',
};

export function formatReadableKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  const tokens = trimmed.split(/\s+/);
  const mapped = tokens
    .filter((t) => !t.toLowerCase().startsWith('no_'))
    .map((token) => {
      const upper = token.toUpperCase();
      if (VK_TO_READABLE[upper]) return VK_TO_READABLE[upper];
      if (upper.startsWith('VK_F') && /^VK_F\d+$/.test(upper)) {
        return upper.replace('VK_', '');
      }
      if (upper === 'VK_CONTROL' || upper === 'CTRL') return 'CTRL';
      if (upper === 'VK_MENU' || upper === 'ALT') return 'ALT';
      if (upper === 'VK_SHIFT' || upper === 'SHIFT') return 'SHIFT';
      return upper;
    });
  return mapped.join(' + ') || trimmed.toUpperCase();
}

export function inferToggleLabel(sectionName: string, variableName: string): string {
  const cleanSection = sectionName
    .replace(/^Key(Toggle|Swap|Cycle|Switch|Change)?/i, '')
    .replace(/_/g, ' ')
    .trim();
  if (cleanSection.length > 0) {
    return cleanSection.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  }
  const cleanVar = variableName
    .replace(/^\$+/, '')
    .replace(/_/g, ' ')
    .trim();
  if (cleanVar.length > 0) {
    return cleanVar.charAt(0).toUpperCase() + cleanVar.slice(1);
  }
  return 'Sub-Part';
}

export function classifyStandardKeySlot(label: string, variable: string): 'J' | 'K' | 'L' {
  const combined = `${label} ${variable}`.toLowerCase();
  if (/(weapon|sword|katana|blade|gun|shield|fx|glow|scabbard|sheath)/.test(combined)) {
    return 'L';
  }
  if (/(glass|glasses|mask|hat|hair|ear|ears|visor|horn|ribbon|choker|tail|acc|head)/.test(combined)) {
    return 'K';
  }
  // Default primary accessory (Jacket, Coat, Cape, Top, Skirt, Shorts, Stockings, Suit)
  return 'J';
}

export function parseIniContent(rawContent: string, filePath = 'mod.ini'): ParsedIniDocument {
  const lines = rawContent.split(/\r?\n/);
  const sections: ParsedIniSection[] = [];
  const detectedHashesSet = new Set<string>();
  const subToggles: SubToggle[] = [];
  let hasLegacyShaderSlots = false;

  let currentSection: ParsedIniSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Ignore full line comments
    if (trimmed.startsWith(';') || trimmed === '') {
      if (currentSection) {
        currentSection.rawLines.push(line);
        currentSection.endLine = i + 1;
      }
      continue;
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]/);
    if (sectionMatch) {
      const secName = sectionMatch[1].trim();
      let secType: ParsedIniSection['type'] = 'Other';
      if (/^TextureOverride/i.test(secName)) secType = 'TextureOverride';
      else if (/^ShaderOverride/i.test(secName)) secType = 'ShaderOverride';
      else if (/^Key/i.test(secName)) secType = 'Key';
      else if (/^Constants$/i.test(secName)) secType = 'Constants';
      else if (/^Resource/i.test(secName)) secType = 'Resource';
      else if (/^CommandList/i.test(secName)) secType = 'CommandList';

      currentSection = {
        name: secName,
        type: secType,
        startLine: i + 1,
        endLine: i + 1,
        entries: {},
        rawLines: [line],
      };
      sections.push(currentSection);
      continue;
    }

    if (currentSection) {
      currentSection.rawLines.push(line);
      currentSection.endLine = i + 1;

      const kvMatch = trimmed.match(/^([^=;]+?)\s*=\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        const val = kvMatch[2].replace(/;.*$/, '').trim();
        currentSection.entries[key] = val;

        if (
          (currentSection.type === 'TextureOverride' || currentSection.type === 'ShaderOverride') &&
          key.toLowerCase() === 'hash'
        ) {
          const hexMatch = val.match(/\b([0-9a-fA-F]{8})\b/);
          if (hexMatch) {
            const normalizedHash = hexMatch[1].toLowerCase();
            currentSection.hash = normalizedHash;
            detectedHashesSet.add(normalizedHash);
          }
        }

        if (
          currentSection.type === 'TextureOverride' &&
          /^ps-t[0123]$/i.test(key)
        ) {
          currentSection.hasLegacySlots = true;
        }
      }
    }
  }

  for (const sec of sections) {
    if (sec.type === 'TextureOverride' && sec.hasLegacySlots) {
      const joinedRaw = sec.rawLines.join('\n');
      if (!/CommandList\\ZZMI\\(SetTextures|ORFix)/i.test(joinedRaw)) {
        hasLegacyShaderSlots = true;
      } else {
        sec.hasLegacySlots = false;
      }
    }

    if (sec.type === 'Key') {
      // Skip our own generated master swap key block if scanning
      if (sec.name === 'KeySwapOutfit' && sec.entries['$active_outfit']) {
        continue;
      }

      const rawKey = sec.entries['key'] || sec.entries['Key'] || '';
      const varEntry = Object.entries(sec.entries).find(([k]) => k.startsWith('$'));

      if (rawKey && varEntry) {
        const [variable, statesRaw] = varEntry;
        const states = statesRaw.split(',').map((s) => s.trim()).filter(Boolean);
        const origCommentLine = sec.rawLines.find((l) => l.trim().startsWith('; zzzmgr_orig_key ='));
        const originalKey = origCommentLine
          ? origCommentLine.split('=')[1].trim()
          : formatReadableKey(rawKey);

        const fileName = filePath.split(/[/\\]/).pop() || 'mod.ini';
        subToggles.push({
          section_name: sec.name,
          variable,
          label: inferToggleLabel(sec.name, variable),
          original_key: originalKey,
          current_key: formatReadableKey(rawKey),
          states: states.length > 0 ? states : ['0', '1'],
          ini_file: fileName,
        });
      }
    }
  }

  const fileName = filePath.split(/[/\\]/).pop() || 'mod.ini';
  return {
    filePath,
    fileName,
    sections,
    detectedHashes: Array.from(detectedHashesSet),
    subToggles,
    hasLegacyShaderSlots,
    rawContent,
  };
}

/**
 * Safely rewrites a `[Key*]` section's `key = ...` line in raw `.ini` content,
 * preserving comments and storing `; zzzmgr_orig_key = ...` if not already recorded.
 */
export function rewriteIniKeybind(
  rawContent: string,
  sectionName: string,
  newKey: string
): string {
  const lines = rawContent.split(/\r?\n/);
  let inTargetSection = false;
  let hasOrigComment = false;
  let currentKeyVal = '';

  // First pass: check if section has orig comment
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const secMatch = trimmed.match(/^\[([^\]]+)\]/);
    if (secMatch) {
      inTargetSection = secMatch[1].trim() === sectionName;
      continue;
    }
    if (inTargetSection) {
      if (trimmed.startsWith('; zzzmgr_orig_key =')) {
        hasOrigComment = true;
      }
      const keyMatch = trimmed.match(/^key\s*=\s*(.+)$/i);
      if (keyMatch) {
        currentKeyVal = keyMatch[1].trim();
      }
    }
  }

  inTargetSection = false;
  const output: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const secMatch = trimmed.match(/^\[([^\]]+)\]/);
    if (secMatch) {
      inTargetSection = secMatch[1].trim() === sectionName;
      output.push(line);
      if (inTargetSection && !hasOrigComment && currentKeyVal) {
        output.push(`; zzzmgr_orig_key = ${formatReadableKey(currentKeyVal)}`);
      }
      continue;
    }

    if (inTargetSection && /^key\s*=/i.test(trimmed)) {
      output.push(`key = ${newKey}`);
    } else {
      output.push(line);
    }
  }

  return output.join('\n');
}
