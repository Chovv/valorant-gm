// src/sim/iglBonus.ts
// IGL leadership bonus/penalty system

import type { Player, Team, Ratings } from '../types';
import type { StartingSlot } from '../types/roster';
import { coachMod, specMod } from './coachBonus';

/**
 * IGL Bonus System
 * 
 * - Neutral point: 70 Game Sense
 * - Formula: Math.round((iglGameSense - 70) * 0.15)
 * - Caps: -4 to +4
 * - Affected stats: Communication, Game Sense, Utility Usage
 * - Applies to teammates only, not the IGL themselves
 * - If no IGL or IGL benched: -2 Communication penalty to all starters
 */

export interface IGLBonusResult {
  bonus: number;
  hasIGL: boolean;
  iglName: string | null;
  iglGameSense: number | null;
}

/**
 * Calculate the IGL bonus/penalty for a team
 */
export function calculateIGLBonus(
  team: Team,
  lineup: StartingSlot[]
): IGLBonusResult {
  // Check if team has an assigned IGL
  if (!team.iglId) {
    return {
      bonus: -2,
      hasIGL: false,
      iglName: null,
      iglGameSense: null,
    };
  }

  // Check if IGL is in the starting lineup
  const iglInLineup = lineup.some(slot => slot.playerId === team.iglId);
  
  if (!iglInLineup) {
    return {
      bonus: -2,
      hasIGL: false,
      iglName: null,
      iglGameSense: null,
    };
  }

  // Find the IGL player
  const igl = team.roster.find(p => p.id === team.iglId);
  
  if (!igl) {
    return {
      bonus: -2,
      hasIGL: false,
      iglName: null,
      iglGameSense: null,
    };
  }

  // Calculate bonus: (gameSense - 70) * 0.15, capped at ±4
  // coach amplifies the IGL effect: elite tactical coach = ~30% boost
  const coach = team.staff.headCoach;
  const coachAmp = 1 + coachMod(coach?.rating) * 0.25 * specMod(coach?.specialty, 'tactical');
  const rawBonus = (igl.ratings.gameSense - 70) * 0.15 * coachAmp;
  const clampedBonus = Math.max(-4, Math.min(4, Math.round(rawBonus)));

  return {
    bonus: clampedBonus,
    hasIGL: true,
    iglName: igl.name,
    iglGameSense: igl.ratings.gameSense,
  };
}

/**
 * Apply IGL bonus to a player's ratings
 * Returns new ratings object (does not mutate original)
 * 
 * @param player - The player to calculate effective ratings for
 * @param team - The team the player is on
 * @param lineup - The current starting lineup
 * @returns Modified ratings with IGL bonus applied
 */
export function applyIGLBonus(
  player: Player,
  team: Team,
  lineup: StartingSlot[]
): Ratings {
  const base = { ...player.ratings };
  const iglResult = calculateIGLBonus(team, lineup);
  
  // IGL doesn't get their own bonus
  const isIGL = player.id === team.iglId;
  if (isIGL) {
    return base;
  }

  // Check if player is in the lineup (only starters get the bonus/penalty)
  const inLineup = lineup.some(slot => slot.playerId === player.id);
  if (!inLineup) {
    return base;
  }

  // Apply bonus to affected stats
  base.communication = clampRating(base.communication + iglResult.bonus);
  base.gameSense = clampRating(base.gameSense + iglResult.bonus);
  base.utilityUsage = clampRating(base.utilityUsage + iglResult.bonus);

  return base;
}

/**
 * Get the IGL bonus value for a specific player
 * Returns 0 if player is the IGL or not in lineup
 */
export function getIGLBonusForPlayer(
  player: Player,
  team: Team,
  lineup: StartingSlot[]
): number {
  // IGL doesn't get their own bonus
  if (player.id === team.iglId) {
    return 0;
  }

  // Check if player is in the lineup
  const inLineup = lineup.some(slot => slot.playerId === player.id);
  if (!inLineup) {
    return 0;
  }

  const iglResult = calculateIGLBonus(team, lineup);
  return iglResult.bonus;
}

/**
 * Calculate effective overall rating including IGL bonus and composition penalty
 * This recalculates OVR based on modified ratings
 */
export function calculateEffectiveOverallWithIGL(
  player: Player,
  team: Team,
  lineup: StartingSlot[],
  rolePenalty: number = 0,
  compositionPenalty: number = 0
): {
  effectiveOvr: number;
  baseOvr: number;
  rolePenalty: number;
  iglBonus: number;
  compositionPenalty: number;
} {
  const baseOvr = player.overall;
  const iglBonus = getIGLBonusForPlayer(player, team, lineup);
  
  // Effective OVR = base + role penalty + IGL bonus + composition penalty
  // Note: IGL bonus is applied to 3 stats, but we simplify for OVR display
  // Average impact on OVR from 3 stats getting the bonus
  const iglOvrImpact = Math.round(iglBonus * 0.5); // ~50% of bonus translates to OVR
  
  const effectiveOvr = clampRating(baseOvr + rolePenalty + iglOvrImpact + compositionPenalty);

  return {
    effectiveOvr,
    baseOvr,
    rolePenalty,
    iglBonus: iglOvrImpact,
    compositionPenalty,
  };
}

/**
 * Clamp a rating value between 1 and 99
 */
function clampRating(value: number): number {
  return Math.max(1, Math.min(99, value));
}

/**
 * Format the OVR display string with modifiers
 * Format: "80 (-3)(+4)" where -3 is role penalty and +4 is IGL bonus
 */
export function formatOvrWithModifiers(
  effectiveOvr: number,
  rolePenalty: number,
  iglBonus: number
): string {
  let display = `${effectiveOvr}`;
  
  // Only show modifiers if they exist
  if (rolePenalty !== 0) {
    display += ` (${rolePenalty > 0 ? '+' : ''}${rolePenalty})`;
  }
  
  if (iglBonus !== 0) {
    display += `(${iglBonus > 0 ? '+' : ''}${iglBonus})`;
  }
  
  return display;
}

export default {
  calculateIGLBonus,
  applyIGLBonus,
  getIGLBonusForPlayer,
  calculateEffectiveOverallWithIGL,
  formatOvrWithModifiers,
};