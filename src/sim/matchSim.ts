// src/sim/matchSim.ts
// Match simulation for ValorantGM - Duel-based system inspired by Python sim

import type { Player, MatchResult, MatchFormat, PlayerMapStats, Role, Team } from '../types';
import type { StartingSlot } from '../types/roster';
import { getRolePenalty } from '../types/roster';
import { randomInt } from '../utils/random';
import type { RNG } from '../utils/random';
import { calculateIGLBonus } from './iglBonus';
import { getCompositionPenalty } from './compositionBonus';

const MAPS = ['Ascent', 'Bind', 'Haven', 'Split', 'Icebox', 'Breeze', 'Fracture', 'Pearl', 'Lotus', 'Sunset'];

// Default agents by role (used when player has no agent pool)
const DEFAULT_AGENTS_BY_ROLE: Record<string, string[]> = {
  duelist: ['jett', 'raze', 'phoenix', 'reyna', 'yoru', 'neon', 'iso', 'waylay'],
  controller: ['omen', 'brimstone', 'astra', 'viper', 'harbor', 'clove'],
  initiator: ['sova', 'breach', 'skye', 'kayo', 'fade', 'gekko', 'tejo'],
  sentinel: ['killjoy', 'cypher', 'sage', 'chamber', 'deadlock', 'vyse', 'veto'],
  flex: ['jett', 'raze', 'omen', 'sova', 'skye', 'killjoy'], // Flex can play various agents
};

/**
 * Player state during a round
 */
interface PlayerRoundState {
  player: Player;
  assignedRole: Role;          // The role they're playing (may differ from natural role)
  agent: string;               // Agent selected for this map
  alive: boolean;
  health: number;
  kills: number;
  deaths: number;
  assists: number;
  firstKills: number;          // Track actual first kills
  firstDeaths: number;         // Track actual first deaths
  damagedBy: Set<string>;      // Track all players who damaged this player in the round
  roundKills: number;
  iglBonus: number;            // IGL leadership bonus/penalty
  compositionPenalty: number;  // Penalty for missing core roles in lineup
}

/**
 * Team state during a map
 */
interface TeamMapState {
  id: string;
  players: PlayerRoundState[];
  roundsWon: number;
}

/**
 * Agent priority system:
 * Priority 1 (value 100): Main agent - ~70% pick rate, +3 OVR
 * Priority 2 (value 50): Secondary - ~25% pick rate, +2 OVR
 * Priority 3 (value 25): Pocket pick - ~5% pick rate, +1 OVR
 * Forced (not in pool): -5 OVR
 */
const PRIORITY_OVR_BONUS: Record<number, number> = {
  100: 3,   // Priority 1: +3 OVR
  50: 2,    // Priority 2: +2 OVR
  25: 1,    // Priority 3: +1 OVR
};
const FORCED_AGENT_PENALTY = -5; // Not in agent pool

/**
 * Get OVR modifier based on agent priority
 */
function getAgentOvrModifier(agentPool: Record<string, number> | undefined, agent: string): number {
  if (!agentPool || agentPool[agent] === undefined) {
    return FORCED_AGENT_PENALTY; // Forced onto agent not in pool
  }
  
  const priority = agentPool[agent];
  if (priority >= 75) return PRIORITY_OVR_BONUS[100];  // Priority 1
  if (priority >= 40) return PRIORITY_OVR_BONUS[50];   // Priority 2
  if (priority >= 1) return PRIORITY_OVR_BONUS[25];    // Priority 3
  return FORCED_AGENT_PENALTY;
}

/**
 * Select an agent for a player based on their agent pool priority, avoiding already-used agents
 * Uses weighted selection based on priority values
 * 
 * RULES:
 * - Non-flex players: Can only use agents that belong to their ASSIGNED role
 * - Flex players (natural role = flex): Can use ANY agent in their pool regardless of assigned role
 * - If no valid agents in pool, pick randomly from default agents for the assigned role (forced pick)
 * 
 * Returns both the selected agent and whether it was a forced pick (not in their pool)
 */
