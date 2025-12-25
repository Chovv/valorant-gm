// src/sim/rosterManagement.ts
// Roster management utilities for ValorantGM

import type { Player, Role,} from '../types';
import type { StartingSlot } from '../types/roster';
import {  STANDARD_ROLES, getRolePenalty } from '../types/roster';

/**
 * Calculate effective overall for a player in an assigned role
 */
export function getEffectiveOverall(player: Player, assignedRole: Role): number {
  const penalty = getRolePenalty(player.role, assignedRole);
  return Math.max(0, player.overall + penalty);
}

/**
 * Calculate IGL score for a player
 * Combines game sense, utility usage, and personality traits
 * Higher score = better IGL candidate
 */
export function calculateIGLScore(player: Player): number {
  // Ratings contribution (40% weight)
  const ratingsScore = 
    (player.ratings.gameSense * 0.30) +      // Core game reading
    (player.ratings.utilityUsage * 0.10);    // Util coordination
  
  // Personality contribution (60% weight) - with null safety
  const leadership = player.personality?.leadership ?? 50;
  const teamPlayer = player.personality?.teamPlayer ?? 50;
  const mentality = player.personality?.mentality ?? 50;
  const workEthic = player.personality?.workEthic ?? 50;
  
  const personalityScore =
    (leadership * 0.25) +      // Most important - commanding respect
    (teamPlayer * 0.15) +      // Selfless play, setting up teammates
    (mentality * 0.12) +       // Composure under pressure
    (workEthic * 0.08);        // Preparation, studying opponents
  
  return ratingsScore + personalityScore;
}

/**
 * Find the best IGL candidate from a list of players
 * Returns the player ID of the best IGL
 */
export function findBestIGL(players: Player[]): string | null {
  if (players.length === 0) return null;
  
  let bestPlayer: Player | null = null;
  let bestScore = -Infinity;
  
  for (const player of players) {
    const score = calculateIGLScore(player);
    if (score > bestScore) {
      bestScore = score;
      bestPlayer = player;
    }
  }
  
  return bestPlayer?.id ?? null;
}

/**
 * Result type for optimize functions
 */
export interface OptimizeResult {
  lineup: StartingSlot[];
  recommendedIGL: string | null;
}

/**
 * Auto-optimize starting lineup - Comfort Mode
 * Prioritizes players in their natural roles (0 penalty), then fills gaps
 * Also selects the best IGL from the resulting lineup
 */
export function autoOptimizeLineupComfort(roster: Player[]): OptimizeResult {
  if (roster.length < 5) {
    throw new Error('Roster must have at least 5 players');
  }

  const lineup: StartingSlot[] = [];
  const usedPlayerIds = new Set<string>();
  const filledRoles = new Set<Role>();

  // Sort players by overall (highest first) to prioritize better players
  const sortedRoster = [...roster].sort((a, b) => b.overall - a.overall);

  // Pass 1: Assign players to their natural roles if the role isn't filled yet
  // This ensures players play their best position before flex players "steal" roles
  for (const player of sortedRoster) {
    if (usedPlayerIds.size >= 5) break;

    // Check if this player's natural role is still available
    if (!filledRoles.has(player.role)) {
      lineup.push({
        playerId: player.id,
        assignedRole: player.role,
      });
      usedPlayerIds.add(player.id);
      filledRoles.add(player.role);
    }
  }

  // Pass 2: Fill remaining roles with best available players (may have penalties)
  const remainingRoles = STANDARD_ROLES.filter(role => !filledRoles.has(role));

  for (const role of remainingRoles) {
    let bestPlayer: Player | null = null;
    let bestEffectiveOvr = -Infinity;

    for (const player of roster) {
      if (usedPlayerIds.has(player.id)) continue;

      const effectiveOvr = getEffectiveOverall(player, role);
      if (effectiveOvr > bestEffectiveOvr) {
        bestEffectiveOvr = effectiveOvr;
        bestPlayer = player;
      }
    }

    if (bestPlayer) {
      lineup.push({
        playerId: bestPlayer.id,
        assignedRole: role,
      });
      usedPlayerIds.add(bestPlayer.id);
      filledRoles.add(role);
    }
  }

  // Ensure lineup is sorted by STANDARD_ROLES order for consistent display
  lineup.sort((a, b) => 
    STANDARD_ROLES.indexOf(a.assignedRole) - STANDARD_ROLES.indexOf(b.assignedRole)
  );

  // Find best IGL from the starters
  const starters = lineup.map(slot => roster.find(p => p.id === slot.playerId)!).filter(Boolean);
  const recommendedIGL = findBestIGL(starters);

  return { lineup, recommendedIGL };
}

/**
 * Auto-optimize starting lineup - Strength Mode
 * Maximizes total effective OVR using Hungarian-like greedy assignment
 * Also selects the best IGL from the resulting lineup
 */
