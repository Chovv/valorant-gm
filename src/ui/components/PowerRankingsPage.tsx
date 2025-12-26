// src/ui/components/PowerRankingsPage.tsx
import React, { useState, useMemo } from 'react';
import type { Team, Region, StandingsEntry, MatchResult, Player, Role } from '../../types';
import type { ScheduledMatch } from '../../sim/gameState';
import type { StartingSlot } from '../../types/roster';
import { getLineupSummary } from '../../sim/rosterManagement';
import { getIGLBonusForPlayer } from '../../sim/iglBonus';
import { getCompositionPenalty } from '../../sim/compositionBonus';

// Role icons
const ROLE_ICONS: Record<Role, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

type RankingMode = 'power' | 'lineup';

interface PowerRankingsPageProps {
  teams: Team[];
  standings: StandingsEntry[];
  schedule: ScheduledMatch[];
  userTeamId: string | null;
  onViewTeam: (teamId: string) => void;
  onViewPlayer: (playerId: string) => void;
}

interface PowerRanking {
  team: Team;
  standing: StandingsEntry;
  rank: number;
  previousRank: number;
  powerScore: number;
  lineupStrength: number;
  recentForm: ('W' | 'L')[];
  strengthOfSchedule: number;
  teamRating: number;
  momentum: number;
}

// Calculate a team's overall rating from their attributes
function getTeamOverall(team: Team): number {
  const attrs = team.attributes;
  return Math.round((attrs.firepower + attrs.utilityDepth + attrs.macroPlay + attrs.mentalStrength) / 4);
}

// Calculate effective lineup strength including IGL bonus and composition penalty
function getTeamLineupStrength(team: Team): number {
  const lineup: StartingSlot[] = team.startingLineup || team.roster.slice(0, 5).map(p => ({
    playerId: p.id,
    assignedRole: p.role,
  }));
  
  const lineupSummary = getLineupSummary(team.roster, lineup);
  const compositionPenalty = getCompositionPenalty(lineup);
  
  const effectiveLineupStrength = lineupSummary.reduce((total, summary) => {
    const player = team.roster.find(p => p.id === summary.playerId);
    const iglBonus = player ? getIGLBonusForPlayer(player, team, lineup) : 0;
    const iglOvrImpact = Math.round(iglBonus * 0.5);
    // Add composition penalty per player (penalty is per-player, e.g., -2 each)
    return total + summary.effectiveOverall + iglOvrImpact + compositionPenalty;
  }, 0);
  
  return effectiveLineupStrength;
}

// Get winner ID from a match result
function getWinnerId(result: MatchResult): string {
  return result.homeScore > result.awayScore ? result.homeTeamId : result.awayTeamId;
}

/**
 * Calculate Performance Rating based on actual match stats
 * This reflects how well a player is ACTUALLY performing, not just their potential
 */
