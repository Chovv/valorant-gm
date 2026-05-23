// src/sim/matchSim.ts
// Match simulation for ValorantGM - Duel-based system inspired by Python sim

import type { Player, MatchResult, MatchFormat, MatchAward, PlayerMapStats, Role, Team, BuyState, ShieldType, KillEvent, RoundLog, RoundWinCondition } from '../types';
import type { StartingSlot } from '../types/roster';
import { getRolePenalty } from '../types/roster';
import { randomInt } from '../utils/random';
import type { RNG } from '../utils/random';
import { calculateIGLBonus } from './iglBonus';
import { getCompositionPenalty } from './compositionBonus';
import type { AgentAbility } from '../data/agentAbilities';
import { getAbilities, getUlt, getKillChance } from '../data/agentAbilities';
import type { MatchSimConfig } from '../data/matchSimConfig';
import { DEFAULT_MATCH_SIM_CONFIG } from '../data/matchSimConfig';
import { coachMod, specMod } from './coachBonus';

export const MAPS = ['Ascent', 'Bind', 'Haven', 'Split', 'Icebox', 'Breeze', 'Fracture', 'Pearl', 'Lotus', 'Sunset'];

// === ECONOMY & WEAPON SYSTEM ===

/** pIndex modifier per buy state (applied to every player on the team) */
const BUY_STATE_PINDEX: Record<BuyState, number> = {
  full: 0,
  half: -12,     // Spectre + heavy, or Vandal + light — close to full buy
  force: -18,    // Spectres + light shields
  eco: -40,
  save: -35,     // Pistol + light shield — broke round
  pistol: -25,   // Both teams have this on pistol rounds, so it cancels out
};

// weapon pools moved to assignRoundWeapon (per-player, per-round assignment)

/** Agents who are primary Operator users */
const OP_AGENTS = new Set(['jett', 'chamber', 'waylay']);

/** Weapons eligible as a player's signature gun */
const GUN_PREF_WEAPONS = new Set([
  'Classic', 'Shorty', 'Frenzy', 'Ghost', 'Sheriff',
  'Stinger', 'Spectre', 'Bucky', 'Judge', 'Marshal',
  'Bulldog', 'Guardian', 'Outlaw', 'Ares', 'Odin',
  'Vandal', 'Phantom', 'Operator',
]);
const GUN_PREF_PINDEX = 5; // +5 pIndex (~0.7 OVR) when using signature weapon

// agents whose ults are non-kill (utility/tactical) — pIndex bonus per teammate when consumed
// timing controls WHEN the ult fires during a round:
//   preRound    — before duels (execute ults: breach, fade)
//   reactive    — after team loses 1+ player (defense holds: kj, viper)
//   midRound    — after 2+ duels regardless (omen teleport)
//   corpseEnemy — after first enemy death (cypher neural theft needs a body)
// attackRate/defenseRate — chance to use when charged, per side
type UltTiming = 'preRound' | 'reactive' | 'midRound' | 'corpseEnemy';
const UTILITY_ULT: Record<string, { bonus: number; cost: number; timing: UltTiming; attackRate: number; defenseRate: number }> = {
  killjoy:  { bonus: 8,  cost: 7, timing: 'reactive',    attackRate: 0.50, defenseRate: 0.85 },
  viper:    { bonus: 8,  cost: 8, timing: 'reactive',    attackRate: 0.55, defenseRate: 0.85 },
  astra:    { bonus: 7,  cost: 7, timing: 'preRound',    attackRate: 0.80, defenseRate: 0.80 },
  breach:   { bonus: 7,  cost: 7, timing: 'preRound',    attackRate: 0.85, defenseRate: 0.55 },
  harbor:   { bonus: 6,  cost: 7, timing: 'preRound',    attackRate: 0.80, defenseRate: 0.60 },
  cypher:   { bonus: 6,  cost: 6, timing: 'corpseEnemy', attackRate: 0.85, defenseRate: 0.85 },
  fade:     { bonus: 6,  cost: 7, timing: 'preRound',    attackRate: 0.85, defenseRate: 0.55 },
  deadlock: { bonus: 6,  cost: 7, timing: 'reactive',    attackRate: 0.50, defenseRate: 0.80 },
  vyse:     { bonus: 6,  cost: 8, timing: 'reactive',    attackRate: 0.55, defenseRate: 0.80 },
  gekko:    { bonus: 5,  cost: 7, timing: 'preRound',    attackRate: 0.80, defenseRate: 0.70 },
  skye:     { bonus: 5,  cost: 6, timing: 'preRound',    attackRate: 0.80, defenseRate: 0.75 },
  omen:     { bonus: 5,  cost: 7, timing: 'midRound',    attackRate: 0.70, defenseRate: 0.70 },
};
// sage/clove: special resurrection mechanics handled in the duel loop

// sage res ult cost (used for isUltReady checks — not in UTILITY_ULT because it's special)
const SAGE_ULT_COST = 8;
const CLOVE_ULT_COST = 7;

// agents whose ults let them save on weapon buys (ult replaces rifle)
const ULT_ECO_AGENTS = new Set(['chamber', 'jett']);

/** Per-weapon headshot chance (gun kills only, not abilities) */
const HEADSHOT_CHANCE: Record<string, number> = {
  'Sheriff': 0.38, 'Guardian': 0.36, 'Vandal': 0.30, 'Ghost': 0.28,
  'Marshal': 0.28, 'Outlaw': 0.26, 'Bulldog': 0.24, 'Phantom': 0.22, 'Classic': 0.20,
  'Spectre': 0.18, 'Stinger': 0.14, 'Frenzy': 0.14, 'Ares': 0.10,
  'Odin': 0.08, 'Operator': 0.03, 'Bucky': 0.03, 'Judge': 0.03, 'Shorty': 0.03,
};

/** Per-weapon wallbang chance */
const WALLBANG_CHANCE: Record<string, number> = {
  'Odin': 0.22, 'Operator': 0.15, 'Ares': 0.12, 'Guardian': 0.10,
  'Vandal': 0.08, 'Phantom': 0.08, 'Outlaw': 0.07, 'Bulldog': 0.06, 'Marshal': 0.06,
  'Sheriff': 0.05, 'Spectre': 0.04, 'Stinger': 0.03, 'Ghost': 0.03,
  'Classic': 0.02, 'Frenzy': 0.02, 'Judge': 0.01, 'Bucky': 0.01, 'Shorty': 0.01,
};

/** Ability kill mapping per agent — used ~12% of kills */
const AGENT_ABILITY_KILLS: Record<string, string[]> = {
  jett: ['Blade Storm', 'Cloudburst'],
  raze: ['Showstopper', 'Paint Shells', 'Blast Pack'],
  phoenix: ['Hot Hands', 'Run it Back'],
  reyna: ['Empress'],
  yoru: ['Blindside'],
  neon: ['Overdrive', 'Relay Bolt'],
  iso: ['Kill Contract'],
  waylay: ['Ability'],
  omen: ['Paranoia'],
  brimstone: ['Orbital Strike', 'Incendiary'],
  astra: ['Nova Pulse', 'Gravity Well'],
  harbor: ['Reckoning'],
  clove: ['Ruse'],
  sova: ["Hunter's Fury", 'Shock Bolt'],
  breach: ['Aftershock', 'Rolling Thunder'],
  skye: ['Seekers'],
  kayo: ['NULL/CMD', 'FRAG/MENT'],
  fade: ['Nightfall'],
  gekko: ['Thrash'],
  tejo: ['Ability'],
  killjoy: ['Nanoswarm', 'Lockdown'],
  cypher: ['Trapwire'],
  sage: ['Slow Orb'],
  chamber: ['Tour De Force', 'Headhunter'],
  deadlock: ['Annihilation'],
  viper: ["Viper's Pit", 'Snake Bite'],
  vyse: ['Arc Rose'],
  veto: ['Ability'],
};

// Default agents by role (used when player has no agent pool)
// agent→role mapping sourced from shared agentRoles data
// agentRoleOverrides from gameState can expand/change roles at runtime
import { getAgentsByRole, getAllAgents } from '../data/agentRoles';

// === MODULE-LEVEL ABILITY STATE ===
// reset at start of each simulateMap call — safe because sim is synchronous

// ult charge per player (playerId → current orb points)
let _ultCharge = new Map<string, number>();

// per-round ability uses remaining (playerId → abilityId → uses left this round)
let _abilityUses = new Map<string, Map<string, number>>();

// track which abilities refreshed this round (to avoid double-refresh)
let _refreshedThisRound = new Set<string>();

// sticky ability: once a player commits to a primary/frequent ability this round,
// they keep using it for subsequent kills (90% stick chance)
let _stickyAbility = new Map<string, string>(); // playerId → abilityId

// module-level match sim config — set at start of each simulateMap call
let _simCfg: MatchSimConfig = DEFAULT_MATCH_SIM_CONFIG;

// tracks which player+abilityId combos have popped ult this round (for UI indicator)
let _ultActivatedThisRound = new Set<string>();

// clove self-res: duels remaining before auto-death (playerId → { duelsLeft, killsAtRes })
let _cloveTimer = new Map<string, { duelsLeft: number; killsAtRes: number }>();

// sage res: track whether sage already used res this round (prevent double-res)
let _sageResUsedThisRound = new Set<string>();

// mid-round ult tracking: which utility ults already fired this round
let _midRoundUltsUsed = new Set<string>();

// urgency: how many buyable rounds each player has held ult without using it
let _ultHeldRounds = new Map<string, number>();

// coach ratings per team — set once per simulateMatch, read by simulateRound/getAdaptationPenalty
let _homeCoachRating: number | undefined;
let _awayCoachRating: number | undefined;
let _homeAssistantRating: number | undefined;
let _awayAssistantRating: number | undefined;

// momentum engine state — reset per map
let _homeMomentum = 0;
let _awayMomentum = 0;
let _hotHand = new Map<string, boolean>(); // playerId → has hot hand next round
let _clutchBonus = new Map<string, number>(); // playerId → bonus pIndex from clutch
let _timeoutBoostPlayers = new Map<string, number>(); // playerId → pIndex boost from timeout (1 round)
let _roundWeapons = new Map<string, string>(); // playerId → weapon this round (for gunPref bonus)
let _roundGunPrefs = new Map<string, string>(); // playerId → gunPref (cached per map)

function resetMapAbilityState(simConfig?: MatchSimConfig): void {
  _ultCharge = new Map();
  _abilityUses = new Map();
  _refreshedThisRound = new Set();
  _stickyAbility = new Map();
  _ultActivatedThisRound = new Set();
  _cloveTimer = new Map();
  _sageResUsedThisRound = new Set();
  _midRoundUltsUsed = new Set();
  _ultHeldRounds = new Map();
  _simCfg = simConfig ?? DEFAULT_MATCH_SIM_CONFIG;
}

// reset per-round: signature/basic uses replenish, ult stays charged
function resetRoundAbilityUses(players: Array<{ player: { id: string }; agent: string }>, agentAbilities?: Record<string, AgentAbility[]>): void {
  _refreshedThisRound = new Set();
  _stickyAbility = new Map();
  _ultActivatedThisRound = new Set();
  _cloveTimer = new Map();
  _sageResUsedThisRound = new Set();
  _midRoundUltsUsed = new Set();
  if (!agentAbilities) return;
  for (const p of players) {
    const abilities = agentAbilities[p.agent.toLowerCase()] ?? getAbilities(p.agent);
    if (!abilities.length) continue;
    const uses = _abilityUses.get(p.player.id) ?? new Map<string, number>();
    for (const ab of abilities) {
      if (ab.type === 'ultimate') continue; // ult uses governed by charge
      uses.set(ab.id, ab.uses);
    }
    _abilityUses.set(p.player.id, uses);
  }
}

function addUltCharge(playerId: string, points: number): void {
  _ultCharge.set(playerId, (_ultCharge.get(playerId) ?? 0) + points);
}

function isUltReady(playerId: string, agent: string, agentAbilities?: Record<string, AgentAbility[]>): boolean {
  const abilities = agentAbilities?.[agent.toLowerCase()] ?? getAbilities(agent);
  const ultAb = abilities.find(a => a.type === 'ultimate');
  if (!ultAb || ultAb.ultCost <= 0) return false;
  return (_ultCharge.get(playerId) ?? 0) >= ultAb.ultCost;
}

// check if an agent's ult replaces their rifle buy (data-driven → hardcoded fallback)
function isUltEconomy(agent: string, agentAbilities?: Record<string, AgentAbility[]>): boolean {
  const abilities = agentAbilities?.[agent.toLowerCase()] ?? getAbilities(agent);
  const ultAb = abilities.find(a => a.type === 'ultimate');
  if (ultAb) return !!ultAb.ultEconomy;
  // hardcoded fallback only when agent has no ability entries
  return ULT_ECO_AGENTS.has(agent.toLowerCase());
}

function consumeUlt(playerId: string): void {
  _ultCharge.set(playerId, 0);
  _ultHeldRounds.delete(playerId); // reset urgency on use
}

// role priority for sage res target selection (higher = more valuable to revive)
const RES_PRIORITY: Record<string, number> = { duelist: 4, initiator: 3, controller: 2, sentinel: 1, flex: 2 };

// compute effective ult fire rate with all contextual modifiers
function getEffectiveUltRate(
  baseRate: number,
  ownBuyState: BuyState,
  oppBuyState: BuyState,
  roundNumber: number,
  scoreDiff: number,  // own score - enemy score (negative = losing)
  playerId: string,
  readyTeamUlts: number, // how many utility ults are ready on this team
): number {
  // user set rate to max — "always fire", skip all modifiers
  if (baseRate >= 1.0) return 1.0;

  let rate = baseRate;

  // urgency ramp: +0.15 per round held on buyable rounds
  const held = _ultHeldRounds.get(playerId) ?? 0;
  rate += held * 0.15;

  // eco suppression: opponent on eco/save → suppress, but weaken as urgency grows
  // fresh ult: ×0.40, after 2 rounds held: ×0.60, after 3+: ×0.80 (stop hoarding)
  if (oppBuyState === 'eco' || oppBuyState === 'save') {
    const suppression = held >= 3 ? 0.80 : held >= 2 ? 0.60 : 0.40;
    rate *= suppression;
  }

  // halftime dump: last 2 rounds of each half → spike rate
  const isEndOfHalf = (roundNumber >= 11 && roundNumber <= 12) || (roundNumber >= 23 && roundNumber <= 24);
  if (isEndOfHalf) rate += 0.25;

  // score pressure: losing by 3+ → more aggressive ult usage
  if (scoreDiff <= -3) rate += 0.15;

  // combo coordination: 2+ utility ults ready on team → coordinated execute
  if (readyTeamUlts >= 2) rate += 0.12;

  return Math.min(Math.max(rate, 0), 0.98);
}

function consumeAbilityUse(playerId: string, abilityId: string): void {
  const uses = _abilityUses.get(playerId);
  if (!uses) return;
  const left = uses.get(abilityId) ?? 0;
  if (left > 0) uses.set(abilityId, left - 1);
}

function hasAbilityUses(playerId: string, abilityId: string): boolean {
  const uses = _abilityUses.get(playerId);
  if (!uses) return false;
  return (uses.get(abilityId) ?? 0) > 0;
}

function tryRefreshAbility(playerId: string, ability: AgentAbility, roundKills: number): void {
  if (!ability.refreshOnKill) return;
  if (ability.refreshKillReq > 0 && roundKills < ability.refreshKillReq) return;
  const key = `${playerId}:${ability.id}`;
  if (_refreshedThisRound.has(key)) return;
  _refreshedThisRound.add(key);
  const uses = _abilityUses.get(playerId);
  if (uses) uses.set(ability.id, (uses.get(ability.id) ?? 0) + 1);
}

// build a role→agents lookup from the shared source (optionally with overrides)
function buildAgentsByRole(overrides?: Record<string, string[]>): Record<string, string[]> {
  const roles = ['duelist', 'controller', 'initiator', 'sentinel', 'flex'] as const;
  const result: Record<string, string[]> = {};
  for (const role of roles) {
    result[role] = getAgentsByRole(role as any, overrides as any);
  }
  // flex fallback — all agents
  result['flex'] = getAllAgents(overrides as any);
  return result;
}

// default lookup (no overrides) used as fallback
const DEFAULT_AGENTS_BY_ROLE = buildAgentsByRole();

/**
 * Player state during a round
 */
