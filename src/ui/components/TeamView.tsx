// src/ui/components/TeamView.tsx
import type { Team, StandingsEntry, Role } from '../../types';
import type { ScheduledMatch } from '../../sim/gameState';
import type { StartingSlot } from '../../types/roster';
import { getBenchPlayers, getLineupSummary } from '../../sim/rosterManagement';
import { getIGLBonusForPlayer, calculateEffectiveOverallWithIGL } from '../../sim/iglBonus';
import { analyzeComposition } from '../../sim/compositionBonus';
import { toLetterGrade, getGradeClass } from '../../utils/letterGrade';
import { ALL_ARCHETYPES } from '../../data/archetypes';
import { PlayerAvatar, InlineFlag } from './PlayerAvatar';
import './TeamView.css';

const ROLE_ICONS: Record<Role, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

// tv-prefixed grade class to avoid collisions with other page styles
const tvGradeClass = (val: number) => {
  const g = getGradeClass(toLetterGrade(val));
  return g.replace('grade-', 'tv-grade-');
};

const getRatingClass = (rating: number) => {
  if (rating >= 90) return 'rating-legendary';
  if (rating >= 80) return 'rating-elite';
  if (rating >= 70) return 'rating-high';
  if (rating >= 55) return 'rating-mid';
  return 'rating-low';
};

const getDevStage = (age: number, peakAge: number) => {
  if (age < peakAge - 3) return 'prospect';
  if (age < peakAge - 1) return 'developing';
  if (age <= peakAge + 1) return 'prime';
  if (age <= peakAge + 3) return 'veteran';
  return 'declining';
};

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  developing: 'Developing',
  prime: 'Prime',
  veteran: 'Veteran',
  declining: 'Declining',
};

interface TeamViewProps {
  team: Team;
  teams: Team[];
  standings: StandingsEntry[];
  schedule: ScheduledMatch[];
  isUserTeam: boolean;
  devMode?: boolean;
  onBack: () => void;
  onViewPlayer: (playerId: string) => void;
  onViewMatch: (matchId: string) => void;
  onNextTeam?: () => void;
  onPrevTeam?: () => void;
  onSetIGL?: (playerId: string) => void;
  onManageRoster?: () => void;
  onEditTeam?: () => void;
}

