// src/data/agentRoles.ts
// single source of truth for agent→role eligibility
// overrides from gameState.agentRoleOverrides take precedence at runtime

import type { Role } from '../types/player';

// default roles per agent — agents can appear in multiple roles
export const DEFAULT_AGENT_ROLES: Record<string, Role[]> = {
  // duelists
  jett:    ['duelist'],
  raze:    ['duelist'],
  phoenix: ['duelist'],
  reyna:   ['duelist'],
  yoru:    ['duelist'],
  neon:    ['duelist'],
  iso:     ['duelist'],
  waylay:  ['duelist'],

  // controllers
  omen:      ['controller'],
  brimstone: ['controller'],
  astra:     ['controller'],
  harbor:    ['controller'],
  clove:     ['controller'],

  // initiators
  sova:   ['initiator'],
  breach: ['initiator'],
  skye:   ['initiator'],
  kayo:   ['initiator'],
  fade:   ['initiator'],
  gekko:  ['initiator'],
  tejo:   ['initiator'],

  // sentinels
  killjoy:  ['sentinel'],
  cypher:   ['sentinel'],
  sage:     ['sentinel'],
  chamber:  ['sentinel'],
  deadlock: ['sentinel'],
  vyse:     ['sentinel'],
  veto:     ['sentinel'],

  // dual-role agents
  viper: ['controller', 'sentinel'],
};

// returns agents eligible for a role, with optional per-save overrides applied
export function getAgentsByRole(
  role: Role,
  overrides?: Record<string, Role[]>
): string[] {
  const map = overrides ? { ...DEFAULT_AGENT_ROLES, ...overrides } : DEFAULT_AGENT_ROLES;
  return Object.entries(map)
    .filter(([, roles]) => roles.includes(role))
    .map(([agent]) => agent);
}

// returns roles for a single agent, with optional overrides
export function getRolesForAgent(
  agent: string,
  overrides?: Record<string, Role[]>
): Role[] {
  if (overrides?.[agent]) return overrides[agent];
  return DEFAULT_AGENT_ROLES[agent] ?? ['duelist'];
}

// all known agents (default + any added via overrides)
export function getAllAgents(overrides?: Record<string, Role[]>): string[] {
  const base = Object.keys(DEFAULT_AGENT_ROLES);
  if (!overrides) return base;
  const extra = Object.keys(overrides).filter(a => !DEFAULT_AGENT_ROLES[a]);
  return [...base, ...extra];
}

export const SELECTABLE_ROLES: Role[] = ['duelist', 'controller', 'initiator', 'sentinel'];
