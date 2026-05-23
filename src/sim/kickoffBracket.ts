// src/sim/kickoffBracket.ts
// triple-elimination kickoff bracket system (VCT 2026 format)
// 12 teams per region, top 4 get byes into UR2

import type { Team, PlayoffMatchup, PlayoffRound, Region, MatchFormat } from '../types';
import type { StartingSlot } from '../types/roster';
import { createRNG, generateId } from '../utils/random';
import { getCompositionPenalty } from './compositionBonus';
import { getIGLBonusForPlayer } from './iglBonus';

// lineup strength calc (same as PowerRankingsPage but extracted here)
function getLineupSummary(roster: Team['roster'], lineup: StartingSlot[]) {
  return lineup.map(slot => {
    const player = roster.find(p => p.id === slot.playerId);
    if (!player) return { playerId: slot.playerId, effectiveOverall: 0 };
    const isOffRole = slot.assignedRole !== player.role;
    const penalty = isOffRole ? -5 : 0;
    return { playerId: player.id, effectiveOverall: player.overall + penalty };
  });
}

export function getTeamLineupStrength(team: Team): number {
  const lineup: StartingSlot[] = team.startingLineup || team.roster.slice(0, 5).map(p => ({
    playerId: p.id,
    assignedRole: p.role,
  }));

  const summary = getLineupSummary(team.roster, lineup);
  const compPenalty = getCompositionPenalty(lineup);

  return summary.reduce((total, s) => {
    const player = team.roster.find(p => p.id === s.playerId);
    const iglBonus = player ? getIGLBonusForPlayer(player, team, lineup) : 0;
    const iglImpact = Math.round(iglBonus * 0.5);
    return total + s.effectiveOverall + iglImpact + compPenalty;
  }, 0);
}

// bracket types

export interface KickoffBracket {
  seeds: Array<{ teamId: string; seed: number; hasBye: boolean }>;
  upper: PlayoffRound[];  // UR1, UR2, UR3, UF
  middle: PlayoffRound[]; // MR2, MR3, MR4, MR5, MF
  lower: PlayoffRound[];  // LR3, LR4, LR5, LR6, LR7, LF
  qualifiers: Array<{ teamId: string; seed: number; bracket: 'upper' | 'middle' | 'lower' }>;
}

export type BracketSection = 'upper' | 'middle' | 'lower';

// round play order — matches real VCT 2026 Kickoff schedule
// each entry = one round step (1 matchup per region per day click)
export const BRACKET_ROUND_ORDER: Array<{ section: BracketSection; roundIdx: number }> = [
  { section: 'upper', roundIdx: 0 },  // Upper Round 1
  { section: 'upper', roundIdx: 1 },  // Upper Round 2
  { section: 'middle', roundIdx: 0 }, // Middle Round 1
  { section: 'middle', roundIdx: 1 }, // Middle Round 2
  { section: 'upper', roundIdx: 2 },  // Upper Round 3
  { section: 'lower', roundIdx: 0 },  // Lower Round 1
  { section: 'middle', roundIdx: 2 }, // Middle Round 3
  { section: 'lower', roundIdx: 1 },  // Lower Round 2
  { section: 'lower', roundIdx: 2 },  // Lower Round 3
  { section: 'middle', roundIdx: 3 }, // Middle Round 4
  { section: 'lower', roundIdx: 3 },  // Lower Round 4
  { section: 'upper', roundIdx: 3 },  // Upper Final
  { section: 'middle', roundIdx: 4 }, // Middle Final
  { section: 'lower', roundIdx: 4 },  // Lower Round 5
  { section: 'lower', roundIdx: 5 },  // Lower Final
];

// seeding

export interface SeedEntry {
  teamId: string;
  seed: number;
  hasBye: boolean;
}

