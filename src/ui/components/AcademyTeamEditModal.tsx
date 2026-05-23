// src/ui/components/AcademyTeamEditModal.tsx
// Modal for creating/editing Tier 2 (Academy) teams in dev mode

import { useState, useEffect } from 'react';
import type { Region, Player, Role } from '../../types';
import type { Tier2Team } from '../../types/scrims';
import { createRNG } from '../../utils/random';
import { generateAcademyPlayer } from '../../sim/scrims';
import './AcademyTeamEditModal.css';

interface AcademyTeamEditModalProps {
  team: Tier2Team | null; // null = create new
  region: Region;
  onSave: (team: Tier2Team) => void;
  onClose: () => void;
}

// Simplified data for editing in the form
interface EditablePlayerData {
  id: string;
  name: string;
  role: Role;
  overall: number;
  // Keep reference to original player if editing
  originalPlayer?: Player;
}

const REGIONS: Region[] = ['americas', 'emea', 'pacific', 'china'];
const ROLES: Role[] = ['duelist', 'initiator', 'controller', 'sentinel', 'flex'];

// Create editable data from existing players or generate defaults
const createEditablePlayers = (players: Player[] | undefined, teamAbbr: string): EditablePlayerData[] => {
  if (players && players.length >= 5) {
    return players.slice(0, 5).map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      overall: p.overall,
      originalPlayer: p,
    }));
  }
  
  // Generate default editable data for new teams
  const defaultRoles: Role[] = ['duelist', 'initiator', 'controller', 'sentinel', 'flex'];
  return defaultRoles.map((role, idx) => ({
    id: `${teamAbbr.toLowerCase()}_p${idx + 1}_${Date.now()}`,
    name: `Player ${idx + 1}`,
    role,
    overall: 65,
  }));
};