interface PlayerRoundState {
  player: Player;
  assignedRole: Role;          // The role they're playing (may differ from natural role)
  agent: string;               // Agent selected for this map
  alive: boolean;
  health: number;
  shield: ShieldType;          // shield equipped this round
  shieldHp: number;            // remaining shield hitpoints (light=25, regen=25, heavy=50)
  shieldRegenPool: number;     // regen shield: remaining regen pool (starts at 50, decreases as it regens)
  kills: number;
  deaths: number;
  assists: number;
  firstKills: number;          // Track actual first kills
  firstDeaths: number;         // Track actual first deaths
  damagedBy: Set<string>;      // Track all players who damaged this player in the round
  roundKills: number;
  iglBonus: number;            // IGL leadership bonus/penalty
  compositionPenalty: number;  // Penalty for missing core roles in lineup
  formModifier: number;        // Match-day form (OVR equivalent, based on consistency)
  bigStageModifier: number;    // Playoff pressure modifier (OVR equivalent, based on mentality)
  flowState: boolean;          // ~5% chance per map — "in the zone", reduces adaptation penalty
  buyStateModifier: number;    // Economy modifier — eco/half buy penalty
  noPenalty: boolean;          // If true, skip agent pool + role mismatch penalties (team comp override)
  mapCompBuff: number;         // Per-map per-player OVR buff/debuff (-15 to +15)
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
 * Agent priority system:
 * Priority 1 (value 100): Main agent - ~70% pick rate, +3 OVR
 * Priority 2 (value 50): Secondary - ~25% pick rate, +2 OVR
 * Priority 3 (value 25): Pocket pick - ~5% pick rate, +1 OVR
 * Forced (not in pool): -5 OVR
 */
const PRIORITY_OVR_BONUS: Record<number, number> = {
  100: 3,   // Priority 1: +3 OVR
  50: 2,    // Priority 2: +2 OVR
  25: 1,    // Priority 3: +1 OVR
};
const FORCED_AGENT_PENALTY = -5; // Not in agent pool

/**
 * Get OVR modifier based on agent priority
 */
function getAgentOvrModifier(agentPool: Record<string, number> | undefined, agent: string): number {
  if (!agentPool || agentPool[agent] === undefined) {
    return FORCED_AGENT_PENALTY; // Forced onto agent not in pool
  }
  
  const priority = agentPool[agent];
  if (priority >= 75) return PRIORITY_OVR_BONUS[100];  // Priority 1
  if (priority >= 40) return PRIORITY_OVR_BONUS[50];   // Priority 2
  if (priority >= 1) return PRIORITY_OVR_BONUS[25];    // Priority 3
  return FORCED_AGENT_PENALTY;
}

/**
 * Select an agent for a player based on their agent pool priority, avoiding already-used agents
 * Uses weighted selection based on priority values
 * 
 * RULES:
 * - Non-flex players: Can only use agents that belong to their ASSIGNED role
 * - Flex players (natural role = flex): Can use ANY agent in their pool regardless of assigned role
 * - If no valid agents in pool, pick randomly from default agents for the assigned role (forced pick)
 * 
 * Returns both the selected agent and whether it was a forced pick (not in their pool)
 */
function selectAgentForPlayer(
  rng: RNG,
  player: Player,
  usedAgents: Set<string>,
  assignedRole: Role,
  agentMeta?: Record<string, number>,
  mapName?: string,
  globalVariance: number = 15,
  mapMeta?: Record<string, Partial<Record<string, string[]>>>,
  teamMapComps?: Record<string, Record<string, Record<string, string>>>,
  teamId?: string,
  agentRoleOverrides?: Record<string, string[]>,
  teamMapCompNoPenalty?: Record<string, Record<string, string[]>>,
  teamMapCompBuffs?: Record<string, Record<string, Record<string, number>>>,
  disabledAgents?: Set<string>
): { agent: string; isForced: boolean } {
  const agentPool = player.agentPool || {};
  const isFlexPlayer = player.role === 'flex';
  const variance = (player.agentVariance ?? globalVariance) / 100;
  // use overrides-aware lookup if provided, else fall back to default
  const agentsByRole = agentRoleOverrides ? buildAgentsByRole(agentRoleOverrides) : DEFAULT_AGENTS_BY_ROLE;

  // helper: check if an agent is available (not used by teammate and not disabled)
  const isAvailable = (a: string) => !usedAgents.has(a) && !disabledAgents?.has(a);

  // god-tier hard force: if any agent in this role has buff === 100, pick randomly among them
  // pool comfort still determines OVR performance, but pick is forced regardless of pool
  // skip god-tier if this player has an explicit comp pick on this map — comp always wins
  const teamComp = teamId && mapName ? teamMapComps?.[teamId]?.[mapName] : undefined;
  const hasCompPick = !!(teamComp?.[player.id]);
  if (agentMeta && !hasCompPick) {
    const roleAgentSet = new Set(agentsByRole[assignedRole] || []);
    const godTierAgents = Object.entries(agentMeta)
      .filter(([agent, buff]) => buff === 100 && roleAgentSet.has(agent) && isAvailable(agent))
      .map(([agent]) => agent);
    if (godTierAgents.length > 0) {
      const picked = godTierAgents[randomInt(rng, 0, godTierAgents.length - 1)];
      // forced = true only if agent not in player's pool (performance penalty applies)
      return { agent: picked, isForced: (agentPool[picked] ?? 0) === 0 };
    }
  }

  // team comp pick: per-player agent decision for any team with configured comps
  // skip if the comp agent is disabled
  if (teamComp?.[player.id] && !disabledAgents?.has(teamComp[player.id]!)) {
    const compAgent = teamComp[player.id]!;
    const noPenalty = !(teamMapCompNoPenalty?.[teamId!]?.[mapName!]?.includes(`disabled:${player.id}`) ?? false);
    return { agent: compAgent, isForced: noPenalty ? false : (agentPool[compAgent] ?? 0) === 0 };
  }

  // check per-map priority list (legacy per-player prefs — kept for backward compat)
  const mapPrefs = mapName ? player.mapAgentPrefs?.[mapName] : undefined;
  if (mapPrefs && mapPrefs.length > 0) {
    const available = mapPrefs.filter(a => isAvailable(a));
    if (available.length > 0) {
      // variance drift: higher variance = more likely to pick priority 2 or 3
      const roll = rng();
      let idx = 0;
      if (available.length >= 3 && roll < variance * 0.33) idx = 2;
      else if (available.length >= 2 && roll < variance) idx = 1;
      return { agent: available[Math.min(idx, available.length - 1)], isForced: false };
    }
    // all priorities taken by teammates — fall through to normal pool logic
  }

  // AI map meta: if team has a map meta pref for this role on this map, bias toward those agents
  if (mapName && mapMeta?.[mapName]?.[assignedRole]) {
    const metaAgents = mapMeta[mapName][assignedRole]!;
    const available = metaAgents.filter(a => isAvailable(a) && (agentPool[a] ?? 0) >= 40);
    if (available.length > 0) {
      const roll = rng();
      let idx = 0;
      if (available.length >= 3 && roll < variance * 0.33) idx = 2;
      else if (available.length >= 2 && roll < variance) idx = 1;
      return { agent: available[Math.min(idx, available.length - 1)], isForced: false };
    }
  }
  
  // For flex players: use ANY agent in their pool
  // For non-flex players: only use agents valid for the assigned role
  let validPoolAgents: [string, number][];

  // meta bleed: agents not in the player's pool can enter consideration if buffed
  // enough. flex players adapt earlier (threshold +15), specialists slower (threshold +25).
  // synthetic_comfort = (buff - threshold) * 1.5 — competes in normal weighted selection.
  const metaBleedThreshold = isFlexPlayer ? 15 : 25;
  const roleAgentsForBleed = new Set(agentsByRole[assignedRole] || []);
  const metaBleedAgents: [string, number][] = [];
  if (agentMeta) {
    for (const [agent, buff] of Object.entries(agentMeta)) {
      if (disabledAgents?.has(agent)) continue;
      if (buff === 100) continue; // god-tier already handled above
      if (buff <= metaBleedThreshold) continue;
      if (agentPool[agent] !== undefined) continue; // already in pool, handled below
      if (!isFlexPlayer && !roleAgentsForBleed.has(agent)) continue;
      const syntheticComfort = Math.min(60, (buff - metaBleedThreshold) * 1.5);
      metaBleedAgents.push([agent, syntheticComfort]);
    }
  }

  if (isFlexPlayer) {
    validPoolAgents = Object.entries(agentPool).filter(([a]) => !disabledAgents?.has(a));
  } else {
    validPoolAgents = Object.entries(agentPool).filter(
      ([agent]) => roleAgentsForBleed.has(agent) && !disabledAgents?.has(agent)
    );
  }

  // combine pool agents + meta bleed agents for selection
  const combinedAgents: [string, number][] = [
    ...validPoolAgents,
    ...metaBleedAgents,
  ];

  if (combinedAgents.length > 0) {
    const availableAgents = combinedAgents.filter(([agent]) => isAvailable(agent));

    if (availableAgents.length > 0) {
      // squared weights so higher-comfort pool agents dominate
      // meta multiplier shifts weight among pool agents: +50→2x, 0→1x, -50→0x
      // bleed agents enter via synthetic comfort — their squared weight competes naturally
      const squaredWeights = availableAgents.map(([agent, comfort]) => {
        const meta = agentMeta?.[agent] ?? 0;
        const metaMultiplier = 1 + (meta / 50);
        return {
          agent,
          weight: Math.max(1, comfort * comfort * metaMultiplier),
          // bleed agents have no pool entry so isForced for OVR purposes
          isBleed: agentPool[agent] === undefined,
        };
      });

      const totalWeight = squaredWeights.reduce((sum, e) => sum + e.weight, 0);
      let roll = rng() * totalWeight;

      for (const entry of squaredWeights) {
        roll -= entry.weight;
        if (roll <= 0) {
          // bleed picks count as forced (player isn't a real pool player for this agent)
          return { agent: entry.agent, isForced: entry.isBleed };
        }
      }
      // fallback to highest comfort agent
      squaredWeights.sort((a, b) => b.weight - a.weight);
      const top = squaredWeights[0];
      return { agent: top.agent, isForced: top.isBleed };
    }
  }

  // no pool agents and no meta bleed: forced random pick from role defaults
  const roleAgents = agentsByRole[assignedRole] || agentsByRole.duelist || [];
  const availableRoleAgents = roleAgents.filter(agent => isAvailable(agent));

  if (availableRoleAgents.length > 0) {
    return {
      agent: availableRoleAgents[randomInt(rng, 0, availableRoleAgents.length - 1)],
      isForced: true,
    };
  }
  
  // Last resort: pick any unused agent from any role (shouldn't happen normally)
  const allAgents = getAllAgents(agentRoleOverrides as any);
  const anyAvailable = allAgents.filter(agent => isAvailable(agent));
  
  if (anyAvailable.length > 0) {
    return { 
      agent: anyAvailable[randomInt(rng, 0, anyAvailable.length - 1)], 
      isForced: true 
    };
  }
  
  // Absolute fallback (should never happen with 20+ agents and 5 players)
  return { agent: roleAgents[0], isForced: true };
}

/**
 * Calculate player's effective "pIndex" (power index) for duels
 * Based on their overall rating, role bonuses, agent proficiency, and role fit
 * 
 * BALANCE NOTE: pIndex spread is compressed so that even elite vs average duels
 * land around 60-65% win rate, not 80%+. This reflects real Valorant where
 * positioning, timing, and crossfires introduce significant randomness.
 */
function getPlayerPIndex(player: Player, agent: string, assignedRole: Role, iglBonus: number = 0, compositionPenalty: number = 0, formModifier: number = 0, bigStageModifier: number = 0, agentMeta?: Record<string, number>, buyStateModifier: number = 0, noPenalty: boolean = false, mapCompBuff: number = 0): number {
  // ovr is the single source of truth — aim was double-counted before (already baked into ovr)
  let pIndex = player.overall * 7;

  // sprayControl adds mechanical edge — activates a previously dead rating
  pIndex += player.ratings.sprayControl * 0.6;

  // role bonus anchors fight style, not skill ceiling
  switch (assignedRole) {
    case 'duelist':
      pIndex += 25; // still entry-frag advantage, but ovr matters more at pro level
      break;
    case 'initiator':
      pIndex += 18;
      break;
    case 'controller':
      pIndex += 14;
      break;
    case 'sentinel':
      pIndex += 12; // high-ovr sentinels should look like high-ovr players
      break;
    case 'flex':
      pIndex += 20;
      break;
  }
  
  // Clutch factor helps in 1vX situations
  pIndex += player.ratings.clutchFactor * 0.3;
  
  // IGL bonus - affects communication, game sense, utility usage
  pIndex += iglBonus * 12;
  
  // Composition penalty - missing core roles hurts the whole team
  pIndex += compositionPenalty * 6;
  
  // Agent proficiency bonus/penalty based on priority
  // If a mapCompBuff is set, it replaces the pool comfort bonus entirely (no stacking)
  if (mapCompBuff !== 0) {
    // mapCompBuff replaces pool comfort — role penalty still suppressed if noPenalty
    pIndex += mapCompBuff * 6;
    if (!noPenalty) {
      const rolePenalty = getRolePenalty(player.role, assignedRole);
      pIndex += rolePenalty * 6;
    }
  } else if (!noPenalty) {
    const agentOvrMod = getAgentOvrModifier(player.agentPool, agent);
    pIndex += agentOvrMod * 6;
    const rolePenalty = getRolePenalty(player.role, assignedRole);
    pIndex += rolePenalty * 6;
  }

  // Agent meta modifier — buffed agents give +pIndex, nerfed agents give -pIndex
  // Scale: ±50 meta → ±18 pIndex (equivalent to ±3 OVR)
  const metaMod = agentMeta?.[agent] ?? 0;
  pIndex += metaMod * 0.36;
  
  // Match-day form — rolled once per match based on player consistency
  pIndex += formModifier * 6;
  
  // Big stage modifier — playoff pressure based on personality.mentality
  pIndex += bigStageModifier * 6;

  // Buy state modifier — eco/half buy penalty
  pIndex += buyStateModifier;

  // momentum engine bonuses
  const mStr = _simCfg.momentumStrength ?? 1;
  if (mStr > 0) {
    // hot hand: +8 pIndex (doubled in legendary mode)
    if (_hotHand.get(player.id)) pIndex += 8 * mStr;
    // clutch confidence: one-round bonus after a clutch
    const cb = _clutchBonus.get(player.id);
    if (cb) pIndex += cb * mStr;
  }

  // post-timeout tactical boost (coach-scaled, 1 round only)
  const tb = _timeoutBoostPlayers.get(player.id);
  if (tb) pIndex += tb;

  // signature weapon bonus: +5 pIndex when using their preferred gun
  const gp = _roundGunPrefs.get(player.id);
  if (gp && _roundWeapons.get(player.id) === gp) pIndex += GUN_PREF_PINDEX;

  return pIndex;
}

/**
 * Simulate a duel between two players using Elo-style probability
 * adaptationPenalty is subtracted from the player's effective pIndex
 * to simulate opponents adapting to a hot player (double-peeking, trading, etc.)
 */
function simulateDuel(
  rng: RNG,
  attacker: PlayerRoundState,
  defender: PlayerRoundState,
  attackerAdaptation: number = 0,
  defenderAdaptation: number = 0,
  agentMeta?: Record<string, number>
): 'attacker' | 'defender' {
  const attackerPIndex = getPlayerPIndex(attacker.player, attacker.agent, attacker.assignedRole, attacker.iglBonus, attacker.compositionPenalty, attacker.formModifier, attacker.bigStageModifier, agentMeta, attacker.buyStateModifier, attacker.noPenalty, attacker.mapCompBuff) - attackerAdaptation;
  const defenderPIndex = getPlayerPIndex(defender.player, defender.agent, defender.assignedRole, defender.iglBonus, defender.compositionPenalty, defender.formModifier, defender.bigStageModifier, agentMeta, defender.buyStateModifier, defender.noPenalty, defender.mapCompBuff) - defenderAdaptation;
  
  // Health modifier: damaged players are disadvantaged (e.g. 50hp → -5 pIndex)
  const attackerHealthMod = attacker.health < 100 ? (attacker.health - 100) / 10 : 0;
  const defenderHealthMod = defender.health < 100 ? (defender.health - 100) / 10 : 0;

  // shield bonus — scales with remaining shield hp (depleted shield = less bonus)
  const atkShieldMax = SHIELD_MAX_HP[attacker.shield] || 1;
  const defShieldMax = SHIELD_MAX_HP[defender.shield] || 1;
  const atkShieldMod = attacker.shieldHp > 0 ? SHIELD_PINDEX[attacker.shield] * (attacker.shieldHp / atkShieldMax) : 0;
  const defShieldMod = defender.shieldHp > 0 ? SHIELD_PINDEX[defender.shield] * (defender.shieldHp / defShieldMax) : 0;

  const advantage = (attackerPIndex + attackerHealthMod + atkShieldMod) - (defenderPIndex + defenderHealthMod + defShieldMod);
  // Elo formula with wider divisor (600 vs 400) for more randomness per duel
  // This reflects the inherent chaos of Valorant gunfights (angles, timing, util)
  const winProb = 1 / (1 + Math.pow(10, -advantage / 600));
  
  return rng() < winProb ? 'attacker' : 'defender';
}

/**
 * Role-based engagement weights — duelists entry and take more fights,
 * controllers/sentinels play safer angles and engage less often.
 * This means duelists get MORE kills but also MORE deaths (realistic).
 */
// pro-level: high-ovr sentinels/controllers still frag — role affects style not volume
const ROLE_ENGAGEMENT_BASE: Record<Role, number> = {
  duelist: 2.8,
  flex: 2.4,
  initiator: 2.2,
  controller: 2.0,
  sentinel: 2.3,
};

// role base anchors fight style; ovr + gameSense scale how present an elite player actually is
function engagementWeight(p: PlayerRoundState): number {
  const base = ROLE_ENGAGEMENT_BASE[p.assignedRole] ?? 2.2;
  const ovrMod = (p.player.overall - 75) * 0.025;        // 95 ovr -> +0.5, 60 ovr -> -0.375
  const gseMod = (p.player.ratings.gameSense - 50) * 0.008; // high gameSense = better fight timing
  return Math.max(0.5, base + ovrMod + gseMod);
}

function selectAlivePlayer(rng: RNG, team: TeamMapState): PlayerRoundState | null {
  const alivePlayers = team.players.filter(p => p.alive);
  if (alivePlayers.length === 0) return null;

  const weights = alivePlayers.map(p => engagementWeight(p));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let roll = rng() * totalWeight;

  for (let i = 0; i < alivePlayers.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return alivePlayers[i];
  }
  return alivePlayers[alivePlayers.length - 1];
}

// === UTILITY AURA ASSIST SYSTEM ===
// each round, initiators/controllers/sentinels "cast" util (flash, dart, smoke, trap)
// that covers a window of kills. the aura persists even if the caster dies —
// in real val, dead players still get assists from pre-thrown util.

interface UtilAura {
  playerId: string;
  teamId: string;
  remaining: number; // kills left this aura covers
}

// role-based activation rates and kill coverage
const UTIL_AURA_CFG: Record<string, { chance: number; min: number; max: number }> = {
  initiator:  { chance: 0.50, min: 1, max: 2 }, // flashes, darts, haunt
  controller: { chance: 0.42, min: 1, max: 2 }, // smokes, walls, mollies
  sentinel:   { chance: 0.15, min: 1, max: 1 }, // traps, slows, cams
  flex:       { chance: 0.12, min: 1, max: 1 },
  duelist:    { chance: 0.05, min: 1, max: 1 }, // rare flash/blind assist
};

// role priority weights when multiple auras compete for the same kill
const AURA_ROLE_WEIGHT: Record<string, number> = {
  initiator: 4, controller: 3, sentinel: 2, flex: 2, duelist: 1,
};

function activateUtilAuras(
  rng: RNG,
  team1: TeamMapState,
  team2: TeamMapState
): UtilAura[] {
  const auras: UtilAura[] = [];
  for (const team of [team1, team2]) {
    for (const p of team.players) {
      const cfg = UTIL_AURA_CFG[p.assignedRole] || UTIL_AURA_CFG.duelist;
      // scale by utility usage rating (0.6 at 50 rating, 1.0 at ~83, 1.15 at 100)
      const utilScale = 0.4 + 0.6 * (p.player.ratings.utilityUsage / 100);
      if (rng() < cfg.chance * utilScale) {
        auras.push({
          playerId: p.player.id,
          teamId: team.id,
          remaining: randomInt(rng, cfg.min, cfg.max),
        });
      }
    }
  }
  return auras;
}

/**
 * Award assist(s) for a kill using three paths:
 * 1. damage assist — someone who tagged the victim (dead or alive)
 * 2. util aura assist — active util from a teammate covers this kill
 * 3. fallback random — small chance for a misc assist when paths 1+2 miss
 *
 * in real val, one kill can credit both a damage assist and a flash assist,
 * so paths 1+2 can stack (20% chance for double assist).
 */
function maybeAwardAssist(
  rng: RNG,
  killer: PlayerRoundState,
  victim: PlayerRoundState,
  killerTeam: TeamMapState,
  allPlayers: PlayerRoundState[],
  utilAuras: UtilAura[]
): void {
  // path 1: damage assist — no alive filter (dead players keep credit)
  const dmgCandidates = Array.from(victim.damagedBy)
    .filter(id => id !== killer.player.id)
    .map(id => allPlayers.find(p => p.player.id === id))
    .filter((p): p is PlayerRoundState => p !== undefined);

  let dmgAssisterId: string | null = null;
  if (dmgCandidates.length > 0) {
    const assister = dmgCandidates[randomInt(rng, 0, dmgCandidates.length - 1)];
    assister.assists++;
    dmgAssisterId = assister.player.id;
  }

  // path 2: util aura assist
  const activeAuras = utilAuras.filter(a =>
    a.teamId === killerTeam.id &&
    a.playerId !== killer.player.id &&
    a.remaining > 0
  );

  if (activeAuras.length > 0) {
    // if damage assist already landed, only 20% chance for a second (flash+damage combo)
    if (dmgAssisterId && rng() > 0.20) {
      // still consume an aura even if we don't grant a second assist
      activeAuras[0].remaining--;
      return;
    }

    // weighted pick among active auras
    let totalW = 0;
    const weights: number[] = activeAuras.map(a => {
      const p = allPlayers.find(pl => pl.player.id === a.playerId);
      const w = AURA_ROLE_WEIGHT[p?.assignedRole ?? 'duelist'] ?? 1;
      totalW += w;
      return w;
    });

    let roll = rng() * totalW;
    let pickedIdx = activeAuras.length - 1;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { pickedIdx = i; break; }
    }

    const picked = activeAuras[pickedIdx];

    // avoid double-crediting the same player
    if (picked.playerId === dmgAssisterId) {
      const others = activeAuras.filter(a => a.playerId !== dmgAssisterId);
      if (others.length > 0) {
        const alt = others[randomInt(rng, 0, others.length - 1)];
        const assister = allPlayers.find(p => p.player.id === alt.playerId);
        if (assister) assister.assists++;
        alt.remaining--;
      } else {
        picked.remaining--; // consume aura, no double credit
      }
      return;
    }

    const assister = allPlayers.find(p => p.player.id === picked.playerId);
    if (assister) assister.assists++;
    picked.remaining--;
    return;
  }

