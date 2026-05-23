// src/sim/seasonAwards.ts
// computes end-of-season awards and builds the history entry

import type { MatchResult, PlayerMapStats, Region, SeasonHistoryEntry } from '../types';
import type { PlayerAward, PlayerAwardType, Role } from '../types/player';
import type { GameState } from './gameState';

const MIN_MAPS = 8;
const MIN_MAPS_ROOKIE = 6;
const ROLES: Role[] = ['duelist', 'controller', 'initiator', 'sentinel'];

// per-player aggregated stats across a full season
interface PlayerSeasonAgg {
  playerId: string;
  playerName: string;
  teamId: string;
  role: Role;
  yearsInLeague: number;
  mapsPlayed: number;
  totalKills: number;
  totalDeaths: number;
  totalACS: number;
  totalFirstKills: number;
  matchMVPs: number;
  clutchKingAwards: number;
  avgACS: number;
  kdRatio: number;
  fkPerMap: number;
  mvpScore: number;
}

// gather every match result from all brackets + international
function gatherAllResults(state: GameState): MatchResult[] {
  const results: MatchResult[] = [];

  for (const region of ['americas', 'emea', 'pacific', 'china'] as Region[]) {
    const bracket = state.kickoffBrackets?.[region];
    if (!bracket) continue;
    for (const section of ['upper', 'middle', 'lower'] as const) {
      for (const round of bracket[section] || []) {
        for (const matchup of round.matchups) {
          for (const mr of matchup.matchResults) results.push(mr);
        }
      }
    }
  }

  const intl = state.internationalTournament;
  if (intl?.bracket) {
    const b = intl.bracket;
    for (const round of b.swiss?.rounds || []) {
      for (const matchup of round.matchups) {
        for (const mr of matchup.matchResults) results.push(mr);
      }
    }
    for (const section of ['upper', 'lower'] as const) {
      for (const round of b[section] || []) {
        for (const matchup of round.matchups) {
          for (const mr of matchup.matchResults) results.push(mr);
        }
      }
    }
  }

  return results;
}

// aggregate per-player stats from all match results
function aggregatePlayerStats(results: MatchResult[], state: GameState): Map<string, PlayerSeasonAgg> {
  const agg = new Map<string, PlayerSeasonAgg>();

  const ensurePlayer = (playerId: string, teamId: string): PlayerSeasonAgg | null => {
    if (agg.has(playerId)) return agg.get(playerId)!;

    // find player on a team or free agents
    let player = state.teams.flatMap(t => t.roster).find(p => p.id === playerId);
    if (!player) player = state.freeAgents?.find(p => p.id === playerId);
    if (!player) return null;

    const entry: PlayerSeasonAgg = {
      playerId,
      playerName: player.name,
      teamId,
      role: player.role,
      yearsInLeague: player.yearsInLeague,
      mapsPlayed: 0,
      totalKills: 0,
      totalDeaths: 0,
      totalACS: 0,
      totalFirstKills: 0,
      matchMVPs: 0,
      clutchKingAwards: 0,
      avgACS: 0,
      kdRatio: 0,
      fkPerMap: 0,
      mvpScore: 0,
    };
    agg.set(playerId, entry);
    return entry;
  };

  const processMapStats = (stats: PlayerMapStats[] | undefined, teamId: string) => {
    if (!stats) return;
    for (const ps of stats) {
      const entry = ensurePlayer(ps.playerId, teamId);
      if (!entry) continue;
      entry.mapsPlayed++;
      entry.totalKills += ps.kills;
      entry.totalDeaths += ps.deaths;
      entry.totalACS += ps.acs;
      entry.totalFirstKills += ps.firstKills;
    }
  };

  for (const mr of results) {
    for (const map of mr.mapScores) {
      processMapStats(map.homePlayerStats, mr.homeTeamId);
      processMapStats(map.awayPlayerStats, mr.awayTeamId);
    }

    // tally match-level awards
    if (mr.awards) {
      for (const award of mr.awards) {
        const entry = ensurePlayer(award.playerId, award.teamId);
        if (!entry) continue;
        if (award.type === 'mvp') entry.matchMVPs++;
        if (award.type === 'clutch_king') entry.clutchKingAwards++;
      }
    }
  }

  // compute derived stats
  for (const entry of agg.values()) {
    if (entry.mapsPlayed > 0) {
      entry.avgACS = entry.totalACS / entry.mapsPlayed;
      entry.fkPerMap = entry.totalFirstKills / entry.mapsPlayed;
    }
    entry.kdRatio = entry.totalDeaths > 0 ? entry.totalKills / entry.totalDeaths : entry.totalKills;
    // mvpScore = (avgACS * 0.50) + (matchMVPs * 15 * 0.25) + (kdRatio * 100 * 0.25)
    entry.mvpScore = (entry.avgACS * 0.50) + (entry.matchMVPs * 15 * 0.25) + (entry.kdRatio * 100 * 0.25);
  }

  return agg;
}

