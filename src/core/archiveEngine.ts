import AdmZip from 'adm-zip';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { HashDatabase } from '../shared/types';
import { parseIniContent } from './iniParser';
import { matchHashesToAgent } from './routerEngine';

export interface LocalizedModRoot {
  rootPath: string;
  folderName: string;
  iniFiles: string[];
  detectedHashes: string[];
  nestedDepthUnpacked: number;
  sanitizedWarnings: string[];
  matchedAgentId: string;
}

export interface UnpackStagingResult {
  stagingDir: string;
  localizedRoots: LocalizedModRoot[];
  isMultiAgentPack: boolean;
  totalNestedFolders: number;
  sanitizedWarnings: string[];
}

const FORBIDDEN_EXTENSIONS = new Set(['.dll', '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.scr', '.msi']);

/**
 * The 7-Zip binary shipped with the app (7zip-bin). Inside a packaged app it lives in
 * app.asar.unpacked, because programs can't run from inside the asar archive.
 */
function sevenZipPath(): string | null {
  try {
    const req = typeof require === 'function' ? require : createRequire(path.join(process.cwd(), 'index.js'));
    const p: string = req('7zip-bin').path7za;
    const unpacked = p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    if (fs.existsSync(unpacked)) return unpacked;
    if (fs.existsSync(p)) return p;
  } catch {
    // not installed (dev without deps)
  }
  return null;
}

function tryExtractWith(cmd: string, args: string[], targetDir: string): string | null {
  try {
    execFileSync(cmd, args, { stdio: 'pipe', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // 7-Zip exit code 1 = warnings only (files were still extracted).
    const status = (err as { status?: number }).status;
    if (!(cmd !== 'tar.exe' && status === 1)) {
      const out = String((err as { stderr?: Buffer }).stderr || (err as Error).message || '').trim();
      return out.split(/\r?\n/).filter(Boolean).slice(-2).join(' ') || 'failed';
    }
  }
  return fs.readdirSync(targetDir).length > 0 ? null : 'nothing was extracted';
}

/**
 * Extracts an archive (.zip, .7z, .rar) or copies a folder into `stagingDir`.
 * Order: built-in zip reader, then the bundled 7-Zip (7z, zip, Unicode names), then
 * Windows' tar.exe (RAR on Windows 11).
 */
export function extractToDir(sourcePath: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  const stat = fs.statSync(sourcePath);

  if (stat.isDirectory()) {
    copyDirRecursive(sourcePath, targetDir);
    return;
  }

  // Check file magic header bytes (PK\x03\x04 = standard ZIP)
  let isPkZip = false;
  try {
    const fd = fs.openSync(sourcePath, 'r');
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);
    isPkZip = header[0] === 0x50 && header[1] === 0x4b;
  } catch {
    // Ignore header read error
  }

  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === '.zip' || isPkZip) {
    try {
      const zip = new AdmZip(sourcePath);
      zip.extractAllTo(targetDir, true);
      if (fs.readdirSync(targetDir).length > 0) {
        return;
      }
    } catch {
      // Fall through to 7-Zip / tar (Deflate64, LZMA zips, ...)
    }
  }

  const problems: string[] = [];
  const sevenZip = sevenZipPath();
  if (sevenZip) {
    const err = tryExtractWith(sevenZip, ['x', '-y', '-bd', `-o${targetDir}`, sourcePath], targetDir);
    if (!err) return;
    problems.push(`7-Zip: ${err}`);
  }
  if (process.platform === 'win32') {
    const err = tryExtractWith('tar.exe', ['-xf', sourcePath, '-C', targetDir], targetDir);
    if (!err) return;
    problems.push(`tar: ${err}`);
  }
  throw new Error(
    `Couldn't unpack ${path.basename(sourcePath)}. ${
      /\.rar$/i.test(sourcePath) ? 'RAR files need Windows 11, or unpack it yourself and import the folder. ' : ''
    }(${problems.join('; ') || 'no extractor available'})`
  );
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Deepest folder that contains all of the given folders. */
function commonAncestor(dirs: string[]): string | null {
  if (dirs.length === 0) return null;
  let anc = path.resolve(dirs[0]);
  while (!dirs.every((d) => isInside(path.resolve(d), anc))) {
    const up = path.dirname(anc);
    if (up === anc) return null;
    anc = up;
  }
  return anc;
}

export function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively scans for nested archives (.zip/.rar/.7z) up to 3 levels deep and unpacks them in-place.
 */
export function sweepNestedArchives(dirPath: string, depth = 0): number {
  if (depth > 3 || !fs.existsSync(dirPath)) return 0;
  let unpackedCount = 0;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      unpackedCount += sweepNestedArchives(fullPath, depth + 1);
    } else if (/\.(zip|7z|rar)$/i.test(entry.name)) {
      const subVariantDir = path.join(
        dirPath,
        entry.name.replace(/\.(zip|7z|rar)$/i, '')
      );
      try {
        extractToDir(fullPath, subVariantDir);
        fs.unlinkSync(fullPath);
        unpackedCount += 1 + sweepNestedArchives(subVariantDir, depth + 1);
      } catch {
        // Leave archive if unreadable
      }
    }
  }
  return unpackedCount;
}

/**
 * Sanitizes a staging directory by deleting any rogue .dll / .exe / script executables.
 */
export function sanitizeDirectoryTree(dirPath: string): string[] {
  const warnings: string[] = [];
  if (!fs.existsSync(dirPath)) return warnings;

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      warnings.push(...sanitizeDirectoryTree(fullPath));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (FORBIDDEN_EXTENSIONS.has(ext)) {
        fs.unlinkSync(fullPath);
        warnings.push(`Blocked & stripped rogue executable binary: ${entry.name}`);
      }
    }
  }
  return warnings;
}

