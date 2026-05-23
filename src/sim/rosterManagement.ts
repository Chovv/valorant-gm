// src/sim/rosterManagement.ts
import type { Player, Role } from '../types';
import type { StartingSlot } from '../types/roster';
import { STANDARD_ROLES, getRolePenalty } from '../types/roster';

export function getEffectiveOverall(player: Player, assignedRole: Role): number {
  return Math.max(0, player.overall + getRolePenalty(player.role, assignedRole));
}

export function calculateIGLScore(player: Player): number {
  const ratingsScore =
    (player.ratings.gameSense * 0.30) +
    (player.ratings.utilityUsage * 0.10);
  const leadership = player.personality?.leadership ?? 50;
  const teamPlayer = player.personality?.teamPlayer ?? 50;
  const mentality = player.personality?.mentality ?? 50;
  const workEthic = player.personality?.workEthic ?? 50;
  const personalityScore =
    (leadership * 0.25) +
    (teamPlayer * 0.15) +
    (mentality * 0.12) +
    (workEthic * 0.08);
  return ratingsScore + personalityScore;
}

export function findBestIGL(players: Player[]): string | null {
  if (players.length === 0) return null;
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const p of players) {
    const score = calculateIGLScore(p);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best?.id ?? null;
}

export interface OptimizeResult {
  lineup: StartingSlot[];
  recommendedIGL: string | null;
}

// maps agents to their primary role — used to resolve flex player slot assignments
const AGENT_ROLES: Partial<Record<string, Role>> = {
  jett: 'duelist', raze: 'duelist', phoenix: 'duelist', reyna: 'duelist',
  yoru: 'duelist', neon: 'duelist', iso: 'duelist', waylay: 'duelist',
  omen: 'controller', brimstone: 'controller', astra: 'controller',
  harbor: 'controller', clove: 'controller', viper: 'controller',
  sova: 'initiator', breach: 'initiator', skye: 'initiator',
  kayo: 'initiator', fade: 'initiator', gekko: 'initiator', tejo: 'initiator',
  killjoy: 'sentinel', cypher: 'sentinel', sage: 'sentinel',
  chamber: 'sentinel', deadlock: 'sentinel', vyse: 'sentinel', veto: 'sentinel',
};

// given a flex player and which roles still need filling, pick their best concrete role
// checks agent pool for role coverage — falls back to first unfilled role (the gamble)
export function resolveFlexRole(player: Player, unfilledRoles: Role[]): Role {
  if (unfilledRoles.length === 0) return STANDARD_ROLES[0];
  let bestRole: Role | null = null;
  let bestComfort = 0;
  for (const [agent, comfort] of Object.entries(player.agentPool ?? {})) {
    if (comfort < 70) continue;
    const role = AGENT_ROLES[agent];
    if (!role || !unfilledRoles.includes(role)) continue;
    if (comfort > bestComfort) { bestComfort = comfort; bestRole = role; }
  }
  return bestRole ?? unfilledRoles[0];
}

// resolves a StartingSlot[] into player+role entries, filling unresolved flex slots at match time
export function resolveLineup(
  slots: StartingSlot[],
  roster: Player[]
): Array<{ player: Player; assignedRole: Role }> {
  const filledRoles = new Set(
    slots.filter(s => s.assignedRole !== 'flex').map(s => s.assignedRole)
  );
  const result: Array<{ player: Player; assignedRole: Role }> = [];
  for (const slot of slots) {
    const player = roster.find(p => p.id === slot.playerId);
    if (!player) continue;
    if (slot.assignedRole !== 'flex') {
      result.push({ player, assignedRole: slot.assignedRole });
    } else {
      const unfilled = STANDARD_ROLES.filter(r => !filledRoles.has(r));
      const resolved = resolveFlexRole(player, unfilled.length > 0 ? unfilled : STANDARD_ROLES);
      filledRoles.add(resolved);
      result.push({ player, assignedRole: resolved });
    }
  }
  return result;
}

