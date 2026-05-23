// src/sim/tournamentStats.ts
// aggregates stats across all matches in a tournament for leaderboards + narratives

import type { MatchResult } from '../types';
import type { Region } from '../types/team';
import type { KickoffBracket } from './kickoffBracket';
import type { StagePlayoffBracket } from './stagePlayoffs';

export interface TournamentPlayerStat {
  playerId: string;
  playerName: string;
  teamId: string;
  nationality?: string;
  imageUrl?: string;
  role?: string;
  age?: number;
  teamSeed?: number;
  mapsPlayed: number;
  kills: number;
  deaths: number;
  assists: number;
  avgAcs: number;
  kd: number;
  fkPerMap: number;
  clutches: number;
  hsPct: number;
}

export interface TournamentNarrative {
  label: string;
  text: string;
  player: TournamentPlayerStat | null;
  highlightValue: string; // the key stat to render in accent color
}

export interface TournamentStats {
  players: TournamentPlayerStat[];
  narratives: TournamentNarrative[];
  mapsPlayed: number;
  matchesPlayed: number;
}

type Agg = {
  name: string; teamId: string;
  nationality?: string; imageUrl?: string; role?: string; age?: number;
  kills: number; deaths: number; assists: number;
  acsSum: number; maps: number;
  firstKills: number; clutches: number;
  hsKills: number; gunKills: number;
};

export function computeTournamentStats(
  matches: MatchResult[],
  playerNames: Record<string, string>,
  teamNames: Record<string, string>,
  playerMeta?: Record<string, { nationality?: string; imageUrl?: string; role?: string; age?: number }>,
  teamSeedMap?: Map<string, number>,
): TournamentStats {
  const agg = new Map<string, Agg>();

  // build player lookup for nationality/imageUrl
  const playerLookup = new Map<string, { nationality?: string; imageUrl?: string }>();
  // teams aren't passed in — we'll hydrate from matches below

  const ensure = (id: string, name: string, teamId: string): Agg => {
    if (!agg.has(id)) agg.set(id, { name, teamId, kills: 0, deaths: 0, assists: 0, acsSum: 0, maps: 0, firstKills: 0, clutches: 0, hsKills: 0, gunKills: 0, nationality: playerMeta?.[id]?.nationality, imageUrl: playerMeta?.[id]?.imageUrl, role: playerMeta?.[id]?.role, age: playerMeta?.[id]?.age });
    return agg.get(id)!;
  };

  let mapsPlayed = 0;
  const completed = matches.filter(m => m.mapScores?.length > 0);

  for (const match of completed) {
    for (const ms of match.mapScores) {
      mapsPlayed++;

      for (const s of (ms.homePlayerStats ?? [])) {
        const p = ensure(s.playerId, playerNames[s.playerId] ?? s.playerId, match.homeTeamId);
        p.kills += s.kills; p.deaths += s.deaths; p.assists += s.assists;
        p.acsSum += s.acs; p.maps++; p.firstKills += s.firstKills;
      }
      for (const s of (ms.awayPlayerStats ?? [])) {
        const p = ensure(s.playerId, playerNames[s.playerId] ?? s.playerId, match.awayTeamId);
        p.kills += s.kills; p.deaths += s.deaths; p.assists += s.assists;
        p.acsSum += s.acs; p.maps++; p.firstKills += s.firstKills;
      }

      // round logs for clutches + HS% (not always present)
      for (const round of (ms.roundLogs ?? [])) {
        if (round.clutch) {
          const c = ensure(round.clutch.playerId, round.clutch.playerName, round.clutch.teamId);
          c.clutches++;
        }
        for (const k of round.kills) {
          const p = ensure(k.killerPlayerId, k.killerName, k.killerTeamId);
          if (!k.isAbilityKill) {
            p.gunKills++;
            if (k.isHeadshot) p.hsKills++;
          }
        }
      }
    }
  }

  const players: TournamentPlayerStat[] = [...agg.entries()]
    .filter(([, p]) => p.maps >= 1)
    .map(([id, p]) => ({
      playerId: id,
      playerName: p.name,
      teamId: p.teamId,
      nationality: playerMeta?.[id]?.nationality,
      imageUrl: playerMeta?.[id]?.imageUrl,
      role: playerMeta?.[id]?.role,
      age: playerMeta?.[id]?.age,
      teamSeed: teamSeedMap?.get(p.teamId),
      mapsPlayed: p.maps,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      avgAcs: p.maps > 0 ? Math.round(p.acsSum / p.maps) : 0,
      kd: p.deaths > 0 ? Math.round((p.kills / p.deaths) * 100) / 100 : p.kills,
      fkPerMap: p.maps > 0 ? Math.round((p.firstKills / p.maps) * 10) / 10 : 0,
      clutches: p.clutches,
      hsPct: p.gunKills >= 10 ? Math.round((p.hsKills / p.gunKills) * 100) : 0,
    }))
    .sort((a, b) => b.avgAcs - a.avgAcs);

  const narratives = buildNarratives(players, teamNames);

  return { players, narratives, mapsPlayed, matchesPlayed: completed.length };
}

