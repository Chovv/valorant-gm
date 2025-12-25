// src/types/team.ts
// Team model types for ValorantGM

import type { Player } from './player';
import type { StartingSlot } from './roster';

/**
 * Team regions for league structure
 */
export type Region = 'americas' | 'emea' | 'pacific' | 'china';

/**
 * Staff member interface
 */
export interface StaffMember {
  id: string;
  name: string;
  rating: number; // 0-100 effectiveness
}

/**
 * Team staff structure
 */
export interface TeamStaff {
  headCoach: StaffMember | null;
  assistantCoach: StaffMember | null;
  analyst: StaffMember | null;
}

/**
 * Team-level aggregated attributes
 * Calculated from roster composition
 */
export interface TeamAttributes {
  firepower: number;     // Raw fragging ability
  utilityDepth: number;  // Quality of utility usage across roster
  macroPlay: number;     // Strategic/tactical coordination
  mentalStrength: number; // Clutch performance, comeback ability
}

/**
 * Team budget and finances
 */
export interface TeamFinances {
  budget: number;        // Total annual budget
  salaryCommitted: number; // Currently committed to salaries
  scoutingBudget: number;  // Allocated to scouting accuracy
}

/**
 * Complete Team interface
 */
export interface Team {
  id: string;
  name: string;
  abbreviation: string;  // e.g., "SEN", "LOUD"
  logo: string;
  region: Region;

  roster: Player[];               // Full roster (up to 10 players)
  startingLineup?: StartingSlot[]; // 5 starters with assigned roles (optional - defaults to first 5 with natural roles)
  iglId: string | null;           // Player ID of the in-game leader
  staff: TeamStaff;
  finances: TeamFinances;

  // Calculated attributes (updated when roster changes)
  attributes: TeamAttributes;

  // History
  championships: number;
  playoffAppearances: number;
  founded: number;       // Year founded
}

/**
 * Partial team for creation
 */
export type TeamCreateInput = Pick<Team, 'name' | 'abbreviation' | 'region'> &
  Partial<Omit<Team, 'name' | 'abbreviation' | 'region'>>;