// comfort mode: natural roles first, then flex players fill gaps, then remaining player fills 5th slot
export function autoOptimizeLineupComfort(roster: Player[]): OptimizeResult {
  if (roster.length < 5) throw new Error('Roster must have at least 5 players');

  const lineup: StartingSlot[] = [];
  const used = new Set<string>();
  const filled = new Set<Role>();

  const sorted = [...roster].sort((a, b) => b.overall - a.overall);

  // pass 1a: non-flex players into natural roles
  for (const p of sorted) {
    if (used.size >= 4) break;
    if (p.role === 'flex') continue;
    if (!filled.has(p.role)) {
      lineup.push({ playerId: p.id, assignedRole: p.role });
      used.add(p.id); filled.add(p.role);
    }
  }

  // pass 1b: flex players fill remaining core roles by agent pool
  const flexPlayers = sorted.filter(p => p.role === 'flex');
  for (const p of flexPlayers) {
    if (used.has(p.id)) continue;
    const unfilled = STANDARD_ROLES.filter(r => !filled.has(r));
    if (unfilled.length === 0) break;
    const role = resolveFlexRole(p, unfilled);
    lineup.push({ playerId: p.id, assignedRole: role });
    used.add(p.id); filled.add(role);
  }

  // pass 2: fill any still-missing core roles with best available (may incur penalties)
  for (const role of STANDARD_ROLES.filter(r => !filled.has(r))) {
    let best: Player | null = null;
    let bestOvr = -Infinity;
    for (const p of roster) {
      if (used.has(p.id)) continue;
      const ovr = getEffectiveOverall(p, role);
      if (ovr > bestOvr) { bestOvr = ovr; best = p; }
    }
    if (best) {
      lineup.push({ playerId: best.id, assignedRole: role });
      used.add(best.id); filled.add(role);
    }
  }

  // pass 3: fill 5th slot with best remaining player at their strongest role
  if (lineup.length < 5) {
    const remaining = sorted.filter(p => !used.has(p.id));
    if (remaining.length > 0) {
      const p = remaining[0];
      const role = p.role === 'flex'
        ? resolveFlexRole(p, STANDARD_ROLES) // flex picks best overall fit
        : STANDARD_ROLES.reduce((best, r) =>
            getEffectiveOverall(p, r) > getEffectiveOverall(p, best) ? r : best
          , p.role as Role);
      lineup.push({ playerId: p.id, assignedRole: role });
    }
  }

  lineup.sort((a, b) => STANDARD_ROLES.indexOf(a.assignedRole) - STANDARD_ROLES.indexOf(b.assignedRole));

  const starters = lineup.map(s => roster.find(p => p.id === s.playerId)!).filter(Boolean);
  return { lineup, recommendedIGL: findBestIGL(starters) };
}

// strength mode: maximize total effective OVR across all 4 core roles, then add 5th best
export function autoOptimizeLineupStrength(roster: Player[]): OptimizeResult {
  if (roster.length < 5) throw new Error('Roster must have at least 5 players');

  // build all player-role combos, flex players use their resolved role
  const candidates: Array<{ player: Player; role: Role; effectiveOvr: number }> = [];
  for (const p of roster) {
    for (const role of STANDARD_ROLES) {
      candidates.push({ player: p, role, effectiveOvr: getEffectiveOverall(p, role) });
    }
  }
  candidates.sort((a, b) => b.effectiveOvr - a.effectiveOvr);

  const lineup: StartingSlot[] = [];
  const used = new Set<string>();
  const filled = new Set<Role>();

  for (const c of candidates) {
    if (used.has(c.player.id) || filled.has(c.role)) continue;
    lineup.push({ playerId: c.player.id, assignedRole: c.role });
    used.add(c.player.id); filled.add(c.role);
    if (lineup.length >= 4) break;
  }

  // 5th slot: best remaining player at their strongest role (duplicate role is fine)
  if (lineup.length < 5) {
    const best = candidates.find(c => !used.has(c.player.id));
    if (best) lineup.push({ playerId: best.player.id, assignedRole: best.role });
  }

  lineup.sort((a, b) => STANDARD_ROLES.indexOf(a.assignedRole) - STANDARD_ROLES.indexOf(b.assignedRole));

  const starters = lineup.map(s => roster.find(p => p.id === s.playerId)!).filter(Boolean);
  return { lineup, recommendedIGL: findBestIGL(starters) };
}

