// src/App.tsx
import { useState, useEffect } from "react";
import { createRNG, randomInt, shuffle } from "./utils/random";
import { generatePlayer } from "./sim/playerGenerator";
import { calculateTeamAttributes } from "./sim/teamRatings";
import {
  createGameState,
  advanceDay,
  skipToPlayoffs,
  type GameState,
  type DayResult,
} from "./sim/gameState";
import {
  saveGame,
  loadGame,
  getAllSaves,
  deleteSave,
  type SavedGame,
} from "./db/gameDatabase";
import { getAgentsForRole } from "./data/agents";
import {
  AMERICAS_TEAMS,
  EMEA_TEAMS,
  PACIFIC_TEAMS,
  CHINA_TEAMS,
  PLACEHOLDER_LOGO,
  type TeamConfig,
} from "./data/teams";
import {
  Dashboard,
  TeamView,
  Sidebar,
  MatchDetailView,
  LeagueEditor,
  SchedulePage,
  StandingsPage,
  PlayerDetailPage,
} from "./ui/components";
import {
  PlayoffBracket as PlayoffBracketView,
  InternationalBracket as InternationalBracketView,
} from "./ui/components/PlayoffBracket";
import { PlayersPage } from "./ui/components/PlayersPage";
import { PowerRankingsPage } from "./ui/components/PowerRankingsPage";
import { MatchToastContainer, type MatchToastData } from "./ui/components/MatchToast";
import { RosterManagementPage } from "./ui/components/RosterManagementPage";
import { FreeAgencyPage } from "./ui/FreeAgencyPage";
import { TradePage } from "./ui/components/TradePage";
import { ScrimsPage } from "./ui/components/ScrimsPage";
import { PWAUpdatePrompt } from "./ui/components/PWAUpdatePrompt";
import { signFreeAgent, releasePlayer, generateFreeAgentPool } from "./sim/freeAgency";
import { executeTrade } from "./sim/trading";
import { getAvailableScrimOpponents, runScrim, isScrimRisky, formatScrimResultLog } from "./sim/scrims";
import { getFatigueLevel, getFatigueDisplay } from "./types/scrims";
import type { ScrimResult } from "./types/scrims";
import type { StartingSlot } from "./types/roster";
import { getRolePenalty } from "./types/roster";
import { calculateEffectiveOverallWithIGL } from "./sim/iglBonus";
import { getCompositionPenalty } from "./sim/compositionBonus";
import type { Team, Player, Role, AgentPool, Region } from "./types";
import type { RNG } from "./utils/random";
import { PlayerEditModal } from "./ui/components/PlayerEditModal";
import "./App.css";

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

    // Use agent pool from config if provided, otherwise generate random
    player.agentPool = playerConfig.agents 
      ? { ...playerConfig.agents }  // Use config-specified agents
      : generateAgentPoolForRole(rng, playerConfig.role);

    return player;
  });

  // Default IGL to the initiator player (typically the IGL in pro play)
  const iglPlayer = config.igl
  ? roster.find((p) => p.name === config.igl)
  : roster.find((p) => p.role === "initiator");

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

function getTeamsByRegion(teams: Team[], region: Region): Team[] {
  return teams.filter((t) => t.region === region);
}

const REGION_NAMES: Record<Region, string> = {
  americas: "Americas",
  emea: "EMEA",
  pacific: "Pacific",
  china: "China",
};

const REGION_LOGOS: Record<Region, string> = {
  americas: '/logos/regions/Americas.png',
  emea: '/logos/regions/EMEA.png',
  pacific: '/logos/regions/Pacific.png',
  china: '/logos/regions/China.png',
};

const CHAMPIONS_LOGO = '/logos/regions/Champions.png';

type NavView =
  | "dashboard"
  | "standings"
  | "schedule"
  | "playoffs"
  | "power-rankings"
  | "team"
  | "roster"
  | "free-agents"
  | "trade"
  | "draft"
  | "history"
  | "finances"
  | "player"
  | "league-standings"
  | "international"
  | "match-detail"
  | "players"
  | "roster-management"
  | "free-agency"
  | "scrims";
