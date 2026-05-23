// src/data/agentAbilities.ts
// per-agent damaging ability data for the match sim

// how often this ability is used as a kill source
export type AbilityUsage = 'primary' | 'frequent' | 'occasional' | 'rare';

// how deadly it is when it connects
export type AbilityLethality = 'lethal' | 'dangerous' | 'moderate' | 'chip';

// internal multipliers — product gives killChance per kill event
const USAGE_VALUE: Record<AbilityUsage, number> = {
  primary: 0.55,     // this IS the weapon (chamber headhunter, neon overdrive)
  frequent: 0.30,    // used most rounds, reliable kill source
  occasional: 0.15,  // comes out a few times per map
  rare: 0.06,        // fringe scenario kills
};

const LETHALITY_VALUE: Record<AbilityLethality, number> = {
  lethal: 0.70,      // almost always kills when it hits (showstopper, orbital)
  dangerous: 0.50,   // strong kill threat (blade storm, tour de force)
  moderate: 0.35,    // solid damage (shock bolt, nanoswarm, paint shells)
  chip: 0.15,        // incidental damage (slow orb, trapwire, paranoia)
};

export const USAGE_OPTIONS: AbilityUsage[] = ['primary', 'frequent', 'occasional', 'rare'];
export const LETHALITY_OPTIONS: AbilityLethality[] = ['lethal', 'dangerous', 'moderate', 'chip'];

export type UltTimingType = 'preRound' | 'reactive' | 'midRound' | 'corpseEnemy' | 'allyRes' | 'selfRes';
export const ULT_TIMING_OPTIONS: UltTimingType[] = ['preRound', 'reactive', 'midRound', 'corpseEnemy', 'allyRes', 'selfRes'];
export const ULT_TIMING_LABELS: Record<UltTimingType, string> = {
  preRound: 'Pre-round',
  reactive: 'Reactive',
  midRound: 'Mid-round',
  corpseEnemy: 'Corpse',
  allyRes: 'Ally res',
  selfRes: 'Self res',
};

export interface AgentAbility {
  id: string;
  name: string;
  icon?: string;              // path to ability icon asset
  type: 'signature' | 'basic' | 'ultimate';
  usage: AbilityUsage;        // how often it's in play as a kill tool
  lethality: AbilityLethality; // how deadly when it connects
  killChance?: number;        // legacy override — if set, bypasses usage×lethality
  aoe: boolean;               // can hit multiple targets in one use
  maxKills: number;           // max targets per use (1 for single-target)
  headshotRate: number;       // headshot chance on ability kill (0 for most)
  uses: number;               // uses per round (signature refreshes each round)
  refreshOnKill: boolean;     // ability refreshes/resets on kill (jett knives, chamber ult)
  refreshKillReq: number;     // kills needed to trigger refresh (1 = any kill, 0 = n/a)
  chain: boolean;             // when true, 100% chance to keep using for subsequent kills in a round
  ecoWeapon: boolean;         // when true, auto-replaces pistol/eco tier guns (Classic, Ghost, Sheriff, etc.)
  ultCost: number;            // ult points to activate (0 = not an ult)
  utilityBonus?: number;      // if > 0, ult is non-kill: grants this pIndex bonus to team instead of appearing in kill feed
  ultTiming?: UltTimingType;  // when the ult fires (preRound/reactive/midRound/corpseEnemy/allyRes/selfRes)
  ultAttackRate?: number;     // 0-1 chance to use on attack side
  ultDefenseRate?: number;    // 0-1 chance to use on defense side
  ultEconomy?: boolean;       // ult replaces rifle buy (chamber TDF, jett knives)
}

// compute effective kill chance from usage × lethality (or legacy override)
export function getKillChance(ab: AgentAbility): number {
  if (ab.killChance !== undefined && ab.killChance > 0) return ab.killChance;
  return USAGE_VALUE[ab.usage] * LETHALITY_VALUE[ab.lethality];
}

// readable kill chance label for UI
export function getKillChanceLabel(ab: AgentAbility): string {
  const pct = Math.round(getKillChance(ab) * 100);
  return `${pct}%`;
}

// helper builders
export function ult(id: string, name: string, cost: number, usage: AbilityUsage, lethality: AbilityLethality, opts?: Partial<AgentAbility>): AgentAbility {
  return { id, name, type: 'ultimate', usage, lethality, aoe: false, maxKills: 1, headshotRate: 0, uses: 1, refreshOnKill: false, refreshKillReq: 0, chain: false, ecoWeapon: false, ultCost: cost, utilityBonus: 0, ...opts };
}
export function sig(id: string, name: string, usage: AbilityUsage, lethality: AbilityLethality, opts?: Partial<AgentAbility>): AgentAbility {
  return { id, name, type: 'signature', usage, lethality, aoe: false, maxKills: 1, headshotRate: 0, uses: 1, refreshOnKill: false, refreshKillReq: 0, chain: false, ecoWeapon: false, ultCost: 0, ...opts };
}
export function basic(id: string, name: string, usage: AbilityUsage, lethality: AbilityLethality, opts?: Partial<AgentAbility>): AgentAbility {
  return { id, name, type: 'basic', usage, lethality, aoe: false, maxKills: 1, headshotRate: 0, uses: 1, refreshOnKill: false, refreshKillReq: 0, chain: false, ecoWeapon: false, ultCost: 0, ...opts };
}
export function utilUlt(id: string, name: string, cost: number, bonus: number, opts?: Partial<AgentAbility>): AgentAbility {
  return { id, name, type: 'ultimate', usage: 'rare', lethality: 'chip', aoe: false, maxKills: 0, headshotRate: 0, uses: 1, refreshOnKill: false, refreshKillReq: 0, chain: false, ecoWeapon: false, ultCost: cost, utilityBonus: bonus, ...opts };
}

