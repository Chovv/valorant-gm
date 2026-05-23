// src/sim/gameState.ts
// core game state management with regional leagues and international competition

import type { Team, StandingsEntry, MatchResult, PlayoffBracket, PlayoffMatchup, PlayoffRound, Region, Player, SeasonHistoryEntry, TournamentType } from '../types';
import type { StaffMember } from '../types/team';
import type { Tier2Team } from '../types/scrims';
import { TIER2_TEAMS } from '../types/scrims';
import { createRNG, generateId, shuffle } from '../utils/random';
import { simulateMatch, MAPS } from './matchSim';
import { recordMatchStats } from './matchRecorder';
import { processProgression } from './progression';
import { runOffseasonChurn } from './offseasonChurn';
import { type VCTRecordBook, getDefaultRecordBook, checkMapRecords, checkSeriesRecords } from './vctRecords';
import { generateAcademyRoster } from './scrims';
import { generateCoach, generateCoachPool } from './coachGenerator';
import {
  type KickoffBracket,
  BRACKET_ROUND_ORDER,
  seedRegion,
  generateKickoffBracket,
  advanceKickoffRound,
  isBigStageRound,
  getRoundName,
} from './kickoffBracket';
import { computeSeasonHistory } from './seasonAwards';
import { awardKickoffPoints, awardInternationalPoints, mergePoints } from './vctPoints';
import {
  type ChampionsBracket,
  CHAMPIONS_ROUND_ORDER,
  generateChampionsBracket,
  advanceSwissRound,
  advanceChampionsPlayoffRound,
  getAllChampionsMatchups,
  getChampionsRoundName,
} from './internationalBracket';
import {
  type GroupStage,
  type GroupMatch,
  generateGroupStage,
  updateGroupStandings,
  sortGroupStandings,
  isGroupStageComplete,
  getPlayoffQualifiers,
} from './stageGroupStage';
import {
  type StagePlayoffBracket,
  STAGE_PLAYOFF_ROUND_ORDER,
  generateStagePlayoffBracket,
  advanceStagePlayoffRound,
  getStagePlayoffRoundName,
  getStagePlayoffRound,
  isStepComplete,
} from './stagePlayoffs';

/**
 * Game phase
 */
export type GamePhase =
  | 'preseason'
  | 'kickoff_bracket'
  | 'international'
  | 'offseason'
  | 'stage1_groups'
  | 'stage1_playoffs'
  | 'mid_offseason'
  | 'stage2_groups'
  | 'stage2_playoffs';

/**
 * Scheduled match with status
 */
export interface ScheduledMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  format: 'bo1' | 'bo3' | 'bo5';
  day: number;
  played: boolean;
  result?: MatchResult;
  region: Region; // Track which region this match is for
}

/**
 * Playoff series state
 */
export interface PlayoffSeries {
  roundIndex: number;
  matchupIndex: number;
  completed: boolean;
}

/**
 * International tournament (Swiss + double-elim playoffs)
 */
export interface InternationalTournament {
  name: string;
  teams: Array<{ teamId: string; region: Region; seed: number }>;
  bracket: ChampionsBracket;
  champion: string | null;
}

/**
 * Core game state
 */
export interface GameState {
  // Time
  currentDay: number;
  currentYear: number;
  phase: GamePhase;
  currentTournamentType?: TournamentType; // what the current season's main event is (defaults to 'champions')

  // Teams
  teams: Team[];
  userTeamId: string | null;

  // Season data (kept for compatibility — empty during kickoff_bracket phase)
  schedule: ScheduledMatch[];
  standings: StandingsEntry[];
  
  // Kickoff bracket (triple-elim, one per region)
  kickoffBrackets: Record<Region, KickoffBracket | null>;
  currentBracketRound: number; // index into BRACKET_ROUND_ORDER

  // Legacy regional playoffs (kept for old saves)
  regionalPlayoffs: Record<Region, PlayoffBracket | null>;
  currentPlayoffSeries: PlayoffSeries | null;
  currentPlayoffRegion: Region | null;
  regionalChampions: Record<Region, string | null>;

  // International competition
  internationalTournament: InternationalTournament | null;
  internationalPlayoffSeries: PlayoffSeries | null;
  currentChampionsRound: number; // index into CHAMPIONS_ROUND_ORDER

  // History
  champions: Array<{ year: number; teamId: string; type: 'regional' | 'international'; region?: Region }>;
  seasonHistory: SeasonHistoryEntry[];

  // Free agency
  freeAgents?: Player[];
  freeAgentCoaches?: StaffMember[];

  // Scrims & Development
  fatigueLevel: number;
  lastScrimDay: number | null;
  seasonStartStats: Record<string, { overall: number; ratings: Record<string, number>; potential: { ceiling: number; floor: number } }>;
  customTier2Teams?: Record<Region, Array<{ id: string; name: string; abbreviation: string; region: Region; averageOVR: number }>>;

  // RNG
  seed: string;

  // News feed
  newsFeed: NewsItem[];
  lastSeenNewsCount: number;

  // VCT record book
  recordBook: VCTRecordBook;

  // Active map pool
  mapPool: string[];

  // Agent meta modifiers (agent name → buff/nerf, -50 to +50, default 0)
  agentMeta: Record<string, number>;

  // agents disabled from all sim selection (won't be picked by anyone)
  disabledAgents: string[];

  // user-created custom agents
  customAgents: { id: string; displayName: string; role: string; icon?: string }[];

  // per-agent role overrides (agent → roles[], overrides DEFAULT_AGENT_ROLES)
  agentRoleOverrides: Record<string, string[]>;

  // per-map agent meta: map → role → ordered list of preferred agents for AI teams
  mapMeta: Record<string, Partial<Record<string, string[]>>>;

  // per-team map comps: teamId → map → playerId → agent
  teamMapComps: Record<string, Record<string, Record<string, string>>>;

  // per-team penalty bypass: teamId → map → playerIds[] where role/pool penalty is suppressed
  teamMapCompNoPenalty: Record<string, Record<string, string[]>>;

  // per-team map-specific OVR buffs: teamId → map → playerId → ovr modifier (-15 to +15)
  teamMapCompBuffs: Record<string, Record<string, Record<string, number>>>;

  // global agent variance (0-100): chance a player deviates from their top priority agent
  agentVariance: number;

  // per-agent ability data override (optional — sim falls back to data/agentAbilities.ts defaults)
  agentAbilities?: Record<string, import('../data/agentAbilities').AgentAbility[]>;

  // match sim tunables (optional — sim falls back to defaults in data/matchSimConfig.ts)
  matchSimConfig?: import('../data/matchSimConfig').MatchSimConfig;

  // esports name pool: toggle + permanently consumed names
  useEsportsNames: boolean;
  usedNames: string[];

  // VCT championship points (teamId → cumulative points this year)
  vctPoints: Record<string, number>;

  // real-world event override — manually set which teams attend the international
  realEventConfig?: {
    enabled: boolean;
    eventName?: string; // e.g. "Masters Santiago 2026"
    slots: Array<{ teamId: string; seed: number }>;
    swissR1?: Array<[string, string]>; // 4 pairs of teamIds for Swiss Round 1
  };

  // offseason roster churn events (populated when next season starts)
  offseasonChurnEvents?: Array<{
    type: 'release' | 'signing';
    teamId: string;
    teamName: string;
    teamRegion: string;
    playerId: string;
    playerName: string;
    role: string;
    overall: number;
    playerAge?: number;
    source?: 'free_agent' | 'bench_promotion';
    reason?: string;
  }>;

  // configurable churn settings (editable in dev mode)
  churnConfig?: {
    releaseScoreCeiling: number;   // max player score that can be released (0-100)
    sameRegionWeight: number;      // signing weight multiplier for same-region players (0-1)
    crossRegionWeight: number;     // signing weight multiplier for cross-region players (0-1)
    tier1Quota: number;            // releases for decent-run teams (0-2)
    tier2Quota: number;            // releases for average teams (0-2)
    tier3Quota: number;            // releases for early-exit teams (0-2)
  };

  // Offseason progression results (populated when offseason begins)
  offseasonProgression?: Array<{
    playerId: string;
    playerName: string;
    teamId: string;
    teamAbbr: string;
    age: number;
    role: string;
    oldOverall: number;
    newOverall: number;
    change: number;
    ratingChanges: Record<string, number>;
    stage?: 'prospect' | 'developing' | 'prime' | 'veteran' | 'declining';
    oldStage?: 'prospect' | 'developing' | 'prime' | 'veteran' | 'declining';
  }>;

  // stage group stages (one per region, indexed by stage number 1 or 2)
  stageGroupStages: Record<Region, { 1?: GroupStage; 2?: GroupStage }>;

  // stage playoffs (one per region, indexed by stage number)
  stagePlayoffBrackets: Record<Region, { 1?: StagePlayoffBracket; 2?: StagePlayoffBracket }>;

  // current stage (1 or 2) — tracks which stage we're in
  currentStage: 1 | 2;

  // current step index within stage playoffs (index into STAGE_PLAYOFF_ROUND_ORDER)
  currentStagePlayoffRound: number;

  // which international is next: 'kickoff' | 'stage1' | 'stage2'
  // tracks the source of qualifiers for the upcoming international
  internationalSource?: 'kickoff' | 'stage1' | 'stage2';
}

export interface NewsItem {
  id: string;
  day: number;
  year: number;
  type: 'monster_map' | 'historic_map' | 'series_record' | 'record_broken';
  headline: string;
  body: string;
  playerId: string;
  teamId: string;
  region: Region;
  stat: { kills?: number; deaths?: number; kd?: number; acs?: number; firstKills?: number; totalKills?: number };
  // For record_broken type
  oldRecordHolder?: string;
  oldRecordValue?: number;
}

/**
 * Daily update result
 */
export interface DayResult {
  day: number;
  matchesPlayed: MatchResult[];
  phaseChange?: GamePhase;
  events: GameEvent[];
}

/**
 * Game events
 */
export interface GameEvent {
  type: 'match_result' | 'phase_change' | 'playoff_advance' | 'champion_crowned' | 'international_qualifier' | 'scrim_result';
  message: string;
  data?: unknown;
}

/**
 * Season configuration
 */
export interface SeasonConfig {
  year: number;
  gamesPerTeam: number; // legacy — unused in kickoff format
  playoffTeams: number;
  playoffFormat: 'bo3' | 'bo5';
  internationalQualifiers: number; // 3 per region (upper/middle/lower finals winners)
}

export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  year: 2025,
  gamesPerTeam: 11,
  playoffTeams: 12,
  playoffFormat: 'bo5',
  internationalQualifiers: 3,
};

const REGIONS: Region[] = ['americas', 'emea', 'pacific', 'china'];

/**
 * A matchup visible on the schedule / daily matchups page.
 * Extracted from whichever bracket phase is active.
 */
export interface TodayMatchup {
  matchupId: string;           // PlayoffMatchup.id — used to resolve in Step 2
  team1Id: string | null;      // null = TBD
  team2Id: string | null;      // null = TBD
  region: Region | 'international';
  roundName: string;
  format: 'bo1' | 'bo3' | 'bo5';
  played: boolean;
  winnerId: string | null;
  result: MatchResult | null;
}

/**
 * Get matchups for the current bracket round.
 */
export function getTodayMatchups(state: GameState): TodayMatchup[] {
  // stage phases have their own matchup getters
  if (state.phase === 'stage1_groups' || state.phase === 'stage2_groups') {
    return getStageGroupMatchups(state);
  }
  if (state.phase === 'stage1_playoffs' || state.phase === 'stage2_playoffs') {
    return getStagePlayoffMatchups(state);
  }
  return getRoundMatchups(state, getCurrentRoundIndex(state));
}

/**
 * Get the current round index (across kickoff + champions).
 * Kickoff rounds: 0..14, Champions rounds: 15..26
 * Stage phases return a sentinel so the timeline knows they exist.
 */
export function getCurrentRoundIndex(state: GameState): number {
  if (state.phase === 'preseason' || state.phase === 'kickoff_bracket') {
    return state.currentBracketRound;
  }
  if (state.phase === 'international') {
    return BRACKET_ROUND_ORDER.length + state.currentChampionsRound;
  }
  if (state.phase === 'stage1_groups' || state.phase === 'stage1_playoffs') {
    // after first international, before stage 1 completes
    return BRACKET_ROUND_ORDER.length + CHAMPIONS_ROUND_ORDER.length;
  }
  if (state.phase === 'stage2_groups' || state.phase === 'stage2_playoffs') {
    return BRACKET_ROUND_ORDER.length + CHAMPIONS_ROUND_ORDER.length + 1;
  }
  // offseason / mid_offseason — show last completed phase
  return BRACKET_ROUND_ORDER.length + CHAMPIONS_ROUND_ORDER.length - 1;
}

/**
 * Total number of rounds across the whole season.
 */
export function getTotalRounds(state: GameState): number {
  const hasChampions = state.phase === 'international' || state.phase === 'offseason' || state.phase === 'mid_offseason' || state.internationalTournament;
  let total = BRACKET_ROUND_ORDER.length + (hasChampions ? CHAMPIONS_ROUND_ORDER.length : 0);
  // add slots for stage phases if they've started
  if (state.stageGroupStages?.americas?.[1]) total += 1;
  if (state.stageGroupStages?.americas?.[2]) total += 1;
  return total;
}

/**
 * Get the round name for a given global round index.
 */
export function getRoundLabel(roundIdx: number): string {
  if (roundIdx < BRACKET_ROUND_ORDER.length) {
    return getRoundName(roundIdx);
  }
  const champIdx = roundIdx - BRACKET_ROUND_ORDER.length;
  if (champIdx < CHAMPIONS_ROUND_ORDER.length) {
    return getChampionsRoundName(champIdx);
  }
  return 'Unknown';
}