function buildNarratives(players: TournamentPlayerStat[], teamNames: Record<string, string>): TournamentNarrative[] {
  const narratives: TournamentNarrative[] = [];
  const qualified = players.filter(p => p.mapsPlayed >= 2);
  if (qualified.length === 0) return narratives;

  const push = (label: string, text: string, player: TournamentPlayerStat | null, highlightValue = '') =>
    narratives.push({ label, text, player, highlightValue });

  const acsLeader = [...qualified].sort((a, b) => b.avgAcs - a.avgAcs)[0];
  if (acsLeader)
    push('ACS', `${acsLeader.playerName} is leading the tournament in ACS — ${acsLeader.avgAcs} average across ${acsLeader.mapsPlayed} maps.`, acsLeader, String(acsLeader.avgAcs));

  // k/d — always show even if same player leads acs, different stat tells a different story
  const kdLeader = [...qualified].filter(p => p.deaths > 0).sort((a, b) => b.kd - a.kd)[0];
  if (kdLeader)
    push('K/D', `${kdLeader.playerName} has the best K/D in the tournament at ${kdLeader.kd.toFixed(2)}.`, kdLeader, kdLeader.kd.toFixed(2));

  const clutchLeader = [...qualified].sort((a, b) => b.clutches - a.clutches)[0];
  if (clutchLeader?.clutches >= 2)
    push('Clutch', `${clutchLeader.playerName} has been ice cold — ${clutchLeader.clutches} clutches so far.`, clutchLeader, String(clutchLeader.clutches));

  const fkLeader = [...qualified].sort((a, b) => b.fkPerMap - a.fkPerMap)[0];
  if (fkLeader?.fkPerMap >= 1.5)
    push('Entry', `${fkLeader.playerName} is the most aggressive entry — ${fkLeader.fkPerMap} first kills per map.`, fkLeader, String(fkLeader.fkPerMap));

  const hsLeader = [...qualified].filter(p => p.hsPct > 0).sort((a, b) => b.hsPct - a.hsPct)[0];
  if (hsLeader)
    push('HS%', `${hsLeader.playerName} is clicking heads at ${hsLeader.hsPct}% — nobody is aiming higher.`, hsLeader, `${hsLeader.hsPct}%`);

  // kills — always show, raw kill volume is its own story even if it overlaps with acs
  const topKiller = [...qualified].filter(p => p.kd >= 1.0).sort((a, b) => b.kills - a.kills)[0];
  if (topKiller)
    push('Kills', `${topKiller.playerName} leads all players with ${topKiller.kills} total kills at a ${topKiller.kd.toFixed(2)} K/D.`, topKiller, String(topKiller.kills));

  return narratives;
}

// ── regional context for international tournament ──

export interface RegionalStat extends TournamentPlayerStat {
  region: Region;
}

export interface PlayerToWatch {
  player: RegionalStat;
  reason: string;
  statLabel: string;
  statValue: string;
  seed: number | null;
}

