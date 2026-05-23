// src/sim/teamRatings.ts
// Team attribute calculations for ValorantGM

import type { Player, TeamAttributes } from '../types';
import type { StartingSlot } from '../types/roster';
import { coachMod, specMod } from './coachBonus';
import type { CoachSpecialty, TeamStaff } from '../types/team';

// lightweight staff snapshot for calculations
export interface StaffRatings {
  coachRating?: number;
  coachSpecialty?: CoachSpecialty[];
  assistantRating?: number;
  assistantSpecialty?: CoachSpecialty[];
  analystRating?: number;
  analystSpecialty?: CoachSpecialty[];
}

export function staffFromTeam(staff?: TeamStaff | null): StaffRatings {
  return {
    coachRating: staff?.headCoach?.rating,
    coachSpecialty: staff?.headCoach?.specialty,
    assistantRating: staff?.assistantCoach?.rating,
    assistantSpecialty: staff?.assistantCoach?.specialty,
    analystRating: staff?.analyst?.rating,
    analystSpecialty: staff?.analyst?.specialty,
  };
}

/** Resolve the 5 active starters from a roster + optional lineup */
function getStarters(roster: Player[], startingLineup?: StartingSlot[]): Player[] {
  if (startingLineup && startingLineup.length > 0) {
    const ids = new Set(startingLineup.map(s => s.playerId));
    const starters = roster.filter(p => ids.has(p.id));
    if (starters.length > 0) return starters;
  }
  return roster.slice(0, 5);
}

/**
 * Calculate team attributes from the starting lineup (not the full roster)
 */
export function calculateTeamAttributes(roster: Player[], startingLineup?: StartingSlot[], coachRating?: number, coachSpecialty?: CoachSpecialty[], staff?: StaffRatings): TeamAttributes {
  const players = getStarters(roster, startingLineup);

  if (players.length === 0) {
    return { firepower: 50, utilityDepth: 50, macroPlay: 50, mentalStrength: 50 };
  }

  const cm = coachMod(coachRating);
  const am = coachMod(staff?.assistantRating);
  const clamp = (v: number) => Math.max(1, Math.min(99, Math.round(v)));

  const firepower = Math.round(
    players.reduce((sum, p) => sum + (p.ratings.aim * 0.6 + p.ratings.clutchFactor * 0.4), 0) / players.length
  );

  // head coach: ±2 util (±3 tactical), assistant: ±1 util (±1.5 tactical)
  const rawUtil = players.reduce((sum, p) => sum + p.ratings.utilityUsage, 0) / players.length;
  const utilityDepth = clamp(rawUtil
    + cm * 2 * specMod(coachSpecialty, 'tactical')
    + am * 1 * specMod(staff?.assistantSpecialty, 'tactical'));

  // head coach: ±5 macro (±7.5 tactical), assistant: ±2 macro (±3 tactical)
  const rawMacro = players.reduce((sum, p) => sum + (p.ratings.gameSense * 0.6 + p.ratings.communication * 0.4), 0) / players.length;
  const macroPlay = clamp(rawMacro
    + cm * 5 * specMod(coachSpecialty, 'tactical')
    + am * 2 * specMod(staff?.assistantSpecialty, 'tactical'));

  // head coach: ±3 mental (±4.5 mental spec)
  const rawMental = players.reduce((sum, p) => {
    const mentality = p.personality?.mentality ?? 70;
    return sum + (p.ratings.clutchFactor * 0.5 + mentality * 0.5);
  }, 0) / players.length;
  const mentalStrength = clamp(rawMental + cm * 3 * specMod(coachSpecialty, 'mental'));

  return { firepower, utilityDepth, macroPlay, mentalStrength };
}

/**
 * Get the average overall rating of the starting lineup
 */
export function getTeamOverall(roster: Player[], startingLineup?: StartingSlot[]): number {
  const players = getStarters(roster, startingLineup);
  if (players.length === 0) return 50;
  return Math.round(players.reduce((sum, p) => sum + p.overall, 0) / players.length);
}

/**
 * Get team strength for simulation purposes
 */
export function getTeamStrength(roster: Player[], startingLineup?: StartingSlot[], coachRating?: number, coachSpecialty?: CoachSpecialty[], staff?: StaffRatings): number {
  const attrs = calculateTeamAttributes(roster, startingLineup, coachRating, coachSpecialty, staff);
  return Math.round(
    (attrs.firepower * 0.35 + attrs.utilityDepth * 0.2 + attrs.macroPlay * 0.25 + attrs.mentalStrength * 0.2)
  );
}
