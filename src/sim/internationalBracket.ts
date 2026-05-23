// src/sim/internationalBracket.ts
// VCT 2026 Masters format: Swiss Stage → Double-Elimination Playoffs

import type { PlayoffMatchup, PlayoffRound, Region, Team } from '../types';
import { createRNG, generateId } from '../utils/random';

// ── Types ──

export interface SwissTeam {
  teamId: string;
  region: Region;
  kickoffSeed: number; // 1, 2, or 3 from regional kickoff
  wins: number;
  losses: number;
  eliminated: boolean;
  advanced: boolean;
}

export interface SwissStage {
  teams: SwissTeam[];
  rounds: PlayoffRound[]; // R1(4), R2High(2), R2Low(2), R3Decider(2)
  complete: boolean;
}

export interface ChampionsBracket {
  teams: Array<{ teamId: string; region: Region; seed: number }>;
  swiss: SwissStage;
  upper: PlayoffRound[];  // UQF(4), USF(2), UF(1), GF(1)
  lower: PlayoffRound[];  // LR1(2), LR2(2), LR3(1), LF(1)
  champion: string | null;
}

// ── Play order ──

export type ChampionsStepPhase = 'swiss' | 'upper' | 'lower';

export interface ChampionsStep {
  phase: ChampionsStepPhase;
  roundIdx: number;
}

export const CHAMPIONS_ROUND_ORDER: ChampionsStep[] = [
  // Swiss Stage
  { phase: 'swiss', roundIdx: 0 },  // Swiss R1 (4 matches)
  { phase: 'swiss', roundIdx: 1 },  // Swiss R2 High (2 matches)
  { phase: 'swiss', roundIdx: 2 },  // Swiss R2 Low (2 matches)
  { phase: 'swiss', roundIdx: 3 },  // Swiss R3 Decider (2 matches)
  // Playoffs
  { phase: 'upper', roundIdx: 0 },  // Upper QF (4 matches)
  { phase: 'lower', roundIdx: 0 },  // Lower R1 (2 matches)
  { phase: 'upper', roundIdx: 1 },  // Upper SF (2 matches)
  { phase: 'lower', roundIdx: 1 },  // Lower R2 (2 matches)
  { phase: 'upper', roundIdx: 2 },  // Upper Final (1 match)
  { phase: 'lower', roundIdx: 2 },  // Lower R3 (1 match)
  { phase: 'lower', roundIdx: 3 },  // Lower Final BO5 (1 match)
  { phase: 'upper', roundIdx: 3 },  // Grand Final BO5 (1 match)
];

// ── Swiss generation ──

function makeMatchup(rng: ReturnType<typeof createRNG>, t1: string | null, t2: string | null, format: 'bo3' | 'bo5' = 'bo3'): PlayoffMatchup {
  return {
    id: generateId(rng, 'chmp_'),
    team1Id: t1,
    team2Id: t2,
    winnerId: null,
    matchResults: [],
    format,
  };
}

