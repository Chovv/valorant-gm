// src/ui/components/Sidebar.tsx
import type { GameState } from '../../sim/gameState';
import type { Region } from '../../types';

type NavView = 'dashboard' | 'standings' | 'schedule' | 'playoffs' | 'team' | 'roster' | 'free-agents' | 'trade' | 'draft' | 'history' | 'finances' | 'player' | 'league-standings' | 'international' | 'match-detail' | 'players' | 'power-rankings'| "roster-management" | "free-agency";

const REGION_NAMES: Record<Region, string> = {
  americas: 'Americas',
  emea: 'EMEA',
  pacific: 'Pacific',
  china: 'China',
};

interface SidebarProps {
  gameState: GameState;
  currentView: NavView;
  onNavigate: (view: NavView, teamId?: string) => void;
  selectedRegion: Region;
  onRegionChange: (region: Region) => void;
}

export function Sidebar({ gameState, currentView, onNavigate, selectedRegion, onRegionChange }: SidebarProps) {
  const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
  const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
  
  // Check if we're in or past playoffs
  const showPlayoffs = gameState.phase === 'regional_playoffs' || 
    gameState.phase === 'international' || 
    gameState.phase === 'offseason' ||
    Object.values(gameState.regionalPlayoffs).some(b => b !== null);
  
  const showInternational = gameState.phase === 'international' || 
    gameState.internationalTournament !== null;

  return (
    <nav className="sidebar-nav">
      {/* League Section */}
      <div className="nav-section">
        <div className="nav-section-title">▼ League</div>
        <button
          className={`nav-item ${currentView === "dashboard" ? "active" : ""}`}
          onClick={() => onNavigate("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`nav-item ${currentView === "standings" ? "active" : ""}`}
          onClick={() => onNavigate("standings")}
        >
          Standings
        </button>
        <button
          className={`nav-item ${
            currentView === "power-rankings" ? "active" : ""
          }`}
          onClick={() => onNavigate("power-rankings")}
        >
          Power Rankings
        </button>
        {showPlayoffs && (
          <button
            className={`nav-item ${currentView === "playoffs" ? "active" : ""}`}
            onClick={() => onNavigate("playoffs")}
          >
            Regional Playoffs
          </button>
        )}
        {showInternational && (
          <button
            className={`nav-item ${
              currentView === "international" ? "active" : ""
            }`}
            onClick={() => onNavigate("international")}
          >
            🌍 Champions
          </button>
        )}
        <button
          className={`nav-item ${currentView === "schedule" ? "active" : ""}`}
          onClick={() => onNavigate("schedule")}
        >
          Schedule
        </button>
        <button
          className={`nav-item ${currentView === "history" ? "active" : ""}`}
          onClick={() => onNavigate("history")}
        >
          History
        </button>
      </div>

      {/* Team Section */}
      <div className="nav-section">
        <div className="nav-section-title">▼ Team</div>
        <button
          className={`nav-item ${currentView === "roster" ? "active" : ""}`}
          onClick={() => onNavigate("roster")}
        >
          Roster
        </button>
        <button
          className={`nav-item ${currentView === "roster-management" ? "active" : ""}`}
          onClick={() => onNavigate("roster-management")}
        >
          Lineup
        </button>
        <button
          className={`nav-item ${currentView === "finances" ? "active" : ""}`}
          onClick={() => onNavigate("finances")}
        >
          Finances
        </button>
      </div>

      {/* Players Section */}
      <div className="nav-section">
        <div className="nav-section-title">▼ Players</div>
        <button
          className={`nav-item ${currentView === "players" ? "active" : ""}`}
          onClick={() => onNavigate("players")}
        >
          All Players
        </button>
        <button
          className={`nav-item ${
            currentView === "free-agency" ? "active" : ""
          }`}
          onClick={() => onNavigate("free-agency")}
        >
          Free Agents
        </button>
        <button
          className={`nav-item ${currentView === "trade" ? "active" : ""}`}
          onClick={() => onNavigate("trade")}
        >
          Trade
        </button>
        <button
          className={`nav-item ${currentView === "draft" ? "active" : ""}`}
          onClick={() => onNavigate("draft")}
        >
          Draft
        </button>
      </div>

      {/* Region Selector */}
      <div className="nav-section">
        <div className="nav-section-title">▼ Regions</div>
        {regions.map((region) => (
          <button
            key={region}
            className={`nav-item ${selectedRegion === region ? "active" : ""}`}
            onClick={() => onRegionChange(region)}
            style={{
              color: userTeam?.region === region ? "var(--accent)" : undefined,
              fontWeight: userTeam?.region === region ? 600 : undefined,
            }}
          >
            {REGION_NAMES[region]}
          </button>
        ))}
      </div>

      {/* Teams List for Selected Region */}
      <div className="nav-section">
        <div className="nav-section-title">
          ▼ {REGION_NAMES[selectedRegion]} Teams
        </div>
        {gameState.teams
          .filter((team) => team.region === selectedRegion)
          .map((team) => (
            <button
              key={team.id}
              className="nav-item"
              onClick={() => onNavigate("team", team.id)}
              style={{
                color:
                  team.id === gameState.userTeamId
                    ? "var(--accent)"
                    : undefined,
                fontWeight: team.id === gameState.userTeamId ? 600 : undefined,
              }}
            >
              {team.abbreviation}
            </button>
          ))}
      </div>
    </nav>
  );
}