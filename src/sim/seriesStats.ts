// src/sim/seriesStats.ts
// derives storyline nuggets from round log kill events across one or more matches

import type { MatchResult, KillEvent } from '../types';

export interface KryptoniteStat {
  killerId: string;
  killerName: string;
  killerTeamId: string;
  victimId: string;
  victimName: string;
  victimTeamId: string;
  kills: number;
  reverse: number;
}

export interface FirstBloodStat {
  playerId: string;
  playerName: string;
  teamId: string;
  count: number;
}

export interface ClutchStat {
  playerId: string;
  playerName: string;
  teamId: string;
  agent: string;
  count: number;
  best: number;
}

export interface DuelStat {
  p1Id: string;
  p1Name: string;
  p1TeamId: string;
  p1Kills: number;
  p2Id: string;
  p2Name: string;
  p2TeamId: string;
  p2Kills: number;
}

export interface HeadshotStat {
  playerId: string;
  playerName: string;
  teamId: string;
  pct: number;
  kills: number;
}

export interface SacrificeStat {
  playerId: string;
  playerName: string;
  teamId: string;
  firstDeaths: number;
  won: boolean;
}

export interface StarFloppedStat {
  playerId: string;
  playerName: string;
  teamId: string;
  ovr: number;
  kd: number;
  deaths: number;
}

export interface LockedInStat {
  playerId: string;
  playerName: string;
  teamId: string;
  kills: number;
  acs: number;
}

export interface MapCarryStat {
  playerId: string;
  playerName: string;
  teamId: string;
  acs: number;
  mapName: string;
  agent: string;
}

export interface DemonStat {
  playerId: string;
  playerName: string;
  teamId: string;
  kills: number;
  mapName: string;
  agent: string;
}

export interface HardCarryStat {
  playerId: string;
  playerName: string;
  teamId: string;
  mapsTopFragged: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgAcs: number;
  avgKd: number;
  mapLines: { map: string; agent: string; kills: number; deaths: number; assists: number; acs: number }[];
}

export interface KeyboardUnpluggedStat {
  playerId: string;
  playerName: string;
  teamId: string;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  mapName: string;
  agent: string;
}

export interface TideTurnerStat {
  playerId: string;
  playerName: string;
  teamId: string;
  clutches: number;  // clutches in the comeback maps
}

export interface SeriesStorylines {
  kryptonite: KryptoniteStat | null;
  firstBloods: FirstBloodStat[];
  clutches: ClutchStat[];
  topDuel: DuelStat | null;
  hsLeader: HeadshotStat | null;
  sacrifice: SacrificeStat | null;
  starFlopped: StarFloppedStat | null;
  lockedIn: LockedInStat | null;
  mapCarry: MapCarryStat | null;
  demon: DemonStat | null;
  hardCarry: HardCarryStat | null;
  tideTurner: TideTurnerStat | null;
  keyboardUnplugged: KeyboardUnpluggedStat | null;
  roundsAnalyzed: number;
  playerAgents: Record<string, string>;
}

