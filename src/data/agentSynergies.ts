// src/data/agentSynergies.ts
// Agent synergy and anti-synergy definitions
// Easy to modify - just add/remove entries!

import type { AgentName } from './agents';

/**
 * Synergy definition
 */
export interface AgentSynergy {
  agents: [AgentName, AgentName];
  bonus: number;  // Positive = good synergy, negative = anti-synergy
  reason: string; // For display/tooltips
}

/**
 * All agent synergies
 * Positive bonus = good combo
 * Negative bonus = anti-synergy
 */
export const AGENT_SYNERGIES: AgentSynergy[] = [
  // Strong synergies (+3)
  { agents: ['viper', 'harbor'], bonus: 3, reason: 'Double wall pressure and area denial' },
  { agents: ['sova', 'cypher'], bonus: 3, reason: 'Complete info coverage' },
  
  // Good synergies (+2)
  { agents: ['sova', 'killjoy'], bonus: 2, reason: 'Info + lockdown combo' },
  { agents: ['raze', 'breach'], bonus: 2, reason: 'Aggressive entry combo' },
  { agents: ['gekko', 'fade'], bonus: 2, reason: 'Double info initiator' },
  { agents: ['jett', 'sova'], bonus: 2, reason: 'Classic recon + dash' },
  { agents: ['astra', 'jett'], bonus: 2, reason: 'Star pull + dash combo' },
  { agents: ['skye', 'kayo'], bonus: 2, reason: 'Flash + suppress combo' },
  { agents: ['killjoy', 'cypher'], bonus: 2, reason: 'Double sentinel lockdown' },
  { agents: ['breach', 'neon'], bonus: 2, reason: 'Stun + slide entry' },
  
  // Minor synergies (+1)
  { agents: ['omen', 'jett'], bonus: 1, reason: 'TP play potential' },
  { agents: ['sage', 'killjoy'], bonus: 1, reason: 'Defensive anchor combo' },
  { agents: ['brimstone', 'raze'], bonus: 1, reason: 'Area denial combo' },
  { agents: ['fade', 'raze'], bonus: 1, reason: 'Haunt + grenade combo' },
  { agents: ['viper', 'astra'], bonus: 1, reason: 'Toxic screen + star utility combo' },
  { agents: ['clove', 'reyna'], bonus: 1, reason: 'Self-sustain duo' },
  
  // Anti-synergies (-1)
  { agents: ['deadlock', 'sage'], bonus: -1, reason: 'Overlapping slow utility' },
  { agents: ['yoru', 'omen'], bonus: -1, reason: 'Competing for flanks' },
  { agents: ['chamber', 'jett'], bonus: -1, reason: 'Both want Op' },
  
  // Bad anti-synergies (-2)
  { agents: ['reyna', 'phoenix'], bonus: -2, reason: 'Both selfish fraggers' },
  { agents: ['iso', 'reyna'], bonus: -2, reason: 'No team utility' },
  { agents: ['yoru', 'neon'], bonus: -2, reason: 'Chaotic, uncoordinated' },
  
  // Terrible anti-synergies (-3)
  { agents: ['reyna', 'iso'], bonus: -3, reason: 'Zero team utility' },
];

/**
 * Lookup synergy between two agents
 * Returns 0 if no specific synergy defined
 */
export function getAgentSynergy(agent1: AgentName, agent2: AgentName): AgentSynergy | null {
  return AGENT_SYNERGIES.find(
    s => (s.agents[0] === agent1 && s.agents[1] === agent2) ||
         (s.agents[0] === agent2 && s.agents[1] === agent1)
  ) ?? null;
}

/**
 * Calculate total synergy bonus for a team comp
 */
export function calculateCompSynergy(agents: AgentName[]): { total: number; details: AgentSynergy[] } {
  const details: AgentSynergy[] = [];
  let total = 0;

  // Check all pairs
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const synergy = getAgentSynergy(agents[i], agents[j]);
      if (synergy) {
        details.push(synergy);
        total += synergy.bonus;
      }
    }
  }

  return { total, details };
}