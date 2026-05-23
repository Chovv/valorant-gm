// src/sim/offseasonChurn.ts
// ai roster churn during offseason: releases underperformers, fills role gaps from FA pool

import type { Team, Player, Role, Region } from '../types';
import type { StartingSlot } from '../types/roster';
import type { KickoffBracket } from './kickoffBracket';
import type { InternationalTournament } from './gameState';
import { calculateTeamAttributes, staffFromTeam } from './teamRatings';
import { findBestIGL } from './rosterManagement';
import { createRNG } from '../utils/random';
import { getLanguageGroup, langScoreForLang, type LanguageGroup } from '../utils/languageGroups';

export interface ChurnEvent {
  type: 'release' | 'signing';
  teamId: string;
  teamName: string;
  teamRegion: string;
  playerId: string;
  playerName: string;
  role: Role;
  overall: number;
  playerAge?: number;
  source?: 'free_agent' | 'bench_promotion'; // only on signing events
  reason?: string;
}

// 0 = qualified/champions, 1 = decent run, 2 = average, 3 = early exit
function getTeamTier(
  teamId: string,
  kickoffBrackets: Record<Region, KickoffBracket | null>,
  intl: InternationalTournament | null,
): number {
  if (intl?.champion === teamId) return 0;
  for (const bracket of Object.values(kickoffBrackets)) {
    if (!bracket) continue;
    if (bracket.qualifiers.some(q => q.teamId === teamId)) return 0;
  }
  if (intl?.teams.some(t => t.teamId === teamId)) return 1;

  for (const bracket of Object.values(kickoffBrackets)) {
    if (!bracket) continue;
    const allRounds = [...bracket.upper, ...bracket.middle, ...bracket.lower];
    let maxWin = -1;
    for (let i = 0; i < allRounds.length; i++) {
      for (const m of allRounds[i].matchups) {
        if (m.winnerId === teamId) maxWin = Math.max(maxWin, i);
      }
    }
    if (maxWin >= 2) return 1;
    if (maxWin >= 0) return 2;
    const appeared = allRounds.some(r => r.matchups.some(m => m.team1Id === teamId || m.team2Id === teamId));
    if (appeared) return 3;
  }
  return 2;
}

export interface ChurnConfig {
  releaseScoreCeiling: number;  // max score that can be released (0-100), default 50
  sameRegionWeight: number;     // affinity multiplier for same-region (0-1), default 1.0
  crossRegionWeight: number;    // affinity multiplier for cross-region (0-1), default 0.25
  tier1Quota: number;           // releases for decent-run teams, default 0
  tier2Quota: number;           // releases for average teams, default 1
  tier3Quota: number;           // releases for early-exit teams, default 1
}

export const DEFAULT_CHURN_CONFIG: ChurnConfig = {
  releaseScoreCeiling: 50,
  sameRegionWeight: 1.0,
  crossRegionWeight: 0.25,
  tier1Quota: 0,
  tier2Quota: 1,
  tier3Quota: 1,
};

function releaseQuota(tier: number, cfg: ChurnConfig): number {
  if (tier === 0) return 0;
  if (tier === 1) return cfg.tier1Quota;
  if (tier === 2) return cfg.tier2Quota;
  return cfg.tier3Quota;
}

// only release players who are genuinely struggling — protects average players

// nationality codes that belong to each region — used to derive a player's home region
const REGION_NATIONALITIES: Record<string, string[]> = {
  americas: ['BR', 'US', 'CL', 'AR', 'MX', 'CA', 'CO', 'PE', 'UY', 'PR', 'VE', 'EC', 'BO'],
  emea: ['TR', 'RU', 'SE', 'FR', 'FI', 'ES', 'DE', 'PL', 'UA', 'DK', 'CZ', 'IL', 'GB', 'LV', 'GE', 'KZ', 'MA', 'IT', 'PT', 'BA', 'RS', 'LT', 'NL', 'BE', 'NO', 'RO', 'HR', 'BG', 'SK', 'HU'],
  pacific: ['KR', 'JP', 'PH', 'ID', 'TH', 'SG', 'MY', 'VN', 'TW', 'HK', 'AU', 'NZ', 'MN'],
  china: ['CN'],
};

