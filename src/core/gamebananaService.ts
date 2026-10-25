import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { GameBananaModItem } from '../shared/types';
import { DEFAULT_HASH_DB } from '../shared/defaultHashDb';
import { matchAgentByGbCategory, matchAgentByHintOrName } from './routerEngine';

import { makeModCoverSvg } from '../shared/svgHelpers';
export { makeModCoverSvg };

export const CURATED_GAMEBANANA_MODS: GameBananaModItem[] = [
  {
    id: 528194,
    title: 'Crimson Vampire Shark Ellen',
    author: 'ProxyModder',
    category: 'Skins // Ellen Joe',
    agent_hint: 'Ellen Joe',
    likes: 4210,
    downloads: 58200,
    views: 134000,
    updated_at: '2026-10-15',
    thumbnail_url: makeModCoverSvg('VAMPIRE SHARK ELLEN', 'BAT TAIL + GOTHIC HOODIE + SCISSORS', '#E11D48', '#FB7185', 'HALLOWEEN', 'vampire'),
    profile_url: 'https://gamebanana.com/mods/528194',
    download_url: 'zzzmgr://install/528194/Vampire_Shark_Ellen.zip',
    file_name: 'Vampire_Shark_Ellen.zip',
    file_size: 26850000,
    md5_checksum: '8f14e45fceea167a5a36dedd4bea2543',
    description: 'Special Chisa/Halloween vampire attire for Ellen Joe featuring crimson velvet hoodie, bat wing accents on scissors, and customizable keybinds.',
    preset_scenario: 'clean_ellen',
  },
  {
    id: 531088,
    title: 'Blood Moon Ceremonial Haori Miyabi',
    author: 'Section6Artisan',
    category: 'Skins // Hoshimi Miyabi',
    agent_hint: 'Hoshimi Miyabi',
    likes: 3890,
    downloads: 41200,
    views: 98500,
    updated_at: '2026-10-14',
    thumbnail_url: makeModCoverSvg('BLOOD MOON MIYABI', 'CEREMONIAL HAORI + KATANA GLOW', '#881337', '#FB7185', 'CRIMSON FIX', 'fox'),
    profile_url: 'https://gamebanana.com/mods/531088',
    download_url: 'zzzmgr://install/531088/Blood_Moon_Miyabi.zip',
    file_name: 'Blood_Moon_Miyabi.zip',
    file_size: 21400000,
    md5_checksum: 'c4ca4238a0b923820dcc509a6f75849b',
    description: 'Dark crimson Section 6 ceremonial haori with fox spirit mask toggle and glowing edge katana blade.',
    preset_scenario: 'broken_miyabi',
  },
  {
    id: 540219,
    title: 'Midnight Velvet Trench Jane Doe',
    author: 'RatQueenFX',
    category: 'Skins // Jane Doe',
    agent_hint: 'Jane Doe',
    likes: 5120,
    downloads: 82400,
    views: 210000,
    updated_at: '2026-10-16',
    thumbnail_url: makeModCoverSvg('VELVET TRENCH JANE', 'NOIR COAT + SUNGLASSES + STINGER', '#E11D48', '#FBBF24', 'POPULAR', 'rat'),
    profile_url: 'https://gamebanana.com/mods/540219',
    download_url: 'zzzmgr://install/540219/Velvet_Trench_JaneDoe.zip',
    file_name: 'Velvet_Trench_JaneDoe.zip',
    file_size: 31200000,
    md5_checksum: 'e4da3b7fbbce2345d7772b0674a318d5',
    description: 'Gothic detective velvet trench coat with dark sunglasses toggle and stinger dagger effects.',
    preset_scenario: 'jane_cyber',
  },
  {
    id: 539412,
    title: 'Gothic Gala Duo (Ellen + Lycaon)',
    author: 'NewEriduTailor',
    category: 'Multi-Agent // VHC',
    agent_hint: 'Ellen Joe + Von Lycaon',
    likes: 4680,
    downloads: 71200,
    views: 162000,
    updated_at: '2026-10-15',
    thumbnail_url: makeModCoverSvg('GOTHIC GALA DUO', 'VICTORIA HOUSEKEEPING CO. PACK', '#881337', '#FB7185', 'DUO PACK', 'vampire'),
    profile_url: 'https://gamebanana.com/mods/539412',
    download_url: 'zzzmgr://install/539412/Gothic_Gala_Duo.zip',
    file_name: 'Gothic_Gala_Duo.zip',
    file_size: 48900000,
    md5_checksum: 'a87ff679a2f3e71d9181a67b7542122c',
    description: 'Matching midnight Victorian gothic banquet outfits for Ellen Joe and Von Lycaon. Auto-routes cleanly.',
    preset_scenario: 'multi_pack',
  },
  {
    id: 542990,
    title: 'Infernal Succubus Burnice White',
    author: 'CalydonGarage',
    category: 'Skins // Burnice White',
    agent_hint: 'Burnice White',
    likes: 3650,
    downloads: 47900,
    views: 105000,
    updated_at: '2026-10-14',
    thumbnail_url: makeModCoverSvg('INFERNAL BURNICE', 'DEVIL HORNS + FLAME TANK + LEATHER', '#EA580C', '#E11D48', 'HALLOWEEN', 'fire'),
    profile_url: 'https://gamebanana.com/mods/542990',
    download_url: 'zzzmgr://install/542990/Infernal_Burnice.zip',
    file_name: 'Infernal_Burnice.zip',
    file_size: 28400000,
    md5_checksum: '8f8e291904a129c019283a9102f8b120',
    description: 'Halloween succubus outfit with flame-thrower skull decals, aviator horns, and custom flame effects.',
    preset_scenario: 'burnice_biker',
  },
  {
    id: 541805,
    title: 'Cyber Assassin Zhu Yuan (Ruby Visor)',
    author: 'PubSecArmory',
    category: 'Skins // Zhu Yuan',
    agent_hint: 'Zhu Yuan',
    likes: 2790,
    downloads: 36200,
    views: 79000,
    updated_at: '2026-10-13',
    thumbnail_url: makeModCoverSvg('ASSASSIN ZHU YUAN', 'RUBY HOLO-VISOR + TACTICAL RIG', '#A855F7', '#E11D48', 'SPEC-OPS', 'blade'),
    profile_url: 'https://gamebanana.com/mods/541805',
    download_url: 'zzzmgr://install/541805/Cyber_ZhuYuan.zip',
    file_name: 'Cyber_ZhuYuan.zip',
    file_size: 24100000,
    md5_checksum: '1679091c5a880faf6fb5e6087eb1b2dc',
    description: 'Black Ops night strike gear for Captain Zhu Yuan with toggleable ruby holographic combat visor.',
    preset_scenario: 'zhuyuan_tactical',
  },
  {
    id: 543500,
    title: 'Chisa Velvet CRT Reshade & UI Hider',
    author: 'PhaethonSys',
    category: 'UI & Shaders // Global',
    agent_hint: 'UI / Shaders',
    likes: 2420,
    downloads: 48900,
    views: 115000,
    updated_at: '2026-10-12',
    thumbnail_url: makeModCoverSvg('CHISA VELVET HUD', 'WARM CRIMSON AMBIENCE + NO-UID', '#E11D48', '#FB7185', 'SHADER', 'stars'),
    profile_url: 'https://gamebanana.com/mods/543500',
    download_url: 'zzzmgr://install/543500/Chisa_Velvet_HUD.zip',
    file_name: 'Chisa_Velvet_HUD.zip',
    file_size: 5120000,
    md5_checksum: '99a8120c49182a0192837465a1b2c3d4',
    description: 'Global ShaderOverride mod that gives New Eridu a gorgeous dark velvet / crimson film tone and hides the bottom-right UID.',
    preset_scenario: 'ui_hud',
  },
];