export function seedRegion(
  regionTeams: Team[],
  previousQualifiers: string[], // teamIds that qualified internationally last year
  vctPoints?: Record<string, number>, // current year championship points
): SeedEntry[] {
  const byeTeamIds = new Set<string>();
  const pts = vctPoints ?? {};
  const hasPoints = Object.values(pts).some(p => p > 0);

  if (hasPoints) {
    // sort by points desc, then OVR as tiebreaker
    const sorted = [...regionTeams].sort((a, b) => {
      const diff = (pts[b.id] ?? 0) - (pts[a.id] ?? 0);
      return diff !== 0 ? diff : getTeamLineupStrength(b) - getTeamLineupStrength(a);
    });
    // top 4 by points get byes
    for (const t of sorted) {
      if (byeTeamIds.size >= 4) break;
      byeTeamIds.add(t.id);
    }
  } else {
    // no points yet (kickoff / year 1) — previous international qualifiers get auto-byes
    for (const id of previousQualifiers) {
      if (regionTeams.some(t => t.id === id) && byeTeamIds.size < 3) {
        byeTeamIds.add(id);
      }
    }
    // 4th bye goes to strongest remaining team
    const remaining = regionTeams
      .filter(t => !byeTeamIds.has(t.id))
      .sort((a, b) => getTeamLineupStrength(b) - getTeamLineupStrength(a));
    if (byeTeamIds.size < 4 && remaining.length > 0) {
      byeTeamIds.add(remaining[0].id);
    }
  }

  // build seed list: byes first (sorted by points then strength), then rest
  const sortKey = (a: Team, b: Team) => {
    if (hasPoints) {
      const diff = (pts[b.id] ?? 0) - (pts[a.id] ?? 0);
      if (diff !== 0) return diff;
    }
    return getTeamLineupStrength(b) - getTeamLineupStrength(a);
  };

  const byeTeams = regionTeams.filter(t => byeTeamIds.has(t.id)).sort(sortKey);
  const nonByeTeams = regionTeams.filter(t => !byeTeamIds.has(t.id)).sort(sortKey);

  const seeds: SeedEntry[] = [];
  byeTeams.forEach((t, i) => seeds.push({ teamId: t.id, seed: i + 1, hasBye: true }));
  nonByeTeams.forEach((t, i) => seeds.push({ teamId: t.id, seed: byeTeams.length + i + 1, hasBye: false }));

  return seeds;
}

// helper to create an empty matchup
function emptyMatchup(rng: ReturnType<typeof createRNG>, format: MatchFormat): PlayoffMatchup {
  return {
    id: generateId(rng, 'kb_'),
    team1Id: null,
    team2Id: null,
    winnerId: null,
    matchResults: [],
    format,
  };
}

// bracket generation

export function generateKickoffBracket(
  seed: string,
  seeds: SeedEntry[]
): KickoffBracket {
  const rng = createRNG(seed);

  // upper bracket
  // UR1: 5v12, 8v9, 6v11, 7v10
  const s = (n: number) => seeds[n - 1]?.teamId ?? null;

  const ur1: PlayoffRound = {
    name: 'Upper Round 1',
    matchups: [
      { id: generateId(rng, 'kb_'), team1Id: s(5), team2Id: s(12), winnerId: null, matchResults: [], format: 'bo3' },
      { id: generateId(rng, 'kb_'), team1Id: s(8), team2Id: s(9), winnerId: null, matchResults: [], format: 'bo3' },
      { id: generateId(rng, 'kb_'), team1Id: s(6), team2Id: s(11), winnerId: null, matchResults: [], format: 'bo3' },
      { id: generateId(rng, 'kb_'), team1Id: s(7), team2Id: s(10), winnerId: null, matchResults: [], format: 'bo3' },
    ],
  };

  // UR2: Seed1 vs UR1[0]w, Seed4 vs UR1[1]w, Seed2 vs UR1[2]w, Seed3 vs UR1[3]w
  const ur2: PlayoffRound = {
    name: 'Upper Round 2',
    matchups: [
      { id: generateId(rng, 'kb_'), team1Id: s(1), team2Id: null, winnerId: null, matchResults: [], format: 'bo3' },
      { id: generateId(rng, 'kb_'), team1Id: s(4), team2Id: null, winnerId: null, matchResults: [], format: 'bo3' },
      { id: generateId(rng, 'kb_'), team1Id: s(2), team2Id: null, winnerId: null, matchResults: [], format: 'bo3' },
      { id: generateId(rng, 'kb_'), team1Id: s(3), team2Id: null, winnerId: null, matchResults: [], format: 'bo3' },
    ],
  };

  // UR3 (2 matches), UF (1 match BO5)
  const ur3: PlayoffRound = {
    name: 'Upper Round 3',
    matchups: [emptyMatchup(rng, 'bo3'), emptyMatchup(rng, 'bo3')],
  };
  const uf: PlayoffRound = {
    name: 'Upper Final',
    matchups: [emptyMatchup(rng, 'bo5')],
  };

  // middle bracket
  const mr2: PlayoffRound = {
    name: 'Middle Round 1',
    matchups: Array.from({ length: 4 }, () => emptyMatchup(rng, 'bo3')),
  };
  const mr3: PlayoffRound = {
    name: 'Middle Round 2',
    matchups: [emptyMatchup(rng, 'bo3'), emptyMatchup(rng, 'bo3')],
  };
  const mr4: PlayoffRound = {
    name: 'Middle Round 3',
    matchups: [emptyMatchup(rng, 'bo3'), emptyMatchup(rng, 'bo3')],
  };
  const mr5: PlayoffRound = {
    name: 'Middle Round 4',
    matchups: [emptyMatchup(rng, 'bo3')],
  };
  const mf: PlayoffRound = {
    name: 'Middle Final',
    matchups: [emptyMatchup(rng, 'bo5')],
  };

  // lower bracket
  const lr3: PlayoffRound = {
    name: 'Lower Round 1',
    matchups: [emptyMatchup(rng, 'bo3'), emptyMatchup(rng, 'bo3')],
  };
  const lr4: PlayoffRound = {
    name: 'Lower Round 2',
    matchups: [emptyMatchup(rng, 'bo3'), emptyMatchup(rng, 'bo3')],
  };
  const lr5: PlayoffRound = {
    name: 'Lower Round 3',
    matchups: [emptyMatchup(rng, 'bo3'), emptyMatchup(rng, 'bo3')],
  };
  const lr6: PlayoffRound = {
    name: 'Lower Round 4',
    matchups: [emptyMatchup(rng, 'bo3')],
  };
  const lr7: PlayoffRound = {
    name: 'Lower Round 5',
    matchups: [emptyMatchup(rng, 'bo3')],
  };
  const lf: PlayoffRound = {
    name: 'Lower Final',
    matchups: [emptyMatchup(rng, 'bo5')],
  };

  return {
    seeds,
    upper: [ur1, ur2, ur3, uf],
    middle: [mr2, mr3, mr4, mr5, mf],
    lower: [lr3, lr4, lr5, lr6, lr7, lf],
    qualifiers: [],
  };
}