export interface RegionalVsIntlStat {
  playerId: string;
  playerName: string;
  teamId: string;
  nationality?: string;
  imageUrl?: string;
  role?: string;
  region: Region;
  regionalAcs: number;
  intlAcs: number;
  regionalKd: number;
  intlKd: number;
  acsDelta: number;
  kdDelta: number;
  verdict: 'fell_off' | 'stepped_up' | 'consistent' | 'surprise';
}

// aggregate stats from stage groups + playoffs (used as regional context for stage internationals)
export function computeStageRegionalStats(
  stageGroupStages: Record<string, { [k: number]: any } | null>,
  stagePlayoffBrackets: Record<string, { [k: number]: StagePlayoffBracket | undefined } | null>,
  stageNum: 1 | 2,
  playerNames: Record<string, string>,
  teamNames: Record<string, string>,
  playerMeta?: Record<string, { nationality?: string; imageUrl?: string; role?: string; age?: number }>,
): RegionalStat[] {
  const allStats: RegionalStat[] = [];

  for (const region of Object.keys(stageGroupStages)) {
    const matches: MatchResult[] = [];

    // group stage matches
    const gs = stageGroupStages[region]?.[stageNum];
    if (gs?.groups) {
      for (const group of gs.groups)
        for (const m of group.schedule)
          if (m.played && m.result) matches.push(m.result);
    }

    // playoff matches
    const bracket = stagePlayoffBrackets[region]?.[stageNum];
    if (bracket) {
      for (const rounds of [bracket.upper, bracket.lower])
        for (const round of rounds)
          for (const m of round.matchups) matches.push(...(m.matchResults ?? []));
    }

    if (matches.length === 0) continue;
    const base = computeTournamentStats(matches, playerNames, teamNames, playerMeta);
    for (const p of base.players) {
      allStats.push({ ...p, region: region as Region });
    }
  }

  return allStats;
}

// aggregate stats from all regional brackets
export function computeRegionalStats(
  kickoffBrackets: Record<string, KickoffBracket | null>,
  playerNames: Record<string, string>,
  teamNames: Record<string, string>,
  playerMeta?: Record<string, { nationality?: string; imageUrl?: string; role?: string; age?: number }>,
  teamSeedMap?: Map<string, number>,
): RegionalStat[] {
  const allStats: RegionalStat[] = [];

  for (const [region, bracket] of Object.entries(kickoffBrackets)) {
    if (!bracket) continue;
    const matches = [];
    for (const section of [bracket.upper, bracket.middle, bracket.lower])
      for (const round of section)
        for (const m of round.matchups) matches.push(...(m.matchResults ?? []));

    const base = computeTournamentStats(matches, playerNames, teamNames, playerMeta);
    for (const p of base.players) {
      allStats.push({ ...p, region: region as Region });
    }
  }

  return allStats;
}

