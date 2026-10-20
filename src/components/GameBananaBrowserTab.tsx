import { HeroDecor } from '../ui/HeroDecor';
import React, { useState, useEffect, useMemo } from 'react';
import {
  AgentHashEntry,
  DownloadQueueItem,
  GameBananaModItem,
  ModManifest,
  NsfwFilterState,
} from '../shared/types';
import { DEFAULT_HASH_DB } from '../shared/defaultHashDb';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  Compass,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Heart,
  Images,
  Link2,
  Loader2,
  RefreshCw,
  SearchX,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { fairyClient } from '../services/fairyClient';
import type { MotifKind } from '../themes/types';
import { Motif } from '../themes/Motif';
import { Avatar, CardSkeletonGrid, EmptyState, formatCount, Modal, SearchInput, Segmented, ThumbImage } from '../ui';

interface GameBananaBrowserTabProps {
  feed: GameBananaModItem[];
  installedMods: ModManifest[];
  queue: DownloadQueueItem[];
  nsfwFilterState: NsfwFilterState;
  agents?: Record<string, AgentHashEntry>;
  motif: MotifKind;
  onInstallWithFairy: (mod: GameBananaModItem) => void;
  onFetchLiveModId: (modIdOrUrl: string) => void;
}

type QuickTab = 'featured' | 'popular' | 'updated' | 'character';