export const ZZZ_GAMEBANANA_GAME_ID = 19567;

/**
 * Upgrades any low-res GameBanana thumbnail URL (100-90_ or 220-90_) to the full-resolution image URL.
 */
export function upgradeGameBananaImageUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('images.gamebanana.com/img/')) {
    return url.replace(/\/(100|220)-90_([^/]+)$/i, '/$2');
  }
  return url;
}

function buildGbImageUrl(img: any): string {
  if (!img || !img._sBaseUrl) return '';
  const baseUrl = String(img._sBaseUrl).replace(/\/+$/, '');
  const file = String(img._sFile || img._sFile800 || img._sFile530 || '').replace(/^\/+/, '');
  return file ? upgradeGameBananaImageUrl(`${baseUrl}/${file}`) : '';
}

/**
 * Resolves the primary high-resolution preview URL from a GameBanana mod record
 */
export function getModPreviewUrl(mod: any): string {
  const images = mod?._aPreviewMedia?._aImages;
  if (Array.isArray(images)) {
    for (const img of images) {
      const url = buildGbImageUrl(img);
      if (url) return url;
    }
  }
  if (typeof mod?._sImageUrl === 'string' && mod._sImageUrl.startsWith('http')) {
    return upgradeGameBananaImageUrl(mod._sImageUrl);
  }
  if (typeof mod?._sIconUrl === 'string' && mod._sIconUrl.startsWith('http')) {
    return upgradeGameBananaImageUrl(mod._sIconUrl);
  }
  return '';
}

/**
 * Extracts all high-resolution preview images for gallery / carousel display
 */
export function getAllModPreviewUrls(mod: any): string[] {
  const images = mod?._aPreviewMedia?._aImages || [];
  if (!Array.isArray(images)) return [];
  return images.map((img: any) => buildGbImageUrl(img)).filter(Boolean);
}

import { applyNsfwReview, getSfwCatalog, nsfwVerdictsReady } from './nsfwReview';

/** Applies the pre-scanned labels, then drops NSFW items if asked. */
function finalizeNsfw(items: GameBananaModItem[], hideNsfw: boolean): GameBananaModItem[] {
  const out = items.map((m) => applyNsfwReview(m, `gb:${m.id}`));
  return hideNsfw ? out.filter((m) => !m.is_nsfw) : out;
}

export { isModRecordNsfw, NSFW_KEYWORD_REGEX } from '../shared/nsfw';
import { isModRecordNsfw } from '../shared/nsfw';

export function classifyModCategoryTag(rawCategory: string, title: string): 'Skins' | 'Weapons' | 'UI' | 'Audio' {
  const combined = `${rawCategory} ${title}`.toLowerCase();
  if (/ui|hud|shader|reshade|icon|menu|portrait|wallpaper/i.test(combined)) return 'UI';
  if (/weapon|w-engine|sword|katana|blade|gun|rifle|scissors/i.test(combined)) return 'Weapons';
  if (/audio|voice|sound|music|bgm|sfx/i.test(combined)) return 'Audio';
  return 'Skins';
}