export function generateChampionsBracket(
  seed: string,
  qualifiedTeams: Array<{ teamId: string; region: Region; seed: number }>,
  swissR1Override?: Array<[string, string]>,
): ChampionsBracket {
  const rng = createRNG(seed);

  // Separate #1 seeds (bypass Swiss) from #2/#3 (enter Swiss)
  const topSeeds = qualifiedTeams.filter(t => t.seed === 1);
  const swissTeams = qualifiedTeams.filter(t => t.seed !== 1);

  // Swiss Stage teams with W-L tracking
  const swissEntries: SwissTeam[] = swissTeams.map(t => ({
    teamId: t.teamId,
    region: t.region,
    kickoffSeed: t.seed,
    wins: 0,
    losses: 0,
    eliminated: false,
    advanced: false,
  }));

  // Swiss R1: Cross-region #2 vs #3 (circular pattern)
  // Americas #2 vs Pacific #3
  // EMEA #2 vs China #3
  // Pacific #2 vs Americas #3
  // China #2 vs EMEA #3
  const regionOrder: Region[] = ['americas', 'emea', 'pacific', 'china'];
  const getSwiss = (region: Region, kickoffSeed: number) =>
    swissEntries.find(t => t.region === region && t.kickoffSeed === kickoffSeed)?.teamId ?? null;

  const r1Matchups: PlayoffMatchup[] = swissR1Override?.length === 4
    ? swissR1Override.map(([a, b]) => makeMatchup(rng, a, b))
    : [
        makeMatchup(rng, getSwiss('americas', 2), getSwiss('pacific', 3)),
        makeMatchup(rng, getSwiss('emea', 2), getSwiss('china', 3)),
        makeMatchup(rng, getSwiss('pacific', 2), getSwiss('americas', 3)),
        makeMatchup(rng, getSwiss('china', 2), getSwiss('emea', 3)),
      ];

  // R2High, R2Low, R3 — empty, generated dynamically after results
  const swissRounds: PlayoffRound[] = [
    { name: 'Swiss Round 1', matchups: r1Matchups },
    { name: 'Swiss Round 2 (1-0)', matchups: [] },
    { name: 'Swiss Round 2 (0-1)', matchups: [] },
    { name: 'Swiss Decider (1-1)', matchups: [] },
  ];

  const swiss: SwissStage = {
    teams: swissEntries,
    rounds: swissRounds,
    complete: false,
  };

  // Playoffs: empty structure, filled after Swiss completes
  const upper: PlayoffRound[] = [
    { name: 'Upper Quarterfinals', matchups: Array.from({ length: 4 }, () => makeMatchup(rng, null, null, 'bo3')) },
    { name: 'Upper Semifinals', matchups: Array.from({ length: 2 }, () => makeMatchup(rng, null, null, 'bo3')) },
    { name: 'Upper Final', matchups: [makeMatchup(rng, null, null, 'bo3')] },
    { name: 'Grand Final', matchups: [makeMatchup(rng, null, null, 'bo5')] },
  ];

  const lower: PlayoffRound[] = [
    { name: 'Lower Round 1', matchups: Array.from({ length: 2 }, () => makeMatchup(rng, null, null, 'bo3')) },
    { name: 'Lower Round 2', matchups: Array.from({ length: 2 }, () => makeMatchup(rng, null, null, 'bo3')) },
    { name: 'Lower Round 3', matchups: [makeMatchup(rng, null, null, 'bo3')] },
    { name: 'Lower Final', matchups: [makeMatchup(rng, null, null, 'bo5')] },
  ];

  // Pre-populate UQF team1 slots with #1 seeds
  // Top seeds pick opponents — we'll auto-assign by strength later
  // For now: Americas1→UQF0, EMEA1→UQF1, Pacific1→UQF2, China1→UQF3
  for (let i = 0; i < topSeeds.length && i < 4; i++) {
    const region = regionOrder[i];
    const topSeed = topSeeds.find(t => t.region === region);
    if (topSeed) {
      upper[0].matchups[i].team1Id = topSeed.teamId;
    }
  }

  return {
    teams: qualifiedTeams,
    swiss,
    upper,
    lower,
    champion: null,
  };
}

// ── Swiss advancement ──

/** Pair teams from a pool, avoiding same region when possible */
function pairPool(
  rng: ReturnType<typeof createRNG>,
  pool: SwissTeam[],
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const remaining = [...pool];

  while (remaining.length >= 2) {
    const a = remaining.shift()!;
    // find best opponent: different region preferred
    let bestIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].region !== a.region) {
        bestIdx = i;
        break;
      }
    }
    const b = remaining.splice(bestIdx, 1)[0];
    pairs.push([a.teamId, b.teamId]);
  }

  return pairs;
}

/**
 * Called after each Swiss round completes.
 * Updates W-L records and generates next round matchups.
 */
