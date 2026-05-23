// src/sim/progression.ts
import type { Player, Ratings } from '../types/player';
import type { GameState } from './gameState';
import { calculateOverall } from './playerGenerator';
import type { RNG } from '../utils/random';
import { specMod } from './coachBonus';

export interface PlayerProgression {
  playerId: string;
  playerName: string;
  teamId: string;
  teamAbbr: string;
  age: number;
  role: string;
  oldOverall: number;
  newOverall: number;
  change: number;
  ratingChanges: Record<keyof Ratings, number>;
  stage: 'prospect' | 'developing' | 'prime' | 'veteran' | 'declining';
  oldStage: 'prospect' | 'developing' | 'prime' | 'veteran' | 'declining';
}

const RATING_KEYS: (keyof Ratings)[] = ['aim', 'sprayControl', 'gameSense', 'utilityUsage', 'clutchFactor', 'communication'];

function trueGauss(spread: number): number {
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Math.random() - 0.5;
  return sum * spread;
}

function getStage(age: number, peakAge: number): PlayerProgression['stage'] {
  const diff = age - peakAge;
  if (diff < -4) return 'prospect';
  if (diff < -1) return 'developing';
  if (diff <= 2) return 'prime';
  if (diff <= 5) return 'veteran';
  return 'declining';
}

