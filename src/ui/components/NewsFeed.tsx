// src/ui/components/NewsFeed.tsx
import type { NewsItem } from '../../sim/gameState';
import type { Team, Player, Region } from '../../types';
import { PlayerAvatar } from './PlayerAvatar';
import './NewsFeed.css';

const REGION_NAMES: Record<Region, string> = {
  americas: 'NA',
  emea: 'EU',
  pacific: 'APAC',
  china: 'CN',
};

interface NewsFeedProps {
  news: NewsItem[];
  teams: Team[];
  userRegion: Region;
  filterRegion?: Region | 'all' | null;
  onFilterChange?: (region: Region | 'all') => void;
}

export function NewsFeed({ news, teams, userRegion, filterRegion, onFilterChange }: NewsFeedProps) {
  const activeFilter = filterRegion ?? userRegion;

  const setFilter = (r: Region | 'all') => {
    onFilterChange?.(r);
  };

  const getTeam = (id: string) => teams.find(t => t.id === id);
  const getPlayer = (id: string): Player | undefined => {
    for (const team of teams) {
      const p = team.roster.find(r => r.id === id);
      if (p) return p;
    }
    return undefined;
  };

  const filtered = news
    .filter(item => activeFilter === 'all' || item.region === activeFilter)
    .slice()
    .reverse()
    .slice(0, 100);

  const grouped: Array<{ day: number; year: number; items: NewsItem[] }> = [];
  for (const item of filtered) {
    const last = grouped[grouped.length - 1];
    if (last && last.day === item.day && last.year === item.year) {
      last.items.push(item);
    } else {
      grouped.push({ day: item.day, year: item.year, items: [item] });
    }
  }

  const regions: Array<Region | 'all'> = ['all', 'americas', 'emea', 'pacific', 'china'];

  return (
    <>
      <div className="content-header">
        <h1>VCT News</h1>
      </div>

      <div className="news-filters">
        {regions.map(r => (
          <button
            key={r}
            className={`news-filter-btn ${activeFilter === r ? 'active' : ''}`}
            onClick={() => setFilter(r)}
          >
            {r === 'all' ? 'All Regions' : REGION_NAMES[r]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <div className="panel-body" style={{ padding: 32, color: 'var(--text-muted)', textAlign: 'center' }}>
            No notable performances yet — standout stat lines will appear here as the season progresses.
          </div>
        </div>
      ) : (
        <div className="news-list">
          {grouped.map((group, gi) => (
            <div key={gi}>
              <div className="news-day-divider">
                <span>Day {group.day}</span>
              </div>
              {group.items.map(item => {
                const team = getTeam(item.teamId);
                const player = getPlayer(item.playerId);
                const isRecord = item.type === 'record_broken';
                const isHistoric = item.type === 'historic_map';
                const isSeries = item.type === 'series_record';
                const cardClass = isRecord ? 'record' : isHistoric ? 'historic' : isSeries ? 'series' : 'monster';

                return (
                  <div key={item.id} className={`news-card ${cardClass}`}>
                    <div className="news-card-accent" />
                    <div className="news-card-content">
                      <div className="news-card-top">
                        <div className="news-player-avatar">
                          {player && (
                            <PlayerAvatar
                              playerId={player.id}
                              playerName={player.name}
                              imageUrl={player.imageUrl}
                              nationality={player.nationality}
                              size="sm"
                            />
                          )}
                        </div>
                        <div className="news-card-meta">
                          <div className="news-team-info">
                            {team && <img src={team.logo} alt="" className="news-team-logo" />}
                            <span className="news-team-abbr">{team?.abbreviation}</span>
                            <span className="news-region-tag">{REGION_NAMES[item.region]}</span>
                            {isRecord && <span className="news-type-badge record">NEW RECORD</span>}
                            {isHistoric && <span className="news-type-badge historic">HISTORIC</span>}
                            {isSeries && <span className="news-type-badge series">SERIES</span>}
                          </div>
                          <div className="news-headline">{item.headline}</div>
                        </div>
                      </div>

                      <div className="news-body">{item.body}</div>

                      {isRecord && item.oldRecordHolder && (
                        <div className="news-old-record">
                          Previous record: {item.oldRecordValue} by {item.oldRecordHolder}
                        </div>
                      )}

                      <div className="news-stats">
                        {item.stat.kills !== undefined && (
                          <div className="news-stat-chip">
                            <span className="news-stat-num">{item.stat.kills}</span>
                            <span className="news-stat-label">K</span>
                          </div>
                        )}
                        {item.stat.deaths !== undefined && (
                          <div className="news-stat-chip">
                            <span className="news-stat-num">{item.stat.deaths}</span>
                            <span className="news-stat-label">D</span>
                          </div>
                        )}
                        {item.stat.kd !== undefined && (
                          <div className="news-stat-chip highlight">
                            <span className="news-stat-num">{item.stat.kd.toFixed(2)}</span>
                            <span className="news-stat-label">KD</span>
                          </div>
                        )}
                        {item.stat.acs !== undefined && (
                          <div className="news-stat-chip">
                            <span className="news-stat-num">{item.stat.acs}</span>
                            <span className="news-stat-label">ACS</span>
                          </div>
                        )}
                        {item.stat.totalKills !== undefined && (
                          <div className="news-stat-chip highlight">
                            <span className="news-stat-num">{item.stat.totalKills}</span>
                            <span className="news-stat-label">Total K</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
