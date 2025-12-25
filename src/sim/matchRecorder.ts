// src/sim/matchRecorder.ts
// Functions to record and update player statistics

import type { MatchResult, Team } from '../types';
import type { PlayerMatchRecord, PlayerMapRecord, PlayerCareerStats } from '../types/playerStats';

/**
 * Initialize empty career stats
 */
function createEmptyCareerStats(): PlayerCareerStats {
  return {
    matchHistory: [],
    totalMatches: 0,
    totalMaps: 0,
    matchWins: 0,
    matchLosses: 0,
    mapWins: 0,
    mapLosses: 0,
    totalKills: 0,
    totalDeaths: 0,
    totalAssists: 0,
    totalFirstKills: 0,
    totalFirstDeaths: 0,
    avgKillsPerMap: 0,
    avgDeathsPerMap: 0,
    avgAssistsPerMap: 0,
    avgACS: 0,
    avgKD: 0,
    avgFirstKillsPerMap: 0,
    avgFirstDeathsPerMap: 0,
    playoffMatches: 0,
    playoffMaps: 0,
    playoffMatchWins: 0,
    playoffMapWins: 0,
    playoffKills: 0,
    playoffDeaths: 0,
    playoffAssists: 0,
  };
}

/**
 * Recalculate averages from totals
 */
function recalculateAverages(stats: PlayerCareerStats): void {
  if (stats.totalMaps > 0) {
    stats.avgKillsPerMap = stats.totalKills / stats.totalMaps;
    stats.avgDeathsPerMap = stats.totalDeaths / stats.totalMaps;
    stats.avgAssistsPerMap = stats.totalAssists / stats.totalMaps;
    stats.avgFirstKillsPerMap = stats.totalFirstKills / stats.totalMaps;
    stats.avgFirstDeathsPerMap = stats.totalFirstDeaths / stats.totalMaps;
    stats.avgKD = stats.totalDeaths > 0 ? stats.totalKills / stats.totalDeaths : stats.totalKills;
    
    // Calculate average ACS from match history
    let totalACS = 0;
    let mapCount = 0;
    for (const match of stats.matchHistory) {
      for (const map of match.mapStats) {
        totalACS += map.acs;
        mapCount++;
      }
    }
    stats.avgACS = mapCount > 0 ? totalACS / mapCount : 0;
  }
}

/**
 * Record stats for a single team's players
 */
