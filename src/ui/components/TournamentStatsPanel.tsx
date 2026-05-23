// src/ui/components/TournamentStatsPanel.tsx
import type { Team } from '../../types';
import type { TournamentStats, TournamentPlayerStat } from '../../sim/tournamentStats';
import { PlayerAvatar } from './PlayerAvatar';
import './TournamentStatsPanel.css';

interface Props {
  stats: TournamentStats;
  teams: Team[];
}

const ROLE_ICONS: Record<string, string> = {
  duelist:    '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator:  '/logos/regions/initiatorIcon.png',
  sentinel:   '/logos/regions/sentinelIcon.png',
  flex:       '/logos/regions/filler.png',
};

const Icon = ({ type }: { type: string }) => {
  const base = { width: 14, height: 14, viewBox: '0 0 16 16', style: { flexShrink: 0 } } as const;
  if (type === 'acs') return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth={1.5}>
      <polyline points="2,12 6,6 9,9 14,3" /><polyline points="11,3 14,3 14,6" />
    </svg>
  );
  if (type === 'kd') return (
    <svg {...base} fill="currentColor">
      <path d="M8 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-5 9c0-2 2-3 5-3s5 1 5 3v1H3v-1z" />
      <line x1="11" y1="5" x2="15" y2="9" stroke="var(--danger)" strokeWidth={1.8} strokeLinecap="round" />
      <line x1="15" y1="5" x2="11" y2="9" stroke="var(--danger)" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
  if (type === 'kills') return (
    <svg {...base} fill="currentColor">
      <circle cx="8" cy="6" r="3.5" /><path d="M2.5 14c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4H2.5z" />
    </svg>
  );
  if (type === 'fk') return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M8 2v12M3 7l5-5 5 5" />
    </svg>
  );
  if (type === 'clutch') return (
    <svg {...base} fill="currentColor">
      <path d="M8 1l1.8 3.6L14 5.6l-3 2.9.7 4.1L8 10.5l-3.7 2.1.7-4.1-3-2.9 4.2-.6L8 1z" />
    </svg>
  );
  if (type === 'hs') return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <circle cx="8" cy="8" r="5" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <line x1="8" y1="1" x2="8" y2="3.5" /><line x1="8" y1="12.5" x2="8" y2="15" />
      <line x1="1" y1="8" x2="3.5" y2="8" /><line x1="12.5" y1="8" x2="15" y2="8" />
    </svg>
  );
  return (
    <svg {...base} fill="currentColor">
      <path d="M2 3h12v1.5H2V3zm0 3h10v1.5H2V6zm0 3h8v1.5H2V9zm0 3h6v1.5H2V12z" />
    </svg>
  );
};

interface BoardDef {
  label: string;
  icon: string;
  key: keyof TournamentPlayerStat;
  format: (v: number) => string;
  accentColor: string;
  minVal?: number;
  minMaps?: number;
}

const BOARDS: BoardDef[] = [
  { label: 'ACS Leaders',       icon: 'acs',    key: 'avgAcs',   format: v => String(v),    accentColor: 'var(--warning)',        minMaps: 1 },
  { label: 'K/D Leaders',       icon: 'kd',     key: 'kd',       format: v => v.toFixed(2), accentColor: 'var(--success)',        minMaps: 2 },
  { label: 'Kill Leaders',      icon: 'kills',  key: 'kills',    format: v => String(v),    accentColor: 'var(--accent)',         minMaps: 1 },
  { label: 'First Kills / Map', icon: 'fk',     key: 'fkPerMap', format: v => v.toFixed(1), accentColor: 'var(--role-initiator)', minMaps: 2 },
  { label: 'Clutch Kings',      icon: 'clutch', key: 'clutches', format: v => String(v),    accentColor: 'var(--role-sentinel)',  minVal: 1, minMaps: 1 },
  { label: 'HS% Leaders',       icon: 'hs',     key: 'hsPct',    format: v => `${v}%`,      accentColor: 'var(--role-flex)',      minVal: 1, minMaps: 2 },
];

