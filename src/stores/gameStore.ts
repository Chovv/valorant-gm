// src/stores/gameStore.ts
// Core game state management with Zustand

import { create } from 'zustand';
import type { Team, Player, Region } from '../types';
import type { StartingSlot } from '../types/roster';
import type { ScrimResult } from '../types/scrims';
import {
  createGameState,
  advanceDay,
  skipToPlayoffs,
  type GameState,
  type DayResult,
} from '../sim/gameState';
import {
  saveGame,
  loadGame,
  getAllSaves,
  deleteSave,
  type SavedGame,
} from '../db/gameDatabase';
import { signFreeAgent, releasePlayer, generateFreeAgentPool } from '../sim/freeAgency';
import { executeTrade } from '../sim/trading';
import { runScrim as executeScrim, formatScrimResultLog } from '../sim/scrims';
import { calculateTeamAttributes } from '../sim/teamRatings';
import { createRNG, randomInt, shuffle } from '../utils/random';
import { generatePlayer } from '../sim/playerGenerator';
import { getAgentsForRole } from '../data/agents';
import {
  AMERICAS_TEAMS,
  EMEA_TEAMS,
  PACIFIC_TEAMS,
  CHINA_TEAMS,
  PLACEHOLDER_LOGO,
  type TeamConfig,
} from '../data/teams';
import type { RNG } from '../utils/random';
import type { AgentPool, Role } from '../types';

// Helper functions
function generateAgentPoolForRole(rng: RNG, role: Role): AgentPool {
  const pool: AgentPool = {};
  const roleAgents = getAgentsForRole(role);
  const shuffled = [...roleAgents];
  shuffle(rng, shuffled);
  let idx = 0;
  for (let i = 0; i < 2 && idx < shuffled.length; i++) {
    pool[shuffled[idx++]] = randomInt(rng, 75, 95);
  }
  for (let i = 0; i < 2 && idx < shuffled.length; i++) {
    pool[shuffled[idx++]] = randomInt(rng, 50, 74);
  }
  return pool;
}

function generateTeamFromConfig(rng: RNG, config: TeamConfig): Team {
  const roster: Player[] = config.players.map((playerConfig) => {
    const player = generatePlayer(rng, {
      role: playerConfig.role,
      forceOverall: playerConfig.overall,
      forceAge: playerConfig.age,
      forceName: playerConfig.name,
      forceRatings: {
        aim: playerConfig.aim,
        utility: playerConfig.utility,
        gameSense: playerConfig.gameSense,
        clutch: playerConfig.clutch,
      },
      forcePersonality: playerConfig.personality,
    });

    player.agentPool = playerConfig.agents
      ? { ...playerConfig.agents }
      : generateAgentPoolForRole(rng, playerConfig.role);

    return player;
  });

  const iglPlayer = config.igl
    ? roster.find((p) => p.name === config.igl)
    : roster.find((p) => p.role === 'initiator');

  return {
    id: `team_${config.abbreviation.toLowerCase()}`,
    name: config.name,
    abbreviation: config.abbreviation,
    logo: config.logo || PLACEHOLDER_LOGO,
    region: config.region,
    roster,
    iglId: iglPlayer?.id || roster[0]?.id || null,
    staff: { headCoach: null, assistantCoach: null, analyst: null },
    finances: { budget: 1000000, salaryCommitted: 500000, scoutingBudget: 50 },
    attributes: calculateTeamAttributes(roster),
    championships: 0,
    playoffAppearances: 0,
    founded: 2020,
  };
}

function generateAllTeams(seed: string): Team[] {
  const rng = createRNG(seed);
  const allConfigs = [
    ...AMERICAS_TEAMS,
    ...EMEA_TEAMS,
    ...PACIFIC_TEAMS,
    ...CHINA_TEAMS,
  ];
  return allConfigs.map((config) => generateTeamFromConfig(rng, config));
}

// Types
export interface MatchToastData {
  id: string;
  matchId: string;
  userTeam: Team;
  opponent: Team;
  userScore: number;
  opponentScore: number;
  isWin: boolean;
}

interface GameStore {
  // Core state
  gameState: GameState | null;
  saves: SavedGame[];
  currentSaveId: string | null;
  recentResults: DayResult[];
  matchToasts: MatchToastData[];
  notificationToast: string | null;

