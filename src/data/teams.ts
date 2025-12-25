// src/data/teams.ts
// Default team and player data for ValorantGM

import type { Region, Role, AgentPool } from '../types';

export const PLACEHOLDER_LOGO = '';

export interface PersonalityConfig {
  leadership?: number;    // 0-99: Commanding respect, making calls
  workEthic?: number;     // 0-99: VOD review, preparation, studying opponents
  mentality?: number;     // 0-99: Composure under pressure, not tilting
  teamPlayer?: number;    // 0-99: Selfless play, setting up teammates
  coachability?: number;  // 0-99: Accepting feedback, adapting
}

export interface PlayerConfig {
  name: string;
  role: Role;
  overall: number;
  aim: number;
  utility: number;
  gameSense: number;
  clutch: number;
  age: number;
  agents?: AgentPool; // Optional: specify agent pool for one-tricks
  personality?: PersonalityConfig; // Optional: specify personality traits
}

export interface TeamConfig {
  name: string;
  abbreviation: string;
  region: Region;
  logo?: string;
  players: PlayerConfig[];
  igl?: string; // Player name who is the IGL
}

// Helper to create a player - p(name, role, ovr, age, aim, util, iq, clutch, agents?, personality?)
const p = (
  name: string, 
  role: Role, 
  ovr: number, 
  age: number, 
  aim?: number, 
  util?: number, 
  iq?: number, 
  clutch?: number,
  agents?: AgentPool,
  personality?: PersonalityConfig
): PlayerConfig => ({
  name,
  role,
  overall: ovr,
  aim: aim ?? ovr,
  utility: util ?? ovr,
  gameSense: iq ?? ovr,
  clutch: clutch ?? ovr,
  age,
  ...(agents && { agents }),
  ...(personality && { personality }),
});

/**
 * Agent Pool Reference
 * ====================
 * Comfort affects SELECTION (squared weights) and PERFORMANCE (pIndex bonus)
 * 
 * PERFORMANCE (OVR Boost):
 * ------------------------
 * Comfort | OVR Boost
 *   99    |   +10
 *   95    |   +9
 *   90    |   +8
 *   85    |   +7
 *   80    |   +6
 *   75    |   +5
 *   70    |   +4
 *   65    |   +3
 *   60    |   +2  (default fallback if agent not in pool)
 *   55    |   +1
 *   50    |    0  (baseline)
 *   40    |   -2
 *   30    |   -4
 * 
 * Formula: OVR boost = (comfort - 50) × 2 / 10
 * 
 * SELECTION (when multiple agents):
 * ---------------------------------
 * Uses squared weights: probability = comfort² / sum(all comfort²)
 * 
 * Examples:
 *   { jett: 99 }                    → 100% Jett, +10 OVR
 *   { jett: 99, raze: 50 }          → 80% Jett / 20% Raze
 *   { jett: 99, raze: 70 }          → 67% Jett / 33% Raze
 *   { yoru: 99, jett: 75, raze: 55 }→ 57% / 32% / 11%, +10/+5/+1 OVR
 * 
 * Personality Reference
 * =====================
 * All traits are 0-99 scale. If not specified, will be randomly generated.
 * 
 * leadership:   Commanding respect, making calls teammates follow
 * workEthic:    VOD review, preparation, studying opponents  
 * mentality:    Composure under pressure, not tilting when down
 * teamPlayer:   Selfless play, setting up teammates over fragging
 * coachability: Accepting feedback, adapting playstyle
 * 
 * IGL Score Formula (for auto-selection):
 *   leadership * 0.25 + teamPlayer * 0.15 + mentality * 0.12 + 
 *   workEthic * 0.08 + gameSense * 0.30 + utilityUsage * 0.10
 * 
 * Example personality archetypes:
 *   Elite IGL:     { leadership: 95, workEthic: 90, mentality: 85, teamPlayer: 90, coachability: 70 }
 *   Star Duelist:  { leadership: 50, workEthic: 75, mentality: 90, teamPlayer: 55, coachability: 75 }
 *   Team Anchor:   { leadership: 70, workEthic: 85, mentality: 80, teamPlayer: 95, coachability: 85 }
 *   Raw Talent:    { leadership: 40, workEthic: 60, mentality: 70, teamPlayer: 50, coachability: 90 }
 *   Veteran:       { leadership: 85, workEthic: 80, mentality: 85, teamPlayer: 80, coachability: 60 }
 */