function selectAgentForPlayer(
  rng: RNG, 
  player: Player, 
  usedAgents: Set<string>,
  assignedRole: Role
): { agent: string; isForced: boolean } {
  const agentPool = player.agentPool || {};
  const isFlexPlayer = player.role === 'flex';
  
  // For flex players: use ANY agent in their pool
  // For non-flex players: only use agents valid for the assigned role
  let validPoolAgents: [string, number][];
  
  if (isFlexPlayer) {
    // Flex players can use any agent in their pool
    validPoolAgents = Object.entries(agentPool);
  } else {
    // Non-flex players must use agents for their assigned role
    const validAgentsForRole = new Set(DEFAULT_AGENTS_BY_ROLE[assignedRole] || []);
    validPoolAgents = Object.entries(agentPool).filter(
      ([agent]) => validAgentsForRole.has(agent)
    );
  }
  
  // If player has valid agents in their pool, use those
  if (validPoolAgents.length > 0) {
    const availableAgents = validPoolAgents.filter(([agent]) => !usedAgents.has(agent));
    
    if (availableAgents.length > 0) {
      // Use squared weights so higher priority agents are heavily favored
      // Priority 1 (100): weight = 10000
      // Priority 2 (50): weight = 2500
      // Priority 3 (25): weight = 625
      const squaredWeights = availableAgents.map(([agent, priority]) => ({
        agent,
        weight: priority * priority
      }));
      
      const totalWeight = squaredWeights.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = rng() * totalWeight;
      
      for (const { agent, weight } of squaredWeights) {
        roll -= weight;
        if (roll <= 0) {
          return { agent, isForced: false };
        }
      }
      // Fallback to highest priority agent
      const sorted = availableAgents.sort((a, b) => b[1] - a[1]);
      return { agent: sorted[0][0], isForced: false };
    }
  }
  
  // No matching agents in pool: pick randomly from default agents for the assigned role
  // This is a "forced" pick - player gets penalty
  const roleAgents = DEFAULT_AGENTS_BY_ROLE[assignedRole] || DEFAULT_AGENTS_BY_ROLE.duelist;
  const availableRoleAgents = roleAgents.filter(agent => !usedAgents.has(agent));
  
  if (availableRoleAgents.length > 0) {
    return { 
      agent: availableRoleAgents[randomInt(rng, 0, availableRoleAgents.length - 1)], 
      isForced: true 
    };
  }
  
  // Last resort: pick any unused agent from any role (shouldn't happen normally)
  const allAgents = Object.values(DEFAULT_AGENTS_BY_ROLE).flat();
  const anyAvailable = allAgents.filter(agent => !usedAgents.has(agent));
  
  if (anyAvailable.length > 0) {
    return { 
      agent: anyAvailable[randomInt(rng, 0, anyAvailable.length - 1)], 
      isForced: true 
    };
  }
  
  // Absolute fallback (should never happen with 20+ agents and 5 players)
  return { agent: roleAgents[0], isForced: true };
}

/**
 * Calculate player's effective "pIndex" (power index) for duels
 * Based on their overall rating, role bonuses, agent proficiency, and role fit
 */
function getPlayerPIndex(player: Player, agent: string, assignedRole: Role, iglBonus: number = 0, compositionPenalty: number = 0): number {
  let pIndex = player.overall * 10; // Base from overall (0-100 -> 0-1000)
  
  // Add aim as major factor
  pIndex += player.ratings.aim * 3;
  
  // Role bonuses based on ASSIGNED role (not natural role)
  switch (assignedRole) {
    case 'duelist':
      pIndex += 70; // Duelists more likely to win duels
      break;
    case 'initiator':
      pIndex += 30;
      break;
    case 'controller':
      pIndex += 20;
      break;
    case 'sentinel':
      pIndex += 10;
      break;
    case 'flex':
      pIndex += 40; // Flex players are versatile
      break;
  }
  
  // Clutch factor helps in 1vX situations
  pIndex += player.ratings.clutchFactor * 0.5;
  
  // IGL bonus - affects communication, game sense, utility usage
  // Scale: +4 bonus = +80 pIndex (~8 OVR equivalent)
  pIndex += iglBonus * 20;
  
  // Composition penalty - missing core roles hurts the whole team
  // Scale: -1 penalty = -10 pIndex (~1 OVR equivalent)
  pIndex += compositionPenalty * 10;
  
  // Agent proficiency bonus/penalty based on priority
  // Priority 1: +3 OVR = +30 pIndex
  // Priority 2: +2 OVR = +20 pIndex
  // Priority 3: +1 OVR = +10 pIndex
  // Forced: -5 OVR = -50 pIndex
  const agentOvrMod = getAgentOvrModifier(player.agentPool, agent);
  pIndex += agentOvrMod * 10;
  
  // Role mismatch penalty
  // Players perform worse when playing outside their natural role
  const rolePenalty = getRolePenalty(player.role, assignedRole);
  pIndex += rolePenalty * 10; // Scale penalty to pIndex (e.g., -12 OVR -> -120 pIndex)
  
  return pIndex;
}