  // path 3: fallback random assist — only when no damage and no aura hit
  if (dmgAssisterId) return;

  const teammates = killerTeam.players.filter(p => p.player.id !== killer.player.id);
  if (teammates.length === 0) return;

  if (rng() < 0.18) {
    const weighted: PlayerRoundState[] = [];
    for (const t of teammates) {
      let w = AURA_ROLE_WEIGHT[t.assignedRole] ?? 1;
      w *= (t.player.ratings.utilityUsage / 70);
      for (let i = 0; i < Math.ceil(w); i++) weighted.push(t);
    }
    if (weighted.length > 0) {
      weighted[randomInt(rng, 0, weighted.length - 1)].assists++;
    }
  }
}

/**
 * Calculate adaptation penalty for a player.
 * When a player is performing far above average (>1.0 KPR), opponents start
 * double-peeking, trading, and counter-strating them. This creates diminishing
 * returns that prevent unrealistic 4.0+ KD stat lines over a full map.
 * 
 * Flow state (5% chance per map) halves the penalty — these are the rare
 * "PatMen 32/5" or "aspas 47 kill" god maps.
 */
function getAdaptationPenalty(player: PlayerRoundState, roundsPlayed: number, coachRating?: number, assistantRating?: number): number {
  if (roundsPlayed < 3) return 0;

  const kpr = player.kills / roundsPlayed;
  if (kpr <= 1.0) return 0;

  let penalty = (kpr - 1.0) * 40 * _simCfg.adaptationStrength;
  penalty = Math.min(50, penalty);
  if (player.flowState) penalty *= 0.5;

  // hot hand: 30% adaptation reduction (player is "in the zone" this round)
  if (_hotHand.get(player.player.id)) penalty *= 0.7;

  // head coach: 15% reduction, assistant: 10% reduction (anti-strat)
  const reduction = 1 - coachMod(coachRating) * 0.15 - coachMod(assistantRating) * 0.10;
  penalty *= Math.max(0.5, reduction);

  return penalty;
}

/**
 * Select a weapon for a kill event based on buy state and agent
 * ~12% chance of ability kill, otherwise random from weapon pool
 */
/** Assign a weapon per player for the round based on buy state, role, and agent */
function assignRoundWeapon(rng: RNG, buyState: BuyState, role: Role, agent: string, playerId?: string, agentAbilities?: Record<string, AgentAbility[]>, gunPref?: string): string {
  // helper: if gun pref is in this buy state's pool, 50% chance to pick it
  const prefInPool = (pool: string[]) => gunPref && pool.includes(gunPref) && rng() < 0.50;

  if (buyState === 'pistol') {
    const pool = ['Classic', 'Classic', 'Frenzy', 'Frenzy', 'Ghost', 'Ghost', 'Ghost', 'Sheriff'];
    if (prefInPool(pool)) return gunPref!;
    return pool[randomInt(rng, 0, pool.length - 1)];
  }
  if (buyState === 'save') {
    const pool = ['Classic', 'Classic', 'Frenzy', 'Ghost', 'Sheriff'];
    if (prefInPool(pool)) return gunPref!;
    return pool[randomInt(rng, 0, pool.length - 1)];
  }
  if (buyState === 'eco') {
    const pool = ['Sheriff', 'Marshal', 'Spectre', 'Stinger'];
    if (prefInPool(pool)) return gunPref!;
    return pool[randomInt(rng, 0, pool.length - 1)];
  }
  if (buyState === 'force') {
    const pool = ['Spectre', 'Spectre', 'Spectre', 'Marshal', 'Stinger', 'Sheriff'];
    if (prefInPool(pool)) return gunPref!;
    return pool[randomInt(rng, 0, pool.length - 1)];
  }
  if (buyState === 'half') {
    const roll = rng();
    // gun pref: rifles on half buy — 40% chance (up from 20%)
    if (gunPref && (gunPref === 'Vandal' || gunPref === 'Phantom') && roll < 0.40) return gunPref;
    if (roll < 0.20) return 'Vandal';
    return 'Spectre';
  }

  // full buy — ult economy overrides gun pref
  if (playerId && isUltEconomy(agent, agentAbilities) && isUltReady(playerId, agent, agentAbilities)) {
    return 'Sheriff';
  }

  // full buy — gun pref: 70% chance to buy signature weapon
  const validPref = gunPref && GUN_PREF_WEAPONS.has(gunPref);
  // Op pref restricted to Op agents
  const prefIsOp = gunPref === 'Operator';
  const isOpAgent = OP_AGENTS.has(agent.toLowerCase());
  const canUsePref = validPref && (!prefIsOp || isOpAgent);

  if (canUsePref && rng() < 0.70) return gunPref!;

  // fallback: normal role-based pool
  if (isOpAgent) {
    const roll = rng();
    if (roll < 0.25) return 'Operator';
    if (roll < 0.60) return 'Vandal';
    return 'Phantom';
  }

  if (role === 'sentinel' || role === 'controller') {
    const roll = rng();
    if (roll < 0.48) return 'Phantom';
    if (roll < 0.88) return 'Vandal';
    return 'Odin';
  }

  const roll = rng();
  if (roll < 0.50) return 'Vandal';
  return 'Phantom';
}

/** Weapon tier for pickup logic — higher tier = better gun */
const WEAPON_TIER: Record<string, number> = {
  'Classic': 1, 'Shorty': 1,
  'Frenzy': 2, 'Ghost': 2,
  'Sheriff': 3, 'Stinger': 3,
  'Spectre': 4, 'Bucky': 4, 'Judge': 4,
  'Marshal': 5, 'Bulldog': 5, 'Guardian': 5, 'Outlaw': 5, 'Ares': 5, 'Odin': 6,
  'Vandal': 6, 'Phantom': 6,
  'Operator': 7,
};

interface AbilityKillResult {
  weapon: string;
  isAbilityKill: boolean;
  abilityId?: string;
  isUlt: boolean;
  aoe: boolean;
  maxKills: number;
  headshotRate: number;
  refreshOnKill: boolean;
  refreshKillReq: number;
}

// select weapon or ability for a kill — uses new agentAbilities data with legacy fallback
function selectWeaponOrAbility(
  rng: RNG, assignedWeapon: string, agent: string, playerId: string,
  agentAbilities?: Record<string, AgentAbility[]>
): AbilityKillResult {
  const noAbility: AbilityKillResult = { weapon: assignedWeapon, isAbilityKill: false, isUlt: false, aoe: false, maxKills: 1, headshotRate: 0, refreshOnKill: false, refreshKillReq: 0 };

  const abilities = agentAbilities?.[agent.toLowerCase()] ?? getAbilities(agent);

  // new system: check each available ability
  if (abilities.length > 0) {
    // sticky check: if this player committed to an ability this round,
    // chain = 100% stick, primary/frequent = 90% stick
    const stickyId = _stickyAbility.get(playerId);
    if (stickyId) {
      const stickyAb = abilities.find(a => a.id === stickyId);
      if (stickyAb) {
        const stickChance = stickyAb.chain ? 1.0 : 0.90;
        if (rng() < stickChance) {
          // ults: already activated this round, don't re-check/re-consume charge
          // non-ults: still need uses remaining and consume per kill
          let canContinue = false;
          if (stickyAb.type === 'ultimate') {
            // ult is active for the round once triggered — no re-check
            canContinue = true;
          } else if (hasAbilityUses(playerId, stickyAb.id)) {
            consumeAbilityUse(playerId, stickyAb.id);
            canContinue = true;
          }
          if (canContinue) {
            return {
              weapon: stickyAb.name,
              isAbilityKill: true,
              abilityId: stickyAb.id,
              isUlt: stickyAb.type === 'ultimate',
              aoe: stickyAb.aoe,
              maxKills: stickyAb.maxKills,
              headshotRate: stickyAb.headshotRate,
              refreshOnKill: stickyAb.refreshOnKill,
              refreshKillReq: stickyAb.refreshKillReq,
            };
          }
        }
        // out of ammo or roll failed — clear sticky
        _stickyAbility.delete(playerId);
      }
    }

    // collect usable abilities this round
    const usable: AgentAbility[] = [];
    for (const ab of abilities) {
      // skip utility ults — handled pre-round as pIndex boost
      if (ab.type === 'ultimate' && (ab.utilityBonus ?? 0) > 0) continue;
      if (ab.type === 'ultimate') {
        if (isUltReady(playerId, agent, agentAbilities)) usable.push(ab);
      } else {
        if (hasAbilityUses(playerId, ab.id)) usable.push(ab);
      }
    }

    // eco weapon: if player has a pistol-tier gun (tier ≤ 3) and an eco ability is available,
    // auto-proc it — prefer ult eco weapons (e.g. TDF) over basic (headhunter)
    const gunTier = WEAPON_TIER[assignedWeapon] ?? 4;
    if (gunTier <= 3) {
      const ecoAb = usable.find(ab => ab.ecoWeapon && ab.type === 'ultimate') ?? usable.find(ab => ab.ecoWeapon);
      if (ecoAb) {
        if (ecoAb.type === 'ultimate') consumeUlt(playerId);
        else consumeAbilityUse(playerId, ecoAb.id);
        if (ecoAb.chain || ecoAb.usage === 'primary' || ecoAb.usage === 'frequent') {
          _stickyAbility.set(playerId, ecoAb.id);
        }
        return {
          weapon: ecoAb.name,
          isAbilityKill: true,
          abilityId: ecoAb.id,
          isUlt: ecoAb.type === 'ultimate',
          aoe: ecoAb.aoe,
          maxKills: ecoAb.maxKills,
          headshotRate: ecoAb.headshotRate,
          refreshOnKill: ecoAb.refreshOnKill,
          refreshKillReq: ecoAb.refreshKillReq,
        };
      }
    }

    // roll each usable ability by its effective kill chance (first hit wins)
    for (const ab of usable) {
      if (rng() < getKillChance(ab)) {
        // consume use
        if (ab.type === 'ultimate') consumeUlt(playerId);
        else consumeAbilityUse(playerId, ab.id);

        // set sticky: player commits to this ability for the round
        // triggers for: chain flag, or primary/frequent usage
        if (ab.chain || ab.usage === 'primary' || ab.usage === 'frequent') {
          _stickyAbility.set(playerId, ab.id);
        }

        return {
          weapon: ab.name,
          isAbilityKill: true,
          abilityId: ab.id,
          isUlt: ab.type === 'ultimate',
          aoe: ab.aoe,
          maxKills: ab.maxKills,
          headshotRate: ab.headshotRate,
          refreshOnKill: ab.refreshOnKill,
          refreshKillReq: ab.refreshKillReq,
        };
      }
    }
    return noAbility;
  }

  // legacy fallback: only when new ability system isn't in use at all
  // if agentAbilities param exists, the user is using the new system — agents
  // without entries simply don't get ability kills (gun kills only)
  if (!agentAbilities && rng() < 0.12) {
    const legacyAbilities = AGENT_ABILITY_KILLS[agent.toLowerCase()];
    if (legacyAbilities && legacyAbilities.length > 0) {
      return { ...noAbility, weapon: legacyAbilities[randomInt(rng, 0, legacyAbilities.length - 1)], isAbilityKill: true };
    }
  }
  return noAbility;
}

/** After a kill, check if killer should pick up victim's weapon (tier upgrade) */
function maybePickupWeapon(rng: RNG, killerWeapon: string, victimWeapon: string): string | null {
  const killerTier = WEAPON_TIER[killerWeapon] ?? 4;
  const victimTier = WEAPON_TIER[victimWeapon] ?? 4;
  const tierDiff = victimTier - killerTier;
  if (tierDiff <= 0) return null; // no downgrade or sidegrade
  // higher tier diff = higher pickup chance
  const pickupChance = tierDiff >= 3 ? 0.95 : tierDiff >= 2 ? 0.85 : 0.50;
  return rng() < pickupChance ? victimWeapon : null;
}

