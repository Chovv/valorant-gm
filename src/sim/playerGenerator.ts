// src/sim/playerGenerator.ts
// Player generation for ValorantGM

import type { Player, Role, PlayerBackground, PlayerArchetype, Ratings } from '../types';
import type { Region } from '../types/team';
import type { RNG } from '../utils/random';
import { randomInt } from '../utils/random';
import { ALL_ARCHETYPES } from '../data/archetypes';
import { drawName, type NamePoolCtx } from './namePool';

// First names pool
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Jake', 'Ryan', 'Kyle', 'Tyler', 'Brandon', 'Kevin', 'Eric', 'Chris',
  'Min', 'Jin', 'Hao', 'Wei', 'Yuki', 'Kai', 'Ren', 'Sora',
  'Lucas', 'Max', 'Leo', 'Felix', 'Oscar', 'Hugo', 'Emil', 'Viktor',
  'Diego', 'Carlos', 'Marco', 'Pedro', 'João', 'Rafael', 'Gabriel', 'Mateo',
];

// Last names / handles
const LAST_NAMES = [
  'Phoenix', 'Shadow', 'Storm', 'Blaze', 'Frost', 'Nova', 'Echo', 'Viper',
  'Wolf', 'Hawk', 'Dragon', 'Tiger', 'Snake', 'Fox', 'Raven', 'Bear',
  'Zero', 'One', 'Ace', 'King', 'Joker', 'Ghost', 'Ninja', 'Samurai',
  'Flash', 'Zoom', 'Dash', 'Swift', 'Quick', 'Rapid', 'Speed', 'Rush',
];

/**
 * Talent distribution settings
 * Controls how rare high-OVR players are
 */
export interface TalentDistribution {
  // The "common" range where most players fall
  commonMin: number;      // default: 58
  commonMax: number;      // default: 78
  commonWeight: number;   // default: 70 (70% of players)
  
  // The "good" range for solid players  
  goodMin: number;        // default: 79
  goodMax: number;        // default: 85
  goodWeight: number;     // default: 20 (20% of players)
  
  // The "elite" range for star players
  eliteMin: number;       // default: 86
  eliteMax: number;       // default: 89
  eliteWeight: number;    // default: 8 (8% of players)
  
  // The "superstar" range - extremely rare
  superstarMin: number;   // default: 90
  superstarMax: number;   // default: 95
  superstarWeight: number; // default: 2 (2% of players)
}

/**
 * Default talent distribution - realistic where 90+ is very rare
 */
export const DEFAULT_TALENT_DISTRIBUTION: TalentDistribution = {
  commonMin: 58,
  commonMax: 78,
  commonWeight: 70,
  
  goodMin: 79,
  goodMax: 85,
  goodWeight: 20,
  
  eliteMin: 86,
  eliteMax: 89,
  eliteWeight: 8,
  
  superstarMin: 90,
  superstarMax: 95,
  superstarWeight: 2,
};

/**
 * Preset distributions for different game modes
 */
export const TALENT_PRESETS = {
  // Realistic - 90+ is very rare (default)
  realistic: DEFAULT_TALENT_DISTRIBUTION,
  
  // Competitive - more good players, but superstars still rare
  competitive: {
    commonMin: 62,
    commonMax: 78,
    commonWeight: 55,
    goodMin: 79,
    goodMax: 85,
    goodWeight: 30,
    eliteMin: 86,
    eliteMax: 89,
    eliteWeight: 12,
    superstarMin: 90,
    superstarMax: 95,
    superstarWeight: 3,
  } as TalentDistribution,
  
  // Arcade - more high-rated players for fun
  arcade: {
    commonMin: 65,
    commonMax: 80,
    commonWeight: 40,
    goodMin: 81,
    goodMax: 87,
    goodWeight: 35,
    eliteMin: 88,
    eliteMax: 92,
    eliteWeight: 18,
    superstarMin: 93,
    superstarMax: 97,
    superstarWeight: 7,
  } as TalentDistribution,
  
  // Dynasty - superstars are more common
  dynasty: {
    commonMin: 55,
    commonMax: 75,
    commonWeight: 50,
    goodMin: 76,
    goodMax: 84,
    goodWeight: 25,
    eliteMin: 85,
    eliteMax: 90,
    eliteWeight: 15,
    superstarMin: 91,
    superstarMax: 98,
    superstarWeight: 10,
  } as TalentDistribution,
};

