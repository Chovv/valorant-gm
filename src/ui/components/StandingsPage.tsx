// src/ui/components/StandingsPage.tsx
// Revamped standings page with playoff picture, H2H records, and better highlighting

import { useState, useMemo } from 'react';
import type { Team, Region, StandingsEntry } from '../../types';
import type { ScheduledMatch } from '../../sim/gameState';
import './StandingsPage.css';

const REGION_LOGOS: Record<Region, string> = {
  americas: '/logos/regions/Americas.png',
  emea: '/logos/regions/EMEA.png',
  pacific: '/logos/regions/Pacific.png',
  china: '/logos/regions/China.png',
};

const REGION_NAMES: Record<Region, string> = {
  americas: 'Americas',
  emea: 'EMEA',
  pacific: 'Pacific',
  china: 'China',
};

interface StandingsPageProps {
  standings: StandingsEntry[];
  teams: Team[];
  schedule: ScheduledMatch[];
  userTeamId: string | null;
  selectedRegion: Region;
  onRegionChange: (region: Region) => void;
  onViewTeam: (teamId: string) => void;
  playoffsStarted: boolean;
}

export function StandingsPage({
  standings,
  teams,
  schedule,
  userTeamId,
  selectedRegion,
  onRegionChange,
  onViewTeam,
  playoffsStarted,
}: StandingsPageProps) {
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [showH2H, setShowH2H] = useState(false);

  // Get teams and standings for current region
  const regionTeams = useMemo(() => {
    return teams.filter(t => t.region === selectedRegion);
  }, [teams, selectedRegion]);

  const regionStandings = useMemo(() => {
    return [...standings]
      .filter(s => regionTeams.some(t => t.id === s.teamId))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        const aMapDiff = a.mapWins - a.mapLosses;
        const bMapDiff = b.mapWins - b.mapLosses;
        if (bMapDiff !== aMapDiff) return bMapDiff - aMapDiff;
        return b.roundDifferential - a.roundDifferential;
      });
  }, [standings, regionTeams]);

  // Calculate head-to-head record between two teams
  const getH2HRecord = (teamAId: string, teamBId: string) => {
    let teamAWins = 0;
    let teamBWins = 0;
    let teamAMapWins = 0;
    let teamBMapWins = 0;

    schedule.forEach(match => {
      if (!match.played || !match.result) return;
      if (match.region !== selectedRegion) return;

      const isRelevant = 
        (match.homeTeamId === teamAId && match.awayTeamId === teamBId) ||
        (match.homeTeamId === teamBId && match.awayTeamId === teamAId);

      if (!isRelevant) return;

      const teamAIsHome = match.homeTeamId === teamAId;
      const teamAScore = teamAIsHome ? match.result.homeScore : match.result.awayScore;
      const teamBScore = teamAIsHome ? match.result.awayScore : match.result.homeScore;

      if (teamAScore > teamBScore) teamAWins++;
      else teamBWins++;

      // Count map wins
      match.result.mapScores?.forEach(mapScore => {
        const teamARounds = teamAIsHome ? mapScore.homeRounds : mapScore.awayRounds;
        const teamBRounds = teamAIsHome ? mapScore.awayRounds : mapScore.homeRounds;
        if (teamARounds > teamBRounds) teamAMapWins++;
        else teamBMapWins++;
      });
    });

    return { teamAWins, teamBWins, teamAMapWins, teamBMapWins };
  };

  // Get last 5 match results for a team
  const getRecentForm = (teamId: string) => {
    const teamMatches = schedule
      .filter(m => m.played && m.result && m.region === selectedRegion)
      .filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId)
      .sort((a, b) => b.day - a.day)
      .slice(0, 5);

    return teamMatches.map(match => {
      const isHome = match.homeTeamId === teamId;
      const teamScore = isHome ? match.result!.homeScore : match.result!.awayScore;
      const oppScore = isHome ? match.result!.awayScore : match.result!.homeScore;
      return teamScore > oppScore ? 'W' : 'L';
    }).reverse();
  };

  // Get team by ID
  const getTeam = (teamId: string) => teams.find(t => t.id === teamId);

  // Calculate user team's position
  const userTeamRank = regionStandings.findIndex(s => s.teamId === userTeamId) + 1;

  // Playoff cutoff (top 6)
  const playoffCutoff = 6;

  return (
    <div className="standings-page">
      {/* Header */}
      <div className="content-header">
        <img
          src={REGION_LOGOS[selectedRegion]}
          alt=""
          className="region-header-logo"
        />
        <h1>{REGION_NAMES[selectedRegion]} Standings</h1>
      </div>

      {/* Region Tabs */}
      <div className="region-tabs">
        {(['americas', 'emea', 'pacific', 'china'] as Region[]).map(region => (
          <button
            key={region}
            className={`region-tab ${selectedRegion === region ? 'active' : ''}`}
            onClick={() => onRegionChange(region)}
          >
            <img src={REGION_LOGOS[region]} alt="" className="region-tab-logo" />
            {REGION_NAMES[region]}
          </button>
        ))}
      </div>

      {/* Layout: Standings + Playoff Picture */}
      <div className="standings-layout">
        {/* Main Standings Table */}
        <div className="standings-main">
          {/* View Toggle */}
          <div className="standings-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showH2H}
                onChange={(e) => setShowH2H(e.target.checked)}
              />
              Show Head-to-Head Records
            </label>
          </div>

          <div className="standings-table-container">
            <table className="standings-table-revamped">
              <thead>
                <tr>
                  <th className="rank-col">#</th>
                  <th className="team-col">Team</th>
                  <th className="record-col">Record</th>
                  <th className="maps-col">Maps</th>
                  <th className="rd-col" title="Round Differential">RD</th>
                  <th className="form-col">Form</th>
                  {playoffsStarted && <th className="status-col">Status</th>}
                </tr>
              </thead>
              <tbody>
                {regionStandings.map((entry, idx) => {
                  const team = getTeam(entry.teamId);
                  const isUser = entry.teamId === userTeamId;
                  const rank = idx + 1;
                  const madePlayoffs = rank <= playoffCutoff;
                  const onBubble = rank === playoffCutoff || rank === playoffCutoff + 1;
                  const form = getRecentForm(entry.teamId);
                  const isExpanded = expandedTeamId === entry.teamId;
                  const mapDiff = entry.mapWins - entry.mapLosses;

                  return (
                    <>
                      <tr
                        key={entry.teamId}
                        className={`
                          standings-row
                          ${isUser ? 'user-row' : ''}
                          ${madePlayoffs ? 'playoff-position' : 'eliminated-position'}
                          ${onBubble ? 'bubble-position' : ''}
                          ${isExpanded ? 'expanded' : ''}
                        `}
                        onClick={() => setExpandedTeamId(isExpanded ? null : entry.teamId)}
                      >
                        <td className="rank-col">
                          <div className={`rank-badge ${madePlayoffs ? 'playoff' : 'out'}`}>
                            {rank}
                          </div>
                        </td>
                        <td className="team-col">
                          <div
                            className="team-info"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (team) onViewTeam(team.id);
                            }}
                          >
                            <img src={team?.logo} alt="" className="team-logo" />
                            <div className="team-details">
                              <span className="team-name">{team?.name}</span>
                              <span className="team-abbr">{team?.abbreviation}</span>
                            </div>
                            {isUser && <span className="user-badge">YOU</span>}
                          </div>
                        </td>
                        <td className="record-col">
                          <span className="record-wins">{entry.wins}</span>
                          <span className="record-sep">-</span>
                          <span className="record-losses">{entry.losses}</span>
                        </td>
                        <td className="maps-col">
                          <span className="map-record">
                            {entry.mapWins}-{entry.mapLosses}
                          </span>
                          <span className={`map-diff ${mapDiff > 0 ? 'positive' : mapDiff < 0 ? 'negative' : ''}`}>
                            {mapDiff > 0 ? '+' : ''}{mapDiff}
                          </span>
                        </td>
                        <td className="rd-col">
                          <span className={`rd-value ${entry.roundDifferential > 0 ? 'positive' : entry.roundDifferential < 0 ? 'negative' : ''}`}>
                            {entry.roundDifferential > 0 ? '+' : ''}{entry.roundDifferential}
                          </span>
                        </td>
                        <td className="form-col">
                          <div className="form-indicators">
                            {form.length === 0 ? (
                              <span className="no-games">-</span>
                            ) : (
                              form.map((result, i) => (
                                <span
                                  key={i}
                                  className={`form-dot ${result === 'W' ? 'win' : 'loss'}`}
                                  title={result === 'W' ? 'Win' : 'Loss'}
                                >
                                  {result}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        {playoffsStarted && (
                          <td className="status-col">
                            {madePlayoffs ? (
                              <span className="clinch-badge clinched">x - Clinched</span>
                            ) : (
                              <span className="clinch-badge eliminated">e - Eliminated</span>
                            )}
                          </td>
                        )}
                      </tr>

                      {/* Expanded H2H Row */}
                      {showH2H && isExpanded && (
                        <tr className="h2h-row">
                          <td colSpan={playoffsStarted ? 7 : 6}>
                            <div className="h2h-container">
                              <h4>Head-to-Head Records</h4>
                              <div className="h2h-grid">
                                {regionStandings
                                  .filter(s => s.teamId !== entry.teamId)
                                  .map(opponent => {
                                    const oppTeam = getTeam(opponent.teamId);
                                    const h2h = getH2HRecord(entry.teamId, opponent.teamId);
                                    const hasPlayed = h2h.teamAWins + h2h.teamBWins > 0;

                                    return (
                                      <div
                                        key={opponent.teamId}
                                        className={`h2h-card ${!hasPlayed ? 'not-played' : ''}`}
                                      >
                                        <img src={oppTeam?.logo} alt="" className="h2h-logo" />
                                        <span className="h2h-abbr">{oppTeam?.abbreviation}</span>
                                        {hasPlayed ? (
                                          <>
                                            <span className={`h2h-record ${
                                              h2h.teamAWins > h2h.teamBWins ? 'winning' :
                                              h2h.teamAWins < h2h.teamBWins ? 'losing' : 'tied'
                                            }`}>
                                              {h2h.teamAWins}-{h2h.teamBWins}
                                            </span>
                                            <span className="h2h-maps">
                                              Maps: {h2h.teamAMapWins}-{h2h.teamBMapWins}
                                            </span>
                                          </>
                                        ) : (
                                          <span className="h2h-not-played">Not played</span>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Playoff Cutoff Line */}
                      {rank === playoffCutoff && rank < regionStandings.length && (
                        <tr className="playoff-cutoff-row">
                          <td colSpan={playoffsStarted ? 7 : 6}>
                            <div className="playoff-cutoff-line">
                              <span>Playoff Cutoff</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Playoff Picture Sidebar */}
        <div className="playoff-picture">
          <div className="playoff-picture-header">
            <h3>🏆 Playoff Picture</h3>
          </div>

          <div className="playoff-bracket-preview">
            <div className="bracket-round">
              <div className="round-label">Quarterfinals</div>
              <div className="bracket-matchups">
                {[
                  { home: 3, away: 6 },
                  { home: 4, away: 5 },
                ].map((matchup, i) => {
                  const homeTeam = getTeam(regionStandings[matchup.home - 1]?.teamId);
                  const awayTeam = getTeam(regionStandings[matchup.away - 1]?.teamId);
                  return (
                    <div key={i} className="bracket-matchup-preview">
                      <div className={`bracket-team ${regionStandings[matchup.home - 1]?.teamId === userTeamId ? 'user' : ''}`}>
                        <span className="seed">#{matchup.home}</span>
                        <img src={homeTeam?.logo} alt="" className="bracket-logo" />
                        <span className="abbr">{homeTeam?.abbreviation || 'TBD'}</span>
                      </div>
                      <div className="bracket-vs">vs</div>
                      <div className={`bracket-team ${regionStandings[matchup.away - 1]?.teamId === userTeamId ? 'user' : ''}`}>
                        <span className="seed">#{matchup.away}</span>
                        <img src={awayTeam?.logo} alt="" className="bracket-logo" />
                        <span className="abbr">{awayTeam?.abbreviation || 'TBD'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bracket-round">
              <div className="round-label">Semifinals (Byes)</div>
              <div className="bye-teams">
                {[1, 2].map(seed => {
                  const team = getTeam(regionStandings[seed - 1]?.teamId);
                  const isUser = regionStandings[seed - 1]?.teamId === userTeamId;
                  return (
                    <div key={seed} className={`bye-team ${isUser ? 'user' : ''}`}>
                      <span className="seed">#{seed}</span>
                      <img src={team?.logo} alt="" className="bracket-logo" />
                      <span className="abbr">{team?.abbreviation || 'TBD'}</span>
                      <span className="bye-badge">BYE</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* User Team Status */}
          {userTeamId && userTeamRank > 0 && (
            <div className={`user-team-status ${userTeamRank <= playoffCutoff ? 'in' : 'out'}`}>
              <div className="status-icon">
                {userTeamRank <= playoffCutoff ? '✓' : '✗'}
              </div>
              <div className="status-text">
                <span className="status-label">Your Team</span>
                <span className="status-position">
                  {userTeamRank <= playoffCutoff
                    ? `#${userTeamRank} seed${userTeamRank <= 2 ? ' (Bye)' : ''}`
                    : `#${userTeamRank} - ${playoffCutoff - userTeamRank + 1} games out`}
                </span>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="standings-legend">
            <div className="legend-item">
              <span className="legend-dot playoff"></span>
              <span>Playoff Position (1-6)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot bye"></span>
              <span>First Round Bye (1-2)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot eliminated"></span>
              <span>Eliminated (7-12)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}