// src/ui/components/TeamView.tsx
import type { Team, StandingsEntry } from '../../types';
import type { ScheduledMatch } from '../../sim/gameState';
import type { StartingSlot } from '../../types/roster';
import { getBenchPlayers, getLineupSummary } from '../../sim/rosterManagement';
import { getIGLBonusForPlayer, calculateEffectiveOverallWithIGL } from '../../sim/iglBonus';

interface TeamViewProps {
  team: Team;
  teams: Team[];
  standings: StandingsEntry[];
  schedule: ScheduledMatch[];
  isUserTeam: boolean;
  devMode?: boolean;
  onBack: () => void;
  onViewPlayer: (playerId: string) => void;
  onViewMatch: (matchId: string) => void;
  onNextTeam?: () => void;
  onPrevTeam?: () => void;
  onSetIGL?: (playerId: string) => void;
  onManageRoster?: () => void;
}

export function TeamView({ 
  team, 
  teams, 
  standings, 
  schedule, 
  isUserTeam,
  devMode = false,
  onViewPlayer, 
  onViewMatch, 
  onNextTeam, 
  onPrevTeam, 
  onSetIGL,
  onManageRoster
}: TeamViewProps) {
  const teamStanding = standings.find(s => s.teamId === team.id);
  
  // Get the IGL player
  const iglPlayer = team.iglId ? team.roster.find(p => p.id === team.iglId) : null;
  
  // Get lineup info
  const lineup: StartingSlot[] = team.startingLineup || team.roster.slice(0, 5).map(p => ({
    playerId: p.id,
    assignedRole: p.role,
  }));
  const benchPlayers = getBenchPlayers(team.roster, lineup);
  const lineupSummary = getLineupSummary(team.roster, lineup);
  
  // Calculate effective lineup strength including IGL bonus
  const effectiveLineupStrength = lineupSummary.reduce((total, summary) => {
    const player = team.roster.find(p => p.id === summary.playerId);
    const iglBonus = player ? getIGLBonusForPlayer(player, team, lineup) : 0;
    const iglOvrImpact = Math.round(iglBonus * 0.5);
    return total + summary.effectiveOverall + iglOvrImpact;
  }, 0);
  
  // Calculate avg starter OVR (effective, including IGL bonus) - same as RosterManagementPage
  const avgStarterOvr = Math.round(effectiveLineupStrength / 5);
  
  // Get starters in lineup order
  const starters = lineupSummary.map(summary => {
    const player = team.roster.find(p => p.id === summary.playerId);
    return { player, summary };
  }).filter(s => s.player);
  
  // Get ALL team's matches (not just last 5)
  const teamMatches = schedule
    .filter(m => m.played && (m.homeTeamId === team.id || m.awayTeamId === team.id))
    .reverse();

  // Calculate win streak
  let streak = 0;
  let streakType: 'W' | 'L' | null = null;
  for (const match of teamMatches) {
    const isHome = match.homeTeamId === team.id;
    const teamScore = isHome ? match.result!.homeScore : match.result!.awayScore;
    const oppScore = isHome ? match.result!.awayScore : match.result!.homeScore;
    const won = teamScore > oppScore;
    
    if (streakType === null) {
      streakType = won ? 'W' : 'L';
      streak = 1;
    } else if ((won && streakType === 'W') || (!won && streakType === 'L')) {
      streak++;
    } else {
      break;
    }
  }

  const getRatingClass = (rating: number) => {
    if (rating >= 75) return 'rating-high';
    if (rating >= 55) return 'rating-mid';
    return 'rating-low';
  };

  const getPenaltyClass = (penalty: number) => {
    if (penalty === 0) return 'penalty-none';
    if (penalty >= -3) return 'penalty-minor';
    if (penalty >= -6) return 'penalty-moderate';
    return 'penalty-severe';
  };

  // Show IGL column if user team OR dev mode
  const showIglColumn = (isUserTeam || devMode) && onSetIGL;
  
  // Show manage roster button if user team OR dev mode
  const showManageRoster = onManageRoster && (isUserTeam || devMode);

  return (
    <div className="team-view-container">
      {/* Navigation Bar */}
      <div className="team-nav-bar">
        <div className="team-nav-left">
          {onPrevTeam && (
            <button className="team-nav-btn" onClick={onPrevTeam} title="Previous team">
              <span className="nav-icon">‹</span>
              <span>Prev</span>
            </button>
          )}
          {onNextTeam && (
            <button className="team-nav-btn" onClick={onNextTeam} title="Next team">
              <span>Next</span>
              <span className="nav-icon">›</span>
            </button>
          )}
        </div>
        
        <div className="team-nav-center">
          <div className="team-nav-info">
            <img src={team.logo} alt={team.name} className="team-nav-logo" />
            <div className="team-nav-text">
              <span className="team-nav-name">{team.name}</span>
              <span className="team-nav-abbr">{team.abbreviation}</span>
            </div>
            {isUserTeam && <span className="team-nav-badge">YOUR TEAM</span>}
            {devMode && !isUserTeam && <span className="team-nav-badge dev-badge">DEV MODE</span>}
          </div>
        </div>
        
        <div className="team-nav-spacer">
          {showManageRoster && (
            <button 
              className="team-nav-btn manage-roster-btn"
              onClick={onManageRoster}
              style={{
                background: devMode && !isUserTeam 
                  ? 'linear-gradient(135deg, #f59e0b, #ef4444)' 
                  : 'linear-gradient(135deg, #ff4655, #ff6b6b)',
                border: 'none',
                color: 'white',
                fontWeight: 600,
              }}
            >
              {devMode && !isUserTeam ? '🔧' : '⚙️'} Manage Roster
            </button>
          )}
        </div>
      </div>

      {/* Hero Section */}
      <div className="team-hero">
        <div className="team-hero-bg" style={{ backgroundImage: `url(${team.logo})` }}></div>
        <div className="team-hero-content">
          <img src={team.logo} alt={team.name} className="team-hero-logo" />
          <div className="team-hero-info">
            <div className="team-hero-meta">
              <span className="team-region-badge">{team.region.toUpperCase()}</span>
              <span className="team-founded">Est. {team.founded}</span>
            </div>
            <h1 className="team-hero-name">{team.name}</h1>
            <div className="team-hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-value">{teamStanding?.wins}-{teamStanding?.losses}</span>
                <span className="hero-stat-label">Record</span>
              </div>
              <div className="hero-stat-divider"></div>
              <div className="hero-stat">
                <span className="hero-stat-value">{teamStanding?.mapWins}-{teamStanding?.mapLosses}</span>
                <span className="hero-stat-label">Maps</span>
              </div>
              <div className="hero-stat-divider"></div>
              <div className="hero-stat">
                <span className={`hero-stat-value ${(teamStanding?.roundDifferential ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                  {(teamStanding?.roundDifferential ?? 0) >= 0 ? '+' : ''}{teamStanding?.roundDifferential}
                </span>
                <span className="hero-stat-label">Round Diff</span>
              </div>
              <div className="hero-stat-divider"></div>
              <div className="hero-stat">
                <span className={`hero-stat-value ${streakType === 'W' ? 'positive' : 'negative'}`}>
                  {streakType}{streak}
                </span>
                <span className="hero-stat-label">Streak</span>
              </div>
              <div className="hero-stat-divider"></div>
              <div className="hero-stat">
                <span className="hero-stat-value">{effectiveLineupStrength}</span>
                <span className="hero-stat-label">Lineup STR</span>
              </div>
              <div className="hero-stat-divider"></div>
              <div className="hero-stat">
                <span className="hero-stat-value igl-value">
                  {iglPlayer ? iglPlayer.name : '—'}
                </span>
                <span className="hero-stat-label">IGL</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Attributes */}
      <div className="team-attributes-row">
        <div className="team-attr-card">
          <div className="team-attr-icon">🎯</div>
          <div className="team-attr-value">{team.attributes.firepower}</div>
          <div className="team-attr-label">Firepower</div>
          <div className="team-attr-bar">
            <div className="team-attr-bar-fill" style={{ width: `${team.attributes.firepower}%` }}></div>
          </div>
        </div>
        <div className="team-attr-card">
          <div className="team-attr-icon">🧰</div>
          <div className="team-attr-value">{team.attributes.utilityDepth}</div>
          <div className="team-attr-label">Utility</div>
          <div className="team-attr-bar">
            <div className="team-attr-bar-fill" style={{ width: `${team.attributes.utilityDepth}%` }}></div>
          </div>
        </div>
        <div className="team-attr-card">
          <div className="team-attr-icon">🧠</div>
          <div className="team-attr-value">{team.attributes.macroPlay}</div>
          <div className="team-attr-label">Macro</div>
          <div className="team-attr-bar">
            <div className="team-attr-bar-fill" style={{ width: `${team.attributes.macroPlay}%` }}></div>
          </div>
        </div>
        <div className="team-attr-card">
          <div className="team-attr-icon">💪</div>
          <div className="team-attr-value">{team.attributes.mentalStrength}</div>
          <div className="team-attr-label">Mental</div>
          <div className="team-attr-bar">
            <div className="team-attr-bar-fill" style={{ width: `${team.attributes.mentalStrength}%` }}></div>
          </div>
        </div>
        <div className="team-attr-card team-attr-avg">
          <div className="team-attr-icon">⭐</div>
          <div className="team-attr-value">{avgStarterOvr}</div>
          <div className="team-attr-label">Avg Starter</div>
          <div className="team-attr-bar">
            <div className="team-attr-bar-fill" style={{ width: `${avgStarterOvr}%` }}></div>
          </div>
        </div>
      </div>

      <div className="team-content-grid">
        {/* Roster Table */}
        <div className="panel team-roster-panel">
          <div className="panel-header">
            <span>Roster</span>
            <span className="panel-header-sub">{team.roster.length} Players</span>
          </div>
          
          {/* Starting Lineup */}
          <div className="roster-section-header">Starting Lineup</div>
          <table className="roster-table-aligned">
            <thead>
              <tr>
                <th className="th-name">Name</th>
                <th className="th-role">Role</th>
                <th className="th-stat">Age</th>
                <th className="th-stat">OVR</th>
                <th className="th-stat">POT</th>
                {showIglColumn && <th className="th-igl">IGL</th>}
              </tr>
            </thead>
            <tbody>
              {starters.map(({ player, summary }) => {
                if (!player) return null;
                const isIGL = team.iglId === player.id;
                
                // Calculate IGL bonus for this player
                const iglResult = calculateEffectiveOverallWithIGL(
                  player,
                  team,
                  lineup,
                  summary.penalty
                );
                
                return (
                  <tr 
                    key={player.id} 
                    onClick={() => onViewPlayer(player.id)}
                  >
                    <td className="td-name">
                      <span className="player-link">{player.name}</span>
                      {isIGL && <span className="igl-badge">IGL</span>}
                    </td>
                    <td className="td-role">
                      <span className={`role-badge role-${summary.assignedRole}`}>
                        {summary.assignedRole.toUpperCase()}
                      </span>
                    </td>
                    <td className="td-stat">{player.age}</td>
                    <td className={`td-stat ${getRatingClass(iglResult.effectiveOvr)}`}>
                      {iglResult.effectiveOvr}
                      {summary.penalty !== 0 && (
                        <span className={`penalty-indicator ${getPenaltyClass(summary.penalty)}`}>
                          ({summary.penalty > 0 ? '+' : ''}{summary.penalty})
                        </span>
                      )}
                      {iglResult.iglBonus !== 0 && (
                        <span className={`penalty-indicator ${iglResult.iglBonus > 0 ? 'bonus' : 'penalty'}`}>
                          ({iglResult.iglBonus > 0 ? '+' : ''}{iglResult.iglBonus})
                        </span>
                      )}
                    </td>
                    <td className="td-stat">{player.potential.ceiling}</td>
                    {showIglColumn && (
                      <td className="td-igl">
                        <button
                          className={`btn-igl ${isIGL ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetIGL!(player.id);
                          }}
                          title={isIGL ? 'Current IGL' : 'Set as IGL'}
                        >
                          {isIGL ? '★' : '☆'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Bench */}
          {benchPlayers.length > 0 && (
            <>
              <div className="roster-section-header bench-header">Bench ({benchPlayers.length})</div>
              <table className="roster-table-aligned">
                <tbody>
                  {benchPlayers.map(player => {
                    const isIGL = team.iglId === player.id;
                    return (
                      <tr 
                        key={player.id}
                        className="bench-row"
                        onClick={() => onViewPlayer(player.id)}
                      >
                        <td className="td-name">
                          <span className="player-link">{player.name}</span>
                          {isIGL && <span className="igl-badge">IGL</span>}
                        </td>
                        <td className="td-role">
                          <span className={`role-badge role-${player.role}`}>
                            {player.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="td-stat">{player.age}</td>
                        <td className={`td-stat ${getRatingClass(player.overall)}`}>
                          {player.overall}
                        </td>
                        <td className="td-stat">{player.potential.ceiling}</td>
                        {showIglColumn && (
                          <td className="td-igl">
                            <button
                              className={`btn-igl ${isIGL ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetIGL!(player.id);
                              }}
                              title={isIGL ? 'Current IGL' : 'Set as IGL'}
                            >
                              {isIGL ? '★' : '☆'}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Match History */}
        <div className="panel team-history-panel">
          <div className="panel-header">
            <span>Match History</span>
            <span className="panel-header-sub">{teamMatches.length} Games</span>
          </div>
          <div className="panel-body team-history-body">
            {teamMatches.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📅</div>
                <div>No matches played yet</div>
              </div>
            ) : (
              <div className="match-history-list">
                {teamMatches.map(match => {
                  const isHome = match.homeTeamId === team.id;
                  const opponent = teams.find(t => t.id === (isHome ? match.awayTeamId : match.homeTeamId));
                  const teamScore = isHome ? match.result!.homeScore : match.result!.awayScore;
                  const oppScore = isHome ? match.result!.awayScore : match.result!.homeScore;
                  const won = teamScore > oppScore;
                  
                  return (
                    <div 
                      key={match.id} 
                      className={`match-history-item ${won ? 'win' : 'loss'}`}
                      onClick={() => onViewMatch(match.id)}
                    >
                      <div className={`match-result-indicator ${won ? 'win' : 'loss'}`}>
                        {won ? 'W' : 'L'}
                      </div>
                      <div className="match-history-info">
                        <div className="match-history-teams">
                          <span className="match-history-team">{team.abbreviation}</span>
                          <span className="match-history-score">{teamScore} - {oppScore}</span>
                          <span className="match-history-opponent">{opponent?.abbreviation}</span>
                        </div>
                        <div className="match-history-meta">
                          Day {match.day} • {match.result!.mapScores.length} maps
                        </div>
                      </div>
                      <div className="match-history-arrow">›</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}