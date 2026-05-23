// src/App.tsx
import { useState, useEffect, useRef } from "react";
import { createRNG, randomInt, shuffle } from "./utils/random";
import { generatePlayer } from "./sim/playerGenerator";
import { calculateTeamAttributes, staffFromTeam } from "./sim/teamRatings";
import {
  createGameState,
  advanceDay,
  skipToPlayoffs,
  getTodayMatchups,
  getRoundMatchups,
  getCurrentRoundIndex,
  getTotalRounds,
  getRoundLabel,
  getPhaseLabel,
  simSingleMatchup,
  getNextPlannedEvent,
  startNextEvent,
  advanceFromMidOffseason,
  type GameState,
  type DayResult,
  getAllPlayedMatches,
} from "./sim/gameState";
import { seedRegion, generateKickoffBracket, getRoundName, BRACKET_ROUND_ORDER, type SeedEntry } from "./sim/kickoffBracket";
import { CHAMPIONS_ROUND_ORDER, getChampionsRoundName } from "./sim/internationalBracket";
import { STAGE_PLAYOFF_ROUND_ORDER, isStepComplete, getStagePlayoffRound } from "./sim/stagePlayoffs";
import { StageGroupStandingsView } from "./ui/components/StageGroupStandingsView";
import { StagePlayoffBracketView } from "./ui/components/StagePlayoffBracketView";
import {
  saveGame,
  loadGame,
  getAllSaves,
  deleteSave,
  duplicateSave,
  renameSave,
  type SavedGame,
} from "./db/gameDatabase";
import { getAgentsForRole } from "./data/agents";
import {
  AMERICAS_TEAMS,
  EMEA_TEAMS,
  PACIFIC_TEAMS,
  CHINA_TEAMS,
  ALL_TEAMS,
  PLACEHOLDER_LOGO,
  type TeamConfig,
  type PlayerConfig,
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
} from "./ui/components/PlayoffBracket";
import { KickoffBracketView } from "./ui/components/KickoffBracketView";
import { AppModal, type ModalConfig } from "./ui/components/PromptModal";
import { ChampionsBracketView } from "./ui/components/ChampionsBracketView";
import { PlayersPage } from "./ui/components/PlayersPage";
import { ErrorBoundary } from "./ui/components/ErrorBoundary";
import { PowerRankingsPage } from "./ui/components/PowerRankingsPage";
import { MatchToastContainer, type MatchToastData } from "./ui/components/MatchToast";
import { RosterManagementPage } from "./ui/components/RosterManagementPage";
import { FreeAgencyPage } from "./ui/FreeAgencyPage";
import { TradePage } from "./ui/components/TradePage";
import { ScrimsPage } from "./ui/components/ScrimsPage";
import { PWAUpdatePrompt } from "./ui/components/PWAUpdatePrompt";
import { NewsFeed } from "./ui/components/NewsFeed";
import { RecordsPage } from "./ui/components/RecordsPage";
import { HistoryPage } from "./ui/components/HistoryPage";
import { ProgressionTable } from "./ui/components/ProgressionTable";
import { AgentMetaPage } from "./ui/components/AgentMetaPage";
import { MapPoolPage } from "./ui/components/MapPoolPage";
import { SwitchTeamPage } from "./ui/components/SwitchTeamPage";
import { SimConfigPage } from "./ui/components/SimConfigPage";
import { RealEventPage } from "./ui/components/RealEventPage";
import { SandboxPage, EMPTY_SANDBOX_CONFIG } from "./ui/components/SandboxPage";
import type { SandboxConfig } from "./ui/components/SandboxPage";
import { DEFAULT_CHURN_CONFIG } from "./sim/offseasonChurn";
import { MassPlayerEditor } from "./ui/components/MassPlayerEditor";
import { getDefaultRecordBook, migrateRecordBook } from "./sim/vctRecords";
import { MAPS } from "./sim/matchSim";
import { signFreeAgent, releasePlayer, generateFreeAgentPool, pickNat } from "./sim/freeAgency";
import { buildNamePoolCtx } from "./sim/namePool";
import { toLetterGrade, getGradeClass } from "./utils/letterGrade";
import { runOffseasonChurn } from "./sim/offseasonChurn";
import { executeTrade } from "./sim/trading";
import { getAvailableScrimOpponents, runScrim, isScrimRisky, formatScrimResultLog, generateAcademyRoster } from "./sim/scrims";
import { getFatigueLevel, getFatigueDisplay, TIER2_TEAMS } from "./types/scrims";
import type { ScrimResult, Tier2Team } from "./types/scrims";
import type { StartingSlot } from "./types/roster";
import { getRolePenalty } from "./types/roster";
import { calculateEffectiveOverallWithIGL } from "./sim/iglBonus";
import { getCompositionPenalty } from "./sim/compositionBonus";
import type { Team, Player, Role, AgentPool, Region, SuspendedMatchInfo } from "./types";
import type { RNG } from "./utils/random";
import { PlayerEditModal } from "./ui/components/PlayerEditModal";
import { TeamEditModal } from "./ui/components/TeamEditModal";
import { APP_VERSION } from './version';
import "./App.css";
import './ui/components/Welcome.css';
import { Toast } from './ui/components/Toast';
import { LiveSimView, type LiveSimSession } from './ui/components/LiveSimView';
import type { MatchResult } from './types';
import { AGENT_ABILITIES } from './data/agentAbilities';

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

    // assign nationality based on team region
    if (!player.nationality) player.nationality = pickNat(rng, config.region);

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

// generate real teams with fully randomized rosters (for Custom League)
function generateRandomizedTeams(seed: string, namePool: ReturnType<typeof buildNamePoolCtx>): Team[] {
  const rng = createRNG(seed);
  const defaultRoles: Role[] = ['duelist', 'initiator', 'controller', 'sentinel', 'flex'];

  return ALL_TEAMS.map((config, idx) => {
    const roster: Player[] = defaultRoles.map((role, i) => {
      const p = generatePlayer(rng, {
        role,
        namePool,
        region: config.region,
      });
      p.agentPool = generateAgentPoolForRole(rng, role);
      p.nationality = pickNat(rng, config.region);
      p.contract = { salary: 100000, yearsRemaining: 2, teamOption: false, playerOption: false };
      p.yearsInLeague = 1;
      return p;
    });

    // default IGL to initiator
    const igl = roster.find(p => p.role === 'initiator') || roster[0];

    return {
      id: `team_${config.abbreviation.toLowerCase()}_${idx}`,
      name: config.name,
      abbreviation: config.abbreviation,
      logo: config.logo || '',
      region: config.region,
      roster,
      iglId: igl?.id || null,
      staff: { headCoach: null, assistantCoach: null, analyst: null },
      finances: { budget: 1000000, salaryCommitted: 500000, scoutingBudget: 50 },
      attributes: calculateTeamAttributes(roster),
      championships: 0,
      playoffAppearances: 0,
      founded: 2020,
    };
  });
}

