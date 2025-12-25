// src/sim/agentSelection.ts
// Agent selection and team composition for matches

import type { RNG } from '../utils/random';
import type { Player } from '../types';
import type { MapName } from './matchSim';
import type { AgentName, AgentMapMeta } from '../data/agents';
import { DEFAULT_AGENT_META, AGENT_ROLES, tierToModifier, getAgentsForRole } from '../data/agents';
import { calculateCompSynergy } from '../data/agentSynergies';
import { randomPick } from '../utils/random';

/**
 * Selected agent for a player in a match
 */
export interface PlayerAgentSelection {
  playerId: string;
  playerName: string;
  agent: AgentName;
  comfort: number;        // Player's comfort with this agent (0-100)
  mapFit: number;         // How good this agent is on the map (modifier)
  effectiveRating: number; // Combined modifier for performance
}

/**
 * Team's agent composition for a map
 */
export interface TeamComposition {
  selections: PlayerAgentSelection[];
  synergyBonus: number;    // Team comp synergy (-10 to +10)
  roleBalance: boolean;    // Has all roles covered
}

/**
 * Get a player's best agent for a specific map
 */
export function getBestAgentForMap(
  player: Player,
  map: MapName,
  meta: AgentMapMeta = DEFAULT_AGENT_META,
  excludeAgents: AgentName[] = []
): { agent: AgentName; comfort: number; mapFit: number } | null {
  const availableAgents = Object.entries(player.agentPool)
    .filter(([agent]) => !excludeAgents.includes(agent as AgentName))
    .map(([agent, comfort]) => ({
      agent: agent as AgentName,
      comfort,
      mapFit: tierToModifier(meta[agent as AgentName]?.[map] ?? 'C'),
    }));

  if (availableAgents.length === 0) return null;

  // Score = comfort * mapFit (weighted toward comfort slightly)
  availableAgents.sort((a, b) => {
    const scoreA = a.comfort * 0.6 + a.mapFit * 100 * 0.4;
    const scoreB = b.comfort * 0.6 + b.mapFit * 100 * 0.4;
    return scoreB - scoreA;
  });

  return availableAgents[0];
}

/**
 * Select agents for a team on a specific map
 */
export function selectTeamAgents(
  rng: RNG,
  players: Player[],
  map: MapName,
  meta: AgentMapMeta = DEFAULT_AGENT_META
): TeamComposition {
  const selections: PlayerAgentSelection[] = [];
  const usedAgents: AgentName[] = [];

  // Sort players by role priority (controllers first - smokes are essential)
  const rolePriority: Record<string, number> = {
    controller: 0,
    sentinel: 1,
    initiator: 2,
    duelist: 3,
  };

  const sortedPlayers = [...players].sort(
    (a, b) => rolePriority[a.role] - rolePriority[b.role]
  );

  for (const player of sortedPlayers) {
    const best = getBestAgentForMap(player, map, meta, usedAgents);

    if (best) {
      usedAgents.push(best.agent);

      const effectiveRating = calculateEffectiveRating(best.comfort, best.mapFit);

      selections.push({
        playerId: player.id,
        playerName: player.name,
        agent: best.agent,
        comfort: best.comfort,
        mapFit: best.mapFit,
        effectiveRating,
      });
    } else {
      // Player has no available agents - force a default from their role
      const roleAgents = getAgentsForRole(player.role);
      const available = roleAgents.filter(a => !usedAgents.includes(a));
      const forcedAgent = available.length > 0 ? randomPick(rng, available) : roleAgents[0];

      usedAgents.push(forcedAgent);

      const mapFit = tierToModifier(meta[forcedAgent]?.[map] ?? 'C');
      const comfort = 25; // Very uncomfortable

      selections.push({
        playerId: player.id,
        playerName: player.name,
        agent: forcedAgent,
        comfort,
        mapFit,
        effectiveRating: calculateEffectiveRating(comfort, mapFit),
      });
    }
  }

  // Calculate synergy bonus
  const synergyBonus = calculateSynergyBonus(selections);

  // Check role balance
  const roles = new Set(selections.map(s => AGENT_ROLES[s.agent]));
  const roleBalance = roles.has('controller') && roles.has('duelist');

  return {
    selections,
    synergyBonus,
    roleBalance,
  };
}

/**
 * Calculate effective rating modifier from comfort and map fit
 * Returns a multiplier (0.7 to 1.15)
 */
function calculateEffectiveRating(comfort: number, mapFit: number): number {
  // Comfort: 0-100 -> 0.7 to 1.1 multiplier
  const comfortMod = 0.7 + (comfort / 100) * 0.4;

  // Map fit is already a multiplier (0.85 to 1.15)
  // Combine them (comfort weighted slightly more)
  const combined = comfortMod * 0.6 + mapFit * 0.4;

  return Math.round(combined * 100) / 100;
}

/**
 * Calculate team composition synergy bonus
 */
function calculateSynergyBonus(selections: PlayerAgentSelection[]): number {
  const agents = selections.map(s => s.agent);

  // Use the data-driven synergy calculator
  const { total: synergyTotal } = calculateCompSynergy(agents);

  let bonus = synergyTotal;

  // Bonus for high average comfort
  const avgComfort = selections.reduce((sum, s) => sum + s.comfort, 0) / selections.length;
  if (avgComfort >= 80) bonus += 2;
  if (avgComfort < 50) bonus -= 3;

  return Math.max(-10, Math.min(10, bonus));
}

/**
 * Get the team's overall agent advantage for a map
 * Positive = advantage, negative = disadvantage
 */
export function calculateAgentAdvantage(
  homeComp: TeamComposition,
  awayComp: TeamComposition
): number {
  const homeAvgRating = homeComp.selections.reduce((sum, s) => sum + s.effectiveRating, 0) / homeComp.selections.length;
  const awayAvgRating = awayComp.selections.reduce((sum, s) => sum + s.effectiveRating, 0) / awayComp.selections.length;

  const ratingDiff = (homeAvgRating - awayAvgRating) * 20; // Scale to meaningful range
  const synergyDiff = homeComp.synergyBonus - awayComp.synergyBonus;

  return ratingDiff + synergyDiff;
}

/**
 * Display a team composition nicely
 */
export function formatComposition(comp: TeamComposition): string {
  return comp.selections
    .map(s => `${s.playerName}: ${s.agent} (${s.comfort}% comfort, ${(s.mapFit * 100).toFixed(0)}% map fit)`)
    .join('\n');
}