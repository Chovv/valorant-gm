// src/data/backgrounds.ts
// Background definitions - affect starting stat distribution and development

import type { PlayerBackground, Ratings } from '../types';

/**
 * Rating modifiers for each background
 * Values are additive adjustments to base ratings
 */
export interface BackgroundModifiers {
  ratings: Partial<Ratings>;
  development: {
    peakAgeModifier: number;      // Added to base peak age
    volatilityModifier: number;   // Added to base volatility
    learningRateModifier: number; // Added to base learning rate
  };
}

/**
 * Background configuration map
 */
export const BACKGROUNDS: Record<PlayerBackground, BackgroundModifiers> = {
  valorant_native: {
    ratings: {
      utilityUsage: 5,
      gameSense: 3,
    },
    development: {
      peakAgeModifier: 0,
      volatilityModifier: 0,
      learningRateModifier: 0.05,
    },
  },

  csgo_veteran: {
    ratings: {
      aim: 7,
      sprayControl: 10,
      clutchFactor: 5,
      utilityUsage: -5, // Different utility system
    },
    development: {
      peakAgeModifier: -1, // Peak slightly earlier (mechanical focus)
      volatilityModifier: -0.05, // More consistent
      learningRateModifier: -0.05, // Slower to adapt
    },
  },

  overwatch_player: {
    ratings: {
      utilityUsage: 8,
      gameSense: 5,
      communication: 7,
      sprayControl: -8, // Hitscan vs tracking difference
    },
    development: {
      peakAgeModifier: 1,
      volatilityModifier: 0.05,
      learningRateModifier: 0.1, // Fast adapters
    },
  },

  battle_royale: {
    ratings: {
      clutchFactor: 8,
      gameSense: 3,
      communication: -5, // Solo-focused background
      utilityUsage: -5,
    },
    development: {
      peakAgeModifier: 0,
      volatilityModifier: 0.1, // High variance
      learningRateModifier: 0,
    },
  },

  unknown_talent: {
    ratings: {}, // No modifiers - pure random
    development: {
      peakAgeModifier: 0,
      volatilityModifier: 0.15, // Most unpredictable
      learningRateModifier: 0,
    },
  },
};

/**
 * Background weights for random generation
 * Higher = more common
 */
export const BACKGROUND_WEIGHTS: Record<PlayerBackground, number> = {
  valorant_native: 40,
  csgo_veteran: 25,
  overwatch_player: 15,
  battle_royale: 12,
  unknown_talent: 8,
};