interface IniCandidateDir {
  dirPath: string;
  depth: number;
  iniFiles: string[];
}

function findDirsWithIni(
  dirPath: string,
  depth = 0,
  results: IniCandidateDir[] = []
): IniCandidateDir[] {
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const iniFiles = entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.toLowerCase().endsWith('.ini') &&
        e.name.toLowerCase() !== 'desktop.ini' &&
        e.name.toLowerCase() !== 'd3dx.ini' &&
        e.name.toLowerCase() !== 'master_swap.ini'
    )
    .map((e) => e.name);

  if (iniFiles.length > 0) {
    results.push({ dirPath, depth, iniFiles });
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      findDirsWithIni(path.join(dirPath, entry.name), depth + 1, results);
    }
  }

  return results;
}

/**
 * Unpacks an archive or directory into `staging_temp/[uuid]/`, performs nested archive sweeping,
 * rogue executable sanitization, and executes the Root Localization Algorithm.
 */
export function unpackAndLocalizeModArchive(
  sourceArchiveOrDir: string,
  stagingDir: string,
  hashDb: HashDatabase
): UnpackStagingResult {
  extractToDir(sourceArchiveOrDir, stagingDir);
  const nestedArchivesUnpacked = sweepNestedArchives(stagingDir);
  const sanitizedWarnings = sanitizeDirectoryTree(stagingDir);

  const candidateDirs = findDirsWithIni(stagingDir, 0);
  if (candidateDirs.length === 0) {
    throw new Error('No valid 3DMigoto .ini configuration file found inside package.');
  }

  // Sort by depth ascending (highest-level valid .ini first)
  candidateDirs.sort((a, b) => a.depth - b.depth);

  // Check if multiple top-level candidate directories belong to DIFFERENT Agents (Multi-Character Pack)
  const localizedByAgent = new Map<string, LocalizedModRoot>();
  const allLocalized: LocalizedModRoot[] = [];

  for (const cand of candidateDirs) {
    // Skip if a parent directory of this candidate is already registered for the SAME agent
    const hashesSet = new Set<string>();
    for (const iniFile of cand.iniFiles) {
      const content = fs.readFileSync(path.join(cand.dirPath, iniFile), 'utf-8');
      const parsed = parseIniContent(content, iniFile);
      parsed.detectedHashes.forEach((h) => hashesSet.add(h));
    }

    const detectedHashes = Array.from(hashesSet);
    const match = matchHashesToAgent(detectedHashes, hashDb);
    const agentId = match.agent ? match.agent.agent_id : 'uncategorized';

    const rawFolderName =
      cand.dirPath === stagingDir
        ? path.basename(sourceArchiveOrDir).replace(/\.(zip|7z|rar)$/i, '')
        : path.basename(cand.dirPath);

    const rootObj: LocalizedModRoot = {
      rootPath: cand.dirPath,
      folderName: rawFolderName,
      iniFiles: cand.iniFiles,
      detectedHashes,
      nestedDepthUnpacked: cand.depth + nestedArchivesUnpacked,
      sanitizedWarnings,
      matchedAgentId: agentId,
    };

    allLocalized.push(rootObj);
    if (!localizedByAgent.has(agentId)) {
      localizedByAgent.set(agentId, rootObj);
    }
  }

  // Many mods split one character into sibling folders (body/, hair/, weapon/, face/...), each
  // with its own .ini. Install the folder that holds all of them, not just the first one.
  const archiveName = path.basename(sourceArchiveOrDir).replace(/\.(zip|7z|rar)$/i, '');
  const recognizedIds = [...new Set(allLocalized.map((r) => r.matchedAgentId).filter((id) => id !== 'uncategorized'))];
  for (const id of recognizedIds) {
    const group = allLocalized.filter((r) => r.matchedAgentId === id);
    if (group.length < 2) continue;
    const ancestor = commonAncestor(group.map((r) => r.rootPath));
    if (!ancestor || path.relative(stagingDir, ancestor).startsWith('..')) continue;
    // Don't swallow another character's folders.
    const others = allLocalized.filter((r) => r.matchedAgentId !== id && r.matchedAgentId !== 'uncategorized');
    if (others.some((o) => isInside(o.rootPath, ancestor))) continue;
    const merged: LocalizedModRoot = {
      ...group[0],
      rootPath: ancestor,
      folderName: path.resolve(ancestor) === path.resolve(stagingDir) ? archiveName : path.basename(ancestor),
      iniFiles: group.flatMap((r) => r.iniFiles.map((f) => path.relative(ancestor, path.join(r.rootPath, f)))),
      detectedHashes: [...new Set(group.flatMap((r) => r.detectedHashes))],
      nestedDepthUnpacked: Math.min(...group.map((r) => r.nestedDepthUnpacked)),
    };
    localizedByAgent.set(id, merged);
    const firstIdx = allLocalized.indexOf(group[0]);
    allLocalized[firstIdx] = merged;
  }

  // Distinct recognized agents (excluding uncategorized if recognized agents exist)
  const recognizedAgentRoots = Array.from(localizedByAgent.values()).filter(
    (r) => r.matchedAgentId !== 'uncategorized'
  );

  const isMultiAgentPack = recognizedAgentRoots.length >= 2;
  const finalRoots = isMultiAgentPack
    ? recognizedAgentRoots
    : [recognizedAgentRoots[0] ?? allLocalized[0]];

  const maxDepth = Math.max(...finalRoots.map((r) => r.nestedDepthUnpacked), 1);

  return {
    stagingDir,
    localizedRoots: finalRoots,
    isMultiAgentPack,
    totalNestedFolders: maxDepth,
    sanitizedWarnings,
  };
}