/**
 * Simulate a duel between two players using Elo-style probability
 */
function simulateDuel(
  rng: RNG,
  attacker: PlayerRoundState,
  defender: PlayerRoundState
): 'attacker' | 'defender' {
  const attackerPIndex = getPlayerPIndex(attacker.player, attacker.agent, attacker.assignedRole, attacker.iglBonus, attacker.compositionPenalty);
  const defenderPIndex = getPlayerPIndex(defender.player, defender.agent, defender.assignedRole, defender.iglBonus, defender.compositionPenalty);
  
  const advantage = attackerPIndex - defenderPIndex;
  // Elo formula: win probability = 1 / (1 + 10^(-advantage/400))
  const winProb = 1 / (1 + Math.pow(10, -advantage / 400));
  
  return rng() < winProb ? 'attacker' : 'defender';
}

/**
 * Select a random alive player from a team
 */
function selectAlivePlayer(rng: RNG, team: TeamMapState): PlayerRoundState | null {
  const alivePlayers = team.players.filter(p => p.alive);
  if (alivePlayers.length === 0) return null;
  return alivePlayers[randomInt(rng, 0, alivePlayers.length - 1)];
}

/**
 * Award assist to a random teammate who "helped" with the kill
 * This simulates utility usage, info gathering, trading, etc.
 */
function maybeAwardAssist(
  rng: RNG,
  killer: PlayerRoundState,
  victim: PlayerRoundState,
  killerTeam: TeamMapState,
  allPlayers: PlayerRoundState[]
): void {
  // Check if victim was damaged by someone else first (from damagedBy set)
  const assistCandidatesFromDamage = Array.from(victim.damagedBy)
    .filter(id => id !== killer.player.id)
    .map(id => allPlayers.find(p => p.player.id === id))
    .filter((p): p is PlayerRoundState => p !== undefined && p.alive);
  
  if (assistCandidatesFromDamage.length > 0) {
    // Award assist to someone who damaged the victim
    const assister = assistCandidatesFromDamage[randomInt(rng, 0, assistCandidatesFromDamage.length - 1)];
    assister.assists++;
    return;
  }
  
  // Otherwise, chance for a teammate to get an assist (utility, flash, info, etc.)
  // Higher chance for initiators and controllers
  const aliveTeammates = killerTeam.players.filter(p => p.alive && p.player.id !== killer.player.id);
  
  if (aliveTeammates.length === 0) return;
  
  // Base 40% chance for an assist, modified by team composition
  let assistChance = 0.4;
  
  // Initiators and controllers boost assist chance
  for (const teammate of aliveTeammates) {
    if (teammate.player.role === 'initiator') assistChance += 0.1;
    if (teammate.player.role === 'controller') assistChance += 0.08;
    if (teammate.player.role === 'sentinel') assistChance += 0.05;
  }
  
  assistChance = Math.min(0.7, assistChance); // Cap at 70%
  
  if (rng() < assistChance) {
    // Weight assist towards initiators/controllers
    const weightedTeammates: PlayerRoundState[] = [];
    for (const teammate of aliveTeammates) {
      let weight = 1;
      switch (teammate.player.role) {
        case 'initiator': weight = 4; break; // Most likely to assist (flashes, recon)
        case 'controller': weight = 3; break; // Smokes, util
        case 'sentinel': weight = 2; break; // Info, slows
        case 'duelist': weight = 1; break; // Trade kills
        case 'flex': weight = 2; break; // Varies
      }
      // Also factor in utility usage rating
      weight *= (teammate.player.ratings.utilityUsage / 70);
      for (let i = 0; i < Math.ceil(weight); i++) {
        weightedTeammates.push(teammate);
      }
    }
    
    if (weightedTeammates.length > 0) {
      const assister = weightedTeammates[randomInt(rng, 0, weightedTeammates.length - 1)];
      assister.assists++;
    }
  }
}

