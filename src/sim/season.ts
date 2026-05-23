// src/sim/season.ts
// Season management - schedule, standings, playoffs

import type { RNG } from '../utils/random';
import type { Team, Season, StandingsEntry, MatchResult, PlayoffBracket, PlayoffMatchup, PlayoffRound } from '../types';
import { generateId, shuffle } from '../utils/random';
import { simulateMatch } from './matchSim';

/**
 * Season configuration
 */
export interface SeasonConfig {
  year: number;
  gamesPerTeam: number;
  playoffTeams: number;
  playoffFormat: 'bo3' | 'bo5';
}

export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  year: 2026,
  gamesPerTeam: 10,
  playoffTeams: 4,
  playoffFormat: 'bo5',
};

/**
 * Scheduled match (not yet played)
 */
interface ScheduledMatch {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  format: 'bo1' | 'bo3' | 'bo5';
  date: number;
  played: boolean;
  result?: MatchResult;
}

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
 * Generate a round-robin schedule
 */
export function generateSchedule(
  rng: RNG,
  teams: Team[],
  gamesPerTeam: number
): ScheduledMatch[] {
  const schedule: ScheduledMatch[] = [];
  const matchups: Array<{ home: string; away: string }> = [];

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matchups.push({ home: teams[i].id, away: teams[j].id });
      matchups.push({ home: teams[j].id, away: teams[i].id });
    }
  }

  shuffle(rng, matchups);

  const gamesPlayed: Record<string, number> = {};
  teams.forEach(t => (gamesPlayed[t.id] = 0));

  // Collect valid matchups first
  const validMatchups: Array<{ home: string; away: string }> = [];
  
  for (const matchup of matchups) {
    if (gamesPlayed[matchup.home] >= gamesPerTeam || gamesPlayed[matchup.away] >= gamesPerTeam) {
      continue;
    }
    
    validMatchups.push(matchup);
    gamesPlayed[matchup.home]++;
    gamesPlayed[matchup.away]++;
  }

  // Now assign consecutive days, with multiple matches per day possible
  const matchesPerDay = Math.max(1, Math.floor(teams.length / 2)); // 4 matches per day for 8 teams
  let currentDay = 1;
  
  for (let i = 0; i < validMatchups.length; i++) {
    const matchup = validMatchups[i];
    
    schedule.push({
      id: generateId(rng, 'match_'),
      homeTeamId: matchup.home,
      awayTeamId: matchup.away,
      format: 'bo3',
      date: currentDay,
      played: false,
    });
    
    // Move to next day after matchesPerDay games
    if ((i + 1) % matchesPerDay === 0) {
      currentDay++;
    }
  }

  return schedule;
}

/**
 * Update standings after a match
 */