export interface GameBananaFeedOptions {
  page?: number;
  perPage?: number;
  sort?: 'featured' | 'default' | 'new' | 'downloads' | 'likes' | 'updated' | 'alphabetical';
  searchQuery?: string;
  categoryFilter?: 'all' | 'skins' | 'ui' | 'weapons' | 'audio';
  characterSubcatId?: number;
  submitterId?: number;
  authorName?: string;
  hideNsfw?: boolean;
}

/** One GameBanana record (Index / Subfeed / pre-scanned card) as a Browse item. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function recordToFeedItem(rec: any, idx: number, options: GameBananaFeedOptions): GameBananaModItem {
    const modId = Number(rec._idRow);
    const title = rec._sName || `Mod #${modId}`;
    const author = rec._aSubmitter?._sName || 'GameBanana Author';
    const submitterId = rec._aSubmitter?._idRow ? Number(rec._aSubmitter._idRow) : undefined;
    const authorAvatarUrl =
      rec._aSubmitter?._sHdAvatarUrl || rec._aSubmitter?._sAvatarUrl || undefined;
    const authorProfileUrl =
      rec._aSubmitter?._sProfileUrl ||
      (submitterId ? `https://gamebanana.com/members/${submitterId}` : undefined);
    const catId =
      rec._aSubCategory?._idRow ||
      rec._aCategory?._idRow ||
      (options.characterSubcatId ? options.characterSubcatId : undefined);
    const subCat =
      (rec._aSubCategory?._sName && !rec._aSubCategory._sName.includes('Character Skins')
        ? rec._aSubCategory._sName
        : null) ||
      (rec._aCategory?._sName && !rec._aCategory._sName.includes('Character Skins')
        ? rec._aCategory._sName
        : null) ||
      rec._aRootCategory?._sName ||
      'Skins';
    const primaryThumb = getModPreviewUrl(rec);
    const allThumbnails = getAllModPreviewUrls(rec);
    const nsfwFlag = isModRecordNsfw(rec);
    const catTag = classifyModCategoryTag(subCat, title);

    const thumbUrl =
      primaryThumb ||
      makeModCoverSvg(
        title.slice(0, 24),
        `BY ${author.toUpperCase()}`,
        '#e6193c',
        '#ff3355',
        subCat.slice(0, 14),
        'vampire'
      );

    return {
      id: modId,
      title,
      author,
      submitter_id: submitterId,
      author_avatar_url: authorAvatarUrl,
      author_profile_url: authorProfileUrl,
      category: subCat,
      category_id: catId,
      category_tag: catTag,
      agent_hint: subCat,
      likes: rec._nLikeCount || 0,
      downloads: rec._nDownloadCount || (rec._nViewCount ? Math.floor(rec._nViewCount * 0.4) : 180),
      views: rec._nViewCount || 0,
      updated_at: new Date(
        (rec._tsDateModified || rec._tsDateAdded || Date.now() / 1000) * 1000
      )
        .toISOString()
        .slice(0, 10),
      thumbnail_url: thumbUrl,
      preview_images: allThumbnails.length > 0 ? allThumbnails : [thumbUrl],
      profile_url: rec._sProfileUrl || `https://gamebanana.com/mods/${modId}`,
      download_url: `https://gamebanana.com/mods/${modId}`,
      file_name: `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`,
      file_size: 24500000,
      md5_checksum: crypto.randomBytes(16).toString('hex'),
      description:
        rec._sDescription ||
        (rec._sInitialVisibility && rec._sInitialVisibility !== 'show'
          ? `Content Visibility: ${rec._sInitialVisibility}`
          : `Live Zenless Zone Zero ${catTag.toLowerCase()} mod from GameBanana by ${author}.`),
      is_live_api: true,
      is_nsfw: nsfwFlag,
      nsfw_reason: nsfwFlag ? 'Flagged by Layer 1 (GameBanana API Content Rating)' : undefined,
      is_featured: idx < 6 && !nsfwFlag,
      content_rating: rec._sContentRating || (nsfwFlag ? 'NSFW' : 'Everyone'),
    };
}

/** The SFW view of Browse from the pre-scanned catalog. Null when there's no catalog yet. */
function sfwFeedFromCatalog(
  options: GameBananaFeedOptions,
  page: number,
  perPage: number,
  sort: string,
  searchQuery: string,
  catFilter: string
): GameBananaModItem[] | null {
  const catalog = getSfwCatalog();
  if (catalog.length === 0) return null;
  const q = searchQuery.toLowerCase();
  const author = (options.authorName || '').toLowerCase();
  const now = Date.now() / 1000;
  const items = catalog
    .filter((rec) => {
      if (options.characterSubcatId) {
        const ids = [rec._aCategory?._idRow, rec._aSubCategory?._idRow].map(Number);
        if (!ids.includes(Number(options.characterSubcatId))) return false;
      }
      if (options.submitterId && Number(rec._aSubmitter?._idRow) !== Number(options.submitterId)) return false;
      if (author && String(rec._aSubmitter?._sName || '').toLowerCase() !== author) return false;
      return true;
    })
    .map((rec, i) => recordToFeedItem(rec, i, options))
    .filter((m) => {
      if (catFilter !== 'all' && (m.category_tag || 'Skins').toLowerCase() !== catFilter) return false;
      if (q && !`${m.title} ${m.author} ${m.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  const added = new Map(catalog.map((r) => [Number(r._idRow), Number(r._tsDateAdded || 0)]));
  const modified = new Map(catalog.map((r) => [Number(r._idRow), Number(r._tsDateModified || r._tsDateAdded || 0)]));
  // "Featured": well-liked mods, favoring recent ones (likes per week of age, softened).
  const trend = (m: GameBananaModItem) => (m.likes + 1) / Math.pow((now - (added.get(m.id) || now)) / 604800 + 2, 0.8);
  const by: Record<string, (a: GameBananaModItem, b: GameBananaModItem) => number> = {
    likes: (a, b) => b.likes - a.likes,
    downloads: (a, b) => b.downloads - a.downloads,
    updated: (a, b) => (modified.get(b.id) || 0) - (modified.get(a.id) || 0),
    new: (a, b) => (added.get(b.id) || 0) - (added.get(a.id) || 0),
    alphabetical: (a, b) => a.title.localeCompare(b.title),
  };
  items.sort(by[sort] || ((a, b) => trend(b) - trend(a)));
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage).map((m, i) => ({ ...m, is_featured: page === 1 && i < 6 }));
}

const feedResponseCache = new Map<string, { timestamp: number; items: GameBananaModItem[] }>();
const inflightFeedRequests = new Map<string, Promise<GameBananaModItem[]>>();
const FEED_CACHE_TTL_MS = 5 * 60 * 1000;
let initialPopularPrefetchTriggered = false;

/**
 * Fetches the live GameBanana feed strictly scoped to Zenless Zone Zero (Game ID 19567)
 * using Game/19567/Subfeed and Mod/Index with _aFilters[Generic_Game]=19567,
 * parallelizing multi-page fetches via Promise.all so "Most Popular" and NSFW-filtered
 * views always preload 24+ mods immediately instead of 3.
 */
export async function fetchLiveGameBananaFeed(
  optionsOrPage: GameBananaFeedOptions | number = 1,
  perPageArg = 24
): Promise<GameBananaModItem[]> {
  const options: GameBananaFeedOptions =
    typeof optionsOrPage === 'number'
      ? { page: optionsOrPage, perPage: perPageArg }
      : optionsOrPage;

  const page = options.page || 1;
  const targetCount = Math.max(options.perPage || 24, 24);
  const apiPerPage = 50; // Request max batch size per GameBanana API call
  const sort = options.sort || 'featured';
  const searchQuery = (options.searchQuery || '').trim();
  const catFilter = options.categoryFilter || 'all';
  const hideNsfw = Boolean(options.hideNsfw);

  const cacheKey = JSON.stringify({
    page,
    targetCount,
    sort,
    searchQuery,
    catFilter,
    characterSubcatId: options.characterSubcatId || 0,
    submitterId: options.submitterId || 0,
    authorName: (options.authorName || '').toLowerCase(),
    hideNsfw,
  });

  // SFW only: served from the pre-scanned list of safe mods (complete and instant), instead of
  // paging through GameBanana where ~90% of mods would be hidden.
  if (hideNsfw) {
    await nsfwVerdictsReady();
    const local = sfwFeedFromCatalog(options, page, targetCount, sort, searchQuery, catFilter);
    if (local) return finalizeNsfw(local, true);
  }

  const cached = feedResponseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FEED_CACHE_TTL_MS) {
    return finalizeNsfw(cached.items, hideNsfw);
  }

  const existingInflight = inflightFeedRequests.get(cacheKey);
  if (existingInflight) {
    return existingInflight;
  }

  // Trigger background prefetch for "Most Popular" & "Recently Updated" on initial startup
  if (!initialPopularPrefetchTriggered && sort === 'featured' && page === 1 && !searchQuery) {
    initialPopularPrefetchTriggered = true;
    setTimeout(() => {
      Promise.all([
        fetchLiveGameBananaFeed({ page: 1, perPage: 24, sort: 'likes', categoryFilter: 'all', hideNsfw }),
        fetchLiveGameBananaFeed({ page: 1, perPage: 24, sort: 'updated', categoryFilter: 'all', hideNsfw }),
      ]).catch(() => {});
    }, 50);
  }

  const requestPromise = (async (): Promise<GameBananaModItem[]> => {
    const subfeedSortMap: Record<string, string> = {
      featured: 'default',
      default: 'default',
      new: 'new',
      downloads: 'default',
      likes: 'default',
      updated: 'updated',
      alphabetical: 'new',
    };

    const indexSortMap: Record<string, string> = {
      featured: 'Generic_LatestModified',
      default: 'Generic_LatestModified',
      new: 'Generic_Newest',
      downloads: 'Generic_MostDownloaded',
      likes: 'Generic_MostLiked',
      updated: 'Generic_LatestModified',
      alphabetical: 'Generic_Newest',
    };

    const buildUrlForApiPage = (apiPage: number): string => {
      if (options.submitterId) {
        const indexSort = indexSortMap[sort] || 'Generic_LatestModified';
        return `https://gamebanana.com/apiv11/Mod/Index?_nPerpage=${apiPerPage}&_nPage=${apiPage}&_aFilters[Generic_Submitter]=${options.submitterId}&_aFilters[Generic_Game]=${ZZZ_GAMEBANANA_GAME_ID}&_sSort=${indexSort}`;
      }
      if (options.characterSubcatId) {
        const indexSort = indexSortMap[sort] || 'Generic_LatestModified';
        return `https://gamebanana.com/apiv11/Mod/Index?_nPerpage=${apiPerPage}&_nPage=${apiPage}&_aFilters[Generic_Category]=${options.characterSubcatId}&_aFilters[Generic_Game]=${ZZZ_GAMEBANANA_GAME_ID}&_sSort=${indexSort}`;
      }
      if (searchQuery) {
        const gbSort = subfeedSortMap[sort] || 'default';
        return `https://gamebanana.com/apiv11/Game/${ZZZ_GAMEBANANA_GAME_ID}/Subfeed?_nPage=${apiPage}&_sSort=${gbSort}&_sName=${encodeURIComponent(
          searchQuery
        )}&_csvModelInclusions=Mod`;
      }
      if (sort === 'likes' || sort === 'downloads') {
        const indexSort = indexSortMap[sort] || 'Generic_MostLiked';
        if (catFilter === 'ui') {
          return `https://gamebanana.com/apiv11/Mod/Index?_nPerpage=${apiPerPage}&_nPage=${apiPage}&_aFilters[Generic_Category]=30395&_aFilters[Generic_Game]=${ZZZ_GAMEBANANA_GAME_ID}&_sSort=${indexSort}`;
        }
        if (catFilter === 'skins') {
          return `https://gamebanana.com/apiv11/Mod/Index?_nPerpage=${apiPerPage}&_nPage=${apiPage}&_aFilters[Generic_Category]=30305&_aFilters[Generic_Game]=${ZZZ_GAMEBANANA_GAME_ID}&_sSort=${indexSort}`;
        }
        return `https://gamebanana.com/apiv11/Mod/Index?_nPerpage=${apiPerPage}&_nPage=${apiPage}&_aFilters[Generic_Game]=${ZZZ_GAMEBANANA_GAME_ID}&_sSort=${indexSort}`;
      }
      if (
        (sort === 'featured' || sort === 'default') &&
        (catFilter === 'all' || catFilter === 'weapons' || catFilter === 'audio')
      ) {
        return `https://gamebanana.com/apiv11/Game/${ZZZ_GAMEBANANA_GAME_ID}/Subfeed?_nPage=${apiPage}&_sSort=default&_csvModelInclusions=Mod`;
      }
      const indexSort = indexSortMap[sort] || 'Generic_LatestModified';
      const categoryId = catFilter === 'ui' ? 30395 : 30305;
      return `https://gamebanana.com/apiv11/Mod/Index?_nPerpage=${apiPerPage}&_nPage=${apiPage}&_aFilters[Generic_Category]=${categoryId}&_aFilters[Generic_Game]=${ZZZ_GAMEBANANA_GAME_ID}&_sSort=${indexSort}`;
    };

    try {
      // On Most Popular (likes/downloads), ~90% of raw GameBanana entries have NSFW content ratings,
      // leaving only 3 SFW mods in a single page. Fetch 6 API pages in parallel via Promise.all
      // so the initial load yields 24+ safe mods immediately.
      // NSFW / Show all views show everything, so one page of 50 is plenty. Only the SFW view
      // (when the pre-scanned catalog isn't downloaded yet) needs extra pages to fill a screen.
      const parallelPagesCount = options.submitterId || !hideNsfw
        ? 1
        : !searchQuery
        ? 6
        : 2;

      const startApiPage = (page - 1) * parallelPagesCount + 1;
      const apiPagesToFetch = Array.from({ length: parallelPagesCount }, (_, i) => startApiPage + i);

      // Each page is tried twice (GameBanana sometimes drops a request). null = it didn't answer.
      const fetchApiPage = async (apiPage: number): Promise<any[] | null> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12000);
          try {
            const res = await fetch(buildUrlForApiPage(apiPage), {
              signal: controller.signal,
              headers: { 'User-Agent': 'ZZZModManager-v2/2.0' },
            });
            if (res.ok) {
              const data: any = await res.json();
              return Array.isArray(data._aRecords) ? data._aRecords : [];
            }
          } catch {
            // retry below
          } finally {
            clearTimeout(timeout);
          }
          await new Promise((r) => setTimeout(r, 600));
        }
        return null;
      };
      const answers = await Promise.all(apiPagesToFetch.map(fetchApiPage));
      if (answers.every((a) => a === null)) throw new Error("GameBanana didn't answer.");
      const pagePayloads = answers.map((a) => a ?? []);

      const seenRowIds = new Set<number>();
      const records: any[] = [];
      for (const batch of pagePayloads) {
        for (const rec of batch) {
          if (!rec || !rec._idRow) continue;
          const rowId = Number(rec._idRow);
          if (seenRowIds.has(rowId)) continue;
          if (rec._aGame?._idRow && Number(rec._aGame._idRow) !== ZZZ_GAMEBANANA_GAME_ID) {
            continue;
          }
          if (
            options.submitterId &&
            rec._aSubmitter?._idRow &&
            Number(rec._aSubmitter._idRow) !== Number(options.submitterId)
          ) {
            continue;
          }
          seenRowIds.add(rowId);
          records.push(rec);
        }
      }

      if (records.length > 0) {
        let liveItems: GameBananaModItem[] = records.map((rec: any, idx: number) => recordToFeedItem(rec, idx, options));

        if (options.authorName && !options.submitterId) {
          const targetAuthor = options.authorName.toLowerCase();
          liveItems = liveItems.filter((m) => m.author.toLowerCase() === targetAuthor);
        }

        if ((options.characterSubcatId || options.submitterId) && searchQuery) {
          const q = searchQuery.toLowerCase();
          liveItems = liveItems.filter(
            (m) =>
              m.title.toLowerCase().includes(q) ||
              m.author.toLowerCase().includes(q) ||
              m.description.toLowerCase().includes(q)
          );
        }

        if (sort === 'alphabetical') {
          liveItems.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sort === 'likes') {
          liveItems.sort((a, b) => b.likes - a.likes);
        } else if (sort === 'downloads') {
          liveItems.sort((a, b) => b.downloads - a.downloads);
        }

        // Labels come from the pre-scanned list (applied on every read, so a newer list counts at once).
        await nsfwVerdictsReady();
        feedResponseCache.set(cacheKey, { timestamp: Date.now(), items: liveItems });
        // Keep the cache small over long sessions: drop expired pages, and the oldest past 40.
        for (const [k, v] of feedResponseCache) {
          if (Date.now() - v.timestamp > FEED_CACHE_TTL_MS || feedResponseCache.size > 40) feedResponseCache.delete(k);
        }
        return finalizeNsfw(liveItems, hideNsfw);
      }
      return [];
    } catch (err) {
      console.warn('[GameBanana] Live feed fetch failed:', err);
      // Let Browse tell "GameBanana didn't answer" (try again) apart from "no more mods".
      throw err;
    } finally {
      inflightFeedRequests.delete(cacheKey);
    }
  })();

  inflightFeedRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Searches GameBanana for a given local mod folder name and downloads the thumbnail as preview.webp + mod.json.
 */