  // Setup state
  setupSeed: string;
  setupTeams: Team[];
  setupSelectedTeamId: string | null;

  // Actions - Game flow
  initSaves: () => Promise<void>;
  startNewGame: () => void;
  confirmSetup: () => void;
  setSetupSelectedTeamId: (id: string | null) => void;
  setSetupRegion: (region: Region) => void;

  // Actions - Day simulation
  advanceDay: () => void;
  simToNextMatchup: () => void;
  skipToPlayoffs: () => void;
  simToChampions: () => void;

  // Actions - Save/Load
  saveGame: () => Promise<void>;
  loadGame: (id: string) => Promise<void>;
  deleteGame: (id: string) => Promise<void>;

  // Actions - Import/Export
  importLeague: (file: File) => Promise<void>;
  exportLeague: () => void;
  exportTeamConfigs: () => void;

  // Actions - Roster management
  updateLineup: (teamId: string, newLineup: StartingSlot[]) => void;
  signFreeAgent: (playerId: string) => void;
  releasePlayer: (playerId: string) => void;
  savePlayer: (updatedPlayer: Player) => void;
  setIGL: (teamId: string, playerId: string) => void;

  // Actions - Trading
  executeTrade: (team1Id: string, team2Id: string, player1Ids: string[], player2Ids: string[]) => void;

  // Actions - Scrims
  runScrim: (opponentId: string, opponentType: 'regional' | 'tier2', opponentName: string) => void;

  // Actions - League editor
  startFromEditor: (teams: Team[]) => void;

  // Actions - Toasts
  dismissToast: (id: string) => void;
  setNotificationToast: (message: string | null) => void;
  clearNotificationToast: () => void;

  // Computed helpers
  isUserTeamEliminated: () => boolean;
  isSeasonComplete: () => boolean;
  getUserTeam: () => Team | undefined;
  getTeamsByRegion: (region: Region) => Team[];
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  gameState: null,
  saves: [],
  currentSaveId: null,
  recentResults: [],
  matchToasts: [],
  notificationToast: null,
  setupSeed: '',
  setupTeams: [],
  setupSelectedTeamId: null,

  // Initialize saves from IndexedDB
  initSaves: async () => {
    const saves = await getAllSaves();
    set({ saves });
  },

  // Start new game - go to setup screen
  startNewGame: () => {
    const seed = `game-${crypto.randomUUID()}`;
    const teams = generateAllTeams(seed);
    set({
      setupSeed: seed,
      setupTeams: teams,
      setupSelectedTeamId: null,
    });
  },

  // Confirm setup and create game state
  confirmSetup: () => {
    const { setupSelectedTeamId, setupTeams, setupSeed } = get();
    if (!setupSelectedTeamId) return;

    const selectedTeam = setupTeams.find((t) => t.id === setupSelectedTeamId);
    if (!selectedTeam) return;

    const state = createGameState(setupTeams, setupSelectedTeamId, setupSeed);
    const faRng = createRNG(`${setupSeed}-freeagents`);
    const freeAgents = generateFreeAgentPool(faRng, 75);

    set({
      gameState: { ...state, freeAgents },
      currentSaveId: null,
      recentResults: [],
    });
  },

  setSetupSelectedTeamId: (id) => set({ setupSelectedTeamId: id }),

  setSetupRegion: () => {
    set({ setupSelectedTeamId: null });
  },