// ============================================
// AMERICAS REGION (12 teams)
// ============================================
export const AMERICAS_TEAMS: TeamConfig[] = [
  {
    name: "Sentinels",
    abbreviation: "SEN",
    region: "americas",
    logo: "https://owcdn.net/img/62875027c8e06.png",
    igl: "johnQT",
    players: [
      p("johnQT", "flex", 85, 27, 84, 85, 80, 85, { kayo: 95, sage: 80, raze: 65 }, { leadership: 85, workEthic: 80, mentality: 78, teamPlayer: 82, coachability: 75 }),
      p("kyu", "initiator", 81, 22, 78, 90, 40, 80, { sova: 95, fade: 80, breach: 65 }),
      p("N4RRATE", "duelist", 85, 23, 84, 82, 74, 90, { neon: 95, raze: 80, waylay: 65, jett: 50 }),
      p("reduxx", "controller", 80, 18, 88, 95, 50, 88, { omen: 95, astra: 80 }),
      p("cortezia", "sentinel", 78, 21, 80, 92, 50, 74, { cypher: 95, killjoy: 80, chamber: 65 }),
    ],
  },
  {
    name: "G2 Esports",
    abbreviation: "G2",
    region: "americas",
    logo: "https://owcdn.net/img/633822848a741.png",
    igl: "valyn",
    players: [
      p("leaf", "flex", 80, 22, 80, 78, 40, 77, { sage: 95, veto: 80, raze: 65 }),
      p("trent", "initiator", 84, 21, 80, 76, 76, 88, { sova: 95, tejo: 80, fade: 65 }),
      p("JAWGEMO", "duelist", 90, 26, 94, 78, 82, 94, { raze: 95, jett: 80, yoru: 65 }),
      p("valyn", "controller", 83, 22, 80, 88, 60, 80, { omen: 95, brimstone: 80, astra: 65 }, { leadership: 88, workEthic: 85, mentality: 80, teamPlayer: 85, coachability: 72 }),
      p("babybay", "sentinel", 78, 30, 78, 85, 40, 60, { killjoy: 95, chamber: 80 }),
    ],
  },
  {
    name: "NRG Esports",
    abbreviation: "NRG",
    region: "americas",
    logo: "https://owcdn.net/img/6610f02d2d7b0.png",
    igl: "Ethan",
    players: [
      p("Ethan", "flex", 84, 22, 90, 78, 40, 85, { kayo: 95, breach: 80, sage: 65 }, { leadership: 82, workEthic: 85, mentality: 82, teamPlayer: 80, coachability: 78 }),
      p("brawk", "initiator", 83, 25, 82, 90, 76, 86, { sova: 95, fade: 50 }),
      p("keiko", "duelist", 84, 22, 92, 78, 81, 88, { yoru: 95, jett: 55, raze: 55 }),
      p("skuba", "controller", 83, 23, 88, 80, 74, 89, { viper: 95, omen: 80 }),
      p("mada", "sentinel", 84, 25, 82, 85, 81, 89, { cypher: 95, killjoy: 80 }),
    ],
  },
  {
    name: "100 Thieves",
    abbreviation: "100T",
    region: "americas",
    logo: "https://owcdn.net/img/603c00dbb7d39.png",
    igl: "vora",
    players: [
      p("Cryocells", "flex", 85, 22, 88, 80, 80, 86, { chamber: 95, jett: 80 }),
      p("vora", "initiator", 81, 23, 80, 88, 60, 82, { sova: 95, tejo: 80, breach: 65 }, { leadership: 80, workEthic: 78, mentality: 75, teamPlayer: 82, coachability: 80 }),
      p("Timotino", "duelist", 86, 23, 90, 78, 70, 81, { jett: 95, waylay: 80, raze: 65 }),
      p("bang", "controller", 81, 24, 78, 88, 75, 85, { omen: 95, viper: 80 }),
      p("Asuna", "sentinel", 80, 26, 80, 85, 50, 78),
    ],
  },
  {
    name: "Cloud9",
    abbreviation: "C9",
    region: "americas",
    logo: "https://owcdn.net/img/628addcbd509e.png",
    igl: "Zellsis",
    players: [
      p("Zellsis", "flex", 81, 27, 86, 74, 71, 82, undefined, { leadership: 85, workEthic: 80, mentality: 88, teamPlayer: 75, coachability: 70 }),
      p("Xeppaa", "initiator", 78, 25, 82, 86, 60, 80, { skye: 95, breach: 80, tejo: 65 }),
      p("OXY", "duelist", 86, 20, 88, 78, 82, 92, { jett: 95, raze: 80, yoru: 65 }),
      p("penny", "controller", 80, 20, 80, 86, 75, 80, { omen: 95, astra: 80 }),
      p("v1c", "sentinel", 80, 22, 78, 88, 73, 80, { killjoy: 95, cypher: 80 }),
    ],
  },
  {
    name: "Evil Geniuses",
    abbreviation: "EG",
    region: "americas",
    logo: "https://owcdn.net/img/667462e9b308d.png",
    igl: "C0M",
    players: [
      p("okeanos", "flex", 79, 22, 78, 86, 70, 82),
      p("C0M", "initiator", 85, 25, 80, 88, 80, 88, { sova: 95, fade: 80, breach: 65 }, { leadership: 88, workEthic: 90, mentality: 82, teamPlayer: 88, coachability: 75 }),
      p("dgzin", "duelist", 82, 25, 94, 82, 80, 85, { jett: 95, yoru: 80 }),
      p("supamen", "controller", 78, 28, 82, 90, 72, 78, { astra: 95, omen: 80 }),
      p("bao", "sentinel", 76, 19, 78, 86, 74, 74, { killjoy: 75 }),
    ],
  },
  {
    name: "FURIA Esports",
    abbreviation: "FUR",
    region: "americas",
    logo: "https://owcdn.net/img/632be843b7d51.png",
    igl: "nerve",
    players: [
      p("koalanoob", "flex", 81, 22, 88, 78, 70, 85),
      p("eeiu", "initiator", 83, 24, 80, 86, 75, 83),
      p("alym", "duelist", 86, 20, 90, 78, 82, 88),
      p("nerve", "controller", 77, 23, 78, 86, 64, 78, undefined, { leadership: 78, workEthic: 75, mentality: 72, teamPlayer: 80, coachability: 78 }),
      p("artzin", "sentinel", 78, 22, 80, 84, 72, 78),
    ],
  },
  {
    name: "KRÜ Esports",
    abbreviation: "KRU",
    region: "americas",
    logo: "https://owcdn.net/img/63976677069e1.png",
    igl: "Saadhak",
    players: [
      p("silentzz", "flex", 80, 21, 84, 74, 78, 82),
      p("mwzera", "initiator", 80, 24, 78, 86, 73, 80),
      p("Dantedeu5", "duelist", 87, 18, 88, 76, 84, 88),
      p("Saadhak", "controller", 84, 28, 76, 86, 81, 85, undefined, { leadership: 95, workEthic: 92, mentality: 88, teamPlayer: 90, coachability: 65 }),
      p("Less", "sentinel", 88, 20, 80, 86, 84, 92),
    ],
  },
  {
    name: "Leviatán",
    abbreviation: "LEV",
    region: "americas",
    logo: "https://owcdn.net/img/61b8888cc3860.png",
    igl: "kiNgg",
    players: [
      p("Neon", "flex", 82, 17, 90, 78, 72, 83),
      p("blowz", "initiator", 78, 18, 86, 90, 68, 80),
      p("Sato", "duelist", 82, 18, 96, 88, 70, 84),
      p("spikeziN", "controller", 81, 18, 80, 90, 64, 81),
      p("kiNgg", "sentinel", 85, 24, 82, 86, 81, 85, undefined, { leadership: 90, workEthic: 85, mentality: 85, teamPlayer: 88, coachability: 70 }),
    ],
  },
  {
    name: "LOUD",
    abbreviation: "LOUD",
    region: "americas",
    logo: "https://owcdn.net/img/62bbec8dc1b9f.png",
    igl: "pANcada",
    players: [
      p("cauanzin", "flex", 81, 20, 88, 76, 73, 86),
      p("Darker", "initiator", 74, 20, 84, 92, 60, 82),
      p("Virtyy", "duelist", 85, 23, 88, 78, 74, 83),
      p("pANcada", "controller", 83, 26, 80, 92, 73, 86, undefined, { leadership: 88, workEthic: 85, mentality: 82, teamPlayer: 90, coachability: 72 }),
      p("lukxo", "sentinel", 83, 18, 78, 86, 74, 85),
    ],
  },
  {
    name: "MIBR",
    abbreviation: "MIBR",
    region: "americas",
    logo: "https://owcdn.net/img/632be767b57aa.png",
    igl: "Verno",
    players: [
      p("zekken", "flex", 88, 20, 82, 74, 83, 95, undefined, { leadership: 55, workEthic: 78, mentality: 92, teamPlayer: 60, coachability: 75 }),
      p("Verno", "initiator", 83, 19, 76, 84, 81, 85, undefined, { leadership: 80, workEthic: 82, mentality: 78, teamPlayer: 85, coachability: 80 }),
      p("aspas", "duelist", 92, 22, 86, 74, 83, 98, undefined, { leadership: 50, workEthic: 85, mentality: 95, teamPlayer: 55, coachability: 70 }),
      p("Mazino", "controller", 82, 24, 74, 82, 73, 84),
      p("tex", "sentinel", 79, 26, 74, 80, 71, 82),
    ],
  },
  {
    name: 'ENVY',
    abbreviation: 'NV',
    region: 'americas',
    logo: 'https://owcdn.net/img/5f3ca82b04d29.png',
    igl: 'P0PPIN',
    players: [
      p('Eggsterr', 'flex', 81, 23, 82, 72, 70, 83, { yoru: 99 }),
      p('P0PPIN', 'initiator', 81, 21, 74, 82, 75, 82, undefined, { leadership: 78, workEthic: 75, mentality: 72, teamPlayer: 80, coachability: 78 }),
      p('canezerra', 'duelist', 86, 17, 84, 74, 75, 93),
      p('ion2x', 'controller', 79, 16, 72, 82, 74, 83),
      p('inspire2x', 'sentinel', 80, 27, 74, 78, 46, 84),
    ],
  },
];