function calculatePerformanceRating(player: Player): { rating: number; hasStats: boolean; breakdown: PerformanceBreakdown } {
  const stats = player.careerStats;
  
  const breakdown: PerformanceBreakdown = {
    acs: 0,
    kd: 0,
    fkPerMap: 0,
    winRate: 0,
    mapsPlayed: 0,
  };
  
  // If no matches played, fall back to overall with slight penalty for being unproven
  if (!stats || stats.totalMaps === 0) {
    return { 
      rating: player.overall * 0.95, 
      hasStats: false,
      breakdown 
    };
  }
  
  breakdown.acs = stats.avgACS;
  breakdown.kd = stats.avgKD;
  breakdown.fkPerMap = stats.avgFirstKillsPerMap;
  breakdown.winRate = stats.totalMatches > 0 ? (stats.matchWins / stats.totalMatches) * 100 : 50;
  breakdown.mapsPlayed = stats.totalMaps;
  
  // ACS Score (typically 150-300 for pros)
  // 150 = below average, 200 = average, 250 = good, 280+ = elite
  const acsScore = Math.min(100, Math.max(0, ((stats.avgACS - 100) / 200) * 100));
  
  // K/D Score (typically 0.7 - 1.8)
  // 0.8 = below average, 1.0 = average, 1.2 = good, 1.5+ = elite
  const kdScore = Math.min(100, Math.max(0, (stats.avgKD - 0.5) * 66.67));
  
  // First Kills per map (impact/entry) - typically 1-4
  // 1.5 = average, 2.5 = good, 3.5+ = elite entry fragger
  const fkScore = Math.min(100, Math.max(0, stats.avgFirstKillsPerMap * 25));
  
  // Win rate factor (adds consistency bonus)
  const winRate = stats.totalMatches > 0 ? stats.matchWins / stats.totalMatches : 0.5;
  const winScore = winRate * 100;
  
  // Sample size factor - more games = more reliable rating
  // Ramps up from 0.7 at 1 map to 1.0 at 10+ maps
  const sampleFactor = Math.min(1.0, 0.7 + (stats.totalMaps * 0.03));
  
  // Weighted combination
  const rawPerformance = 
    (acsScore * 0.40) +  // ACS is king in VALORANT
    (kdScore * 0.30) +   // K/D shows efficiency
    (fkScore * 0.15) +   // Entry impact
    (winScore * 0.15);   // Winning matters
  
  // Blend performance with overall based on sample size
  // More maps played = trust performance more
  const performanceWeight = Math.min(0.85, stats.totalMaps * 0.08); // Max 85% performance, 15% potential
  const potentialWeight = 1 - performanceWeight;
  
  const blendedRating = (rawPerformance * sampleFactor * performanceWeight) + (player.overall * potentialWeight);
  
  return { 
    rating: blendedRating, 
    hasStats: true,
    breakdown 
  };
}

interface PerformanceBreakdown {
  acs: number;
  kd: number;
  fkPerMap: number;
  winRate: number;
  mapsPlayed: number;
}

interface RankedPlayer {
  player: Player;
  team: Team;
  performanceRating: number;
  hasStats: boolean;
  breakdown: PerformanceBreakdown;
}