// get loser of a completed matchup
function getLoser(m: PlayoffMatchup): string | null {
  if (!m.winnerId) return null;
  return m.team1Id === m.winnerId ? m.team2Id : m.team1Id;
}

// advance bracket after a round completes
// this routes winners forward and losers down to the next bracket section
export function advanceKickoffRound(bracket: KickoffBracket, roundOrderIdx: number): void {
  const step = BRACKET_ROUND_ORDER[roundOrderIdx];
  const section = bracket[step.section];
  const round = section[step.roundIdx];

  switch (step.section) {
    case 'upper':
      advanceUpperRound(bracket, step.roundIdx, round);
      break;
    case 'middle':
      advanceMiddleRound(bracket, step.roundIdx, round);
      break;
    case 'lower':
      advanceLowerRound(bracket, step.roundIdx, round);
      break;
  }
}

function advanceUpperRound(bracket: KickoffBracket, roundIdx: number, round: PlayoffRound): void {
  const upper = bracket.upper;
  const middle = bracket.middle;

  if (roundIdx === 0) {
    // UR1 complete → winners go to UR2 (team2Id slots), losers stored for MR1
    const ur2 = upper[1];
    for (let i = 0; i < round.matchups.length; i++) {
      const winner = round.matchups[i].winnerId;
      if (winner && ur2.matchups[i]) {
        ur2.matchups[i].team2Id = winner;
      }
    }
    // losers go to MR1 — but MR1 also needs UR2 losers, so we'll fill MR1 after UR2
  }

  if (roundIdx === 1) {
    // UR2 complete → winners to UR3, losers + UR1 losers fill MR1 (cross-seeded)
    const ur3 = upper[2];
    // UR2 winners → UR3 (pair 0,1 → UR3[0]; pair 2,3 → UR3[1])
    for (let i = 0; i < round.matchups.length; i += 2) {
      const w1 = round.matchups[i]?.winnerId;
      const w2 = round.matchups[i + 1]?.winnerId;
      const ur3Idx = Math.floor(i / 2);
      if (ur3.matchups[ur3Idx]) {
        ur3.matchups[ur3Idx].team1Id = w1 ?? null;
        ur3.matchups[ur3Idx].team2Id = w2 ?? null;
      }
    }

    // fill MR1 with UR1 losers vs UR2 losers (cross-seeded to avoid rematches)
    const ur1 = upper[0];
    const mr1 = middle[0];
    const crossMap = [1, 0, 3, 2];
    for (let i = 0; i < 4; i++) {
      const ur1Loser = getLoser(ur1.matchups[i]);
      const ur2Loser = getLoser(round.matchups[crossMap[i]]);
      if (mr1.matchups[i]) {
        mr1.matchups[i].team1Id = ur1Loser;
        mr1.matchups[i].team2Id = ur2Loser;
      }
    }
  }

  if (roundIdx === 2) {
    // UR3 complete → winners to UF, losers to MR3 team2 (cross-seeded)
    // (MR3 team1 was already filled by MR2 winners)
    const ufRound = upper[3];
    if (ufRound.matchups[0]) {
      ufRound.matchups[0].team1Id = round.matchups[0]?.winnerId ?? null;
      ufRound.matchups[0].team2Id = round.matchups[1]?.winnerId ?? null;
    }
    // UR3 losers → MR3 team2 slots (cross-seeded)
    const mr3 = middle[2];
    for (let i = 0; i < round.matchups.length; i++) {
      const crossIdx = round.matchups.length - 1 - i;
      const urLoser = getLoser(round.matchups[crossIdx]);
      if (mr3.matchups[i]) {
        mr3.matchups[i].team2Id = urLoser;
      }
    }
  }

  if (roundIdx === 3) {
    // UF complete → winner qualifies as 1st, loser to MF team2
    // (MF team1 was already filled by MR4 winner)
    const winner = round.matchups[0]?.winnerId;
    if (winner) {
      bracket.qualifiers.push({ teamId: winner, seed: 1, bracket: 'upper' });
    }
    const ufLoser = getLoser(round.matchups[0]);
    const mf = middle[4];
    if (mf.matchups[0]) {
      mf.matchups[0].team2Id = ufLoser;
    }
  }
}