export function processProgression(state: GameState, _rng: RNG): PlayerProgression[] {
  const results: PlayerProgression[] = [];

  for (const team of state.teams) {
    for (const player of team.roster) {
      if (player.retired) continue;

      // recalculate to ensure consistency
      const trueOldOverall = calculateOverall(player.ratings, player.archetype);
      player.overall = trueOldOverall;
      const oldRatings: Ratings = { ...player.ratings };

      const nextAge = player.age + 1;
      const yearsFromPeak = nextAge - player.development.peakAge;
      const stage = getStage(nextAge, player.development.peakAge);
      const oldStage = getStage(player.age, player.development.peakAge);

      // === decide target change ===
      const randomBase = trueGauss(1.6);

      let ageNudge = 0;
      if (yearsFromPeak < -3) ageNudge = 0.3 + Math.random() * 0.5;
      else if (yearsFromPeak < 0) ageNudge = Math.random() * 0.3;
      else if (yearsFromPeak <= 2) ageNudge = (Math.random() - 0.5) * 0.2;
      else if (yearsFromPeak <= 5) ageNudge = -0.2 - Math.random() * 0.4;
      else ageNudge = -0.3 - Math.random() * 0.6;

      // coach × coachability: good coach + coachable player = faster growth
      const coach = team.staff.headCoach;
      const analyst = team.staff.analyst;
      if (coach) {
        const coachability = player.personality?.coachability ?? 50;
        const synergy = (coach.rating / 100) * (coachability / 100);
        ageNudge += synergy * 0.4 * specMod(coach.specialty, 'development');
      }
      // analyst boosts development (smaller than head coach)
      if (analyst) {
        const coachability = player.personality?.coachability ?? 50;
        const synergy = (analyst.rating / 100) * (coachability / 100);
        ageNudge += synergy * 0.25 * specMod(analyst.specialty, 'development');
      }

      let wildcard = 0;
      const wc = Math.random();
      if (wc < 0.05) wildcard = 3 + Math.floor(Math.random() * 3);
      else if (wc < 0.10) wildcard = 1 + Math.floor(Math.random() * 3);
      else if (wc > 0.95) wildcard = -(3 + Math.floor(Math.random() * 3));
      else if (wc > 0.90) wildcard = -(1 + Math.floor(Math.random() * 3));

      let rawChange = randomBase + ageNudge + wildcard;

      const headroom = player.potential.ceiling - player.overall;
      const floorDist = player.overall - player.potential.floor;
      if (rawChange > 0 && headroom < 3) rawChange *= 0.3;
      if (rawChange < 0 && floorDist < 3) rawChange *= 0.3;

      const targetChange = Math.max(-8, Math.min(8, Math.round(rawChange)));
      const targetOvr = Math.max(30, Math.min(99, trueOldOverall + targetChange));

      // === move ratings toward target, ONLY in the correct direction ===
      if (targetChange !== 0) {
        const sign = targetChange > 0 ? 1 : -1;
        let currentOvr = trueOldOverall;
        let iters = 0;

        // hill-climb: only adjust ratings in the direction of targetChange
        while (currentOvr !== targetOvr && iters < 50) {
          // pick a random rating to nudge
          const shuffled = [...RATING_KEYS].sort(() => Math.random() - 0.5);
          let moved = false;

          for (const key of shuffled) {
            const newVal = player.ratings[key] + sign;
            if (newVal < 30 || newVal > 99) continue;

            player.ratings[key] = newVal;
            const check = calculateOverall(player.ratings, player.archetype);

            if (Math.abs(check - targetOvr) < Math.abs(currentOvr - targetOvr)) {
              // good move — keep it
              currentOvr = check;
              moved = true;
              break;
            } else if (check === currentOvr) {
              // neutral — keep it (builds toward target)
              moved = true;
              break;
            } else {
              // bad move — undo
              player.ratings[key] -= sign;
            }
          }

          // if no single-stat move helps, try double nudge on low-weight stat
          if (!moved) {
            const key = RATING_KEYS[Math.floor(Math.random() * RATING_KEYS.length)];
            const newVal = player.ratings[key] + sign;
            if (newVal >= 30 && newVal <= 99) {
              player.ratings[key] = newVal;
            }
            currentOvr = calculateOverall(player.ratings, player.archetype);
          }

          iters++;
        }
      }

      // compute final overall and actual deltas
      player.overall = calculateOverall(player.ratings, player.archetype);

      const ratingChanges: Record<keyof Ratings, number> = {
        aim: 0, sprayControl: 0, gameSense: 0,
        utilityUsage: 0, clutchFactor: 0, communication: 0,
      };
      for (const key of RATING_KEYS) {
        ratingChanges[key] = player.ratings[key] - oldRatings[key];
      }

      player.age = nextAge;
      player.yearsInLeague += 1;

      // adjust potential
      if (player.age <= 22) {
        player.potential.ceiling = Math.min(99, player.potential.ceiling + Math.floor(Math.random() * 3));
      } else if (player.age >= 28) {
        player.potential.ceiling = Math.max(player.overall, player.potential.ceiling - Math.floor(Math.random() * 3));
      }

      results.push({
        playerId: player.id,
        playerName: player.name,
        teamId: team.id,
        teamAbbr: team.abbreviation,
        age: player.age,
        role: player.role,
        oldOverall: trueOldOverall,
        newOverall: player.overall,
        change: player.overall - trueOldOverall,
        ratingChanges,
        stage,
        oldStage,
      });
    }
  }

  // process free agents with the same logic
  for (const player of (state.freeAgents || [])) {
    if (player.retired) continue;

    const trueOldOverall = calculateOverall(player.ratings, player.archetype);
    player.overall = trueOldOverall;
    const oldRatings: Ratings = { ...player.ratings };

    const nextAge = player.age + 1;
    const yearsFromPeak = nextAge - player.development.peakAge;
    const stage = getStage(nextAge, player.development.peakAge);
    const oldStage = getStage(player.age, player.development.peakAge);

    const randomBase = trueGauss(1.6);

    let ageNudge = 0;
    if (yearsFromPeak < -3) ageNudge = 0.3 + Math.random() * 0.5;
    else if (yearsFromPeak < 0) ageNudge = Math.random() * 0.3;
    else if (yearsFromPeak <= 2) ageNudge = (Math.random() - 0.5) * 0.2;
    else if (yearsFromPeak <= 5) ageNudge = -0.2 - Math.random() * 0.4;
    else ageNudge = -0.3 - Math.random() * 0.6;

    let wildcard = 0;
    const wc = Math.random();
    if (wc < 0.05) wildcard = 3 + Math.floor(Math.random() * 3);
    else if (wc < 0.10) wildcard = 1 + Math.floor(Math.random() * 3);
    else if (wc > 0.95) wildcard = -(3 + Math.floor(Math.random() * 3));
    else if (wc > 0.90) wildcard = -(1 + Math.floor(Math.random() * 3));

    let rawChange = randomBase + ageNudge + wildcard;

    const headroom = player.potential.ceiling - player.overall;
    const floorDist = player.overall - player.potential.floor;
    if (rawChange > 0 && headroom < 3) rawChange *= 0.3;
    if (rawChange < 0 && floorDist < 3) rawChange *= 0.3;

    const targetChange = Math.max(-8, Math.min(8, Math.round(rawChange)));
    const targetOvr = Math.max(30, Math.min(99, trueOldOverall + targetChange));

    if (targetChange !== 0) {
      const sign = targetChange > 0 ? 1 : -1;
      let currentOvr = trueOldOverall;
      let iters = 0;

      while (currentOvr !== targetOvr && iters < 50) {
        const shuffled = [...RATING_KEYS].sort(() => Math.random() - 0.5);
        let moved = false;

        for (const key of shuffled) {
          const newVal = player.ratings[key] + sign;
          if (newVal < 30 || newVal > 99) continue;

          player.ratings[key] = newVal;
          const check = calculateOverall(player.ratings, player.archetype);

          if (Math.abs(check - targetOvr) < Math.abs(currentOvr - targetOvr)) {
            currentOvr = check;
            moved = true;
            break;
          } else if (check === currentOvr) {
            moved = true;
            break;
          } else {
            player.ratings[key] -= sign;
          }
        }

        if (!moved) {
          const key = RATING_KEYS[Math.floor(Math.random() * RATING_KEYS.length)];
          const newVal = player.ratings[key] + sign;
          if (newVal >= 30 && newVal <= 99) {
            player.ratings[key] = newVal;
          }
          currentOvr = calculateOverall(player.ratings, player.archetype);
        }

        iters++;
      }
    }

    player.overall = calculateOverall(player.ratings, player.archetype);

    const ratingChanges: Record<keyof Ratings, number> = {
      aim: 0, sprayControl: 0, gameSense: 0,
      utilityUsage: 0, clutchFactor: 0, communication: 0,
    };
    for (const key of RATING_KEYS) {
      ratingChanges[key] = player.ratings[key] - oldRatings[key];
    }

    player.age = nextAge;
    player.yearsInLeague += 1;

    if (player.age <= 22) {
      player.potential.ceiling = Math.min(99, player.potential.ceiling + Math.floor(Math.random() * 3));
    } else if (player.age >= 28) {
      player.potential.ceiling = Math.max(player.overall, player.potential.ceiling - Math.floor(Math.random() * 3));
    }

    results.push({
      playerId: player.id,
      playerName: player.name,
      teamId: 'FA',
      teamAbbr: 'FA',
      age: player.age,
      role: player.role,
      oldOverall: trueOldOverall,
      newOverall: player.overall,
      change: player.overall - trueOldOverall,
      ratingChanges,
      stage,
      oldStage,
    });
  }

  return results;
}