/**
 * Simulate a single round
 * Returns info about who got the first kill
 */
function simulateRound(
  rng: RNG,
  team1: TeamMapState,
  team2: TeamMapState
): 'team1' | 'team2' {
  // Reset all players for the round
  for (const p of [...team1.players, ...team2.players]) {
    p.alive = true;
    p.health = 100;
    p.damagedBy = new Set();
    p.roundKills = 0;
  }
  
  // Randomly pick attacking/defending team
  const [attackingTeam, defendingTeam] = rng() < 0.5 ? [team1, team2] : [team2, team1];
  
  const maxDuels = 20; // Safety limit
  let duelCount = 0;
  let firstKillAwarded = false; // Track if first kill has been awarded this round
  const allPlayers = [...team1.players, ...team2.players];
  
  // Simulate duels until one team is eliminated or max duels reached
  while (duelCount < maxDuels) {
    const attackingAlive = attackingTeam.players.filter(p => p.alive).length;
    const defendingAlive = defendingTeam.players.filter(p => p.alive).length;
    
    if (attackingAlive === 0 || defendingAlive === 0) break;
    
    const attacker = selectAlivePlayer(rng, attackingTeam);
    const defender = selectAlivePlayer(rng, defendingTeam);
    
    if (!attacker || !defender) break;
    
    // Before the duel, there's a chance for chip damage / utility from teammates
    // This sets up potential assists
    if (rng() < 0.3) {
      // Someone on attacker's team damages defender first (flash, molly, etc.)
      const helpers = attackingTeam.players.filter(p => p.alive && p.player.id !== attacker.player.id);
      if (helpers.length > 0) {
        const helper = helpers[randomInt(rng, 0, helpers.length - 1)];
        defender.damagedBy.add(helper.player.id);
      }
    }
    if (rng() < 0.3) {
      // Someone on defender's team damages attacker first
      const helpers = defendingTeam.players.filter(p => p.alive && p.player.id !== defender.player.id);
      if (helpers.length > 0) {
        const helper = helpers[randomInt(rng, 0, helpers.length - 1)];
        attacker.damagedBy.add(helper.player.id);
      }
    }
    
    const winner = simulateDuel(rng, attacker, defender);
    
    if (winner === 'attacker') {
      // Attacker wins - defender dies
      defender.alive = false;
      defender.health = 0;
      defender.deaths++;
      attacker.kills++;
      attacker.roundKills++;
      
      // First kill of the round
      if (!firstKillAwarded) {
        attacker.firstKills++;
        defender.firstDeaths++;
        firstKillAwarded = true;
      }
      
      // Award assist
      maybeAwardAssist(rng, attacker, defender, attackingTeam, allPlayers);
    } else {
      // Defender wins - attacker dies
      attacker.alive = false;
      attacker.health = 0;
      attacker.deaths++;
      defender.kills++;
      defender.roundKills++;
      
      // First kill of the round
      if (!firstKillAwarded) {
        defender.firstKills++;
        attacker.firstDeaths++;
        firstKillAwarded = true;
      }
      
      // Award assist
      maybeAwardAssist(rng, defender, attacker, defendingTeam, allPlayers);
    }
    
    duelCount++;
  }
  
  // Determine winner based on remaining players
  const team1Alive = team1.players.filter(p => p.alive).length;
  const team2Alive = team2.players.filter(p => p.alive).length;
  
  if (team1Alive > team2Alive) {
    team1.roundsWon++;
    return 'team1';
  } else if (team2Alive > team1Alive) {
    team2.roundsWon++;
    return 'team2';
  } else {
    // Tie-breaker: random (rare case)
    if (rng() < 0.5) {
      team1.roundsWon++;
      return 'team1';
    } else {
      team2.roundsWon++;
      return 'team2';
    }
  }
}

/**
 * Lineup entry for simulation - player with their assigned role
 */
interface LineupEntry {
  player: Player;
  assignedRole: Role;
}

/**
 * Simulate a single map and return player stats
 */
