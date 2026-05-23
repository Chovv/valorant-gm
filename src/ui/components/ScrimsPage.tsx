// src/ui/components/ScrimsPage.tsx
// Scrims dashboard showing history, fatigue, and player development

import { useState } from 'react';
import type { GameState } from '../../sim/gameState';
import type { Player, Ratings, Region } from '../../types';
import type { ScrimResult, Tier2Team } from '../../types/scrims';
import { getFatigueLevel, getFatigueDisplay } from '../../types/scrims';
import { InlineFlag } from './PlayerAvatar';
import { getAvailableScrimOpponents, isScrimRisky } from '../../sim/scrims';
import { AcademyTeamEditModal } from './AcademyTeamEditModal';
import './ScrimsPage.css';

interface ScrimsPageProps {
  gameState: GameState;
  onRunScrim: (opponentId: string, opponentType: 'regional' | 'tier2', opponentName: string) => void;
  onViewPlayer: (playerId: string) => void;
  onViewMatch: (matchResult: ScrimResult) => void;
  scrimHistory: ScrimResult[];
  // Dev mode props
  devMode?: boolean;
  onAddAcademyTeam?: (team: Tier2Team) => void;
  onEditAcademyTeam?: (team: Tier2Team) => void;
  onDeleteAcademyTeam?: (teamId: string, region: Region) => void;
}

