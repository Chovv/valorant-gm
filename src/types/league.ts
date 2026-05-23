// src/types/league.ts
// League and season types for ValorantGM

import type { Team } from './team';
import type { Player } from './player';

/**
 * Season phase
 */
export type SeasonPhase =
  | 'preseason'
  | 'kickoff_bracket'
  | 'international'
  | 'offseason';

/**
 * Match format
 */
export type MatchFormat = 'bo1' | 'bo3' | 'bo5';

/**
 * Economy / buy state for a team in a round
 */
export type BuyState = 'pistol' | 'save' | 'eco' | 'force' | 'half' | 'full';

/**
 * Shield type a player can buy
 */
export type ShieldType = 'none' | 'light' | 'regen' | 'heavy';

/**
 * Round win condition
 */
export type RoundWinCondition = 'elimination' | 'spike_detonation' | 'spike_defused' | 'time_expired';

/**
 * Single kill event in a round
 */
export interface KillEvent {
  type: 'kill';
  killerPlayerId: string;
  killerName: string;
  killerAgent: string;
  killerTeamId: string;
  victimPlayerId: string;
  victimName: string;
  victimAgent: string;
  victimTeamId: string;
  weapon: string;
  abilityId?: string;         // links to AgentAbility.id when isAbilityKill is true
  isFirstBlood: boolean;
  isAbilityKill: boolean;
  isHeadshot: boolean;
  isWallbang: boolean;
  isAoeSplash?: boolean;       // true for bonus kills from an AOE ability (not the primary hit)
  isUltActivation?: boolean;   // true on the first kill of an ultimate activation in a round
  killNumber: number;      // Sequential kill in round (1-indexed)
  killerRoundKills: number; // How many kills the killer has THIS round after this kill
}

/**
 * Full log for a single round
 */
export interface RoundLog {
  roundNumber: number;       // 1-indexed
  homeBuyState: BuyState;
  awayBuyState: BuyState;
  attackingTeamId: string;   // Which team is attacking this round
  winnerTeamId: string;
  winCondition: RoundWinCondition;
  homeAlive: number;         // Players alive on winning side
  awayAlive: number;
  kills: KillEvent[];
  isHalfTime: boolean;       // true for round 13 (first round of 2nd half)
  isOvertime: boolean;
  homeRoundScore: number;    // Cumulative score after this round
  awayRoundScore: number;
  clutch?: {                 // Present if a 1vX clutch was won (X >= 2)
    playerId: string;
    playerName: string;
    playerAgent: string;
    teamId: string;
    opponents: number;       // The X in 1vX
  };
  playerWeapons: Record<string, string>;     // playerId → weapon at round start
  playerShields: Record<string, ShieldType>; // playerId → shield at round start
  utilityUlts?: {                              // utility (non-kill) ult activations this round
    playerId: string;
    playerName: string;
    agent: string;
    teamId: string;
    abilityId: string;
    abilityName: string;
    afterKillIndex?: number;                   // -1 = pre-round, N = show after Nth kill in feed
    targetPlayerId?: string;                   // sage res / clove self-res: who got revived
    targetPlayerName?: string;
    targetAgent?: string;
  }[];
  playerAssists?: Record<string, number>;      // playerId → assists earned this round
  timeout?: {                                    // tactical timeout called before this round
    teamId: string;
  };
  momentum?: { home: number; away: number };    // team momentum going into this round (0-5)
}

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

export type AwardType = 'mvp' | 'clutch_king' | 'first_blood' | 'kd_diff' | 'raid_boss';

export interface MatchAward {
  type: AwardType;
  label: string;
  playerId: string;
  playerName: string;
  playerAgent: string;
  mapAgent: string;
  agents?: string[];
  teamId: string;
  value: string;
  map?: string;
  mapLines?: { agent: string; map: string; value: string }[];
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
    roundLogs?: RoundLog[];
  }>;
  date: number; // In-game date (day of season)
  seed: string; // RNG seed for replay
  awards?: MatchAward[];
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

