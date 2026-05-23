// src/sim/stageGroupStage.ts
// VCT 2026 Stage 1/2 group stage: 2 groups of 6, single round-robin, Bo3
// pool draw based on kickoff finishing order

import type { MatchResult, Region, StandingsEntry } from '../types';
import { createRNG, generateId, shuffle } from '../utils/random';

// ── types ──

export interface GroupTeam {
  teamId: string;
  pool: number; // 1-6 (1 = bottom seeds, 6 = top seeds)
  seed: number; // finishing position from kickoff (1 = best)
}

export interface StageGroup {
  name: 'Alpha' | 'Omega';
  teams: GroupTeam[];
  standings: StandingsEntry[];
  schedule: GroupMatch[];
}

export interface GroupMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  format: 'bo3';
  matchday: number; // 1-indexed day within the group stage
  played: boolean;
  result: MatchResult | null;
}

export interface GroupStage {
  region: Region;
  groups: [StageGroup, StageGroup]; // [Alpha, Omega]
  currentMatchday: number;
  complete: boolean;
  // manual override — if set, skip auto-draw and use these assignments
  manualGroups?: { alpha: string[]; omega: string[] };
}

// ── pool draw ──

// pools based on kickoff finishing order (1st = best)
// pool 6: 1st & 2nd, pool 5: 3rd & 4th, ..., pool 1: 11th & 12th
export function assignPools(kickoffSeeds: Array<{ teamId: string; seed: number }>): GroupTeam[] {
  const sorted = [...kickoffSeeds].sort((a, b) => a.seed - b.seed);
  return sorted.map((t, i) => ({
    teamId: t.teamId,
    pool: 6 - Math.floor(i / 2), // 6,6,5,5,4,4,3,3,2,2,1,1
    seed: t.seed,
  }));
}

// draw groups: one team from each pool (1-6) into each group = 6 per group
// pool 6 (top 2 seeds) get split first as group headers, then pools 5→1

export function drawGroups(
  rngSeed: string,
  pooledTeams: GroupTeam[],
  manualOverride?: { alpha: string[]; omega: string[] },
): [StageGroup, StageGroup] {
  if (manualOverride) {
    const alpha = manualOverride.alpha.map(id => pooledTeams.find(t => t.teamId === id)!).filter(Boolean);
    const omega = manualOverride.omega.map(id => pooledTeams.find(t => t.teamId === id)!).filter(Boolean);
    return [
      makeGroup('Alpha', alpha),
      makeGroup('Omega', omega),
    ];
  }

  const rng = createRNG(rngSeed);
  const pools: Record<number, GroupTeam[]> = {};
  for (const t of pooledTeams) {
    (pools[t.pool] ??= []).push(t);
  }

  const alpha: GroupTeam[] = [];
  const omega: GroupTeam[] = [];

  // draw one from each pool — randomize which goes to alpha vs omega
  for (let p = 6; p >= 1; p--) {
    const pool = pools[p] ?? [];
    shuffle(rng, pool);
    if (pool[0]) alpha.push(pool[0]);
    if (pool[1]) omega.push(pool[1]);
  }

  return [
    makeGroup('Alpha', alpha),
    makeGroup('Omega', omega),
  ];
}

function makeGroup(name: 'Alpha' | 'Omega', teams: GroupTeam[]): StageGroup {
  return {
    name,
    teams,
    standings: teams.map(t => ({
      teamId: t.teamId,
      wins: 0,
      losses: 0,
      mapWins: 0,
      mapLosses: 0,
      roundDifferential: 0,
    })),
    schedule: [],
  };
}

// ── round-robin schedule ──

// 6 teams, single round-robin = 15 matches
// spread across ~15 match days (2 matches per day = ~8 days, but we can be flexible)
export function generateGroupSchedule(
  rngSeed: string,
  group: StageGroup,
): GroupMatch[] {
  const rng = createRNG(rngSeed);
  const teamIds = group.teams.map(t => t.teamId);
  const n = teamIds.length;
  const matches: GroupMatch[] = [];

  // generate all pairings
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // randomize home/away
      if (rng() > 0.5) pairs.push([teamIds[i], teamIds[j]]);
      else pairs.push([teamIds[j], teamIds[i]]);
    }
  }

  shuffle(rng, pairs);

  // spread across match days — 1 match per day per group
  // both groups share the same day numbering (1 alpha + 1 omega per day = 15 days)
  for (let i = 0; i < pairs.length; i++) {
    matches.push({
      id: generateId(rng, 'gs_'),
      homeTeamId: pairs[i][0],
      awayTeamId: pairs[i][1],
      format: 'bo3',
      matchday: i + 1,
      played: false,
      result: null,
    });
  }

  return matches;
}