// parse a custom roster JSON and build teams from it
// format: { "ABBR": [ { name, role?, overall?, age? } | "name" ], ... }
// teams not in the JSON get randomized; players without stats get random stats
function parseCustomRosterJSON(
  json: Record<string, unknown>,
  seed: string,
  namePool: ReturnType<typeof buildNamePoolCtx>,
): Team[] {
  const rng = createRNG(seed);
  const defaultRoles: Role[] = ['duelist', 'initiator', 'controller', 'sentinel', 'flex'];

  return ALL_TEAMS.map((config, idx) => {
    const key = Object.keys(json).find(k => k.toUpperCase() === config.abbreviation.toUpperCase());
    const rosterData = key ? json[key] : null;

    let roster: Player[];

    if (Array.isArray(rosterData) && rosterData.length > 0) {
      // build players from the provided data
      roster = rosterData.slice(0, 10).map((entry: unknown, i: number) => {
        const isString = typeof entry === 'string';
        const name = isString ? entry : (entry as Record<string, unknown>)?.name as string || `Player ${i + 1}`;
        const role = !isString && (entry as Record<string, unknown>)?.role
          ? (entry as Record<string, unknown>).role as Role
          : defaultRoles[i % defaultRoles.length];
        const overall = !isString && typeof (entry as Record<string, unknown>)?.overall === 'number'
          ? (entry as Record<string, unknown>).overall as number
          : undefined;
        const age = !isString && typeof (entry as Record<string, unknown>)?.age === 'number'
          ? (entry as Record<string, unknown>).age as number
          : undefined;

        const p = generatePlayer(rng, {
          role,
          forceName: name,
          forceOverall: overall,
          forceAge: age,
          region: config.region,
        });
        p.agentPool = generateAgentPoolForRole(rng, role);
        p.nationality = pickNat(rng, config.region);
        p.contract = { salary: 100000, yearsRemaining: 2, teamOption: false, playerOption: false };
        p.yearsInLeague = 1;
        if (namePool) namePool.used.add(name);
        return p;
      });
    } else {
      // no data for this team — generate random roster
      roster = defaultRoles.map(role => {
        const p = generatePlayer(rng, { role, namePool, region: config.region });
        p.agentPool = generateAgentPoolForRole(rng, role);
        p.nationality = pickNat(rng, config.region);
        p.contract = { salary: 100000, yearsRemaining: 2, teamOption: false, playerOption: false };
        p.yearsInLeague = 1;
        return p;
      });
    }

    const igl = roster.find(p => p.role === 'initiator') || roster[0];
    return {
      id: `team_${config.abbreviation.toLowerCase()}_${idx}`,
      name: config.name,
      abbreviation: config.abbreviation,
      logo: config.logo || '',
      region: config.region,
      roster,
      iglId: igl?.id || null,
      staff: { headCoach: null, assistantCoach: null, analyst: null },
      finances: { budget: 1000000, salaryCommitted: 500000, scoutingBudget: 50 },
      attributes: calculateTeamAttributes(roster),
      championships: 0,
      playoffAppearances: 0,
      founded: 2020,
    };
  });
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
  | "scrims"
  | "news"
  | "records"
  | "agent-meta"
  | "map-pool"
  | "switch-team"
  | "mass-editor"
  | "sim-config"
  | "real-event"
  | "sandbox"
  | "live-sim";
type AppScreen = "welcome" | "setup" | "game" | "editor" | "custom_league";

// Toast notification type
interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("welcome");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [saves, setSaves] = useState<SavedGame[]>([]);
  const [currentSaveId, setCurrentSaveId] = useState<string | null>(null);
  const [renamingSaveId, setRenamingSaveId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [view, setView] = useState<NavView>("dashboard");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [recentResults, setRecentResults] = useState<DayResult[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<Region>("americas");
  const [matchToasts, setMatchToasts] = useState<MatchToastData[]>([]);
  const [liveSimMatch, setLiveSimMatch] = useState<MatchResult | null>(null);
  const liveSimSessionRef = useRef<LiveSimSession | null>(null);
  const [suspendedSim, setSuspendedSim] = useState<{
    matchupId: string;
    match: MatchResult;
    session: LiveSimSession;
  } | null>(null);

  // sandbox mode: temporary teams for custom match sim
  const [sandboxTeams, setSandboxTeams] = useState<{ home: Team; away: Team } | null>(null);
  const [sandboxMatch, setSandboxMatch] = useState<MatchResult | null>(null);
  const [sandboxConfig, setSandboxConfig] = useState<SandboxConfig>(EMPTY_SANDBOX_CONFIG);

  // Compute display info for suspended live match
  const suspendedMatchInfo: SuspendedMatchInfo | null = (() => {
    if (!suspendedSim || !gameState) return null;
    const { matchupId, match, session } = suspendedSim;
    const { currentMap, maxRevealed, pausedKills } = session;
    const mapData = match.mapScores[currentMap];
    if (!mapData) return null;

    const homeTeam = gameState.teams.find(t => t.id === match.homeTeamId);
    const awayTeam = gameState.teams.find(t => t.id === match.awayTeamId);

    // Series score from completed maps
    let homeSeries = 0, awaySeries = 0;
    for (let i = 0; i < currentMap; i++) {
      if (match.mapScores[i].homeRounds > match.mapScores[i].awayRounds) homeSeries++;
      else awaySeries++;
    }

    // Current map score: use last safely-revealed round
    let homeMap = 0, awayMap = 0;
    const logs = mapData.roundLogs || [];
    if (maxRevealed > 0 && logs.length > 0) {
      // If latest round was paused mid-animation, show score before that round
      const safeIdx = (pausedKills >= 0 && maxRevealed > 1) ? maxRevealed - 2 : maxRevealed - 1;
      if (safeIdx >= 0 && logs[safeIdx]) {
        homeMap = logs[safeIdx].homeRoundScore ?? 0;
        awayMap = logs[safeIdx].awayRoundScore ?? 0;
      }
    }

    return {
      matchupId,
      homeAbbr: homeTeam?.abbreviation ?? '???',
      awayAbbr: awayTeam?.abbreviation ?? '???',
      mapName: mapData.map,
      mapNumber: currentMap + 1,
      totalMaps: match.mapScores.length,
      homeSeriesScore: homeSeries,
      awaySeriesScore: awaySeries,
      homeMapScore: homeMap,
      awayMapScore: awayMap,
    };
  })();
  const [showPlayDayMenu, setShowPlayDayMenu] = useState(false);
  const [promptModal, setPromptModal] = useState<ModalConfig | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [previousView, setPreviousView] = useState<NavView>("dashboard");
  const [showEditPlayerModal, setShowEditPlayerModal] = useState(false);
  const [showTeamEditModal, setShowTeamEditModal] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [showScrimModal, setShowScrimModal] = useState(false);
  const [scrimHistory, setScrimHistory] = useState<ScrimResult[]>([]);
  const [selectedScrimMatch, setSelectedScrimMatch] = useState<ScrimResult | null>(null);
  const [newsFeedFilter, setNewsFeedFilter] = useState<Region | 'all' | null>(null);

  const [setupSeed, setSetupSeed] = useState<string>("");
  const [setupTeams, setSetupTeams] = useState<Team[]>([]);
  const [setupSelectedTeamId, setSetupSelectedTeamId] = useState<string | null>(
    null
  );
  const [useEsportsNames, setUseEsportsNames] = useState(true);
  // Toast helper function
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    getAllSaves().then(setSaves);
  }, []);

  // scroll to top when navigating to match detail
  useEffect(() => {
    if (view === 'match-detail' || view === 'live-sim') window.scrollTo({ top: 0 });
  }, [view, selectedMatchId]);

  // Safety: redirect away from live-sim if there's no match to show
  useEffect(() => {
    if (view === 'live-sim' && !liveSimMatch) {
      const target = previousView === 'live-sim' ? 'dashboard' : previousView;
      console.warn('[safety] live-sim with no match, redirecting to:', target);
      setView(target);
    }
  }, [view, liveSimMatch]);

  // auto-initialize international tournament when phase flips but bracket not yet created
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === 'international' && !gameState.internationalTournament) {
      advanceDay(gameState);
      setGameState({ ...gameState });
      setView('international');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [gameState?.phase, gameState?.internationalTournament]);

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
            imageUrl?: string;
            awards?: Player['awards'];
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
            attributes: teamData.attributes || calculateTeamAttributes(teamData.roster as Player[], teamData.startingLineup, teamData.staff?.headCoach?.rating, teamData.staff?.headCoach?.specialty, staffFromTeam(teamData.staff)),
            roster: teamData.roster.map((p) => ({
              ...p,
              careerStats: p.careerStats || null,
              awards: p.awards || undefined,
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
          const freeAgents = (json.freeAgents || []).map((p: any) => ({
            ...p,
            careerStats: p.careerStats || null,
            awards: p.awards || undefined,
          }));
          
          // Import custom tier2 teams if available, otherwise keep the ones from createGameState
          const customTier2Teams = json.customTier2Teams || state.customTier2Teams;

          // Import season history if available
          const seasonHistory = json.seasonHistory || [];
          
          setGameState({ ...state, freeAgents, customTier2Teams, seasonHistory, churnConfig: json.churnConfig || undefined });
          setCurrentSaveId(null);
          setView("dashboard");
          setRecentResults([]);
          const userTeam = importedTeams.find(t => t.id === userTeamId);
          if (userTeam) setSelectedRegion(userTeam.region);
          setScreen("game");
          
          showToast(`Successfully imported league with ${importedTeams.length} teams!`, 'success');
        } else if (json.teamsByRegion) {
          // Team configs format - need to convert to full teams
          showToast("Team configs format detected. Please use 'Full League Export' format for importing.", 'error');
        } else {
          showToast("Unrecognized JSON format. Please use a valid ValorantGM export file.", 'error');
        }
      } catch (err) {
        console.error("Import error:", err);
        showToast("Failed to import JSON file. Please check the file format.", 'error');
      }
    };
    reader.readAsText(file);
    
    // Reset the input so the same file can be imported again
    event.target.value = '';
  };

  // custom league: randomize all rosters on real teams
  const handleRandomizeSetup = () => {
    const seed = `custom-${crypto.randomUUID()}`;
    const pool = buildNamePoolCtx([], true); // always use esports names for custom league
    const teams = generateRandomizedTeams(seed, pool);
    setSetupSeed(seed);
    setSetupTeams(teams);
    setSetupSelectedTeamId(null);
    setUseEsportsNames(true);
    setScreen("setup");
  };

  // custom league: import roster JSON
  const handleCustomRosterImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (typeof json !== 'object' || json === null) {
          showToast('Invalid JSON — expected an object with team abbreviations as keys.', 'error');
          return;
        }
        const seed = `custom-${crypto.randomUUID()}`;
        const pool = buildNamePoolCtx([], true);
        const teams = parseCustomRosterJSON(json, seed, pool);
        setSetupSeed(seed);
        setSetupTeams(teams);
        setSetupSelectedTeamId(null);
        setUseEsportsNames(true);
        setScreen("setup");
        showToast(`Custom rosters loaded for ${Object.keys(json).length} teams. Others randomized.`, 'success');
      } catch {
        showToast('Failed to parse roster JSON.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleConfirmSetup = () => {
    if (!setupSelectedTeamId) return;
    const selectedTeam = setupTeams.find((t) => t.id === setupSelectedTeamId);
    if (!selectedTeam) return;
    const state = createGameState(setupTeams, setupSelectedTeamId, setupSeed, undefined, useEsportsNames);
    
    // build a name pool context seeded with roster names from state
    const namePool = buildNamePoolCtx(state.usedNames, useEsportsNames);

    // Initialize free agents pool
    const faRng = createRNG(`${setupSeed}-freeagents`);
    const freeAgents = generateFreeAgentPool(faRng, 75, undefined, namePool);

    // sync consumed names back to state
    const usedNames = namePool ? [...namePool.used] : state.usedNames;

    setGameState({ ...state, freeAgents, usedNames });
    setCurrentSaveId(null);
    setView("dashboard");
    setRecentResults([]);
    setSelectedTeamId(setupSelectedTeamId);
    setSelectedRegion(selectedTeam.region);
    setScreen("game");
  };

  const handleAdvanceDay = () => {
    if (!gameState) return;
    // Clear any suspended watch session — the match is already committed
    setSuspendedSim(null);
    watchingMatchupIdRef.current = null;
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
            // Skip during kickoff bracket/international - schedule is empty
            if (gameState.schedule.length > 0) {
              const scheduleMatch = gameState.schedule.find(
                m => m.homeTeamId === match.homeTeamId && 
                     m.awayTeamId === match.awayTeamId && 
                     m.played
              );
              if (scheduleMatch) {
                matchId = scheduleMatch.id;
              }
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

  // dev mode: reseed kickoff bracket for current region
  const handleReseed = (newSeeds: SeedEntry[]) => {
    if (!gameState || !devMode) return;
    const region = selectedRegion;
    const bracket = gameState.kickoffBrackets?.[region];
    if (!bracket) return;
    // regenerate bracket with new seeds
    const newBracket = generateKickoffBracket(`${gameState.seed}-kickoff-${region}-reseed-${Date.now()}`, newSeeds);
    setGameState({
      ...gameState,
      kickoffBrackets: {
        ...gameState.kickoffBrackets,
        [region]: newBracket,
      },
    });
  };

  // auto-sim other regions' stage playoff matchups for the current step
  // only fires when user's region has finished all its matches for the step
  const autoSimStagePlayoffStep = (gs: typeof gameState) => {
    if (!gs) return;
    if (gs.phase !== 'stage1_playoffs' && gs.phase !== 'stage2_playoffs') return;
    const stageNum = gs.currentStage;
    const stepIdx = gs.currentStagePlayoffRound;
    if (stepIdx >= STAGE_PLAYOFF_ROUND_ORDER.length) return;
    const userTeam = gs.teams.find(t => t.id === gs.userTeamId);
    const userRegion = userTeam?.region;
    if (!userRegion) return;
    // only proceed if user's region is done for this step
    const userBracket = gs.stagePlayoffBrackets[userRegion]?.[stageNum];
    if (!userBracket || !isStepComplete(userBracket, stepIdx)) return;
    // auto-sim other regions for this exact step
    const step = STAGE_PLAYOFF_ROUND_ORDER[stepIdx];
    for (const region of ['americas', 'emea', 'pacific', 'china'] as const) {
      if (region === userRegion) continue;
      const bracket = gs.stagePlayoffBrackets[region]?.[stageNum];
      if (!bracket) continue;
      const round = getStagePlayoffRound(bracket, stepIdx);
      if (!round) continue;
      for (const m of round.matchups) {
        if (m.team1Id && m.team2Id && !m.winnerId) {
          simSingleMatchup(gs, m.id);
        }
      }
    }
  };

  // Sim a single matchup from the schedule page
  const handleSimMatchup = (matchupId: string) => {
    if (!gameState) return;
    setSuspendedSim(null);
    watchingMatchupIdRef.current = null;
    const prevRound = gameState.currentBracketRound;
    const prevChampRound = gameState.currentChampionsRound;
    const { result, events } = simSingleMatchup(gameState, matchupId);

    // when in kickoff, if user's region just finished its current round,
    // auto-sim the same round for other regions so checkKickoffRoundComplete advances
    // then stop — don't bleed into the next round
    if (gameState.phase === 'kickoff_bracket' && gameState.currentBracketRound === prevRound) {
      const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
      const userRegion = userTeam?.region;
      const step = BRACKET_ROUND_ORDER[prevRound];
      if (step && userRegion) {
        const userBracket = gameState.kickoffBrackets[userRegion];
        const userRound = userBracket?.[step.section]?.[step.roundIdx];
        const userRegionDone = userRound?.matchups.every(m => !m.team1Id || !m.team2Id || !!m.winnerId) ?? false;
        if (userRegionDone) {
          // sim only this exact round for the other 3 regions, then stop
          for (const [region, bracket] of Object.entries(gameState.kickoffBrackets)) {
            if (region === userRegion || !bracket) continue;
            const round = bracket[step.section]?.[step.roundIdx];
            if (!round) continue;
            for (const m of round.matchups) {
              if (m.team1Id && m.team2Id && !m.winnerId) {
                simSingleMatchup(gameState, m.id);
              }
            }
          }

        }
      }
    }

    // if kickoff just completed (via user's final match or auto-sim), initialize intl bracket
    if (gameState.phase === 'international' && !gameState.internationalTournament) {
      advanceDay(gameState);
    }

    // auto-sim other regions for stage group/playoff matches
    if (gameState.phase === 'stage1_groups' || gameState.phase === 'stage2_groups') {
      const stageNum = gameState.currentStage;
      const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
      const userRegion = userTeam?.region;
      if (userRegion) {
        const userGs = gameState.stageGroupStages[userRegion]?.[stageNum];
        const userDone = userGs?.groups.every(g => g.schedule.every(m => m.played));
        if (userDone) {
          // auto-sim all remaining group matches for other regions
          for (const region of ['americas', 'emea', 'pacific', 'china'] as const) {
            if (region === userRegion) continue;
            const gs = gameState.stageGroupStages[region]?.[stageNum];
            if (!gs) continue;
            for (const group of gs.groups) {
              for (const m of group.schedule) {
                if (!m.played) simSingleMatchup(gameState, m.id);
              }
            }
          }
        }
      }
    }
    if (gameState.phase === 'stage1_playoffs' || gameState.phase === 'stage2_playoffs') {
      autoSimStagePlayoffStep(gameState);
      // if stage playoffs just completed, initialize intl
      if (gameState.phase === 'international' && !gameState.internationalTournament) {
        advanceDay(gameState);
      }
    }

    // Same for champions — auto-sim remaining matchups if round didn't advance
    if (gameState.phase === 'international' && gameState.currentChampionsRound === prevChampRound) {
      const matchups = getTodayMatchups(gameState);
      const unplayed = matchups.filter(m => !m.played && m.team1Id && m.team2Id);
      if (unplayed.length === 0) {
        // All done but round didn't advance — shouldn't happen, but safety
      }
    }

    setGameState({ ...gameState });

    // Show toast if user team was involved
    if (result && gameState.userTeamId) {
      const isHome = result.homeTeamId === gameState.userTeamId;
      const isAway = result.awayTeamId === gameState.userTeamId;
      if (isHome || isAway) {
        const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
        const opponentId = isHome ? result.awayTeamId : result.homeTeamId;
        const opponent = gameState.teams.find(t => t.id === opponentId);
        if (userTeam && opponent) {
          const userScore = isHome ? result.homeScore : result.awayScore;
          const opponentScore = isHome ? result.awayScore : result.homeScore;
          setMatchToasts(prev => [...prev, {
            id: `toast-${Date.now()}`,
            matchId: result.id,
            userTeam,
            opponent,
            userScore,
            opponentScore,
            isWin: userScore > opponentScore,
          }]);
        }
      }
    }

    // Show important events (skip "kickoff has begun" — banner already shows it)
    for (const evt of events) {
      if (evt.type === 'champion_crowned' || evt.type === 'international_qualifier') {
        showToast(evt.message, 'info');
      } else if (evt.type === 'phase_change' && !evt.message.includes('Kickoff has begun')) {
        showToast(evt.message, 'info');
        // auto-navigate to progression when offseason starts
        if (evt.message.includes('Offseason') && gameState.offseasonProgression) {
          setView('progression');
        }
        // auto-navigate to international bracket when Champions/Masters begins
        if (gameState.phase === 'international') {
          setView('international');
        }
      }
    }
  };

  // Watch a matchup — sim it then open LiveSimView to animate through rounds
  const watchingMatchupIdRef = useRef<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const customRosterFileRef = useRef<HTMLInputElement>(null);
  const handleWatchMatchup = (matchupId: string) => {
    if (!gameState) return;

    // Check if resuming a suspended session for this matchup
    if (suspendedSim && suspendedSim.matchupId === matchupId) {
      setLiveSimMatch(suspendedSim.match);
      watchingMatchupIdRef.current = matchupId;
      setPreviousView(view);
      setView('live-sim');
      return;
    }

    const prevRound = gameState.currentBracketRound;
    const prevChampRound = gameState.currentChampionsRound;
    const { result, events } = simSingleMatchup(gameState, matchupId);



    setGameState({ ...gameState });

    if (!result) return;

    // Clear any old suspended session
    setSuspendedSim(null);

    // Open LiveSimView
    setLiveSimMatch(result);
    watchingMatchupIdRef.current = matchupId;
    setPreviousView(view);
    setView('live-sim');
  };

  // watch live — sim forward until user's team plays, then open LiveSimView
  const handleWatchLive = () => {
    if (!gameState || !gameState.userTeamId) return;
    setSuspendedSim(null); // Clear any old suspended session

    if (isSeasonComplete()) {
      showToast("The season is complete. There are no more games.", 'error');
      return;
    }
    if (isUserTeamEliminated()) {
      showToast("Your team has been eliminated.", 'error');
      return;
    }

    const userTeamId = gameState.userTeamId;
    let daysSimulated = 0;
    const maxDays = 100;

    while (daysSimulated < maxDays) {
      if (isSeasonComplete() || isUserTeamEliminated()) {
        setGameState({ ...gameState });
        showToast("No upcoming matches found.", 'info');
        return;
      }

      const result = advanceDay(gameState);
      setRecentResults((prev) => [...prev.slice(-20), result]);
      daysSimulated++;

      // check if user team played
      const userMatch = result.matchesPlayed.find(
        m => m.homeTeamId === userTeamId || m.awayTeamId === userTeamId
      );

      if (userMatch) {
        setGameState({ ...gameState });
        setLiveSimMatch(userMatch);
        watchingMatchupIdRef.current = userMatch.id; // use match result id as session key
        setPreviousView(view);
        setView('live-sim');
        return;
      }
    }

    setGameState({ ...gameState });
    showToast("Could not find a match within 100 days.", 'error');
  };

  // Bulk sim: sim all remaining matchups in the current bracket round
  const handleSimRound = () => {
    if (!gameState) return;
    setSuspendedSim(null);
    watchingMatchupIdRef.current = null;
    let count = 0;
    const maxIter = 200;
    while (count < maxIter) {
      const matchups = getTodayMatchups(gameState);
      const unplayed = matchups.filter(m => m.team1Id && m.team2Id && !m.played);
      if (unplayed.length === 0) break;
      for (const m of unplayed) {
        simSingleMatchup(gameState, m.matchupId);
        count++;
      }
    }
    // If kickoff just finished, advance once to initialize Champions bracket
    if (gameState.phase === 'international' && !gameState.internationalTournament) {
      advanceDay(gameState);
    }
    setGameState({ ...gameState });
    showToast(`Simulated current round (${count} matches)`, 'info');
    if (gameState.phase === 'international') setView('international');
    else setView('playoffs');
  };

  // sim the user's region's entire bracket until all qualifiers are set
  // sim until user's region bracket is fully complete
  // sim ONLY the user's region's current round — direct bracket access, no cascade
  const handleSimUserRegionRound = () => {
    if (!gameState) return;
    setSuspendedSim(null);
    watchingMatchupIdRef.current = null;
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    const userRegion = userTeam?.region;
    if (!userRegion) return;

    const bracket = gameState.kickoffBrackets?.[userRegion];
    if (!bracket) return;
    const step = BRACKET_ROUND_ORDER[gameState.currentBracketRound];
    if (!step) return;
    const round = bracket[step.section]?.[step.roundIdx];
    if (!round) return;

    // only sim matchups in user's region for this exact round
    const toSim = round.matchups.filter(m => m.team1Id && m.team2Id && !m.winnerId);
    for (const m of toSim) {
      simSingleMatchup(gameState, m.id);
    }

    setGameState({ ...gameState });
    const regionLabel = ({ americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' } as Record<string, string>)[userRegion] ?? userRegion;
    showToast(toSim.length > 0
      ? `Simulated ${toSim.length} ${regionLabel} match${toSim.length !== 1 ? 'es' : ''}`
      : `No unplayed ${regionLabel} matches this round`,
      'info');
    setView('playoffs');
  };

  // Bulk sim: sim through entire season to offseason
  const handleSimToOffseason = () => {
    if (!gameState) return;
    setPromptModal({
      kind: 'confirm', title: 'Simulate Season',
      message: 'Simulate the entire remaining season? This cannot be undone.',
      confirmLabel: 'Simulate',
      onConfirm: () => {
        setPromptModal(null);
        setSuspendedSim(null);
        watchingMatchupIdRef.current = null;
        let days = 0;
        const maxDays = 1000;
        while (gameState.phase !== 'offseason' && days < maxDays) {
          // auto-advance through mid-season transfer windows
          if (gameState.phase === 'mid_offseason') {
            advanceFromMidOffseason(gameState);
          }
          advanceDay(gameState);
          days++;
        }
        setGameState({ ...gameState });
        showToast('Season complete!', 'info');
        if (gameState.offseasonProgression) {
          if ((gameState.offseasonChurnEvents?.length ?? 0) === 0) {
            const churn = runOffseasonChurn(gameState.teams, gameState.freeAgents || [], gameState.kickoffBrackets, gameState.internationalTournament, gameState.userTeamId, `${gameState.seed}-churn-${gameState.currentYear}`, gameState.churnConfig);
            gameState.teams = churn.updatedTeams;
            gameState.freeAgents = churn.updatedFreeAgents;
            gameState.offseasonChurnEvents = churn.events;
          }
          setView('progression');
        }
      },
      onCancel: () => setPromptModal(null),
    });
  };


  // Start next event from offseason
  const handleStartNextEvent = () => {
    if (!gameState) return;

    // mid-offseason: start the next stage
    if (gameState.phase === 'mid_offseason') {
      const nextStage = gameState.currentStage === 1 && gameState.internationalSource === 'stage1' ? 1 : 2;
      setPromptModal({
        kind: 'confirm', title: `Start Stage ${nextStage}`,
        message: `Begin Stage ${nextStage} Group Stage? The mid-season transfer window will close.`,
        confirmLabel: 'Start',
        onConfirm: () => {
          setPromptModal(null);
          const events = advanceFromMidOffseason(gameState);
          setGameState({ ...gameState });
          setRecentResults((prev) => [...prev, { day: gameState.currentDay, matchesPlayed: [], events }]);
          showToast(events[0]?.message || 'Stage started!', 'success');
          setView('schedule');
        },
        onCancel: () => setPromptModal(null),
      });
      return;
    }

    if (gameState.phase !== 'offseason') return;
    const next = getNextPlannedEvent(gameState);
    const label = next?.eventName || 'the next event';
    // check if next event is a stage (not kickoff)
    const completedThisYear = (gameState.seasonHistory || [])
      .filter(h => h.year === gameState.currentYear && (h.worldChampionId || h.worldChampionCustom))
      .length;
    const isStageNext = completedThisYear >= 1;
    const stageNum = completedThisYear === 1 ? 1 : completedThisYear === 2 ? 2 : 0;
    const msg = isStageNext
      ? `Begin Stage ${stageNum} Group Stage leading into ${label}? Teams will be drawn into two groups of 6 for round-robin play.`
      : `Begin the regional stage leading into ${label}? Teams will compete in their regional brackets first to qualify for the international event.`;
    setPromptModal({
      kind: 'confirm', title: isStageNext ? `Start Stage ${stageNum}` : 'Start Next Event',
      message: msg,
      confirmLabel: 'Start',
      onConfirm: () => {
        setPromptModal(null);
        const events = startNextEvent(gameState);
        setGameState({ ...gameState });
        setRecentResults((prev) => [...prev, { day: gameState.currentDay, matchesPlayed: [], events }]);
        showToast(events[0]?.message || 'Next event started!', 'success');
        // navigate to the right view based on resulting phase
        const p = gameState.phase;
        if (p === 'stage1_groups' || p === 'stage2_groups' || p === 'stage1_playoffs' || p === 'stage2_playoffs') {
          setView('playoffs');
        } else {
          setView('dashboard');
        }
      },
      onCancel: () => setPromptModal(null),
    });
  };

  // Handle running a scrim
  const handleScrim = (opponentId: string, opponentType: 'regional' | 'tier2', opponentName: string) => {
    if (!gameState || !gameState.userTeamId) return;

    // can't scrim during international tournament
    if (gameState.phase === 'international') {
      showToast('Cannot scrim during international tournament', 'error');
      return;
    }

    // Can't scrim twice in same day
    if (gameState.lastScrimDay === gameState.currentDay) {
      showToast('Already scrimmaged today', 'error');
      return;
    }

    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;

    // Create RNG for this scrim
    const rng = createRNG(`${gameState.seed}-scrim-${gameState.currentDay}-${opponentId}`);

    // Get custom tier2 teams for the user's region
    const customTier2 = gameState.customTier2Teams?.[userTeam.region] || [];

    // Run the scrim
    const result: ScrimResult = runScrim(
      rng,
      userTeam,
      opponentName,
      opponentType,
      gameState.fatigueLevel,
      gameState.currentDay,
      gameState.currentYear,
      gameState.teams,
      customTier2,
      gameState.mapPool,
      gameState.agentMeta,
      gameState.mapMeta,
      gameState.agentVariance,
      gameState.teamMapComps ?? {},
      gameState.agentRoleOverrides ?? {},
      gameState.teamMapCompNoPenalty ?? {},
      gameState.teamMapCompBuffs ?? {},
      gameState.disabledAgents ?? []
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
    showToast(
      result.statChanges.length > 0 
        ? `Scrim complete! ${result.statChanges.length} player(s) developed`
        : `Scrim complete. No significant changes.`,
      'success'
    );
  };

  // Handle adding a new academy team
  const handleAddAcademyTeam = (team: Tier2Team) => {
    if (!gameState) return;
    
    const region = team.region;
    const existing = gameState.customTier2Teams?.[region] || [];
    
    setGameState({
      ...gameState,
      customTier2Teams: {
        ...gameState.customTier2Teams,
        [region]: [...existing, team],
      },
    });
    
    showToast(`Created academy team: ${team.name}`, 'success');
  };

  // Handle editing an academy team
  const handleEditAcademyTeam = (team: Tier2Team) => {
    if (!gameState) return;
    
    const newRegion = team.region;
    
    // Find which region the team was originally in
    let originalRegion: Region | null = null;
    const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
    for (const r of regions) {
      if (gameState.customTier2Teams?.[r]?.some(t => t.id === team.id)) {
        originalRegion = r;
        break;
      }
    }
    
    if (!originalRegion) {
      showToast('Could not find team to edit', 'error');
      return;
    }
    
    // Build new customTier2Teams
    const newCustomTier2Teams = { ...gameState.customTier2Teams };
    
    if (originalRegion === newRegion) {
      // Same region - just update in place
      newCustomTier2Teams[newRegion] = (newCustomTier2Teams[newRegion] || []).map(t => 
        t.id === team.id ? team : t
      );
    } else {
      // Region changed - remove from old, add to new
      newCustomTier2Teams[originalRegion] = (newCustomTier2Teams[originalRegion] || []).filter(t => 
        t.id !== team.id
      );
      newCustomTier2Teams[newRegion] = [...(newCustomTier2Teams[newRegion] || []), team];
    }
    
    setGameState({
      ...gameState,
      customTier2Teams: newCustomTier2Teams,
    });
    
    showToast(`Updated academy team: ${team.name}`, 'success');
  };

  // Handle deleting an academy team
  const handleDeleteAcademyTeam = (teamId: string, region: Region) => {
    if (!gameState) return;
    
    const existing = gameState.customTier2Teams?.[region] || [];
    const team = existing.find(t => t.id === teamId);
    const teamName = team ? ` "${team.name}"` : '';
    setPromptModal({
      kind: 'confirm', title: 'Delete Academy Team',
      message: `Delete academy team${teamName}? This cannot be undone.`,
      confirmLabel: 'Delete', danger: true,
      onConfirm: () => {
        setPromptModal(null);
        setGameState({
          ...gameState,
          customTier2Teams: {
            ...gameState.customTier2Teams,
            [region]: existing.filter(t => t.id !== teamId),
          },
        });
        showToast(`Deleted academy team${teamName}`, 'success');
      },
      onCancel: () => setPromptModal(null),
    });
  };

  // Simulate until user's team has their next match
  // Check if user's team has been eliminated from playoffs
  const isUserTeamEliminated = (): boolean => {
    if (!gameState || !gameState.userTeamId) return false;
    
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return false;
    
    // during preseason, not eliminated
    if (gameState.phase === 'preseason') {
      return false;
    }
    
    // during kickoff bracket — eliminated = lost in lower bracket (3 losses)
    if (gameState.phase === 'kickoff_bracket') {
      const userRegion = userTeam.region;
      const bracket = gameState.kickoffBrackets?.[userRegion];
      if (!bracket) return false;
      
      // check if user lost in lower bracket (that means eliminated)
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
    
    // check international tournament elimination
    if (gameState.phase === 'international' && gameState.internationalTournament?.bracket) {
      // Check if user qualified for international
      const qualifiedTeam = gameState.internationalTournament.teams.find(
        t => t.teamId === gameState.userTeamId
      );
      
      if (!qualifiedTeam) {
        return true; // Didn't qualify
      }
      
      // Check if eliminated from Swiss (0-2) or lost in lower bracket
      const b = gameState.internationalTournament.bracket;
      const swissTeam = b.swiss.teams.find(t => t.teamId === gameState.userTeamId);
      if (swissTeam?.eliminated) return true;

      for (const round of b.lower) {
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
    return !!gameState.internationalTournament?.champion;
  };

  const handleSimToNextMatchup = () => {
    if (!gameState || !gameState.userTeamId) return;
    
    // Check if season is complete
    if (isSeasonComplete()) {
      showToast("The season is complete. There are no more games.", 'error');
      return;
    }
    
    // Check if user team is eliminated
    if (isUserTeamEliminated()) {
      showToast("Your team has been eliminated. There are no more games this season.", 'error');
      return;
    }
    
    const userTeamId = gameState.userTeamId;
    let daysSimulated = 0;
    const maxDays = 100; // Safety limit
    
    while (daysSimulated < maxDays) {
      // Check if season completed during simulation
      if (isSeasonComplete()) {
        setGameState({ ...gameState });
        showToast(`Season complete! Simulated ${daysSimulated} day(s).`, 'info');
        return;
      }
      
      // Check if user got eliminated during simulation
      if (isUserTeamEliminated()) {
        setGameState({ ...gameState });
        showToast("Your team has been eliminated from the playoffs.", 'error');
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
              // only search schedule for legacy regular season matches
              if (gameState.schedule.length > 0) {
                const scheduleMatch = gameState.schedule.find(
                  m => m.homeTeamId === match.homeTeamId && 
                       m.awayTeamId === match.awayTeamId && 
                       m.played
                );
                if (scheduleMatch) {
                  matchId = scheduleMatch.id;
                }
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
    if (gameState.phase !== "preseason" && gameState.phase !== "kickoff_bracket") return;
    setPromptModal({
      kind: 'confirm', title: 'Skip Kickoff Bracket',
      message: 'Skip the kickoff bracket and simulate all matches? This cannot be undone.',
      confirmLabel: 'Skip',
      onConfirm: () => {
        setPromptModal(null);
        const events = skipToPlayoffs(gameState);
        if (gameState.phase === 'international' && !gameState.internationalTournament) advanceDay(gameState);
        setGameState({ ...gameState });
        setRecentResults((prev) => [...prev, { day: gameState.currentDay, matchesPlayed: [], events }]);
        showToast('All bracket matches simulated.', 'success');
        setView('playoffs');
      },
      onCancel: () => setPromptModal(null),
    });
  };

  const handleSimToStagePlayoffs = () => {
    if (!gameState) return;
    const phase = gameState.phase;
    if (phase !== 'stage1_groups' && phase !== 'stage2_groups') return;
    const stageNum = gameState.currentStage;
    setPromptModal({
      kind: 'confirm', title: `Sim to Stage ${stageNum} Playoffs`,
      message: `Simulate all remaining group stage matches and advance to Stage ${stageNum} Playoffs? This cannot be undone.`,
      confirmLabel: 'Simulate',
      onConfirm: () => {
        setPromptModal(null);
        setSuspendedSim(null);
        watchingMatchupIdRef.current = null;
        // sim all unplayed group matches across all regions
        let safety = 0;
        while (safety < 500 && (gameState.phase === 'stage1_groups' || gameState.phase === 'stage2_groups')) {
          advanceDay(gameState);
          safety++;
        }
        setGameState({ ...gameState });
        showToast(`Stage ${stageNum} group stage complete! Playoffs begin.`, 'success');
        setView('playoffs');
      },
      onCancel: () => setPromptModal(null),
    });
  };

  const handleSimToChampions = () => {
    if (!gameState) return;
    const tt = gameState.currentTournamentType || 'champions';
    const tl = tt === 'masters' ? 'Masters' : 'Champions';
    const ce = (gameState.seasonHistory || [])
      .filter(h => h.year === gameState.currentYear && (h.tournamentType || 'champions') === tt && !h.worldChampionId && !h.worldChampionCustom)
      .sort((a, b) => (a.sortIndex ?? 999) - (b.sortIndex ?? 999))[0];
    const eventLabel = ce?.eventName || `VALORANT ${tl}`;
    if (gameState.internationalTournament?.champion) {
      showToast(`${eventLabel} has already concluded!`, 'info');
      return;
    }
    if (gameState.phase === 'offseason') {
      showToast("The season is over.", 'info');
      return;
    }
    const alreadyInternational = gameState.phase === 'international';
    const msg = alreadyInternational
      ? `Set up the ${eventLabel} bracket? This cannot be undone.`
      : `Simulate all the way to ${eventLabel}? This will skip the kickoff bracket and set up the international tournament. This cannot be undone.`;
    setPromptModal({
      kind: 'confirm', title: alreadyInternational ? `Set Up ${tl} Bracket` : `Sim to ${tl}`,
      message: msg,
      confirmLabel: alreadyInternational ? 'Set Up' : 'Simulate',
      onConfirm: () => {
        setPromptModal(null);
        let safetyCounter = 0;
        const maxIterations = 500;
        while (safetyCounter < maxIterations) {
          if (gameState.phase === 'international' && gameState.internationalTournament?.bracket) break;
          // auto-advance through mid-season transfer windows
          if (gameState.phase === 'mid_offseason') {
            advanceFromMidOffseason(gameState);
          }
          advanceDay(gameState);
          safetyCounter++;
        }
        setGameState({ ...gameState });
        setRecentResults((prev) => [
          ...prev,
          { day: gameState.currentDay, matchesPlayed: [], events: [{ type: 'phase_change', message: `Simulated to ${eventLabel}!` }] },
        ]);
        showToast(`Simulated to ${eventLabel}! The international tournament is ready.`, 'success');
        setView('international');
      },
      onCancel: () => setPromptModal(null),
    });
  };

  const handleSimToRealEvent = () => {
    if (!gameState) return;
    const realCfg = (gameState as any).realEventConfig;
    if (!realCfg?.slots?.length) {
      showToast('No real event teams configured. Set them in Dev Tools → Real Event Teams.', 'info');
      return;
    }
    // enable the override then sim to champions
    (gameState as any).realEventConfig = { ...realCfg, enabled: true };
    handleSimToChampions();
  };

  // Roster Management Handlers
  const handleUpdateLineup = (teamId: string, newLineup: StartingSlot[]) => {
    if (!gameState) return;
    const oldTeam = gameState.teams.find(t => t.id === teamId);
    const oldLineupIds = new Set((oldTeam?.startingLineup ?? []).map(s => s.playerId));
    const newLineupIds = new Set(newLineup.map(s => s.playerId));
    // players no longer in the starting lineup — clear their comp entries
    const removedIds = [...oldLineupIds].filter(id => !newLineupIds.has(id));

    const updatedTeams = gameState.teams.map(team =>
      team.id === teamId
        ? { ...team, startingLineup: newLineup }
        : team
    );

    if (removedIds.length === 0) {
      setGameState({ ...gameState, teams: updatedTeams });
      return;
    }

    // strip removed players from all map comp data for this team
    const stripIds = (mapRecord: Record<string, Record<string, string>> | undefined) => {
      if (!mapRecord) return mapRecord;
      const result: Record<string, Record<string, string>> = {};
      for (const [map, players] of Object.entries(mapRecord)) {
        const cleaned = Object.fromEntries(Object.entries(players).filter(([pid]) => !removedIds.includes(pid)));
        result[map] = cleaned;
      }
      return result;
    };
    const stripIdsNp = (mapRecord: Record<string, string[]> | undefined) => {
      if (!mapRecord) return mapRecord;
      const result: Record<string, string[]> = {};
      for (const [map, ids] of Object.entries(mapRecord)) {
        result[map] = ids.filter(id => !removedIds.some(rid => id === rid || id === `disabled:${rid}`));
      }
      return result;
    };
    const stripIdsBuffs = (mapRecord: Record<string, Record<string, number>> | undefined) => {
      if (!mapRecord) return mapRecord;
      const result: Record<string, Record<string, number>> = {};
      for (const [map, players] of Object.entries(mapRecord)) {
        result[map] = Object.fromEntries(Object.entries(players).filter(([pid]) => !removedIds.includes(pid)));
      }
      return result;
    };

    setGameState({
      ...gameState,
      teams: updatedTeams,
      teamMapComps: {
        ...(gameState.teamMapComps ?? {}),
        [teamId]: stripIds(gameState.teamMapComps?.[teamId]) ?? {},
      },
      teamMapCompNoPenalty: {
        ...(gameState.teamMapCompNoPenalty ?? {}),
        [teamId]: stripIdsNp(gameState.teamMapCompNoPenalty?.[teamId]) ?? {},
      },
      teamMapCompBuffs: {
        ...(gameState.teamMapCompBuffs ?? {}),
        [teamId]: stripIdsBuffs(gameState.teamMapCompBuffs?.[teamId]) ?? {},
      },
    });
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
      showToast("Cannot release a player in the starting lineup. Move them to bench first.", 'error');
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

  const hireCoach = (coachId: string) => {
    if (!gameState) return;
    const pool = gameState.freeAgentCoaches ?? [];
    const coach = pool.find(c => c.id === coachId);
    if (!coach) return;
    const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
    if (!userTeam) return;
    const released = userTeam.staff.headCoach;
    const updatedPool = pool.filter(c => c.id !== coachId);
    if (released) updatedPool.push(released);
    const updatedTeams = gameState.teams.map(t =>
      t.id === gameState.userTeamId
        ? { ...t, staff: { ...t.staff, headCoach: coach }, attributes: calculateTeamAttributes(t.roster, t.startingLineup, coach.rating, coach.specialty, staffFromTeam({ ...t.staff, headCoach: coach })) }
        : t
    );
    setGameState({ ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool });
  };

  const fireCoach = () => {
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
    setGameState({ ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool });
  };

  const hireAssistant = (coachId: string) => {
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
    setGameState({ ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool });
  };

  const fireAssistant = () => {
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
    setGameState({ ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool });
  };

  const hireAnalyst = (coachId: string) => {
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
    setGameState({ ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool });
  };

  const fireAnalyst = () => {
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
    setGameState({ ...gameState, teams: updatedTeams, freeAgentCoaches: updatedPool });
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
      showToast(result.message, 'success');
    } else {
      showToast(`Trade failed: ${result.message}`, 'error');
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
    
    showToast(`Switched to ${newTeam.name}`, 'success');
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
      currentSaveId || undefined,
      devMode,
    );
    setCurrentSaveId(saved.id);
    setSaves(await getAllSaves());
    showToast(`Game saved! (${name || "Unnamed Save"})`, 'success');
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
          imageUrl: player.imageUrl,
          awards: player.awards,
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
        awards: player.awards,
      })),
      standings: gameState.standings,
      champions: gameState.champions,
      customTier2Teams: gameState.customTier2Teams,
      seasonHistory: gameState.seasonHistory || [],
      churnConfig: gameState.churnConfig || null,
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
          imageUrl: player.imageUrl,
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
      
      // Initialize customTier2Teams if not present (for legacy saves)
      let customTier2Teams = save.gameState.customTier2Teams;
      if (!customTier2Teams) {
        const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
        customTier2Teams = {
          americas: [],
          emea: [],
          pacific: [],
          china: [],
        };
        
        // Generate rosters for default academy teams
        for (const region of regions) {
          const defaultTeams = TIER2_TEAMS[region] || [];
          customTier2Teams[region] = defaultTeams.map((team, idx) => {
            const rng = createRNG(`${newSeed}-tier2-${region}-${team.id}-${idx}`);
            const players = generateAcademyRoster(rng, team.abbreviation, team.averageOVR);
            return {
              ...team,
              players,
            };
          });
        }
      }
      
      // Initialize kickoffBrackets if not present (for legacy saves)
      let kickoffBrackets = save.gameState.kickoffBrackets;
      if (!kickoffBrackets || !Object.values(kickoffBrackets).some(b => b !== null)) {
        // generate fresh brackets for this save's teams
        const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
        kickoffBrackets = { americas: null, emea: null, pacific: null, china: null };
        for (const region of regions) {
          const regionTeams = save.gameState.teams.filter((t: any) => t.region === region);
          if (regionTeams.length >= 8) {
            const seeds = seedRegion(regionTeams, []);
            kickoffBrackets[region] = generateKickoffBracket(`${newSeed}-kickoff-${region}`, seeds);
          }
        }
      }

      // migrate old phase values
      let phase = save.gameState.phase;
      if (phase === 'regular_season' || phase === 'regional_playoffs') {
        phase = 'preseason'; // restart from preseason with new bracket
      }

      // fix legacy saves stuck in preseason when an international was already completed this year
      // (old startNextEvent always reset to preseason — new one routes to stage groups)
      if (phase === 'preseason') {
        const history = save.gameState.seasonHistory || [];
        const year = save.gameState.currentYear;
        const completedThisYear = history.filter(
          (h: any) => h.year === year && (h.worldChampionId || h.worldChampionCustom)
        ).length;
        if (completedThisYear >= 1) {
          // should be in offseason so "Start Next Event" routes to stage groups
          phase = 'offseason';
        }
      }

      const updatedGameState = {
        ...save.gameState,
        phase,
        seed: newSeed,
        customTier2Teams,
        kickoffBrackets,
        currentBracketRound: save.gameState.currentBracketRound ?? 0,
        recordBook: migrateRecordBook(save.gameState.recordBook || {}),
        // name pool migration — old saves default to disabled (keep existing random names)
        useEsportsNames: save.gameState.useEsportsNames ?? false,
        usedNames: save.gameState.usedNames ?? [],
        vctPoints: save.gameState.vctPoints ?? {},
        // stage group/playoff state (migration for pre-stage saves)
        stageGroupStages: save.gameState.stageGroupStages ?? { americas: {}, emea: {}, pacific: {}, china: {} },
        stagePlayoffBrackets: save.gameState.stagePlayoffBrackets ?? { americas: {}, emea: {}, pacific: {}, china: {} },
        currentStage: save.gameState.currentStage ?? 1,
        currentStagePlayoffRound: save.gameState.currentStagePlayoffRound ?? 0,
        internationalSource: save.gameState.internationalSource ?? 'kickoff',
      };
      setGameState(updatedGameState);
      setCurrentSaveId(save.id);
      setDevMode(save.devMode || false);
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
    setPromptModal({
      kind: 'confirm', title: 'Delete Save',
      message: 'Delete this save? This cannot be undone.',
      confirmLabel: 'Delete', danger: true,
      onConfirm: async () => {
        setPromptModal(null);
        await deleteSave(id);
        setSaves(await getAllSaves());
        if (currentSaveId === id) setCurrentSaveId(null);
      },
      onCancel: () => setPromptModal(null),
    });
  };

  const handleDuplicate = async (id: string) => {
    const copy = await duplicateSave(id);
    if (copy) {
      setSaves(await getAllSaves());
      handleLoad(copy.id);
    }
  };

  const handleStartRename = (save: SavedGame) => {
    setRenamingSaveId(save.id);
    setRenameValue(save.name);
  };

  const handleConfirmRename = async () => {
    if (renamingSaveId && renameValue.trim()) {
      await renameSave(renamingSaveId, renameValue.trim());
      setSaves(await getAllSaves());
    }
    setRenamingSaveId(null);
    setRenameValue('');
  };

  const handleNavigate = (newView: NavView, teamId?: string) => {
    // Auto-suspend live sim when navigating away
    if (view === 'live-sim' && liveSimMatch && watchingMatchupIdRef.current) {
      console.log('[nav] Auto-suspending live sim, matchupId:', watchingMatchupIdRef.current, 'navigating to:', newView);
      // Save current session — LiveSimView will be unmounted so we grab what we can
      // The actual state is in the component; we use a ref to capture it
      if (liveSimSessionRef.current) {
        setSuspendedSim({
          matchupId: watchingMatchupIdRef.current,
          match: liveSimMatch,
          session: liveSimSessionRef.current,
        });
      }
      setLiveSimMatch(null);
    }
    console.log('[nav] setView:', newView, 'from:', view, 'previousView stays:', previousView);
    setView(newView);
    if (teamId) setSelectedTeamId(teamId);
    if (newView === "roster" && gameState)
      setSelectedTeamId(gameState.userTeamId);
    if (newView === "news" && gameState) {
      const userRegion = gameState.teams.find(t => t.id === gameState.userTeamId)?.region;
      gameState.lastSeenNewsCount = userRegion
        ? (gameState.newsFeed?.filter(n => n.region === userRegion).length ?? 0)
        : (gameState.newsFeed?.length ?? 0);
    }
    // run AI roster churn when opening offseason news, if not already done
    if (newView === "progression" && gameState && gameState.phase === 'offseason' && (gameState.offseasonChurnEvents?.length ?? 0) === 0) {
      const churn = runOffseasonChurn(
        gameState.teams,
        gameState.freeAgents || [],
        gameState.kickoffBrackets,
        gameState.internationalTournament,
        gameState.userTeamId,
        `${gameState.seed}-churn-${gameState.currentYear}`,
        gameState.churnConfig,
      );
      gameState.teams = churn.updatedTeams;
      gameState.freeAgents = churn.updatedFreeAgents;
      gameState.offseasonChurnEvents = churn.events;
    }
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
    console.log('[findMatchResult] Looking for matchId:', matchId);

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

    // Check kickoff brackets
    for (const region of ["americas", "emea", "pacific", "china"] as Region[]) {
      const bracket = gameState.kickoffBrackets?.[region];
      if (bracket) {
        for (const section of [...(bracket.upper || []), ...(bracket.middle || []), ...(bracket.lower || [])]) {
          for (const matchup of section.matchups) {
            if (matchup.team1Id && matchup.team2Id && matchup.matchResults?.length > 0) {
              if (matchup.id === matchId) {
                return {
                  result: matchup.matchResults[0],
                  homeTeamId: matchup.team1Id,
                  awayTeamId: matchup.team2Id,
                };
              }
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

    // Check legacy regional playoffs (old saves)
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
      const b = gameState.internationalTournament.bracket;
      const allRounds = [...b.swiss.rounds, ...b.upper, ...b.lower];
      for (const round of allRounds) {
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

    // Check stage group matches
    for (const region of ["americas", "emea", "pacific", "china"] as Region[]) {
      const regionGs = (gameState as any).stageGroupStages?.[region];
      if (!regionGs) continue;
      for (const stageNum of [1, 2]) {
        const gs = regionGs[stageNum];
        if (!gs?.groups) continue;
        for (const group of gs.groups) {
          for (const match of group.schedule) {
            if (match.played && match.result) {
              if (match.id === matchId || match.result.id === matchId) {
                return {
                  result: match.result,
                  homeTeamId: match.homeTeamId,
                  awayTeamId: match.awayTeamId,
                };
              }
            }
          }
        }
      }
    }

    // Check stage playoff brackets
    for (const region of ["americas", "emea", "pacific", "china"] as Region[]) {
      const regionBrackets = (gameState as any).stagePlayoffBrackets?.[region];
      if (!regionBrackets) continue;
      for (const stageNum of [1, 2]) {
        const bracket = regionBrackets[stageNum];
        if (!bracket) continue;
        for (const rounds of [bracket.upper, bracket.lower]) {
          if (!rounds) continue;
          for (const round of rounds) {
            for (const matchup of round.matchups) {
              if (matchup.team1Id && matchup.team2Id && matchup.matchResults?.length > 0) {
                if (matchup.id === matchId) {
                  return {
                    result: matchup.matchResults[0],
                    homeTeamId: matchup.team1Id,
                    awayTeamId: matchup.team2Id,
                  };
                }
                const matchResult = matchup.matchResults.find((r: any) => r.id === matchId);
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
    }

    console.warn('[findMatchResult] Match NOT found for id:', matchId);
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
    // Helper: relative time string
    const timeAgo = (ts: number) => {
      const diff = Date.now() - ts;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days < 30) return `${days}d ago`;
      return new Date(ts).toLocaleDateString();
    };

    // Helper: phase display
    const phaseLabel = (phase: string) => {
      switch (phase) {
        case 'preseason': return 'Preseason';
        case 'kickoff_bracket': return 'Kickoff';
        case 'international': return 'Champions';
        case 'offseason': return 'Offseason';
        case 'stage1_groups': return 'Stage 1 Groups';
        case 'stage1_playoffs': return 'Stage 1 Playoffs';
        case 'stage2_groups': return 'Stage 2 Groups';
        case 'stage2_playoffs': return 'Stage 2 Playoffs';
        case 'mid_offseason': return 'Transfer Window';
        default: return phase.replace('_', ' ');
      }
    };

    const phaseClass = (phase: string) => {
      switch (phase) {
        case 'kickoff_bracket': return 'phase-kickoff';
        case 'international': return 'phase-champions';
        case 'offseason': return 'phase-offseason';
        case 'stage1_groups':
        case 'stage1_playoffs':
        case 'stage2_groups':
        case 'stage2_playoffs': return 'phase-kickoff';
        case 'mid_offseason': return 'phase-offseason';
        default: return 'phase-preseason';
      }
    };

    return (
      <>
      <div className="app">
        <div className="toast-container">
          {toasts.map(toast => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
        
        <div className="welcome">
          <div className="welcome-layout">
            {/* Left: Branding + Actions */}
            <div className="welcome-left">
              <div className="welcome-brand">
                <h1>🎮 ValorantGM</h1>
                <span className="welcome-version">v{APP_VERSION}</span>
              </div>
              <p className="welcome-tagline">Manage your VCT franchise</p>

              <div className="welcome-actions">
                <button className="btn-start" onClick={handleStartSetup}>
                  Start New Game
                </button>
                <button
                  className="btn-start secondary"
                  onClick={() => setScreen("custom_league")}
                >
                  🎲 Custom League
                </button>
                <div className="welcome-actions-row">
                  <button
                    className="btn-start secondary"
                    onClick={() => setScreen("editor")}
                  >
                    ✏️ League Editor
                  </button>
                  <button
                    className="btn-start secondary"
                    onClick={() => importFileRef.current?.click()}
                  >
                    📥 Import JSON
                  </button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportLeague}
                    style={{ display: "none" }}
                  />
                </div>
              </div>

              <div className="welcome-footer">
                ValorantGM is a fan project and is not affiliated with Riot Games or VALORANT.
              </div>
            </div>

            {/* Right: Saved Games */}
            <div className="welcome-right">
              <div className="saves-header">
                <h2>Saved Games</h2>
                <span className="saves-count">{saves.length}</span>
              </div>

              {saves.length === 0 ? (
                <div className="saves-empty">
                  <span className="saves-empty-icon">💾</span>
                  <p>No saved games yet</p>
                  <span className="saves-empty-hint">Start a new game to begin your career</span>
                </div>
              ) : (
                <div className="saves-list-welcome">
                  {saves.map((save) => {
                    const userTeam = save.gameState.teams?.find(
                      (t: any) => t.id === save.gameState.userTeamId
                    );
                    const standing = save.gameState.standings?.find(
                      (s: any) => s.teamId === save.gameState.userTeamId
                    );

                    return (
                      <div
                        key={save.id}
                        className="save-card"
                        onClick={() => handleLoad(save.id)}
                        title="Click to load"
                      >
                        <div className="save-card-left">
                          {userTeam?.logo ? (
                            <img src={userTeam.logo} alt="" className="save-team-logo" />
                          ) : (
                            <div className="save-team-logo-placeholder">?</div>
                          )}
                          <div className="save-card-info">
                            <div className="save-card-top-row">
                              {renamingSaveId === save.id ? (
                                <input
                                  className="save-name-input"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onBlur={handleConfirmRename}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleConfirmRename();
                                    if (e.key === 'Escape') { setRenamingSaveId(null); setRenameValue(''); }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              ) : (
                                <span className="save-card-name">{save.name}</span>
                              )}
                            </div>
                            <div className="save-card-meta">
                              {userTeam && (
                                <span className="save-card-team">{userTeam.abbreviation}</span>
                              )}
                              {standing && (
                                <span className="save-card-record">{standing.wins}-{standing.losses}</span>
                              )}
                              <span className={`save-card-phase ${phaseClass(save.gameState.phase)}`}>
                                {phaseLabel(save.gameState.phase)}
                              </span>
                              <span className="save-card-day">Day {save.gameState.currentDay}</span>
                              <span className="save-card-season">S{save.gameState.currentYear}</span>
                            </div>
                          </div>
                        </div>
                        <div className="save-card-actions">
                          <span className="save-card-time">{timeAgo(save.savedAt)}</span>
                          <button
                            className="save-action-btn rename"
                            onClick={(e) => { e.stopPropagation(); handleStartRename(save); }}
                            title="Rename"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            className="save-action-btn duplicate"
                            onClick={(e) => { e.stopPropagation(); handleDuplicate(save.id); }}
                            title="Duplicate & load copy"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                          <button
                            className="save-action-btn delete"
                            onClick={(e) => { e.stopPropagation(); handleDelete(save.id); }}
                            title="Delete"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {promptModal && <AppModal {...promptModal} />}
      </>
    );
  }

  if (screen === "custom_league") {
    return (
      <div className="app">
        <div className="custom-league-screen">
          <h1>🎲 Custom League</h1>
          <p className="custom-league-desc">Real VCT teams with fresh rosters. Pick a mode below.</p>

          <div className="custom-league-cards">
            <div className="custom-league-card" onClick={handleRandomizeSetup}>
              <div className="custom-league-card-icon">🎲</div>
              <h3>Randomize Rosters</h3>
              <p>All 30 VCT teams keep their names, logos, and regions — but every player is randomly generated using the esports name pool. Fresh sandbox, anything can happen.</p>
            </div>

            <div className="custom-league-card" onClick={() => customRosterFileRef.current?.click()}>
              <div className="custom-league-card-icon">📥</div>
              <h3>Import Roster JSON</h3>
              <p>Provide a JSON file mapping team abbreviations to player lists. Teams not in your file get randomized rosters.</p>
              <span className="custom-league-hint">Format: {"{"} "SEN": ["player1", ...], "NRG": [...] {"}"}</span>
              <input
                ref={customRosterFileRef}
                type="file"
                accept=".json"
                onChange={handleCustomRosterImport}
                style={{ display: "none" }}
              />
            </div>
          </div>

          <div className="custom-league-footer">
            <button className="btn-back" onClick={() => setScreen("welcome")}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "editor") {
    return (
      <>
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
      {promptModal && <AppModal {...promptModal} />}
      </>
    );
  }

  if (screen === "setup") {
    const regions: Region[] = ["americas", "emea", "pacific", "china"];
    const setupRegionTeams = getTeamsByRegion(setupTeams, selectedRegion);
    const previewTeam = setupSelectedTeamId ? setupTeams.find(t => t.id === setupSelectedTeamId) : null;
    const getTeamOvr = (team: Team) => Math.round(team.roster.reduce((s, p) => s + p.overall, 0) / team.roster.length);
    const getTeamTier = (team: Team) => toLetterGrade(getTeamOvr(team));
    const getTeamTierClass = (team: Team) => getGradeClass(getTeamTier(team));
    const roleLabel = (r: string) => r.slice(0, 3).toUpperCase();

    return (
      <div className="app">
        <div className="setup-screen">
          <h1>New Game Setup</h1>

          {/* region pills */}
          <div className="setup-region-pills">
            {regions.map((region) => (
              <button
                key={region}
                className={`setup-pill ${selectedRegion === region ? "active" : ""}`}
                onClick={() => { setSelectedRegion(region); setSetupSelectedTeamId(null); }}
              >
                {REGION_NAMES[region]}
                <span className="setup-pill-count">{getTeamsByRegion(setupTeams, region).length}</span>
              </button>
            ))}
          </div>

          {/* main content: team grid + preview sidebar */}
          <div className="setup-body">
            <div className="setup-team-grid">
              {setupRegionTeams.map((team) => {
                const ovr = getTeamOvr(team);
                const tier = toLetterGrade(ovr);
                const tierClass = getGradeClass(tier);
                return (
                  <div
                    key={team.id}
                    className={`setup-team-card ${setupSelectedTeamId === team.id ? "selected" : ""}`}
                    onClick={() => setSetupSelectedTeamId(team.id)}
                  >
                    <img src={team.logo} alt={team.name} className="setup-team-logo" />
                    <div className="setup-team-meta">
                      <span className="setup-team-name">{team.name}</span>
                      <span className="setup-team-abbr">{team.abbreviation}</span>
                    </div>
                    <div className="setup-team-badges">
                      <span className={`setup-tier-badge ${tierClass}`}>{tier}</span>
                      <span className="setup-ovr-badge">{ovr}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* roster preview sidebar */}
            <div className="setup-preview">
              {previewTeam ? (
                <>
                  <div className="setup-preview-header">
                    <img src={previewTeam.logo} alt="" className="setup-preview-logo" />
                    <div>
                      <div className="setup-preview-name">{previewTeam.name}</div>
                      <div className="setup-preview-region">{REGION_NAMES[previewTeam.region]} · {previewTeam.abbreviation}</div>
                    </div>
                    <span className={`setup-tier-badge ${getTeamTierClass(previewTeam)}`}>{getTeamTier(previewTeam)}</span>
                  </div>
                  <div className="setup-preview-roster">
                    <div className="setup-preview-roster-header">
                      <span>Player</span>
                      <span>Role</span>
                      <span>OVR</span>
                    </div>
                    {previewTeam.roster.map((p) => (
                      <div key={p.id} className="setup-preview-player">
                        <span className="setup-preview-player-name">{p.name}</span>
                        <span className={`setup-preview-role role-${p.role}`}>{roleLabel(p.role)}</span>
                        <span className="setup-preview-player-ovr">{p.overall}</span>
                      </div>
                    ))}
                  </div>
                  <div className="setup-preview-summary">
                    <div><span className="setup-preview-label">Avg OVR</span><span>{getTeamOvr(previewTeam)}</span></div>
                    <div><span className="setup-preview-label">Firepower</span><span>{previewTeam.attributes.firepower}</span></div>
                  </div>
                </>
              ) : (
                <div className="setup-preview-empty">
                  <span>Select a team to preview roster</span>
                </div>
              )}
            </div>
          </div>

          {/* actions footer */}
          <div className="setup-actions">
            <label className="setup-toggle">
              <input
                type="checkbox"
                checked={useEsportsNames}
                onChange={e => setUseEsportsNames(e.target.checked)}
              />
              Esports name pool
              <span className="setup-toggle-hint">(~850 names)</span>
            </label>
            <div style={{ flex: 1 }} />
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
  const currentKickoffBracket = gameState.kickoffBrackets?.[selectedRegion] ?? null;

  return (
    <div className="app">
      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>

      <div className="top-bar">
        <div className="top-bar-logo">🎮 ValorantGM <span className="app-version">v{APP_VERSION}</span></div>
        <div className="top-bar-info">
          <span className="top-bar-phase">
            {gameState.phase.replace(/_/g, ' ').toUpperCase()}
          </span>
          <div className="top-bar-meta">
            <div className="top-bar-meta-item">
              <span className="top-bar-meta-label">DAY</span>
              <span className="top-bar-meta-value">{gameState.currentDay}</span>
            </div>
            <div className="top-bar-meta-divider" />
            <div className="top-bar-meta-item">
              <span className="top-bar-meta-label">SEASON</span>
              <span className="top-bar-meta-value">
                {gameState.currentYear}
                {devMode && (
                  <button
                    className="dev-year-edit-btn"
                    title="Change season year"
                    onClick={() => setPromptModal({
                    title: 'Change Season Year',
                    label: 'Enter a year between 2001 and 2099',
                    defaultValue: String(gameState.currentYear),
                    onConfirm: (input) => {
                      const yr = parseInt(input);
                      if (!isNaN(yr) && yr > 2000 && yr < 2100) {
                        setGameState({ ...gameState, currentYear: yr });
                      }
                      setPromptModal(null);
                    },
                  })}
                  >✎</button>
                )}
              </span>
            </div>
            {devMode && (
              <>
                <div className="top-bar-meta-divider" />
                <div className="top-bar-meta-item">
                  <span className="top-bar-meta-label">EVT</span>
                  <select
                    className="dev-tournament-select"
                    value={gameState.currentTournamentType || 'champions'}
                    onChange={e => setGameState({ ...gameState, currentTournamentType: e.target.value as 'champions' | 'masters' })}
                  >
                    <option value="champions">Champions</option>
                    <option value="masters">Masters</option>
                  </select>
                </div>
              </>
            )}
          </div>
          {userTeam && (
            <span className="top-bar-team">
              {userTeam.logo && <img src={userTeam.logo} alt="" className="top-bar-team-logo" />}
              <span className="top-bar-team-name">{userTeam.name}</span>
            </span>
          )}
        </div>
        <div className="top-bar-actions">
          {/* ── Offseason: Start Next Event ── */}
          {gameState.phase === 'offseason' && (getNextPlannedEvent(gameState) || (() => {
            // show button if stages should follow completed internationals even without planned events
            const done = (gameState.seasonHistory || []).filter(
              (h: any) => h.year === gameState.currentYear && (h.worldChampionId || h.worldChampionCustom)
            ).length;
            return done >= 1 && done < 3;
          })()) && (
            <button className="btn btn-next-event" onClick={handleStartNextEvent} title={getNextPlannedEvent(gameState)?.eventName || 'Start next tournament'}>
              ▶ Start Next Event
            </button>
          )}
          {/* ── Mid-offseason: Start Next Stage ── */}
          {gameState.phase === 'mid_offseason' && (
            <button className="btn btn-next-event" onClick={handleStartNextEvent} title="Start next stage">
              ▶ Start Next Stage
            </button>
          )}
          {/* ── Simulate To dropdown ── */}
          {gameState.phase !== 'offseason' && gameState.phase !== 'mid_offseason' && (() => {
            const phase = gameState.phase;
            const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
            const userRegion = userTeam?.region ?? 'americas';
            const REGION_NAMES: Record<string, string> = { americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' };
            const regionLabel = REGION_NAMES[userRegion] ?? userRegion;

            // current kickoff/stage event name from history
            const kickoffEvent = (gameState.seasonHistory || [])
              .filter(h => h.year === gameState.currentYear && (h.tournamentType || 'champions') === 'champions' && !h.worldChampionId && !h.worldChampionCustom && !(gameState.currentTournamentType === 'masters'))
              .sort((a, b) => (a.sortIndex ?? 999) - (b.sortIndex ?? 999))[0];

            // intl event (masters/champions)
            const tt = gameState.currentTournamentType || 'champions';
            const intlEvent = (gameState.seasonHistory || [])
              .filter(h => h.year === gameState.currentYear && (h.tournamentType || 'champions') === tt && !h.worldChampionId && !h.worldChampionCustom)
              .sort((a, b) => (a.sortIndex ?? 999) - (b.sortIndex ?? 999))[0];
            const intlLabel = intlEvent?.eventName || (tt === 'masters' ? `Masters ${gameState.currentYear}` : `Champions ${gameState.currentYear}`);

            // derive stage label: Kickoff before first intl, then Stage 1, Stage 2...
            const completedIntlCount = (gameState.seasonHistory || [])
              .filter(h => h.year === gameState.currentYear && (h.worldChampionId || h.worldChampionCustom))
              .length;
            const stageLabel = completedIntlCount === 0
              ? 'Kickoff'
              : `Stage ${completedIntlCount}`;

            // is kickoff/stage still running
            const inKickoff = phase === 'preseason' || phase === 'kickoff_bracket';
            const inStageGroups = phase === 'stage1_groups' || phase === 'stage2_groups';
            const inStagePlayoffs = phase === 'stage1_playoffs' || phase === 'stage2_playoffs';
            const inIntl = phase === 'international';

            const realCfg = (gameState as any).realEventConfig;
            const hasRealTeams = devMode && realCfg?.slots?.length > 0 && !gameState.internationalTournament?.champion;

            return (
              <div className="play-day-dropdown">
                <button className="btn btn-play" onClick={() => setShowPlayDayMenu(p => !p)}>
                  Simulate To ▾
                </button>
                {showPlayDayMenu && (
                  <>
                    <div className="play-day-backdrop" onClick={() => setShowPlayDayMenu(false)} />
                    <div className="play-day-menu">

                      {/* ── Sim to end of Stage / Kickoff ── */}
                      {inKickoff && (
                        <>
                          <button className="play-day-option" onClick={() => { setShowPlayDayMenu(false); handleSkipToPlayoffs(); }}>
                            {stageLabel}
                            <span className="simulate-desc">Sim all regional bracket matches</span>
                          </button>
                          <div className="play-day-divider" />
                        </>
                      )}
                      {/* ── Sim stage groups → stage playoffs ── */}
                      {inStageGroups && (
                        <>
                          <button className="play-day-option" onClick={() => { setShowPlayDayMenu(false); handleSimToStagePlayoffs(); }}>
                            Stage {gameState.currentStage} Playoffs
                            <span className="simulate-desc">Sim all group matches, advance to playoffs</span>
                          </button>
                          <div className="play-day-divider" />
                        </>
                      )}
                      {/* ── Intl event options (all non-intl phases) ── */}
                      {!inIntl && !gameState.internationalTournament?.champion && (
                        <>
                          <button className="play-day-option" onClick={() => { setShowPlayDayMenu(false); handleSimToChampions(); }}>
                            {intlLabel}
                            <span className="simulate-desc">Sim everything up to the international event</span>
                          </button>
                          {hasRealTeams && (
                            <button className="play-day-option dev-option" onClick={() => { setShowPlayDayMenu(false); handleSimToRealEvent(); }}>
                              {intlLabel} — Real Teams
                              <span className="simulate-desc">Use configured real-world teams</span>
                            </button>
                          )}
                          <div className="play-day-divider" />
                        </>
                      )}

                      {/* ── Always: Sim to Offseason ── */}
                      <button className="play-day-option danger" onClick={() => { setShowPlayDayMenu(false); handleSimToOffseason(); }}>
                        Offseason
                        <span className="simulate-desc">Sim the rest of the season</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

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
                  <div className="toggle-row">
                    <span className="toggle-icon">🔧</span>
                    <span className="toggle-text">Dev Mode</span>
                    <div className="toggle-switch"></div>
                  </div>
                  <span className="export-desc">Edit any player on any team</span>
                </button>
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
          devMode={devMode}
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
                gameState.phase === 'kickoff_bracket' ||
                gameState.phase === 'international' ||
                gameState.phase === 'offseason' ||
                gameState.phase === 'mid_offseason' ||
                gameState.phase === 'stage1_groups' ||
                gameState.phase === 'stage1_playoffs' ||
                gameState.phase === 'stage2_groups' ||
                gameState.phase === 'stage2_playoffs'
              }
            />
          )}

          {view === "schedule" && (
            <SchedulePage
              teams={gameState.teams}
              standings={gameState.standings}
              userTeamId={gameState.userTeamId}
              currentDay={gameState.currentDay}
              currentRoundIdx={getCurrentRoundIndex(gameState)}
              totalRounds={getTotalRounds(gameState)}
              getMatchupsForRound={(idx: number) => {
                // stage phases: return stage matchups instead of bracket rounds
                const p = gameState.phase;
                if (p === 'stage1_groups' || p === 'stage2_groups' || p === 'stage1_playoffs' || p === 'stage2_playoffs') {
                  return getTodayMatchups(gameState);
                }
                return getRoundMatchups(gameState, idx);
              }}
              getRoundLabel={(idx: number) => {
                const p = gameState.phase;
                if (p === 'stage1_groups') return 'Stage 1 Groups';
                if (p === 'stage2_groups') return 'Stage 2 Groups';
                if (p === 'stage1_playoffs') return `Stage 1 ${getPhaseLabel(idx, gameState)}`;
                if (p === 'stage2_playoffs') return `Stage 2 ${getPhaseLabel(idx, gameState)}`;
                return getRoundLabel(idx);
              }}
              getPhaseLabel={(idx: number) => getPhaseLabel(idx, gameState)}
              onSimMatchup={handleSimMatchup}
              onWatchMatchup={handleWatchMatchup}
              suspendedMatchupId={suspendedSim?.matchupId ?? null}
              suspendedMatchInfo={suspendedMatchInfo}
              onMatchClick={(matchupId) => {
                console.log('[schedule] onMatchClick matchupId:', matchupId, 'current view:', view, 'suspendedSim:', !!suspendedSim);
                setPreviousView("schedule");
                setSelectedMatchId(matchupId);
                setView("match-detail");
              }}
            />
          )}

          {view === "playoffs" && !(gameState as any).realEventConfig?.enabled && (
            gameState.phase === 'stage1_groups' || gameState.phase === 'stage2_groups' ||
            (gameState.phase === 'mid_offseason' && Object.values(gameState.stageGroupStages).some(r => r[gameState.currentStage]))
          ) && (() => {
            const stageNum = gameState.currentStage;
            const gs = gameState.stageGroupStages[selectedRegion]?.[stageNum];
            return (
              <>
                <div className="content-header">
                  <img src={REGION_LOGOS[selectedRegion]} alt="" className="region-header-logo" />
                  <h1>{REGION_NAMES[selectedRegion]} Stage {stageNum} Groups</h1>
                </div>
                <div className="region-tabs">
                  {(["americas", "emea", "pacific", "china"] as Region[]).map(region => (
                    <button
                      key={region}
                      className={`region-tab ${selectedRegion === region ? "active" : ""}`}
                      onClick={() => setSelectedRegion(region)}
                    >
                      <img src={REGION_LOGOS[region]} alt="" className="region-tab-logo" />
                      {REGION_NAMES[region]}
                    </button>
                  ))}
                </div>
                {gs ? (
                  <StageGroupStandingsView
                    groupStage={gs}
                    allGroupStages={Object.fromEntries(
                      (["americas", "emea", "pacific", "china"] as Region[]).map(r => [r, gameState.stageGroupStages[r]?.[stageNum]])
                    )}
                    selectedRegion={selectedRegion}
                    teams={gameState.teams}
                    userTeamId={gameState.userTeamId}
                    onViewTeam={handleViewTeam}
                    onSimMatchup={handleSimMatchup}
                    onWatchMatchup={handleWatchMatchup}
                    suspendedMatchupId={suspendedSim?.matchupId ?? null}
                    suspendedMatchInfo={suspendedMatchInfo}
                    onMatchClick={(matchId) => {
                      setPreviousView("playoffs");
                      setSelectedMatchId(matchId);
                      setView("match-detail");
                    }}
                    onSimMatchday={(matchIds) => {
                      setSuspendedSim(null);
                      watchingMatchupIdRef.current = null;
                      for (const id of matchIds) simSingleMatchup(gameState, id);
                      // auto-sim other regions if user region done
                      const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
                      const userRegion = userTeam?.region;
                      if (userRegion) {
                        const userGs = gameState.stageGroupStages[userRegion]?.[stageNum];
                        if (userGs?.groups.every(g => g.schedule.every(m => m.played))) {
                          for (const r of ['americas', 'emea', 'pacific', 'china'] as const) {
                            if (r === userRegion) continue;
                            const rgs = gameState.stageGroupStages[r]?.[stageNum];
                            if (!rgs) continue;
                            for (const g of rgs.groups) for (const m of g.schedule) if (!m.played) simSingleMatchup(gameState, m.id);
                          }
                        }
                      }
                      setGameState({ ...gameState });
                      const phase = gameState.phase;
                      if (phase === 'stage1_playoffs' || phase === 'stage2_playoffs') {
                        showToast(`Stage ${stageNum} group stage complete! Playoffs begin.`, 'success');
                        setView('playoffs');
                      }
                    }}
                    onSimAllMatchdays={() => {
                      setSuspendedSim(null);
                      watchingMatchupIdRef.current = null;
                      let safety = 0;
                      while (safety < 500 && (gameState.phase === 'stage1_groups' || gameState.phase === 'stage2_groups')) {
                        advanceDay(gameState);
                        safety++;
                      }
                      setGameState({ ...gameState });
                      const phase = gameState.phase;
                      if (phase === 'stage1_playoffs' || phase === 'stage2_playoffs') {
                        showToast(`Stage ${stageNum} group stage complete! Playoffs begin.`, 'success');
                        setView('playoffs');
                      }
                    }}
                  />
                ) : (
                  <div className="panel"><div className="panel-body"><p style={{ color: 'var(--text-muted)' }}>No group data for this region.</p></div></div>
                )}
              </>
            );
          })()}

          {/* stage groups read-only view (available after groups phase) */}
          {view === "stage-groups" && (() => {
            const stageNum = gameState.currentStage;
            const gs = gameState.stageGroupStages[selectedRegion]?.[stageNum];
            return (
              <>
                <div className="content-header">
                  <img src={REGION_LOGOS[selectedRegion]} alt="" className="region-header-logo" />
                  <h1>{REGION_NAMES[selectedRegion]} Stage {stageNum} Groups</h1>
                </div>
                <div className="region-tabs">
                  {(["americas", "emea", "pacific", "china"] as Region[]).map(region => (
                    <button
                      key={region}
                      className={`region-tab ${selectedRegion === region ? "active" : ""}`}
                      onClick={() => setSelectedRegion(region)}
                    >
                      <img src={REGION_LOGOS[region]} alt="" className="region-tab-logo" />
                      {REGION_NAMES[region]}
                    </button>
                  ))}
                </div>
                {gs ? (
                  <StageGroupStandingsView
                    groupStage={gs}
                    allGroupStages={Object.fromEntries(
                      (["americas", "emea", "pacific", "china"] as Region[]).map(r => [r, gameState.stageGroupStages[r]?.[stageNum]])
                    )}
                    selectedRegion={selectedRegion}
                    teams={gameState.teams}
                    userTeamId={gameState.userTeamId}
                    onViewTeam={handleViewTeam}
                    onMatchClick={(matchId) => {
                      setPreviousView("stage-groups");
                      setSelectedMatchId(matchId);
                      setView("match-detail");
                    }}
                  />
                ) : (
                  <div className="panel"><div className="panel-body"><p style={{ color: 'var(--text-muted)' }}>No group data for this region.</p></div></div>
                )}
              </>
            );
          })()}

          {view === "playoffs" && !(gameState as any).realEventConfig?.enabled && (() => {
            const phase = gameState.phase;
            const stageNum = gameState.currentStage;
            const hasStagePlayoffs = Object.values(gameState.stagePlayoffBrackets ?? {}).some(r => r[stageNum]);
            const showStagePlayoffs = phase === 'stage1_playoffs' || phase === 'stage2_playoffs' ||
              ((phase === 'international' || phase === 'offseason' || phase === 'mid_offseason') && hasStagePlayoffs);
            if (!showStagePlayoffs) return null;
            const bracket = gameState.stagePlayoffBrackets[selectedRegion]?.[stageNum];
            return (
              <>
                <div className="content-header">
                  <img src={REGION_LOGOS[selectedRegion]} alt="" className="region-header-logo" />
                  <h1>{REGION_NAMES[selectedRegion]} Stage {stageNum} Playoffs</h1>
                </div>
                <div className="region-tabs">
                  {(["americas", "emea", "pacific", "china"] as Region[]).map(region => {
                    const rb = gameState.stagePlayoffBrackets[region]?.[stageNum];
                    const qualified = rb?.qualifiedTeams?.length ?? 0;
                    return (
                      <button
                        key={region}
                        className={`region-tab ${selectedRegion === region ? "active" : ""}`}
                        onClick={() => setSelectedRegion(region)}
                      >
                        <img src={REGION_LOGOS[region]} alt="" className="region-tab-logo" />
                        {REGION_NAMES[region]}
                        {qualified > 0 && ` (${qualified}/3)`}
                      </button>
                    );
                  })}
                </div>
                {bracket ? (
                  <StagePlayoffBracketView
                    bracket={bracket}
                    allBrackets={Object.fromEntries(
                      (["americas", "emea", "pacific", "china"] as Region[]).map(r => [r, gameState.stagePlayoffBrackets[r]?.[stageNum]])
                    )}
                    groupStages={Object.fromEntries(
                      (["americas", "emea", "pacific", "china"] as Region[]).map(r => [r, gameState.stageGroupStages[r]?.[stageNum]])
                    )}
                    selectedRegion={selectedRegion}
                    teams={gameState.teams}
                    userTeamId={gameState.userTeamId}
                    stageNum={stageNum}
                    currentStep={gameState.currentStagePlayoffRound}
                    onPlayDay={handleAdvanceDay}
                    onWatchMatch={handleWatchMatchup}
                    onSimMatch={handleSimMatchup}
                    suspendedMatchupId={suspendedSim?.matchupId ?? null}
                    suspendedMatchInfo={suspendedMatchInfo}
                    canPlay={gameState.phase === 'stage1_playoffs' || gameState.phase === 'stage2_playoffs'}
                    onMatchClick={(matchupId) => {
                      setPreviousView("playoffs");
                      setSelectedMatchId(matchupId);
                      setView("match-detail");
                    }}
                  />
                ) : (
                  <div className="panel"><div className="panel-body"><p style={{ color: 'var(--text-muted)' }}>No bracket data for this region.</p></div></div>
                )}
              </>
            );
          })()}

          {view === "playoffs" && !(gameState as any).realEventConfig?.enabled && gameState.phase !== 'stage1_groups' && gameState.phase !== 'stage2_groups' && gameState.phase !== 'stage1_playoffs' && gameState.phase !== 'stage2_playoffs' && !(gameState.phase === 'mid_offseason' && Object.values(gameState.stageGroupStages).some(r => r[gameState.currentStage])) && !((gameState.phase === 'international' || gameState.phase === 'offseason' || gameState.phase === 'mid_offseason') && Object.values(gameState.stagePlayoffBrackets ?? {}).some(r => r[gameState.currentStage])) && (
            <>
              <div className="content-header">
                <img
                  src={REGION_LOGOS[selectedRegion]}
                  alt=""
                  className="region-header-logo"
                />
                <h1>{REGION_NAMES[selectedRegion]} Kickoff Bracket</h1>
              </div>
              <div className="region-tabs">
                {(["americas", "emea", "pacific", "china"] as Region[]).map(
                  (region) => {
                    const regionBracket = gameState.kickoffBrackets?.[region];
                    const hasQualifiers = regionBracket && regionBracket.qualifiers.length > 0;
                    return (
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
                        {hasQualifiers && ` (${regionBracket.qualifiers.length}/3)`}
                      </button>
                    );
                  }
                )}
              </div>
              {currentKickoffBracket ? (
                <KickoffBracketView
                  bracket={currentKickoffBracket}
                  allBrackets={gameState.kickoffBrackets}
                  intlEventName={(() => {
                    const tt = gameState.currentTournamentType || 'champions';
                    const ev = (gameState.seasonHistory || [])
                      .filter(h => h.year === gameState.currentYear && (h.tournamentType || 'champions') === tt && !h.worldChampionId && !h.worldChampionCustom)
                      .sort((a, b) => (a.sortIndex ?? 999) - (b.sortIndex ?? 999))[0];
                    return ev?.eventName || (tt === 'masters' ? `Masters ${gameState.currentYear}` : `Champions ${gameState.currentYear}`);
                  })()}
                  teams={gameState.teams}
                  userTeamId={gameState.userTeamId}
                  onPlayDay={handleAdvanceDay}
                  onWatchMatch={handleWatchMatchup}
                  onSimMatch={handleSimMatchup}
                  suspendedMatchupId={suspendedSim?.matchupId ?? null}
                  suspendedMatchInfo={suspendedMatchInfo}
                  canPlay={(gameState.phase === 'kickoff_bracket' || gameState.phase === 'preseason') && gameState.currentBracketRound < BRACKET_ROUND_ORDER.length}
                  roundLabel={gameState.currentBracketRound < BRACKET_ROUND_ORDER.length ? getRoundName(gameState.currentBracketRound) : undefined}
                  activeSection={gameState.currentBracketRound < BRACKET_ROUND_ORDER.length ? BRACKET_ROUND_ORDER[gameState.currentBracketRound].section : undefined}
                  activeRoundIdx={gameState.currentBracketRound < BRACKET_ROUND_ORDER.length ? BRACKET_ROUND_ORDER[gameState.currentBracketRound].roundIdx : undefined}
                  devMode={devMode}
                  onReseed={handleReseed}
                  onMatchClick={(matchupId) => {
                    setPreviousView("playoffs");
                    setSelectedMatchId(matchupId);
                    setView("match-detail");
                  }}
                />
              ) : currentRegionPlayoff ? (
                <PlayoffBracketView
                  bracket={currentRegionPlayoff}
                  teams={gameState.teams}
                  regionChampion={gameState.regionalChampions[selectedRegion]}
                  playoffSeeds={new Map()}
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
                      {gameState.phase === "preseason"
                        ? "The kickoff bracket has not started yet."
                        : "No bracket data for this region."}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {view === "international" && (
            <>
              <div className="content-header">
                <h1>{(() => {
                  const tt = gameState.currentTournamentType || 'champions';
                  const tl = tt === 'masters' ? 'Masters' : 'Champions';
                  const ev = (gameState.seasonHistory || [])
                    .filter(h => h.year === gameState.currentYear && (h.tournamentType || 'champions') === tt && !h.worldChampionId && !h.worldChampionCustom)
                    .sort((a, b) => (a.sortIndex ?? 999) - (b.sortIndex ?? 999))[0];
                  return ev?.eventName || `${tl} ${gameState.currentYear}`;
                })()}</h1>
              </div>
              {gameState.internationalTournament ? (
                <>
                  <div className="panel" style={{ marginBottom: "16px" }}>
                    <div className="panel-header">Qualified Teams</div>
                    <div className="panel-body">
                      <div className="qualified-teams-grid">
                        {(
                          ["americas", "emea", "pacific", "china"] as Region[]
                        ).map((region) => {
                          const regionTeams = gameState
                            .internationalTournament!.teams.filter(
                              (t) => t.region === region
                            )
                            .sort((a, b) => a.seed - b.seed);
                          const swissTeams = gameState.internationalTournament!.bracket.swiss.teams;
                          // compute wins/losses live from matchResults so scores update after every game
                          // skip the suspended (live-watching) matchup to avoid spoiling the outcome
                          const liveRecord = (teamId: string) => {
                            let w = 0, l = 0;
                            for (const round of gameState.internationalTournament!.bracket.swiss.rounds) {
                              for (const m of round.matchups) {
                                if (!m.matchResults?.length) continue;
                                if (m.id === suspendedSim?.matchupId) continue;
                                const isHome = m.team1Id === teamId;
                                const isAway = m.team2Id === teamId;
                                if (!isHome && !isAway) continue;
                                const r = m.matchResults[0];
                                const won = m.winnerId === teamId;
                                if (won) w++; else l++;
                              }
                            }
                            return { w, l };
                          };
                          // teams involved in the suspended (live-watching) match
                          const suspendedTeams = new Set<string>();
                          if (suspendedSim?.matchupId) {
                            for (const round of gameState.internationalTournament!.bracket.swiss.rounds)
                              for (const m of round.matchups)
                                if (m.id === suspendedSim.matchupId) {
                                  if (m.team1Id) suspendedTeams.add(m.team1Id);
                                  if (m.team2Id) suspendedTeams.add(m.team2Id);
                                }
                          }
                          return (
                          <div key={region} className="qualified-region">
                            <h4 className="qualified-region-title">
                              <img src={REGION_LOGOS[region]} alt="" className="qualified-region-logo" />
                              {REGION_NAMES[region]}
                            </h4>
                            {regionTeams.map((t) => {
                                const team = gameState.teams.find(tm => tm.id === t.teamId);
                                const swissEntry = swissTeams.find(s => s.teamId === t.teamId);
                                const isTopSeed = t.seed === 1;
                                const isUserTeam = t.teamId === gameState.userTeamId;
                                const { w, l } = isTopSeed ? { w: 0, l: 0 } : liveRecord(t.teamId);
                                const hasPlayed = w + l > 0;
                                const isSuspendedTeam = suspendedTeams.has(t.teamId);
                                return (
                                  <div
                                    key={t.teamId}
                                    className={`qualified-team-row ${isUserTeam ? 'qualified-user' : ''} ${!isSuspendedTeam && swissEntry?.eliminated ? 'qualified-eliminated' : ''}`}
                                  >
                                    <span className="qualified-seed">#{t.seed}</span>
                                    <img src={team?.logo} alt={team?.name} className="qualified-team-logo" />
                                    <span className="qualified-team-name">
                                      {team?.abbreviation}
                                      {isUserTeam && <span className="user-team-badge" style={{ marginLeft: 4 }}>YOU</span>}
                                    </span>
                                    {isTopSeed ? (
                                      <span className="swiss-status-badge advanced" style={{ marginLeft: 'auto' }}>Playoffs</span>
                                    ) : (
                                      <div className="qualified-swiss-score">
                                        <div className="qualified-record">
                                          <span className="qualified-record-w">{w}</span>
                                          <span className="qualified-record-sep">-</span>
                                          <span className="qualified-record-l">{l}</span>
                                        </div>
                                        {!isSuspendedTeam && swissEntry?.advanced
                                          ? <span className="swiss-status-badge advanced">✓ Playoffs</span>
                                          : !isSuspendedTeam && swissEntry?.eliminated
                                          ? <span className="swiss-status-badge eliminated">✗ Out</span>
                                          : <span className="swiss-status-badge active">Swiss</span>
                                        }
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        );
                        })}
                      </div>
                    </div>
                  </div>
                  <ChampionsBracketView
                    bracket={gameState.internationalTournament.bracket}
                    teams={gameState.teams}
                    kickoffBrackets={(!gameState.internationalSource || gameState.internationalSource === 'kickoff') ? gameState.kickoffBrackets : undefined}
                    stageGroupStages={(gameState.internationalSource === 'stage1' || gameState.internationalSource === 'stage2') ? gameState.stageGroupStages : undefined}
                    stagePlayoffBrackets={(gameState.internationalSource === 'stage1' || gameState.internationalSource === 'stage2') ? gameState.stagePlayoffBrackets : undefined}
                    stageNum={(gameState.internationalSource === 'stage1' ? 1 : gameState.internationalSource === 'stage2' ? 2 : undefined) as 1 | 2 | undefined}
                    userTeamId={gameState.userTeamId}
                    onPlayDay={handleAdvanceDay}
                    onWatchMatch={handleWatchMatchup}
                    onSimMatch={handleSimMatchup}
                    suspendedMatchupId={suspendedSim?.matchupId ?? null}
                    suspendedMatchInfo={suspendedMatchInfo}
                    canPlay={gameState.phase === 'international' && gameState.currentChampionsRound < CHAMPIONS_ROUND_ORDER.length && !gameState.internationalTournament.champion}
                    roundLabel={gameState.currentChampionsRound < CHAMPIONS_ROUND_ORDER.length ? getChampionsRoundName(gameState.currentChampionsRound) : undefined}
                    currentRound={gameState.currentChampionsRound}
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
            <>
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
                onEditTeam={() => setShowTeamEditModal(true)}
              />
              {showTeamEditModal && (
                <TeamEditModal
                  team={selectedTeam}
                  onSave={(updates) => {
                    setGameState(prev => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        teams: prev.teams.map(t =>
                          t.id === selectedTeam.id ? { ...t, ...updates } : t
                        ),
                      };
                    });
                    showToast("Team updated", "success");
                  }}
                  onClose={() => setShowTeamEditModal(false)}
                />
              )}
            </>
          )}

          {view === "roster" && userTeam && (
            <>
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
                onEditTeam={() => setShowTeamEditModal(true)}
              />
              {showTeamEditModal && (
                <TeamEditModal
                  team={userTeam}
                  onSave={(updates) => {
                    setGameState(prev => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        teams: prev.teams.map(t =>
                          t.id === userTeam.id ? { ...t, ...updates } : t
                        ),
                      };
                    });
                    showToast("Team updated", "success");
                  }}
                  onClose={() => setShowTeamEditModal(false)}
                />
              )}
            </>
          )}

          {view === "players" && (
            <PlayersPage
              teams={gameState.teams}
              freeAgents={gameState.freeAgents}
              academyTeams={gameState.customTier2Teams}
              onViewPlayer={handleViewPlayer}
              onViewTeam={handleViewTeam}
            />
          )}

          {view === "power-rankings" && (
            <PowerRankingsPage
              teams={gameState.teams}
              standings={gameState.standings}
              schedule={getAllPlayedMatches(gameState)}
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
                  mapPool={gameState.mapPool}
                  agentRoleOverrides={gameState.agentRoleOverrides}
                  onSave={handleSavePlayer}
                  onClose={() => setShowEditPlayerModal(false)}
                  onDelete={devMode ? (playerId) => {
                    const playerName = selectedPlayer.name;
                    const isStarter = selectedPlayerTeam.startingLineup?.some(s => s.playerId === playerId);
                    if (isStarter) { showToast("Cannot delete a starter. Move them to bench first.", "error"); return; }
                    setPromptModal({
                      kind: 'confirm', title: 'Delete Player',
                      message: `Permanently delete ${playerName}? This cannot be undone.`,
                      confirmLabel: 'Delete', danger: true,
                      onConfirm: () => {
                        setPromptModal(null);
                        setGameState((prev) => {
                          if (!prev) return prev;
                          return { ...prev, teams: prev.teams.map((t) => t.id === selectedPlayerTeam.id ? { ...t, roster: t.roster.filter(p => p.id !== playerId) } : t) };
                        });
                        setShowEditPlayerModal(false);
                        setView("team");
                        setSelectedTeamId(selectedPlayerTeam.id);
                        showToast(`${playerName} permanently deleted`, "success");
                      },
                      onCancel: () => setPromptModal(null),
                    });
                  } : undefined}
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
          {view === "news" && (
            <NewsFeed
              news={gameState.newsFeed ?? []}
              teams={gameState.teams}
              userRegion={userTeam?.region ?? 'americas'}
              filterRegion={newsFeedFilter}
              onFilterChange={setNewsFeedFilter}
            />
          )}
          {view === "records" && (
            <RecordsPage
              recordBook={migrateRecordBook(gameState.recordBook ?? {})}
              teams={gameState.teams}
              gameState={gameState}
            />
          )}
          {view === "progression" && gameState.offseasonProgression && (
            <ProgressionTable
              progression={gameState.offseasonProgression}
              teams={gameState.teams}
              freeAgents={gameState.freeAgents || []}
              userTeamId={gameState.userTeamId}
              churnEvents={gameState.offseasonChurnEvents}
              onRunChurn={() => {
                const churn = runOffseasonChurn(gameState.teams, gameState.freeAgents || [], gameState.kickoffBrackets, gameState.internationalTournament, gameState.userTeamId, `${gameState.seed}-churn-${gameState.currentYear}`, gameState.churnConfig);
                setGameState({ ...gameState, teams: churn.updatedTeams, freeAgents: churn.updatedFreeAgents, offseasonChurnEvents: churn.events });
              }}
              onViewPlayer={(playerId) => handleViewPlayer(playerId)}
              onViewTeam={(teamId) => { setSelectedTeamId(teamId); setView("team"); }}
            />
          )}
          {view === "agent-meta" && (
            <AgentMetaPage
              gameState={gameState}
              onUpdate={(agentMeta) => setGameState(prev => prev ? { ...prev, agentMeta } : prev)}
              onUpdateRoleOverrides={(overrides) => setGameState(prev => prev ? { ...prev, agentRoleOverrides: overrides } : prev)}
              onUpdateDisabled={(disabled) => setGameState(prev => prev ? { ...prev, disabledAgents: disabled } : prev)}
              onUpdateCustomAgents={(agents) => setGameState(prev => prev ? { ...prev, customAgents: agents } : prev)}
              onUpdateAbilities={(abilities) => setGameState(prev => prev ? { ...prev, agentAbilities: abilities } : prev)}
              devMode={devMode}
            />
          )}
          {view === "map-pool" && (
            <MapPoolPage
              gameState={gameState}
              onUpdate={(mapPool) => setGameState({ ...gameState, mapPool })}
              onUpdateMeta={(mapMeta) => setGameState({ ...gameState, mapMeta })}
              onUpdateVariance={(val) => setGameState({ ...gameState, agentVariance: val })}
              onUpdateCustomMapNames={(names) => setGameState({ ...gameState, customMapNames: names } as any)}
              agentRoleOverrides={gameState.agentRoleOverrides ?? {}}
              devMode={devMode}
            />
          )}
          {view === "switch-team" && (
            <SwitchTeamPage
              teams={gameState.teams}
              currentTeamId={gameState.userTeamId ?? ''}
              onSwitch={(teamId) => {
                handleSwitchTeam(teamId);
                setView("dashboard");
              }}
            />
          )}
          {view === "mass-editor" && (
            <MassPlayerEditor
              teams={gameState.teams}
              freeAgents={gameState.freeAgents || []}
              onUpdate={(nextTeams, nextFAs) => setGameState({ ...gameState, teams: nextTeams, freeAgents: nextFAs })}
            />
          )}
          {view === "sim-config" && (
            <SimConfigPage
              config={gameState.churnConfig ?? DEFAULT_CHURN_CONFIG}
              onChange={(cfg) => setGameState({ ...gameState, churnConfig: cfg })}
              matchSimConfig={gameState.matchSimConfig}
              onChangeMatchSim={(cfg) => setGameState({ ...gameState, matchSimConfig: cfg })}
              legacyAgentIcons={(gameState as any).legacyAgentIcons ?? []}
              onChangeLegacyIcons={(icons) => setGameState({ ...gameState, legacyAgentIcons: icons } as any)}
            />
          )}
          {view === "real-event" && (
            <RealEventPage
              gameState={gameState}
              onUpdateGameState={setGameState}
            />
          )}
          {view === "sandbox" && (
            <SandboxPage
              gameState={gameState}
              onNavigate={handleNavigate}
              config={sandboxConfig}
              onConfigChange={setSandboxConfig}
              onUpdateGameState={setGameState}
              onSimulate={(match, homeTeam, awayTeam) => {
                setSandboxTeams({ home: homeTeam, away: awayTeam });
                setSandboxMatch(match);
                setLiveSimMatch(match);
                watchingMatchupIdRef.current = match.id;
                setSuspendedSim(null);
                setPreviousView('sandbox');
                setView('live-sim');
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
              devMode={devMode}
              onAddAcademyTeam={handleAddAcademyTeam}
              onEditAcademyTeam={handleEditAcademyTeam}
              onDeleteAcademyTeam={handleDeleteAcademyTeam}
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
            <HistoryPage
              gameState={gameState}
              onNavigateToPlayer={handleViewPlayer}
              onNavigateToTeam={handleViewTeam}
              devMode={devMode}
              onUpdateGameState={setGameState}
            />
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

          {view === "live-sim" && liveSimMatch && (() => {
            const isSandbox = !!sandboxTeams && (liveSimMatch.homeTeamId === sandboxTeams.home.id || liveSimMatch.awayTeamId === sandboxTeams.away.id);
            const ht = isSandbox ? sandboxTeams!.home : gameState.teams.find(t => t.id === liveSimMatch.homeTeamId);
            const at = isSandbox ? sandboxTeams!.away : gameState.teams.find(t => t.id === liveSimMatch.awayTeamId);
            if (!ht || !at) return null;
            const resumeSession = suspendedSim?.matchupId === watchingMatchupIdRef.current
              ? suspendedSim.session : undefined;
            // build ability icon lookup from gameState overrides + data file defaults
            const abIcons: Record<string, string> = {};
            const abSources = { ...AGENT_ABILITIES, ...(gameState.agentAbilities ?? {}) };
            for (const abilities of Object.values(abSources)) {
              for (const ab of abilities) {
                if (ab.icon) abIcons[ab.id] = ab.icon;
              }
            }
            return (
              <LiveSimView
                match={liveSimMatch}
                homeTeam={ht}
                awayTeam={at}
                initialSession={resumeSession}
                abilityIcons={abIcons}
                agentAbilities={abSources}
                legacyAgentIcons={(gameState as any).legacyAgentIcons ?? []}
                onSessionUpdate={(session) => { liveSimSessionRef.current = session; }}
                onSuspend={(session) => {
                  setSuspendedSim({
                    matchupId: watchingMatchupIdRef.current!,
                    match: liveSimMatch,
                    session,
                  });
                  setLiveSimMatch(null);
                  setView(previousView);
                }}
                onBack={() => {
                  if (isSandbox) {
                    setLiveSimMatch(null);
                    setSuspendedSim(null);
                    setView('sandbox');
                  } else {
                    autoSimStagePlayoffStep(gameState);
                    setGameState({...gameState});
                    setSuspendedSim(null);
                    setLiveSimMatch(null);
                    setView(previousView);
                  }
                }}
                onViewFullMatch={(matchId) => {
                  if (isSandbox) {
                    // store sandbox match for match-detail view
                    setSandboxMatch(liveSimMatch);
                    setLiveSimMatch(null);
                    setSuspendedSim(null);
                    setSelectedMatchId(matchId);
                    setPreviousView('sandbox');
                    setView('match-detail');
                  } else {
                    autoSimStagePlayoffStep(gameState);
                    setGameState({...gameState});
                    setSuspendedSim(null);
                    setLiveSimMatch(null);
                    setSelectedMatchId(matchId);
                    setView('match-detail');
                  }
                }}
              />
            );
          })()}

          {view === "match-detail" && (
            <ErrorBoundary
              key={selectedMatchId ?? 'no-match'}
              onReset={() => setView(previousView === 'live-sim' ? 'dashboard' : previousView)}
            >
            {selectedScrimMatch ? (
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
                    allPlayers={[...gameState.teams.flatMap(t => t.roster), ...(gameState.freeAgents || [])]}
                    legacyAgentIcons={(gameState as any).legacyAgentIcons ?? []}
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
            ) : selectedMatchId ? (
            (() => {
              try {
              console.log('[match-detail] selectedMatchId:', selectedMatchId, 'previousView:', previousView, 'suspendedSim:', !!suspendedSim);
              // try sandbox match first, then normal lookup
              const isSandboxMatch = sandboxMatch?.id === selectedMatchId;
              const matchData = isSandboxMatch
                ? { result: sandboxMatch!, homeTeamId: sandboxMatch!.homeTeamId, awayTeamId: sandboxMatch!.awayTeamId }
                : findMatchResult(selectedMatchId);
              console.log('[match-detail] findMatchResult returned:', matchData ? 'found' : 'null', matchData ? { homeTeamId: matchData.homeTeamId, awayTeamId: matchData.awayTeamId } : '');
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
              const homeTeam = (isSandboxMatch && sandboxTeams) ? sandboxTeams.home : gameState.teams.find(
                (t) => t.id === matchData.homeTeamId
              );
              const awayTeam = (isSandboxMatch && sandboxTeams) ? sandboxTeams.away : gameState.teams.find(
                (t) => t.id === matchData.awayTeamId
              );
              console.log('[match-detail] homeTeam:', homeTeam?.name ?? 'NOT FOUND', 'awayTeam:', awayTeam?.name ?? 'NOT FOUND');
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

              // search stage group stages for match context (standings + seed)
              type GroupMatchContext = {
                groupName: string;
                matchday: number;
                groupSchedule: Array<{ homeTeamId: string; awayTeamId: string; played: boolean; result: any; matchday: number }>;
                groupTeams: Array<{ teamId: string; seed: number }>;
              };
              const findStageGroupContext = (): GroupMatchContext | null => {
                for (const region of ['americas', 'emea', 'pacific', 'china'] as const) {
                  const regionGs = (gameState as any).stageGroupStages?.[region];
                  if (!regionGs) continue;
                  for (const stageNum of [1, 2]) {
                    const gs = regionGs[stageNum];
                    if (!gs?.groups) continue;
                    for (const group of gs.groups) {
                      for (const gm of group.schedule) {
                        if (gm.id === selectedMatchId || gm.result?.id === selectedMatchId) {
                          return {
                            groupName: group.name?.toLowerCase() || 'alpha',
                            matchday: gm.matchday,
                            groupSchedule: group.schedule,
                            groupTeams: group.teams,
                          };
                        }
                      }
                    }
                  }
                }
                return null;
              };

              // search stage playoffs for match context — find each team's group for seed
              const findStagePlayoffContext = () => {
                for (const region of ['americas', 'emea', 'pacific', 'china'] as const) {
                  const regionBrackets = (gameState as any).stagePlayoffBrackets?.[region];
                  if (!regionBrackets) continue;
                  for (const stageNum of [1, 2]) {
                    const bracket = regionBrackets[stageNum];
                    if (!bracket) continue;
                    for (const rounds of [bracket.upper, bracket.lower]) {
                      if (!rounds) continue;
                      for (const round of rounds) {
                        for (const mu of round.matchups) {
                          if (mu.id === selectedMatchId || mu.matchResults?.some((r: any) => r.id === selectedMatchId)) {
                            // found in stage playoffs — look up group info from the stage group
                            const gs = (gameState as any).stageGroupStages?.[region]?.[stageNum];
                            return gs?.groups || null;
                          }
                        }
                      }
                    }
                  }
                }
                return null;
              };

              // compute group standings for a team up to a matchday
              const calcGroupStanding = (teamId: string, schedule: GroupMatchContext['groupSchedule'], upToDay: number) => {
                let wins = 0, losses = 0, mapWins = 0, mapLosses = 0, roundDiff = 0;
                for (const gm of schedule) {
                  if (!gm.played || !gm.result || gm.matchday > upToDay) continue;
                  if (gm.homeTeamId !== teamId && gm.awayTeamId !== teamId) continue;
                  const isHome = gm.homeTeamId === teamId;
                  const ts = isHome ? gm.result.homeScore : gm.result.awayScore;
                  const os = isHome ? gm.result.awayScore : gm.result.homeScore;
                  ts > os ? wins++ : losses++;
                  for (const ms of gm.result.mapScores || []) {
                    const tr = isHome ? ms.homeRounds : ms.awayRounds;
                    const or2 = isHome ? ms.awayRounds : ms.homeRounds;
                    tr > or2 ? mapWins++ : mapLosses++;
                    roundDiff += tr - or2;
                  }
                }
                return { teamId, wins, losses, mapWins, mapLosses, roundDifferential: roundDiff };
              };

              // resolve standings + seeds
              let homeStandingAtMatch = calculateStandingsAtDay(homeTeam.id, matchDay);
              let awayStandingAtMatch = calculateStandingsAtDay(awayTeam.id, matchDay);
              let homeSeedTag: { region: string; seed: number } | null = null;
              let awaySeedTag: { region: string; seed: number } | null = null;

              // stage group match: compute group standings + group seed
              const groupCtx = findStageGroupContext();
              if (groupCtx) {
                homeStandingAtMatch = calcGroupStanding(homeTeam.id, groupCtx.groupSchedule, groupCtx.matchday);
                awayStandingAtMatch = calcGroupStanding(awayTeam.id, groupCtx.groupSchedule, groupCtx.matchday);
                const homeGt = groupCtx.groupTeams.find(t => t.teamId === homeTeam.id);
                const awayGt = groupCtx.groupTeams.find(t => t.teamId === awayTeam.id);
                if (homeGt) homeSeedTag = { region: groupCtx.groupName, seed: homeGt.seed };
                if (awayGt) awaySeedTag = { region: groupCtx.groupName, seed: awayGt.seed };
              }

              // stage playoff match: use final group standings + group seed
              if (!groupCtx) {
                const playoffGroups = findStagePlayoffContext();
                if (playoffGroups) {
                  for (const group of playoffGroups) {
                    const homeGt = group.teams?.find((t: any) => t.teamId === homeTeam.id);
                    if (homeGt) {
                      homeSeedTag = { region: group.name?.toLowerCase() || 'alpha', seed: homeGt.seed };
                      homeStandingAtMatch = calcGroupStanding(homeTeam.id, group.schedule, 999);
                    }
                    const awayGt = group.teams?.find((t: any) => t.teamId === awayTeam.id);
                    if (awayGt) {
                      awaySeedTag = { region: group.name?.toLowerCase() || 'omega', seed: awayGt.seed };
                      awayStandingAtMatch = calcGroupStanding(awayTeam.id, group.schedule, 999);
                    }
                  }
                }
              }

              // international match: show region seed (regardless of previousView)
              const intlTeams = gameState.internationalTournament?.teams ?? [];
              const homeIntlTeam = intlTeams.find(t => t.teamId === homeTeam.id);
              const awayIntlTeam = intlTeams.find(t => t.teamId === awayTeam.id);
              if (homeIntlTeam) homeSeedTag = { region: homeIntlTeam.region, seed: homeIntlTeam.seed };
              if (awayIntlTeam) awaySeedTag = { region: awayIntlTeam.region, seed: awayIntlTeam.seed };

              // compute current-season H2H (prior to this match)
              const computeH2H = () => {
                const hId = homeTeam.id;
                const aId = awayTeam.id;
                const thisMatchId = matchData.result.id;
                let hWins = 0;
                let aWins = 0;

                const tally = (result: { id: string; homeScore: number; awayScore: number }, mHomeId: string, mAwayId: string) => {
                  if (result.id === thisMatchId) return;
                  const isHomeH = mHomeId === hId;
                  const teamScore = isHomeH ? result.homeScore : result.awayScore;
                  const oppScore = isHomeH ? result.awayScore : result.homeScore;
                  teamScore > oppScore ? hWins++ : aWins++;
                };

                const matchesBetween = (mHomeId: string, mAwayId: string) =>
                  (mHomeId === hId && mAwayId === aId) || (mHomeId === aId && mAwayId === hId);

                // regular schedule
                for (const sm of gameState.schedule) {
                  if (sm.played && sm.result && matchesBetween(sm.homeTeamId, sm.awayTeamId)) {
                    tally(sm.result, sm.homeTeamId, sm.awayTeamId);
                  }
                }

                // stage group stages
                for (const region of ['americas', 'emea', 'pacific', 'china'] as const) {
                  const rgs = (gameState as any).stageGroupStages?.[region];
                  if (!rgs) continue;
                  for (const sn of [1, 2]) {
                    const gs = rgs[sn];
                    if (!gs?.groups) continue;
                    for (const g of gs.groups) {
                      for (const gm of g.schedule) {
                        if (gm.played && gm.result && matchesBetween(gm.homeTeamId, gm.awayTeamId)) {
                          tally(gm.result, gm.homeTeamId, gm.awayTeamId);
                        }
                      }
                    }
                  }
                }

                // stage playoff brackets
                for (const region of ['americas', 'emea', 'pacific', 'china'] as const) {
                  const rb = (gameState as any).stagePlayoffBrackets?.[region];
                  if (!rb) continue;
                  for (const sn of [1, 2]) {
                    const bracket = rb[sn];
                    if (!bracket) continue;
                    for (const rounds of [bracket.upper, bracket.lower]) {
                      if (!rounds) continue;
                      for (const round of rounds) {
                        for (const mu of round.matchups) {
                          if (mu.team1Id && mu.team2Id && matchesBetween(mu.team1Id, mu.team2Id)) {
                            for (const mr of mu.matchResults || []) tally(mr, mu.team1Id, mu.team2Id);
                          }
                        }
                      }
                    }
                  }
                }

                // kickoff brackets
                for (const region of ['americas', 'emea', 'pacific', 'china'] as const) {
                  const bracket = gameState.kickoffBrackets?.[region];
                  if (!bracket) continue;
                  for (const section of [...(bracket.upper || []), ...(bracket.middle || []), ...(bracket.lower || [])]) {
                    for (const mu of section.matchups) {
                      if (mu.team1Id && mu.team2Id && matchesBetween(mu.team1Id, mu.team2Id)) {
                        for (const mr of mu.matchResults || []) tally(mr, mu.team1Id, mu.team2Id);
                      }
                    }
                  }
                }

                // international tournament
                if (gameState.internationalTournament?.bracket) {
                  const b = gameState.internationalTournament.bracket;
                  for (const round of [...b.swiss.rounds, ...b.upper, ...b.lower]) {
                    for (const mu of round.matchups) {
                      if (mu.team1Id && mu.team2Id && matchesBetween(mu.team1Id, mu.team2Id)) {
                        for (const mr of mu.matchResults || []) tally(mr, mu.team1Id, mu.team2Id);
                      }
                    }
                  }
                }

                return { homeWins: hWins, awayWins: aWins };
              };

              const h2h = computeH2H();

              return (
                <MatchDetailView
                  match={matchData.result}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  homeStanding={isSandboxMatch ? undefined : homeStandingAtMatch}
                  awayStanding={isSandboxMatch ? undefined : awayStandingAtMatch}
                  homeSeed={isSandboxMatch ? undefined : homeSeedTag}
                  awaySeed={isSandboxMatch ? undefined : awaySeedTag}
                  h2h={isSandboxMatch ? undefined : h2h}
                  allPlayers={isSandboxMatch && sandboxTeams
                    ? [...sandboxTeams.home.roster, ...sandboxTeams.away.roster]
                    : [...gameState.teams.flatMap(t => t.roster), ...(gameState.freeAgents || [])]
                  }
                  legacyAgentIcons={(gameState as any).legacyAgentIcons ?? []}
                  onBack={() => {
                    if (isSandboxMatch) {
                      setView('sandbox');
                    } else {
                      setView(previousView);
                    }
                  }}
                  onViewPlayer={(playerId) => {
                    setSelectedPlayerId(playerId);
                    setPreviousView("match-detail");
                    setView("player");
                  }}
                />
              );
              } catch (err) {
                console.error('[match-detail] Render error:', err);
                return (
                  <div className="panel">
                    <div className="panel-body">
                      <p style={{ color: "var(--text-muted)" }}>
                        Something went wrong loading this match.{" "}
                        <button className="link-btn" onClick={() => setView(previousView === 'live-sim' ? 'dashboard' : previousView)}>
                          Go back
                        </button>
                      </p>
                      <pre style={{ fontSize: 11, color: 'var(--text-dark)', marginTop: 8 }}>{String(err)}</pre>
                    </div>
                  </div>
                );
              }
            })()) : (
              <div className="panel">
                <div className="panel-body">
                  <p style={{ color: "var(--text-muted)" }}>
                    No match selected.{" "}
                    <button className="link-btn" onClick={() => setView(previousView === 'live-sim' ? 'dashboard' : previousView)}>
                      Go back
                    </button>
                  </p>
                </div>
              </div>
            )}
            </ErrorBoundary>
          )}

          {view === "roster-management" && (() => {
            // In dev mode, manage the selected team; otherwise manage user's team
            const managedTeam = devMode && selectedTeamId 
              ? gameState.teams.find(t => t.id === selectedTeamId) 
              : userTeam;
            
            if (!managedTeam) return null;
            
            return (
              <RosterManagementPage
                team={managedTeam}
                agentVariance={gameState.agentVariance ?? 15}
                onUpdateAgentVariance={(val) => setGameState({ ...gameState, agentVariance: val })}
                mapPool={managedTeam.id === gameState.userTeamId ? gameState.mapPool : undefined}
                customMapNames={(gameState as any).customMapNames ?? []}
                userMapComp={gameState.teamMapComps?.[managedTeam.id] ?? {}}
                onUpdateUserMapComp={(comp) => setGameState({ ...gameState, teamMapComps: { ...(gameState.teamMapComps ?? {}), [managedTeam.id]: comp } })}
                agentRoleOverrides={gameState.agentRoleOverrides ?? {}}
                disabledAgents={gameState.disabledAgents ?? []}
                userMapCompNoPenalty={gameState.teamMapCompNoPenalty?.[managedTeam.id] ?? {}}
                onUpdateUserMapCompNoPenalty={(np) => setGameState({ ...gameState, teamMapCompNoPenalty: { ...(gameState.teamMapCompNoPenalty ?? {}), [managedTeam.id]: np } })}
                teamMapCompBuffs={gameState.teamMapCompBuffs?.[managedTeam.id] ?? {}}
                onUpdateTeamMapCompBuffs={(buffs) => setGameState({ ...gameState, teamMapCompBuffs: { ...(gameState.teamMapCompBuffs ?? {}), [managedTeam.id]: buffs } })}
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
                onReleasePlayer={(playerId) => {
                  handleReleasePlayer(playerId);
                  showToast("Player released to free agency", "success");
                }}
                onDeletePlayer={(playerId) => {
                  if (!gameState) return;
                  const player = managedTeam.roster.find(p => p.id === playerId);
                  const playerName = player?.name ?? 'this player';
                  setPromptModal({
                    kind: 'confirm', title: 'Delete Player',
                    message: `Permanently delete ${playerName}? This cannot be undone.`,
                    confirmLabel: 'Delete', danger: true,
                    onConfirm: () => {
                      setPromptModal(null);
                      setGameState((prev) => {
                        if (!prev) return prev;
                        return { ...prev, teams: prev.teams.map((t) => t.id === managedTeam.id ? { ...t, roster: t.roster.filter(p => p.id !== playerId) } : t) };
                      });
                      showToast(`${playerName} permanently deleted`, "success");
                    },
                    onCancel: () => setPromptModal(null),
                  });
                }}
                isDevMode={devMode}
                isUserTeam={managedTeam.id === gameState.userTeamId}
                freeAgentCoaches={gameState.freeAgentCoaches ?? []}
                onHireCoach={(coachId) => hireCoach(coachId)}
                onFireCoach={() => fireCoach()}
                onSaveCoach={(coach) => {
                  const updatedTeams = gameState.teams.map(t =>
                    t.id === managedTeam.id
                      ? { ...t, staff: { ...t.staff, headCoach: coach }, attributes: calculateTeamAttributes(t.roster, t.startingLineup, coach.rating, coach.specialty, staffFromTeam({ ...t.staff, headCoach: coach })) }
                      : t
                  );
                  setGameState({ ...gameState, teams: updatedTeams });
                }}
                onHireAssistant={(coachId) => hireAssistant(coachId)}
                onFireAssistant={() => fireAssistant()}
                onSaveAssistant={(coach) => {
                  const updatedTeams = gameState.teams.map(t =>
                    t.id === managedTeam.id
                      ? { ...t, staff: { ...t.staff, assistantCoach: coach }, attributes: calculateTeamAttributes(t.roster, t.startingLineup, t.staff.headCoach?.rating, t.staff.headCoach?.specialty, staffFromTeam({ ...t.staff, assistantCoach: coach })) }
                      : t
                  );
                  setGameState({ ...gameState, teams: updatedTeams });
                }}
                onHireAnalyst={(coachId) => hireAnalyst(coachId)}
                onFireAnalyst={() => fireAnalyst()}
                onSaveAnalyst={(coach) => {
                  const updatedTeams = gameState.teams.map(t =>
                    t.id === managedTeam.id
                      ? { ...t, staff: { ...t.staff, analyst: coach }, attributes: calculateTeamAttributes(t.roster, t.startingLineup, t.staff.headCoach?.rating, t.staff.headCoach?.specialty, staffFromTeam({ ...t.staff, analyst: coach })) }
                      : t
                  );
                  setGameState({ ...gameState, teams: updatedTeams });
                }}
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
                const fa = (gameState?.freeAgents || []).find(p => p.id === playerId);
                const faName = fa?.name ?? 'this free agent';
                setPromptModal({
                  kind: 'confirm', title: 'Delete Free Agent',
                  message: `Permanently delete ${faName}? This cannot be undone.`,
                  confirmLabel: 'Delete', danger: true,
                  onConfirm: () => {
                    setPromptModal(null);
                    setGameState(prev => {
                      if (!prev) return prev;
                      return { ...prev, freeAgents: (prev.freeAgents || []).filter(p => p.id !== playerId) };
                    });
                  },
                  onCancel: () => setPromptModal(null),
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
        
        const { regional, tier2 } = getAvailableScrimOpponents(userTeam, gameState.teams, [], gameState.customTier2Teams);
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

      {/* PWA Update Prompt */}
      <PWAUpdatePrompt />

      {promptModal && (
        <AppModal {...promptModal} />
      )}
    </div>
  );
}