export function autoOptimizeLineup(roster: Player[]): OptimizeResult {
  return autoOptimizeLineupComfort(roster);
}

export function createDefaultLineup(roster: Player[]): StartingSlot[] {
  return roster.slice(0, 5).map(p => ({
    playerId: p.id,
    assignedRole: p.role === 'flex' ? 'duelist' as Role : p.role,
  }));
}

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
  const assigned = new Set(lineup.filter(s => s.assignedRole !== 'flex').map(s => s.assignedRole));
  for (const role of STANDARD_ROLES) {
    if (!assigned.has(role)) errors.push(`Missing role: ${role}`);
  }
  return { valid: errors.length === 0, errors };
}

export function getBenchPlayers(roster: Player[], lineup: StartingSlot[]): Player[] {
  const starterIds = new Set(lineup.map(s => s.playerId));
  return roster.filter(p => !starterIds.has(p.id));
}

export function swapPlayers(
  lineup: StartingSlot[],
  starterPlayerId: string,
  benchPlayerId: string,
  assignedRole: Role
): StartingSlot[] {
  return lineup.map(slot =>
    slot.playerId === starterPlayerId
      ? { playerId: benchPlayerId, assignedRole }
      : slot
  );
}

export function changeAssignedRole(
  lineup: StartingSlot[],
  playerId: string,
  newRole: Role
): StartingSlot[] {
  const playerSlot = lineup.find(s => s.playerId === playerId);
  const targetSlot = lineup.find(s => s.assignedRole === newRole);
  if (!playerSlot || !targetSlot) return lineup;
  return lineup.map(slot => {
    if (slot.playerId === playerId) return { ...slot, assignedRole: newRole };
    if (slot.playerId === targetSlot.playerId) return { ...slot, assignedRole: playerSlot.assignedRole };
    return slot;
  });
}

export function calculateLineupStrength(roster: Player[], lineup: StartingSlot[]): number {
  return lineup.reduce((total, slot) => {
    const p = roster.find(p => p.id === slot.playerId);
    return total + (p ? getEffectiveOverall(p, slot.assignedRole) : 0);
  }, 0);
}

export interface LineupSummary {
  playerId: string;
  playerName: string;
  naturalRole: Role;
  assignedRole: Role;
  baseOverall: number;
  effectiveOverall: number;
  penalty: number;
  isNaturalRole: boolean;
}

export function getLineupSummary(roster: Player[], lineup: StartingSlot[]): LineupSummary[] {
  return lineup.map(slot => {
    const player = roster.find(p => p.id === slot.playerId);
    if (!player) {
      return {
        playerId: slot.playerId,
        playerName: 'Unknown',
        naturalRole: 'flex' as Role,
        assignedRole: slot.assignedRole,
        baseOverall: 0,
        effectiveOverall: 0,
        penalty: 0,
        isNaturalRole: false,
      };
    }
    const penalty = getRolePenalty(player.role, slot.assignedRole);
    return {
      playerId: player.id,
      playerName: player.name,
      naturalRole: player.role,
      assignedRole: slot.assignedRole,
      baseOverall: player.overall,
      effectiveOverall: getEffectiveOverall(player, slot.assignedRole),
      penalty,
      isNaturalRole: player.role === slot.assignedRole || penalty === 0,
    };
  });
}