type AppScreen = "welcome" | "setup" | "game" | "editor";

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("welcome");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [saves, setSaves] = useState<SavedGame[]>([]);
  const [currentSaveId, setCurrentSaveId] = useState<string | null>(null);
  const [view, setView] = useState<NavView>("dashboard");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [recentResults, setRecentResults] = useState<DayResult[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<Region>("americas");
  const [matchToasts, setMatchToasts] = useState<MatchToastData[]>([]);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [previousView, setPreviousView] = useState<NavView>("dashboard");
  const [showEditPlayerModal, setShowEditPlayerModal] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [showScrimModal, setShowScrimModal] = useState(false);
  const [scrimHistory, setScrimHistory] = useState<ScrimResult[]>([]);
  const [selectedScrimMatch, setSelectedScrimMatch] = useState<ScrimResult | null>(null);

  const [setupSeed, setSetupSeed] = useState<string>("");
  const [setupTeams, setSetupTeams] = useState<Team[]>([]);
  const [setupSelectedTeamId, setSetupSelectedTeamId] = useState<string | null>(
    null
  );

  useEffect(() => {
    getAllSaves().then(setSaves);
  }, []);

  // Auto-dismiss notification toast after 3 seconds
  useEffect(() => {
    if (notificationToast) {
      const timer = setTimeout(() => setNotificationToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notificationToast]);

  const handleDismissToast = (id: string) => {
    setMatchToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleToastClick = (matchId: string) => {
    setPreviousView(view);
    setSelectedMatchId(matchId);
    setView("match-detail");
  };

  const handleStartSetup = () => {
    const seed = `game-${crypto.randomUUID()}`;
    setSetupSeed(seed);
    const teams = generateAllTeams(seed);
    setSetupTeams(teams);
    setSetupSelectedTeamId(null);
    setScreen("setup");
  };

  // Import league from JSON file
  const handleImportLeague = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        
        // Check if it's a full league export or team configs
        if (json.teams && Array.isArray(json.teams) && json.teams[0]?.roster) {
          // Full league export - has complete team data with rosters
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
            roster: ImportedPlayerData[];
          }
          
          interface ImportedPlayerData {
            id: string;
            name: string;
            age: number;
            role: Role;
            overall: number;
            potential: Player['potential'];
            ratings: Player['ratings'];
            personality: Player['personality'];
            background: Player['background'];
            archetype: Player['archetype'];
            development: Player['development'];
            agentPool: Player['agentPool'];
            contract?: Player['contract'];
            careerStats?: Player['careerStats'];
          }
          
          const importedTeams: Team[] = (json.teams as ImportedTeamData[]).map((teamData) => ({
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
            attributes: teamData.attributes || calculateTeamAttributes(teamData.roster as Player[]),
            roster: teamData.roster.map((p) => ({
              ...p,
              // Ensure all required fields exist
              careerStats: p.careerStats || null,
            })) as Player[],
          }));

          // Create game state from imported data
          const userTeamId = json.gameInfo?.userTeamId || importedTeams[0]?.id || '';
          // Always generate a NEW seed so each import produces different results
          const seed = `import-${crypto.randomUUID()}`;
          const state = createGameState(importedTeams, userTeamId, seed);
          
          // Start fresh - don't restore previous progress
          // This ensures randomness on each import
          // state starts at day 0, preseason, with fresh standings from createGameState
          
          // Import free agents if available
          const freeAgents = json.freeAgents || [];
          
          setGameState({ ...state, freeAgents });
          setCurrentSaveId(null);
          setView("dashboard");
          setRecentResults([]);
          const userTeam = importedTeams.find(t => t.id === userTeamId);
          if (userTeam) setSelectedRegion(userTeam.region);
          setScreen("game");
          
          alert(`Successfully imported league with ${importedTeams.length} teams!`);
        } else if (json.teamsByRegion) {
          // Team configs format - need to convert to full teams
          alert("Team configs format detected. Please use 'Full League Export' format for importing.");
        } else {
          alert("Unrecognized JSON format. Please use a valid ValorantGM export file.");
        }
      } catch (err) {
        console.error("Import error:", err);
        alert("Failed to import JSON file. Please check the file format.");
      }
    };
    reader.readAsText(file);
    
    // Reset the input so the same file can be imported again
    event.target.value = '';
  };

  const handleConfirmSetup = () => {
    if (!setupSelectedTeamId) return;
    const selectedTeam = setupTeams.find((t) => t.id === setupSelectedTeamId);
    if (!selectedTeam) return;
    const state = createGameState(setupTeams, setupSelectedTeamId, setupSeed);
    
    // Initialize free agents pool
    const faRng = createRNG(`${setupSeed}-freeagents`);
    const freeAgents = generateFreeAgentPool(faRng, 75);
    
    setGameState({ ...state, freeAgents });
    setCurrentSaveId(null);
    setView("dashboard");
    setRecentResults([]);
    setSelectedTeamId(setupSelectedTeamId);
    setSelectedRegion(selectedTeam.region);
    setScreen("game");
  };

  const handleAdvanceDay = () => {
    if (!gameState) return;
    const result = advanceDay(gameState);
    setGameState({ ...gameState });
    setRecentResults((prev) => [...prev.slice(-20), result]);

    // Check if user team played and show toast
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

            // Find the match ID - check schedule first, then use match.id for playoffs
            let matchId = match.id; // MatchResult has id field
            
            // For regular season, find the schedule entry to get the schedule match ID
            const scheduleMatch = gameState.schedule.find(
              m => m.homeTeamId === match.homeTeamId && 
                   m.awayTeamId === match.awayTeamId && 
                   m.played
            );
            if (scheduleMatch) {
              matchId = scheduleMatch.id;
            }

            setMatchToasts(prev => [...prev, {
              id: `toast-${Date.now()}`,
              matchId,
              userTeam,
              opponent,
              userScore,
              opponentScore,
              isWin,
            }]);
          }
        }
      }
    }
  };

  // Handle running a scrim
  const handleScrim = (opponentId: string, opponentType: 'regional' | 'tier2', opponentName: string) => {
    if (!gameState || !gameState.userTeamId) return;

    // Can't scrim during playoffs
    if (gameState.phase === 'regional_playoffs' || gameState.phase === 'international') {
      setNotificationToast('❌ Cannot scrim during playoffs');
      return;
    }

    // Can't scrim twice in same day
    if (gameState.lastScrimDay === gameState.currentDay) {
      setNotificationToast('❌ Already scrimmaged today');
      return;
    }

    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;

    // Create RNG for this scrim
    const rng = createRNG(`${gameState.seed}-scrim-${gameState.currentDay}-${opponentId}`);

    // Run the scrim
    const result: ScrimResult = runScrim(
      rng,
      userTeam,
      opponentName,
      opponentType,
      gameState.fatigueLevel,
      gameState.currentDay,
      gameState.currentYear,
      gameState.teams
    );

    // Update game state - increase fatigue by 1
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

    // Add to recent results
    const scrimDayResult: DayResult = {
      day: gameState.currentDay,
      matchesPlayed: [],
      events: [scrimEvent],
    };

    setGameState(updatedState);
    setRecentResults(prev => [...prev.slice(-20), scrimDayResult]);
    setScrimHistory(prev => [...prev, result]);
    setShowScrimModal(false);
    setNotificationToast(result.statChanges.length > 0 
      ? `🏋️ Scrim complete! ${result.statChanges.length} player(s) developed`
      : `🏋️ Scrim complete. No significant changes.`);
  };

  // Simulate until user's team has their next match
  // Check if user's team has been eliminated from playoffs
  const isUserTeamEliminated = (): boolean => {
    if (!gameState || !gameState.userTeamId) return false;
    
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return false;
    
    // During regular season, not eliminated yet
    if (gameState.phase === 'preseason' || gameState.phase === 'regular_season') {
      return false;
    }
    
    // Check if playoffs have started for user's region
    const userRegion = userTeam.region;
    const regionPlayoff = gameState.regionalPlayoffs[userRegion];
    
    if (regionPlayoff) {
      // Get standings to check if user made top 6
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
      
      // Didn't make playoffs (not in top 6)
      if (userRank > 6) {
        return true;
      }
      
      // Check if eliminated from regional playoffs
      // Look through bracket to see if user lost a match
      for (const round of regionPlayoff.rounds) {
        for (const matchup of round.matchups) {
          if (matchup.winnerId && matchup.winnerId !== gameState.userTeamId) {
            // User was in this matchup and lost
            if (matchup.team1Id === gameState.userTeamId || matchup.team2Id === gameState.userTeamId) {
              return true;
            }
          }
        }
      }
    }
    
    // Check international tournament elimination
    if (gameState.phase === 'international' && gameState.internationalTournament?.bracket) {
      // Check if user qualified for international
      const qualifiedTeam = gameState.internationalTournament.teams.find(
        t => t.teamId === gameState.userTeamId
      );
      
      if (!qualifiedTeam) {
        return true; // Didn't qualify
      }
      
      // Check if eliminated from international bracket
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
  };

  // Check if the season is complete (international tournament has a champion)
  const isSeasonComplete = (): boolean => {
    if (!gameState) return false;
    return gameState.internationalTournament?.champion !== undefined;
  };

  const handleSimToNextMatchup = () => {
    if (!gameState || !gameState.userTeamId) return;
    
    // Check if season is complete
    if (isSeasonComplete()) {
      setNotificationToast("❌ The season is complete. There are no more games.");
      return;
    }
    
    // Check if user team is eliminated
    if (isUserTeamEliminated()) {
      setNotificationToast("❌ Your team has been eliminated. There are no more games this season.");
      return;
    }
    
    const userTeamId = gameState.userTeamId;
    let daysSimulated = 0;
    const maxDays = 100; // Safety limit
    
    while (daysSimulated < maxDays) {
      // Check if season completed during simulation
      if (isSeasonComplete()) {
        setGameState({ ...gameState });
        setNotificationToast(`🏁 Season complete! Simulated ${daysSimulated} day(s).`);
        return;
      }
      
      // Check if user got eliminated during simulation
      if (isUserTeamEliminated()) {
        setGameState({ ...gameState });
        setNotificationToast("❌ Your team has been eliminated from the playoffs.");
        return;
      }
      
      const result = advanceDay(gameState);
      setRecentResults((prev) => [...prev.slice(-20), result]);
      daysSimulated++;
      
      // Check if user team played
      const userPlayed = result.matchesPlayed.some(
        match => match.homeTeamId === userTeamId || match.awayTeamId === userTeamId
      );
      
      if (userPlayed) {
        // Show toast for user's match
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
              if (scheduleMatch) {
                matchId = scheduleMatch.id;
              }

              setMatchToasts(prev => [...prev, {
                id: `toast-${Date.now()}`,
                matchId,
                userTeam,
                opponent,
                userScore,
                opponentScore,
                isWin,
              }]);
            }
          }
        }
        break;
      }
    }
    
    setGameState({ ...gameState });
  };

  const handleSkipToPlayoffs = () => {
    if (!gameState) return;
    if (gameState.phase !== "preseason" && gameState.phase !== "regular_season")
      return;
    if (
      !confirm(
        "Skip the regular season and simulate all matches? This cannot be undone."
      )
    )
      return;
    const events = skipToPlayoffs(gameState);
    setGameState({ ...gameState });
    setRecentResults((prev) => [
      ...prev,
      { day: gameState.currentDay, matchesPlayed: [], events },
    ]);
    setNotificationToast("⏭️ Skipped to playoffs! All regular season matches have been simulated.");
  };

  const handleSimToChampions = () => {
    if (!gameState) return;
    if (gameState.phase === 'international' && gameState.internationalTournament?.champion) {
      setNotificationToast("🏆 Champions has already concluded!");
      return;
    }
    if (
      !confirm(
        "Simulate all the way to VALORANT Champions? This will skip the regular season and regional playoffs. This cannot be undone."
      )
    )
      return;
    
    // Keep advancing until international tournament bracket is ready
    let safetyCounter = 0;
    const maxIterations = 500;
    
    while (safetyCounter < maxIterations) {
      // Check if international tournament bracket is ready (not just the phase)
      if (gameState.phase === 'international' && gameState.internationalTournament?.bracket) {
        break;
      }
      
      advanceDay(gameState);
      safetyCounter++;
    }
    
    setGameState({ ...gameState });
    setRecentResults((prev) => [
      ...prev,
      { day: gameState.currentDay, matchesPlayed: [], events: [{ type: 'phase_change', message: 'Simulated to VALORANT Champions!' }] },
    ]);
    setNotificationToast("🌍 Simulated to VALORANT Champions! The international tournament is ready.");
  };

  // Roster Management Handlers
  const handleUpdateLineup = (teamId: string, newLineup: StartingSlot[]) => {
    if (!gameState) return;
    const updatedTeams = gameState.teams.map(team =>
      team.id === teamId
        ? { ...team, startingLineup: newLineup }
        : team
    );
    setGameState({ ...gameState, teams: updatedTeams });
  };

  const handleSignFreeAgent = (playerId: string) => {
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

    setGameState({
      ...gameState,
      teams: updatedTeams,
      freeAgents: result.updatedFreeAgents,
    });
  };

  const handleReleasePlayer = (playerId: string) => {
    if (!gameState || !gameState.userTeamId) return;
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;

    // Don't allow releasing a starter
    if (userTeam.startingLineup?.some(s => s.playerId === playerId)) {
      alert("Cannot release a player in the starting lineup. Move them to bench first.");
      return;
    }

    const result = releasePlayer(gameState.freeAgents || [], playerId, userTeam.roster);
    if (!result) return;

    const updatedTeams = gameState.teams.map(team =>
      team.id === gameState.userTeamId
        ? { ...team, roster: result.updatedRoster }
        : team
    );

    setGameState({
      ...gameState,
      teams: updatedTeams,
      freeAgents: result.updatedFreeAgents,
    });
  };

  // Trade handler
  const handleExecuteTrade = (team1Id: string, team2Id: string, player1Ids: string[], player2Ids: string[]) => {
    if (!gameState) return;

    const result = executeTrade(gameState.teams, team1Id, team2Id, player1Ids, player2Ids);
    
    if (result.success) {
      setGameState({
        ...gameState,
        teams: result.updatedTeams,
      });
      setNotificationToast(`🤝 ${result.message}`);
    } else {
      setNotificationToast(`❌ Trade failed: ${result.message}`);
    }
  };

  // Switch team handler (dev mode)
  const handleSwitchTeam = (newTeamId: string) => {
    if (!gameState || !devMode) return;
    
    const newTeam = gameState.teams.find(t => t.id === newTeamId);
    if (!newTeam) return;
    
    setGameState({
      ...gameState,
      userTeamId: newTeamId,
    });
    
    // Update selected region to match the new team's region
    setSelectedRegion(newTeam.region);
    
    setNotificationToast(`🔄 Switched to ${newTeam.name}`);
  };

  const handleSavePlayer = (updatedPlayer: Player) => {
    if (!gameState) return;

    setGameState(prev => {
      if (!prev) return prev;
      
      const updatedTeams = prev.teams.map(team => ({
        ...team,
        roster: team.roster.map(p => 
          p.id === updatedPlayer.id ? updatedPlayer : p
        ),
      }));

      // Also update free agents if the player is there
      const updatedFreeAgents = prev.freeAgents?.map(p =>
        p.id === updatedPlayer.id ? updatedPlayer : p
      );

      return {
        ...prev,
        teams: updatedTeams,
        freeAgents: updatedFreeAgents,
      };
    });
    
    setShowEditPlayerModal(false);
  };

  const handleSave = async () => {
    if (!gameState) return;
    const name = currentSaveId
      ? saves.find((s) => s.id === currentSaveId)?.name
      : `Save - Day ${gameState.currentDay}`;
    const saved = await saveGame(
      gameState,
      name || "Unnamed Save",
      currentSaveId || undefined
    );
    setCurrentSaveId(saved.id);
    setSaves(await getAllSaves());
    alert(`Game saved! (${name || "Unnamed Save"})`);
  };

  // Export league data as JSON for customization
  const handleExportLeague = () => {
    if (!gameState) return;

    // Build export data with all team and player information
    const exportData = {
      exportVersion: "1.0",
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
      })),
      standings: gameState.standings,
      champions: gameState.champions,
    };

    // Create and download the JSON file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valorantgm-league-${gameState.currentYear}-day${gameState.currentDay}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export just team configs in a format ready for teams.ts
  const handleExportTeamConfigs = () => {
    if (!gameState) return;

    const teamConfigs = gameState.teams.map(team => {
      // Find IGL name
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
        })),
      };
    });

    // Group by region for easier editing
    const byRegion = {
      americas: teamConfigs.filter(t => t.region === 'americas'),
      emea: teamConfigs.filter(t => t.region === 'emea'),
      pacific: teamConfigs.filter(t => t.region === 'pacific'),
      china: teamConfigs.filter(t => t.region === 'china'),
    };

    const exportData = {
      exportVersion: "1.0",
      exportDate: new Date().toISOString(),
      description: "Team configurations for ValorantGM. Edit this file and provide to Claude to update teams.ts",
      teamsByRegion: byRegion,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valorantgm-team-configs.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoad = async (id: string) => {
    const save = await loadGame(id);
    if (save) {
      // Generate a NEW seed so each load produces different results
      // Use crypto.randomUUID() which is allowed by React
      const newSeed = `load-${crypto.randomUUID()}`;
      const updatedGameState = {
        ...save.gameState,
        seed: newSeed,
      };
      setGameState(updatedGameState);
      setCurrentSaveId(save.id);
      setView("dashboard");
      setRecentResults([]);
      setSelectedTeamId(save.gameState.userTeamId);
      const userTeam = save.gameState.teams.find(
        (t) => t.id === save.gameState.userTeamId
      );
      if (userTeam) setSelectedRegion(userTeam.region);
      setScreen("game");
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSave(id);
    setSaves(await getAllSaves());
    if (currentSaveId === id) setCurrentSaveId(null);
  };

  const handleNavigate = (newView: NavView, teamId?: string) => {
    setView(newView);
    if (teamId) setSelectedTeamId(teamId);
    if (newView === "roster" && gameState)
      setSelectedTeamId(gameState.userTeamId);
  };

  const handleViewTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setView("team");
  };

  const handleViewPlayer = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setView("player");
  };

  const handleNextTeam = () => {
    if (!gameState) return;
    const currentId = selectedTeamId || gameState.userTeamId;
    const currentIdx = gameState.teams.findIndex((t) => t.id === currentId);
    const nextIdx = (currentIdx + 1) % gameState.teams.length;
    setSelectedTeamId(gameState.teams[nextIdx].id);
    setView("team");
  };

  const handlePrevTeam = () => {
    if (!gameState) return;
    const currentId = selectedTeamId || gameState.userTeamId;
    const currentIdx = gameState.teams.findIndex((t) => t.id === currentId);
    const prevIdx =
      (currentIdx - 1 + gameState.teams.length) % gameState.teams.length;
    setSelectedTeamId(gameState.teams[prevIdx].id);
    setView("team");
  };

  const findMatchResult = (matchId: string) => {
    if (!gameState) return null;

    // Check regular season schedule - by schedule ID or by result ID
    for (const scheduleMatch of gameState.schedule) {
      if (scheduleMatch.result) {
        // Match by schedule entry ID or by the result's ID
        if (scheduleMatch.id === matchId || scheduleMatch.result.id === matchId) {
          return {
            result: scheduleMatch.result,
            homeTeamId: scheduleMatch.homeTeamId,
            awayTeamId: scheduleMatch.awayTeamId,
          };
        }
      }
    }

    // Check regional playoffs
    for (const region of ["americas", "emea", "pacific", "china"] as Region[]) {
      const bracket = gameState.regionalPlayoffs[region];
      if (bracket) {
        for (const round of bracket.rounds) {
          for (const matchup of round.matchups) {
            if (matchup.team1Id && matchup.team2Id && matchup.matchResults?.length > 0) {
              // Check if matchup.id matches
              if (matchup.id === matchId) {
                return {
                  result: matchup.matchResults[0],
                  homeTeamId: matchup.team1Id,
                  awayTeamId: matchup.team2Id,
                };
              }
              // Also check if any matchResult.id matches
              const matchResult = matchup.matchResults.find(r => r.id === matchId);
              if (matchResult) {
                return {
                  result: matchResult,
                  homeTeamId: matchup.team1Id,
                  awayTeamId: matchup.team2Id,
                };
              }
            }
          }
        }
      }
    }

    // Check international tournament
    if (gameState.internationalTournament?.bracket) {
      for (const round of gameState.internationalTournament.bracket.rounds) {
        for (const matchup of round.matchups) {
          if (matchup.team1Id && matchup.team2Id && matchup.matchResults?.length > 0) {
            // Check if matchup.id matches
            if (matchup.id === matchId) {
              return {
                result: matchup.matchResults[0],
                homeTeamId: matchup.team1Id,
                awayTeamId: matchup.team2Id,
              };
            }
            // Also check if any matchResult.id matches
            const matchResult = matchup.matchResults.find(r => r.id === matchId);
            if (matchResult) {
              return {
                result: matchResult,
                homeTeamId: matchup.team1Id,
                awayTeamId: matchup.team2Id,
              };
            }
          }
        }
      }
    }

    return null;
  };

  // Helper function to calculate effective OVR for a player
  const getPlayerEffectiveOVR = (player: Player, team: Team) => {
    const lineup: StartingSlot[] = team.startingLineup || 
      team.roster.slice(0, 5).map(p => ({
        playerId: p.id,
        assignedRole: p.role,
      }));
    
    const lineupSlot = lineup.find(s => s.playerId === player.id);
    const isStarter = !!lineupSlot;
    
    if (isStarter && lineupSlot) {
      const rolePenalty = getRolePenalty(player.role, lineupSlot.assignedRole);
      const compositionPenalty = getCompositionPenalty(lineup);
      const iglResult = calculateEffectiveOverallWithIGL(
        player,
        team,
        lineup,
        rolePenalty,
        compositionPenalty
      );
      
      return {
        effectiveOvr: iglResult.effectiveOvr,
        baseOvr: player.overall,
        rolePenalty,
        iglBonus: iglResult.iglBonus,
        compositionPenalty,
        isStarter: true,
        assignedRole: lineupSlot.assignedRole,
      };
    }
    
    return {
      effectiveOvr: player.overall,
      baseOvr: player.overall,
      rolePenalty: 0,
      iglBonus: 0,
      compositionPenalty: 0,
      isStarter: false,
      assignedRole: player.role,
    };
  };

  const selectedTeam = gameState?.teams.find((t) => t.id === selectedTeamId);
  const userTeam = gameState?.teams.find((t) => t.id === gameState.userTeamId);
  const selectedPlayer = gameState?.teams
    .flatMap((t) => t.roster)
    .find((p) => p.id === selectedPlayerId);
  const selectedPlayerTeam = gameState?.teams.find((t) =>
    t.roster.some((p) => p.id === selectedPlayerId)
  );

  if (screen === "welcome") {
    return (
      <div className="app">
        <div className="welcome">
          <h1>🎮 ValorantGM</h1>
          <p>A VALORANT esports management simulation</p>
          <button className="btn-start" onClick={handleStartSetup}>
            Start New Game
          </button>
          <button
            className="btn-start"
            onClick={() => setScreen("editor")}
            style={{
              marginTop: "12px",
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
            }}
          >
            ✏️ Create Custom League
          </button>
          <label
            className="btn-start"
            style={{
              marginTop: "12px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              border: "none",
              cursor: "pointer",
              display: "inline-block",
            }}
          >
            📥 Import League JSON
            <input
              type="file"
              accept=".json"
              onChange={handleImportLeague}
              style={{ display: "none" }}
            />
          </label>
          {saves.length > 0 && (
            <div className="saves-list-welcome">
              <h3>Or continue a saved game:</h3>
              {saves.map((save) => (
                <div key={save.id} className="save-item-welcome">
                  <div className="save-info">
                    <span className="save-name">{save.name}</span>
                    <span className="save-details">
                      Day {save.gameState.currentDay} •{" "}
                      {save.gameState.phase.replace("_", " ")}
                    </span>
                  </div>
                  <div>
                    <button onClick={() => handleLoad(save.id)}>Load</button>
                    <button
                      className="delete"
                      onClick={() => handleDelete(save.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === "editor") {
    return (
      <div className="app">
        <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
          <LeagueEditor
            onSaveLeague={(teams) => {
              // Ensure all teams have iglId
              const teamsWithIGL = teams.map((t) => ({
                ...t,
                iglId:
                  t.iglId ||
                  t.roster.find((p) => p.role === "initiator")?.id ||
                  t.roster[0]?.id ||
                  null,
              }));
              const seed = `custom-${crypto.randomUUID()}`;
              const userTeamId = teamsWithIGL[0]?.id || "";
              const state = createGameState(teamsWithIGL, userTeamId, seed);
              setGameState(state);
              setSelectedRegion(teamsWithIGL[0]?.region || "americas");
              setCurrentSaveId(null);
              setView("dashboard");
              setRecentResults([]);
              setScreen("game");
            }}
            onCancel={() => setScreen("welcome")}
          />
        </div>
      </div>
    );
  }

  if (screen === "setup") {
    const regions: Region[] = ["americas", "emea", "pacific", "china"];
    const setupRegionTeams = getTeamsByRegion(setupTeams, selectedRegion);

    return (
      <div className="app">
        <div className="setup-screen">
          <h1>🎮 New Game Setup</h1>
          <div className="setup-section">
            <h2>Select Your Region</h2>
            <div className="region-selector">
              {regions.map((region) => (
                <button
                  key={region}
                  className={`region-btn ${
                    selectedRegion === region ? "active" : ""
                  }`}
                  onClick={() => {
                    setSelectedRegion(region);
                    setSetupSelectedTeamId(null);
                  }}
                >
                  {REGION_NAMES[region]}
                  <span className="region-team-count">
                    {getTeamsByRegion(setupTeams, region).length} teams
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="setup-section">
            <h2>Select Your Team</h2>
            <div className="team-selector">
              {setupRegionTeams.map((team) => (
                <div
                  key={team.id}
                  className={`team-select-card ${
                    setupSelectedTeamId === team.id ? "selected" : ""
                  }`}
                  onClick={() => setSetupSelectedTeamId(team.id)}
                >
                  <img
                    src={team.logo}
                    alt={team.name}
                    className="team-select-logo"
                  />
                  <div className="team-select-info">
                    <span className="team-select-name">{team.name}</span>
                    <span className="team-select-abbr">
                      {team.abbreviation}
                    </span>
                  </div>
                  <div className="team-select-stats">
                    <span>FP: {team.attributes.firepower}</span>
                    <span>
                      OVR:{" "}
                      {Math.round(
                        team.roster.reduce((s, p) => s + p.overall, 0) /
                          team.roster.length
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="setup-actions">
            <button className="btn-back" onClick={() => setScreen("welcome")}>
              ← Back
            </button>
            <button
              className="btn-start-game"
              onClick={handleConfirmSetup}
              disabled={!setupSelectedTeamId}
            >
              Start Game →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  const currentRegionPlayoff = gameState.regionalPlayoffs[selectedRegion];

  return (
    <div className="app">
      <div className="top-bar">
        <div className="top-bar-logo">🎮 ValorantGM</div>
        <div className="top-bar-info">
          <span className="top-bar-phase">
            {gameState.phase.replace("_", " ").toUpperCase()}
          </span>
          <span>Day {gameState.currentDay}</span>
          <span>Season {gameState.currentYear}</span>
          {userTeam && (
            <span
              style={{
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {userTeam.logo && (
                <img
                  src={userTeam.logo}
                  alt=""
                  style={{
                    width: "20px",
                    height: "20px",
                    objectFit: "contain",
                  }}
                />
              )}
              {userTeam.name}
            </span>
          )}
        </div>
        <div className="top-bar-actions">
          <div className="simulate-dropdown">
            <button className="btn btn-skip" title="Simulate to a specific point">
              ⏭ Simulate To ▾
            </button>
            <div className="simulate-dropdown-content">
              <div className="simulate-dropdown-menu">
                <button 
                  onClick={handleSkipToPlayoffs}
                  disabled={gameState.phase !== "preseason" && gameState.phase !== "regular_season"}
                >
                  🏆 Regional Playoffs
                  <span className="simulate-desc">Skip regular season</span>
                </button>
                <button 
                  onClick={handleSimToChampions}
                  disabled={gameState.phase === 'international'}
                >
                  🌍 VALORANT Champions
                  <span className="simulate-desc">Skip to international tournament</span>
                </button>
              </div>
            </div>
          </div>
          <button className="btn btn-play" onClick={handleAdvanceDay}>
            ▶ Play Day
          </button>
          <button 
            className={`btn btn-scrim ${gameState.lastScrimDay === gameState.currentDay ? 'disabled' : ''} ${(gameState.phase === 'regional_playoffs' || gameState.phase === 'international') ? 'disabled' : ''}`}
            onClick={() => setShowScrimModal(true)}
            disabled={gameState.lastScrimDay === gameState.currentDay || gameState.phase === 'regional_playoffs' || gameState.phase === 'international'}
            title={
              gameState.phase === 'regional_playoffs' || gameState.phase === 'international' 
                ? 'Cannot scrim during playoffs' 
                : gameState.lastScrimDay === gameState.currentDay 
                  ? 'Already scrimmaged today' 
                  : 'Practice match for player development'
            }
          >
            🏋️ Scrim
            {gameState.fatigueLevel > 0 && (
              <span className={`scrim-count ${getFatigueLevel(gameState.fatigueLevel)}`}>
                {gameState.fatigueLevel}
              </span>
            )}
          </button>
          <button 
            className="btn btn-sim-next" 
            onClick={handleSimToNextMatchup}
            title="Simulate until your team plays"
          >
            ⏩ Sim to Next
          </button>
          <button className="btn btn-save" onClick={handleSave}>
            💾 Save
          </button>
          <div className="export-dropdown">
            <button className="btn btn-export" title="Export league data">
              📤 Export ▾
            </button>
            <div className="export-dropdown-content">
              <div className="export-dropdown-menu">
                <button onClick={handleExportLeague}>
                  📋 Full League Export
                  <span className="export-desc">All data including stats & history</span>
                </button>
                <button onClick={handleExportTeamConfigs}>
                  ⚙️ Team Configs Only
                  <span className="export-desc">Clean format for editing teams.ts</span>
                </button>
                <button 
                  className={`dev-mode-toggle ${devMode ? 'active' : ''}`}
                  onClick={() => setDevMode(!devMode)}
                >
                  <div className="toggle-label">
                    🔧 Dev Mode
                    <span className="export-desc">Edit any player on any team</span>
                  </div>
                  <div className="toggle-switch"></div>
                </button>
                {devMode && gameState && gameState.userTeamId && (
                  <div className="dev-team-switcher">
                    <label className="switcher-label">🔄 Switch Team</label>
                    <select 
                      value={gameState.userTeamId}
                      onChange={(e) => handleSwitchTeam(e.target.value)}
                      className="team-switcher-select"
                    >
                      {(['americas', 'emea', 'pacific', 'china'] as Region[]).map(region => (
                        <optgroup key={region} label={REGION_NAMES[region]}>
                          {gameState.teams
                            .filter(t => t.region === region)
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(team => (
                              <option key={team.id} value={team.id}>
                                {team.name} ({team.abbreviation})
                              </option>
                            ))
                          }
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
          {devMode && <span className="dev-mode-badge">DEV</span>}
        </div>
      </div>

      <div className="main-layout">
        <Sidebar
          gameState={gameState}
          currentView={view}
          onNavigate={handleNavigate}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
        />

        <main className="content">
          {view === "dashboard" && (
            <>
              <div className="content-header">
                <h1>{userTeam?.name} Dashboard</h1>
                <span className="team-badge">YOUR TEAM</span>
                <button
                  className="manage-roster-btn"
                  onClick={() => setView("roster-management")}
                  style={{
                    marginLeft: "auto",
                    padding: "8px 16px",
                    background: "linear-gradient(135deg, #ff4655, #ff6b6b)",
                    border: "none",
                    borderRadius: "6px",
                    color: "white",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ⚙️ Manage Lineup
                </button>
              </div>
              <Dashboard
                gameState={gameState}
                onViewTeam={handleViewTeam}
                onViewMatch={(matchId) => {
                  setPreviousView("dashboard");
                  setSelectedMatchId(matchId);
                  setView("match-detail");
                }}
                recentResults={recentResults}
                regionLogos={REGION_LOGOS}
                championsLogo={CHAMPIONS_LOGO}
              />
            </>
          )}

          {view === "standings" && (
            <StandingsPage
              standings={gameState.standings}
              teams={gameState.teams}
              schedule={gameState.schedule}
              userTeamId={gameState.userTeamId}
              selectedRegion={selectedRegion}
              onRegionChange={setSelectedRegion}
              onViewTeam={handleViewTeam}
              playoffsStarted={
                gameState.phase === 'regional_playoffs' ||
                gameState.phase === 'international' ||
                gameState.regionalPlayoffs[selectedRegion] !== undefined
              }
            />
          )}

          {view === "schedule" && (
            <SchedulePage
              schedule={gameState.schedule}
              teams={gameState.teams}
              userTeamId={gameState.userTeamId}
              currentDay={gameState.currentDay}
              selectedRegion={selectedRegion}
              onRegionChange={setSelectedRegion}
              onViewMatch={(matchId) => {
                setPreviousView("schedule");
                setSelectedMatchId(matchId);
                setView("match-detail");
              }}
            />
          )}

          {view === "playoffs" && (
            <>
              <div className="content-header">
                <img
                  src={REGION_LOGOS[selectedRegion]}
                  alt=""
                  className="region-header-logo"
                />
                <h1>{REGION_NAMES[selectedRegion]} Regional Playoffs</h1>
              </div>
              <div className="region-tabs">
                {(["americas", "emea", "pacific", "china"] as Region[]).map(
                  (region) => (
                    <button
                      key={region}
                      className={`region-tab ${
                        selectedRegion === region ? "active" : ""
                      }`}
                      onClick={() => setSelectedRegion(region)}
                    >
                      <img
                        src={REGION_LOGOS[region]}
                        alt=""
                        className="region-tab-logo"
                      />
                      {REGION_NAMES[region]}
                      {gameState.regionalChampions[region] && " 🏆"}
                    </button>
                  )
                )}
              </div>
              {currentRegionPlayoff ? (
                <PlayoffBracketView
                  bracket={currentRegionPlayoff}
                  teams={gameState.teams}
                  regionChampion={gameState.regionalChampions[selectedRegion]}
                  playoffSeeds={(() => {
                    // Compute playoff seeds from standings for this region
                    const regionTeamIds = new Set(
                      gameState.teams
                        .filter((t) => t.region === selectedRegion)
                        .map((t) => t.id)
                    );
                    const regionStandings = [...gameState.standings]
                      .filter((s) => regionTeamIds.has(s.teamId))
                      .sort((a, b) => {
                        if (b.wins !== a.wins) return b.wins - a.wins;
                        const aMapDiff = a.mapWins - a.mapLosses;
                        const bMapDiff = b.mapWins - b.mapLosses;
                        if (bMapDiff !== aMapDiff) return bMapDiff - aMapDiff;
                        return b.roundDifferential - a.roundDifferential;
                      });
                    const seedMap = new Map<string, number>();
                    regionStandings
                      .slice(0, 6)
                      .forEach((s, idx) => seedMap.set(s.teamId, idx + 1));
                    return seedMap;
                  })()}
                  onMatchClick={(matchupId) => {
                    setPreviousView("playoffs");
                    setSelectedMatchId(matchupId);
                    setView("match-detail");
                  }}
                />
              ) : (
                <div className="panel">
                  <div className="panel-body">
                    <p style={{ color: "var(--text-muted)" }}>
                      {gameState.phase === "regular_season"
                        ? "Playoffs have not started yet. Complete the regular season first."
                        : "No playoff bracket for this region."}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {view === "international" && (
            <>
              <div className="content-header">
                <h1>🌍 VALORANT Champions</h1>
              </div>
              {gameState.internationalTournament ? (
                <>
                  <div className="panel" style={{ marginBottom: "16px" }}>
                    <div className="panel-header">Qualified Teams</div>
                    <div className="panel-body">
                      <div className="qualified-teams-grid">
                        {(
                          ["americas", "emea", "pacific", "china"] as Region[]
                        ).map((region) => (
                          <div key={region} className="qualified-region">
                            <h4 className="qualified-region-title">
                              <img
                                src={REGION_LOGOS[region]}
                                alt=""
                                className="qualified-region-logo"
                              />
                              {REGION_NAMES[region]}
                            </h4>
                            {gameState
                              .internationalTournament!.teams.filter(
                                (t) => t.region === region
                              )
                              .sort((a, b) => a.seed - b.seed)
                              .map((t) => {
                                const team = gameState.teams.find(
                                  (tm) => tm.id === t.teamId
                                );
                                return (
                                  <div
                                    key={t.teamId}
                                    className="qualified-team-row"
                                  >
                                    <span className="qualified-seed">
                                      #{t.seed}
                                    </span>
                                    <img
                                      src={team?.logo}
                                      alt={team?.name}
                                      className="qualified-team-logo"
                                    />
                                    <span className="qualified-team-name">
                                      {team?.abbreviation}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <InternationalBracketView
                    bracket={gameState.internationalTournament.bracket}
                    teams={gameState.teams}
                    qualifiedTeams={gameState.internationalTournament.teams}
                    champion={gameState.internationalTournament.champion}
                    onMatchClick={(matchupId) => {
                      setPreviousView("international");
                      setSelectedMatchId(matchupId);
                      setView("match-detail");
                    }}
                  />
                </>
              ) : (
                <div className="panel">
                  <div className="panel-body">
                    <p style={{ color: "var(--text-muted)" }}>
                      International tournament has not started yet. Complete
                      regional playoffs first.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {view === "team" && selectedTeam && (
            <TeamView
              team={selectedTeam}
              teams={gameState.teams}
              standings={gameState.standings}
              schedule={gameState.schedule}
              isUserTeam={selectedTeam.id === gameState.userTeamId}
              devMode={devMode}
              onBack={() => setView("dashboard")}
              onViewPlayer={handleViewPlayer}
              onViewMatch={(matchId) => {
                setPreviousView("team");
                setSelectedMatchId(matchId);
                setView("match-detail");
              }}
              onNextTeam={handleNextTeam}
              onPrevTeam={handlePrevTeam}
              onManageRoster={
                (devMode || selectedTeam.id === gameState.userTeamId)
                  ? () => setView("roster-management")
                  : undefined
              }
            />
          )}

          {view === "roster" && userTeam && (
            <TeamView
              team={userTeam}
              teams={gameState.teams}
              standings={gameState.standings}
              schedule={gameState.schedule}
              isUserTeam={true}
              onBack={() => setView("dashboard")}
              onViewPlayer={handleViewPlayer}
              onViewMatch={(matchId) => {
                setPreviousView("roster");
                setSelectedMatchId(matchId);
                setView("match-detail");
              }}
              onNextTeam={handleNextTeam}
              onPrevTeam={handlePrevTeam}
              onManageRoster={() => setView("roster-management")}
            />
          )}

          {view === "players" && (
            <PlayersPage
              teams={gameState.teams}
              onViewPlayer={handleViewPlayer}
              onViewTeam={handleViewTeam}
            />
          )}

          {view === "power-rankings" && (
            <PowerRankingsPage
              teams={gameState.teams}
              standings={gameState.standings}
              schedule={gameState.schedule}
              userTeamId={gameState.userTeamId}
              onViewTeam={handleViewTeam}
              onViewPlayer={handleViewPlayer}
            />
          )}

          {view === "player" && selectedPlayer && selectedPlayerTeam && (
            <>
              <PlayerDetailPage
                player={selectedPlayer}
                team={selectedPlayerTeam}
                ovrInfo={getPlayerEffectiveOVR(selectedPlayer, selectedPlayerTeam)}
                onBack={() => handleViewTeam(selectedPlayerTeam.id)}
                onViewMatch={(matchId) => {
                  setPreviousView("player");
                  setSelectedMatchId(matchId);
                  setView("match-detail");
                }}
                onEditPlayer={() => setShowEditPlayerModal(true)}
                canEdit={devMode || selectedPlayerTeam.id === gameState?.userTeamId}
              />

              {/* Edit Player Modal */}
              {showEditPlayerModal && selectedPlayer && selectedPlayerTeam && (
                <PlayerEditModal
                  player={selectedPlayer}
                  team={selectedPlayerTeam}
                  onSave={handleSavePlayer}
                  onClose={() => setShowEditPlayerModal(false)}
                />
              )}
            </>
          )}

          {view === "free-agents" && (
            <>
              <div className="content-header">
                <h1>Free Agents</h1>
              </div>
              <div className="panel">
                <div className="panel-body">
                  <p style={{ color: "var(--text-muted)" }}>
                    Free agency coming soon...
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "trade" && gameState.userTeamId && (
            <TradePage
              teams={gameState.teams}
              userTeamId={gameState.userTeamId}
              onExecuteTrade={handleExecuteTrade}
              onViewPlayer={(playerId: string) => {
                setSelectedPlayerId(playerId);
                setPreviousView(view);
                setView("player");
              }}
            />
          )}
          {view === "scrims" && gameState.userTeamId && (
            <ScrimsPage
              gameState={gameState}
              onRunScrim={handleScrim}
              onViewPlayer={(playerId: string) => {
                setSelectedPlayerId(playerId);
                setPreviousView(view);
                setView("player");
              }}
              onViewMatch={(scrim: ScrimResult) => {
                setSelectedScrimMatch(scrim);
                setPreviousView(view);
                setView("match-detail");
              }}
              scrimHistory={scrimHistory}
            />
          )}
          {view === "draft" && (
            <>
              <div className="content-header">
                <h1>Draft</h1>
              </div>
              <div className="panel">
                <div className="panel-body">
                  <p style={{ color: "var(--text-muted)" }}>
                    Draft coming soon...
                  </p>
                </div>
              </div>
            </>
          )}

          {view === "history" && (
            <>
              <div className="content-header">
                <h1>League History</h1>
              </div>
              <div className="panel">
                <div className="panel-header">Champions</div>
                <div className="panel-body">
                  {gameState.champions.length === 0 ? (
                    <p style={{ color: "var(--text-muted)" }}>
                      No champions yet
                    </p>
                  ) : (
                    gameState.champions.map((c, idx) => {
                      const team = gameState.teams.find(
                        (t) => t.id === c.teamId
                      );
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: "8px 0",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          <strong>Season {c.year}</strong>
                          {c.type === "international" && " 🌍"}
                          {c.type === "regional" &&
                            c.region &&
                            ` [${c.region.toUpperCase()}]`}
                          : {team?.name}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {view === "finances" && (
            <>
              <div className="content-header">
                <h1>Team Finances</h1>
              </div>
              <div className="panel">
                <div className="panel-body">
                  <div className="stat-row">
                    <span className="label">Budget</span>
                    <span className="value">
                      ${(userTeam?.finances.budget ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Salary Committed</span>
                    <span className="value">
                      $
                      {(
                        userTeam?.finances.salaryCommitted ?? 0
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Scouting Budget</span>
                    <span className="value">
                      {userTeam?.finances.scoutingBudget}%
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {view === "match-detail" &&
            (selectedScrimMatch ? (
              // Scrim match view
              (() => {
                const userTeamForScrim = gameState.teams.find(t => t.id === gameState.userTeamId);
                if (!userTeamForScrim || !selectedScrimMatch.opponentTeam) {
                  return (
                    <div className="panel">
                      <div className="panel-body">
                        <p style={{ color: "var(--text-muted)" }}>
                          Scrim data not found.{" "}
                          <button
                            className="link-btn"
                            onClick={() => {
                              setSelectedScrimMatch(null);
                              setView(previousView);
                            }}
                          >
                            Go back
                          </button>
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                  <MatchDetailView
                    match={selectedScrimMatch.matchResult}
                    homeTeam={userTeamForScrim}
                    awayTeam={selectedScrimMatch.opponentTeam}
                    onBack={() => {
                      setSelectedScrimMatch(null);
                      setView(previousView);
                    }}
                    onViewPlayer={(playerId) => {
                      setSelectedPlayerId(playerId);
                      setPreviousView("match-detail");
                      setView("player");
                    }}
                  />
                );
              })()
            ) : selectedMatchId &&
            (() => {
              const matchData = findMatchResult(selectedMatchId);
              if (!matchData)
                return (
                  <div className="panel">
                    <div className="panel-body">
                      <p style={{ color: "var(--text-muted)" }}>
                        Match not found.{" "}
                        <button
                          className="link-btn"
                          onClick={() => setView(previousView)}
                        >
                          Go back
                        </button>
                      </p>
                    </div>
                  </div>
                );
              const homeTeam = gameState.teams.find(
                (t) => t.id === matchData.homeTeamId
              );
              const awayTeam = gameState.teams.find(
                (t) => t.id === matchData.awayTeamId
              );
              if (!homeTeam || !awayTeam)
                return (
                  <div className="panel">
                    <div className="panel-body">
                      <p style={{ color: "var(--text-muted)" }}>
                        Teams not found.{" "}
                        <button
                          className="link-btn"
                          onClick={() => setView(previousView)}
                        >
                          Go back
                        </button>
                      </p>
                    </div>
                  </div>
                );
              
              // Find the day this match was played
              const scheduledMatch = gameState.schedule.find(m => m.id === selectedMatchId || m.result?.id === selectedMatchId);
              const matchDay = scheduledMatch?.day;
              
              // Calculate standings at the time of this match (including this match)
              const calculateStandingsAtDay = (teamId: string, upToDay: number | undefined) => {
                if (upToDay === undefined) {
                  // Fallback to current standings for playoff matches
                  return gameState.standings.find(s => s.teamId === teamId);
                }
                
                let wins = 0;
                let losses = 0;
                let mapWins = 0;
                let mapLosses = 0;
                let roundDiff = 0;
                
                // Count results from matches up to and including this day
                for (const match of gameState.schedule) {
                  if (!match.played || !match.result || match.day > upToDay) continue;
                  if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) continue;
                  
                  const isHome = match.homeTeamId === teamId;
                  const teamScore = isHome ? match.result.homeScore : match.result.awayScore;
                  const oppScore = isHome ? match.result.awayScore : match.result.homeScore;
                  
                  if (teamScore > oppScore) {
                    wins++;
                  } else {
                    losses++;
                  }
                  
                  // Count map wins/losses from mapScores
                  for (const mapScore of match.result.mapScores || []) {
                    const teamRounds = isHome ? mapScore.homeRounds : mapScore.awayRounds;
                    const oppRounds = isHome ? mapScore.awayRounds : mapScore.homeRounds;
                    if (teamRounds > oppRounds) {
                      mapWins++;
                    } else {
                      mapLosses++;
                    }
                    roundDiff += teamRounds - oppRounds;
                  }
                }
                
                return { teamId, wins, losses, mapWins, mapLosses, roundDifferential: roundDiff };
              };
              
              const homeStandingAtMatch = calculateStandingsAtDay(homeTeam.id, matchDay);
              const awayStandingAtMatch = calculateStandingsAtDay(awayTeam.id, matchDay);
              
              return (
                <MatchDetailView
                  match={matchData.result}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  homeStanding={homeStandingAtMatch}
                  awayStanding={awayStandingAtMatch}
                  onBack={() => setView(previousView)}
                  onViewPlayer={(playerId) => {
                    setSelectedPlayerId(playerId);
                    setPreviousView("match-detail");
                    setView("player");
                  }}
                />
              );
            })())}

          {view === "roster-management" && (() => {
            // In dev mode, manage the selected team; otherwise manage user's team
            const managedTeam = devMode && selectedTeamId 
              ? gameState.teams.find(t => t.id === selectedTeamId) 
              : userTeam;
            
            if (!managedTeam) return null;
            
            return (
              <RosterManagementPage
                team={managedTeam}
                onUpdateLineup={(lineup) =>
                  handleUpdateLineup(managedTeam.id, lineup)
                }
                onUpdateIGL={(playerId) => {
                  // Update IGL for the managed team (not just user team)
                  setGameState((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      teams: prev.teams.map((t) =>
                        t.id === managedTeam.id ? { ...t, iglId: playerId } : t
                      ),
                    };
                  });
                }}
                onBack={() => {
                  setSelectedTeamId(managedTeam.id);
                  setView("team");
                }}
                onViewPlayer={(playerId) => {
                  setSelectedPlayerId(playerId);
                  setPreviousView("roster-management");
                  setView("player");
                }}
                onNavigateToFreeAgency={() => setView("free-agency")}
                isDevMode={devMode}
                isUserTeam={managedTeam.id === gameState.userTeamId}
              />
            );
          })()}

          {view === "free-agency" && userTeam && (
            <FreeAgencyPage
              freeAgents={gameState.freeAgents || []}
              userTeam={userTeam}
              onSignPlayer={handleSignFreeAgent}
              onReleasePlayer={handleReleasePlayer}
              onBack={() => setView("roster-management")}
              onViewPlayer={(playerId) => {
                setSelectedPlayerId(playerId);
                setPreviousView("free-agency");
                setView("player");
              }}
              devMode={devMode}
              onAddFreeAgent={(player) => {
                setGameState(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    freeAgents: [...(prev.freeAgents || []), player],
                  };
                });
              }}
              onDeleteFreeAgent={(playerId) => {
                setGameState(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    freeAgents: (prev.freeAgents || []).filter(p => p.id !== playerId),
                  };
                });
              }}
              onEditFreeAgent={(player) => {
                setGameState(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    freeAgents: (prev.freeAgents || []).map(p => 
                      p.id === player.id ? player : p
                    ),
                  };
                });
              }}
            />
          )}
        </main>
      </div>

      {/* Scrim Modal */}
      {showScrimModal && gameState && gameState.userTeamId && (() => {
        const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
        if (!userTeam) return null;
        
        const { regional, tier2 } = getAvailableScrimOpponents(userTeam, gameState.teams);
        const fatigueLevel = getFatigueLevel(gameState.fatigueLevel);
        const fatigueDisplay = getFatigueDisplay(fatigueLevel);
        
        // Get upcoming match days to check for risky scrims
        const upcomingMatchDays = gameState.schedule
          .filter(m => !m.played && (m.homeTeamId === gameState.userTeamId || m.awayTeamId === gameState.userTeamId))
          .map(m => m.day);
        const isRisky = isScrimRisky(gameState.currentDay, upcomingMatchDays);

        return (
          <div className="modal-overlay" onClick={() => setShowScrimModal(false)}>
            <div className="modal scrim-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>🏋️ Schedule Scrim</h2>
                <button className="modal-close" onClick={() => setShowScrimModal(false)}>×</button>
              </div>
              <div className="modal-body">
                {/* Fatigue Status */}
                <div className="scrim-status">
                  <div className="scrim-status-item">
                    <span className="label">Team Status</span>
                    <span className="value" style={{ color: fatigueDisplay.color }}>
                      {fatigueDisplay.icon} {fatigueDisplay.label}
                    </span>
                  </div>
                  <div className="scrim-status-item">
                    <span className="label">Fatigue Level</span>
                    <span className="value">{gameState.fatigueLevel}</span>
                  </div>
                </div>

                {/* Warning if risky */}
                {isRisky && (
                  <div className="scrim-warning">
                    ⚠️ Match within 2 days! Scrimming may fatigue players.
                  </div>
                )}

                {/* Fatigue warning */}
                {getFatigueLevel(gameState.fatigueLevel) === 'exhausted' && (
                  <div className="scrim-warning danger">
                    😓 Team is fatigued! Higher chance of negative outcomes.
                  </div>
                )}

                {/* Regional Teams Section */}
                <div className="scrim-section">
                  <h3>Regional Teams</h3>
                  <p className="scrim-section-desc">Practice against teams in your region</p>
                  <div className="scrim-opponent-list">
                    {regional.map(team => (
                      <button
                        key={team.id}
                        className="scrim-opponent-btn"
                        onClick={() => handleScrim(team.id, 'regional', team.name)}
                      >
                        <img src={team.logo} alt="" className="scrim-opponent-logo" />
                        <span className="scrim-opponent-name">{team.name}</span>
                        <span className="scrim-opponent-ovr">
                          {Math.round(team.roster.slice(0, 5).reduce((sum, p) => sum + p.overall, 0) / 5)} OVR
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tier 2 / Academy Teams Section */}
                <div className="scrim-section">
                  <h3>Academy Teams</h3>
                  <p className="scrim-section-desc">Easier sparring partners, always available</p>
                  <div className="scrim-opponent-list">
                    {tier2.map(team => (
                      <button
                        key={team.id}
                        className="scrim-opponent-btn tier2"
                        onClick={() => handleScrim(team.id, 'tier2', team.name)}
                      >
                        <span className="scrim-opponent-name">{team.name}</span>
                        <span className="scrim-opponent-ovr">{team.averageOVR} OVR</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Match Result Toasts */}
      <MatchToastContainer
        toasts={matchToasts}
        onDismiss={handleDismissToast}
        onClickMatch={handleToastClick}
      />

      {/* Notification Toast */}
      {notificationToast && (
        <div className="notification-toast" onClick={() => setNotificationToast(null)}>
          {notificationToast}
        </div>
      )}

      {/* PWA Update Prompt */}
      <PWAUpdatePrompt />
    </div>
  );
}