export function advanceSwissRound(
  bracket: ChampionsBracket,
  roundIdx: number,
  rng: ReturnType<typeof createRNG>,
): void {
  const swiss = bracket.swiss;
  const round = swiss.rounds[roundIdx];

  // Update W-L from results
  for (const matchup of round.matchups) {
    if (!matchup.winnerId) continue;
    const loserId = matchup.team1Id === matchup.winnerId ? matchup.team2Id : matchup.team1Id;

    const winner = swiss.teams.find(t => t.teamId === matchup.winnerId);
    const loser = swiss.teams.find(t => t.teamId === loserId);
    if (winner) winner.wins++;
    if (loser) loser.losses++;
  }

  // Mark 2-0 as advanced, 0-2 as eliminated
  for (const t of swiss.teams) {
    if (t.wins >= 2 && !t.advanced) t.advanced = true;
    if (t.losses >= 2 && !t.eliminated) t.eliminated = true;
  }

  // Generate next round matchups
  if (roundIdx === 0) {
    // After R1: generate R2 High (1-0 pool) and R2 Low (0-1 pool)
    const highPool = swiss.teams.filter(t => t.wins === 1 && t.losses === 0);
    const lowPool = swiss.teams.filter(t => t.wins === 0 && t.losses === 1);

    const highPairs = pairPool(rng, highPool);
    const lowPairs = pairPool(rng, lowPool);

    swiss.rounds[1].matchups = highPairs.map(([a, b]) => makeMatchup(rng, a, b));
    swiss.rounds[2].matchups = lowPairs.map(([a, b]) => makeMatchup(rng, a, b));
  } else if (roundIdx === 2) {
    // After R2 Low: generate R3 Decider (1-1 pool)
    const deciderPool = swiss.teams.filter(t => t.wins === 1 && t.losses === 1 && !t.advanced && !t.eliminated);
    const deciderPairs = pairPool(rng, deciderPool);
    swiss.rounds[3].matchups = deciderPairs.map(([a, b]) => makeMatchup(rng, a, b));
  } else if (roundIdx === 3) {
    // Swiss complete! Seed playoffs
    swiss.complete = true;
    seedPlayoffs(bracket, rng);
  }
  // roundIdx === 1 (R2 High): R2 Low matchups already generated after R1, nothing extra needed
}

/**
 * After Swiss completes, seed the 4 advancing teams into UQF as team2 slots.
 * Region-protected: no #1 seed faces a Swiss qualifier from the same region.
 * Among valid assignments, strongest #1 seed picks the weakest qualifier first.
 */
function seedPlayoffs(bracket: ChampionsBracket, rng: ReturnType<typeof createRNG>): void {
  const uqf = bracket.upper[0].matchups;

  // Get #1 seed region for each UQF slot
  const slotRegions: (Region | null)[] = uqf.map(m => {
    const info = bracket.teams.find(t => t.teamId === m.team1Id);
    return info?.region ?? null;
  });

  // Swiss qualifiers with their regions
  const qualifiers = bracket.swiss.teams
    .filter(t => t.advanced)
    .map(t => ({
      teamId: t.teamId,
      region: t.region,
    }));

  // Find a valid assignment: each qualifier goes to a slot where regions differ
  // Try all permutations (only 4! = 24, trivial)
  const indices = qualifiers.map((_, i) => i);

  function isValid(perm: number[]): boolean {
    for (let slot = 0; slot < perm.length; slot++) {
      if (slotRegions[slot] && qualifiers[perm[slot]]?.region === slotRegions[slot]) {
        return false;
      }
    }
    return true;
  }

  function permutations(arr: number[]): number[][] {
    if (arr.length <= 1) return [arr];
    const result: number[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const p of permutations(rest)) {
        result.push([arr[i], ...p]);
      }
    }
    return result;
  }

  const allPerms = permutations(indices);
  const validPerm = allPerms.find(isValid);

  if (validPerm) {
    for (let slot = 0; slot < uqf.length; slot++) {
      uqf[slot].team2Id = qualifiers[validPerm[slot]]?.teamId ?? null;
    }
  } else {
    // Fallback: shouldn't happen with 4 regions, but fill sequentially
    for (let i = 0; i < Math.min(qualifiers.length, uqf.length); i++) {
      uqf[i].team2Id = qualifiers[i].teamId;
    }
  }
}

