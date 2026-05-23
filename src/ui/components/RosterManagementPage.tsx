// src/ui/components/RosterManagementPage.tsx
// Roster management UI for ValorantGM

import React, { useState } from 'react';
import type { Player, Role, Team } from '../../types';
import type { StartingSlot } from '../../types/roster';
import { STANDARD_ROLES, getRolePenalty } from '../../types/roster';
import { ALL_ARCHETYPES } from '../../data/archetypes';
import {
  getBenchPlayers,
  getLineupSummary,
} from '../../sim/rosterManagement';
import {
  calculateIGLBonus,
  getIGLBonusForPlayer,
} from '../../sim/iglBonus';
import { analyzeComposition, } from '../../sim/compositionBonus';
import './RosterManagementPage.css';
import { getAgentsByRole, getAllAgents, DEFAULT_AGENT_ROLES, getRolesForAgent } from '../../data/agentRoles';
import { MAPS } from '../../sim/matchSim';
import { FlagPicker, FlagImg } from './MassPlayerEditor';
import { toLetterGrade, getGradeClassFromValue } from '../../utils/letterGrade';
import { coachMod, specMod } from '../../sim/coachBonus';

interface RosterManagementPageProps {
  team: Team;
  onUpdateLineup: (lineup: StartingSlot[]) => void;
  onUpdateIGL: (playerId: string | null) => void;
  onBack: () => void;
  onViewPlayer: (playerId: string) => void;
  onNavigateToFreeAgency: () => void;
  onReleasePlayer?: (playerId: string) => void;
  onDeletePlayer?: (playerId: string) => void;
  isDevMode?: boolean;
  isUserTeam?: boolean;
  agentVariance?: number;
  onUpdateAgentVariance?: (val: number) => void;
  mapPool?: string[];
  customMapNames?: string[];
  userMapComp?: Record<string, Partial<Record<string, string>>>;
  onUpdateUserMapComp?: (comp: Record<string, Partial<Record<string, string>>>) => void;
  agentRoleOverrides?: Record<string, string[]>;
  disabledAgents?: string[];
  userMapCompNoPenalty?: Record<string, string[]>;
  onUpdateUserMapCompNoPenalty?: (np: Record<string, string[]>) => void;
  teamMapCompBuffs?: Record<string, Record<string, number>>;
  onUpdateTeamMapCompBuffs?: (buffs: Record<string, Record<string, number>>) => void;
  freeAgentCoaches?: import('../../types/team').StaffMember[];
  onHireCoach?: (coachId: string) => void;
  onFireCoach?: () => void;
  onSaveCoach?: (coach: import('../../types/team').StaffMember) => void;
  onHireAssistant?: (coachId: string) => void;
  onFireAssistant?: () => void;
  onSaveAssistant?: (coach: import('../../types/team').StaffMember) => void;
  onHireAnalyst?: (coachId: string) => void;
  onFireAnalyst?: () => void;
  onSaveAnalyst?: (coach: import('../../types/team').StaffMember) => void;
}

