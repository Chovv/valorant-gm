// src/sim/freeAgency.ts
// Free agency system for ValorantGM

import type { Player, Role, PlayerArchetype } from '../types';
import type { Region } from '../types/team';
import type { RNG } from '../utils/random';
import { randomInt } from '../utils/random';
import { FREE_AGENTS, type PlayerConfig } from '../data/teams';
import { drawName, type NamePoolCtx } from './namePool';

export type { NamePoolCtx };

// First names for random player generation
const FIRST_NAMES = [
  'Alex', 'Max', 'Leo', 'Kai', 'Jay', 'Sam', 'Ryan', 'Jake', 'Cole', 'Luke',
  'Zach', 'Evan', 'Nate', 'Kyle', 'Drew', 'Sean', 'Mark', 'John', 'Mike', 'Chris',
  'Tyler', 'Ethan', 'Noah', 'Mason', 'Logan', 'Lucas', 'Aiden', 'Jack', 'Owen', 'Liam',
  'Jin', 'Yuki', 'Hiro', 'Kenji', 'Ryu', 'Tao', 'Wei', 'Chen', 'Park', 'Kim',
  'Ivan', 'Dmitri', 'Sasha', 'Viktor', 'Andre', 'Marco', 'Paulo', 'Diego', 'Carlos', 'Luis',
];

// Suffixes/tags for gamer names
const SUFFIXES = [
  '', 'x', 'z', '1', '2', '3', 'XD', 'TV', 'GG', 'YT',
  '_', '-', '.', 'jr', 'ii', 'iii', 'god', 'ace', 'pro', 'gg',
];

// Generate a random gamer tag
function generateGamerTag(rng: RNG): string {
  const firstName = FIRST_NAMES[randomInt(rng, 0, FIRST_NAMES.length - 1)];
  const suffix = SUFFIXES[randomInt(rng, 0, SUFFIXES.length - 1)];
  
  // Various styles of gamer names
  const style = randomInt(rng, 0, 4);
  switch (style) {
    case 0: // lowercase with suffix: alexz
      return firstName.toLowerCase() + suffix;
    case 1: // Capitalized: Alex
      return firstName;
    case 2: // ALL CAPS with suffix: ALEX1
      return firstName.toUpperCase() + suffix;
    case 3: // CamelCase modifier: xAlex
      return suffix + firstName;
    default: // lowercase: alex
      return firstName.toLowerCase();
  }
}

const ROLES: Role[] = ['duelist', 'controller', 'initiator', 'sentinel', 'flex'];

// weighted nationality pools per region — mirrors REGION_NATIONALITIES in MassPlayerEditor
const REGION_NAT_WEIGHTS: Record<Region, { code: string; w: number }[]> = {
  americas: [
    { code: 'BR', w: 35 }, { code: 'US', w: 25 }, { code: 'CL', w: 10 }, { code: 'AR', w: 10 },
    { code: 'MX', w: 5 }, { code: 'CA', w: 5 }, { code: 'CO', w: 3 }, { code: 'PE', w: 3 },
    { code: 'UY', w: 2 }, { code: 'PR', w: 2 },
  ],
  emea: [
    { code: 'TR', w: 18 }, { code: 'RU', w: 13 }, { code: 'SE', w: 7 }, { code: 'FR', w: 7 },
    { code: 'FI', w: 5 }, { code: 'ES', w: 5 }, { code: 'DE', w: 4 }, { code: 'PL', w: 4 },
    { code: 'UA', w: 4 }, { code: 'DK', w: 3 }, { code: 'GB', w: 4 }, { code: 'IL', w: 3 },
    { code: 'CZ', w: 3 }, { code: 'LV', w: 3 }, { code: 'GE', w: 2 }, { code: 'KZ', w: 2 },
    { code: 'MA', w: 3 }, { code: 'IT', w: 3 }, { code: 'PT', w: 2 }, { code: 'BA', w: 2 },
    { code: 'RS', w: 2 }, { code: 'LT', w: 1 },
  ],
  pacific: [
    { code: 'KR', w: 25 }, { code: 'JP', w: 15 }, { code: 'PH', w: 15 }, { code: 'ID', w: 12 },
    { code: 'TH', w: 8 }, { code: 'SG', w: 5 }, { code: 'IN', w: 5 }, { code: 'AU', w: 5 },
    { code: 'VN', w: 5 }, { code: 'MY', w: 3 }, { code: 'TW', w: 2 },
  ],
  china: [{ code: 'CN', w: 95 }, { code: 'HK', w: 3 }, { code: 'MO', w: 2 }],
};

