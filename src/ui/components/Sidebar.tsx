import { useState } from 'react';
import type { GameState } from '../../sim/gameState';
import type { Region } from '../../types';
import { TOURNAMENT_LABELS } from '../../types/league';

type NavView = 'dashboard' | 'standings' | 'schedule' | 'playoffs' | 'team' | 'roster' | 'free-agents' | 'trade' | 'draft' | 'history' | 'finances' | 'player' | 'league-standings' | 'international' | 'match-detail' | 'live-sim' | 'players' | 'power-rankings'| "roster-management" | "free-agency" | "scrims" | "news" | "records" | "agent-meta" | "map-pool" | "switch-team" | "mass-editor" | "progression" | "sim-config" | "real-event" | "sandbox";

const REGION_ICONS: Record<Region, string> = {
  americas: '/logos/regions/Americas.png',
  emea: '/logos/regions/EMEA.png',
  pacific: '/logos/regions/Pacific.png',
  china: '/logos/regions/China.png',
};

const REGION_NAMES: Record<Region, string> = {
  americas: 'Americas',
  emea: 'EMEA',
  pacific: 'Pacific',
  china: 'China',
};

// minimal inline svgs — 16x16, currentColor
const Icon = {
  dashboard:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" opacity=".7"/><rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity=".7"/><rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity=".7"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity=".7"/></svg>,
  news:        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="2" rx="1" fill="currentColor" opacity=".7"/><rect x="1" y="6" width="10" height="2" rx="1" fill="currentColor" opacity=".7"/><rect x="1" y="10" width="12" height="2" rx="1" fill="currentColor" opacity=".7"/><rect x="1" y="14" width="7" height="1.5" rx=".75" fill="currentColor" opacity=".5"/></svg>,
  standings:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="8" width="4" height="7" rx="1" fill="currentColor" opacity=".7"/><rect x="6" y="5" width="4" height="10" rx="1" fill="currentColor" opacity=".7"/><rect x="11" y="2" width="4" height="13" rx="1" fill="currentColor" opacity=".7"/></svg>,
  rankings:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.8 3.6L14 5.3l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7z" fill="currentColor" opacity=".8"/></svg>,
  bracket:     <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="4" height="3" rx="1" fill="currentColor" opacity=".7"/><rect x="1" y="11" width="4" height="3" rx="1" fill="currentColor" opacity=".7"/><rect x="7" y="6" width="4" height="4" rx="1" fill="currentColor" opacity=".7"/><rect x="13" y="7" width="2" height="2" rx="1" fill="currentColor"/><path d="M5 3.5h1.5v9H5" stroke="currentColor" strokeWidth="1.2" opacity=".5" fill="none"/><path d="M11 8h2" stroke="currentColor" strokeWidth="1.2" opacity=".5"/></svg>,
  globe:       <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" opacity=".8"/><ellipse cx="8" cy="8" rx="2.5" ry="6.5" stroke="currentColor" strokeWidth="1.2" opacity=".6"/><line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.2" opacity=".6"/></svg>,
  schedule:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" opacity=".8"/><line x1="5" y1="1.5" x2="5" y2="4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="11" y1="1.5" x2="11" y2="4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.2" opacity=".5"/></svg>,
  history:     <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2.5 8a5.5 5.5 0 1 1 1.2 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".8"/><path d="M2 5v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/><path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".8"/></svg>,
  records:     <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.5L9.5 6h4.5l-3.7 2.7 1.4 4.3L8 10.4l-3.7 2.6 1.4-4.3L2 6h4.5z" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".8"/></svg>,
  offseason:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" opacity=".7" fill="none"/><path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".8"/></svg>,
  roster:      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" opacity=".8"/><path d="M2.5 13.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".8" fill="none"/></svg>,
  lineup:      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor" opacity=".5"/><rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" opacity=".7"/><rect x="1" y="11" width="14" height="2" rx="1" fill="currentColor" opacity=".5"/></svg>,
  scrims:      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".8"/></svg>,
  finances:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" opacity=".7"/><path d="M8 4.5v1M8 10.5v1M10 6.5a2 2 0 0 0-2-1H7a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H7.5A2 2 0 0 1 6 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".8"/></svg>,
  players:     <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" opacity=".7"/><path d="M1 13c0-2.5 2-3.8 4.5-3.8S10 10.5 10 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".7" fill="none"/><circle cx="11.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" opacity=".5"/><path d="M11.5 9.2c1.8.3 3 1.5 3 3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".5" fill="none"/></svg>,
  freeagents:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" opacity=".8"/><path d="M1.5 13.5c0-3 2.5-4.5 5.5-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".8" fill="none"/><path d="M12 9v5M9.5 11.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".8"/></svg>,
  trade:       <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 6h10M10 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".8"/><path d="M13 10H3M6 13l-3-3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".8"/></svg>,
  draft:       <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".8"/><rect x="2" y="11" width="12" height="3" rx="1" fill="currentColor" opacity=".4"/></svg>,
  // dev icons
  switchteam:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M11 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  masseditor:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".9"/><path d="M12 10l1.5 1.5L16 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  simconfig:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" fill="currentColor" opacity=".8"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".7"/></svg>,
  mappool:     <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 3l4 1.5 4-1.5 4 1.5v9l-4-1.5-4 1.5-4-1.5V3z" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".8"/><path d="M6 4.5v9M10 3v9" stroke="currentColor" strokeWidth="1" opacity=".5"/></svg>,
  agentmeta:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><polygon points="8,1 10.5,6 16,6.5 12,10.5 13,16 8,13.5 3,16 4,10.5 0,6.5 5.5,6" stroke="currentColor" strokeWidth="1.2" fill="none" opacity=".8"/></svg>,
  realevent:   <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" opacity=".8"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".9"/></svg>,
  sandbox:     <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" opacity=".7" fill="none"/><path d="M2 8h12M8 2v12" stroke="currentColor" strokeWidth="1" opacity=".4"/><circle cx="5.5" cy="5.5" r="1.2" fill="currentColor" opacity=".7"/><circle cx="10.5" cy="10.5" r="1.2" fill="currentColor" opacity=".7"/></svg>,
};

