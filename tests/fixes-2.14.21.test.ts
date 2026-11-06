import { describe, expect, it } from 'vitest';
import { filesInUse, parseIniContent } from '../src/core/iniParser';
import { reloadHelperScript } from '../src/core/gameReload';

const ini = `
[TextureOverrideBody]
hash = 1234abcd
ib = ResourceBodyIB
Resource\\ZZMI\\Diffuse = ref ResourceBodyDiffuse

[ResourceBodyIB]
filename = Body.ib

[ResourceBodyDiffuse]
filename = BodyDiffuse.dds

; Declared but never used by anything: the game never loads it.
[ResourceLegsDiffuse]
filename = LegsDiffuse.dds

[ResourceMenuHover]
filename = Resources/MenuHover.png
`;

describe('missing files only count when the game would load them', () => {
  it('skips [Resource...] entries nothing uses', () => {
    const doc = parseIniContent(ini, 'Mod.ini');
    expect(doc.referencedFiles).toHaveLength(4);
    expect(filesInUse([doc]).map((f) => f.file)).toEqual(['Body.ib', 'BodyDiffuse.dds']);
  });

  it('counts a resource used from another .ini of the same mod', () => {
    const main = parseIniContent(ini, 'Mod.ini');
    const extra = parseIniContent('[TextureOverrideLegs]\nhash = 99887766\nps-t0 = ResourceLegsDiffuse\n', 'Legs.ini');
    expect(filesInUse([main, extra]).map((f) => f.file)).toContain('LegsDiffuse.dds');
  });

  it('a commented-out use does not count', () => {
    const doc = parseIniContent(`${ini}\n[TextureOverrideHover]\n; ps-t0 = ResourceMenuHover\n`, 'Mod.ini');
    expect(filesInUse([doc]).map((f) => f.file)).not.toContain('Resources/MenuHover.png');
  });
});

describe('reloading in game', () => {
  it('waits for the game to be in front and no modifier keys, then presses F10 once per request', () => {
    const s = reloadHelperScript();
    expect(s).toContain('GetForegroundWindow');
    expect(s).toContain('$fgPid -eq $game.Id');
    expect(s).toContain('GetAsyncKeyState');
    expect(s).toContain('keybd_event(0x79');
    expect(s.indexOf('Remove-Item -LiteralPath $Flag')).toBeLessThan(s.indexOf('keybd_event(0x79, 0x44, 0'));
  });
});