/**
 * Forced ratings from config
 */
export interface ForcedRatings {
  aim?: number;
  utility?: number;
  gameSense?: number;
  clutch?: number;
}

/**
 * Forced personality from config
 */
export interface ForcedPersonality {
  leadership?: number;
  workEthic?: number;
  mentality?: number;
  teamPlayer?: number;
  coachability?: number;
}

interface GeneratorOptions {
  meanOverall?: number;      // Used as a modifier, not direct mean
  minAge?: number;
  maxAge?: number;
  role?: Role;
  distribution?: TalentDistribution;
  forceOverall?: number;     // Force a specific overall (for config-based players)
  forceAge?: number;         // Force a specific age (for config-based players)
  forceRatings?: ForcedRatings; // Force specific ratings (for config-based players)
  forceName?: string;        // Force a specific name (for config-based players)
  forcePersonality?: ForcedPersonality; // Force specific personality traits (for config-based players)
  forceConsistency?: number; // Force a specific consistency value (for config-based players)
  namePool?: NamePoolCtx | null; // esports name pool context
  nationality?: string;      // for pool lookup
  region?: Region;           // for pool fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate overall rating from individual ratings using archetype-specific weights
 */
export function calculateOverall(ratings: Ratings, archetype: PlayerArchetype): number {
  const config = ALL_ARCHETYPES[archetype];
  
  if (!config) {
    // Fallback to equal weights if archetype not found
    return Math.round(
      (ratings.aim + ratings.sprayControl + ratings.gameSense + 
       ratings.utilityUsage + ratings.communication + ratings.clutchFactor) / 6
    );
  }
  
  const { weights } = config;
  return Math.round(
    ratings.aim * weights.aim +
    ratings.sprayControl * weights.sprayControl +
    ratings.gameSense * weights.gameSense +
    ratings.utilityUsage * weights.utilityUsage +
    ratings.communication * weights.communication +
    ratings.clutchFactor * weights.clutchFactor
  );
}

function generateName(rng: RNG): string {
  // 50% chance of just a handle, 50% chance of first name + handle
  if (rng() < 0.5) {
    return LAST_NAMES[randomInt(rng, 0, LAST_NAMES.length - 1)];
  }
  const first = FIRST_NAMES[randomInt(rng, 0, FIRST_NAMES.length - 1)];
  const last = LAST_NAMES[randomInt(rng, 0, LAST_NAMES.length - 1)];
  // Sometimes use first name as handle
  return rng() < 0.3 ? first : `${first[0]}${last}`;
}

function randomRole(rng: RNG): Role {
  const roles: Role[] = ['duelist', 'controller', 'initiator', 'sentinel'];
  return roles[randomInt(rng, 0, roles.length - 1)];
}

function randomBackground(rng: RNG): PlayerBackground {
  const backgrounds: PlayerBackground[] = [
    'valorant_native', 'csgo_veteran', 'overwatch_player', 'battle_royale', 'unknown_talent'
  ];
  const weights = [40, 30, 15, 10, 5]; // Valorant native most common
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < backgrounds.length; i++) {
    r -= weights[i];
    if (r <= 0) return backgrounds[i];
  }
  return 'valorant_native';
}