// find finals MVP from the grand final series
function computeFinalsMvp(state: GameState): SeasonHistoryEntry['finalsMvp'] {
  const intl = state.internationalTournament;
  if (!intl?.bracket?.champion) return null;

  // grand final is upper[3] (GF round)
  const gf = intl.bracket.upper?.[3]?.matchups?.[0];
  if (!gf?.matchResults?.length) return null;

  // aggregate ACS across all maps in the GF series
  const playerACS = new Map<string, { total: number; maps: number; teamId: string; name: string }>();

  for (const mr of gf.matchResults) {
    const processSide = (stats: PlayerMapStats[] | undefined, teamId: string) => {
      if (!stats) return;
      for (const ps of stats) {
        const existing = playerACS.get(ps.playerId) || { total: 0, maps: 0, teamId, name: '' };
        existing.total += ps.acs;
        existing.maps++;
        existing.teamId = teamId;
        // resolve name
        const player = state.teams.flatMap(t => t.roster).find(p => p.id === ps.playerId);
        if (player) existing.name = player.name;
        playerACS.set(ps.playerId, existing);
      }
    };
    processSide(mr.mapScores.flatMap(m => m.homePlayerStats || []), mr.homeTeamId);
    processSide(mr.mapScores.flatMap(m => m.awayPlayerStats || []), mr.awayTeamId);
  }

  // pick highest avg ACS on the winning team only
  const championId = intl.bracket.champion;
  let best: { playerId: string; avgACS: number; teamId: string; name: string } | null = null;
  for (const [playerId, data] of playerACS) {
    if (data.teamId !== championId) continue;
    const avg = data.maps > 0 ? data.total / data.maps : 0;
    if (!best || avg > best.avgACS) {
      best = { playerId, avgACS: avg, teamId: data.teamId, name: data.name };
    }
  }

  return best ? { playerId: best.playerId, playerName: best.name, teamId: best.teamId, avgACS: Math.round(best.avgACS) } : null;
}

// determine runner-up from grand final
function getRunnerUp(state: GameState): string | null {
  const intl = state.internationalTournament;
  if (!intl?.bracket?.champion) return null;

  const gf = intl.bracket.upper?.[3]?.matchups?.[0];
  if (!gf?.winnerId) return null;

  return gf.team1Id === gf.winnerId ? gf.team2Id : gf.team1Id;
}

// get kickoff winners per region (upper final winner = seed 1 qualifier)
function getKickoffWinners(state: GameState): Record<Region, string | null> {
  const winners: Record<Region, string | null> = { americas: null, emea: null, pacific: null, china: null };
  for (const region of ['americas', 'emea', 'pacific', 'china'] as Region[]) {
    const bracket = state.kickoffBrackets?.[region];
    if (!bracket) continue;
    const seed1 = bracket.qualifiers.find(q => q.seed === 1);
    winners[region] = seed1?.teamId ?? null;
  }
  return winners;
}