// ── Playoff advancement ──

/**
 * Called after a playoff round completes.
 * Routes winners to next round and losers to lower bracket.
 */
export function advanceChampionsPlayoffRound(
  bracket: ChampionsBracket,
  stepIdx: number,
): void {
  const step = CHAMPIONS_ROUND_ORDER[stepIdx];
  if (step.phase === 'swiss') return; // Swiss handled separately

  const section = step.phase === 'upper' ? bracket.upper : bracket.lower;
  const round = section[step.roundIdx];

  if (step.phase === 'upper') {
    switch (step.roundIdx) {
      case 0: { // UQF → USF winners, LR1 losers (cross-seeded)
        const usf = bracket.upper[1];
        const lr1 = bracket.lower[0];
        for (let i = 0; i < round.matchups.length; i += 2) {
          const w0 = round.matchups[i]?.winnerId;
          const w1 = round.matchups[i + 1]?.winnerId;
          const sfIdx = Math.floor(i / 2);
          if (w0 && usf.matchups[sfIdx]) usf.matchups[sfIdx].team1Id = w0;
          if (w1 && usf.matchups[sfIdx]) usf.matchups[sfIdx].team2Id = w1;
        }
        // Losers to LR1 (cross-seeded: UQF0 loser vs UQF3 loser, UQF1 loser vs UQF2 loser)
        const losers = round.matchups.map(m =>
          m.winnerId === m.team1Id ? m.team2Id : m.team1Id
        );
        if (losers[0] && lr1.matchups[0]) lr1.matchups[0].team1Id = losers[0];
        if (losers[3] && lr1.matchups[0]) lr1.matchups[0].team2Id = losers[3];
        if (losers[1] && lr1.matchups[1]) lr1.matchups[1].team1Id = losers[1];
        if (losers[2] && lr1.matchups[1]) lr1.matchups[1].team2Id = losers[2];
        break;
      }
      case 1: { // USF → UF winners, LR2 losers (cross-seeded with LR1 winners)
        const uf = bracket.upper[2];
        const lr2 = bracket.lower[1];
        if (round.matchups[0]?.winnerId && uf.matchups[0]) uf.matchups[0].team1Id = round.matchups[0].winnerId;
        if (round.matchups[1]?.winnerId && uf.matchups[0]) uf.matchups[0].team2Id = round.matchups[1].winnerId;
        // USF losers → LR2 team2 (cross-seeded: USF0 loser → LR2-1, USF1 loser → LR2-0)
        const usfLosers = round.matchups.map(m =>
          m.winnerId === m.team1Id ? m.team2Id : m.team1Id
        );
        if (usfLosers[0] && lr2.matchups[1]) lr2.matchups[1].team2Id = usfLosers[0];
        if (usfLosers[1] && lr2.matchups[0]) lr2.matchups[0].team2Id = usfLosers[1];
        break;
      }
      case 2: { // UF → GF winner, LF loser
        const gf = bracket.upper[3];
        const lf = bracket.lower[3];
        const winner = round.matchups[0]?.winnerId;
        const loser = round.matchups[0]?.winnerId === round.matchups[0]?.team1Id
          ? round.matchups[0]?.team2Id : round.matchups[0]?.team1Id;
        if (winner && gf.matchups[0]) gf.matchups[0].team1Id = winner;
        if (loser && lf.matchups[0]) lf.matchups[0].team2Id = loser;
        break;
      }
      case 3: { // GF → champion
        bracket.champion = round.matchups[0]?.winnerId ?? null;
        break;
      }
    }
  } else if (step.phase === 'lower') {
    switch (step.roundIdx) {
      case 0: { // LR1 winners → LR2 team1
        const lr2 = bracket.lower[1];
        if (round.matchups[0]?.winnerId && lr2.matchups[0]) lr2.matchups[0].team1Id = round.matchups[0].winnerId;
        if (round.matchups[1]?.winnerId && lr2.matchups[1]) lr2.matchups[1].team1Id = round.matchups[1].winnerId;
        break;
      }
      case 1: { // LR2 winners → LR3
        const lr3 = bracket.lower[2];
        if (round.matchups[0]?.winnerId && lr3.matchups[0]) lr3.matchups[0].team1Id = round.matchups[0].winnerId;
        if (round.matchups[1]?.winnerId && lr3.matchups[0]) lr3.matchups[0].team2Id = round.matchups[1].winnerId;
        break;
      }
      case 2: { // LR3 winner → LF team1
        const lf = bracket.lower[3];
        if (round.matchups[0]?.winnerId && lf.matchups[0]) lf.matchups[0].team1Id = round.matchups[0].winnerId;
        break;
      }
      case 3: { // LF winner → GF team2
        const gf = bracket.upper[3];
        if (round.matchups[0]?.winnerId && gf.matchups[0]) gf.matchups[0].team2Id = round.matchups[0].winnerId;
        break;
      }
    }
  }
}

