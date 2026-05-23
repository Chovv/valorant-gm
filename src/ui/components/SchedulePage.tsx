// src/ui/components/SchedulePage.tsx
// Daily matchups page with round-by-round navigation

import { useState, useMemo, useEffect } from 'react';
import type { Team, StandingsEntry, SuspendedMatchInfo } from '../../types';
import type { TodayMatchup } from '../../sim/gameState';
import { getTeamOverall } from '../../sim/teamRatings';
import './SchedulePage.css';

const REGION_LOGOS: Record<string, string> = {
  americas: '/logos/regions/Americas.png',
  emea: '/logos/regions/EMEA.png',
  pacific: '/logos/regions/Pacific.png',
  china: '/logos/regions/China.png',
  international: '/logos/regions/Champions.png',
};

const REGION_NAMES: Record<string, string> = {
  americas: 'Americas',
  emea: 'EMEA',
  pacific: 'Pacific',
  china: 'China',
  international: 'Champions',
};

const ROLE_ICONS: Record<string, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

function getOvrColor(overall: number): string {
  if (overall >= 90) return '#ffd700';
  if (overall >= 80) return 'var(--accent)';
  if (overall >= 70) return 'var(--success)';
  if (overall >= 55) return 'var(--warning)';
  return 'var(--text-muted)';
}

interface SchedulePageProps {
  teams: Team[];
  standings: StandingsEntry[];
  userTeamId: string | null;
  currentDay: number;
  currentRoundIdx: number;
  totalRounds: number;
  getMatchupsForRound: (roundIdx: number) => TodayMatchup[];
  getRoundLabel: (roundIdx: number) => string;
  getPhaseLabel: (roundIdx: number) => string;
  onSimMatchup: (matchupId: string) => void;
  onWatchMatchup: (matchupId: string) => void;
  suspendedMatchupId: string | null;
  suspendedMatchInfo: SuspendedMatchInfo | null;
  onMatchClick: (matchupId: string) => void;
}