export function autoOptimizeLineupStrength(roster: Player[]): OptimizeResult {
  if (roster.length < 5) {
    throw new Error('Roster must have at least 5 players');
  }

  // Build a matrix of all player-role combinations with effective OVR
  const candidates: Array<{
    player: Player;
    role: Role;
    effectiveOvr: number;
  }> = [];

  for (const player of roster) {
    for (const role of STANDARD_ROLES) {
      candidates.push({
        player,
        role,
        effectiveOvr: getEffectiveOverall(player, role),
      });
    }
  }

  // Sort by effective OVR descending - greedy approach
  candidates.sort((a, b) => b.effectiveOvr - a.effectiveOvr);

  const lineup: StartingSlot[] = [];
  const usedPlayerIds = new Set<string>();
  const filledRoles = new Set<Role>();

  // Greedily assign best player-role combinations
  for (const candidate of candidates) {
    if (usedPlayerIds.has(candidate.player.id)) continue;
    if (filledRoles.has(candidate.role)) continue;

    lineup.push({
      playerId: candidate.player.id,
      assignedRole: candidate.role,
    });
    usedPlayerIds.add(candidate.player.id);
    filledRoles.add(candidate.role);

    if (lineup.length >= 5) break;
  }

  // Ensure lineup is sorted by STANDARD_ROLES order for consistent display
  lineup.sort((a, b) => 
    STANDARD_ROLES.indexOf(a.assignedRole) - STANDARD_ROLES.indexOf(b.assignedRole)
  );

  // Find best IGL from the starters
  const starters = lineup.map(slot => roster.find(p => p.id === slot.playerId)!).filter(Boolean);
  const recommendedIGL = findBestIGL(starters);

  return { lineup, recommendedIGL };
}

/**
 * Auto-optimize starting lineup (default - uses comfort mode)
 */
export function autoOptimizeLineup(roster: Player[]): OptimizeResult {
  return autoOptimizeLineupComfort(roster);
}

/**
 * Create a default starting lineup using players' natural roles
 */
export function createDefaultLineup(roster: Player[]): StartingSlot[] {
  return roster.slice(0, 5).map(player => ({
    playerId: player.id,
    assignedRole: player.role,
  }));
}

/**
 * Validate a starting lineup
 */
export function validateLineup(lineup: StartingSlot[], roster: Player[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check we have exactly 5 starters
  if (lineup.length !== 5) {
    errors.push(`Lineup must have exactly 5 starters (has ${lineup.length})`);
  }

  // Check all players exist in roster
  const rosterIds = new Set(roster.map(p => p.id));
  for (const slot of lineup) {
    if (!rosterIds.has(slot.playerId)) {
      errors.push(`Player ${slot.playerId} not found in roster`);
    }
  }

  // Check no duplicate players
  const playerIds = lineup.map(s => s.playerId);
  const uniqueIds = new Set(playerIds);
  if (uniqueIds.size !== playerIds.length) {
    errors.push('Duplicate players in lineup');
  }

  // Check all standard roles are filled
  const assignedRoles = new Set(lineup.map(s => s.assignedRole));
  for (const role of STANDARD_ROLES) {
    if (!assignedRoles.has(role)) {
      errors.push(`Missing role: ${role}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get bench players (players not in starting lineup)
 */
export function getBenchPlayers(roster: Player[], lineup: StartingSlot[]): Player[] {
  const starterIds = new Set(lineup.map(s => s.playerId));
  return roster.filter(p => !starterIds.has(p.id));
}

/**
 * Swap a starter with a bench player
 */
export function swapPlayers(
  lineup: StartingSlot[],
  starterPlayerId: string,
  benchPlayerId: string,
  assignedRole: Role
): StartingSlot[] {
  return lineup.map(slot =>
    slot.playerId === starterPlayerId
      ? { playerId: benchPlayerId, assignedRole }
      : slot
  );
}

/**
 * Change a player's assigned role
 */
export function changeAssignedRole(
  lineup: StartingSlot[],
  playerId: string,
  newRole: Role
): StartingSlot[] {
  // Find another player with the target role and swap roles
  const playerSlot = lineup.find(s => s.playerId === playerId);
  const targetSlot = lineup.find(s => s.assignedRole === newRole);

  if (!playerSlot || !targetSlot) {
    return lineup;
  }

  // Swap roles between the two players
  return lineup.map(slot => {
    if (slot.playerId === playerId) {
      return { ...slot, assignedRole: newRole };
    }
    if (slot.playerId === targetSlot.playerId) {
      return { ...slot, assignedRole: playerSlot.assignedRole };
    }
    return slot;
  });
}

/**
 * Calculate lineup strength (sum of effective OVRs)
 */
export function calculateLineupStrength(roster: Player[], lineup: StartingSlot[]): number {
  let totalStrength = 0;
  
  for (const slot of lineup) {
    const player = roster.find(p => p.id === slot.playerId);
    if (player) {
      totalStrength += getEffectiveOverall(player, slot.assignedRole);
    }
  }
  
  return totalStrength;
}

/**
 * Get lineup summary with player info and penalties
 */
export interface LineupSummary {
  playerId: string;
  playerName: string;
  naturalRole: Role;
  assignedRole: Role;
  baseOverall: number;
  effectiveOverall: number;
  penalty: number;
  isNaturalRole: boolean;
}

export function getLineupSummary(roster: Player[], lineup: StartingSlot[]): LineupSummary[] {
  return lineup.map(slot => {
    const player = roster.find(p => p.id === slot.playerId);
    if (!player) {
      return {
        playerId: slot.playerId,
        playerName: 'Unknown',
        naturalRole: 'flex' as Role,
        assignedRole: slot.assignedRole,
        baseOverall: 0,
        effectiveOverall: 0,
        penalty: 0,
        isNaturalRole: false,
      };
    }

    const penalty = getRolePenalty(player.role, slot.assignedRole);
    return {
      playerId: player.id,
      playerName: player.name,
      naturalRole: player.role,
      assignedRole: slot.assignedRole,
      baseOverall: player.overall,
      effectiveOverall: getEffectiveOverall(player, slot.assignedRole),
      penalty,
      isNaturalRole: player.role === slot.assignedRole || penalty === 0,
    };
  });
}