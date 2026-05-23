// src/types/roster.ts
import type { Player, Role } from './player';

export interface StartingSlot {
  playerId: string;
  assignedRole: Role;
}

// penalty when player's natural role differs from assigned role
export const ROLE_PENALTY: Record<Role, Record<Role, number>> = {
  duelist: { duelist: 0, initiator: -5, controller: -10, sentinel: -12, flex: -3 },
  initiator: { duelist: -5, initiator: 0, controller: -6, sentinel: -8, flex: -3 },
  controller: { duelist: -10, initiator: -6, controller: 0, sentinel: -5, flex: -3 },
  sentinel: { duelist: -12, initiator: -8, controller: -5, sentinel: 0, flex: -3 },
  flex: { duelist: 0, initiator: 0, controller: 0, sentinel: 0, flex: 0 },
};

export function getRolePenalty(naturalRole: Role, assignedRole: Role): number {
  return ROLE_PENALTY[naturalRole]?.[assignedRole] ?? -10;
}

// the 4 concrete roles every lineup must cover (flex is a player trait, not a slot)
export const STANDARD_ROLES: Role[] = ['duelist', 'controller', 'initiator', 'sentinel'];

export function validateLineup(lineup: StartingSlot[], roster: Player[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (lineup.length !== 5) errors.push(`Lineup must have exactly 5 starters (has ${lineup.length})`);

  const rosterIds = new Set(roster.map(p => p.id));
  for (const slot of lineup) {
    if (!rosterIds.has(slot.playerId)) errors.push(`Player ${slot.playerId} not found in roster`);
  }

  const playerIds = lineup.map(s => s.playerId);
  if (new Set(playerIds).size !== playerIds.length) errors.push('Duplicate players in lineup');

  // only concrete (non-flex) assignments count toward role coverage
  const assigned = new Set(lineup.filter(s => s.assignedRole !== 'flex').map(s => s.assignedRole));
  for (const role of STANDARD_ROLES) {
    if (!assigned.has(role)) errors.push(`Missing role: ${role}`);
  }

  return { valid: errors.length === 0, errors };
}