/**
 * Get the phase label for a given global round index or current phase.
 */
export function getPhaseLabel(roundIdx: number, state?: GameState): string {
  if (state) {
    if (state.phase === 'stage1_groups') return 'Stage 1 Groups';
    if (state.phase === 'stage1_playoffs') return 'Stage 1 Playoffs';
    if (state.phase === 'stage2_groups') return 'Stage 2 Groups';
    if (state.phase === 'stage2_playoffs') return 'Stage 2 Playoffs';
    if (state.phase === 'mid_offseason') return 'Transfer Window';
  }
  if (roundIdx < BRACKET_ROUND_ORDER.length) return 'VCT Kickoff';
  return 'VALORANT Champions';
}

/**
 * Get matchups for any round index (past, current, or future).
 * Future rounds may have TBD (null) team IDs.
 */
export function getRoundMatchups(state: GameState, roundIdx: number): TodayMatchup[] {
  const matchups: TodayMatchup[] = [];

  if (roundIdx < BRACKET_ROUND_ORDER.length) {
    // Kickoff round
    if (roundIdx >= BRACKET_ROUND_ORDER.length) return matchups;
    const step = BRACKET_ROUND_ORDER[roundIdx];
    const roundName = getRoundName(roundIdx);

    for (const region of REGIONS) {
      const bracket = state.kickoffBrackets[region];
      if (!bracket) continue;
      const section = bracket[step.section];
      if (!section || !section[step.roundIdx]) continue;
      const round = section[step.roundIdx];

      for (const m of round.matchups) {
        matchups.push({
          matchupId: m.id,
          team1Id: m.team1Id,
          team2Id: m.team2Id,
          region,
          roundName,
          format: m.format,
          played: !!m.winnerId,
          winnerId: m.winnerId,
          result: m.matchResults.length > 0 ? m.matchResults[m.matchResults.length - 1] : null,
        });
      }
    }
  } else if (state.internationalTournament) {
    // Champions round
    const champIdx = roundIdx - BRACKET_ROUND_ORDER.length;
    if (champIdx >= CHAMPIONS_ROUND_ORDER.length) return matchups;
    const champBracket = state.internationalTournament.bracket;
    const step = CHAMPIONS_ROUND_ORDER[champIdx];
    const roundName = getChampionsRoundName(champIdx);

    let round: PlayoffRound | undefined;
    if (step.phase === 'swiss') round = champBracket.swiss.rounds[step.roundIdx];
    else if (step.phase === 'upper') round = champBracket.upper[step.roundIdx];
    else round = champBracket.lower[step.roundIdx];

    if (!round) return matchups;

    for (const m of round.matchups) {
      matchups.push({
        matchupId: m.id,
        team1Id: m.team1Id,
        team2Id: m.team2Id,
        region: 'international',
        roundName,
        format: m.format,
        played: !!m.winnerId,
        winnerId: m.winnerId,
        result: m.matchResults.length > 0 ? m.matchResults[m.matchResults.length - 1] : null,
      });
    }
  }

  return matchups;
}

/**
 * Sync currentTournamentType from pre-planned history entries.
 * Finds the next unfilled entry for the current year and sets the type accordingly.
 */
function syncTournamentTypeFromHistory(state: GameState): void {
  if (!state.seasonHistory?.length) return;
  const year = state.currentYear;
  // get all entries for this year, sorted by sortIndex
  const yearEntries = state.seasonHistory
    .filter(h => h.year === year)
    .sort((a, b) => (a.sortIndex ?? 999) - (b.sortIndex ?? 999));
  if (!yearEntries.length) return;
  // find first entry that has no results yet (no champion)
  const next = yearEntries.find(h => !h.worldChampionId && !h.worldChampionCustom);
  if (next && next.tournamentType) {
    state.currentTournamentType = next.tournamentType;
  }
}

/**
 * Resolve a single bracket matchup by its PlayoffMatchup.id.
 * Records stats/news and auto-advances the bracket round when all matchups are done.
 * Returns the MatchResult (or null if matchup not found / already played).
 */
export function simSingleMatchup(
  state: GameState,
  matchupId: string,
): { result: MatchResult | null; events: GameEvent[] } {
  const events: GameEvent[] = [];

  // Auto-transition from preseason to kickoff when user sims first match
  if (state.phase === 'preseason') {
    syncTournamentTypeFromHistory(state);
    state.phase = 'kickoff_bracket';
    state.currentBracketRound = 0;
    state.currentDay++;
    for (const region of REGIONS) {
      if (!state.kickoffBrackets[region]) {
        const regionTeams = state.teams.filter(t => t.region === region);
        const seeds = seedRegion(regionTeams, getPreviousQualifiers(state, region), state.vctPoints);
        state.kickoffBrackets[region] = generateKickoffBracket(`${state.seed}-kickoff-${region}`, seeds);
      }
    }
    events.push({ type: 'phase_change', message: `VCT ${state.currentYear} Kickoff has begun!` });
  }

  if (state.phase === 'kickoff_bracket') {
    if (state.currentBracketRound >= BRACKET_ROUND_ORDER.length) return { result: null, events };
    const step = BRACKET_ROUND_ORDER[state.currentBracketRound];
    const isBigStage = isBigStageRound(state.currentBracketRound);
    const roundName = getRoundName(state.currentBracketRound);

    // Find the matchup across all regions
    let foundMatchup: PlayoffMatchup | null = null;
    let foundRegion: Region | null = null;

    for (const region of REGIONS) {
      const bracket = state.kickoffBrackets[region];
      if (!bracket) continue;
      const round = bracket[step.section][step.roundIdx];
      const m = round.matchups.find(mu => mu.id === matchupId);
      if (m) { foundMatchup = m; foundRegion = region; break; }
    }

    if (!foundMatchup || !foundRegion || foundMatchup.winnerId || !foundMatchup.team1Id || !foundMatchup.team2Id) {
      return { result: null, events };
    }

    const rng = createRNG(`${state.seed}-matchup-${matchupId}`);
    const winnerId = simulatePlayoffMatchup(rng, foundMatchup, state.teams, isBigStage, state.mapPool, state.agentMeta, state.mapMeta, state.agentVariance, state.teamMapComps ?? {}, state.userTeamId, state.agentRoleOverrides ?? {}, state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {}, state.disabledAgents ?? [], state.agentAbilities, state.matchSimConfig);
    const result = foundMatchup.matchResults[foundMatchup.matchResults.length - 1];

    // Record stats
    const team1 = state.teams.find(t => t.id === foundMatchup!.team1Id);
    const team2 = state.teams.find(t => t.id === foundMatchup!.team2Id);
    if (team1 && team2 && result) {
      recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'regional');
      updateStandings(state.standings, result);
      const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
      if (!state.newsFeed) state.newsFeed = [];
      state.newsFeed.push(...newsItems);
    }

    const winner = state.teams.find(t => t.id === winnerId);
    const loserId = foundMatchup.team1Id === winnerId ? foundMatchup.team2Id : foundMatchup.team1Id;
    const loser = state.teams.find(t => t.id === loserId);
    events.push({
      type: 'match_result',
      message: `[${foundRegion.toUpperCase()}] ${roundName}: ${winner?.abbreviation} def. ${loser?.abbreviation} ${result.homeScore}-${result.awayScore}`,
      data: result,
    });

    // Check if ALL regions finished this round
    checkKickoffRoundComplete(state, events);

    return { result, events };

  } else if (state.phase === 'international' && state.internationalTournament) {
    const champBracket = state.internationalTournament.bracket;
    const stepIdx = state.currentChampionsRound;
    if (stepIdx >= CHAMPIONS_ROUND_ORDER.length) return { result: null, events };

    const step = CHAMPIONS_ROUND_ORDER[stepIdx];
    let round: PlayoffRound | undefined;
    if (step.phase === 'swiss') round = champBracket.swiss.rounds[step.roundIdx];
    else if (step.phase === 'upper') round = champBracket.upper[step.roundIdx];
    else round = champBracket.lower[step.roundIdx];

    if (!round) return { result: null, events };

    const foundMatchup = round.matchups.find(m => m.id === matchupId);
    if (!foundMatchup || foundMatchup.winnerId || !foundMatchup.team1Id || !foundMatchup.team2Id) {
      return { result: null, events };
    }

    const rng = createRNG(`${state.seed}-matchup-${matchupId}`);
    const isPlayoff = step.phase !== 'swiss';
    const winnerId = simulatePlayoffMatchup(rng, foundMatchup, state.teams, isPlayoff, state.mapPool, state.agentMeta, state.mapMeta, state.agentVariance, state.teamMapComps ?? {}, state.userTeamId, state.agentRoleOverrides ?? {}, state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {}, state.disabledAgents ?? [], state.agentAbilities, state.matchSimConfig);
    const result = foundMatchup.matchResults[0];

    const team1 = state.teams.find(t => t.id === foundMatchup.team1Id);
    const team2 = state.teams.find(t => t.id === foundMatchup.team2Id);
    if (team1 && team2 && result) {
      recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'international');
      updateStandings(state.standings, result);
      const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
      if (!state.newsFeed) state.newsFeed = [];
      state.newsFeed.push(...newsItems);
    }

    const winner = state.teams.find(t => t.id === winnerId);
    const loserId = foundMatchup.team1Id === winnerId ? foundMatchup.team2Id : foundMatchup.team1Id;
    const loser = state.teams.find(t => t.id === loserId);
    const roundName = getChampionsRoundName(stepIdx);
    events.push({
      type: 'match_result',
      message: `[CHAMPIONS] ${roundName}: ${winner?.abbreviation} def. ${loser?.abbreviation} ${result.homeScore}-${result.awayScore}`,
      data: result,
    });

    // Check if round is complete
    const allDone = round.matchups.every(m => !m.team1Id || !m.team2Id || m.winnerId);
    if (allDone) {
      if (step.phase === 'swiss') {
        advanceSwissRound(champBracket, step.roundIdx, rng);
      } else {
        advanceChampionsPlayoffRound(champBracket, stepIdx);
      }

      if (champBracket.champion) {
        state.internationalTournament.champion = champBracket.champion;
        const champion = state.teams.find(t => t.id === champBracket.champion);
        events.push({ type: 'champion_crowned', message: `🏆🌍 ${champion?.name} are the VALORANT World Champions!` });

        state.champions.push({ year: state.currentYear, teamId: champBracket.champion, type: 'international' });
        for (const region of REGIONS) {
          const bracket = state.kickoffBrackets[region];
          if (bracket) {
            for (const q of bracket.qualifiers) {
              state.champions.push({ year: state.currentYear, teamId: q.teamId, type: 'regional', region });
            }
          }
        }
        // award VCT championship points for international placements
        const intlPts = awardInternationalPoints(champBracket);
        state.vctPoints = mergePoints(state.vctPoints ?? {}, intlPts);
        events.push(...handlePostInternational(state));
      } else {
        state.currentChampionsRound++;
      }
    }

    return { result, events };
  } else if (state.phase === 'stage1_groups' || state.phase === 'stage2_groups') {
    return simGroupStageMatch(state, matchupId);
  } else if (state.phase === 'stage1_playoffs' || state.phase === 'stage2_playoffs') {
    return simStagePlayoffMatchup(state, matchupId);
  }

  return { result: null, events };
}

/**
 * Helper: check if the current kickoff bracket round is complete across all regions.
 * If so, advance routing and bump currentBracketRound.
 */
function checkKickoffRoundComplete(state: GameState, events: GameEvent[]): void {
  const step = BRACKET_ROUND_ORDER[state.currentBracketRound];
  if (!step) return;

  for (const region of REGIONS) {
    const bracket = state.kickoffBrackets[region];
    if (!bracket) continue;
    const round = bracket[step.section][step.roundIdx];
    if (round.matchups.some(m => m.team1Id && m.team2Id && !m.winnerId)) {
      return; // still unplayed matchups
    }
  }

  // All done — advance bracket routing for every region
  for (const region of REGIONS) {
    const bracket = state.kickoffBrackets[region];
    if (!bracket) continue;
    advanceKickoffRound(bracket, state.currentBracketRound);

    const round = bracket[step.section][step.roundIdx];
    for (const q of bracket.qualifiers) {
      const team = state.teams.find(t => t.id === q.teamId);
      const bracketLabel = q.bracket === 'upper' ? 'Upper Final' : q.bracket === 'middle' ? 'Middle Final' : 'Lower Final';
      const alreadyAnnounced = events.some(e => e.type === 'international_qualifier' && (e.data as any)?.teamId === q.teamId);
      if (team && !alreadyAnnounced) {
        const justQualified = round.matchups.some(m => m.winnerId === q.teamId);
        if (justQualified) {
          events.push({
            type: 'international_qualifier',
            message: `🏆 ${team.name} win the ${region.toUpperCase()} ${bracketLabel} and qualify for Champions!`,
            data: { teamId: q.teamId, region, seed: q.seed },
          });
        }
      }
    }
  }

  state.currentBracketRound++;

  if (state.currentBracketRound >= BRACKET_ROUND_ORDER.length) {
    state.phase = 'international';
    state.internationalSource = 'kickoff';
    // award VCT championship points for kickoff placements
    const kickoffPts = awardKickoffPoints(state.kickoffBrackets);
    state.vctPoints = mergePoints(state.vctPoints ?? {}, kickoffPts);
    events.push({ type: 'phase_change', message: 'All Kickoff brackets complete! VALORANT Champions begins!' });
  }
}

/**
 * Initialize standings for all teams
 */
export function initializeStandings(teams: Team[]): StandingsEntry[] {
  return teams.map(team => ({
    teamId: team.id,
          region: team.region,
    wins: 0,
    losses: 0,
    mapWins: 0,
    mapLosses: 0,
    roundDifferential: 0,
  }));
}