// ── standings update ──

export function updateGroupStandings(group: StageGroup, result: MatchResult): void {
  const home = group.standings.find(s => s.teamId === result.homeTeamId);
  const away = group.standings.find(s => s.teamId === result.awayTeamId);
  if (!home || !away) return;

  if (result.homeScore > result.awayScore) {
    home.wins++;
    away.losses++;
  } else {
    away.wins++;
    home.losses++;
  }

  home.mapWins += result.homeScore;
  home.mapLosses += result.awayScore;
  away.mapWins += result.awayScore;
  away.mapLosses += result.homeScore;

  const homeRounds = result.mapScores.reduce((sum, m) => sum + m.homeRounds, 0);
  const awayRounds = result.mapScores.reduce((sum, m) => sum + m.awayRounds, 0);
  home.roundDifferential += homeRounds - awayRounds;
  away.roundDifferential += awayRounds - homeRounds;
}

// ── tiebreaker with subgroup rule ──

interface TieContext {
  standings: StandingsEntry[];
  matches: MatchResult[]; // all completed group matches
}

// h2h match score between two teams (wins for teamA)
function h2hWins(matches: MatchResult[], a: string, b: string): number {
  let wins = 0;
  for (const m of matches) {
    if (m.homeTeamId === a && m.awayTeamId === b && m.homeScore > m.awayScore) wins++;
    if (m.awayTeamId === a && m.homeTeamId === b && m.awayScore > m.homeScore) wins++;
  }
  return wins;
}

// h2h map differential for a set of teams (only matches among them)
function h2hMapDiff(matches: MatchResult[], teamId: string, group: string[]): number {
  let diff = 0;
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    const isAway = m.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const opponent = isHome ? m.awayTeamId : m.homeTeamId;
    if (!group.includes(opponent)) continue;
    diff += isHome ? (m.homeScore - m.awayScore) : (m.awayScore - m.homeScore);
  }
  return diff;
}

// h2h round differential for a set of teams
function h2hRoundDiff(matches: MatchResult[], teamId: string, group: string[]): number {
  let diff = 0;
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    const isAway = m.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const opponent = isHome ? m.awayTeamId : m.homeTeamId;
    if (!group.includes(opponent)) continue;
    for (const map of m.mapScores) {
      diff += isHome ? (map.homeRounds - map.awayRounds) : (map.awayRounds - map.homeRounds);
    }
  }
  return diff;
}

// overall map differential
function overallMapDiff(entry: StandingsEntry): number {
  return entry.mapWins - entry.mapLosses;
}

// resolve tiebreaker for a tied group of teams, returns them in ranked order
// implements the full subgroup tie-breaker rule from VCT
function resolveTiedGroup(
  tiedIds: string[],
  ctx: TieContext,
): string[] {
  if (tiedIds.length <= 1) return tiedIds;

  // 2-team tie: simple h2h
  if (tiedIds.length === 2) {
    return resolveTwoWayTie(tiedIds[0], tiedIds[1], ctx);
  }

  // 3+ team tie: subgroup rule
  return resolveMultiWayTie(tiedIds, ctx);
}