// select all-vct teams: best per role + flex for each team tier
function selectAllVctTeams(agg: Map<string, PlayerSeasonAgg>) {
  const qualified = Array.from(agg.values()).filter(p => p.mapsPlayed >= MIN_MAPS);
  const sorted = [...qualified].sort((a, b) => b.mvpScore - a.mvpScore);

  const used = new Set<string>();
  const pickTeam = (): Array<{ playerId: string; playerName: string; teamId: string; role: string; avgACS: number; score: number }> => {
    const team: typeof pickTeam extends () => infer R ? R : never = [];

    // pick best per role
    for (const role of ROLES) {
      const pick = sorted.find(p => p.role === role && !used.has(p.playerId));
      if (pick) {
        team.push({
          playerId: pick.playerId,
          playerName: pick.playerName,
          teamId: pick.teamId,
          role: pick.role,
          avgACS: Math.round(pick.avgACS),
          score: Math.round(pick.mvpScore * 10) / 10,
        });
        used.add(pick.playerId);
      }
    }

    // flex slot: best remaining regardless of role
    const flex = sorted.find(p => !used.has(p.playerId));
    if (flex) {
      team.push({
        playerId: flex.playerId,
        playerName: flex.playerName,
        teamId: flex.teamId,
        role: flex.role,
        avgACS: Math.round(flex.avgACS),
        score: Math.round(flex.mvpScore * 10) / 10,
      });
      used.add(flex.playerId);
    }

    return team;
  };

  const first = pickTeam();
  const second = pickTeam();
  return { first, second };
}

// build the full season history entry and assign awards to players
/** Compute event-level awards from international tournament results only */
function computeTournamentAwards(state: GameState): {
  acsLeader: SeasonHistoryEntry['tournamentAcsLeader'];
  kdLeader: SeasonHistoryEntry['tournamentKdLeader'];
} {
  const intl = state.internationalTournament;
  if (!intl?.bracket) return { acsLeader: null, kdLeader: null };

  // gather only international results
  const results: MatchResult[] = [];
  const b = intl.bracket;
  for (const round of b.swiss?.rounds || []) {
    for (const matchup of round.matchups) {
      for (const mr of matchup.matchResults) results.push(mr);
    }
  }
  for (const section of ['upper', 'lower'] as const) {
    for (const round of b[section] || []) {
      for (const matchup of round.matchups) {
        for (const mr of matchup.matchResults) results.push(mr);
      }
    }
  }

  if (!results.length) return { acsLeader: null, kdLeader: null };

  // aggregate per-player tournament stats
  const stats = new Map<string, { kills: number; deaths: number; totalACS: number; maps: number; teamId: string; name: string }>();
  const MIN_TOURNAMENT_MAPS = 3;

  for (const mr of results) {
    const processSide = (mapStats: typeof mr.mapScores[0]['homePlayerStats'], teamId: string) => {
      if (!mapStats) return;
      for (const ps of mapStats) {
        const existing = stats.get(ps.playerId) || { kills: 0, deaths: 0, totalACS: 0, maps: 0, teamId, name: '' };
        existing.kills += ps.kills;
        existing.deaths += ps.deaths;
        existing.totalACS += ps.acs;
        existing.maps++;
        existing.teamId = teamId;
        const player = state.teams.flatMap(t => t.roster).find(p => p.id === ps.playerId);
        if (player) existing.name = player.name;
        stats.set(ps.playerId, existing);
      }
    };
    for (const map of mr.mapScores) {
      processSide(map.homePlayerStats, mr.homeTeamId);
      processSide(map.awayPlayerStats, mr.awayTeamId);
    }
  }

  // filter by minimum maps
  const qualified = Array.from(stats.entries()).filter(([, s]) => s.maps >= MIN_TOURNAMENT_MAPS);

  // ACS leader
  let acsLeader: SeasonHistoryEntry['tournamentAcsLeader'] = null;
  let bestACS = 0;
  for (const [playerId, s] of qualified) {
    const avg = s.totalACS / s.maps;
    if (avg > bestACS) {
      bestACS = avg;
      acsLeader = { playerId, playerName: s.name, teamId: s.teamId, avgACS: Math.round(avg) };
    }
  }

  // K/D leader
  let kdLeader: SeasonHistoryEntry['tournamentKdLeader'] = null;
  let bestKD = 0;
  for (const [playerId, s] of qualified) {
    const kd = s.deaths > 0 ? s.kills / s.deaths : s.kills;
    if (kd > bestKD) {
      bestKD = kd;
      kdLeader = { playerId, playerName: s.name, teamId: s.teamId, kd: Math.round(kd * 100) / 100 };
    }
  }

  return { acsLeader, kdLeader };
}