export function pickNat(rng: RNG, region: Region): string {
  const pool = REGION_NAT_WEIGHTS[region];
  const total = pool.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const { code, w } of pool) { r -= w; if (r <= 0) return code; }
  return pool[pool.length - 1].code;
}

/**
 * Convert a PlayerConfig from teams.ts to a full Player object
 */
export function convertPlayerConfigToPlayer(config: PlayerConfig, rng: RNG, disabledAgents?: string[]): Player {
  const { name, role, overall, aim, utility, gameSense, clutch, age, agents, consistency: configConsistency } = config;
  
  // Calculate potential based on age
  let ceilingBonus = 0;
  if (age <= 19) ceilingBonus = randomInt(rng, 8, 18);
  else if (age <= 22) ceilingBonus = randomInt(rng, 4, 12);
  else if (age <= 25) ceilingBonus = randomInt(rng, 0, 8);
  else ceilingBonus = randomInt(rng, 0, 4);

  const ceiling = Math.min(99, overall + ceilingBonus);
  const floor = Math.max(40, overall - randomInt(rng, 5, 15));
  
  // Peak age - younger players peak later
  const peakAge = age <= 20 ? randomInt(rng, 23, 27) : randomInt(rng, 22, 26);
  
  // Generate agent pool - use provided agents or generate for role
  const agentPool = agents || generateAgentPoolForRole(rng, role, disabledAgents);

  return {
    id: `fa_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name,
    age,
    role,
    background: 'unknown_talent',
    archetype: getDefaultArchetype(role),
    
    ratings: {
      aim,
      sprayControl: Math.round((aim + overall) / 2) + randomInt(rng, -5, 5),
      gameSense,
      utilityUsage: utility,
      clutchFactor: clutch,
      communication: randomInt(rng, 50, 85),
    },
    
    potential: {
      ceiling,
      floor,
    },
    
    overall,
    consistency: configConsistency ?? randomInt(rng, 45, 85),
    
    development: {
      peakAge,
      volatility: 0.1 + rng() * 0.3,
      learningRate: 0.1 + rng() * 0.4,
    },
    
    personality: {
      leadership: randomInt(rng, 30, 90),
      coachability: randomInt(rng, 40, 95),
      workEthic: randomInt(rng, 40, 95),
      mentality: randomInt(rng, 40, 90),
      teamPlayer: randomInt(rng, 50, 95),
    },
    
    contract: null, // Free agent
    agentPool,
    
    draftYear: null,
    draftPick: null,
    yearsInLeague: Math.max(0, age - 17 - randomInt(rng, 0, 3)),
    retired: false,
  };
}

/**
 * Generate a free agent player
 */
export function generateFreeAgent(
  rng: RNG,
  options?: {
    minAge?: number;
    maxAge?: number;
    minOverall?: number;
    maxOverall?: number;
    role?: Role;
    region?: Region;
    disabledAgents?: string[];
    namePool?: NamePoolCtx | null;
  }
): Player {
  const {
    minAge = 17,
    maxAge = 30,
    minOverall = 55,
    maxOverall = 82,
    role,
    region,
    disabledAgents,
    namePool,
  } = options || {};

  const age = randomInt(rng, minAge, maxAge);
  const playerRole = role || ROLES[randomInt(rng, 0, ROLES.length - 1)];
  
  // Overall is biased by age - young players have more variance
  let baseOverall = randomInt(rng, minOverall, maxOverall);
  
  // Young prospects (17-20): lower floor, higher ceiling (development potential)
  // Prime age (21-26): higher floor
  // Veterans (27+): consistent but lower ceiling
  if (age <= 20) {
    // Young: more variance, slightly lower average
    baseOverall = randomInt(rng, Math.max(minOverall, 55), Math.min(maxOverall, 78));
  } else if (age <= 26) {
    // Prime: higher floor
    baseOverall = randomInt(rng, Math.max(minOverall, 62), maxOverall);
  } else {
    // Veteran: consistent
    baseOverall = randomInt(rng, Math.max(minOverall, 58), Math.min(maxOverall, 78));
  }

  // Generate attributes with some variance around overall
  const variance = () => randomInt(rng, -8, 8);
  const clamp = (n: number) => Math.max(40, Math.min(99, n));

  const aim = clamp(baseOverall + variance() + (playerRole === 'duelist' ? 5 : 0));
  const utility = clamp(baseOverall + variance() + (playerRole === 'controller' ? 5 : 0));
  const gameSense = clamp(baseOverall + variance() + (playerRole === 'sentinel' ? 3 : 0));
  const clutch = clamp(baseOverall + variance());
  const sprayControl = clamp(baseOverall + variance());
  const communication = clamp(baseOverall + variance());

  // Potential based on age
  let ceilingBonus = 0;
  if (age <= 19) ceilingBonus = randomInt(rng, 8, 18);
  else if (age <= 22) ceilingBonus = randomInt(rng, 4, 12);
  else if (age <= 25) ceilingBonus = randomInt(rng, 0, 8);
  else ceilingBonus = randomInt(rng, 0, 4);

  const ceiling = Math.min(99, baseOverall + ceilingBonus);
  const floor = Math.max(40, baseOverall - randomInt(rng, 5, 15));

  // Peak age - younger players peak later
  const peakAge = age <= 20 ? randomInt(rng, 23, 27) : randomInt(rng, 22, 26);

  // Generate agent pool for role
  const agentPool = generateAgentPoolForRole(rng, playerRole, disabledAgents);

  // resolve nationality before name so we can use it for pool lookup
  const nationality = region ? pickNat(rng, region) : undefined;

  // try esports name pool first, fall back to random gamer tag
  let name = namePool ? drawName(rng, namePool.used, nationality, region) : null;
  if (!name) name = generateGamerTag(rng);
  if (namePool) namePool.used.add(name);

  return {
    id: `fa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    age,
    role: playerRole,
    background: 'unknown_talent',
    archetype: getDefaultArchetype(playerRole),
    
    ratings: {
      aim,
      sprayControl,
      gameSense,
      utilityUsage: utility,
      clutchFactor: clutch,
      communication,
    },
    
    potential: {
      ceiling,
      floor,
    },
    
    overall: baseOverall,
    consistency: randomInt(rng, 40, 85),
    
    development: {
      peakAge,
      volatility: 0.1 + rng() * 0.3,
      learningRate: 0.1 + rng() * 0.4,
    },
    
    personality: {
      leadership: randomInt(rng, 30, 90),
      coachability: randomInt(rng, 40, 95),
      workEthic: randomInt(rng, 40, 95),
      mentality: randomInt(rng, 40, 90),
      teamPlayer: randomInt(rng, 50, 95),
    },
    
    contract: null, // Free agent
    agentPool,
    nationality,
    
    draftYear: null,
    draftPick: null,
    yearsInLeague: Math.max(0, age - 17 - randomInt(rng, 0, 3)),
    retired: false,
  };
}

