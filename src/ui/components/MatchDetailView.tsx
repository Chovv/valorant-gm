// src/ui/components/MatchDetailView.tsx
import type { Team, MatchResult } from '../../types';
import './MatchDetailView.css';

interface Standing {
  teamId: string;
  wins: number;
  losses: number;
  mapWins: number;
  mapLosses: number;
  roundDifferential: number;
}

interface MatchDetailViewProps {
  match: MatchResult;
  homeTeam: Team;
  awayTeam: Team;
  homeStanding?: Standing;
  awayStanding?: Standing;
  onBack: () => void;
  onViewPlayer?: (playerId: string) => void;
}

// Helper to get agent icon URL from local assets
function getAgentIconUrl(agent: string): string {
  return `/logos/agents/${agent.toLowerCase()}.png`;
}

// Helper to capitalize agent name for display
function formatAgentName(agent: string): string {
  return agent.charAt(0).toUpperCase() + agent.slice(1).toLowerCase();
}

export function MatchDetailView({ match, homeTeam, awayTeam, homeStanding, awayStanding, onBack, onViewPlayer }: MatchDetailViewProps) {
  const homeWon = match.homeScore > match.awayScore;

  // Calculate series totals for each player, tracking all agents played in order
  const calculateSeriesTotals = (teamRoster: Team['roster'], isHome: boolean) => {
    return teamRoster.map(player => {
      let totalKills = 0, totalDeaths = 0, totalAssists = 0, totalAcs = 0, totalFk = 0, totalFd = 0, mapsPlayed = 0;
      const agentsPlayed: string[] = [];

      match.mapScores.forEach(mapScore => {
        const stats = isHome ? mapScore.homePlayerStats : mapScore.awayPlayerStats;
        const playerStats = stats?.find(s => s.playerId === player.id);
        if (playerStats) {
          totalKills += playerStats.kills;
          totalDeaths += playerStats.deaths;
          totalAssists += playerStats.assists;
          totalAcs += playerStats.acs;
          totalFk += playerStats.firstKills;
          totalFd += playerStats.firstDeaths;
          mapsPlayed++;
          if (playerStats.agent) {
            agentsPlayed.push(playerStats.agent);
          }
        }
      });

      return {
        player, kills: totalKills, deaths: totalDeaths, assists: totalAssists,
        acs: mapsPlayed > 0 ? Math.round(totalAcs / mapsPlayed) : 0,
        kd: totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills.toFixed(2),
        firstKills: totalFk, firstDeaths: totalFd, agentsPlayed,
      };
    }).sort((a, b) => b.acs - a.acs);
  };

  const homeTotals = calculateSeriesTotals(homeTeam.roster, true);
  const awayTotals = calculateSeriesTotals(awayTeam.roster, false);

  return (
    <div className="match-detail-view">
      {/* Back Button */}
      <button className="back-link" onClick={onBack}>
        <span className="back-arrow">←</span>
        Back to Schedule
      </button>

      {/* Hero Header */}
      <div className="match-hero">
        <div className="match-hero-accent"></div>
        
        <div className="match-hero-content">
          <div className={`match-hero-team left ${homeWon ? 'winner' : 'loser'}`}>
            <img src={homeTeam.logo} alt={homeTeam.name} className="match-hero-logo" />
            <div className="match-hero-team-info">
              <span className="match-hero-team-name">{homeTeam.name}</span>
              {homeStanding && (
                <span className="match-hero-record">{homeStanding.wins}-{homeStanding.losses}</span>
              )}
            </div>
          </div>

          <div className="match-hero-score">
            <span className={`hero-score ${homeWon ? 'winner home-winner' : ''}`}>{match.homeScore}</span>
            <span className="hero-score-divider">:</span>
            <span className={`hero-score ${!homeWon ? 'winner away-winner' : ''}`}>{match.awayScore}</span>
          </div>

          <div className={`match-hero-team right ${!homeWon ? 'winner' : 'loser'}`}>
            <div className="match-hero-team-info right">
              <span className="match-hero-team-name">{awayTeam.name}</span>
              {awayStanding && (
                <span className="match-hero-record">{awayStanding.wins}-{awayStanding.losses}</span>
              )}
            </div>
            <img src={awayTeam.logo} alt={awayTeam.name} className="match-hero-logo" />
          </div>
        </div>
      </div>

      {/* Map Score Cards */}
      <div className="map-cards-section">
        <div className="map-score-cards">
          {match.mapScores.map((mapScore, idx) => {
            const homeMapWin = mapScore.homeRounds > mapScore.awayRounds;
            return (
              <div key={idx} className={`map-score-card ${homeMapWin ? 'home-win' : 'away-win'}`}>
                <span className="map-card-name">{mapScore.map}</span>
                <div className="map-card-score">
                  <span className={homeMapWin ? 'winner' : ''}>{mapScore.homeRounds}</span>
                  <span className="map-card-divider">-</span>
                  <span className={!homeMapWin ? 'winner' : ''}>{mapScore.awayRounds}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scoreboard for each map */}
      {match.mapScores.map((mapScore, mapIdx) => {
        const homeMapWin = mapScore.homeRounds > mapScore.awayRounds;
        const sortedHomeStats = [...(mapScore.homePlayerStats || [])].sort((a, b) => b.acs - a.acs);
        const sortedAwayStats = [...(mapScore.awayPlayerStats || [])].sort((a, b) => b.acs - a.acs);

        return (
          <div key={mapIdx} className="scoreboard-section">
            {/* Map Header */}
            <div className="scoreboard-map-header">
              <div className={`scoreboard-team-side left ${homeMapWin ? 'winner' : ''}`}>
                <img src={homeTeam.logo} alt="" className="scoreboard-team-logo" />
                <span className="scoreboard-team-name">{homeTeam.abbreviation}</span>
                <span className="scoreboard-rounds">{mapScore.homeRounds}</span>
              </div>
              <div className="scoreboard-map-name">{mapScore.map}</div>
              <div className={`scoreboard-team-side right ${!homeMapWin ? 'winner' : ''}`}>
                <span className="scoreboard-rounds">{mapScore.awayRounds}</span>
                <span className="scoreboard-team-name">{awayTeam.abbreviation}</span>
                <img src={awayTeam.logo} alt="" className="scoreboard-team-logo" />
              </div>
            </div>

            {/* Side by Side Scoreboards */}
            <div className="scoreboard-grid">
              {/* Home Team Scoreboard */}
              <div className="scoreboard-table-wrapper home">
                <table className="scoreboard-table">
                  <thead>
                    <tr>
                      <th className="col-player">PLAYER</th>
                      <th className="col-acs">ACS</th>
                      <th className="col-kda">K/D/A</th>
                      <th className="col-kd">K/D</th>
                      <th className="col-fk">FK</th>
                      <th className="col-fd">FD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHomeStats.map((stats, idx) => {
                      const player = homeTeam.roster.find(p => p.id === stats.playerId);
                      const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
                      const isIGL = stats.playerId === homeTeam.iglId;
                      const isTopFrag = idx === 0;
                      return (
                        <tr key={stats.playerId} className={isTopFrag ? 'top-frag' : ''}>
                          <td className="col-player">
                            <div className="player-cell">
                              {stats.agent && (
                                <img 
                                  src={getAgentIconUrl(stats.agent)} 
                                  alt={stats.agent} 
                                  className="agent-icon" 
                                  title={formatAgentName(stats.agent)} 
                                />
                              )}
                              <span className="team-abbr">{homeTeam.abbreviation}</span>
                              <span 
                                className={`player-name ${onViewPlayer ? 'clickable' : ''}`}
                                onClick={() => onViewPlayer?.(stats.playerId)}
                              >
                                {player?.name || 'Unknown'}
                              </span>
                              {isIGL && <span className="igl-tag">IGL</span>}
                            </div>
                          </td>
                          <td className="col-acs">{stats.acs}</td>
                          <td className="col-kda">{stats.kills}/{stats.deaths}/{stats.assists}</td>
                          <td className={`col-kd ${parseFloat(kd) >= 1 ? 'positive' : 'negative'}`}>{kd}</td>
                          <td className="col-fk">{stats.firstKills}</td>
                          <td className="col-fd">{stats.firstDeaths}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Away Team Scoreboard */}
              <div className="scoreboard-table-wrapper away">
                <table className="scoreboard-table">
                  <thead>
                    <tr>
                      <th className="col-player">PLAYER</th>
                      <th className="col-acs">ACS</th>
                      <th className="col-kda">K/D/A</th>
                      <th className="col-kd">K/D</th>
                      <th className="col-fk">FK</th>
                      <th className="col-fd">FD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAwayStats.map((stats, idx) => {
                      const player = awayTeam.roster.find(p => p.id === stats.playerId);
                      const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
                      const isIGL = stats.playerId === awayTeam.iglId;
                      const isTopFrag = idx === 0;
                      return (
                        <tr key={stats.playerId} className={isTopFrag ? 'top-frag' : ''}>
                          <td className="col-player">
                            <div className="player-cell">
                              {stats.agent && (
                                <img 
                                  src={getAgentIconUrl(stats.agent)} 
                                  alt={stats.agent} 
                                  className="agent-icon" 
                                  title={formatAgentName(stats.agent)} 
                                />
                              )}
                              <span className="team-abbr">{awayTeam.abbreviation}</span>
                              <span 
                                className={`player-name ${onViewPlayer ? 'clickable' : ''}`}
                                onClick={() => onViewPlayer?.(stats.playerId)}
                              >
                                {player?.name || 'Unknown'}
                              </span>
                              {isIGL && <span className="igl-tag">IGL</span>}
                            </div>
                          </td>
                          <td className="col-acs">{stats.acs}</td>
                          <td className="col-kda">{stats.kills}/{stats.deaths}/{stats.assists}</td>
                          <td className={`col-kd ${parseFloat(kd) >= 1 ? 'positive' : 'negative'}`}>{kd}</td>
                          <td className="col-fk">{stats.firstKills}</td>
                          <td className="col-fd">{stats.firstDeaths}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}

      {/* Series Totals */}
      <div className="series-totals-section">
        <div className="series-totals-header">
          <span className="series-totals-title">SERIES TOTALS</span>
        </div>

        <div className="scoreboard-grid series">
          {/* Home Team Series */}
          <div className="scoreboard-table-wrapper series home">
            <div className="series-team-banner home">
              <img src={homeTeam.logo} alt="" className="series-team-logo" />
              <span className="series-team-name">{homeTeam.name}</span>
            </div>
            <table className="scoreboard-table series">
              <thead>
                <tr>
                  <th className="col-player">PLAYER</th>
                  <th className="col-acs">ACS</th>
                  <th className="col-k">K</th>
                  <th className="col-d">D</th>
                  <th className="col-a">A</th>
                  <th className="col-kd">K/D</th>
                  <th className="col-fk">FK</th>
                  <th className="col-fd">FD</th>
                </tr>
              </thead>
              <tbody>
                {homeTotals.map(({ player, kills, deaths, assists, acs, kd, firstKills, firstDeaths, agentsPlayed }, idx) => {
                  const isIGL = player.id === homeTeam.iglId;
                  const isTopFrag = idx === 0;
                  return (
                    <tr key={player.id} className={isTopFrag ? 'top-frag' : ''}>
                      <td className="col-player">
                        <div className="player-cell">
                          <div className="agent-stack">
                            {agentsPlayed.map((agent, i) => (
                              <img 
                                key={i}
                                src={getAgentIconUrl(agent)} 
                                alt={agent} 
                                className="agent-icon stacked" 
                                title={`Map ${i + 1}: ${formatAgentName(agent)}`}
                                style={{ zIndex: agentsPlayed.length - i }}
                              />
                            ))}
                          </div>
                          <span className="team-abbr">{homeTeam.abbreviation}</span>
                          <span 
                            className={`player-name ${onViewPlayer ? 'clickable' : ''}`}
                            onClick={() => onViewPlayer?.(player.id)}
                          >
                            {player.name}
                          </span>
                          {isIGL && <span className="igl-tag">IGL</span>}
                        </div>
                      </td>
                      <td className="col-acs">{acs}</td>
                      <td className="col-k">{kills}</td>
                      <td className="col-d">{deaths}</td>
                      <td className="col-a">{assists}</td>
                      <td className={`col-kd ${parseFloat(kd) >= 1 ? 'positive' : 'negative'}`}>{kd}</td>
                      <td className="col-fk">{firstKills}</td>
                      <td className="col-fd">{firstDeaths}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Away Team Series */}
          <div className="scoreboard-table-wrapper series away">
            <div className="series-team-banner away">
              <img src={awayTeam.logo} alt="" className="series-team-logo" />
              <span className="series-team-name">{awayTeam.name}</span>
            </div>
            <table className="scoreboard-table series">
              <thead>
                <tr>
                  <th className="col-player">PLAYER</th>
                  <th className="col-acs">ACS</th>
                  <th className="col-k">K</th>
                  <th className="col-d">D</th>
                  <th className="col-a">A</th>
                  <th className="col-kd">K/D</th>
                  <th className="col-fk">FK</th>
                  <th className="col-fd">FD</th>
                </tr>
              </thead>
              <tbody>
                {awayTotals.map(({ player, kills, deaths, assists, acs, kd, firstKills, firstDeaths, agentsPlayed }, idx) => {
                  const isIGL = player.id === awayTeam.iglId;
                  const isTopFrag = idx === 0;
                  return (
                    <tr key={player.id} className={isTopFrag ? 'top-frag' : ''}>
                      <td className="col-player">
                        <div className="player-cell">
                          <div className="agent-stack">
                            {agentsPlayed.map((agent, i) => (
                              <img 
                                key={i}
                                src={getAgentIconUrl(agent)} 
                                alt={agent} 
                                className="agent-icon stacked" 
                                title={`Map ${i + 1}: ${formatAgentName(agent)}`}
                                style={{ zIndex: agentsPlayed.length - i }}
                              />
                            ))}
                          </div>
                          <span className="team-abbr">{awayTeam.abbreviation}</span>
                          <span 
                            className={`player-name ${onViewPlayer ? 'clickable' : ''}`}
                            onClick={() => onViewPlayer?.(player.id)}
                          >
                            {player.name}
                          </span>
                          {isIGL && <span className="igl-tag">IGL</span>}
                        </div>
                      </td>
                      <td className="col-acs">{acs}</td>
                      <td className="col-k">{kills}</td>
                      <td className="col-d">{deaths}</td>
                      <td className="col-a">{assists}</td>
                      <td className={`col-kd ${parseFloat(kd) >= 1 ? 'positive' : 'negative'}`}>{kd}</td>
                      <td className="col-fk">{firstKills}</td>
                      <td className="col-fd">{firstDeaths}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}