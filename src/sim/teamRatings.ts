// src/sim/teamRatings.ts
// Team attribute calculations for ValorantGM

import type { Player, TeamAttributes } from '../types';

/**
 * Calculate team attributes from roster
 */
export function calculateTeamAttributes(roster: Player[]): TeamAttributes {
  if (roster.length === 0) {
    return {
      firepower: 50,
      utilityDepth: 50,
      macroPlay: 50,
      mentalStrength: 50,
    };
  }

  // Firepower: Average of aim and clutch ratings
  const firepower = Math.round(
    roster.reduce((sum, p) => sum + (p.ratings.aim * 0.6 + p.ratings.clutchFactor * 0.4), 0) / roster.length
  );

  // Utility Depth: Average of utility usage ratings
  const utilityDepth = Math.round(
    roster.reduce((sum, p) => sum + p.ratings.utilityUsage, 0) / roster.length
  );

  // Macro Play: Average of game sense and communication
  const macroPlay = Math.round(
    roster.reduce((sum, p) => sum + (p.ratings.gameSense * 0.6 + p.ratings.communication * 0.4), 0) / roster.length
  );

  // Mental Strength: Average of clutch factor and personality mentality
  const mentalStrength = Math.round(
    roster.reduce((sum, p) => {
      const mentality = p.personality?.mentality ?? 70;
      return sum + (p.ratings.clutchFactor * 0.5 + mentality * 0.5);
    }, 0) / roster.length
  );

  return {
    firepower,
    utilityDepth,
    macroPlay,
    mentalStrength,
  };
}

/**
 * Get the average overall rating of a team
 */
export function getTeamOverall(roster: Player[]): number {
  if (roster.length === 0) return 50;
  return Math.round(roster.reduce((sum, p) => sum + p.overall, 0) / roster.length);
}

/**
 * Get team strength for simulation purposes
 */
export function getTeamStrength(roster: Player[]): number {
  const attrs = calculateTeamAttributes(roster);
  return Math.round(
    (attrs.firepower * 0.35 + attrs.utilityDepth * 0.2 + attrs.macroPlay * 0.25 + attrs.mentalStrength * 0.2)
  );
}