function getDefaultArchetype(role: Role): PlayerArchetype {
  switch (role) {
    case 'duelist': return 'entry_fragger';
    case 'controller': return 'utility_specialist';
    case 'initiator': return 'info_gatherer';
    case 'sentinel': return 'anchor';
    case 'flex': return 'entry_fragger';
    default: return 'entry_fragger';
  }
}

// Agent pools by role
export const AGENT_POOLS: Record<Role, string[]> = {
  duelist: ['jett', 'raze', 'phoenix', 'reyna', 'yoru', 'neon', 'iso', 'waylay'],
  controller: ['omen', 'brimstone', 'astra', 'harbor', 'clove', 'viper'],
  initiator: ['sova', 'breach', 'skye', 'kayo', 'fade', 'gekko', 'tejo'],
  sentinel: ['killjoy', 'cypher', 'sage', 'chamber', 'deadlock', 'viper', 'vyse', 'veto'],
  flex: ['jett', 'raze', 'omen', 'sova', 'skye', 'killjoy', 'chamber'],
};

export function generateAgentPoolForRole(rng: RNG, role: Role, disabledAgents?: string[]): Record<string, number> {
  let agents = AGENT_POOLS[role] || AGENT_POOLS.duelist;
  if (disabledAgents?.length) agents = agents.filter(a => !disabledAgents.includes(a));
  if (agents.length === 0) agents = AGENT_POOLS[role] || AGENT_POOLS.duelist; // fallback if all disabled
  const pool: Record<string, number> = {};
  
  // Pick 2-3 agents with priority values
  const numAgents = randomInt(rng, 2, Math.min(3, agents.length));
  const shuffled = [...agents].sort(() => rng() - 0.5);
  
  for (let i = 0; i < numAgents; i++) {
    // Priority system: 1 = 100, 2 = 50, 3 = 25
    if (i === 0) {
      pool[shuffled[i]] = 100; // Priority 1 (main)
    } else if (i === 1) {
      pool[shuffled[i]] = 50;  // Priority 2 (secondary)
    } else {
      pool[shuffled[i]] = 25;  // Priority 3 (pocket)
    }
  }
  
  return pool;
}