/**
 * Generate regional round-robin schedule
 * - Teams only play others in their region
 * - Each team plays at most once per day
 */
export function generateSchedule(
  seed: string,
  teams: Team[],
  gamesPerTeam: number
): ScheduledMatch[] {
  const rng = createRNG(seed + '-schedule');
  const schedule: ScheduledMatch[] = [];
  
  // Process each region separately
  for (const region of REGIONS) {
    const regionTeams = teams.filter(t => t.region === region);
    if (regionTeams.length < 2) continue;
    
    // Generate all possible matchups within the region (single round-robin)
    const matchups: Array<{ home: string; away: string }> = [];
    
    for (let i = 0; i < regionTeams.length; i++) {
      for (let j = i + 1; j < regionTeams.length; j++) {
        // Randomly assign home/away - USE rng() NOT Math.random()!
        if (rng() > 0.5) {
          matchups.push({ home: regionTeams[i].id, away: regionTeams[j].id });
        } else {
          matchups.push({ home: regionTeams[j].id, away: regionTeams[i].id });
        }
      }
    }
    
    shuffle(rng, matchups);
    
    // Track games per team
    const gamesPlayed: Record<string, number> = {};
    regionTeams.forEach(t => gamesPlayed[t.id] = 0);
    
    // Collect valid matchups
    const validMatchups: Array<{ home: string; away: string }> = [];
    
    for (const matchup of matchups) {
      if (gamesPlayed[matchup.home] >= gamesPerTeam || gamesPlayed[matchup.away] >= gamesPerTeam) {
        continue;
      }
      validMatchups.push(matchup);
      gamesPlayed[matchup.home]++;
      gamesPlayed[matchup.away]++;
    }
    
    // Schedule matches ensuring each team plays at most once per day
    const teamsPlayingToday: Set<string> = new Set();
    let currentDay = 1;
    
    for (const matchup of validMatchups) {
      // If either team already playing today, move to next day
      if (teamsPlayingToday.has(matchup.home) || teamsPlayingToday.has(matchup.away)) {
        currentDay++;
        teamsPlayingToday.clear();
      }
      
      schedule.push({
        id: generateId(rng, 'match_'),
        homeTeamId: matchup.home,
        awayTeamId: matchup.away,
        format: 'bo3',
        day: currentDay,
        played: false,
        region: region,
      });
      
      teamsPlayingToday.add(matchup.home);
      teamsPlayingToday.add(matchup.away);
    }
  }
  
  // Sort by day
  schedule.sort((a, b) => a.day - b.day);
  
  return schedule;
}

/**
 * Update standings after a match
 */
export function updateStandings(standings: StandingsEntry[], match: MatchResult): void {
  const homeEntry = standings.find(s => s.teamId === match.homeTeamId);
  const awayEntry = standings.find(s => s.teamId === match.awayTeamId);

  if (!homeEntry || !awayEntry) return;

  if (match.homeScore > match.awayScore) {
    homeEntry.wins++;
    awayEntry.losses++;
  } else {
    awayEntry.wins++;
    homeEntry.losses++;
  }

  homeEntry.mapWins += match.homeScore;
  homeEntry.mapLosses += match.awayScore;
  awayEntry.mapWins += match.awayScore;
  awayEntry.mapLosses += match.homeScore;

  const homeRounds = match.mapScores.reduce((sum, m) => sum + m.homeRounds, 0);
  const awayRounds = match.mapScores.reduce((sum, m) => sum + m.awayRounds, 0);
  homeEntry.roundDifferential += homeRounds - awayRounds;
  awayEntry.roundDifferential += awayRounds - homeRounds;
}

/**
 * Sort standings
 */
export function sortStandings(standings: StandingsEntry[]): StandingsEntry[] {
  return [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aMapDiff = a.mapWins - a.mapLosses;
    const bMapDiff = b.mapWins - b.mapLosses;
    if (bMapDiff !== aMapDiff) return bMapDiff - aMapDiff;
    return b.roundDifferential - a.roundDifferential;
  });
}

/**
 * Get playoff seeds from standings for a specific region
 */
export function getRegionalPlayoffTeams(
  standings: StandingsEntry[],
  teams: Team[],
  region: Region,
  numTeams: number
): StandingsEntry[] {
  const regionTeamIds = new Set(teams.filter(t => t.region === region).map(t => t.id));
  const regionStandings = standings.filter(s => regionTeamIds.has(s.teamId));
  return sortStandings(regionStandings).slice(0, numTeams);
}

/**
 * Generate playoff bracket for a region (6 teams)
 * Format: 
 * - Seeds 1-2 get byes to Upper Bracket Semi-Finals
 * - Seeds 3-6 play in Upper Bracket Quarter-Finals (3v6, 4v5)
 * - Single elimination for simplicity (can expand to double elim later)
 */
export function generatePlayoffBracket(
  rng: ReturnType<typeof createRNG>,
  playoffTeams: StandingsEntry[],
  format: 'bo3' | 'bo5'
): PlayoffBracket {
  const rounds: PlayoffRound[] = [];

  if (playoffTeams.length >= 6) {
    // Quarter-Finals: 3v6, 4v5
    rounds.push({
      name: 'Quarter-Finals',
      matchups: [
        {
          id: generateId(rng, 'po_'),
          team1Id: playoffTeams[2].teamId, // #3 seed
          team2Id: playoffTeams[5].teamId, // #6 seed
          winnerId: null,
          matchResults: [],
          format,
        },
        {
          id: generateId(rng, 'po_'),
          team1Id: playoffTeams[3].teamId, // #4 seed
          team2Id: playoffTeams[4].teamId, // #5 seed
          winnerId: null,
          matchResults: [],
          format,
        },
      ],
    });

    // Semi-Finals: #1 vs QF1 winner, #2 vs QF2 winner
    rounds.push({
      name: 'Semi-Finals',
      matchups: [
        {
          id: generateId(rng, 'po_'),
          team1Id: playoffTeams[0].teamId, // #1 seed (bye)
          team2Id: null, // Winner of 3v6
          winnerId: null,
          matchResults: [],
          format,
        },
        {
          id: generateId(rng, 'po_'),
          team1Id: playoffTeams[1].teamId, // #2 seed (bye)
          team2Id: null, // Winner of 4v5
          winnerId: null,
          matchResults: [],
          format,
        },
      ],
    });

    // 3rd Place Match (Semi-Finals losers)
    rounds.push({
      name: '3rd Place Match',
      matchups: [
        {
          id: generateId(rng, 'po_'),
          team1Id: null, // Loser of SF1
          team2Id: null, // Loser of SF2
          winnerId: null,
          matchResults: [],
          format,
        },
      ],
    });

    // Finals
    rounds.push({
      name: 'Finals',
      matchups: [
        {
          id: generateId(rng, 'po_'),
          team1Id: null,
          team2Id: null,
          winnerId: null,
          matchResults: [],
          format,
        },
      ],
    });
  } else if (playoffTeams.length === 4) {
    // Fallback for 4-team playoffs (legacy support)
    rounds.push({
      name: 'Semi-Finals',
      matchups: [
        {
          id: generateId(rng, 'po_'),
          team1Id: playoffTeams[0].teamId,
          team2Id: playoffTeams[3].teamId,
          winnerId: null,
          matchResults: [],
          format,
        },
        {
          id: generateId(rng, 'po_'),
          team1Id: playoffTeams[1].teamId,
          team2Id: playoffTeams[2].teamId,
          winnerId: null,
          matchResults: [],
          format,
        },
      ],
    });

    rounds.push({
      name: 'Finals',
      matchups: [
        {
          id: generateId(rng, 'po_'),
          team1Id: null,
          team2Id: null,
          winnerId: null,
          matchResults: [],
          format,
        },
      ],
    });
  }

  return { format: 'single_elimination', rounds };
}

/**
 * Get international seeds from kickoff bracket qualifiers
 */
export function getInternationalSeeds(
  state: GameState,
  region: Region,
  numQualifiers: number
): Array<{ teamId: string; seed: number }> {
  const source = state.internationalSource ?? 'kickoff';

  if (source === 'stage1' || source === 'stage2') {
    const stageNum = source === 'stage1' ? 1 : 2;
    const bracket = state.stagePlayoffBrackets[region]?.[stageNum];
    if (!bracket || bracket.qualifiedTeams.length === 0) return [];
    return bracket.qualifiedTeams.slice(0, numQualifiers).map((id, i) => ({
      teamId: id,
      seed: i + 1,
    }));
  }

  // default: kickoff qualifiers
  const bracket = state.kickoffBrackets[region];
  if (!bracket) return [];

  // qualifiers are already populated by advanceKickoffRound
  return bracket.qualifiers.slice(0, numQualifiers).map(q => ({
    teamId: q.teamId,
    seed: q.seed,
  }));
}

/**
 * Generate international tournament bracket (12 teams - top 3 from each region)
 * Region-locked to ensure cross-region matchups in Play-Ins and Quarterfinals
 * 
 * Play-Ins (cross-region #2 vs #3):
 *   - NA2 vs EU3, EU2 vs PAC3, PAC2 vs CN3, CN2 vs NA3
 * 
 * Quarterfinals (#1 seeds vs play-in winners from different regions):
 *   - NA1 vs winner of (EU2 vs PAC3)  - guaranteed no NA teams
 *   - EU1 vs winner of (PAC2 vs CN3)  - guaranteed no EU teams
 *   - PAC1 vs winner of (CN2 vs NA3)  - guaranteed no PAC teams
 *   - CN1 vs winner of (NA2 vs EU3)   - guaranteed no CN teams
 */
export function generateInternationalBracket(
  rng: ReturnType<typeof createRNG>,
  qualifiedTeams: Array<{ teamId: string; region: Region; seed: number }>,
  format: 'bo3' | 'bo5'
): PlayoffBracket {
  const rounds: PlayoffRound[] = [];
  
  // Helper to get team by region and seed
  const getTeam = (region: Region, seed: number) => 
    qualifiedTeams.find(t => t.region === region && t.seed === seed);
  
  // Define the cross-region play-in matchups
  // Each #2 seed plays a #3 seed from a different region
  // Pattern: Region's #2 plays next region's #3 (circular)
  const playInPairs: Array<{ seed2Region: Region; seed3Region: Region }> = [
    { seed2Region: 'americas', seed3Region: 'emea' },     // NA2 vs EU3
    { seed2Region: 'emea', seed3Region: 'pacific' },      // EU2 vs PAC3
    { seed2Region: 'pacific', seed3Region: 'china' },     // PAC2 vs CN3
    { seed2Region: 'china', seed3Region: 'americas' },    // CN2 vs NA3
  ];
  
  // Create Play-In matchups
  const playInMatchups: PlayoffMatchup[] = playInPairs.map(pair => {
    const seed2 = getTeam(pair.seed2Region, 2);
    const seed3 = getTeam(pair.seed3Region, 3);
    return {
      id: generateId(rng, 'int_'),
      team1Id: seed2?.teamId || null,
      team2Id: seed3?.teamId || null,
      winnerId: null,
      matchResults: [],
      format: 'bo3' as const,
    };
  });
  
  rounds.push({
    name: 'Play-Ins',
    matchups: playInMatchups,
  });
  
  // Define which #1 seed faces which play-in winner
  // Each #1 seed faces a play-in winner that CANNOT be from their region
  // Order matters: this determines which QF slot each #1 seed goes into
  const quarterSeed1Order: Region[] = ['americas', 'emea', 'pacific', 'china'];
  
  // Create Quarterfinal matchups
  const quarterMatchups: PlayoffMatchup[] = quarterSeed1Order.map(region => {
    const seed1 = getTeam(region, 1);
    return {
      id: generateId(rng, 'int_'),
      team1Id: seed1?.teamId || null,
      team2Id: null, // Will be filled from play-ins via advanceInternationalPlayIns
      winnerId: null,
      matchResults: [],
      format,
    };
  });
  
  rounds.push({
    name: 'Quarterfinals',
    matchups: quarterMatchups,
  });
  
  // Semifinals
  rounds.push({
    name: 'Semifinals',
    matchups: [
      { id: generateId(rng, 'int_'), team1Id: null, team2Id: null, winnerId: null, matchResults: [], format },
      { id: generateId(rng, 'int_'), team1Id: null, team2Id: null, winnerId: null, matchResults: [], format },
    ],
  });
  
  // Grand Finals
  rounds.push({
    name: 'Grand Finals',
    matchups: [
      { id: generateId(rng, 'int_'), team1Id: null, team2Id: null, winnerId: null, matchResults: [], format: 'bo5' },
    ],
  });

  return { format: 'single_elimination', rounds };
}

/**
 * Simulate a playoff matchup
 */
export function simulatePlayoffMatchup(
  rng: ReturnType<typeof createRNG>,
  matchup: PlayoffMatchup,
  teams: Team[],
  isPlayoff: boolean = true,
  mapPool?: string[],
  agentMeta?: Record<string, number>,
  mapMeta?: Record<string, Partial<Record<string, string[]>>>,
  agentVariance?: number,
  teamMapComps?: Record<string, Record<string, Record<string, string>>>,
  userTeamId?: string | null,
  agentRoleOverrides?: Record<string, string[]>,
  teamMapCompNoPenalty?: Record<string, Record<string, string[]>>,
  teamMapCompBuffs?: Record<string, Record<string, Record<string, number>>>,
  disabledAgents?: string[],
  agentAbilities?: Record<string, import('../data/agentAbilities').AgentAbility[]>,
  matchSimConfig?: import('../data/matchSimConfig').MatchSimConfig
): string {
  if (!matchup.team1Id || !matchup.team2Id) {
    throw new Error('Matchup teams not set');
  }

  const team1 = teams.find(t => t.id === matchup.team1Id);
  const team2 = teams.find(t => t.id === matchup.team2Id);

  if (!team1 || !team2) {
    throw new Error('Team not found');
  }

  const result = simulateMatch(rng, team1.id, team2.id, team1.roster, team2.roster, matchup.format, team1.startingLineup, team2.startingLineup, team1, team2, isPlayoff, mapPool, agentMeta, mapMeta, agentVariance, teamMapComps, userTeamId, agentRoleOverrides, teamMapCompNoPenalty, teamMapCompBuffs, disabledAgents, agentAbilities, matchSimConfig);

  matchup.matchResults.push(result);
  matchup.winnerId = result.homeScore > result.awayScore ? team1.id : team2.id;

  return matchup.winnerId;
}