function advanceMiddleRound(bracket: KickoffBracket, roundIdx: number, round: PlayoffRound): void {
  const middle = bracket.middle;
  const lower = bracket.lower;

  if (roundIdx === 0) {
    // MR1 complete → winners to MR2, losers to LR1
    const mr2 = middle[1];
    for (let i = 0; i < round.matchups.length; i += 2) {
      const w1 = round.matchups[i]?.winnerId;
      const w2 = round.matchups[i + 1]?.winnerId;
      const mr2Idx = Math.floor(i / 2);
      if (mr2.matchups[mr2Idx]) {
        mr2.matchups[mr2Idx].team1Id = w1 ?? null;
        mr2.matchups[mr2Idx].team2Id = w2 ?? null;
      }
    }
    // losers to LR1
    const lr1 = lower[0];
    for (let i = 0; i < round.matchups.length; i += 2) {
      const l1 = getLoser(round.matchups[i]);
      const l2 = getLoser(round.matchups[i + 1]);
      const lr1Idx = Math.floor(i / 2);
      if (lr1.matchups[lr1Idx]) {
        lr1.matchups[lr1Idx].team1Id = l1;
        lr1.matchups[lr1Idx].team2Id = l2;
      }
    }
  }

  if (roundIdx === 1) {
    // MR2 complete → winners to MR3 team1 slots ONLY
    // (UR3 losers will fill MR3 team2 when UR3 completes later)
    // MR2 losers stored for LR2
    const mr3 = middle[2];
    for (let i = 0; i < round.matchups.length; i++) {
      const mrWinner = round.matchups[i]?.winnerId;
      if (mr3.matchups[i]) {
        mr3.matchups[i].team1Id = mrWinner ?? null;
      }
    }
  }

  if (roundIdx === 2) {
    // MR3 complete → winners to MR4, losers to LR3
    const mr4 = middle[3];
    if (mr4.matchups[0]) {
      mr4.matchups[0].team1Id = round.matchups[0]?.winnerId ?? null;
      mr4.matchups[0].team2Id = round.matchups[1]?.winnerId ?? null;
    }
    // losers → stored for LR3 (filled when LR2 completes)
  }

  if (roundIdx === 3) {
    // MR4 complete → winner to MF team1 ONLY
    // (UF loser will fill MF team2 when UF completes later)
    // MR4 loser stored for LR5
    const mf = middle[4];
    if (mf.matchups[0]) {
      mf.matchups[0].team1Id = round.matchups[0]?.winnerId ?? null;
    }
  }

  if (roundIdx === 4) {
    // MF complete → winner qualifies as 2nd, loser to LF
    const winner = round.matchups[0]?.winnerId;
    if (winner) {
      bracket.qualifiers.push({ teamId: winner, seed: 2, bracket: 'middle' });
    }
    // loser → stored for LF (filled when LR5 completes)
  }
}

