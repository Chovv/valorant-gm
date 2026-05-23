// src/sim/syntheticRoundLogs.ts
// Generates plausible round-by-play logs from known map results (for legacy saves)

import type { RoundLog, KillEvent, BuyState, RoundWinCondition, PlayerMapStats } from '../types';
import { createRNG, randomInt } from '../utils/random';
import type { RNG } from '../utils/random';
import { getAbilityNames } from '../data/agentAbilities';

// weapon pools moved to assignSyntheticWeapon (per-player assignment)

/** Agents who are primary Operator users */
const OP_AGENTS = new Set(['jett', 'chamber', 'waylay']);

/** Per-weapon headshot chance (gun kills only, not abilities) */
const HEADSHOT_CHANCE: Record<string, number> = {
  'Sheriff': 0.38, 'Guardian': 0.36, 'Vandal': 0.30, 'Ghost': 0.28,
  'Marshal': 0.28, 'Bulldog': 0.24, 'Phantom': 0.22, 'Classic': 0.20,
  'Spectre': 0.18, 'Stinger': 0.14, 'Frenzy': 0.14, 'Ares': 0.10,
  'Odin': 0.08, 'Operator': 0.03, 'Bucky': 0.03, 'Shorty': 0.03,
};

/** Per-weapon wallbang chance */
const WALLBANG_CHANCE: Record<string, number> = {
  'Odin': 0.22, 'Operator': 0.15, 'Ares': 0.12, 'Guardian': 0.10,
  'Vandal': 0.08, 'Phantom': 0.08, 'Bulldog': 0.06, 'Marshal': 0.06,
  'Sheriff': 0.05, 'Spectre': 0.04, 'Stinger': 0.03, 'Ghost': 0.03,
  'Classic': 0.02, 'Frenzy': 0.02, 'Bucky': 0.01, 'Shorty': 0.01,
};

const AGENT_ABILITY_KILLS: Record<string, string[]> = {
  jett: ['Blade Storm'], raze: ['Showstopper', 'Paint Shells'], phoenix: ['Run it Back'],
  reyna: ['Empress'], neon: ['Overdrive'], iso: ['Kill Contract'],
  omen: ['Paranoia'], brimstone: ['Orbital Strike', 'Incendiary'], astra: ['Nova Pulse'],
  sova: ["Hunter's Fury", 'Shock Bolt'], breach: ['Aftershock'], skye: ['Seekers'],
  kayo: ['FRAG/MENT'], fade: ['Nightfall'], gekko: ['Thrash'],
  killjoy: ['Nanoswarm'], cypher: ['Trapwire'], sage: ['Slow Orb'],
  chamber: ['Tour De Force', 'Headhunter'], deadlock: ['Annihilation'],
  viper: ['Snake Bite'], vyse: ['Arc Rose'],
};

function getNextBuyState(prev: BuyState, won: boolean, isHalfStart: boolean): BuyState {
  if (isHalfStart) return 'pistol';
  if (prev === 'pistol') return won ? 'half' : (Math.random() < 0.6 ? 'force' : 'save');
  if (prev === 'save') return 'full';
  if (prev === 'force') return won ? 'full' : 'eco';
  if (won) return 'full';
  switch (prev) {
    case 'full': return 'half';
    case 'half': return 'eco';
    case 'eco': return 'full';
    default: return 'full';
  }
}

function assignSyntheticWeapon(rng: RNG, buyState: BuyState, agent: string): string {
  if (buyState === 'pistol') {
    const pool = ['Classic', 'Classic', 'Ghost', 'Ghost', 'Ghost', 'Sheriff'];
    return pool[randomInt(rng, 0, pool.length - 1)];
  }
  if (buyState === 'save') {
    const pool = ['Classic', 'Ghost', 'Ghost', 'Sheriff', 'Sheriff', 'Sheriff', 'Bucky'];
    return pool[randomInt(rng, 0, pool.length - 1)];
  }
  if (buyState === 'eco') {
    const pool = ['Sheriff', 'Marshal', 'Spectre', 'Stinger'];
    return pool[randomInt(rng, 0, pool.length - 1)];
  }
  if (buyState === 'force') {
    const pool = ['Spectre', 'Spectre', 'Spectre', 'Marshal', 'Stinger', 'Sheriff'];
    return pool[randomInt(rng, 0, pool.length - 1)];
  }
  if (buyState === 'half') {
    const pool = ['Spectre', 'Spectre', 'Bulldog', 'Marshal', 'Guardian', 'Spectre'];
    return pool[randomInt(rng, 0, pool.length - 1)];
  }
  // full buy — Op restricted to Op agents
  const isOpAgent = OP_AGENTS.has(agent.toLowerCase());
  if (isOpAgent) {
    const roll = rng();
    if (roll < 0.25) return 'Operator';
    if (roll < 0.60) return 'Vandal';
    return 'Phantom';
  }
  const roll = rng();
  if (roll < 0.45) return 'Vandal';
  if (roll < 0.88) return 'Phantom';
  return 'Odin';
}

