// src/sim/winProbability.ts
// Calculate win probability between two teams

import type { Team, MatchFormat, Role } from '../types';
import type { StartingSlot } from '../types/roster';
import { getRolePenalty } from '../types/roster';
import { calculateIGLBonus } from './iglBonus';
import { getCompositionPenalty } from './compositionBonus';

/**
 * Agent proficiency bonus - simplified version for probability calculation
 * Uses average expected bonus since we don't know which agent will be picked
 */
const AVERAGE_AGENT_BONUS = 1; // Assume slight positive (most players play their main)

/**
 * Role bonuses for pIndex (same as matchSim)
 */
const ROLE_PINDEX_BONUS: Record<Role, number> = {
  duelist: 70,
  initiator: 30,
  controller: 20,
  sentinel: 10,
  flex: 40,
};

/**
 * Calculate a simplified pIndex for a player (for probability estimation)
 */
function getPlayerPIndexForProbability(
  player: { overall: number; ratings: { aim: number; clutchFactor: number }; role: Role },
  assignedRole: Role,
  iglBonus: number,
  compositionPenalty: number
): number {
  let pIndex = player.overall * 10;
  pIndex += player.ratings.aim * 3;
  pIndex += ROLE_PINDEX_BONUS[assignedRole] || 0;
  pIndex += player.ratings.clutchFactor * 0.5;
  pIndex += iglBonus * 20;
  pIndex += compositionPenalty * 10;
  pIndex += AVERAGE_AGENT_BONUS * 10;
  
  // Role mismatch penalty
  const rolePenalty = getRolePenalty(player.role, assignedRole);
  pIndex += rolePenalty * 10;
  
  return pIndex;
}

/**
 * Calculate team's total pIndex
 */
function getTeamPIndex(team: Team): number {
  const lineup: StartingSlot[] = team.startingLineup || 
    team.roster.slice(0, 5).map(p => ({ playerId: p.id, assignedRole: p.role }));
  
  // Get IGL bonus (returns an object with .bonus property)
  const iglResult = calculateIGLBonus(team, lineup);
  const iglBonus = iglResult.bonus;
  
  // Get composition penalty
  const compositionPenalty = getCompositionPenalty(lineup);
  
  let totalPIndex = 0;
  
  for (const slot of lineup) {
    const player = team.roster.find(p => p.id === slot.playerId);
    if (!player) continue;
    
    // Calculate individual IGL bonus for this player
    const isIGL = player.id === team.iglId;
    const playerIglBonus = isIGL ? iglBonus : (iglBonus > 0 ? iglBonus * 0.5 : iglBonus);
    
    totalPIndex += getPlayerPIndexForProbability(
      player,
      slot.assignedRole,
      playerIglBonus,
      compositionPenalty
    );
  }
  
  return totalPIndex;
}

/**
 * Calculate win probability using Elo-style formula
 * Returns probability that teamA wins (0-1)
 */
function calculateMapWinProbability(teamAPIndex: number, teamBPIndex: number): number {
  const diff = teamAPIndex - teamBPIndex;
  // Scale factor - higher means more predictable outcomes
  // 400 is standard Elo, we use 800 for more variance
  const scaleFactor = 800;
  return 1 / (1 + Math.pow(10, -diff / scaleFactor));
}

/**
 * Calculate series win probability (bo1, bo3, bo5)
 * Uses binomial probability
 */
function calculateSeriesWinProbability(mapWinProb: number, format: MatchFormat): number {
  const p = mapWinProb;
  const q = 1 - p;
  
  switch (format) {
    case 'bo1':
      return p;
    
    case 'bo3':
      // Win 2-0 or 2-1
      // P(2-0) = p^2
      // P(2-1) = 2 * p^2 * q (win 2 of first 3, with exactly 1 loss)
      return p * p + 2 * p * p * q;
    
    case 'bo5':
      // Win 3-0, 3-1, or 3-2
      // P(3-0) = p^3
      // P(3-1) = C(3,1) * p^3 * q = 3 * p^3 * q
      // P(3-2) = C(4,2) * p^3 * q^2 = 6 * p^3 * q^2
      return Math.pow(p, 3) + 3 * Math.pow(p, 3) * q + 6 * Math.pow(p, 3) * Math.pow(q, 2);
    
    default:
      return p;
  }
}

/**
 * Main function to calculate win probability between two teams
 * Returns probability that teamA wins (0-100 as percentage)
 */
export function calculateWinProbability(
  teamA: Team,
  teamB: Team,
  format: MatchFormat = 'bo3'
): number {
  const teamAPIndex = getTeamPIndex(teamA);
  const teamBPIndex = getTeamPIndex(teamB);
  
  const mapWinProb = calculateMapWinProbability(teamAPIndex, teamBPIndex);
  const seriesWinProb = calculateSeriesWinProbability(mapWinProb, format);
  
  // Return as percentage (0-100)
  return Math.round(seriesWinProb * 100);
}

/**
 * Get win probability display info
 * Returns both teams' percentages formatted nicely
 */
export function getWinProbabilityDisplay(
  teamA: Team,
  teamB: Team,
  format: MatchFormat = 'bo3'
): { teamAProb: number; teamBProb: number; favorite: 'A' | 'B' | 'even' } {
  const teamAProb = calculateWinProbability(teamA, teamB, format);
  const teamBProb = 100 - teamAProb;
  
  let favorite: 'A' | 'B' | 'even' = 'even';
  if (teamAProb > 55) favorite = 'A';
  else if (teamBProb > 55) favorite = 'B';
  
  return { teamAProb, teamBProb, favorite };
}