// shared team row used in both leaderboard rows and narrative player strip
const TeamRow = ({ teamAbbr, teamLogo, role, seed }: { teamAbbr: string; teamLogo?: string; role?: string; seed?: number }) => (
  <div className="tsp-team-row">
    {role && ROLE_ICONS[role] && (
      <img src={ROLE_ICONS[role]} alt={role} className="tsp-role-icon" title={role} />
    )}
    {teamLogo && <img src={teamLogo} alt="" className="tsp-team-logo" />}
    <span className="tsp-team-abbr">{teamAbbr}</span>
    {seed !== undefined && <span className="tsp-seed-badge">#{seed}</span>}
  </div>
);

export function TournamentStatsPanel({ stats, teams }: Props) {
  const teamMap = new Map(teams.map(t => [t.id, t]));

  if (stats.matchesPlayed === 0) {
    return (
      <div className="tsp-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
          <circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" strokeLinecap="round" />
        </svg>
        <p>No matches played yet.</p>
        <p>Stats will appear as the tournament progresses.</p>
      </div>
    );
  }

  const renderRow = (p: TournamentPlayerStat, rank: number, def: BoardDef) => {
    const team = teamMap.get(p.teamId);
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    return (
      <div className="tsp-row" key={p.playerId}>
        <span className={`tsp-rank ${rankClass}`}>{rank}</span>
        <div className="tsp-avatar-wrap">
          <PlayerAvatar playerName={p.playerName} imageUrl={p.imageUrl} nationality={p.nationality} size="sm" showFlag />
        </div>
        <div className="tsp-player-info">
          <div className="tsp-name-age">
            <span className="tsp-player-name">{p.playerName}</span>
            {p.age !== undefined && <span className="tsp-age-badge">{p.age}</span>}
          </div>
          <TeamRow teamAbbr={team?.abbreviation ?? p.teamId} teamLogo={team?.logo} role={p.role} seed={p.teamSeed} />
        </div>
        <span className="tsp-maps-badge">{p.mapsPlayed} maps</span>
        <span className="tsp-stat-val" style={{ color: def.accentColor }}>
          {def.format(p[def.key] as number)}
        </span>
      </div>
    );
  };

  const renderBoard = (def: BoardDef) => {
    const rows = stats.players
      .filter(p => {
        if (def.minMaps && p.mapsPlayed < def.minMaps) return false;
        if (def.minVal !== undefined && (p[def.key] as number) < def.minVal) return false;
        return true;
      })
      .sort((a, b) => (b[def.key] as number) - (a[def.key] as number))
      .slice(0, 5);
    if (rows.length === 0) return null;
    return (
      <div className="tsp-board" key={String(def.key)}>
        <div className="tsp-board-header" style={{ borderLeftColor: def.accentColor }}>
          <Icon type={def.icon} />
          <span>{def.label}</span>
        </div>
        <div className="tsp-board-rows">
          {rows.map((p, i) => renderRow(p, i + 1, def))}
        </div>
      </div>
    );
  };

  return (
    <div className="tsp-wrap">
      {stats.narratives.length > 0 && (
        <div className="tsp-section">
          <div className="tsp-section-header">
            <Icon type="narrative" />
            Tournament Storylines
          </div>
          <div className="tsp-narrative-grid">
            {stats.narratives.map((n, i) => {
              const team = n.player ? teamMap.get(n.player.teamId) : null;
              return (
                <div className="tsp-narrative-item" key={i}>
                  {/* player avatar first */}
                  {n.player && (
                    <div className="tsp-narrative-player">
                      <div className="tsp-avatar-wrap">
                        <PlayerAvatar playerName={n.player.playerName} imageUrl={n.player.imageUrl} nationality={n.player.nationality} size="sm" showFlag />
                      </div>
                      <div className="tsp-narrative-identity">
                        <span className="tsp-narrative-name">{n.player.playerName}</span>
                        <TeamRow teamAbbr={team?.abbreviation ?? n.player.teamId} teamLogo={team?.logo} role={n.player.role} seed={n.player.teamSeed} />
                      </div>
                    </div>
                  )}
                  {/* label + highlighted text */}
                  <div className="tsp-narrative-body">
                    <span className="tsp-narrative-cat">{n.label}</span>
                    <span className="tsp-narrative-text">
                      {n.highlightValue
                        ? (() => {
                            // split on the value but preserve surrounding spaces
                            const val = n.highlightValue;
                            const idx = n.text.indexOf(val);
                            if (idx === -1) return n.text;
                            const before = n.text.slice(0, idx);
                            const after = n.text.slice(idx + val.length);
                            // ensure a space between highlight and following word
                            const sep = after.length > 0 && after[0] !== ' ' ? ' ' : '';
                            return (
                              <>
                                {before}<strong className="tsp-narrative-highlight">{val}</strong>{sep}{after}
                              </>
                            );
                          })()
                        : n.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="tsp-boards">
        {BOARDS.map(def => renderBoard(def))}
      </div>
    </div>
  );
}
