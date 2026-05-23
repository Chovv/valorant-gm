// src/data/matchSimConfig.ts
// tunable match sim parameters exposed in dev tools

export interface MatchSimConfig {
  // per-weapon headshot % (0-1), keyed by weapon name
  headshotChance: Record<string, number>;
  // per-weapon wallbang % (0-1)
  wallbangChance: Record<string, number>;
  // combat
  tradeChance: number;        // chance a teammate swings after a kill (default 0.40)
  assistBaseChance: number;   // base chance for an assist (default 0.40)
  adaptationStrength: number; // multiplier on adaptation penalty (default 1.0, 0 = off)
  // economy — pIndex modifier per buy state
  buyStateMods: Record<string, number>;
  // momentum engine: 0 = off, 1 = normal, 2 = amplified ("legendary mode")
  momentumStrength: number;
}

export const DEFAULT_HEADSHOT_CHANCE: Record<string, number> = {
  'Sheriff': 0.38, 'Guardian': 0.36, 'Vandal': 0.30, 'Ghost': 0.28,
  'Marshal': 0.28, 'Bulldog': 0.24, 'Phantom': 0.22, 'Classic': 0.20,
  'Spectre': 0.18, 'Stinger': 0.14, 'Frenzy': 0.14, 'Ares': 0.10,
  'Odin': 0.08, 'Operator': 0.03, 'Bucky': 0.03, 'Shorty': 0.03,
};

export const DEFAULT_WALLBANG_CHANCE: Record<string, number> = {
  'Odin': 0.22, 'Operator': 0.15, 'Ares': 0.12, 'Guardian': 0.10,
  'Vandal': 0.08, 'Phantom': 0.08, 'Bulldog': 0.06, 'Marshal': 0.06,
  'Sheriff': 0.05, 'Spectre': 0.04, 'Stinger': 0.03, 'Ghost': 0.03,
  'Classic': 0.02, 'Frenzy': 0.02, 'Bucky': 0.01, 'Shorty': 0.01,
};

export const DEFAULT_BUY_STATE_MODS: Record<string, number> = {
  full: 0, half: -15, force: -18, eco: -40, save: -30, pistol: -25,
};

export const DEFAULT_MATCH_SIM_CONFIG: MatchSimConfig = {
  headshotChance: { ...DEFAULT_HEADSHOT_CHANCE },
  wallbangChance: { ...DEFAULT_WALLBANG_CHANCE },
  tradeChance: 0.40,
  assistBaseChance: 0.40,
  adaptationStrength: 1.0,
  buyStateMods: { ...DEFAULT_BUY_STATE_MODS },
  momentumStrength: 1,
};

// weapon display order for the UI table
export const WEAPON_ORDER = [
  'Vandal', 'Phantom', 'Operator', 'Guardian', 'Bulldog', 'Marshal',
  'Odin', 'Ares', 'Spectre', 'Stinger', 'Bucky', 'Shorty',
  'Sheriff', 'Ghost', 'Frenzy', 'Classic',
];

export const BUY_STATE_ORDER = ['full', 'half', 'force', 'eco', 'save', 'pistol'];
