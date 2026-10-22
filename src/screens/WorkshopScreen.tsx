import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Check,
  CircleAlert,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  ExternalLink,
  FlaskConical,
  Hammer,
  Info,
  Layers,
  Loader2,
  Share2,
  ShieldAlert,
  Shirt,
  Sparkles,
  Users,
} from 'lucide-react';
import { HeroDecor } from '../ui/HeroDecor';
import { PartViewer } from '../components/PartViewer';
import { Avatar, EmptyState, Modal, Segmented, Switch, ThumbImage, useToast } from '../ui';
import { CommunityPanel, PostDialog } from './CommunityPanel';
import type { CommunityProfile } from '../shared/community';
import { Motif } from '../themes/Motif';
import type { ThemeDefinition } from '../themes/types';
import { fairyClient, type FullAppState } from '../services/fairyClient';
import type {
  AgentHashEntry,
  HashDatabase,
  ModManifest,
  NsfwFilterState,
  WorkshopBuildResponse,
  WorkshopCatalogEntry,
  WorkshopPartCheck,
  WorkshopPreview,
  WorkshopRecipe,
  WorkshopResolvedRecipe,
} from '../shared/types';

interface Props {
  theme: ThemeDefinition;
  mods: ModManifest[];
  hashDb: HashDatabase;
  nsfwFilterState: NsfwFilterState;
  onState: (s: FullAppState) => void;
  onDownloadGameBananaMod: (id: number) => Promise<void>;
  onOpenLibrary: () => void;
}

/** part name -> chosen mod_uuid (missing = keep the original game model) */
type Picks = Record<string, string>;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const STATUS_LABEL = { good: 'Mixes well', risky: 'May not mix well', bad: 'Broken files' } as const;

const partCheck = (d: WorkshopCatalogEntry | undefined, part: string): WorkshopPartCheck | undefined =>
  d?.parts.find((p) => p.name === part)?.check;

const StatusBadge: React.FC<{ check?: WorkshopPartCheck; className?: string }> = ({ check, className = '' }) => {
  if (!check || check.status === 'good') return null;
  return (
    <span className={`ws-status ws-status--${check.status} ${className}`} title={check.notes.map((n) => n.text).join('\n')}>
      {check.status === 'bad' ? <CircleAlert /> : <AlertTriangle />}
      <span>{check.status === 'bad' ? 'Broken' : 'Risky'}</span>
    </span>
  );
};

