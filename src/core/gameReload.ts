import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Reloading mods in a running game (Windows only).
 *
 * XXMI's hook reloads mods when F10 is pressed, but it reads the real keyboard and only while the
 * game window is in front. A key message posted to the window does nothing, and pressing F10 for
 * the user while they're in ProxyLaunch would go to ProxyLaunch. So a small helper waits until
 * the game is in front again (the user switches back), then presses F10 once.
 *
 * Windows only lets a program press keys in a game running as administrator if it runs as
 * administrator too. When the game does, the helper is started with Windows' "allow this app"
 * prompt, once per game session. If that's declined, ProxyLaunch doesn't ask again until the game
 * is restarted, and changes show after the next F10 press or game start.
 */

const GAME = 'ZenlessZoneZero';

/** The helper: presses F10 the next time the game is in front, for each request, while the game runs. */
export function reloadHelperScript(): string {
  return [
    'param([string]$Flag)',
    "$ErrorActionPreference = 'SilentlyContinue'",
    "Add-Type -TypeDefinition @'",
    'using System; using System.Runtime.InteropServices;',
    'public class PlKeys {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);',
    '  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);',
    '}',
    "'@",
    '$alive = "$Flag.alive"',
    'while ($true) {',
    `  $game = Get-Process -Name '${GAME}' | Select-Object -First 1`,
    '  if (-not $game) { break }',
    '  Set-Content -LiteralPath $alive -Value (Get-Date).ToString("o")',
    '  if (Test-Path -LiteralPath $Flag) {',
    '    $fgPid = 0',
    '    [void][PlKeys]::GetWindowThreadProcessId([PlKeys]::GetForegroundWindow(), [ref]$fgPid)',
    // F10 must be pressed on its own: wait for Alt (from Alt+Tab), Ctrl, Shift and Win to be let go.
    '    $mods = @(0x10, 0x11, 0x12, 0x5B, 0x5C) | Where-Object { ([PlKeys]::GetAsyncKeyState($_) -band 0x8000) -ne 0 }',
    '    if ($fgPid -eq $game.Id -and -not $mods) {',
    '      Start-Sleep -Milliseconds 500',
    '      Remove-Item -LiteralPath $Flag -Force',
    '      [PlKeys]::keybd_event(0x79, 0x44, 0, [UIntPtr]::Zero)',
    '      Start-Sleep -Milliseconds 60',
    '      [PlKeys]::keybd_event(0x79, 0x44, 2, [UIntPtr]::Zero)',
    '    }',
    '  }',
    '  Start-Sleep -Milliseconds 250',
    '}',
    'Remove-Item -LiteralPath $alive -Force',
  ].join('\r\n');
}

function powershell(command: string, timeout = 8000): Promise<string> {
  return new Promise((resolve) =>
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout }, (_err, stdout) =>
      resolve(String(stdout || '').trim())
    )
  );
}

/** The game's process id and whether it runs as administrator (ProxyLaunch can't open it then); null when it isn't running. */
async function gameProcess(): Promise<{ pid: number; elevated: boolean } | null> {
  const out = await powershell(
    `$p = Get-Process -Name '${GAME}' -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
      `if ($p) { try { $null = $p.Handle; "$($p.Id) normal" } catch { "$($p.Id) elevated" } }`
  );
  const m = out.match(/(\d+)\s+(normal|elevated)/);
  return m ? { pid: Number(m[1]), elevated: m[2] === 'elevated' } : null;
}

export class GameReloader {
  /** Game session (process id) whose admin prompt was declined: not asked again for it. */
  private declinedFor = 0;
  private starting: Promise<void> | null = null;

  constructor(private readonly workDir: string, private readonly log: (msg: string) => void = () => {}) {}

  private get flag(): string {
    return path.join(this.workDir, 'reload-in-game.request');
  }

  private helperAlive(): boolean {
    try {
      return Date.now() - fs.statSync(`${this.flag}.alive`).mtimeMs < 3000;
    } catch {
      return false;
    }
  }

  /**
   * Asks for a reload the next time the game is in front. Returns whether the game is running
   * (false: nothing to reload, the game loads the current mods when it starts).
   */
  async request(): Promise<{ gameRunning: boolean; queued: boolean }> {
    if (process.platform !== 'win32') return { gameRunning: false, queued: false };
    const game = await gameProcess();
    if (!game) return { gameRunning: false, queued: false };
    fs.mkdirSync(this.workDir, { recursive: true });
    fs.writeFileSync(this.flag, new Date().toISOString(), 'utf-8');
    if (!this.helperAlive()) {
      this.starting ??= this.startHelper(game).finally(() => (this.starting = null));
      await this.starting;
    }
    return { gameRunning: true, queued: this.helperAlive() || !(game.elevated && this.declinedFor === game.pid) };
  }

  private async startHelper(game: { pid: number; elevated: boolean }): Promise<void> {
    const script = path.join(this.workDir, 'reload-in-game.ps1');
    fs.writeFileSync(script, reloadHelperScript(), 'utf-8');
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, '-Flag', this.flag];
    if (!game.elevated) {
      spawn('powershell', args, { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
      this.log('In-game reload helper started.');
      return;
    }
    if (this.declinedFor === game.pid) return;
    // Windows asks "Do you want to allow this app to make changes" once for this game session.
    const quoted = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
    const out = await powershell(
      `try { Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList ${quoted}; 'ok' } catch { 'declined' }`,
      120000
    );
    if (out.includes('ok')) this.log('In-game reload helper started (as administrator, like the game).');
    else {
      this.declinedFor = game.pid;
      this.log('In-game reload helper was not allowed; changes show after pressing F10 in game.');
    }
  }
}