// ── Helpers ──

/** Get all matchups across Swiss + playoffs for iteration */
export function getAllChampionsMatchups(bracket: ChampionsBracket): PlayoffMatchup[] {
  const matchups: PlayoffMatchup[] = [];
  for (const round of bracket.swiss.rounds) {
    matchups.push(...round.matchups);
  }
  for (const round of bracket.upper) {
    matchups.push(...round.matchups);
  }
  for (const round of bracket.lower) {
    matchups.push(...round.matchups);
  }
  return matchups;
}

/** Check if user is eliminated from Champions (lost in any playoff matchup, or didn't qualify) */
export function isEliminatedFromChampions(
  bracket: ChampionsBracket,
  userTeamId: string,
): boolean {
  // Check if user qualified
  const qualified = bracket.teams.some(t => t.teamId === userTeamId);
  if (!qualified) return true;

  // In Swiss: eliminated if losses >= 2
  const swissTeam = bracket.swiss.teams.find(t => t.teamId === userTeamId);
  if (swissTeam?.eliminated) return true;

  // In playoffs: lost in lower bracket (any LB loss = out)
  for (const round of bracket.lower) {
    for (const m of round.matchups) {
      if (m.winnerId && m.winnerId !== userTeamId) {
        if (m.team1Id === userTeamId || m.team2Id === userTeamId) {
          return true;
        }
      }
    }
  }

  return false;
}

/** Get the round name for a given step index */
export function getChampionsRoundName(stepIdx: number): string {
  if (stepIdx >= CHAMPIONS_ROUND_ORDER.length) return '';
  const step = CHAMPIONS_ROUND_ORDER[stepIdx];
  if (step.phase === 'swiss') {
    const names = ['Swiss Round 1', 'Swiss Round 2 (High)', 'Swiss Round 2 (Low)', 'Swiss Decider'];
    return names[step.roundIdx] ?? 'Swiss';
  }
  const section = step.phase === 'upper' ? 'upper' : 'lower';
  const roundNames: Record<string, string[]> = {
    upper: ['Upper Quarterfinals', 'Upper Semifinals', 'Upper Final', 'Grand Final'],
    lower: ['Lower Round 1', 'Lower Round 2', 'Lower Round 3', 'Lower Final'],
  };
  return roundNames[section]?.[step.roundIdx] ?? '';
}
