// src/sim/stagePlayoffs.ts
// VCT 2026 Stage playoffs: 8-team double-elimination bracket
// seeded from group stage (top 4 from Alpha & Omega)
//
// bracket layout (from VCT Americas Stage 1 2026):
//   UB R1:  M1 (Omega#2 vs Alpha#3), M2 (Alpha#2 vs Omega#3)
//   LB R1:  M5 (Omega#4 vs Loser M1), M6 (Alpha#4 vs Loser M2)
//   UB SF:  M3 (Alpha#1 vs Winner M1), M4 (Omega#1 vs Winner M2)
//   LB R2:  M7 (Winner M5 vs Loser M4), M8 (Winner M6 vs Loser M3)
//   UB F:   M9 (Winner M3 vs Winner M4)
//   LB SF:  M10 (Winner M7 vs Winner M8)
//   LB F:   M11 (Loser M9 vs Winner M10)  — Bo5
//   GF:     M12 (Winner M9 vs Winner M11) — Bo5

import type { PlayoffMatchup, PlayoffRound, MatchFormat, StandingsEntry } from '../types';
import { createRNG, generateId } from '../utils/random';

// ── types ──

export interface StagePlayoffBracket {
  format: 'double_elimination';
  upper: PlayoffRound[]; // [UB R1, UB SF, UB Final, Grand Final]
  lower: PlayoffRound[]; // [LB R1, LB R2, LB SF, LB Final]
  champion: string | null;
  // track qualification: top 3 go to international
  qualifiedTeams: string[]; // filled as teams are eliminated or win
  // seed labels for display: teamId → "Alpha #1", "Omega #3", etc.
  seedLabels?: Record<string, string>;
}

// play order — each step is one sim round
export type StagePlayoffPhase = 'upper' | 'lower';

export interface StagePlayoffStep {
  phase: StagePlayoffPhase;
  roundIdx: number;
}

// match order follows VCT scheduling
export const STAGE_PLAYOFF_ROUND_ORDER: StagePlayoffStep[] = [
  { phase: 'upper', roundIdx: 0 },  // UB R1: M1, M2
  { phase: 'lower', roundIdx: 0 },  // LB R1: M5, M6
  { phase: 'upper', roundIdx: 1 },  // UB SF: M3, M4
  { phase: 'lower', roundIdx: 1 },  // LB R2: M7, M8
  { phase: 'upper', roundIdx: 2 },  // UB Final: M9
  { phase: 'lower', roundIdx: 2 },  // LB SF: M10
  { phase: 'lower', roundIdx: 3 },  // LB Final (Bo5): M11
  { phase: 'upper', roundIdx: 3 },  // Grand Final (Bo5): M12
];

// ── bracket generation ──

function makeMatchup(
  rng: ReturnType<typeof createRNG>,
  t1: string | null,
  t2: string | null,
  format: MatchFormat = 'bo3',
): PlayoffMatchup {
  return {
    id: generateId(rng, 'sp_'),
    team1Id: t1,
    team2Id: t2,
    winnerId: null,
    matchResults: [],
    format,
  };
}

export function generateStagePlayoffBracket(
  rngSeed: string,
  alpha: StandingsEntry[], // top 4 from Alpha group, sorted 1-4
  omega: StandingsEntry[], // top 4 from Omega group, sorted 1-4
): StagePlayoffBracket {
  const rng = createRNG(rngSeed);

  const a1 = alpha[0]?.teamId ?? null;
  const a2 = alpha[1]?.teamId ?? null;
  const a3 = alpha[2]?.teamId ?? null;
  const a4 = alpha[3]?.teamId ?? null;
  const o1 = omega[0]?.teamId ?? null;
  const o2 = omega[1]?.teamId ?? null;
  const o3 = omega[2]?.teamId ?? null;
  const o4 = omega[3]?.teamId ?? null;

  const upper: PlayoffRound[] = [
    // UB R1: cross-group 2v3
    {
      name: 'UB Round 1',
      matchups: [
        makeMatchup(rng, o2, a3), // M1
        makeMatchup(rng, a2, o3), // M2
      ],
    },
    // UB SF: group winners vs UB R1 winners (byes)
    {
      name: 'UB Semifinals',
      matchups: [
        makeMatchup(rng, a1, null), // M3: Alpha#1 vs Winner M1
        makeMatchup(rng, o1, null), // M4: Omega#1 vs Winner M2
      ],
    },
    // UB Final
    {
      name: 'UB Final',
      matchups: [
        makeMatchup(rng, null, null), // M9: Winner M3 vs Winner M4
      ],
    },
    // Grand Final (Bo5)
    {
      name: 'Grand Final',
      matchups: [
        makeMatchup(rng, null, null, 'bo5'), // M12: Winner M9 vs Winner M11
      ],
    },
  ];

  const lower: PlayoffRound[] = [
    // LB R1: 4th seeds vs UB R1 losers
    {
      name: 'LB Round 1',
      matchups: [
        makeMatchup(rng, o4, null), // M5: Omega#4 vs Loser M1
        makeMatchup(rng, a4, null), // M6: Alpha#4 vs Loser M2
      ],
    },
    // LB R2: LB R1 winners vs UB SF losers
    {
      name: 'LB Quarterfinal',
      matchups: [
        makeMatchup(rng, null, null), // M7: Winner M5 vs Loser M4
        makeMatchup(rng, null, null), // M8: Winner M6 vs Loser M3
      ],
    },
    // LB SF
    {
      name: 'LB Semifinal',
      matchups: [
        makeMatchup(rng, null, null), // M10: Winner M7 vs Winner M8
      ],
    },
    // LB Final (Bo5)
    {
      name: 'LB Final',
      matchups: [
        makeMatchup(rng, null, null, 'bo5'), // M11: Loser M9 vs Winner M10
      ],
    },
  ];

  // build seed labels: teamId → "Alpha #1", "Omega #2", etc.
  const seedLabels: Record<string, string> = {};
  alpha.forEach((e, i) => { if (e.teamId) seedLabels[e.teamId] = `Alpha #${i + 1}`; });
  omega.forEach((e, i) => { if (e.teamId) seedLabels[e.teamId] = `Omega #${i + 1}`; });

  return {
    format: 'double_elimination',
    upper,
    lower,
    champion: null,
    qualifiedTeams: [],
    seedLabels,
  };
}