export function computeSeriesStorylines(
  matches: MatchResult[],
  playerNames: Record<string, string>,
  playerTeams: Record<string, string>,
  playerOvr: Record<string, number> = {},
): SeriesStorylines {
  const kills: KillEvent[] = [];
  const clutchMap = new Map<string, { name: string; teamId: string; agent: string; count: number; best: number }>();
  let roundsAnalyzed = 0;

  // agent counts: playerId -> { agentName -> mapsPlayed }
  const agentCounts = new Map<string, Map<string, number>>();
  const trackAgent = (playerId: string, agent: string) => {
    if (!agent) return;
    const m = agentCounts.get(playerId) ?? new Map<string, number>();
    m.set(agent, (m.get(agent) ?? 0) + 1);
    agentCounts.set(playerId, m);
  };

  // first bloods from PlayerMapStats — always available even without round logs
  const fbFromStats = new Map<string, { name: string; teamId: string; count: number }>();

  // per-player series aggregates for new storylines
  type SeriesAgg = { name: string; teamId: string; kills: number; deaths: number; firstDeaths: number; acsSum: number; maps: number; won: boolean };
  const seriesAgg = new Map<string, SeriesAgg>();

  // map carry: best ACS by a player on a map their team lost (min 200 ACS)
  type MapCarryCandidate = { playerId: string; playerName: string; teamId: string; acs: number; mapName: string; agent: string };
  let bestMapCarry: MapCarryCandidate | null = null;

  // demon: highest single-map kill count (min 30)
  type DemonCandidate = { playerId: string; playerName: string; teamId: string; kills: number; mapName: string; agent: string };
  let bestDemon: DemonCandidate | null = null;

  // hard carry: track how many maps each player top-fragged and their kill totals
  const topFragMaps = new Map<string, { name: string; teamId: string; count: number; totalKills: number; totalDeaths: number; totalAssists: number; acsSum: number; mapsPlayed: number; maps: { map: string; agent: string; kills: number; deaths: number; assists: number; acs: number }[] }>();

  // keyboard unplugged: worst single-map performance (lowest KD, min 5 deaths, < 0.5 KD)
  type KeyboardCandidate = { playerId: string; playerName: string; teamId: string; kills: number; deaths: number; assists: number; acs: number; mapName: string; agent: string; kd: number };
  let worstMap: KeyboardCandidate | null = null;

  // tide turner: per-map running series score for reverse sweep detection
  type MapScore = { homeScore: number; awayScore: number; homeTeamId: string; awayTeamId: string; mapIndex: number };
  const mapSeriesScores: MapScore[] = [];

  for (const match of matches) {
    const homeWon = match.homeScore > match.awayScore;
    for (const ms of match.mapScores) {
      const homeWonMap = ms.homeRounds > ms.awayRounds;
      // pull stats from PlayerMapStats (always present) — accumulate series aggregates
      // also find per-map top fragger for hard carry
      let mapTopKills = 0;
      const mapPlayers: { id: string; name: string; teamId: string; kills: number; deaths: number; assists: number; acs: number; agent: string }[] = [];

      for (const s of (ms.homePlayerStats ?? [])) {
        trackAgent(s.playerId, s.agent);
        const name = playerNames[s.playerId] ?? s.playerId;
        const agg = seriesAgg.get(s.playerId) ?? { name, teamId: match.homeTeamId, kills: 0, deaths: 0, firstDeaths: 0, acsSum: 0, maps: 0, won: homeWon };
        agg.kills += s.kills; agg.deaths += s.deaths; agg.firstDeaths += s.firstDeaths; agg.acsSum += s.acs; agg.maps++;
        seriesAgg.set(s.playerId, agg);
        mapPlayers.push({ id: s.playerId, name, teamId: match.homeTeamId, kills: s.kills, deaths: s.deaths, assists: s.assists, acs: s.acs, agent: s.agent });
        if (s.kills > mapTopKills) mapTopKills = s.kills;
        if (s.kills >= 30 && (!bestDemon || s.kills > bestDemon.kills))
          bestDemon = { playerId: s.playerId, playerName: name, teamId: match.homeTeamId, kills: s.kills, mapName: ms.map, agent: s.agent };
        if (homeWonMap && homeWon && s.acs >= 200 && (!bestMapCarry || s.acs > bestMapCarry.acs))
          bestMapCarry = { playerId: s.playerId, playerName: name, teamId: match.homeTeamId, acs: s.acs, mapName: ms.map, agent: s.agent };
        { const kd = s.deaths > 0 ? s.kills / s.deaths : s.kills; if (s.deaths >= 5 && kd < 0.5 && (!worstMap || kd < worstMap.kd)) worstMap = { playerId: s.playerId, playerName: name, teamId: match.homeTeamId, kills: s.kills, deaths: s.deaths, assists: s.assists, acs: s.acs, mapName: ms.map, agent: s.agent, kd }; }
        if (s.firstKills) {
          const fb = fbFromStats.get(s.playerId) ?? { name, teamId: match.homeTeamId, count: 0 };
          fb.count += s.firstKills;
          fbFromStats.set(s.playerId, fb);
        }
      }
      for (const s of (ms.awayPlayerStats ?? [])) {
        trackAgent(s.playerId, s.agent);
        const name = playerNames[s.playerId] ?? s.playerId;
        const agg = seriesAgg.get(s.playerId) ?? { name, teamId: match.awayTeamId, kills: 0, deaths: 0, firstDeaths: 0, acsSum: 0, maps: 0, won: !homeWon };
        agg.kills += s.kills; agg.deaths += s.deaths; agg.firstDeaths += s.firstDeaths; agg.acsSum += s.acs; agg.maps++;
        seriesAgg.set(s.playerId, agg);
        mapPlayers.push({ id: s.playerId, name, teamId: match.awayTeamId, kills: s.kills, deaths: s.deaths, assists: s.assists, acs: s.acs, agent: s.agent });
        if (s.kills > mapTopKills) mapTopKills = s.kills;
        if (s.kills >= 30 && (!bestDemon || s.kills > bestDemon.kills))
          bestDemon = { playerId: s.playerId, playerName: name, teamId: match.awayTeamId, kills: s.kills, mapName: ms.map, agent: s.agent };
        if (!homeWonMap && !homeWon && s.acs >= 200 && (!bestMapCarry || s.acs > bestMapCarry.acs))
          bestMapCarry = { playerId: s.playerId, playerName: name, teamId: match.awayTeamId, acs: s.acs, mapName: ms.map, agent: s.agent };
        { const kd = s.deaths > 0 ? s.kills / s.deaths : s.kills; if (s.deaths >= 5 && kd < 0.5 && (!worstMap || kd < worstMap.kd)) worstMap = { playerId: s.playerId, playerName: name, teamId: match.awayTeamId, kills: s.kills, deaths: s.deaths, assists: s.assists, acs: s.acs, mapName: ms.map, agent: s.agent, kd }; }
        if (s.firstKills) {
          const fb = fbFromStats.get(s.playerId) ?? { name, teamId: match.awayTeamId, count: 0 };
          fb.count += s.firstKills;
          fbFromStats.set(s.playerId, fb);
        }
      }

      // hard carry: credit top-fragger(s) for this map
      for (const p of mapPlayers) {
        const entry = topFragMaps.get(p.id) ?? { name: p.name, teamId: p.teamId, count: 0, totalKills: 0, totalDeaths: 0, totalAssists: 0, acsSum: 0, mapsPlayed: 0, maps: [] };
        entry.mapsPlayed++;
        entry.totalKills += p.kills;
        entry.totalDeaths += p.deaths;
        entry.totalAssists += p.assists ?? 0;
        entry.acsSum += p.acs ?? 0;
        entry.maps.push({ map: ms.map, agent: p.agent, kills: p.kills, deaths: p.deaths, assists: p.assists ?? 0, acs: p.acs ?? 0 });
        if (p.kills === mapTopKills && mapTopKills > 0) entry.count++;
        topFragMaps.set(p.id, entry);
      }

      // tide turner: record running series score after this map
      const prev = mapSeriesScores[mapSeriesScores.length - 1];
      mapSeriesScores.push({
        homeScore: (prev?.homeScore ?? 0) + (homeWonMap ? 1 : 0),
        awayScore: (prev?.awayScore ?? 0) + (homeWonMap ? 0 : 1),
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        mapIndex: mapSeriesScores.length,
      });

      if (!ms.roundLogs?.length) continue;
      for (const round of ms.roundLogs) {
        roundsAnalyzed++;
        kills.push(...round.kills);
        if (round.clutch) {
          const c = round.clutch;
          const entry = clutchMap.get(c.playerId) ?? { name: c.playerName, teamId: c.teamId, agent: c.playerAgent, count: 0, best: 0 };
          entry.count++;
          if (c.opponents > entry.best) entry.best = c.opponents;
          clutchMap.set(c.playerId, entry);
        }
      }
    }
  }

  // first bloods: top 1 per team
  const fbByTeam = new Map<string, FirstBloodStat>();
  for (const [id, fb] of fbFromStats) {
    const prev = fbByTeam.get(fb.teamId);
    if (!prev || fb.count > prev.count)
      fbByTeam.set(fb.teamId, { playerId: id, playerName: fb.name, teamId: fb.teamId, count: fb.count });
  }
  const firstBloods = [...fbByTeam.values()].filter(f => f.count > 0);

  const clutches = [...clutchMap.entries()]
    .map(([id, c]) => ({ playerId: id, playerName: c.name, teamId: c.teamId, agent: c.agent, count: c.count, best: c.best }))
    .sort((a, b) => b.count - a.count || b.best - a.best)
    .slice(0, 3);

  // most-used agent per player across all maps
  const playerAgents: Record<string, string> = {};
  for (const [playerId, counts] of agentCounts) {
    let best = '', bestCount = 0;
    for (const [agent, count] of counts) {
      if (count > bestCount) { best = agent; bestCount = count; }
    }
    if (best) playerAgents[playerId] = best;
  }

  // "unsung hero" / "sometimes we just have to relax" — most first deaths, threshold scales with format
  const format = matches[0]?.format ?? 'bo3';
  const sacrificeMin = format === 'bo5' ? 15 : format === 'bo3' ? 10 : 4;
  let sacrifice: SacrificeStat | null = null;
  let maxFd = sacrificeMin - 1;
  for (const [id, agg] of seriesAgg) {
    if (agg.firstDeaths <= maxFd) continue;
    maxFd = agg.firstDeaths;
    sacrifice = { playerId: id, playerName: agg.name, teamId: agg.teamId, firstDeaths: agg.firstDeaths, won: agg.won };
  }

  // "star didn't show up" — highest OVR (90+, raw pre-bonus) player with kd < 0.85 across min 2 maps
  let starFlopped: StarFloppedStat | null = null;
  let maxOvr = 0;
  for (const [id, agg] of seriesAgg) {
    const ovr = playerOvr[id] ?? 0;
    if (ovr < 90 || agg.maps < 1) continue;
    const kd = agg.deaths > 0 ? agg.kills / agg.deaths : agg.kills;
    if (kd >= 0.85 || ovr <= maxOvr) continue;
    maxOvr = ovr;
    starFlopped = { playerId: id, playerName: agg.name, teamId: agg.teamId, ovr, kd: Math.round(kd * 100) / 100, deaths: agg.deaths };
  }

  // "locked in" — highest kills on winning side with positive KD, min 2 maps
  let lockedIn: LockedInStat | null = null;
  let maxKillsWon = 0;
  for (const [id, agg] of seriesAgg) {
    if (!agg.won || agg.maps < 1) continue;
    const kd = agg.deaths > 0 ? agg.kills / agg.deaths : agg.kills;
    if (kd < 1.0 || agg.kills <= maxKillsWon) continue;
    maxKillsWon = agg.kills;
    lockedIn = { playerId: id, playerName: agg.name, teamId: agg.teamId, kills: agg.kills, acs: Math.round(agg.acsSum / agg.maps) };
  }

  // demon: highest single-map kills (min 30)
  const demon: DemonStat | null = bestDemon ?? null;

  // hard carry: top-fragged every map they played (min 2 maps), prefer most maps then most kills
  let hardCarry: HardCarryStat | null = null;
  for (const [id, tf] of topFragMaps) {
    if (tf.mapsPlayed < 2 || tf.count < tf.mapsPlayed) continue; // must top-frag ALL maps they played
    const avgKills = Math.round(tf.totalKills / tf.mapsPlayed);
    const avgDeaths = Math.round(tf.totalDeaths / tf.mapsPlayed);
    const avgAssists = Math.round(tf.totalAssists / tf.mapsPlayed);
    const avgAcs = Math.round(tf.acsSum / tf.mapsPlayed);
    const avgKd = tf.totalDeaths > 0 ? Math.round((tf.totalKills / tf.totalDeaths) * 100) / 100 : tf.totalKills;
    if (!hardCarry || tf.mapsPlayed > hardCarry.mapsTopFragged || (tf.mapsPlayed === hardCarry.mapsTopFragged && avgKills > hardCarry.avgKills))
      hardCarry = { playerId: id, playerName: tf.name, teamId: tf.teamId, mapsTopFragged: tf.count, avgKills, avgDeaths, avgAssists, avgAcs, avgKd, mapLines: tf.maps };
  }

  // tide turner: detect reverse sweep (down 0-2, won 3-2) then find player with most clutches in comeback maps 3/4/5
  // requires round logs — computed after the early return gate
  let tideTurner: TideTurnerStat | null = null;
  let comebackMapIndices: number[] = [];
  if (mapSeriesScores.length === 5) {
    // check the loser was 0-2 after map 2
    const after2 = mapSeriesScores[1];
    const final = mapSeriesScores[4];
    const comebackTeamIsHome = after2.homeScore === 0 && after2.awayScore === 2 && final.homeScore === 3;
    const comebackTeamIsAway = after2.awayScore === 0 && after2.homeScore === 2 && final.awayScore === 3;
    if (comebackTeamIsHome || comebackTeamIsAway) {
      comebackMapIndices = [2, 3, 4]; // 0-indexed maps 3, 4, 5
    }
  }

  const mapCarry: MapCarryStat | null = bestMapCarry;

  if (!kills.length) return { kryptonite: null, firstBloods, clutches, topDuel: null, hsLeader: null, sacrifice, starFlopped, lockedIn, mapCarry, demon, hardCarry, tideTurner, roundsAnalyzed, playerAgents };

  const pairKills = new Map<string, number>();
  const hsMap = new Map<string, { name: string; teamId: string; hs: number; total: number }>();

  for (const k of kills) {
    pairKills.set(`${k.killerPlayerId}:${k.victimPlayerId}`, (pairKills.get(`${k.killerPlayerId}:${k.victimPlayerId}`) ?? 0) + 1);
    const hs = hsMap.get(k.killerPlayerId) ?? { name: k.killerName, teamId: k.killerTeamId, hs: 0, total: 0 };
    hs.total++;
    if (k.isHeadshot) hs.hs++;
    hsMap.set(k.killerPlayerId, hs);
  }

  let kryptonite: KryptoniteStat | null = null;
  let maxDominance = 0; // kills - reverse, must be >= 2:1 ratio with min 5 kills
  for (const [key, count] of pairKills) {
    const [killerId, victimId] = key.split(':');
    const kt = playerTeams[killerId] ?? kills.find(k => k.killerPlayerId === killerId)?.killerTeamId;
    const vt = playerTeams[victimId] ?? kills.find(k => k.victimPlayerId === victimId)?.victimTeamId;
    if (!kt || !vt || kt === vt) continue;
    const reverse = pairKills.get(`${victimId}:${killerId}`) ?? 0;
    // kryptonite: needs high volume AND clear dominance (at least 2:1 ratio)
    if (count < 5) continue;
    if (count < reverse * 2) continue;
    const dominance = count - reverse;
    if (dominance > maxDominance) {
      maxDominance = dominance;
      kryptonite = {
        killerId,
        killerName: playerNames[killerId] ?? kills.find(k => k.killerPlayerId === killerId)?.killerName ?? killerId,
        killerTeamId: kt,
        victimId,
        victimName: playerNames[victimId] ?? kills.find(k => k.victimPlayerId === victimId)?.victimName ?? victimId,
        victimTeamId: vt,
        kills: count,
        reverse,
      };
    }
  }

  // heated rivalry: high combined kills AND close ratio (neither side more than 1.5x the other)
  let topDuel: DuelStat | null = null;
  let maxDuelTotal = 7; // min combined 8 kills
  const seen = new Set<string>();
  for (const [key, count] of pairKills) {
    const [p1, p2] = key.split(':');
    const pairKey = [p1, p2].sort().join(':');
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    const t1 = playerTeams[p1] ?? kills.find(k => k.killerPlayerId === p1)?.killerTeamId;
    const t2 = playerTeams[p2] ?? kills.find(k => k.killerPlayerId === p2)?.killerTeamId;
    if (!t1 || !t2 || t1 === t2) continue;
    const reverse = pairKills.get(`${p2}:${p1}`) ?? 0;
    const total = count + reverse;
    // heated rivalry: high volume, close ratio (neither side more than 1.5x the other)
    const hi = Math.max(count, reverse), lo = Math.min(count, reverse);
    if (lo === 0 || hi / lo > 1.5) continue;
    if (total > maxDuelTotal) {
      maxDuelTotal = total;
      topDuel = {
        p1Id: p1,
        p1Name: playerNames[p1] ?? kills.find(k => k.killerPlayerId === p1)?.killerName ?? p1,
        p1TeamId: t1, p1Kills: count,
        p2Id: p2,
        p2Name: playerNames[p2] ?? kills.find(k => k.killerPlayerId === p2)?.killerName ?? p2,
        p2TeamId: t2, p2Kills: reverse,
      };
    }
  }

  let hsLeader: HeadshotStat | null = null;
  let maxHsPct = 0;
  for (const [id, hs] of hsMap) {
    if (hs.total < 5) continue;
    const pct = Math.round((hs.hs / hs.total) * 100);
    if (pct > maxHsPct) {
      maxHsPct = pct;
      hsLeader = { playerId: id, playerName: hs.name, teamId: hs.teamId, pct, kills: hs.total };
    }
  }

  // tide turner: clutches in comeback maps (round-log-derived)
  if (comebackMapIndices.length > 0) {
    const comebackClutches = new Map<string, { name: string; teamId: string; count: number }>();
    for (const match of matches) {
      const after2 = mapSeriesScores[1];
      const comebackTeamId = (after2?.homeScore === 0) ? match.homeTeamId : match.awayTeamId;
      for (const mapIdx of comebackMapIndices) {
        const ms = match.mapScores[mapIdx];
        if (!ms?.roundLogs) continue;
        for (const round of ms.roundLogs) {
          if (!round.clutch || round.clutch.teamId !== comebackTeamId) continue;
          const c = round.clutch;
          const entry = comebackClutches.get(c.playerId) ?? { name: c.playerName, teamId: c.teamId, count: 0 };
          entry.count++;
          comebackClutches.set(c.playerId, entry);
        }
      }
    }
    let maxComebackClutches = 1; // min 2 to qualify
    for (const [id, c] of comebackClutches) {
      if (c.count > maxComebackClutches) {
        maxComebackClutches = c.count;
        tideTurner = { playerId: id, playerName: c.name, teamId: c.teamId, clutches: c.count };
      }
    }
  }

  const keyboardUnplugged = worstMap ? { playerId: worstMap.playerId, playerName: worstMap.playerName, teamId: worstMap.teamId, kills: worstMap.kills, deaths: worstMap.deaths, assists: worstMap.assists, acs: worstMap.acs, mapName: worstMap.mapName, agent: worstMap.agent } : null;
  return { kryptonite, firstBloods, clutches, topDuel, hsLeader, sacrifice, starFlopped, lockedIn, mapCarry, demon, hardCarry, tideTurner, keyboardUnplugged, roundsAnalyzed, playerAgents };
}