const NoteList: React.FC<{ check?: WorkshopPartCheck }> = ({ check }) => {
  if (!check) return null;
  if (check.notes.length === 0) return <p className="small muted">No problems found. This part should come out cleanly.</p>;
  return (
    <ul className="ws-checks">
      {check.notes.map((n) => (
        <li key={n.text} className={`ws-checks__item ws-checks__item--${n.level}`}>
          {n.level === 'info' ? <Info /> : n.level === 'warn' ? <AlertTriangle /> : <CircleAlert />}
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
};

/** The 3D look at the part being taken out, plus what the check found. */
const PartPreviewCard: React.FC<{ donor: WorkshopCatalogEntry; part: string }> = ({ donor, part }) => {
  const [preview, setPreview] = useState<WorkshopPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setPreview(null);
    setError(null);
    const cached = previewCache.get(donor.mod_uuid);
    (cached ?? fairyClient.workshopPreview(donor.mod_uuid))
      .then((p) => {
        if (!cached) previewCache.set(donor.mod_uuid, Promise.resolve(p));
        if (live) setPreview(p);
      })
      .catch((e) => live && setError(errMsg(e)));
    return () => {
      live = false;
    };
  }, [donor.mod_uuid]);

  const check = partCheck(donor, part);
  const hasMesh = preview?.meshes.some((m) => m.part === part);
  const label = part === 'Other' ? 'Extras' : part;
  return (
    <div className="ws-preview">
      <div className="row" style={{ gap: 8 }}>
        <Box style={{ width: 16, height: 16, color: 'var(--primary-text)' }} />
        <b className="small truncate" style={{ flex: 1 }}>
          {label} from {donor.title}
        </b>
        {check && <span className={`ws-status ws-status--${check.status} ws-status--inline`}>{STATUS_LABEL[check.status]}</span>}
      </div>
      <div className="ws-preview__stage">
        {error ? (
          <div className="pv pv--empty small muted">Couldn’t read this mod’s model.</div>
        ) : !preview ? (
          <div className="pv pv--empty small muted">
            <Loader2 className="spin" /> Loading model…
          </div>
        ) : preview.meshes.length === 0 ? (
          <div className="pv pv--empty small muted">This mod has no model to show, only textures.</div>
        ) : (
          <PartViewer meshes={preview.meshes} highlight={part} />
        )}
        {preview && preview.meshes.length > 0 && (
          <div className="ws-preview__legend caption">
            {hasMesh ? (
              <>
                <i className="ws-preview__swatch" /> {label} (what you take) <i className="ws-preview__swatch ws-preview__swatch--gray" /> rest of this mod
              </>
            ) : (
              <>This part has no shape of its own. It changes colors or hides a piece.</>
            )}
          </div>
        )}
      </div>
      <NoteList check={check} />
    </div>
  );
};

const previewCache = new Map<string, Promise<WorkshopPreview>>();

export const WorkshopScreen: React.FC<Props> = ({ theme, mods, hashDb, nsfwFilterState, onState, onDownloadGameBananaMod, onOpenLibrary }) => {
  const notify = useToast();

  // Agents that have at least one installed mod.
  const agents = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of mods) if (hashDb.agents[m.agent_id]) counts.set(m.agent_id, (counts.get(m.agent_id) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ agent: hashDb.agents[id] as AgentHashEntry, count }))
      .sort((a, b) => b.count - a.count || a.agent.display_name.localeCompare(b.agent.display_name));
  }, [mods, hashDb]);

  const [agentId, setAgentId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<WorkshopCatalogEntry[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [picks, setPicks] = useState<Picks>({});
  const [name, setName] = useState('');
  const [markNsfw, setMarkNsfw] = useState(false);
  const [activate, setActivate] = useState(true);
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<WorkshopBuildResponse | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeRecipe, setCodeRecipe] = useState<WorkshopRecipe | null>(null);
  const [tab, setTab] = useState<'build' | 'community'>('build');
  const [me, setMe] = useState<CommunityProfile | null>(null);
  const [posting, setPosting] = useState<WorkshopCatalogEntry | null>(null);
  const [communityRefresh, setCommunityRefresh] = useState(0);
  /** The tile last clicked, shown in the 3D preview. */
  const [focus, setFocus] = useState<{ part: string; modUuid: string } | null>(null);

  useEffect(() => {
    fairyClient.communityMe().then(setMe).catch(() => setMe(null));
  }, []);

  const signIn = async () => {
    try {
      const profile = await fairyClient.communitySignIn();
      setMe(profile);
      notify({ tone: 'success', title: `Signed in as ${profile.display_name}` });
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t sign in', message: errMsg(e) });
    }
  };

  useEffect(() => {
    if (!agentId && agents.length) setAgentId(agents[0].agent.agent_id);
  }, [agents, agentId]);

  const loadCatalog = async (id: string) => {
    setLoadingCatalog(true);
    try {
      setCatalog(await fairyClient.workshopCatalog(id));
    } catch (e) {
      setCatalog([]);
      notify({ tone: 'error', title: 'Couldn’t read your mods', message: errMsg(e) });
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    if (!agentId) return;
    setPicks({});
    setFocus(null);
    previewCache.clear();
    loadCatalog(agentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const agent = agentId ? hashDb.agents[agentId] : null;
  const donors = (catalog ?? []).filter((c) => !c.is_workshop && !(c.is_nsfw && nsfwFilterState === 'hide'));
  const yours = (catalog ?? []).filter((c) => c.is_workshop);
  const partNames = useMemo(() => {
    const order: string[] = [];
    for (const d of donors) for (const p of d.parts) if (!order.includes(p.name)) order.push(p.name);
    const rank = (p: string) => (p === 'Other' ? 1 : 0);
    return order.sort((a, b) => rank(a) - rank(b));
  }, [donors]);
  const pickedCount = Object.keys(picks).length;
  const pickedNsfw = Object.values(picks).some((uuid) => donors.find((d) => d.mod_uuid === uuid)?.is_nsfw);
  const pickedChecks = Object.entries(picks).map(([part, uuid]) => ({ part, check: partCheck(donors.find((d) => d.mod_uuid === uuid), part) }));
  const riskyPicks = pickedChecks.filter((p) => p.check && p.check.status !== 'good');
  const focusDonor = focus ? donors.find((d) => d.mod_uuid === focus.modUuid) : undefined;

  const build = async () => {
    if (!agentId) return;
    setBuilding(true);
    try {
      const res = await fairyClient.workshopBuild({
        agentId,
        name: name.trim(),
        picks: Object.entries(picks).map(([part, modUuid]) => ({ part, modUuid })),
        markNsfw,
        activate,
      });
      onState(res.state);
      setResult(res);
      setPicks({});
      setName('');
      setMarkNsfw(false);
      loadCatalog(agentId);
    } catch (e) {
      notify({ tone: 'error', title: 'Couldn’t build the mod', message: errMsg(e) });
    } finally {
      setBuilding(false);
    }
  };

  const copy = async (text: string, what = 'Share code') => {
    try {
      await navigator.clipboard.writeText(text);
      notify({ tone: 'success', title: `${what} copied` });
    } catch {
      notify({ tone: 'error', title: 'Couldn’t copy', message: 'Select the code and copy it with Ctrl+C.' });
    }
  };

  return (
    <div className="screen">
      <div className="scroll">
        <section className="page-hero">
          <Motif kind={theme.motif} className="page-hero__motif" density={22} opacity={0.5} seed="workshop" animated />
          <HeroDecor />
          <div className="page-hero__glow" />
          <div className="page-hero__content">
            <div className="eyebrow">
              <FlaskConical style={{ width: 14, height: 14, verticalAlign: '-2px' }} /> Experimental
            </div>
            <h1 className="display page-hero__title">Mod Workshop</h1>
            <p className="page-hero__subtitle">Take parts from mods you already have and put them together into your own.</p>
          </div>
        </section>

        <div className="page-body stack-4">
          <Segmented<'build' | 'community'>
            ariaLabel="Workshop"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'build', label: 'Build', icon: <Hammer /> },
              { value: 'community', label: 'Community', icon: <Users /> },
            ]}
          />

          {tab === 'community' && (
            <CommunityPanel
              theme={theme}
              hashDb={hashDb}
              nsfwFilterState={nsfwFilterState}
              refreshKey={communityRefresh}
              me={me}
              onMeChange={setMe}
              onGet={(recipe) => {
                setCodeRecipe(recipe);
                setCodeOpen(true);
              }}
            />
          )}

          {tab === 'build' && (
          <>
          <ol className="ws-steps" aria-label="How it works">
            <li>
              <b>1</b> Pick an agent
            </li>
            <li>
              <b>2</b> Choose a mod for each part, or keep the original
            </li>
            <li>
              <b>3</b> Name it and save it to your Library
            </li>
          </ol>

          {agents.length === 0 ? (
            <EmptyState icon={<Layers />} title="No mods to work with yet" motif={theme.motif}>
              Install a few skins for the same agent first. Then come back and mix their parts.
            </EmptyState>
          ) : (
            <>
              <section className="card card--pad">
                <div className="row wrap" style={{ marginBottom: 12 }}>
                  <h2 className="h3">Agent</h2>
                  <div className="spacer" />
                  <button className="btn btn--ghost btn--sm" onClick={() => setCodeOpen(true)}>
                    <ClipboardPaste /> Use a share code
                  </button>
                </div>
                <div className="chip-row" role="radiogroup" aria-label="Agent">
                  {agents.map(({ agent: a, count }) => (
                    <button
                      key={a.agent_id}
                      role="radio"
                      aria-checked={a.agent_id === agentId}
                      className={`chip ws-agent ${a.agent_id === agentId ? 'is-active' : ''}`}
                      onClick={() => setAgentId(a.agent_id)}
                    >
                      <Avatar src={a.gb_icon_url} fallbackSrc={a.portrait_svg} alt="" />
                      {a.display_name}
                      <span className="chip__count">{count}</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="ws-layout">
                <section className="card card--pad ws-parts" aria-busy={loadingCatalog}>
                  <h2 className="h3" style={{ marginBottom: 4 }}>
                    Parts
                  </h2>
                  <p className="small muted" style={{ marginBottom: 16 }}>
                    Parts you don’t choose stay as the original game model. Click a part to see it highlighted on the model.
                    Parts marked <span className="ws-status ws-status--risky ws-status--inline">Risky</span> may not look right on their own.
                  </p>
                  {loadingCatalog ? (
                    <div className="row muted">
                      <Loader2 className="spin" /> Reading {agent?.display_name}’s mods…
                    </div>
                  ) : partNames.length === 0 ? (
                    <p className="muted">
                      None of {agent?.display_name}’s mods could be split into parts. Mods made with the standard ZZMI tools work best.
                    </p>
                  ) : (
                    partNames.map((part) => (
                      <div key={part} className="ws-part">
                        <div className="ws-part__label">
                          <Shirt />
                          <span>{part === 'Other' ? 'Extras' : part}</span>
                        </div>
                        <div className="ws-part__options" role="radiogroup" aria-label={part}>
                          <button
                            role="radio"
                            aria-checked={!picks[part]}
                            className={`ws-option ws-option--original ${!picks[part] ? 'is-active' : ''}`}
                            onClick={() => {
                              setPicks(({ [part]: _drop, ...rest }) => rest);
                              if (focus?.part === part) setFocus(null);
                            }}
                          >
                            <span className="ws-option__thumb ws-option__thumb--original">
                              <Sparkles />
                            </span>
                            <span className="ws-option__title">Original</span>
                          </button>
                          {donors
                            .filter((d) => d.parts.some((p) => p.name === part))
                            .map((d) => {
                              const active = picks[part] === d.mod_uuid;
                              const check = partCheck(d, part);
                              const blur = d.is_nsfw && nsfwFilterState === 'blur';
                              return (
                                <button
                                  key={d.mod_uuid}
                                  role="radio"
                                  aria-checked={active}
                                  className={`ws-option ${active ? 'is-active' : ''}`}
                                  onClick={() => {
                                    setPicks((p) => ({ ...p, [part]: d.mod_uuid }));
                                    setFocus({ part, modUuid: d.mod_uuid });
                                  }}
                                  title={`${d.title}${d.author ? ` by ${d.author}` : ''}${check && check.status !== 'good' ? `\n${STATUS_LABEL[check.status]}: ${check.notes.filter((n) => n.level !== 'info').map((n) => n.text).join(' ')}` : ''}`}
                                >
                                  <span className={`ws-option__thumb ${blur ? 'is-blurred' : ''}`}>
                                    <ThumbImage src={d.thumbnail_url} alt={d.title} motif={theme.motif} />
                                    {d.is_nsfw && <span className="badge badge--error ws-option__flag">18+</span>}
                                    <StatusBadge check={check} className="ws-option__status" />
                                    {active && (
                                      <span className="ws-option__check">
                                        <Check />
                                      </span>
                                    )}
                                  </span>
                                  <span className="ws-option__title">{d.title}</span>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    ))
                  )}
                </section>

                <aside className="card card--pad ws-summary">
                  <h2 className="h3">Your mod</h2>
                  {focus && focusDonor ? (
                    <PartPreviewCard donor={focusDonor} part={focus.part} />
                  ) : (
                    <div className="ws-preview ws-preview--idle small muted">
                      <Box /> Pick a part to see what you’re taking out of that mod.
                    </div>
                  )}
                  <ul className="ws-summary__list">
                    {partNames.map((part) => {
                      const d = donors.find((x) => x.mod_uuid === picks[part]);
                      const check = partCheck(d, part);
                      return (
                        <li key={part}>
                          <span>{part === 'Other' ? 'Extras' : part}</span>
                          <span className={`row ${d ? '' : 'muted'}`} style={{ gap: 6, justifyContent: 'flex-end', minWidth: 0 }}>
                            {d ? (
                              <button className="ws-summary__link truncate" onClick={() => setFocus({ part, modUuid: d.mod_uuid })} title="Show on the model">
                                {d.title}
                              </button>
                            ) : (
                              'Original'
                            )}
                            <StatusBadge check={check} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <label className="stack" style={{ gap: 6 }}>
                    <span className="small" style={{ fontWeight: 650 }}>
                      Name
                    </span>
                    <input
                      className="input"
                      value={name}
                      maxLength={60}
                      placeholder={agent ? `My ${agent.display_name.split(' ')[0]} mix` : 'My mix'}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <div className="setting">
                    <div className="setting__text">
                      <div className="setting__title">Turn it on now</div>
                      <div className="setting__desc">Also turns off this agent’s other mods so they don’t overlap.</div>
                    </div>
                    <Switch checked={activate} onChange={() => setActivate(!activate)} label="Turn it on now" />
                  </div>
                  <div className="setting">
                    <div className="setting__text">
                      <div className="setting__title">Has nudity or skimpy clothing</div>
                      <div className="setting__desc">Labels it 18+. Parts from 18+ mods are labeled automatically.</div>
                    </div>
                    <Switch checked={markNsfw || pickedNsfw} disabled={pickedNsfw} onChange={() => setMarkNsfw(!markNsfw)} label="Has nudity or skimpy clothing" />
                  </div>
                  {riskyPicks.length > 0 && (
                    <div className="ws-note ws-note--caution">
                      <AlertTriangle />
                      <p className="small">
                        {riskyPicks.some((p) => p.check?.status === 'bad')
                          ? 'Some parts you picked have broken files and will likely look wrong in game. '
                          : 'Some parts you picked may not look right on their own. '}
                        You can still build it. Click a part above to see why.
                      </p>
                    </div>
                  )}
                  <button className="btn btn--primary btn--lg" style={{ width: '100%' }} disabled={building || pickedCount === 0 || !name.trim()} onClick={build}>
                    {building ? <Loader2 className="spin" /> : <Hammer />}
                    {building ? 'Building…' : 'Build my mod'}
                  </button>
                  {pickedCount === 0 && <p className="caption">Choose at least one part.</p>}
                  {pickedCount > 0 && !name.trim() && <p className="caption">Give it a name.</p>}
                </aside>
              </div>

              {yours.length > 0 && (
                <section className="card card--pad">
                  <h2 className="h3" style={{ marginBottom: 12 }}>
                    Made by you
                  </h2>
                  <div className="ws-yours">
                    {yours.map((y) => (
                      <div key={y.mod_uuid} className="ws-yours__item">
                        <span className={`ws-option__thumb ${y.is_nsfw && nsfwFilterState === 'blur' ? 'is-blurred' : ''}`}>
                          <ThumbImage src={y.thumbnail_url} alt={y.title} motif={theme.motif} />
                        </span>
                        <div className="min-w-0" style={{ flex: 1 }}>
                          <div className="truncate" style={{ fontWeight: 650 }}>
                            {y.title}
                          </div>
                          <div className="caption">
                            {y.parts.map((p) => p.name).join(' · ')}
                            {y.is_nsfw ? ' · 18+' : ''}
                          </div>
                        </div>
                        <button className="btn btn--primary btn--sm" onClick={() => setPosting(y)}>
                          <Users /> Post
                        </button>
                        <button
                          className="btn btn--secondary btn--sm"
                          onClick={async () => {
                            try {
                              await copy(await fairyClient.workshopShareCode(y.mod_uuid));
                            } catch (e) {
                              notify({ tone: 'error', title: 'Couldn’t make a share code', message: errMsg(e) });
                            }
                          }}
                        >
                          <Share2 /> Share code
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          </>
          )}
        </div>
      </div>

      <Modal open={Boolean(result)} onClose={() => setResult(null)} labelledBy="ws-done-title">
        {result && (
          <div className="stack-4" style={{ padding: 24 }}>
            <h2 id="ws-done-title" className="h3">
              <Check style={{ verticalAlign: '-3px', color: 'var(--success)' }} /> “{result.mod?.title ?? 'Your mod'}” is in your Library
            </h2>
            {result.isNsfw && (
              <div className="ws-note ws-note--warn">
                <ShieldAlert />
                <div>
                  <b>Labeled 18+</b>
                  <p className="small">{result.nsfwReasons.join('. ')}.</p>
                </div>
              </div>
            )}
            {[...result.warnings, ...result.missingFiles.map((f) => `Missing file in a source mod: ${f}`)].map((w) => (
              <div key={w} className="ws-note">
                <p className="small">{w}</p>
              </div>
            ))}
            <div className="stack" style={{ gap: 6 }}>
              <b className="small">Share with friends</b>
              <p className="small muted">
                The code lists which part came from which mod. ProxyLaunch shows your friends where to get those mods, so the original creators keep their credit and downloads.
              </p>
              <div className="row">
                <input className="input input--mono" readOnly value={result.shareCode} onFocus={(e) => e.currentTarget.select()} aria-label="Share code" />
                <button className="btn btn--secondary" onClick={() => copy(result.shareCode)}>
                  <ClipboardCopy /> Copy
                </button>
              </div>
            </div>
            <div className="row">
              <div className="spacer" />
              <button className="btn btn--ghost" onClick={() => setResult(null)}>
                Make another
              </button>
              <button
                className="btn btn--primary"
                onClick={() => {
                  setResult(null);
                  onOpenLibrary();
                }}
              >
                Open Library
              </button>
            </div>
          </div>
        )}
      </Modal>

      <PostDialog
        mod={posting ? { mod_uuid: posting.mod_uuid, title: posting.title, gamebanana_ok: posting.shareable !== false } : null}
        me={me}
        onSignIn={signIn}
        onClose={() => setPosting(null)}
        onPosted={() => setCommunityRefresh((n) => n + 1)}
      />

      <ShareCodeDialog
        open={codeOpen}
        theme={theme}
        hashDb={hashDb}
        initialRecipe={codeRecipe}
        onClose={() => {
          setCodeOpen(false);
          setCodeRecipe(null);
        }}
        onDownload={onDownloadGameBananaMod}
        onUse={(resolved) => {
          setCodeOpen(false);
          setCodeRecipe(null);
          setTab('build');
          setAgentId(resolved.recipe.agent_id);
          // Wait for the agent's catalog, then apply the picks.
          fairyClient.workshopCatalog(resolved.recipe.agent_id).then((cat) => {
            setCatalog(cat);
            const next: Picks = {};
            for (const p of resolved.parts) if (p.modUuid && p.hasPart) next[p.part] = p.modUuid;
            setPicks(next);
            setName(resolved.recipe.name);
            setMarkNsfw(resolved.recipe.is_nsfw);
          });
        }}
      />
    </div>
  );
};

const ShareCodeDialog: React.FC<{
  open: boolean;
  theme: ThemeDefinition;
  hashDb: HashDatabase;
  /** Opened from a community post instead of a pasted code. */
  initialRecipe?: WorkshopRecipe | null;
  onClose: () => void;
  onDownload: (id: number) => Promise<void>;
  onUse: (r: WorkshopResolvedRecipe) => void;
}> = ({ open, hashDb, initialRecipe, onClose, onDownload, onUse }) => {
  const [code, setCode] = useState('');
  const [resolved, setResolved] = useState<WorkshopResolvedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | 'check' | null>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setResolved(null);
      setError(null);
      if (initialRecipe) check();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRecipe]);

  const check = async (c = code) => {
    setBusy('check');
    setError(null);
    try {
      setResolved(initialRecipe ? await fairyClient.workshopResolveRecipe(initialRecipe) : await fairyClient.workshopResolveCode(c));
    } catch (e) {
      setResolved(null);
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const ready = resolved && resolved.parts.every((p) => p.modUuid && p.hasPart);
  const agentName = resolved ? hashDb.agents[resolved.recipe.agent_id]?.display_name : '';

  return (
    <Modal open={open} onClose={onClose} size="wide" labelledBy="ws-code-title">
      <div className="stack-4" style={{ padding: 24 }}>
        <h2 id="ws-code-title" className="h3">
          {initialRecipe ? 'Get this mod' : 'Use a share code'}
        </h2>
        {!initialRecipe && (
        <div className="row">
          <input
            className="input input--mono"
            placeholder="PLR1:…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && code.trim() && check()}
            aria-label="Share code"
            autoFocus
          />
          <button className="btn btn--secondary" disabled={!code.trim() || busy === 'check'} onClick={() => check()}>
            {busy === 'check' ? <Loader2 className="spin" /> : <Check />} Check
          </button>
        </div>
        )}
        {initialRecipe && busy === 'check' && !resolved && (
          <div className="row muted">
            <Loader2 className="spin" /> Checking which mods you have…
          </div>
        )}
        {error && <p className="small" style={{ color: 'var(--error)' }}>{error}</p>}

        {resolved && (
          <>
            <div>
              <b>{resolved.recipe.name}</b>
              <span className="muted"> · {agentName}</span>
              {resolved.recipe.is_nsfw && <span className="badge badge--error" style={{ marginLeft: 8 }}>18+</span>}
            </div>
            <ul className="ws-summary__list">
              {resolved.parts.map((p) => (
                <li key={p.part}>
                  <span>{p.part === 'Other' ? 'Extras' : p.part}</span>
                  <span className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                    <span className="truncate">
                      {p.source.title}
                      {p.source.author ? <span className="muted"> by {p.source.author}</span> : null}
                    </span>
                    {p.modUuid && p.hasPart ? (
                      <span className="badge badge--success">
                        <Check /> Installed
                      </span>
                    ) : p.source.gamebanana_id ? (
                      <>
                        <button
                          className="btn btn--secondary btn--sm"
                          disabled={busy !== null}
                          onClick={async () => {
                            setBusy(p.source.gamebanana_id!);
                            try {
                              await onDownload(p.source.gamebanana_id!);
                              await check();
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          {busy === p.source.gamebanana_id ? <Loader2 className="spin" /> : <Download />} Download
                        </button>
                        <button
                          className="btn btn--ghost btn--sm"
                          title="Open on GameBanana"
                          onClick={() => fairyClient.openExternal(`https://gamebanana.com/mods/${p.source.gamebanana_id}`)}
                        >
                          <ExternalLink />
                        </button>
                      </>
                    ) : (
                      <span className="badge badge--warning">Not on GameBanana</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {!ready && <p className="small muted">Get the missing mods first. Parts from mods you don’t have are skipped.</p>}
          </>
        )}

        <div className="row">
          <div className="spacer" />
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={!resolved || !resolved.parts.some((p) => p.modUuid && p.hasPart)} onClick={() => resolved && onUse(resolved)}>
            <Hammer /> {ready ? 'Load it' : 'Load what I have'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