function recordTeamStats(
  players: Team['roster'],
  result: MatchResult,
  isHomeTeam: boolean,
  opponentTeam: Team,
  gameDay: number,
  season: number,
  isPlayoff: boolean,
  tournamentType?: 'regional' | 'international'
): void {
  const won = isHomeTeam 
    ? result.homeScore > result.awayScore 
    : result.awayScore > result.homeScore;
  
  for (const player of players) {
    const playerMapStats: PlayerMapRecord[] = [];
    let totalKills = 0, totalDeaths = 0, totalAssists = 0;
    let totalFK = 0, totalFD = 0, totalACS = 0;
    let mapsWon = 0;
    
    for (const mapScore of result.mapScores) {
      // Get stats from the correct side
      const statsArray = isHomeTeam ? mapScore.homePlayerStats : mapScore.awayPlayerStats;
      
      if (!statsArray) {
        console.warn(`[matchRecorder] Missing ${isHomeTeam ? 'home' : 'away'}PlayerStats for map ${mapScore.map}`);
        continue;
      }
      
      const playerStats = statsArray.find(s => s.playerId === player.id);
      
      if (!playerStats) {
        // DEBUG: Log when we can't find a player's stats
        console.warn(`[matchRecorder] Could not find stats for player ${player.name} (${player.id}) in ${isHomeTeam ? 'home' : 'away'}PlayerStats`);
        console.warn(`[matchRecorder] Available player IDs in stats:`, statsArray.map(s => s.playerId));
        console.warn(`[matchRecorder] Player IDs in roster:`, players.map(p => p.id));
        continue;
      }
      
      const mapWon = isHomeTeam 
        ? mapScore.homeRounds > mapScore.awayRounds
        : mapScore.awayRounds > mapScore.homeRounds;
      
      if (mapWon) mapsWon++;
      
      const roundScore = isHomeTeam
        ? `${mapScore.homeRounds}-${mapScore.awayRounds}`
        : `${mapScore.awayRounds}-${mapScore.homeRounds}`;
      
      playerMapStats.push({
        map: mapScore.map,
        agent: playerStats.agent || '',
        won: mapWon,
        roundScore,
        kills: playerStats.kills,
        deaths: playerStats.deaths,
        assists: playerStats.assists,
        firstKills: playerStats.firstKills || 0,
        firstDeaths: playerStats.firstDeaths || 0,
        acs: playerStats.acs,
      });
      
      totalKills += playerStats.kills;
      totalDeaths += playerStats.deaths;
      totalAssists += playerStats.assists;
      totalFK += playerStats.firstKills || 0;
      totalFD += playerStats.firstDeaths || 0;
      totalACS += playerStats.acs;
    }
    
    // Only record if we found at least one map of stats
    if (playerMapStats.length > 0) {
      const mapScore = isHomeTeam
        ? `${result.homeScore}-${result.awayScore}`
        : `${result.awayScore}-${result.homeScore}`;
      
      const matchRecord: PlayerMatchRecord = {
        matchId: result.id,
        date: gameDay,
        season,
        opponentTeamId: opponentTeam.id,
        opponentAbbr: opponentTeam.abbreviation,
        isPlayoff,
        tournamentType,
        won,
        mapScore,
        format: result.format,
        mapsPlayed: playerMapStats.length,
        totalKills,
        totalDeaths,
        totalAssists,
        totalFirstKills: totalFK,
        totalFirstDeaths: totalFD,
        totalACS,
        mapStats: playerMapStats,
      };
      
      // Initialize career stats if needed
      if (!player.careerStats) {
        player.careerStats = createEmptyCareerStats();
      }
      
      // Add to history
      player.careerStats.matchHistory.push(matchRecord);
      
      // Update totals
      player.careerStats.totalMatches++;
      player.careerStats.totalMaps += playerMapStats.length;
      if (won) player.careerStats.matchWins++;
      else player.careerStats.matchLosses++;
      player.careerStats.mapWins += mapsWon;
      player.careerStats.mapLosses += playerMapStats.length - mapsWon;
      player.careerStats.totalKills += totalKills;
      player.careerStats.totalDeaths += totalDeaths;
      player.careerStats.totalAssists += totalAssists;
      player.careerStats.totalFirstKills += totalFK;
      player.careerStats.totalFirstDeaths += totalFD;
      
      // Playoff specific
      if (isPlayoff) {
        player.careerStats.playoffMatches++;
        player.careerStats.playoffMaps += playerMapStats.length;
        if (won) player.careerStats.playoffMatchWins++;
        player.careerStats.playoffMapWins += mapsWon;
        player.careerStats.playoffKills += totalKills;
        player.careerStats.playoffDeaths += totalDeaths;
        player.careerStats.playoffAssists += totalAssists;
      }
      
      // Recalculate averages
      recalculateAverages(player.careerStats);
    } else {
      console.warn(`[matchRecorder] No map stats found for player ${player.name} (${player.id}) - careerStats not updated`);
    }
  }
}

/**
 * Record match stats for all players in a match
 */
export function recordMatchStats(
  result: MatchResult,
  homeTeam: Team,
  awayTeam: Team,
  gameDay: number,
  season: number,
  isPlayoff: boolean = false,
  tournamentType?: 'regional' | 'international'
): void {
  // Verify we have player stats in the result
  const hasHomeStats = result.mapScores.every(m => m.homePlayerStats && m.homePlayerStats.length > 0);
  const hasAwayStats = result.mapScores.every(m => m.awayPlayerStats && m.awayPlayerStats.length > 0);
  
  if (!hasHomeStats) {
    console.error(`[matchRecorder] Missing homePlayerStats in match result for ${homeTeam.name} vs ${awayTeam.name}`);
  }
  if (!hasAwayStats) {
    console.error(`[matchRecorder] Missing awayPlayerStats in match result for ${homeTeam.name} vs ${awayTeam.name}`);
  }
  
  // Verify team IDs match
  if (result.homeTeamId !== homeTeam.id) {
    console.error(`[matchRecorder] Team ID mismatch: result.homeTeamId=${result.homeTeamId} but homeTeam.id=${homeTeam.id}`);
  }
  if (result.awayTeamId !== awayTeam.id) {
    console.error(`[matchRecorder] Team ID mismatch: result.awayTeamId=${result.awayTeamId} but awayTeam.id=${awayTeam.id}`);
  }
  
  // Record stats for both teams
  recordTeamStats(homeTeam.roster, result, true, awayTeam, gameDay, season, isPlayoff, tournamentType);
  recordTeamStats(awayTeam.roster, result, false, homeTeam, gameDay, season, isPlayoff, tournamentType);
}

/**
 * Ensure all players have careerStats initialized (call on game load)
 */
export function ensureCareerStatsInitialized(teams: Team[]): void {
  for (const team of teams) {
    for (const player of team.roster) {
      if (!player.careerStats) {
        player.careerStats = createEmptyCareerStats();
      }
    }
  }
}