function natToRegion(nat: string | undefined): Region | null {
  if (!nat) return null;
  for (const [r, codes] of Object.entries(REGION_NATIONALITIES)) {
    if (codes.includes(nat)) return r as Region;
  }
  return null;
}

// region fallback langs for when roster is too mixed to determine majority
const REGION_FALLBACK_LANG: Record<Region, LanguageGroup> = {
  americas: 'portuguese',
  emea: 'other',
  pacific: 'korean',
  china: 'chinese',
};

// derive a team's anchored home language — uses stored value if already set,
// otherwise computes from starting roster majority and caches it on the team
function homeLangForTeam(team: Team): LanguageGroup {
  if (team.homeLang) return team.homeLang;
  const freq = new Map<LanguageGroup, number>();
  for (const p of getStarters(team)) {
    const g = getLanguageGroup(p.nationality);
    freq.set(g, (freq.get(g) ?? 0) + 1);
  }
  let best: LanguageGroup = REGION_FALLBACK_LANG[team.region];
  let max = 0;
  for (const [g, n] of freq) { if (n > max) { max = n; best = g; } }
  // only trust the majority if at least 2 starters share it — avoids noise on thin rosters
  const homeLang = max >= 2 ? best : REGION_FALLBACK_LANG[team.region];
  team.homeLang = homeLang; // cache so it doesn't drift next season
  return homeLang;
}

// max barrier-language players allowed in the starting 5
const FOREIGNER_LIMIT = 1;

function countForeigners(team: Team): number {
  const hl = homeLangForTeam(team);
  return getStarters(team).filter(p => langScoreForLang(p.nationality, hl) < 0.2).length;
}

function scorePlayer(player: Player): number {
  const stats = player.careerStats;
  if (!stats || stats.totalMaps === 0) return player.overall * 0.85;
  const perfWeight = Math.min(0.75, stats.totalMaps * 0.06);
  const potWeight = 1 - perfWeight;
  const acsScore = Math.min(100, Math.max(0, ((stats.avgACS - 100) / 200) * 100));
  const kdScore  = Math.min(100, Math.max(0, (stats.avgKD - 0.5) * 66.67));
  const winScore = stats.totalMatches > 0 ? (stats.matchWins / stats.totalMatches) * 100 : 50;
  const perf = acsScore * 0.45 + kdScore * 0.35 + winScore * 0.20;
  const ageFactor = player.age <= 20 ? 1.0 : player.age <= 23 ? 0.85 : 0.65;
  const potential = player.potential.ceiling * ageFactor;
  return perf * perfWeight + potential * potWeight;
}

function isProtectedProspect(player: Player): boolean {
  return player.age <= 21 && player.potential.ceiling >= 85;
}

// prospect threshold for bypassing the signing floor during FA evaluation
function isProspect(p: Player): boolean {
  return p.age <= 21 && p.potential.ceiling >= 83;
}

// true if player has peaked and is trending down — makes them less attractive signings
function isDeclining(p: Player): boolean {
  return p.age > 27 && (p.potential.ceiling - p.overall) < 5;
}

// minimum OVR a team will accept, based on current starter quality + tier
// prospects bypass this entirely
function signingFloor(team: Team, tier: number): number {
  const starters = getStarters(team);
  const avgOvr = starters.length > 0
    ? starters.reduce((s, p) => s + p.overall, 0) / starters.length
    : 72;
  // tier 0/1 teams are selective, tier 3 are desperate
  const tierOffset = tier <= 1 ? -5 : tier === 2 ? -8 : -11;
  return Math.max(68, Math.round(avgOvr + tierOffset));
}

function getStarters(team: Team): Player[] {
  const slots: StartingSlot[] = team.startingLineup
    || team.roster.slice(0, 5).map(p => ({ playerId: p.id, assignedRole: p.role }));
  return slots.map(s => team.roster.find(p => p.id === s.playerId)).filter((p): p is Player => !!p);
}

