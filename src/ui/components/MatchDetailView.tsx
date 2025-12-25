// src/ui/components/MatchDetailView.tsx
import type { Team, MatchResult } from '../../types';

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

// Helper to get agent icon URL from VLR.gg
function getAgentIconUrl(agent: string): string {
  const normalizedAgent = agent.toLowerCase().replace(/\s+/g, '').replace(/\//g, '');
  return `https://www.vlr.gg/img/vlr/game/agents/${normalizedAgent}.png`;
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

  const renderPlayerCell = (playerId: string, name: string, agent: string, teamAbbr: string, isIGL: boolean = false) => (
    <div className="player-name-cell">
      {agent && (
        <img src={getAgentIconUrl(agent)} alt={agent} className="agent-icon" title={formatAgentName(agent)} />
      )}
      <span className="team-abbr-prefix">{teamAbbr}</span>
      <span 
        className={onViewPlayer ? 'clickable' : ''} 
        onClick={() => onViewPlayer?.(playerId)}
        style={onViewPlayer ? { cursor: 'pointer' } : undefined}
      >
        {name}
      </span>
      {isIGL && <span className="igl-badge">IGL</span>}
    </div>
  );

  const renderPlayerCellMultiAgent = (playerId: string, name: string, agents: string[], teamAbbr: string, isIGL: boolean = false) => (
    <div className="player-name-cell">
      <div className="agent-icons-group">
        {agents.map((agent, idx) => (
          <img 
            key={idx}
            src={getAgentIconUrl(agent)} 
            alt={agent} 
            className="agent-icon agent-icon-stacked" 
            title={`Map ${idx + 1}: ${formatAgentName(agent)}`}
            style={{ marginLeft: idx > 0 ? '-4px' : '0', zIndex: agents.length - idx }}
          />
        ))}
      </div>
      <span className="team-abbr-prefix">{teamAbbr}</span>
      <span 
        className={onViewPlayer ? 'clickable' : ''} 
        onClick={() => onViewPlayer?.(playerId)}
        style={onViewPlayer ? { cursor: 'pointer' } : undefined}
      >
        {name}
      </span>
      {isIGL && <span className="igl-badge">IGL</span>}
    </div>
  );

  return (
    <div className="match-detail">
      <button className="link-btn" onClick={onBack} style={{ marginBottom: '16px' }}>
        « Back to Schedule
      </button>

      {/* Match Header */}
      <div className="match-header">
        <div className={`match-team ${homeWon ? 'winner' : ''}`}>
          <img src={homeTeam.logo} alt={homeTeam.name} className="match-team-logo" />
          <span className="match-team-name">{homeTeam.name}</span>
          {homeStanding && (
            <span className="match-team-record">{homeStanding.wins}-{homeStanding.losses}</span>
          )}
        </div>
        <div className="match-score">
          <span className={`score ${homeWon ? 'winner' : ''}`}>{match.homeScore}</span>
          <span className="score-divider">-</span>
          <span className={`score ${!homeWon ? 'winner' : ''}`}>{match.awayScore}</span>
        </div>
        <div className={`match-team ${!homeWon ? 'winner' : ''}`}>
          <img src={awayTeam.logo} alt={awayTeam.name} className="match-team-logo" />
          <span className="match-team-name">{awayTeam.name}</span>
          {awayStanding && (
            <span className="match-team-record">{awayStanding.wins}-{awayStanding.losses}</span>
          )}
        </div>
      </div>

      {/* Map Scores */}
      <div className="map-scores-row">
        {match.mapScores.map((mapScore, idx) => {
          const homeMapWin = mapScore.homeRounds > mapScore.awayRounds;
          return (
            <div key={idx} className={`map-score-card ${homeMapWin ? 'home-win' : 'away-win'}`}>
              <div className="map-name">{mapScore.map}</div>
              <div className="map-round-score">
                <span className={homeMapWin ? 'winner' : ''}>{mapScore.homeRounds}</span>
                <span className="divider">-</span>
                <span className={!homeMapWin ? 'winner' : ''}>{mapScore.awayRounds}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Individual Map Stats */}
      {match.mapScores.map((mapScore, mapIdx) => {
        const homeMapWin = mapScore.homeRounds > mapScore.awayRounds;
        const sortedHomeStats = [...(mapScore.homePlayerStats || [])].sort((a, b) => b.acs - a.acs);
        const sortedAwayStats = [...(mapScore.awayPlayerStats || [])].sort((a, b) => b.acs - a.acs);

        return (
          <div key={mapIdx} className="map-detail">
            <div className="map-detail-header">
              <span className="map-detail-name">{mapScore.map}</span>
              <div className="map-detail-score">
                <div className={`team-score ${homeMapWin ? 'winner' : 'loser'}`}>
                  <span className="team-abbr">{homeTeam.abbreviation}</span>
                  <span className="rounds">{mapScore.homeRounds}</span>
                </div>
                <span className="score-separator">-</span>
                <div className={`team-score ${!homeMapWin ? 'winner' : 'loser'}`}>
                  <span className="rounds">{mapScore.awayRounds}</span>
                  <span className="team-abbr">{awayTeam.abbreviation}</span>
                </div>
              </div>
            </div>

            <div className="map-stats-grid">
              <div className="panel">
                <div className="panel-header">{homeTeam.abbreviation}</div>
                <div className="panel-body" style={{ padding: 0 }}>
                  <table className="stats-table compact">
                    <thead><tr><th>Player</th><th>ACS</th><th>K/D/A</th><th>K/D</th><th>FK</th><th>FD</th></tr></thead>
                    <tbody>
                      {sortedHomeStats.map(stats => {
                        const player = homeTeam.roster.find(p => p.id === stats.playerId);
                        const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
                        return (
                          <tr key={stats.playerId}>
                            <td className="player-name">{renderPlayerCell(stats.playerId, player?.name || '', stats.agent || '', homeTeam.abbreviation, stats.playerId === homeTeam.iglId)}</td>
                            <td className="acs">{stats.acs}</td>
                            <td>{stats.kills}/{stats.deaths}/{stats.assists}</td>
                            <td className={parseFloat(kd) >= 1 ? 'positive' : 'negative'}>{kd}</td>
                            <td>{stats.firstKills}</td>
                            <td>{stats.firstDeaths}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">{awayTeam.abbreviation}</div>
                <div className="panel-body" style={{ padding: 0 }}>
                  <table className="stats-table compact">
                    <thead><tr><th>Player</th><th>ACS</th><th>K/D/A</th><th>K/D</th><th>FK</th><th>FD</th></tr></thead>
                    <tbody>
                      {sortedAwayStats.map(stats => {
                        const player = awayTeam.roster.find(p => p.id === stats.playerId);
                        const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
                        return (
                          <tr key={stats.playerId}>
                            <td className="player-name">{renderPlayerCell(stats.playerId, player?.name || '', stats.agent || '', awayTeam.abbreviation, stats.playerId === awayTeam.iglId)}</td>
                            <td className="acs">{stats.acs}</td>
                            <td>{stats.kills}/{stats.deaths}/{stats.assists}</td>
                            <td className={parseFloat(kd) >= 1 ? 'positive' : 'negative'}>{kd}</td>
                            <td>{stats.firstKills}</td>
                            <td>{stats.firstDeaths}</td>
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
      })}

      {/* Series Stats - At Bottom with Unique Styling */}
      <div className="series-stats-section">
        <div className="series-stats-header">
          <span className="series-stats-title">Series Totals</span>
          <span className="series-stats-subtitle">Combined stats across all maps</span>
        </div>
        
        <div className="series-stats">
          <div className="panel series-panel">
            <div className="panel-header series-panel-header">{homeTeam.abbreviation} - Series Stats</div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="stats-table series-table">
                <thead>
                  <tr><th>Player</th><th>ACS</th><th>K</th><th>D</th><th>A</th><th>K/D</th><th>FK</th><th>FD</th></tr>
                </thead>
                <tbody>
                  {homeTotals.map(({ player, kills, deaths, assists, acs, kd, firstKills, firstDeaths, agentsPlayed }) => (
                    <tr key={player.id}>
                      <td className="player-name">{renderPlayerCellMultiAgent(player.id, player.name, agentsPlayed, homeTeam.abbreviation, player.id === homeTeam.iglId)}</td>
                      <td className="acs">{acs}</td>
                      <td>{kills}</td><td>{deaths}</td><td>{assists}</td>
                      <td className={parseFloat(kd) >= 1 ? 'positive' : 'negative'}>{kd}</td>
                      <td>{firstKills}</td><td>{firstDeaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel series-panel">
            <div className="panel-header series-panel-header">{awayTeam.abbreviation} - Series Stats</div>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="stats-table series-table">
                <thead>
                  <tr><th>Player</th><th>ACS</th><th>K</th><th>D</th><th>A</th><th>K/D</th><th>FK</th><th>FD</th></tr>
                </thead>
                <tbody>
                  {awayTotals.map(({ player, kills, deaths, assists, acs, kd, firstKills, firstDeaths, agentsPlayed }) => (
                    <tr key={player.id}>
                      <td className="player-name">{renderPlayerCellMultiAgent(player.id, player.name, agentsPlayed, awayTeam.abbreviation, player.id === awayTeam.iglId)}</td>
                      <td className="acs">{acs}</td>
                      <td>{kills}</td><td>{deaths}</td><td>{assists}</td>
                      <td className={parseFloat(kd) >= 1 ? 'positive' : 'negative'}>{kd}</td>
                      <td>{firstKills}</td><td>{firstDeaths}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}