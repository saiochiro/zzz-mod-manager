import React, { useMemo, useState } from 'react';
import { Layers, Sparkles } from 'lucide-react';
import type { AgentHashEntry, ModManifest } from '../shared/types';
import { Avatar, SearchInput } from '../ui';

interface AgentRosterSidebarProps {
  agents: Record<string, AgentHashEntry>;
  mods: ModManifest[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
}

/** Character filter panel for the Library. Characters with mods float to the top. */
export const AgentRosterSidebar: React.FC<AgentRosterSidebarProps> = ({ agents, mods, selectedAgentId, onSelectAgent }) => {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(() => {
    const map = new Map<string, { total: number; active: number }>();
    for (const m of mods) {
      const s = map.get(m.agent_id) || { total: 0, active: 0 };
      s.total++;
      if (m.enabled) s.active++;
      map.set(m.agent_id, s);
    }
    return map;
  }, [mods]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(agents)
      .filter((ag) => !q || ag.display_name.toLowerCase().includes(q) || ag.faction.toLowerCase().includes(q))
      .sort((a, b) => {
        const ca = stats.get(a.agent_id)?.total ?? 0;
        const cb = stats.get(b.agent_id)?.total ?? 0;
        if (ca !== cb) return cb - ca;
        return a.display_name.localeCompare(b.display_name);
      });
  }, [agents, stats, query]);

  const withMods = list.filter((a) => (stats.get(a.agent_id)?.total ?? 0) > 0);
  const without = list.filter((a) => (stats.get(a.agent_id)?.total ?? 0) === 0);
  const visibleWithout = query || showAll ? without : [];
  const globalCount = stats.get('uncategorized')?.total ?? 0;

  const Row: React.FC<{ id: string; name: string; meta: string; avatar: React.ReactNode }> = ({ id, name, meta, avatar }) => (
    <button
      className={`char-row ${selectedAgentId === id ? 'is-active' : ''}`}
      onClick={() => onSelectAgent(id)}
      aria-pressed={selectedAgentId === id}
    >
      {avatar}
      <span className="min-w-0" style={{ flex: 1 }}>
        <span className="char-row__name truncate" style={{ display: 'block' }}>
          {name}
        </span>
        <span className="char-row__meta truncate" style={{ display: 'block' }}>
          {meta}
        </span>
      </span>
    </button>
  );

  const metaFor = (id: string) => {
    const s = stats.get(id);
    if (!s || s.total === 0) return 'No mods yet';
    return s.active > 0 ? `${s.active} of ${s.total} on` : `${s.total} installed`;
  };

  return (
    <>
      <div className="charpanel__head">
        <div className="eyebrow">Characters</div>
        <SearchInput value={query} onChange={setQuery} placeholder="Find a character" />
      </div>
      <div className="charpanel__list">
        <Row
          id="ALL"
          name="All mods"
          meta={`${mods.length} installed`}
          avatar={<Avatar alt="All" icon={<Layers style={{ color: 'var(--primary-text)' }} />} />}
        />
        <Row
          id="uncategorized"
          name="UI & effects"
          meta={globalCount ? `${globalCount} installed` : 'No mods yet'}
          avatar={<Avatar alt="UI" icon={<Sparkles style={{ color: 'var(--secondary-text)' }} />} />}
        />
        {withMods.length > 0 && <div className="eyebrow" style={{ padding: '12px 8px 4px' }}>Your characters</div>}
        {withMods.map((ag) => (
          <Row
            key={ag.agent_id}
            id={ag.agent_id}
            name={ag.display_name}
            meta={metaFor(ag.agent_id)}
            avatar={
              <Avatar
                src={ag.gb_icon_url}
                fallbackSrc={ag.portrait_svg}
                alt={ag.display_name}
                live={(stats.get(ag.agent_id)?.active ?? 0) > 0}
              />
            }
          />
        ))}
        {visibleWithout.length > 0 && <div className="eyebrow" style={{ padding: '12px 8px 4px' }}>Everyone else</div>}
        {visibleWithout.map((ag) => (
          <Row
            key={ag.agent_id}
            id={ag.agent_id}
            name={ag.display_name}
            meta="No mods yet"
            avatar={<Avatar src={ag.gb_icon_url} fallbackSrc={ag.portrait_svg} alt={ag.display_name} />}
          />
        ))}
        {!query && without.length > 0 && (
          <button className="btn btn--ghost btn--sm" style={{ margin: '8px 4px' }} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `Show all ${Object.keys(agents).length} characters`}
          </button>
        )}
        {list.length === 0 && (
          <div className="caption" style={{ padding: 12 }}>
            No character matches “{query}”.
          </div>
        )}
      </div>
    </>
  );
};
