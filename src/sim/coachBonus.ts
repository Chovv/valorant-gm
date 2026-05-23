// src/sim/coachBonus.ts
// centralized coach-rating-to-modifier math

import type { CoachSpecialty } from '../types/team';

// normalize coach rating to -1..+1 (50 = neutral, null = neutral)
export function coachMod(rating: number | undefined): number {
  return ((rating ?? 50) - 50) / 50;
}

// 1.5x when coach has the target specialty, 1.0x otherwise
// handles both array (new) and legacy single string
export function specMod(specialty: CoachSpecialty | CoachSpecialty[] | undefined, target: CoachSpecialty): number {
  if (!specialty) return 1.0;
  if (Array.isArray(specialty)) return specialty.includes(target) ? 1.5 : 1.0;
  return specialty === target ? 1.5 : 1.0;
}
