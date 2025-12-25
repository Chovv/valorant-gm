// src/App.tsx
// Refactored to use Zustand stores for state management

import { useEffect } from "react";
import { useGameStore, useUIStore } from "./stores";
import type { Region, Player, Team } from "./types";
import type { ScheduledMatch } from "./sim/gameState";
import { getRolePenalty } from "./types/roster";
import { calculateEffectiveOverallWithIGL } from "./sim/iglBonus";

// Components
import {
  Dashboard,
  TeamView,
  Sidebar,
  MatchDetailView,
  LeagueEditor,
} from "./ui/components";
import {
  PlayoffBracket as PlayoffBracketView,
  InternationalBracket as InternationalBracketView,
} from "./ui/components/PlayoffBracket";
import { PlayerStatsTable } from "./ui/components/PlayerStatsTable";
import { PlayersPage } from "./ui/components/PlayersPage";
import { PowerRankingsPage } from "./ui/components/PowerRankingsPage";
import { MatchToastContainer } from "./ui/components/MatchToast";
import { RosterManagementPage } from "./ui/components/RosterManagementPage";
import { FreeAgencyPage } from "./ui/FreeAgencyPage";
import { TradePage } from "./ui/components/TradePage";
import { PlayerEditModal } from "./ui/components/PlayerEditModal";
import { toLetterGrade, getGradeClass } from "./utils/letterGrade";
import { ALL_ARCHETYPES } from './data/archetypes';
import "./App.css";

// Constants
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

// Helper to get effective OVR for a player
function getPlayerEffectiveOVR(player: Player, team: Team) {
  if (!team.startingLineup) {
    return {
      effectiveOvr: player.overall,
      baseOvr: player.overall,
      rolePenalty: 0,
      iglBonus: 0,
      isStarter: false,
      assignedRole: player.role,
    };
  }

  const lineupSlot = team.startingLineup.find(s => s.playerId === player.id);
  if (lineupSlot) {
    const penalty = getRolePenalty(player.role, lineupSlot.assignedRole);
    const result = calculateEffectiveOverallWithIGL(player, team, team.startingLineup, -penalty);

    return {
      effectiveOvr: result.effectiveOvr,
      baseOvr: result.baseOvr,
      rolePenalty: result.rolePenalty,
      iglBonus: result.iglBonus,
      isStarter: true,
      assignedRole: lineupSlot.assignedRole,
    };
  }

  return {
    effectiveOvr: player.overall,
    baseOvr: player.overall,
    rolePenalty: 0,
    iglBonus: 0,
    isStarter: false,
    assignedRole: player.role,
  };
}

