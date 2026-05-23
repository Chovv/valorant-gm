// src/ui/components/RegionalContextPanel.tsx
import { useState } from 'react';
import type { Team } from '../../types';
import type { TournamentStats, PlayerToWatch, RegionalVsIntlStat } from '../../sim/tournamentStats';
import { TournamentStatsPanel } from './TournamentStatsPanel';
import { PlayerAvatar } from './PlayerAvatar';
import './RegionalContextPanel.css';

interface Props {
  tournamentStats: TournamentStats;
  playersToWatch: PlayerToWatch[];
  regionalVsIntl: RegionalVsIntlStat[];
  teams: Team[];
}

const ROLE_ICONS: Record<string, string> = {
  duelist:    '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator:  '/logos/regions/initiatorIcon.png',
  sentinel:   '/logos/regions/sentinelIcon.png',
  flex:       '/logos/regions/filler.png',
};

const REGION_ABBR: Record<string, string> = {
  americas: 'AMR', emea: 'EMEA', pacific: 'PAC', china: 'CHN',
};

// matches ChampionsBracketView region colors
const REGION_COLORS: Record<string, string> = {
  americas: '#e74c3c',
  emea:     '#3498db',
  pacific:  '#2ecc71',
  china:    '#f1c40f',
};

const STAT_COLORS: Record<string, string> = {
  'ACS':      'var(--warning)',
  'K/D':      'var(--success)',
  'FK / Map': 'var(--role-initiator)',
  'HS%':      'var(--role-flex)',
  'Clutches': 'var(--role-sentinel)',
  'Maps':     'var(--text-secondary)',
};

const VERDICT_META: Record<string, { label: string; color: string }> = {
  stepped_up: { label: 'Stepped Up', color: 'var(--success)' },
  surprise:   { label: 'Surprise',   color: 'var(--warning)' },
  fell_off:   { label: 'Fell Off',   color: 'var(--danger)' },
  consistent: { label: 'Consistent', color: 'var(--role-sentinel)' },
};

function CollapseIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
      <polyline points="3,5 8,11 13,5" />
    </svg>
  );
}

function SectionHeader({ icon, title, sub, open, onToggle }: {
  icon: React.ReactNode; title: string; sub?: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button className="rcp-section-header" onClick={onToggle}>
      {icon}
      <span className="rcp-section-title">{title}</span>
      {sub && <span className="rcp-section-sub">{sub}</span>}
      <CollapseIcon open={open} />
    </button>
  );
}

