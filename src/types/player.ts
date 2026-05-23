// src/types/player.ts
// Core player model types for ValorantGM

import type { PlayerCareerStats } from './playerStats';

/**
 * Player roles in VALORANT
 */
export type Role = 'duelist' | 'controller' | 'initiator' | 'sentinel' | 'flex';

/**
 * Player backgrounds - defines starting stat bias and development shape
 */
export type PlayerBackground =
  | 'valorant_native'
  | 'csgo_veteran'
  | 'overwatch_player'
  | 'battle_royale'
  | 'unknown_talent';

/**
 * Player archetypes - playstyle emphasis within a role
 */
export type DuelistArchetype = 'entry_fragger' | 'clutch_star' | 'feast_or_famine';
export type ControllerArchetype = 'utility_specialist' | 'macro_brain' | 'aggressive_smoker';
export type InitiatorArchetype = 'info_gatherer' | 'playmaker' | 'support_initiator';
export type SentinelArchetype = 'anchor' | 'support_leader' | 'lurker';

export type PlayerArchetype =
  | DuelistArchetype
  | ControllerArchetype
  | InitiatorArchetype
  | SentinelArchetype;

/**
 * Core skill ratings (0-100 scale)
 * These are the TRUE ratings used by simulation
 */
export interface Ratings {
  aim: number;
  sprayControl: number;
  gameSense: number;
  utilityUsage: number;
  clutchFactor: number;
  communication: number;
}

/**
 * Potential represents maximum plausible future performance
 */
export interface Potential {
  ceiling: number; // Hard cap - best case development
  floor: number;   // Minimum outcome - worst case
}

/**
 * Development profile - how a player grows/declines over time
 */
export interface DevelopmentProfile {
  peakAge: number;       // Age at which player is expected to peak
  volatility: number;    // How much ratings can swing year-to-year (0-1)
  learningRate: number;  // How fast they improve in good conditions (0-1)
}

/**
 * Personality traits affecting team chemistry and development
 */
export interface Personality {
  leadership: number;    // 0-100: Ability to lead and motivate
  coachability: number;  // 0-100: How well they respond to coaching
  workEthic: number;     // 0-100: Training dedication
  mentality: number;     // 0-100: Mental fortitude under pressure
  teamPlayer: number;    // 0-100: Willingness to sacrifice for team
}

/**
 * Contract information
 */
export interface Contract {
  salary: number;        // Annual salary
  yearsRemaining: number;
  teamOption: boolean;   // Team can release early
  playerOption: boolean; // Player can leave early
}

/**
 * Agent comfort levels (agent name -> comfort rating 0-100)
 */
export type AgentPool = Record<string, number>;

/**
 * Award types a player can accumulate over their career
 */
export type PlayerAwardType =
  | 'world_champion'
  | 'kickoff_champion'
  | 'finals_mvp'
  | 'season_mvp'
  | 'rookie_of_year'
  | 'best_duelist'
  | 'best_controller'
  | 'best_initiator'
  | 'best_sentinel'
  | 'all_vct_first'
  | 'all_vct_second'
  | 'clutch_king'
  | 'entry_fragger';

export interface PlayerAward {
  type: PlayerAwardType;
  year: number;
  detail?: string; // e.g. region for kickoff_champion
}

/**
 * Complete Player interface
 */
export interface Player {
  id: string;
  name: string;
  age: number;
  role: Role;
  background: PlayerBackground;
  archetype: PlayerArchetype;

  ratings: Ratings;
  potential: Potential;
  overall: number;
  consistency: number;  // 0-100: How reliably they perform (affects match-day form variance)

  careerStats?: PlayerCareerStats;

  development: DevelopmentProfile;
  personality: Personality;

  contract: Contract | null; // null if free agent
  agentPool: AgentPool; // Agent comfort levels

  // Metadata
  draftYear: number | null;
  draftPick: number | null;
  yearsInLeague: number;
  retired: boolean;
  
  // Profile image URL (optional - falls back to generated avatar)
  imageUrl?: string;
  
  // Country code (ISO 3166-1 alpha-2, e.g. "US", "KR", "BR")
  nationality?: string;
  
  // IGL candidate flag (used for free agents who are known IGLs)
  isIGL?: boolean;

  // career awards
  awards?: PlayerAward[];

  // per-map agent priority lists (map name → up to 3 agents in priority order)
  mapAgentPrefs?: Partial<Record<string, string[]>>;

  // per-player agent variance override (0-100); falls back to global setting if unset
  agentVariance?: number;

  // signature weapon preference (e.g. 'Odin', 'Operator', 'Vandal')
  // player prefers this gun on full/half buys and gets a small performance bonus with it
  gunPref?: string;
}

/**
 * Partial player for creation/generation
 * Makes most fields optional for the generator
 */
export type PlayerCreateInput = Pick<Player, 'name' | 'age' | 'role' | 'background' | 'archetype'> &
  Partial<Omit<Player, 'name' | 'age' | 'role' | 'background' | 'archetype'>>;
  