export function TeamView({
  team,
  teams,
  standings,
  schedule,
  isUserTeam,
  devMode = false,
  onViewPlayer,
  onViewMatch,
  onNextTeam,
  onPrevTeam,
  onSetIGL,
  onManageRoster,
  onEditTeam,
}: TeamViewProps) {
  const teamStanding = standings.find(s => s.teamId === team.id);

  const iglPlayer = team.iglId ? team.roster.find(p => p.id === team.iglId) : null;

  // lineup info
  const lineup: StartingSlot[] = team.startingLineup || team.roster.slice(0, 5).map(p => ({
    playerId: p.id,
    assignedRole: p.role,
  }));
  const benchPlayers = getBenchPlayers(team.roster, lineup);
  const lineupSummary = getLineupSummary(team.roster, lineup);
  const compositionResult = analyzeComposition(lineup);

  // effective lineup strength
  const effectiveLineupStrength = lineupSummary.reduce((total, summary) => {
    const player = team.roster.find(p => p.id === summary.playerId);
    const iglBonus = player ? getIGLBonusForPlayer(player, team, lineup) : 0;
    const iglOvrImpact = Math.round(iglBonus * 0.5);
    return total + summary.effectiveOverall + iglOvrImpact + compositionResult.penalty;
  }, 0);

  const avgStarterOvr = Math.round(effectiveLineupStrength / 5);

  // starters in lineup order
  const starters = lineupSummary.map(summary => {
    const player = team.roster.find(p => p.id === summary.playerId);
    return { player, summary };
  }).filter(s => s.player);

  // all played matches (newest first)
  const teamMatches = schedule
    .filter(m => m.played && (m.homeTeamId === team.id || m.awayTeamId === team.id))
    .reverse();

  // streak
  let streak = 0;
  let streakType: 'W' | 'L' | null = null;
  for (const match of teamMatches) {
    const isHome = match.homeTeamId === team.id;
    const ts = isHome ? match.result!.homeScore : match.result!.awayScore;
    const os = isHome ? match.result!.awayScore : match.result!.homeScore;
    const won = ts > os;
    if (streakType === null) { streakType = won ? 'W' : 'L'; streak = 1; }
    else if ((won && streakType === 'W') || (!won && streakType === 'L')) streak++;
    else break;
  }

  const showIglCol = (isUserTeam || devMode) && onSetIGL;
  const showManageRoster = onManageRoster && (isUserTeam || devMode);
  const rowCls = showIglCol ? 'has-igl' : '';

  // role composition strip data
  const CORE_ROLES: Role[] = ['duelist', 'controller', 'initiator', 'sentinel'];
  const rolePresence = CORE_ROLES.map(role => {
    const slot = lineup.find(s => s.assignedRole === role);
    if (!slot) return { role, status: 'missing' as const };
    const player = team.roster.find(p => p.id === slot.playerId);
    return { role, status: player?.role === role ? 'natural' as const : 'offrole' as const };
  });
  const flexSlots = lineup.filter(s => s.assignedRole === 'flex');

  // team attribute config using role icons instead of emoji
  const ATTR_CONFIG = [
    { key: 'firepower' as const, label: 'Firepower', icon: ROLE_ICONS.duelist },
    { key: 'utilityDepth' as const, label: 'Utility', icon: ROLE_ICONS.controller },
    { key: 'macroPlay' as const, label: 'Macro', icon: ROLE_ICONS.initiator },
    { key: 'mentalStrength' as const, label: 'Mental', icon: ROLE_ICONS.sentinel },
  ];

  const renderPlayerRow = (
    player: NonNullable<(typeof starters)[number]['player']>,
    assignedRole: Role,
    effectiveOvr: number,
    rolePenalty: number,
    iglBonus: number,
    isBench: boolean,
  ) => {
    const isIGL = team.iglId === player.id;
    const stage = getDevStage(player.age, player.development.peakAge);
    const archetype = ALL_ARCHETYPES[player.archetype]?.name || player.archetype.replace(/_/g, ' ');

    return (
      <div
        key={player.id}
        className={`tv-player-row ${isBench ? 'bench-row' : ''} ${rowCls}`}
        onClick={() => onViewPlayer(player.id)}
      >
        <div className="tv-player-identity">
          <PlayerAvatar
            playerId={player.id}
            playerName={player.name}
            imageUrl={player.imageUrl}
            nationality={player.nationality}
            size="sm"
          />
          <div className="tv-player-info">
            <div className="tv-player-name-row">
              <span className="tv-player-name">{player.name}</span>
              {isIGL && <span className="tv-igl-badge">IGL</span>}
            </div>
            <span className="tv-player-archetype">{archetype}</span>
          </div>
        </div>

        <div className={`tv-role-pill role-${assignedRole}`}>
          <img src={ROLE_ICONS[assignedRole]} alt="" />
          {assignedRole}
        </div>

        <div className="tv-stage">
          <span className={`stage-badge stage-${stage}`}>
            {STAGE_LABELS[stage]}
          </span>
        </div>

        <span className="tv-age">{player.age}</span>

        <div className="tv-ovr-cell">
          <span className={`tv-ovr-num ${getRatingClass(effectiveOvr)}`}>{effectiveOvr}</span>
          <span className={`tv-ovr-grade ${tvGradeClass(effectiveOvr)}`}>
            {toLetterGrade(effectiveOvr)}
          </span>
          {!isBench && rolePenalty !== 0 && (
            <span className={`tv-ovr-mod ${rolePenalty > 0 ? 'bonus' : 'penalty'}`}>
              {rolePenalty > 0 ? '+' : ''}{rolePenalty}
            </span>
          )}
          {!isBench && iglBonus !== 0 && (
            <span className={`tv-ovr-mod ${iglBonus > 0 ? 'bonus' : 'penalty'}`}>
              {iglBonus > 0 ? '+' : ''}{iglBonus}
            </span>
          )}
          {!isBench && compositionResult.penalty !== 0 && (
            <span className="tv-ovr-mod comp" title={compositionResult.description}>
              {compositionResult.penalty}
            </span>
          )}
        </div>

        <span className="tv-pot">{player.potential.ceiling}</span>

        {showIglCol && (
          <button
            className={`tv-igl-btn ${isIGL ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onSetIGL!(player.id); }}
            title={isIGL ? 'Current IGL' : 'Set as IGL'}
          >
            {isIGL ? '★' : '☆'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="team-view-container">
      {/* header */}
      <div className="content-header team-view-header">
        <img src={team.logo} alt={team.name} className="team-header-logo" />
        <h1>{team.name}</h1>
        {isUserTeam && <span className="team-badge">YOUR TEAM</span>}
        {devMode && !isUserTeam && <span className="team-badge dev-badge">DEV MODE</span>}

        <div className="team-header-actions">
          {onPrevTeam && (
            <button className="team-nav-btn" onClick={onPrevTeam} title="Previous team">
              <span className="nav-icon">‹</span><span>Prev</span>
            </button>
          )}
          {onNextTeam && (
            <button className="team-nav-btn" onClick={onNextTeam} title="Next team">
              <span>Next</span><span className="nav-icon">›</span>
            </button>
          )}
          {showManageRoster && (
            <button className="manage-roster-btn" onClick={onManageRoster}>
              {devMode && !isUserTeam ? '🔧' : '⚙️'} Manage Roster
            </button>
          )}
          {onEditTeam && (isUserTeam || devMode) && (
            <button className="edit-team-btn" onClick={onEditTeam}>✏️ Edit Team</button>
          )}
        </div>
      </div>

      {/* hero */}
      <div className="team-hero">
        <div className="team-hero-bg" style={{ backgroundImage: `url(${team.logo})` }} />
        <div className="team-hero-content">
          <img src={team.logo} alt={team.name} className="team-hero-logo" />
          <div className="team-hero-info">
            <div className="team-hero-meta">
              <span className="team-region-badge">{team.region.toUpperCase()}</span>
              <span className="team-founded">Est. {team.founded}</span>
            </div>
            <h1 className="team-hero-name">{team.name}</h1>
            <div className="team-hero-stats">
              <div className="hero-stat">
                <span className="hero-stat-value">{teamStanding?.wins}-{teamStanding?.losses}</span>
                <span className="hero-stat-label">Record</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value">{teamStanding?.mapWins}-{teamStanding?.mapLosses}</span>
                <span className="hero-stat-label">Maps</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className={`hero-stat-value ${(teamStanding?.roundDifferential ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                  {(teamStanding?.roundDifferential ?? 0) >= 0 ? '+' : ''}{teamStanding?.roundDifferential}
                </span>
                <span className="hero-stat-label">Round Diff</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className={`hero-stat-value ${streakType === 'W' ? 'positive' : 'negative'}`}>
                  {streak > 0 ? `${streakType}${streak}` : '—'}
                </span>
                <span className="hero-stat-label">Streak</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value">{effectiveLineupStrength}</span>
                <span className="hero-stat-label">Lineup STR</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value igl-value">
                  {iglPlayer ? <><InlineFlag code={iglPlayer.nationality} />{iglPlayer.name}</> : '—'}
                </span>
                <span className="hero-stat-label">IGL</span>
              </div>
              <div className="hero-stat-divider" />
              <div className="hero-stat">
                <span className="hero-stat-value igl-value">
                  {team.staff.headCoach ? <><InlineFlag code={team.staff.headCoach.nationality} />{team.staff.headCoach.name}</> : '—'}
                </span>
                <span className="hero-stat-label">Head Coach</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* team attributes with letter grades */}
      <div className="team-attributes-row">
        {ATTR_CONFIG.map(({ key, label, icon }) => {
          const val = team.attributes[key];
          return (
            <div key={key} className="team-attr-card">
              <div className="team-attr-top">
                <img src={icon} alt="" className="team-attr-icon" />
                <span className={`team-attr-grade ${tvGradeClass(val)}`}>
                  {toLetterGrade(val)}
                </span>
              </div>
              <div className="team-attr-value">{val}</div>
              <div className="team-attr-label">{label}</div>
              <div className="team-attr-bar">
                <div className="team-attr-bar-fill" style={{ width: `${val}%` }} />
              </div>
            </div>
          );
        })}
        <div className="team-attr-card team-attr-avg">
          <div className="team-attr-top">
            <img src={ROLE_ICONS.flex} alt="" className="team-attr-icon" />
            <span className={`team-attr-grade ${tvGradeClass(avgStarterOvr)}`}>
              {toLetterGrade(avgStarterOvr)}
            </span>
          </div>
          <div className="team-attr-value">{avgStarterOvr}</div>
          <div className="team-attr-label">Avg Starter</div>
          <div className="team-attr-bar">
            <div className="team-attr-bar-fill" style={{ width: `${avgStarterOvr}%` }} />
          </div>
        </div>
      </div>

      <div className="team-content-grid">
        {/* roster panel */}
        <div className="panel team-roster-panel">
          <div className="panel-header">
            <span>Roster</span>
            <span className="panel-header-sub">{team.roster.length} Players</span>
          </div>

          {/* role composition strip */}
          <div className="tv-comp-strip">
            <span className="tv-comp-label">Comp</span>
            {rolePresence.map(({ role, status }) => (
              <span key={role} className={`tv-comp-pill role-${status}`}>
                <img src={ROLE_ICONS[role]} alt="" />
                {role}
              </span>
            ))}
            {flexSlots.map((s, i) => (
              <span key={`flex-${i}`} className="tv-comp-pill role-natural">
                <img src={ROLE_ICONS.flex} alt="" />
                flex
              </span>
            ))}
            {compositionResult.penalty !== 0 ? (
              <span className={`tv-comp-penalty ${
                compositionResult.penalty >= -3 ? 'penalty-minor' :
                compositionResult.penalty >= -6 ? 'penalty-moderate' : 'penalty-severe'
              }`} title={compositionResult.description}>
                {compositionResult.penalty} STR
              </span>
            ) : (
              <span className="tv-comp-penalty penalty-none">✓</span>
            )}
          </div>

          {/* starters */}
          <div className="roster-section-header">Starting Lineup</div>
          <div className={`tv-roster-header ${rowCls}`}>
            <span>Player</span>
            <span className="th-center">Role</span>
            <span className="th-center">Stage</span>
            <span className="th-center">Age</span>
            <span className="th-center">OVR</span>
            <span className="th-center">POT</span>
            {showIglCol && <span className="th-center">IGL</span>}
          </div>

          <div className="tv-roster-list">
            {starters.map(({ player, summary }) => {
              if (!player) return null;
              const iglResult = calculateEffectiveOverallWithIGL(
                player, team, lineup, summary.penalty, compositionResult.penalty,
              );
              return renderPlayerRow(
                player,
                summary.assignedRole,
                iglResult.effectiveOvr,
                summary.penalty,
                iglResult.iglBonus,
                false,
              );
            })}
          </div>

          {/* bench */}
          {benchPlayers.length > 0 && (
            <>
              <div className="roster-section-header bench-header">Bench ({benchPlayers.length})</div>
              <div className="tv-roster-list">
                {benchPlayers.map(player =>
                  renderPlayerRow(player, player.role, player.overall, 0, 0, true)
                )}
              </div>
            </>
          )}
        </div>

        {/* match history */}
        <div className="panel team-history-panel">
          <div className="panel-header">
            <span>Match History</span>
            <span className="panel-header-sub">{teamMatches.length} Games</span>
          </div>
          <div className="panel-body team-history-body">
            {teamMatches.length === 0 ? (
              <div className="tv-empty-state">
                <div className="tv-empty-icon">📅</div>
                <div>No matches played yet</div>
              </div>
            ) : (
              teamMatches.map(match => {
                const isHome = match.homeTeamId === team.id;
                const opponent = teams.find(t => t.id === (isHome ? match.awayTeamId : match.homeTeamId));
                const ts = isHome ? match.result!.homeScore : match.result!.awayScore;
                const os = isHome ? match.result!.awayScore : match.result!.homeScore;
                const won = ts > os;

                return (
                  <div
                    key={match.id}
                    className="tv-match-card"
                    onClick={() => onViewMatch(match.id)}
                  >
                    <div className={`tv-match-indicator ${won ? 'win' : 'loss'}`} />
                    <div className="tv-match-body">
                      <div className="tv-match-top">
                        <span className={`tv-match-wl ${won ? 'win' : 'loss'}`}>
                          {won ? 'W' : 'L'}
                        </span>
                        <span className="tv-match-vs">
                          vs
                          {opponent && <img src={opponent.logo} alt="" />}
                          {opponent?.abbreviation || '???'}
                        </span>
                        <span className={`tv-match-score ${won ? 'win' : 'loss'}`}>
                          {ts}-{os}
                        </span>
                      </div>

                      <div className="tv-match-maps">
                        {match.result!.mapScores.map((ms, i) => {
                          const hr = isHome ? ms.homeRounds : ms.awayRounds;
                          const ar = isHome ? ms.awayRounds : ms.homeRounds;
                          const mapWon = hr > ar;
                          return (
                            <span key={i} className={`tv-map-score ${mapWon ? 'map-win' : 'map-loss'}`}>
                              {ms.map} {hr}-{ar}
                            </span>
                          );
                        })}
                      </div>

                      <div className="tv-match-meta">Day {match.day}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