export const GameBananaBrowserTab: React.FC<GameBananaBrowserTabProps> = ({
  feed: initialFeed,
  installedMods,
  queue,
  nsfwFilterState,
  agents,
  onInstallWithFairy,
  onFetchLiveModId,
  motif,
}) => {
  const allAgents = useMemo(() => {
    const src = agents && Object.keys(agents).length > 0 ? agents : DEFAULT_HASH_DB.agents;
    return Object.values(src).sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [agents]);

  const [modsList, setModsList] = useState<GameBananaModItem[]>(initialFeed);
  const [quickTab, setQuickTab] = useState<'featured' | 'popular' | 'updated' | 'character'>('featured');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('ALL');
  const [selectedAuthor, setSelectedAuthor] = useState<{
    name: string;
    submitterId?: number;
    avatarUrl?: string;
    profileUrl?: string;
  } | null>(null);
  const [characterDirectorySearch, setCharacterDirectorySearch] = useState('');
  const [loadingAgent, setLoadingAgent] = useState<AgentHashEntry | null>(null);
  const [sortOption, setSortOption] = useState<
    'featured' | 'likes' | 'downloads' | 'new' | 'updated' | 'alphabetical'
  >('featured');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'skins' | 'weapons' | 'ui' | 'audio'>('all');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [liveModInput, setLiveModInput] = useState('');

  // Gallery & Description Modal State
  const [galleryMod, setGalleryMod] = useState<GameBananaModItem | null>(null);
  const [currentGalleryIdx, setCurrentGalleryIdx] = useState(0);
  const [modalDescription, setModalDescription] = useState<string>('');
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  useEffect(() => {
    if (!galleryMod) {
      setModalDescription('');
      return;
    }
    const targetModId = Number(galleryMod.id);
    setModalDescription(galleryMod.description || '');
    if (targetModId && galleryMod.is_live_api !== false) {
      setIsLoadingDetails(true);
      fairyClient
        .fetchGameBananaMod(targetModId)
        .then((fullProfile) => {
          if (fullProfile && Number(fullProfile.id) === targetModId && fullProfile.is_live_api) {
            if (fullProfile.description) {
              setModalDescription(fullProfile.description);
            }
            setGalleryMod((prev) => {
              if (!prev || Number(prev.id) !== targetModId) return prev;
              const bestThumb =
                fullProfile.thumbnail_url && !fullProfile.thumbnail_url.startsWith('data:image/svg+xml')
                  ? fullProfile.thumbnail_url
                  : prev.thumbnail_url;
              return {
                ...prev,
                ...fullProfile,
                thumbnail_url: bestThumb,
                preview_images:
                  fullProfile.preview_images && fullProfile.preview_images.length > 0
                    ? fullProfile.preview_images
                    : prev.preview_images,
                description: fullProfile.description || prev.description,
              };
            });
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingDetails(false));
    }
  }, [galleryMod?.id]);

  // Blurred NSFW cards revealed manually
  const [revealedNsfwIds, setRevealedNsfwIds] = useState<Set<number>>(new Set());

  // Layer 2 AI/Canvas Vision Moderation Cache by Mod ID (persisted in localStorage + backend cache)
  const visionCacheRef = React.useRef<Map<number, boolean>>(new Map());

  useEffect(() => {
    try {
      const saved = localStorage.getItem('zzz_nsfw_vision_cache');
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const [k, v] of Object.entries(parsed)) {
          visionCacheRef.current.set(Number(k), Boolean(v));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleThumbnailVisionScan = (item: GameBananaModItem, imgEl: HTMLImageElement) => {
    if (item.is_nsfw || visionCacheRef.current.has(item.id)) return;
    if (!item.thumbnail_url || item.thumbnail_url.startsWith('data:image/svg+xml')) {
      visionCacheRef.current.set(item.id, false);
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(imgEl, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      let centerSkinPixels = 0;
      let centerTotalPixels = 0;

      // Analyze center torso crop (x: 16..48, y: 12..52) in YCbCr + RGB skin-tone space
      for (let y = 12; y < 52; y++) {
        for (let x = 16; x < 48; x++) {
          const idx = (y * size + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

          const isSkin =
            r > 95 &&
            g > 40 &&
            b > 20 &&
            r > g &&
            r > b &&
            Math.abs(r - g) > 15 &&
            cr >= 135 &&
            cr <= 173 &&
            cb >= 77 &&
            cb <= 127;

          if (isSkin) centerSkinPixels++;
          centerTotalPixels++;
        }
      }

      const skinRatio = centerTotalPixels > 0 ? centerSkinPixels / centerTotalPixels : 0;
      const flaggedByVision = skinRatio > 0.48;

      visionCacheRef.current.set(item.id, flaggedByVision);
      try {
        const serialized: Record<string, boolean> = {};
        for (const [k, v] of visionCacheRef.current.entries()) {
          serialized[String(k)] = v;
        }
        localStorage.setItem('zzz_nsfw_vision_cache', JSON.stringify(serialized));
      } catch {
        // ignore storage quota
      }

      fairyClient
        .recordVisionResult({
          modId: item.id,
          thumbnailUrl: item.thumbnail_url,
          isNsfw: flaggedByVision,
          confidence: Number(skinRatio.toFixed(2)),
          reason: flaggedByVision
            ? `Layer 2 Vision: High skin exposure detected (${Math.round(skinRatio * 100)}%)`
            : 'Layer 2 Vision: Safe thumbnail',
          checkedAt: new Date().toISOString(),
        })
        .catch(() => {});

      if (flaggedByVision) {
        setModsList((prev) =>
          prev.map((m) =>
            m.id === item.id
              ? {
                  ...m,
                  is_nsfw: true,
                  nsfw_reason: `Layer 2 Vision (${Math.round(skinRatio * 100)}% skin ratio)`,
                }
              : m
          )
        );
      }
    } catch {
      // Cross-origin canvas read blocked; rely on backend Layer 2 moderation result
      visionCacheRef.current.set(item.id, Boolean(item.is_nsfw));
    }
  };

  const feedCacheRef = React.useRef<Map<string, GameBananaModItem[]>>(new Map());

  const makeClientCacheKey = (
    p: number,
    s: string,
    q: string,
    cat: string,
    subcat?: number,
    hide?: boolean,
    submitterId?: number,
    authorName?: string
  ) =>
    `${p}|${s}|${q}|${cat}|${subcat || 0}|${hide ? 1 : 0}|${submitterId || 0}|${(
      authorName || ''
    ).toLowerCase()}`;

  const getCachedModsForAuthor = (submitterId?: number, authorName?: string): GameBananaModItem[] => {
    const targetName = (authorName || '').trim().toLowerCase();
    const seen = new Set<number>();
    const matches: GameBananaModItem[] = [];

    const checkList = (list: GameBananaModItem[]) => {
      for (const item of list) {
        if (!item || seen.has(item.id)) continue;
        const idMatch = Boolean(submitterId && item.submitter_id && item.submitter_id === submitterId);
        const nameMatch = Boolean(targetName && item.author.trim().toLowerCase() === targetName);
        if (idMatch || nameMatch) {
          seen.add(item.id);
          matches.push(item);
        }
      }
    };

    checkList(modsList);
    for (const cachedBatch of feedCacheRef.current.values()) {
      checkList(cachedBatch);
    }
    checkList(initialFeed);
    return matches;
  };

  const handleSelectAuthor = (mod: GameBananaModItem, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setGalleryMod(null);
    setSelectedAgentId('ALL');
    setPage(1);
    setSelectedAuthor({
      name: mod.author,
      submitterId: mod.submitter_id,
      avatarUrl: mod.author_avatar_url,
      profileUrl:
        mod.author_profile_url ||
        (mod.submitter_id ? `https://gamebanana.com/members/${mod.submitter_id}` : undefined),
    });
  };

  // Prefetch "Most Popular" (likes) and "Recently Updated" batches on mount/idle so grid renders immediately
  useEffect(() => {
    const hide = nsfwFilterState === 'hide';
    Promise.all([
      fairyClient.getGameBananaFeed({
        page: 1,
        perPage: 24,
        sort: 'likes',
        categoryFilter: 'all',
        hideNsfw: hide,
      }),
      fairyClient.getGameBananaFeed({
        page: 1,
        perPage: 24,
        sort: 'updated',
        categoryFilter: 'all',
        hideNsfw: hide,
      }),
    ])
      .then(([popularItems, updatedItems]) => {
        if (Array.isArray(popularItems) && popularItems.length > 0) {
          feedCacheRef.current.set(
            makeClientCacheKey(1, 'likes', '', 'all', undefined, hide),
            popularItems
          );
        }
        if (Array.isArray(updatedItems) && updatedItems.length > 0) {
          feedCacheRef.current.set(
            makeClientCacheKey(1, 'updated', '', 'all', undefined, hide),
            updatedItems
          );
        }
      })
      .catch(() => {});
  }, [nsfwFilterState]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const feedRequestIdRef = React.useRef(0);

  useEffect(() => {
    loadOnlineFeed();
  }, [
    quickTab,
    debouncedSearch,
    selectedAgentId,
    selectedAuthor?.submitterId,
    selectedAuthor?.name,
    sortOption,
    categoryFilter,
    page,
    nsfwFilterState,
    reloadTick,
  ]);

  const handleQuickTabSwitch = (tab: 'featured' | 'popular' | 'updated' | 'character') => {
    setSelectedAuthor(null);
    setSelectedAgentId('ALL');
    setLoadingAgent(null);
    setQuickTab(tab);
    setPage(1);
    if (tab === 'featured') {
      setSortOption('featured');
    } else if (tab === 'popular') {
      setSortOption('likes');
    } else if (tab === 'updated') {
      setSortOption('updated');
    }
  };

  const loadOnlineFeed = async () => {
    const requestId = ++feedRequestIdRef.current;
    const selectedAgent =
      selectedAgentId !== 'ALL'
        ? allAgents.find((a) => a.agent_id === selectedAgentId)
        : null;
    const subcatId = selectedAgent?.gb_category_id;
    const hide = nsfwFilterState === 'hide';
    const cleanQ = debouncedSearch.trim();
    const cacheKey = makeClientCacheKey(
      page,
      sortOption,
      cleanQ,
      categoryFilter,
      subcatId,
      hide,
      selectedAuthor?.submitterId,
      selectedAuthor?.name
    );

    const applyCachedVisionFlags = (list: GameBananaModItem[]) =>
      list.map((m) =>
        visionCacheRef.current.get(m.id) === true ? { ...m, is_nsfw: true } : m
      );

    // If filtering by an author, immediately show any matching mods already cached in state
    const cachedAuthorMatches = selectedAuthor
      ? applyCachedVisionFlags(
          getCachedModsForAuthor(selectedAuthor.submitterId, selectedAuthor.name)
        )
      : [];

    if (selectedAuthor && page === 1 && cachedAuthorMatches.length > 0) {
      setModsList(cachedAuthorMatches);
    }

    // Render prefetched / cached items immediately with zero loading spinner delay
    const prefetched = feedCacheRef.current.get(cacheKey);
    if (prefetched && prefetched.length > 0 && page === 1) {
      setModsList(applyCachedVisionFlags(prefetched));
      setIsLoading(false);
      setLoadingAgent(null);
      return;
    }

    setIsLoading(true);
    setFeedError(null);
    try {
      const items = await fairyClient.getGameBananaFeed({
        page,
        perPage: 24,
        sort: sortOption,
        searchQuery: cleanQ || undefined,
        categoryFilter,
        characterSubcatId: subcatId,
        submitterId: selectedAuthor?.submitterId,
        authorName: selectedAuthor?.name,
        hideNsfw: hide,
      });

      // Ignore stale responses if the user switched tabs or filters while this request was in flight
      if (requestId !== feedRequestIdRef.current) {
        return;
      }

      const processed = applyCachedVisionFlags(Array.isArray(items) ? items : []);

      // Backfill author avatar or submitterId from live API items if missing
      if (selectedAuthor && processed.length > 0) {
        const firstWithMeta = processed.find((m) => m.author_avatar_url || m.submitter_id);
        if (
          firstWithMeta &&
          ((!selectedAuthor.avatarUrl && firstWithMeta.author_avatar_url) ||
            (!selectedAuthor.submitterId && firstWithMeta.submitter_id))
        ) {
          setSelectedAuthor((prev) =>
            prev
              ? {
                  ...prev,
                  submitterId: prev.submitterId || firstWithMeta.submitter_id,
                  avatarUrl: prev.avatarUrl || firstWithMeta.author_avatar_url,
                  profileUrl:
                    prev.profileUrl ||
                    firstWithMeta.author_profile_url ||
                    (firstWithMeta.submitter_id
                      ? `https://gamebanana.com/members/${firstWithMeta.submitter_id}`
                      : undefined),
                }
              : prev
          );
        }
      }

      if (page === 1) {
        if (selectedAuthor) {
          const seenIds = new Set(processed.map((m) => m.id));
          const merged = [
            ...processed,
            ...cachedAuthorMatches.filter((m) => !seenIds.has(m.id)),
          ];
          if (merged.length > 0) {
            feedCacheRef.current.set(cacheKey, merged);
          }
          setModsList(merged);
        } else {
          if (processed.length > 0) {
            feedCacheRef.current.set(cacheKey, processed);
          }
          setModsList(processed);
        }
      } else if (processed.length > 0) {
        feedCacheRef.current.set(cacheKey, processed);
        setModsList((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOnly = processed.filter((m: GameBananaModItem) => !existingIds.has(m.id));
          return [...prev, ...newOnly];
        });
      }
    } catch (err) {
      console.warn('Failed to fetch GameBanana feed:', err);
      if (requestId === feedRequestIdRef.current) {
        setFeedError((err as Error)?.message || 'The mod site did not respond.');
      }
    } finally {
      if (requestId === feedRequestIdRef.current) {
        setIsLoading(false);
        setLoadingAgent(null);
      }
    }
  };

  const displayedMods = useMemo(() => {
    return modsList.filter((item) => {
      if (nsfwFilterState === 'hide' && item.is_nsfw) {
        return false;
      }
      if (categoryFilter !== 'all') {
        const tag = (item.category_tag || 'Skins').toLowerCase();
        if (categoryFilter === 'skins' && tag !== 'skins') return false;
        if (categoryFilter === 'weapons' && tag !== 'weapons') return false;
        if (categoryFilter === 'ui' && tag !== 'ui') return false;
        if (categoryFilter === 'audio' && tag !== 'audio') return false;
      }
      return true;
    });
  }, [modsList, nsfwFilterState, categoryFilter]);

  const spotlightMods = useMemo(() => {
    return displayedMods.filter((m) => !m.is_nsfw).slice(0, 3);
  }, [displayedMods]);

  const activeAgent = useMemo(() => {
    return allAgents.find((a) => a.agent_id === selectedAgentId) || null;
  }, [allAgents, selectedAgentId]);

  const filteredDirectoryAgents = useMemo(() => {
    if (!characterDirectorySearch.trim()) return allAgents;
    const q = characterDirectorySearch.toLowerCase();
    return allAgents.filter(
      (ag) =>
        ag.display_name.toLowerCase().includes(q) ||
        ag.faction.toLowerCase().includes(q) ||
        ag.element.toLowerCase().includes(q)
    );
  }, [allAgents, characterDirectorySearch]);

  const handleLiveFetchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveModInput.trim()) return;
    onFetchLiveModId(liveModInput.trim());
    setLiveModInput('');
  };

  const isInstalled = (item: GameBananaModItem) =>
    installedMods.some((m) => m.gamebanana_id === item.id || m.title === item.title);
  const isDownloading = (item: GameBananaModItem) =>
    queue.some((q) => q.mod_id === item.id && q.status !== 'completed' && q.status !== 'error');
  const openGallery = (item: GameBananaModItem) => {
    setGalleryMod(item);
    setCurrentGalleryIdx(0);
  };

  const InstallButton: React.FC<{ item: GameBananaModItem; size?: 'sm' | 'md' | 'lg'; block?: boolean }> = ({
    item,
    size = 'sm',
    block,
  }) => {
    const downloading = isDownloading(item);
    const installed = isInstalled(item);
    const cls = `btn ${size === 'sm' ? 'btn--sm' : size === 'lg' ? 'btn--lg' : ''} ${block ? 'btn--block' : ''} ${
      installed && !downloading ? 'btn--secondary' : 'btn--primary'
    }`;
    return (
      <button
        className={cls}
        disabled={downloading}
        title={installed ? 'Already in your library — click to install again' : 'Install this mod'}
        onClick={(e) => {
          e.stopPropagation();
          onInstallWithFairy(item);
        }}
      >
        {downloading ? <Loader2 className="spin" /> : installed ? <Check style={{ color: 'var(--success)' }} /> : <Download />}
        {downloading ? 'Installing…' : installed ? 'Installed' : 'Install'}
      </button>
    );
  };

  const showSpotlight =
    quickTab === 'featured' && !debouncedSearch && selectedAgentId === 'ALL' && !selectedAuthor && spotlightMods.length >= 3;
  const showDirectory = quickTab === 'character' && selectedAgentId === 'ALL' && !selectedAuthor;
  const gridMods = showSpotlight ? displayedMods.filter((m) => !spotlightMods.some((s) => s.id === m.id)) : displayedMods;
  const galleryImages =
    galleryMod && galleryMod.preview_images && galleryMod.preview_images.length > 0
      ? galleryMod.preview_images
      : galleryMod
      ? [galleryMod.thumbnail_url]
      : [];

  return (
    <div className="screen">
      <div className="scroll">
        <section className="page-hero page-hero--compact">
          <Motif kind={motif} className="page-hero__motif" density={18} opacity={0.5} seed="browse" animated />
          <HeroDecor />
          <div className="page-hero__glow" />
          <div className="page-hero__content" style={{ alignItems: 'center' }}>
            <div className="min-w-0">
              <h1 className="display page-hero__title">Browse</h1>
              <p className="page-hero__subtitle">Discover community mods and install them in one click.</p>
            </div>
            <form onSubmit={handleLiveFetchSubmit} className="row" style={{ width: 'min(440px, 100%)' }}>
              <label className="search" style={{ maxWidth: 'none' }}>
                <Link2 />
                <span className="sr-only">Mod link or ID</span>
                <input
                  className="input"
                  value={liveModInput}
                  onChange={(e) => setLiveModInput(e.target.value)}
                  placeholder="Paste a mod link or ID"
                />
              </label>
              <button className="btn btn--primary" type="submit" disabled={!liveModInput.trim()}>
                <Download />
                Install
              </button>
            </form>
          </div>
        </section>

        <div className="page-toolbar">
          <Segmented<QuickTab>
            ariaLabel="Browse sections"
            value={selectedAuthor ? ('' as QuickTab) : quickTab}
            onChange={handleQuickTabSwitch}
            options={[
              { value: 'featured', label: 'Featured', icon: <Flame /> },
              { value: 'popular', label: 'Popular', icon: <TrendingUp /> },
              { value: 'updated', label: 'New & updated', icon: <Clock /> },
              { value: 'character', label: 'Characters', icon: <Users /> },
            ]}
          />
          <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search mods or creators" />
          <div className="spacer" />
          <select
            className="select"
            style={{ height: 32, width: 180 }}
            aria-label="Sort"
            value={sortOption}
            onChange={(e) => {
              setSortOption(e.target.value as typeof sortOption);
              setPage(1);
            }}
          >
            <option value="featured">Trending</option>
            <option value="likes">Most liked</option>
            <option value="downloads">Most downloaded</option>
            <option value="new">Newest</option>
            <option value="updated">Recently updated</option>
            <option value="alphabetical">Name (A–Z)</option>
          </select>
        </div>

        <div className="page-body stack-6">
          <div className="chip-row">
            {(
              [
                { id: 'all', label: 'Everything' },
                { id: 'skins', label: 'Skins' },
                { id: 'weapons', label: 'Weapons' },
                { id: 'ui', label: 'Interface' },
                { id: 'audio', label: 'Audio' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                className={`chip ${categoryFilter === cat.id ? 'is-active' : ''}`}
                aria-pressed={categoryFilter === cat.id}
                onClick={() => {
                  setCategoryFilter(cat.id);
                  setPage(1);
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {queue.length > 0 && (
            <div className="card card--pad">
              <div className="section-title">
                <Download style={{ width: 18, height: 18, color: 'var(--primary-text)' }} />
                <h2>Downloads</h2>
                <span className="badge badge--primary">{queue.length}</span>
              </div>
              <div className="queue">
                {queue.map((q) => (
                  <div key={q.queue_id} className="queue-item">
                    {q.status === 'error' ? (
                      <CloudOff style={{ width: 18, height: 18, color: 'var(--error)' }} />
                    ) : q.status === 'completed' ? (
                      <Check style={{ width: 18, height: 18, color: 'var(--success)' }} />
                    ) : (
                      <Loader2 className="spin" style={{ width: 18, height: 18, color: 'var(--primary-text)' }} />
                    )}
                    <div className="min-w-0" style={{ flex: 1 }}>
                      <div className="row" style={{ marginBottom: 6 }}>
                        <span className="truncate" style={{ fontWeight: 600, flex: 1 }}>
                          {q.title}
                        </span>
                        <span className="caption" style={{ color: q.status === 'error' ? 'var(--error)' : undefined }}>
                          {q.status === 'error' ? q.error || 'Failed' : q.stage_label}
                        </span>
                      </div>
                      <div className="progress">
                        <span style={{ width: `${q.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedAuthor && (
            <div className="card card--pad row-3 wrap">
              <Avatar src={selectedAuthor.avatarUrl} alt={selectedAuthor.name} size="lg" />
              <div className="min-w-0" style={{ flex: 1 }}>
                <div className="eyebrow">Creator</div>
                <div className="h3">{selectedAuthor.name}</div>
                <div className="small muted">
                  {displayedMods.length} mod{displayedMods.length === 1 ? '' : 's'} found
                </div>
              </div>
              {selectedAuthor.profileUrl && (
                <a className="btn btn--secondary btn--sm" href={selectedAuthor.profileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Profile
                </a>
              )}
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setSelectedAuthor(null);
                  setPage(1);
                }}
              >
                <ArrowLeft />
                Back
              </button>
            </div>
          )}

          {selectedAgentId !== 'ALL' && activeAgent && (
            <div className="card card--pad row-3 wrap">
              <Avatar src={activeAgent.gb_icon_url} fallbackSrc={activeAgent.portrait_svg} alt={activeAgent.display_name} size="lg" />
              <div className="min-w-0" style={{ flex: 1 }}>
                <div className="eyebrow">Character</div>
                <div className="h3">{activeAgent.display_name}</div>
                <div className="small muted">
                  {loadingAgent ? 'Loading outfits…' : `Outfits and mods made for ${activeAgent.display_name}`}
                </div>
              </div>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setSelectedAgentId('ALL');
                  setQuickTab('character');
                  setPage(1);
                }}
              >
                <ArrowLeft />
                All characters
              </button>
            </div>
          )}

          {showSpotlight && (
            <section>
              <div className="section-title">
                <Flame style={{ width: 18, height: 18, color: 'var(--primary-text)' }} />
                <h2>Featured this week</h2>
              </div>
              <div className="spotlight">
                {spotlightMods.map((spot) => (
                  <div
                    key={`spot-${spot.id}`}
                    className="spotlight__item"
                    data-tilt
                    role="button"
                    tabIndex={0}
                    onClick={() => openGallery(spot)}
                    onKeyDown={(e) => e.key === 'Enter' && openGallery(spot)}
                  >
                    <ThumbImage src={spot.thumbnail_url} alt={spot.title} motif={motif} loading="eager" />
                    <div className="spotlight__shade" />
                    <div className="spotlight__info">
                      <div className="min-w-0" style={{ flex: 1 }}>
                        <div className="spotlight__title clamp-2">{spot.title}</div>
                        <div className="spotlight__meta">
                          by {spot.author} · <Heart style={{ width: 12, height: 12, display: 'inline', verticalAlign: '-1px' }} />{' '}
                          {formatCount(spot.likes)}
                        </div>
                      </div>
                      <InstallButton item={spot} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showDirectory && (
            <section className="stack-4">
              <div className="row wrap">
                <div className="section-title" style={{ marginBottom: 0, flex: 1 }}>
                  <Users style={{ width: 18, height: 18, color: 'var(--primary-text)' }} />
                  <h2>Pick a character</h2>
                </div>
                <SearchInput value={characterDirectorySearch} onChange={setCharacterDirectorySearch} placeholder="Find a character" />
              </div>
              {filteredDirectoryAgents.length === 0 ? (
                <EmptyState icon={<SearchX />} title="No character found" tone="muted" compact>
                  Try a different name.
                </EmptyState>
              ) : (
                <div className="char-tiles">
                  {filteredDirectoryAgents.map((ag) => (
                    <button
                      key={ag.agent_id}
                      className="char-tile"
                      data-tilt
                      onClick={() => {
                        setSelectedAuthor(null);
                        setLoadingAgent(ag);
                        setSelectedAgentId(ag.agent_id);
                        setPage(1);
                      }}
                    >
                      <Avatar src={ag.gb_icon_url} fallbackSrc={ag.portrait_svg} alt={ag.display_name} />
                      <span className="truncate" style={{ fontWeight: 650, width: '100%' }}>
                        {ag.display_name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {!showDirectory && (
            <section>
              {showSpotlight && (
                <div className="section-title">
                  <Compass style={{ width: 18, height: 18, color: 'var(--primary-text)' }} />
                  <h2>More to explore</h2>
                </div>
              )}
              {feedError && displayedMods.length === 0 ? (
                <EmptyState
                  icon={<CloudOff />}
                  title="Couldn’t reach the mod site"
                  tone="error"
                  actions={
                    <button className="btn btn--primary" onClick={() => setReloadTick((t) => t + 1)}>
                      <RefreshCw />
                      Try again
                    </button>
                  }
                >
                  Check your internet connection. Your installed mods are not affected.
                </EmptyState>
              ) : (isLoading || loadingAgent) && displayedMods.length === 0 ? (
                <CardSkeletonGrid className="gb-grid" count={12} />
              ) : displayedMods.length === 0 ? (
                <EmptyState
                  icon={<SearchX />}
                  title="No mods found"
                  tone="muted"
                  compact
                  actions={
                    <button
                      className="btn btn--secondary"
                      onClick={() => {
                        setSearchQuery('');
                        setCategoryFilter('all');
                        handleQuickTabSwitch('featured');
                      }}
                    >
                      Reset filters
                    </button>
                  }
                >
                  Try a different search, category or character.
                </EmptyState>
              ) : (
                <div className="gb-grid">
                  {gridMods.map((item, i) => {
                    const blurred = Boolean(item.is_nsfw) && nsfwFilterState === 'blur' && !revealedNsfwIds.has(item.id);
                    const imageCount = item.preview_images?.length ?? 0;
                    return (
                      <article
                        key={item.id}
                        data-tilt
                        className="gb-card"
                        style={{ animationDelay: `${Math.min(i % 24, 12) * 25}ms` }}
                        onClick={() => openGallery(item)}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && openGallery(item)}
                      >
                        <div className="gb-card__thumb">
                          <ThumbImage src={item.thumbnail_url} alt={item.title} motif={motif} />
                          {blurred && (
                            <button
                              className="nsfw-cover"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRevealedNsfwIds((prev) => new Set(prev).add(item.id));
                              }}
                            >
                              <EyeOff />
                              Sensitive preview
                              <span className="caption" style={{ color: 'rgba(255,255,255,.8)' }}>
                                Click to show
                              </span>
                            </button>
                          )}
                          <div className="mod-card__tl">
                            <span className="badge badge--glass truncate" style={{ maxWidth: '65%' }}>
                              {item.agent_hint || item.category}
                            </span>
                            {imageCount > 1 && (
                              <span className="badge badge--glass">
                                <Images />
                                {imageCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="gb-card__body">
                          <div className="clamp-2" style={{ fontWeight: 650, lineHeight: 1.35 }} title={item.title}>
                            {item.title}
                          </div>
                          <div className="small muted truncate">
                            by{' '}
                            <button
                              type="button"
                              className="link-btn"
                              onClick={(e) => handleSelectAuthor(item, e)}
                              title={`More from ${item.author}`}
                            >
                              {item.author}
                            </button>
                          </div>
                          <div className="row" style={{ marginTop: 'auto', paddingTop: 4 }}>
                            <div className="gb-card__stats" style={{ marginTop: 0 }}>
                              <span title="Likes">
                                <Heart />
                                {formatCount(item.likes)}
                              </span>
                              <span title="Downloads">
                                <Download />
                                {formatCount(item.downloads)}
                              </span>
                              <span title="Views">
                                <Eye />
                                {formatCount(item.views)}
                              </span>
                            </div>
                            <span className="spacer" />
                            <InstallButton item={item} />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {displayedMods.length > 0 && (
                <div className="stack" style={{ alignItems: 'center', paddingTop: 32 }}>
                  <button className="btn btn--secondary btn--lg" onClick={() => setPage((pg) => pg + 1)} disabled={isLoading}>
                    {isLoading ? <Loader2 className="spin" /> : <ChevronRight style={{ transform: 'rotate(90deg)' }} />}
                    {isLoading ? 'Loading…' : 'Show more'}
                  </button>
                  {feedError && <span className="caption" style={{ color: 'var(--error)' }}>Couldn’t load more right now.</span>}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <Modal open={Boolean(galleryMod)} onClose={() => setGalleryMod(null)} size="xl" labelledBy="gallery-title">
        {galleryMod && (
          <>
            <div className="modal__header">
              <div className="min-w-0" style={{ flex: 1 }}>
                <div className="row wrap" style={{ marginBottom: 4 }}>
                  {galleryMod.agent_hint && <span className="badge badge--primary">{galleryMod.agent_hint}</span>}
                  <span className="badge">{galleryMod.category}</span>
                </div>
                <h2 id="gallery-title" className="h3 truncate">
                  {galleryMod.title}
                </h2>
                <div className="small muted">
                  by{' '}
                  <button type="button" className="link-btn" onClick={(e) => handleSelectAuthor(galleryMod, e)}>
                    {galleryMod.author}
                  </button>
                  {galleryMod.updated_at ? ` · updated ${galleryMod.updated_at}` : ''}
                </div>
              </div>
              <a
                className="btn btn--ghost btn--sm"
                href={`https://gamebanana.com/mods/${galleryMod.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink />
                Mod page
              </a>
              <button className="icon-btn" onClick={() => setGalleryMod(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <div className="gallery">
              <div className="gallery__stage">
                <div className="gallery__img">
                  <img key={currentGalleryIdx} src={galleryImages[currentGalleryIdx] || galleryMod.thumbnail_url} alt={galleryMod.title} />
                  {galleryImages.length > 1 && (
                    <>
                      <button
                        className="gallery__nav"
                        style={{ left: 8 }}
                        aria-label="Previous image"
                        onClick={() => setCurrentGalleryIdx((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1))}
                      >
                        <ChevronLeft />
                      </button>
                      <button
                        className="gallery__nav"
                        style={{ right: 8 }}
                        aria-label="Next image"
                        onClick={() => setCurrentGalleryIdx((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1))}
                      >
                        <ChevronRight />
                      </button>
                    </>
                  )}
                </div>
                {galleryImages.length > 1 && (
                  <div className="gallery__thumbs">
                    {galleryImages.map((img, idx) => (
                      <button
                        key={idx}
                        className={currentGalleryIdx === idx ? 'is-active' : ''}
                        onClick={() => setCurrentGalleryIdx(idx)}
                        aria-label={`Image ${idx + 1}`}
                      >
                        <img src={img} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="gallery__side">
                <div className="stack-4" style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
                  <InstallButton item={galleryMod} size="lg" block />
                  <div className="stat-grid">
                    <div className="stat-box">
                      <strong>{formatCount(galleryMod.likes ?? galleryMod.likes_count)}</strong>
                      <span className="caption">Likes</span>
                    </div>
                    <div className="stat-box">
                      <strong>{formatCount(galleryMod.downloads ?? galleryMod.downloads_count)}</strong>
                      <span className="caption">Downloads</span>
                    </div>
                    <div className="stat-box">
                      <strong>{formatCount(galleryMod.views ?? galleryMod.views_count)}</strong>
                      <span className="caption">Views</span>
                    </div>
                  </div>
                  <div>
                    <div className="row" style={{ marginBottom: 8 }}>
                      <span className="eyebrow" style={{ flex: 1 }}>
                        About
                      </span>
                      {isLoadingDetails && <Loader2 className="spin" style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />}
                    </div>
                    {modalDescription || galleryMod.description ? (
                      <p className="prose">{modalDescription || galleryMod.description}</p>
                    ) : isLoadingDetails ? (
                      <div className="stack">
                        <div className="skeleton" style={{ height: 12 }} />
                        <div className="skeleton" style={{ height: 12, width: '85%' }} />
                        <div className="skeleton" style={{ height: 12, width: '60%' }} />
                      </div>
                    ) : (
                      <p className="small muted">The creator didn’t add a description.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};
