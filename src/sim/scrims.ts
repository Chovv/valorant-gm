// src/sim/scrims.ts
// Scrim system logic for player development

import type { Team, Player, Ratings, Region, Role, AgentPool } from '../types';
import type { RNG } from '../utils/random';
import { coachMod, specMod } from './coachBonus';
import type { ScrimResult, ScrimStatChange, SeasonStartStats, FatigueLevel, Tier2Team } from '../types/scrims';
import { getFatigueLevel } from '../types/scrims';
import { simulateMatch } from './matchSim';
import { generatePlayer } from './playerGenerator';
import { calculateTeamAttributes } from './teamRatings';
import { getAgentsForRole } from '../data/agents';

/**
 * Generate a proper agent pool with exactly one of each priority (1, 2, 3)
 * for a given role
 */
function generateAgentPool(rng: RNG, role: Role, disabledAgents?: string[]): AgentPool {
  let availableAgents = getAgentsForRole(role);
  if (disabledAgents?.length) {
    const disabledSet = new Set(disabledAgents);
    const filtered = availableAgents.filter(a => !disabledSet.has(a));
    if (filtered.length >= 3) availableAgents = filtered; // only filter if enough remain
  }
  
  // Shuffle agents
  const shuffled = [...availableAgents].sort(() => rng() - 0.5);
  
  // Assign priorities: 1 (main), 2 (secondary), 3 (pocket)
  const pool: AgentPool = {};
  if (shuffled.length >= 1) pool[shuffled[0]] = 1; // Main
  if (shuffled.length >= 2) pool[shuffled[1]] = 2; // Secondary
  if (shuffled.length >= 3) pool[shuffled[2]] = 3; // Pocket
  
  return pool;
}

/**
 * Generate a full Player object for an academy team
 * with specified name, role, and overall
 */