export function AcademyTeamEditModal({ team, region, onSave, onClose }: AcademyTeamEditModalProps) {
  const isNew = !team;
  
  const [teamName, setTeamName] = useState(team?.name || 'New Academy Team');
  const [abbreviation, setAbbreviation] = useState(team?.abbreviation || 'NEW');
  const [teamRegion, setTeamRegion] = useState<Region>(team?.region || region);
  const [players, setPlayers] = useState<EditablePlayerData[]>(() => 
    createEditablePlayers(team?.players, team?.abbreviation || 'NEW')
  );

  // Update region if it changes (for new teams)
  useEffect(() => {
    if (isNew) {
      setTeamRegion(region);
    }
  }, [region, isNew]);

  // Calculate average OVR from players
  const averageOVR = Math.round(
    players.reduce((sum, p) => sum + p.overall, 0) / players.length
  );

  const handleSave = () => {
    // Validate
    if (!teamName.trim()) {
      alert('Team name is required');
      return;
    }
    if (!abbreviation.trim()) {
      alert('Abbreviation is required');
      return;
    }
    
    for (let i = 0; i < players.length; i++) {
      if (!players[i].name.trim()) {
        alert(`Player ${i + 1} needs a name`);
        return;
      }
    }

    // Generate full Player objects
    const finalAbbr = abbreviation.trim().toUpperCase();
    const rng = createRNG(`academy-${finalAbbr}-${Date.now()}`);
    
    const fullPlayers: Player[] = players.map((editData, idx) => {
      // If we have an original player and role hasn't changed, update it
      if (editData.originalPlayer && editData.originalPlayer.role === editData.role) {
        return {
          ...editData.originalPlayer,
          name: editData.name.trim(),
          overall: editData.overall,
          // Keep existing agent pool since role didn't change
        };
      }
      
      // Generate new player (new team or role changed)
      return generateAcademyPlayer(
        rng,
        editData.name.trim(),
        editData.role,
        editData.overall,
        finalAbbr,
        idx
      );
    });

    const finalTeam: Tier2Team = {
      id: team?.id || `t2_custom_${Date.now()}`,
      name: teamName.trim(),
      abbreviation: finalAbbr,
      region: teamRegion,
      averageOVR,
      players: fullPlayers,
    };

    onSave(finalTeam);
  };

  const updatePlayer = (index: number, updates: Partial<EditablePlayerData>) => {
    setPlayers(prev => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
  };

  const formatRegionName = (r: Region) => {
    return r.charAt(0).toUpperCase() + r.slice(1);
  };

  const formatRole = (role: string) => {
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'duelist': return 'var(--role-duelist)';
      case 'controller': return 'var(--role-controller)';
      case 'initiator': return 'var(--role-initiator)';
      case 'sentinel': return 'var(--role-sentinel)';
      case 'flex': return 'var(--role-flex)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal academy-team-modal expanded" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isNew ? '➕ Create Academy Team' : '✏️ Edit Academy Team'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {/* Team Info Section */}
          <div className="atm-section">
            <div className="atm-section-header">Team Info</div>
            <div className="atm-team-info-grid">
              {/* Team Name */}
              <div className="atm-field">
                <label>Team Name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  placeholder="e.g., Sentinels Academy"
                  maxLength={40}
                />
              </div>

              {/* Abbreviation */}
              <div className="atm-field">
                <label>Abbreviation</label>
                <input
                  type="text"
                  value={abbreviation}
                  onChange={e => setAbbreviation(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="e.g., SEN.A"
                  maxLength={6}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              {/* Region */}
              <div className="atm-field">
                <label>Region</label>
                <select
                  value={teamRegion}
                  onChange={e => setTeamRegion(e.target.value as Region)}
                >
                  {REGIONS.map(r => (
                    <option key={r} value={r}>{formatRegionName(r)}</option>
                  ))}
                </select>
              </div>

              {/* Average OVR (read-only, calculated from players) */}
              <div className="atm-field">
                <label>Team AVG OVR</label>
                <div className="atm-avg-ovr">
                  <span className="atm-avg-ovr-value">{averageOVR}</span>
                  <span className="atm-avg-ovr-hint">Auto-calculated</span>
                </div>
              </div>
            </div>
          </div>

          {/* Roster Section */}
          <div className="atm-section">
            <div className="atm-section-header">
              Roster
              <span className="atm-section-hint">5 players required</span>
            </div>
            <div className="atm-roster-table">
              <div className="atm-roster-header">
                <span className="atm-col-num">#</span>
                <span className="atm-col-name">Name</span>
                <span className="atm-col-role">Role</span>
                <span className="atm-col-ovr">OVR</span>
              </div>
              <div className="atm-roster-body">
                {players.map((player, idx) => (
                  <div key={player.id} className="atm-roster-row">
                    <span className="atm-col-num">{idx + 1}</span>
                    <span className="atm-col-name">
                      <input
                        type="text"
                        value={player.name}
                        onChange={e => updatePlayer(idx, { name: e.target.value })}
                        placeholder="Player name"
                        maxLength={20}
                      />
                    </span>
                    <span className="atm-col-role">
                      <select
                        value={player.role}
                        onChange={e => updatePlayer(idx, { role: e.target.value as Role })}
                        style={{ borderColor: getRoleColor(player.role) }}
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>{formatRole(r)}</option>
                        ))}
                      </select>
                    </span>
                    <span className="atm-col-ovr">
                      <input
                        type="number"
                        value={player.overall}
                        min={40}
                        max={99}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 65;
                          updatePlayer(idx, { overall: Math.max(40, Math.min(99, val)) });
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Quick Actions */}
            <div className="atm-quick-actions">
              <button
                className="atm-quick-btn"
                onClick={() => {
                  setPlayers(prev => prev.map(p => ({ 
                    ...p, 
                    overall: Math.min(99, p.overall + 5),
                    originalPlayer: undefined, // Force regeneration
                  })));
                }}
                title="Increase all player OVRs by 5"
              >
                +5 All
              </button>
              <button
                className="atm-quick-btn"
                onClick={() => {
                  setPlayers(prev => prev.map(p => ({ 
                    ...p, 
                    overall: Math.max(40, p.overall - 5),
                    originalPlayer: undefined, // Force regeneration
                  })));
                }}
                title="Decrease all player OVRs by 5"
              >
                -5 All
              </button>
              <button
                className="atm-quick-btn"
                onClick={() => {
                  setPlayers(prev => prev.map(p => ({ 
                    ...p, 
                    overall: averageOVR,
                    originalPlayer: undefined, // Force regeneration
                  })));
                }}
                title="Set all players to the same OVR"
              >
                Equalize
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="atm-preview">
            <div className="atm-preview-label">Preview</div>
            <div className="atm-preview-card">
              <div className="atm-preview-team-info">
                <span className="atm-preview-name">{teamName || 'Team Name'}</span>
                <span className="atm-preview-abbr">{abbreviation || 'ABBR'}</span>
                <span className="atm-preview-ovr">{averageOVR} OVR</span>
                <span className={`atm-preview-region region-${teamRegion}`}>
                  {formatRegionName(teamRegion)}
                </span>
              </div>
              <div className="atm-preview-roster">
                {players.map((p, idx) => (
                  <div key={idx} className="atm-preview-player">
                    <span className={`atm-preview-player-role role-${p.role}`}>
                      {p.role.slice(0, 3).toUpperCase()}
                    </span>
                    <span className="atm-preview-player-name">{p.name || '???'}</span>
                    <span className="atm-preview-player-ovr">{p.overall}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {isNew ? 'Create Team' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
