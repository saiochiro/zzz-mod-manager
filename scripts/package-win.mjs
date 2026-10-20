import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const rootDir = process.cwd();
const releaseRoot = path.join(rootDir, 'release');
const appFolderName = 'ZZZ_Mod_Manager_v2.4.0_Win64';
const outAppDir = path.join(releaseRoot, appFolderName);
const outZipPath = path.join(releaseRoot, `${appFolderName}.zip`);

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

console.log('1. Preparing release directory...');
if (fs.existsSync(outAppDir)) {
  fs.rmSync(outAppDir, { recursive: true, force: true });
}
if (fs.existsSync(outZipPath)) {
  fs.unlinkSync(outZipPath);
}
fs.mkdirSync(outAppDir, { recursive: true });

console.log('2. Copying Electron Windows x64 runtime...');
const electronDist = path.join(rootDir, 'node_modules', 'electron', 'dist');
copyRecursive(electronDist, outAppDir);

// Rename electron.exe -> ZZZ Mod Manager.exe
const srcExe = path.join(outAppDir, 'electron.exe');
const dstExe = path.join(outAppDir, 'ZZZ Mod Manager.exe');
if (fs.existsSync(srcExe)) {
  fs.renameSync(srcExe, dstExe);
}

// Remove default_app.asar so Electron boots into resources/app in packaged mode
const defaultAsar = path.join(outAppDir, 'resources', 'default_app.asar');
if (fs.existsSync(defaultAsar)) {
  fs.unlinkSync(defaultAsar);
}

console.log('3. Bundling application code into resources/app...');
const resourcesAppDir = path.join(outAppDir, 'resources', 'app');
fs.mkdirSync(resourcesAppDir, { recursive: true });

// Copy built frontend (dist) and backend (dist-electron)
copyRecursive(path.join(rootDir, 'dist'), path.join(resourcesAppDir, 'dist'));
copyRecursive(path.join(rootDir, 'dist-electron'), path.join(resourcesAppDir, 'dist-electron'));

// App icon (used for the window / taskbar before the theme icon loads)
const iconSrc = path.join(rootDir, 'assets', 'icon', 'icon.png');
if (fs.existsSync(iconSrc)) {
  fs.mkdirSync(path.join(resourcesAppDir, 'assets', 'icon'), { recursive: true });
  fs.copyFileSync(iconSrc, path.join(resourcesAppDir, 'assets', 'icon', 'icon.png'));
}

// Copy runtime dependency (adm-zip)
copyRecursive(
  path.join(rootDir, 'node_modules', 'adm-zip'),
  path.join(resourcesAppDir, 'node_modules', 'adm-zip')
);

// Write clean production package.json
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
const prodPkg = {
  name: pkg.name,
  productName: 'ZZZ Mod Manager',
  version: pkg.version,
  description: pkg.description,
  main: 'dist-electron/electron/main.js',
  dependencies: {
    'adm-zip': pkg.dependencies['adm-zip'],
  },
};
fs.writeFileSync(
  path.join(resourcesAppDir, 'package.json'),
  JSON.stringify(prodPkg, null, 2),
  'utf-8'
);

// Add a friendly README_HOW_TO_USE.txt in the root of the release folder
const readmeText = `===========================================================================
ZZZ MOD MANAGER (FAIRY OS v2.4.0) — STANDALONE WINDOWS RELEASE
===========================================================================

HOW TO RUN:
1. Extract this entire ZIP folder anywhere on your PC.
2. Double-click "ZZZ Mod Manager.exe" to launch!

REQUIREMENTS FOR MODDING IN-GAME:
- Have Zenless Zone Zero installed.
- Have XXMI Launcher installed (with the ZZMI package enabled).
- ZZZ Mod Manager automatically detects your XXMI Launcher & ZenlessZoneZero.exe
  paths, syncs all enabled skins into XXMI Launcher's ZZMI/Mods folder, and
  starts the game with mods active when you click "Launch Game"!
===========================================================================
`;
fs.writeFileSync(path.join(outAppDir, 'README_HOW_TO_USE.txt'), readmeText, 'utf-8');

console.log('4. Creating distributable ZIP archive:', outZipPath);
execFileSync('tar.exe', ['-a', '-cf', outZipPath, '-C', releaseRoot, appFolderName], {
  stdio: 'inherit',
});

const zipSizeMb = (fs.statSync(outZipPath).size / (1024 * 1024)).toFixed(2);
console.log(`Built ${outZipPath} (${zipSizeMb} MB)`);

// Also copy to Desktop for easy access
const desktopDir = path.join(os.homedir(), 'Desktop');
if (fs.existsSync(desktopDir)) {
  const desktopZip = path.join(desktopDir, `${appFolderName}.zip`);
  fs.copyFileSync(outZipPath, desktopZip);
  console.log(`Copied to Desktop: ${desktopZip}`);
}