export default function App() {
  // Game store
  const gameState = useGameStore(s => s.gameState);
  const saves = useGameStore(s => s.saves);
  const recentResults = useGameStore(s => s.recentResults);
  const matchToasts = useGameStore(s => s.matchToasts);
  const notificationToast = useGameStore(s => s.notificationToast);
  const setupTeams = useGameStore(s => s.setupTeams);
  const setupSelectedTeamId = useGameStore(s => s.setupSelectedTeamId);
  
  // Game actions
  const initSaves = useGameStore(s => s.initSaves);
  const startNewGame = useGameStore(s => s.startNewGame);
  const confirmSetup = useGameStore(s => s.confirmSetup);
  const setSetupSelectedTeamId = useGameStore(s => s.setSetupSelectedTeamId);
  const advanceDayAction = useGameStore(s => s.advanceDay);
  const simToNextMatchup = useGameStore(s => s.simToNextMatchup);
  const skipToPlayoffsAction = useGameStore(s => s.skipToPlayoffs);
  const simToChampions = useGameStore(s => s.simToChampions);
  const saveGameAction = useGameStore(s => s.saveGame);
  const loadGameAction = useGameStore(s => s.loadGame);
  const deleteGame = useGameStore(s => s.deleteGame);
  const importLeague = useGameStore(s => s.importLeague);
  const exportLeague = useGameStore(s => s.exportLeague);
  const exportTeamConfigs = useGameStore(s => s.exportTeamConfigs);
  const updateLineup = useGameStore(s => s.updateLineup);
  const signFreeAgentAction = useGameStore(s => s.signFreeAgent);
  const releasePlayerAction = useGameStore(s => s.releasePlayer);
  const savePlayer = useGameStore(s => s.savePlayer);
  const setIGL = useGameStore(s => s.setIGL);
  const executeTradeAction = useGameStore(s => s.executeTrade);
  const startFromEditor = useGameStore(s => s.startFromEditor);
  const dismissToast = useGameStore(s => s.dismissToast);
  const clearNotificationToast = useGameStore(s => s.clearNotificationToast);

  // UI store
  const screen = useUIStore(s => s.screen);
  const view = useUIStore(s => s.view);
  const selectedTeamId = useUIStore(s => s.selectedTeamId);
  const selectedPlayerId = useUIStore(s => s.selectedPlayerId);
  const selectedMatchId = useUIStore(s => s.selectedMatchId);
  const selectedRegion = useUIStore(s => s.selectedRegion);
  const showEditPlayerModal = useUIStore(s => s.showEditPlayerModal);
  const devMode = useUIStore(s => s.devMode);
  
  // UI actions
  const setScreen = useUIStore(s => s.setScreen);
  const navigate = useUIStore(s => s.navigate);
  const setView = useUIStore(s => s.setView);
  const goBack = useUIStore(s => s.goBack);
  const setSelectedTeamId = useUIStore(s => s.setSelectedTeamId);
  const setSelectedRegion = useUIStore(s => s.setSelectedRegion);
  const openEditPlayerModal = useUIStore(s => s.openEditPlayerModal);
  const closeEditPlayerModal = useUIStore(s => s.closeEditPlayerModal);
  const toggleDevMode = useUIStore(s => s.toggleDevMode);
  const viewTeam = useUIStore(s => s.viewTeam);
  const viewPlayer = useUIStore(s => s.viewPlayer);
  const viewMatch = useUIStore(s => s.viewMatch);
  const viewNextTeam = useUIStore(s => s.viewNextTeam);
  const viewPrevTeam = useUIStore(s => s.viewPrevTeam);
  const resetForNewGame = useUIStore(s => s.resetForNewGame);

  // Initialize saves on mount
  useEffect(() => {
    initSaves();
  }, [initSaves]);

  // Auto-dismiss notification toast
  useEffect(() => {
    if (notificationToast) {
      const timer = setTimeout(() => clearNotificationToast(), 3000);
      return () => clearTimeout(timer);
    }
  }, [notificationToast, clearNotificationToast]);

  // Handle start new game
  const handleStartSetup = () => {
    startNewGame();
    setScreen("setup");
  };

  // Handle confirm setup
  const handleConfirmSetup = () => {
    confirmSetup();
    const team = setupTeams.find(t => t.id === setupSelectedTeamId);
    if (team && setupSelectedTeamId) {
      resetForNewGame(setupSelectedTeamId, team.region);
    }
  };

  // Handle import league
  const handleImportLeague = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await importLeague(file);
      const gs = useGameStore.getState().gameState;
      if (gs && gs.userTeamId) {
        const userTeam = gs.teams.find(t => t.id === gs.userTeamId);
        if (userTeam) {
          resetForNewGame(gs.userTeamId, userTeam.region);
        }
      }
    } catch {
      // Error handled in store
    }

    event.target.value = '';
  };

  // Handle load game
  const handleLoad = async (id: string) => {
    await loadGameAction(id);
    const gs = useGameStore.getState().gameState;
    if (gs && gs.userTeamId) {
      const userTeam = gs.teams.find(t => t.id === gs.userTeamId);
      if (userTeam) {
        resetForNewGame(gs.userTeamId, userTeam.region);
      }
    }
  };

  // Handle navigate
  const handleNavigate = (newView: typeof view, teamId?: string) => {
    navigate(newView, teamId);
    if (newView === "roster" && gameState) {
      setSelectedTeamId(gameState.userTeamId);
    }
  };

  // Find match result helper
  const findMatchResult = (matchId: string) => {
    if (!gameState) return null;

    // Check regular season schedule
    for (const scheduleMatch of gameState.schedule) {
      if (scheduleMatch.result) {
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

    // Check international tournament
    if (gameState.internationalTournament?.bracket) {
      for (const round of gameState.internationalTournament.bracket.rounds) {
        for (const matchup of round.matchups) {
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

    return null;
  };

  // Calculate standings at a specific day
  const calculateStandingsAtDay = (teamId: string, upToDay: number | undefined) => {
    if (!gameState) return undefined;
    if (upToDay === undefined) {
      return gameState.standings.find(s => s.teamId === teamId);
    }

    let wins = 0, losses = 0, mapWins = 0, mapLosses = 0, roundDiff = 0;

    for (const match of gameState.schedule) {
      if (!match.played || !match.result || match.day > upToDay) continue;
      if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) continue;

      const isHome = match.homeTeamId === teamId;
      const teamScore = isHome ? match.result.homeScore : match.result.awayScore;
      const oppScore = isHome ? match.result.awayScore : match.result.homeScore;

      if (teamScore > oppScore) wins++;
      else losses++;

      for (const mapScore of match.result.mapScores || []) {
        const teamRounds = isHome ? mapScore.homeRounds : mapScore.awayRounds;
        const oppRounds = isHome ? mapScore.awayRounds : mapScore.homeRounds;
        if (teamRounds > oppRounds) mapWins++;
        else mapLosses++;
        roundDiff += teamRounds - oppRounds;
      }
    }

    return { teamId, wins, losses, mapWins, mapLosses, roundDifferential: roundDiff };
  };

  // Derived state
  const selectedTeam = gameState?.teams.find((t) => t.id === selectedTeamId);
  const userTeam = gameState?.teams.find((t) => t.id === gameState.userTeamId);
  const selectedPlayer = gameState?.teams
    .flatMap((t) => t.roster)
    .find((p) => p.id === selectedPlayerId);
  const selectedPlayerTeam = gameState?.teams.find((t) =>
    t.roster.some((p) => p.id === selectedPlayerId)
  );

  // Get teams by region helper
  const getTeamsByRegion = (region: Region): Team[] => {
    if (setupTeams.length > 0) {
      return setupTeams.filter(t => t.region === region);
    }
    if (gameState) {
      return gameState.teams.filter(t => t.region === region);
    }
    return [];
  };

  // ============================================
  // RENDER: Welcome Screen
  // ============================================
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
            style={{ marginTop: "12px", background: "var(--bg-hover)", border: "1px solid var(--border)" }}
          >
            ✏️ Create Custom League
          </button>
          <label
            className="btn-start"
            style={{ marginTop: "12px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", cursor: "pointer", display: "inline-block" }}
          >
            📥 Import League JSON
            <input type="file" accept=".json" onChange={handleImportLeague} style={{ display: "none" }} />
          </label>
          {saves.length > 0 && (
            <div className="saves-list-welcome">
              <h3>Or continue a saved game:</h3>
              {saves.map((save) => (
                <div key={save.id} className="save-item-welcome">
                  <div className="save-info">
                    <span className="save-name">{save.name}</span>
                    <span className="save-details">
                      Day {save.gameState.currentDay} • {save.gameState.phase.replace("_", " ")}
                    </span>
                  </div>
                  <div>
                    <button onClick={() => handleLoad(save.id)}>Load</button>
                    <button className="delete" onClick={() => deleteGame(save.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: League Editor Screen
  // ============================================
  if (screen === "editor") {
    return (
      <div className="app">
        <div style={{ padding: "24px", maxWidth: "1400px", margin: "0 auto" }}>
          <LeagueEditor
            onSaveLeague={(teams) => {
              startFromEditor(teams);
              const team = teams[0];
              if (team) {
                resetForNewGame(team.id, team.region);
              }
            }}
            onCancel={() => setScreen("welcome")}
          />
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: Setup Screen
  // ============================================
  if (screen === "setup") {
    const regions: Region[] = ["americas", "emea", "pacific", "china"];
    const setupRegionTeams = getTeamsByRegion(selectedRegion);

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
                  className={`region-btn ${selectedRegion === region ? "active" : ""}`}
                  onClick={() => {
                    setSelectedRegion(region);
                    setSetupSelectedTeamId(null);
                  }}
                >
                  {REGION_NAMES[region]}
                  <span className="region-team-count">{getTeamsByRegion(region).length} teams</span>
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
                  className={`team-select-card ${setupSelectedTeamId === team.id ? "selected" : ""}`}
                  onClick={() => setSetupSelectedTeamId(team.id)}
                >
                  <img src={team.logo} alt={team.name} className="team-select-logo" />
                  <div className="team-select-info">
                    <span className="team-select-name">{team.name}</span>
                    <span className="team-select-abbr">{team.abbreviation}</span>
                  </div>
                  <div className="team-select-stats">
                    <span>FP: {team.attributes.firepower}</span>
                    <span>OVR: {Math.round(team.roster.reduce((s, p) => s + p.overall, 0) / team.roster.length)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="setup-actions">
            <button className="btn-back" onClick={() => setScreen("welcome")}>← Back</button>
            <button className="btn-start-game" onClick={handleConfirmSetup} disabled={!setupSelectedTeamId}>
              Start Game →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: Main Game Screen
  // ============================================
  if (!gameState) return null;

  const currentRegionPlayoff = gameState.regionalPlayoffs[selectedRegion];

  return (
    <div className="app">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="top-bar-logo">🎮 ValorantGM</div>
        <div className="top-bar-info">
          <span className="top-bar-phase">{gameState.phase.replace("_", " ").toUpperCase()}</span>
          <span>Day {gameState.currentDay}</span>
          <span>Season {gameState.currentYear}</span>
          {userTeam && (
            <span style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: "6px" }}>
              {userTeam.logo && <img src={userTeam.logo} alt="" style={{ width: "20px", height: "20px", objectFit: "contain" }} />}
              {userTeam.name}
            </span>
          )}
        </div>
        <div className="top-bar-actions">
          <div className="simulate-dropdown">
            <button className="btn btn-skip" title="Simulate to a specific point">⏭ Simulate To ▾</button>
            <div className="simulate-dropdown-content">
              <div className="simulate-dropdown-menu">
                <button onClick={skipToPlayoffsAction} disabled={gameState.phase !== "preseason" && gameState.phase !== "regular_season"}>
                  🏆 Regional Playoffs
                  <span className="simulate-desc">Skip regular season</span>
                </button>
                <button onClick={simToChampions} disabled={gameState.phase === 'international'}>
                  🌍 VALORANT Champions
                  <span className="simulate-desc">Skip to international tournament</span>
                </button>
              </div>
            </div>
          </div>
          <button className="btn btn-play" onClick={advanceDayAction}>▶ Play Day</button>
          <button className="btn btn-sim-next" onClick={simToNextMatchup} title="Simulate until your team plays">⏩ Sim to Next</button>
          <button className="btn btn-save" onClick={saveGameAction}>💾 Save</button>
          <div className="export-dropdown">
            <button className="btn btn-export" title="Export league data">📤 Export ▾</button>
            <div className="export-dropdown-content">
              <div className="export-dropdown-menu">
                <button onClick={exportLeague}>
                  📋 Full League Export
                  <span className="export-desc">All data including stats & history</span>
                </button>
                <button onClick={exportTeamConfigs}>
                  ⚙️ Team Configs Only
                  <span className="export-desc">Clean format for editing teams.ts</span>
                </button>
                <button className={`dev-mode-toggle ${devMode ? 'active' : ''}`} onClick={toggleDevMode}>
                  <div className="toggle-label">
                    🔧 Dev Mode
                    <span className="export-desc">Edit any player on any team</span>
                  </div>
                  <div className="toggle-switch"></div>
                </button>
              </div>
            </div>
          </div>
          {devMode && <span className="dev-mode-badge">DEV</span>}
        </div>
      </div>

      {/* Main Layout */}
      <div className="main-layout">
        <Sidebar
          gameState={gameState}
          currentView={view}
          onNavigate={handleNavigate}
          selectedRegion={selectedRegion}
          onRegionChange={setSelectedRegion}
        />

        <main className="content">
          {/* Dashboard */}
          {view === "dashboard" && (
            <>
              <div className="content-header">
                <h1>{userTeam?.name} Dashboard</h1>
                <span className="team-badge">YOUR TEAM</span>
                <button
                  className="manage-roster-btn"
                  onClick={() => setView("roster-management")}
                  style={{ marginLeft: "auto", padding: "8px 16px", background: "linear-gradient(135deg, #ff4655, #ff6b6b)", border: "none", borderRadius: "6px", color: "white", fontWeight: 600, cursor: "pointer" }}
                >
                  ⚙️ Manage Lineup
                </button>
              </div>
              <Dashboard
                gameState={gameState}
                onViewTeam={viewTeam}
                onViewMatch={viewMatch}
                recentResults={recentResults}
                regionLogos={REGION_LOGOS}
              />
            </>
          )}

          {/* Standings */}
          {view === "standings" && (
            <>
              <div className="content-header">
                <img src={REGION_LOGOS[selectedRegion]} alt="" className="region-header-logo" />
                <h1>{REGION_NAMES[selectedRegion]} Standings</h1>
              </div>
              <div className="region-tabs">
                {(["americas", "emea", "pacific", "china"] as Region[]).map((region) => (
                  <button key={region} className={`region-tab ${selectedRegion === region ? "active" : ""}`} onClick={() => setSelectedRegion(region)}>
                    <img src={REGION_LOGOS[region]} alt="" className="region-tab-logo" />
                    {REGION_NAMES[region]}
                  </button>
                ))}
              </div>
              <div className="panel">
                <div className="panel-body" style={{ padding: 0 }}>
                  <table className="standings-table">
                    <thead>
                      <tr><th></th><th>Team</th><th>W</th><th>L</th><th>Map W</th><th>Map L</th><th>RD</th></tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const regionStandings = [...gameState.standings]
                          .filter((s) => gameState.teams.find((t) => t.id === s.teamId)?.region === selectedRegion)
                          .sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : b.mapWins - b.mapLosses - (a.mapWins - a.mapLosses));
                        const playoffsStarted = gameState.phase === 'regional_playoffs' || gameState.phase === 'international' || gameState.regionalPlayoffs[selectedRegion] !== null;

                        return regionStandings.map((entry, idx) => {
                          const team = gameState.teams.find((t) => t.id === entry.teamId);
                          const isUser = entry.teamId === gameState.userTeamId;
                          const madePlayoffs = idx < 6;
                          const eliminated = idx >= 6;
                          let clinchIndicator = null;
                          if (playoffsStarted) {
                            if (madePlayoffs) clinchIndicator = <span className="clinch-indicator clinched" title="Clinched playoffs">x</span>;
                            else if (eliminated) clinchIndicator = <span className="clinch-indicator eliminated" title="Eliminated">z</span>;
                          }

                          return (
                            <tr key={entry.teamId} className={eliminated && playoffsStarted ? 'eliminated-row' : ''}>
                              <td className="rank">{idx + 1}</td>
                              <td>
                                <span className={`team-name-with-logo ${isUser ? "user-team" : ""}`} onClick={() => viewTeam(entry.teamId)}>
                                  {clinchIndicator}
                                  <img src={team?.logo} alt="" className="standings-team-logo" />
                                  {team?.name}
                                </span>
                              </td>
                              <td className="record">{entry.wins}</td>
                              <td className="record">{entry.losses}</td>
                              <td className="record">{entry.mapWins}</td>
                              <td className="record">{entry.mapLosses}</td>
                              <td className="record">{entry.roundDifferential >= 0 ? "+" : ""}{entry.roundDifferential}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Schedule */}
          {view === "schedule" && (
            <>
              <div className="content-header">
                <img src={REGION_LOGOS[selectedRegion]} alt="" className="region-header-logo" />
                <h1>{REGION_NAMES[selectedRegion]} Schedule</h1>
              </div>
              <div className="region-tabs">
                {(["americas", "emea", "pacific", "china"] as Region[]).map((region) => (
                  <button key={region} className={`region-tab ${selectedRegion === region ? "active" : ""}`} onClick={() => setSelectedRegion(region)}>
                    <img src={REGION_LOGOS[region]} alt="" className="region-tab-logo" />
                    {REGION_NAMES[region]}
                  </button>
                ))}
              </div>
              <div className="panel">
                <div className="panel-body">
                  <div className="schedule-list">
                    {gameState.schedule.filter((match: ScheduledMatch) => match.region === selectedRegion).map((match: ScheduledMatch) => {
                      const home = gameState.teams.find((t) => t.id === match.homeTeamId);
                      const away = gameState.teams.find((t) => t.id === match.awayTeamId);
                      const isUserMatch = match.homeTeamId === gameState.userTeamId || match.awayTeamId === gameState.userTeamId;
                      const isClickable = match.played && match.result;
                      return (
                        <div key={match.id} className={`schedule-item ${isClickable ? "clickable" : ""}`} onClick={() => { if (isClickable) viewMatch(match.id); }}>
                          <span className="schedule-day">Day {match.day}</span>
                          <span className="schedule-matchup">
                            <span className={`schedule-team ${match.homeTeamId === gameState.userTeamId ? "user-team" : ""}`}>
                              <img src={home?.logo} alt="" className="schedule-team-logo" />{home?.abbreviation}
                            </span>
                            <span className="vs">vs</span>
                            <span className={`schedule-team ${match.awayTeamId === gameState.userTeamId ? "user-team" : ""}`}>
                              <img src={away?.logo} alt="" className="schedule-team-logo" />{away?.abbreviation}
                            </span>
                          </span>
                          {match.played && match.result ? (
                            <span className={`schedule-result ${isUserMatch ? (match.homeTeamId === gameState.userTeamId ? (match.result.homeScore > match.result.awayScore ? "win" : "loss") : (match.result.awayScore > match.result.homeScore ? "win" : "loss")) : ""}`}>
                              {match.result.homeScore}-{match.result.awayScore}
                            </span>
                          ) : (
                            <span className="schedule-result">-</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Playoffs */}
          {view === "playoffs" && (
            <>
              <div className="content-header">
                <img src={REGION_LOGOS[selectedRegion]} alt="" className="region-header-logo" />
                <h1>{REGION_NAMES[selectedRegion]} Regional Playoffs</h1>
              </div>
              <div className="region-tabs">
                {(["americas", "emea", "pacific", "china"] as Region[]).map((region) => (
                  <button key={region} className={`region-tab ${selectedRegion === region ? "active" : ""}`} onClick={() => setSelectedRegion(region)}>
                    <img src={REGION_LOGOS[region]} alt="" className="region-tab-logo" />
                    {REGION_NAMES[region]}
                    {gameState.regionalChampions[region] && " 🏆"}
                  </button>
                ))}
              </div>
              {currentRegionPlayoff ? (
                <PlayoffBracketView
                  bracket={currentRegionPlayoff}
                  teams={gameState.teams}
                  regionChampion={gameState.regionalChampions[selectedRegion]}
                  playoffSeeds={(() => {
                    const regionTeamIds = new Set(gameState.teams.filter((t) => t.region === selectedRegion).map((t) => t.id));
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
                    regionStandings.slice(0, 6).forEach((s, idx) => seedMap.set(s.teamId, idx + 1));
                    return seedMap;
                  })()}
                  onMatchClick={viewMatch}
                />
              ) : (
                <div className="panel">
                  <div className="panel-body">
                    <p style={{ color: "var(--text-muted)" }}>
                      {gameState.phase === "regular_season" ? "Playoffs have not started yet. Complete the regular season first." : "No playoff bracket for this region."}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* International */}
          {view === "international" && (
            <>
              <div className="content-header"><h1>🌍 VALORANT Champions</h1></div>
              {gameState.internationalTournament ? (
                <>
                  <div className="panel" style={{ marginBottom: "16px" }}>
                    <div className="panel-header">Qualified Teams</div>
                    <div className="panel-body">
                      <div className="qualified-teams-grid">
                        {(["americas", "emea", "pacific", "china"] as Region[]).map((region) => (
                          <div key={region} className="qualified-region">
                            <h4 className="qualified-region-title">
                              <img src={REGION_LOGOS[region]} alt="" className="qualified-region-logo" />
                              {REGION_NAMES[region]}
                            </h4>
                            <div className="qualified-teams-list">
                              {gameState.internationalTournament!.teams.filter((t) => t.region === region).sort((a, b) => a.seed - b.seed).map((qualifiedTeam) => {
                                const team = gameState.teams.find((t) => t.id === qualifiedTeam.teamId);
                                return (
                                  <div key={qualifiedTeam.teamId} className={`qualified-team ${qualifiedTeam.teamId === gameState.userTeamId ? "user-team" : ""}`} onClick={() => viewTeam(qualifiedTeam.teamId)}>
                                    <span className="qualified-seed">#{qualifiedTeam.seed}</span>
                                    <img src={team?.logo} alt="" className="qualified-team-logo" />
                                    <span>{team?.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <InternationalBracketView
                    bracket={gameState.internationalTournament.bracket}
                    teams={gameState.teams}
                    champion={gameState.internationalTournament.champion}
                    qualifiedTeams={gameState.internationalTournament.teams}
                    onMatchClick={viewMatch}
                  />
                </>
              ) : (
                <div className="panel">
                  <div className="panel-body">
                    <p style={{ color: "var(--text-muted)" }}>VALORANT Champions has not started yet. Complete all regional playoffs first.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Power Rankings */}
          {view === "power-rankings" && (
            <PowerRankingsPage 
              teams={gameState.teams} 
              standings={gameState.standings}
              schedule={gameState.schedule}
              userTeamId={gameState.userTeamId}
              onViewTeam={viewTeam} 
              onViewPlayer={viewPlayer}
            />
          )}

          {/* All Players */}
          {view === "players" && (
            <PlayersPage teams={gameState.teams} onViewPlayer={viewPlayer} onViewTeam={viewTeam} />
          )}

          {/* Roster (Your Team) */}
          {view === "roster" && userTeam && (
            <TeamView
              team={userTeam}
              teams={gameState.teams}
              standings={gameState.standings}
              schedule={gameState.schedule}
              isUserTeam={true}
              onBack={() => setView("dashboard")}
              onViewPlayer={viewPlayer}
              onViewMatch={viewMatch}
              onNextTeam={() => viewNextTeam(gameState.teams)}
              onPrevTeam={() => viewPrevTeam(gameState.teams)}
              onSetIGL={(playerId) => setIGL(userTeam.id, playerId)}
              onManageRoster={() => setView("roster-management")}
              devMode={devMode}
            />
          )}

          {/* Team View */}
          {view === "team" && selectedTeam && (
            <TeamView
              team={selectedTeam}
              teams={gameState.teams}
              standings={gameState.standings}
              schedule={gameState.schedule}
              isUserTeam={selectedTeam.id === gameState.userTeamId}
              onBack={() => setView("dashboard")}
              onViewPlayer={viewPlayer}
              onViewMatch={viewMatch}
              onNextTeam={() => viewNextTeam(gameState.teams)}
              onPrevTeam={() => viewPrevTeam(gameState.teams)}
              onSetIGL={(playerId) => setIGL(selectedTeam.id, playerId)}
              onManageRoster={() => setView("roster-management")}
              devMode={devMode}
            />
          )}

          {/* Player View */}
          {view === "player" && selectedPlayer && selectedPlayerTeam && (
            <>
              <div className="content-header">
                <button className="link-btn" onClick={() => viewTeam(selectedPlayerTeam.id)}>
                  « Back to {selectedPlayerTeam.name}
                </button>
                <h1>{selectedPlayer.name}</h1>
              </div>
              <div className="player-profile">
                <div className="player-profile-header">
                  <div className="player-profile-info">
                    <img
                      src={selectedPlayerTeam.logo}
                      alt={selectedPlayerTeam.name}
                      className="player-team-logo"
                    />
                    <div>
                      <h2>{selectedPlayer.name}</h2>
                      <div className="player-profile-meta">
                        <span className={`role-badge role-${selectedPlayer.role}`}>
                          {selectedPlayer.role.toUpperCase()}
                        </span>
                        <span>{selectedPlayerTeam.name}</span>
                        <span>Age: {selectedPlayer.age}</span>
                        {selectedPlayerTeam.iglId === selectedPlayer.id && (
                          <span className="igl-badge">IGL</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="player-profile-ovr">
                    {(() => {
                      const ovrInfo = getPlayerEffectiveOVR(selectedPlayer, selectedPlayerTeam);
                      const hasModifier = ovrInfo.rolePenalty !== 0 || ovrInfo.iglBonus !== 0;
                      return (
                        <>
                          <div className="ovr-large">{ovrInfo.effectiveOvr}</div>
                          <div className="ovr-label">{ovrInfo.isStarter ? 'EFF OVR' : 'OVR (Bench)'}</div>
                          {ovrInfo.isStarter && hasModifier && (
                            <div className="ovr-breakdown">
                              <span className="base-ovr">Base: {ovrInfo.baseOvr}</span>
                              {ovrInfo.rolePenalty !== 0 && (
                                <span className={`modifier ${ovrInfo.rolePenalty > 0 ? 'positive' : 'negative'}`}>
                                  Role: {ovrInfo.rolePenalty > 0 ? '+' : ''}{ovrInfo.rolePenalty}
                                </span>
                              )}
                              {ovrInfo.iglBonus !== 0 && (
                                <span className={`modifier ${ovrInfo.iglBonus > 0 ? 'positive' : 'negative'}`}>
                                  IGL: {ovrInfo.iglBonus > 0 ? '+' : ''}{ovrInfo.iglBonus}
                                </span>
                              )}
                            </div>
                          )}
                          {ovrInfo.isStarter && ovrInfo.assignedRole !== selectedPlayer.role && (
                            <div className="assigned-role-info">
                              Playing as: <span className={`role-badge role-${ovrInfo.assignedRole}`}>
                                {ovrInfo.assignedRole.toUpperCase()}
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {(devMode || selectedPlayerTeam.id === gameState?.userTeamId) && (
                      <button className="edit-player-btn" onClick={openEditPlayerModal}>
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                </div>

                <div className="player-profile-grid">
                <div className="panel">
                  <div className="panel-header">Ratings</div>
                  <div className="panel-body">
                    {[["Aim", selectedPlayer.ratings.aim], ["Spray Control", selectedPlayer.ratings.sprayControl], ["Game Sense", selectedPlayer.ratings.gameSense], ["Utility Usage", selectedPlayer.ratings.utilityUsage], ["Communication", selectedPlayer.ratings.communication], ["Clutch Factor", selectedPlayer.ratings.clutchFactor]].map(([label, value]) => (
                      <div key={label as string} className="rating-bar-row">
                        <span className="rating-label">{label}</span>
                        <div className="rating-bar-bg"><div className="rating-bar-fill" style={{ width: `${value}%` }} /></div>
                        <span className="rating-value">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header">Info</div>
                  <div className="panel-body">
                    <div className="stat-row"><span className="label">Archetype</span><span className="value" title={ALL_ARCHETYPES[selectedPlayer.archetype]?.description}>{ALL_ARCHETYPES[selectedPlayer.archetype]?.name || selectedPlayer.archetype.replace(/_/g, " ")}</span></div>
                    <div className="stat-row"><span className="label">Potential</span><span className="value">{selectedPlayer.potential.floor} - {selectedPlayer.potential.ceiling}</span></div>
                    <div className="stat-row"><span className="label">Peak Age</span><span className="value">{selectedPlayer.development.peakAge}</span></div>
                    <div className="stat-row"><span className="label">Background</span><span className="value">{selectedPlayer.background.replace(/_/g, " ")}</span></div>
                    {selectedPlayer.contract ? (
                      <>
                        <div className="stat-row"><span className="label">Contract</span><span className="value">${selectedPlayer.contract.salary.toLocaleString()}/yr</span></div>
                        <div className="stat-row"><span className="label">Years Left</span><span className="value">{selectedPlayer.contract.yearsRemaining}</span></div>
                      </>
                    ) : (
                      <div className="stat-row"><span className="label">Contract</span><span className="value">Free Agent</span></div>
                    )}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header">Agent Pool</div>
                  <div className="panel-body">
                    {Object.entries(selectedPlayer.agentPool).sort((a, b) => b[1] - a[1]).map(([agent]) => {
                      const normalizedAgent = agent.toLowerCase().replace(/\s+/g, "").replace(/\//g, "");
                      return (
                        <div key={agent} className="agent-pool-row">
                          <img src={`https://www.vlr.gg/img/vlr/game/agents/${normalizedAgent}.png`} alt={agent} className="agent-pool-icon" title={agent.charAt(0).toUpperCase() + agent.slice(1)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header">Personality</div>
                  <div className="panel-body">
                    {[["Leadership", selectedPlayer.personality.leadership], ["Work Ethic", selectedPlayer.personality.workEthic], ["Mentality", selectedPlayer.personality.mentality], ["Team Player", selectedPlayer.personality.teamPlayer], ["Coachability", selectedPlayer.personality.coachability]].map(([label, value]) => {
                      const grade = toLetterGrade(value as number);
                      const gradeClass = getGradeClass(grade);
                      return (
                        <div key={label as string} className="stat-row">
                          <span className="label">{label}</span>
                          <span className={`grade-badge ${gradeClass}`}>{grade}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <PlayerStatsTable stats={selectedPlayer.careerStats} onMatchClick={viewMatch} />
              </div>
              {showEditPlayerModal && (
                <PlayerEditModal
                  player={selectedPlayer}
                  team={selectedPlayerTeam}
                  onSave={(updatedPlayer) => { savePlayer(updatedPlayer); closeEditPlayerModal(); }}
                  onClose={closeEditPlayerModal}
                />
              )}
            </>
          )}

          {/* Trade */}
          {view === "trade" && gameState.userTeamId && (
            <TradePage teams={gameState.teams} userTeamId={gameState.userTeamId} onExecuteTrade={executeTradeAction} onViewPlayer={viewPlayer} />
          )}

          {/* Free Agents placeholder */}
          {view === "free-agents" && (
            <>
              <div className="content-header"><h1>Free Agents</h1></div>
              <div className="panel"><div className="panel-body"><p style={{ color: "var(--text-muted)" }}>Free agency coming soon...</p></div></div>
            </>
          )}

          {/* Draft placeholder */}
          {view === "draft" && (
            <>
              <div className="content-header"><h1>Draft</h1></div>
              <div className="panel"><div className="panel-body"><p style={{ color: "var(--text-muted)" }}>Draft coming soon...</p></div></div>
            </>
          )}

          {/* History */}
          {view === "history" && (
            <>
              <div className="content-header"><h1>League History</h1></div>
              <div className="panel">
                <div className="panel-header">Champions</div>
                <div className="panel-body">
                  {gameState.champions.length === 0 ? (
                    <p style={{ color: "var(--text-muted)" }}>No champions yet</p>
                  ) : (
                    gameState.champions.map((c, idx) => {
                      const team = gameState.teams.find((t) => t.id === c.teamId);
                      return (
                        <div key={idx} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                          <strong>Season {c.year}</strong>
                          {c.type === "international" && " 🌍"}
                          {c.type === "regional" && c.region && ` [${c.region.toUpperCase()}]`}
                          : {team?.name}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {/* Finances */}
          {view === "finances" && (
            <>
              <div className="content-header"><h1>Team Finances</h1></div>
              <div className="panel">
                <div className="panel-body">
                  <div className="stat-row"><span className="label">Budget</span><span className="value">${(userTeam?.finances.budget ?? 0).toLocaleString()}</span></div>
                  <div className="stat-row"><span className="label">Salary Committed</span><span className="value">${(userTeam?.finances.salaryCommitted ?? 0).toLocaleString()}</span></div>
                  <div className="stat-row"><span className="label">Scouting Budget</span><span className="value">{userTeam?.finances.scoutingBudget}%</span></div>
                </div>
              </div>
            </>
          )}

          {/* Match Detail */}
          {view === "match-detail" && selectedMatchId && (() => {
            const matchData = findMatchResult(selectedMatchId);
            if (!matchData) return (
              <div className="panel">
                <div className="panel-body">
                  <p style={{ color: "var(--text-muted)" }}>Match not found. <button className="link-btn" onClick={goBack}>Go back</button></p>
                </div>
              </div>
            );
            const homeTeam = gameState.teams.find((t) => t.id === matchData.homeTeamId);
            const awayTeam = gameState.teams.find((t) => t.id === matchData.awayTeamId);
            if (!homeTeam || !awayTeam) return (
              <div className="panel">
                <div className="panel-body">
                  <p style={{ color: "var(--text-muted)" }}>Teams not found. <button className="link-btn" onClick={goBack}>Go back</button></p>
                </div>
              </div>
            );
            const scheduledMatch = gameState.schedule.find(m => m.id === selectedMatchId || m.result?.id === selectedMatchId);
            const matchDay = scheduledMatch?.day;
            const homeStandingAtMatch = calculateStandingsAtDay(homeTeam.id, matchDay);
            const awayStandingAtMatch = calculateStandingsAtDay(awayTeam.id, matchDay);

            return (
              <MatchDetailView
                match={matchData.result}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                homeStanding={homeStandingAtMatch}
                awayStanding={awayStandingAtMatch}
                onBack={goBack}
                onViewPlayer={viewPlayer}
              />
            );
          })()}

          {/* Roster Management */}
          {view === "roster-management" && (() => {
            const managedTeam = devMode && selectedTeamId ? gameState.teams.find(t => t.id === selectedTeamId) : userTeam;
            if (!managedTeam) return null;

            return (
              <RosterManagementPage
                team={managedTeam}
                onUpdateLineup={(lineup) => updateLineup(managedTeam.id, lineup)}
                onUpdateIGL={(playerId) => playerId && setIGL(managedTeam.id, playerId)}
                onBack={() => { setSelectedTeamId(managedTeam.id); setView("team"); }}
                onViewPlayer={viewPlayer}
                onNavigateToFreeAgency={() => setView("free-agency")}
                isDevMode={devMode}
                isUserTeam={managedTeam.id === gameState.userTeamId}
              />
            );
          })()}

          {/* Free Agency */}
          {view === "free-agency" && userTeam && (
            <FreeAgencyPage
              freeAgents={gameState.freeAgents || []}
              userTeam={userTeam}
              onSignPlayer={signFreeAgentAction}
              onReleasePlayer={releasePlayerAction}
              onBack={() => setView("roster-management")}
              onViewPlayer={viewPlayer}
            />
          )}
        </main>
      </div>

      {/* Match Result Toasts */}
      <MatchToastContainer toasts={matchToasts} onDismiss={dismissToast} onClickMatch={viewMatch} />

      {/* Notification Toast */}
      {notificationToast && (
        <div className="notification-toast" onClick={clearNotificationToast}>{notificationToast}</div>
      )}
    </div>
  );
}