export function RegionalContextPanel({ tournamentStats, playersToWatch, regionalVsIntl, teams }: Props) {
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const hasIntlData = tournamentStats.matchesPlayed > 0;

  const [watchOpen, setWatchOpen] = useState(true);
  const [compareOpen, setCompareOpen] = useState(true);
  const [leaderboardOpen, setLeaderboardOpen] = useState(true);

  const TeamRow = ({ teamId, role }: { teamId: string; role?: string }) => {
    const team = teamMap.get(teamId);
    return (
      <div className="rcp-team-row">
        {role && ROLE_ICONS[role] && <img src={ROLE_ICONS[role]} alt={role} className="rcp-role-icon" title={role} />}
        {team?.logo && <img src={team.logo} alt="" className="rcp-team-logo" />}
        <span className="rcp-team-abbr">{team?.abbreviation ?? teamId}</span>
      </div>
    );
  };

  const WatchIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
      <line x1="8" y1="1" x2="8" y2="3" strokeLinecap="round" />
      <line x1="8" y1="13" x2="8" y2="15" strokeLinecap="round" />
      <line x1="1" y1="8" x2="3" y2="8" strokeLinecap="round" />
      <line x1="13" y1="8" x2="15" y2="8" strokeLinecap="round" />
    </svg>
  );

  const CompareIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0 }}>
      <line x1="8" y1="1" x2="8" y2="15" strokeLinecap="round" />
      <polyline points="4,5 8,1 12,5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="4,11 8,15 12,11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const LeaderboardIcon = () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M2 3h12v1.5H2V3zm0 3h10v1.5H2V6zm0 3h8v1.5H2V9zm0 3h6v1.5H2V12z" />
    </svg>
  );

  return (
    <div className="rcp-wrap">
      {/* players to watch */}
      {playersToWatch.length > 0 && (
        <div className="rcp-section">
          <SectionHeader
            icon={<WatchIcon />}
            title="Players to Watch"
            sub="Based on regional performance"
            open={watchOpen}
            onToggle={() => setWatchOpen(v => !v)}
          />
          {watchOpen && (
            <div className="rcp-watch-grid">
              {playersToWatch.map(({ player, reason, statLabel, statValue, seed }) => {
                const regionAbbr = REGION_ABBR[player.region] ?? player.region.toUpperCase();
                const seedTag = seed ? `${regionAbbr} #${seed}` : regionAbbr;
                const regionColor = REGION_COLORS[player.region] ?? 'var(--text-muted)';
                return (
                  <div className="rcp-watch-card" key={player.playerId}>
                    <div className="rcp-watch-avatar">
                      <PlayerAvatar playerName={player.playerName} imageUrl={player.imageUrl} nationality={player.nationality} size="md" showFlag />
                    </div>
                    <div className="rcp-watch-body">
                      <div className="rcp-watch-top">
                        <span className="rcp-watch-name">{player.playerName}</span>
                      </div>
                      <div className="rcp-team-seed-row">
                        <TeamRow teamId={player.teamId} role={player.role} />
                        <span className="rcp-seed-tag" style={{ color: regionColor, background: `${regionColor}18`, borderColor: `${regionColor}44` }}>{seedTag}</span>
                      </div>
                      <p className="rcp-watch-reason">{reason}</p>
                    </div>
                    <div className="rcp-watch-stat">
                      <span className="rcp-watch-stat-val" style={{ color: STAT_COLORS[statLabel] ?? 'var(--warning)' }}>{statValue}</span>
                      <span className="rcp-watch-stat-label">{statLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* regional vs intl comparison */}
      {hasIntlData && regionalVsIntl.length > 0 && (
        <div className="rcp-section">
          <SectionHeader
            icon={<CompareIcon />}
            title="Regionals vs Internationals"
            sub="How players are translating their form"
            open={compareOpen}
            onToggle={() => setCompareOpen(v => !v)}
          />
          {compareOpen && (() => {
            const renderGroup = (verdict: string) => {
              const rows = regionalVsIntl.filter(p => p.verdict === verdict);
              const meta = VERDICT_META[verdict];
              const arrow = verdict === 'fell_off' ? '↘' : '↗';
              return (
                <div className="rcp-verdict-col" key={verdict} style={{ borderTopColor: meta.color }}>
                  <div className="rcp-verdict-col-header">
                    <span style={{ color: meta.color }}>{meta.label}</span>
                    <span className="rcp-verdict-group-count">{rows.length} player{rows.length !== 1 ? 's' : ''}</span>
                  </div>
                  {rows.length === 0 ? (
                    <div className="rcp-verdict-empty">None this tournament</div>
                  ) : (
                    <table className="rcp-compare-table">
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th className="rcp-th-center">Reg ACS</th>
                          <th className="rcp-th-center">Intl ACS</th>
                          <th className="rcp-th-right">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(p => (
                          <tr key={p.playerId} className="rcp-compare-row">
                            <td className="rcp-compare-player-cell">
                              <PlayerAvatar playerName={p.playerName} imageUrl={p.imageUrl} nationality={p.nationality} size="xs" showFlag />
                              <div className="rcp-compare-identity">
                                <span className="rcp-compare-name">{p.playerName}</span>
                                <TeamRow teamId={p.teamId} role={p.role} />
                              </div>
                            </td>
                            <td className="rcp-td-center rcp-stat-muted">{p.regionalAcs}</td>
                            <td className="rcp-td-center" style={{ color: meta.color, fontWeight: 700 }}>{p.intlAcs}</td>
                            <td className="rcp-td-right">
                              <span className="rcp-delta" style={{ color: meta.color }}>
                                {p.acsDelta > 0 ? '+' : ''}{p.acsDelta}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            };
            return (
              <div className="rcp-verdict-cols">
                {renderGroup('stepped_up')}
                {renderGroup('surprise')}
                {renderGroup('fell_off')}
              </div>
            );
          })()}
        </div>
      )}

      {/* full tournament leaderboards */}
      {hasIntlData && (
        <div className="rcp-section">
          <SectionHeader
            icon={<LeaderboardIcon />}
            title="Tournament Leaderboards"
            sub={`${tournamentStats.matchesPlayed} matches played`}
            open={leaderboardOpen}
            onToggle={() => setLeaderboardOpen(v => !v)}
          />
          {leaderboardOpen && <TournamentStatsPanel stats={tournamentStats} teams={teams} />}
        </div>
      )}

      {!hasIntlData && playersToWatch.length === 0 && (
        <div className="tsp-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
            <circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" strokeLinecap="round" />
          </svg>
          <p>Tournament hasn't started yet.</p>
        </div>
      )}
    </div>
  );
}