export function computeSeasonHistory(state: GameState): SeasonHistoryEntry {
  const results = gatherAllResults(state);
  const agg = aggregatePlayerStats(results, state);
  const qualified = Array.from(agg.values()).filter(p => p.mapsPlayed >= MIN_MAPS);

  // season mvp
  const mvpSorted = [...qualified].sort((a, b) => b.mvpScore - a.mvpScore);
  const mvpWinner = mvpSorted[0] ?? null;

  // rookie of the year
  // rising star: yearsInLeague <= 2 because progression already incremented by 1
  const rookies = Array.from(agg.values()).filter(p => p.yearsInLeague <= 2 && p.mapsPlayed >= MIN_MAPS_ROOKIE);
  const roySorted = [...rookies].sort((a, b) => b.mvpScore - a.mvpScore);
  const royWinner = roySorted[0] ?? null;

  // best in role (highest avg ACS per role)
  const bestInRole: Record<string, PlayerSeasonAgg | null> = {};
  for (const role of ROLES) {
    const rolePlayers = qualified.filter(p => p.role === role).sort((a, b) => b.avgACS - a.avgACS);
    bestInRole[role] = rolePlayers[0] ?? null;
  }

  // clutch king of the year
  const clutchSorted = Array.from(agg.values()).filter(p => p.clutchKingAwards > 0).sort((a, b) => b.clutchKingAwards - a.clutchKingAwards);
  const clutchWinner = clutchSorted[0] ?? null;

  // entry fragger of the year
  const entrySorted = qualified.filter(p => p.fkPerMap > 0).sort((a, b) => b.fkPerMap - a.fkPerMap);
  const entryWinner = entrySorted[0] ?? null;

  // finals mvp
  const finalsMvp = computeFinalsMvp(state);

  // all-vct teams
  const { first, second } = selectAllVctTeams(agg);

  const intl = state.internationalTournament;

  // compute event-level awards from international tournament only
  const tournamentAwards = computeTournamentAwards(state);

  // snapshot rosters for champion and runner-up
  const champTeam = intl?.champion ? state.teams.find(t => t.id === intl.champion) : null;
  const runnerUpId = getRunnerUp(state);
  const runnerUpTeam = runnerUpId ? state.teams.find(t => t.id === runnerUpId) : null;
  const snapshotRoster = (team: typeof champTeam) =>
    team?.roster.map(p => ({ playerId: p.id, playerName: p.name, nationality: p.nationality, isIGL: p.id === team.iglId || undefined })) ?? [];

  const entry: SeasonHistoryEntry = {
    year: state.currentYear,
    worldChampionId: intl?.champion ?? null,
    runnerUpId,
    championRoster: champTeam ? snapshotRoster(champTeam) : undefined,
    runnerUpRoster: runnerUpTeam ? snapshotRoster(runnerUpTeam) : undefined,
    finalsMvp,
    seasonMvp: mvpWinner ? { playerId: mvpWinner.playerId, playerName: mvpWinner.playerName, teamId: mvpWinner.teamId, score: Math.round(mvpWinner.mvpScore * 10) / 10 } : null,
    rookieOfYear: royWinner ? { playerId: royWinner.playerId, playerName: royWinner.playerName, teamId: royWinner.teamId, score: Math.round(royWinner.mvpScore * 10) / 10 } : null,
    kickoffWinners: getKickoffWinners(state),
    allVctFirst: first,
    allVctSecond: second,
    clutchKing: clutchWinner ? { playerId: clutchWinner.playerId, playerName: clutchWinner.playerName, teamId: clutchWinner.teamId, count: clutchWinner.clutchKingAwards } : null,
    entryFragger: entryWinner ? { playerId: entryWinner.playerId, playerName: entryWinner.playerName, teamId: entryWinner.teamId, fkPerMap: Math.round(entryWinner.fkPerMap * 10) / 10 } : null,
    bestDuelist: bestInRole.duelist ? { playerId: bestInRole.duelist.playerId, playerName: bestInRole.duelist.playerName, teamId: bestInRole.duelist.teamId } : null,
    bestController: bestInRole.controller ? { playerId: bestInRole.controller.playerId, playerName: bestInRole.controller.playerName, teamId: bestInRole.controller.teamId } : null,
    bestInitiator: bestInRole.initiator ? { playerId: bestInRole.initiator.playerId, playerName: bestInRole.initiator.playerName, teamId: bestInRole.initiator.teamId } : null,
    bestSentinel: bestInRole.sentinel ? { playerId: bestInRole.sentinel.playerId, playerName: bestInRole.sentinel.playerName, teamId: bestInRole.sentinel.teamId } : null,
    tournamentAcsLeader: tournamentAwards.acsLeader,
    tournamentKdLeader: tournamentAwards.kdLeader,
  };

  // assign awards to players
  assignPlayerAwards(state, entry);

  return entry;
}

