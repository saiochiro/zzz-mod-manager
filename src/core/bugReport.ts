import AdmZip from 'adm-zip';

/** Who is asking: their home folder and Windows user name are removed from everything in the report. */
export interface ReportUser {
  homeDir: string;
  username: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes the user's home folder and user name from any text, whichever way the path is written
 * (C:\Users\name, C:/Users/name, escaped backslashes in JSON). The rest of the path stays, so
 * folder problems can still be seen: "C:\Users\sai\AppData\..." becomes "%USERPROFILE%\AppData\...".
 */
export function scrubUserText(text: string, user: ReportUser): string {
  let out = text;
  const home = user.homeDir.replace(/[\\/]+$/, '');
  if (home) {
    const variants = new Set([home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\'), home.replace(/\//g, '\\')]);
    for (const v of variants) out = out.replace(new RegExp(escapeRe(v), 'gi'), '%USERPROFILE%');
  }
  if (user.username && user.username.length >= 2) {
    // The name on its own (other drives, OneDrive folders, log lines), but not inside longer words.
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9])${escapeRe(user.username)}(?=$|[^A-Za-z0-9])`, 'gi'), '$1<user>');
  }
  return out;
}

/** The same for any value: strings anywhere in objects and arrays are scrubbed. */
export function scrubUserValue<T>(value: T, user: ReportUser): T {
  if (typeof value === 'string') return scrubUserText(value, user) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => scrubUserValue(v, user)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, scrubUserValue(v, user)])) as T;
  }
  return value;
}

/** Settings that never go in a report, even scrubbed. */
const SECRET_KEYS = /token|secret|password|session|cookie|auth|key$/i;

export interface BugReportInput {
  appVersion: string;
  platform: string;
  config: Record<string, unknown>;
  logs: Array<{ timestamp: string; level: string; source: string; message: string }>;
  mods: Array<{
    title: string;
    author?: string;
    agent_id: string;
    enabled: boolean;
    health_status?: string;
    gamebanana_id?: number | null;
    gamebanana_file_id?: number;
    category_tag?: string;
    install_path: string;
    missing_resources?: string[];
    unsupported_character?: string;
  }>;
  note?: string;
}

/** Builds the bug report: a zip with a short summary, the activity log, settings and the mod list. */
export function buildBugReport(input: BugReportInput, user: ReportUser): Buffer {
  const config = Object.fromEntries(
    Object.entries(input.config).filter(([k]) => !SECRET_KEYS.test(k)).filter(([k]) => k !== 'profiles')
  );
  const mods = input.mods.map((m) => ({
    title: m.title,
    author: m.author,
    character: m.agent_id,
    on: m.enabled,
    health: m.health_status,
    gamebanana_id: m.gamebanana_id ?? null,
    gamebanana_file_id: m.gamebanana_file_id,
    kind: m.category_tag,
    folder: m.install_path,
    missing_files: m.missing_resources?.length ? m.missing_resources : undefined,
    unsupported_character: m.unsupported_character,
  }));
  const summary = [
    `ProxyLaunch ${input.appVersion}`,
    `System: ${input.platform}`,
    `Report made: ${new Date().toISOString()}`,
    `Mods: ${mods.length} (${mods.filter((m) => m.on).length} on, ${mods.filter((m) => m.health === 'broken').length} broken)`,
    '',
    input.note ? `What happened:\n${input.note}` : 'What happened: (not filled in)',
    '',
    'Your Windows user name and home folder were removed from every file in this report.',
    '',
  ].join('\n');
  const log = input.logs
    .slice()
    .reverse()
    .map((l) => `${l.timestamp} [${l.level}] ${l.source}: ${l.message}`)
    .join('\n');

  const zip = new AdmZip();
  const add = (name: string, text: string) => zip.addFile(name, Buffer.from(scrubUserText(text, user), 'utf-8'));
  add('summary.txt', summary);
  add('activity-log.txt', log || '(empty)');
  add('settings.json', JSON.stringify(scrubUserValue(config, user), null, 2));
  add('mods.json', JSON.stringify(scrubUserValue(mods, user), null, 2));
  return zip.toBuffer();
}