function simulateMap(
  rng: RNG,
  homeTeamId: string,
  awayTeamId: string,
  homeLineup: LineupEntry[],
  awayLineup: LineupEntry[],
  mapName: string,
  homeIglId: string | null,
  awayIglId: string | null,
  homeIglBonus: number,
  awayIglBonus: number,
  homeCompPenalty: number,
  awayCompPenalty: number
): { 
  homeRounds: number; 
  awayRounds: number; 
  map: string; 
  homePlayerStats: PlayerMapStats[]; 
  awayPlayerStats: PlayerMapStats[];
} {
  // Initialize team states with agent selection (no duplicates per team)
  const homeUsedAgents = new Set<string>();
  const awayUsedAgents = new Set<string>();
  
  const homeTeam: TeamMapState = {
    id: homeTeamId,
    players: homeLineup.map(entry => {
      const { agent } = selectAgentForPlayer(rng, entry.player, homeUsedAgents, entry.assignedRole);
      homeUsedAgents.add(agent);
      // IGL doesn't get their own bonus
      const playerIglBonus = entry.player.id === homeIglId ? 0 : homeIglBonus;
      return {
        player: entry.player,
        assignedRole: entry.assignedRole,
        agent,
        alive: true,
        health: 100,
        kills: 0,
        deaths: 0,
        assists: 0,
        firstKills: 0,
        firstDeaths: 0,
        damagedBy: new Set(),
        roundKills: 0,
        iglBonus: playerIglBonus,
        compositionPenalty: homeCompPenalty,
      };
    }),
    roundsWon: 0,
  };
  
  const awayTeam: TeamMapState = {
    id: awayTeamId,
    players: awayLineup.map(entry => {
      const { agent } = selectAgentForPlayer(rng, entry.player, awayUsedAgents, entry.assignedRole);
      awayUsedAgents.add(agent);
      // IGL doesn't get their own bonus
      const playerIglBonus = entry.player.id === awayIglId ? 0 : awayIglBonus;
      return {
        player: entry.player,
        assignedRole: entry.assignedRole,
        agent,
        alive: true,
        health: 100,
        kills: 0,
        deaths: 0,
        assists: 0,
        firstKills: 0,
        firstDeaths: 0,
        damagedBy: new Set(),
        roundKills: 0,
        iglBonus: playerIglBonus,
        compositionPenalty: awayCompPenalty,
      };
    }),
    roundsWon: 0,
  };
  
  // Play rounds until someone wins (first to 13, must win by 2 in OT)
  while (true) {
    // Check for win condition
    const homeRounds = homeTeam.roundsWon;
    const awayRounds = awayTeam.roundsWon;
    
    // Regular win (13 rounds, other team has <12)
    if (homeRounds >= 13 && awayRounds < 12) break;
    if (awayRounds >= 13 && homeRounds < 12) break;
    
    // Overtime win (both >= 12, need 2 round lead)
    if (homeRounds >= 12 && awayRounds >= 12) {
      if (Math.abs(homeRounds - awayRounds) >= 2) break;
    }
    
    // Safety limit
    if (homeRounds + awayRounds > 50) break;
    
    simulateRound(rng, homeTeam, awayTeam);
  }
  
  const totalRounds = homeTeam.roundsWon + awayTeam.roundsWon;
  
  // Convert player states to stats - use actual tracked firstKills/firstDeaths
  const homePlayerStats: PlayerMapStats[] = homeTeam.players.map(p => {
    // Calculate ACS based on kills, assists, and rounds
    const acs = Math.round(
      ((p.kills * 200 + p.assists * 50) / Math.max(1, totalRounds)) +
      randomInt(rng, -15, 15)
    );
    
    return {
      playerId: p.player.id,
      agent: p.agent,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      acs: Math.max(50, Math.min(350, acs)),
      firstKills: p.firstKills,
      firstDeaths: p.firstDeaths,
    };
  });
  
  const awayPlayerStats: PlayerMapStats[] = awayTeam.players.map(p => {
    const acs = Math.round(
      ((p.kills * 200 + p.assists * 50) / Math.max(1, totalRounds)) +
      randomInt(rng, -15, 15)
    );
    
    return {
      playerId: p.player.id,
      agent: p.agent,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      acs: Math.max(50, Math.min(350, acs)),
      firstKills: p.firstKills,
      firstDeaths: p.firstDeaths,
    };
  });
  
  return {
    map: mapName,
    homeRounds: homeTeam.roundsWon,
    awayRounds: awayTeam.roundsWon,
    homePlayerStats,
    awayPlayerStats,
  };
}