export interface SuspendedMatchInfo {
  matchupId: string;
  homeAbbr: string;
  awayAbbr: string;
  mapName: string;
  mapNumber: number;
  totalMaps: number;
  homeSeriesScore: number;
  awaySeriesScore: number;
  homeMapScore: number;
  awayMapScore: number;
}

/**
 * Snapshot of a completed season for the history page
 */
// team reference — either an existing team (by ID) or a custom name+logo
export interface TeamRef {
  teamId: string | null;     // null if team doesn't exist in save
  name?: string;             // display name (used when teamId is null)
  logo?: string;             // logo path (used when teamId is null)
}

export type TournamentType = 'champions' | 'masters';
export type TournamentStatus = 'completed' | 'ongoing' | 'upcoming';

export const TOURNAMENT_LABELS: Record<TournamentType, string> = {
  champions: 'Champions',
  masters: 'Masters',
};

export interface SeasonHistoryEntry {
  id?: string; // unique identifier (auto-generated use year-type, manual entries get a uuid)
  year: number;
  isManual?: boolean;
  tournamentType?: TournamentType; // defaults to 'champions' for auto-generated
  eventName?: string; // e.g. "Stage 1", "Stage 2", "Berlin", "Copenhagen" — distinguishes multiple events of same type
  sortIndex?: number; // manual ordering within same year (lower = earlier)
  manualStatus?: TournamentStatus; // manual override for status (upcoming/ongoing/completed)
  location?: string;   // e.g. "Shanghai", "Los Angeles"
  locationFlag?: string; // country code for flag, e.g. "CN", "US"
  dateRange?: string;  // e.g. "Sep 24 – Oct 18, 2026"

  // main table
  worldChampionId: string | null;
  worldChampionCustom?: { name: string; logo: string; abbreviation?: string }; // fallback if team doesn't exist
  runnerUpId: string | null;
  runnerUpCustom?: { name: string; logo: string; abbreviation?: string };
  finalsMvp: { playerId: string; playerName: string; teamId: string; avgACS: number } | null;
  seasonMvp: { playerId: string; playerName: string; teamId: string; score: number } | null;
  rookieOfYear: { playerId: string; playerName: string; teamId: string; score: number } | null;

  // players who receive championship ring (manual entries only)
  championRoster?: Array<{ playerId: string; playerName: string; nationality?: string; isIGL?: boolean; ovr?: number }>;
  runnerUpRoster?: Array<{ playerId: string; playerName: string; nationality?: string; isIGL?: boolean; ovr?: number }>;

  // regional kickoff winners
  kickoffWinners: Record<Region, string | null>; // teamId per region
  kickoffWinnersCustom?: Record<Region, { name: string; logo: string } | null>;
  kickoffRosters?: Record<Region, Array<{ playerId: string; playerName: string }>>;

  // all-vct teams (5 players each)
  allVctFirst: Array<{ playerId: string; playerName: string; teamId: string; role: string; avgACS: number; score: number }>;
  allVctSecond: Array<{ playerId: string; playerName: string; teamId: string; role: string; avgACS: number; score: number }>;

  // specialty
  clutchKing: { playerId: string; playerName: string; teamId: string; count: number } | null;
  entryFragger: { playerId: string; playerName: string; teamId: string; fkPerMap: number } | null;

  // best in role
  bestDuelist: { playerId: string; playerName: string; teamId: string } | null;
  bestController: { playerId: string; playerName: string; teamId: string } | null;
  bestInitiator: { playerId: string; playerName: string; teamId: string } | null;
  bestSentinel: { playerId: string; playerName: string; teamId: string } | null;

  // event-level awards (international tournament only)
  tournamentAcsLeader?: { playerId: string; playerName: string; teamId: string; avgACS: number } | null;
  tournamentKdLeader?: { playerId: string; playerName: string; teamId: string; kd: number } | null;
}