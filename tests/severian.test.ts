import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unpackAndLocalizeModArchive } from '../src/core/archiveEngine';
import { matchAgentByGbCategory, matchAgentByHintOrName } from '../src/core/routerEngine';
import { DEFAULT_HASH_DB } from '../src/shared/defaultHashDb';
import { ZZMI_COMPONENTS } from '../src/shared/zzmiComponents';

describe('Severian and Phoenix (new in 3.3, not in ZZMI yet)', () => {
  let tmp: string;
  beforeEach(() => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'severian-'))));
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('recognizes a Severian mod from its hashes', () => {
    const top = path.join(tmp, 'src', 'Beefier Severian');
    fs.mkdirSync(top, { recursive: true });
    fs.writeFileSync(
      path.join(top, 'Severian.ini'),
      '[TextureOverrideSeverianBodyBlend]\nhash = cff0d638\n[TextureOverrideSeverianHairA]\nhash = dfc9cd38\nmatch_first_index = 0\n'
    );
    const res = unpackAndLocalizeModArchive(path.join(tmp, 'src'), path.join(tmp, 'staged'), DEFAULT_HASH_DB);
    expect(res.localizedRoots[0].matchedAgentId).toBe('severian_lowell');
  });

  it('matches their GameBanana categories and names, without mixing Severian up with Seth', () => {
    expect(matchAgentByGbCategory(50548, DEFAULT_HASH_DB)?.agent_id).toBe('severian_lowell');
    expect(matchAgentByGbCategory(50547, DEFAULT_HASH_DB)?.agent_id).toBe('phoenix_reffaella');
    expect(matchAgentByHintOrName('Jin Qiu Severian', DEFAULT_HASH_DB)?.agent_id).toBe('severian_lowell');
    expect(matchAgentByHintOrName('Seth Lowell summer', DEFAULT_HASH_DB)?.agent_id).toBe('seth_lowell');
  });

  it('knows their parts for the Mod Workshop', () => {
    expect(ZZMI_COMPONENTS.severian_lowell.dfc9cd38).toBe('Hair');
    expect(ZZMI_COMPONENTS.severian_lowell.cff0d638).toBe('Body');
    expect(ZZMI_COMPONENTS.phoenix_reffaella['9040e2c4']).toBe('Body');
  });
});
