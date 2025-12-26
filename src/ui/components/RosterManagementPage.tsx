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

interface RosterManagementPageProps {
  team: Team;
  onUpdateLineup: (lineup: StartingSlot[]) => void;
  onUpdateIGL: (playerId: string | null) => void;
  onBack: () => void;
  onViewPlayer: (playerId: string) => void;
  onNavigateToFreeAgency: () => void;
  isDevMode?: boolean;
  isUserTeam?: boolean;
}

export const RosterManagementPage: React.FC<RosterManagementPageProps> = ({
  team,
  onUpdateLineup,
  onUpdateIGL,
  onBack,
  onViewPlayer,
  onNavigateToFreeAgency,
  isDevMode = false,
  isUserTeam = true,
}) => {
  const [selectedBenchPlayer, setSelectedBenchPlayer] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState<'none' | 'selecting'>('none');
  const [autoSwapRoles, setAutoSwapRoles] = useState(true);

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
            <span className="stat-value">{effectiveLineupStrength}</span>
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
            <label className="toggle-label" title={autoSwapRoles ? "Roles will swap between players when changed" : "Roles can be freely assigned (may cause duplicates)"}>
              <input
                type="checkbox"
                checked={autoSwapRoles}
                onChange={(e) => setAutoSwapRoles(e.target.checked)}
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
                    {!isBenchedIGL && (
                      <button
                        className="bench-set-igl-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateIGL(player.id);
                        }}
                        title={`Set ${player.name} as IGL (will be inactive until in lineup)`}
                      >
                        Set IGL
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