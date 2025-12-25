// src/data/archetypes.ts
// Archetype definitions - affect playstyle and rating weights

import type {
  Role,
  PlayerArchetype,
  DuelistArchetype,
  ControllerArchetype,
  InitiatorArchetype,
  SentinelArchetype,
  Ratings,
} from '../types';

/**
 * Rating weights for OVR calculation (must sum to 1.0)
 */
export type RatingWeights = {
  [K in keyof Ratings]: number;
};

/**
 * Archetype configuration
 */
export interface ArchetypeConfig {
  name: string;
  description: string;
  role: Role;
  weights: RatingWeights;
  ratingBias: Partial<Ratings>; // Bonus/penalty to base generation
}

/**
 * Duelist archetypes
 */
export const DUELIST_ARCHETYPES: Record<DuelistArchetype, ArchetypeConfig> = {
  entry_fragger: {
    name: 'Entry Fragger',
    description: 'First in, creates space through aggression',
    role: 'duelist',
    weights: {
      aim: 0.35,
      sprayControl: 0.15,
      gameSense: 0.15,
      utilityUsage: 0.10,
      clutchFactor: 0.10,
      communication: 0.15,
    },
    ratingBias: {
      aim: 5,
      communication: 3,
    },
  },

  clutch_star: {
    name: 'Clutch Star',
    description: 'Thrives in high-pressure situations',
    role: 'duelist',
    weights: {
      aim: 0.25,
      sprayControl: 0.10,
      gameSense: 0.20,
      utilityUsage: 0.10,
      clutchFactor: 0.25,
      communication: 0.10,
    },
    ratingBias: {
      clutchFactor: 8,
      gameSense: 3,
    },
  },

  feast_or_famine: {
    name: 'Feast or Famine',
    description: 'High variance - either dominates or disappears',
    role: 'duelist',
    weights: {
      aim: 0.40,
      sprayControl: 0.15,
      gameSense: 0.10,
      utilityUsage: 0.05,
      clutchFactor: 0.20,
      communication: 0.10,
    },
    ratingBias: {
      aim: 8,
      gameSense: -5,
    },
  },
};

/**
 * Controller archetypes
 */
export const CONTROLLER_ARCHETYPES: Record<ControllerArchetype, ArchetypeConfig> = {
  utility_specialist: {
    name: 'Utility Specialist',
    description: 'Maximizes value from smokes and abilities',
    role: 'controller',
    weights: {
      aim: 0.15,
      sprayControl: 0.10,
      gameSense: 0.20,
      utilityUsage: 0.35,
      clutchFactor: 0.05,
      communication: 0.15,
    },
    ratingBias: {
      utilityUsage: 10,
      aim: -3,
    },
  },

  macro_brain: {
    name: 'Macro Brain',
    description: 'Reads the game at a strategic level',
    role: 'controller',
    weights: {
      aim: 0.15,
      sprayControl: 0.10,
      gameSense: 0.35,
      utilityUsage: 0.20,
      clutchFactor: 0.05,
      communication: 0.15,
    },
    ratingBias: {
      gameSense: 10,
      communication: 5,
    },
  },

  aggressive_smoker: {
    name: 'Aggressive Smoker',
    description: 'Uses smokes to create personal opportunities',
    role: 'controller',
    weights: {
      aim: 0.25,
      sprayControl: 0.15,
      gameSense: 0.15,
      utilityUsage: 0.25,
      clutchFactor: 0.10,
      communication: 0.10,
    },
    ratingBias: {
      aim: 5,
      utilityUsage: 3,
    },
  },
};

/**
 * Initiator archetypes
 */
export const INITIATOR_ARCHETYPES: Record<InitiatorArchetype, ArchetypeConfig> = {
  info_gatherer: {
    name: 'Info Gatherer',
    description: 'Scouts and relays enemy positions',
    role: 'initiator',
    weights: {
      aim: 0.15,
      sprayControl: 0.10,
      gameSense: 0.25,
      utilityUsage: 0.25,
      clutchFactor: 0.05,
      communication: 0.20,
    },
    ratingBias: {
      communication: 8,
      gameSense: 5,
    },
  },

  playmaker: {
    name: 'Playmaker',
    description: 'Creates opportunities with aggressive utility',
    role: 'initiator',
    weights: {
      aim: 0.25,
      sprayControl: 0.10,
      gameSense: 0.20,
      utilityUsage: 0.25,
      clutchFactor: 0.10,
      communication: 0.10,
    },
    ratingBias: {
      utilityUsage: 5,
      aim: 5,
    },
  },

  support_initiator: {
    name: 'Support Initiator',
    description: 'Enables teammates rather than fragging',
    role: 'initiator',
    weights: {
      aim: 0.10,
      sprayControl: 0.10,
      gameSense: 0.20,
      utilityUsage: 0.30,
      clutchFactor: 0.05,
      communication: 0.25,
    },
    ratingBias: {
      communication: 10,
      utilityUsage: 5,
      aim: -5,
    },
  },
};

/**
 * Sentinel archetypes
 */
export const SENTINEL_ARCHETYPES: Record<SentinelArchetype, ArchetypeConfig> = {
  anchor: {
    name: 'Anchor',
    description: 'Locks down sites and wins retakes',
    role: 'sentinel',
    weights: {
      aim: 0.25,
      sprayControl: 0.15,
      gameSense: 0.20,
      utilityUsage: 0.20,
      clutchFactor: 0.15,
      communication: 0.05,
    },
    ratingBias: {
      clutchFactor: 5,
      sprayControl: 5,
    },
  },

  support_leader: {
    name: 'Support Leader',
    description: 'IGLs from the sentinel role',
    role: 'sentinel',
    weights: {
      aim: 0.15,
      sprayControl: 0.10,
      gameSense: 0.25,
      utilityUsage: 0.15,
      clutchFactor: 0.05,
      communication: 0.30,
    },
    ratingBias: {
      communication: 12,
      gameSense: 5,
      aim: -5,
    },
  },

  lurker: {
    name: 'Lurker',
    description: 'Plays off the team for sneaky flanks',
    role: 'sentinel',
    weights: {
      aim: 0.25,
      sprayControl: 0.10,
      gameSense: 0.30,
      utilityUsage: 0.10,
      clutchFactor: 0.15,
      communication: 0.10,
    },
    ratingBias: {
      gameSense: 8,
      clutchFactor: 5,
      communication: -5,
    },
  },
};

/**
 * Combined archetype lookup
 */
export const ALL_ARCHETYPES: Record<PlayerArchetype, ArchetypeConfig> = {
  ...DUELIST_ARCHETYPES,
  ...CONTROLLER_ARCHETYPES,
  ...INITIATOR_ARCHETYPES,
  ...SENTINEL_ARCHETYPES,
};

/**
 * Get valid archetypes for a role
 */
export function getArchetypesForRole(role: Role): PlayerArchetype[] {
  switch (role) {
    case 'duelist':
      return Object.keys(DUELIST_ARCHETYPES) as DuelistArchetype[];
    case 'controller':
      return Object.keys(CONTROLLER_ARCHETYPES) as ControllerArchetype[];
    case 'initiator':
      return Object.keys(INITIATOR_ARCHETYPES) as InitiatorArchetype[];
    case 'sentinel':
      return Object.keys(SENTINEL_ARCHETYPES) as SentinelArchetype[];
    case 'flex':
      // Flex players can have any archetype
      return Object.keys(ALL_ARCHETYPES) as PlayerArchetype[];
  }
}