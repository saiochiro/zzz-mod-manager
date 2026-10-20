import AdmZip from 'adm-zip';
import { execFileSync } from 'child_process';
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
 * Extracts an archive (.zip, .7z, .rar) or copies a folder into `stagingDir`.
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
      // Fall through to tar.exe (bsdtar supports RAR5, 7z, Deflate64, LZMA zips, etc.)
    }
  }

  // Fallback for .7z / .rar / .tar / complex .zip using Windows built-in tar.exe (bsdtar supports zip/7z/rar/tar on Windows 11)
  try {
    execFileSync('tar.exe', ['-xf', sourcePath, '-C', targetDir], { stdio: 'ignore' });
  } catch (err) {
    throw new Error(`Archive extraction failed for ${path.basename(sourcePath)}: ${(err as Error).message}`);
  }
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

  // Distinct recognized agents (excluding uncategorized if recognized agents exist)
  const recognizedAgentRoots = Array.from(localizedByAgent.values()).filter(
    (r) => r.matchedAgentId !== 'uncategorized'
  );

  const isMultiAgentPack = recognizedAgentRoots.length >= 2;
  const finalRoots = isMultiAgentPack
    ? recognizedAgentRoots
    : [allLocalized[0]];

  const maxDepth = Math.max(...finalRoots.map((r) => r.nestedDepthUnpacked), 1);

  return {
    stagingDir,
    localizedRoots: finalRoots,
    isMultiAgentPack,
    totalNestedFolders: maxDepth,
    sanitizedWarnings,
  };
}