// ── bracket advancement ──

// advance after a round completes — routes winners/losers to correct slots
export function advanceStagePlayoffRound(
  bracket: StagePlayoffBracket,
  stepIdx: number,
): void {
  const step = STAGE_PLAYOFF_ROUND_ORDER[stepIdx];
  if (!step) return;

  const round = step.phase === 'upper'
    ? bracket.upper[step.roundIdx]
    : bracket.lower[step.roundIdx];

  if (!round) return;

  // route based on which step just completed
  switch (stepIdx) {
    case 0: // UB R1 done → feed UB SF (winners) + LB R1 (losers)
      routeUbR1(bracket, round);
      break;
    case 1: // LB R1 done → winners go to LB R2 team1 slots (team2 filled after UB SF)
      routeLbR1(bracket, round);
      break;
    case 2: // UB SF done → feed UB Final (winners) + LB R2 (losers)
      routeUbSf(bracket, round);
      break;
    case 3: // LB R2 done → feed LB SF (winners)
      routeLbR2(bracket, round);
      break;
    case 4: // UB Final done → feed Grand Final (winner) + LB Final (loser)
      routeUbFinal(bracket, round);
      break;
    case 5: // LB SF done → feed LB Final (winner)
      routeLbSf(bracket, round);
      break;
    case 6: // LB Final done → feed Grand Final (winner) + 3rd place qualified
      routeLbFinal(bracket, round);
      break;
    case 7: // Grand Final done → set champion + top 2 qualified
      routeGrandFinal(bracket, round);
      break;
  }
}

function loserId(matchup: PlayoffMatchup): string | null {
  if (!matchup.winnerId || !matchup.team1Id || !matchup.team2Id) return null;
  return matchup.winnerId === matchup.team1Id ? matchup.team2Id : matchup.team1Id;
}

// UB R1 (step 0): winners → UB SF slots, losers → LB R1 slots
function routeUbR1(bracket: StagePlayoffBracket, round: PlayoffRound): void {
  const m1 = round.matchups[0]; // Omega#2 vs Alpha#3
  const m2 = round.matchups[1]; // Alpha#2 vs Omega#3

  // winners → UB SF (M3.team2, M4.team2)
  bracket.upper[1].matchups[0].team2Id = m1.winnerId; // M3: Alpha#1 vs Winner M1
  bracket.upper[1].matchups[1].team2Id = m2.winnerId; // M4: Omega#1 vs Winner M2

  // losers → LB R1 (M5.team2, M6.team2)
  bracket.lower[0].matchups[0].team2Id = loserId(m1); // M5: Omega#4 vs Loser M1
  bracket.lower[0].matchups[1].team2Id = loserId(m2); // M6: Alpha#4 vs Loser M2
}

// LB R1 (step 1): winners → LB R2 team1 slots
function routeLbR1(bracket: StagePlayoffBracket, round: PlayoffRound): void {
  const m5 = round.matchups[0];
  const m6 = round.matchups[1];

  bracket.lower[1].matchups[0].team1Id = m5.winnerId; // M7: Winner M5 vs ...
  bracket.lower[1].matchups[1].team1Id = m6.winnerId; // M8: Winner M6 vs ...
}