export function PowerRankingsPage({ teams, standings, schedule, userTeamId, onViewTeam, onViewPlayer }: PowerRankingsPageProps) {
  // Check if any games have been played
  const gamesPlayed = useMemo(() => {
    return schedule.some(m => m.played);
  }, [schedule]);
  
  // Default to STR when no games played, PWR otherwise
  const [rankingMode, setRankingMode] = useState<RankingMode>(() => 
    schedule.some(m => m.played) ? 'power' : 'lineup'
  );
  
  // Auto-switch default when games start (only on first game)
  React.useEffect(() => {
    if (gamesPlayed && rankingMode === 'lineup') {
      // Don't auto-switch if user manually selected lineup mode
      // This effect only runs when gamesPlayed changes from false to true
    }
  }, [gamesPlayed, rankingMode]);
  
  // Get all players with their team info and calculate performance ratings
  const allPlayers: RankedPlayer[] = teams.flatMap(team => 
    team.roster.map(player => {
      const { rating, hasStats, breakdown } = calculatePerformanceRating(player);
      return { player, team, performanceRating: rating, hasStats, breakdown };
    })
  );
  
  // Sort players by performance rating (actual stats-based)
  const topPlayers = [...allPlayers].sort((a, b) => b.performanceRating - a.performanceRating);
  
  // Get top players by role (excluding flex from main display, but include in data)
  const displayRoles: Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];
  const roleNames: Record<Role, string> = {
    duelist: 'Duelists',
    initiator: 'Initiators',
    controller: 'Controllers',
    sentinel: 'Sentinels',
    flex: 'Flex'
  };
  const roleColors: Record<Role, string> = {
    duelist: '#e74c3c',
    initiator: '#3498db',
    controller: '#9b59b6',
    sentinel: '#27ae60',
    flex: '#f39c12'
  };
  
  const topByRole: Record<Role, RankedPlayer[]> = {
    duelist: topPlayers.filter(p => p.player.role === 'duelist').slice(0, 5),
    initiator: topPlayers.filter(p => p.player.role === 'initiator').slice(0, 5),
    controller: topPlayers.filter(p => p.player.role === 'controller').slice(0, 5),
    sentinel: topPlayers.filter(p => p.player.role === 'sentinel').slice(0, 5),
    flex: topPlayers.filter(p => p.player.role === 'flex').slice(0, 5),
  };
  
  // Calculate rankings and sort based on mode
  const rankings = useMemo(() => {
    const rankingsList: PowerRanking[] = [];
    
    for (const team of teams) {
      const standing = standings.find(s => s.teamId === team.id);
      if (!standing) continue;
      
      const teamMatches = schedule
        .filter(m => m.played && m.result && (m.homeTeamId === team.id || m.awayTeamId === team.id))
        .slice(-5);
      
      const recentForm: ('W' | 'L')[] = teamMatches.map(m => 
        m.result && getWinnerId(m.result) === team.id ? 'W' : 'L'
      );
      
      const totalGames = standing.wins + standing.losses;
      const winRate = totalGames > 0 ? standing.wins / totalGames : 0.5;
      const mapDiff = standing.mapWins - standing.mapLosses;
      const mapDiffBonus = mapDiff * 2;
      const teamRating = getTeamOverall(team);
      
      const opponents = schedule
        .filter(m => m.played && (m.homeTeamId === team.id || m.awayTeamId === team.id))
        .map(m => m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId);
      
      const opponentRatings = opponents
        .map(oppId => {
          const opp = teams.find(t => t.id === oppId);
          return opp ? getTeamOverall(opp) : 80;
        })
        .filter(r => r > 0);
      
      const strengthOfSchedule = opponentRatings.length > 0 
        ? opponentRatings.reduce((a, b) => a + b, 0) / opponentRatings.length 
        : 80;
      
      let momentum = 0;
      recentForm.forEach((result, idx) => {
        const weight = (idx + 1) / recentForm.length;
        momentum += result === 'W' ? weight * 10 : -weight * 5;
      });
      
      const powerScore = 
        500 +
        (winRate * 300) +
        Math.max(-100, Math.min(100, mapDiffBonus)) +
        ((teamRating - 70) / 30 * 200) +
        ((strengthOfSchedule - 70) / 30 * 50) +
        Math.max(-50, Math.min(50, momentum));
      
      const lineupStrength = getTeamLineupStrength(team);
      
      rankingsList.push({
        team,
        standing,
        rank: 0,
        previousRank: 0,
        powerScore,
        lineupStrength,
        recentForm,
        strengthOfSchedule,
        teamRating,
        momentum
      });
    }
    
    // Sort based on mode
    if (rankingMode === 'lineup') {
      rankingsList.sort((a, b) => b.lineupStrength - a.lineupStrength);
    } else {
      rankingsList.sort((a, b) => b.powerScore - a.powerScore);
    }
    
    // Assign ranks
    rankingsList.forEach((r, idx) => {
      r.rank = idx + 1;
      r.previousRank = idx + 1;
    });
    
    return rankingsList;
  }, [teams, standings, schedule, rankingMode]);
  
  const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
  const regionNames: Record<Region, string> = {
    americas: 'Americas',
    emea: 'EMEA',
    pacific: 'Pacific',
    china: 'China'
  };
  
  const getTier = (rank: number): { name: string; color: string } => {
    if (rank <= 4) return { name: 'S', color: '#ffd700' };
    if (rank <= 12) return { name: 'A', color: '#ff6b35' };
    if (rank <= 24) return { name: 'B', color: '#6bf' };
    if (rank <= 36) return { name: 'C', color: '#5d5' };
    return { name: 'D', color: '#888' };
  };
  
  const getPlayerTier = (overall: number): { name: string; color: string } => {
    if (overall >= 90) return { name: 'S', color: '#ffd700' };
    if (overall >= 85) return { name: 'A', color: '#ff6b35' };
    if (overall >= 80) return { name: 'B', color: '#6bf' };
    if (overall >= 75) return { name: 'C', color: '#5d5' };
    return { name: 'D', color: '#888' };
  };

  // Featured player (best in the world)
  const mvpPlayer = topPlayers[0];
  
  return (
    <div className="power-rankings-page">
      <div className="content-header">
        <div className="content-header-left">
          <h1>🏆 Power Rankings</h1>
          <span className="player-count">{teams.length} teams • {allPlayers.length} players</span>
        </div>
        <div className="ranking-mode-toggle">
          <button 
            className={`mode-btn ${rankingMode === 'power' ? 'active' : ''}`}
            onClick={() => setRankingMode('power')}
            title="Power Rating - Based on actual match results and performance"
          >
            PWR{gamesPlayed && ' ✓'}
          </button>
          <button 
            className={`mode-btn ${rankingMode === 'lineup' ? 'active' : ''}`}
            onClick={() => setRankingMode('lineup')}
            title="Lineup Strength - Sum of effective starter OVRs"
          >
            STR{!gamesPlayed && ' ✓'}
          </button>
        </div>
      </div>
      
      <div className="power-rankings-info">
        <p>
          {rankingMode === 'power' 
            ? gamesPlayed 
              ? 'Rankings based on win rate, map differential, team strength, schedule difficulty, and recent form.'
              : 'No games played yet. PWR rankings will reflect actual performance once matches begin.'
            : 'Rankings based on total lineup strength (sum of effective starter OVRs including IGL bonuses and role penalties).'}
          {!gamesPlayed && rankingMode === 'lineup' && ' Best for early-season comparison before results exist.'}
        </p>
      </div>
      
      {/* Team Rankings Section */}
      <div className="power-rankings-grid">
        {/* Global Top 10 Teams */}
        <div className="panel power-rankings-top">
          <div className="panel-header">
            <span>🌍 Global Top 10 Teams</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="power-rankings-table">
              <thead>
                <tr>
                  <th className="rank-col">#</th>
                  <th className="tier-col">Tier</th>
                  <th>Team</th>
                  <th className="region-col">Region</th>
                  <th className="record-col">Record</th>
                  <th className="form-col">Form</th>
                  <th className="score-col">{rankingMode === 'power' ? 'PWR' : 'STR'}</th>
                </tr>
              </thead>
              <tbody>
                {rankings.slice(0, 10).map((r) => {
                  const tier = getTier(r.rank);
                  const isUser = r.team.id === userTeamId;
                  return (
                    <tr key={r.team.id} className={isUser ? 'user-row' : ''}>
                      <td className="rank-col">
                        <span className="rank-number">{r.rank}</span>
                      </td>
                      <td className="tier-col">
                        <span className="tier-badge" style={{ background: tier.color }}>{tier.name}</span>
                      </td>
                      <td>
                        <div className="team-cell" onClick={() => onViewTeam(r.team.id)}>
                          <img src={r.team.logo} alt="" className="team-mini-logo" />
                          <span className={`team-name-link ${isUser ? 'user-team' : ''}`}>{r.team.name}</span>
                        </div>
                      </td>
                      <td className="region-col">{regionNames[r.team.region]}</td>
                      <td className="record-col">{r.standing.wins}-{r.standing.losses}</td>
                      <td className="form-col">
                        <div className="form-indicator">
                          {r.recentForm.map((f, i) => (
                            <span key={i} className={`form-dot ${f === 'W' ? 'win' : 'loss'}`}>{f}</span>
                          ))}
                          {r.recentForm.length === 0 && <span className="no-form">-</span>}
                        </div>
                      </td>
                      <td className="score-col">
                        <span className="power-score">{rankingMode === 'power' ? Math.round(r.powerScore) : r.lineupStrength}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Regional Rankings */}
        <div className="regional-rankings">
          {regions.map(region => {
            const regionRankings = rankings.filter(r => r.team.region === region);
            return (
              <div key={region} className="panel regional-panel">
                <div className="panel-header">
                  {regionNames[region]}
                  <span className="panel-header-sub">{regionRankings.length} teams</span>
                </div>
                <div className="panel-body" style={{ padding: 0 }}>
                  <table className="power-rankings-table compact">
                    <thead>
                      <tr>
                        <th className="rank-col">#</th>
                        <th>Team</th>
                        <th className="record-col">W-L</th>
                        <th className="score-col">{rankingMode === 'power' ? 'PWR' : 'STR'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionRankings.map((r, idx) => {
                        const isUser = r.team.id === userTeamId;
                        const globalRank = r.rank;
                        return (
                          <tr key={r.team.id} className={isUser ? 'user-row' : ''}>
                            <td className="rank-col">
                              <div className="rank-display">
                                <span className="regional-rank">{idx + 1}</span>
                                <span className="global-rank">(#{globalRank})</span>
                              </div>
                            </td>
                            <td>
                              <div className="team-cell" onClick={() => onViewTeam(r.team.id)}>
                                <img src={r.team.logo} alt="" className="team-mini-logo" />
                                <span className={`team-name-link ${isUser ? 'user-team' : ''}`}>{r.team.abbreviation}</span>
                              </div>
                            </td>
                            <td className="record-col">{r.standing.wins}-{r.standing.losses}</td>
                            <td className="score-col">
                              <span className="power-score">{rankingMode === 'power' ? Math.round(r.powerScore) : r.lineupStrength}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Full Rankings Table */}
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header">
          📊 Full Global Team Rankings
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div className="power-rankings-table-wrapper">
            <table className="power-rankings-table full">
              <thead>
                <tr>
                  <th className="rank-col">#</th>
                  <th className="tier-col">Tier</th>
                  <th>Team</th>
                  <th className="region-col">Region</th>
                  <th className="record-col">Record</th>
                  <th className="map-col">Maps</th>
                  <th className="rating-col">Rating</th>
                  <th className="sos-col">SoS</th>
                  <th className="form-col">Form</th>
                  <th className="score-col">PWR</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => {
                  const tier = getTier(r.rank);
                  const isUser = r.team.id === userTeamId;
                  const mapDiff = r.standing.mapWins - r.standing.mapLosses;
                  return (
                    <tr key={r.team.id} className={isUser ? 'user-row' : ''}>
                      <td className="rank-col">
                        <span className="rank-number">{r.rank}</span>
                      </td>
                      <td className="tier-col">
                        <span className="tier-badge" style={{ background: tier.color }}>{tier.name}</span>
                      </td>
                      <td>
                        <div className="team-cell" onClick={() => onViewTeam(r.team.id)}>
                          <img src={r.team.logo} alt="" className="team-mini-logo" />
                          <span className={`team-name-link ${isUser ? 'user-team' : ''}`}>{r.team.name}</span>
                        </div>
                      </td>
                      <td className="region-col">{regionNames[r.team.region]}</td>
                      <td className="record-col">{r.standing.wins}-{r.standing.losses}</td>
                      <td className="map-col">
                        <span className={mapDiff >= 0 ? 'positive' : 'negative'}>
                          {mapDiff >= 0 ? '+' : ''}{mapDiff}
                        </span>
                      </td>
                      <td className="rating-col">{r.teamRating}</td>
                      <td className="sos-col">{r.strengthOfSchedule.toFixed(1)}</td>
                      <td className="form-col">
                        <div className="form-indicator">
                          {r.recentForm.map((f, i) => (
                            <span key={i} className={`form-dot ${f === 'W' ? 'win' : 'loss'}`}>{f}</span>
                          ))}
                          {r.recentForm.length === 0 && <span className="no-form">-</span>}
                        </div>
                      </td>
                      <td className="score-col">
                        <span className="power-score">{Math.round(r.powerScore)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========== PLAYER SPOTLIGHT SECTION ========== */}
      <div className="section-divider">
        <span className="divider-text">⭐ Player Rankings</span>
      </div>

      {/* Stats Legend */}
      <div className="stats-legend">
        <div className="legend-title">Stats Legend</div>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-abbr">ACS</span>
            <span className="legend-desc">Average Combat Score (damage, kills, assists per round)</span>
          </div>
          <div className="legend-item">
            <span className="legend-abbr">K/D</span>
            <span className="legend-desc">Kill/Death Ratio</span>
          </div>
          <div className="legend-item">
            <span className="legend-abbr">FK/Map</span>
            <span className="legend-desc">First Kills per Map (opening duels won)</span>
          </div>
          <div className="legend-item">
            <span className="legend-abbr">WIN%</span>
            <span className="legend-desc">Match Win Rate</span>
          </div>
          <div className="legend-item">
            <span className="legend-abbr">RTG</span>
            <span className="legend-desc">Performance Rating (weighted combination of all stats)</span>
          </div>
          <div className="legend-item">
            <span className="legend-abbr">PWR</span>
            <span className="legend-desc">Power Score (team ranking metric)</span>
          </div>
          <div className="legend-item">
            <span className="legend-abbr">SoS</span>
            <span className="legend-desc">Strength of Schedule (average opponent rating)</span>
          </div>
        </div>
      </div>

      {/* MVP Spotlight + Top 10 */}
      <div className="player-spotlight-grid">
        {/* MVP Card */}
        {mvpPlayer && (
          <div className="mvp-spotlight" onClick={() => onViewPlayer(mvpPlayer.player.id)}>
            <div className="mvp-badge">👑 #1 PLAYER IN THE WORLD</div>
            <div className="mvp-content">
              <div className="mvp-team-logo">
                <img src={mvpPlayer.team.logo} alt={mvpPlayer.team.name} />
              </div>
              <div className="mvp-info">
                <div className="mvp-name">{mvpPlayer.player.name}</div>
                <div className="mvp-team" onClick={(e) => { e.stopPropagation(); onViewTeam(mvpPlayer.team.id); }}>
                  {mvpPlayer.team.name}
                </div>
                <div className="mvp-meta">
                  <span 
                    className="mvp-role" 
                    style={{ background: roleColors[mvpPlayer.player.role] }}
                  >
                    {mvpPlayer.player.role.toUpperCase()}
                  </span>
                  <span className="mvp-region">{regionNames[mvpPlayer.team.region]}</span>
                  {mvpPlayer.hasStats && (
                    <span className="mvp-maps">{mvpPlayer.breakdown.mapsPlayed} maps</span>
                  )}
                </div>
              </div>
              <div className="mvp-rating">
                <div className="mvp-overall">{Math.round(mvpPlayer.performanceRating)}</div>
                <div className="mvp-overall-label">RTG</div>
              </div>
            </div>
            <div className="mvp-stats">
              {mvpPlayer.hasStats ? (
                <>
                  <div className="mvp-stat">
                    <span className="stat-value">{Math.round(mvpPlayer.breakdown.acs)}</span>
                    <span className="stat-label">ACS</span>
                  </div>
                  <div className="mvp-stat">
                    <span className="stat-value">{mvpPlayer.breakdown.kd.toFixed(2)}</span>
                    <span className="stat-label">K/D</span>
                  </div>
                  <div className="mvp-stat">
                    <span className="stat-value">{mvpPlayer.breakdown.fkPerMap.toFixed(1)}</span>
                    <span className="stat-label">FK/Map</span>
                  </div>
                  <div className="mvp-stat">
                    <span className="stat-value">{Math.round(mvpPlayer.breakdown.winRate)}%</span>
                    <span className="stat-label">WIN%</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="mvp-stat">
                    <span className="stat-value">{mvpPlayer.player.ratings.aim}</span>
                    <span className="stat-label">AIM</span>
                  </div>
                  <div className="mvp-stat">
                    <span className="stat-value">{mvpPlayer.player.ratings.gameSense}</span>
                    <span className="stat-label">IQ</span>
                  </div>
                  <div className="mvp-stat">
                    <span className="stat-value">{mvpPlayer.player.ratings.clutchFactor}</span>
                    <span className="stat-label">CLUTCH</span>
                  </div>
                  <div className="mvp-stat">
                    <span className="stat-value">{mvpPlayer.player.overall}</span>
                    <span className="stat-label">OVR</span>
                  </div>
                </>
              )}
            </div>
            {!mvpPlayer.hasStats && (
              <div className="mvp-no-stats-note">No matches played yet - rating based on potential</div>
            )}
          </div>
        )}

        {/* Global Top 10 Players */}
        <div className="panel top-players-panel">
          <div className="panel-header">🌍 Top 10 Players <span className="panel-header-sub">by Performance</span></div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="players-ranking-table">
              <thead>
                <tr>
                  <th className="rank-col">#</th>
                  <th>Player</th>
                  <th className="team-col">Team</th>
                  <th className="acs-col">ACS</th>
                  <th className="kd-col">K/D</th>
                  <th className="rating-col">RTG</th>
                </tr>
              </thead>
              <tbody>
                {topPlayers.slice(0, 10).map((p, idx) => {
                  const tier = getPlayerTier(p.performanceRating);
                  const isUserTeam = p.team.id === userTeamId;
                  return (
                    <tr key={p.player.id} className={isUserTeam ? 'user-row' : ''}>
                      <td className="rank-col">
                        <span className="rank-number">{idx + 1}</span>
                      </td>
                      <td>
                        <div className="player-cell">
                          <span 
                            className={`player-name-link ${isUserTeam ? 'user-team' : ''}`}
                            onClick={() => onViewPlayer(p.player.id)}
                          >
                            {p.player.name}
                          </span>
                          <img 
                            src={ROLE_ICONS[p.player.role]}
                            alt={p.player.role}
                            className="player-role-icon"
                            title={p.player.role.charAt(0).toUpperCase() + p.player.role.slice(1)}
                          />
                        </div>
                      </td>
                      <td className="team-col">
                        <div className="team-cell-mini" onClick={() => onViewTeam(p.team.id)}>
                          <img src={p.team.logo} alt="" className="team-micro-logo" />
                          <span>{p.team.abbreviation}</span>
                        </div>
                      </td>
                      <td className="acs-col">
                        {p.hasStats ? Math.round(p.breakdown.acs) : '-'}
                      </td>
                      <td className="kd-col">
                        {p.hasStats ? p.breakdown.kd.toFixed(2) : '-'}
                      </td>
                      <td className="rating-col">
                        <span className="player-overall" style={{ background: tier.color }}>
                          {Math.round(p.performanceRating)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Role Leaders */}
      <div className="role-leaders-section">
        <h3 className="role-leaders-title">Best at Every Position</h3>
        <div className="role-leaders-grid">
          {displayRoles.map(role => {
            const roleLeader = topByRole[role][0];
            if (!roleLeader) return null;
            
            return (
              <div 
                key={role} 
                className="role-leader-card"
                style={{ borderColor: roleColors[role] }}
                onClick={() => onViewPlayer(roleLeader.player.id)}
              >
                <div className="role-leader-header" style={{ background: roleColors[role] }}>
                  <span className="role-leader-role">{roleNames[role].toUpperCase()}</span>
                  <span className="role-leader-crown">👑</span>
                </div>
                <div className="role-leader-content">
                  <img src={roleLeader.team.logo} alt="" className="role-leader-team-logo" />
                  <div className="role-leader-info">
                    <div className="role-leader-name">{roleLeader.player.name}</div>
                    <div className="role-leader-team">{roleLeader.team.abbreviation}</div>
                    {roleLeader.hasStats && (
                      <div className="role-leader-stats">
                        <span>{Math.round(roleLeader.breakdown.acs)} ACS</span>
                        <span>{roleLeader.breakdown.kd.toFixed(2)} K/D</span>
                      </div>
                    )}
                  </div>
                  <div className="role-leader-rating">
                    <div className="role-leader-overall">{Math.round(roleLeader.performanceRating)}</div>
                    <div className="role-leader-label">RTG</div>
                  </div>
                </div>
                {/* Runner ups */}
                <div className="role-runner-ups">
                  {topByRole[role].slice(1, 4).map((p, idx) => (
                    <div 
                      key={p.player.id} 
                      className="runner-up"
                      onClick={(e) => { e.stopPropagation(); onViewPlayer(p.player.id); }}
                    >
                      <span className="runner-up-rank">#{idx + 2}</span>
                      <span className="runner-up-name">{p.player.name}</span>
                      <span className="runner-up-stats">
                        {p.hasStats ? `${Math.round(p.breakdown.acs)} ACS` : `${p.player.overall} OVR`}
                      </span>
                      <span className="runner-up-ovr">{Math.round(p.performanceRating)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}