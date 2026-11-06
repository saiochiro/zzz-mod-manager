import { afterEach, describe, expect, it, vi } from 'vitest';
import { gbCardImageUrl, refreshRecentLabels } from '../src/core/gamebananaService';
import { addRecentNsfwLabels, getSfwCatalog, setNsfwVerdictsForTest } from '../src/core/nsfwReview';

afterEach(() => vi.unstubAllGlobals());

const card = (id: number, name = `Mod ${id}`) => ({ _idRow: id, _sName: name, _aPreviewMedia: { _aImages: [] } });

describe('SFW only stays current between label list updates', () => {
  it('adds new safe mods, and a mod re-rated NSFW leaves the SFW list', () => {
    setNsfwVerdictsForTest({ version: 1, generatedAt: '2026-11-01T00:00:00Z', mods: { '1': { l: 's', f: 0, m: 100, k: card(1) }, '2': { l: 's', f: 0, m: 100, k: card(2) } } } as never);
    expect(getSfwCatalog().map((r) => r._idRow).sort()).toEqual([1, 2]);
    addRecentNsfwLabels({ '3': { l: 's', f: 0, m: 300, k: card(3) }, '2': { l: 'n', f: 1, m: 200 } });
    expect(getSfwCatalog().map((r) => r._idRow).sort()).toEqual([1, 3]);
  });

  it('labels GameBanana\'s newest mods from the listing and their pages', async () => {
    setNsfwVerdictsForTest({ version: 1, generatedAt: '2026-11-01T00:00:00Z', mods: { '10': { l: 's', f: 0, m: 50, k: card(10) } } } as never);
    const listing = {
      _aRecords: [
        { _idRow: 10, _sName: 'Known', _tsDateModified: 50 }, // unchanged: not looked up again
        { _idRow: 11, _sName: 'New safe outfit', _tsDateModified: 900, _aPreviewMedia: { _aImages: [] } },
        { _idRow: 12, _sName: 'Spicy', _tsDateModified: 900, _sInitialVisibility: 'hide', _bIsNsfw: true },
        { _idRow: 13, _sName: 'Rated on its page', _tsDateModified: 900 },
      ],
    };
    const pages: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const u = String(url);
      if (u.includes('/Mod/Index')) return new Response(JSON.stringify(u.includes('_nPage=1') ? listing : { _aRecords: [] }));
      pages.push(u);
      const id = Number(u.match(/Mod\/(\d+)\/ProfilePage/)![1]);
      const ratings = id === 13 ? { _aContentRatings: { nu: 'Nudity' } } : {};
      return new Response(JSON.stringify({ _idRow: id, _sName: `Mod ${id}`, ...ratings }));
    });
    await refreshRecentLabels();
    const ids = getSfwCatalog().map((r) => r._idRow).sort();
    expect(ids).toContain(10);
    expect(ids).toContain(11);
    expect(ids).not.toContain(13);
    expect(pages.some((u) => u.includes('/Mod/10/'))).toBe(false);
  });
});

describe('Browse card pictures', () => {
  it('uses GameBanana\'s card-sized picture, leaving other links alone', () => {
    expect(gbCardImageUrl('https://images.gamebanana.com/img/ss/mods/abc.jpg')).toBe('https://images.gamebanana.com/img/ss/mods/530-90_abc.jpg');
    expect(gbCardImageUrl('https://images.gamebanana.com/img/ss/mods/530-90_abc.jpg')).toBe('https://images.gamebanana.com/img/ss/mods/530-90_abc.jpg');
    expect(gbCardImageUrl('data:image/svg+xml;utf8,x')).toBe('data:image/svg+xml;utf8,x');
  });
});

describe('Featured in SFW only matches what the other views show', () => {
  it('leads with GameBanana\'s current mods minus NSFW ones, labels the rest, then the list', async () => {
    vi.resetModules();
    const gb = await import('../src/core/gamebananaService');
    const review = await import('../src/core/nsfwReview');
    review.setNsfwVerdictsForTest({
      version: 1,
      generatedAt: '2026-11-01T00:00:00Z',
      mods: {
        '20': { l: 's', f: 0, m: 10, k: card(20, 'Old safe favourite') },
        '21': { l: 's', f: 0, m: 500, k: card(21, 'Current safe') },
        '22': { l: 'n', f: 1, m: 500 }, // the listing looks safe; its page is rated NSFW
      },
    } as never);
    const live = {
      _aRecords: [
        { _idRow: 23, _sName: 'Brand new, not labeled yet', _tsDateModified: 900 },
        { _idRow: 22, _sName: 'Looks safe in the listing', _tsDateModified: 500 },
        { _idRow: 21, _sName: 'Current safe', _tsDateModified: 500 },
      ],
    };
    vi.stubGlobal('fetch', async (url: string) => {
      const u = String(url);
      if (u.includes('/Subfeed') && u.includes('_nPage=1&')) return new Response(JSON.stringify(live));
      if (u.includes('/Subfeed')) return new Response(JSON.stringify({ _aRecords: [] }));
      const id = u.match(/Mod\/(\d+)\/ProfilePage/)?.[1];
      if (id) return new Response(JSON.stringify({ _idRow: Number(id), _sName: `Mod ${id}` }));
      return new Response('{}', { status: 404 });
    });

    // Show everything: the NSFW label from the list wins over the listing.
    const all = await gb.fetchLiveGameBananaFeed({ page: 1, perPage: 24, sort: 'featured' });
    expect(all.find((m) => m.id === 22)?.is_nsfw).toBe(true);
    expect(all.find((m) => m.id === 21)?.is_nsfw).toBe(false);

    // The unlabeled new mod gets its page checked in the background, then shows in SFW too.
    await vi.waitFor(() => expect(review.knownNsfwLabel(23)?.l).toBe('s'));
    const sfw = await gb.fetchLiveGameBananaFeed({ page: 1, perPage: 24, sort: 'featured', hideNsfw: true });
    expect(sfw.map((m) => m.id)).toEqual([23, 21, 20]);
  });
});