// push awards onto player.awards[]
function assignPlayerAwards(state: GameState, entry: SeasonHistoryEntry) {
  const year = entry.year;
  const allPlayers = state.teams.flatMap(t => t.roster);

  const give = (playerId: string, type: PlayerAwardType, detail?: string) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;
    if (!player.awards) player.awards = [];
    player.awards.push({ type, year, detail });
  };

  // world champion — entire roster
  if (entry.worldChampionId) {
    const team = state.teams.find(t => t.id === entry.worldChampionId);
    if (team) {
      for (const p of team.roster) give(p.id, 'world_champion');
    }
  }

  // kickoff champions — entire roster per region
  for (const region of ['americas', 'emea', 'pacific', 'china'] as Region[]) {
    const teamId = entry.kickoffWinners[region];
    if (!teamId) continue;
    const team = state.teams.find(t => t.id === teamId);
    if (team) {
      for (const p of team.roster) give(p.id, 'kickoff_champion', region);
    }
  }

  // individual awards
  if (entry.finalsMvp) give(entry.finalsMvp.playerId, 'finals_mvp');
  if (entry.seasonMvp) give(entry.seasonMvp.playerId, 'season_mvp');
  if (entry.rookieOfYear) give(entry.rookieOfYear.playerId, 'rookie_of_year');
  if (entry.bestDuelist) give(entry.bestDuelist.playerId, 'best_duelist');
  if (entry.bestController) give(entry.bestController.playerId, 'best_controller');
  if (entry.bestInitiator) give(entry.bestInitiator.playerId, 'best_initiator');
  if (entry.bestSentinel) give(entry.bestSentinel.playerId, 'best_sentinel');
  if (entry.clutchKing) give(entry.clutchKing.playerId, 'clutch_king');
  if (entry.entryFragger) give(entry.entryFragger.playerId, 'entry_fragger');

  for (const p of entry.allVctFirst) give(p.playerId, 'all_vct_first');
  for (const p of entry.allVctSecond) give(p.playerId, 'all_vct_second');
}