/**
 * Determine how a round was won based on context.
 * 
 * ATTACKERS WIN:
 *   - All defenders dead → elimination (or spike_detonation if spike was planted)
 *   - Defenders alive → spike_detonation (only way attackers win without full wipe)
 * 
 * DEFENDERS WIN:
 *   - All attackers dead → elimination (or spike_defused if spike was planted pre-wipe)
 *   - Attackers alive → spike_defused (planted but defused) or time_expired (never planted)
 */
function determineWinCondition(
  rng: RNG,
  attackersWon: boolean,
  winnersAlive: number,
  losersAlive: number
): RoundWinCondition {
  if (attackersWon) {
    if (losersAlive === 0) {
      // attackers wiped defenders — spike may or may not have been planted
      const spikePlantChance = winnersAlive <= 2 ? 0.5 : 0.3;
      return rng() < spikePlantChance ? 'spike_detonation' : 'elimination';
    }
    // attackers won with defenders still alive → spike planted and detonated
    return 'spike_detonation';
  }

  // defenders won
  if (losersAlive === 0) {
    // defenders wiped all attackers — retake defuse possible
    const defuseChance = winnersAlive <= 2 ? 0.55 : 0.35;
    return rng() < defuseChance ? 'spike_defused' : 'elimination';
  }

  // defenders won with attackers still alive → NOT elimination
  // either spike was planted and defused, or time expired (attackers never planted)
  if (winnersAlive <= 2 && losersAlive === 1) {
    // close clutch — higher chance spike was planted and defused
    return rng() < 0.40 ? 'spike_defused' : 'time_expired';
  }

  // comfortable defender hold — attackers likely never got on site
  return rng() < 0.20 ? 'spike_defused' : 'time_expired';
}

/**
 * Buy state machine — determines what a team buys next round
 */
// ── Credit-based Economy ──

const CREDIT_MAX = 9000;
const PISTOL_CREDITS = 800;
const OT_CREDITS = 5000;

/** Average cost per buy state */
const BUY_COST: Record<BuyState, number> = {
  pistol: 500,   // Ghost/Sheriff + abilities, or Classic + light
  save: 400,     // Pistol + light shield
  eco: 800,      // Sheriff + light
  force: 2000,   // Spectre + light shield
  half: 2600,    // Spectre + heavy shield, or Vandal + light
  full: 3900,    // Rifle + heavy shield + full util
};

const WIN_BONUS = 3000;

// team-coordinated shield buy — one team roll sets the floor, per-player variance only upgrades
// team floor probabilities per buy state
const TEAM_SHIELD_FLOOR: Record<BuyState, [ShieldType, number][]> = {
  pistol: [['none', 1.00]],     // overridden per-weapon in simulateRound
  save:   [['light', 1.00]],    // pistol + light shields (broke round)
  eco:    [['light', 1.00]],
  force:  [['light', 1.00]],
  half:   [['heavy', 1.00]],    // overridden per-weapon in simulateRound
  full:   [['heavy', 1.00]],
};

// per-player upgrade chance from team floor
const PLAYER_SHIELD_UPGRADE: Record<BuyState, [number, ShieldType][]> = {
  pistol: [],                                    // handled by weapon-shield coupling
  save:   [],                                    // pistol + light, no variance
  eco:    [[0.25, 'regen']],                     // 25% upgrade light → regen
  force:  [[0.30, 'regen'], [0.05, 'heavy']],   // 30% regen, 5% heavy
  half:   [],                                    // handled by weapon-shield coupling
  full:   [],                                    // everyone heavy, no variance
};

// max shield hp per type
const SHIELD_MAX_HP: Record<ShieldType, number> = { none: 0, light: 25, regen: 25, heavy: 50 };

// pIndex bonus per shield type (layered on top of buyStateMod)
const SHIELD_PINDEX: Record<ShieldType, number> = { none: 0, light: 2, regen: 2.5, heavy: 4 };

// regen shield total pool — can recover this much shield hp across a round
const REGEN_POOL = 50;

function assignTeamShieldFloor(rng: RNG, buyState: BuyState): ShieldType {
  const floors = TEAM_SHIELD_FLOOR[buyState];
  const roll = rng();
  for (const [type, cumProb] of floors) {
    if (roll < cumProb) return type;
  }
  return floors[floors.length - 1][0];
}

function assignPlayerShield(rng: RNG, buyState: BuyState, floor: ShieldType): ShieldType {
  const upgrades = PLAYER_SHIELD_UPGRADE[buyState];
  if (!upgrades.length) return floor;
  const roll = rng();
  let cum = 0;
  for (const [chance, type] of upgrades) {
    cum += chance;
    if (roll < cum) return type;
  }
  return floor;
}

// apply damage to shield first, return remaining damage that hits health
function applyShieldDamage(p: PlayerRoundState, rawDmg: number): number {
  if (p.shieldHp <= 0) return rawDmg;
  // light/heavy absorb 66%, regen absorbs 100%
  const absorbRate = p.shield === 'regen' ? 1.0 : 0.66;
  const shieldDmg = Math.min(p.shieldHp, Math.floor(rawDmg * absorbRate));
  p.shieldHp -= shieldDmg;
  return rawDmg - shieldDmg;
}

// regen shield recovery between duels — restores shield hp if pool remains
function regenShield(p: PlayerRoundState): void {
  if (p.shield !== 'regen' || p.shieldRegenPool <= 0) return;
  const missing = SHIELD_MAX_HP.regen - p.shieldHp;
  if (missing <= 0) return;
  const restored = Math.min(missing, p.shieldRegenPool);
  p.shieldHp += restored;
  p.shieldRegenPool -= restored;
}
const LOSS_BONUSES = [1900, 2400, 2900]; // 1st, 2nd, 3rd+ consecutive loss
const KILL_BONUS = 200;
const PLANT_BONUS = 300;

interface TeamEconomy {
  credits: number;
  lossStreak: number;
}

function getRoundIncome(won: boolean, lossStreak: number, kills: number, spikePlanted: boolean, wasAttacker: boolean): number {
  let income: number;
  if (won) {
    income = WIN_BONUS;
  } else {
    const streakIdx = Math.min(Math.max(lossStreak - 1, 0), 2);
    income = LOSS_BONUSES[streakIdx];
  }
  income += kills * KILL_BONUS;
  // Plant bonus for attackers (regardless of win/loss)
  if (spikePlanted && wasAttacker) income += PLANT_BONUS;
  return income;
}

function determineBuyState(
  rng: RNG,
  credits: number,
  prevBuyState: BuyState,
  wonRound: boolean,
): BuyState {
  if (wonRound) {
    if (prevBuyState === 'pistol') return 'half'; // bonus round
    if (credits >= 3900) return 'full';
    if (credits >= 2600) return 'half';
    // very rare: won but still broke — eco to rebuild
    return 'eco';
  }

  // lost round
  if (prevBuyState === 'pistol') {
    // after pistol loss: always save (light buy next round to afford full on 4th)
    return 'save';
  }

  if (prevBuyState === 'save' || prevBuyState === 'eco') {
    // saved up — should afford a buy
    if (credits >= 3900) return 'full';
    if (credits >= 2600) return 'half';
    // rare: saved but still short — eco again
    return 'eco';
  }

  if (prevBuyState === 'force') {
    // lost the force — broke, save with pistols + light shields
    return 'save';
  }

  if (prevBuyState === 'half') {
    // lost bonus/half-buy — save to guarantee full buy next round
    return credits >= 800 ? 'eco' : 'save';
  }

  // lost on full buy
  if (credits >= 3900) return 'full';
  if (credits >= 2600) return 'half';
  if (credits >= 800) return 'eco';
  return 'save';
}

/**
 * Simulate a single round with economy, event logging, and weapon tracking
 */
interface RoundResult {
  winner: 'team1' | 'team2';
  log: RoundLog;
}