interface SidebarProps {
  gameState: GameState;
  currentView: NavView;
  onNavigate: (view: NavView, teamId?: string) => void;
  selectedRegion: Region;
  onRegionChange: (region: Region) => void;
  devMode?: boolean;
}

function NavBtn({ icon, label, active, onClick, badge, disabled }: {
  icon: React.ReactNode;
  label: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''} ${disabled ? 'nav-item-disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      title={typeof label === 'string' ? label : undefined}
      style={disabled ? { opacity: 0.45, cursor: 'default', pointerEvents: 'none' } : undefined}
    >
      <span className="nav-item-icon">{icon}</span>
      <span className="nav-item-label">{label}</span>
      {badge}
    </button>
  );
}

// icon-only button for collapsed sidebar
function IconBtn({ icon, label, active, onClick, disabled }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`sidebar-icon-btn${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      title={label}
      style={disabled ? { opacity: 0.4, cursor: 'default', pointerEvents: 'none' } : undefined}
    >
      {icon}
    </button>
  );
}

export function Sidebar({ gameState, currentView, onNavigate, selectedRegion, onRegionChange, devMode }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const toggleCollapse = () => {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };
  const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
  const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
  const realEventActive = !!(gameState as any).realEventConfig?.enabled;
  const isOffseason = gameState.phase === 'offseason';
  const isMidOffseason = gameState.phase === 'mid_offseason';
  const isStagePhase = gameState.phase === 'stage1_groups' || gameState.phase === 'stage1_playoffs' || gameState.phase === 'stage2_groups' || gameState.phase === 'stage2_playoffs';
  const showInternational = gameState.phase === 'international' || gameState.internationalTournament !== null || (isOffseason && !!gameState.internationalTournament) || (isMidOffseason && !!gameState.internationalTournament);

  // derive human-readable tournament names from current season history
  const tournType = gameState.currentTournamentType || 'champions';
  const completedIntl = (gameState.seasonHistory || [])
    .filter(h => h.year === gameState.currentYear && (h.worldChampionId || h.worldChampionCustom))
    .length;

  // international label: in offseason, show the COMPLETED event name (not the upcoming one)
  const intlNavLabel = (() => {
    const history = gameState.seasonHistory || [];
    if (isOffseason && completedIntl > 0) {
      // find the most recently completed event
      const completed = history
        .filter(h => h.year === gameState.currentYear && (h.worldChampionId || h.worldChampionCustom))
        .sort((a, b) => (b.sortIndex ?? 0) - (a.sortIndex ?? 0))[0];
      if (completed) {
        const label = TOURNAMENT_LABELS[completed.tournamentType || 'champions'] ?? 'Champions';
        return completed.eventName ? `${label}: ${completed.eventName}` : `${label} ${gameState.currentYear}`;
      }
    }
    // active or upcoming: find next event without a winner
    const upcoming = history
      .filter(h => h.year === gameState.currentYear && (h.tournamentType || 'champions') === tournType && !h.worldChampionId && !h.worldChampionCustom)
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))[0];
    const label = TOURNAMENT_LABELS[tournType] ?? 'Champions';
    return upcoming?.eventName ? `${label}: ${upcoming.eventName}` : `${label} ${gameState.currentYear}`;
  })();

  // kickoff/stage label: in offseason the count includes the just-finished event,
  // but the brackets are from BEFORE that event, so subtract 1
  const bracketCount = isOffseason ? Math.max(0, completedIntl - 1) : completedIntl;
  const kickoffNavLabel = (() => {
    const phase = gameState.phase;
    if (phase === 'stage1_groups') return 'Stage 1 Groups';
    if (phase === 'stage1_playoffs') return 'Stage 1 Playoffs';
    if (phase === 'stage2_groups') return 'Stage 2 Groups';
    if (phase === 'stage2_playoffs') return 'Stage 2 Playoffs';
    if (phase === 'mid_offseason') {
      // internationalSource has been advanced to the NEXT source, so derive what just finished
      const next = gameState.internationalSource ?? 'stage1';
      if (next === 'stage1') return `Kickoff ${gameState.currentYear}`;
      // next === 'stage2' means stage 1 just finished
      return 'Stage 1 Playoffs';
    }

    // during international/offseason, check if we have stage playoff data to show
    if (phase === 'international' || phase === 'offseason') {
      const stageNum = gameState.currentStage;
      const hasStagePlayoffs = Object.values(gameState.stagePlayoffBrackets ?? {}).some(r => r[stageNum]);
      if (hasStagePlayoffs) return `Stage ${stageNum} Playoffs`;
    }

    return bracketCount === 0 ? `Kickoff ${gameState.currentYear}` : `Stage ${bracketCount}`;
  })();

  // bracket completed = offseason phase and tournament actually ran
  const kickoffCompleted = (isOffseason || isMidOffseason || isStagePhase || gameState.phase === 'international') && Object.values(gameState.kickoffBrackets ?? {}).some(b => b?.qualifiers && b.qualifiers.length > 0);
  const stagePlayoffsCompleted = (() => {
    const s = gameState.currentStage;
    const p = gameState.phase;
    if (p === 'international' || p === 'offseason' || p === 'mid_offseason') {
      return Object.values(gameState.stagePlayoffBrackets ?? {}).some(r => r[s]?.champion);
    }
    return false;
  })();
  const playoffsBadgeCompleted = stagePlayoffsCompleted || kickoffCompleted;
  // real teams sim may not set .champion cleanly — treat any completed offseason with a tournament as done
  const intlCompleted = (isOffseason || isMidOffseason) && gameState.internationalTournament !== null;

  const showStageGroups = (() => {
    const p = gameState.phase;
    const s = gameState.currentStage;
    // show groups tab when we've moved past group stage but data exists
    if (p === 'stage1_playoffs' || p === 'stage2_playoffs' || p === 'mid_offseason' || p === 'international' || p === 'offseason') {
      return Object.values(gameState.stageGroupStages ?? {}).some(r => r[s]);
    }
    return false;
  })();
  const stageGroupsLabel = `Stage ${gameState.currentStage} Groups`;

  const CompletedBadge = () => (
    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'var(--success)', opacity: 0.8 }}>✓</span>
  );

  const unseenNews = (() => {
    if (currentView === 'live-sim') return 0;
    const total = userTeam?.region
      ? (gameState.newsFeed?.filter(n => n.region === userTeam.region).length ?? 0)
      : 0;
    return Math.max(0, total - (gameState.lastSeenNewsCount ?? 0));
  })();

  const collapseChevron = (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      {collapsed
        ? <path d="M5 3l6 5-6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        : <path d="M11 3l-6 5 6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      }
    </svg>
  );

  // collapsed view — render flat icon-only buttons
  if (collapsed) {
    return (
      <nav className="sidebar-nav collapsed">
        <button className="sidebar-collapse-btn sidebar-collapse-btn--icon" onClick={toggleCollapse} title="Expand sidebar">
          {collapseChevron}
        </button>

        <div className="sidebar-icon-section">
          {devMode && <>
            <IconBtn icon={Icon.switchteam} label="Switch Team"     active={currentView === 'switch-team'}  onClick={() => onNavigate('switch-team')} />
            <IconBtn icon={Icon.masseditor} label="Mass Editor"     active={currentView === 'mass-editor'}   onClick={() => onNavigate('mass-editor')} />
            <IconBtn icon={Icon.simconfig}  label="Sim Config"      active={currentView === 'sim-config'}    onClick={() => onNavigate('sim-config')} />
            <IconBtn icon={Icon.mappool}    label="Map Pool"        active={currentView === 'map-pool'}      onClick={() => onNavigate('map-pool')} />
            <IconBtn icon={Icon.agentmeta}  label="Agent Meta"      active={currentView === 'agent-meta'}    onClick={() => onNavigate('agent-meta')} />
            <IconBtn icon={Icon.realevent}  label="Real Event Teams" active={currentView === 'real-event'}   onClick={() => onNavigate('real-event')} />
            <IconBtn icon={Icon.sandbox}    label="Sandbox"          active={currentView === 'sandbox'}      onClick={() => onNavigate('sandbox')} />
            <div className="sidebar-icon-divider" />
          </>}

          <IconBtn icon={Icon.dashboard} label="Dashboard"      active={currentView === 'dashboard'}     onClick={() => onNavigate('dashboard')} />
          <IconBtn icon={Icon.news}      label="News"           active={currentView === 'news'}           onClick={() => onNavigate('news')} />
          <IconBtn icon={Icon.standings} label="Standings"      active={currentView === 'standings'}     onClick={() => onNavigate('standings')} />
          <IconBtn icon={Icon.rankings}  label="Power Rankings" active={currentView === 'power-rankings'} onClick={() => onNavigate('power-rankings')} />
          {showStageGroups && <IconBtn icon={Icon.standings} label={stageGroupsLabel} active={currentView === 'stage-groups'} onClick={() => onNavigate('stage-groups')} />}
          <IconBtn icon={Icon.bracket} label={kickoffNavLabel} active={currentView === 'playoffs'}     onClick={() => onNavigate('playoffs')} disabled={realEventActive} />
          {showInternational && <IconBtn icon={Icon.globe} label={intlNavLabel}    active={currentView === 'international'} onClick={() => onNavigate('international')} />}
          <IconBtn icon={Icon.schedule}  label="Schedule"       active={currentView === 'schedule'}      onClick={() => onNavigate('schedule')} />
          <IconBtn icon={Icon.history}   label="History"        active={currentView === 'history'}       onClick={() => onNavigate('history')} />
          <IconBtn icon={Icon.records}   label="Records"        active={currentView === 'records'}       onClick={() => onNavigate('records')} />
          {gameState.phase === 'offseason' && gameState.offseasonProgression && (
            <IconBtn icon={Icon.offseason} label="Offseason News" active={currentView === 'progression'} onClick={() => onNavigate('progression')} />
          )}

          <div className="sidebar-icon-divider" />

          <IconBtn icon={Icon.roster}   label="Roster"   active={currentView === 'roster'}            onClick={() => onNavigate('roster')} />
          <IconBtn icon={Icon.lineup}   label="Lineup"   active={currentView === 'roster-management'} onClick={() => onNavigate('roster-management')} />
          <IconBtn icon={Icon.scrims}   label="Scrims"   active={currentView === 'scrims'}            onClick={() => onNavigate('scrims')} />
          <IconBtn icon={Icon.finances} label="Finances" active={currentView === 'finances'}          onClick={() => onNavigate('finances')} />

          <div className="sidebar-icon-divider" />

          <IconBtn icon={Icon.players}    label="All Players" active={currentView === 'players'}     onClick={() => onNavigate('players')} />
          <IconBtn icon={Icon.freeagents} label="Free Agents" active={currentView === 'free-agency'} onClick={() => onNavigate('free-agency')} />
          <IconBtn icon={Icon.trade}      label="Trade"       active={currentView === 'trade'}       onClick={() => onNavigate('trade')} />
          <IconBtn icon={Icon.draft}      label="Draft"       active={currentView === 'draft'}       onClick={() => onNavigate('draft')} />

          <div className="sidebar-icon-divider" />

          {regions.map(r => (
            <button
              key={r}
              className={`sidebar-icon-btn${selectedRegion === r ? ' active' : ''}`}
              onClick={() => onRegionChange(r)}
              title={REGION_NAMES[r]}
            >
              <img src={REGION_ICONS[r]} alt={r} style={{ width: 18, height: 18, objectFit: 'contain' }} />
            </button>
          ))}
        </div>
      </nav>
    );
  }

  // expanded view
  return (
    <nav className="sidebar-nav">
      <button className="sidebar-collapse-btn" onClick={toggleCollapse} title="Collapse sidebar">
        <span>Collapse</span>
        {collapseChevron}
      </button>
      {devMode && (
        <div className="nav-section dev-tools-section">
          <div className="nav-section-title">Dev Tools</div>
          <NavBtn icon={Icon.switchteam} label="Switch Team"    active={currentView === 'switch-team'}  onClick={() => onNavigate('switch-team')} />
          <NavBtn icon={Icon.masseditor} label="Mass Editor"    active={currentView === 'mass-editor'}   onClick={() => onNavigate('mass-editor')} />
          <NavBtn icon={Icon.simconfig}  label="Sim Config"     active={currentView === 'sim-config'}    onClick={() => onNavigate('sim-config')} />
          <NavBtn icon={Icon.mappool}    label="Map Pool"       active={currentView === 'map-pool'}      onClick={() => onNavigate('map-pool')} />
          <NavBtn icon={Icon.agentmeta}  label="Agent Meta"     active={currentView === 'agent-meta'}    onClick={() => onNavigate('agent-meta')} />
          <NavBtn icon={Icon.realevent}  label="Real Event Teams" active={currentView === 'real-event'}  onClick={() => onNavigate('real-event')} />
          <NavBtn icon={Icon.sandbox}    label="Sandbox"          active={currentView === 'sandbox'}     onClick={() => onNavigate('sandbox')} />
        </div>
      )}

      <div className="nav-section">
        <div className="nav-section-title">League</div>
        <NavBtn icon={Icon.dashboard} label="Dashboard"      active={currentView === 'dashboard'}     onClick={() => onNavigate('dashboard')} />
        <NavBtn icon={Icon.news}      label="News"           active={currentView === 'news'}           onClick={() => onNavigate('news')}
          badge={unseenNews > 0 ? <span className="news-badge">{unseenNews}</span> : undefined} />
        <NavBtn icon={Icon.standings} label="Standings"      active={currentView === 'standings'}     onClick={() => onNavigate('standings')} />
        <NavBtn icon={Icon.rankings}  label="Power Rankings" active={currentView === 'power-rankings'} onClick={() => onNavigate('power-rankings')} />
        {showStageGroups && (
          <NavBtn icon={Icon.standings} label={stageGroupsLabel} active={currentView === 'stage-groups'} onClick={() => onNavigate('stage-groups')} badge={<CompletedBadge />} />
        )}
        <NavBtn icon={Icon.bracket} label={kickoffNavLabel} active={currentView === 'playoffs'}     onClick={() => onNavigate('playoffs')} badge={playoffsBadgeCompleted ? <CompletedBadge /> : undefined} disabled={realEventActive} />
        {showInternational && (
          <NavBtn icon={Icon.globe}   label={intlNavLabel}   active={currentView === 'international'} onClick={() => onNavigate('international')} badge={intlCompleted ? <CompletedBadge /> : undefined} />
        )}
        <NavBtn icon={Icon.schedule}  label="Schedule"       active={currentView === 'schedule'}      onClick={() => onNavigate('schedule')} />
        <NavBtn icon={Icon.history}   label="History"        active={currentView === 'history'}       onClick={() => onNavigate('history')} />
        <NavBtn icon={Icon.records}   label="Records"        active={currentView === 'records'}       onClick={() => onNavigate('records')} />
        {gameState.phase === 'offseason' && gameState.offseasonProgression && (
          <NavBtn icon={Icon.offseason} label="Offseason News" active={currentView === 'progression'} onClick={() => onNavigate('progression')} />
        )}
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Team</div>
        <NavBtn icon={Icon.roster}   label="Roster"   active={currentView === 'roster'}            onClick={() => onNavigate('roster')} />
        <NavBtn icon={Icon.lineup}   label="Lineup"   active={currentView === 'roster-management'} onClick={() => onNavigate('roster-management')} />
        <NavBtn icon={Icon.scrims}   label="Scrims"   active={currentView === 'scrims'}            onClick={() => onNavigate('scrims')} />
        <NavBtn icon={Icon.finances} label="Finances" active={currentView === 'finances'}          onClick={() => onNavigate('finances')} />
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Players</div>
        <NavBtn icon={Icon.players}    label="All Players"  active={currentView === 'players'}     onClick={() => onNavigate('players')} />
        <NavBtn icon={Icon.freeagents} label="Free Agents"  active={currentView === 'free-agency'} onClick={() => onNavigate('free-agency')} />
        <NavBtn icon={Icon.trade}      label="Trade"        active={currentView === 'trade'}       onClick={() => onNavigate('trade')} />
        <NavBtn icon={Icon.draft}      label="Draft"        active={currentView === 'draft'}       onClick={() => onNavigate('draft')} />
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Regions</div>
        {regions.map(r => (
          <button key={r} className={`nav-item ${selectedRegion === r ? 'active' : ''}`} onClick={() => onRegionChange(r)}>
            <span className="nav-item-icon">
              <img src={REGION_ICONS[r]} alt={r} className="nav-region-icon" />
            </span>
            <span className={`nav-item-label ${userTeam?.region === r ? 'nav-user-region' : ''}`}>{REGION_NAMES[r]}</span>
          </button>
        ))}
      </div>

      <div className="nav-section">
        <div className="nav-section-title">{REGION_NAMES[selectedRegion]} Teams</div>
        {gameState.teams.filter(t => t.region === selectedRegion).map(t => (
          <button key={t.id} className="nav-item" onClick={() => onNavigate('team', t.id)}>
            <span className="nav-item-icon">
              {t.logo
                ? <img src={t.logo} alt="" className="nav-team-logo" />
                : <span className="region-dot" />}
            </span>
            <span className={`nav-item-label ${t.id === gameState.userTeamId ? 'nav-user-region' : ''}`}>{t.abbreviation}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