// fill in per-agent — each key is an agent id from data/agents.ts
// kill ult examples:
//   jett: [
//     ult('jett-blade-storm', 'Blade Storm', 8, 'frequent', 'dangerous', { headshotRate: 0.35, refreshOnKill: true, refreshKillReq: 1 }),
//   ],
//   chamber: [
//     basic('chamber-headhunter', 'Headhunter', 'primary', 'dangerous', { headshotRate: 0.38, uses: 3 }),
//     ult('chamber-tdf', 'Tour De Force', 7, 'occasional', 'lethal', { refreshOnKill: true, refreshKillReq: 1 }),
//   ],
// utility ult examples (utilityBonus = pIndex boost to team when activated):
//   sage: [
//     utilUlt('sage-resurrection', 'Resurrection', 8, 10),
//   ],
//   killjoy: [
//     utilUlt('killjoy-lockdown', 'Lockdown', 7, 8),
//   ],
//   omen: [
//     utilUlt('omen-from-the-shadows', 'From the Shadows', 7, 5),
//   ],
export const AGENT_ABILITIES: Record<string, AgentAbility[]> = {
  // duelists
  jett: [
    ult('jett-blade-storm', 'Blade Storm', 8, 'frequent', 'dangerous', { headshotRate: 0.35, refreshOnKill: true, refreshKillReq: 1, chain: true, ecoWeapon: true, ultEconomy: true }),
  ],
  phoenix: [],
  reyna: [],
  raze: [],
  yoru: [],
  neon: [],
  iso: [],
  waylay: [],

  // controllers
  brimstone: [],
  omen: [
    utilUlt('omen-from-the-shadows', 'From the Shadows', 7, 5, { ultTiming: 'midRound', ultAttackRate: 0.70, ultDefenseRate: 0.70 }),
  ],
  astra: [
    utilUlt('astra-cosmic-divide', 'Cosmic Divide', 7, 7, { ultTiming: 'preRound', ultAttackRate: 0.80, ultDefenseRate: 0.80 }),
  ],
  harbor: [
    utilUlt('harbor-reckoning', 'Reckoning', 7, 6, { ultTiming: 'preRound', ultAttackRate: 0.80, ultDefenseRate: 0.60 }),
  ],
  clove: [
    utilUlt('clove-not-dead-yet', 'Not Dead Yet', 7, 0, { ultTiming: 'selfRes' }),
  ],
  viper: [
    utilUlt('viper-vipers-pit', "Viper's Pit", 8, 8, { ultTiming: 'reactive', ultAttackRate: 0.55, ultDefenseRate: 0.85 }),
  ],

  // initiators
  sova: [],
  breach: [
    utilUlt('breach-rolling-thunder', 'Rolling Thunder', 7, 7, { ultTiming: 'preRound', ultAttackRate: 0.85, ultDefenseRate: 0.55 }),
  ],
  skye: [
    utilUlt('skye-seekers', 'Seekers', 6, 5, { ultTiming: 'preRound', ultAttackRate: 0.80, ultDefenseRate: 0.75 }),
  ],
  kayo: [],
  fade: [
    utilUlt('fade-nightfall', 'Nightfall', 7, 6, { ultTiming: 'preRound', ultAttackRate: 0.85, ultDefenseRate: 0.55 }),
  ],
  gekko: [
    utilUlt('gekko-thrash', 'Thrash', 7, 5, { ultTiming: 'preRound', ultAttackRate: 0.80, ultDefenseRate: 0.70 }),
  ],
  tejo: [],

  // sentinels
  sage: [
    utilUlt('sage-resurrection', 'Resurrection', 8, 10, { ultTiming: 'allyRes' }),
  ],
  cypher: [
    utilUlt('cypher-neural-theft', 'Neural Theft', 6, 6, { ultTiming: 'corpseEnemy', ultAttackRate: 0.85, ultDefenseRate: 0.85 }),
  ],
  killjoy: [
    utilUlt('killjoy-lockdown', 'Lockdown', 7, 8, { ultTiming: 'reactive', ultAttackRate: 0.50, ultDefenseRate: 0.85 }),
  ],
  chamber: [
    basic('chamber-headhunter', 'Headhunter', 'primary', 'dangerous', { headshotRate: 0.38, uses: 3, ecoWeapon: true }),
    ult('chamber-tdf', 'Tour De Force', 7, 'occasional', 'lethal', { headshotRate: 0.10, refreshOnKill: true, refreshKillReq: 1, chain: true, ecoWeapon: true, ultEconomy: true }),
  ],
  deadlock: [
    utilUlt('deadlock-annihilation', 'Annihilation', 7, 6, { ultTiming: 'reactive', ultAttackRate: 0.50, ultDefenseRate: 0.80 }),
  ],
  vyse: [
    utilUlt('vyse-arc-nexus', 'Arc Nexus', 8, 6, { ultTiming: 'reactive', ultAttackRate: 0.55, ultDefenseRate: 0.80 }),
  ],
  veto: [],
};

export function getAbilities(agentId: string): AgentAbility[] {
  return AGENT_ABILITIES[agentId.toLowerCase()] ?? [];
}

export function getAbilityNames(agentId: string): string[] {
  return getAbilities(agentId).map(a => a.name);
}

export function getUlt(agentId: string): AgentAbility | undefined {
  return getAbilities(agentId).find(a => a.type === 'ultimate');
}