// UB SF (step 2): winners → UB Final, losers → LB R2
function routeUbSf(bracket: StagePlayoffBracket, round: PlayoffRound): void {
  const m3 = round.matchups[0]; // Alpha#1 vs Winner M1
  const m4 = round.matchups[1]; // Omega#1 vs Winner M2

  // winners → UB Final (M9)
  bracket.upper[2].matchups[0].team1Id = m3.winnerId;
  bracket.upper[2].matchups[0].team2Id = m4.winnerId;

  // losers → LB R2 — note the cross: Loser M4 → M7.team2, Loser M3 → M8.team2
  bracket.lower[1].matchups[0].team2Id = loserId(m4); // M7: Winner M5 vs Loser M4
  bracket.lower[1].matchups[1].team2Id = loserId(m3); // M8: Winner M6 vs Loser M3
}

// LB R2 (step 3): winners → LB SF
function routeLbR2(bracket: StagePlayoffBracket, round: PlayoffRound): void {
  const m7 = round.matchups[0];
  const m8 = round.matchups[1];

  bracket.lower[2].matchups[0].team1Id = m7.winnerId;
  bracket.lower[2].matchups[0].team2Id = m8.winnerId;
}

// UB Final (step 4): winner → Grand Final, loser → LB Final
function routeUbFinal(bracket: StagePlayoffBracket, round: PlayoffRound): void {
  const m9 = round.matchups[0];

  // winner → Grand Final (M12.team1)
  bracket.upper[3].matchups[0].team1Id = m9.winnerId;

  // loser → LB Final (M11.team1)
  bracket.lower[3].matchups[0].team1Id = loserId(m9);
}

// LB SF (step 5): winner → LB Final
function routeLbSf(bracket: StagePlayoffBracket, round: PlayoffRound): void {
  const m10 = round.matchups[0];

  bracket.lower[3].matchups[0].team2Id = m10.winnerId;
}

// LB Final (step 6): winner → Grand Final, loser is eliminated (but top 3 = qualified)
function routeLbFinal(bracket: StagePlayoffBracket, round: PlayoffRound): void {
  const m11 = round.matchups[0];

  // winner → Grand Final (M12.team2)
  bracket.upper[3].matchups[0].team2Id = m11.winnerId;

  // loser of LB Final = 3rd place → qualifies for international
  const third = loserId(m11);
  if (third && !bracket.qualifiedTeams.includes(third)) {
    bracket.qualifiedTeams.push(third);
  }
}

// Grand Final (step 7): champion + runner-up both qualify
function routeGrandFinal(bracket: StagePlayoffBracket, round: PlayoffRound): void {
  const m12 = round.matchups[0];

  bracket.champion = m12.winnerId;

  // winner = 1st, loser = 2nd — both qualify
  if (m12.winnerId && !bracket.qualifiedTeams.includes(m12.winnerId)) {
    bracket.qualifiedTeams.unshift(m12.winnerId); // champion first
  }
  const second = loserId(m12);
  if (second && !bracket.qualifiedTeams.includes(second)) {
    // insert at position 1 (after champion, before 3rd)
    bracket.qualifiedTeams.splice(1, 0, second);
  }
}

// ── helpers ──

export function getStagePlayoffRoundName(stepIdx: number): string {
  const names = [
    'UB Round 1',
    'LB Round 1',
    'UB Semifinals',
    'LB Quarterfinal',
    'UB Final',
    'LB Semifinal',
    'LB Final',
    'Grand Final',
  ];
  return names[stepIdx] ?? `Round ${stepIdx + 1}`;
}

export function isStagePlayoffComplete(bracket: StagePlayoffBracket): boolean {
  return bracket.champion !== null;
}

export function getAllStagePlayoffMatchups(bracket: StagePlayoffBracket): PlayoffMatchup[] {
  return [
    ...bracket.upper.flatMap(r => r.matchups),
    ...bracket.lower.flatMap(r => r.matchups),
  ];
}

// get the current step's round based on stepIdx
export function getStagePlayoffRound(
  bracket: StagePlayoffBracket,
  stepIdx: number,
): PlayoffRound | null {
  const step = STAGE_PLAYOFF_ROUND_ORDER[stepIdx];
  if (!step) return null;
  return step.phase === 'upper'
    ? bracket.upper[step.roundIdx] ?? null
    : bracket.lower[step.roundIdx] ?? null;
}

// check if all matchups in the current step are complete
export function isStepComplete(bracket: StagePlayoffBracket, stepIdx: number): boolean {
  const round = getStagePlayoffRound(bracket, stepIdx);
  if (!round) return true;
  return round.matchups.every(m => m.winnerId !== null);
}

// after LB R1 completes but before it can be "advanced", we need UB SF losers
// this helper checks if both prerequisites for a step are met
export function canSimStep(bracket: StagePlayoffBracket, stepIdx: number): boolean {
  const round = getStagePlayoffRound(bracket, stepIdx);
  if (!round) return false;
  // all matchups in this round must have both teams assigned
  return round.matchups.every(m => m.team1Id && m.team2Id);
}