// ============================================
// CHINA REGION (12 teams)
// ============================================
export const CHINA_TEAMS: TeamConfig[] = [
  {
    name: 'EDward Gaming',
    abbreviation: 'EDG',
    region: 'china',
    logo: 'https://owcdn.net/img/62c8204fbb29d.png',
    igl: 'Smoggy',
    players: [
      p('Jieni7', 'flex', 83, 20, 90, 80, 73, 82),
      p('nobody', 'initiator', 83, 23, 84, 90, 81, 85),
      p('cb', 'duelist', 84, 22, 94, 82, 82, 92),
      p('Smoggy', 'controller', 82, 23, 80, 90, 81, 86, undefined, { leadership: 85, workEthic: 85, mentality: 80, teamPlayer: 85, coachability: 75 }),
      p('CHICHOO', 'sentinel', 84, 22, 82, 86, 75, 88),
    ],
  },
  {
    name: 'FunPlus Phoenix',
    abbreviation: 'FPX',
    region: 'china',
    logo: 'https://owcdn.net/img/65a17b313b131.png',
    igl: 'AAAAY',
    players: [
      p('YuChEn', 'flex', 84, 20, 88, 78, 82, 86),
      p('Lysoar', 'initiator', 84, 22, 80, 88, 86, 82),
      p('Yuicaw', 'duelist', 86, 21, 90, 78, 84, 88),
      p('AAAAY', 'controller', 83, 23, 78, 88, 86, 80, undefined, { leadership: 82, workEthic: 85, mentality: 80, teamPlayer: 85, coachability: 78 }),
      p('nizhaoTZH', 'sentinel', 82, 24, 80, 85, 84, 78),
    ],
  },
  {
    name: 'JD Gaming',
    abbreviation: 'JDG',
    region: 'china',
    logo: 'https://owcdn.net/img/64f9825408326.png',
    igl: 'Muggle',
    players: [
      p('KnifeCat', 'flex', 83, 20, 86, 78, 80, 84),
      p('kling', 'initiator', 82, 21, 78, 86, 84, 80),
      p('Stew', 'duelist', 84, 22, 88, 78, 82, 86),
      p('Muggle', 'controller', 81, 23, 76, 86, 84, 78, undefined, { leadership: 80, workEthic: 82, mentality: 78, teamPlayer: 82, coachability: 78 }),
      p('Viva', 'sentinel', 80, 22, 78, 84, 82, 76),
    ],
  },
  {
    name: 'Nova Esports',
    abbreviation: 'NOVA',
    region: 'china',
    logo: 'https://owcdn.net/img/6404c031b6c67.png',
    igl: 'Lzq',
    players: [
      p('monster', 'flex', 84, 20, 88, 78, 80, 85),
      p('zheyuan', 'initiator', 83, 21, 80, 86, 85, 82),
      p('Rb', 'duelist', 85, 22, 88, 78, 82, 86),
      p('Lzq', 'controller', 82, 23, 78, 86, 84, 80, undefined, { leadership: 78, workEthic: 80, mentality: 75, teamPlayer: 80, coachability: 78 }),
      p('gump', 'sentinel', 81, 22, 78, 84, 82, 78),
    ],
  },
  {
    name: 'Titan Esports Club',
    abbreviation: 'TEC',
    region: 'china',
    logo: 'https://owcdn.net/img/6548741adc65f.png',
    igl: 'Summer',
    players: [
      p('Eagle', 'flex', 82, 20, 86, 76, 78, 84),
      p('knight', 'initiator', 81, 22, 78, 84, 82, 78),
      p('Life', 'duelist', 83, 21, 86, 76, 80, 84),
      p('Summer', 'controller', 80, 23, 76, 84, 82, 76, undefined, { leadership: 75, workEthic: 78, mentality: 72, teamPlayer: 78, coachability: 78 }),
      p('yosemite', 'sentinel', 79, 21, 76, 82, 80, 76),
    ],
  },
  {
    name: 'Trace Esports',
    abbreviation: 'TE',
    region: 'china',
    logo: 'https://owcdn.net/img/6433a2d3b58c9.png',
    igl: 'kai',
    players: [
      p('flex', 'flex', 83, 19, 86, 78, 80, 84),
      p('EREN', 'initiator', 82, 21, 78, 86, 84, 80),
      p('rin', 'duelist', 84, 20, 88, 78, 82, 86),
      p('kai', 'controller', 81, 22, 76, 86, 84, 78, undefined, { leadership: 78, workEthic: 80, mentality: 75, teamPlayer: 80, coachability: 78 }),
      p('Sen', 'sentinel', 80, 23, 78, 84, 82, 76),
    ],
  },
  {
    name: 'TYLOO',
    abbreviation: 'TYL',
    region: 'china',
    logo: 'https://owcdn.net/img/63eb60fb08390.png',
    igl: 'EXPRO',
    players: [
      p('AFFLICTO', 'flex', 81, 21, 84, 76, 78, 82),
      p('SLOWLY', 'initiator', 80, 23, 76, 84, 82, 78),
      p('abo', 'duelist', 82, 22, 86, 76, 80, 84),
      p('EXPRO', 'controller', 79, 24, 74, 84, 82, 76, undefined, { leadership: 75, workEthic: 75, mentality: 70, teamPlayer: 75, coachability: 75 }),
      p('LEVIATHAN', 'sentinel', 78, 22, 76, 82, 80, 76),
    ],
  },
  {
    name: 'Wolves Esports',
    abbreviation: 'WOL',
    region: 'china',
    logo: 'https://owcdn.net/img/651d33f8e6a1f.png',
    igl: 'yy',
    players: [
      p('XinQ', 'flex', 82, 20, 86, 76, 78, 84),
      p('aak', 'initiator', 81, 22, 78, 84, 82, 78),
      p('Biank', 'duelist', 83, 21, 86, 78, 80, 84),
      p('yy', 'controller', 80, 23, 76, 84, 82, 76, undefined, { leadership: 76, workEthic: 78, mentality: 74, teamPlayer: 78, coachability: 78 }),
      p('Abo', 'sentinel', 79, 21, 76, 82, 80, 76),
    ],
  },
  {
    name: 'Dragon Ranger Gaming',
    abbreviation: 'DRG',
    region: 'china',
    logo: 'https://owcdn.net/img/642233fc01f26.png',
    igl: 'Tian',
    players: [
      p('Sam', 'flex', 81, 20, 84, 76, 78, 82),
      p('Luoyi', 'initiator', 80, 22, 76, 84, 82, 78),
      p('Fengf', 'duelist', 82, 21, 86, 76, 80, 84),
      p('Tian', 'controller', 79, 23, 74, 84, 82, 76, undefined, { leadership: 74, workEthic: 76, mentality: 72, teamPlayer: 76, coachability: 78 }),
      p('BuGi', 'sentinel', 78, 21, 76, 82, 80, 76),
    ],
  },
  {
    name: 'Bilibili Gaming',
    abbreviation: 'BLG',
    region: 'china',
    logo: 'https://owcdn.net/img/63f25d72216c1.png',
    igl: 'Yuhan',
    players: [
      p('knight9', 'flex', 84, 20, 88, 78, 82, 86),
      p('Biank', 'initiator', 83, 22, 80, 86, 84, 82),
      p('whzy', 'duelist', 85, 21, 88, 78, 84, 86),
      p('Yuhan', 'controller', 82, 23, 78, 86, 84, 80, undefined, { leadership: 80, workEthic: 82, mentality: 78, teamPlayer: 82, coachability: 78 }),
      p('hex', 'sentinel', 81, 22, 78, 84, 82, 78),
    ],
  },
  {
    name: 'All Gamers',
    abbreviation: 'AG',
    region: 'china',
    logo: 'https://owcdn.net/img/6549c2b905061.png',
    igl: 'yue',
    players: [
      p('Abo', 'flex', 79, 20, 82, 74, 78, 80),
      p('xiaosaGe', 'initiator', 78, 22, 74, 82, 80, 76),
      p('BnTet', 'duelist', 80, 21, 84, 74, 78, 82),
      p('yue', 'controller', 77, 23, 72, 82, 80, 74, undefined, { leadership: 72, workEthic: 74, mentality: 70, teamPlayer: 74, coachability: 76 }),
      p('L1nhof', 'sentinel', 76, 21, 74, 78, 76, 74),
    ],
  },
  {
    name: 'Xi Lai Gaming',
    abbreviation: 'XLG',
    region: 'china',
    logo: 'https://owcdn.net/img/671742f863b9b.png',
    igl: 'rin',
    players: [
      p('z4kr', 'flex', 78, 20, 82, 72, 76, 80),
      p('Maco', 'initiator', 79, 22, 74, 82, 80, 76),
      p('AfteR', 'duelist', 81, 21, 84, 74, 78, 82),
      p('rin', 'controller', 77, 23, 72, 82, 80, 74, undefined, { leadership: 70, workEthic: 72, mentality: 68, teamPlayer: 72, coachability: 74 }),
      p('lang', 'sentinel', 76, 21, 74, 78, 76, 74),
    ],
  },
];