function rebuildLineup(roster: Player[]): StartingSlot[] {
  const coreRoles: Role[] = ['duelist', 'controller', 'initiator', 'sentinel'];
  const used = new Set<string>();
  const slots: StartingSlot[] = [];
  // pass 1: fill core roles with natural-role players
  for (const role of coreRoles) {
    const best = roster.filter(p => !used.has(p.id) && p.role === role).sort((a, b) => b.overall - a.overall)[0];
    if (best) { slots.push({ playerId: best.id, assignedRole: role }); used.add(best.id); }
  }
  // pass 2: fill remaining core roles with flex players (covers the missing-role debuff case)
  for (const role of coreRoles) {
    if (slots.some(s => s.assignedRole === role)) continue;
    const bestFlex = roster.filter(p => !used.has(p.id) && p.role === 'flex').sort((a, b) => b.overall - a.overall)[0];
    if (bestFlex) { slots.push({ playerId: bestFlex.id, assignedRole: role }); used.add(bestFlex.id); }
  }
  // fill remaining slots up to 5 from whoever is left, best OVR first
  const remaining = roster.filter(p => !used.has(p.id)).sort((a, b) => b.overall - a.overall);
  for (const p of remaining) {
    if (slots.length >= 5) break;
    slots.push({ playerId: p.id, assignedRole: p.role });
    used.add(p.id);
  }
  return slots;
}

function missingRoles(team: Team): Role[] {
  const slots: StartingSlot[] = team.startingLineup
    || team.roster.slice(0, 5).map(p => ({ playerId: p.id, assignedRole: p.role }));
  const rosterIds = new Set(team.roster.map(p => p.id));
  // use assignedRole so flex-as-core assignments are respected
  const covered = new Set(slots.filter(s => rosterIds.has(s.playerId)).map(s => s.assignedRole));
  return (['duelist', 'controller', 'initiator', 'sentinel'] as Role[]).filter(r => !covered.has(r));
}

export interface ChurnResult {
  updatedTeams: Team[];
  updatedFreeAgents: Player[];
  events: ChurnEvent[];
}

