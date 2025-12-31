// src/ui/components/PlayerEditModal.tsx
// Modal for editing player attributes - Revamped UI

import React, { useState, useMemo } from 'react';
import type { Player, Role, Team } from '../../types';
import type { StartingSlot } from '../../types/roster';
import { getRolePenalty } from '../../types/roster';
import { calculateEffectiveOverallWithIGL } from '../../sim/iglBonus';
import { getCompositionPenalty } from '../../sim/compositionBonus';
import { toLetterGrade, getGradeClassFromValue } from '../../utils/letterGrade';
import { ALL_ARCHETYPES } from '../../data/archetypes';
import { AGENT_POOLS } from '../../sim/freeAgency';
import './PlayerEditModal.css';

interface PlayerEditModalProps {
  player: Player;
  team: Team;
  onSave: (updatedPlayer: Player) => void;
  onClose: () => void;
}

type EditTab = 'ratings' | 'personality' | 'info' | 'agents';

// Role icons path
const ROLE_ICONS: Record<Role, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

// All agents organized by role (complete list)
const ALL_AGENTS: Record<Role, string[]> = {
  duelist: ['jett', 'raze', 'phoenix', 'reyna', 'yoru', 'neon', 'iso', 'waylay'],
  controller: ['omen', 'brimstone', 'astra', 'viper', 'harbor', 'clove'],
  initiator: ['sova', 'breach', 'skye', 'kayo', 'fade', 'gekko', 'tejo'],
  sentinel: ['killjoy', 'cypher', 'sage', 'chamber', 'deadlock', 'vyse', 'veto'],
  flex: [],
};

const getAgentIconUrl = (agent: string): string => `/logos/agents/${agent.toLowerCase()}.png`;

// Priority system
const PRIORITY_TO_VALUE: Record<string, number | null> = {
  '1': 100, '2': 50, '3': 25, '-': null,
};

const valueToPriority = (value: number | undefined): string => {
  if (value === undefined || value === null) return '-';
  if (value >= 75) return '1';
  if (value >= 40) return '2';
  if (value >= 1) return '3';
  return '-';
};

const formatAgentName = (agent: string): string => 
  agent.charAt(0).toUpperCase() + agent.slice(1);

const clonePlayer = (player: Player): Player => ({
  ...player,
  ratings: { ...player.ratings },
  personality: { ...player.personality },
  potential: { ...player.potential },
  development: { ...player.development },
  agentPool: { ...player.agentPool },
  imageUrl: player.imageUrl,
});

const calculateOvrFromRatings = (ratings: Player['ratings'], archetype: Player['archetype']): number => {
  const config = ALL_ARCHETYPES[archetype];
  if (!config) {
    return Math.round(
      (ratings.aim + ratings.sprayControl + ratings.gameSense + 
       ratings.utilityUsage + ratings.communication + ratings.clutchFactor) / 6
    );
  }
  const { weights } = config;
  return Math.round(
    ratings.aim * weights.aim +
    ratings.sprayControl * weights.sprayControl +
    ratings.gameSense * weights.gameSense +
    ratings.utilityUsage * weights.utilityUsage +
    ratings.communication * weights.communication +
    ratings.clutchFactor * weights.clutchFactor
  );
};