// ============================================
// EMEA REGION (12 teams)
// ============================================
export const EMEA_TEAMS: TeamConfig[] = [
  {
    name: 'Fnatic',
    abbreviation: 'FNC',
    region: 'emea',
    logo: 'https://owcdn.net/img/62a40cc2b5e29.png',
    igl: 'Boaster',
    players: [
      p('Veqaj', 'flex', 80, 22, 94, 82, 78, 82),
      p('crashies', 'initiator', 83, 28, 80, 90, 83, 86, undefined, { leadership: 70, workEthic: 90, mentality: 85, teamPlayer: 92, coachability: 88 }),
      p('kaajak', 'duelist', 91, 21, 95, 84, 88, 95, undefined, { leadership: 45, workEthic: 80, mentality: 92, teamPlayer: 60, coachability: 78 }),
      p('Boaster', 'controller', 81, 30, 76, 92, 73, 85, undefined, { leadership: 98, workEthic: 92, mentality: 88, teamPlayer: 95, coachability: 55 }),
      p('Alfajer', 'sentinel', 88, 20, 84, 90, 83, 94, undefined, { leadership: 50, workEthic: 85, mentality: 90, teamPlayer: 75, coachability: 82 }),
    ],
  },
  {
    name: 'Natus Vincere',
    abbreviation: 'NAVI',
    region: 'emea',
    logo: 'https://owcdn.net/img/62a410a4e7b4f.png',
    igl: 'Shao',
    players: [
      p('Shao', 'flex', 83, 25, 92, 80, 73, 83, undefined, { leadership: 88, workEthic: 85, mentality: 82, teamPlayer: 85, coachability: 70 }),
      p('sociablEE', 'initiator', 81, 29, 86, 90, 74, 86),
      p('Filu', 'duelist', 84, 21, 94, 82, 86, 92),
      p('Ruxic', 'controller', 81, 21, 78, 88, 70, 82),
      p('hiro', 'sentinel', 82, 19, 82, 88, 78, 84),
    ],
  },
  {
    name: 'Team Liquid',
    abbreviation: 'TL',
    region: 'emea',
    logo: 'https://owcdn.net/img/640c38262824c.png',
    igl: 'nAts',
    players: [
      p('kamo', 'flex', 83, 20, 90, 80, 74, 85),
      p('MiniBoo', 'initiator', 78, 20, 82, 88, 76, 85),
      p('purp0', 'duelist', 85, 22, 92, 80, 82, 93),
      p('wayne', 'controller', 81, 18, 78, 90, 78, 81),
      p('nAts', 'sentinel', 87, 23, 88, 92, 84, 88, undefined, { leadership: 90, workEthic: 95, mentality: 92, teamPlayer: 85, coachability: 68 }),
    ],
  },
  {
    name: 'Karmine Corp',
    abbreviation: 'KC',
    region: 'emea',
    logo: 'https://owcdn.net/img/627403aa2c53d.png',
    igl: 'Shin',
    players: [
      p('xms', 'flex', 82, 26, 86, 76, 80, 84),
      p('Marteen', 'initiator', 84, 22, 82, 86, 88, 80),
      p('Newzera', 'duelist', 86, 19, 90, 80, 84, 88),
      p('Shin', 'controller', 85, 23, 80, 90, 88, 82, undefined, { leadership: 92, workEthic: 88, mentality: 85, teamPlayer: 90, coachability: 70 }),
      p('Magnum', 'sentinel', 83, 24, 80, 86, 85, 80),
    ],
  },
  {
    name: 'Team Heretics',
    abbreviation: 'TH',
    region: 'emea',
    logo: 'https://owcdn.net/img/637b7557a9225.png',
    igl: 'Boo',
    players: [
      p('ComeBack', 'flex', 81, 18, 78, 90, 78, 82),
      p('paTiTek', 'initiator', 85, 26, 82, 88, 76, 85),
      p('Wo0t', 'duelist', 86, 19, 90, 78, 84, 88),
      p('Boo', 'controller', 83, 28, 80, 86, 84, 90, undefined, { leadership: 88, workEthic: 85, mentality: 85, teamPlayer: 88, coachability: 72 }),
      p('benjyfishy', 'sentinel', 86, 21, 88, 78, 82, 92),
    ],
  },
  {
    name: 'Team Vitality',
    abbreviation: 'VIT',
    region: 'emea',
    logo: 'https://owcdn.net/img/6466d7936fd86.png',
    igl: 'Jamppi',
    players: [
      p('Sayonara', 'flex', 82, 17, 90, 80, 84, 88),
      p('Jamppi', 'initiator', 81, 24, 88, 78, 72, 86, undefined, { leadership: 78, workEthic: 80, mentality: 75, teamPlayer: 78, coachability: 75 }),
      p('Derke', 'duelist', 87, 22, 78, 88, 86, 95, undefined, { leadership: 50, workEthic: 82, mentality: 92, teamPlayer: 58, coachability: 72 }),
      p('PROFEK', 'controller', 81, 21, 82, 86, 78, 82),
      p('Chronicle', 'sentinel', 86, 23, 78, 86, 83, 95, undefined, { leadership: 72, workEthic: 90, mentality: 88, teamPlayer: 80, coachability: 78 }),
    ],
  },
  {
    name: 'GIANTX',
    abbreviation: 'GX',
    region: 'emea',
    logo: 'https://owcdn.net/img/657b2f49210a3.png',
    igl: 'ara',
    players: [
      p('Flickless', 'duelist', 80, 23, 88, 78, 82, 86),
      p('Cloud', 'initiator', 76, 22, 78, 86, 84, 80),
      p('ara', 'controller', 84, 20, 76, 86, 84, 85, undefined, { leadership: 82, workEthic: 80, mentality: 78, teamPlayer: 82, coachability: 78 }),
      p('grubinho', 'sentinel', 76, 22, 78, 84, 82, 78),
      p('westside', 'duelist', 79, 20, 88, 80, 84, 81),
    ],
  },
  {
    name: 'BBL Esports',
    abbreviation: 'BBL',
    region: 'emea',
    logo: 'https://owcdn.net/img/65b8ccef5e273.png',
    igl: 'pAura',
    players: [
      p('QutionerX', 'duelist', 85, 21, 88, 78, 84, 86),
      p('pAura', 'controller', 84, 23, 78, 90, 88, 82, undefined, { leadership: 90, workEthic: 88, mentality: 85, teamPlayer: 88, coachability: 72 }),
      p('Turko', 'initiator', 83, 24, 80, 86, 85, 80),
      p('AsLanM4shadoW', 'sentinel', 82, 25, 80, 85, 84, 78),
      p('Brave', 'duelist', 84, 22, 88, 78, 82, 86),
    ],
  },
  {
    name: 'FUT Esports',
    abbreviation: 'FUT',
    region: 'emea',
    logo: 'https://owcdn.net/img/632be99c96c64.png',
    igl: 'MrFaliN',
    players: [
      p('MrFaliN', 'controller', 84, 24, 78, 88, 86, 80, undefined, { leadership: 85, workEthic: 85, mentality: 82, teamPlayer: 85, coachability: 75 }),
      p('qRaxs', 'duelist', 85, 21, 90, 78, 82, 86),
      p('qw1', 'initiator', 83, 22, 80, 86, 84, 80),
      p('MOJJ', 'sentinel', 82, 23, 78, 85, 84, 78),
      p('Muj', 'duelist', 84, 20, 88, 78, 80, 85),
    ],
  },
  {
    name: 'Gentle Mates',
    abbreviation: 'M8',
    region: 'emea',
    logo: 'https://owcdn.net/img/66701546055dd.png',
    igl: 'wailers',
    players: [
      p('logaN', 'duelist', 83, 24, 86, 78, 80, 84),
      p('nataNk', 'initiator', 81, 23, 78, 84, 82, 78),
      p('wailers', 'controller', 80, 25, 76, 84, 82, 76, undefined, { leadership: 78, workEthic: 78, mentality: 75, teamPlayer: 80, coachability: 78 }),
      p('ow3r', 'sentinel', 79, 22, 76, 82, 80, 76),
      p('Fizzy', 'duelist', 82, 21, 86, 76, 78, 84),
    ],
  },
  {
    name: 'PCIFIC Esports',
    abbreviation: 'PCF',
    region: 'emea',
    logo: 'https://owcdn.net/img/656e2ae2b8a48.png',
    igl: 'pAura',
    players: [
      p('Turko', 'flex', 80, 21, 84, 74, 78, 82),
      p('Brave', 'initiator', 81, 23, 78, 84, 82, 78),
      p('aimDLL', 'duelist', 83, 20, 86, 76, 80, 84),
      p('pAura', 'controller', 79, 24, 74, 84, 82, 76, undefined, { leadership: 78, workEthic: 78, mentality: 75, teamPlayer: 78, coachability: 78 }),
      p('AsLanM4shadoW', 'sentinel', 78, 22, 76, 80, 78, 76),
    ],
  },
  {
    name: 'ULF Esports',
    abbreviation: 'ULF',
    region: 'emea',
    logo: 'https://owcdn.net/img/67d59c02cdba4.png',
    igl: 'Cloud',
    players: [
      p('Fit1nho', 'flex', 79, 20, 82, 74, 78, 80),
      p('hoody', 'initiator', 80, 22, 76, 84, 82, 78),
      p('Juanflatroo', 'duelist', 82, 21, 86, 76, 80, 84),
      p('Cloud', 'controller', 78, 23, 74, 82, 80, 76, undefined, { leadership: 76, workEthic: 76, mentality: 74, teamPlayer: 78, coachability: 78 }),
      p('nukkye', 'sentinel', 81, 24, 78, 84, 82, 78),
    ],
  },
];

