// src/types/roster.ts
// Roster management types for ValorantGM

import type { Role } from './player';

/**
 * A slot in the starting lineup
 */
export interface StartingSlot {
  playerId: string;
  assignedRole: Role;
}

/**
 * Role mismatch penalty matrix
 * Penalty applied when player's natural role differs from assigned role
 * 
 * Example: A duelist assigned to sentinel role gets -12 OVR penalty
 * Note: Flex players get NO penalty when assigned to any role (that's their specialty)
 */
export const ROLE_PENALTY: Record<Role, Record<Role, number>> = {
  duelist: {
    duelist: 0,
    initiator: -5,
    controller: -10,
    sentinel: -12,
    flex: -3,
  },
  initiator: {
    duelist: -5,
    initiator: 0,
    controller: -6,
    sentinel: -8,
    flex: -3,
  },
  controller: {
    duelist: -10,
    initiator: -6,
    controller: 0,
    sentinel: -5,
    flex: -3,
  },
  sentinel: {
    duelist: -12,
    initiator: -8,
    controller: -5,
    sentinel: 0,
    flex: -3,
  },
  flex: {
    duelist: 0,    // Flex players can play any role without penalty
    initiator: 0,
    controller: 0,
    sentinel: 0,
    flex: 0,
  },
};

/**
 * Get the role penalty for a player in an assigned role
 */
export function getRolePenalty(naturalRole: Role, assignedRole: Role): number {
  return ROLE_PENALTY[naturalRole]?.[assignedRole] ?? -10;
}

/**
 * Standard roles needed for a team composition
 */
export const STANDARD_ROLES: Role[] = ['duelist', 'controller', 'initiator', 'sentinel', 'flex'];