export function runOffseasonChurn(
  teams: Team[],
  freeAgents: Player[],
  kickoffBrackets: Record<Region, KickoffBracket | null>,
  intl: InternationalTournament | null,
  userTeamId: string | null,
  seasonSeed: string,
  config: ChurnConfig = DEFAULT_CHURN_CONFIG,
): ChurnResult {
  createRNG(`${seasonSeed}-offseason-churn`);
  const cfg = { ...DEFAULT_CHURN_CONFIG, ...config };
  const events: ChurnEvent[] = [];
  const teamMap = new Map(teams.map(t => ({ ...t, roster: [...t.roster] })).map(t => [t.id, t]));

  // anchor home language for every team before roster moves begin
  for (const team of teamMap.values()) homeLangForTeam(team);

  // regional FA pools — released players stay in their team's region pool first
  const regionalPools: Record<Region, Player[]> = { americas: [], emea: [], pacific: [], china: [] };
  for (const p of freeAgents) {
    const r = natToRegion(p.nationality);
    if (r) regionalPools[r].push({ ...p });
    else regionalPools.americas.push({ ...p }); // untagged goes to americas as catch-all
  }

  // snapshot starter IDs before any releases — used to detect bench promotions later
  const startersBefore = new Map<string, Set<string>>();
  for (const team of teamMap.values()) {
    startersBefore.set(team.id, new Set(getStarters(team).map(p => p.id)));
  }

  // track which team each released player came from — prevents re-signing by former team
  const releasedFrom = new Map<string, string>(); // playerId → teamId
  const teamTier = new Map<string, number>();       // teamId → tier (for signing floor)
  const minReleasedOvr = new Map<string, number>(); // teamId → lowest released OVR

  // pass 1: releases
  for (const team of teamMap.values()) {
    if (team.id === userTeamId) continue;
    const tier = getTeamTier(team.id, kickoffBrackets, intl);
    teamTier.set(team.id, tier);
    const quota = releaseQuota(tier, cfg);
    if (quota === 0) continue;

    const scored = getStarters(team)
      .map(p => ({ player: p, score: scorePlayer(p) }))
      .sort((a, b) => a.score - b.score);

    let released = 0;
    for (const { player, score } of scored) {
      if (released >= quota) break;
      // top teams can cut adequate players if an upgrade exists — ceiling loosens by tier
      const releaseCeiling = tier <= 0 ? 60 : tier === 1 ? 55 : cfg.releaseScoreCeiling;
      if (score >= releaseCeiling) break;
      if (isProtectedProspect(player)) continue;
      // check replacement exists in this team's regional pool before releasing
      const pool = regionalPools[team.region];
      if (!pool.some(fa => fa.role === player.role || fa.role === 'flex')) continue;
      team.roster = team.roster.filter(p => p.id !== player.id);
      // released player goes back into their home region pool
      const homeRegion = natToRegion(player.nationality) ?? team.region;
      regionalPools[homeRegion].push({ ...player, contract: null });
      releasedFrom.set(player.id, team.id);
      // track the lowest OVR released so we don't sign someone worse
      const prev = minReleasedOvr.get(team.id) ?? 999;
      minReleasedOvr.set(team.id, Math.min(prev, player.overall));
      released++;
      events.push({
        type: 'release', teamId: team.id, teamName: team.name, teamRegion: team.region,
        playerId: player.id, playerName: player.name, role: player.role, overall: player.overall, playerAge: player.age,
        reason: score < 40 ? 'poor performance' : 'roster restructure',
      });
    }
    team.attributes = calculateTeamAttributes(team.roster, team.startingLineup, team.staff.headCoach?.rating, team.staff.headCoach?.specialty, staffFromTeam(team.staff));
  }

  // pick best FA from a pool for a given role + team, respecting foreigner cap + quality floors
  function pickFA(pool: Player[], role: Role, team: Team): Player | undefined {
    const hl = homeLangForTeam(team);
    const foreignersUsed = countForeigners(team);
    const tier = teamTier.get(team.id) ?? 2;
    const floor = signingFloor(team, tier);
    const floorForTeam = minReleasedOvr.has(team.id)
      ? Math.max(floor, minReleasedOvr.get(team.id)! - 3)
      : floor;
    const roleBump = (p: Player) => p.role === role ? 1.15 : 1.0;
    // tier 3 teams are most hungry for prospects, tier 0 least
    const tierProspectMult = tier <= 0 ? 0.8 : tier === 1 ? 1.0 : tier === 2 ? 1.2 : 1.4;
    return pool
      .filter(fa =>
        (fa.role === role || fa.role === 'flex') &&
        releasedFrom.get(fa.id) !== team.id &&
        (langScoreForLang(fa.nationality, hl) >= 0.2 || foreignersUsed < FOREIGNER_LIMIT) &&
        (isProspect(fa) || fa.overall >= floorForTeam)
      )
      .sort((a, b) => {
        const declinePenalty = (p: Player) => isDeclining(p) ? 0.72 : 1.0;
        const prospectBonus = (p: Player) => isProspect(p)
          ? 1.0 + (p.potential.ceiling - p.overall) * 0.02 * tierProspectMult
          : 1.0;
        const aScore = a.overall * langScoreForLang(a.nationality, hl) * roleBump(a) * declinePenalty(a) * prospectBonus(a);
        const bScore = b.overall * langScoreForLang(b.nationality, hl) * roleBump(b) * declinePenalty(b) * prospectBonus(b);
        return bScore - aScore;
      })[0];
  }

  function consumeFA(pick: Player, region: Region) {
    for (const r of Object.keys(regionalPools) as Region[]) {
      regionalPools[r] = regionalPools[r].filter(fa => fa.id !== pick.id);
    }
  }

  // pass 2: fill vacancies — try same-region pool first, spill outward if dry
  for (const team of teamMap.values()) {
    if (team.id === userTeamId) continue;
    const prevStarters2 = startersBefore.get(team.id) ?? new Set<string>();
    const tier = teamTier.get(team.id) ?? 2;
    const floor = signingFloor(team, tier);
    for (const role of missingRoles(team)) {
      // bench player must be above the signing floor to be considered start-worthy
      const benchCanCover = team.roster.some(p =>
        !prevStarters2.has(p.id) &&
        (p.role === role || p.role === 'flex') &&
        p.overall >= floor
      );
      if (benchCanCover) continue;

      const regionOrder: Region[] = [
        team.region,
        ...(['americas', 'emea', 'pacific', 'china'] as Region[]).filter(r => r !== team.region),
      ];
      let pick: Player | undefined;
      let pickRegion: Region = team.region;
      for (const r of regionOrder) {
        pick = pickFA(regionalPools[r], role, team);
        if (pick) { pickRegion = r; break; }
      }
      if (!pick) continue;

      // sanity: would this FA actually start? prospects only bypass if the team has a genuine vacancy
      const hypotheticalRoster = [...team.roster, pick];
      const hypotheticalLineup = rebuildLineup(hypotheticalRoster);
      const wouldStart = hypotheticalLineup.some(s => s.playerId === pick!.id);
      const hasVacancy = getStarters(team).length < 5;
      if (!wouldStart && !(isProspect(pick) && hasVacancy)) continue;

      consumeFA(pick, pickRegion);
      team.roster.push({ ...pick, contract: { salary: estimateSalary(pick.overall), yearsRemaining: 1, teamOption: false, playerOption: false } });
      events.push({ type: 'signing', teamId: team.id, teamName: team.name, teamRegion: team.region, playerId: pick.id, playerName: pick.name, role: pick.role, overall: pick.overall, playerAge: pick.age, source: 'free_agent' });
    }
    team.attributes = calculateTeamAttributes(team.roster, team.startingLineup, team.staff.headCoach?.rating, team.staff.headCoach?.specialty, staffFromTeam(team.staff));
  }

  // pass 2c: emergency fill — team still under 5, use affinity scoring across all pools
  for (const team of teamMap.values()) {
    if (team.id === userTeamId) continue;
    while (team.roster.length < 5) {
      const coveredRoles = new Set(team.roster.map(p => p.role));
      const neededRoles: Role[] = (['duelist', 'controller', 'initiator', 'sentinel'] as Role[]).filter(r => !coveredRoles.has(r));
      const hl = homeLangForTeam(team);
      const allRemaining = (Object.entries(regionalPools) as [Region, Player[]][])
        .flatMap(([r, pool]) => pool.map(p => ({ p, r: r as Region })));
      const best = allRemaining
        .filter(({ p }) => releasedFrom.get(p.id) !== team.id)
        .sort((a, b) => {
          const declinePenalty = (p: Player) => isDeclining(p) ? 0.72 : 1.0;
          const prospectBonus = (p: Player) => isProspect(p) ? 1.0 + (p.potential.ceiling - p.overall) * 0.02 : 1.0;
          const aScore = a.p.overall * langScoreForLang(a.p.nationality, hl) * (neededRoles.includes(a.p.role) ? 1.1 : 1.0) * declinePenalty(a.p) * prospectBonus(a.p);
          const bScore = b.p.overall * langScoreForLang(b.p.nationality, hl) * (neededRoles.includes(b.p.role) ? 1.1 : 1.0) * declinePenalty(b.p) * prospectBonus(b.p);
          return bScore - aScore;
        })[0];
      if (!best) break;
      consumeFA(best.p, best.r);
      team.roster.push({ ...best.p, contract: { salary: estimateSalary(best.p.overall), yearsRemaining: 1, teamOption: false, playerOption: false } });
      events.push({ type: 'signing', teamId: team.id, teamName: team.name, teamRegion: team.region, playerId: best.p.id, playerName: best.p.name, role: best.p.role, overall: best.p.overall, playerAge: best.p.age, source: 'free_agent' });
    }
    team.attributes = calculateTeamAttributes(team.roster, team.startingLineup, team.staff.headCoach?.rating, team.staff.headCoach?.specialty, staffFromTeam(team.staff));
  }

  // bench promotion events — emit before pass 3 so news feed shows them
  for (const team of teamMap.values()) {
    if (team.id === userTeamId) continue;
    const prevStarters = startersBefore.get(team.id) ?? new Set<string>();
    const releasedRoles = new Set(
      events.filter(e => e.type === 'release' && e.teamId === team.id).map(e => e.role)
    );
    const alreadySigned = new Set(
      events.filter(e => e.type === 'signing' && e.teamId === team.id).map(e => e.playerId)
    );
    for (const role of releasedRoles) {
      if (events.some(e => e.type === 'signing' && e.teamId === team.id && e.role === role)) continue;
      const promotion = team.roster
        .filter(p => !prevStarters.has(p.id) && !alreadySigned.has(p.id) && (p.role === role || p.role === 'flex'))
        .sort((a, b) => b.overall - a.overall)[0];
      if (!promotion) continue;
      events.push({ type: 'signing', teamId: team.id, teamName: team.name, teamRegion: team.region, playerId: promotion.id, playerName: promotion.name, role: promotion.role, overall: promotion.overall, playerAge: promotion.age, source: 'bench_promotion' });
    }
  }

  // pass 3: rebuild lineups + re-assign IGL if needed
  for (const team of teamMap.values()) {
    if (team.id === userTeamId) continue;
    team.startingLineup = rebuildLineup(team.roster);
    if (!team.iglId || !team.roster.some(p => p.id === team.iglId)) {
      const starters = team.startingLineup.map(s => team.roster.find(p => p.id === s.playerId)).filter((p): p is Player => !!p);
      team.iglId = findBestIGL(starters);
    }
    const iglInLineup = team.startingLineup.some(s => s.playerId === team.iglId);
    if (!iglInLineup && team.iglId) {
      const igl = team.roster.find(p => p.id === team.iglId);
      if (igl) {
        const sameRoleSlots = team.startingLineup
          .map((s, i) => ({ s, i, p: team.roster.find(p => p.id === s.playerId) }))
          .filter(x => x.p?.role === igl.role || x.p?.role === 'flex' || igl.role === 'flex');
        const weakest = sameRoleSlots.sort((a, b) => (a.p?.overall ?? 0) - (b.p?.overall ?? 0))[0]
          ?? team.startingLineup.map((s, i) => ({ s, i, p: team.roster.find(p => p.id === s.playerId) }))
              .sort((a, b) => (a.p?.overall ?? 0) - (b.p?.overall ?? 0))[0];
        if (weakest) team.startingLineup[weakest.i] = { playerId: igl.id, assignedRole: igl.role };
      }
    }
    if (!team.startingLineup.some(s => s.playerId === team.iglId)) {
      const starters = team.startingLineup.map(s => team.roster.find(p => p.id === s.playerId)).filter((p): p is Player => !!p);
      team.iglId = findBestIGL(starters);
    }
  }

  const updatedFreeAgents = (Object.values(regionalPools) as Player[][]).flat();
  return { updatedTeams: [...teamMap.values()], updatedFreeAgents, events };
}

function estimateSalary(overall: number): number {
  if (overall >= 90) return 500000;
  if (overall >= 85) return 350000;
  if (overall >= 80) return 200000;
  if (overall >= 75) return 120000;
  if (overall >= 70) return 80000;
  if (overall >= 65) return 60000;
  return 50000;
}

export function auditRosterCoverage(teams: Team[]): Array<{ teamId: string; teamName: string; missing: Role[] }> {
  return teams.map(t => ({ teamId: t.id, teamName: t.name, missing: missingRoles(t) })).filter(x => x.missing.length > 0);
}