// ============================================
// PACIFIC REGION (12 teams)
// ============================================
export const PACIFIC_TEAMS: TeamConfig[] = [
  {
    name: 'Paper Rex',
    abbreviation: 'PRX',
    region: 'pacific',
    logo: 'https://owcdn.net/img/62bbebb185a7e.png',
    igl: 'f0rsakeN',
    players: [
      p('something', 'flex', 87, 23, 96, 84, 88, 94, undefined, { leadership: 60, workEthic: 82, mentality: 95, teamPlayer: 75, coachability: 72 }),
      p('invy', 'initiator', 82, 21, 86, 90, 70, 86),
      p('Jinggg', 'duelist', 88, 22, 94, 82, 86, 92, undefined, { leadership: 48, workEthic: 78, mentality: 92, teamPlayer: 68, coachability: 75 }),
      p('f0rsakeN', 'controller', 84, 21, 80, 92, 90, 87, undefined, { leadership: 92, workEthic: 88, mentality: 88, teamPlayer: 90, coachability: 72 }),
      p('d4v41', 'sentinel', 84, 27, 82, 86, 86, 82, undefined, { leadership: 72, workEthic: 88, mentality: 85, teamPlayer: 88, coachability: 80 }),
    ],
  },
  {
    name: 'T1',
    abbreviation: 'T1',
    region: 'pacific',
    logo: 'https://owcdn.net/img/62fe0b8f6b084.png',
    igl: 'stax',
    players: [
      p('BuZz', 'flex', 81, 22, 92, 80, 84, 88),
      p('stax', 'initiator', 81, 25, 82, 90, 78, 84, undefined, { leadership: 90, workEthic: 88, mentality: 85, teamPlayer: 90, coachability: 70 }),
      p('Meteor', 'duelist', 86, 26, 92, 80, 82, 90),
      p('Munchkin', 'controller', 79, 27, 78, 88, 57, 78),
      p('iZu', 'sentinel', 79, 21, 80, 86, 65, 80),
    ],
  },
  {
    name: 'DRX',
    abbreviation: 'DRX',
    region: 'pacific',
    logo: 'https://owcdn.net/img/63b17ac3a7d00.png',
    igl: 'MaKo',
    players: [
      p('free1ng', 'flex', 78, 24, 94, 82, 81, 84),
      p('BeYN', 'initiator', 81, 22, 84, 92, 70, 86),
      p('Flashback', 'duelist', 85, 20, 92, 80, 82, 84),
      p('apeX', 'controller', 82, 21, 80, 92, 70, 84),
      p('MaKo', 'sentinel', 87, 23, 82, 86, 81, 88, undefined, { leadership: 95, workEthic: 92, mentality: 90, teamPlayer: 92, coachability: 65 }),
    ],
  },
  {
    name: 'Gen.G',
    abbreviation: 'GEN',
    region: 'pacific',
    logo: 'https://owcdn.net/img/662f72041aff8.png',
    igl: 'Lakia',
    players: [
      p('ZynX', 'flex', 79, 20, 88, 78, 72, 82),
      p('Lakia', 'initiator', 83, 23, 80, 88, 76, 84, undefined, { leadership: 85, workEthic: 85, mentality: 82, teamPlayer: 85, coachability: 75 }),
      p('t3xture', 'duelist', 86, 21, 90, 80, 84, 88),
      p('Ash', 'controller', 81, 24, 78, 88, 60, 80),
      p('Karon', 'sentinel', 82, 22, 82, 88, 73, 84),
    ],
  },
  {
    name: 'DetonatioN FocusMe',
    abbreviation: 'DFM',
    region: 'pacific',
    logo: 'https://owcdn.net/img/63972e75f18ed.png',
    igl: 'Anthem',
    players: [
      p('Xdll', 'flex', 85, 22, 88, 80, 84, 86),
      p('Suggest', 'initiator', 84, 24, 80, 88, 86, 82),
      p('Laz', 'duelist', 86, 27, 90, 80, 86, 88, undefined, { leadership: 75, workEthic: 90, mentality: 88, teamPlayer: 78, coachability: 75 }),
      p('Anthem', 'controller', 83, 25, 78, 88, 86, 80, undefined, { leadership: 88, workEthic: 90, mentality: 85, teamPlayer: 88, coachability: 78 }),
      p('Reita', 'sentinel', 82, 26, 80, 85, 84, 78),
    ],
  },
  {
    name: 'Global Esports',
    abbreviation: 'GE',
    region: 'pacific',
    logo: 'https://owcdn.net/img/629f316ddd4dd.png',
    igl: 'Benkai',
    players: [
      p('Benkai', 'flex', 83, 27, 86, 78, 80, 84, undefined, { leadership: 92, workEthic: 88, mentality: 85, teamPlayer: 90, coachability: 68 }),
      p('JESUSCHRIST', 'initiator', 84, 22, 80, 88, 86, 82),
      p('SkRossi', 'duelist', 86, 23, 90, 78, 84, 88, undefined, { leadership: 52, workEthic: 75, mentality: 88, teamPlayer: 58, coachability: 72 }),
      p('KappA', 'controller', 82, 24, 78, 86, 84, 80),
      p('Lightningfast', 'sentinel', 81, 23, 78, 84, 82, 78),
    ],
  },
  {
    name: 'Team Secret',
    abbreviation: 'TS',
    region: 'pacific',
    logo: 'https://owcdn.net/img/629f130e0501d.png',
    igl: 'JessieVash',
    players: [
      p('Jremy', 'flex', 84, 20, 88, 78, 82, 86),
      p('JessieVash', 'initiator', 83, 28, 80, 86, 85, 82, undefined, { leadership: 90, workEthic: 88, mentality: 85, teamPlayer: 90, coachability: 70 }),
      p('BORKUM', 'duelist', 85, 22, 88, 80, 84, 86),
      p('DubsteP', 'controller', 82, 24, 78, 86, 84, 80),
      p('Witz', 'sentinel', 81, 21, 78, 84, 82, 78),
    ],
  },
  {
    name: 'ZETA DIVISION',
    abbreviation: 'ZETA',
    region: 'pacific',
    logo: 'https://owcdn.net/img/62a4117e1c021.png',
    igl: 'crow',
    players: [
      p('Lazygal', 'flex', 85, 21, 88, 80, 84, 86),
      p('crow', 'initiator', 86, 25, 82, 90, 88, 84, undefined, { leadership: 92, workEthic: 90, mentality: 88, teamPlayer: 90, coachability: 72 }),
      p('Dep', 'duelist', 88, 24, 92, 80, 86, 90, undefined, { leadership: 52, workEthic: 82, mentality: 92, teamPlayer: 62, coachability: 75 }),
      p('TENNN', 'controller', 84, 23, 78, 88, 86, 80),
      p('SugarZ3ro', 'sentinel', 83, 22, 80, 86, 84, 80),
    ],
  },
  {
    name: 'Nongshim Redforce',
    abbreviation: 'NS',
    region: 'pacific',
    logo: 'https://owcdn.net/img/6399bb707aacb.png',
    igl: 'Crws',
    players: [
      p('garnetS', 'flex', 85, 20, 88, 78, 82, 86),
      p('sushiboys', 'initiator', 84, 23, 80, 88, 86, 82),
      p('Patiphan', 'duelist', 87, 21, 92, 80, 84, 88, undefined, { leadership: 48, workEthic: 78, mentality: 90, teamPlayer: 62, coachability: 78 }),
      p('Crws', 'controller', 83, 24, 78, 88, 86, 80, undefined, { leadership: 85, workEthic: 85, mentality: 82, teamPlayer: 85, coachability: 75 }),
      p('Foxz', 'sentinel', 82, 25, 80, 86, 84, 78),
    ],
  },
  {
    name: 'Rex Regum Qeon',
    abbreviation: 'RRQ',
    region: 'pacific',
    logo: 'https://owcdn.net/img/629f17f51e7a3.png',
    igl: 'Eeyore',
    players: [
      p('Lmemore', 'flex', 80, 21, 84, 74, 78, 82),
      p('Estrella', 'initiator', 81, 23, 78, 84, 82, 78),
      p('Tehbotol', 'duelist', 83, 20, 86, 76, 80, 84),
      p('Eeyore', 'controller', 79, 24, 74, 84, 82, 76, undefined, { leadership: 78, workEthic: 78, mentality: 75, teamPlayer: 80, coachability: 78 }),
      p('Xccurate', 'sentinel', 78, 22, 76, 80, 78, 76),
    ],
  },
  {
    name: 'VARREL',
    abbreviation: 'VL',
    region: 'pacific',
    logo: 'https://owcdn.net/img/63a746333bc0a.png',
    igl: 'sScary',
    players: [
      p('crazyguy', 'flex', 81, 21, 84, 76, 78, 82),
      p('Deryeon', 'initiator', 82, 23, 78, 86, 84, 80),
      p('Juicy', 'duelist', 84, 20, 88, 76, 80, 86),
      p('sScary', 'controller', 80, 24, 76, 84, 82, 78, undefined, { leadership: 78, workEthic: 78, mentality: 75, teamPlayer: 78, coachability: 78 }),
      p('Retla', 'sentinel', 79, 22, 76, 82, 80, 76),
    ],
  },
  {
    name: 'FULL SENSE',
    abbreviation: 'FS',
    region: 'pacific',
    logo: 'https://owcdn.net/img/6537a7954d915.png',
    igl: 'sSc1ary',
    players: [
      p('crazyguy1', 'flex', 81, 21, 84, 76, 78, 82),
      p('Dery1eon', 'initiator', 82, 23, 78, 86, 84, 80),
      p('Juic1y', 'duelist', 84, 20, 88, 76, 80, 86),
      p('sSc1ary', 'controller', 80, 24, 76, 84, 82, 78, undefined, { leadership: 76, workEthic: 76, mentality: 74, teamPlayer: 78, coachability: 78 }),
      p('Ret1la', 'sentinel', 79, 22, 76, 82, 80, 76),
    ],
  }
];

