// src/sim/compositionBonus.ts
// Team composition bonus/penalty system
// Teams need at least one of each core role (duelist, controller, initiator, sentinel)

import type { Role } from '../types';
import type { StartingSlot } from '../types/roster';

/**
 * Core roles required for a balanced composition
 * Flex is NOT required - it's a wildcard role
 */
export const CORE_ROLES: Role[] = ['duelist', 'controller', 'initiator', 'sentinel'];

/**
 * Composition analysis result
 */
export interface CompositionResult {
  /** Total penalty applied to all players (-1 per missing role) */
  penalty: number;
  /** Whether the composition is valid (has all core roles) */
  isValid: boolean;
  /** List of missing roles */
  missingRoles: Role[];
  /** Count of each role in the lineup */
  roleCounts: Record<Role, number>;
  /** Human-readable description */
  description: string;
}

/**
 * Analyze team composition and calculate penalties
 * 
 * Rules:
 * - Teams need at least one player assigned to each core role
 * - Missing a core role = -1 OVR penalty to ALL players
 * - Penalties stack (missing 2 roles = -2 to all)
 * - Flex is not required, but can fill any missing role
 * 
 * @param lineup - The starting lineup with assigned roles
 * @returns Composition analysis with penalties
 */
export function analyzeComposition(lineup: StartingSlot[]): CompositionResult {
  // Count roles in the lineup
  const roleCounts: Record<Role, number> = {
    duelist: 0,
    controller: 0,
    initiator: 0,
    sentinel: 0,
    flex: 0,
  };

  for (const slot of lineup) {
    roleCounts[slot.assignedRole]++;
  }

  // Check which core roles are missing
  const missingRoles: Role[] = [];
  for (const role of CORE_ROLES) {
    if (roleCounts[role] === 0) {
      missingRoles.push(role);
    }
  }

  // Calculate penalty: -1 per missing role
  const penalty = -missingRoles.length;
  const isValid = missingRoles.length === 0;

  // Generate description
  let description = '';
  if (isValid) {
    description = 'Balanced composition - all core roles covered';
  } else if (missingRoles.length === 1) {
    description = `Missing ${formatRole(missingRoles[0])} - team synergy reduced`;
  } else {
    description = `Missing ${missingRoles.map(formatRole).join(', ')} - severe synergy penalty`;
  }

  return {
    penalty,
    isValid,
    missingRoles,
    roleCounts,
    description,
  };
}

/**
 * Get the composition penalty for a lineup
 * Returns a negative number (or 0 if composition is valid)
 */
export function getCompositionPenalty(lineup: StartingSlot[]): number {
  return analyzeComposition(lineup).penalty;
}

/**
 * Check if a composition is valid (has all core roles)
 */
export function isValidComposition(lineup: StartingSlot[]): boolean {
  return analyzeComposition(lineup).isValid;
}

/**
 * Get suggestions for fixing an invalid composition
 */
export function getCompositionSuggestions(lineup: StartingSlot[]): string[] {
  const result = analyzeComposition(lineup);
  
  if (result.isValid) {
    return ['Composition is balanced!'];
  }

  const suggestions: string[] = [];

  for (const missingRole of result.missingRoles) {
    // Find roles with duplicates that could be reassigned
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

/**
 * Format role name for display
 */
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