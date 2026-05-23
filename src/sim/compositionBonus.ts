// src/sim/compositionBonus.ts
// Teams need at least one of each core role (duelist, controller, initiator, sentinel)
// Unresolved flex slots (assignedRole === 'flex') count as wildcards that cover missing roles

import type { Role } from '../types';
import type { StartingSlot } from '../types/roster';

export const CORE_ROLES: Role[] = ['duelist', 'controller', 'initiator', 'sentinel'];

export interface CompositionResult {
  penalty: number;
  isValid: boolean;
  missingRoles: Role[];
  roleCounts: Record<Role, number>;
  description: string;
}

export function analyzeComposition(lineup: StartingSlot[]): CompositionResult {
  const roleCounts: Record<Role, number> = {
    duelist: 0, controller: 0, initiator: 0, sentinel: 0, flex: 0,
  };
  for (const slot of lineup) roleCounts[slot.assignedRole]++;

  // unresolved flex slots (auto) act as wildcards — each one absorbs one missing role
  const uncoveredRoles = CORE_ROLES.filter(r => roleCounts[r] === 0);
  const flexWildcards = roleCounts.flex;
  // roles still missing after wildcards absorb them
  const missingRoles = uncoveredRoles.slice(flexWildcards);

  const penalty = -missingRoles.length;
  const isValid = missingRoles.length === 0;

  let description = '';
  if (isValid && flexWildcards > 0 && uncoveredRoles.length > 0) {
    description = `${flexWildcards} flex player${flexWildcards > 1 ? 's' : ''} will cover ${uncoveredRoles.map(formatRole).join(', ')} at match time`;
  } else if (isValid) {
    description = 'Balanced composition - all core roles covered';
  } else if (missingRoles.length === 1) {
    description = `Missing ${formatRole(missingRoles[0])} - team synergy reduced`;
  } else {
    description = `Missing ${missingRoles.map(formatRole).join(', ')} - severe synergy penalty`;
  }

  return { penalty, isValid, missingRoles, roleCounts, description };
}

export function getCompositionPenalty(lineup: StartingSlot[]): number {
  return analyzeComposition(lineup).penalty;
}

export function isValidComposition(lineup: StartingSlot[]): boolean {
  return analyzeComposition(lineup).isValid;
}

export function getCompositionSuggestions(lineup: StartingSlot[]): string[] {
  const result = analyzeComposition(lineup);
  if (result.isValid) return ['Composition is balanced!'];

  const suggestions: string[] = [];
  for (const missingRole of result.missingRoles) {
    const entries = Object.entries(result.roleCounts) as [Role, number][];
    for (const [role, count] of entries) {
      if (count >= 2 && role !== 'flex') {
        suggestions.push(`Consider reassigning one ${formatRole(role)} to ${formatRole(missingRole)}`);
        break;
      }
    }
  }
  if (result.roleCounts.flex > 0) {
    for (const missingRole of result.missingRoles) {
      suggestions.push(`Assign a flex player to cover ${formatRole(missingRole)}`);
    }
  }
  if (suggestions.length === 0) {
    suggestions.push(`Sign or trade for a ${formatRole(result.missingRoles[0])} player`);
  }
  return suggestions;
}

function formatRole(role: Role): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default {
  analyzeComposition,
  getCompositionPenalty,
  isValidComposition,
  getCompositionSuggestions,
  CORE_ROLES,
};
