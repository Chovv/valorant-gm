// src/ui/components/PlayerEditModal.tsx
// Modal for editing player attributes

import React, { useState, useMemo } from 'react';
import type { Player, Role, Team } from '../../types';
import type { StartingSlot } from '../../types/roster';
import { getRolePenalty } from '../../types/roster';
import { calculateEffectiveOverallWithIGL } from '../../sim/iglBonus';
import { toLetterGrade, getGradeClass } from '../../utils/letterGrade';
import { ALL_ARCHETYPES } from '../../data/archetypes';
import './PlayerEditModal.css';

interface PlayerEditModalProps {
  player: Player;
  team: Team;
  onSave: (updatedPlayer: Player) => void;
  onClose: () => void;
}

type EditTab = 'ratings' | 'personality' | 'info';

// Helper to deep clone player
const clonePlayer = (player: Player): Player => ({
  ...player,
  ratings: { ...player.ratings },
  personality: { ...player.personality },
  potential: { ...player.potential },
  development: { ...player.development },
});

// Calculate OVR from ratings using archetype-specific weights
const calculateOvrFromRatings = (ratings: Player['ratings'], archetype: Player['archetype']): number => {
  const config = ALL_ARCHETYPES[archetype];
  if (!config) {
    // Fallback to equal weights if archetype not found
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

  // Get lineup info for this player
  const lineup: StartingSlot[] = team.startingLineup || 
    team.roster.slice(0, 5).map(p => ({
      playerId: p.id,
      assignedRole: p.role,
    }));
  
  const lineupSlot = lineup.find(s => s.playerId === player.id);
  const isStarter = !!lineupSlot;
  const assignedRole = lineupSlot?.assignedRole || player.role;

  // Calculate effective OVR dynamically based on edited base OVR
  const effectiveOvrInfo = useMemo(() => {
    if (!isStarter) {
      return {
        effectiveOvr: editedPlayer.overall,
        rolePenalty: 0,
        iglBonus: 0,
      };
    }

    const rolePenalty = getRolePenalty(editedPlayer.role, assignedRole);
    
    // Create a temporary player with the edited overall to calculate IGL bonus
    const tempPlayer = { ...editedPlayer };
    const iglResult = calculateEffectiveOverallWithIGL(
      tempPlayer,
      team,
      lineup,
      rolePenalty
    );

    return {
      effectiveOvr: iglResult.effectiveOvr,
      rolePenalty,
      iglBonus: iglResult.iglBonus,
    };
  }, [editedPlayer, team, lineup, isStarter, assignedRole]);

  // Get archetype-specific weights for display
  const archetypeWeights = useMemo(() => {
    const config = ALL_ARCHETYPES[editedPlayer.archetype];
    if (!config) {
      // Fallback to equal weights
      return {
        aim: 1/6,
        sprayControl: 1/6,
        gameSense: 1/6,
        utilityUsage: 1/6,
        communication: 1/6,
        clutchFactor: 1/6,
      };
    }
    return config.weights;
  }, [editedPlayer.archetype]);

  // Track overall difference from original
  const baseOvrDiff = editedPlayer.overall - player.overall;

  // Handle direct OVR input change
  const handleOverallChange = (value: number) => {
    if (isNaN(value)) return;
    
    const clampedValue = Math.max(40, Math.min(99, value));
    setEditedPlayer(prev => ({
      ...prev,
      overall: clampedValue,
    }));
    setHasChanges(true);
  };

  // Handle rating slider change - also recalculates OVR
  const handleRatingChange = (key: keyof Player['ratings'], value: number) => {
    const clampedValue = Math.max(0, Math.min(99, value));
    
    setEditedPlayer(prev => {
      const newRatings = {
        ...prev.ratings,
        [key]: clampedValue,
      };
      
      // Recalculate OVR from new ratings using archetype weights
      const newOverall = calculateOvrFromRatings(newRatings, prev.archetype);
      
      return {
        ...prev,
        ratings: newRatings,
        overall: newOverall,
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
    if (key === 'age') {
      setEditedPlayer(prev => ({
        ...prev,
        age: Math.max(16, Math.min(40, Number(value))),
      }));
    } else if (key === 'role') {
      setEditedPlayer(prev => ({
        ...prev,
        role: value as Role,
      }));
    } else if (key === 'peakAge') {
      setEditedPlayer(prev => ({
        ...prev,
        development: {
          ...prev.development,
          peakAge: Math.max(18, Math.min(35, Number(value))),
        },
      }));
    } else if (key === 'potentialFloor') {
      setEditedPlayer(prev => ({
        ...prev,
        potential: {
          ...prev.potential,
          floor: Math.max(0, Math.min(prev.potential.ceiling, Number(value))),
        },
      }));
    } else if (key === 'potentialCeiling') {
      setEditedPlayer(prev => ({
        ...prev,
        potential: {
          ...prev.potential,
          ceiling: Math.max(prev.potential.floor, Math.min(99, Number(value))),
        },
      }));
    }
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(editedPlayer);
  };

  const renderSlider = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    showGrade: boolean = false,
    weight?: string
  ) => {
    const grade = toLetterGrade(value);
    const gradeClass = getGradeClass(grade);

    return (
      <div className="edit-slider-row">
        <div className="edit-slider-header">
          <span className="edit-slider-label">
            {label}
            {weight && <span className="weight-hint">{weight}</span>}
          </span>
          <div className="edit-slider-value-container">
            {showGrade && (
              <span className={`edit-grade ${gradeClass}`}>{grade}</span>
            )}
            <input
              type="number"
              className="edit-slider-number"
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              min={0}
              max={99}
            />
          </div>
        </div>
        <input
          type="range"
          className={`edit-slider ${showGrade ? gradeClass : ''}`}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={0}
          max={99}
        />
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="player-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="edit-modal-header">
          <h2>Edit Player: {player.name}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="edit-tabs">
          <button
            className={`edit-tab ${activeTab === 'ratings' ? 'active' : ''}`}
            onClick={() => setActiveTab('ratings')}
          >
            Ratings
          </button>
          <button
            className={`edit-tab ${activeTab === 'personality' ? 'active' : ''}`}
            onClick={() => setActiveTab('personality')}
          >
            Personality
          </button>
          <button
            className={`edit-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            Info
          </button>
        </div>

        <div className="edit-modal-body">
          {activeTab === 'ratings' && (
            <div className="edit-section">
              {/* OVR Display Row */}
              <div className="ovr-display-row">
                <div className="ovr-box base">
                  <span className="ovr-box-label">Base OVR</span>
                  <div className="ovr-input-wrapper">
                    <input
                      type="number"
                      className={`ovr-input ${baseOvrDiff > 0 ? 'increased' : baseOvrDiff < 0 ? 'decreased' : ''}`}
                      value={editedPlayer.overall}
                      onChange={(e) => handleOverallChange(Number(e.target.value))}
                      min={40}
                      max={99}
                    />
                    {baseOvrDiff !== 0 && (
                      <span className={`ovr-diff ${baseOvrDiff > 0 ? 'positive' : 'negative'}`}>
                        {baseOvrDiff > 0 ? '+' : ''}{baseOvrDiff}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="ovr-arrow">→</div>
                
                <div className="ovr-box effective">
                  <span className="ovr-box-label">
                    {isStarter ? 'Effective' : 'Bench'}
                  </span>
                  <span className={`ovr-value-large ${
                    effectiveOvrInfo.effectiveOvr >= 85 ? 'elite' :
                    effectiveOvrInfo.effectiveOvr >= 75 ? 'great' :
                    effectiveOvrInfo.effectiveOvr >= 65 ? 'good' : 'below'
                  }`}>
                    {effectiveOvrInfo.effectiveOvr}
                  </span>
                  {isStarter && (effectiveOvrInfo.rolePenalty !== 0 || effectiveOvrInfo.iglBonus !== 0) && (
                    <div className="ovr-modifiers-display">
                      {effectiveOvrInfo.rolePenalty !== 0 && (
                        <span className={`modifier-tag ${effectiveOvrInfo.rolePenalty > 0 ? 'positive' : 'negative'}`}>
                          {effectiveOvrInfo.rolePenalty > 0 ? '+' : ''}{effectiveOvrInfo.rolePenalty}
                        </span>
                      )}
                      {effectiveOvrInfo.iglBonus !== 0 && (
                        <span className={`modifier-tag ${effectiveOvrInfo.iglBonus > 0 ? 'positive' : 'negative'}`}>
                          {effectiveOvrInfo.iglBonus > 0 ? '+' : ''}{effectiveOvrInfo.iglBonus}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {isStarter && assignedRole !== editedPlayer.role && (
                <div className="role-warning">
                  ⚠️ Playing as <span className={`role-tag ${assignedRole}`}>{assignedRole.toUpperCase()}</span> 
                  {' '}(natural: <span className={`role-tag ${editedPlayer.role}`}>{editedPlayer.role.toUpperCase()}</span>)
                </div>
              )}
              
              <div className="archetype-info">
                <span className="archetype-label">Archetype:</span>
                <span className="archetype-name">{ALL_ARCHETYPES[editedPlayer.archetype]?.name || editedPlayer.archetype}</span>
              </div>
              
              <div className="edit-sliders">
                {/* Sort sliders by weight (highest first) */}
                {[
                  { key: 'aim' as const, label: 'Aim', value: editedPlayer.ratings.aim },
                  { key: 'gameSense' as const, label: 'Game Sense', value: editedPlayer.ratings.gameSense },
                  { key: 'utilityUsage' as const, label: 'Utility Usage', value: editedPlayer.ratings.utilityUsage },
                  { key: 'communication' as const, label: 'Communication', value: editedPlayer.ratings.communication },
                  { key: 'clutchFactor' as const, label: 'Clutch Factor', value: editedPlayer.ratings.clutchFactor },
                  { key: 'sprayControl' as const, label: 'Spray Control', value: editedPlayer.ratings.sprayControl },
                ]
                  .sort((a, b) => archetypeWeights[b.key] - archetypeWeights[a.key])
                  .map(({ key, label, value }) => (
                    <React.Fragment key={key}>
                      {renderSlider(label, value, (v) => handleRatingChange(key, v), false, `${Math.round(archetypeWeights[key] * 100)}%`)}
                    </React.Fragment>
                  ))
                }
              </div>
            </div>
          )}

          {activeTab === 'personality' && (
            <div className="edit-section">
              <div className="edit-sliders">
                {renderSlider('Leadership', editedPlayer.personality.leadership, (v) => handlePersonalityChange('leadership', v), true)}
                {renderSlider('Work Ethic', editedPlayer.personality.workEthic, (v) => handlePersonalityChange('workEthic', v), true)}
                {renderSlider('Mentality', editedPlayer.personality.mentality, (v) => handlePersonalityChange('mentality', v), true)}
                {renderSlider('Team Player', editedPlayer.personality.teamPlayer, (v) => handlePersonalityChange('teamPlayer', v), true)}
                {renderSlider('Coachability', editedPlayer.personality.coachability, (v) => handlePersonalityChange('coachability', v), true)}
              </div>
            </div>
          )}

          {activeTab === 'info' && (
            <div className="edit-section">
              <div className="edit-info-grid">
                <div className="edit-info-row">
                  <label>Age</label>
                  <input
                    type="number"
                    value={editedPlayer.age}
                    onChange={(e) => handleInfoChange('age', e.target.value)}
                    min={16}
                    max={40}
                  />
                </div>
                <div className="edit-info-row">
                  <label>Role</label>
                  <select
                    value={editedPlayer.role}
                    onChange={(e) => handleInfoChange('role', e.target.value)}
                  >
                    <option value="duelist">Duelist</option>
                    <option value="controller">Controller</option>
                    <option value="initiator">Initiator</option>
                    <option value="sentinel">Sentinel</option>
                    <option value="flex">Flex</option>
                  </select>
                </div>
                <div className="edit-info-row">
                  <label>Peak Age</label>
                  <input
                    type="number"
                    value={editedPlayer.development.peakAge}
                    onChange={(e) => handleInfoChange('peakAge', e.target.value)}
                    min={18}
                    max={35}
                  />
                </div>
                <div className="edit-info-row">
                  <label>Potential Floor</label>
                  <input
                    type="number"
                    value={editedPlayer.potential.floor}
                    onChange={(e) => handleInfoChange('potentialFloor', e.target.value)}
                    min={0}
                    max={99}
                  />
                </div>
                <div className="edit-info-row">
                  <label>Potential Ceiling</label>
                  <input
                    type="number"
                    value={editedPlayer.potential.ceiling}
                    onChange={(e) => handleInfoChange('potentialCeiling', e.target.value)}
                    min={0}
                    max={99}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="edit-modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlayerEditModal;