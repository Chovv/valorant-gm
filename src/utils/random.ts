// src/utils/random.ts
// Seeded RNG utilities - NEVER use Math.random() in simulation code

import seedrandom from 'seedrandom';

/**
 * Random number generator instance type
 */
export type RNG = () => number;

/**
 * Create a seeded random number generator
 * @param seed - String seed for reproducibility
 * @returns Function that returns random numbers between 0 and 1
 */
export function createRNG(seed: string): RNG {
  return seedrandom(seed);
}

/**
 * Generate a random integer between min and max (inclusive)
 */
export function randomInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Generate a random float between min and max
 */
export function randomFloat(rng: RNG, min: number, max: number): number {
  return rng() * (max - min) + min;
}

/**
 * Pick a random element from an array
 */
export function randomPick<T>(rng: RNG, array: T[]): T {
  if (array.length === 0) {
    throw new Error('Cannot pick from empty array');
  }
  return array[randomInt(rng, 0, array.length - 1)];
}

/**
 * Pick random element from array (alias for randomPick)
 */
export function randomChoice<T>(rng: RNG, array: T[]): T {
  return randomPick(rng, array);
}

/**
 * Shuffle an array in place using Fisher-Yates
 * Returns the same array for convenience
 */
export function shuffle<T>(rng: RNG, array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate a random number with normal distribution (Box-Muller transform)
 * @param mean - Center of distribution
 * @param stdDev - Standard deviation
 */
export function randomNormal(rng: RNG, mean: number, stdDev: number): number {
  const u1 = rng();
  const u2 = rng();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Generate a bounded normal value (clamped to min/max)
 * Useful for ratings that must stay within 0-100
 */
export function randomBoundedNormal(
  rng: RNG,
  mean: number,
  stdDev: number,
  min: number,
  max: number
): number {
  const value = randomNormal(rng, mean, stdDev);
  return Math.max(min, Math.min(max, value));
}

/**
 * Weighted random selection
 * @param items - Array of [item, weight] tuples
 */
export function weightedPick<T>(rng: RNG, items: Array<[T, number]>): T {
  const totalWeight = items.reduce((sum, [, weight]) => sum + weight, 0);
  let random = rng() * totalWeight;

  for (const [item, weight] of items) {
    random -= weight;
    if (random <= 0) {
      return item;
    }
  }

  // Fallback (shouldn't reach here)
  return items[items.length - 1][0];
}

/**
 * Weighted random choice (alias for weightedPick with different signature)
 */
export function weightedChoice<T>(rng: RNG, items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = rng() * totalWeight;
  
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  
  return items[items.length - 1];
}

/**
 * Pick N random elements from array (no replacement)
 */
export function randomSample<T>(rng: RNG, array: T[], n: number): T[] {
  const copy = [...array];
  const result: T[] = [];
  for (let i = 0; i < Math.min(n, array.length); i++) {
    const idx = randomInt(rng, 0, copy.length - 1);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

/**
 * Generate a unique ID with optional prefix
 */
export function generateId(rng: RNG, prefix: string = ''): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = prefix;
  for (let i = 0; i < 12; i++) {
    id += chars[randomInt(rng, 0, chars.length - 1)];
  }
  return id;
}