export const RosterManagementPage: React.FC<RosterManagementPageProps> = ({
  team,
  onUpdateLineup,
  onUpdateIGL,
  onBack,
  onViewPlayer,
  onNavigateToFreeAgency,
  onReleasePlayer,
  onDeletePlayer,
  isDevMode = false,
  isUserTeam = true,
  agentVariance = 15,
  onUpdateAgentVariance,
  mapPool = [],
  customMapNames = [],
  userMapComp = {},
  onUpdateUserMapComp,
  agentRoleOverrides = {},
  disabledAgents = [],
  userMapCompNoPenalty = {},
  onUpdateUserMapCompNoPenalty,
  teamMapCompBuffs = {},
  onUpdateTeamMapCompBuffs,
  freeAgentCoaches = [],
  onHireCoach,
  onFireCoach,
  onSaveCoach,
  onHireAssistant,
  onFireAssistant,
  onSaveAssistant,
  onHireAnalyst,
  onFireAnalyst,
  onSaveAnalyst,
}) => {
  const [selectedBenchPlayer, setSelectedBenchPlayer] = useState<string | null>(null);
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [showCoachEditor, setShowCoachEditor] = useState(false);
  const [coachDraft, setCoachDraft] = useState({ name: '', rating: 70, specialty: ['tactical'] as ('development' | 'tactical' | 'mental')[], nationality: '' });
  const [staffEditRole, setStaffEditRole] = useState<'headCoach' | 'assistantCoach' | 'analyst'>('headCoach');
  const [staffHireRole, setStaffHireRole] = useState<'headCoach' | 'assistantCoach' | 'analyst'>('headCoach');
  const [expandedCompMap, setExpandedCompMap] = useState<string | null>(null);
  const disabledSet = new Set(disabledAgents);

  // all agents sorted by role group for the agent picker
  const getAllAgentsSorted = (overrides?: Record<string, string[]>) => {
    const roles = ['duelist','controller','initiator','sentinel'] as const;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const role of roles) {
      for (const agent of getAgentsByRole(role as any, overrides as any)) {
        if (!seen.has(agent)) { seen.add(agent); result.push(agent); }
      }
    }
    // any remaining agents not covered by the 4 roles
    for (const agent of getAllAgents(overrides as any)) {
      if (!seen.has(agent)) result.push(agent);
    }
    return result;
  };
  const [swapMode, setSwapMode] = useState<'none' | 'selecting'>('none');
  const [autoSwapRoles, setAutoSwapRoles] = useState(() => {
    const saved = localStorage.getItem('vgm-autoSwapRoles');
    return saved !== null ? saved === 'true' : true;
  });

  const handleAutoSwapToggle = (val: boolean) => {
    setAutoSwapRoles(val);
    localStorage.setItem('vgm-autoSwapRoles', String(val));
  };
  const [confirmCut, setConfirmCut] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const roster = team.roster;
  const lineup: StartingSlot[] = team.startingLineup || roster.slice(0, 5).map(p => ({
    playerId: p.id,
    assignedRole: p.role,
  }));
  const benchPlayers = getBenchPlayers(roster, lineup);
  const lineupSummary = getLineupSummary(roster, lineup);

  // Analyze composition for penalties
  const compositionResult = analyzeComposition(lineup);

  // Calculate IGL bonus first (needed for effective lineup strength)
  const iglBonusResult = calculateIGLBonus(team, lineup);

  // Calculate effective lineup strength including IGL bonus and composition penalty
  const getPlayerById = (id: string) => roster.find(p => p.id === id);
  
  const effectiveLineupStrength = lineupSummary.reduce((total, summary) => {
    const player = getPlayerById(summary.playerId);
    const iglBonus = player ? getIGLBonusForPlayer(player, team, lineup) : 0;
    const iglOvrImpact = Math.round(iglBonus * 0.5);
    return total + summary.effectiveOverall + iglOvrImpact + compositionResult.penalty;
  }, 0);

  // Calculate stats
  const avgStarterOvr = Math.round(effectiveLineupStrength / 5);
  const avgBenchOvr = benchPlayers.length > 0 
    ? Math.round(benchPlayers.reduce((sum, p) => sum + p.overall, 0) / benchPlayers.length)
    : 0;
  const playersInNaturalRole = lineupSummary.filter(s => s.penalty === 0).length;

  const handleRoleChange = (playerId: string, newRole: Role) => {
    const currentSlot = lineup.find(s => s.playerId === playerId);
    if (!currentSlot) return;

    if (autoSwapRoles) {
      // Auto-swap mode: swap roles between players
      const targetSlot = lineup.find(s => s.assignedRole === newRole);
      if (!targetSlot || currentSlot === targetSlot) return;

      const newLineup = lineup.map(slot => {
        if (slot.playerId === playerId) {
          return { ...slot, assignedRole: newRole };
        }
        if (slot.playerId === targetSlot.playerId) {
          return { ...slot, assignedRole: currentSlot.assignedRole };
        }
        return slot;
      });

      onUpdateLineup(newLineup);
    } else {
      // Free assignment mode: just change this player's role
      const newLineup = lineup.map(slot => {
        if (slot.playerId === playerId) {
          return { ...slot, assignedRole: newRole };
        }
        return slot;
      });

      onUpdateLineup(newLineup);
    }
  };

  const handleSwapWithBench = (starterPlayerId: string, benchPlayerId: string) => {
    const starterSlot = lineup.find(s => s.playerId === starterPlayerId);
    if (!starterSlot) return;

    const newLineup = lineup.map(slot =>
      slot.playerId === starterPlayerId
        ? { playerId: benchPlayerId, assignedRole: starterSlot.assignedRole }
        : slot
    );

    onUpdateLineup(newLineup);
    setSelectedBenchPlayer(null);
    setSwapMode('none');
  };

  const handleStarterClick = (playerId: string) => {
    if (selectedBenchPlayer) {
      handleSwapWithBench(playerId, selectedBenchPlayer);
    }
  };

  const handleBenchClick = (playerId: string) => {
    if (selectedBenchPlayer === playerId) {
      setSelectedBenchPlayer(null);
      setSwapMode('none');
    } else {
      setSelectedBenchPlayer(playerId);
      setSwapMode('selecting');
    }
  };

  const cancelSwap = () => {
    setSelectedBenchPlayer(null);
    setSwapMode('none');
  };

  const handleCutClick = (playerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmCut === playerId) {
      if (onReleasePlayer) onReleasePlayer(playerId);
      setConfirmCut(null);
      setSelectedBenchPlayer(null);
    } else {
      setConfirmCut(playerId);
      setConfirmDelete(null);
    }
  };

  const handleDeleteClick = (playerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete === playerId) {
      if (onDeletePlayer) onDeletePlayer(playerId);
      setConfirmDelete(null);
      setSelectedBenchPlayer(null);
    } else {
      setConfirmDelete(playerId);
      setConfirmCut(null);
    }
  };

  const formatRole = (role: Role) => role.charAt(0).toUpperCase() + role.slice(1);

  const getPenaltyClass = (penalty: number) => {
    if (penalty === 0) return 'penalty-none';
    if (penalty >= -3) return 'penalty-minor';
    if (penalty >= -6) return 'penalty-moderate';
    return 'penalty-severe';
  };

  const getOvrClass = (ovr: number) => {
    if (ovr >= 85) return 'elite';
    if (ovr >= 80) return 'great';
    if (ovr >= 75) return 'good';
    if (ovr >= 70) return 'average';
    return 'below';
  };

  return (
    <div className="roster-management-page">
      {/* Header */}
      <div className="rm-header">
        <button className="back-button" onClick={onBack}>
          <span className="back-icon">←</span>
          Back to Team
        </button>
        <div className="rm-title">
          {team.logo && <img src={team.logo} alt={team.name} className="team-logo" />}
          <div className="title-text">
            <h1>
              Roster Management
              {isDevMode && !isUserTeam && (
                <span className="dev-mode-title-badge">DEV MODE</span>
              )}
            </h1>
            <span className="subtitle">{team.name}</span>
          </div>
        </div>
        <div className="rm-actions">
          {isUserTeam && (
            <button className="fa-btn" onClick={onNavigateToFreeAgency}>
              <span className="btn-icon">📋</span>
              <span className="btn-text">Free Agency</span>
            </button>
          )}
        </div>
      </div>

      {/* Dev Mode Banner */}
      {isDevMode && !isUserTeam && (
        <div className="dev-mode-banner">
          <span className="dev-icon">🔧</span>
          <span className="dev-text">
            <strong>Dev Mode Active</strong> — You are editing <strong>{team.name}</strong>'s roster
          </span>
        </div>
      )}

      {/* Stats Overview */}
      <div className="rm-stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <span className="stat-value">
              {effectiveLineupStrength}
              {(() => {
                const c = team.staff.headCoach;
                if (!c) return null;
                const cm = coachMod(c.rating);
                // total coach pts across attributes, weighted same as getTeamStrength
                const macro = cm * 5 * specMod(c.specialty, 'tactical');
                const mental = cm * 3 * specMod(c.specialty, 'mental');
                const util = cm * 2 * specMod(c.specialty, 'tactical');
                const total = Math.round((macro * 0.25 + util * 0.2 + mental * 0.2) * 10) / 10;
                if (total === 0) return null;
                return <span className={`rm-coach-badge ${total > 0 ? 'bonus' : 'penalty'}`}>{total > 0 ? '+' : ''}{total}</span>;
              })()}
            </span>
            <span className="stat-label">Lineup Strength</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-content">
            <span className="stat-value">{avgStarterOvr}</span>
            <span className="stat-label">Avg Starter OVR</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-content">
            <span className="stat-value">{playersInNaturalRole}/5</span>
            <span className="stat-label">Natural Fits</span>
          </div>
        </div>
        <div className={`stat-card ${iglBonusResult.bonus > 0 ? 'positive' : iglBonusResult.bonus < 0 ? 'negative' : ''}`}>
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <span className={`stat-value ${iglBonusResult.bonus > 0 ? 'positive' : iglBonusResult.bonus < 0 ? 'negative' : ''}`}>
              {Math.round(iglBonusResult.bonus * 0.5) > 0 ? '+' : ''}{Math.round(iglBonusResult.bonus * 0.5)}
            </span>
            <span className="stat-label">IGL OVR</span>
          </div>
        </div>
        <div className={`stat-card ${compositionResult.isValid ? '' : 'negative'}`}>
          <div className="stat-icon">🧩</div>
          <div className="stat-content">
            <span className={`stat-value ${compositionResult.penalty < 0 ? 'negative' : ''}`}>
              {compositionResult.penalty === 0 ? '✓' : compositionResult.penalty}
            </span>
            <span className="stat-label">Comp Bonus</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-content">
            <span className="stat-value">{roster.length}/10</span>
            <span className="stat-label">Roster Size</span>
          </div>
        </div>
      </div>

      {/* Composition Warning Banner */}
      {!compositionResult.isValid && (
        <div className="composition-warning-banner">
          <span className="warning-icon">⚠️</span>
          <div className="warning-content">
            <strong>Unbalanced Composition</strong>
            <span>Missing: {compositionResult.missingRoles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}</span>
            <span className="penalty-text">{compositionResult.penalty} OVR to all players</span>
          </div>
        </div>
      )}

      {/* IGL Status Banner */}
      {(() => {
        const iglPlayer = team.iglId ? roster.find(p => p.id === team.iglId) : null;
        const iglInLineup = lineup.some(s => s.playerId === team.iglId);
        // Calculate the OVR impact (which is different from raw stat bonus)
        const ovrImpact = Math.round(iglBonusResult.bonus * 0.5);
        
        if (iglBonusResult.hasIGL) {
          // IGL is in lineup
          return (
            <div className={`igl-status-banner ${iglBonusResult.bonus >= 0 ? 'positive' : 'negative'}`}>
              <span className="igl-icon">🎯</span>
              <span className="igl-info">
                <strong>{iglBonusResult.iglName}</strong> is shotcalling 
                <span className="igl-stat">(IQ: {iglBonusResult.iglGameSense})</span>
                {ovrImpact !== 0 && (
                  <span className={`igl-effect ${ovrImpact > 0 ? 'buff' : 'debuff'}`}>
                    {ovrImpact > 0 ? '+' : ''}{ovrImpact} OVR to teammates
                  </span>
                )}
              </span>
            </div>
          );
        } else if (iglPlayer && !iglInLineup) {
          // IGL assigned but benched
          return (
            <div className="igl-status-banner warning">
              <span className="igl-icon">⚠️</span>
              <span className="igl-info">
                <strong>{iglPlayer.name}</strong> is designated IGL but benched
                <span className="igl-effect debuff">-1 OVR to all starters</span>
              </span>
            </div>
          );
        } else {
          // No IGL assigned
          return (
            <div className="igl-status-banner warning">
              <span className="igl-icon">⚠️</span>
              <span className="igl-info">
                <strong>No IGL assigned!</strong>
                <span className="igl-effect debuff">-1 OVR to all starters</span>
              </span>
            </div>
          );
        }
      })()}

      {/* Swap Mode Banner */}
      {swapMode === 'selecting' && (
        <div className="swap-banner">
          <div className="swap-pulse"></div>
          <span className="swap-message">
            <strong>{getPlayerById(selectedBenchPlayer!)?.name}</strong> selected — Click a starter to swap positions
          </span>
          <button className="cancel-swap" onClick={cancelSwap}>Cancel</button>
        </div>
      )}

      {/* Starting Lineup */}
      <div className="rm-section">
        <div className="section-header">
          <h2>
            <span className="section-icon">⭐</span>
            Starting Five
          </h2>
          <div className="section-controls">
            {onUpdateAgentVariance && (
              <div className="rm-variance-control">
                <div className="rm-variance-label-group">
                  <span className="rm-variance-title">Agent Strictness</span>
                </div>
                <div className="rm-variance-slider-group">
                  <span className="rm-variance-tick strict">Strict</span>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={agentVariance}
                    onChange={e => onUpdateAgentVariance(Number(e.target.value))}
                    className="rm-variance-slider"
                  />
                  <span className="rm-variance-tick loose">Loose</span>
                  <div className="rm-variance-badge">
                    <span className="rm-variance-value">{agentVariance}%</span>
                    <span className="rm-variance-preset">
                      {agentVariance <= 10 ? 'Pro-style' :
                       agentVariance <= 20 ? 'Realistic' :
                       agentVariance <= 35 ? 'Creative' : 'Chaotic'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <label className="toggle-label" title={autoSwapRoles ? "Roles will swap between players when changed" : "Roles can be freely assigned (may cause duplicates)"}>
              <input
                type="checkbox"
                checked={autoSwapRoles}
                onChange={(e) => handleAutoSwapToggle(e.target.checked)}
              />
              <span className="toggle-text">Auto-swap roles</span>
            </label>
            <span className="section-hint">Click bench player then starter to swap</span>
          </div>
        </div>

        <div className="lineup-grid">
          {lineupSummary.map(summary => {
            const player = getPlayerById(summary.playerId);
            const archetype = player ? ALL_ARCHETYPES[player.archetype] : null;
            const isSwapTarget = swapMode === 'selecting';
            const isIGL = player?.id === team.iglId;
            
            // Calculate IGL bonus for this player (0 if they are the IGL)
            const iglBonus = player ? getIGLBonusForPlayer(player, team, lineup) : 0;
            const iglOvrImpact = Math.round(iglBonus * 0.5);
            const finalEffectiveOvr = summary.effectiveOverall + iglOvrImpact + compositionResult.penalty;
            
            return (
              <div 
                key={summary.playerId} 
                className={`lineup-card ${isSwapTarget ? 'swap-target' : ''} ${getPenaltyClass(summary.penalty)} ${isIGL ? 'is-igl' : ''}`}
                onClick={() => isSwapTarget && handleStarterClick(summary.playerId)}
              >
                <div className="lineup-card-accent"></div>
                
                <div className="lineup-card-header">
                  <select
                    value={summary.assignedRole}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleRoleChange(summary.playerId, e.target.value as Role);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={`role-select ${summary.assignedRole}`}
                  >
                    {STANDARD_ROLES.map(role => (
                      <option key={role} value={role}>{formatRole(role)}</option>
                    ))}
                  </select>
                  <div className={`effective-ovr ${getPenaltyClass(summary.penalty)}`}>
                    <span className="ovr-value">{finalEffectiveOvr}</span>
                    <div className="ovr-modifiers">
                      {summary.penalty !== 0 && (
                        <span className="modifier role-modifier">
                          ({summary.penalty > 0 ? '+' : ''}{summary.penalty})
                        </span>
                      )}
                      {iglOvrImpact !== 0 && (
                        <span className={`modifier igl-modifier ${iglOvrImpact > 0 ? 'buff' : 'debuff'}`}>
                          ({iglOvrImpact > 0 ? '+' : ''}{iglOvrImpact})
                        </span>
                      )}
                      {compositionResult.penalty !== 0 && (
                        <span className="modifier comp-modifier debuff" title={compositionResult.description}>
                          ({compositionResult.penalty})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="lineup-card-body">
                  <div className="player-info">
                    <div className="player-name-row">
                      <span 
                        className="player-name clickable"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewPlayer(summary.playerId);
                        }}
                      >
                        {summary.playerName}
                      </span>
                      {isIGL && <span className="igl-badge-inline">IGL</span>}
                    </div>
                    {archetype && (
                      <span className="player-archetype" title={archetype.description}>
                        {archetype.name}
                      </span>
                    )}
                  </div>
                  
                  <div className="player-meta">
                    <div className="meta-item">
                      <span className="meta-label">Natural</span>
                      <span className={`natural-role ${summary.naturalRole}`}>
                        {formatRole(summary.naturalRole)}
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Base</span>
                      <span className="base-ovr">{summary.baseOverall}</span>
                    </div>
                    {player && (
                      <div className="meta-item">
                        <span className="meta-label">IQ</span>
                        <span className="player-iq">{player.ratings.gameSense}</span>
                      </div>
                    )}
                  </div>

                  {/* IGL Action Footer - moved to bottom of card */}
                  {!isIGL && (
                    <div className="card-footer-actions">
                      <button
                        className="set-igl-btn-footer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateIGL(summary.playerId);
                        }}
                        title={`Set ${summary.playerName} as IGL`}
                      >
                        <span className="igl-icon-small">👑</span>
                        Set as IGL
                      </button>
                    </div>
                  )}
                </div>

                {isSwapTarget && (
                  <div className="swap-overlay">
                    <span className="swap-icon">↓</span>
                    <span>Click to swap</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bench */}
      <div className="rm-section">
        <div className="section-header">
          <h2>
            <span className="section-icon">🪑</span>
            Bench
            <span className="bench-count">{benchPlayers.length}</span>
          </h2>
          {benchPlayers.length > 0 && (
            <span className="section-hint">
              Avg OVR: {avgBenchOvr} • Click a player to swap with a starter
            </span>
          )}
        </div>

        {benchPlayers.length === 0 ? (
          <div className="empty-bench">
            <div className="empty-icon">📋</div>
            <p>No players on bench</p>
            <span>Sign free agents to add roster depth</span>
            {isUserTeam && (
              <button className="empty-action" onClick={onNavigateToFreeAgency}>
                Browse Free Agents
              </button>
            )}
          </div>
        ) : (
          <div className="bench-grid">
            {benchPlayers.map(player => {
              const isSelected = selectedBenchPlayer === player.id;
              const bestRole = findBestRole(player);
              const archetype = ALL_ARCHETYPES[player.archetype];
              const isBenchedIGL = player.id === team.iglId;
              
              return (
                <div 
                  key={player.id} 
                  className={`bench-card ${isSelected ? 'selected' : ''} ${isBenchedIGL ? 'benched-igl' : ''}`}
                  onClick={() => handleBenchClick(player.id)}
                >
                  {isBenchedIGL && (
                    <div className="benched-igl-badge">IGL (Benched)</div>
                  )}
                  
                  <div className="bench-card-top">
                    <div className="bench-player-info">
                      <span 
                        className="player-name clickable"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewPlayer(player.id);
                        }}
                      >
                        {player.name}
                      </span>
                      {archetype && (
                        <span className="player-archetype" title={archetype.description}>
                          {archetype.name}
                        </span>
                      )}
                    </div>
                    <div className={`bench-ovr ${getOvrClass(player.overall)}`}>
                      {player.overall}
                    </div>
                  </div>

                  <div className="bench-card-middle">
                    <span className={`role-badge ${player.role}`}>
                      {formatRole(player.role)}
                    </span>
                    <span className="player-age">{player.age} yrs</span>
                    <span className="bench-iq">IQ: {player.ratings.gameSense}</span>
                  </div>

                  <div className="bench-card-bottom">
                    <div className="best-fit">
                      <span className="fit-label">Best fit:</span>
                      <span className={`fit-role ${bestRole.role}`}>{formatRole(bestRole.role)}</span>
                      <span className="fit-ovr">({bestRole.effectiveOvr} eff)</span>
                    </div>
                  </div>

                  <div className="bench-card-actions">
                    {!isBenchedIGL && (
                      <button
                        className="bench-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateIGL(player.id);
                        }}
                        title={`Set ${player.name} as IGL`}
                      >
                        Set IGL
                      </button>
                    )}
                    {isUserTeam && onReleasePlayer && roster.length > 5 && (
                      <button
                        className={`bench-action-btn bench-action-warn ${confirmCut === player.id ? 'confirming' : ''}`}
                        onClick={(e) => handleCutClick(player.id, e)}
                        onBlur={() => setConfirmCut(null)}
                        title={confirmCut === player.id ? 'Click again to confirm' : `Release ${player.name} to free agency`}
                      >
                        {confirmCut === player.id ? 'Confirm Cut?' : 'Cut'}
                      </button>
                    )}
                    {isDevMode && onDeletePlayer && (
                      <button
                        className={`bench-action-btn bench-action-danger ${confirmDelete === player.id ? 'confirming' : ''}`}
                        onClick={(e) => handleDeleteClick(player.id, e)}
                        onBlur={() => setConfirmDelete(null)}
                        title={confirmDelete === player.id ? 'Click again to permanently delete' : `Permanently delete ${player.name}`}
                      >
                        {confirmDelete === player.id ? 'Confirm Delete?' : 'Delete'}
                      </button>
                    )}
                  </div>

                  {isSelected && (
                    <div className="selected-indicator">
                      <span className="check-icon">✓</span>
                      <span>Selected</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Role Penalty Legend */}
      <div className="rm-legend">
        <div className="legend-section">
          <h3>Role Penalty Guide</h3>
          <p className="legend-description">
            Players perform best in their natural role. Off-role assignments receive OVR penalties.
          </p>
          <div className="legend-items">
            <div className="legend-item">
              <span className="legend-dot penalty-none"></span>
              <div className="legend-text">
                <span className="legend-title">Natural Fit</span>
                <span className="legend-value">No penalty</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot penalty-minor"></span>
              <div className="legend-text">
                <span className="legend-title">Minor Adjustment</span>
                <span className="legend-value">-2 to -3 OVR</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot penalty-moderate"></span>
              <div className="legend-text">
                <span className="legend-title">Off-Role</span>
                <span className="legend-value">-5 to -6 OVR</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot penalty-severe"></span>
              <div className="legend-text">
                <span className="legend-title">Wrong Role</span>
                <span className="legend-value">-8 to -12 OVR</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="legend-section">
          <h3>IGL Bonus System</h3>
          <p className="legend-description">
            The IGL's Game Sense affects teammate stats. Neutral at 70 IQ, scales ±0.15 per point.
          </p>
          <div className="legend-items igl-legend">
            <div className="legend-item">
              <span className="legend-dot igl-elite"></span>
              <div className="legend-text">
                <span className="legend-title">Elite IGL (85+ IQ)</span>
                <span className="legend-value">+2 to +4 Comm/IQ/Util</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot igl-good"></span>
              <div className="legend-text">
                <span className="legend-title">Good IGL (75-84 IQ)</span>
                <span className="legend-value">+1 to +2 Comm/IQ/Util</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot igl-neutral"></span>
              <div className="legend-text">
                <span className="legend-title">Average IGL (65-74 IQ)</span>
                <span className="legend-value">No bonus or minor penalty</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot igl-poor"></span>
              <div className="legend-text">
                <span className="legend-title">Poor IGL / No IGL</span>
                <span className="legend-value">-2 to -4 Comm/IQ/Util</span>
              </div>
            </div>
          </div>
        </div>

        <div className="legend-section">
          <h3>Team Composition</h3>
          <p className="legend-description">
            Teams need one of each core role. Missing a core role penalizes all players.
          </p>
          <div className="legend-items comp-legend">
            <div className="legend-item">
              <span className="legend-dot comp-balanced"></span>
              <div className="legend-text">
                <span className="legend-title">Balanced (all roles)</span>
                <span className="legend-value">No penalty</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot comp-missing"></span>
              <div className="legend-text">
                <span className="legend-title">Missing 1 role</span>
                <span className="legend-value">-1 OVR to all players</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot comp-severe"></span>
              <div className="legend-text">
                <span className="legend-title">Missing 2+ roles</span>
                <span className="legend-value">-2+ OVR to all players</span>
              </div>
            </div>
          </div>
          <p className="legend-note">
            Core roles: Duelist, Controller, Initiator, Sentinel. Flex can fill any role.
          </p>
        </div>
      </div>

      {/* Staff section */}
      <div className="rm-section rm-section-staff">
        <div className="section-header">
          <h2><span className="section-icon">📋</span>Coaching Staff</h2>
        </div>
        <div className="rm-staff-card">
          {team.staff.headCoach ? (
            <div className="rm-coach-info">
              <div className="rm-coach-main">
                {team.staff.headCoach.nationality && <FlagImg code={team.staff.headCoach.nationality} size={22} />}
                <span className="rm-coach-name">{team.staff.headCoach.name}</span>
              </div>
              <div className="rm-coach-details">
                <span className="rm-coach-rating">Rating: {team.staff.headCoach.rating}</span>
                {team.staff.headCoach.specialty && (Array.isArray(team.staff.headCoach.specialty) ? team.staff.headCoach.specialty : [team.staff.headCoach.specialty]).map(s =>
                  <span key={s} className={`rm-coach-spec rm-coach-spec--${s}`}>{s}</span>
                )}
              </div>
              <div className="rm-coach-actions">
                {onSaveCoach && (
                  <button className="bench-action-btn" onClick={() => {
                    const c = team.staff.headCoach!;
                    const sp = c.specialty;
                    const specArr = Array.isArray(sp) ? sp : sp ? [sp] : ['tactical' as const];
                    setCoachDraft({ name: c.name, rating: c.rating, specialty: specArr, nationality: c.nationality ?? '' });
                    setStaffEditRole('headCoach');
                    setShowCoachEditor(true);
                  }}>Edit</button>
                )}
                {onFireCoach && isUserTeam && (
                  <button className="bench-action-btn bench-action-danger" onClick={onFireCoach}>Fire</button>
                )}
                {onHireCoach && isUserTeam && (
                  <button className="bench-action-btn" onClick={() => { setStaffHireRole('headCoach'); setShowCoachModal(true); }}>Replace</button>
                )}
              </div>
              {(() => {
                const c = team.staff.headCoach!;
                const cm = coachMod(c.rating);
                const impacts = [
                  { label: 'Macro', value: Math.round(cm * 5 * specMod(c.specialty, 'tactical') * 10) / 10 },
                  { label: 'Mental', value: Math.round(cm * 3 * specMod(c.specialty, 'mental') * 10) / 10 },
                  { label: 'Utility', value: Math.round(cm * 2 * specMod(c.specialty, 'tactical') * 10) / 10 },
                  { label: 'Firepower', value: 0 },
                ];
                return (
                  <div className="rm-coach-impact">
                    <span className="rm-coach-impact-title">Coach Impact</span>
                    <div className="rm-coach-impact-grid">
                      {impacts.map(i => (
                        <div key={i.label} className="rm-coach-impact-cell">
                          <span className="rm-coach-impact-label">{i.label}</span>
                          <span className={`rm-coach-impact-value ${i.value > 0 ? 'bonus' : i.value < 0 ? 'penalty' : ''}`}>
                            {i.value > 0 ? '+' : ''}{i.value === 0 ? '—' : i.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="rm-coach-empty">
              <span>No head coach assigned</span>
              {onSaveCoach && (
                <button className="bench-action-btn" onClick={() => {
                  setCoachDraft({ name: '', rating: 70, specialty: ['tactical'], nationality: '' });
                  setStaffEditRole('headCoach');
                  setShowCoachEditor(true);
                }}>Create Coach</button>
              )}
              {onHireCoach && isUserTeam && freeAgentCoaches.length > 0 && (
                <button className="bench-action-btn" onClick={() => { setStaffHireRole('headCoach'); setShowCoachModal(true); }}>Hire from FA</button>
              )}
            </div>
          )}
        </div>

        {/* assistant coach */}
        <div className="rm-staff-card">
          <div className="rm-staff-role-label">Assistant Coach</div>
          {team.staff.assistantCoach ? (
            <div className="rm-coach-info">
              <div className="rm-coach-main">
                {team.staff.assistantCoach.nationality && <FlagImg code={team.staff.assistantCoach.nationality} size={22} />}
                <span className="rm-coach-name">{team.staff.assistantCoach.name}</span>
              </div>
              <div className="rm-coach-details">
                <span className="rm-coach-rating">Rating: {team.staff.assistantCoach.rating}</span>
                {team.staff.assistantCoach.specialty && (Array.isArray(team.staff.assistantCoach.specialty) ? team.staff.assistantCoach.specialty : [team.staff.assistantCoach.specialty]).map(s =>
                  <span key={s} className={`rm-coach-spec rm-coach-spec--${s}`}>{s}</span>
                )}
              </div>
              <div className="rm-coach-actions">
                {onSaveAssistant && (
                  <button className="bench-action-btn" onClick={() => {
                    const c = team.staff.assistantCoach!;
                    const specArr = Array.isArray(c.specialty) ? c.specialty : c.specialty ? [c.specialty] : ['tactical' as const];
                    setCoachDraft({ name: c.name, rating: c.rating, specialty: specArr, nationality: c.nationality ?? '' });
                    setStaffEditRole('assistantCoach');
                    setShowCoachEditor(true);
                  }}>Edit</button>
                )}
                {onFireAssistant && isUserTeam && (
                  <button className="bench-action-btn bench-action-danger" onClick={onFireAssistant}>Fire</button>
                )}
                {onHireAssistant && isUserTeam && (
                  <button className="bench-action-btn" onClick={() => { setStaffHireRole('assistantCoach'); setShowCoachModal(true); }}>Replace</button>
                )}
              </div>
              {(() => {
                const c = team.staff.assistantCoach!;
                const am = coachMod(c.rating);
                const impacts = [
                  { label: 'Macro', value: Math.round(am * 2 * specMod(c.specialty, 'tactical') * 10) / 10 },
                  { label: 'Utility', value: Math.round(am * 1 * specMod(c.specialty, 'tactical') * 10) / 10 },
                  { label: 'Anti-strat', value: Math.round(am * 10 * 10) / 10, suffix: '%' },
                ];
                return (
                  <div className="rm-coach-impact">
                    <span className="rm-coach-impact-title">Assistant Impact</span>
                    <div className="rm-coach-impact-grid rm-coach-impact-grid--3">
                      {impacts.map(i => (
                        <div key={i.label} className="rm-coach-impact-cell">
                          <span className="rm-coach-impact-label">{i.label}</span>
                          <span className={`rm-coach-impact-value ${i.value > 0 ? 'bonus' : i.value < 0 ? 'penalty' : ''}`}>
                            {i.value > 0 ? '+' : ''}{i.value === 0 ? '—' : i.value}{(i as any).suffix || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="rm-coach-empty">
              <span>No assistant coach</span>
              {onSaveAssistant && (
                <button className="bench-action-btn" onClick={() => {
                  setCoachDraft({ name: '', rating: 60, specialty: ['tactical'], nationality: '' });
                  setStaffEditRole('assistantCoach');
                  setShowCoachEditor(true);
                }}>Create</button>
              )}
              {onHireAssistant && isUserTeam && freeAgentCoaches.length > 0 && (
                <button className="bench-action-btn" onClick={() => { setStaffHireRole('assistantCoach'); setShowCoachModal(true); }}>Hire from FA</button>
              )}
            </div>
          )}
        </div>

        {/* analyst */}
        <div className="rm-staff-card">
          <div className="rm-staff-role-label">Analyst</div>
          {team.staff.analyst ? (
            <div className="rm-coach-info">
              <div className="rm-coach-main">
                {team.staff.analyst.nationality && <FlagImg code={team.staff.analyst.nationality} size={22} />}
                <span className="rm-coach-name">{team.staff.analyst.name}</span>
              </div>
              <div className="rm-coach-details">
                <span className="rm-coach-rating">Rating: {team.staff.analyst.rating}</span>
                {team.staff.analyst.specialty && (Array.isArray(team.staff.analyst.specialty) ? team.staff.analyst.specialty : [team.staff.analyst.specialty]).map(s =>
                  <span key={s} className={`rm-coach-spec rm-coach-spec--${s}`}>{s}</span>
                )}
              </div>
              <div className="rm-coach-actions">
                {onSaveAnalyst && (
                  <button className="bench-action-btn" onClick={() => {
                    const c = team.staff.analyst!;
                    const specArr = Array.isArray(c.specialty) ? c.specialty : c.specialty ? [c.specialty] : ['development' as const];
                    setCoachDraft({ name: c.name, rating: c.rating, specialty: specArr, nationality: c.nationality ?? '' });
                    setStaffEditRole('analyst');
                    setShowCoachEditor(true);
                  }}>Edit</button>
                )}
                {onFireAnalyst && isUserTeam && (
                  <button className="bench-action-btn bench-action-danger" onClick={onFireAnalyst}>Fire</button>
                )}
                {onHireAnalyst && isUserTeam && (
                  <button className="bench-action-btn" onClick={() => { setStaffHireRole('analyst'); setShowCoachModal(true); }}>Hire from FA</button>
                )}
              </div>
              {(() => {
                const c = team.staff.analyst!;
                const am = coachMod(c.rating);
                const impacts = [
                  { label: 'Consistency', value: Math.round(am * 8 * specMod(c.specialty, 'tactical') * 10) / 10, suffix: '%' },
                  { label: 'Scrim Quality', value: Math.round(am * 6 * specMod(c.specialty, 'development') * 10) / 10, suffix: '%' },
                  { label: 'Development', value: Math.round(am * 25 * specMod(c.specialty, 'development') * 10) / 10, suffix: '%' },
                ];
                return (
                  <div className="rm-coach-impact">
                    <span className="rm-coach-impact-title">Analyst Impact</span>
                    <div className="rm-coach-impact-grid rm-coach-impact-grid--3">
                      {impacts.map(i => (
                        <div key={i.label} className="rm-coach-impact-cell">
                          <span className="rm-coach-impact-label">{i.label}</span>
                          <span className={`rm-coach-impact-value ${i.value > 0 ? 'bonus' : i.value < 0 ? 'penalty' : ''}`}>
                            {i.value > 0 ? '+' : ''}{i.value === 0 ? '—' : i.value}{i.suffix || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="rm-coach-empty">
              <span>No analyst</span>
              {onSaveAnalyst && (
                <button className="bench-action-btn" onClick={() => {
                  setCoachDraft({ name: '', rating: 60, specialty: ['development'], nationality: '' });
                  setStaffEditRole('analyst');
                  setShowCoachEditor(true);
                }}>Create</button>
              )}
              {onHireAnalyst && isUserTeam && freeAgentCoaches.length > 0 && (
                <button className="bench-action-btn" onClick={() => { setStaffHireRole('analyst'); setShowCoachModal(true); }}>Hire from FA</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Coach editor modal */}
      {showCoachEditor && (onSaveCoach || onSaveAssistant || onSaveAnalyst) && (
        <div className="pem-overlay" onClick={() => setShowCoachEditor(false)}>
          <div className="pem-modal rm-coach-editor" onClick={e => e.stopPropagation()}>
            <div className="pem-header">
              <div className="pem-header-left">
                <div className="pem-header-info">
                  <h2 className="pem-player-name">
                    {staffEditRole === 'headCoach' ? (team.staff.headCoach ? 'Edit Coach' : 'Create Coach')
                    : staffEditRole === 'assistantCoach' ? (team.staff.assistantCoach ? 'Edit Assistant' : 'Create Assistant')
                    : (team.staff.analyst ? 'Edit Analyst' : 'Create Analyst')}
                  </h2>
                </div>
              </div>
              <button className="pem-close" onClick={() => setShowCoachEditor(false)}>✕</button>
            </div>
            <div className="pem-body rm-coach-editor-body">
              <div className="rm-coach-field">
                <label>Name</label>
                <input
                  type="text"
                  value={coachDraft.name}
                  onChange={e => setCoachDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="Coach name..."
                  maxLength={24}
                  className="rm-coach-input"
                />
              </div>
              <div className="rm-coach-field">
                <label>Nationality</label>
                <div className="rm-coach-nat-row">
                  <FlagPicker
                    value={coachDraft.nationality}
                    onChange={code => setCoachDraft(d => ({ ...d, nationality: code }))}
                  />
                  <span className="rm-coach-nat-code">{coachDraft.nationality || 'None'}</span>
                </div>
              </div>
              <div className="rm-coach-field">
                <label>Rating</label>
                <div className="pem-rating-control">
                  <input
                    type="range"
                    min={30}
                    max={99}
                    value={coachDraft.rating}
                    onChange={e => setCoachDraft(d => ({ ...d, rating: Number(e.target.value) }))}
                    className={`pem-slider ${getGradeClassFromValue(coachDraft.rating)}`}
                  />
                  <div className="pem-rating-values">
                    <span className={`pem-grade ${getGradeClassFromValue(coachDraft.rating)}`}>{toLetterGrade(coachDraft.rating)}</span>
                    <input
                      type="number"
                      value={coachDraft.rating}
                      onChange={e => setCoachDraft(d => ({ ...d, rating: Math.max(30, Math.min(99, Number(e.target.value))) }))}
                      className="pem-rating-num"
                    />
                  </div>
                </div>
              </div>
              <div className="rm-coach-field">
                <label>Specialty</label>
                <div className="rm-coach-spec-picker">
                  {(['development', 'tactical', 'mental'] as const).map(s => (
                    <button
                      key={s}
                      className={`rm-coach-spec rm-coach-spec--${s} ${coachDraft.specialty.includes(s) ? 'active' : ''}`}
                      onClick={() => setCoachDraft(d => {
                        const has = d.specialty.includes(s);
                        // don't allow empty — keep at least one
                        if (has && d.specialty.length <= 1) return d;
                        const next = has ? d.specialty.filter(x => x !== s) : [...d.specialty, s];
                        return { ...d, specialty: next };
                      })}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="rm-coach-save-btn"
                disabled={!coachDraft.name.trim()}
                onClick={() => {
                  const existing = staffEditRole === 'headCoach' ? team.staff.headCoach
                    : staffEditRole === 'assistantCoach' ? team.staff.assistantCoach
                    : team.staff.analyst;
                  const staffObj = {
                    id: existing?.id ?? `coach_${coachDraft.name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}`,
                    name: coachDraft.name.trim(),
                    rating: coachDraft.rating,
                    specialty: coachDraft.specialty,
                    nationality: coachDraft.nationality || undefined,
                  };
                  if (staffEditRole === 'headCoach') onSaveCoach?.(staffObj);
                  else if (staffEditRole === 'assistantCoach') onSaveAssistant?.(staffObj);
                  else onSaveAnalyst?.(staffObj);
                  setShowCoachEditor(false);
                  setStaffEditRole('headCoach');
                }}
              >
                {(() => {
                  const existing = staffEditRole === 'headCoach' ? team.staff.headCoach
                    : staffEditRole === 'assistantCoach' ? team.staff.assistantCoach
                    : team.staff.analyst;
                  return existing ? 'Save Changes' : 'Create';
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coach hire modal (FA pool) */}
      {showCoachModal && (onHireCoach || onHireAssistant || onHireAnalyst) && (
        <div className="pem-overlay" onClick={() => setShowCoachModal(false)}>
          <div className="pem-modal rm-coach-hire-modal" onClick={e => e.stopPropagation()}>
            <div className="pem-header">
              <div className="pem-header-left">
                <div className="pem-header-info">
                  <h2 className="pem-player-name">
                    {staffHireRole === 'headCoach' ? 'Available Coaches'
                    : staffHireRole === 'assistantCoach' ? 'Hire Assistant Coach'
                    : 'Hire Analyst'}
                  </h2>
                </div>
              </div>
              <button className="pem-close" onClick={() => setShowCoachModal(false)}>✕</button>
            </div>
            <div className="pem-body rm-coach-modal-list">
              {[...freeAgentCoaches].sort((a, b) => b.rating - a.rating).map(coach => (
                <div key={coach.id} className="rm-coach-modal-row" onClick={() => {
                  if (staffHireRole === 'headCoach') onHireCoach?.(coach.id);
                  else if (staffHireRole === 'assistantCoach') onHireAssistant?.(coach.id);
                  else onHireAnalyst?.(coach.id);
                  setShowCoachModal(false);
                  setStaffHireRole('headCoach');
                }}>
                  <span className="rm-coach-modal-name">
                    {coach.nationality && <FlagImg code={coach.nationality} size={18} />}
                    {coach.name}
                  </span>
                  <span className="rm-coach-modal-rating">{coach.rating}</span>
                  {coach.specialty && (Array.isArray(coach.specialty) ? coach.specialty : [coach.specialty]).map(s =>
                    <span key={s} className={`rm-coach-spec rm-coach-spec--${s}`}>{s}</span>
                  )}
                </div>
              ))}
              {freeAgentCoaches.length === 0 && <div className="rm-coach-modal-empty">No coaches available</div>}
            </div>
          </div>
        </div>
      )}

      {/* Map Comp section — only for user team */}
      {onUpdateUserMapComp && mapPool.length > 0 && (
        <div className="rm-section rm-section-mapcomp">
          <div className="section-header">
            <h2>
              <span className="section-icon">🗺️</span>
              Team Map Comp
            </h2>
            <div className="section-controls">
              <span className="section-hint">Off-role &amp; pool debuffs are disabled by default for team comp picks.</span>
            </div>
          </div>

          <div className="rm-mapcomp-list">
            {[...mapPool, ...MAPS.filter(m => !mapPool.includes(m)), ...customMapNames.filter(m => !mapPool.includes(m) && !MAPS.includes(m))].map((mapName, idx) => {
              const isInactive = !mapPool.includes(mapName);
              const isFirstInactive = isInactive && idx === mapPool.length;
              const mapComp = userMapComp[mapName] ?? {};
              const starters = lineup.map(slot => roster.find(p => p.id === slot.playerId)).filter(Boolean) as any[];
              const configured = starters.filter(p => mapComp[p.id]).length;
              const isExpanded = expandedCompMap === mapName;
              const allAgents = getAllAgentsSorted(agentRoleOverrides);

              // per-map penalty toggle: default all-on, track disabled player ids
              const disabledIds = new Set((userMapCompNoPenalty[mapName] ?? []).filter(s => s.startsWith('disabled:')).map(s => s.replace('disabled:', '')));
              const allHavePenalty = starters.every(p => disabledIds.has(p.id));
              const anyPenaltyDisabled = disabledIds.size > 0;

              const toggleMapNoPenalty = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (!onUpdateUserMapCompNoPenalty) return;
                // if all disabled → re-enable all; else → disable all
                const updated = allHavePenalty
                  ? []
                  : starters.map(p => `disabled:${p.id}`);
                onUpdateUserMapCompNoPenalty({ ...userMapCompNoPenalty, [mapName]: updated });
              };

              return (
                <React.Fragment key={mapName}>
                {isFirstInactive && (
                  <div className="rm-mapcomp-inactive-divider">
                    <span>Inactive Maps</span>
                  </div>
                )}
                <div className={`rm-mapcomp-card ${isExpanded ? 'expanded' : ''} ${isInactive ? 'inactive' : ''}`}>
                  <button
                    className="rm-mapcomp-header"
                    onClick={() => setExpandedCompMap(isExpanded ? null : mapName)}
                  >
                    <span className="rm-mapcomp-name">{mapName}</span>
                    <div className="rm-mapcomp-summary">
                      {starters.map(p => {
                        const agent = mapComp[p.id];
                        const isThumbDisabled = agent && disabledSet.has(agent);
                        return agent ? (
                          <img key={p.id} src={`/logos/agents/${agent}.png`} alt={agent} className={`rm-mapcomp-thumb ${isThumbDisabled ? 'agent-disabled' : ''}`} title={`${p.name}: ${agent}${isThumbDisabled ? ' (disabled)' : ''}`} />
                        ) : (
                          <span key={p.id} className="rm-mapcomp-empty-thumb" title={`${p.name}: auto`} />
                        );
                      })}
                      {configured > 0 && <span className="rm-mapcomp-badge">{configured}/5</span>}
                    </div>
                    {configured > 0 && onUpdateUserMapCompNoPenalty && (
                      <button
                        className={`rm-mapcomp-map-penalty-toggle ${allHavePenalty ? '' : 'active'}`}
                        title={allHavePenalty ? 'Debuffs enabled — click to disable for all' : 'Debuffs disabled — click to enable for all'}
                        onClick={toggleMapNoPenalty}
                      >{allHavePenalty ? 'Debuffs On' : '✓ No Debuffs'}</button>
                    )}
                    <span className="rm-mapcomp-chevron">{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {isExpanded && (
                    <div className="rm-mapcomp-body">
                      {starters.map(player => {
                        const selected = mapComp[player.id];
                        const slot = lineup.find(s => s.playerId === player.id);
                        const assignedRole = slot?.assignedRole ?? player.role;
                        const agentRoles = selected ? getRolesForAgent(selected, agentRoleOverrides as any) : [];
                        const isOffRole = selected ? !agentRoles.includes(assignedRole as any) : false;
                        const noPenalty = !disabledIds.has(player.id);

                        const togglePlayerPenalty = () => {
                          if (!onUpdateUserMapCompNoPenalty) return;
                          const current = userMapCompNoPenalty[mapName] ?? [];
                          const disabledKey = `disabled:${player.id}`;
                          const updated = noPenalty
                            ? [...current, disabledKey]
                            : current.filter(id => id !== disabledKey);
                          onUpdateUserMapCompNoPenalty({ ...userMapCompNoPenalty, [mapName]: updated });
                        };

                        return (
                          <div key={player.id} className={`rm-mapcomp-player-row ${isOffRole ? 'off-role-warn' : ''}`}>
                            <div className="rm-mapcomp-player-info">
                              <img src={assignedRole === 'flex' ? '/logos/regions/filler.png' : `/logos/regions/${assignedRole}Icon.png`} alt={assignedRole} className="rm-mapcomp-role-icon" />
                              <span className="rm-mapcomp-player-name">{player.name}</span>
                              {isOffRole && <span className="rm-mapcomp-warn" title="Off-role pick">⚠</span>}
                            </div>
                            <div className="rm-mapcomp-agents">
                              <button
                                className={`rm-mapcomp-agent-btn auto ${!selected ? 'active' : ''}`}
                                onClick={() => {
                                  const updated = { ...userMapComp, [mapName]: { ...(userMapComp[mapName] ?? {}) } };
                                  delete updated[mapName][player.id];
                                  onUpdateUserMapComp(updated);
                                }}
                              >Auto</button>
                              {allAgents.map(agent => {
                                const comfort = player.agentPool?.[agent] ?? 0;
                                const isAgentDisabled = disabledSet.has(agent);
                                return (
                                  <button
                                    key={agent}
                                    className={`rm-mapcomp-agent-btn ${selected === agent ? 'active' : ''} ${comfort === 0 ? 'off-pool' : ''} ${isAgentDisabled ? 'agent-disabled' : ''}`}
                                    title={`${agent}${isAgentDisabled ? ' (disabled in meta)' : comfort === 0 ? ' (off-pool)' : ` (comfort ${comfort})`}`}
                                    onClick={() => {
                                      if (isAgentDisabled) return;
                                      const updated = { ...userMapComp, [mapName]: { ...(userMapComp[mapName] ?? {}), [player.id]: agent } };
                                      onUpdateUserMapComp(updated);
                                    }}
                                  >
                                    <img src={`/logos/agents/${agent}.png`} alt={agent} className="rm-mapcomp-agent-icon" />
                                  </button>
                                );
                              })}
                            </div>
                            {selected && onUpdateUserMapCompNoPenalty && (
                              <button
                                className={`rm-mapcomp-player-penalty-dot ${noPenalty ? 'active' : ''}`}
                                title={noPenalty ? 'Debuffs off — click to enable' : 'Debuffs on — click to disable'}
                                onClick={togglePlayerPenalty}
                              />
                            )}
                            {selected && onUpdateTeamMapCompBuffs && (() => {
                              const buff = teamMapCompBuffs[mapName]?.[player.id] ?? 0;
                              const setBuff = (val: number) => {
                                const updated = { ...teamMapCompBuffs, [mapName]: { ...(teamMapCompBuffs[mapName] ?? {}), [player.id]: val } };
                                if (val === 0) delete updated[mapName][player.id];
                                onUpdateTeamMapCompBuffs(updated);
                              };
                              const tiers: { label: string; val: number }[] = [
                                { label: 'First Time', val: -15 },
                                { label: 'Horrible', val: -10 },
                                { label: 'Bad', val: -5 },
                                { label: 'OK', val: 0 },
                                { label: 'Good', val: 5 },
                                { label: 'Great', val: 10 },
                                { label: 'GOD', val: 15 },
                              ];
                              return (
                                <div className="rm-mapcomp-buff-pills">
                                  {tiers.map(t => (
                                    <button
                                      key={t.val}
                                      className={`rm-mapcomp-buff-pill ${buff === t.val ? 'active' : ''} tier-${t.label.toLowerCase().replace(' ','-')}`}
                                      onClick={() => setBuff(t.val)}
                                      title={t.val === 0 ? 'Neutral' : `${t.val > 0 ? '+' : ''}${t.val} OVR on this map`}
                                    >{t.label}</button>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                      <button
                        className="rm-mapcomp-clear"
                        onClick={() => {
                          const updated = { ...userMapComp };
                          delete updated[mapName];
                          onUpdateUserMapComp(updated);
                        }}
                        disabled={!configured}
                      >Clear map</button>
                    </div>
                  )}
                </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to find best role for a bench player
function findBestRole(player: Player): { role: Role; effectiveOvr: number } {
  let bestRole: Role = player.role;
  let bestOvr = player.overall + getRolePenalty(player.role, player.role);

  for (const role of STANDARD_ROLES) {
    const effectiveOvr = player.overall + getRolePenalty(player.role, role);
    if (effectiveOvr > bestOvr) {
      bestOvr = effectiveOvr;
      bestRole = role;
    }
  }

  return { role: bestRole, effectiveOvr: bestOvr };
}

export default RosterManagementPage;