export function ScrimsPage({ 
  gameState, 
  onRunScrim, 
  onViewPlayer, 
  onViewMatch, 
  scrimHistory,
  devMode = false,
  onAddAcademyTeam,
  onEditAcademyTeam,
  onDeleteAcademyTeam,
}: ScrimsPageProps) {
  const [showScrimModal, setShowScrimModal] = useState(false);
  const [selectedScrim, setSelectedScrim] = useState<ScrimResult | null>(null);
  const [showAcademyModal, setShowAcademyModal] = useState(false);
  const [editingAcademyTeam, setEditingAcademyTeam] = useState<Tier2Team | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
  if (!userTeam) return null;

  const fatigueLevel = getFatigueLevel(gameState.fatigueLevel);
  const fatigueDisplay = getFatigueDisplay(fatigueLevel);
  
  // Check if scrims are available
  const canScrim = gameState.phase !== 'international' &&
                   gameState.lastScrimDay !== gameState.currentDay;
  
  // Get upcoming match days to check for risky scrims
  const upcomingMatchDays = gameState.schedule
    .filter(m => !m.played && (m.homeTeamId === gameState.userTeamId || m.awayTeamId === gameState.userTeamId))
    .map(m => m.day);
  const isRisky = isScrimRisky(gameState.currentDay, upcomingMatchDays);
  
  // Calculate season development for each player
  const getSeasonDiff = (player: Player): { overall: number; ratings: Partial<Record<keyof Ratings, number>> } | null => {
    const startStats = gameState.seasonStartStats?.[player.id];
    if (!startStats) return null;
    
    const overallDiff = player.overall - startStats.overall;
    const ratingsDiff: Partial<Record<keyof Ratings, number>> = {};
    
    const ratingKeys: (keyof Ratings)[] = ['aim', 'sprayControl', 'gameSense', 'utilityUsage', 'clutchFactor', 'communication'];
    for (const stat of ratingKeys) {
      const startValue = (startStats.ratings as Record<string, number>)[stat];
      if (startValue !== undefined) {
        const diff = player.ratings[stat] - startValue;
        if (diff !== 0) {
          ratingsDiff[stat] = diff;
        }
      }
    }
    
    if (overallDiff === 0 && Object.keys(ratingsDiff).length === 0) {
      return null;
    }
    
    return { overall: overallDiff, ratings: ratingsDiff };
  };

  // Get scrim opponents (including custom academy teams)
  const { regional, tier2 } = getAvailableScrimOpponents(
    userTeam, 
    gameState.teams, 
    [], 
    gameState.customTier2Teams
  );
  
  // User-created teams have IDs starting with 't2_custom_'
  const isUserCreatedTeam = (teamId: string) => teamId.startsWith('t2_custom_');

  // Format stat name for display
  const formatStatName = (stat: string): string => {
    const names: Record<string, string> = {
      aim: 'Aim',
      sprayControl: 'Spray',
      gameSense: 'Game Sense',
      utilityUsage: 'Utility',
      clutchFactor: 'Clutch',
      communication: 'Comms',
      ceiling: 'Ceiling',
      floor: 'Floor',
    };
    return names[stat] || stat;
  };

  return (
    <div className="scrims-page">
      <div className="content-header">
        <h1>🏋️ Training & Scrims</h1>
      </div>

      <div className="scrims-grid">
        {/* Left Column - Status & Quick Actions */}
        <div className="scrims-left">
          {/* Team Status Card */}
          <div className="panel scrims-status-card">
            <div className="panel-header">Team Status</div>
            <div className="panel-body">
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Condition</span>
                  <span className="status-value" style={{ color: fatigueDisplay.color }}>
                    {fatigueDisplay.icon} {fatigueDisplay.label}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Fatigue Level</span>
                  <span className="status-value">{gameState.fatigueLevel}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Current Day</span>
                  <span className="status-value">Day {gameState.currentDay}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Week</span>
                  <span className="status-value">{Math.floor(gameState.currentDay / 7) + 1}</span>
                </div>
              </div>

              {/* Warnings */}
              {isRisky && canScrim && (
                <div className="scrim-alert warning">
                  ⚠️ Match within 2 days - scrimming may fatigue players
                </div>
              )}
              {(fatigueLevel === 'tired' || fatigueLevel === 'exhausted') && (
                <div className="scrim-alert danger">
                  {fatigueLevel === 'exhausted' ? '🥵' : '😓'} Team is {fatigueLevel} - higher chance of negative outcomes
                </div>
              )}
              {!canScrim && gameState.lastScrimDay === gameState.currentDay && (
                <div className="scrim-alert info">
                  ✓ Already scrimmaged today
                </div>
              )}
              {gameState.phase === 'international' && (
                <div className="scrim-alert info">
                  🏆 Scrims disabled during international tournament
                </div>
              )}

              {/* Scrim Button */}
              <button 
                className="btn-scrim-large"
                onClick={() => setShowScrimModal(true)}
                disabled={!canScrim}
              >
                🏋️ Schedule Scrim
              </button>
            </div>
          </div>

          {/* Season Development Card */}
          <div className="panel">
            <div className="panel-header">📈 Season Development</div>
            <div className="panel-body">
              <div className="development-list">
                {userTeam.roster.slice(0, 5).map(player => {
                  const diff = getSeasonDiff(player);
                  const startStats = gameState.seasonStartStats?.[player.id];
                  const startOvr = startStats?.overall ?? player.overall;
                  
                  return (
                    <div 
                      key={player.id} 
                      className="development-row"
                      onClick={() => onViewPlayer(player.id)}
                    >
                      <div className="dev-player-info">
                        <span className="dev-player-name"><InlineFlag code={player.nationality} />{player.name}</span>
                        <span className={`dev-player-role role-${player.role}`}>
                          {player.role.charAt(0).toUpperCase() + player.role.slice(1)}
                        </span>
                      </div>
                      <div className="dev-stats">
                        <span className="dev-ovr">
                          {player.overall}
                          {diff && diff.overall !== 0 && (
                            <span className={`dev-diff ${diff.overall > 0 ? 'positive' : 'negative'}`}>
                              {diff.overall > 0 ? '+' : ''}{diff.overall}
                            </span>
                          )}
                        </span>
                        <span className="dev-start-ovr">
                          (started: {startOvr})
                        </span>
                      </div>
                      {diff && Object.keys(diff.ratings).length > 0 && (
                        <div className="dev-rating-changes">
                          {Object.entries(diff.ratings).map(([stat, change]) => (
                            <span 
                              key={stat} 
                              className={`dev-rating-badge ${(change ?? 0) > 0 ? 'positive' : 'negative'}`}
                            >
                              {formatStatName(stat)} {(change ?? 0) > 0 ? '+' : ''}{change}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!Object.keys(gameState.seasonStartStats || {}).length && (
                <p className="no-data-message">
                  Season stats will be tracked once the season begins.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Scrim History */}
        <div className="scrims-right">
          <div className="panel scrims-history-panel">
            <div className="panel-header">📋 Scrim History</div>
            <div className="panel-body">
              {scrimHistory.length === 0 ? (
                <div className="no-scrims-message">
                  <span className="no-scrims-icon">🏋️</span>
                  <p>No scrims yet this season.</p>
                  <p className="no-scrims-hint">Schedule a scrim to develop your players!</p>
                </div>
              ) : (
                <div className="scrim-history-list">
                  {[...scrimHistory].reverse().map((scrim, idx) => (
                    <div 
                      key={idx} 
                      className="scrim-history-item clickable"
                      onClick={() => setSelectedScrim(scrim)}
                    >
                      <div className="scrim-history-header">
                        <span className="scrim-opponent">
                          vs {scrim.opponentName}
                        </span>
                        <span className={`scrim-type ${scrim.opponentType}`}>
                          {scrim.opponentType === 'tier2' ? 'Academy' : 'Regional'}
                        </span>
                        <span className="scrim-day">Day {scrim.day}</span>
                      </div>
                      {scrim.matchResult && (
                        <div className="scrim-history-score">
                          <span className={`score ${scrim.matchResult.homeScore > scrim.matchResult.awayScore ? 'win' : 'loss'}`}>
                            {scrim.matchResult.homeScore > scrim.matchResult.awayScore ? 'W' : 'L'}
                          </span>
                          <span className="score-value">
                            {scrim.matchResult.homeScore} - {scrim.matchResult.awayScore}
                          </span>
                        </div>
                      )}
                      <div className="scrim-summary">
                        {scrim.statChanges.length > 0 ? (
                          <span className="scrim-changes-count">
                            {scrim.statChanges.length} player{scrim.statChanges.length !== 1 ? 's' : ''} developed
                          </span>
                        ) : (
                          <span className="scrim-no-changes">No changes</span>
                        )}
                        <span className="scrim-view-detail">View Details →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrim Modal */}
      {showScrimModal && (
        <div className="modal-overlay" onClick={() => setShowScrimModal(false)}>
          <div className="modal scrim-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🏋️ Schedule Scrim</h2>
              <button className="modal-close" onClick={() => setShowScrimModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* Fatigue Status */}
              <div className="scrim-modal-status">
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
              {(fatigueLevel === 'tired' || fatigueLevel === 'exhausted') && (
                <div className="scrim-warning danger">
                  {fatigueLevel === 'exhausted' ? '🥵' : '😓'} Team is {fatigueLevel}! Higher chance of negative outcomes.
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
                      onClick={() => {
                        onRunScrim(team.id, 'regional', team.name);
                        setShowScrimModal(false);
                      }}
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
                <div className="scrim-section-header">
                  <div>
                    <h3>Academy Teams</h3>
                    <p className="scrim-section-desc">Easier sparring partners, always available</p>
                  </div>
                  {devMode && onAddAcademyTeam && (
                    <button
                      className="btn-add-academy"
                      onClick={() => {
                        setEditingAcademyTeam(null);
                        setShowAcademyModal(true);
                      }}
                      title="Create new academy team"
                    >
                      + Create
                    </button>
                  )}
                </div>
                <div className="scrim-opponent-list">
                  {tier2.map(team => {
                    const isUserCreated = isUserCreatedTeam(team.id);
                    const isConfirmingDelete = confirmDeleteId === team.id;
                    return (
                      <div key={team.id} className={`scrim-opponent-row ${isUserCreated ? 'custom' : ''}`}>
                        <button
                          className="scrim-opponent-btn tier2"
                          onClick={() => {
                            onRunScrim(team.id, 'tier2', team.name);
                            setShowScrimModal(false);
                          }}
                        >
                          <span className="scrim-opponent-name">{team.name}</span>
                          <span className="scrim-opponent-ovr">{team.averageOVR} OVR</span>
                          {isUserCreated && <span className="custom-badge">Custom</span>}
                        </button>
                        {devMode && (
                          <div className="academy-dev-actions">
                            <button
                              className="btn-edit-academy"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAcademyTeam(team);
                                setShowAcademyModal(true);
                              }}
                              title="Edit team"
                            >
                              ✏️
                            </button>
                            {isUserCreated && (
                              <button
                                className={`btn-delete-academy ${isConfirmingDelete ? 'confirm' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isConfirmingDelete) {
                                    onDeleteAcademyTeam?.(team.id, team.region);
                                    setConfirmDeleteId(null);
                                  } else {
                                    setConfirmDeleteId(team.id);
                                  }
                                }}
                                onBlur={() => setConfirmDeleteId(null)}
                                title={isConfirmingDelete ? 'Click to confirm' : 'Delete team'}
                              >
                                {isConfirmingDelete ? '✓' : '🗑'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {tier2.length === 0 && (
                    <p className="no-opponents">No academy teams available</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Academy Team Edit Modal */}
      {showAcademyModal && (
        <AcademyTeamEditModal
          team={editingAcademyTeam}
          region={userTeam.region}
          onSave={(team) => {
            if (editingAcademyTeam) {
              onEditAcademyTeam?.(team);
            } else {
              onAddAcademyTeam?.(team);
            }
            setShowAcademyModal(false);
            setEditingAcademyTeam(null);
          }}
          onClose={() => {
            setShowAcademyModal(false);
            setEditingAcademyTeam(null);
          }}
        />
      )}

      {/* Scrim Detail Modal - Shows development + link to match */}
      {selectedScrim && (
        <div className="modal-overlay" onClick={() => setSelectedScrim(null)}>
          <div className="modal scrim-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🏋️ Scrim Report</h2>
              <button className="modal-close" onClick={() => setSelectedScrim(null)}>×</button>
            </div>
            <div className="modal-body">
              {/* Match Result Summary */}
              <div className="scrim-detail-info">
                <div className="scrim-detail-opponent">
                  <span className="label">vs {selectedScrim.opponentName}</span>
                  {selectedScrim.matchResult && (
                    <span className={`scrim-result-badge ${selectedScrim.matchResult.homeScore > selectedScrim.matchResult.awayScore ? 'win' : 'loss'}`}>
                      {selectedScrim.matchResult.homeScore > selectedScrim.matchResult.awayScore ? 'WIN' : 'LOSS'} {selectedScrim.matchResult.homeScore}-{selectedScrim.matchResult.awayScore}
                    </span>
                  )}
                </div>
                <div className="scrim-detail-meta">
                  <span className={`scrim-type-badge ${selectedScrim.opponentType}`}>
                    {selectedScrim.opponentType === 'tier2' ? 'Academy' : 'Regional'}
                  </span>
                  <span className="scrim-detail-day">Day {selectedScrim.day}</span>
                </div>
              </div>

              {/* Player Development Results */}
              <div className="scrim-detail-results">
                <h3>Player Development</h3>
                {selectedScrim.statChanges.length === 0 ? (
                  <div className="scrim-detail-no-changes">
                    <p>No significant development occurred during this scrim.</p>
                    <p className="hint">Players trained but didn't see measurable stat changes.</p>
                  </div>
                ) : (
                  <div className="scrim-detail-players">
                    {selectedScrim.statChanges.map((change, idx) => {
                      const player = userTeam.roster.find(p => p.id === change.playerId);
                      const ovrChange = change.changes.find(c => c.stat === 'overall');
                      const statChanges = change.changes.filter(c => c.stat !== 'overall');
                      
                      return (
                        <div key={idx} className="scrim-detail-player">
                          <div 
                            className="scrim-detail-player-header"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedScrim(null);
                              if (player) onViewPlayer(player.id);
                            }}
                          >
                            <span className="player-name"><InlineFlag code={player?.nationality} />{change.playerName}</span>
                            {player && (
                              <span className={`player-role role-${player.role}`}>
                                {player.role.charAt(0).toUpperCase() + player.role.slice(1)}
                              </span>
                            )}
                            {ovrChange && (
                              <span className={`ovr-change ${ovrChange.delta > 0 ? 'positive' : 'negative'}`}>
                                OVR {ovrChange.delta > 0 ? '+' : ''}{ovrChange.delta}
                              </span>
                            )}
                          </div>
                          <div className="scrim-detail-stat-changes">
                            {statChanges.map((c, sidx) => (
                              <div key={sidx} className={`stat-change-row ${c.delta > 0 ? 'positive' : 'negative'}`}>
                                <span className="stat-name">{formatStatName(c.stat)}</span>
                                <span className="stat-values">
                                  <span className="old-value">{c.oldValue}</span>
                                  <span className="arrow">→</span>
                                  <span className="new-value">{c.newValue}</span>
                                </span>
                                <span className="stat-delta">
                                  {c.delta > 0 ? '+' : ''}{c.delta}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* View Match Button */}
              <div className="scrim-detail-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setSelectedScrim(null)}
                >
                  Close
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => {
                    const scrim = selectedScrim;
                    setSelectedScrim(null);
                    onViewMatch(scrim);
                  }}
                >
                  View Match Details →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}