/**
 * Check a match result for notable stat lines and generate news items.
 * Thresholds calibrated to real VCT data:
 * 
 * SINGLE MAP (real benchmarks):
 *   aspas 47 kills (record), Monyet 39, Tehbotol 38, BuZz 36 — top 5 ever all 36+
 *   PatMen 516 ACS (record), Meiy 509, TenZ 478
 *   PatMen 6.4 KD (short map), aspas 2.47 KD on 36-round map
 * 
 * SERIES (real benchmarks):
 *   marteen 126 kills BO5 (record), ZmjjKK 111, t3xture 105
 *   aspas 82 kills BO3 (record), Dep 78
 * 
 * NEWS TIERS:
 *   record_broken — beats an actual VCT record (highest priority)
 *   historic_map  — 35+ kills, or 30+ kills with 3.0+ KD (top ~10 maps ever)
 *   monster_map   — 30+ kills, or 400+ ACS (top ~30 maps ever)
 *   series_record — 75+ kills BO3, 100+ kills BO5
 */
export function generateNewsFromMatch(
  result: MatchResult,
  teams: Team[],
  day: number,
  year: number,
  recordBook: VCTRecordBook
): NewsItem[] {
  const news: NewsItem[] = [];
  const homeTeam = teams.find(t => t.id === result.homeTeamId);
  const awayTeam = teams.find(t => t.id === result.awayTeamId);
  if (!homeTeam || !awayTeam) return news;

  const allPlayers = [...homeTeam.roster, ...awayTeam.roster];
  const getPlayer = (id: string) => allPlayers.find(p => p.id === id);
  const getTeamForPlayer = (id: string) => homeTeam.roster.find(p => p.id === id) ? homeTeam : awayTeam;

  // Track which players already got a record_broken news item on a given map
  // to avoid duplicate lesser news for the same performance
  const playerRecordBrokenMaps = new Set<string>();

  // Aggregate per-player stats across all maps in the series
  const playerSeriesStats: Record<string, { kills: number; deaths: number; assists: number; firstKills: number; maps: number }> = {};

  for (const map of result.mapScores) {
    const allMapStats = [...map.homePlayerStats, ...map.awayPlayerStats];
    const totalRounds = map.homeRounds + map.awayRounds;

    for (const ps of allMapStats) {
      // Aggregate for series totals
      if (!playerSeriesStats[ps.playerId]) {
        playerSeriesStats[ps.playerId] = { kills: 0, deaths: 0, assists: 0, firstKills: 0, maps: 0 };
      }
      playerSeriesStats[ps.playerId].kills += ps.kills;
      playerSeriesStats[ps.playerId].deaths += ps.deaths;
      playerSeriesStats[ps.playerId].assists += ps.assists;
      playerSeriesStats[ps.playerId].firstKills += ps.firstKills;
      playerSeriesStats[ps.playerId].maps++;

      const player = getPlayer(ps.playerId);
      const team = getTeamForPlayer(ps.playerId);
      if (!player || !team) continue;

      const kd = ps.deaths === 0 ? ps.kills : Math.round((ps.kills / ps.deaths) * 100) / 100;

      // --- RECORD CHECK (highest priority) ---
      const brokenRecords = checkMapRecords(
        recordBook, ps.kills, ps.deaths, ps.acs, totalRounds,
        player.name, team.abbreviation, map.map,
        ps.playerId, team.id, day, year
      );

      if (brokenRecords.length > 0) {
        playerRecordBrokenMaps.add(`${ps.playerId}_${map.map}`);
        for (const rec of brokenRecords) {
          const prevHolder = rec.oldRecord.isRealWorld
            ? `${rec.oldRecord.playerName} (${rec.oldRecord.teamAbbr}, ${rec.oldRecord.year})`
            : `${rec.oldRecord.playerName} (${rec.oldRecord.teamAbbr})`;
          news.push({
            id: `news_${day}_${ps.playerId}_record_${rec.recordCategory}_${map.map}`,
            day, year,
            type: 'record_broken',
            headline: `NEW VCT RECORD: ${player.name} breaks ${rec.recordCategory}`,
            body: `${team.abbreviation}'s ${player.name} set a new record with ${rec.newValue}${rec.recordCategory.includes('ACS') ? ' ACS' : rec.recordCategory.includes('KD') ? ' KD' : ' kills'} ${rec.context}, surpassing the previous record of ${rec.oldRecord.value} held by ${prevHolder}.`,
            playerId: ps.playerId,
            teamId: team.id,
            region: team.region,
            stat: { kills: ps.kills, deaths: ps.deaths, kd, acs: ps.acs },
            oldRecordHolder: rec.oldRecord.playerName,
            oldRecordValue: rec.oldRecord.value,
          });
        }
        continue; // Skip normal news tiers — record broken is the story
      }

      // --- NORMAL NEWS TIERS (only if no record broken on this map for this player) ---
      // Historic map: 35+ kills, or 30+ kills with 3.0+ KD
      if (ps.kills >= 35 || (ps.kills >= 30 && kd >= 3.0)) {
        news.push({
          id: `news_${day}_${ps.playerId}_historic_${map.map}`,
          day, year,
          type: 'historic_map',
          headline: `${player.name} puts up HISTORIC ${ps.kills}/${ps.deaths}/${ps.assists} on ${map.map}`,
          body: `${team.abbreviation}'s ${player.name} delivered a jaw-dropping performance with ${ps.kills} kills, just ${ps.deaths} deaths, and ${ps.acs} ACS across ${totalRounds} rounds.`,
          playerId: ps.playerId,
          teamId: team.id,
          region: team.region,
          stat: { kills: ps.kills, deaths: ps.deaths, kd, acs: ps.acs },
        });
      }
      // Monster map: 30+ kills, or 400+ ACS
      else if (ps.kills >= 30 || ps.acs >= 400) {
        news.push({
          id: `news_${day}_${ps.playerId}_monster_${map.map}`,
          day, year,
          type: 'monster_map',
          headline: `${player.name} goes off with ${ps.kills}/${ps.deaths}/${ps.assists} on ${map.map}`,
          body: `${team.abbreviation}'s ${player.name} dominated with a ${kd.toFixed(2)} KD and ${ps.acs} ACS in a ${totalRounds}-round ${map.map}.`,
          playerId: ps.playerId,
          teamId: team.id,
          region: team.region,
          stat: { kills: ps.kills, deaths: ps.deaths, kd, acs: ps.acs },
        });
      }
    }
  }

  // --- SERIES-LEVEL CHECKS (BO3/BO5 only) ---
  if (result.mapScores.length >= 2) {
    const isBo5 = result.format === 'bo5';
    const notableThreshold = isBo5 ? 100 : 75;

    for (const [playerId, stats] of Object.entries(playerSeriesStats)) {
      const player = getPlayer(playerId);
      const team = getTeamForPlayer(playerId);
      if (!player || !team) continue;
      const opponentAbbr = homeTeam.id === team.id ? awayTeam.abbreviation : homeTeam.abbreviation;

      // Record check for series
      const seriesBroken = checkSeriesRecords(
        recordBook, stats.kills, stats.firstKills, stats.maps, result.format,
        player.name, team.abbreviation, opponentAbbr,
        playerId, team.id, day, year
      );

      if (seriesBroken.length > 0) {
        for (const rec of seriesBroken) {
          const prevHolder = rec.oldRecord.isRealWorld
            ? `${rec.oldRecord.playerName} (${rec.oldRecord.teamAbbr}, ${rec.oldRecord.year})`
            : `${rec.oldRecord.playerName} (${rec.oldRecord.teamAbbr})`;
          const isFirstKillRecord = rec.recordCategory.includes('First Kill');
          const statDesc = isFirstKillRecord
            ? `${rec.newValue} first kills across ${stats.maps} maps`
            : `${rec.newValue} kills across ${stats.maps} maps`;
          news.push({
            id: `news_${day}_${playerId}_record_${rec.recordCategory}`,
            day, year,
            type: 'record_broken',
            headline: `NEW VCT RECORD: ${player.name} breaks ${rec.recordCategory}`,
            body: `${team.abbreviation}'s ${player.name} accumulated ${statDesc} vs ${opponentAbbr}, surpassing the previous record of ${rec.oldRecord.value} held by ${prevHolder}.`,
            playerId,
            teamId: team.id,
            region: team.region,
            stat: { totalKills: stats.kills, deaths: stats.deaths },
            oldRecordHolder: rec.oldRecord.playerName,
            oldRecordValue: rec.oldRecord.value,
          });
        }
      } else if (stats.kills >= notableThreshold) {
        // Notable series (not record-breaking but still impressive)
        news.push({
          id: `news_${day}_${playerId}_series_notable`,
          day, year,
          type: 'series_record',
          headline: `${player.name} drops ${stats.kills} kills across ${stats.maps} maps`,
          body: `${team.abbreviation}'s ${player.name} accumulated ${stats.kills} kills in the ${result.format.toUpperCase()} between ${homeTeam.abbreviation} and ${awayTeam.abbreviation}.`,
          playerId,
          teamId: team.id,
          region: team.region,
          stat: { totalKills: stats.kills, deaths: stats.deaths },
        });
      }
    }
  }

  return news;
}

/**
 * Advance winners to next round (standard bracket)
 */
export function advancePlayoffBracket(bracket: PlayoffBracket, roundIndex: number): void {
  const currentRound = bracket.rounds[roundIndex];
  const nextRound = bracket.rounds[roundIndex + 1];

  if (!nextRound) return;

  for (let i = 0; i < currentRound.matchups.length; i += 2) {
    const winner1 = currentRound.matchups[i]?.winnerId;
    const winner2 = currentRound.matchups[i + 1]?.winnerId;
    const nextIdx = Math.floor(i / 2);

    if (nextRound.matchups[nextIdx]) {
      if (winner1) nextRound.matchups[nextIdx].team1Id = winner1;
      if (winner2) nextRound.matchups[nextIdx].team2Id = winner2;
    }
  }
}

/**
 * Advance winners for 6-team bracket (QF winners go to SF)
 */
export function advanceRegionalBracket(bracket: PlayoffBracket, roundIndex: number): void {
  const currentRound = bracket.rounds[roundIndex];

  // Quarter-Finals -> Semi-Finals: Winners fill the null team2Id slots
  if (currentRound.name === 'Quarter-Finals') {
    const semiFinals = bracket.rounds.find(r => r.name === 'Semi-Finals');
    if (semiFinals) {
      for (let i = 0; i < currentRound.matchups.length; i++) {
        const winner = currentRound.matchups[i]?.winnerId;
        if (winner && semiFinals.matchups[i]) {
          semiFinals.matchups[i].team2Id = winner;
        }
      }
    }
  } 
  // Semi-Finals -> 3rd Place Match AND Finals
  else if (currentRound.name === 'Semi-Finals') {
    const thirdPlace = bracket.rounds.find(r => r.name === '3rd Place Match');
    const finals = bracket.rounds.find(r => r.name === 'Finals');
    
    // Collect losers for 3rd place match
    const losers: (string | null)[] = [];
    const winners: (string | null)[] = [];
    
    for (const matchup of currentRound.matchups) {
      if (matchup.winnerId) {
        winners.push(matchup.winnerId);
        // The loser is whichever team didn't win
        const loser = matchup.team1Id === matchup.winnerId ? matchup.team2Id : matchup.team1Id;
        losers.push(loser);
      }
    }
    
    // Fill 3rd place match with losers
    if (thirdPlace && thirdPlace.matchups[0]) {
      if (losers[0]) thirdPlace.matchups[0].team1Id = losers[0];
      if (losers[1]) thirdPlace.matchups[0].team2Id = losers[1];
    }
    
    // Fill finals with winners
    if (finals && finals.matchups[0]) {
      if (winners[0]) finals.matchups[0].team1Id = winners[0];
      if (winners[1]) finals.matchups[0].team2Id = winners[1];
    }
  }
  // 3rd Place Match doesn't advance anywhere
  else if (currentRound.name === '3rd Place Match') {
    // No advancement needed, just record the result
  }
}

/**
 * Special advance for international bracket (play-ins feed into quarterfinals)
 * Region-lock mapping:
 *   Play-in 0 (NA2 vs EU3) winner -> Quarter 3 (vs CN1) - no CN in play-in 0
 *   Play-in 1 (EU2 vs PAC3) winner -> Quarter 0 (vs NA1) - no NA in play-in 1
 *   Play-in 2 (PAC2 vs CN3) winner -> Quarter 1 (vs EU1) - no EU in play-in 2
 *   Play-in 3 (CN2 vs NA3) winner -> Quarter 2 (vs PAC1) - no PAC in play-in 3
 */