const WEAPON_TIER: Record<string, number> = {
  'Classic': 1, 'Shorty': 1, 'Frenzy': 2, 'Ghost': 2,
  'Sheriff': 3, 'Stinger': 3, 'Spectre': 4, 'Bucky': 4,
  'Marshal': 5, 'Bulldog': 5, 'Guardian': 5, 'Ares': 5, 'Odin': 6,
  'Vandal': 6, 'Phantom': 6, 'Operator': 7,
};

function pickWeapon(rng: RNG, assignedWeapon: string, agent: string): { weapon: string; isAbilityKill: boolean } {
  // use agentAbilities data — agents without entries get gun kills only
  const newAbilities = getAbilityNames(agent);
  if (newAbilities.length > 0) {
    if (rng() < 0.12) {
      return { weapon: newAbilities[randomInt(rng, 0, newAbilities.length - 1)], isAbilityKill: true };
    }
  }
  return { weapon: assignedWeapon, isAbilityKill: false };
}

function maybePickupWeapon(rng: RNG, killerWeapon: string, victimWeapon: string): string | null {
  const kTier = WEAPON_TIER[killerWeapon] ?? 4;
  const vTier = WEAPON_TIER[victimWeapon] ?? 4;
  const diff = vTier - kTier;
  if (diff <= 0) return null;
  const chance = diff >= 3 ? 0.95 : diff >= 2 ? 0.85 : 0.50;
  return rng() < chance ? victimWeapon : null;
}

function pickWinCondition(rng: RNG, attackersWon: boolean, winnersAlive: number, losersAlive: number): RoundWinCondition {
  if (attackersWon) {
    if (losersAlive === 0) {
      return rng() < (winnersAlive <= 2 ? 0.5 : 0.3) ? 'spike_detonation' : 'elimination';
    }
    return 'spike_detonation';
  }
  // defenders won
  if (losersAlive === 0) {
    // wiped attackers — retake defuse possible
    return rng() < (winnersAlive <= 2 ? 0.55 : 0.35) ? 'spike_defused' : 'elimination';
  }
  // attackers still alive → NOT elimination
  if (winnersAlive <= 2 && losersAlive === 1) {
    // close clutch — higher chance spike was planted and defused
    return rng() < 0.40 ? 'spike_defused' : 'time_expired';
  }
  // comfortable hold — attackers likely never planted
  return rng() < 0.20 ? 'spike_defused' : 'time_expired';
}

// PlayerMapStats doesn't have `name` — resolve from external map
function getNameFromId(playerId: string, nameMap: Record<string, string>): string {
  return nameMap[playerId] || playerId;
}

/**
 * Generate synthetic round logs from a known map result.
 * Produces plausible round-by-round events that match the final scoreline and roughly
 * distribute kills among players based on their known stats.
 */
