import { ParsedIniDocument, ParsedIniSection, SubToggle } from '../shared/types';

const VK_KEY_MAP: Record<string, string> = {
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
};

export function formatReadableKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  const upper = trimmed.toUpperCase();
  if (VK_KEY_MAP[upper]) {
    return VK_KEY_MAP[upper];
  }
  if (upper.startsWith('VK_NUMPAD')) {
    return `NUM ${upper.replace('VK_NUMPAD', '')}`;
  }
  if (upper.startsWith('VK_')) {
    return upper.replace(/^VK_/, '');
  }
  return trimmed;
}

function classifySectionType(name: string): ParsedIniSection['type'] {
  if (/^TextureOverride/i.test(name)) return 'TextureOverride';
  if (/^ShaderOverride/i.test(name)) return 'ShaderOverride';
  if (/^Key/i.test(name)) return 'Key';
  if (/^Constants/i.test(name)) return 'Constants';
  if (/^Resource/i.test(name)) return 'Resource';
  if (/^CommandList/i.test(name)) return 'CommandList';
  return 'Other';
}

function formatReadableToggleLabel(sectionName: string, variable: string): string {
  const cleanedSection = sectionName
    .replace(/^Key(Swap|Toggle|Cycle)?_?/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();

  if (cleanedSection.length > 1) {
    return cleanedSection;
  }
  return variable.replace(/^\$/, '');
}

export function classifyStandardKeySlot(label: string, variable: string): string {
  const combined = `${label} ${variable}`.toLowerCase();
  if (/jacket|coat|hood|cape|vest|trench|haori|shirt|dress|outfit/i.test(combined)) {
    return 'J';
  }
  if (/glass|mask|hat|hair|visor|horn|monocle|ear|headphone|ribbon|tail/i.test(combined)) {
    return 'K';
  }
  if (/weapon|blade|sword|katana|glow|fx|shield|scissor|gun|stinger|flame/i.test(combined)) {
    return 'L';
  }
  return 'J';
}

const PART_CLASSIFIER_RULES: Array<{ part: string; regex: RegExp }> = [
  { part: 'Hair', regex: /hair|bangs|ponytail|braid|twintail/i },
  { part: 'Head', regex: /head|hat|helmet|ears|horns|halo|crown/i },
  { part: 'Face', regex: /face|eyes|visor|mask|glasses|sunglasses|eyepatch|blush/i },
  { part: 'Dress', regex: /dress|skirt|gown|kimono|haori|maid|apron/i },
  { part: 'Body', regex: /body|torso|chest|jacket|coat|shirt|top|pants|shorts|legs|shoes|boots|stockings|socks|gloves|suit|outfit/i },
  { part: 'Weapon', regex: /weapon|sword|katana|blade|scissors|gun|pistol|rifle|shield|hammer|flamethrower|stinger|dagger/i },
  { part: 'Accessories', regex: /acc|accessory|accessories|ribbon|bow|tail|wings|bag|pouch|jewelry|necklace|ring|chains/i },
];

export function classifyMeshPartsFromTokens(tokens: string[]): string[] {
  const combined = tokens.join(' ');
  const detected = new Set<string>();

  for (const rule of PART_CLASSIFIER_RULES) {
    if (rule.regex.test(combined)) {
      detected.add(rule.part);
    }
  }

  if (detected.size === 0) {
    detected.add('Body');
  }
  return Array.from(detected);
}

/**
 * Parses a 3DMigoto / ZZMI .ini file into structured AST sections,
 * extracting target buffer/texture hashes, [Key*] sub-toggles (key & back),
 * referenced resource files (.buf, .ib, .dds), and classified mesh parts.
 */
export function parseIniDocument(
  rawContent: string,
  filePath: string,
  fileName?: string
): ParsedIniDocument {
  const resolvedFileName = fileName || filePath.split(/[/\\]/).pop() || 'mod.ini';
  const lines = rawContent.split(/\r?\n/);
  const sections: ParsedIniSection[] = [];
  const detectedHashesSet = new Set<string>();
  const referencedFilesSet = new Set<string>();
  const partTokens: string[] = [resolvedFileName];
  let hasLegacyShaderSlots = false;

  let currentSection: ParsedIniSection | null = null;
  let pendingOrigKeyComment: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith(';') || trimmed === '') {
      const origMatch = trimmed.match(/^;\s*zzzmgr_orig_key\s*=\s*(.+)$/i);
      if (origMatch) {
        pendingOrigKeyComment = origMatch[1].trim();
      }
      if (currentSection) {
        currentSection.rawLines.push(rawLine);
        currentSection.endLine = i + 1;
      }
      continue;
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]/);
    if (sectionMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const sectionName = sectionMatch[1].trim();
      partTokens.push(sectionName);
      pendingOrigKeyComment = null;
      currentSection = {
        name: sectionName,
        type: classifySectionType(sectionName),
        startLine: i + 1,
        endLine: i + 1,
        entries: {},
        rawLines: [rawLine],
      };
      continue;
    }

    if (currentSection) {
      currentSection.rawLines.push(rawLine);
      currentSection.endLine = i + 1;

      const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        const val = kvMatch[2].trim();
        currentSection.entries[key] = val;

        if (key.toLowerCase() === 'key' && pendingOrigKeyComment) {
          currentSection.entries['__zzzmgr_orig_key'] = pendingOrigKeyComment;
        }

        if (key.toLowerCase() === 'hash') {
          const cleanHash = val.toLowerCase().split(/\s+/)[0];
          if (/^[0-9a-f]{8,16}$/i.test(cleanHash)) {
            currentSection.hash = cleanHash;
            detectedHashesSet.add(cleanHash);
          }
        }

        if (key.toLowerCase() === 'filename') {
          const cleanFile = val.replace(/^["']|["']$/g, '').trim();
          if (cleanFile) {
            referencedFilesSet.add(cleanFile);
            partTokens.push(cleanFile);
          }
        }

        if (
          currentSection.type === 'TextureOverride' &&
          /^ps-t[012]$/i.test(key) &&
          !rawContent.includes('CommandList\\ZZMI\\ORFix')
        ) {
          currentSection.hasLegacySlots = true;
          hasLegacyShaderSlots = true;
        }
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  // Extract [Key*] sections into user-friendly SubToggles
  const subToggles: SubToggle[] = [];
  for (const sec of sections) {
    if (sec.type === 'Key') {
      const keyBinding = sec.entries['key'] || sec.entries['Key'];
      const backBinding = sec.entries['back'] || sec.entries['Back'];
      const origKey = sec.entries['__zzzmgr_orig_key'] || keyBinding;
      const varEntry = Object.entries(sec.entries).find(([k]) => k.startsWith('$'));

      if (keyBinding && varEntry) {
        const [variable, statesRaw] = varEntry;
        const states = statesRaw.split(',').map((s) => s.trim());
        partTokens.push(variable);
        subToggles.push({
          section_name: sec.name,
          variable,
          label: formatReadableToggleLabel(sec.name, variable),
          original_key: formatReadableKey(origKey),
          current_key: formatReadableKey(keyBinding),
          back_key: backBinding ? formatReadableKey(backBinding) : undefined,
          states,
          ini_file: resolvedFileName,
        });
      }
    }
  }

  return {
    filePath,
    fileName: resolvedFileName,
    sections,
    detectedHashes: Array.from(detectedHashesSet),
    subToggles,
    hasLegacyShaderSlots,
    referencedFiles: Array.from(referencedFilesSet),
    detectedParts: classifyMeshPartsFromTokens(partTokens),
    rawContent,
  };
}

export function parseIniContent(rawContent: string, filePath = 'mod.ini'): ParsedIniDocument {
  return parseIniDocument(rawContent, filePath);
}

/**
 * Remaps the `key = ...` line inside a specific `[Key...]` section of a raw .ini string
 * and records `; zzzmgr_orig_key = ...` if not already present.
 */
export function rewriteIniKeybind(
  rawContent: string,
  targetSectionName: string,
  newKey: string
): string {
  const lines = rawContent.split(/\r?\n/);
  const out: string[] = [];
  let inTargetSection = false;
  let hasOrigKeyCommentInSection = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const secMatch = trimmed.match(/^\[([^\]]+)\]/);
    if (secMatch) {
      inTargetSection = secMatch[1].trim().toLowerCase() === targetSectionName.toLowerCase();
      hasOrigKeyCommentInSection = false;
      out.push(lines[i]);
      continue;
    }

    if (inTargetSection) {
      if (/^;\s*zzzmgr_orig_key\s*=/i.test(trimmed)) {
        hasOrigKeyCommentInSection = true;
      }
      const keyMatch = lines[i].match(/^(\s*key\s*=\s*)(.+)$/i);
      if (keyMatch) {
        const prevKey = formatReadableKey(keyMatch[2].trim());
        if (!hasOrigKeyCommentInSection) {
          out.push(`; zzzmgr_orig_key = ${prevKey}`);
        }
        out.push(`${keyMatch[1]}${newKey}`);
        inTargetSection = false;
        continue;
      }
    }

    out.push(lines[i]);
  }

  return out.join('\n');
}