// All teams combined
export const ALL_TEAMS: TeamConfig[] = [
  ...AMERICAS_TEAMS,
  ...CHINA_TEAMS,
  ...EMEA_TEAMS,
  ...PACIFIC_TEAMS,
];

// ============================================
// FREE AGENTS
// ============================================
export const FREE_AGENTS: PlayerConfig[] = [
  // Former pros / Big names
  p('TenZ', 'duelist', 88, 23, 94, 80, 82, 92, { jett: 99, raze: 80, reyna: 70 }, { leadership: 50, workEthic: 70, mentality: 85, teamPlayer: 55, coachability: 65 }),
  p('yay', 'duelist', 86, 25, 96, 78, 80, 88, { jett: 95, chamber: 99 }, { leadership: 55, workEthic: 90, mentality: 92, teamPlayer: 68, coachability: 78 }),
  p('Demon1', 'duelist', 87, 20, 92, 78, 82, 90, { neon: 99, jett: 85, raze: 75 }, { leadership: 45, workEthic: 75, mentality: 88, teamPlayer: 52, coachability: 72 }),
  p('s0m', 'flex', 82, 24, 86, 80, 78, 84, { kayo: 95, sova: 80 }, { leadership: 60, workEthic: 72, mentality: 75, teamPlayer: 70, coachability: 70 }),
  p('SicK', 'flex', 80, 26, 84, 82, 76, 82, undefined, { leadership: 65, workEthic: 82, mentality: 78, teamPlayer: 85, coachability: 82 }),
  p('dapr', 'sentinel', 79, 26, 78, 86, 78, 80, { cypher: 95, killjoy: 85 }, { leadership: 62, workEthic: 85, mentality: 80, teamPlayer: 85, coachability: 78 }),
  p('zombs', 'controller', 72, 28, 70, 86, 74, 74, { astra: 95, omen: 80 }, { leadership: 55, workEthic: 60, mentality: 65, teamPlayer: 75, coachability: 58 }),
  p('ShahZaM', 'initiator', 76, 30, 80, 82, 78, 78, { sova: 95, breach: 75 }, { leadership: 92, workEthic: 80, mentality: 75, teamPlayer: 72, coachability: 50 }),
  
  // Tier 1 talent
  p('cNed', 'duelist', 84, 23, 92, 76, 78, 88, { jett: 99, chamber: 85 }, { leadership: 50, workEthic: 78, mentality: 85, teamPlayer: 55, coachability: 70 }),
  p('Enzo', 'duelist', 83, 21, 88, 78, 80, 86, { jett: 95, raze: 85 }),
  p('sacy', 'initiator', 82, 28, 78, 90, 84, 84, { fade: 95, skye: 85 }, { leadership: 85, workEthic: 90, mentality: 82, teamPlayer: 92, coachability: 82 }),
  p('BONECOLD', 'initiator', 81, 24, 80, 86, 82, 80),
  p('Subroza', 'flex', 78, 28, 82, 78, 74, 80),
  
  // Solid role players
  p('hazed', 'controller', 74, 32, 74, 84, 76, 76, undefined, { leadership: 80, workEthic: 85, mentality: 80, teamPlayer: 90, coachability: 78 }),
  p('nitr0', 'controller', 75, 30, 76, 86, 78, 76, undefined, { leadership: 88, workEthic: 85, mentality: 82, teamPlayer: 88, coachability: 72 }),
  p('FNS', 'controller', 73, 30, 70, 88, 82, 72, undefined, { leadership: 98, workEthic: 95, mentality: 85, teamPlayer: 92, coachability: 45 }),
  p('vanity', 'controller', 77, 27, 74, 86, 80, 76, undefined, { leadership: 90, workEthic: 88, mentality: 82, teamPlayer: 88, coachability: 68 }),
  p('steel', 'controller', 70, 34, 68, 86, 80, 68, undefined, { leadership: 92, workEthic: 90, mentality: 80, teamPlayer: 85, coachability: 50 }),
  p('dephh', 'controller', 72, 30, 70, 86, 78, 70, undefined, { leadership: 85, workEthic: 85, mentality: 78, teamPlayer: 85, coachability: 70 }),
  
  // Korean/Pacific talents
  p('Rb', 'duelist', 82, 22, 88, 78, 80, 84),
  p('k1Ng', 'initiator', 79, 24, 78, 86, 80, 78),
  p('allow', 'sentinel', 77, 23, 76, 84, 78, 76),
  p('Seoldam', 'duelist', 80, 25, 88, 76, 78, 82),
  p('takej', 'sentinel', 78, 26, 78, 84, 80, 78),
  p('neth', 'duelist', 79, 24, 86, 76, 76, 80),
  
  // EU talents
  p('L1NK', 'flex', 76, 27, 80, 78, 74, 78),
  p('starxo', 'flex', 78, 25, 82, 80, 76, 78),
  p('ScreaM', 'duelist', 80, 30, 92, 72, 74, 82, { phoenix: 95, jett: 80 }, { leadership: 60, workEthic: 85, mentality: 80, teamPlayer: 68, coachability: 65 }),
  p('Nivera', 'sentinel', 79, 24, 84, 82, 76, 80, { chamber: 95, killjoy: 80 }),
  
  // BR talents
  p('tuyz', 'controller', 79, 24, 76, 88, 80, 80),
  p('xand', 'duelist', 81, 23, 88, 76, 78, 84),
  p('heat', 'duelist', 80, 24, 86, 76, 76, 82),
  p('frz', 'sentinel', 77, 23, 78, 84, 76, 78),
  
  // Rising stars / Academy players
  p('NaturE', 'sentinel', 75, 21, 76, 82, 76, 74),
  p('wippie', 'flex', 76, 24, 78, 82, 76, 76),
  p('Zander', 'initiator', 74, 23, 74, 84, 76, 74),
  p('AYRIN', 'flex', 75, 26, 78, 80, 74, 76),
  p('aproto', 'sentinel', 76, 22, 78, 82, 76, 76),
  p('dicey', 'duelist', 78, 23, 86, 74, 74, 80, { jett: 90, chamber: 85 }),
  p('mitch', 'flex', 74, 22, 78, 78, 72, 74),
  
  // Legends / Veterans
  p('Hiko', 'initiator', 70, 34, 72, 80, 74, 72, { sova: 99 }, { leadership: 85, workEthic: 78, mentality: 78, teamPlayer: 80, coachability: 60 }),
  p('Sayaplayer', 'duelist', 79, 26, 88, 74, 74, 80, { jett: 95 }),
  p('sinatraa', 'duelist', 84, 25, 90, 76, 80, 88, { raze: 95, phoenix: 80 }, { leadership: 55, workEthic: 65, mentality: 82, teamPlayer: 45, coachability: 40 }),
];

// Get teams by region
export function getTeamsByRegion(region: Region): TeamConfig[] {
  switch (region) {
    case 'americas': return AMERICAS_TEAMS;
    case 'china': return CHINA_TEAMS;
    case 'emea': return EMEA_TEAMS;
    case 'pacific': return PACIFIC_TEAMS;
  }
}