  // Advance one day
  advanceDay: () => {
    const { gameState } = get();
    if (!gameState) return;

    const result = advanceDay(gameState);
    
    // Check for user team matches and create toasts
    const newToasts: MatchToastData[] = [];
    if (gameState.userTeamId && result.matchesPlayed.length > 0) {
      for (const match of result.matchesPlayed) {
        const isHome = match.homeTeamId === gameState.userTeamId;
        const isAway = match.awayTeamId === gameState.userTeamId;

        if (isHome || isAway) {
          const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
          const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
          const opponent = gameState.teams.find(t => t.id === opponentId);

          if (userTeam && opponent) {
            const userScore = isHome ? match.homeScore : match.awayScore;
            const opponentScore = isHome ? match.awayScore : match.homeScore;
            const isWin = userScore > opponentScore;

            let matchId = match.id;
            const scheduleMatch = gameState.schedule.find(
              m => m.homeTeamId === match.homeTeamId &&
                   m.awayTeamId === match.awayTeamId &&
                   m.played
            );
            if (scheduleMatch) {
              matchId = scheduleMatch.id;
            }

            newToasts.push({
              id: `toast-${Date.now()}`,
              matchId,
              userTeam,
              opponent,
              userScore,
              opponentScore,
              isWin,
            });
          }
        }
      }
    }

    set(state => ({
      gameState: { ...gameState },
      recentResults: [...state.recentResults.slice(-20), result],
      matchToasts: [...state.matchToasts, ...newToasts],
    }));
  },

  // Simulate until user team plays
  simToNextMatchup: () => {
    const { gameState, isUserTeamEliminated, isSeasonComplete } = get();
    if (!gameState || !gameState.userTeamId) return;

    if (isSeasonComplete()) {
      set({ notificationToast: '❌ The season is complete. There are no more games.' });
      return;
    }

    if (isUserTeamEliminated()) {
      set({ notificationToast: '❌ Your team has been eliminated. There are no more games this season.' });
      return;
    }

    const userTeamId = gameState.userTeamId;
    let daysSimulated = 0;
    const maxDays = 100;
    const allResults: DayResult[] = [];
    const newToasts: MatchToastData[] = [];

    while (daysSimulated < maxDays) {
      if (get().isSeasonComplete()) {
        set(state => ({
          gameState: { ...gameState },
          recentResults: [...state.recentResults.slice(-20), ...allResults],
          notificationToast: `🏁 Season complete! Simulated ${daysSimulated} day(s).`,
        }));
        return;
      }

      if (get().isUserTeamEliminated()) {
        set(state => ({
          gameState: { ...gameState },
          recentResults: [...state.recentResults.slice(-20), ...allResults],
          notificationToast: '❌ Your team has been eliminated from the playoffs.',
        }));
        return;
      }

      const result = advanceDay(gameState);
      allResults.push(result);
      daysSimulated++;

      const userPlayed = result.matchesPlayed.some(
        match => match.homeTeamId === userTeamId || match.awayTeamId === userTeamId
      );

      if (userPlayed) {
        for (const match of result.matchesPlayed) {
          const isHome = match.homeTeamId === userTeamId;
          const isAway = match.awayTeamId === userTeamId;

          if (isHome || isAway) {
            const userTeam = gameState.teams.find(t => t.id === userTeamId);
            const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
            const opponent = gameState.teams.find(t => t.id === opponentId);

            if (userTeam && opponent) {
              const userScore = isHome ? match.homeScore : match.awayScore;
              const opponentScore = isHome ? match.awayScore : match.homeScore;
              const isWin = userScore > opponentScore;

              let matchId = match.id;
              const scheduleMatch = gameState.schedule.find(
                m => m.homeTeamId === match.homeTeamId &&
                     m.awayTeamId === match.awayTeamId &&
                     m.played
              );
              if (scheduleMatch) matchId = scheduleMatch.id;

              newToasts.push({
                id: `toast-${Date.now()}`,
                matchId,
                userTeam,
                opponent,
                userScore,
                opponentScore,
                isWin,
              });
            }
          }
        }
        break;
      }
    }

    set(state => ({
      gameState: { ...gameState },
      recentResults: [...state.recentResults.slice(-20), ...allResults],
      matchToasts: [...state.matchToasts, ...newToasts],
    }));
  },

  skipToPlayoffs: () => {
    const { gameState } = get();
    if (!gameState) return;
    if (gameState.phase !== 'preseason' && gameState.phase !== 'regular_season') return;

    const events = skipToPlayoffs(gameState);
    set(state => ({
      gameState: { ...gameState },
      recentResults: [
        ...state.recentResults,
        { day: gameState.currentDay, matchesPlayed: [], events },
      ],
      notificationToast: '⏭️ Skipped to playoffs! All regular season matches have been simulated.',
    }));
  },