function simulateRound(
  rng: RNG,
  team1: TeamMapState,
  team2: TeamMapState,
  roundsPlayed: number = 0,
  agentMeta?: Record<string, number>,
  team1BuyState: BuyState = 'full',
  team2BuyState: BuyState = 'full',
  roundNumber: number = 1,
  isTeam1Attacking: boolean = true,
  playerWeapons: Map<string, string> = new Map(),
  agentAbilities?: Record<string, AgentAbility[]>
): RoundResult {
  const team1Mod = _simCfg.buyStateMods[team1BuyState] ?? BUY_STATE_PINDEX[team1BuyState];
  const team2Mod = _simCfg.buyStateMods[team2BuyState] ?? BUY_STATE_PINDEX[team2BuyState];
  
  // team-coordinated shield buy — one roll per team sets the floor
  const t1Floor = assignTeamShieldFloor(rng, team1BuyState);
  const t2Floor = assignTeamShieldFloor(rng, team2BuyState);

  // momentum pIndex bonus: +3 per point (doubled in legendary mode)
  const mStr = _simCfg.momentumStrength ?? 1;
  const t1MomentumBonus = mStr > 0 ? _homeMomentum * 3 * mStr : 0;
  const t2MomentumBonus = mStr > 0 ? _awayMomentum * 3 * mStr : 0;

  for (const p of team1.players) {
    p.alive = true;
    p.health = 100;
    p.damagedBy = new Set();
    p.roundKills = 0;
    p.buyStateModifier = team1Mod + t1MomentumBonus;
    const s = assignPlayerShield(rng, team1BuyState, t1Floor);
    p.shield = s;
    p.shieldHp = SHIELD_MAX_HP[s];
    p.shieldRegenPool = s === 'regen' ? REGEN_POOL : 0;
  }
  for (const p of team2.players) {
    p.alive = true;
    p.health = 100;
    p.damagedBy = new Set();
    p.roundKills = 0;
    p.buyStateModifier = team2Mod + t2MomentumBonus;
    const s = assignPlayerShield(rng, team2BuyState, t2Floor);
    p.shield = s;
    p.shieldHp = SHIELD_MAX_HP[s];
    p.shieldRegenPool = s === 'regen' ? REGEN_POOL : 0;
  }

  // snapshot assists before combat so we can diff for per-round counts
  const assistsBefore = new Map<string, number>();
  for (const p of [...team1.players, ...team2.players]) {
    assistsBefore.set(p.player.id, p.assists);
  }
  
  const [attackingTeam, defendingTeam] = isTeam1Attacking ? [team1, team2] : [team2, team1];
  const attackingBuyState = attackingTeam === team1 ? team1BuyState : team2BuyState;
  const defendingBuyState = defendingTeam === team1 ? team1BuyState : team2BuyState;
  
  const maxDuels = 20;
  let duelCount = 0;
  let firstKillAwarded = false;
  let killNumber = 0;
  const allPlayers = [...team1.players, ...team2.players];
  const kills: KillEvent[] = [];

  // Ensure all players have a weapon (fallback — should already be assigned by simulateMap)
  for (const p of attackingTeam.players) {
    if (!playerWeapons.has(p.player.id)) {
      playerWeapons.set(p.player.id, assignRoundWeapon(rng, attackingBuyState, p.assignedRole, p.agent, p.player.id, agentAbilities, p.player.gunPref));
    }
  }
  for (const p of defendingTeam.players) {
    if (!playerWeapons.has(p.player.id)) {
      playerWeapons.set(p.player.id, assignRoundWeapon(rng, defendingBuyState, p.assignedRole, p.agent, p.player.id, agentAbilities, p.player.gunPref));
    }
  }

  // weapon-shield coupling: pistol and half-buy have weapon-dependent shields
  for (const p of allPlayers) {
    const bs = team1.players.includes(p) ? team1BuyState : team2BuyState;
    const gun = playerWeapons.get(p.player.id) || 'Classic';
    if (bs === 'pistol') {
      // ghost/sheriff = no shield (spent credits on gun), classic/frenzy = light shield
      const tier = WEAPON_TIER[gun] ?? 1;
      const shield: ShieldType = tier >= 2 ? 'none' : 'light';
      p.shield = shield;
      p.shieldHp = SHIELD_MAX_HP[shield];
      p.shieldRegenPool = 0;
    } else if (bs === 'half') {
      // vandal = light shield (can't afford heavy), spectre = heavy
      const shield: ShieldType = (WEAPON_TIER[gun] ?? 4) >= 6 ? 'light' : 'heavy';
      p.shield = shield;
      p.shieldHp = SHIELD_MAX_HP[shield];
      p.shieldRegenPool = 0;
    }
  }

  // utility ult consumption — timing-aware
  // preRound ults fire now; reactive/midRound/corpseEnemy fire during duel loop
  const utilityUltEvents: NonNullable<RoundLog['utilityUlts']> = [];

  // helper: resolve ult info for a player (agentAbilities override → UTILITY_ULT fallback)
  function getUtilUltInfo(p: typeof team1.players[0]) {
    const agentKey = p.agent.toLowerCase();
    const abilities = agentAbilities?.[agentKey] ?? getAbilities(agentKey);
    const ultAb = abilities.find(a => a.type === 'ultimate');
    if (ultAb && (ultAb.utilityBonus ?? 0) > 0) {
      // agentAbilities has timing fields — use them, fall back to preRound/0.80
      const timing = (ultAb.ultTiming ?? 'preRound') as UltTiming;
      return { bonus: ultAb.utilityBonus!, cost: ultAb.ultCost, abId: ultAb.id, abName: ultAb.name, timing, attackRate: ultAb.ultAttackRate ?? 0.80, defenseRate: ultAb.ultDefenseRate ?? 0.80 };
    }
    const fallback = UTILITY_ULT[agentKey];
    if (fallback) {
      return { bonus: fallback.bonus, cost: fallback.cost, abId: `${agentKey}-ult`, abName: `${p.agent} Ultimate`, timing: fallback.timing, attackRate: fallback.attackRate, defenseRate: fallback.defenseRate };
    }
    return null;
  }

  // helper: check if an agent's ult has a specific timing type (data-driven)
  function hasUltTiming(p: typeof team1.players[0], target: string): boolean {
    const agentKey = p.agent.toLowerCase();
    const abilities = agentAbilities?.[agentKey] ?? getAbilities(agentKey);
    const ultAb = abilities.find(a => a.type === 'ultimate');
    if (ultAb) return ultAb.ultTiming === target;
    // hardcoded fallbacks only when agent has no ability entries at all
    if (target === 'allyRes' && agentKey === 'sage') return true;
    if (target === 'selfRes' && agentKey === 'clove') return true;
    return false;
  }

  // helper: get ult cost for a player (agentAbilities → hardcoded fallback)
  function getPlayerUltCost(p: typeof team1.players[0]): number {
    const agentKey = p.agent.toLowerCase();
    const abilities = agentAbilities?.[agentKey] ?? getAbilities(agentKey);
    const ultAb = abilities.find(a => a.type === 'ultimate');
    if (ultAb) return ultAb.ultCost;
    if (agentKey === 'sage') return SAGE_ULT_COST;
    if (agentKey === 'clove') return CLOVE_ULT_COST;
    return UTILITY_ULT[agentKey]?.cost ?? 7;
  }

  // helper: fire a utility ult for a player (afterKill: -1 = pre-round, N = after Nth kill)
  function fireUtilUlt(p: typeof team1.players[0], team: typeof team1, info: NonNullable<ReturnType<typeof getUtilUltInfo>>, afterKill = -1) {
    consumeUlt(p.player.id);
    _midRoundUltsUsed.add(p.player.id);
    utilityUltEvents.push({
      playerId: p.player.id, playerName: p.player.name,
      agent: p.agent, teamId: team.id,
      abilityId: info.abId, abilityName: info.abName,
      afterKillIndex: afterKill,
    });
    for (const t of team.players) {
      t.buyStateModifier += info.bonus;
    }
  }

  // count ready utility ults per team for combo coordination bonus
  function countReadyUtilUlts(team: typeof team1): number {
    let count = 0;
    for (const p of team.players) {
      const info = getUtilUltInfo(p);
      if (!info || info.bonus <= 0) continue;
      const charge = _ultCharge.get(p.player.id) ?? 0;
      if (charge >= info.cost) count++;
    }
    return count;
  }

  // pre-round: fire only preRound-timing ults
  for (const team of [team1, team2]) {
    const isAttacking = team === attackingTeam;
    const ownBuy = isAttacking ? attackingBuyState : defendingBuyState;
    const oppBuy = isAttacking ? defendingBuyState : attackingBuyState;
    const scoreDiff = team.roundsWon - (team === team1 ? team2 : team1).roundsWon;
    const readyCount = countReadyUtilUlts(team);
    for (const p of team.players) {
      const info = getUtilUltInfo(p);
      if (!info || info.bonus <= 0 || info.timing !== 'preRound') continue;
      const charge = _ultCharge.get(p.player.id) ?? 0;
      if (charge < info.cost) continue;
      const baseRate = isAttacking ? info.attackRate : info.defenseRate;
      const rate = getEffectiveUltRate(baseRate, ownBuy, oppBuy, roundNumber, scoreDiff, p.player.id, readyCount);
      if (rng() > rate) continue;
      fireUtilUlt(p, team, info);
    }
  }

  // sage/clove ult readiness — checked during duel loop (data-driven via ultTiming)
  const sageReady = new Map<string, typeof team1.players[0]>(); // teamId → ally-res player
  const cloveReady = new Map<string, typeof team1.players[0]>(); // playerId → self-res player
  for (const team of [team1, team2]) {
    for (const p of team.players) {
      const cost = getPlayerUltCost(p);
      if (hasUltTiming(p, 'allyRes') && (_ultCharge.get(p.player.id) ?? 0) >= cost) {
        sageReady.set(team.id, p);
      }
      if (hasUltTiming(p, 'selfRes') && (_ultCharge.get(p.player.id) ?? 0) >= cost) {
        cloveReady.set(p.player.id, p);
      }
    }
  }

  // snapshot loadouts for the round log
  const weaponSnap: Record<string, string> = {};
  const shieldSnap: Record<string, ShieldType> = {};
  for (const p of allPlayers) {
    weaponSnap[p.player.id] = playerWeapons.get(p.player.id) || 'Classic';
    shieldSnap[p.player.id] = p.shield;
  }
  
  // Trade tracking: after a kill, a teammate of the victim may immediately trade
  let pendingTrade: {
    killerId: string;
    killerTeam: typeof team1;
    victimTeam: typeof team1;
  } | null = null;

  // activate util auras for this round (persist even if caster dies)
  const utilAuras = activateUtilAuras(rng, team1, team2);

  // Clutch tracking: when a team drops to 1 alive vs 2+, record the situation
  let clutchSituation: {
    playerId: string;
    playerName: string;
    playerAgent: string;
    teamId: string;
    team: typeof team1;
    opponents: number;
  } | null = null;

  // mid-round ult tracking: has each team lost any players?
  let attackerDeaths = 0;
  let defenderDeaths = 0;

  while (duelCount < maxDuels) {
    const attackingAlive = attackingTeam.players.filter(p => p.alive).length;
    const defendingAlive = defendingTeam.players.filter(p => p.alive).length;
    
    if (attackingAlive === 0 || defendingAlive === 0) break;
    
    // early termination — only on large advantages after enough duels
    // real valorant rounds typically have 5-8 kills; saves only on eco/half
    const diff = Math.abs(attackingAlive - defendingAlive);
    if (diff >= 3 && duelCount >= 5) {
      const isEcoSave = (attackingAlive < defendingAlive && (attackingBuyState === 'eco' || attackingBuyState === 'save'))
        || (defendingAlive < attackingAlive && (defendingBuyState === 'eco' || defendingBuyState === 'save'));
      const endChance = diff >= 4 ? 0.7 : isEcoSave ? 0.5 : 0.3;
      if (rng() < endChance) break;
    }
    
    // Trade system: if pending, force the matchup (trader from victim's team vs the killer)
    let tradeForced = false;
    let forcedTrader: typeof team1.players[0] | null = null;
    let forcedTarget: typeof team1.players[0] | null = null;
    
    if (pendingTrade) {
      const target = pendingTrade.killerTeam.players.find(p => p.player.id === pendingTrade!.killerId && p.alive);
      const traders = pendingTrade.victimTeam.players.filter(p => p.alive);
      if (target && traders.length > 0) {
        forcedTrader = traders[randomInt(rng, 0, traders.length - 1)];
        forcedTarget = target;
        tradeForced = true;
      }
      pendingTrade = null;
    }
    
    // Resolve who is "attacker side" and "defender side" for the duel
    let attacker: ReturnType<typeof selectAlivePlayer>;
    let defender: ReturnType<typeof selectAlivePlayer>;
    
    if (tradeForced && forcedTrader && forcedTarget) {
      // Map forced players to attacker/defender based on their team
      if (attackingTeam.players.includes(forcedTrader)) {
        attacker = forcedTrader;
        defender = forcedTarget;
      } else {
        attacker = forcedTarget;
        defender = forcedTrader;
      }
    } else {
      attacker = selectAlivePlayer(rng, attackingTeam);
      defender = selectAlivePlayer(rng, defendingTeam);
    }
    
    if (!attacker || !defender) break;
    
    if (rng() < 0.3) {
      const helpers = attackingTeam.players.filter(p => p.alive && p.player.id !== attacker.player.id);
      if (helpers.length > 0) {
        const helper = helpers[randomInt(rng, 0, helpers.length - 1)];
        defender.damagedBy.add(helper.player.id);
      }
    }
    if (rng() < 0.3) {
      const helpers = defendingTeam.players.filter(p => p.alive && p.player.id !== defender.player.id);
      if (helpers.length > 0) {
        const helper = helpers[randomInt(rng, 0, helpers.length - 1)];
        attacker.damagedBy.add(helper.player.id);
      }
    }
    
    // resolve per-team coach + assistant rating for adaptation penalty
    const atkCoach = team1.players.includes(attacker) ? _homeCoachRating : _awayCoachRating;
    const defCoach = team1.players.includes(defender) ? _homeCoachRating : _awayCoachRating;
    const atkAssist = team1.players.includes(attacker) ? _homeAssistantRating : _awayAssistantRating;
    const defAssist = team1.players.includes(defender) ? _homeAssistantRating : _awayAssistantRating;
    const winner = simulateDuel(rng, attacker, defender,
      getAdaptationPenalty(attacker, roundsPlayed, atkCoach, atkAssist),
      getAdaptationPenalty(defender, roundsPlayed, defCoach, defAssist),
      agentMeta
    );
    
    killNumber++;
    const isFirstBlood = !firstKillAwarded;
    
    if (winner === 'attacker') {
      defender.alive = false;
      defender.health = 0;
      defender.deaths++;
      attacker.kills++;
      attacker.roundKills++;
      
      if (!firstKillAwarded) { attacker.firstKills++; defender.firstDeaths++; firstKillAwarded = true; }
      maybeAwardAssist(rng, attacker, defender, attackingTeam, allPlayers, utilAuras);
      
      const killerGun = playerWeapons.get(attacker.player.id) || 'Vandal';
      const victimGun = playerWeapons.get(defender.player.id) || 'Vandal';
      const abResult = selectWeaponOrAbility(rng, killerGun, attacker.agent, attacker.player.id, agentAbilities);
      const { weapon, isAbilityKill, abilityId } = abResult;
      const isHeadshot = isAbilityKill ? rng() < abResult.headshotRate : rng() < (_simCfg.headshotChance[weapon] ?? 0.25);
      const isWallbang = !isAbilityKill && rng() < (_simCfg.wallbangChance[weapon] ?? 0.05);
      // mark first ult kill this round for UI indicator
      let isUltActivation = false;
      if (abResult.isUlt && abilityId) {
        const key = `${attacker.player.id}:${abilityId}`;
        if (!_ultActivatedThisRound.has(key)) {
          _ultActivatedThisRound.add(key);
          isUltActivation = true;
        }
      }
      kills.push({
        type: 'kill', killerPlayerId: attacker.player.id, killerName: attacker.player.name,
        killerAgent: attacker.agent, killerTeamId: attackingTeam.id,
        victimPlayerId: defender.player.id, victimName: defender.player.name,
        victimAgent: defender.agent, victimTeamId: defendingTeam.id,
        weapon, abilityId, isFirstBlood, isAbilityKill, isHeadshot, isWallbang, isUltActivation, killNumber, killerRoundKills: attacker.roundKills,
      });

      // ult charge: +1 per kill
      addUltCharge(attacker.player.id, 1);

      // ability refresh check (jett knives, raze nade, etc.)
      if (isAbilityKill && abResult.refreshOnKill) {
        const abilities = agentAbilities?.[attacker.agent.toLowerCase()] ?? getAbilities(attacker.agent);
        const ab = abilities.find(a => a.id === abilityId);
        if (ab) tryRefreshAbility(attacker.player.id, ab, attacker.roundKills);
      }

      // aoe bonus kills — ability can splash additional alive enemies
      if (isAbilityKill && abResult.aoe && abResult.maxKills > 1) {
        const extraTargets = defendingTeam.players.filter(p => p.alive && p.player.id !== defender.player.id);
        let bonusKills = 0;
        for (const target of extraTargets) {
          if (bonusKills >= abResult.maxKills - 1) break;
          // each extra target has diminishing hit chance
          if (rng() < abResult.headshotRate + 0.08 - bonusKills * 0.04) {
            target.alive = false;
            target.health = 0;
            target.deaths++;
            attacker.kills++;
            attacker.roundKills++;
            killNumber++;
            bonusKills++;
            kills.push({
              type: 'kill', killerPlayerId: attacker.player.id, killerName: attacker.player.name,
              killerAgent: attacker.agent, killerTeamId: attackingTeam.id,
              victimPlayerId: target.player.id, victimName: target.player.name,
              victimAgent: target.agent, victimTeamId: defendingTeam.id,
              weapon, abilityId, isFirstBlood: false, isAbilityKill: true,
              isHeadshot: false, isWallbang: false, isAoeSplash: true, killNumber, killerRoundKills: attacker.roundKills,
            });
            addUltCharge(attacker.player.id, 1);
            maybeAwardAssist(rng, attacker, target, attackingTeam, allPlayers, utilAuras);
          }
        }
      }

      // pickup: if victim had a better gun, killer might grab it
      const pickup = maybePickupWeapon(rng, killerGun, victimGun);
      if (pickup) playerWeapons.set(attacker.player.id, pickup);
      
      // Trade chance: ~40% a teammate of the victim immediately swings
      if (!tradeForced && rng() < _simCfg.tradeChance) {
        const tradeDmg = randomInt(rng, 20, 50);
        const hpDmg = applyShieldDamage(attacker, tradeDmg);
        attacker.health = Math.max(1, attacker.health - hpDmg);
        regenShield(attacker);
        pendingTrade = { killerId: attacker.player.id, killerTeam: attackingTeam, victimTeam: defendingTeam };
      }
    } else {
      attacker.alive = false;
      attacker.health = 0;
      attacker.deaths++;
      defender.kills++;
      defender.roundKills++;
      
      if (!firstKillAwarded) { defender.firstKills++; attacker.firstDeaths++; firstKillAwarded = true; }
      maybeAwardAssist(rng, defender, attacker, defendingTeam, allPlayers, utilAuras);
      
      const killerGun = playerWeapons.get(defender.player.id) || 'Vandal';
      const victimGun = playerWeapons.get(attacker.player.id) || 'Vandal';
      const abResult = selectWeaponOrAbility(rng, killerGun, defender.agent, defender.player.id, agentAbilities);
      const { weapon, isAbilityKill, abilityId } = abResult;
      const isHeadshot = isAbilityKill ? rng() < abResult.headshotRate : rng() < (_simCfg.headshotChance[weapon] ?? 0.25);
      const isWallbang = !isAbilityKill && rng() < (_simCfg.wallbangChance[weapon] ?? 0.05);
      let isUltActivation = false;
      if (abResult.isUlt && abilityId) {
        const key = `${defender.player.id}:${abilityId}`;
        if (!_ultActivatedThisRound.has(key)) {
          _ultActivatedThisRound.add(key);
          isUltActivation = true;
        }
      }
      kills.push({
        type: 'kill', killerPlayerId: defender.player.id, killerName: defender.player.name,
        killerAgent: defender.agent, killerTeamId: defendingTeam.id,
        victimPlayerId: attacker.player.id, victimName: attacker.player.name,
        victimAgent: attacker.agent, victimTeamId: attackingTeam.id,
        weapon, abilityId, isFirstBlood, isAbilityKill, isHeadshot, isWallbang, isUltActivation, killNumber, killerRoundKills: defender.roundKills,
      });

      // ult charge: +1 per kill
      addUltCharge(defender.player.id, 1);

      // ability refresh check
      if (isAbilityKill && abResult.refreshOnKill) {
        const abilities = agentAbilities?.[defender.agent.toLowerCase()] ?? getAbilities(defender.agent);
        const ab = abilities.find(a => a.id === abilityId);
        if (ab) tryRefreshAbility(defender.player.id, ab, defender.roundKills);
      }

      // aoe bonus kills
      if (isAbilityKill && abResult.aoe && abResult.maxKills > 1) {
        const extraTargets = attackingTeam.players.filter(p => p.alive && p.player.id !== attacker.player.id);
        let bonusKills = 0;
        for (const target of extraTargets) {
          if (bonusKills >= abResult.maxKills - 1) break;
          if (rng() < abResult.headshotRate + 0.08 - bonusKills * 0.04) {
            target.alive = false;
            target.health = 0;
            target.deaths++;
            defender.kills++;
            defender.roundKills++;
            killNumber++;
            bonusKills++;
            kills.push({
              type: 'kill', killerPlayerId: defender.player.id, killerName: defender.player.name,
              killerAgent: defender.agent, killerTeamId: defendingTeam.id,
              victimPlayerId: target.player.id, victimName: target.player.name,
              victimAgent: target.agent, victimTeamId: attackingTeam.id,
              weapon, abilityId, isFirstBlood: false, isAbilityKill: true,
              isHeadshot: false, isWallbang: false, isAoeSplash: true, killNumber, killerRoundKills: defender.roundKills,
            });
            addUltCharge(defender.player.id, 1);
            maybeAwardAssist(rng, defender, target, defendingTeam, allPlayers, utilAuras);
          }
        }
      }

      // pickup: if victim had a better gun, killer might grab it
      const pickup = maybePickupWeapon(rng, killerGun, victimGun);
      if (pickup) playerWeapons.set(defender.player.id, pickup);
      
      // Trade chance: ~40% a teammate of the victim immediately swings
      if (!tradeForced && rng() < _simCfg.tradeChance) {
        const tradeDmg = randomInt(rng, 20, 50);
        const hpDmg = applyShieldDamage(defender, tradeDmg);
        defender.health = Math.max(1, defender.health - hpDmg);
        regenShield(defender);
        pendingTrade = { killerId: defender.player.id, killerTeam: defendingTeam, victimTeam: attackingTeam };
      }
    }
    
    // Clutch detection: check if either team just dropped to 1 alive vs 2+
    if (!clutchSituation) {
      const t1Alive = team1.players.filter(p => p.alive);
      const t2Alive = team2.players.filter(p => p.alive);
      if (t1Alive.length === 1 && t2Alive.length >= 1) {
        clutchSituation = {
          playerId: t1Alive[0].player.id, playerName: t1Alive[0].player.name,
          playerAgent: t1Alive[0].agent, teamId: team1.id, team: team1,
          opponents: t2Alive.length,
        };
      } else if (t2Alive.length === 1 && t1Alive.length >= 1) {
        clutchSituation = {
          playerId: t2Alive[0].player.id, playerName: t2Alive[0].player.name,
          playerAgent: t2Alive[0].agent, teamId: team2.id, team: team2,
          opponents: t1Alive.length,
        };
      }
    }

    // track deaths per side for mid-round ult triggers
    const atkNowAlive = attackingTeam.players.filter(p => p.alive).length;
    const defNowAlive = defendingTeam.players.filter(p => p.alive).length;
    attackerDeaths = 5 - atkNowAlive;
    defenderDeaths = 5 - defNowAlive;

    // round already decided — skip all mid-round ult/res processing
    if (atkNowAlive === 0 || defNowAlive === 0) continue;

    // ── mid-round utility ult checks ──
    for (const team of [team1, team2]) {
      const isAttacking = team === attackingTeam;
      const ownBuy = isAttacking ? attackingBuyState : defendingBuyState;
      const oppBuy = isAttacking ? defendingBuyState : attackingBuyState;
      const scoreDiff = team.roundsWon - (team === team1 ? team2 : team1).roundsWon;
      const readyCount = countReadyUtilUlts(team);
      for (const p of team.players) {
        if (!p.alive || _midRoundUltsUsed.has(p.player.id)) continue;
        const info = getUtilUltInfo(p);
        if (!info || info.bonus <= 0 || info.timing === 'preRound') continue;
        const charge = _ultCharge.get(p.player.id) ?? 0;
        if (charge < info.cost) continue;

        let shouldFire = false;
        const teamDeaths = isAttacking ? attackerDeaths : defenderDeaths;
        const enemyDeaths = isAttacking ? defenderDeaths : attackerDeaths;
        const baseRate = isAttacking ? info.attackRate : info.defenseRate;
        const rate = getEffectiveUltRate(baseRate, ownBuy, oppBuy, roundNumber, scoreDiff, p.player.id, readyCount);

        if (info.timing === 'reactive' && teamDeaths >= 1) {
          shouldFire = rng() < rate;
        } else if (info.timing === 'midRound' && duelCount >= 2) {
          shouldFire = rng() < rate;
        } else if (info.timing === 'corpseEnemy' && enemyDeaths >= 1) {
          shouldFire = rng() < rate;
        }

        if (shouldFire) fireUtilUlt(p, team, info, kills.length);
      }
    }

    // ── sage resurrection: revive a dead teammate after first allied death ──
    for (const team of [team1, team2]) {
      const sage = sageReady.get(team.id);
      if (!sage || !sage.alive || _sageResUsedThisRound.has(sage.player.id)) continue;
      const teamDeaths = team === attackingTeam ? attackerDeaths : defenderDeaths;
      if (teamDeaths < 1) continue;

      // game-sense: skip res when team already has a dominant numbers advantage
      const teamAlive = team.players.filter(p => p.alive).length;
      const enemy = team === team1 ? team2 : team1;
      const enemyAlive = enemy.players.filter(p => p.alive).length;
      if (teamAlive >= enemyAlive + 2) continue;

      // 75% chance to use res when a teammate is down
      if (rng() > 0.75) continue;

      const dead = team.players.filter(p => !p.alive && p.player.id !== sage.player.id);
      if (dead.length === 0) continue;

      // pick highest-value target: role priority + weapon tier
      const target = dead.sort((a, b) => {
        const ra = RES_PRIORITY[a.assignedRole] ?? 2;
        const rb = RES_PRIORITY[b.assignedRole] ?? 2;
        if (rb !== ra) return rb - ra;
        const wa = WEAPON_TIER[playerWeapons.get(a.player.id) || 'Classic'] ?? 1;
        const wb = WEAPON_TIER[playerWeapons.get(b.player.id) || 'Classic'] ?? 1;
        return wb - wa;
      })[0];
      target.alive = true;
      target.health = 60; // res comes back low hp
      target.shield = 'none';
      target.shieldHp = 0;
      target.shieldRegenPool = 0;
      consumeUlt(sage.player.id);
      _sageResUsedThisRound.add(sage.player.id);
      sageReady.delete(team.id);
      utilityUltEvents.push({
        playerId: sage.player.id, playerName: sage.player.name,
        agent: sage.agent, teamId: team.id,
        abilityId: 'sage-resurrection', abilityName: 'Resurrection',
        afterKillIndex: kills.length,
        targetPlayerId: target.player.id, targetPlayerName: target.player.name,
        targetAgent: target.agent,
      });
    }

    // ── clove self-res: on death, 60% chance to enter "not dead yet" timer ──
    for (const team of [team1, team2]) {
      for (const p of team.players) {
        if (p.agent.toLowerCase() !== 'clove') continue;
        // just died this duel and has ult ready
        if (!p.alive && cloveReady.has(p.player.id) && !_midRoundUltsUsed.has(p.player.id)) {
          if (rng() < 0.60) {
            p.alive = true;
            p.health = 50;
            p.shield = 'none';
            p.shieldHp = 0;
            p.shieldRegenPool = 0;
            consumeUlt(p.player.id);
            _midRoundUltsUsed.add(p.player.id);
            cloveReady.delete(p.player.id);
            // must get a kill within 3 duels or die again
            _cloveTimer.set(p.player.id, { duelsLeft: 3, killsAtRes: p.roundKills });
            utilityUltEvents.push({
              playerId: p.player.id, playerName: p.player.name,
              agent: p.agent, teamId: team.id,
              abilityId: 'clove-not-dead-yet', abilityName: 'Not Dead Yet',
              afterKillIndex: kills.length,
              targetPlayerId: p.player.id, targetPlayerName: p.player.name,
              targetAgent: p.agent,
            });
          } else {
            // chose not to res — remove from ready pool
            cloveReady.delete(p.player.id);
          }
        }
      }
    }

    // ── clove timer decay: if alive via self-res, tick down — expire = death ──
    for (const [pid, timer] of _cloveTimer) {
      const p = allPlayers.find(pl => pl.player.id === pid);
      if (!p || !p.alive) { _cloveTimer.delete(pid); continue; }
      // check if clove got a kill since res (roundKills > snapshot at res time)
      if (p.roundKills > timer.killsAtRes) {
        // clove secured a kill post-res — timer cleared, they live
        _cloveTimer.delete(pid);
      } else {
        const remaining = timer.duelsLeft - 1;
        if (remaining <= 0) {
          // timer expired with no kill — clove dies
          p.alive = false;
          p.health = 0;
          _cloveTimer.delete(pid);
        } else {
          _cloveTimer.set(pid, { duelsLeft: remaining, killsAtRes: timer.killsAtRes });
        }
      }
    }

    duelCount++;
  }
  
  const team1Alive = team1.players.filter(p => p.alive).length;
  const team2Alive = team2.players.filter(p => p.alive).length;
  
  let winnerSide: 'team1' | 'team2';
  if (team1Alive > team2Alive) { team1.roundsWon++; winnerSide = 'team1'; }
  else if (team2Alive > team1Alive) { team2.roundsWon++; winnerSide = 'team2'; }
  else if (rng() < 0.5) { team1.roundsWon++; winnerSide = 'team1'; }
  else { team2.roundsWon++; winnerSide = 'team2'; }
  
  const winnerTeam = winnerSide === 'team1' ? team1 : team2;
  const loserTeam = winnerSide === 'team1' ? team2 : team1;
  const attackersWon = winnerTeam === attackingTeam;
  const winnersAlive = winnerTeam.players.filter(p => p.alive).length;
  const losersAlive = loserTeam.players.filter(p => p.alive).length;
  const winCondition = determineWinCondition(rng, attackersWon, winnersAlive, losersAlive);
  
  // Determine if clutch was successful
  const clutch = clutchSituation && winnerTeam === clutchSituation.team
    ? { playerId: clutchSituation.playerId, playerName: clutchSituation.playerName,
        playerAgent: clutchSituation.playerAgent, teamId: clutchSituation.teamId,
        opponents: clutchSituation.opponents }
    : undefined;

  // compute per-round assists by diffing against pre-combat snapshot
  const roundAssists: Record<string, number> = {};
  for (const p of [...team1.players, ...team2.players]) {
    const delta = p.assists - (assistsBefore.get(p.player.id) ?? 0);
    if (delta > 0) roundAssists[p.player.id] = delta;
  }

  return {
    winner: winnerSide,
    log: {
      roundNumber,
      homeBuyState: team1BuyState,
      awayBuyState: team2BuyState,
      attackingTeamId: attackingTeam.id,
      winnerTeamId: winnerTeam.id,
      winCondition,
      homeAlive: team1Alive,
      awayAlive: team2Alive,
      kills,
      isHalfTime: roundNumber === 13,
      isOvertime: roundNumber > 24,
      homeRoundScore: team1.roundsWon,
      awayRoundScore: team2.roundsWon,
      clutch,
      playerWeapons: weaponSnap,
      playerShields: shieldSnap,
      utilityUlts: utilityUltEvents.length > 0 ? utilityUltEvents : undefined,
      playerAssists: Object.keys(roundAssists).length > 0 ? roundAssists : undefined,
    },
  };
}