export const remapKeyInIniContent = rewriteIniKeybind;

/**
 * Standardizes all `[Key*]` sub-toggles in an .ini file onto the `J`, `K`, `L` keys
 * so that `H` remains 100% exclusive to the Master Skin Swap Cycle.
 */
export function standardizeSubToggleKeysInIni(rawContent: string): {
  updatedContent: string;
  remappedCount: number;
} {
  const standardKeys = ['J', 'K', 'L', 'U', 'I', 'O'];
  const lines = rawContent.split(/\r?\n/);
  let inKeySection = false;
  let keySectionIndex = 0;
  let remappedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const secMatch = trimmed.match(/^\[([^\]]+)\]/);
    if (secMatch) {
      const secName = secMatch[1].trim();
      inKeySection = /^Key/i.test(secName);
      continue;
    }

    if (inKeySection) {
      const keyMatch = lines[i].match(/^(\s*key\s*=\s*)(.+)$/i);
      if (keyMatch) {
        const assignedKey = standardKeys[keySectionIndex % standardKeys.length];
        keySectionIndex++;
        if (keyMatch[2].trim().toUpperCase() !== assignedKey) {
          lines[i] = `${keyMatch[1]}${assignedKey}`;
          remappedCount++;
        }
        inKeySection = false;
      }
    }
  }

  return {
    updatedContent: lines.join('\n'),
    remappedCount,
  };
}