function resolveTwoWayTie(a: string, b: string, ctx: TieContext): string[] {
  const ids = [a, b];

  // 1. h2h match score
  const aWins = h2hWins(ctx.matches, a, b);
  const bWins = h2hWins(ctx.matches, b, a);
  if (aWins !== bWins) return aWins > bWins ? [a, b] : [b, a];

  // 2. h2h map differential
  const aMapDiff = h2hMapDiff(ctx.matches, a, ids);
  const bMapDiff = h2hMapDiff(ctx.matches, b, ids);
  if (aMapDiff !== bMapDiff) return aMapDiff > bMapDiff ? [a, b] : [b, a];

  // 3. h2h round differential
  const aRdDiff = h2hRoundDiff(ctx.matches, a, ids);
  const bRdDiff = h2hRoundDiff(ctx.matches, b, ids);
  if (aRdDiff !== bRdDiff) return aRdDiff > bRdDiff ? [a, b] : [b, a];

  // 4. overall map differential
  const aEntry = ctx.standings.find(s => s.teamId === a)!;
  const bEntry = ctx.standings.find(s => s.teamId === b)!;
  const aOvr = overallMapDiff(aEntry);
  const bOvr = overallMapDiff(bEntry);
  if (aOvr !== bOvr) return aOvr > bOvr ? [a, b] : [b, a];

  // 5. overall round differential
  if (aEntry.roundDifferential !== bEntry.roundDifferential) {
    return aEntry.roundDifferential > bEntry.roundDifferential ? [a, b] : [b, a];
  }

  // still tied — fallback to original seed order
  return [a, b];
}

function resolveMultiWayTie(tiedIds: string[], ctx: TieContext): string[] {
  // criteria applied in order, with subgroup splitting
  type CriterionFn = (id: string) => number;

  const criteria: CriterionFn[] = [
    // 1. h2h match score (wins among tied group)
    (id) => {
      let w = 0;
      for (const opp of tiedIds) {
        if (opp === id) continue;
        w += h2hWins(ctx.matches, id, opp);
      }
      return w;
    },
    // 2. h2h map differential
    (id) => h2hMapDiff(ctx.matches, id, tiedIds),
    // 3. h2h round differential
    (id) => h2hRoundDiff(ctx.matches, id, tiedIds),
    // 4. overall map differential
    (id) => {
      const e = ctx.standings.find(s => s.teamId === id)!;
      return overallMapDiff(e);
    },
    // 5. overall round differential
    (id) => {
      const e = ctx.standings.find(s => s.teamId === id)!;
      return e.roundDifferential;
    },
  ];

  return applySubgroupRule(tiedIds, ctx, criteria, 0);
}

// recursive subgroup splitting
function applySubgroupRule(
  ids: string[],
  ctx: TieContext,
  criteria: Array<(id: string) => number>,
  criterionIdx: number,
): string[] {
  if (ids.length <= 1) return ids;
  if (criterionIdx >= criteria.length) return ids; // exhausted all criteria

  const fn = criteria[criterionIdx];
  const scored = ids.map(id => ({ id, val: fn(id) }));
  scored.sort((a, b) => b.val - a.val); // descending

  // try to split into subgroups by this criterion
  const groups: string[][] = [];
  let cur = [scored[0].id];
  for (let i = 1; i < scored.length; i++) {
    if (scored[i].val === scored[i - 1].val) {
      cur.push(scored[i].id);
    } else {
      groups.push(cur);
      cur = [scored[i].id];
    }
  }
  groups.push(cur);

  // if no split happened (everyone same value), move to next criterion
  if (groups.length === 1) {
    return applySubgroupRule(ids, ctx, criteria, criterionIdx + 1);
  }

  // split happened — resolve each subgroup from the beginning
  const result: string[] = [];
  for (const sub of groups) {
    if (sub.length === 1) {
      result.push(sub[0]);
    } else {
      // restart tiebreaker from criterion 0 for this subgroup
      result.push(...resolveTiedGroup(sub, ctx));
    }
  }
  return result;
}

// ── public: sort group standings with full tiebreaker ──

export function sortGroupStandings(group: StageGroup): StandingsEntry[] {
  const matches = group.schedule.filter(m => m.played && m.result).map(m => m.result!);
  const ctx: TieContext = { standings: group.standings, matches };

  // first pass: group by wins
  const byWins: Record<number, string[]> = {};
  for (const e of group.standings) {
    (byWins[e.wins] ??= []).push(e.teamId);
  }

  // sort win groups descending
  const winCounts = Object.keys(byWins).map(Number).sort((a, b) => b - a);

  const ranked: string[] = [];
  for (const w of winCounts) {
    const tied = byWins[w];
    if (tied.length === 1) {
      ranked.push(tied[0]);
    } else {
      ranked.push(...resolveTiedGroup(tied, ctx));
    }
  }

  // return standings in ranked order
  return ranked.map(id => group.standings.find(s => s.teamId === id)!);
}

