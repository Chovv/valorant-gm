// src/data/agents.ts
// VALORANT agent data

import type { Role } from '../types';

export interface AgentInfo {
  id: string;
  displayName: string;
  role: Role;
}

export const AGENTS: AgentInfo[] = [
  // Duelists
  { id: 'jett', displayName: 'Jett', role: 'duelist' },
  { id: 'phoenix', displayName: 'Phoenix', role: 'duelist' },
  { id: 'reyna', displayName: 'Reyna', role: 'duelist' },
  { id: 'raze', displayName: 'Raze', role: 'duelist' },
  { id: 'yoru', displayName: 'Yoru', role: 'duelist' },
  { id: 'neon', displayName: 'Neon', role: 'duelist' },
  { id: 'iso', displayName: 'Iso', role: 'duelist' },
  { id: 'waylay', displayName: 'Waylay', role: 'duelist' },
  
  // Controllers
  { id: 'brimstone', displayName: 'Brimstone', role: 'controller' },
  { id: 'viper', displayName: 'Viper', role: 'controller' },
  { id: 'omen', displayName: 'Omen', role: 'controller' },
  { id: 'astra', displayName: 'Astra', role: 'controller' },
  { id: 'harbor', displayName: 'Harbor', role: 'controller' },
  { id: 'clove', displayName: 'Clove', role: 'controller' },
  
  // Initiators
  { id: 'sova', displayName: 'Sova', role: 'initiator' },
  { id: 'breach', displayName: 'Breach', role: 'initiator' },
  { id: 'skye', displayName: 'Skye', role: 'initiator' },
  { id: 'kayo', displayName: 'KAY/O', role: 'initiator' },
  { id: 'fade', displayName: 'Fade', role: 'initiator' },
  { id: 'gekko', displayName: 'Gekko', role: 'initiator' },
  { id: 'tejo', displayName: 'Tejo', role: 'initiator' },
  
  // Sentinels
  { id: 'sage', displayName: 'Sage', role: 'sentinel' },
  { id: 'cypher', displayName: 'Cypher', role: 'sentinel' },
  { id: 'killjoy', displayName: 'Killjoy', role: 'sentinel' },
  { id: 'chamber', displayName: 'Chamber', role: 'sentinel' },
  { id: 'deadlock', displayName: 'Deadlock', role: 'sentinel' },
  { id: 'vyse', displayName: 'Vyse', role: 'sentinel' },
  { id: 'veto', displayName: 'Veto', role: 'sentinel' },
];

// Export AgentName type derived from the AGENTS array
export type AgentName = typeof AGENTS[number]['id'];

// Also export as a union type for stricter typing
export type AgentId = 
  | 'jett' | 'phoenix' | 'reyna' | 'raze' | 'yoru' | 'neon' | 'iso' | 'waylay'
  | 'brimstone' | 'viper' | 'omen' | 'astra' | 'harbor' | 'clove'
  | 'sova' | 'breach' | 'skye' | 'kayo' | 'fade' | 'gekko' | 'tejo'
  | 'sage' | 'cypher' | 'killjoy' | 'chamber' | 'deadlock' | 'vyse'| 'veto' ;

export const AGENT_INFO: Record<string, AgentInfo> = Object.fromEntries(
  AGENTS.map(agent => [agent.id, agent])
);

export function getAgentsForRole(role: Role): string[] {
  // Flex players can play duelist, initiator, or controller agents
  if (role === 'flex') {
    return AGENTS
      .filter(a => a.role === 'duelist' || a.role === 'initiator' || a.role === 'controller')
      .map(a => a.id);
  }
  return AGENTS.filter(a => a.role === role).map(a => a.id);
}

export function getAgentInfo(agentId: string): AgentInfo | undefined {
  return AGENT_INFO[agentId];
}