/**
 * Simulate a full match (Bo1, Bo3, or Bo5)
 * Accepts either a full lineup with assigned roles, or a simple roster (uses natural roles)
 */
export function simulateMatch(
  rng: RNG,
  homeTeamId: string,
  awayTeamId: string,
  homeRoster: Player[],
  awayRoster: Player[],
  format: MatchFormat,
  homeStartingLineup?: StartingSlot[],
  awayStartingLineup?: StartingSlot[],
  homeTeam?: Team,
  awayTeam?: Team
): MatchResult {
  // Convert roster to lineup entries
  // If startingLineup provided, use those roles; otherwise use natural roles
  const homeLineup: LineupEntry[] = homeStartingLineup
    ? homeStartingLineup.map(slot => {
        const player = homeRoster.find(p => p.id === slot.playerId);
        if (!player) throw new Error(`Player ${slot.playerId} not found in home roster`);
        return { player, assignedRole: slot.assignedRole };
      })
    : homeRoster.slice(0, 5).map(p => ({ player: p, assignedRole: p.role }));
  
  const awayLineup: LineupEntry[] = awayStartingLineup
    ? awayStartingLineup.map(slot => {
        const player = awayRoster.find(p => p.id === slot.playerId);
        if (!player) throw new Error(`Player ${slot.playerId} not found in away roster`);
        return { player, assignedRole: slot.assignedRole };
      })
    : awayRoster.slice(0, 5).map(p => ({ player: p, assignedRole: p.role }));

  // Calculate IGL bonuses for each team (must be after lineups are created)
  // Convert LineupEntry[] to StartingSlot[] format for calculateIGLBonus
  const homeLineupSlots: StartingSlot[] = homeLineup.map(entry => ({
    playerId: entry.player.id,
    assignedRole: entry.assignedRole,
  }));
  const awayLineupSlots: StartingSlot[] = awayLineup.map(entry => ({
    playerId: entry.player.id,
    assignedRole: entry.assignedRole,
  }));
  const homeIglBonus = homeTeam ? calculateIGLBonus(homeTeam, homeLineupSlots).bonus : 0;
  const awayIglBonus = awayTeam ? calculateIGLBonus(awayTeam, awayLineupSlots).bonus : 0;

  // Calculate composition penalties (missing core roles)
  const homeCompPenalty = getCompositionPenalty(homeLineupSlots);
  const awayCompPenalty = getCompositionPenalty(awayLineupSlots);

  const mapsToWin = format === 'bo1' ? 1 : format === 'bo3' ? 2 : 3;
  const mapScores: Array<{ 
    map: string; 
    homeRounds: number; 
    awayRounds: number; 
    homePlayerStats: PlayerMapStats[]; 
    awayPlayerStats: PlayerMapStats[];
  }> = [];
  
  // Select maps for the series
  const availableMaps = [...MAPS];
  const selectedMaps: string[] = [];
  for (let i = 0; i < mapsToWin * 2 - 1; i++) {
    const idx = randomInt(rng, 0, availableMaps.length - 1);
    selectedMaps.push(availableMaps.splice(idx, 1)[0]);
  }
  
  let homeScore = 0;
  let awayScore = 0;
  let mapIndex = 0;
  
  while (homeScore < mapsToWin && awayScore < mapsToWin && mapIndex < selectedMaps.length) {
    const mapResult = simulateMap(
      rng,
      homeTeamId,
      awayTeamId,
      homeLineup,
      awayLineup,
      selectedMaps[mapIndex],
      homeTeam?.iglId || null,
      awayTeam?.iglId || null,
      homeIglBonus,
      awayIglBonus,
      homeCompPenalty,
      awayCompPenalty
    );
    mapScores.push(mapResult);
    
    if (mapResult.homeRounds > mapResult.awayRounds) {
      homeScore++;
    } else {
      awayScore++;
    }
    
    mapIndex++;
  }
  
  return {
    id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    homeTeamId,
    awayTeamId,
    homeScore,
    awayScore,
    format,
    mapScores,
    date: 0,
    seed: String(Date.now()),
  };
}