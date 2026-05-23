// src/ui/components/LeagueEditor.tsx
import { useState } from 'react';
import type { Team, Player, Role, Region } from '../../types';
import { calculateTeamAttributes } from '../../sim/teamRatings';
import { ALL_TEAMS, type TeamConfig, type PlayerConfig } from '../../data/teams';
import './LeagueEditor.css';

interface LeagueEditorProps {
  onSaveLeague: (teams: Team[]) => void;
  onCancel: () => void;
  existingTeams?: Team[];
}

interface EditablePlayer {
  id: string;
  name: string;
  role: Role;
  age: number;
  overall: number;
  aim: number;
  utilityUsage: number;
  gameSense: number;
  clutchFactor: number;
  potentialFloor: number;
  potentialCeiling: number;
}

interface EditableTeam {
  id: string;
  name: string;
  abbreviation: string;
  region: Region;
  players: EditablePlayer[];
  iglId: string | null;
}

const REGIONS: Region[] = ['americas', 'emea', 'pacific', 'china'];
const ROLES: Role[] = ['flex', 'initiator', 'duelist', 'controller', 'sentinel'];

const createPlayerFromConfig = (config: PlayerConfig, teamAbbr: string, index: number): EditablePlayer => ({
  id: `player_${teamAbbr.toLowerCase()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
  name: config.name,
  role: config.role,
  age: (config as PlayerConfig & { age?: number }).age ?? (20 + Math.floor(Math.random() * 6)),
  overall: config.overall,
  aim: config.aim,
  utilityUsage: config.utility,
  gameSense: config.gameSense,
  clutchFactor: config.clutch,
  potentialFloor: Math.max(50, config.overall - 10),
  potentialCeiling: Math.min(99, config.overall + 8),
});

const createTeamFromConfig = (config: TeamConfig, index: number): EditableTeam => {
  const players = config.players.map((p, i) => createPlayerFromConfig(p, config.abbreviation, i));
  
  // Use IGL from config if specified, otherwise default to initiator
  const iglPlayer = config.igl
    ? players.find(p => p.name === config.igl)
    : players.find(p => p.role === 'initiator');
  
  return {
    id: `team_${config.abbreviation.toLowerCase()}_${index}`,
    name: config.name,
    abbreviation: config.abbreviation,
    region: config.region,
    players,
    iglId: iglPlayer?.id || players[0]?.id || null,
  };
};

const createEmptyPlayer = (index: number): EditablePlayer => ({
  id: `player_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
  name: `Player ${index + 1}`,
  role: ROLES[index % 5] as Role,
  age: 20,
  overall: 70,
  aim: 70,
  utilityUsage: 70,
  gameSense: 70,
  clutchFactor: 70,
  potentialFloor: 65,
  potentialCeiling: 80,
});

const createEmptyTeam = (region: Region, index: number): EditableTeam => {
  const players = [0, 1, 2, 3, 4].map(i => createEmptyPlayer(i));
  // Default IGL to initiator (index 1 in ROLES order)
  const defaultIGL = players.find(p => p.role === 'initiator') || players[0];
  return {
    id: `team_custom_${Date.now()}_${index}`,
    name: `Team ${index + 1}`,
    abbreviation: `T${index + 1}`,
    region,
    players,
    iglId: defaultIGL?.id || null,
  };
};