export function advanceInternationalPlayIns(bracket: PlayoffBracket): void {
  const playIns = bracket.rounds[0];
  const quarters = bracket.rounds[1];
  
  // Play-in index -> Quarter index mapping (ensures cross-region)
  // Play-in winner goes to face the #1 seed from the region NOT in that play-in
  const playInToQuarterMap = [3, 0, 1, 2];
  
  for (let i = 0; i < playIns.matchups.length; i++) {
    const winner = playIns.matchups[i].winnerId;
    const quarterIndex = playInToQuarterMap[i];
    if (winner && quarters.matchups[quarterIndex]) {
      quarters.matchups[quarterIndex].team2Id = winner;
    }
  }
}

/**
 * Create a new game state
 */
export function createGameState(
  teams: Team[],
  userTeamId: string | null,
  seed: string,
  config: SeasonConfig = DEFAULT_SEASON_CONFIG,
  useEsportsNames: boolean = true,
): GameState {
  // Initialize season start stats for all players
  const seasonStartStats: Record<string, { overall: number; ratings: Record<string, number>; potential: { ceiling: number; floor: number } }> = {};
  for (const team of teams) {
    for (const player of team.roster) {
      seasonStartStats[player.id] = {
        overall: player.overall,
        ratings: { ...player.ratings },
        potential: { ...player.potential },
      };
    }
  }

  // Initialize default academy teams with full rosters
  const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
  const initializedTier2Teams: Record<Region, Tier2Team[]> = {
    americas: [],
    emea: [],
    pacific: [],
    china: [],
  };
  
  for (const region of regions) {
    const defaultTeams = TIER2_TEAMS[region] || [];
    initializedTier2Teams[region] = defaultTeams.map((team, idx) => {
      const rng = createRNG(`${seed}-tier2-${region}-${team.id}-${idx}`);
      const players = generateAcademyRoster(rng, team.abbreviation, team.averageOVR);
      return {
        ...team,
        players,
      };
    });
  }

  // generate kickoff brackets per region (year 1 = no previous qualifiers)
  const kickoffBrackets: Record<Region, KickoffBracket | null> = {
    americas: null,
    emea: null,
    pacific: null,
    china: null,
  };

  for (const region of regions) {
    const regionTeams = teams.filter(t => t.region === region);
    if (regionTeams.length < 8) continue; // need enough teams
    const seeds = seedRegion(regionTeams, []); // no previous qualifiers for year 1
    kickoffBrackets[region] = generateKickoffBracket(`${seed}-kickoff-${region}`, seeds);
  }

  // seed used names with all existing roster player names
  const usedNames: string[] = [];
  for (const team of teams) {
    for (const p of team.roster) usedNames.push(p.name);
  }

  return {
    currentDay: 0,
    currentYear: config.year,
    phase: 'preseason',
    teams,
    userTeamId,
    schedule: [], // empty — no round-robin in kickoff format
    standings: initializeStandings(teams), // kept for compatibility
    kickoffBrackets,
    currentBracketRound: 0,
    regionalPlayoffs: {
      americas: null,
      emea: null,
      pacific: null,
      china: null,
    },
    currentPlayoffSeries: null,
    currentPlayoffRegion: null,
    regionalChampions: {
      americas: null,
      emea: null,
      pacific: null,
      china: null,
    },
    internationalTournament: null,
    internationalPlayoffSeries: null,
    currentChampionsRound: 0,
    champions: [],
    seasonHistory: [],
    fatigueLevel: 0,
    lastScrimDay: null,
    seasonStartStats,
    customTier2Teams: initializedTier2Teams,
    seed,
    newsFeed: [],
    lastSeenNewsCount: 0,
    recordBook: getDefaultRecordBook(),
    mapPool: [...MAPS],
    agentMeta: {},
    disabledAgents: [],
    customAgents: [],
    mapMeta: {},
    teamMapComps: {},
    teamMapCompNoPenalty: {},
    teamMapCompBuffs: {},
    agentRoleOverrides: {},
    agentVariance: 15,
    useEsportsNames,
    usedNames,
    vctPoints: {},
    stageGroupStages: {
      americas: {},
      emea: {},
      pacific: {},
      china: {},
    },
    stagePlayoffBrackets: {
      americas: {},
      emea: {},
      pacific: {},
      china: {},
    },
    currentStage: 1,
    currentStagePlayoffRound: 0,
  };
}

/**
 * Check if there's another planned event for the current or next year.
 * Returns the next unfilled history entry, or null.
 */
export function getNextPlannedEvent(state: GameState): SeasonHistoryEntry | null {
  if (!state.seasonHistory?.length) return null;
  // look for unfilled entries this year first, then next year
  for (const year of [state.currentYear, state.currentYear + 1]) {
    const entries = state.seasonHistory
      .filter(h => h.year === year)
      .sort((a, b) => (a.sortIndex ?? 999) - (b.sortIndex ?? 999));
    const next = entries.find(h => !h.worldChampionId && !h.worldChampionCustom);
    if (next) return next;
  }
  return null;
}

/**
 * Start the next event: reset competition state, keep rosters/history/records.
 * Optionally bumps the year if the next event is in a future year.
 */
export function startNextEvent(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const next = getNextPlannedEvent(state);

  // bump year if next event is in the future
  if (next && next.year > state.currentYear) {
    state.currentYear = next.year;
    // reset championship points for the new year
    state.vctPoints = {};
  }

  // count completed internationals this year to determine phase
  const completedThisYear = (state.seasonHistory || [])
    .filter(h => h.year === state.currentYear && (h.worldChampionId || h.worldChampionCustom))
    .length;

  // reset common competition state
  state.currentDay = 0;
  state.currentChampionsRound = 0;
  state.internationalTournament = null;
  state.internationalPlayoffSeries = null;
  state.currentPlayoffSeries = null;
  state.currentPlayoffRegion = null;
  state.fatigueLevel = 0;
  state.offseasonProgression = undefined;
  state.offseasonChurnEvents = undefined;

  // sync tournament type from history
  syncTournamentTypeFromHistory(state);
  const tournLabel = (state.currentTournamentType || 'champions') === 'masters' ? 'Masters' : 'Champions';
  const eventName = next?.eventName || `VCT ${tournLabel} ${state.currentYear}`;

  if (completedThisYear === 0) {
    // no internationals done yet → start from kickoff
    state.phase = 'preseason';
    state.currentBracketRound = 0;
    state.internationalSource = 'kickoff';

    // reset stage state
    state.stageGroupStages = { americas: {}, emea: {}, pacific: {}, china: {} };
    state.stagePlayoffBrackets = { americas: {}, emea: {}, pacific: {}, china: {} };
    state.currentStage = 1;
    state.currentStagePlayoffRound = 0;

    // regenerate kickoff brackets
    const eventSeed = `${state.seed}-event-${state.currentYear}-${Date.now()}`;
    for (const region of REGIONS) {
      const regionTeams = state.teams.filter(t => t.region === region);
      if (regionTeams.length < 8) continue;
      const seeds = seedRegion(regionTeams, getPreviousQualifiers(state, region), state.vctPoints);
      state.kickoffBrackets[region] = generateKickoffBracket(`${eventSeed}-kickoff-${region}`, seeds);
    }

    state.regionalChampions = { americas: null, emea: null, pacific: null, china: null };
    events.push({ type: 'phase_change', message: `${eventName} is about to begin!` });
  } else if (completedThisYear === 1) {
    // kickoff international done → start stage 1 groups
    state.currentStage = 1;
    state.currentStagePlayoffRound = 0;
    state.internationalSource = 'stage1';
    state.stageGroupStages = { americas: {}, emea: {}, pacific: {}, china: {} };
    state.stagePlayoffBrackets = { americas: {}, emea: {}, pacific: {}, china: {} };
    events.push(...startStageGroupsPhase(state, 1));
  } else if (completedThisYear === 2) {
    // stage 1 international done → start stage 2 groups
    state.currentStage = 2;
    state.currentStagePlayoffRound = 0;
    state.internationalSource = 'stage2';
    // keep stage 1 data, reset stage 2
    for (const region of REGIONS) {
      if (state.stageGroupStages[region]) (state.stageGroupStages[region] as any)[2] = undefined;
      if (state.stagePlayoffBrackets[region]) (state.stagePlayoffBrackets[region] as any)[2] = undefined;
    }
    events.push(...startStageGroupsPhase(state, 2));
  } else {
    // 3+ completed → fallback to preseason for a new cycle
    state.phase = 'preseason';
    state.currentBracketRound = 0;
    state.internationalSource = 'kickoff';
    state.stageGroupStages = { americas: {}, emea: {}, pacific: {}, china: {} };
    state.stagePlayoffBrackets = { americas: {}, emea: {}, pacific: {}, china: {} };
    state.currentStage = 1;
    state.currentStagePlayoffRound = 0;

    const eventSeed = `${state.seed}-event-${state.currentYear}-${Date.now()}`;
    for (const region of REGIONS) {
      const regionTeams = state.teams.filter(t => t.region === region);
      if (regionTeams.length < 8) continue;
      const seeds = seedRegion(regionTeams, getPreviousQualifiers(state, region), state.vctPoints);
      state.kickoffBrackets[region] = generateKickoffBracket(`${eventSeed}-kickoff-${region}`, seeds);
    }

    state.regionalChampions = { americas: null, emea: null, pacific: null, china: null };
    events.push({ type: 'phase_change', message: `${eventName} is about to begin!` });
  }

  return events;
}

/**
 * Skip the kickoff bracket and simulate all remaining matches to go to international
 */
/**
 * Sim only one region's kickoff bracket all the way through, leaving others untouched.
 * Does NOT advance currentBracketRound — that still requires all regions to be done.
 */
export function simRegionKickoff(state: GameState, region: Region): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.phase !== 'preseason' && state.phase !== 'kickoff_bracket') return events;

  if (state.phase === 'preseason') {
    syncTournamentTypeFromHistory(state);
    state.phase = 'kickoff_bracket';
    state.currentBracketRound = 0;
    for (const r of REGIONS) {
      if (!state.kickoffBrackets[r]) {
        const regionTeams = state.teams.filter(t => t.region === r);
        const seeds = seedRegion(regionTeams, getPreviousQualifiers(state, r), state.vctPoints);
        state.kickoffBrackets[r] = generateKickoffBracket(`${state.seed}-kickoff-${r}`, seeds);
      }
    }
  }

  const bracket = state.kickoffBrackets[region];
  if (!bracket) return events;

  // sim all remaining rounds for this region only
  for (let ri = state.currentBracketRound; ri < BRACKET_ROUND_ORDER.length; ri++) {
    const step = BRACKET_ROUND_ORDER[ri];
    const isBigStage = isBigStageRound(ri);
    const rng = createRNG(`${state.seed}-skip-bracket-round${ri}-${region}`);
    const section = bracket[step.section];
    const round = section[step.roundIdx];
    if (!round) continue;

    for (const matchup of round.matchups) {
      if (matchup.team1Id && matchup.team2Id && !matchup.winnerId) {
        simulatePlayoffMatchup(rng, matchup, state.teams, isBigStage, state.mapPool, state.agentMeta, state.mapMeta, state.agentVariance, state.teamMapComps ?? {}, state.userTeamId, state.agentRoleOverrides ?? {}, state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {}, state.disabledAgents ?? [], state.agentAbilities, state.matchSimConfig);
        const team1 = state.teams.find(t => t.id === matchup.team1Id);
        const team2 = state.teams.find(t => t.id === matchup.team2Id);
        const result = matchup.matchResults[0];
        if (team1 && team2 && result) {
          recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'regional');
          updateStandings(state.standings, result);
          const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
          if (!state.newsFeed) state.newsFeed = [];
          state.newsFeed.push(...newsItems);
        }
      }
    }
    advanceKickoffRound(bracket, ri);
  }

  return events;
}

export function skipToPlayoffs(state: GameState, config: SeasonConfig = DEFAULT_SEASON_CONFIG): GameEvent[] {
  const events: GameEvent[] = [];
  
  if (state.phase !== 'preseason' && state.phase !== 'kickoff_bracket') {
    return events;
  }

  // if still in preseason, initialize brackets
  if (state.phase === 'preseason') {
    syncTournamentTypeFromHistory(state);
    state.phase = 'kickoff_bracket';
    state.currentBracketRound = 0;
    // brackets should already be generated in createGameState
    // but regenerate if missing (legacy saves)
    for (const region of REGIONS) {
      if (!state.kickoffBrackets[region]) {
        const regionTeams = state.teams.filter(t => t.region === region);
        const seeds = seedRegion(regionTeams, getPreviousQualifiers(state, region), state.vctPoints);
        state.kickoffBrackets[region] = generateKickoffBracket(`${state.seed}-kickoff-${region}`, seeds);
      }
    }
  }

  // simulate all remaining bracket rounds
  while (state.currentBracketRound < BRACKET_ROUND_ORDER.length) {
    const step = BRACKET_ROUND_ORDER[state.currentBracketRound];
    const isBigStage = isBigStageRound(state.currentBracketRound);
    const rng = createRNG(`${state.seed}-skip-bracket-round${state.currentBracketRound}`);

    for (const region of REGIONS) {
      const bracket = state.kickoffBrackets[region];
      if (!bracket) continue;

      const section = bracket[step.section];
      const round = section[step.roundIdx];

      for (const matchup of round.matchups) {
        if (matchup.team1Id && matchup.team2Id && !matchup.winnerId) {
          simulatePlayoffMatchup(rng, matchup, state.teams, isBigStage, state.mapPool, state.agentMeta, state.mapMeta, state.agentVariance, state.teamMapComps ?? {}, state.userTeamId, state.agentRoleOverrides ?? {}, state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {}, state.disabledAgents ?? [], state.agentAbilities, state.matchSimConfig);
          
          const team1 = state.teams.find(t => t.id === matchup.team1Id);
          const team2 = state.teams.find(t => t.id === matchup.team2Id);
          const result = matchup.matchResults[0];
          if (team1 && team2 && result) {
            recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'regional');
            updateStandings(state.standings, result);
            // Generate news from notable performances
            const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
            if (!state.newsFeed) state.newsFeed = [];
            state.newsFeed.push(...newsItems);
          }
        }
      }

      advanceKickoffRound(bracket, state.currentBracketRound);
    }

    state.currentBracketRound++;
    state.currentDay++;
  }

  state.phase = 'international';
  state.internationalSource = 'kickoff';
  // award VCT championship points for kickoff placements
  const kickoffPts = awardKickoffPoints(state.kickoffBrackets);
  state.vctPoints = mergePoints(state.vctPoints ?? {}, kickoffPts);
  events.push({
    type: 'phase_change',
    message: 'Kickoff bracket complete! International tournament begins!',
  });

  return events;
}

