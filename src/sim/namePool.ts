// src/sim/namePool.ts
// draws realistic gamer tags from the esports username pool

import type { Region } from '../types/team';
import type { RNG } from '../utils/random';
import { randomInt } from '../utils/random';
import { ESPORTS_USERNAMES } from '../data/esportsUsernames';

// tracks which names have been consumed — prevents duplicates
export interface NamePoolCtx {
  used: Set<string>;
}

// nationality code → pool key
const NAT_TO_POOL: Record<string, string> = {
  US: 'NA', CA: 'NA',
  BR: 'BR',
  CL: 'LATAM', AR: 'LATAM', MX: 'LATAM', CO: 'LATAM', PE: 'LATAM', UY: 'LATAM', PR: 'LATAM',
  KR: 'KR',
  JP: 'JP',
  PH: 'SEA', ID: 'SEA', TH: 'SEA', SG: 'SEA', IN: 'SEA', AU: 'SEA', VN: 'SEA', MY: 'SEA', TW: 'SEA',
  CN: 'CN', HK: 'CN', MO: 'CN',
  // everything else falls through to region-based lookup
};

// game region → pool keys to try (in order)
const REGION_POOLS: Record<Region, string[]> = {
  americas: ['NA', 'BR', 'LATAM'],
  emea: ['EMEA'],
  pacific: ['KR', 'JP', 'SEA'],
  china: ['CN'],
};

// try to pick an unused name from a specific pool key
function pickFromPool(rng: RNG, poolKey: string, used: Set<string>): string | null {
  const pool = ESPORTS_USERNAMES[poolKey];
  if (!pool || pool.length === 0) return null;

  // collect available names
  const available = pool.filter(n => !used.has(n));
  if (available.length === 0) return null;

  const idx = randomInt(rng, 0, available.length - 1);
  return available[idx];
}

// draw a name: nationality pool → region pools → null (caller falls back)
export function drawName(
  rng: RNG,
  used: Set<string>,
  nationality?: string,
  teamRegion?: Region,
): string | null {
  // try nationality-specific pool first
  if (nationality) {
    const natPool = NAT_TO_POOL[nationality];
    if (natPool) {
      const name = pickFromPool(rng, natPool, used);
      if (name) return name;
    }
    // nationality didn't map or pool exhausted — try EMEA as catch-all for unmapped euro/mena codes
    if (!natPool) {
      const name = pickFromPool(rng, 'EMEA', used);
      if (name) return name;
    }
  }

  // try region pools
  if (teamRegion) {
    const pools = REGION_POOLS[teamRegion];
    for (const key of pools) {
      const name = pickFromPool(rng, key, used);
      if (name) return name;
    }
  }

  // all pools exhausted for this nationality/region combo
  return null;
}

// build a NamePoolCtx from the game state's usedNames array, or null if disabled
export function buildNamePoolCtx(usedNames: string[], enabled: boolean): NamePoolCtx | null {
  if (!enabled) return null;
  return { used: new Set(usedNames) };
}
