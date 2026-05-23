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
import { getDefaultRecordBook } from '../sim/vctRecords';
import { MAPS } from '../sim/matchSim';
import {
  saveGame,
  loadGame,
  getAllSaves,
  deleteSave,
  type SavedGame,
} from '../db/gameDatabase';
import { signFreeAgent, releasePlayer, generateFreeAgentPool, pickNat } from '../sim/freeAgency';
import { buildNamePoolCtx } from '../sim/namePool';
import { executeTrade } from '../sim/trading';
import { runScrim as executeScrim, formatScrimResultLog } from '../sim/scrims';
import { calculateTeamAttributes, staffFromTeam } from '../sim/teamRatings';
import { generateChampionsBracket } from '../sim/internationalBracket';
import { createRNG, randomInt, shuffle } from '../utils/random';
import { generateCoach, generateCoachPool } from '../sim/coachGenerator';
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

    if (!player.nationality) player.nationality = pickNat(rng, config.region);

    return player;
  });

  const iglPlayer = config.igl
    ? roster.find((p) => p.name === config.igl)
    : roster.find((p) => p.role === 'initiator');

  const staff = {
    headCoach: generateCoach(rng, { region: config.region }),
    assistantCoach: null,
    analyst: null,
  };

  return {
    id: `team_${config.abbreviation.toLowerCase()}`,
    name: config.name,
    abbreviation: config.abbreviation,
    logo: config.logo || PLACEHOLDER_LOGO,
    region: config.region,
    roster,
    iglId: iglPlayer?.id || roster[0]?.id || null,
    staff,
    finances: { budget: 1000000, salaryCommitted: 500000, scoutingBudget: 50 },
    attributes: calculateTeamAttributes(roster, undefined, staff.headCoach?.rating, staff.headCoach?.specialty, staffFromTeam(staff)),
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

  // Actions - Staff
  hireCoach: (coachId: string) => void;
  fireCoach: () => void;

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

    const state = createGameState(setupTeams, setupSelectedTeamId, setupSeed, undefined, true);
    const namePool = buildNamePoolCtx(state.usedNames, true);
    const faRng = createRNG(`${setupSeed}-freeagents`);
    const freeAgents = generateFreeAgentPool(faRng, 75, undefined, namePool);
    const usedNames = namePool ? [...namePool.used] : state.usedNames;
    const coachRng = createRNG(`${setupSeed}-coaches`);
    const freeAgentCoaches = generateCoachPool(coachRng, 15);

    set({
      gameState: { ...state, freeAgents, freeAgentCoaches, usedNames },
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
    if (gameState.phase !== 'preseason' && gameState.phase !== 'kickoff_bracket') return;

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
        currentChampionsRound: save.gameState.currentChampionsRound ?? 0,
        newsFeed: save.gameState.newsFeed ?? [],
        lastSeenNewsCount: save.gameState.lastSeenNewsCount ?? 0,
        recordBook: save.gameState.recordBook ?? getDefaultRecordBook(),
        mapPool: save.gameState.mapPool ?? [...MAPS],
        agentMeta: save.gameState.agentMeta ?? {},
        disabledAgents: save.gameState.disabledAgents ?? [],
        customAgents: save.gameState.customAgents ?? [],
        mapMeta: save.gameState.mapMeta ?? {},
        teamMapComps: save.gameState.teamMapComps ?? (save.gameState.userMapComp && save.gameState.userTeamId ? { [save.gameState.userTeamId]: save.gameState.userMapComp } : {}),
        teamMapCompNoPenalty: save.gameState.teamMapCompNoPenalty ?? {},
        teamMapCompBuffs: save.gameState.teamMapCompBuffs ?? {},
        agentRoleOverrides: save.gameState.agentRoleOverrides ?? {},
        agentVariance: save.gameState.agentVariance ?? 15,
        agentAbilities: save.gameState.agentAbilities,
        matchSimConfig: save.gameState.matchSimConfig,
        useEsportsNames: save.gameState.useEsportsNames ?? false,
        usedNames: save.gameState.usedNames ?? [],
        vctPoints: save.gameState.vctPoints ?? {},
        freeAgentCoaches: save.gameState.freeAgentCoaches ?? [],
      };

      // Migrate legacy players missing consistency — assign archetype-based values
      const migrationRng = createRNG(`${newSeed}-consistency-migration`);
      const archetypeConsistencyRanges: Record<string, [number, number]> = {
        anchor: [70, 95], support_leader: [65, 90], clutch_star: [60, 90],
        utility_specialist: [60, 85], macro_brain: [60, 85], info_gatherer: [55, 85],
        support_initiator: [55, 85], lurker: [50, 85], entry_fragger: [45, 80],
        playmaker: [40, 80], aggressive_smoker: [40, 75], feast_or_famine: [25, 60],
      };
      for (const team of updatedGameState.teams) {
        for (const player of team.roster) {
          if (player.consistency === undefined || player.consistency === null) {
            const range = archetypeConsistencyRanges[player.archetype] ?? [45, 85];
            player.consistency = randomInt(migrationRng, range[0], range[1]);
          }
        }
      }

      // Migrate legacy international tournament bracket (old single-elim → new Swiss + double-elim)
      if (updatedGameState.internationalTournament) {
        const oldBracket = updatedGameState.internationalTournament.bracket as any;
        // Detect old format: has .rounds (PlayoffBracket) instead of .swiss (ChampionsBracket)
        if (oldBracket.rounds && !oldBracket.swiss) {
          // Regenerate with new format using existing teams
          const champTeams = updatedGameState.internationalTournament.teams;
          updatedGameState.internationalTournament.bracket = generateChampionsBracket(
            `${newSeed}-champions-migrate`,
            champTeams,
          );
          updatedGameState.internationalTournament.champion = null;
          updatedGameState.currentChampionsRound = 0;
        }
      }

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
              attributes: teamData.attributes || calculateTeamAttributes(teamData.roster, teamData.startingLineup, teamData.staff?.headCoach?.rating, teamData.staff?.headCoach?.specialty, staffFromTeam(teamData.staff)),
              roster: teamData.roster.map((p: Player) => ({
                ...p,
                consistency: p.consistency ?? 65,
                careerStats: p.careerStats || null,
              })),
            }));

            const userTeamId = json.gameInfo?.userTeamId || importedTeams[0]?.id || '';
            const seed = `import-${crypto.randomUUID()}`;
            const state = createGameState(importedTeams, userTeamId, seed);
            const freeAgents = json.freeAgents || [];
            // restore map pool and agent meta if present
            const mapPool = json.mapPool && Array.isArray(json.mapPool) ? json.mapPool : state.mapPool;
            const agentMeta = json.agentMeta && typeof json.agentMeta === 'object' ? json.agentMeta : state.agentMeta;
            const disabledAgents = Array.isArray(json.disabledAgents) ? json.disabledAgents : [];
            const customAgents = Array.isArray(json.customAgents) ? json.customAgents : [];
            const mapMeta = json.mapMeta && typeof json.mapMeta === 'object' ? json.mapMeta : (state.mapMeta ?? {});
            const agentVariance = typeof json.agentVariance === 'number' ? json.agentVariance : (state.agentVariance ?? 15);
            const freeAgentCoaches = Array.isArray(json.freeAgentCoaches) ? json.freeAgentCoaches : [];

            set({
              gameState: { ...state, freeAgents, freeAgentCoaches, mapPool, agentMeta, disabledAgents, customAgents, mapMeta, agentVariance },
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
      mapPool: gameState.mapPool,
      agentMeta: gameState.agentMeta,
      disabledAgents: gameState.disabledAgents ?? [],
      customAgents: gameState.customAgents ?? [],
      mapMeta: gameState.mapMeta ?? {},
      teamMapComps: gameState.teamMapComps ?? {},
      teamMapCompNoPenalty: gameState.teamMapCompNoPenalty ?? {},
      teamMapCompBuffs: gameState.teamMapCompBuffs ?? {},
      agentRoleOverrides: gameState.agentRoleOverrides ?? {},
      agentVariance: gameState.agentVariance ?? 15,
      agentAbilities: gameState.agentAbilities,
      matchSimConfig: gameState.matchSimConfig,
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

  // Staff
  hireCoach: (coachId: string) => {
    const { gameState } = get();
    if (!gameState) return;
    const pool = gameState.freeAgentCoaches ?? [];
    const coach = pool.find(c => c.id === coachId);
    if (!coach) return;
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;
    // release current coach to FA pool if exists
    const released = userTeam.staff.headCoach;
    const updatedPool = pool.filter(c => c.id !== coachId);
    if (released) updatedPool.push(released);
    const updatedTeams = gameState.teams.map(t =>
      t.id === gameState.userTeamId
        ? { ...t, staff: { ...t.staff, headCoach: coach }, attributes: calculateTeamAttributes(t.roster, t.startingLineup, coach.rating, coach.specialty, staffFromTeam({ ...t.staff, headCoach: coach })) }
        : t
    );
    set({ gameState: { ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool } });
  },

  fireCoach: () => {
    const { gameState } = get();
    if (!gameState) return;
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam?.staff.headCoach) return;
    const fired = userTeam.staff.headCoach;
    const updatedPool = [...(gameState.freeAgentCoaches ?? []), fired];
    const updatedTeams = gameState.teams.map(t =>
      t.id === gameState.userTeamId
        ? { ...t, staff: { ...t.staff, headCoach: null }, attributes: calculateTeamAttributes(t.roster, t.startingLineup) }
        : t
    );
    set({ gameState: { ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool } });
  },

  hireAssistant: (coachId: string) => {
    const { gameState } = get();
    if (!gameState) return;
    const pool = gameState.freeAgentCoaches ?? [];
    const coach = pool.find(c => c.id === coachId);
    if (!coach) return;
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;
    const released = userTeam.staff.assistantCoach;
    const updatedPool = pool.filter(c => c.id !== coachId);
    if (released) updatedPool.push(released);
    const updatedTeams = gameState.teams.map(t =>
      t.id === gameState.userTeamId
        ? { ...t, staff: { ...t.staff, assistantCoach: coach }, attributes: calculateTeamAttributes(t.roster, t.startingLineup, t.staff.headCoach?.rating, t.staff.headCoach?.specialty, staffFromTeam({ ...t.staff, assistantCoach: coach })) }
        : t
    );
    set({ gameState: { ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool } });
  },

  fireAssistant: () => {
    const { gameState } = get();
    if (!gameState) return;
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam?.staff.assistantCoach) return;
    const fired = userTeam.staff.assistantCoach;
    const updatedPool = [...(gameState.freeAgentCoaches ?? []), fired];
    const updatedTeams = gameState.teams.map(t =>
      t.id === gameState.userTeamId
        ? { ...t, staff: { ...t.staff, assistantCoach: null }, attributes: calculateTeamAttributes(t.roster, t.startingLineup, t.staff.headCoach?.rating, t.staff.headCoach?.specialty, staffFromTeam({ ...t.staff, assistantCoach: null })) }
        : t
    );
    set({ gameState: { ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool } });
  },

  hireAnalyst: (coachId: string) => {
    const { gameState } = get();
    if (!gameState) return;
    const pool = gameState.freeAgentCoaches ?? [];
    const coach = pool.find(c => c.id === coachId);
    if (!coach) return;
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;
    const released = userTeam.staff.analyst;
    const updatedPool = pool.filter(c => c.id !== coachId);
    if (released) updatedPool.push(released);
    const updatedTeams = gameState.teams.map(t =>
      t.id === gameState.userTeamId
        ? { ...t, staff: { ...t.staff, analyst: coach }, attributes: calculateTeamAttributes(t.roster, t.startingLineup, t.staff.headCoach?.rating, t.staff.headCoach?.specialty, staffFromTeam({ ...t.staff, analyst: coach })) }
        : t
    );
    set({ gameState: { ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool } });
  },

  fireAnalyst: () => {
    const { gameState } = get();
    if (!gameState) return;
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam?.staff.analyst) return;
    const fired = userTeam.staff.analyst;
    const updatedPool = [...(gameState.freeAgentCoaches ?? []), fired];
    const updatedTeams = gameState.teams.map(t =>
      t.id === gameState.userTeamId
        ? { ...t, staff: { ...t.staff, analyst: null }, attributes: calculateTeamAttributes(t.roster, t.startingLineup, t.staff.headCoach?.rating, t.staff.headCoach?.specialty, staffFromTeam({ ...t.staff, analyst: null })) }
        : t
    );
    set({ gameState: { ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool } });
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

    // can't scrim during international tournament
    if (gameState.phase === 'international') {
      set({ notificationToast: '❌ Cannot scrim during international tournament' });
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
      gameState.teams,
      undefined,
      gameState.mapPool,
      gameState.agentMeta,
      gameState.mapMeta,
      gameState.agentVariance ?? 15,
      gameState.teamMapComps ?? {},
      gameState.agentRoleOverrides ?? {},
      gameState.teamMapCompNoPenalty ?? {},
      gameState.teamMapCompBuffs ?? {}
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
          attributes: calculateTeamAttributes(t.roster, t.startingLineup, t.staff.headCoach?.rating, t.staff.headCoach?.specialty, staffFromTeam(t.staff)),
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
    const coachRng = createRNG(`${seed}-coaches`);
    const freeAgentCoaches = generateCoachPool(coachRng, 15);

    set({
      gameState: { ...state, freeAgentCoaches },
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

    if (gameState.phase === 'preseason') return false;

    // during kickoff bracket — eliminated = lost in lower bracket
    if (gameState.phase === 'kickoff_bracket') {
      const bracket = gameState.kickoffBrackets?.[userTeam.region];
      if (!bracket) return false;
      for (const round of bracket.lower) {
        for (const matchup of round.matchups) {
          if (matchup.winnerId && matchup.winnerId !== gameState.userTeamId) {
            if (matchup.team1Id === gameState.userTeamId || matchup.team2Id === gameState.userTeamId) {
              return true;
            }
          }
        }
      }
      return false;
    }

    if (gameState.phase === 'international' && gameState.internationalTournament?.bracket) {
      const qualifiedTeam = gameState.internationalTournament.teams.find(
        t => t.teamId === gameState.userTeamId
      );
      if (!qualifiedTeam) return true;

      // Check Swiss elimination
      const swissTeam = gameState.internationalTournament.bracket.swiss.teams.find(
        t => t.teamId === gameState.userTeamId
      );
      if (swissTeam?.eliminated) return true;

      // Check lower bracket losses (any LB loss = eliminated)
      for (const round of gameState.internationalTournament.bracket.lower) {
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