// ── helpers ──

export function isGroupStageComplete(gs: GroupStage): boolean {
  return gs.groups.every(g => g.schedule.every(m => m.played));
}

export function getNextUnplayedMatch(gs: GroupStage): { groupIdx: number; match: GroupMatch } | null {
  for (let gi = 0; gi < gs.groups.length; gi++) {
    const group = gs.groups[gi];
    const match = group.schedule.find(m => !m.played);
    if (match) return { groupIdx: gi, match };
  }
  return null;
}

// returns all matches for a given matchday across both groups
export function getMatchdayMatches(gs: GroupStage): GroupMatch[] {
  const day = gs.currentMatchday;
  return [
    ...gs.groups[0].schedule.filter(m => m.matchday === day),
    ...gs.groups[1].schedule.filter(m => m.matchday === day),
  ];
}

// get qualified teams for playoffs: top 4 from each group
export function getPlayoffQualifiers(gs: GroupStage): {
  alpha: StandingsEntry[];
  omega: StandingsEntry[];
} {
  return {
    alpha: sortGroupStandings(gs.groups[0]).slice(0, 4),
    omega: sortGroupStandings(gs.groups[1]).slice(0, 4),
  };
}

// ── group stage factory ──

export function generateGroupStage(
  rngSeed: string,
  region: Region,
  kickoffSeeds: Array<{ teamId: string; seed: number }>,
  manualOverride?: { alpha: string[]; omega: string[] },
): GroupStage {
  const pooled = assignPools(kickoffSeeds);
  const [alpha, omega] = drawGroups(rngSeed, pooled, manualOverride);

  alpha.schedule = generateGroupSchedule(`${rngSeed}-alpha`, alpha);
  omega.schedule = generateGroupSchedule(`${rngSeed}-omega`, omega);

  return {
    region,
    groups: [alpha, omega],
    currentMatchday: 1,
    complete: false,
    manualGroups: manualOverride,
  };
}

// can only edit groups before any matches are played
export function canEditGroups(gs: GroupStage): boolean {
  return gs.groups.every(g => g.schedule.every(m => !m.played));
}

// swap a team from one group to another, picking a team from the target group to swap back
// returns true if swap succeeded
export function swapTeamBetweenGroups(
  gs: GroupStage,
  teamId: string,
  targetTeamId: string,
  rngSeed: string,
): boolean {
  if (!canEditGroups(gs)) return false;

  const srcIdx = gs.groups.findIndex(g => g.teams.some(t => t.teamId === teamId));
  const dstIdx = gs.groups.findIndex(g => g.teams.some(t => t.teamId === targetTeamId));
  if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx) return false;

  const src = gs.groups[srcIdx];
  const dst = gs.groups[dstIdx];

  const srcTeamIdx = src.teams.findIndex(t => t.teamId === teamId);
  const dstTeamIdx = dst.teams.findIndex(t => t.teamId === targetTeamId);

  // swap the team entries
  const tmp = src.teams[srcTeamIdx];
  src.teams[srcTeamIdx] = dst.teams[dstTeamIdx];
  dst.teams[dstTeamIdx] = tmp;

  // swap standings entries too
  const srcStIdx = src.standings.findIndex(s => s.teamId === teamId);
  const dstStIdx = dst.standings.findIndex(s => s.teamId === targetTeamId);
  const tmpSt = src.standings[srcStIdx];
  src.standings[srcStIdx] = dst.standings[dstStIdx];
  dst.standings[dstStIdx] = tmpSt;

  // regenerate schedules
  src.schedule = generateGroupSchedule(`${rngSeed}-${src.name.toLowerCase()}`, src);
  dst.schedule = generateGroupSchedule(`${rngSeed}-${dst.name.toLowerCase()}`, dst);

  // update manual override
  gs.manualGroups = {
    alpha: gs.groups[0].teams.map(t => t.teamId),
    omega: gs.groups[1].teams.map(t => t.teamId),
  };

  return true;
}