/**
 * Generate initial free agent pool using predefined FREE_AGENTS from teams.ts
 * Falls back to random generation if needed
 */
export function generateFreeAgentPool(rng: RNG, count: number = 75, disabledAgents?: string[], namePool?: NamePoolCtx | null): Player[] {
  const freeAgents: Player[] = [];
  
  // First, convert all predefined free agents
  for (const config of FREE_AGENTS) {
    const p = convertPlayerConfigToPlayer(config, rng, disabledAgents);
    if (namePool) namePool.used.add(p.name); // track config names to avoid dupes
    freeAgents.push(p);
  }
  
  // If we need more players, generate random ones to fill the gap
  const remainingCount = count - freeAgents.length;
  if (remainingCount > 0) {
    const youngCount = Math.floor(remainingCount * 0.5);
    const midCount = Math.floor(remainingCount * 0.3);
    const vetCount = remainingCount - youngCount - midCount;

    // regional distribution: americas 30%, emea 35%, pacific 25%, china 10%
    const regions: Region[] = ['americas', 'americas', 'americas', 'emea', 'emea', 'emea', 'emea', 'pacific', 'pacific', 'pacific', 'china'];
    const pickRegion = (i: number) => regions[i % regions.length];

    for (let i = 0; i < youngCount; i++) {
      freeAgents.push(generateFreeAgent(rng, { minAge: 17, maxAge: 20, minOverall: 55, maxOverall: 72, region: pickRegion(i), disabledAgents, namePool }));
    }
    for (let i = 0; i < midCount; i++) {
      freeAgents.push(generateFreeAgent(rng, { minAge: 20, maxAge: 26, minOverall: 62, maxOverall: 78, region: pickRegion(i), disabledAgents, namePool }));
    }
    for (let i = 0; i < vetCount; i++) {
      freeAgents.push(generateFreeAgent(rng, { minAge: 26, maxAge: 32, minOverall: 58, maxOverall: 76, region: pickRegion(i), disabledAgents, namePool }));
    }
  }
  
  return freeAgents;
}

/**
 * Sign a free agent to a team
 */