export function SchedulePage({
  teams,
  standings,
  userTeamId,
  currentDay,
  currentRoundIdx,
  totalRounds,
  getMatchupsForRound,
  getRoundLabel,
  getPhaseLabel,
  onSimMatchup,
  onWatchMatchup,
  suspendedMatchupId,
  suspendedMatchInfo,
  onMatchClick,
}: SchedulePageProps) {
  const [viewedRound, setViewedRound] = useState(currentRoundIdx);

  // Snap to current round when it changes (e.g. after sim/advance)
  useEffect(() => {
    setViewedRound(currentRoundIdx);
  }, [currentRoundIdx]);

  const isCurrentRound = viewedRound === currentRoundIdx;
  const isPastRound = viewedRound < currentRoundIdx;
  const isFutureRound = viewedRound > currentRoundIdx;

  const matchups = useMemo(() => getMatchupsForRound(viewedRound), [viewedRound, getMatchupsForRound]);
  const roundName = getRoundLabel(viewedRound);
  const phaseLabel = getPhaseLabel(viewedRound);

  const getTeam = (teamId: string) => teams.find(t => t.id === teamId);

  const getRecord = (teamId: string) => {
    const entry = standings.find(s => s.teamId === teamId);
    return entry ? `${entry.wins}-${entry.losses}` : '0-0';
  };

  const getStarPlayer = (team: Team | undefined) => {
    if (!team || team.roster.length === 0) return null;
    const starterIds = team.startingLineup
      ? new Set(team.startingLineup.map(s => s.playerId))
      : new Set(team.roster.slice(0, 5).map(p => p.id));
    const starters = team.roster.filter(p => starterIds.has(p.id));
    if (starters.length === 0) return null;
    return [...starters].sort((a, b) => b.overall - a.overall)[0];
  };

  // Group matchups by region
  const grouped = useMemo(() => {
    const map = new Map<string, TodayMatchup[]>();
    for (const m of matchups) {
      const key = m.region;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [matchups]);

  // Render a TBD team row
  const renderTbdRow = () => {
    return (
      <div className="smc-team-row tbd">
        <div className="smc-logo-placeholder" />
        <div className="smc-team-details">
          <span className="smc-name tbd">TBD</span>
          <span className="smc-meta">Pending</span>
        </div>
        <div className="smc-star" />
        <div className="smc-action" />
      </div>
    );
  };

  // Render one team row inside a matchup card
  const renderTeamRow = (
    team: Team | undefined,
    matchup: TodayMatchup,
    side: 'team1' | 'team2'
  ) => {
    if (!team) return renderTbdRow();
    const star = getStarPlayer(team);
    const ovr = getTeamOverall(team.roster);
    const record = getRecord(team.id);
    const isUser = team.id === userTeamId;
    const isSuspended = matchup.matchupId === suspendedMatchupId;
    const isWinner = !isSuspended && matchup.played && matchup.winnerId === team.id;
    const isLoser = !isSuspended && matchup.played && matchup.winnerId !== null && matchup.winnerId !== team.id;

    const score = !isSuspended && matchup.played && matchup.result
      ? (side === 'team1' ? matchup.result.homeScore : matchup.result.awayScore)
      : null;

    // Only show action buttons on the current round for unplayed matches
    const showButtons = isCurrentRound && !matchup.played && matchup.team1Id && matchup.team2Id;

    return (
      <div className={`smc-team-row ${isUser ? 'is-user' : ''} ${isWinner ? 'is-winner' : ''} ${isLoser ? 'is-loser' : ''}`}>
        <img src={team.logo} alt="" className="smc-logo" />

        <div className="smc-team-details">
          <span className={`smc-name ${isUser ? 'user' : ''}`}>{team.name}</span>
          <span className="smc-meta">
            {record}, {ovr} ovr
          </span>
        </div>

        <div className="smc-star">
          {star && (
            <>
              <img src={ROLE_ICONS[star.role] || ROLE_ICONS.flex} alt="" className="smc-star-role-icon" />
              <span className="smc-star-name">{star.name}</span>
            </>
          )}
          {star && (
            <span className="smc-star-ovr" style={{ color: getOvrColor(star.overall) }}>
              {star.overall}
            </span>
          )}
        </div>

        <div className="smc-action">
          {matchup.matchupId === suspendedMatchupId && side === 'team1' ? (
            <button className="smc-btn live" onClick={(e) => { e.stopPropagation(); onWatchMatchup(matchup.matchupId); }}>Now<br />Live</button>
          ) : matchup.matchupId === suspendedMatchupId && side === 'team2' ? (
            null
          ) : matchup.played && score !== null ? (
            <span className={`smc-score ${isWinner ? 'winner' : ''}`}>{score}</span>
          ) : showButtons ? (
            side === 'team1' ? (
              <button className="smc-btn watch" onClick={(e) => { e.stopPropagation(); onWatchMatchup(matchup.matchupId); }}>Watch<br />game</button>
            ) : (
              <button className="smc-btn sim" onClick={(e) => { e.stopPropagation(); onSimMatchup(matchup.matchupId); }}>Sim<br />game</button>
            )
          ) : null}
        </div>
      </div>
    );
  };

  // Check if a matchup has at least one TBD team
  const hasTbd = (m: TodayMatchup) => !m.team1Id || !m.team2Id;

  return (
    <div className="schedule-page">
      <div className="content-header">
        <h1>Schedule</h1>
      </div>

      {/* Round navigation banner */}
      <div className="smc-round-banner">
        <button
          className="smc-nav-btn"
          disabled={viewedRound <= 0}
          onClick={() => setViewedRound(v => Math.max(0, v - 1))}
        >
          ◀
        </button>

        <div className="smc-round-info">
          <span className="smc-phase-label">{phaseLabel}</span>
          <span className="smc-round-name">{roundName}</span>
          {isCurrentRound && <span className="smc-current-badge">Current</span>}
          {isPastRound && <span className="smc-past-badge">Completed</span>}
          {isFutureRound && <span className="smc-future-badge">Upcoming</span>}
        </div>

        <button
          className="smc-nav-btn"
          disabled={viewedRound >= totalRounds - 1}
          onClick={() => setViewedRound(v => Math.min(totalRounds - 1, v + 1))}
        >
          ▶
        </button>
      </div>

      {/* Jump-to-current button when browsing other rounds */}
      {!isCurrentRound && (
        <button className="smc-jump-current" onClick={() => setViewedRound(currentRoundIdx)}>
          ↩ Back to current round
        </button>
      )}

      {/* Empty state */}
      {matchups.length === 0 && (
        <div className="schedule-empty">
          <div className="empty-icon">📅</div>
          <h3>No Matches</h3>
          <p>No matchups available for this round yet.</p>
        </div>
      )}

      {/* Matchups grouped by region */}
      {matchups.length > 0 && (
        <div className="smc-regions">
          {Array.from(grouped.entries()).map(([regionKey, regionMatchups]) => (
            <div key={regionKey} className="smc-region-group">
              <div className="smc-region-header">
                {REGION_LOGOS[regionKey] && (
                  <img src={REGION_LOGOS[regionKey]} alt="" className="smc-region-logo" />
                )}
                <span className="smc-region-name">{REGION_NAMES[regionKey] || regionKey}</span>
                <span className="smc-region-count">
                  {regionMatchups.filter(m => m.played).length}/{regionMatchups.length} played
                </span>
              </div>

              <div className="smc-grid">
                {regionMatchups.map(matchup => {
                  const team1 = matchup.team1Id ? getTeam(matchup.team1Id) : undefined;
                  const team2 = matchup.team2Id ? getTeam(matchup.team2Id) : undefined;
                  const isUser = matchup.team1Id === userTeamId || matchup.team2Id === userTeamId;
                  const isTbd = hasTbd(matchup);
                  const isSuspended = matchup.matchupId === suspendedMatchupId;
                  const effectivePlayed = matchup.played && !isSuspended;
                  const clickable = effectivePlayed;

                  return (
                    <div
                      key={matchup.matchupId}
                      className={`smc-card ${isUser ? 'user-match' : ''} ${effectivePlayed ? 'played' : isTbd ? 'tbd' : 'pending'} ${isSuspended ? 'live' : ''} ${clickable ? 'clickable' : ''}`}
                      onClick={clickable ? () => onMatchClick(matchup.matchupId) : undefined}
                    >
                      {renderTeamRow(team1, matchup, 'team1')}
                      <div className="smc-divider" />
                      {renderTeamRow(team2, matchup, 'team2')}

                      <div className="smc-card-footer">
                        <span className="smc-format-badge">{matchup.format.toUpperCase()}</span>
                        {isSuspended && suspendedMatchInfo && (
                          <span className="smc-status-badge live-badge">
                            ● Map {suspendedMatchInfo.mapNumber}: {suspendedMatchInfo.mapName} · {suspendedMatchInfo.homeMapScore}-{suspendedMatchInfo.awayMapScore} · Series {suspendedMatchInfo.homeSeriesScore}-{suspendedMatchInfo.awaySeriesScore}
                          </span>
                        )}
                        {isSuspended && !suspendedMatchInfo && <span className="smc-status-badge live-badge">● In Progress</span>}
                        {effectivePlayed && <span className="smc-status-badge final">Final</span>}
                        {!matchup.played && !isSuspended && !isTbd && <span className="smc-status-badge pending">Upcoming</span>}
                        {isTbd && <span className="smc-status-badge tbd-badge">TBD</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