export function LeagueEditor({ onSaveLeague, onCancel, existingTeams }: LeagueEditorProps) {
  // Initialize with existing teams, default teams from data, or empty teams
  const initTeams = (): EditableTeam[] => {
    if (existingTeams && existingTeams.length > 0) {
      return existingTeams.map(t => {
        const players = t.roster.map(p => ({
          id: p.id,
          name: p.name,
          role: p.role,
          age: p.age,
          overall: p.overall,
          aim: p.ratings.aim,
          utilityUsage: p.ratings.utilityUsage,
          gameSense: p.ratings.gameSense,
          clutchFactor: p.ratings.clutchFactor,
          potentialFloor: p.potential.floor,
          potentialCeiling: p.potential.ceiling,
        }));
        // Use existing iglId or default to initiator
        const defaultIGL = players.find(p => p.role === 'initiator') || players[0];
        return {
          id: t.id,
          name: t.name,
          abbreviation: t.abbreviation,
          region: t.region,
          players,
          iglId: (t as Team & { iglId?: string | null }).iglId || defaultIGL?.id || null,
        };
      });
    }
    // Use default teams from data file
    return ALL_TEAMS.map((config, index) => createTeamFromConfig(config, index));
  };

  const [teams, setTeams] = useState<EditableTeam[]>(initTeams);
  const [selectedRegion, setSelectedRegion] = useState<Region>('americas');
  const [selectedTeamIndex, setSelectedTeamIndex] = useState<number>(0);
  const [importExportText, setImportExportText] = useState('');
  const [showImportExport, setShowImportExport] = useState(false);

  const regionTeams = teams.filter(t => t.region === selectedRegion);
  const selectedTeam = regionTeams[selectedTeamIndex] || null;

  const updateTeam = (teamId: string, updates: Partial<EditableTeam>) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, ...updates } : t));
  };

  const updatePlayer = (teamId: string, playerId: string, updates: Partial<EditablePlayer>) => {
    setTeams(prev => prev.map(t => {
      if (t.id !== teamId) return t;
      return {
        ...t,
        players: t.players.map(p => p.id === playerId ? { ...p, ...updates } : p),
      };
    }));
  };

  const addTeam = () => {
    const newTeam = createEmptyTeam(selectedRegion, teams.length);
    setTeams(prev => [...prev, newTeam]);
  };

  const removeTeam = (teamId: string) => {
    setTeams(prev => prev.filter(t => t.id !== teamId));
    setSelectedTeamIndex(0);
  };

  const resetToDefaults = () => {
    if (confirm('Reset all teams to default VCT rosters? This will overwrite your changes.')) {
      setTeams(ALL_TEAMS.map((config, index) => createTeamFromConfig(config, index)));
      setSelectedTeamIndex(0);
    }
  };

  const convertToGameTeams = (): Team[] => {
    return teams.map(t => {
      const roster: Player[] = t.players.map(p => ({
        id: p.id,
        name: p.name,
        age: p.age,
        role: p.role,
        background: 'valorant_native' as const,
        archetype: (p.role === 'flex' ? 'entry_fragger' :
                   p.role === 'duelist' ? 'entry_fragger' : 
                   p.role === 'controller' ? 'utility_specialist' :
                   p.role === 'initiator' ? 'info_gatherer' : 'anchor') as Player['archetype'],
        overall: p.overall,
        ratings: {
          aim: p.aim,
          sprayControl: Math.round((p.aim + p.clutchFactor) / 2),
          utilityUsage: p.utilityUsage,
          gameSense: p.gameSense,
          clutchFactor: p.clutchFactor,
          communication: Math.round((p.utilityUsage + p.gameSense) / 2),
        },
        potential: {
          floor: p.potentialFloor,
          ceiling: p.potentialCeiling,
        },
        development: {
          peakAge: 24,
          volatility: 0.3,
          learningRate: 0.5,
        },
        personality: {
          leadership: 70,
          coachability: 70,
          workEthic: 70,
          mentality: 70,
          teamPlayer: 70,
        },
        contract: {
          salary: 100000,
          yearsRemaining: 2,
          teamOption: false,
          playerOption: false,
        },
        agentPool: {},
        draftYear: null,
        draftPick: null,
        yearsInLeague: 1,
        retired: false,
      }));

      return {
        id: t.id,
        name: t.name,
        abbreviation: t.abbreviation,
        logo: '',
        region: t.region,
        roster,
        iglId: t.iglId,
        staff: { headCoach: null, assistantCoach: null, analyst: null },
        finances: { budget: 1000000, salaryCommitted: 500000, scoutingBudget: 50 },
        attributes: calculateTeamAttributes(roster),
        championships: 0,
        playoffAppearances: 0,
        founded: 2020,
      };
    });
  };

  const handleExport = () => {
    const exportData = JSON.stringify(teams, null, 2);
    setImportExportText(exportData);
    setShowImportExport(true);
  };

  const handleImport = () => {
    try {
      const imported = JSON.parse(importExportText) as EditableTeam[];
      if (Array.isArray(imported) && imported.length > 0) {
        setTeams(imported);
        setShowImportExport(false);
        setImportExportText('');
        alert('League imported successfully!');
      } else {
        alert('Invalid league data format');
      }
    } catch {
      alert('Failed to parse JSON. Check the format.');
    }
  };

  const handleSave = () => {
    const gameTeams = convertToGameTeams();
    onSaveLeague(gameTeams);
  };

  // Calculate team average
  const getTeamAverage = (team: EditableTeam) => {
    return Math.round(team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length);
  };

  return (
    <div className="league-editor">
      <div className="content-header">
        <h1>League Editor</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button className="btn btn-save" onClick={resetToDefaults}>Reset to Defaults</button>
          <button className="btn btn-save" onClick={handleExport}>Export JSON</button>
          <button className="btn btn-save" onClick={() => setShowImportExport(true)}>Import JSON</button>
          <button className="btn btn-play" onClick={handleSave}>Save & Start Game</button>
          <button className="btn btn-save" onClick={onCancel}>Cancel</button>
        </div>
      </div>

      {showImportExport && (
        <div className="panel" style={{ marginBottom: '16px' }}>
          <div className="panel-header">
            Import/Export League Data
            <button className="link-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowImportExport(false)}>Close</button>
          </div>
          <div className="panel-body">
            <textarea
              value={importExportText}
              onChange={e => setImportExportText(e.target.value)}
              placeholder="Paste league JSON here to import, or export to see current data..."
              style={{
                width: '100%',
                height: '200px',
                background: 'var(--bg-darker)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '8px',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            />
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
              <button className="btn btn-play" onClick={handleImport}>Import</button>
              <button className="btn btn-save" onClick={() => { setImportExportText(''); setShowImportExport(false); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Region Tabs */}
      <div className="region-tabs" style={{ marginBottom: '16px' }}>
        {REGIONS.map(region => (
          <button
            key={region}
            className={`region-tab ${selectedRegion === region ? 'active' : ''}`}
            onClick={() => { setSelectedRegion(region); setSelectedTeamIndex(0); }}
          >
            {region.toUpperCase()} ({teams.filter(t => t.region === region).length} teams)
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px' }}>
        {/* Team List */}
        <div className="panel">
          <div className="panel-header">
            Teams
            <button className="editor-add-btn" style={{ marginLeft: 'auto' }} onClick={addTeam}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add
            </button>
          </div>
          <div className="panel-body" style={{ padding: 0, maxHeight: '500px', overflowY: 'auto' }}>
            {regionTeams.map((team, idx) => (
              <div
                key={team.id}
                className={`nav-item ${selectedTeamIndex === idx ? 'active' : ''}`}
                onClick={() => setSelectedTeamIndex(idx)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{team.abbreviation}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>
                    {getTeamAverage(team)} OVR
                  </span>
                </div>
                <button
                  className="editor-remove-btn"
                  onClick={(e) => { e.stopPropagation(); removeTeam(team.id); }}
                  aria-label={`Remove ${team.abbreviation}`}
                  title="Remove team"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Team Editor */}
        {selectedTeam && (
          <div>
            {/* Team Info */}
            <div className="panel" style={{ marginBottom: '16px' }}>
              <div className="panel-header">Team Info - {selectedTeam.name}</div>
              <div className="panel-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="editor-label">Team Name</label>
                    <input
                      type="text"
                      className="editor-input"
                      value={selectedTeam.name}
                      onChange={e => updateTeam(selectedTeam.id, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="editor-label">Abbreviation</label>
                    <input
                      type="text"
                      className="editor-input"
                      value={selectedTeam.abbreviation}
                      maxLength={5}
                      onChange={e => updateTeam(selectedTeam.id, { abbreviation: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div>
                    <label className="editor-label">Region</label>
                    <select
                      className="editor-input"
                      value={selectedTeam.region}
                      onChange={e => updateTeam(selectedTeam.id, { region: e.target.value as Region })}
                    >
                      {REGIONS.map(r => (
                        <option key={r} value={r}>{r.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="editor-label">Team Average</label>
                    <div className="editor-input" style={{ background: 'var(--bg-card)', fontWeight: 700 }}>
                      {getTeamAverage(selectedTeam)} OVR
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Roster Editor */}
            <div className="panel">
              <div className="panel-header">Roster</div>
              <div className="panel-body" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="roster-table editor-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '120px' }}>Name</th>
                      <th>Role</th>
                      <th>Age</th>
                      <th>OVR</th>
                      <th>Aim</th>
                      <th>Util</th>
                      <th>IQ</th>
                      <th>Clutch</th>
                      <th>Pot ↓</th>
                      <th>Pot ↑</th>
                      <th>IGL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeam.players.map(player => (
                      <tr key={player.id}>
                        <td>
                          <input
                            type="text"
                            className="editor-input-small"
                            value={player.name}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { name: e.target.value })}
                            style={{ width: '110px' }}
                          />
                        </td>
                        <td>
                          <select
                            className="editor-input-small"
                            value={player.role}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { role: e.target.value as Role })}
                          >
                            {ROLES.map(r => (
                              <option key={r} value={r}>{r.slice(0, 3).toUpperCase()}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            className="editor-input-small number"
                            value={player.age}
                            min={16}
                            max={40}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { age: parseInt(e.target.value) || 20 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="editor-input-small number"
                            value={player.overall}
                            min={1}
                            max={99}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { overall: parseInt(e.target.value) || 50 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="editor-input-small number"
                            value={player.aim}
                            min={1}
                            max={99}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { aim: parseInt(e.target.value) || 50 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="editor-input-small number"
                            value={player.utilityUsage}
                            min={1}
                            max={99}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { utilityUsage: parseInt(e.target.value) || 50 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="editor-input-small number"
                            value={player.gameSense}
                            min={1}
                            max={99}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { gameSense: parseInt(e.target.value) || 50 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="editor-input-small number"
                            value={player.clutchFactor}
                            min={1}
                            max={99}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { clutchFactor: parseInt(e.target.value) || 50 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="editor-input-small number"
                            value={player.potentialFloor}
                            min={1}
                            max={99}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { potentialFloor: parseInt(e.target.value) || 50 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="editor-input-small number"
                            value={player.potentialCeiling}
                            min={1}
                            max={99}
                            onChange={e => updatePlayer(selectedTeam.id, player.id, { potentialCeiling: parseInt(e.target.value) || 50 })}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className={`btn-igl ${selectedTeam.iglId === player.id ? 'active' : ''}`}
                            onClick={() => updateTeam(selectedTeam.id, { iglId: player.id })}
                            title={selectedTeam.iglId === player.id ? 'Current IGL' : 'Set as IGL'}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '4px',
                              border: selectedTeam.iglId === player.id ? 'none' : '1px solid var(--border)',
                              background: selectedTeam.iglId === player.id ? 'linear-gradient(135deg, #ffd700, #ffaa00)' : 'var(--bg-darker)',
                              color: selectedTeam.iglId === player.id ? '#1a1a2e' : 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 700,
                            }}
                          >
                            {selectedTeam.iglId === player.id ? '★' : '☆'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="panel" style={{ marginTop: '16px' }}>
              <div className="panel-header">Quick Actions</div>
              <div className="panel-body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-save"
                  onClick={() => {
                    updateTeam(selectedTeam.id, {
                      players: selectedTeam.players.map(p => ({
                        ...p,
                        overall: Math.min(99, p.overall + 5),
                        aim: Math.min(99, p.aim + 5),
                        utilityUsage: Math.min(99, p.utilityUsage + 5),
                        gameSense: Math.min(99, p.gameSense + 5),
                        clutchFactor: Math.min(99, p.clutchFactor + 5),
                      })),
                    });
                  }}
                >
                  +5 All Stats
                </button>
                <button
                  className="btn btn-save"
                  onClick={() => {
                    updateTeam(selectedTeam.id, {
                      players: selectedTeam.players.map(p => ({
                        ...p,
                        overall: Math.max(1, p.overall - 5),
                        aim: Math.max(1, p.aim - 5),
                        utilityUsage: Math.max(1, p.utilityUsage - 5),
                        gameSense: Math.max(1, p.gameSense - 5),
                        clutchFactor: Math.max(1, p.clutchFactor - 5),
                      })),
                    });
                  }}
                >
                  -5 All Stats
                </button>
                <button
                  className="btn btn-save"
                  onClick={() => {
                    updateTeam(selectedTeam.id, {
                      players: selectedTeam.players.map(p => ({
                        ...p,
                        aim: p.overall,
                        utilityUsage: p.overall,
                        gameSense: p.overall,
                        clutchFactor: p.overall,
                      })),
                    });
                  }}
                >
                  Sync Stats to OVR
                </button>
                <button
                  className="btn btn-save"
                  onClick={() => {
                    // Add a new player
                    updateTeam(selectedTeam.id, {
                      players: [...selectedTeam.players, createEmptyPlayer(selectedTeam.players.length)],
                    });
                  }}
                >
                  + Add Player
                </button>
                {selectedTeam.players.length > 5 && (
                  <button
                    className="btn btn-save"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => {
                      updateTeam(selectedTeam.id, {
                        players: selectedTeam.players.slice(0, -1),
                      });
                    }}
                  >
                    Remove Last Player
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}