/**
 * Get previous year's international qualifiers for a region (for seeding byes)
 */
function getPreviousQualifiers(state: GameState, region: Region): string[] {
  // find teams from this region that qualified for international last year
  return state.champions
    .filter(c => c.type === 'regional' && c.region === region && c.year === state.currentYear - 1)
    .map(c => c.teamId);
}

/**
 * Get RNG for a specific day
 */
function getDayRNG(state: GameState): ReturnType<typeof createRNG> {
  return createRNG(`${state.seed}-y${state.currentYear}-d${state.currentDay}`);
}

/**
 * Advance to the next day
 */
export function advanceDay(state: GameState, config: SeasonConfig = DEFAULT_SEASON_CONFIG): DayResult {
  const events: GameEvent[] = [];
  const matchesPlayed: MatchResult[] = [];
  const rng = getDayRNG(state);

  // decay fatigue daily
  if (state.fatigueLevel > 0) {
    state.fatigueLevel = Math.max(0, state.fatigueLevel - 1);
  }

  if (state.phase === 'preseason') {
    syncTournamentTypeFromHistory(state);
    state.phase = 'kickoff_bracket';
    state.currentBracketRound = 0;

    // generate brackets if not already done (legacy saves)
    for (const region of REGIONS) {
      if (!state.kickoffBrackets[region]) {
        const regionTeams = state.teams.filter(t => t.region === region);
        const seeds = seedRegion(regionTeams, getPreviousQualifiers(state, region), state.vctPoints);
        state.kickoffBrackets[region] = generateKickoffBracket(`${state.seed}-kickoff-${region}`, seeds);
      }
    }

    events.push({
      type: 'phase_change',
      message: `VCT ${state.currentYear} Kickoff has begun!`,
    });
    // Return here so the schedule page shows all matchups unplayed
    // User can then Watch/Sim individual matchups from the schedule
    state.currentDay++;
    return { day: state.currentDay, matchesPlayed, events };
  }
  
  if (state.phase === 'kickoff_bracket') {
    state.currentDay++;

    if (state.currentBracketRound >= BRACKET_ROUND_ORDER.length) {
      // bracket complete — move to international
      state.phase = 'international';
      state.internationalSource = 'kickoff';
      events.push({
        type: 'phase_change',
        message: 'Kickoff bracket complete! International tournament begins!',
      });
      return { day: state.currentDay, matchesPlayed, events };
    }

    const step = BRACKET_ROUND_ORDER[state.currentBracketRound];
    const isBigStage = isBigStageRound(state.currentBracketRound);
    const roundName = getRoundName(state.currentBracketRound);

    // play ALL remaining unplayed matchups in this round (auto-sim)
    for (const region of REGIONS) {
      const bracket = state.kickoffBrackets[region];
      if (!bracket) continue;

      const section = bracket[step.section];
      const round = section[step.roundIdx];

      // sim every unplayed matchup in this region's round
      for (const matchup of round.matchups) {
        if (!matchup.team1Id || !matchup.team2Id || matchup.winnerId) continue;

        const winnerId = simulatePlayoffMatchup(rng, matchup, state.teams, isBigStage, state.mapPool, state.agentMeta, state.mapMeta, state.agentVariance, state.teamMapComps ?? {}, state.userTeamId, state.agentRoleOverrides ?? {}, state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {}, state.disabledAgents ?? [], state.agentAbilities, state.matchSimConfig);
        const result = matchup.matchResults[matchup.matchResults.length - 1];

        const winner = state.teams.find(t => t.id === winnerId);
        const loserId = matchup.team1Id === winnerId ? matchup.team2Id : matchup.team1Id;
        const loser = state.teams.find(t => t.id === loserId);

        const team1 = state.teams.find(t => t.id === matchup.team1Id);
        const team2 = state.teams.find(t => t.id === matchup.team2Id);
        if (team1 && team2 && result) {
          recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'regional');
          updateStandings(state.standings, result);
          const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
          if (!state.newsFeed) state.newsFeed = [];
          state.newsFeed.push(...newsItems);
        }

        if (result) matchesPlayed.push(result);

        events.push({
          type: 'match_result',
          message: `[${region.toUpperCase()}] ${roundName}: ${winner?.abbreviation} def. ${loser?.abbreviation} ${result.homeScore}-${result.awayScore}`,
          data: result,
        });
      }
    }

    // check if ALL regions finished this round
    let allRegionsDone = true;
    for (const region of REGIONS) {
      const bracket = state.kickoffBrackets[region];
      if (!bracket) continue;
      const section = bracket[step.section];
      const round = section[step.roundIdx];
      if (round.matchups.some(m => m.team1Id && m.team2Id && !m.winnerId)) {
        allRegionsDone = false;
        break;
      }
    }

    if (allRegionsDone) {
      // advance bracket routing for all regions
      for (const region of REGIONS) {
        const bracket = state.kickoffBrackets[region];
        if (!bracket) continue;
        advanceKickoffRound(bracket, state.currentBracketRound);

        // check for new qualifiers
        const section = bracket[step.section];
        const round = section[step.roundIdx];
        for (const q of bracket.qualifiers) {
          const team = state.teams.find(t => t.id === q.teamId);
          const bracketLabel = q.bracket === 'upper' ? 'Upper Final' : q.bracket === 'middle' ? 'Middle Final' : 'Lower Final';
          const alreadyAnnounced = events.some(e => e.type === 'international_qualifier' && (e.data as any)?.teamId === q.teamId);
          if (team && !alreadyAnnounced) {
            const justQualified = round.matchups.some(m => m.winnerId === q.teamId);
            if (justQualified) {
              events.push({
                type: 'international_qualifier',
                message: `🏆 ${team.name} win the ${region.toUpperCase()} ${bracketLabel} and qualify for Champions!`,
                data: { teamId: q.teamId, region, seed: q.seed },
              });
            }
          }
        }
      }

      state.currentBracketRound++;

      // check if all brackets complete
      if (state.currentBracketRound >= BRACKET_ROUND_ORDER.length) {
        state.phase = 'international';
        state.internationalSource = 'kickoff';
        // award VCT championship points for kickoff placements
        const koPts = awardKickoffPoints(state.kickoffBrackets);
        state.vctPoints = mergePoints(state.vctPoints ?? {}, koPts);
        events.push({
          type: 'phase_change',
          message: 'All Kickoff brackets complete! VALORANT Champions begins!',
        });
      }
    }
  } else if (state.phase === 'international') {
    state.currentDay++;

    // initialize international tournament if needed
    if (!state.internationalTournament) {
      const qualifiedTeams: Array<{ teamId: string; region: Region; seed: number }> = [];

      const realCfg = state.realEventConfig;
      const useOverride = realCfg?.enabled && realCfg.slots.length > 0;

      if (useOverride) {
        // use manually configured real-world teams
        for (const slot of realCfg!.slots) {
          const team = state.teams.find(t => t.id === slot.teamId);
          if (!team) continue;
          qualifiedTeams.push({ teamId: slot.teamId, region: team.region, seed: slot.seed });
          events.push({
            type: 'international_qualifier',
            message: `${team.name} attends the event as ${team.region.toUpperCase()} #${slot.seed} seed`,
          });
        }
      } else {
        for (const region of REGIONS) {
          const regionSeeds = getInternationalSeeds(state, region, config.internationalQualifiers);
          regionSeeds.forEach(seed => {
            qualifiedTeams.push({ ...seed, region });
            const team = state.teams.find(t => t.id === seed.teamId);
            events.push({
              type: 'international_qualifier',
              message: `${team?.name} qualifies for Champions as ${region.toUpperCase()} #${seed.seed} seed`,
            });
          });
        }
      }

      const champBracket = generateChampionsBracket(
        `${state.seed}-champions-y${state.currentYear}`,
        qualifiedTeams,
        useOverride ? realCfg!.swissR1 : undefined,
      );

      state.internationalTournament = {
        name: 'VALORANT Champions',
        teams: qualifiedTeams,
        bracket: champBracket,
        champion: null,
      };
      state.currentChampionsRound = 0;

      events.push({
        type: 'phase_change',
        message: '🌍 VALORANT Champions begins!',
      });
      
      return { day: state.currentDay, matchesPlayed, events };
    }

    // simulate Champions tournament — 1 matchup per day click
    const champBracket = state.internationalTournament.bracket;
    const stepIdx = state.currentChampionsRound;

    if (stepIdx >= CHAMPIONS_ROUND_ORDER.length) {
      // tournament over
      return { day: state.currentDay, matchesPlayed, events };
    }

    const step = CHAMPIONS_ROUND_ORDER[stepIdx];
    let round: PlayoffRound | undefined;

    if (step.phase === 'swiss') {
      round = champBracket.swiss.rounds[step.roundIdx];
    } else if (step.phase === 'upper') {
      round = champBracket.upper[step.roundIdx];
    } else {
      round = champBracket.lower[step.roundIdx];
    }

    if (!round) {
      state.currentChampionsRound++;
      return { day: state.currentDay, matchesPlayed, events };
    }

    // sim ALL remaining unplayed matchups in this round (auto-sim)
    const isPlayoff = step.phase !== 'swiss';
    const roundName = getChampionsRoundName(stepIdx);

    for (const matchup of round.matchups) {
      if (!matchup.team1Id || !matchup.team2Id || matchup.winnerId) continue;

      const winnerId = simulatePlayoffMatchup(rng, matchup, state.teams, isPlayoff, state.mapPool, state.agentMeta, state.mapMeta, state.agentVariance, state.teamMapComps ?? {}, state.userTeamId, state.agentRoleOverrides ?? {}, state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {}, state.disabledAgents ?? [], state.agentAbilities, state.matchSimConfig);

      const winner = state.teams.find(t => t.id === winnerId);
      const loserId = matchup.team1Id === winnerId ? matchup.team2Id : matchup.team1Id;
      const loser = state.teams.find(t => t.id === loserId);
      const result = matchup.matchResults[0];
      
      const team1 = state.teams.find(t => t.id === matchup.team1Id);
      const team2 = state.teams.find(t => t.id === matchup.team2Id);
      if (team1 && team2 && result) {
        recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'international');
        updateStandings(state.standings, result);
        const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
        if (!state.newsFeed) state.newsFeed = [];
        state.newsFeed.push(...newsItems);
      }

      events.push({
        type: 'match_result',
        message: `[CHAMPIONS] ${roundName}: ${winner?.abbreviation} def. ${loser?.abbreviation} ${result.homeScore}-${result.awayScore}`,
        data: result,
      });

      if (result) matchesPlayed.push(result);
    }

    // All matchups resolved — advance round
    {
      const allDone = round.matchups.every(m => !m.team1Id || !m.team2Id || m.winnerId);

      if (allDone) {
        // advance round
        if (step.phase === 'swiss') {
          advanceSwissRound(champBracket, step.roundIdx, rng);
        } else {
          advanceChampionsPlayoffRound(champBracket, stepIdx);
        }

        // check for champion
        if (champBracket.champion) {
          state.internationalTournament.champion = champBracket.champion;

          const champion = state.teams.find(t => t.id === champBracket.champion);
          events.push({
            type: 'champion_crowned',
            message: `🏆🌍 ${champion?.name} are the VALORANT World Champions!`,
          });

          state.champions.push({
            year: state.currentYear,
            teamId: champBracket.champion,
            type: 'international',
          });

          // also record which teams qualified as "regional champions" for next year's seeding
          for (const region of REGIONS) {
            const bracket = state.kickoffBrackets[region];
            if (bracket) {
              for (const q of bracket.qualifiers) {
                state.champions.push({
                  year: state.currentYear,
                  teamId: q.teamId,
                  type: 'regional',
                  region,
                });
              }
            }
          }

          // award VCT championship points for international placements
          const intlPts2 = awardInternationalPoints(champBracket);
          state.vctPoints = mergePoints(state.vctPoints ?? {}, intlPts2);
          events.push(...handlePostInternational(state));
        } else {
          state.currentChampionsRound++;
        }
      } else {
        // TBD matchups only — skip to next round
        state.currentChampionsRound++;
      }
    }
  } else if (state.phase === 'offseason' || state.phase === 'mid_offseason') {
    state.currentDay++;
  } else if (state.phase === 'stage1_groups' || state.phase === 'stage2_groups') {
    state.currentDay++;
    const stageNum = state.currentStage;

    // auto-sim all unplayed group matches for the current matchday across all regions
    for (const region of REGIONS) {
      const gs = state.stageGroupStages[region]?.[stageNum];
      if (!gs || gs.complete) continue;

      for (const group of gs.groups) {
        for (const match of group.schedule) {
          if (match.played) continue;

          const team1 = state.teams.find(t => t.id === match.homeTeamId);
          const team2 = state.teams.find(t => t.id === match.awayTeamId);
          if (!team1 || !team2) continue;

          const matchRng = createRNG(`${state.seed}-gs-${match.id}`);
          const result = simulateMatch(
            matchRng, team1.id, team2.id, team1.roster, team2.roster, 'bo3',
            team1.startingLineup, team2.startingLineup, team1, team2, false,
            state.mapPool, state.agentMeta, state.mapMeta, state.agentVariance,
            state.teamMapComps ?? {}, state.userTeamId, state.agentRoleOverrides ?? {},
            state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {},
            state.disabledAgents ?? [], state.agentAbilities, state.matchSimConfig,
          );

          match.played = true;
          match.result = result;
          updateGroupStandings(group, result);

          recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, false, 'regional');
          updateStandings(state.standings, result);
          const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
          if (!state.newsFeed) state.newsFeed = [];
          state.newsFeed.push(...newsItems);

          matchesPlayed.push(result);

          const winner = result.homeScore > result.awayScore ? team1 : team2;
          const loser = result.homeScore > result.awayScore ? team2 : team1;
          events.push({
            type: 'match_result',
            message: `[${region.toUpperCase()}] ${group.name} Group: ${winner.abbreviation} def. ${loser.abbreviation} ${result.homeScore}-${result.awayScore}`,
            data: result,
          });
        }
      }

      if (isGroupStageComplete(gs)) gs.complete = true;
    }

    // check if ALL regions' group stages are complete
    const allGroupsDone = REGIONS.every(r => {
      const rgs = state.stageGroupStages[r]?.[stageNum];
      return !rgs || rgs.complete;
    });
    if (allGroupsDone) {
      events.push(...startStagePlayoffsPhase(state, stageNum));
    }

  } else if (state.phase === 'stage1_playoffs' || state.phase === 'stage2_playoffs') {
    state.currentDay++;
    const stageNum = state.currentStage;
    const stepIdx = state.currentStagePlayoffRound;

    if (stepIdx >= STAGE_PLAYOFF_ROUND_ORDER.length) {
      return { day: state.currentDay, matchesPlayed, events };
    }

    // auto-sim all matchups in this step across all regions
    for (const region of REGIONS) {
      const bracket = state.stagePlayoffBrackets[region]?.[stageNum];
      if (!bracket) continue;

      const round = getStagePlayoffRound(bracket, stepIdx);
      if (!round) continue;

      for (const matchup of round.matchups) {
        if (!matchup.team1Id || !matchup.team2Id || matchup.winnerId) continue;

        const matchRng = createRNG(`${state.seed}-sp-${matchup.id}`);
        const winnerId = simulatePlayoffMatchup(
          matchRng, matchup, state.teams, true, state.mapPool, state.agentMeta,
          state.mapMeta, state.agentVariance, state.teamMapComps ?? {},
          state.userTeamId, state.agentRoleOverrides ?? {},
          state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {},
          state.disabledAgents ?? [], state.agentAbilities,
        );
        const result = matchup.matchResults[matchup.matchResults.length - 1];

        const team1 = state.teams.find(t => t.id === matchup.team1Id);
        const team2 = state.teams.find(t => t.id === matchup.team2Id);
        if (team1 && team2 && result) {
          recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'regional');
          updateStandings(state.standings, result);
          const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
          if (!state.newsFeed) state.newsFeed = [];
          state.newsFeed.push(...newsItems);
        }

        if (result) matchesPlayed.push(result);

        const winner = state.teams.find(t => t.id === winnerId);
        const loserId = matchup.team1Id === winnerId ? matchup.team2Id : matchup.team1Id;
        const loser = state.teams.find(t => t.id === loserId);
        const roundName = getStagePlayoffRoundName(stepIdx);
        events.push({
          type: 'match_result',
          message: `[${region.toUpperCase()}] Stage ${stageNum} ${roundName}: ${winner?.abbreviation} def. ${loser?.abbreviation} ${result.homeScore}-${result.awayScore}`,
          data: result,
        });
      }
    }

    // check if step is complete across all regions and advance
    checkStagePlayoffRoundComplete(state, events);
  }

  return {
    day: state.currentDay,
    matchesPlayed,
    phaseChange: events.find(e => e.type === 'phase_change') ? state.phase : undefined,
    events,
  };
}