export async function searchAndFetchGameBananaPreviewForFolder(
  modFolderPath: string,
  rawFolderName: string
): Promise<{ success: boolean; thumbnailUrl?: string; modTitle?: string }> {
  try {
    const cleanQuery = rawFolderName
      .replace(/^DISABLED_/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b(v\d+|\d+)\b/gi, '')
      .trim();

    if (!cleanQuery) return { success: false };

    const url = `https://gamebanana.com/apiv11/Game/${ZZZ_GAMEBANANA_GAME_ID}/Subfeed?_nPage=1&_sSort=default&_sName=${encodeURIComponent(
      cleanQuery
    )}&_csvModelInclusions=Mod`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ZZZModManager-v2/2.0' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      const records = data._aRecords || [];
      if (Array.isArray(records) && records.length > 0) {
        const topMatch = records[0];
        const previewUrl = getModPreviewUrl(topMatch);
        if (previewUrl) {
          const imgRes = await fetch(previewUrl);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const previewWebp = path.join(modFolderPath, 'preview.webp');
            fs.writeFileSync(previewWebp, buffer);

            const metaPayload = {
              gamebanana_id: topMatch._idRow,
              title: topMatch._sName,
              author: topMatch._aSubmitter?._sName || 'GameBanana Author',
              category: topMatch._aSubCategory?._sName || 'Skins',
              agent_hint: topMatch._aSubCategory?._sName || undefined,
              thumbnail_url: previewUrl,
              all_previews: getAllModPreviewUrls(topMatch),
              is_nsfw: isModRecordNsfw(topMatch),
              fetched_at: new Date().toISOString(),
            };

            // Write both mod.json and .mod_meta.json for backward compatibility
            fs.writeFileSync(
              path.join(modFolderPath, 'mod.json'),
              JSON.stringify(metaPayload, null, 2),
              'utf-8'
            );
            fs.writeFileSync(
              path.join(modFolderPath, '.mod_meta.json'),
              JSON.stringify(metaPayload, null, 2),
              'utf-8'
            );

            return {
              success: true,
              thumbnailUrl: previewUrl,
              modTitle: topMatch._sName,
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[GameBanana] Failed to auto-fetch preview for ${rawFolderName}:`, err);
  }
  return { success: false };
}

export async function fetchGameBananaModProfile(modId: number): Promise<GameBananaModItem> {
  const curated = CURATED_GAMEBANANA_MODS.find((m) => m.id === modId);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://gamebanana.com/apiv11/Mod/${modId}/ProfilePage`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ZZZModManager-Fairy/3.0',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      const gameId = data?._aGame?._idRow;
      if (gameId && Number(gameId) !== ZZZ_GAMEBANANA_GAME_ID) {
        throw new Error(
          `GameBanana Mod #${modId} belongs to "${data?._aGame?._sName || gameId}" (Game #${gameId}), not Zenless Zone Zero (#${ZZZ_GAMEBANANA_GAME_ID}).`
        );
      }

      if (data && data._sName) {
        const title = data._sName;
        const author = data._aSubmitter?._sName || 'GameBanana Author';
        const submitterId = data._aSubmitter?._idRow ? Number(data._aSubmitter._idRow) : undefined;
        const authorAvatarUrl =
          data._aSubmitter?._sHdAvatarUrl || data._aSubmitter?._sAvatarUrl || undefined;
        const authorProfileUrl =
          data._aSubmitter?._sProfileUrl ||
          (submitterId ? `https://gamebanana.com/members/${submitterId}` : undefined);
        const primaryThumb = getModPreviewUrl(data);
        const allPreviews = getAllModPreviewUrls(data);
        const nsfwFlag = isModRecordNsfw(data);
        const files = data._aFiles || [];
        const primaryFile = files[0] || {};

        const catName =
          (data._aCategory?._sName && !data._aCategory._sName.includes('Character Skins')
            ? data._aCategory._sName
            : null) ||
          (data._aSubCategory?._sName && !data._aSubCategory._sName.includes('Character Skins')
            ? data._aSubCategory._sName
            : null) ||
          data._aRootCategory?._sName ||
          'Skins';
        const catId = data._aCategory?._idRow || data._aSubCategory?._idRow || undefined;

        const cleanDescription = data._sText
          ? String(data._sText)
              .replace(/<br\s*[\/]?>/gi, '\n')
              .replace(/<\/p>/gi, '\n\n')
              .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/\n{3,}/g, '\n\n')
              .trim()
          : data._sDescription || 'Live GameBanana asset stream.';

        const downloadUrl =
          primaryFile._sDownloadUrl ||
          (primaryFile._idRow ? `https://gamebanana.com/dl/${primaryFile._idRow}` : `https://gamebanana.com/mods/${modId}`);

        const resolvedThumb =
          primaryThumb ||
          curated?.thumbnail_url ||
          makeModCoverSvg(
            title.slice(0, 24),
            `BY ${author.toUpperCase()}`,
            '#e6193c',
            '#ff3355',
            catName.slice(0, 14),
            'vampire'
          );

        return {
          id: modId,
          title,
          author,
          submitter_id: submitterId,
          author_avatar_url: authorAvatarUrl,
          author_profile_url: authorProfileUrl,
          category: catName,
          category_id: catId,
          agent_hint: catName,
          likes: data._nLikeCount || 150,
          downloads: data._nDownloadCount || 2100,
          views: data._nViewCount || 6200,
          updated_at: new Date((data._tsDateUpdated || Date.now() / 1000) * 1000)
            .toISOString()
            .slice(0, 10),
          thumbnail_url: resolvedThumb,
          preview_images: allPreviews.length > 0 ? allPreviews : [resolvedThumb],
          profile_url: `https://gamebanana.com/mods/${modId}`,
          download_url: downloadUrl,
          file_name: primaryFile._sFile || `GB_Mod_${modId}.zip`,
          file_size: primaryFile._nFilesize || 18000000,
          md5_checksum: primaryFile._sMd5Checksum || crypto.randomBytes(16).toString('hex'),
          description: cleanDescription,
          is_live_api: true,
          is_nsfw: nsfwFlag,
          content_rating: data._sContentRating || (nsfwFlag ? 'NSFW' : 'Everyone'),
          preset_scenario: curated?.preset_scenario,
        };
      }
    }
  } catch {
    // Fallback to curated if modId matches a sandbox preset
  }

  if (curated) return curated;
  return {
    is_placeholder: true,
    id: modId,
    title: `GameBanana ZZZ Mod #${modId}`,
    author: 'ProxyModder',
    category: 'Skins',
    likes: 520,
    downloads: 6800,
    views: 18000,
    updated_at: new Date().toISOString().slice(0, 10),
    thumbnail_url: makeModCoverSvg(
      `ASSET #${modId}`,
      'ZZMI 1-CLICK STREAM',
      '#e6193c',
      '#ff3355',
      `MOD #${modId}`,
      'blade'
    ),
    preview_images: [],
    profile_url: `https://gamebanana.com/mods/${modId}`,
    download_url: `zzzmgr://install/${modId}`,
    file_name: `ZZZ_Mod_${modId}.zip`,
    file_size: 21000000,
    md5_checksum: crypto.randomBytes(16).toString('hex'),
    description: 'Captured via GameBanana 1-Click stream.',
    preset_scenario: 'clean_ellen',
  };
}

export function buildRealisticModZipArchive(
  modItem: GameBananaModItem,
  targetZipPath: string
): { md5: string; nestedFoldersCreated: number } {
  const zip = new AdmZip();
  const scenario = modItem.preset_scenario || 'clean_ellen';

  if (scenario === 'multi_pack') {
    const ellenIni = `; Ellen Vampire Gala Dress
[Constants]
global persist $jacket = 1
global persist $monocle = 0

[KeyToggleCoat]
key = J
type = cycle
$jacket = 0,1

[KeyToggleMonocle]
key = K
type = cycle
$monocle = 0,1

[TextureOverrideEllenPosition]
hash = b78f3616
vb0 = ResourceEllenPosition

[TextureOverrideEllenBlend]
hash = ed9cb852
vb1 = ResourceEllenBlend
handling = skip
draw = 21840, 0

[TextureOverrideEllenIB]
hash = e30fae03
handling = skip
ib = ResourceEllenIB
Resource\\ZZMI\\Diffuse = ref ResourceEllenDiffuse
run = CommandList\\ZZMI\\SetTextures
run = CommandList\\ZZMI\\ORFix
drawindexed = auto
`;

    const lycaonIni = `; Von Lycaon Midnight Velvet Tuxedo
[Constants]
global persist $vest = 1

[KeyToggleVest]
key = J
type = cycle
$vest = 0,1

[TextureOverrideLycaonPosition]
hash = 8c7775ae
vb0 = ResourceLycaonPosition

[TextureOverrideLycaonIB]
hash = 6749b6e7
handling = skip
ib = ResourceLycaonIB
run = CommandList\\ZZMI\\SetTextures
run = CommandList\\ZZMI\\ORFix
drawindexed = auto
`;
    const sampleBuf = Buffer.alloc(160, 14);
    zip.addFile('Gothic_Pack/Ellen_Vampire_Gala/EllenGala.ini', Buffer.from(ellenIni, 'utf-8'));
    zip.addFile('Gothic_Pack/Ellen_Vampire_Gala/Position.buf', sampleBuf);
    zip.addFile('Gothic_Pack/Ellen_Vampire_Gala/Blend.buf', sampleBuf);
    zip.addFile('Gothic_Pack/Ellen_Vampire_Gala/Texcoord.buf', sampleBuf);
    zip.addFile('Gothic_Pack/Ellen_Vampire_Gala/Index.buf', sampleBuf);

    zip.addFile('Gothic_Pack/Lycaon_Velvet_Tux/LycaonTux.ini', Buffer.from(lycaonIni, 'utf-8'));
    zip.addFile('Gothic_Pack/Lycaon_Velvet_Tux/Position.buf', sampleBuf);
    zip.addFile('Gothic_Pack/Lycaon_Velvet_Tux/Blend.buf', sampleBuf);
    zip.addFile('Gothic_Pack/Lycaon_Velvet_Tux/Texcoord.buf', sampleBuf);
    zip.addFile('Gothic_Pack/Lycaon_Velvet_Tux/Index.buf', sampleBuf);
  } else if (scenario === 'broken_miyabi') {
    const brokenIni = `; Blood Moon Ceremonial Haori Miyabi
[Constants]
global persist $haori = 1
global persist $fox_mask = 1
global persist $blade_glow = 1

[KeyToggleHaoriCoat]
key = J
type = cycle
$haori = 0,1

[KeyToggleFoxMask]
key = K
type = cycle
$fox_mask = 0,1

[KeyToggleKatanaGlow]
key = L
type = cycle
$blade_glow = 0,1

[TextureOverrideMiyabiPosition]
hash = deadbeef
vb0 = ResourceMiyabiPosition

[TextureOverrideMiyabiBlend]
hash = 11223344
vb1 = ResourceMiyabiBlend
handling = skip
draw = 18900, 0

[TextureOverrideMiyabiIB]
hash = b40192f1
handling = skip
ib = ResourceMiyabiIB
ps-t0 = ResourceMiyabiDiffuse
ps-t1 = ResourceMiyabiNormalMap
drawindexed = auto

[ResourceMiyabiPosition]
type = Buffer
stride = 40
filename = Position.buf

[ResourceMiyabiBlend]
type = Buffer
stride = 32
filename = Blend.buf
`;
    const blendBuf = Buffer.alloc(128, 8);
    zip.addFile(`Miyabi_Release/Blood_Moon_Miyabi/mod.ini`, Buffer.from(brokenIni, 'utf-8'));
    zip.addFile(`Miyabi_Release/Blood_Moon_Miyabi/Position.buf`, blendBuf);
    zip.addFile(`Miyabi_Release/Blood_Moon_Miyabi/Blend.buf`, blendBuf);
    zip.addFile(`Miyabi_Release/Blood_Moon_Miyabi/Texcoord.buf`, blendBuf);
    zip.addFile(`Miyabi_Release/Blood_Moon_Miyabi/Index.buf`, blendBuf);
  } else {
    // Dynamically look up the target agent so fallback mock matches the actual character
    const targetAgent =
      (modItem.category_id ? matchAgentByGbCategory(modItem.category_id, DEFAULT_HASH_DB) : null) ||
      matchAgentByHintOrName(modItem.agent_hint || modItem.category || modItem.title, DEFAULT_HASH_DB);

    const posHash = targetAgent?.current_hashes?.position_vb || '8b14a299';
    const ibHash = targetAgent?.current_hashes?.ib || '1f2a3c4d';
    const blendHash = targetAgent?.current_hashes?.blend_vb || '3c2e1f0a';
    const agentLabel = targetAgent ? targetAgent.display_name : modItem.category || 'Custom Agent';

    const defaultIni = `; ${modItem.title} by ${modItem.author} (Target: ${agentLabel})
[Constants]
global persist $outfit = 1
global persist $accessory = 1
global persist $weapon_fx = 1

[KeyToggleOutfit]
key = H
type = cycle
$outfit = 0,1

[KeyToggleJacket]
key = J
type = cycle
$accessory = 0,1

[KeyToggleWeaponFX]
key = L
type = cycle
$weapon_fx = 0,1

[TextureOverrideAgentPosition]
hash = ${posHash}
vb0 = ResourceAgentPosition

[TextureOverrideAgentBlend]
hash = ${blendHash}
vb1 = ResourceAgentBlend
handling = skip

[TextureOverrideAgentIB]
hash = ${ibHash}
handling = skip
ib = ResourceAgentIB
Resource\\ZZMI\\Diffuse = ref ResourceAgentDiffuse
run = CommandList\\ZZMI\\SetTextures
run = CommandList\\ZZMI\\ORFix
drawindexed = auto

[ResourceAgentPosition]
type = Buffer
stride = 40
filename = Position.buf

[ResourceAgentBlend]
type = Buffer
stride = 40
filename = Blend.buf
`;
    const bufData = Buffer.alloc(160, 15);
    const folderSlug = (modItem.file_name || modItem.title)
      .replace(/\.zip$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    zip.addFile(`Mod_Files/${folderSlug}/mod.ini`, Buffer.from(defaultIni, 'utf-8'));
    zip.addFile(`Mod_Files/${folderSlug}/Position.buf`, bufData);
    zip.addFile(`Mod_Files/${folderSlug}/Blend.buf`, bufData);
    zip.addFile(`Mod_Files/${folderSlug}/Texcoord.buf`, bufData);
    zip.addFile(`Mod_Files/${folderSlug}/Index.buf`, bufData);
  }

  fs.mkdirSync(path.dirname(targetZipPath), { recursive: true });
  zip.writeZip(targetZipPath);
  const fileBuffer = fs.readFileSync(targetZipPath);
  const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

  return { md5, nestedFoldersCreated: 2 };
}
