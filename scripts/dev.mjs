import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const tscBin = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const electronCli = path.join(rootDir, 'node_modules', 'electron', 'cli.js');

console.log('[FAIRY OS] Compiling Electron Main & Preload...');
try {
  execSync(`node "${tscBin}" -p tsconfig.electron.json`, { stdio: 'inherit' });
} catch {
  console.warn('[FAIRY OS] Backend compile reported problems (see above) - continuing.');
}

const distIndex = path.join(rootDir, 'dist', 'index.html');
// Always rebuild the UI so the window never shows a stale bundle.
console.log('[FAIRY OS] Building UI bundle...');
execSync(`node "${viteBin}" build`, { stdio: 'inherit' });

console.log('[FAIRY OS] Launching ZZZ Mod Manager Desktop Window...');
const electronProc = spawn('node', [electronCli, '.'], {
  stdio: 'inherit',
});

electronProc.on('close', (code) => {
  process.exit(code ?? 0);
});
