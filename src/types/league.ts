// src/types/league.ts
// League and season types for ValorantGM

import type { Team } from './team';
import type { Player } from './player';

/**
 * Season phase
 */
export type SeasonPhase =
  | 'preseason'
  | 'regular_season'
  | 'playoffs'
  | 'offseason';

/**
 * Match format
 */
export type MatchFormat = 'bo1' | 'bo3' | 'bo5';

/**
 * Player stats for a single map
 */
export interface PlayerMapStats {
  playerId: string;
  agent: string;  // Agent used on this map (e.g., 'jett', 'viper', 'omen')
  kills: number;
  deaths: number;
  assists: number;
  acs: number; // Average Combat Score
  firstKills: number;
  firstDeaths: number;
}

/**
 * Single match result
 */
export interface MatchResult {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  format: MatchFormat;
  mapScores: Array<{
    map: string;
    homeRounds: number;
    awayRounds: number;
    homePlayerStats?: PlayerMapStats[];
    awayPlayerStats?: PlayerMapStats[];
  }>;
  date: number; // In-game date (day of season)
  seed: string; // RNG seed for replay
}

/**
 * Team standings entry
 */
export interface StandingsEntry {
  teamId: string;
  wins: number;
  losses: number;
  mapWins: number;
  mapLosses: number;
  roundDifferential: number;
}

/**
 * Draft pick
 */
export interface DraftPick {
  round: number;
  pick: number;
  originalTeamId: string; // Team that originally owned pick
  currentTeamId: string;  // Team that now owns pick (if traded)
  playerId: string | null; // Filled after draft
}

/**
 * Season state
 */
export interface Season {
  year: number;
  phase: SeasonPhase;
  currentDay: number;

  standings: StandingsEntry[];
  schedule: MatchResult[]; // Includes completed and upcoming
  completedMatches: number;

  playoffBracket: PlayoffBracket | null;
  champion: string | null; // Team ID
}

/**
 * Playoff bracket
 */
export interface PlayoffBracket {
  format: 'single_elimination' | 'double_elimination';
  rounds: PlayoffRound[];
}

export interface PlayoffRound {
  name: string; // "Quarterfinals", "Semifinals", etc.
  matchups: PlayoffMatchup[];
}

export interface PlayoffMatchup {
  id: string;
  team1Id: string | null;
  team2Id: string | null;
  winnerId: string | null;
  matchResults: MatchResult[];
  format: MatchFormat;
}

/**
 * Free agent pool
 */
export interface FreeAgentPool {
  players: Player[];
}

/**
 * Draft class
 */
export interface DraftClass {
  year: number;
  players: Player[];
  strength: 'weak' | 'average' | 'strong' | 'generational';
}

/**
 * Complete League state
 */
export interface League {
  id: string;
  name: string;

  teams: Team[];
  freeAgents: FreeAgentPool;

  currentSeason: Season;
  seasonHistory: Season[];

  draftPicks: DraftPick[];
  upcomingDraftClass: DraftClass | null;

  // Game settings
  settings: LeagueSettings;

  // RNG state
  baseSeed: string;
}

/**
 * Configurable league settings
 */
export interface LeagueSettings {
  salaryCap: number;
  minRosterSize: number;
  maxRosterSize: number;
  regularSeasonGames: number;
  playoffTeams: number;
  playoffFormat: 'single_elimination' | 'double_elimination';
}