function getArchetypeForRole(rng: RNG, role: Role): PlayerArchetype {
  switch (role) {
    case 'duelist':
      return ['entry_fragger', 'clutch_star', 'feast_or_famine'][randomInt(rng, 0, 2)] as PlayerArchetype;
    case 'controller':
      return ['utility_specialist', 'macro_brain', 'aggressive_smoker'][randomInt(rng, 0, 2)] as PlayerArchetype;
    case 'initiator':
      return ['info_gatherer', 'playmaker', 'support_initiator'][randomInt(rng, 0, 2)] as PlayerArchetype;
    case 'sentinel':
      return ['anchor', 'support_leader', 'lurker'][randomInt(rng, 0, 2)] as PlayerArchetype;
    case 'flex': {
      // Flex players can have archetypes from any role
      const flexArchetypes: PlayerArchetype[] = [
        'entry_fragger', 'clutch_star', 'utility_specialist', 
        'playmaker', 'support_initiator', 'lurker'
      ];
      return flexArchetypes[randomInt(rng, 0, flexArchetypes.length - 1)];
    }
    default:
      // Fallback for any unknown role
      return 'clutch_star';
  }
}

/**
 * Generate an overall rating using weighted tiers
 * This creates a realistic distribution where 90+ is very rare
 */
function generateOverallWithDistribution(
  rng: RNG, 
  distribution: TalentDistribution,
  modifier: number = 0
): number {
  const { 
    commonMin, commonMax, commonWeight,
    goodMin, goodMax, goodWeight,
    eliteMin, eliteMax, eliteWeight,
    superstarMin, superstarMax, superstarWeight
  } = distribution;
  
  const totalWeight = commonWeight + goodWeight + eliteWeight + superstarWeight;
  const roll = rng() * totalWeight;
  
  let baseOverall: number;
  let tierVariance: number;
  
  if (roll < commonWeight) {
    // Common tier (most players)
    baseOverall = randomInt(rng, commonMin, commonMax);
    tierVariance = 3;
  } else if (roll < commonWeight + goodWeight) {
    // Good tier
    baseOverall = randomInt(rng, goodMin, goodMax);
    tierVariance = 2;
  } else if (roll < commonWeight + goodWeight + eliteWeight) {
    // Elite tier
    baseOverall = randomInt(rng, eliteMin, eliteMax);
    tierVariance = 2;
  } else {
    // Superstar tier (very rare)
    baseOverall = randomInt(rng, superstarMin, superstarMax);
    tierVariance = 1;
  }
  
  // Apply small variance within tier
  const variance = randomInt(rng, -tierVariance, tierVariance);
  
  // Apply modifier (from meanOverall option) - but dampened
  const modifierEffect = Math.round(modifier * 0.3);
  
  return clamp(baseOverall + variance + modifierEffect, 40, 99);
}

/**
 * Generate potential ceiling based on current overall and age
 * Younger players have higher potential upside
 */
function generatePotential(
  rng: RNG, 
  overall: number, 
  age: number,
  distribution: TalentDistribution
): { floor: number; ceiling: number } {
  // Age factor: younger players have more potential upside
  const ageFactor = Math.max(0, (26 - age) / 8); // Peak potential gain at age 18
  
  // Base potential range
  const baseUpside = randomInt(rng, 3, 12);
  const ageBonus = Math.round(ageFactor * randomInt(rng, 5, 15));
  
  // Higher rated players have less room to grow
  const growthPenalty = overall > 85 ? Math.round((overall - 85) * 0.5) : 0;
  
  const potentialCeiling = clamp(
    overall + baseUpside + ageBonus - growthPenalty,
    overall,
    Math.min(99, distribution.superstarMax + 3)
  );
  
  // Floor is usually close to current with some variance
  const potentialFloor = clamp(
    overall - randomInt(rng, 3, 10),
    40,
    overall
  );
  
  return { floor: potentialFloor, ceiling: potentialCeiling };
}