/**
 * Lineup entry for simulation - player with their assigned role
 */
interface LineupEntry {
  player: Player;
  assignedRole: Role;
}

// ── Tactical Timeout System ──
// VCT: 1 timeout per team per half (2 per map). 3-round cooldown between TOs.
const TO_COOLDOWN = 3; // min rounds between timeouts for same team
// post-timeout boost by coach letter tier (S/A/B/C/D/F)
const TO_BOOST_BY_TIER: Record<string, number> = {
  S: 15, A: 12, B: 9, C: 6, D: 3, F: 1,
};

function getTimeoutBoost(coachRating?: number): number {
  const r = coachRating ?? 50;
  if (r >= 85) return TO_BOOST_BY_TIER.S;
  if (r >= 70) return TO_BOOST_BY_TIER.A;
  if (r >= 55) return TO_BOOST_BY_TIER.B;
  if (r >= 40) return TO_BOOST_BY_TIER.C;
  if (r >= 25) return TO_BOOST_BY_TIER.D;
  return TO_BOOST_BY_TIER.F;
}

function shouldCallTimeout(
  rng: RNG,
  lossStreak: number,
  teamScore: number,
  opponentScore: number,
  timeoutsLeft: number,
  roundNumber: number,
  lastTimeoutRound: number,
  coachRating?: number,
): boolean {
  if (timeoutsLeft <= 0) return false;
  // no timeouts on pistol rounds or overtime
  if (roundNumber === 1 || roundNumber === 13 || roundNumber > 24) return false;
  // cooldown: must wait 3 rounds after last timeout
  if (lastTimeoutRound > 0 && roundNumber - lastTimeoutRound < TO_COOLDOWN) return false;

  const cm = coachMod(coachRating);
  const inFirstHalf = roundNumber <= 12;

  // "use it or lose it" — last 2 rounds of the half with a loss streak
  const isEndOfHalf = inFirstHalf ? roundNumber >= 11 : roundNumber >= 23;
  if (isEndOfHalf && lossStreak >= 1) return true;

  // opponent near map point — high urgency
  if (opponentScore >= 11 && teamScore < opponentScore) return rng() < 0.75 + cm * 0.10;

  // momentum break: 3+ loss streak — very likely to call
  if (lossStreak >= 3) return rng() < 0.80;

  // 2-round loss streak — common timeout spot
  if (lossStreak >= 2) return rng() < 0.50 + cm * 0.10;

  // pressure: behind in 2nd half
  if (!inFirstHalf && opponentScore >= 9 && teamScore < opponentScore) return rng() < 0.35 + cm * 0.10;

  // after a single round loss mid-game — occasional strategic timeout
  if (lossStreak === 1 && teamScore + opponentScore > 6 && rng() < 0.10 + cm * 0.05) return true;

  return false;
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
  awayIglBonus: number,
  homeCompPenalty: number,
  awayCompPenalty: number,
  formModifiers: Map<string, number>,
  bigStageModifiers: Map<string, number>,
  agentMeta?: Record<string, number>,
  mapMeta?: Record<string, Partial<Record<string, string[]>>>,
  agentVariance?: number,
  teamMapComps?: Record<string, Record<string, Record<string, string>>>,
  userTeamId?: string | null,
  agentRoleOverrides?: Record<string, string[]>,
  teamMapCompNoPenalty?: Record<string, Record<string, string[]>>,
  teamMapCompBuffs?: Record<string, Record<string, Record<string, number>>>,
  disabledAgents?: Set<string>,
  agentAbilities?: Record<string, AgentAbility[]>,
  matchSimConfig?: MatchSimConfig
): {
  homeRounds: number; 
  awayRounds: number; 
  map: string; 
  homePlayerStats: PlayerMapStats[]; 
  awayPlayerStats: PlayerMapStats[];
  roundLogs: RoundLog[];
} {
  // reset module-level ability state for this map
  resetMapAbilityState(matchSimConfig);

  // reset momentum engine state for this map
  _homeMomentum = 0;
  _awayMomentum = 0;
  _hotHand.clear();
  _clutchBonus.clear();
  _timeoutBoostPlayers.clear();
  _roundWeapons.clear();
  _roundGunPrefs.clear();

  // Initialize team states with agent selection (no duplicates per team)
  const homeUsedAgents = new Set<string>();
  const awayUsedAgents = new Set<string>();

  // pre-reserve comp agents so normal pool logic can't steal them
  if (teamMapComps?.[homeTeamId]?.[mapName]) {
    for (const agent of Object.values(teamMapComps[homeTeamId][mapName])) {
      if (agent && !disabledAgents?.has(agent)) homeUsedAgents.add(agent);
    }
  }
  if (teamMapComps?.[awayTeamId]?.[mapName]) {
    for (const agent of Object.values(teamMapComps[awayTeamId][mapName])) {
      if (agent && !disabledAgents?.has(agent)) awayUsedAgents.add(agent);
    }
  }
  
  const homeTeam: TeamMapState = {
    id: homeTeamId,
    players: homeLineup.map(entry => {
      const { agent } = selectAgentForPlayer(rng, entry.player, homeUsedAgents, entry.assignedRole, agentMeta, mapName, agentVariance, mapMeta, teamMapComps, homeTeamId, agentRoleOverrides, teamMapCompNoPenalty, undefined, disabledAgents);
      homeUsedAgents.add(agent);
      // IGL doesn't get their own bonus
      const playerIglBonus = entry.player.id === homeIglId ? 0 : homeIglBonus;
      const hasHomeCompPick = !!(teamMapComps?.[homeTeamId]?.[mapName]?.[entry.player.id]);
      const homePlayerNoPenalty = hasHomeCompPick && !(teamMapCompNoPenalty?.[homeTeamId]?.[mapName]?.includes(`disabled:${entry.player.id}`));
      const homeMapCompBuff = hasHomeCompPick ? (teamMapCompBuffs?.[homeTeamId]?.[mapName]?.[entry.player.id] ?? 0) : 0;
      return {
        player: entry.player,
        assignedRole: entry.assignedRole,
        agent,
        alive: true,
        health: 100,
        shield: 'none' as ShieldType,
        shieldHp: 0,
        shieldRegenPool: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        firstKills: 0,
        firstDeaths: 0,
        damagedBy: new Set(),
        roundKills: 0,
        iglBonus: playerIglBonus,
        compositionPenalty: homeCompPenalty,
        formModifier: formModifiers.get(entry.player.id) ?? 0,
        bigStageModifier: bigStageModifiers.get(entry.player.id) ?? 0,
        flowState: rng() < ((_simCfg.momentumStrength ?? 1) >= 2 ? 0.08 : 0.05),
        buyStateModifier: 0,
        noPenalty: homePlayerNoPenalty,
        mapCompBuff: homeMapCompBuff,
      };
    }),
    roundsWon: 0,
  };
  
  const awayTeam: TeamMapState = {
    id: awayTeamId,
    players: awayLineup.map(entry => {
      const { agent } = selectAgentForPlayer(rng, entry.player, awayUsedAgents, entry.assignedRole, agentMeta, mapName, agentVariance, mapMeta, teamMapComps, awayTeamId, agentRoleOverrides, teamMapCompNoPenalty, undefined, disabledAgents);
      awayUsedAgents.add(agent);
      // IGL doesn't get their own bonus
      const playerIglBonus = entry.player.id === awayIglId ? 0 : awayIglBonus;
      const hasAwayCompPick = !!(teamMapComps?.[awayTeamId]?.[mapName]?.[entry.player.id]);
      const awayPlayerNoPenalty = hasAwayCompPick && !(teamMapCompNoPenalty?.[awayTeamId]?.[mapName]?.includes(`disabled:${entry.player.id}`));
      const awayMapCompBuff = hasAwayCompPick ? (teamMapCompBuffs?.[awayTeamId]?.[mapName]?.[entry.player.id] ?? 0) : 0;
      return {
        player: entry.player,
        assignedRole: entry.assignedRole,
        agent,
        alive: true,
        health: 100,
        shield: 'none' as ShieldType,
        shieldHp: 0,
        shieldRegenPool: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        firstKills: 0,
        firstDeaths: 0,
        damagedBy: new Set(),
        roundKills: 0,
        iglBonus: playerIglBonus,
        compositionPenalty: awayCompPenalty,
        formModifier: formModifiers.get(entry.player.id) ?? 0,
        bigStageModifier: bigStageModifiers.get(entry.player.id) ?? 0,
        flowState: rng() < ((_simCfg.momentumStrength ?? 1) >= 2 ? 0.08 : 0.05),
        buyStateModifier: 0,
        noPenalty: awayPlayerNoPenalty,
        mapCompBuff: awayMapCompBuff,
      };
    }),
    roundsWon: 0,
  };
  
  // ── Economy + weapon persistence + round loop ──
  let homeBuyState: BuyState = 'pistol';
  let awayBuyState: BuyState = 'pistol';
  let roundNumber = 0;
  const roundLogs: RoundLog[] = [];

  // Credit-based economy
  let homeEcon: TeamEconomy = { credits: PISTOL_CREDITS, lossStreak: 0 };
  let awayEcon: TeamEconomy = { credits: PISTOL_CREDITS, lossStreak: 0 };

  // Tactical timeouts: 1 per half (VCT rules), reset at halftime
  let homeTimeouts = 1;
  let awayTimeouts = 1;
  let homeLastTO = 0; // round number of last timeout (for cooldown)
  let awayLastTO = 0;

  // Weapon persistence: guns survive across rounds for living players
  const playerWeapons = new Map<string, string>();
  
  // Coin flip: which team starts on attack (first half)
  const homeStartsAttacking = rng() < 0.5;

  // cache gun prefs for pIndex bonus lookups
  for (const p of [...homeTeam.players, ...awayTeam.players]) {
    if (p.player.gunPref) _roundGunPrefs.set(p.player.id, p.player.gunPref);
  }

  while (true) {
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
    
    roundNumber++;
    
    // Determine which team is attacking this round
    let isHomeAttacking: boolean;
    if (roundNumber <= 12) {
      isHomeAttacking = homeStartsAttacking;
    } else if (roundNumber <= 24) {
      isHomeAttacking = !homeStartsAttacking;
    } else {
      const otRound = roundNumber - 25;
      const otPair = Math.floor(otRound / 2);
      isHomeAttacking = otPair % 2 === 0 ? homeStartsAttacking : !homeStartsAttacking;
    }
    
    // ── Determine buy states ──
    const isPistolRound = roundNumber === 1 || roundNumber === 13;
    const isOTReset = roundNumber > 24 && (roundNumber - 25) % 2 === 0;

    if (isPistolRound) {
      homeBuyState = 'pistol';
      awayBuyState = 'pistol';
      homeEcon = { credits: PISTOL_CREDITS, lossStreak: 0 };
      awayEcon = { credits: PISTOL_CREDITS, lossStreak: 0 };
      playerWeapons.clear();
      // halftime: reset all ult charges + refresh timeouts
      if (roundNumber === 13) {
        for (const p of [...homeTeam.players, ...awayTeam.players]) {
          _ultCharge.set(p.player.id, 0);
        }
        _ultHeldRounds.clear();
        homeTimeouts = 1;
        awayTimeouts = 1;
      }
    } else if (isOTReset) {
      homeBuyState = 'full';
      awayBuyState = 'full';
      homeEcon.credits = OT_CREDITS;
      awayEcon.credits = OT_CREDITS;
      // overtime: set all players to ultCost - 3
      for (const p of [...homeTeam.players, ...awayTeam.players]) {
        const key = p.agent.toLowerCase();
        const ultAb = agentAbilities?.[key]
          ? (agentAbilities[key].find(a => a.type === 'ultimate'))
          : getUlt(p.agent);
        const cost = ultAb?.ultCost ?? UTILITY_ULT[key]?.cost ?? (key === 'sage' ? SAGE_ULT_COST : key === 'clove' ? CLOVE_ULT_COST : 7);
        _ultCharge.set(p.player.id, Math.max(0, cost - 3));
      }
      _ultHeldRounds.clear();
    }
    // (else buy states were set at end of previous iteration)

    // ── Assign weapons (persistence: survivors keep their guns) ──
    for (const p of homeTeam.players) {
      const existing = playerWeapons.get(p.player.id);
      const gp = p.player.gunPref;
      if (!existing || isPistolRound) {
        playerWeapons.set(p.player.id, assignRoundWeapon(rng, homeBuyState, p.assignedRole, p.agent, p.player.id, agentAbilities, gp));
      } else if (homeBuyState === 'full' && (WEAPON_TIER[existing] ?? 0) < 6) {
        const skipUpgrade = isUltEconomy(p.agent, agentAbilities) && isUltReady(p.player.id, p.agent, agentAbilities);
        if (!skipUpgrade) playerWeapons.set(p.player.id, assignRoundWeapon(rng, 'full', p.assignedRole, p.agent, p.player.id, agentAbilities, gp));
      } else if (homeBuyState === 'half' && (WEAPON_TIER[existing] ?? 0) < 4) {
        playerWeapons.set(p.player.id, assignRoundWeapon(rng, 'half', p.assignedRole, p.agent, undefined, undefined, gp));
      }
    }
    for (const p of awayTeam.players) {
      const existing = playerWeapons.get(p.player.id);
      const gp = p.player.gunPref;
      if (!existing || isPistolRound) {
        playerWeapons.set(p.player.id, assignRoundWeapon(rng, awayBuyState, p.assignedRole, p.agent, p.player.id, agentAbilities, gp));
      } else if (awayBuyState === 'full' && (WEAPON_TIER[existing] ?? 0) < 6) {
        const skipUpgrade = isUltEconomy(p.agent, agentAbilities) && isUltReady(p.player.id, p.agent, agentAbilities);
        if (!skipUpgrade) playerWeapons.set(p.player.id, assignRoundWeapon(rng, 'full', p.assignedRole, p.agent, p.player.id, agentAbilities, gp));
      } else if (awayBuyState === 'half' && (WEAPON_TIER[existing] ?? 0) < 4) {
        playerWeapons.set(p.player.id, assignRoundWeapon(rng, 'half', p.assignedRole, p.agent, undefined, undefined, gp));
      }
    }
    
    // ── Tactical timeout check ──
    // clear previous round's timeout boost before this round
    _timeoutBoostPlayers.clear();
    let roundTimeout: RoundLog['timeout'] = undefined;
    if (roundNumber > 1) {
      const homeScore = homeTeam.roundsWon;
      const awayScore = awayTeam.roundsWon;
      const homeWantsTO = shouldCallTimeout(rng, homeEcon.lossStreak, homeScore, awayScore, homeTimeouts, roundNumber, homeLastTO, _homeCoachRating);
      const awayWantsTO = shouldCallTimeout(rng, awayEcon.lossStreak, awayScore, homeScore, awayTimeouts, roundNumber, awayLastTO, _awayCoachRating);

      // if both want one, the team with the longer loss streak goes first
      if (homeWantsTO && (!awayWantsTO || homeEcon.lossStreak >= awayEcon.lossStreak)) {
        homeTimeouts--;
        homeLastTO = roundNumber;
        roundTimeout = { teamId: homeTeamId };
        _awayMomentum = Math.max(0, _awayMomentum - 1);
        // post-timeout tactical boost by coach letter tier
        const boost = getTimeoutBoost(_homeCoachRating);
        for (const p of homeTeam.players) _timeoutBoostPlayers.set(p.player.id, boost);
      } else if (awayWantsTO) {
        awayTimeouts--;
        awayLastTO = roundNumber;
        roundTimeout = { teamId: awayTeamId };
        _homeMomentum = Math.max(0, _homeMomentum - 1);
        const boost = getTimeoutBoost(_awayCoachRating);
        for (const p of awayTeam.players) _timeoutBoostPlayers.set(p.player.id, boost);
      }
    }

    // ── Simulate the round ──
    // snapshot weapons for gunPref pIndex bonus
    _roundWeapons = new Map(playerWeapons);
    // reset per-round ability uses (sig/basic replenish, ult stays charged)
    resetRoundAbilityUses([...homeTeam.players, ...awayTeam.players], agentAbilities);
    const { winner, log } = simulateRound(
      rng, homeTeam, awayTeam, homeRounds + awayRounds, agentMeta,
      homeBuyState, awayBuyState, roundNumber, isHomeAttacking, playerWeapons, agentAbilities
    );
    if (roundTimeout) log.timeout = roundTimeout;

    // ── Post-round: momentum engine ──
    if ((_simCfg.momentumStrength ?? 1) > 0) {
      const homeWonRound = winner === 'team1';
      const mAmp = _simCfg.momentumStrength ?? 1;
      const killThreshold = mAmp >= 2 ? 2 : 3; // hot hand threshold

      // store momentum before update for the log
      log.momentum = { home: _homeMomentum, away: _awayMomentum };

      // update round momentum
      if (homeWonRound) {
        _homeMomentum = Math.min(_homeMomentum + 1, 5);
        _awayMomentum = Math.max(_awayMomentum - 2, 0);
      } else {
        _awayMomentum = Math.min(_awayMomentum + 1, 5);
        _homeMomentum = Math.max(_homeMomentum - 2, 0);
      }

      // halftime resets momentum
      if (roundNumber === 12) { _homeMomentum = 0; _awayMomentum = 0; }

      // hot hand: players with 3+ kills earn hot hand for next round
      const prevHotHand = new Map(_hotHand);
      _hotHand.clear();
      for (const p of [...homeTeam.players, ...awayTeam.players]) {
        if (p.roundKills >= killThreshold) {
          _hotHand.set(p.player.id, true);
        } else if (prevHotHand.get(p.player.id) && p.roundKills >= 2) {
          // chain: keep hot hand if they got 2+ kills while hot
          _hotHand.set(p.player.id, true);
        }
      }

      // clutch bonus: 1v2+ clutch winner gets bonus next round, team gets +5
      _clutchBonus.clear();
      if (log.clutch) {
        _clutchBonus.set(log.clutch.playerId, 10); // clutcher gets +10 pIndex
        const clutchTeamPlayers = log.clutch.teamId === homeTeamId ? homeTeam.players : awayTeam.players;
        for (const p of clutchTeamPlayers) {
          if (p.player.id !== log.clutch.playerId) {
            _clutchBonus.set(p.player.id, 5); // teammates get +5 pIndex
          }
        }
      }
    }

    roundLogs.push(log);

    // ── Post-round: remove weapons for dead players ──
    for (const p of [...homeTeam.players, ...awayTeam.players]) {
      if (!p.alive) {
        playerWeapons.delete(p.player.id);
      }
    }

    // ── Post-round: orb pickup — each alive player gets +1 ult charge (natural economy) ──
    for (const p of [...homeTeam.players, ...awayTeam.players]) {
      if (p.alive) addUltCharge(p.player.id, 1);
    }

    // ── Post-round: urgency tracking — increment held counter for unused ults on buyable rounds ──
    const buyableHome = homeBuyState === 'full' || homeBuyState === 'force' || homeBuyState === 'half';
    const buyableAway = awayBuyState === 'full' || awayBuyState === 'force' || awayBuyState === 'half';
    for (const p of homeTeam.players) {
      if (buyableHome && isUltReady(p.player.id, p.agent, agentAbilities)) {
        _ultHeldRounds.set(p.player.id, (_ultHeldRounds.get(p.player.id) ?? 0) + 1);
      }
    }
    for (const p of awayTeam.players) {
      if (buyableAway && isUltReady(p.player.id, p.agent, agentAbilities)) {
        _ultHeldRounds.set(p.player.id, (_ultHeldRounds.get(p.player.id) ?? 0) + 1);
      }
    }
    
    // ── Update economy ──
    const homeWon = winner === 'team1';
    const homeKills = log.kills.filter(k => k.killerTeamId === homeTeam.id).length;
    const awayKills = log.kills.filter(k => k.killerTeamId === awayTeam.id).length;
    const spikePlanted = log.winCondition === 'spike_detonation' || log.winCondition === 'spike_defused';
    const attackerTeamIsHome = isHomeAttacking;

    // Deduct buy cost (if not already spent — pistol/OT handled above)
    if (!isPistolRound && !isOTReset) {
      // Credits were already set, cost deducted when buy state was chosen (end of prev round)
    }

    // Add income
    if (homeWon) {
      homeEcon.credits += getRoundIncome(true, 0, homeKills, spikePlanted, attackerTeamIsHome);
      homeEcon.lossStreak = 0;
      awayEcon.lossStreak++;
      awayEcon.credits += getRoundIncome(false, awayEcon.lossStreak, awayKills, spikePlanted, !attackerTeamIsHome);
    } else {
      awayEcon.credits += getRoundIncome(true, 0, awayKills, spikePlanted, !attackerTeamIsHome);
      awayEcon.lossStreak = 0;
      homeEcon.lossStreak++;
      homeEcon.credits += getRoundIncome(false, homeEcon.lossStreak, homeKills, spikePlanted, attackerTeamIsHome);
    }
    homeEcon.credits = Math.min(homeEcon.credits, CREDIT_MAX);
    awayEcon.credits = Math.min(awayEcon.credits, CREDIT_MAX);

    // ── Determine next round's buy states ──
    const nextIsPistol = roundNumber + 1 === 13;
    const nextIsOT = roundNumber + 1 > 24 && (roundNumber + 1 - 25) % 2 === 0;

    if (!nextIsPistol && !nextIsOT) {
      homeBuyState = determineBuyState(rng, homeEcon.credits, homeBuyState, homeWon);
      awayBuyState = determineBuyState(rng, awayEcon.credits, awayBuyState, !homeWon);

      // last round before a reset — never save, spend everything
      const nextRound = roundNumber + 1;
      const isLastBeforeReset = nextRound === 12
        || (nextRound >= 24 && (nextRound - 24) % 2 === 0);

      if (isLastBeforeReset) {
        if (homeBuyState === 'save' || homeBuyState === 'eco') {
          homeBuyState = homeEcon.credits >= 3900 ? 'full' : 'force';
        }
        if (awayBuyState === 'save' || awayBuyState === 'eco') {
          awayBuyState = awayEcon.credits >= 3900 ? 'full' : 'force';
        }
      }

      // Deduct buy cost
      homeEcon.credits = Math.max(0, homeEcon.credits - BUY_COST[homeBuyState]);
      awayEcon.credits = Math.max(0, awayEcon.credits - BUY_COST[awayBuyState]);
    }
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
      acs: Math.max(50, Math.min(450, acs)),
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
      acs: Math.max(50, Math.min(450, acs)),
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
    roundLogs,
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
  awayTeam?: Team,
  isPlayoff: boolean = false,
  mapPool?: string[],
  agentMeta?: Record<string, number>,
  mapMeta?: Record<string, Partial<Record<string, string[]>>>,
  agentVariance: number = 15,
  teamMapComps?: Record<string, Record<string, Record<string, string>>>,
  userTeamId?: string | null,
  agentRoleOverrides?: Record<string, string[]>,
  teamMapCompNoPenalty?: Record<string, Record<string, string[]>>,
  teamMapCompBuffs?: Record<string, Record<string, Record<string, number>>>,
  disabledAgents?: string[],
  agentAbilities?: Record<string, AgentAbility[]>,
  matchSimConfig?: MatchSimConfig
): MatchResult {
  const disabledSet = disabledAgents?.length ? new Set(disabledAgents) : undefined;

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

  // Roll match-day form for each player (consistent across all maps in the series)
  // Form range is based on consistency: high consistency = small swings, low = big swings
  // Formula: formRange = 15 - (consistency / 100) * 12 → consistency 0 = ±15, consistency 100 = ±3
  // coach compresses form variance: elite tactical coach = ~18% tighter
  const homeCoach = homeTeam?.staff.headCoach;
  const awayCoach = awayTeam?.staff.headCoach;
  const homeAnalyst = homeTeam?.staff.analyst;
  const awayAnalyst = awayTeam?.staff.analyst;
  const homeAssistant = homeTeam?.staff.assistantCoach;
  const awayAssistant = awayTeam?.staff.assistantCoach;
  // store coach ratings for module-level access in simulateRound/getAdaptationPenalty
  _homeCoachRating = homeCoach?.rating;
  _awayCoachRating = awayCoach?.rating;
  _homeAssistantRating = homeAssistant?.rating;
  _awayAssistantRating = awayAssistant?.rating;
  // head coach: 15% form compression, analyst: 8% form compression (preparation)
  const homeFormComp = 1
    - coachMod(homeCoach?.rating) * 0.15 * specMod(homeCoach?.specialty, 'tactical')
    - coachMod(homeAnalyst?.rating) * 0.08 * specMod(homeAnalyst?.specialty, 'tactical');
  const awayFormComp = 1
    - coachMod(awayCoach?.rating) * 0.15 * specMod(awayCoach?.specialty, 'tactical')
    - coachMod(awayAnalyst?.rating) * 0.08 * specMod(awayAnalyst?.specialty, 'tactical');

  const formModifiers = new Map<string, number>();
  const allPlayers = [...homeLineup, ...awayLineup];
  for (const entry of allPlayers) {
    const consistency = entry.player.consistency ?? 65;
    const isHome = homeLineup.includes(entry);
    const formRange = (15 - (consistency / 100) * 12) * (isHome ? homeFormComp : awayFormComp);
    const form = (rng() * 2 - 1) * formRange;
    formModifiers.set(entry.player.id, Math.round(form * 10) / 10);
  }

  // Calculate big stage modifiers (only for playoff matches)
  // Based on personality.mentality: 100 = +8 OVR, 50 = 0, 0 = -8 OVR
  // coach provides flat mental buffer in playoffs
  const bigStageModifiers = new Map<string, number>();
  if (isPlayoff) {
    const homeCoachBuf = coachMod(homeCoach?.rating) * 2 * specMod(homeCoach?.specialty, 'mental');
    const awayCoachBuf = coachMod(awayCoach?.rating) * 2 * specMod(awayCoach?.specialty, 'mental');
    for (const entry of allPlayers) {
      const mentality = entry.player.personality?.mentality ?? 65;
      const isHome = homeLineup.includes(entry);
      const bigStage = ((mentality - 50) / 50) * 8 + (isHome ? homeCoachBuf : awayCoachBuf);
      bigStageModifiers.set(entry.player.id, Math.round(bigStage * 10) / 10);
    }
  }

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

  // Calculate composition penalties (missing core roles)
  const homeCompPenalty = getCompositionPenalty(homeLineupSlots);
  const awayCompPenalty = getCompositionPenalty(awayLineupSlots);

  const mapsToWin = format === 'bo1' ? 1 : format === 'bo3' ? 2 : 3;
  const mapScores: Array<{ 
    map: string; 
    homeRounds: number; 
    awayRounds: number; 
    homePlayerStats: PlayerMapStats[]; 
    awayPlayerStats: PlayerMapStats[];
    roundLogs: RoundLog[];
  }> = [];
  
  // Select maps for the series
  const pool = mapPool && mapPool.length >= mapsToWin * 2 - 1 ? mapPool : MAPS;
  const availableMaps = [...pool];
  const selectedMaps: string[] = [];
  for (let i = 0; i < mapsToWin * 2 - 1; i++) {
    const idx = randomInt(rng, 0, availableMaps.length - 1);
    selectedMaps.push(availableMaps.splice(idx, 1)[0]);
  }
  
  let homeScore = 0;
  let awayScore = 0;
  let mapIndex = 0;

  // series confidence: map wins add form bonus for next map
  let homeConfidence = 0;
  let awayConfidence = 0;
  const mStrength = matchSimConfig?.momentumStrength ?? DEFAULT_MATCH_SIM_CONFIG.momentumStrength;

  while (homeScore < mapsToWin && awayScore < mapsToWin && mapIndex < selectedMaps.length) {
    // apply series confidence to form modifiers for this map
    if (mStrength > 0 && mapIndex > 0) {
      const homeBonus = homeConfidence * 2 * mStrength;
      const awayBonus = awayConfidence * 2 * mStrength;
      for (const entry of homeLineup) formModifiers.set(entry.player.id, (formModifiers.get(entry.player.id) ?? 0) + homeBonus);
      for (const entry of awayLineup) formModifiers.set(entry.player.id, (formModifiers.get(entry.player.id) ?? 0) + awayBonus);
    }
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
      awayIglBonus,
      homeCompPenalty,
      awayCompPenalty,
      formModifiers,
      bigStageModifiers,
      agentMeta,
      mapMeta,
      agentVariance,
      teamMapComps,
      userTeamId,
      agentRoleOverrides,
      teamMapCompNoPenalty,
      teamMapCompBuffs,
      disabledSet,
      agentAbilities,
      matchSimConfig
    );
    mapScores.push(mapResult);
    
    // revert form modifier changes from series confidence (so next map starts clean)
    if (mStrength > 0 && mapIndex > 0) {
      const homeBonus = homeConfidence * 2 * mStrength;
      const awayBonus = awayConfidence * 2 * mStrength;
      for (const entry of homeLineup) formModifiers.set(entry.player.id, (formModifiers.get(entry.player.id) ?? 0) - homeBonus);
      for (const entry of awayLineup) formModifiers.set(entry.player.id, (formModifiers.get(entry.player.id) ?? 0) - awayBonus);
    }

    if (mapResult.homeRounds > mapResult.awayRounds) {
      homeScore++;
      homeConfidence++;
      awayConfidence = Math.max(0, awayConfidence - 1);
    } else {
      awayScore++;
      awayConfidence++;
      homeConfidence = Math.max(0, homeConfidence - 1);
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
    awards: computeMatchAwards(mapScores, homeTeamId, awayTeamId),
  };
}

/** Compute post-match awards from map scores */
function computeMatchAwards(
  mapScores: MatchResult['mapScores'],
  homeTeamId: string,
  awayTeamId: string,
): MatchAward[] {
  // Aggregate per-player stats across all maps
  const agg = new Map<string, {
    playerId: string; playerName: string; teamId: string;
    kills: number; deaths: number; assists: number; acs: number;
    firstKills: number; firstDeaths: number;
    clutches: number; clutchOpponents: number; clutchDetails: number[];
    hsKills: number; totalGunKills: number;
    multiKillScore: number; threeKs: number; fourKs: number; aces: number;
    agents: Map<string, number>; mapsPlayed: number;
    // per-map bests
    bestAcsMap: string; bestAcsVal: number; bestAcsAgent: string;
    bestFkMap: string; bestFkVal: number; bestFkAgent: string;
    bestKdMap: string; bestKdVal: number; bestKdAgent: string;
    bestMultiMap: string; bestMultiVal: number; bestMultiAgent: string;
    bestClutchMap: string; bestClutchVal: number; bestClutchAgent: string;
    fkByMap: { map: string; agent: string; count: number }[];
    clutchByMap: { map: string; agent: string; count: number; details: number[] }[];
    multiByMap: { map: string; agent: string; aces: number; fourKs: number; threeKs: number }[];
  }>();

  const ensure = (id: string, name: string, teamId: string) => {
    if (!agg.has(id)) agg.set(id, {
      playerId: id, playerName: name, teamId,
      kills: 0, deaths: 0, assists: 0, acs: 0,
      firstKills: 0, firstDeaths: 0,
      clutches: 0, clutchOpponents: 0, clutchDetails: [],
      hsKills: 0, totalGunKills: 0,
      multiKillScore: 0, threeKs: 0, fourKs: 0, aces: 0,
      agents: new Map(), mapsPlayed: 0,
      bestAcsMap: '', bestAcsVal: 0, bestAcsAgent: '',
      bestFkMap: '', bestFkVal: 0, bestFkAgent: '',
      bestKdMap: '', bestKdVal: -999, bestKdAgent: '',
      bestMultiMap: '', bestMultiVal: 0, bestMultiAgent: '',
      bestClutchMap: '', bestClutchVal: 0, bestClutchAgent: '',
      fkByMap: [] as { map: string; agent: string; count: number }[],
      clutchByMap: [] as { map: string; agent: string; count: number; details: number[] }[],
      multiByMap: [] as { map: string; agent: string; aces: number; fourKs: number; threeKs: number }[],
    });
    return agg.get(id)!;
  };

  for (const map of mapScores) {
    const mapName = map.map;
    const allStats = [...(map.homePlayerStats || []), ...(map.awayPlayerStats || [])];
    for (const ps of allStats) {
      const teamId = map.homePlayerStats?.some(h => h.playerId === ps.playerId) ? homeTeamId : awayTeamId;
      const p = ensure(ps.playerId, '', teamId);
      p.kills += ps.kills;
      p.deaths += ps.deaths;
      p.assists += ps.assists;
      p.acs += ps.acs;
      p.firstKills += ps.firstKills;
      p.firstDeaths += ps.firstDeaths;
      p.mapsPlayed++;
      p.agents.set(ps.agent, (p.agents.get(ps.agent) || 0) + 1);
      // per-map bests
      if (ps.acs > p.bestAcsVal) { p.bestAcsVal = ps.acs; p.bestAcsMap = mapName; p.bestAcsAgent = ps.agent; }
      if (ps.firstKills > p.bestFkVal) { p.bestFkVal = ps.firstKills; p.bestFkMap = mapName; p.bestFkAgent = ps.agent; }
      if (ps.firstKills > 0) p.fkByMap.push({ map: mapName, agent: ps.agent, count: ps.firstKills });
      const kd = ps.deaths > 0 ? ps.kills - ps.deaths : ps.kills;
      if (kd > p.bestKdVal) { p.bestKdVal = kd; p.bestKdMap = mapName; p.bestKdAgent = ps.agent; }
    }

    // Process kill events for headshots and multi-kills
    const mapMultiScore = new Map<string, { score: number; agent: string; aces: number; fourKs: number; threeKs: number }>();
    const mapClutchCount = new Map<string, { count: number; agent: string; details: number[] }>();

    for (const round of (map.roundLogs || [])) {
      const roundMaxKills = new Map<string, number>();
      for (const kill of round.kills) {
        const k = ensure(kill.killerPlayerId, kill.killerName, kill.killerTeamId);
        if (!k.playerName) k.playerName = kill.killerName;
        if (!kill.isAbilityKill) {
          k.totalGunKills++;
          if (kill.isHeadshot) k.hsKills++;
        }
        const prev = roundMaxKills.get(kill.killerPlayerId) || 0;
        if (kill.killerRoundKills > prev) roundMaxKills.set(kill.killerPlayerId, kill.killerRoundKills);
        const v = ensure(kill.victimPlayerId, kill.victimName, kill.victimTeamId);
        if (!v.playerName) v.playerName = kill.victimName;
      }
      for (const [pid, maxK] of roundMaxKills) {
        const p = agg.get(pid);
        if (!p) continue;
        let pts = 0;
        if (maxK >= 5) { p.aces++; p.multiKillScore += 5; pts = 5; }
        else if (maxK >= 4) { p.fourKs++; p.multiKillScore += 3; pts = 3; }
        else if (maxK >= 3) { p.threeKs++; p.multiKillScore += 1; pts = 1; }
        if (pts > 0) {
          const cur = mapMultiScore.get(pid) ?? { score: 0, agent: '', aces: 0, fourKs: 0, threeKs: 0 };
          cur.score += pts;
          if (maxK >= 5) cur.aces++;
          else if (maxK >= 4) cur.fourKs++;
          else cur.threeKs++;
          if (!cur.agent) {
            let best = ''; let bestC = 0;
            for (const [ag, c] of p.agents) { if (c > bestC) { best = ag; bestC = c; } }
            cur.agent = best;
          }
          mapMultiScore.set(pid, cur);
        }
      }
      if (round.clutch) {
        const c = ensure(round.clutch.playerId, round.clutch.playerName, round.clutch.teamId);
        if (!c.playerName) c.playerName = round.clutch.playerName;
        c.clutches++;
        c.clutchOpponents += round.clutch.opponents;
        c.clutchDetails.push(round.clutch.opponents);
        const cur = mapClutchCount.get(round.clutch.playerId) ?? { count: 0, agent: round.clutch.playerAgent, details: [] as number[] };
        cur.count++;
        cur.details.push(round.clutch.opponents);
        mapClutchCount.set(round.clutch.playerId, cur);
      }
    }

    // update per-map bests for multi and clutch
    for (const [pid, ms] of mapMultiScore) {
      const p = agg.get(pid);
      if (!p) continue;
      if (ms.score > p.bestMultiVal) { p.bestMultiVal = ms.score; p.bestMultiMap = mapName; p.bestMultiAgent = ms.agent; }
    }
    for (const [pid, mc] of mapClutchCount) {
      const p = agg.get(pid);
      if (!p) continue;
      p.clutchByMap.push({ map: mapName, agent: mc.agent, count: mc.count, details: mc.details });
      if (mc.count > p.bestClutchVal) { p.bestClutchVal = mc.count; p.bestClutchMap = mapName; p.bestClutchAgent = mc.agent; }
    }
    // accumulate per-map multi-kill breakdown for He's Everywhere mapLines
    for (const [pid, ms] of mapMultiScore) {
      const p = agg.get(pid);
      if (!p) continue;
      if (ms.aces > 0 || ms.fourKs > 0 || ms.threeKs > 0) {
        p.multiByMap.push({ map: mapName, agent: ms.agent, aces: ms.aces, fourKs: ms.fourKs, threeKs: ms.threeKs });
      }
    }
  }

  // backfill blank names — players with 0 kills never appear in kill events so name stays ''
  for (const p of agg.values()) {
    if (!p.playerName) p.playerName = p.playerId;
  }
  const players = Array.from(agg.values()).filter(p => p.mapsPlayed > 0);
  if (players.length === 0) return [];

  const getTopAgent = (p: typeof players[0]) => {
    let best = ''; let bestCount = 0;
    for (const [agent, count] of p.agents) {
      if (count > bestCount) { best = agent; bestCount = count; }
    }
    return best;
  };

  const awards: MatchAward[] = [];
  const totalMaps = mapScores.length;

  // derive series winner from map wins
  const mapWins: Record<string, number> = {};
  for (const ms of mapScores) {
    const mapWinnerId = ms.homeRounds > ms.awayRounds ? homeTeamId : awayTeamId;
    mapWins[mapWinnerId] = (mapWins[mapWinnerId] ?? 0) + 1;
  }
  const winningTeamId = Object.entries(mapWins).sort((a, b) => b[1] - a[1])[0]?.[0];

  const sortByAcs = (a: typeof players[0], b: typeof players[0]) => {
    const diff = (b.acs / b.mapsPlayed) - (a.acs / a.mapsPlayed);
    return diff !== 0 ? diff : (b.kills - b.deaths) - (a.kills - a.deaths);
  };

  const topOverall = [...players].sort(sortByAcs)[0];
  const topWinner = winningTeamId ? [...players].filter(p => p.teamId === winningTeamId).sort(sortByAcs)[0] : null;

  // if best player is on winning team → Series MVP; else → Gave It His All for loser, Series MVP for best winner
  const mvpPlayer = topOverall?.teamId === winningTeamId ? topOverall : topWinner;
  const gaveItAllPlayer = topOverall?.teamId !== winningTeamId ? topOverall : null;

  if (mvpPlayer) {
    const mvpAgents = [...mvpPlayer.agents.entries()].sort((a, b) => b[1] - a[1]).map(([ag]) => ag);
    awards.push({
      type: 'mvp', label: 'Series MVP', playerId: mvpPlayer.playerId,
      playerName: mvpPlayer.playerName, playerAgent: getTopAgent(mvpPlayer), teamId: mvpPlayer.teamId,
      value: `${Math.round(mvpPlayer.acs / mvpPlayer.mapsPlayed)} ACS`,
      mapAgent: getTopAgent(mvpPlayer), agents: mvpAgents,
    });
  }

  if (gaveItAllPlayer) {
    const agents = [...gaveItAllPlayer.agents.entries()].sort((a, b) => b[1] - a[1]).map(([ag]) => ag);
    awards.push({
      type: 'mvp', label: 'Gave It His All', playerId: gaveItAllPlayer.playerId,
      playerName: gaveItAllPlayer.playerName, playerAgent: getTopAgent(gaveItAllPlayer), teamId: gaveItAllPlayer.teamId,
      value: `${Math.round(gaveItAllPlayer.acs / gaveItAllPlayer.mapsPlayed)} ACS`,
      mapAgent: getTopAgent(gaveItAllPlayer), agents,
    });
  }

  // Clutch King: most clutch rounds (only if at least 1)
  const clutcher = [...players].filter(p => p.clutches > 0)
    .sort((a, b) => b.clutches - a.clutches || b.clutchOpponents - a.clutchOpponents)[0];
  if (clutcher) {
    const details = clutcher.clutchDetails.sort((a, b) => b - a).map(n => `1v${n}`).join(' · ');
    awards.push({
      type: 'clutch_king', label: 'Ice In His Veins', playerId: clutcher.playerId,
      playerName: clutcher.playerName, playerAgent: getTopAgent(clutcher), teamId: clutcher.teamId,
      value: details,
      map: clutcher.bestClutchMap, mapAgent: clutcher.bestClutchAgent,
      mapLines: clutcher.clutchByMap.sort((a, b) => b.count - a.count).map(m => ({
        agent: m.agent, map: m.map,
        value: m.details.sort((a, b) => b - a).map(n => `1v${n}`).join(' · '),
      })),
    });
  }

  // First Blood Machine: most first kills
  const fk = [...players].sort((a, b) => b.firstKills - a.firstKills || a.firstDeaths - b.firstDeaths)[0];
  if (fk && fk.firstKills > 0 && fk.playerId !== mvpPlayer?.playerId) {
    awards.push({
      type: 'first_blood', label: 'Bloodthirsty', playerId: fk.playerId,
      playerName: fk.playerName, playerAgent: getTopAgent(fk), teamId: fk.teamId,
      value: `${fk.firstKills} FK${totalMaps > 1 ? ` across ${totalMaps} maps` : ''}`,
      map: fk.bestFkMap, mapAgent: fk.bestFkAgent,
      mapLines: fk.fkByMap.sort((a, b) => b.count - a.count).map(m => ({
        agent: m.agent, map: m.map, value: `${m.count} FK`,
      })),
    });
  }

  // KD Diff: highest kill-death differential
  const usedIds = new Set(awards.map(a => a.playerId));
  const kdDiff = [...players].filter(p => !usedIds.has(p.playerId))
    .sort((a, b) => (b.kills - b.deaths) - (a.kills - a.deaths))[0];
  if (kdDiff && (kdDiff.kills - kdDiff.deaths) >= 8) {
    const diff = kdDiff.kills - kdDiff.deaths;
    awards.push({
      type: 'kd_diff', label: 'KD Diff', playerId: kdDiff.playerId,
      playerName: kdDiff.playerName, playerAgent: getTopAgent(kdDiff), teamId: kdDiff.teamId,
      value: `+${diff} (${kdDiff.kills}/${kdDiff.deaths}/${kdDiff.assists})`,
      mapAgent: getTopAgent(kdDiff),
    });
  }

  // Raid Boss: most multi-kill rounds (weighted: 3K=1, 4K=3, ACE=5)
  const usedIds2 = new Set(awards.map(a => a.playerId));
  const raidBoss = [...players].filter(p => p.multiKillScore > 0 && !usedIds2.has(p.playerId))
    .sort((a, b) => b.multiKillScore - a.multiKillScore || b.kills - a.kills)[0];
  if (raidBoss) {
    const parts: string[] = [];
    if (raidBoss.aces > 0) parts.push(`${raidBoss.aces}×ACE`);
    if (raidBoss.fourKs > 0) parts.push(`${raidBoss.fourKs}×4K`);
    if (raidBoss.threeKs > 0) parts.push(`${raidBoss.threeKs}×3K`);
    // build per-map mapLines using multiByMap
    const raidMapLines = raidBoss.multiByMap
      .filter(m => m.aces > 0 || m.fourKs > 0 || m.threeKs > 0)
      .map(m => {
        const lineParts: string[] = [];
        if (m.aces > 0) lineParts.push(`${m.aces}×ACE`);
        if (m.fourKs > 0) lineParts.push(`${m.fourKs}×4K`);
        if (m.threeKs > 0) lineParts.push(`${m.threeKs}×3K`);
        return { agent: m.agent || getTopAgent(raidBoss), map: m.map, value: lineParts.join(' · ') };
      });
    // fallback: if no per-map data, build single line from series totals
    if (raidMapLines.length === 0) {
      const fallbackParts: string[] = [];
      if (raidBoss.aces > 0) fallbackParts.push(`${raidBoss.aces}×ACE`);
      if (raidBoss.fourKs > 0) fallbackParts.push(`${raidBoss.fourKs}×4K`);
      if (raidBoss.threeKs > 0) fallbackParts.push(`${raidBoss.threeKs}×3K`);
      if (fallbackParts.length > 0) {
        raidMapLines.push({ agent: getTopAgent(raidBoss), map: raidBoss.bestMultiMap || '', value: fallbackParts.join(' · ') });
      }
    }
    awards.push({
      type: 'raid_boss', label: "He's Everywhere", playerId: raidBoss.playerId,
      playerName: raidBoss.playerName, playerAgent: getTopAgent(raidBoss), teamId: raidBoss.teamId,
      value: parts.join(' · '),
      map: raidBoss.bestMultiMap, mapAgent: raidBoss.bestMultiAgent,
      mapLines: raidMapLines.length > 0 ? raidMapLines : undefined,
    });
  }

  return awards;
}