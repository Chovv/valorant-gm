// src/types/playerStats.ts
// Player match history and statistics tracking

import type { MatchFormat } from './league';

/**
 * Single match performance record for a player
 */
export interface PlayerMatchRecord {
  matchId: string;
  date: number; // Game day
  season: number;
  opponentTeamId: string;
  opponentAbbr: string;
  isPlayoff: boolean;
  tournamentType?: 'regional' | 'international';
  
  // Match result
  won: boolean;
  mapScore: string; // e.g., "2-1"
  format: MatchFormat;
  
  // Aggregated stats across all maps in the match
  mapsPlayed: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  totalFirstKills: number;
  totalFirstDeaths: number;
  totalACS: number; // Sum of ACS across maps (divide by mapsPlayed for average)
  
  // Per-map breakdown
  mapStats: PlayerMapRecord[];
}

/**
 * Single map performance record
 */
export interface PlayerMapRecord {
  map: string;
  agent: string;
  won: boolean;
  roundScore: string; // e.g., "13-9"
  
  kills: number;
  deaths: number;
  assists: number;
  firstKills: number;
  firstDeaths: number;
  acs: number;
}

/**
 * Career statistics summary
 */
export interface PlayerCareerStats {
  // Match records
  matchHistory: PlayerMatchRecord[];
  
  // Aggregated career stats
  totalMatches: number;
  totalMaps: number;
  matchWins: number;
  matchLosses: number;
  mapWins: number;
  mapLosses: number;
  
  // Combat stats
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  totalFirstKills: number;
  totalFirstDeaths: number;
  
  // Averages (calculated)
  avgKillsPerMap: number;
  avgDeathsPerMap: number;
  avgAssistsPerMap: number;
  avgACS: number;
  avgKD: number;
  avgFirstKillsPerMap: number;
  avgFirstDeathsPerMap: number;
  
  // Playoff stats (separate tracking)
  playoffMatches: number;
  playoffMaps: number;
  playoffMatchWins: number;
  playoffMapWins: number;
  playoffKills: number;
  playoffDeaths: number;
  playoffAssists: number;
}