export function signFreeAgent(
  freeAgents: Player[],
  playerId: string,
  teamRoster: Player[]
): { updatedFreeAgents: Player[]; updatedRoster: Player[] } | null {
  const playerIndex = freeAgents.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return null;
  
  // Check roster limit (10 max)
  if (teamRoster.length >= 10) return null;
  
  const player = freeAgents[playerIndex];
  
  // Create contract for signed player
  const signedPlayer: Player = {
    ...player,
    contract: {
      salary: calculateSalary(player.overall, player.age),
      yearsRemaining: 1,
      teamOption: false,
      playerOption: false,
    },
  };
  
  return {
    updatedFreeAgents: freeAgents.filter(p => p.id !== playerId),
    updatedRoster: [...teamRoster, signedPlayer],
  };
}

/**
 * Release a player from a team
 */
export function releasePlayer(
  freeAgents: Player[],
  playerId: string,
  teamRoster: Player[]
): { updatedFreeAgents: Player[]; updatedRoster: Player[] } | null {
  const playerIndex = teamRoster.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return null;
  
  // Check minimum roster (5 players)
  if (teamRoster.length <= 5) return null;
  
  const player = teamRoster[playerIndex];
  
  // Remove contract when released
  const releasedPlayer: Player = {
    ...player,
    contract: null,
  };
  
  return {
    updatedFreeAgents: [...freeAgents, releasedPlayer],
    updatedRoster: teamRoster.filter(p => p.id !== playerId),
  };
}

/**
 * Calculate salary based on overall and age
 */
function calculateSalary(overall: number, age: number): number {
  // Base salary scales with overall
  let baseSalary = 50000; // Minimum
  
  if (overall >= 90) baseSalary = 500000;
  else if (overall >= 85) baseSalary = 350000;
  else if (overall >= 80) baseSalary = 200000;
  else if (overall >= 75) baseSalary = 120000;
  else if (overall >= 70) baseSalary = 80000;
  else if (overall >= 65) baseSalary = 60000;
  
  // Age modifier - young players are cheaper (less proven)
  if (age <= 19) baseSalary *= 0.6;
  else if (age <= 21) baseSalary *= 0.8;
  else if (age >= 28) baseSalary *= 0.9;
  
  return Math.round(baseSalary);
}

/**
 * Refresh free agent pool (add new players, remove some old ones)
 * Called at start of each season
 */
export function refreshFreeAgentPool(
  rng: RNG,
  currentFreeAgents: Player[],
  retireCount: number = 10,
  newCount: number = 15,
  disabledAgents?: string[],
  namePool?: NamePoolCtx | null,
): Player[] {
  // hard-retire players who are old, peaked, and below VCT-quality floor — they won't get signed anyway
  // always remove explicitly retired players; also auto-cull declining vets who haven't been flagged
  const hardRetire = (p: Player) => p.retired || (p.age >= 29 && (p.potential.ceiling - p.overall) < 5 && p.overall < 73);
  const afterHardRetire = currentFreeAgents.filter(p => !hardRetire(p));

  // soft cull: sort remaining by desirability (older + lower ceiling = more likely to go)
  const sorted = [...afterHardRetire].sort((a, b) => {
    const isProtected = (p: Player) => !p.retired && (p.age <= 21 && p.potential.ceiling >= 83);
    const scoreA = a.age * 2 - a.overall - (isProtected(a) ? 30 : 0);
    const scoreB = b.age * 2 - b.overall - (isProtected(b) ? 30 : 0);
    return scoreB - scoreA;
  });

  const alreadyCulled = currentFreeAgents.length - afterHardRetire.length;
  const softCullCount = Math.max(0, retireCount - alreadyCulled);
  const remaining = sorted.slice(softCullCount);
  
  // Add new young players distributed across regions
  const regions: Region[] = ['americas', 'americas', 'americas', 'emea', 'emea', 'emea', 'emea', 'pacific', 'pacific', 'pacific', 'china'];
  const newPlayers: Player[] = [];
  for (let i = 0; i < newCount; i++) {
    newPlayers.push(generateFreeAgent(rng, {
      minAge: 17,
      maxAge: 21,
      minOverall: 55,
      maxOverall: 72,
      region: regions[i % regions.length],
      disabledAgents,
      namePool,
    }));
  }
  
  return [...remaining, ...newPlayers];
}