  simToChampions: () => {
    const { gameState } = get();
    if (!gameState) return;

    if (gameState.phase === 'international' && gameState.internationalTournament?.champion) {
      set({ notificationToast: '🏆 Champions has already concluded!' });
      return;
    }

    let safetyCounter = 0;
    const maxIterations = 500;

    while (safetyCounter < maxIterations) {
      if (gameState.phase === 'international' && gameState.internationalTournament?.bracket) {
        break;
      }
      advanceDay(gameState);
      safetyCounter++;
    }

    set(state => ({
      gameState: { ...gameState },
      recentResults: [
        ...state.recentResults,
        {
          day: gameState.currentDay,
          matchesPlayed: [],
          events: [{ type: 'phase_change', message: 'Simulated to VALORANT Champions!' }],
        },
      ],
      notificationToast: '🌍 Simulated to VALORANT Champions! The international tournament is ready.',
    }));
  },

  // Save game
  saveGame: async () => {
    const { gameState, currentSaveId, saves } = get();
    if (!gameState) return;

    const name = currentSaveId
      ? saves.find((s) => s.id === currentSaveId)?.name
      : `Save - Day ${gameState.currentDay}`;

    const saved = await saveGame(gameState, name || 'Unnamed Save', currentSaveId || undefined);
    const updatedSaves = await getAllSaves();

    set({
      currentSaveId: saved.id,
      saves: updatedSaves,
      notificationToast: `💾 Game saved! (${name || 'Unnamed Save'})`,
    });
  },

  // Load game
  loadGame: async (id: string) => {
    const save = await loadGame(id);
    if (save) {
      const newSeed = `load-${crypto.randomUUID()}`;
      
      // Add default values for new scrim fields (backwards compatibility)
      // Convert old scrimsThisWeek to new fatigueLevel if needed
      // Use type assertion for old save format that may have scrimsThisWeek
      interface LegacyGameState extends GameState {
        scrimsThisWeek?: number;
      }
      const oldState = save.gameState as LegacyGameState;
      const updatedGameState = {
        ...save.gameState,
        seed: newSeed,
        fatigueLevel: save.gameState.fatigueLevel ?? oldState.scrimsThisWeek ?? 0,
        lastScrimDay: save.gameState.lastScrimDay ?? null,
        seasonStartStats: save.gameState.seasonStartStats ?? {},
      };

      set({
        gameState: updatedGameState,
        currentSaveId: save.id,
        recentResults: [],
      });
    }
  },

  // Delete save
  deleteGame: async (id: string) => {
    await deleteSave(id);
    const saves = await getAllSaves();
    set(state => ({
      saves,
      currentSaveId: state.currentSaveId === id ? null : state.currentSaveId,
    }));
  },

