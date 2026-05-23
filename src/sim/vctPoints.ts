// src/sim/vctPoints.ts
// championship points tracking — awarded after each event based on placement

import type { Region } from '../types/team';
import type { KickoffBracket } from './kickoffBracket';
import type { ChampionsBracket } from './internationalBracket';

// point tables per event type
const KICKOFF_POINTS: Record<number, number> = {
  1: 3,  // regional winner
  2: 2,
  3: 1,
  4: 1,
};

const INTERNATIONAL_POINTS: Record<number, number> = {
  1: 6,   // champion
  2: 4,   // runner-up
  3: 3,   // 3rd-4th
  4: 2,
  5: 1,   // 5th-6th
  6: 1,
};

// helper: get loser of a completed matchup
function matchupLoser(m: { team1Id: string | null; team2Id: string | null; winnerId: string | null }): string | null {
  if (!m.winnerId || !m.team1Id || !m.team2Id) return null;
  return m.team1Id === m.winnerId ? m.team2Id : m.team1Id;
}

// extract placements from a completed kickoff bracket (one region)
export function getKickoffPlacements(bracket: KickoffBracket): Array<{ teamId: string; place: number }> {
  const placements: Array<{ teamId: string; place: number }> = [];

  // 1st-3rd from qualifiers
  for (const q of bracket.qualifiers) {
    placements.push({ teamId: q.teamId, place: q.seed });
  }

  // 4th: loser of lower final (lower[5])
  const lf = bracket.lower[5]?.matchups?.[0];
  if (lf) {
    const loser = matchupLoser(lf);
    if (loser) placements.push({ teamId: loser, place: 4 });
  }

  return placements;
}

// extract placements from a completed international bracket
export function getInternationalPlacements(bracket: ChampionsBracket): Array<{ teamId: string; place: number }> {
  const placements: Array<{ teamId: string; place: number }> = [];
  if (!bracket.champion) return placements;

  // 1st: champion
  placements.push({ teamId: bracket.champion, place: 1 });

  // 2nd: GF loser (upper[3])
  const gf = bracket.upper[3]?.matchups?.[0];
  if (gf) {
    const loser = matchupLoser(gf);
    if (loser) placements.push({ teamId: loser, place: 2 });
  }

  // 3rd: LF loser (lower[3])
  const lf = bracket.lower[3]?.matchups?.[0];
  if (lf) {
    const loser = matchupLoser(lf);
    if (loser) placements.push({ teamId: loser, place: 3 });
  }

  // 4th: LR3 loser (lower[2])
  const lr3 = bracket.lower[2]?.matchups?.[0];
  if (lr3) {
    const loser = matchupLoser(lr3);
    if (loser) placements.push({ teamId: loser, place: 4 });
  }

  // 5th-6th: LR2 losers (lower[1], 2 matchups)
  const lr2 = bracket.lower[1]?.matchups ?? [];
  let nextPlace = 5;
  for (const m of lr2) {
    const loser = matchupLoser(m);
    if (loser) placements.push({ teamId: loser, place: nextPlace++ });
  }

  return placements;
}

// convert placements to point awards using the appropriate table
function placementsToPoints(
  placements: Array<{ teamId: string; place: number }>,
  table: Record<number, number>,
): Record<string, number> {
  const pts: Record<string, number> = {};
  for (const { teamId, place } of placements) {
    const award = table[place] ?? 0;
    if (award > 0) pts[teamId] = (pts[teamId] || 0) + award;
  }
  return pts;
}

// award points for all regions after kickoff completes
export function awardKickoffPoints(
  kickoffBrackets: Record<Region, KickoffBracket | null>,
): Record<string, number> {
  const pts: Record<string, number> = {};
  for (const region of ['americas', 'emea', 'pacific', 'china'] as Region[]) {
    const bracket = kickoffBrackets[region];
    if (!bracket) continue;
    const placements = getKickoffPlacements(bracket);
    const regionPts = placementsToPoints(placements, KICKOFF_POINTS);
    for (const [teamId, p] of Object.entries(regionPts)) {
      pts[teamId] = (pts[teamId] || 0) + p;
    }
  }
  return pts;
}

// award points for an international event
export function awardInternationalPoints(
  bracket: ChampionsBracket,
): Record<string, number> {
  const placements = getInternationalPlacements(bracket);
  return placementsToPoints(placements, INTERNATIONAL_POINTS);
}

// merge new points into cumulative totals
export function mergePoints(
  cumulative: Record<string, number>,
  newPts: Record<string, number>,
): Record<string, number> {
  const merged = { ...cumulative };
  for (const [teamId, p] of Object.entries(newPts)) {
    merged[teamId] = (merged[teamId] || 0) + p;
  }
  return merged;
}