export function generateSyntheticRoundLogs(
  homeTeamId: string,
  awayTeamId: string,
  homeRounds: number,
  awayRounds: number,
  homePlayerStats: PlayerMapStats[],
  awayPlayerStats: PlayerMapStats[],
  matchSeed: string,
  mapIndex: number,
  playerNames: Record<string, string> // playerId → display name
): RoundLog[] {
  const rng = createRNG(`${matchSeed}-synthetic-pbp-${mapIndex}`);
  const totalRounds = homeRounds + awayRounds;
  const logs: RoundLog[] = [];

  // Pre-plan which team wins each round to match final score
  const roundWinners: ('home' | 'away')[] = [];
  let hLeft = homeRounds;
  let aLeft = awayRounds;
  
  for (let r = 0; r < totalRounds; r++) {
    const remaining = hLeft + aLeft;
    if (hLeft === 0) { roundWinners.push('away'); aLeft--; continue; }
    if (aLeft === 0) { roundWinners.push('home'); hLeft--; continue; }
    // Weighted random assignment
    if (rng() < hLeft / remaining) { roundWinners.push('home'); hLeft--; }
    else { roundWinners.push('away'); aLeft--; }
  }

  // Build kill budgets per player from their actual stats
  const homeKillBudget = homePlayerStats.map(p => ({ ...p, killsLeft: p.kills, deathsLeft: p.deaths, fkLeft: p.firstKills, fdLeft: p.firstDeaths }));
  const awayKillBudget = awayPlayerStats.map(p => ({ ...p, killsLeft: p.kills, deathsLeft: p.deaths, fkLeft: p.firstKills, fdLeft: p.firstDeaths }));

  let homeBuyState: BuyState = 'pistol';
  let awayBuyState: BuyState = 'pistol';
  let homeScore = 0;
  let awayScore = 0;

  // Coin flip: which team starts on attack (first half)
  const homeStartsAttacking = rng() < 0.5;

  for (let r = 0; r < totalRounds; r++) {
    const roundNumber = r + 1;
    const isHalf = roundNumber === 13;
    const isOT = roundNumber > 24;
    const isOTPistol = isOT && (roundNumber - 25) % 2 === 0;

    if (roundNumber === 1 || isHalf || isOTPistol) {
      homeBuyState = 'pistol';
      awayBuyState = 'pistol';
    }

    const homeWon = roundWinners[r] === 'home';
    if (homeWon) homeScore++; else awayScore++;

    // Determine which team is attacking this round
    let attackersAreHome: boolean;
    if (roundNumber <= 12) {
      attackersAreHome = homeStartsAttacking;
    } else if (roundNumber <= 24) {
      attackersAreHome = !homeStartsAttacking;
    } else {
      const otRound = roundNumber - 25;
      const otPair = Math.floor(otRound / 2);
      attackersAreHome = otPair % 2 === 0 ? homeStartsAttacking : !homeStartsAttacking;
    }
    const attackersWon = attackersAreHome ? homeWon : !homeWon;

    // Generate kills for this round (4-8 kills typical)
    const killCount = Math.min(10, 4 + randomInt(rng, 0, 4));
    const winnersAlive = Math.max(1, 5 - randomInt(rng, 0, Math.min(3, killCount)));
    const losersAlive = Math.max(0, 5 - killCount + (5 - winnersAlive));
    const kills: KillEvent[] = [];
    let killNum = 0;
    const playerRoundKills: Record<string, number> = {};

    // Winning team gets ~60% of kills, losing team ~40%
    const winnerPool = homeWon ? homeKillBudget : awayKillBudget;
    const loserPool = homeWon ? awayKillBudget : homeKillBudget;
    const winnerTeamId = homeWon ? homeTeamId : awayTeamId;
    const loserTeamId = homeWon ? awayTeamId : homeTeamId;
    const winnerBuy = homeWon ? homeBuyState : awayBuyState;
    const loserBuy = homeWon ? awayBuyState : homeBuyState;

    // assign weapon per player for the round
    const playerWeapons: Record<string, string> = {};
    for (const p of winnerPool) playerWeapons[p.playerId] = assignSyntheticWeapon(rng, winnerBuy, p.agent);
    for (const p of loserPool) playerWeapons[p.playerId] = assignSyntheticWeapon(rng, loserBuy, p.agent);

    for (let k = 0; k < killCount; k++) {
      // Alternate: ~60% winner kills, ~40% loser kills
      const winnerKills = rng() < 0.6;
      const killerPool = winnerKills ? winnerPool : loserPool;
      const victimPool = winnerKills ? loserPool : winnerPool;
      const killerTeamId = winnerKills ? winnerTeamId : loserTeamId;
      const victimTeamId = winnerKills ? loserTeamId : winnerTeamId;

      // Pick killer weighted by remaining kills
      const availableKillers = killerPool.filter(p => p.killsLeft > 0);
      if (availableKillers.length === 0) continue;
      const totalKillsLeft = availableKillers.reduce((s, p) => s + p.killsLeft, 0);
      let roll = rng() * totalKillsLeft;
      let killer = availableKillers[0];
      for (const p of availableKillers) {
        roll -= p.killsLeft;
        if (roll <= 0) { killer = p; break; }
      }

      // Pick victim weighted by remaining deaths
      const availableVictims = victimPool.filter(p => p.deathsLeft > 0);
      if (availableVictims.length === 0) continue;
      const totalDeathsLeft = availableVictims.reduce((s, p) => s + p.deathsLeft, 0);
      roll = rng() * totalDeathsLeft;
      let victim = availableVictims[0];
      for (const p of availableVictims) {
        roll -= p.deathsLeft;
        if (roll <= 0) { victim = p; break; }
      }

      killer.killsLeft--;
      victim.deathsLeft--;
      killNum++;

      const isFirstBlood = killNum === 1;
      if (isFirstBlood) {
        if (killer.fkLeft > 0) killer.fkLeft--;
        if (victim.fdLeft > 0) victim.fdLeft--;
      }

      playerRoundKills[killer.playerId] = (playerRoundKills[killer.playerId] || 0) + 1;

      const killerGun = playerWeapons[killer.playerId] || 'Vandal';
      // pick a plausible victim weapon from their team's buy state
      const victimBuy = winnerKills ? loserBuy : winnerBuy;
      const victimGun = playerWeapons[victim.playerId] || assignSyntheticWeapon(rng, victimBuy, victim.agent);

      const { weapon, isAbilityKill } = pickWeapon(rng, killerGun, killer.agent);
      const isHeadshot = !isAbilityKill && rng() < (HEADSHOT_CHANCE[weapon] ?? 0.25);
      const isWallbang = !isAbilityKill && rng() < (WALLBANG_CHANCE[weapon] ?? 0.05);

      // pickup: killer grabs victim's gun if it's a tier upgrade
      const pickup = maybePickupWeapon(rng, killerGun, victimGun);
      if (pickup) playerWeapons[killer.playerId] = pickup;

      kills.push({
        type: 'kill',
        killerPlayerId: killer.playerId,
        killerName: getNameFromId(killer.playerId, playerNames),
        killerAgent: killer.agent,
        killerTeamId,
        victimPlayerId: victim.playerId,
        victimName: getNameFromId(victim.playerId, playerNames),
        victimAgent: victim.agent,
        victimTeamId,
        weapon,
        isFirstBlood,
        isAbilityKill,
        isHeadshot,
        isWallbang,
        killNumber: killNum,
        killerRoundKills: playerRoundKills[killer.playerId],
      });
    }

    // Post-process: reorder kills to create trade sequences
    // If player A kills player B, then later player C kills player A, move C's kill right after A's
    for (let i = 0; i < kills.length - 1; i++) {
      const kill = kills[i];
      // Look ahead for a trade (someone killing this kill's killer)
      for (let j = i + 2; j < kills.length && j <= i + 3; j++) {
        if (kills[j].victimPlayerId === kill.killerPlayerId && kills[j].killerTeamId === kill.victimTeamId) {
          // Move trade kill right after the original
          const [tradeKill] = kills.splice(j, 1);
          kills.splice(i + 1, 0, tradeKill);
          break;
        }
      }
    }
    // Reassign kill numbers after reordering
    for (let i = 0; i < kills.length; i++) kills[i].killNumber = i + 1;

    const winCondition = pickWinCondition(rng, attackersWon, winnersAlive, losersAlive);

    // Detect clutch situations by simulating alive counts through kills
    let clutch: RoundLog['clutch'];
    {
      let homeAliveCount = 5, awayAliveCount = 5;
      let clutchSit: { playerId: string; playerName: string; playerAgent: string; teamId: string; opponents: number } | null = null;
      for (const kill of kills) {
        if (kill.victimTeamId === homeTeamId) homeAliveCount--;
        else awayAliveCount--;
        if (!clutchSit) {
          if (homeAliveCount === 1 && awayAliveCount >= 1) {
            const solo = kills.find(k => k.killerTeamId === homeTeamId && kills.indexOf(k) >= kills.indexOf(kill));
            if (solo) clutchSit = { playerId: solo.killerPlayerId, playerName: solo.killerName, playerAgent: solo.killerAgent, teamId: homeTeamId, opponents: awayAliveCount };
          } else if (awayAliveCount === 1 && homeAliveCount >= 1) {
            const solo = kills.find(k => k.killerTeamId === awayTeamId && kills.indexOf(k) >= kills.indexOf(kill));
            if (solo) clutchSit = { playerId: solo.killerPlayerId, playerName: solo.killerName, playerAgent: solo.killerAgent, teamId: awayTeamId, opponents: homeAliveCount };
          }
        }
      }
      if (clutchSit && clutchSit.teamId === winnerTeamId) clutch = clutchSit;
    }

    logs.push({
      roundNumber,
      homeBuyState,
      awayBuyState,
      attackingTeamId: attackersAreHome ? homeTeamId : awayTeamId,
      winnerTeamId,
      winCondition,
      homeAlive: homeWon ? winnersAlive : 0,
      awayAlive: homeWon ? 0 : winnersAlive,
      kills,
      isHalfTime: isHalf,
      isOvertime: isOT,
      homeRoundScore: homeScore,
      awayRoundScore: awayScore,
      clutch,
    });

    // Advance buy states
    const nextIsHalf = roundNumber + 1 === 13;
    const nextIsOTPistol = roundNumber + 1 > 24 && (roundNumber + 1 - 25) % 2 === 0;
    if (nextIsHalf || nextIsOTPistol) {
      homeBuyState = 'pistol';
      awayBuyState = 'pistol';
    } else {
      homeBuyState = getNextBuyState(homeBuyState, homeWon, false);
      awayBuyState = getNextBuyState(awayBuyState, !homeWon, false);
    }
  }

  return logs;
}