export const PlayerEditModal: React.FC<PlayerEditModalProps> = ({
  player,
  team,
  onSave,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<EditTab>('ratings');
  const [editedPlayer, setEditedPlayer] = useState<Player>(() => clonePlayer(player));
  const [hasChanges, setHasChanges] = useState(false);

  const lineup: StartingSlot[] = team.startingLineup || 
    team.roster.slice(0, 5).map(p => ({ playerId: p.id, assignedRole: p.role }));
  
  const lineupSlot = lineup.find(s => s.playerId === player.id);
  const isStarter = !!lineupSlot;
  const assignedRole = lineupSlot?.assignedRole || player.role;

  // Get composition penalty for the lineup
  const compositionPenalty = useMemo(() => getCompositionPenalty(lineup), [lineup]);

  const effectiveOvrInfo = useMemo(() => {
    if (!isStarter) {
      return { effectiveOvr: editedPlayer.overall, rolePenalty: 0, iglBonus: 0, compositionPenalty: 0 };
    }
    const rolePenalty = getRolePenalty(editedPlayer.role, assignedRole);
    const iglResult = calculateEffectiveOverallWithIGL(
      { ...editedPlayer }, team, lineup, rolePenalty
    );
    // Add composition penalty to effective OVR
    const effectiveOvr = iglResult.effectiveOvr + compositionPenalty;
    return { effectiveOvr, rolePenalty, iglBonus: iglResult.iglBonus, compositionPenalty };
  }, [editedPlayer, team, lineup, isStarter, assignedRole, compositionPenalty]);

  const archetypeWeights = useMemo(() => {
    const config = ALL_ARCHETYPES[editedPlayer.archetype];
    if (!config) {
      return { aim: 1/6, sprayControl: 1/6, gameSense: 1/6, utilityUsage: 1/6, communication: 1/6, clutchFactor: 1/6 };
    }
    return config.weights;
  }, [editedPlayer.archetype]);

  const baseOvrDiff = editedPlayer.overall - player.overall;
  const agentPoolCount = Object.keys(editedPlayer.agentPool || {}).length;

  // Handlers
  const handleOverallChange = (value: number) => {
    if (isNaN(value)) return;
    setEditedPlayer(prev => ({ ...prev, overall: Math.max(40, Math.min(99, value)) }));
    setHasChanges(true);
  };

  const handleRatingChange = (key: keyof Player['ratings'], value: number) => {
    const clampedValue = Math.max(0, Math.min(99, value));
    setEditedPlayer(prev => {
      const newRatings = { ...prev.ratings, [key]: clampedValue };
      return {
        ...prev,
        ratings: newRatings,
        overall: calculateOvrFromRatings(newRatings, prev.archetype),
      };
    });
    setHasChanges(true);
  };

  const handlePersonalityChange = (key: keyof Player['personality'], value: number) => {
    setEditedPlayer(prev => ({
      ...prev,
      personality: {
        ...prev.personality,
        [key]: Math.max(0, Math.min(99, value)),
      },
    }));
    setHasChanges(true);
  };

  const handleInfoChange = (key: string, value: string | number) => {
    if (key === 'name') {
      setEditedPlayer(prev => ({ ...prev, name: String(value).slice(0, 20) }));
    } else if (key === 'imageUrl') {
      setEditedPlayer(prev => ({ ...prev, imageUrl: String(value).trim() || undefined }));
    } else if (key === 'age') {
      setEditedPlayer(prev => ({ ...prev, age: Math.max(16, Math.min(40, Number(value))) }));
    } else if (key === 'role') {
      const newRole = value as Role;
      const agents = AGENT_POOLS[newRole] || AGENT_POOLS.duelist;
      const newAgentPool: Record<string, number> = {};
      const shuffled = [...agents].sort(() => Math.random() - 0.5);
      newAgentPool[shuffled[0]] = 100;
      newAgentPool[shuffled[1]] = 50;
      if (shuffled[2]) newAgentPool[shuffled[2]] = 25;
      setEditedPlayer(prev => ({ ...prev, role: newRole, agentPool: newAgentPool }));
    } else if (key === 'archetype') {
      const newArchetype = value as Player['archetype'];
      setEditedPlayer(prev => {
        const newOverall = calculateOvrFromRatings(prev.ratings, newArchetype);
        return { ...prev, archetype: newArchetype, overall: newOverall };
      });
    } else if (key === 'peakAge') {
      setEditedPlayer(prev => ({
        ...prev,
        development: { ...prev.development, peakAge: Math.max(18, Math.min(35, Number(value))) },
      }));
    } else if (key === 'potentialFloor') {
      setEditedPlayer(prev => ({
        ...prev,
        potential: { ...prev.potential, floor: Math.max(0, Math.min(prev.potential.ceiling, Number(value))) },
      }));
    } else if (key === 'potentialCeiling') {
      setEditedPlayer(prev => ({
        ...prev,
        potential: { ...prev.potential, ceiling: Math.max(prev.potential.floor, Math.min(99, Number(value))) },
      }));
    }
    setHasChanges(true);
  };

  const handleAgentPriorityChange = (agent: string, priority: string) => {
    setEditedPlayer(prev => {
      const newAgentPool = { ...prev.agentPool };
      const value = PRIORITY_TO_VALUE[priority];
      if (value === null) {
        delete newAgentPool[agent];
      } else {
        for (const [existingAgent, existingValue] of Object.entries(newAgentPool)) {
          if (existingValue === value && existingAgent !== agent) {
            delete newAgentPool[existingAgent];
          }
        }
        newAgentPool[agent] = value;
      }
      return { ...prev, agentPool: newAgentPool };
    });
    setHasChanges(true);
  };

  const clearRoleAgents = (role: Role) => {
    const roleAgents = ALL_AGENTS[role];
    setEditedPlayer(prev => {
      const newAgentPool = { ...prev.agentPool };
      roleAgents.forEach(agent => delete newAgentPool[agent]);
      return { ...prev, agentPool: newAgentPool };
    });
    setHasChanges(true);
  };

  const getOvrClass = (ovr: number) => {
    if (ovr >= 85) return 'elite';
    if (ovr >= 75) return 'great';
    if (ovr >= 65) return 'good';
    return 'below';
  };

  return (
    <div className="pem-overlay" onClick={onClose}>
      <div className="pem-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pem-header">
          <div className="pem-header-left">
            <img
              src={ROLE_ICONS[editedPlayer.role]}
              alt={editedPlayer.role}
              className="pem-role-icon"
            />
            <div className="pem-header-info">
              <h2 className="pem-player-name">{editedPlayer.name}</h2>
              <div className="pem-player-meta">
                <span className={`pem-role-tag role-${editedPlayer.role}`}>
                  {editedPlayer.role.toUpperCase()}
                </span>
                <span className="pem-team-name">{team.name}</span>
                <span className="pem-age">{editedPlayer.age} yrs</span>
              </div>
            </div>
          </div>
          <div className="pem-header-right">
            <div className="pem-ovr-display">
              <div className="pem-ovr-base">
                <span className="pem-ovr-label">BASE</span>
                <input
                  type="number"
                  value={editedPlayer.overall}
                  onChange={e => handleOverallChange(Number(e.target.value))}
                  className={`pem-ovr-input ${baseOvrDiff > 0 ? 'up' : baseOvrDiff < 0 ? 'down' : ''}`}
                  style={{ width: '52px', minWidth: '52px', maxWidth: '52px' }}
                />
                {baseOvrDiff !== 0 && (
                  <span className={`pem-ovr-diff ${baseOvrDiff > 0 ? 'positive' : 'negative'}`}>
                    {baseOvrDiff > 0 ? '+' : ''}{baseOvrDiff}
                  </span>
                )}
              </div>
              <span className="pem-ovr-arrow">→</span>
              <div className="pem-ovr-effective">
                <span className="pem-ovr-label">{isStarter ? 'EFF' : 'BENCH'}</span>
                <span className={`pem-ovr-value ${getOvrClass(effectiveOvrInfo.effectiveOvr)}`}>
                  {effectiveOvrInfo.effectiveOvr}
                </span>
              </div>
            </div>
            <button className="pem-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="pem-tabs">
          {(['ratings', 'personality', 'info', 'agents'] as EditTab[]).map(tab => (
            <button
              key={tab}
              className={`pem-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'ratings' && '📊'}
              {tab === 'personality' && '🧠'}
              {tab === 'info' && 'ℹ️'}
              {tab === 'agents' && '🎯'}
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              {tab === 'agents' && <span className="pem-tab-badge">{agentPoolCount}</span>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="pem-body">
          {/* Ratings Tab */}
          {activeTab === 'ratings' && (
            <div className="pem-ratings">
              {isStarter && assignedRole !== editedPlayer.role && (
                <div className="pem-role-warning">
                  ⚠️ Playing <span className={`role-${assignedRole}`}>{assignedRole.toUpperCase()}</span>
                  {' '}(natural: <span className={`role-${editedPlayer.role}`}>{editedPlayer.role.toUpperCase()}</span>)
                  <span className="pem-penalty">
                    {effectiveOvrInfo.rolePenalty !== 0 && `${effectiveOvrInfo.rolePenalty > 0 ? '+' : ''}${effectiveOvrInfo.rolePenalty} OVR`}
                  </span>
                </div>
              )}

              {isStarter && effectiveOvrInfo.compositionPenalty !== 0 && (
                <div className="pem-comp-warning">
                  ⚠️ Team missing core role(s)
                  <span className="pem-penalty comp">
                    {effectiveOvrInfo.compositionPenalty} OVR
                  </span>
                </div>
              )}

              <div className="pem-archetype">
                <span className="pem-archetype-label">Archetype</span>
                <span className="pem-archetype-name">
                  {ALL_ARCHETYPES[editedPlayer.archetype]?.name || editedPlayer.archetype}
                </span>
              </div>

              <div className="pem-ratings-grid">
                {[
                  { key: 'aim' as const, label: 'Aim', icon: '🎯' },
                  { key: 'gameSense' as const, label: 'Game Sense', icon: '🧠' },
                  { key: 'utilityUsage' as const, label: 'Utility', icon: '💫' },
                  { key: 'communication' as const, label: 'Comms', icon: '📢' },
                  { key: 'clutchFactor' as const, label: 'Clutch', icon: '⚡' },
                  { key: 'sprayControl' as const, label: 'Spray', icon: '🔫' },
                ].sort((a, b) => archetypeWeights[b.key] - archetypeWeights[a.key]).map(({ key, label, icon }) => {
                  const value = editedPlayer.ratings[key];
                  const weight = Math.round(archetypeWeights[key] * 100);
                  const grade = toLetterGrade(value);
                  const gradeClass = getGradeClassFromValue(value);
                  return (
                    <div key={key} className="pem-rating-row">
                      <div className="pem-rating-header">
                        <span className="pem-rating-icon">{icon}</span>
                        <span className="pem-rating-label">{label}</span>
                        <span className="pem-rating-weight">{weight}%</span>
                      </div>
                      <div className="pem-rating-control">
                        <input
                          type="range"
                          min={0}
                          max={99}
                          value={value}
                          onChange={e => handleRatingChange(key, Number(e.target.value))}
                          className={`pem-slider ${gradeClass}`}
                        />
                        <div className="pem-rating-values">
                          <span className={`pem-grade ${gradeClass}`}>{grade}</span>
                          <input
                            type="number"
                            value={value}
                            onChange={e => handleRatingChange(key, Number(e.target.value))}
                            className="pem-rating-num"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Personality Tab */}
          {activeTab === 'personality' && (
            <div className="pem-personality">
              {[
                { key: 'leadership' as const, label: 'Leadership', icon: '👑', desc: 'Ability to lead and inspire teammates' },
                { key: 'workEthic' as const, label: 'Work Ethic', icon: '💪', desc: 'Dedication to practice and improvement' },
                { key: 'mentality' as const, label: 'Mentality', icon: '🧘', desc: 'Mental fortitude under pressure' },
                { key: 'teamPlayer' as const, label: 'Team Player', icon: '🤝', desc: 'Willingness to sacrifice for the team' },
                { key: 'coachability' as const, label: 'Coachability', icon: '📚', desc: 'Receptiveness to feedback and coaching' },
              ].map(({ key, label, icon, desc }) => {
                const value = editedPlayer.personality[key];
                const grade = toLetterGrade(value);
                const gradeClass = getGradeClassFromValue(value);
                return (
                  <div key={key} className="pem-personality-row">
                    <div className="pem-personality-header">
                      <span className="pem-personality-icon">{icon}</span>
                      <div className="pem-personality-info">
                        <span className="pem-personality-label">{label}</span>
                        <span className="pem-personality-desc">{desc}</span>
                      </div>
                    </div>
                    <div className="pem-personality-control">
                      <input
                        type="range"
                        min={0}
                        max={99}
                        value={value}
                        onChange={e => handlePersonalityChange(key, Number(e.target.value))}
                        className={`pem-slider ${gradeClass}`}
                      />
                      <div className="pem-personality-values">
                        <span className={`pem-grade ${gradeClass}`}>{grade}</span>
                        <input
                          type="number"
                          value={value}
                          onChange={e => handlePersonalityChange(key, Number(e.target.value))}
                          className="pem-rating-num"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Info Tab */}
          {activeTab === 'info' && (
            <div className="pem-info">
              <div className="pem-info-section">
                <h3 className="pem-info-title">Identity</h3>
                <div className="pem-info-grid">
                  <div className="pem-info-item pem-info-full">
                    <label>Username</label>
                    <input
                      type="text"
                      value={editedPlayer.name}
                      onChange={e => handleInfoChange('name', e.target.value)}
                      placeholder="Player name..."
                      maxLength={20}
                    />
                  </div>
                  <div className="pem-info-item pem-info-full">
                    <label>Profile Picture URL</label>
                    <input
                      type="text"
                      value={editedPlayer.imageUrl || ''}
                      onChange={e => handleInfoChange('imageUrl', e.target.value)}
                      placeholder="https://example.com/player.png"
                      className="pem-image-url-input"
                    />
                    <span className="pem-input-hint">Leave empty for auto-generated avatar</span>
                  </div>
                </div>
              </div>

              <div className="pem-info-section">
                <h3 className="pem-info-title">Basic Info</h3>
                <div className="pem-info-grid">
                  <div className="pem-info-item">
                    <label>Age</label>
                    <input
                      type="number"
                      value={editedPlayer.age}
                      onChange={e => handleInfoChange('age', e.target.value)}
                      min={16}
                      max={40}
                    />
                  </div>
                  <div className="pem-info-item">
                    <label>Role</label>
                    <select value={editedPlayer.role} onChange={e => handleInfoChange('role', e.target.value)}>
                      <option value="duelist">Duelist</option>
                      <option value="controller">Controller</option>
                      <option value="initiator">Initiator</option>
                      <option value="sentinel">Sentinel</option>
                      <option value="flex">Flex</option>
                    </select>
                  </div>
                  <div className="pem-info-item">
                    <label>Peak Age</label>
                    <input
                      type="number"
                      value={editedPlayer.development.peakAge}
                      onChange={e => handleInfoChange('peakAge', e.target.value)}
                      min={18}
                      max={35}
                    />
                  </div>
                  <div className="pem-info-item">
                    <label>Archetype</label>
                    <select
                      value={editedPlayer.archetype}
                      onChange={e => handleInfoChange('archetype', e.target.value)}
                      className="pem-archetype-select"
                    >
                      <optgroup label="Duelist">
                        <option value="entry_fragger">Entry Fragger</option>
                        <option value="clutch_star">Clutch Star</option>
                        <option value="feast_or_famine">Feast or Famine</option>
                      </optgroup>
                      <optgroup label="Controller">
                        <option value="utility_specialist">Utility Specialist</option>
                        <option value="macro_brain">Macro Brain</option>
                        <option value="aggressive_smoker">Aggressive Smoker</option>
                      </optgroup>
                      <optgroup label="Initiator">
                        <option value="info_gatherer">Info Gatherer</option>
                        <option value="playmaker">Playmaker</option>
                        <option value="support_initiator">Support Initiator</option>
                      </optgroup>
                      <optgroup label="Sentinel">
                        <option value="anchor">Anchor</option>
                        <option value="support_leader">Support Leader</option>
                        <option value="lurker">Lurker</option>
                      </optgroup>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pem-info-section">
                <h3 className="pem-info-title">Archetype Info</h3>
                {(() => {
                  const archetype = ALL_ARCHETYPES[editedPlayer.archetype];
                  if (!archetype) return null;

                  const sortedWeights = Object.entries(archetype.weights)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3);

                  const biases = Object.entries(archetype.ratingBias || {})
                    .filter(([, v]) => v !== 0);

                  const ratingLabels: Record<string, string> = {
                    aim: 'Aim',
                    sprayControl: 'Spray',
                    gameSense: 'Game Sense',
                    utilityUsage: 'Utility',
                    clutchFactor: 'Clutch',
                    communication: 'Comms',
                  };

                  return (
                    <div className="pem-archetype-info">
                      <div className="pem-archetype-header">
                        <span className="pem-archetype-name">{archetype.name}</span>
                        <span className="pem-archetype-role">{archetype.role}</span>
                      </div>
                      <span className="pem-archetype-desc">{archetype.description}</span>

                      <div className="pem-archetype-details">
                        <div className="pem-archetype-weights">
                          <span className="pem-detail-label">OVR Weights</span>
                          <div className="pem-weight-bars">
                            {sortedWeights.map(([key, weight]) => (
                              <div key={key} className="pem-weight-item">
                                <span className="pem-weight-name">{ratingLabels[key] || key}</span>
                                <div className="pem-weight-bar">
                                  <div className="pem-weight-fill" style={{ width: `${weight * 100 * 2.5}%` }} />
                                </div>
                                <span className="pem-weight-value">{Math.round(weight * 100)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {biases.length > 0 && (
                          <div className="pem-archetype-biases">
                            <span className="pem-detail-label">Generation Bonus</span>
                            <div className="pem-bias-tags">
                              {biases.map(([key, value]) => (
                                <span
                                  key={key}
                                  className={`pem-bias-tag ${Number(value) > 0 ? 'positive' : 'negative'}`}
                                >
                                  {ratingLabels[key] || key} {Number(value) > 0 ? '+' : ''}{value}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="pem-info-section">
                <h3 className="pem-info-title">Potential</h3>
                <div className="pem-potential-display">
                  <div className="pem-potential-bar">
                    <div
                      className="pem-potential-fill"
                      style={{
                        left: `${editedPlayer.potential.floor}%`,
                        width: `${editedPlayer.potential.ceiling - editedPlayer.potential.floor}%`,
                      }}
                    />
                    <div
                      className="pem-potential-current"
                      style={{ left: `${editedPlayer.overall}%` }}
                    />
                  </div>
                  <div className="pem-potential-labels">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                    <span>75</span>
                    <span>99</span>
                  </div>
                </div>
                <div className="pem-info-grid">
                  <div className="pem-info-item">
                    <label>Floor</label>
                    <input
                      type="number"
                      value={editedPlayer.potential.floor}
                      onChange={e => handleInfoChange('potentialFloor', e.target.value)}
                      min={0}
                      max={99}
                    />
                  </div>
                  <div className="pem-info-item">
                    <label>Ceiling</label>
                    <input
                      type="number"
                      value={editedPlayer.potential.ceiling}
                      onChange={e => handleInfoChange('potentialCeiling', e.target.value)}
                      min={0}
                      max={99}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Agents Tab */}
          {activeTab === 'agents' && (
            <div className="pem-agents">
              <div className="pem-agents-legend">
                <div className="pem-legend-item prio-1">
                  <span className="pem-legend-num">1</span>
                  <span className="pem-legend-text">Main (~70%)</span>
                  <span className="pem-legend-bonus">+3 OVR</span>
                </div>
                <div className="pem-legend-item prio-2">
                  <span className="pem-legend-num">2</span>
                  <span className="pem-legend-text">Secondary (~25%)</span>
                  <span className="pem-legend-bonus">+2 OVR</span>
                </div>
                <div className="pem-legend-item prio-3">
                  <span className="pem-legend-num">3</span>
                  <span className="pem-legend-text">Pocket (~5%)</span>
                  <span className="pem-legend-bonus">+1 OVR</span>
                </div>
                <div className="pem-legend-item prio-forced">
                  <span className="pem-legend-text">Forced</span>
                  <span className="pem-legend-bonus">-5 OVR</span>
                </div>
              </div>

              {(['duelist', 'controller', 'initiator', 'sentinel'] as Role[]).map(role => (
                <div key={role} className={`pem-agent-group role-${role}`}>
                  <div className="pem-agent-group-header">
                    <img src={ROLE_ICONS[role]} alt={role} className="pem-group-role-icon" />
                    <span className={`pem-group-title role-${role}`}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </span>
                    {role === editedPlayer.role && <span className="pem-natural-badge">Natural Role</span>}
                    <button className="pem-clear-btn" onClick={() => clearRoleAgents(role)}>Clear</button>
                  </div>
                  <div className="pem-agent-grid">
                    {ALL_AGENTS[role].map(agent => {
                      const currentValue = editedPlayer.agentPool?.[agent];
                      const currentPriority = valueToPriority(currentValue);
                      const isInPool = currentValue !== undefined;
                      return (
                        <div key={agent} className={`pem-agent-item ${isInPool ? `prio-${currentPriority}` : ''}`}>
                          <img
                            src={getAgentIconUrl(agent)}
                            alt={agent}
                            className="pem-agent-icon"
                            title={formatAgentName(agent)}
                          />
                          <select
                            value={currentPriority}
                            onChange={e => handleAgentPriorityChange(agent, e.target.value)}
                            className={`pem-priority-select ${isInPool ? `prio-${currentPriority}` : ''}`}
                          >
                            <option value="-">-</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pem-footer">
          <button className="pem-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="pem-btn-save" onClick={() => onSave(editedPlayer)} disabled={!hasChanges}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlayerEditModal;