// src/sim/gameState.ts
// Core game state management with regional leagues and international competition
// Updated for 12 teams per region with 6-team playoffs

import type { Team, StandingsEntry, MatchResult, PlayoffBracket, PlayoffMatchup, PlayoffRound, Region, Player } from '../types';
import { createRNG, generateId, shuffle } from '../utils/random';
import { simulateMatch } from './matchSim';
import { recordMatchStats } from './matchRecorder';

/**
 * Game phase - now includes international competition
 */
export type GamePhase =
  | 'preseason'
  | 'regular_season'
  | 'regional_playoffs'
  | 'international'
  | 'offseason';

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
 * International tournament bracket
 */
export interface InternationalTournament {
  name: string;
  teams: Array<{ teamId: string; region: Region; seed: number }>;
  bracket: PlayoffBracket;
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

  // Teams
  teams: Team[];
  userTeamId: string | null;

  // Season data
  schedule: ScheduledMatch[];
  standings: StandingsEntry[];
  
  // Regional playoffs (one per region)
  regionalPlayoffs: Record<Region, PlayoffBracket | null>;
  currentPlayoffSeries: PlayoffSeries | null;
  currentPlayoffRegion: Region | null;
  regionalChampions: Record<Region, string | null>;

  // International competition
  internationalTournament: InternationalTournament | null;
  internationalPlayoffSeries: PlayoffSeries | null;

  // History
  champions: Array<{ year: number; teamId: string; type: 'regional' | 'international'; region?: Region }>;

  // Free agency
  freeAgents?: Player[];

  // RNG
  seed: string;
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
  type: 'match_result' | 'phase_change' | 'playoff_advance' | 'champion_crowned' | 'international_qualifier';
  message: string;
  data?: unknown;
}

/**
 * Season configuration
 */
export interface SeasonConfig {
  year: number;
  gamesPerTeam: number;
  playoffTeams: number; // Per region
  playoffFormat: 'bo3' | 'bo5';
  internationalQualifiers: number; // Top N from each region go to international
}

export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  year: 2025,
  gamesPerTeam: 11, // Single round-robin with 12 teams = 11 games
  playoffTeams: 6,  // Top 6 from each region
  playoffFormat: 'bo5',
  internationalQualifiers: 3, // Top 3 from each region
};

const REGIONS: Region[] = ['americas', 'emea', 'pacific', 'china'];

/**
 * Initialize standings for all teams
 */
export function initializeStandings(teams: Team[]): StandingsEntry[] {
  return teams.map(team => ({
    teamId: team.id,
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
 * Get international seeds from playoff results
 * #1 = Regional Champion
 * #2 = Finals loser
 * #3 = Best semifinal loser (by regular season standing)
 */
export function getInternationalSeeds(
  state: GameState,
  region: Region,
  numQualifiers: number
): Array<{ teamId: string; seed: number }> {
  const bracket = state.regionalPlayoffs[region];
  if (!bracket) return [];

  const seeds: Array<{ teamId: string; seed: number }> = [];
  
  // Get finals
  const finals = bracket.rounds.find(r => r.name === 'Finals');
  if (!finals || finals.matchups.length === 0) return [];
  
  const finalsMatchup = finals.matchups[0];
  
  // #1 seed = Champion
  if (finalsMatchup.winnerId) {
    seeds.push({ teamId: finalsMatchup.winnerId, seed: 1 });
  }
  
  // #2 seed = Finals loser
  if (numQualifiers >= 2 && finalsMatchup.winnerId) {
    const loserId = finalsMatchup.team1Id === finalsMatchup.winnerId 
      ? finalsMatchup.team2Id 
      : finalsMatchup.team1Id;
    if (loserId) {
      seeds.push({ teamId: loserId, seed: 2 });
    }
  }
  
  // #3 seed = Winner of 3rd place match
  if (numQualifiers >= 3) {
    const thirdPlace = bracket.rounds.find(r => r.name === '3rd Place Match');
    if (thirdPlace && thirdPlace.matchups[0]?.winnerId) {
      seeds.push({ teamId: thirdPlace.matchups[0].winnerId, seed: 3 });
    } else {
      // Fallback: Best semifinal loser by regular season standing (if 3rd place match not yet played)
      const semis = bracket.rounds.find(r => r.name === 'Semi-Finals');
      if (semis) {
        const semiLosers: string[] = [];
        for (const matchup of semis.matchups) {
          if (matchup.winnerId) {
            const loserId = matchup.team1Id === matchup.winnerId 
              ? matchup.team2Id 
              : matchup.team1Id;
            if (loserId) semiLosers.push(loserId);
          }
        }
        
        // Sort by regular season standing
        const regionTeamIds = new Set(state.teams.filter(t => t.region === region).map(t => t.id));
        const regionStandings = sortStandings(
          state.standings.filter(s => regionTeamIds.has(s.teamId))
        );
        
        const bestLoser = semiLosers.sort((a, b) => {
          const aIdx = regionStandings.findIndex(s => s.teamId === a);
          const bIdx = regionStandings.findIndex(s => s.teamId === b);
          return aIdx - bIdx;
        })[0];
        
        if (bestLoser) {
          seeds.push({ teamId: bestLoser, seed: 3 });
        }
      }
    }
  }
  
  return seeds;
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
  teams: Team[]
): string {
  if (!matchup.team1Id || !matchup.team2Id) {
    throw new Error('Matchup teams not set');
  }

  const team1 = teams.find(t => t.id === matchup.team1Id);
  const team2 = teams.find(t => t.id === matchup.team2Id);

  if (!team1 || !team2) {
    throw new Error('Team not found');
  }

  const result = simulateMatch(rng, team1.id, team2.id, team1.roster, team2.roster, matchup.format, team1.startingLineup, team2.startingLineup, team1, team2);

  matchup.matchResults.push(result);
  matchup.winnerId = result.homeScore > result.awayScore ? team1.id : team2.id;

  return matchup.winnerId;
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
  config: SeasonConfig = DEFAULT_SEASON_CONFIG
): GameState {
  const schedule = generateSchedule(seed, teams, config.gamesPerTeam);

  return {
    currentDay: 0,
    currentYear: config.year,
    phase: 'preseason',
    teams,
    userTeamId,
    schedule,
    standings: initializeStandings(teams),
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
    champions: [],
    seed,
  };
}

/**
 * Skip the regular season and simulate all matches to go directly to playoffs
 */
export function skipToPlayoffs(state: GameState, config: SeasonConfig = DEFAULT_SEASON_CONFIG): GameEvent[] {
  const events: GameEvent[] = [];
  
  // Only allow skipping during preseason or regular season
  if (state.phase !== 'preseason' && state.phase !== 'regular_season') {
    return events;
  }

  // Simulate all remaining regular season matches
  const remainingMatches = state.schedule.filter(m => !m.played);
  
  for (const match of remainingMatches) {
    const rng = createRNG(`${state.seed}-skip-${match.id}`);
    const homeTeam = state.teams.find(t => t.id === match.homeTeamId);
    const awayTeam = state.teams.find(t => t.id === match.awayTeamId);
    
    if (!homeTeam || !awayTeam) continue;
    
    const result = simulateMatch(rng, match.homeTeamId, match.awayTeamId, homeTeam.roster, awayTeam.roster, 'bo3', homeTeam.startingLineup, awayTeam.startingLineup, homeTeam, awayTeam);
    match.result = result;
    match.played = true;
    updateStandings(state.standings, result);
    
    // Record player stats
    recordMatchStats(result, homeTeam, awayTeam, match.day, state.currentYear, false);
  }

  // Set the day to the last match day
  const maxDay = Math.max(...state.schedule.map(m => m.day));
  state.currentDay = maxDay;

  // Generate playoff brackets
  const rng = createRNG(`${state.seed}-playoffs`);
  state.phase = 'regional_playoffs';
  
  for (const region of REGIONS) {
    const playoffTeams = getRegionalPlayoffTeams(state.standings, state.teams, region, config.playoffTeams);
    if (playoffTeams.length >= 4) {
      state.regionalPlayoffs[region] = generatePlayoffBracket(rng, playoffTeams, config.playoffFormat);
    }
  }
  
  // Start with first region that has playoffs
  state.currentPlayoffRegion = REGIONS.find(r => state.regionalPlayoffs[r] !== null) || null;
  if (state.currentPlayoffRegion) {
    state.currentPlayoffSeries = { roundIndex: 0, matchupIndex: 0, completed: false };
  }

  events.push({
    type: 'phase_change',
    message: 'Skipped to playoffs! Regional playoffs begin!',
  });

  return events;
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

  if (state.phase === 'preseason') {
    state.phase = 'regular_season';
    events.push({
      type: 'phase_change',
      message: `Season ${state.currentYear} has begun!`,
    });
    // Fall through to regular_season to play day 1
  }
  
  if (state.phase === 'regular_season') {
    state.currentDay++;

    // Get today's matches
    const todaysMatches = state.schedule.filter(m => m.day === state.currentDay && !m.played);

    for (const match of todaysMatches) {
      const homeTeam = state.teams.find(t => t.id === match.homeTeamId);
      const awayTeam = state.teams.find(t => t.id === match.awayTeamId);

      if (!homeTeam || !awayTeam) continue;

      const result = simulateMatch(rng, homeTeam.id, awayTeam.id, homeTeam.roster, awayTeam.roster, 'bo3', homeTeam.startingLineup, awayTeam.startingLineup, homeTeam, awayTeam);

      match.played = true;
      match.result = result;

      updateStandings(state.standings, result);
      matchesPlayed.push(result);
      
      // Record player stats
      recordMatchStats(result, homeTeam, awayTeam, state.currentDay, state.currentYear, false);

      const winner = result.homeScore > result.awayScore ? homeTeam : awayTeam;
      const loser = result.homeScore > result.awayScore ? awayTeam : homeTeam;
      const region = homeTeam.region.toUpperCase();

      events.push({
        type: 'match_result',
        message: `[${region}] ${winner.abbreviation} def. ${loser.abbreviation} ${result.homeScore}-${result.awayScore}`,
        data: result,
      });
    }

    // Check if regular season is over - ALL matches must be played
    const remainingMatches = state.schedule.filter(m => !m.played);
    if (remainingMatches.length === 0) {
      state.phase = 'regional_playoffs';
      
      // Generate playoff brackets for each region
      for (const region of REGIONS) {
        const playoffTeams = getRegionalPlayoffTeams(state.standings, state.teams, region, config.playoffTeams);
        if (playoffTeams.length >= 4) {
          state.regionalPlayoffs[region] = generatePlayoffBracket(rng, playoffTeams, config.playoffFormat);
        }
      }
      
      // Start with first region that has playoffs
      state.currentPlayoffRegion = REGIONS.find(r => state.regionalPlayoffs[r] !== null) || null;
      if (state.currentPlayoffRegion) {
        state.currentPlayoffSeries = { roundIndex: 0, matchupIndex: 0, completed: false };
      }

      events.push({
        type: 'phase_change',
        message: 'Regular season complete! Regional playoffs begin!',
      });
    }
  } else if (state.phase === 'regional_playoffs') {
    state.currentDay++;
    
    if (!state.currentPlayoffRegion || !state.currentPlayoffSeries) {
      // Move to international
      state.phase = 'international';
      events.push({ type: 'phase_change', message: 'Regional playoffs complete!' });
      return { day: state.currentDay, matchesPlayed, events };
    }

    const bracket = state.regionalPlayoffs[state.currentPlayoffRegion];
    if (!bracket) {
      // Move to next region or international
      moveToNextRegionOrInternational(state, events);
      return { day: state.currentDay, matchesPlayed, events };
    }

    const { roundIndex, matchupIndex } = state.currentPlayoffSeries;
    const round = bracket.rounds[roundIndex];
    const matchup = round.matchups[matchupIndex];

    if (matchup.team1Id && matchup.team2Id && !matchup.winnerId) {
      const winnerId = simulatePlayoffMatchup(rng, matchup, state.teams);

      const winner = state.teams.find(t => t.id === winnerId);
      const loser = state.teams.find(t => t.id === (matchup.team1Id === winnerId ? matchup.team2Id : matchup.team1Id));
      const result = matchup.matchResults[0];
      
      // Record player stats for playoff match
      const team1 = state.teams.find(t => t.id === matchup.team1Id);
      const team2 = state.teams.find(t => t.id === matchup.team2Id);
      if (team1 && team2 && result) {
        recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'regional');
      }

      events.push({
        type: 'match_result',
        message: `[${state.currentPlayoffRegion.toUpperCase()}] ${round.name}: ${winner?.abbreviation} def. ${loser?.abbreviation} ${result.homeScore}-${result.awayScore}`,
        data: result,
      });

      if (result) matchesPlayed.push(result);

      // Move to next matchup or round
      if (matchupIndex < round.matchups.length - 1) {
        state.currentPlayoffSeries.matchupIndex++;
      } else {
        // Use regional bracket advancement for 6-team brackets
        advanceRegionalBracket(bracket, roundIndex);
        
        if (roundIndex < bracket.rounds.length - 1) {
          state.currentPlayoffSeries = { roundIndex: roundIndex + 1, matchupIndex: 0, completed: false };
        } else {
          // Region playoffs complete
          const finals = bracket.rounds[bracket.rounds.length - 1];
          const championId = finals.matchups[0].winnerId;
          state.regionalChampions[state.currentPlayoffRegion] = championId;
          
          const champion = state.teams.find(t => t.id === championId);
          events.push({
            type: 'champion_crowned',
            message: `🏆 ${champion?.name} are the ${state.currentPlayoffRegion.toUpperCase()} Champions!`,
          });
          
          state.champions.push({ 
            year: state.currentYear, 
            teamId: championId!, 
            type: 'regional', 
            region: state.currentPlayoffRegion 
          });

          // Move to next region or international
          moveToNextRegionOrInternational(state, events);
        }
      }
    }
  } else if (state.phase === 'international') {
    state.currentDay++;

    // Initialize international tournament if needed
    if (!state.internationalTournament) {
      const qualifiedTeams: Array<{ teamId: string; region: Region; seed: number }> = [];
      
      for (const region of REGIONS) {
        // Get seeds from playoff results (not regular season!)
        const regionSeeds = getInternationalSeeds(state, region, config.internationalQualifiers);
        regionSeeds.forEach(seed => {
          qualifiedTeams.push({
            ...seed,
            region,
          });
          
          const team = state.teams.find(t => t.id === seed.teamId);
          events.push({
            type: 'international_qualifier',
            message: `${team?.name} qualifies for Champions as ${region.toUpperCase()} #${seed.seed} seed`,
          });
        });
      }

      state.internationalTournament = {
        name: 'VALORANT Champions',
        teams: qualifiedTeams,
        bracket: generateInternationalBracket(rng, qualifiedTeams, config.playoffFormat),
        champion: null,
      };
      state.internationalPlayoffSeries = { roundIndex: 0, matchupIndex: 0, completed: false };

      events.push({
        type: 'phase_change',
        message: '🌍 VALORANT Champions begins!',
      });
      
      return { day: state.currentDay, matchesPlayed, events };
    }

    // Simulate international tournament
    const bracket = state.internationalTournament.bracket;
    const series = state.internationalPlayoffSeries!;
    const { roundIndex, matchupIndex } = series;
    const round = bracket.rounds[roundIndex];
    const matchup = round.matchups[matchupIndex];

    if (matchup.team1Id && matchup.team2Id && !matchup.winnerId) {
      const winnerId = simulatePlayoffMatchup(rng, matchup, state.teams);

      const winner = state.teams.find(t => t.id === winnerId);
      const loser = state.teams.find(t => t.id === (matchup.team1Id === winnerId ? matchup.team2Id : matchup.team1Id));
      const result = matchup.matchResults[0];
      
      // Record player stats for international match
      const team1 = state.teams.find(t => t.id === matchup.team1Id);
      const team2 = state.teams.find(t => t.id === matchup.team2Id);
      if (team1 && team2 && result) {
        recordMatchStats(result, team1, team2, state.currentDay, state.currentYear, true, 'international');
      }

      events.push({
        type: 'match_result',
        message: `[CHAMPIONS] ${round.name}: ${winner?.abbreviation} def. ${loser?.abbreviation} ${result.homeScore}-${result.awayScore}`,
        data: result,
      });

      if (result) matchesPlayed.push(result);

      // Move to next matchup or round
      if (matchupIndex < round.matchups.length - 1) {
        series.matchupIndex++;
      } else {
        // Special handling for play-ins -> quarterfinals
        if (round.name === 'Play-Ins') {
          advanceInternationalPlayIns(bracket);
        } else {
          advancePlayoffBracket(bracket, roundIndex);
        }

        if (roundIndex < bracket.rounds.length - 1) {
          state.internationalPlayoffSeries = { roundIndex: roundIndex + 1, matchupIndex: 0, completed: false };
        } else {
          // Tournament complete!
          const finals = bracket.rounds[bracket.rounds.length - 1];
          const championId = finals.matchups[0].winnerId;
          state.internationalTournament.champion = championId;

          const champion = state.teams.find(t => t.id === championId);
          events.push({
            type: 'champion_crowned',
            message: `🏆🌍 ${champion?.name} are the VALORANT World Champions!`,
          });

          state.champions.push({
            year: state.currentYear,
            teamId: championId!,
            type: 'international',
          });

          state.phase = 'offseason';
          events.push({
            type: 'phase_change',
            message: 'Season complete. Offseason begins.',
          });
        }
      }
    } else if (!matchup.team1Id || !matchup.team2Id) {
      // Skip this matchup if teams aren't set yet (waiting for previous round)
      if (matchupIndex < round.matchups.length - 1) {
        series.matchupIndex++;
      }
    }
  } else if (state.phase === 'offseason') {
    state.currentDay++;
    // Future: handle draft, free agency, player development
  }

  return {
    day: state.currentDay,
    matchesPlayed,
    phaseChange: events.find(e => e.type === 'phase_change') ? state.phase : undefined,
    events,
  };
}

/**
 * Helper to move to next region's playoffs or to international
 */
function moveToNextRegionOrInternational(state: GameState, events: GameEvent[]): void {
  const currentIdx = state.currentPlayoffRegion ? REGIONS.indexOf(state.currentPlayoffRegion) : -1;
  
  // Find next region with playoffs
  for (let i = currentIdx + 1; i < REGIONS.length; i++) {
    if (state.regionalPlayoffs[REGIONS[i]]) {
      state.currentPlayoffRegion = REGIONS[i];
      state.currentPlayoffSeries = { roundIndex: 0, matchupIndex: 0, completed: false };
      events.push({
        type: 'phase_change',
        message: `${REGIONS[i].toUpperCase()} Regional Playoffs begin!`,
      });
      return;
    }
  }
  
  // No more regions - move to international
  state.currentPlayoffRegion = null;
  state.currentPlayoffSeries = null;
  state.phase = 'international';
  events.push({
    type: 'phase_change',
    message: 'All regional playoffs complete! International tournament begins!',
  });
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