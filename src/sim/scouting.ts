// src/sim/scouting.ts
// Scouting system - determines rating visibility and accuracy

import type { RNG } from '../utils/random';
import type { Player, Ratings, Potential } from '../types';
import { randomBoundedNormal } from '../utils/random';
import { calculateOverall } from './playerGenerator';

/**
 * Scouting accuracy level (affected by budget, staff quality)
 * 0 = blind guessing, 1 = perfect knowledge
 */
export type ScoutingAccuracy = number;

/**
 * What the GM sees (may differ from true values)
 */
export interface ScoutedPlayer {
  // Always visible
  id: string;
  name: string;
  age: number;
  role: Player['role'];
  background: Player['background'];
  archetype: Player['archetype'];

  // Estimated values (accuracy depends on scouting)
  estimatedRatings: Ratings;
  estimatedOverall: number;
  estimatedPotential: PotentialEstimate;

  // Confidence indicator
  scoutingConfidence: 'low' | 'medium' | 'high';
}

/**
 * Potential shown as a range or grade
 */
export interface PotentialEstimate {
  /** Letter grade (A+ to D) */
  grade: string;
  /** Range shown to user */
  displayRange: [number, number];
}

/**
 * Calculate scouting error based on accuracy
 * Lower accuracy = more error
 */
function getScoutingError(rng: RNG, accuracy: ScoutingAccuracy): number {
  // At accuracy 1.0, error is ~0
  // At accuracy 0.0, error can be ±20
  const maxError = 20 * (1 - accuracy);
  return randomBoundedNormal(rng, 0, maxError / 2, -maxError, maxError);
}

/**
 * Generate estimated ratings based on scouting accuracy
 */
function estimateRatings(
  rng: RNG,
  trueRatings: Ratings,
  accuracy: ScoutingAccuracy
): Ratings {
  const estimate: Ratings = {
    aim: Math.round(Math.max(20, Math.min(99, trueRatings.aim + getScoutingError(rng, accuracy)))),
    sprayControl: Math.round(Math.max(20, Math.min(99, trueRatings.sprayControl + getScoutingError(rng, accuracy)))),
    gameSense: Math.round(Math.max(20, Math.min(99, trueRatings.gameSense + getScoutingError(rng, accuracy)))),
    utilityUsage: Math.round(Math.max(20, Math.min(99, trueRatings.utilityUsage + getScoutingError(rng, accuracy)))),
    clutchFactor: Math.round(Math.max(20, Math.min(99, trueRatings.clutchFactor + getScoutingError(rng, accuracy)))),
    communication: Math.round(Math.max(20, Math.min(99, trueRatings.communication + getScoutingError(rng, accuracy)))),
  };
  return estimate;
}

/**
 * Convert potential to a letter grade
 */
function potentialToGrade(ceiling: number): string {
  if (ceiling >= 90) return 'A+';
  if (ceiling >= 85) return 'A';
  if (ceiling >= 80) return 'A-';
  if (ceiling >= 75) return 'B+';
  if (ceiling >= 70) return 'B';
  if (ceiling >= 65) return 'B-';
  if (ceiling >= 60) return 'C+';
  if (ceiling >= 55) return 'C';
  if (ceiling >= 50) return 'C-';
  if (ceiling >= 45) return 'D+';
  return 'D';
}

/**
 * Estimate potential based on scouting accuracy
 */
function estimatePotential(
  rng: RNG,
  truePotential: Potential,
  accuracy: ScoutingAccuracy
): PotentialEstimate {
  const error = getScoutingError(rng, accuracy);

  // Estimate ceiling with error
  const estimatedCeiling = Math.round(
    Math.max(30, Math.min(99, truePotential.ceiling + error))
  );

  // Show a range - wider range at lower accuracy
  const rangeWidth = Math.round(15 * (1 - accuracy) + 5);
  const displayMin = Math.max(30, estimatedCeiling - rangeWidth);
  const displayMax = Math.min(99, estimatedCeiling + rangeWidth);

  return {
    grade: potentialToGrade(estimatedCeiling),
    displayRange: [displayMin, displayMax],
  };
}

/**
 * Determine confidence level based on accuracy
 */
function getConfidenceLevel(accuracy: ScoutingAccuracy): 'low' | 'medium' | 'high' {
  if (accuracy >= 0.8) return 'high';
  if (accuracy >= 0.5) return 'medium';
  return 'low';
}

/**
 * Scout a player - returns what the GM can see
 */
export function scoutPlayer(
  rng: RNG,
  player: Player,
  accuracy: ScoutingAccuracy
): ScoutedPlayer {
  // Clamp accuracy to valid range
  const clampedAccuracy = Math.max(0, Math.min(1, accuracy));

  const estimatedRatings = estimateRatings(rng, player.ratings, clampedAccuracy);
  const estimatedOverall = calculateOverall(estimatedRatings, player.archetype);

  return {
    id: player.id,
    name: player.name,
    age: player.age,
    role: player.role,
    background: player.background,
    archetype: player.archetype,
    estimatedRatings,
    estimatedOverall,
    estimatedPotential: estimatePotential(rng, player.potential, clampedAccuracy),
    scoutingConfidence: getConfidenceLevel(clampedAccuracy),
  };
}

/**
 * Scout multiple players
 */
export function scoutPlayers(
  rng: RNG,
  players: Player[],
  accuracy: ScoutingAccuracy
): ScoutedPlayer[] {
  return players.map(p => scoutPlayer(rng, p, accuracy));
}

/**
 * Calculate scouting accuracy from team investments
 */
export function calculateScoutingAccuracy(
  scoutingBudget: number,
  analystRating: number,
  coachRating: number
): ScoutingAccuracy {
  // Budget contributes 40%, analyst 35%, coach 25%
  // All inputs assumed to be 0-100 scale
  const budgetFactor = (scoutingBudget / 100) * 0.4;
  const analystFactor = (analystRating / 100) * 0.35;
  const coachFactor = (coachRating / 100) * 0.25;

  return Math.max(0.1, Math.min(0.95, budgetFactor + analystFactor + coachFactor));
}