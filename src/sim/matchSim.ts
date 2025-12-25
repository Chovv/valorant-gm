// src/sim/matchSim.ts
// Match simulation for ValorantGM - Duel-based system inspired by Python sim

import type { Player, MatchResult, MatchFormat, PlayerMapStats, Role, Team } from '../types';
import type { StartingSlot } from '../types/roster';
import { getRolePenalty } from '../types/roster';
import { randomInt } from '../utils/random';
import type { RNG } from '../utils/random';
import { calculateIGLBonus } from './iglBonus';

const MAPS = ['Ascent', 'Bind', 'Haven', 'Split', 'Icebox', 'Breeze', 'Fracture', 'Pearl', 'Lotus', 'Sunset'];

// Default agents by role (used when player has no agent pool)
const DEFAULT_AGENTS_BY_ROLE: Record<string, string[]> = {
  duelist: ['jett', 'raze', 'phoenix', 'reyna', 'yoru', 'neon', 'iso'],
  controller: ['omen', 'brimstone', 'astra', 'viper', 'harbor', 'clove'],
  initiator: ['sova', 'breach', 'skye', 'kayo', 'fade', 'gekko'],
  sentinel: ['killjoy', 'cypher', 'sage', 'chamber', 'deadlock', 'vyse'],
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
 * Select an agent for a player based on their agent pool, avoiding already-used agents
 * Uses squared weights so high-comfort agents are MUCH more likely to be picked
 * 
 * IMPORTANT: If player is assigned to an off-role, ignore their agent pool
 * and pick from default agents for the ASSIGNED role instead.
 * (e.g., a duelist playing controller should pick Omen/Astra, not Jett/Raze)
 * 
 * For flex players: only use their agent pool if it contains agents that match
 * the assigned role. Otherwise, pick from default agents for that role.
 */
function selectAgentForPlayer(
  rng: RNG, 
  player: Player, 
  usedAgents: Set<string>,
  assignedRole: Role
): string {
  const isPlayingNaturalRole = player.role === assignedRole;
  const isFlexPlayer = player.role === 'flex';
  
  // Get agents that are valid for the assigned role
  const assignedRoleAgents = new Set(DEFAULT_AGENTS_BY_ROLE[assignedRole] || []);
  
  // For flex players, check if their agent pool has any agents for the assigned role
  const agentPool = player.agentPool || {};
  const poolAgentsForRole = Object.entries(agentPool).filter(
    ([agent]) => assignedRoleAgents.has(agent)
  );
  const hasAgentsForAssignedRole = poolAgentsForRole.length > 0;
  
  // Use agent pool if:
  // 1. Playing natural role (duelist playing duelist), OR
  // 2. Flex player who has agents in pool that match the assigned role
  const shouldUseAgentPool = isPlayingNaturalRole || (isFlexPlayer && hasAgentsForAssignedRole);
  
  if (shouldUseAgentPool) {
    // If flex player assigned to a specific role, only consider agents for that role
    const relevantAgents = isFlexPlayer && !isPlayingNaturalRole
      ? poolAgentsForRole
      : Object.entries(agentPool);
    
    if (relevantAgents.length > 0) {
      const availableAgents = relevantAgents.filter(([agent]) => !usedAgents.has(agent));
      
      if (availableAgents.length > 0) {
        // Use SQUARED weights so high-comfort agents are heavily favored
        const squaredWeights = availableAgents.map(([agent, comfort]) => ({
          agent,
          weight: comfort * comfort
        }));
        
        const totalWeight = squaredWeights.reduce((sum, entry) => sum + entry.weight, 0);
        let roll = rng() * totalWeight;
        
        for (const { agent, weight } of squaredWeights) {
          roll -= weight;
          if (roll <= 0) {
            return agent;
          }
        }
        // Fallback to highest comfort agent
        return availableAgents.sort((a, b) => b[1] - a[1])[0][0];
      }
    }
  }
  
  // Playing off-role OR no matching agents in pool: pick from default agents for ASSIGNED role
  const roleAgents = DEFAULT_AGENTS_BY_ROLE[assignedRole] || DEFAULT_AGENTS_BY_ROLE.duelist;
  const availableRoleAgents = roleAgents.filter(agent => !usedAgents.has(agent));
  
  if (availableRoleAgents.length > 0) {
    return availableRoleAgents[randomInt(rng, 0, availableRoleAgents.length - 1)];
  }
  
  // Last resort: pick any unused agent from any role
  const allAgents = Object.values(DEFAULT_AGENTS_BY_ROLE).flat();
  const anyAvailable = allAgents.filter(agent => !usedAgents.has(agent));
  
  if (anyAvailable.length > 0) {
    return anyAvailable[randomInt(rng, 0, anyAvailable.length - 1)];
  }
  
  // Absolute fallback (should never happen with 20+ agents and 5 players)
  return roleAgents[0];
}

/**
 * Calculate player's effective "pIndex" (power index) for duels
 * Based on their overall rating, role bonuses, agent proficiency, and role fit
 */
function getPlayerPIndex(player: Player, agent: string, assignedRole: Role, iglBonus: number = 0): number {
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
  
  // Agent proficiency bonus/penalty
  // Only applies if the agent is in their pool (meaning they're comfortable on it)
  const agentComfort = player.agentPool?.[agent];
  if (agentComfort !== undefined) {
    // Player has this agent in their pool - apply comfort bonus
    // Scale: 50 comfort = baseline, 100 = +100 pIndex (~10 OVR boost), 0 = -100 pIndex
    const proficiencyBonus = (agentComfort - 50) * 2.0;
    pIndex += proficiencyBonus;
  } else {
    // Agent not in pool (off-role pick or random selection) - no comfort bonus
    pIndex += 0;
  }
  
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
  const attackerPIndex = getPlayerPIndex(attacker.player, attacker.agent, attacker.assignedRole, attacker.iglBonus);
  const defenderPIndex = getPlayerPIndex(defender.player, defender.agent, defender.assignedRole, defender.iglBonus);
  
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
  awayIglBonus: number
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
      const agent = selectAgentForPlayer(rng, entry.player, homeUsedAgents, entry.assignedRole);
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
      };
    }),
    roundsWon: 0,
  };
  
  const awayTeam: TeamMapState = {
    id: awayTeamId,
    players: awayLineup.map(entry => {
      const agent = selectAgentForPlayer(rng, entry.player, awayUsedAgents, entry.assignedRole);
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
      awayIglBonus
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