export function generatePlayer(rng: RNG, options: GeneratorOptions = {}): Player {
  const {
    meanOverall = 0,  // Now used as a modifier, not direct mean
    minAge = 17,
    maxAge = 30,
    role = randomRole(rng),
    distribution = DEFAULT_TALENT_DISTRIBUTION,
    forceOverall,
    forceAge,
    forceRatings,
    forceName,
    forcePersonality,
    forceConsistency,
    namePool,
    nationality,
    region,
  } = options;

  // Use forced age if provided, otherwise generate random
  const age = forceAge !== undefined ? forceAge : randomInt(rng, minAge, maxAge);
  
  const background = randomBackground(rng);
  const archetype = getArchetypeForRole(rng, role);

  // Generate overall - either forced (for config players) or using distribution
  const overall = forceOverall !== undefined 
    ? forceOverall  // Use exact overall from config (no variance for real players)
    : generateOverallWithDistribution(rng, distribution, meanOverall);

  // Generate individual ratings based on overall with some variance
  // But use forced ratings if provided from config
  const ratingVariance = 6;
  
  const aim = forceRatings?.aim !== undefined 
    ? forceRatings.aim 
    : clamp(overall + randomInt(rng, -ratingVariance, ratingVariance), 30, 99);
    
  const utilityUsage = forceRatings?.utility !== undefined 
    ? forceRatings.utility 
    : clamp(overall + randomInt(rng, -ratingVariance, ratingVariance), 30, 99);
    
  const gameSense = forceRatings?.gameSense !== undefined 
    ? forceRatings.gameSense 
    : clamp(overall + randomInt(rng, -ratingVariance, ratingVariance), 30, 99);
    
  const clutchFactor = forceRatings?.clutch !== undefined 
    ? forceRatings.clutch 
    : clamp(overall + randomInt(rng, -ratingVariance, ratingVariance), 30, 99);

  // These are always generated (not in config)
  const sprayControl = clamp(overall + randomInt(rng, -ratingVariance, ratingVariance), 30, 99);
  const communication = clamp(overall + randomInt(rng, -ratingVariance, ratingVariance), 30, 99);

  // Generate potential
  const potential = generatePotential(rng, overall, age, distribution);

  // Peak age varies
  const peakAge = randomInt(rng, 22, 27);

  // Use forced name if provided, otherwise generate
  // resolve name: forced > pool > random
  let name: string;
  if (forceName !== undefined) {
    name = forceName;
  } else if (namePool) {
    name = drawName(rng, namePool.used, nationality, region) ?? generateName(rng);
    namePool.used.add(name);
  } else {
    name = generateName(rng);
  }

  // Generate personality - use forced values if provided, otherwise random
  const personality = {
    leadership: forcePersonality?.leadership ?? randomInt(rng, 30, 90),
    coachability: forcePersonality?.coachability ?? randomInt(rng, 40, 95),
    workEthic: forcePersonality?.workEthic ?? randomInt(rng, 40, 95),
    mentality: forcePersonality?.mentality ?? randomInt(rng, 40, 95),
    teamPlayer: forcePersonality?.teamPlayer ?? randomInt(rng, 50, 95),
  };

  // Generate consistency - archetype-biased match-day reliability
  // Doesn't affect OVR, only controls form variance in matches
  let consistency: number;
  if (forceConsistency !== undefined) {
    consistency = forceConsistency;
  } else {
    // Archetype-based ranges
    switch (archetype) {
      case 'anchor':           consistency = randomInt(rng, 70, 95); break; // Rock solid
      case 'support_leader':   consistency = randomInt(rng, 65, 90); break; // Reliable
      case 'clutch_star':      consistency = randomInt(rng, 60, 90); break; // Steady performers
      case 'utility_specialist': consistency = randomInt(rng, 60, 85); break;
      case 'macro_brain':      consistency = randomInt(rng, 60, 85); break;
      case 'info_gatherer':    consistency = randomInt(rng, 55, 85); break;
      case 'support_initiator': consistency = randomInt(rng, 55, 85); break;
      case 'lurker':           consistency = randomInt(rng, 50, 85); break;
      case 'entry_fragger':    consistency = randomInt(rng, 45, 80); break; // Aggressive = volatile
      case 'playmaker':        consistency = randomInt(rng, 40, 80); break; // High risk plays
      case 'aggressive_smoker': consistency = randomInt(rng, 40, 75); break;
      case 'feast_or_famine':  consistency = randomInt(rng, 25, 60); break; // Boom or bust
      default:                 consistency = randomInt(rng, 45, 85); break;
    }
  }

  const player: Player = {
    id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    age,
    role,
    background,
    archetype,
    overall,
    consistency,
    ratings: {
      aim,
      sprayControl,
      gameSense,
      utilityUsage,
      clutchFactor,
      communication,
    },
    potential,
    development: {
      peakAge,
      volatility: 0.2 + rng() * 0.4, // 0.2 - 0.6
      learningRate: 0.3 + rng() * 0.5, // 0.3 - 0.8
    },
    personality,
    contract: null,
    agentPool: {},
    draftYear: null,
    draftPick: null,
    yearsInLeague: 0,
    retired: false,
  };

  return player;
}