function advanceLowerRound(bracket: KickoffBracket, roundIdx: number, round: PlayoffRound): void {
  const lower = bracket.lower;
  const middle = bracket.middle;

  if (roundIdx === 0) {
    // LR1 complete → winners to LR2 (with MR2 losers, cross-seeded)
    const lr2 = lower[1];
    const mr2 = middle[1];
    for (let i = 0; i < round.matchups.length; i++) {
      const lrWinner = round.matchups[i]?.winnerId;
      const crossIdx = round.matchups.length - 1 - i;
      const mrLoser = getLoser(mr2.matchups[crossIdx]);
      if (lr2.matchups[i]) {
        lr2.matchups[i].team1Id = lrWinner ?? null;
        lr2.matchups[i].team2Id = mrLoser;
      }
    }
  }

  if (roundIdx === 1) {
    // LR2 complete → winners to LR3 (with MR3 losers, cross-seeded)
    const lr3 = lower[2];
    const mr3 = middle[2];
    for (let i = 0; i < round.matchups.length; i++) {
      const lrWinner = round.matchups[i]?.winnerId;
      const crossIdx = round.matchups.length - 1 - i;
      const mrLoser = getLoser(mr3.matchups[crossIdx]);
      if (lr3.matchups[i]) {
        lr3.matchups[i].team1Id = lrWinner ?? null;
        lr3.matchups[i].team2Id = mrLoser;
      }
    }
  }

  if (roundIdx === 2) {
    // LR3 complete → winners to LR4
    const lr4 = lower[3];
    if (lr4.matchups[0]) {
      lr4.matchups[0].team1Id = round.matchups[0]?.winnerId ?? null;
      lr4.matchups[0].team2Id = round.matchups[1]?.winnerId ?? null;
    }
  }

  if (roundIdx === 3) {
    // LR4 complete → winner to LR5 (with MR4 loser)
    const lr5 = lower[4];
    const mr4Loser = getLoser(middle[3].matchups[0]);
    if (lr5.matchups[0]) {
      lr5.matchups[0].team1Id = round.matchups[0]?.winnerId ?? null;
      lr5.matchups[0].team2Id = mr4Loser;
    }
  }

  if (roundIdx === 4) {
    // LR5 complete → winner to LF (with MF loser)
    const lf = lower[5];
    const mfLoser = getLoser(middle[4].matchups[0]);
    if (lf.matchups[0]) {
      lf.matchups[0].team1Id = round.matchups[0]?.winnerId ?? null;
      lf.matchups[0].team2Id = mfLoser;
    }
  }

  if (roundIdx === 5) {
    // LF complete → winner qualifies as 3rd
    const winner = round.matchups[0]?.winnerId;
    if (winner) {
      bracket.qualifiers.push({ teamId: winner, seed: 3, bracket: 'lower' });
    }
  }
}

// get all matchups from a bracket (flat list, useful for finding a match by ID)
export function getAllMatchups(bracket: KickoffBracket): PlayoffMatchup[] {
  const all: PlayoffMatchup[] = [];
  for (const round of [...bracket.upper, ...bracket.middle, ...bracket.lower]) {
    all.push(...round.matchups);
  }
  return all;
}

// check if the bracket is fully complete (all 3 qualifiers determined)
export function isBracketComplete(bracket: KickoffBracket): boolean {
  return bracket.qualifiers.length >= 3;
}

// get the round name for a given round order index
export function getRoundName(roundOrderIdx: number): string {
  const step = BRACKET_ROUND_ORDER[roundOrderIdx];
  if (!step) return 'Unknown';
  const bracket = step.section === 'upper' ? 'Upper' : step.section === 'middle' ? 'Middle' : 'Lower';
  const roundNames: Record<string, string[]> = {
    upper: ['Round 1', 'Round 2', 'Round 3', 'Final'],
    middle: ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Final'],
    lower: ['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Final'],
  };
  return `${bracket} ${roundNames[step.section][step.roundIdx] ?? ''}`;
}

// determine if a round is a "big stage" match (finals only)
export function isBigStageRound(roundOrderIdx: number): boolean {
  const step = BRACKET_ROUND_ORDER[roundOrderIdx];
  if (!step) return false;
  // UF = upper[3], MF = middle[4], LF = lower[5]
  return (
    (step.section === 'upper' && step.roundIdx === 3) ||
    (step.section === 'middle' && step.roundIdx === 4) ||
    (step.section === 'lower' && step.roundIdx === 5)
  );
}