export function updateStandings(standings: StandingsEntry[], match: MatchResult): void {
  const homeEntry = standings.find(s => s.teamId === match.homeTeamId);
  const awayEntry = standings.find(s => s.teamId === match.awayTeamId);

  if (!homeEntry || !awayEntry) {
    console.warn('Team not found in standings');
    return;
  }

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
 * Get playoff seeds from standings
 */
export function getPlayoffTeams(standings: StandingsEntry[], numTeams: number): StandingsEntry[] {
  return sortStandings(standings).slice(0, numTeams);
}

/**
 * Generate playoff bracket
 */
export function generatePlayoffBracket(
  rng: RNG,
  playoffTeams: StandingsEntry[],
  format: 'bo3' | 'bo5'
): PlayoffBracket {
  const rounds: PlayoffRound[] = [];

  if (playoffTeams.length === 4) {
    // Semifinals: 1v4, 2v3
    rounds.push({
      name: 'Semifinals',
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
  } else if (playoffTeams.length === 8) {
    // Quarterfinals: 1v8, 4v5, 2v7, 3v6
    rounds.push({
      name: 'Quarterfinals',
      matchups: [
        { id: generateId(rng, 'po_'), team1Id: playoffTeams[0].teamId, team2Id: playoffTeams[7].teamId, winnerId: null, matchResults: [], format },
        { id: generateId(rng, 'po_'), team1Id: playoffTeams[3].teamId, team2Id: playoffTeams[4].teamId, winnerId: null, matchResults: [], format },
        { id: generateId(rng, 'po_'), team1Id: playoffTeams[1].teamId, team2Id: playoffTeams[6].teamId, winnerId: null, matchResults: [], format },
        { id: generateId(rng, 'po_'), team1Id: playoffTeams[2].teamId, team2Id: playoffTeams[5].teamId, winnerId: null, matchResults: [], format },
      ],
    });

    // Semifinals
    rounds.push({
      name: 'Semifinals',
      matchups: [
        { id: generateId(rng, 'po_'), team1Id: null, team2Id: null, winnerId: null, matchResults: [], format },
        { id: generateId(rng, 'po_'), team1Id: null, team2Id: null, winnerId: null, matchResults: [], format },
      ],
    });

    // Finals
    rounds.push({
      name: 'Finals',
      matchups: [
        { id: generateId(rng, 'po_'), team1Id: null, team2Id: null, winnerId: null, matchResults: [], format },
      ],
    });
  }

  return { format: 'single_elimination', rounds };
}

/**
 * Simulate a playoff matchup
 */
export function simulatePlayoffMatchup(rng: RNG, matchup: PlayoffMatchup, teams: Team[]): string {
  if (!matchup.team1Id || !matchup.team2Id) {
    throw new Error('Matchup teams not set');
  }

  const team1 = teams.find(t => t.id === matchup.team1Id);
  const team2 = teams.find(t => t.id === matchup.team2Id);

  if (!team1 || !team2) {
    throw new Error('Team not found');
  }

  const result = simulateMatch(rng, team1.id, team2.id, team1.roster, team2.roster, matchup.format, team1.startingLineup, team2.startingLineup, team1, team2, true);

  matchup.matchResults.push(result);
  matchup.winnerId = result.homeScore > result.awayScore ? team1.id : team2.id;

  return matchup.winnerId;
}

/**
 * Advance winners to next round
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
      nextRound.matchups[nextIdx].team1Id = winner1 ?? null;
      nextRound.matchups[nextIdx].team2Id = winner2 ?? null;
    }
  }
}

/**
 * Simulate a complete season
 */
export function simulateFullSeason(
  rng: RNG,
  teams: Team[],
  config: SeasonConfig = DEFAULT_SEASON_CONFIG
): Season {
  // Generate schedule
  const schedule = generateSchedule(rng, teams, config.gamesPerTeam);
  const standings = initializeStandings(teams);
  const completedMatches: MatchResult[] = [];

  // Simulate all regular season matches
  for (const match of schedule) {
    const homeTeam = teams.find(t => t.id === match.homeTeamId);
    const awayTeam = teams.find(t => t.id === match.awayTeamId);

    if (!homeTeam || !awayTeam) continue;

    const result = simulateMatch(rng, homeTeam.id, awayTeam.id, homeTeam.roster, awayTeam.roster, 'bo3', homeTeam.startingLineup, awayTeam.startingLineup, homeTeam, awayTeam);

    match.played = true;
    match.result = result;

    updateStandings(standings, result);
    completedMatches.push(result);
  }

  // Generate playoffs
  const playoffTeams = getPlayoffTeams(standings, config.playoffTeams);
  const playoffBracket = generatePlayoffBracket(rng, playoffTeams, config.playoffFormat);

  // Simulate playoffs round by round
  for (let roundIdx = 0; roundIdx < playoffBracket.rounds.length; roundIdx++) {
    const round = playoffBracket.rounds[roundIdx];

    // Simulate all matchups in this round
    for (const matchup of round.matchups) {
      if (matchup.team1Id && matchup.team2Id) {
        simulatePlayoffMatchup(rng, matchup, teams);
      }
    }

    // Advance winners to next round
    if (roundIdx < playoffBracket.rounds.length - 1) {
      advancePlayoffBracket(playoffBracket, roundIdx);
    }
  }

  // Get champion from finals
  const finals = playoffBracket.rounds[playoffBracket.rounds.length - 1];
  const champion = finals?.matchups[0]?.winnerId ?? null;

  return {
    year: config.year,
    phase: 'offseason',
    currentDay: schedule.length,
    standings,
    schedule: completedMatches,
    completedMatches: completedMatches.length,
    playoffBracket,
    champion,
  };
}

/**
 * Format standings for display
 */
export function formatStandings(standings: StandingsEntry[], teams: Team[]): string {
  const sorted = sortStandings(standings);

  return sorted
    .map((entry, idx) => {
      const team = teams.find(t => t.id === entry.teamId);
      const name = team?.abbreviation ?? team?.name ?? entry.teamId;
      const mapDiff = entry.mapWins - entry.mapLosses;
      const mapDiffStr = mapDiff >= 0 ? `+${mapDiff}` : `${mapDiff}`;
      const rdStr = entry.roundDifferential >= 0 ? `+${entry.roundDifferential}` : `${entry.roundDifferential}`;

      return `${(idx + 1).toString().padStart(2)}. ${name.padEnd(6)} ${entry.wins}-${entry.losses}  Maps: ${mapDiffStr.padStart(3)}  RD: ${rdStr.padStart(4)}`;
    })
    .join('\n');
}