// top players to watch entering internationals — based purely on regional performance
export function computePlayersToWatch(
  regionalStats: RegionalStat[],
  intlTeamIds: Set<string>,
  teamSeeds: Map<string, number> = new Map(),
  count = 6,
): PlayerToWatch[] {
  const qualified = regionalStats.filter(p => intlTeamIds.has(p.teamId) && p.mapsPlayed >= 2);
  if (qualified.length === 0) return [];

  const seen = new Set<string>();
  const picks: PlayerToWatch[] = [];

  const push = (p: RegionalStat, statLabel: string, statValue: string, reason: string) => {
    seen.add(p.playerId);
    picks.push({ player: p, reason, statLabel, statValue, seed: teamSeeds.get(p.teamId) ?? null });
  };

  // 1. ACS — pure output anchor
  const acsLeader = [...qualified].sort((a, b) => b.avgAcs - a.avgAcs).find(p => !seen.has(p.playerId));
  if (acsLeader)
    push(acsLeader, 'ACS', String(acsLeader.avgAcs),
      `Averaged ${acsLeader.avgAcs} ACS across ${acsLeader.mapsPlayed} maps — the highest output player entering the tournament.`);

  // 2. K/D — duel efficiency, distinct from raw output
  const kdLeader = [...qualified].filter(p => !seen.has(p.playerId) && p.deaths > 0)
    .sort((a, b) => b.kd - a.kd)[0];
  if (kdLeader)
    push(kdLeader, 'K/D', kdLeader.kd.toFixed(2),
      `${kdLeader.kd.toFixed(2)} K/D across ${kdLeader.mapsPlayed} maps — wins duels and stays alive, the hardest combination to stop.`);

  // 3. First kills/map — aggression and entry impact
  const fkLeader = [...qualified].filter(p => !seen.has(p.playerId) && p.fkPerMap >= 1.5)
    .sort((a, b) => b.fkPerMap - a.fkPerMap)[0];
  if (fkLeader)
    push(fkLeader, 'FK / Map', fkLeader.fkPerMap.toFixed(1),
      `${fkLeader.fkPerMap} first kills per map in regionals — opens rounds aggressively and sets the tempo for their team.`);

  // 4. HS% — mechanical purity, wins duels on aim alone
  const hsLeader = [...qualified].filter(p => !seen.has(p.playerId) && p.hsPct >= 25)
    .sort((a, b) => b.hsPct - a.hsPct)[0];
  if (hsLeader)
    push(hsLeader, 'HS%', `${hsLeader.hsPct}%`,
      `${hsLeader.hsPct}% headshot rate in regionals — pure mechanical aim that doesn't care who's on the other side.`);

  // 5. Clutches — composure under pressure
  const clutchLeader = [...qualified].filter(p => !seen.has(p.playerId) && p.clutches >= 2)
    .sort((a, b) => b.clutches - a.clutches)[0];
  if (clutchLeader)
    push(clutchLeader, 'Clutches', String(clutchLeader.clutches),
      `${clutchLeader.clutches} clutch rounds in regionals — proven composure when the round is on the line.`);

  // 6. Most maps played — endurance, deep regional run
  const grinder = [...qualified].filter(p => !seen.has(p.playerId))
    .sort((a, b) => b.mapsPlayed - a.mapsPlayed)[0];
  if (grinder)
    push(grinder, 'Maps', String(grinder.mapsPlayed),
      `Played ${grinder.mapsPlayed} maps in regionals — more tournament experience than almost anyone heading in.`);

  return picks.slice(0, count);
}

// compare regional vs international performance for players who qualified
export function computeRegionalVsIntl(
  regionalStats: RegionalStat[],
  intlStats: TournamentPlayerStat[],
): RegionalVsIntlStat[] {
  const intlMap = new Map(intlStats.map(p => [p.playerId, p]));
  const results: RegionalVsIntlStat[] = [];

  for (const r of regionalStats) {
    const i = intlMap.get(r.playerId);
    if (!i || i.mapsPlayed < 2) continue;

    const acsDelta = i.avgAcs - r.avgAcs;
    const kdDelta = i.kd - r.kd;

    let verdict: RegionalVsIntlStat['verdict'];
    if (acsDelta <= -20 && i.kd < r.kd - 0.1) verdict = 'fell_off';
    else if (acsDelta >= 15 && i.kd > r.kd + 0.05) verdict = 'stepped_up';
    else if (r.avgAcs < 190 && i.avgAcs >= 195) verdict = 'surprise';
    else verdict = 'consistent';

    results.push({
      playerId: r.playerId,
      playerName: r.playerName,
      teamId: r.teamId,
      nationality: r.nationality,
      imageUrl: r.imageUrl,
      role: r.role,
      region: r.region,
      regionalAcs: r.avgAcs,
      intlAcs: i.avgAcs,
      regionalKd: r.kd,
      intlKd: i.kd,
      acsDelta,
      kdDelta,
      verdict,
    });
  }

  // show all interesting verdicts — sort by verdict priority then delta size
  const verdictOrder: Record<string, number> = { stepped_up: 0, surprise: 1, fell_off: 2, consistent: 3 };
  return results
    .filter(r => r.verdict !== 'consistent' || Math.abs(r.acsDelta) >= 15)
    .sort((a, b) => (verdictOrder[a.verdict] - verdictOrder[b.verdict]) || Math.abs(b.acsDelta) - Math.abs(a.acsDelta))
    .slice(0, 10);
}