  // Import league from JSON
  importLeague: async (file: File) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);

          if (json.teams && Array.isArray(json.teams) && json.teams[0]?.roster) {
            // Type for imported team data (may have partial/missing fields)
            interface ImportedTeamData {
              id: string;
              name: string;
              abbreviation: string;
              logo: string;
              region: Region;
              founded?: number;
              championships?: number;
              playoffAppearances?: number;
              iglId?: string | null;
              startingLineup?: StartingSlot[];
              staff?: Team['staff'];
              finances?: Team['finances'];
              attributes?: Team['attributes'];
              roster: Player[];
            }
            
            const importedTeams: Team[] = json.teams.map((teamData: ImportedTeamData) => ({
              id: teamData.id,
              name: teamData.name,
              abbreviation: teamData.abbreviation,
              logo: teamData.logo,
              region: teamData.region,
              founded: teamData.founded || 2020,
              championships: teamData.championships || 0,
              playoffAppearances: teamData.playoffAppearances || 0,
              iglId: teamData.iglId || null,
              startingLineup: teamData.startingLineup || undefined,
              staff: teamData.staff || { headCoach: null, assistantCoach: null, analyst: null },
              finances: teamData.finances || { budget: 1000000, salaryCommitted: 500000, scoutingBudget: 50 },
              attributes: teamData.attributes || calculateTeamAttributes(teamData.roster),
              roster: teamData.roster.map((p: Player) => ({
                ...p,
                careerStats: p.careerStats || null,
              })),
            }));

            const userTeamId = json.gameInfo?.userTeamId || importedTeams[0]?.id || '';
            const seed = `import-${crypto.randomUUID()}`;
            const state = createGameState(importedTeams, userTeamId, seed);
            const freeAgents = json.freeAgents || [];

            set({
              gameState: { ...state, freeAgents },
              currentSaveId: null,
              recentResults: [],
              notificationToast: `✅ Successfully imported league with ${importedTeams.length} teams!`,
            });
            resolve(undefined);
          } else {
            set({ notificationToast: '❌ Unrecognized JSON format.' });
            reject(new Error('Unrecognized format'));
          }
        } catch (err) {
          set({ notificationToast: '❌ Failed to import JSON file.' });
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  },

  // Export league as JSON
  exportLeague: () => {
    const { gameState } = get();
    if (!gameState) return;

    const exportData = {
      exportVersion: '1.0',
      exportDate: new Date().toISOString(),
      gameInfo: {
        seed: gameState.seed,
        currentDay: gameState.currentDay,
        currentYear: gameState.currentYear,
        phase: gameState.phase,
        userTeamId: gameState.userTeamId,
      },
      teams: gameState.teams.map(team => ({
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        logo: team.logo,
        region: team.region,
        founded: team.founded,
        championships: team.championships,
        playoffAppearances: team.playoffAppearances,
        iglId: team.iglId,
        startingLineup: team.startingLineup,
        attributes: team.attributes,
        finances: team.finances,
        roster: team.roster.map(player => ({
          id: player.id,
          name: player.name,
          age: player.age,
          role: player.role,
          overall: player.overall,
          potential: player.potential,
          ratings: player.ratings,
          personality: player.personality,
          background: player.background,
          archetype: player.archetype,
          development: player.development,
          agentPool: player.agentPool,
          contract: player.contract,
          careerStats: player.careerStats,
          imageUrl: player.imageUrl,
        })),
      })),
      freeAgents: (gameState.freeAgents || []).map(player => ({
        id: player.id,
        name: player.name,
        age: player.age,
        role: player.role,
        overall: player.overall,
        potential: player.potential,
        ratings: player.ratings,
        personality: player.personality,
        background: player.background,
        archetype: player.archetype,
        development: player.development,
        agentPool: player.agentPool,
        contract: player.contract,
        imageUrl: player.imageUrl,
      })),
      standings: gameState.standings,
      champions: gameState.champions,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valorantgm-league-${gameState.currentYear}-day${gameState.currentDay}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Export team configs
  exportTeamConfigs: () => {
    const { gameState } = get();
    if (!gameState) return;

    const teamConfigs = gameState.teams.map(team => {
      const iglPlayer = team.roster.find(p => p.id === team.iglId);
      return {
        name: team.name,
        abbreviation: team.abbreviation,
        logo: team.logo,
        region: team.region,
        igl: iglPlayer?.name || null,
        players: team.roster.map(player => ({
          name: player.name,
          role: player.role,
          overall: player.overall,
          age: player.age,
          aim: player.ratings.aim,
          gameSense: player.ratings.gameSense,
          utility: player.ratings.utilityUsage,
          clutch: player.ratings.clutchFactor,
          personality: {
            leadership: player.personality.leadership,
            workEthic: player.personality.workEthic,
            mentality: player.personality.mentality,
            teamPlayer: player.personality.teamPlayer,
            coachability: player.personality.coachability,
          },
          agents: player.agentPool,
          imageUrl: player.imageUrl,
        })),
      };
    });

    const byRegion = {
      americas: teamConfigs.filter(t => t.region === 'americas'),
      emea: teamConfigs.filter(t => t.region === 'emea'),
      pacific: teamConfigs.filter(t => t.region === 'pacific'),
      china: teamConfigs.filter(t => t.region === 'china'),
    };

    const exportData = {
      exportVersion: '1.0',
      exportDate: new Date().toISOString(),
      description: 'Team configurations for ValorantGM.',
      teamsByRegion: byRegion,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'valorantgm-team-configs.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Roster management
  updateLineup: (teamId: string, newLineup: StartingSlot[]) => {
    const { gameState } = get();
    if (!gameState) return;

    const updatedTeams = gameState.teams.map(team =>
      team.id === teamId ? { ...team, startingLineup: newLineup } : team
    );
    set({ gameState: { ...gameState, teams: updatedTeams } });
  },

  signFreeAgent: (playerId: string) => {
    const { gameState } = get();
    if (!gameState || !gameState.userTeamId) return;

    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;

    const result = signFreeAgent(gameState.freeAgents || [], playerId, userTeam.roster);
    if (!result) return;

    const updatedTeams = gameState.teams.map(team =>
      team.id === gameState.userTeamId
        ? { ...team, roster: result.updatedRoster }
        : team
    );

    set({
      gameState: {
        ...gameState,
        teams: updatedTeams,
        freeAgents: result.updatedFreeAgents,
      },
    });
  },

  releasePlayer: (playerId: string) => {
    const { gameState } = get();
    if (!gameState || !gameState.userTeamId) return;

    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;

    if (userTeam.startingLineup?.some(s => s.playerId === playerId)) {
      set({ notificationToast: '❌ Cannot release a player in the starting lineup.' });
      return;
    }

    const result = releasePlayer(gameState.freeAgents || [], playerId, userTeam.roster);
    if (!result) return;

    const updatedTeams = gameState.teams.map(team =>
      team.id === gameState.userTeamId
        ? { ...team, roster: result.updatedRoster }
        : team
    );

    set({
      gameState: {
        ...gameState,
        teams: updatedTeams,
        freeAgents: result.updatedFreeAgents,
      },
    });
  },

  savePlayer: (updatedPlayer: Player) => {
    const { gameState } = get();
    if (!gameState) return;

    const updatedTeams = gameState.teams.map(team => ({
      ...team,
      roster: team.roster.map(p => p.id === updatedPlayer.id ? updatedPlayer : p),
    }));

    const updatedFreeAgents = gameState.freeAgents?.map(p =>
      p.id === updatedPlayer.id ? updatedPlayer : p
    );

    set({
      gameState: {
        ...gameState,
        teams: updatedTeams,
        freeAgents: updatedFreeAgents,
      },
    });
  },

  setIGL: (teamId: string, playerId: string) => {
    const { gameState } = get();
    if (!gameState) return;

    const updatedTeams = gameState.teams.map(team =>
      team.id === teamId ? { ...team, iglId: playerId } : team
    );

    set({ gameState: { ...gameState, teams: updatedTeams } });
  },

  // Trading
  executeTrade: (team1Id: string, team2Id: string, player1Ids: string[], player2Ids: string[]) => {
    const { gameState } = get();
    if (!gameState) return;

    const result = executeTrade(gameState.teams, team1Id, team2Id, player1Ids, player2Ids);

    if (result.success) {
      set({
        gameState: { ...gameState, teams: result.updatedTeams },
        notificationToast: `🤝 ${result.message}`,
      });
    } else {
      set({ notificationToast: `❌ Trade failed: ${result.message}` });
    }
  },

  // Run a scrim for the user's team
  runScrim: (opponentId: string, opponentType: 'regional' | 'tier2', opponentName: string) => {
    const { gameState, recentResults } = get();
    if (!gameState || !gameState.userTeamId) return;

    // Can't scrim during playoffs
    if (gameState.phase === 'regional_playoffs' || gameState.phase === 'international') {
      set({ notificationToast: '❌ Cannot scrim during playoffs' });
      return;
    }

    // Can't scrim twice in same day
    if (gameState.lastScrimDay === gameState.currentDay) {
      set({ notificationToast: '❌ Already scrimmaged today' });
      return;
    }

    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;

    // Create RNG for this scrim
    const rng = createRNG(`${gameState.seed}-scrim-${gameState.currentDay}-${opponentId}`);

    // Run the scrim
    const result: ScrimResult = executeScrim(
      rng,
      userTeam,
      opponentName,
      opponentType,
      gameState.fatigueLevel,
      gameState.currentDay,
      gameState.currentYear,
      gameState.teams
    );

    // Update scrim tracking - increase fatigue by 1
    const updatedState = {
      ...gameState,
      fatigueLevel: gameState.fatigueLevel + 1,
      lastScrimDay: gameState.currentDay,
    };

    // Recalculate team attributes after potential stat changes
    const updatedTeams = updatedState.teams.map(t => {
      if (t.id === gameState.userTeamId) {
        return {
          ...t,
          attributes: calculateTeamAttributes(t.roster),
        };
      }
      return t;
    });
    updatedState.teams = updatedTeams;

    // Create game event for the log
    const scrimLogs = formatScrimResultLog(result);
    const scrimEvent = {
      type: 'scrim_result' as const,
      message: scrimLogs[0],
      data: result,
    };

    // Add to recent results as a synthetic day result
    const scrimDayResult: DayResult = {
      day: gameState.currentDay,
      matchesPlayed: [],
      events: [scrimEvent],
    };

    set({
      gameState: updatedState,
      recentResults: [...recentResults.slice(-20), scrimDayResult],
      notificationToast: result.statChanges.length > 0 
        ? `🏋️ Scrim complete! ${result.statChanges.length} player(s) developed`
        : `🏋️ Scrim complete. No significant changes.`,
    });
  },

  // Start from league editor
  startFromEditor: (teams: Team[]) => {
    const teamsWithIGL = teams.map((t) => ({
      ...t,
      iglId: t.iglId || t.roster.find((p) => p.role === 'initiator')?.id || t.roster[0]?.id || null,
    }));
    const seed = `custom-${crypto.randomUUID()}`;
    const userTeamId = teamsWithIGL[0]?.id || '';
    const state = createGameState(teamsWithIGL, userTeamId, seed);

    set({
      gameState: state,
      currentSaveId: null,
      recentResults: [],
    });
  },

  // Toasts
  dismissToast: (id: string) => {
    set(state => ({
      matchToasts: state.matchToasts.filter(t => t.id !== id),
    }));
  },

  setNotificationToast: (message: string | null) => {
    set({ notificationToast: message });
  },

  clearNotificationToast: () => {
    set({ notificationToast: null });
  },

  // Computed helpers
  isUserTeamEliminated: () => {
    const { gameState } = get();
    if (!gameState || !gameState.userTeamId) return false;

    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return false;

    if (gameState.phase === 'preseason' || gameState.phase === 'regular_season') {
      return false;
    }

    const userRegion = userTeam.region;
    const regionPlayoff = gameState.regionalPlayoffs[userRegion];

    if (regionPlayoff) {
      const regionStandings = [...gameState.standings]
        .filter(s => {
          const team = gameState.teams.find(t => t.id === s.teamId);
          return team?.region === userRegion;
        })
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return (b.mapWins - b.mapLosses) - (a.mapWins - a.mapLosses);
        });

      const userRank = regionStandings.findIndex(s => s.teamId === gameState.userTeamId) + 1;
      if (userRank > 6) return true;

      for (const round of regionPlayoff.rounds) {
        for (const matchup of round.matchups) {
          if (matchup.winnerId && matchup.winnerId !== gameState.userTeamId) {
            if (matchup.team1Id === gameState.userTeamId || matchup.team2Id === gameState.userTeamId) {
              return true;
            }
          }
        }
      }
    }

    if (gameState.phase === 'international' && gameState.internationalTournament?.bracket) {
      const qualifiedTeam = gameState.internationalTournament.teams.find(
        t => t.teamId === gameState.userTeamId
      );
      if (!qualifiedTeam) return true;

      for (const round of gameState.internationalTournament.bracket.rounds) {
        for (const matchup of round.matchups) {
          if (matchup.winnerId && matchup.winnerId !== gameState.userTeamId) {
            if (matchup.team1Id === gameState.userTeamId || matchup.team2Id === gameState.userTeamId) {
              return true;
            }
          }
        }
      }
    }

    return false;
  },

  isSeasonComplete: () => {
    const { gameState } = get();
    if (!gameState) return false;
    return gameState.internationalTournament?.champion !== undefined;
  },

  getUserTeam: () => {
    const { gameState } = get();
    if (!gameState) return undefined;
    return gameState.teams.find(t => t.id === gameState.userTeamId);
  },

  getTeamsByRegion: (region: Region) => {
    const { gameState } = get();
    if (!gameState) return [];
    return gameState.teams.filter(t => t.region === region);
  },
}));