export function generateAcademyPlayer(
  rng: RNG, 
  name: string, 
  role: Role, 
  overall: number,
  teamAbbr: string,
  index: number
): Player {
  // Generate base player with the specified role and overall
  const player = generatePlayer(rng, {
    role,
    forceOverall: overall,
  });
  
  // Override with custom values
  player.id = `t2_${teamAbbr.toLowerCase()}_p${index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  player.name = name;
  player.overall = overall;
  
  // Generate proper agent pool (1, 2, 3 priorities)
  player.agentPool = generateAgentPool(rng, role);
  
  return player;
}

/**
 * Generate a full roster for a Tier 2 team
 * Used when creating default academy teams
 */
export function generateAcademyRoster(
  rng: RNG,
  teamAbbr: string,
  averageOVR: number,
  playerNames?: string[]
): Player[] {
  const roles: Role[] = ['duelist', 'initiator', 'controller', 'sentinel', 'flex'];
  const defaultNames = ['Ace', 'Blaze', 'Cipher', 'Dash', 'Echo'];
  const names = playerNames || defaultNames;
  
  return roles.map((role, idx) => {
    // Vary OVR around average (-3 to +3)
    const variance = Math.floor((rng() - 0.5) * 6);
    const playerOvr = Math.max(40, Math.min(99, averageOVR + variance));
    
    return generateAcademyPlayer(
      rng,
      names[idx] || `Player ${idx + 1}`,
      role,
      playerOvr,
      teamAbbr,
      idx
    );
  });
}

/**
 * Create a temporary team object for scrim opponents
 */
function createTempTeam(id: string, name: string, region: Region, roster: Player[]): Team {
  return {
    id,
    name,
    abbreviation: name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4),
    logo: '/logos/placeholder.png',
    region,
    roster,
    iglId: roster[0]?.id || null,
    staff: { headCoach: null, assistantCoach: null, analyst: null },
    finances: { budget: 500000, salaryCommitted: 250000, scoutingBudget: 25 },
    attributes: calculateTeamAttributes(roster),
    championships: 0,
    playoffAppearances: 0,
    founded: 2020,
  };
}

/**
 * Configuration for scrim stat changes
 */
const SCRIM_CONFIG = {
  // Base chance for any stat change per player (30-35%)
  BASE_CHANGE_CHANCE: 0.32,
  
  // Magnitude of changes
  MIN_CHANGE: 2,
  MAX_CHANGE: 3, // For high volatility players
  
  // Learning rate multiplier (how much LR affects change chance)
  LEARNING_RATE_MULTIPLIER: 0.4,
  
  // Volatility multiplier (how much volatility affects change magnitude)
  VOLATILITY_MULTIPLIER: 1.5,
  
  // IGL bonus to positive outcome ratio
  IGL_GAME_SENSE_BASELINE: 70,
  IGL_POSITIVE_RATIO_BOOST: 0.004, // Per point above baseline
  
  // Fatigue penalties
  FATIGUE_NEGATIVE_BOOST: {
    fresh: 0,
    trained: 0.05,
    tired: 0.15,
    exhausted: 0.30, // +30% chance of negative outcomes when exhausted
  } as Record<FatigueLevel, number>,
  
  // Chance to affect potential (rarer than ratings)
  POTENTIAL_CHANGE_CHANCE: 0.08,
  
  // Chance for direct OVR change (on top of stat recalculation)
  DIRECT_OVR_CHANGE_CHANCE: 0.15,
  
  // Stats that can change
  CHANGEABLE_STATS: ['aim', 'sprayControl', 'gameSense', 'utilityUsage', 'clutchFactor', 'communication'] as (keyof Ratings)[],
};

/**
 * Calculate positive outcome ratio based on IGL game sense
 * Returns value between 0.4 (bad IGL) and 0.75 (elite IGL)
 */
function calculatePositiveRatio(iglGameSense: number, fatigueLevel: FatigueLevel, coachRating?: number, coachSpecialty?: import('../../types/team').CoachSpecialty[], analystRating?: number, analystSpecialty?: import('../../types/team').CoachSpecialty[]): number {
  const baseRatio = 0.5;
  const iglBonus = (iglGameSense - SCRIM_CONFIG.IGL_GAME_SENSE_BASELINE) * SCRIM_CONFIG.IGL_POSITIVE_RATIO_BOOST;
  const fatigueNerf = SCRIM_CONFIG.FATIGUE_NEGATIVE_BOOST[fatigueLevel];
  // head coach: 8% boost (development), analyst: 6% boost (development)
  const coachBonus = coachMod(coachRating) * 0.08 * specMod(coachSpecialty, 'development');
  const analystBonus = coachMod(analystRating) * 0.06 * specMod(analystSpecialty, 'development');

  return Math.max(0.35, Math.min(0.80, baseRatio + iglBonus - fatigueNerf + coachBonus + analystBonus));
}

/**
 * Calculate change chance for a specific player
 */
function calculateChangeChance(player: Player): number {
  const baseChance = SCRIM_CONFIG.BASE_CHANGE_CHANCE;
  const lrBonus = player.development.learningRate * SCRIM_CONFIG.LEARNING_RATE_MULTIPLIER;
  
  // Young players have slightly higher change chance
  const ageBonus = player.age < 22 ? 0.05 : player.age > 28 ? -0.05 : 0;
  
  return Math.min(0.4, baseChance + lrBonus + ageBonus);
}

/**
 * Calculate change magnitude based on volatility
 */
function calculateChangeMagnitude(player: Player, rng: RNG): number {
  const baseChange = SCRIM_CONFIG.MIN_CHANGE;
  
  // High volatility players can have bigger swings
  if (player.development.volatility > 0.5 && rng() < player.development.volatility) {
    return SCRIM_CONFIG.MAX_CHANGE;
  }
  
  return baseChange;
}

/**
 * Apply a stat change to a player
 * Returns the change details or null if no change
 */
function applyStatChange(
  player: Player,
  stat: keyof Ratings,
  isPositive: boolean,
  magnitude: number
): { oldValue: number; newValue: number; delta: number } | null {
  const oldValue = player.ratings[stat];
  const delta = isPositive ? magnitude : -magnitude;
  let newValue = oldValue + delta;
  
  // Clamp to valid range and respect potential
  newValue = Math.max(30, Math.min(99, newValue));
  
  // For positive changes, don't exceed ceiling
  if (isPositive && newValue > player.potential.ceiling) {
    newValue = player.potential.ceiling;
  }
  
  // For negative changes, don't go below floor
  if (!isPositive && newValue < player.potential.floor) {
    newValue = player.potential.floor;
  }
  
  // If no actual change, return null
  if (newValue === oldValue) {
    return null;
  }
  
  player.ratings[stat] = newValue;
  
  return {
    oldValue,
    newValue,
    delta: newValue - oldValue,
  };
}

/**
 * Recalculate player overall after stat changes
 */
function recalculateOverall(player: Player): number {
  const { aim, sprayControl, gameSense, utilityUsage, clutchFactor, communication } = player.ratings;
  
  // Weighted average based on role
  let weights: Record<keyof Ratings, number>;
  
  switch (player.role) {
    case 'duelist':
      weights = { aim: 0.30, sprayControl: 0.20, gameSense: 0.15, utilityUsage: 0.10, clutchFactor: 0.15, communication: 0.10 };
      break;
    case 'controller':
      weights = { aim: 0.15, sprayControl: 0.10, gameSense: 0.25, utilityUsage: 0.25, clutchFactor: 0.10, communication: 0.15 };
      break;
    case 'initiator':
      weights = { aim: 0.20, sprayControl: 0.15, gameSense: 0.20, utilityUsage: 0.20, clutchFactor: 0.10, communication: 0.15 };
      break;
    case 'sentinel':
      weights = { aim: 0.20, sprayControl: 0.15, gameSense: 0.20, utilityUsage: 0.15, clutchFactor: 0.15, communication: 0.15 };
      break;
    case 'flex':
      weights = { aim: 0.20, sprayControl: 0.15, gameSense: 0.20, utilityUsage: 0.15, clutchFactor: 0.15, communication: 0.15 };
      break;
    default:
      weights = { aim: 0.20, sprayControl: 0.15, gameSense: 0.20, utilityUsage: 0.15, clutchFactor: 0.15, communication: 0.15 };
  }
  
  const overall = Math.round(
    aim * weights.aim +
    sprayControl * weights.sprayControl +
    gameSense * weights.gameSense +
    utilityUsage * weights.utilityUsage +
    clutchFactor * weights.clutchFactor +
    communication * weights.communication
  );
  
  return Math.max(40, Math.min(99, overall));
}

/**
 * Process stat changes for a single player during a scrim
 */
function processPlayerScrim(
  player: Player,
  rng: RNG,
  positiveRatio: number
): ScrimStatChange | null {
  const changeChance = calculateChangeChance(player);
  
  // Check if this player gets any change
  if (rng() > changeChance) {
    return null;
  }
  
  const changes: ScrimStatChange['changes'] = [];
  const magnitude = calculateChangeMagnitude(player, rng);
  
  // Pick 1-2 random stats to potentially change
  const shuffledStats = [...SCRIM_CONFIG.CHANGEABLE_STATS].sort(() => rng() - 0.5);
  const statsToChange = shuffledStats.slice(0, rng() < 0.7 ? 1 : 2);
  
  for (const stat of statsToChange) {
    const isPositive = rng() < positiveRatio;
    const change = applyStatChange(player, stat, isPositive, magnitude);
    
    if (change) {
      changes.push({
        stat,
        ...change,
      });
    }
  }
  
  // Rare chance to affect potential
  if (rng() < SCRIM_CONFIG.POTENTIAL_CHANGE_CHANCE) {
    const isPositive = rng() < positiveRatio;
    const potentialStat = rng() < 0.5 ? 'ceiling' : 'floor';
    const oldValue = player.potential[potentialStat];
    const delta = isPositive ? 1 : -1;
    let newValue = oldValue + delta;
    
    // Clamp potential values
    if (potentialStat === 'ceiling') {
      newValue = Math.max(player.potential.floor + 5, Math.min(99, newValue));
    } else {
      newValue = Math.max(40, Math.min(player.potential.ceiling - 5, newValue));
    }
    
    if (newValue !== oldValue) {
      player.potential[potentialStat] = newValue;
      changes.push({
        stat: potentialStat,
        oldValue,
        newValue,
        delta: newValue - oldValue,
      });
    }
  }
  
  if (changes.length === 0) {
    return null;
  }
  
  // Recalculate overall if ratings changed
  const ratingChanges = changes.filter((c): c is ScrimStatChange['changes'][number] => 
    SCRIM_CONFIG.CHANGEABLE_STATS.includes(c.stat as keyof Ratings)
  );
  
  // Start with recalculated overall from stat changes
  let newOverall = recalculateOverall(player);
  const oldOverall = player.overall;
  
  // Chance for direct OVR boost/drop (represents intangibles, confidence, form)
  if (rng() < SCRIM_CONFIG.DIRECT_OVR_CHANGE_CHANCE) {
    const isPositive = rng() < positiveRatio;
    const ovrDelta = isPositive ? 1 : -1;
    newOverall = Math.max(40, Math.min(99, newOverall + ovrDelta));
    
    // Respect potential bounds
    if (newOverall > player.potential.ceiling) {
      newOverall = player.potential.ceiling;
    }
    if (newOverall < player.potential.floor) {
      newOverall = player.potential.floor;
    }
  }
  
  if (newOverall !== oldOverall || ratingChanges.length > 0) {
    player.overall = newOverall;
    if (newOverall !== oldOverall) {
      changes.push({
        stat: 'overall',
        oldValue: oldOverall,
        newValue: newOverall,
        delta: newOverall - oldOverall,
      });
    }
  }
  
  return {
    playerId: player.id,
    playerName: player.name,
    changes,
  };
}

/**
 * Get available scrim opponents for a team
 */
export function getAvailableScrimOpponents(
  team: Team,
  allTeams: Team[],
  upcomingPlayoffOpponentIds: string[] = [],
  tier2Teams?: Record<Region, Tier2Team[]>
): { regional: Team[]; tier2: Tier2Team[] } {
  // Regional teams in same region (excluding self and upcoming playoff opponents)
  const regional = allTeams.filter(t => 
    t.region === team.region && 
    t.id !== team.id &&
    !upcomingPlayoffOpponentIds.includes(t.id)
  );
  
  // Tier 2 teams for this region (all stored in tier2Teams now, including defaults)
  const tier2 = tier2Teams?.[team.region] || [];
  
  return { regional, tier2 };
}

/**
 * Get roster for a Tier 2 team
 * If the team has players defined, return them directly
 * Otherwise generate a temporary roster (for legacy default teams without rosters)
 */
function generateTier2Roster(rng: RNG, tier2Team: Tier2Team): Player[] {
  // If players are already defined (full Player objects), return them directly
  if (tier2Team.players && tier2Team.players.length >= 5) {
    return tier2Team.players.slice(0, 5);
  }
  
  // Fallback: generate roster for teams without players
  // This should only happen for legacy data
  return generateAcademyRoster(rng, tier2Team.abbreviation, tier2Team.averageOVR);
}

/**
 * Run a scrim session for a team
 */
export function runScrim(
  rng: RNG,
  team: Team,
  opponentName: string,
  opponentType: 'regional' | 'tier2',
  scrimsThisWeek: number,
  currentDay: number,
  currentYear: number,
  allTeams: Team[],
  tier2Teams?: Tier2Team[],
  mapPool?: string[],
  agentMeta?: Record<string, number>,
  mapMeta?: Record<string, Partial<Record<string, string[]>>>,
  agentVariance?: number,
  teamMapComps?: Record<string, Record<string, Record<string, string>>>,
  agentRoleOverrides?: Record<string, string[]>,
  teamMapCompNoPenalty?: Record<string, Record<string, string[]>>,
  teamMapCompBuffs?: Record<string, Record<string, Record<string, number>>>,
  disabledAgents?: string[]
): ScrimResult {
  const fatigueLevel = getFatigueLevel(scrimsThisWeek);
  
  // Find IGL and get their game sense
  const igl = team.roster.find(p => p.id === team.iglId);
  const iglGameSense = igl?.ratings.gameSense ?? 70;
  
  // Calculate positive outcome ratio
  const positiveRatio = calculatePositiveRatio(iglGameSense, fatigueLevel, team.staff.headCoach?.rating, team.staff.headCoach?.specialty, team.staff.analyst?.rating, team.staff.analyst?.specialty);
  
  // Process each starter for development
  const statChanges: ScrimStatChange[] = [];
  const starters = team.roster.slice(0, 5); // Assume first 5 are starters
  
  for (const player of starters) {
    const change = processPlayerScrim(player, rng, positiveRatio);
    if (change) {
      statChanges.push(change);
    }
  }
  
  // Get or generate opponent roster for match simulation
  let opponentRoster: Player[];
  let opponentId: string;
  
  if (opponentType === 'regional') {
    // Find the regional team
    const regionalTeam = allTeams.find(t => t.name === opponentName);
    if (regionalTeam) {
      opponentRoster = regionalTeam.roster;
      opponentId = regionalTeam.id;
    } else {
      // Fallback: generate a generic roster
      opponentRoster = generateTier2Roster(rng, { 
        id: 'unknown', 
        name: opponentName, 
        abbreviation: 'UNK', 
        region: team.region, 
        averageOVR: 70 
      });
      opponentId = 'scrim_opponent';
    }
  } else {
    // Tier 2: find the team config and generate roster
    const tier2Team = tier2Teams?.find(t => t.name === opponentName) 
      || TIER2_TEAMS[team.region]?.find(t => t.name === opponentName);
    
    if (tier2Team) {
      opponentRoster = generateTier2Roster(rng, tier2Team);
      opponentId = tier2Team.id;
    } else {
      // Fallback
      opponentRoster = generateTier2Roster(rng, { 
        id: 't2_unknown', 
        name: opponentName, 
        abbreviation: 'T2', 
        region: team.region, 
        averageOVR: 64 
      });
      opponentId = 'scrim_t2_opponent';
    }
  }
  
  // Create opponent team object for match detail view
  const opponentTeamObj: Team = opponentType === 'regional' 
    ? (allTeams.find(t => t.name === opponentName) || createTempTeam(opponentId, opponentName, team.region, opponentRoster))
    : createTempTeam(opponentId, opponentName, team.region, opponentRoster);
  
  // Simulate the actual match (BO3 for scrims)
  const matchResult = simulateMatch(
    rng,
    team.id,
    opponentId,
    team.roster,
    opponentRoster,
    'bo3',
    undefined, // Use default lineup
    undefined,
    team,
    opponentTeamObj,
    false,
    mapPool,
    agentMeta,
    mapMeta,
    agentVariance,
    teamMapComps,
    team.id,
    agentRoleOverrides,
    teamMapCompNoPenalty,
    teamMapCompBuffs,
    disabledAgents
  );
  
  return {
    opponentName,
    opponentType,
    opponentTeamId: opponentId,
    statChanges,
    day: currentDay,
    year: currentYear,
    matchResult,
    opponentTeam: opponentTeamObj,
  };
}

/**
 * Initialize season start stats for all players on a team
 */
export function initializeSeasonStartStats(team: Team): Map<string, SeasonStartStats> {
  const stats = new Map<string, SeasonStartStats>();
  
  for (const player of team.roster) {
    stats.set(player.id, {
      overall: player.overall,
      ratings: { ...player.ratings },
      potential: { ...player.potential },
    });
  }
  
  return stats;
}

/**
 * Calculate stat diff from season start
 */
export function calculateSeasonDiff(
  player: Player,
  seasonStartStats: SeasonStartStats | undefined
): { overall: number; ratings: Partial<Record<keyof Ratings, number>> } | null {
  if (!seasonStartStats) {
    return null;
  }
  
  const overallDiff = player.overall - seasonStartStats.overall;
  const ratingsDiff: Partial<Record<keyof Ratings, number>> = {};
  
  for (const stat of SCRIM_CONFIG.CHANGEABLE_STATS) {
    const diff = player.ratings[stat] - seasonStartStats.ratings[stat];
    if (diff !== 0) {
      ratingsDiff[stat] = diff;
    }
  }
  
  // Only return if there are actual changes
  if (overallDiff === 0 && Object.keys(ratingsDiff).length === 0) {
    return null;
  }
  
  return {
    overall: overallDiff,
    ratings: ratingsDiff,
  };
}

/**
 * Check if a scrim is risky (within 1-2 days of a match)
 */
export function isScrimRisky(
  currentDay: number,
  upcomingMatchDays: number[]
): boolean {
  return upcomingMatchDays.some(matchDay => 
    matchDay > currentDay && matchDay <= currentDay + 2
  );
}

/**
 * Format scrim result for display in game log
 */
export function formatScrimResultLog(result: ScrimResult): string[] {
  const lines: string[] = [];
  lines.push(`Scrim vs ${result.opponentName} completed`);
  
  for (const change of result.statChanges) {
    for (const c of change.changes) {
      if (c.stat === 'overall') continue; // Skip overall, it's derived
      
      const arrow = c.delta > 0 ? '⬆️' : '⬇️';
      const statName = c.stat === 'ceiling' ? 'Potential ↑' :
                       c.stat === 'floor' ? 'Potential ↓' :
                       c.stat.charAt(0).toUpperCase() + c.stat.slice(1).replace(/([A-Z])/g, ' $1');
      
      lines.push(`${change.playerName}: ${statName} ${c.delta > 0 ? '+' : ''}${c.delta} ${arrow}`);
    }
  }
  
  if (result.statChanges.length === 0) {
    lines.push('No significant changes');
  }
  
  return lines;
}