/**
 * Get current standings formatted
 */
export function getCurrentStandings(state: GameState): string {
  const sorted = sortStandings(state.standings);

  return sorted
    .map((entry, idx) => {
      const team = state.teams.find(t => t.id === entry.teamId);
      const name = team?.abbreviation ?? entry.teamId;
      return `${(idx + 1).toString().padStart(2)}. ${name.padEnd(5)} ${entry.wins}-${entry.losses}`;
    })
    .join('\n');
}

/** Collect all match awards from the current season's completed matchups */
export interface AwardTally {
  playerId: string;
  playerName: string;
  teamId: string;
  mvp: number;
  clutchKing: number;
  firstBlood: number;
  kdDiff: number;
  raidBoss: number;
  total: number;
}

export function collectSeasonAwards(state: GameState): AwardTally[] {
  const tally = new Map<string, AwardTally>();

  const ensure = (a: { playerId: string; playerName: string; teamId: string }) => {
    if (!tally.has(a.playerId)) {
      tally.set(a.playerId, {
        playerId: a.playerId, playerName: a.playerName, teamId: a.teamId,
        mvp: 0, clutchKing: 0, firstBlood: 0, kdDiff: 0, raidBoss: 0, total: 0,
      });
    }
    return tally.get(a.playerId)!;
  };

  // Gather all match results from all brackets
  const allResults: MatchResult[] = [];

  for (const region of ['americas', 'emea', 'pacific', 'china'] as Region[]) {
    const bracket = state.kickoffBrackets?.[region];
    if (bracket) {
      for (const section of ['upper', 'middle', 'lower'] as const) {
        for (const round of bracket[section] || []) {
          for (const matchup of round.matchups) {
            for (const mr of matchup.matchResults) allResults.push(mr);
          }
        }
      }
    }
  }

  const intl = state.internationalTournament;
  if (intl?.bracket) {
    const b = intl.bracket;
    // Swiss rounds
    for (const round of b.swiss?.rounds || []) {
      for (const matchup of round.matchups) {
        for (const mr of matchup.matchResults) allResults.push(mr);
      }
    }
    // Upper/lower brackets
    for (const section of ['upper', 'lower'] as const) {
      for (const round of b[section] || []) {
        for (const matchup of round.matchups) {
          for (const mr of matchup.matchResults) allResults.push(mr);
        }
      }
    }
  }

  // stage group results
  for (const region of ['americas', 'emea', 'pacific', 'china'] as Region[]) {
    for (const stageNum of [1, 2] as const) {
      const gs = state.stageGroupStages?.[region]?.[stageNum];
      if (!gs) continue;
      for (const group of gs.groups) {
        for (const match of group.schedule) {
          if (match.result) allResults.push(match.result);
        }
      }
    }
  }

  // stage playoff results
  for (const region of ['americas', 'emea', 'pacific', 'china'] as Region[]) {
    for (const stageNum of [1, 2] as const) {
      const bracket = state.stagePlayoffBrackets?.[region]?.[stageNum];
      if (!bracket) continue;
      for (const section of ['upper', 'lower'] as const) {
        for (const round of bracket[section] || []) {
          for (const matchup of round.matchups) {
            for (const mr of matchup.matchResults) allResults.push(mr);
          }
        }
      }
    }
  }

  // Tally awards
  for (const mr of allResults) {
    if (!mr.awards) continue;
    for (const award of mr.awards) {
      const t = ensure(award);
      switch (award.type) {
        case 'mvp': t.mvp++; break;
        case 'clutch_king': t.clutchKing++; break;
        case 'first_blood': t.firstBlood++; break;
        case 'kd_diff': t.kdDiff++; break;
        case 'raid_boss': t.raidBoss++; break;
      }
      t.total++;
    }
  }

  return Array.from(tally.values()).sort((a, b) => b.total - a.total);
}

// ── stage group/playoff helpers ──

// get kickoff finishing order for a region (used for pool draw seeding)
// returns teams sorted by placement: winner = seed 1, runner-up = seed 2, etc.
export function getKickoffFinishingOrder(state: GameState, region: Region): Array<{ teamId: string; seed: number }> {
  const bracket = state.kickoffBrackets[region];
  if (!bracket) {
    // fallback: use all region teams ordered by VCT points
    const regionTeams = state.teams.filter(t => t.region === region);
    const pts = state.vctPoints ?? {};
    return regionTeams
      .sort((a, b) => (pts[b.id] ?? 0) - (pts[a.id] ?? 0))
      .map((t, i) => ({ teamId: t.id, seed: i + 1 }));
  }

  // qualifiers are ordered by bracket position (upper > middle > lower)
  const qualified = bracket.qualifiers.map((q, i) => ({ teamId: q.teamId, seed: i + 1 }));

  // remaining teams: get all region teams not in qualifiers, order by VCT points
  const qualifiedIds = new Set(qualified.map(q => q.teamId));
  const remaining = state.teams
    .filter(t => t.region === region && !qualifiedIds.has(t.id))
    .sort((a, b) => (state.vctPoints?.[b.id] ?? 0) - (state.vctPoints?.[a.id] ?? 0))
    .map((t, i) => ({ teamId: t.id, seed: qualified.length + i + 1 }));

  return [...qualified, ...remaining];
}

// get stage finishing order for a region (for seeding stage 2 pool draw from stage 1)
export function getStageFinishingOrder(state: GameState, region: Region, stageNum: 1 | 2): Array<{ teamId: string; seed: number }> {
  const playoffs = state.stagePlayoffBrackets[region]?.[stageNum];
  const groups = state.stageGroupStages[region]?.[stageNum];
  if (!playoffs || !groups) return getKickoffFinishingOrder(state, region);

  const result: Array<{ teamId: string; seed: number }> = [];
  let seed = 1;

  // champion first
  if (playoffs.champion) {
    result.push({ teamId: playoffs.champion, seed: seed++ });
  }

  // qualified teams (in order — champion, runner-up, 3rd)
  for (const qId of playoffs.qualifiedTeams) {
    if (!result.find(r => r.teamId === qId)) {
      result.push({ teamId: qId, seed: seed++ });
    }
  }

  // remaining playoff teams (lost in bracket) — ordered by how far they got
  const allMatchups = [
    ...playoffs.upper.flatMap(r => r.matchups),
    ...playoffs.lower.flatMap(r => r.matchups),
  ];
  const playoffTeamIds = new Set<string>();
  for (const m of allMatchups) {
    if (m.team1Id) playoffTeamIds.add(m.team1Id);
    if (m.team2Id) playoffTeamIds.add(m.team2Id);
  }
  for (const id of playoffTeamIds) {
    if (!result.find(r => r.teamId === id)) {
      result.push({ teamId: id, seed: seed++ });
    }
  }

  // teams that didn't make playoffs — ordered by group standing
  for (const group of groups.groups) {
    const sorted = sortGroupStandings(group);
    for (const entry of sorted) {
      if (!result.find(r => r.teamId === entry.teamId)) {
        result.push({ teamId: entry.teamId, seed: seed++ });
      }
    }
  }

  return result;
}

// initialize group stages for all regions and transition to the groups phase
export function startStageGroupsPhase(state: GameState, stageNum: 1 | 2): GameEvent[] {
  const events: GameEvent[] = [];
  const phase: GamePhase = stageNum === 1 ? 'stage1_groups' : 'stage2_groups';
  state.phase = phase;
  state.currentStage = stageNum;
  // clear completed international so next one creates fresh
  state.internationalTournament = null;

  const seedFn = stageNum === 1
    ? (r: Region) => getKickoffFinishingOrder(state, r)
    : (r: Region) => getStageFinishingOrder(state, r, 1);

  for (const region of REGIONS) {
    const seeds = seedFn(region);
    if (seeds.length < 12) continue; // need 12 teams

    const manualOverride = state.stageGroupStages[region]?.[stageNum]?.manualGroups;
    const gs = generateGroupStage(
      `${state.seed}-stage${stageNum}-groups-${region}-${state.currentYear}`,
      region,
      seeds,
      manualOverride,
    );
    if (!state.stageGroupStages[region]) state.stageGroupStages[region] = {};
    (state.stageGroupStages[region] as any)[stageNum] = gs;
  }

  events.push({
    type: 'phase_change',
    message: `VCT ${state.currentYear} Stage ${stageNum} Group Stage begins!`,
  });

  return events;
}

// transition from completed group stage to stage playoffs
export function startStagePlayoffsPhase(state: GameState, stageNum: 1 | 2): GameEvent[] {
  const events: GameEvent[] = [];
  const phase: GamePhase = stageNum === 1 ? 'stage1_playoffs' : 'stage2_playoffs';
  state.phase = phase;
  state.currentStagePlayoffRound = 0;

  for (const region of REGIONS) {
    const gs = state.stageGroupStages[region]?.[stageNum];
    if (!gs) continue;

    const { alpha, omega } = getPlayoffQualifiers(gs);
    const bracket = generateStagePlayoffBracket(
      `${state.seed}-stage${stageNum}-playoffs-${region}-${state.currentYear}`,
      alpha,
      omega,
    );
    if (!state.stagePlayoffBrackets[region]) state.stagePlayoffBrackets[region] = {};
    (state.stagePlayoffBrackets[region] as any)[stageNum] = bracket;
  }

  events.push({
    type: 'phase_change',
    message: `VCT ${state.currentYear} Stage ${stageNum} Playoffs begin!`,
  });

  return events;
}

