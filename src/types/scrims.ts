// src/types/scrims.ts
// Types for the scrim system

import type { Ratings } from './player';
import type { Region, Team } from './team';
import type { MatchResult } from './league';

/**
 * Snapshot of a player's stats at season start
 * Used to track development over the season
 */
export interface SeasonStartStats {
  overall: number;
  ratings: Ratings;
  potential: {
    ceiling: number;
    floor: number;
  };
}

/**
 * Individual player stat change from a scrim
 */
export interface ScrimStatChange {
  playerId: string;
  playerName: string;
  changes: {
    stat: keyof Ratings | 'overall' | 'ceiling' | 'floor';
    oldValue: number;
    newValue: number;
    delta: number;
  }[];
}

/**
 * Result of a scrim session
 */
export interface ScrimResult {
  opponentName: string;
  opponentType: 'regional' | 'tier2';
  opponentTeamId: string; // For regional teams, or generated ID for tier2
  statChanges: ScrimStatChange[];
  day: number;
  year: number;
  matchResult: MatchResult; // The simulated match
  opponentTeam?: Team; // Store the team for tier2 (generated) or reference for regional
}

/**
 * Fatigue levels based on cumulative fatigue points
 * 0 = Fresh, 1-2 = Trained, 3-4 = Tired, 5+ = Exhausted
 */
export type FatigueLevel = 'fresh' | 'trained' | 'tired' | 'exhausted';

import type { Player } from './player';

/**
 * Tier 2 / Academy team configuration
 * These are always-available sparring partners
 */
export interface Tier2Team {
  id: string;
  name: string;
  abbreviation: string;
  region: Region;
  averageOVR: number; // Average team OVR for display purposes
  players?: Player[]; // Full player roster (5 players)
}

/**
 * Tier 2 teams by region - weaker sparring partners always available
 */
export const TIER2_TEAMS: Record<Region, Tier2Team[]> = {
  americas: [
    { id: 't2_sen_acad', name: 'Sentinels Academy', abbreviation: 'SEN.A', region: 'americas', averageOVR: 65 },
    { id: 't2_c9_acad', name: 'Cloud9 Academy', abbreviation: 'C9.A', region: 'americas', averageOVR: 63 },
    { id: 't2_100t_acad', name: '100 Thieves Academy', abbreviation: '100T.A', region: 'americas', averageOVR: 64 },
  ],
  emea: [
    { id: 't2_fnc_acad', name: 'Fnatic Rising', abbreviation: 'FNC.R', region: 'emea', averageOVR: 65 },
    { id: 't2_kc_acad', name: 'Karmine Corp Academy', abbreviation: 'KC.A', region: 'emea', averageOVR: 64 },
    { id: 't2_g2_acad', name: 'G2 Academy', abbreviation: 'G2.A', region: 'emea', averageOVR: 63 },
  ],
  pacific: [
    { id: 't2_prx_acad', name: 'Paper Rex Academy', abbreviation: 'PRX.A', region: 'pacific', averageOVR: 65 },
    { id: 't2_drx_acad', name: 'DRX Academy', abbreviation: 'DRX.A', region: 'pacific', averageOVR: 64 },
    { id: 't2_gen_acad', name: 'Gen.G Academy', abbreviation: 'GEN.A', region: 'pacific', averageOVR: 63 },
  ],
  china: [
    { id: 't2_edg_acad', name: 'EDward Gaming Youth', abbreviation: 'EDG.Y', region: 'china', averageOVR: 65 },
    { id: 't2_fpx_acad', name: 'FunPlus Phoenix Academy', abbreviation: 'FPX.A', region: 'china', averageOVR: 64 },
    { id: 't2_blg_acad', name: 'Bilibili Gaming Academy', abbreviation: 'BLG.A', region: 'china', averageOVR: 63 },
  ],
};

/**
 * Get fatigue level based on fatigue points
 */
export function getFatigueLevel(fatiguePoints: number): FatigueLevel {
  if (fatiguePoints === 0) return 'fresh';
  if (fatiguePoints <= 2) return 'trained';
  if (fatiguePoints <= 4) return 'tired';
  return 'exhausted';
}

/**
 * Get fatigue display info
 */
export function getFatigueDisplay(level: FatigueLevel): { label: string; color: string; icon: string } {
  switch (level) {
    case 'fresh':
      return { label: 'Fresh', color: '#4ade80', icon: '💪' };
    case 'trained':
      return { label: 'Trained', color: '#fbbf24', icon: '🏃' };
    case 'tired':
      return { label: 'Tired', color: '#fb923c', icon: '😓' };
    case 'exhausted':
      return { label: 'Exhausted', color: '#f87171', icon: '🥵' };
  }
}