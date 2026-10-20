#!/usr/bin/env node
/**
 * Publish an app update from this PC.
 *
 *   1. asks for the new version (default: next patch, e.g. 2.4.1 -> 2.4.2)
 *   2. asks what changed (goes into RELEASE_NOTES.md = the in-app "What's new")
 *   3. bumps package.json / package-lock.json
 *   4. commits everything and pushes to GitHub (main)
 *
 * GitHub Actions then builds the installer and publishes release vX.Y.Z;
 * installed apps show the update popup a few minutes later.
 *
 * Personal data (ZZMI_Root, ZZZ_Mod_Manager_AppData, node_modules, release/…)
 * is excluded by .gitignore and is never uploaded.
 */
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const fail = (msg) => {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
};

// --- checks -------------------------------------------------------------
try {
  sh('git --version');
} catch {
  fail('Git is not installed. Install it from https://git-scm.com/download/win and run this again.');
}
if (!fs.existsSync('.git')) fail('This folder is not a git repository.');

const remote = (() => {
  try {
    return sh('git remote get-url origin');
  } catch {
    return '';
  }
})();
if (!/github\.com[/:]saiochiro\//i.test(remote)) {
  fail(`The "origin" remote is "${remote || 'missing'}". Expected your GitHub repo (saiochiro/...).`);
}

console.log('\n  Checking GitHub for the latest version…');
try {
  run('git fetch origin main');
} catch {
  fail('Could not reach GitHub. Check your internet connection / GitHub sign-in and try again.');
}

// Line up with GitHub's history without touching any of your files:
// the working folder stays exactly as it is; only git's bookkeeping moves.
run('git reset --mixed origin/main');
// Files that live only on GitHub (the build workflow) are kept, not deleted.
try {
  run('git checkout origin/main -- .github');
} catch {
  /* nothing to restore */
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const remotePkg = JSON.parse(sh('git show origin/main:package.json'));
const current = remotePkg.version;
const [maj, min, pat] = current.split('.').map(Number);
const suggested = `${maj}.${min}.${pat + 1}`;

const changed = sh('git status --porcelain');
if (!changed) {
  console.log('\n  No changes since the last release on GitHub. Nothing to publish.\n');
  process.exit(0);
}
console.log('\n  Changed files:\n' + changed.split('\n').map((l) => '    ' + l).join('\n'));

// --- ask ----------------------------------------------------------------
const rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY) });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => {
  output.write(q);
  const r = await lines.next();
  if (!input.isTTY) output.write('\n');
  return r.done ? '' : r.value;
};
let version = (await ask(`\n  Current version on GitHub is ${current}. New version [${suggested}]: `)).trim() || suggested;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`"${version}" is not a version like 2.4.2`);
const newer = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
if (!newer(version, current)) fail(`${version} must be higher than ${current}, or installed apps won't see it as an update.`);

console.log('\n  What changed? One item per line. Press Enter on an empty line when done.');
const items = [];
for (;;) {
  const line = (await ask('   - ')).trim();
  if (!line) break;
  items.push(line);
}
rl.close();
if (!items.length) items.push('Bug fixes and improvements.');

// --- write --------------------------------------------------------------
pkg.version = version;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
if (fs.existsSync('package-lock.json')) {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
}
const notes =
  `What's new in ${version}\n\n` +
  items.map((i) => `- ${i}`).join('\n') +
  `\n\nRequires XXMI Launcher with ZZMI set up. Questions or bugs? Reach out on Discord: ghxty\n`;
fs.writeFileSync('RELEASE_NOTES.md', notes);

// --- publish ------------------------------------------------------------
run('git add -A');
execFileSync('git', ['commit', '-q', '-m', `Release ${version}`, '-m', items.join('\n')], { stdio: 'inherit' });
try {
  run('git push origin HEAD:main');
} catch {
  fail('Push was rejected. Make sure you are signed in to GitHub (GitHub Desktop or Git Credential Manager) and try again.');
}

console.log(`
  ✔ Version ${version} sent to GitHub.

  GitHub is now building the installer (about 5 to 8 minutes).
  When it finishes, release v${version} appears here:
    https://github.com/saiochiro/zzz-mod-manager/releases
  and everyone with the app installed gets the update popup.
`);
try {
  execSync('start "" "https://github.com/saiochiro/zzz-mod-manager/actions"', { stdio: 'ignore', shell: 'cmd.exe' });
} catch {
  /* not on Windows */
}