// determine what happens after international completes
// returns events generated during the transition
export function handlePostInternational(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const source = state.internationalSource ?? 'kickoff';

  if (source === 'stage2') {
    // final international of the year → full offseason
    state.phase = 'offseason';
    const progRng = createRNG(`${state.seed}-progression-${state.currentYear}-${Date.now()}`);
    state.offseasonProgression = processProgression(state, progRng);
    const churnSeed = `${state.seed}-churn-${state.currentYear}`;
    const churn = runOffseasonChurn(state.teams, state.freeAgents || [], state.kickoffBrackets, state.internationalTournament, state.userTeamId, churnSeed, state.churnConfig);
    state.teams = churn.updatedTeams;
    state.freeAgents = churn.updatedFreeAgents;
    state.offseasonChurnEvents = churn.events;

    // coach rating drift + replacement for sub-40 coaches
    const coachDriftRng = createRNG(`${state.seed}-coach-drift-${state.currentYear}`);
    for (const team of state.teams) {
      const coach = team.staff.headCoach;
      if (!coach) continue;
      // small gaussian drift each offseason
      let drift = 0;
      for (let i = 0; i < 4; i++) drift += coachDriftRng() - 0.5;
      drift *= 1.5;
      coach.rating = Math.max(30, Math.min(99, Math.round(coach.rating + drift)));
      // replace coaches below 40
      if (coach.rating < 40 && team.id !== state.userTeamId) {
        const replacement = generateCoach(coachDriftRng, { region: team.region });
        if (state.freeAgentCoaches) state.freeAgentCoaches.push({ ...coach });
        team.staff.headCoach = replacement;
      }
    }
    // add fresh coaches to FA pool each offseason
    const freshCoaches = generateCoachPool(coachDriftRng, 3);
    state.freeAgentCoaches = [...(state.freeAgentCoaches || []), ...freshCoaches];
    // compute season history
    if (!state.seasonHistory) state.seasonHistory = [];
    const histEntry = computeSeasonHistory(state);
    const tournType = state.currentTournamentType || 'champions';
    histEntry.id = `auto-${state.currentYear}-${tournType}`;
    histEntry.tournamentType = tournType;
    let existIdx = state.seasonHistory.findIndex(h =>
      h.year === histEntry.year && (h.tournamentType || 'champions') === tournType && !h.eventName
    );
    if (existIdx < 0) {
      existIdx = state.seasonHistory.findIndex(h =>
        h.year === histEntry.year && (h.tournamentType || 'champions') === tournType && !h.worldChampionId && !h.worldChampionCustom
      );
    }
    if (existIdx >= 0) {
      const prev = state.seasonHistory[existIdx];
      state.seasonHistory[existIdx] = {
        ...histEntry,
        id: prev.id || histEntry.id,
        eventName: prev.eventName || histEntry.eventName,
        location: prev.location || histEntry.location,
        locationFlag: prev.locationFlag || histEntry.locationFlag,
        dateRange: prev.dateRange || histEntry.dateRange,
        sortIndex: prev.sortIndex,
        isManual: false,
        manualStatus: undefined,
      };
    } else {
      state.seasonHistory.push(histEntry);
    }
    events.push({ type: 'phase_change', message: 'Season complete. Offseason begins.' });
  } else {
    // mid-season break → light transfer window
    // keep internationalTournament alive so sidebar tab + match detail still work
    state.phase = 'mid_offseason';
    state.internationalSource = source === 'kickoff' ? 'stage1' : 'stage2';
    events.push({
      type: 'phase_change',
      message: `International complete. Mid-season transfer window opens.`,
    });
  }

  return events;
}

// called when user clicks "Start Stage X" from mid_offseason
export function advanceFromMidOffseason(state: GameState): GameEvent[] {
  if (state.phase !== 'mid_offseason') return [];

  const nextSource = state.internationalSource ?? 'stage1';
  const stageNum: 1 | 2 = nextSource === 'stage1' ? 1 : 2;
  return startStageGroupsPhase(state, stageNum);
}

// simulate a single group stage match by its ID
export function simGroupStageMatch(
  state: GameState,
  matchId: string,
): { result: MatchResult | null; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const stageNum = state.currentStage;
  const phase = state.phase;
  if (phase !== 'stage1_groups' && phase !== 'stage2_groups') return { result: null, events };

  // find the match across all regions and groups
  for (const region of REGIONS) {
    const gs = state.stageGroupStages[region]?.[stageNum];
    if (!gs) continue;

    for (let gi = 0; gi < gs.groups.length; gi++) {
      const group = gs.groups[gi];
      const match = group.schedule.find(m => m.id === matchId);
      if (!match || match.played) continue;

      const team1 = state.teams.find(t => t.id === match.homeTeamId);
      const team2 = state.teams.find(t => t.id === match.awayTeamId);
      if (!team1 || !team2) return { result: null, events };

      const rng = createRNG(`${state.seed}-matchup-${matchId}`);
      const result = simulateMatch(
        rng, team1.id, team2.id, team1.roster, team2.roster, 'bo3',
        team1.startingLineup, team2.startingLineup, team1, team2, false,
        state.mapPool, state.agentMeta, state.mapMeta, state.agentVariance,
        state.teamMapComps ?? {}, state.userTeamId, state.agentRoleOverrides ?? {},
        state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {},
        state.disabledAgents ?? [], state.agentAbilities, state.matchSimConfig,
      );

      match.played = true;
      match.result = result;
      updateGroupStandings(group, result);

      // force new object references so React detects nested changes
      gs.groups = [...gs.groups] as [typeof gs.groups[0], typeof gs.groups[1]];
      state.stageGroupStages = { ...state.stageGroupStages };
      (state.stageGroupStages[region] as any) = { ...state.stageGroupStages[region] };
      (state.stageGroupStages[region] as any)[stageNum] = { ...gs };

      // record stats + news
      recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, false, 'regional');
      updateStandings(state.standings, result);
      const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
      if (!state.newsFeed) state.newsFeed = [];
      state.newsFeed.push(...newsItems);

      const winner = result.homeScore > result.awayScore ? team1 : team2;
      const loser = result.homeScore > result.awayScore ? team2 : team1;
      events.push({
        type: 'match_result',
        message: `[${region.toUpperCase()}] ${group.name} Group: ${winner.abbreviation} def. ${loser.abbreviation} ${result.homeScore}-${result.awayScore}`,
        data: result,
      });

      // check if all groups in this region are complete
      if (isGroupStageComplete(gs)) {
        gs.complete = true;
        // mark any other regions that finished without the flag being set
        for (const r of REGIONS) {
          const rgs = state.stageGroupStages[r]?.[stageNum];
          if (rgs && !rgs.complete && isGroupStageComplete(rgs)) rgs.complete = true;
        }
        // check if ALL regions' group stages are complete
        const allDone = REGIONS.every(r => {
          const rgs = state.stageGroupStages[r]?.[stageNum];
          return !rgs || rgs.complete;
        });
        if (allDone) {
          events.push(...startStagePlayoffsPhase(state, stageNum));
        }
      }

      return { result, events };
    }
  }

  return { result: null, events };
}

// simulate a single stage playoff matchup by its ID
export function simStagePlayoffMatchup(
  state: GameState,
  matchupId: string,
): { result: MatchResult | null; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const stageNum = state.currentStage;
  const phase = state.phase;
  if (phase !== 'stage1_playoffs' && phase !== 'stage2_playoffs') return { result: null, events };

  for (const region of REGIONS) {
    const bracket = state.stagePlayoffBrackets[region]?.[stageNum];
    if (!bracket) continue;

    const stepIdx = state.currentStagePlayoffRound;
    const round = getStagePlayoffRound(bracket, stepIdx);
    if (!round) continue;

    const matchup = round.matchups.find(m => m.id === matchupId);
    if (!matchup || matchup.winnerId || !matchup.team1Id || !matchup.team2Id) continue;

    const rng = createRNG(`${state.seed}-matchup-${matchupId}`);
    const isPlayoff = true;
    const winnerId = simulatePlayoffMatchup(
      rng, matchup, state.teams, isPlayoff, state.mapPool, state.agentMeta,
      state.mapMeta, state.agentVariance, state.teamMapComps ?? {},
      state.userTeamId, state.agentRoleOverrides ?? {},
      state.teamMapCompNoPenalty ?? {}, state.teamMapCompBuffs ?? {},
      state.disabledAgents ?? [], state.agentAbilities,
    );
    const result = matchup.matchResults[matchup.matchResults.length - 1];

    const team1 = state.teams.find(t => t.id === matchup.team1Id);
    const team2 = state.teams.find(t => t.id === matchup.team2Id);
    if (team1 && team2 && result) {
      recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'regional');
      updateStandings(state.standings, result);
      const newsItems = generateNewsFromMatch(result, state.teams, state.currentDay, state.currentYear, (state.recordBook ?? (state.recordBook = getDefaultRecordBook())));
      if (!state.newsFeed) state.newsFeed = [];
      state.newsFeed.push(...newsItems);
    }

    const winner = state.teams.find(t => t.id === winnerId);
    const loserId = matchup.team1Id === winnerId ? matchup.team2Id : matchup.team1Id;
    const loser = state.teams.find(t => t.id === loserId);
    const roundName = getStagePlayoffRoundName(stepIdx);
    events.push({
      type: 'match_result',
      message: `[${region.toUpperCase()}] Stage ${stageNum} ${roundName}: ${winner?.abbreviation} def. ${loser?.abbreviation} ${result.homeScore}-${result.awayScore}`,
      data: result,
    });

    // check if this round step is complete across all regions
    checkStagePlayoffRoundComplete(state, events);

    // force fresh references so React re-renders bracket view
    state.stagePlayoffBrackets = { ...state.stagePlayoffBrackets };
    (state.stagePlayoffBrackets[region] as any) = { ...state.stagePlayoffBrackets[region] };
    (state.stagePlayoffBrackets[region] as any)[stageNum] = { ...bracket };

    return { result, events };
  }

  return { result: null, events };
}

// check if the current stage playoff step is done across all regions
function checkStagePlayoffRoundComplete(state: GameState, events: GameEvent[]): void {
  const stageNum = state.currentStage;
  const stepIdx = state.currentStagePlayoffRound;

  for (const region of REGIONS) {
    const bracket = state.stagePlayoffBrackets[region]?.[stageNum];
    if (!bracket) continue;
    if (!isStepComplete(bracket, stepIdx)) return; // still pending
  }

  // all regions done — advance bracket routing
  for (const region of REGIONS) {
    const bracket = state.stagePlayoffBrackets[region]?.[stageNum];
    if (!bracket) continue;
    advanceStagePlayoffRound(bracket, stepIdx);

    // check for qualifications
    if (bracket.qualifiedTeams.length > 0) {
      for (const qId of bracket.qualifiedTeams) {
        const already = events.some(e => e.type === 'international_qualifier' && (e.data as any)?.teamId === qId);
        if (!already) {
          const team = state.teams.find(t => t.id === qId);
          if (team) {
            events.push({
              type: 'international_qualifier',
              message: `🏆 ${team.name} qualify for the international from Stage ${stageNum}!`,
              data: { teamId: qId, region: team.region, seed: bracket.qualifiedTeams.indexOf(qId) + 1 },
            });
          }
        }
      }
    }
  }

  state.currentStagePlayoffRound++;

  // check if all brackets are complete
  if (state.currentStagePlayoffRound >= STAGE_PLAYOFF_ROUND_ORDER.length) {
    // stage playoffs complete → transition to international
    state.phase = 'international';
    state.internationalTournament = null; // clear previous so advanceDay creates a new one
    state.currentChampionsRound = 0;
    state.internationalSource = stageNum === 1 ? 'stage1' : 'stage2';
    events.push({
      type: 'phase_change',
      message: `Stage ${stageNum} Playoffs complete! International tournament begins!`,
    });
  }
}

// get all stage group matchups for the current matchday (for schedule page)
export function getStageGroupMatchups(state: GameState): TodayMatchup[] {
  const matchups: TodayMatchup[] = [];
  const stageNum = state.currentStage;

  for (const region of REGIONS) {
    const gs = state.stageGroupStages[region]?.[stageNum];
    if (!gs) continue;

    for (const group of gs.groups) {
      for (const match of group.schedule) {
        matchups.push({
          matchupId: match.id,
          team1Id: match.homeTeamId,
          team2Id: match.awayTeamId,
          region,
          roundName: `${group.name} Group Day ${match.matchday}`,
          format: 'bo3',
          played: match.played,
          winnerId: match.result
            ? (match.result.homeScore > match.result.awayScore ? match.homeTeamId : match.awayTeamId)
            : null,
          result: match.result,
        });
      }
    }
  }

  return matchups;
}

// get all stage playoff matchups for the current step (for schedule page)
export function getStagePlayoffMatchups(state: GameState): TodayMatchup[] {
  const matchups: TodayMatchup[] = [];
  const stageNum = state.currentStage;
  const stepIdx = state.currentStagePlayoffRound;

  for (const region of REGIONS) {
    const bracket = state.stagePlayoffBrackets[region]?.[stageNum];
    if (!bracket) continue;

    const round = getStagePlayoffRound(bracket, stepIdx);
    if (!round) continue;
    const roundName = getStagePlayoffRoundName(stepIdx);

    for (const m of round.matchups) {
      matchups.push({
        matchupId: m.id,
        team1Id: m.team1Id,
        team2Id: m.team2Id,
        region,
        roundName: `Stage ${stageNum} ${roundName}`,
        format: m.format,
        played: !!m.winnerId,
        winnerId: m.winnerId,
        result: m.matchResults.length > 0 ? m.matchResults[m.matchResults.length - 1] : null,
      });
    }
  }

  return matchups;
}
// return all scheduled matches across regular season + stage groups
export function getAllPlayedMatches(state: GameState): ScheduledMatch[] {
  const matches = [...state.schedule];

  const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
  for (const region of regions) {
    for (const stageNum of [1, 2] as const) {
      const gs = state.stageGroupStages?.[region]?.[stageNum];
      if (!gs) continue;
      for (const group of gs.groups ?? []) {
        for (const m of group.schedule ?? []) {
          matches.push(m);
        }
      }
    }
  }

  return matches;
}