/**
 * Generate a player from a PlayerConfig (from teams.ts)
 * This preserves the exact stats from the config
 */
export function generatePlayerFromConfig(
  rng: RNG,
  config: {
    name: string;
    role: Role;
    overall: number;
    aim: number;
    utility: number;
    gameSense: number;
    clutch: number;
    age: number;
    consistency?: number;
    personality?: ForcedPersonality;
  }
): Player {
  return generatePlayer(rng, {
    role: config.role,
    forceOverall: config.overall,
    forceAge: config.age,
    forceName: config.name,
    forceRatings: {
      aim: config.aim,
      utility: config.utility,
      gameSense: config.gameSense,
      clutch: config.clutch,
    },
    forcePersonality: config.personality,
    forceConsistency: config.consistency,
  });
}

/**
 * Generate a player with a specific tier guarantee
 * Useful for draft classes or special events
 */
export function generatePlayerWithTier(
  rng: RNG,
  tier: 'common' | 'good' | 'elite' | 'superstar',
  options: Omit<GeneratorOptions, 'distribution' | 'forceOverall'> = {}
): Player {
  const distribution = DEFAULT_TALENT_DISTRIBUTION;
  
  let minOvr: number, maxOvr: number;
  switch (tier) {
    case 'common':
      minOvr = distribution.commonMin;
      maxOvr = distribution.commonMax;
      break;
    case 'good':
      minOvr = distribution.goodMin;
      maxOvr = distribution.goodMax;
      break;
    case 'elite':
      minOvr = distribution.eliteMin;
      maxOvr = distribution.eliteMax;
      break;
    case 'superstar':
      minOvr = distribution.superstarMin;
      maxOvr = distribution.superstarMax;
      break;
  }
  
  const forcedOverall = randomInt(rng, minOvr, maxOvr);
  
  return generatePlayer(rng, {
    ...options,
    forceOverall: forcedOverall,
  });
}

/**
 * Helper to visualize the distribution (for testing/debugging)
 */
export function testDistribution(rng: RNG, count: number = 1000, distribution: TalentDistribution = DEFAULT_TALENT_DISTRIBUTION): void {
  const buckets: Record<string, number> = {
    '40-49': 0,
    '50-59': 0,
    '60-69': 0,
    '70-79': 0,
    '80-84': 0,
    '85-89': 0,
    '90-94': 0,
    '95-99': 0,
  };
  
  for (let i = 0; i < count; i++) {
    const ovr = generateOverallWithDistribution(rng, distribution);
    if (ovr < 50) buckets['40-49']++;
    else if (ovr < 60) buckets['50-59']++;
    else if (ovr < 70) buckets['60-69']++;
    else if (ovr < 80) buckets['70-79']++;
    else if (ovr < 85) buckets['80-84']++;
    else if (ovr < 90) buckets['85-89']++;
    else if (ovr < 95) buckets['90-94']++;
    else buckets['95-99']++;
  }
  
  console.log('=== OVR Distribution Test ===');
  for (const [range, num] of Object.entries(buckets)) {
    const pct = ((num / count) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(num / count * 50));
    console.log(`${range}: ${pct}% ${bar}`);
  }
}