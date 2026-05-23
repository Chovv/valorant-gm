// src/ui/FreeAgencyPage.tsx
// Free agency browser for ValorantGM - Revamped with master-detail layout

import React, { useState, useMemo } from 'react';
import type { Player, Role, Team } from '../types';
import { ALL_ARCHETYPES } from '../data/archetypes';
import { toLetterGrade, getGradeClassFromValue } from '../utils/letterGrade';
import { PlayerEditModal } from './components/PlayerEditModal';
import { PlayerAvatar, InlineFlag } from './components/PlayerAvatar';
import { generatePlayer } from '../sim/playerGenerator';
import { createRNG } from '../utils/random';
import { langAffinity, LANGUAGE_GROUP_LABELS } from '../utils/languageGroups';
import './FreeAgencyPage.css';

// Role icons
const ROLE_ICONS: Record<Role, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

interface FreeAgencyPageProps {
  freeAgents: Player[];
  userTeam: Team;
  onSignPlayer: (playerId: string) => void;
  onReleasePlayer: (playerId: string) => void;
  onBack: () => void;
  onViewPlayer: (playerId: string) => void;
  devMode?: boolean;
  onAddFreeAgent?: (player: Player) => void;
  onDeleteFreeAgent?: (playerId: string) => void;
  onEditFreeAgent?: (player: Player) => void;
}

type SortKey = 'overall' | 'age' | 'potential' | 'name';
type SortDirection = 'asc' | 'desc';

export const FreeAgencyPage: React.FC<FreeAgencyPageProps> = ({
  freeAgents,
  userTeam,
  onSignPlayer,
  onReleasePlayer,
  devMode = false,
  onAddFreeAgent,
  onDeleteFreeAgent,
  onEditFreeAgent,
}) => {
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [ageFilter, setAgeFilter] = useState<'all' | 'young' | 'prime' | 'veteran'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newPlayer, setNewPlayer] = useState<Player | null>(null);

  // Handle signing: call parent, then clear selection so UI reacts
  const handleSignPlayer = (playerId: string) => {
    onSignPlayer(playerId);
    setSelectedPlayer(null);
  };

  const roster = userTeam.roster;
  const starters = userTeam.startingLineup?.map(s => s.playerId) || roster.slice(0, 5).map(p => p.id);
  const canSign = roster.length < 10;
  const canRelease = roster.length > 5;

  // Filter and sort free agents
  const filteredAgents = useMemo(() => {
    let result = [...freeAgents];

    if (roleFilter !== 'all') {
      result = result.filter(p => p.role === roleFilter);
    }

    if (ageFilter === 'young') {
      result = result.filter(p => p.age <= 20);
    } else if (ageFilter === 'prime') {
      result = result.filter(p => p.age >= 21 && p.age <= 26);
    } else if (ageFilter === 'veteran') {
      result = result.filter(p => p.age >= 27);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(query));
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'overall':
          comparison = a.overall - b.overall;
          break;
        case 'age':
          comparison = a.age - b.age;
          break;
        case 'potential':
          comparison = a.potential.ceiling - b.potential.ceiling;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [freeAgents, roleFilter, ageFilter, sortKey, sortDirection, searchQuery]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const handleReleaseClick = (playerId: string) => {
    if (confirmRelease === playerId) {
      onReleasePlayer(playerId);
      setConfirmRelease(null);
    } else {
      setConfirmRelease(playerId);
    }
  };

  const getOvrClass = (ovr: number) => {
    if (ovr >= 85) return 'elite';
    if (ovr >= 75) return 'great';
    if (ovr >= 65) return 'good';
    return 'below';
  };

  const formatRole = (role: Role) => {
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const getTopAgents = (player: Player) => {
    const pool = player.agentPool || {};
    return Object.entries(pool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([agent]) => agent);
  };

  // Create a new random player for the modal
  const handleCreateNew = () => {
    const rng = createRNG(Date.now().toString());
    const player = generatePlayer(rng, {});
    setNewPlayer(player);
    setShowCreateModal(true);
  };

  // Save the created player
  const handleSaveNewPlayer = (player: Player) => {
    if (onAddFreeAgent) {
      onAddFreeAgent(player);
    }
    setShowCreateModal(false);
    setNewPlayer(null);
  };

  // Delete a free agent
  const handleDeleteClick = (playerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete === playerId) {
      if (onDeleteFreeAgent) {
        onDeleteFreeAgent(playerId);
      }
      setConfirmDelete(null);
      if (selectedPlayer?.id === playerId) {
        setSelectedPlayer(null);
      }
    } else {
      setConfirmDelete(playerId);
    }
  };

  // Edit selected free agent
  const handleEditPlayer = () => {
    if (selectedPlayer) {
      setShowEditModal(true);
    }
  };

  const handleSaveEditedPlayer = (player: Player) => {
    if (onEditFreeAgent) {
      onEditFreeAgent(player);
      setSelectedPlayer(player);
    }
    setShowEditModal(false);
  };

  // Auto-select first player if none selected
  React.useEffect(() => {
    if (!selectedPlayer && filteredAgents.length > 0) {
      setSelectedPlayer(filteredAgents[0]);
    }
    // Clear selection if player no longer exists in the list
    if (selectedPlayer && !filteredAgents.find(p => p.id === selectedPlayer.id)) {
      setSelectedPlayer(filteredAgents.length > 0 ? filteredAgents[0] : null);
    }
  }, [filteredAgents, selectedPlayer]);

  return (
    <div className="fa-page">
      {/* Left Panel - Your Roster */}
      <div className="fa-roster-panel">
        <div className="fa-panel-header">
          <h2>Your Roster</h2>
          <span className="roster-count">{roster.length}/10</span>
        </div>
        <div className="fa-roster-list">
          {roster.map(player => {
            const isStarter = starters.includes(player.id);
            const isConfirming = confirmRelease === player.id;
            const roleIcon = ROLE_ICONS[player.role] || ROLE_ICONS.flex;
            return (
              <div 
                key={player.id} 
                className={`fa-roster-item ${isStarter ? 'starter' : 'bench'} ${isConfirming ? 'confirming' : ''}`}
              >
                <img 
                  src={roleIcon} 
                  alt={player.role} 
                  className="fa-roster-role-icon"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div className="fa-roster-info">
                  <span className="fa-roster-name"><InlineFlag code={player.nationality} />{player.name}</span>
                  <span className="fa-roster-meta">
                    {isStarter && <span className="starter-tag">★</span>}
                    <span className={`fa-roster-ovr ${getOvrClass(player.overall)}`}>{player.overall}</span>
                  </span>
                </div>
                {!isStarter && canRelease && (
                  <button
                    className={`fa-release-btn ${isConfirming ? 'confirm' : ''}`}
                    onClick={() => handleReleaseClick(player.id)}
                    onBlur={() => setConfirmRelease(null)}
                    title={isConfirming ? 'Click to confirm release' : 'Release player'}
                  >
                    {isConfirming ? '✓' : '×'}
                  </button>
                )}
              </div>
            );
          })}
          {roster.length < 10 && (
            <div className="fa-roster-empty">
              {10 - roster.length} slot{10 - roster.length > 1 ? 's' : ''} available
            </div>
          )}
        </div>
      </div>

      {/* Center Panel - Free Agents List */}
      <div className="fa-list-panel">
        <div className="fa-panel-header">
          <h2>Free Agents</h2>
          <div className="fa-header-right">
            <span className="fa-count">{filteredAgents.length} available</span>
            {devMode && onAddFreeAgent && (
              <button className="fa-create-btn" onClick={handleCreateNew} title="Create new free agent">
                + Create
              </button>
            )}
          </div>
        </div>
        
        {/* Filters */}
        <div className="fa-filters">
          <div className="fa-search">
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>
          <div className="fa-filter-row">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}>
              <option value="all">All Roles</option>
              <option value="duelist">Duelist</option>
              <option value="controller">Controller</option>
              <option value="initiator">Initiator</option>
              <option value="sentinel">Sentinel</option>
              <option value="flex">Flex</option>
            </select>
            <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value as typeof ageFilter)}>
              <option value="all">All Ages</option>
              <option value="young">Young (≤20)</option>
              <option value="prime">Prime (21-26)</option>
              <option value="veteran">Veteran (27+)</option>
            </select>
          </div>
        </div>

        {/* Sort Header */}
        <div className="fa-list-header">
          <span className="fa-col-role">Role</span>
          <span 
            className={`fa-col-name sortable ${sortKey === 'name' ? 'active' : ''}`}
            onClick={() => handleSort('name')}
          >
            Name {sortKey === 'name' && (sortDirection === 'desc' ? '↓' : '↑')}
          </span>
          <span 
            className={`fa-col-age sortable ${sortKey === 'age' ? 'active' : ''}`}
            onClick={() => handleSort('age')}
          >
            Age {sortKey === 'age' && (sortDirection === 'desc' ? '↓' : '↑')}
          </span>
          <span 
            className={`fa-col-ovr sortable ${sortKey === 'overall' ? 'active' : ''}`}
            onClick={() => handleSort('overall')}
          >
            OVR {sortKey === 'overall' && (sortDirection === 'desc' ? '↓' : '↑')}
          </span>
          <span 
            className={`fa-col-pot sortable ${sortKey === 'potential' ? 'active' : ''}`}
            onClick={() => handleSort('potential')}
          >
            POT {sortKey === 'potential' && (sortDirection === 'desc' ? '↓' : '↑')}
          </span>
          <span className="fa-col-lang" title="Language compatibility with your roster">Lang</span>
          {devMode && onDeleteFreeAgent && (
            <span className="fa-col-actions"></span>
          )}
        </div>

        {/* Player List */}
        <div className="fa-list">
          {filteredAgents.length === 0 ? (
            <div className="fa-empty">
              <span>No players match your filters</span>
              <button onClick={() => { setRoleFilter('all'); setAgeFilter('all'); setSearchQuery(''); }}>
                Reset Filters
              </button>
            </div>
          ) : (
            filteredAgents.map(player => {
              const isConfirmingDelete = confirmDelete === player.id;
              return (
                <div
                  key={player.id}
                  className={`fa-list-item ${selectedPlayer?.id === player.id ? 'selected' : ''} ${isConfirmingDelete ? 'confirming-delete' : ''}`}
                  onClick={() => setSelectedPlayer(player)}
                >
                  <span className="fa-col-role">
                    <img src={ROLE_ICONS[player.role]} alt={player.role} className="fa-list-role-icon" />
                  </span>
                  <span className="fa-col-name"><InlineFlag code={player.nationality} />{player.name}{player.isIGL && <span className="fa-igl-badge">IGL</span>}</span>
                  <span className="fa-col-age">{player.age}</span>
                  <span className={`fa-col-ovr ${getOvrClass(player.overall)}`}>{player.overall}</span>
                  <span className="fa-col-pot">{player.potential.ceiling}</span>
                  <span className="fa-col-lang">
                    {(() => {
                      const af = langAffinity(player.nationality, userTeam.roster.map(p => p.nationality));
                      return <span className={`fa-lang-badge fa-lang-${af.tier}`} title={`${LANGUAGE_GROUP_LABELS[af.playerLang]} → ${LANGUAGE_GROUP_LABELS[af.rosterLang]}`}>{af.label}</span>;
                    })()}
                  </span>
                  {devMode && onDeleteFreeAgent && (
                    <span className="fa-col-actions">
                      <button
                        className={`fa-delete-btn ${isConfirmingDelete ? 'confirm' : ''}`}
                        onClick={(e) => handleDeleteClick(player.id, e)}
                        onBlur={() => setConfirmDelete(null)}
                        title={isConfirmingDelete ? 'Click to confirm delete' : 'Delete free agent'}
                      >
                        {isConfirmingDelete ? '✓' : '🗑'}
                      </button>
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel - Player Details */}
      <div className="fa-detail-panel">
        {selectedPlayer ? (
          <>
            <div className="fa-detail-scroll">
              <div className="fa-detail-header">
              <PlayerAvatar
                playerId={selectedPlayer.id}
                playerName={selectedPlayer.name}
                imageUrl={selectedPlayer.imageUrl}
                nationality={selectedPlayer.nationality}
                size="xl"
                className="fa-detail-avatar"
              />
              <div className={`fa-detail-ovr ${getOvrClass(selectedPlayer.overall)}`}>
                {selectedPlayer.overall}
              </div>
            </div>

            <span className={`role-tag role-${selectedPlayer.role}`}>{formatRole(selectedPlayer.role)}</span>

            <div className="fa-detail-name">{selectedPlayer.name}{selectedPlayer.isIGL && <span className="fa-igl-badge">IGL</span>}</div>
            
            <div className="fa-detail-meta">
              <span className="meta-item">
                <span className="meta-label">Age</span>
                <span className="meta-value">{selectedPlayer.age}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">Peak</span>
                <span className="meta-value">{selectedPlayer.development.peakAge}</span>
              </span>
              <span className="meta-item">
                <span className="meta-label">Archetype</span>
                <span className="meta-value">{ALL_ARCHETYPES[selectedPlayer.archetype]?.name || selectedPlayer.archetype}</span>
              </span>
            </div>

            {/* Language synergy */}
            {(() => {
              const af = langAffinity(selectedPlayer.nationality, userTeam.roster.map(p => p.nationality));
              const msgs: Record<string, string> = {
                native: `Speaks ${LANGUAGE_GROUP_LABELS[af.rosterLang]} — full synergy with your roster.`,
                bridge: `Speaks ${LANGUAGE_GROUP_LABELS[af.playerLang]}. Your roster speaks ${LANGUAGE_GROUP_LABELS[af.rosterLang]} — workable with effort.`,
                barrier: `Speaks ${LANGUAGE_GROUP_LABELS[af.playerLang]}. Your roster speaks ${LANGUAGE_GROUP_LABELS[af.rosterLang]} — significant language barrier.`,
              };
              return (
                <div className={`fa-lang-synergy fa-lang-synergy-${af.tier}`}>
                  <span className={`fa-lang-badge fa-lang-${af.tier}`}>{af.label}</span>
                  <span className="fa-lang-synergy-msg">{msgs[af.tier]}</span>
                </div>
              );
            })()}

            {/* Potential Bar */}
            <div className="fa-detail-section">
              <div className="fa-detail-section-title">Potential</div>
              <div className="fa-potential-bar">
                <div 
                  className="fa-potential-range"
                  style={{ 
                    left: `${selectedPlayer.potential.floor}%`, 
                    width: `${selectedPlayer.potential.ceiling - selectedPlayer.potential.floor}%` 
                  }}
                />
                <div className="fa-potential-current" style={{ left: `${selectedPlayer.overall}%` }} />
              </div>
              <div className="fa-potential-labels">
                <span>Floor: {selectedPlayer.potential.floor}</span>
                <span>Ceiling: {selectedPlayer.potential.ceiling}</span>
              </div>
            </div>

            {/* Ratings */}
            <div className="fa-detail-section">
              <div className="fa-detail-section-title">Ratings</div>
              <div className="fa-ratings-grid">
                {[
                  { key: 'aim', label: 'Aim' },
                  { key: 'gameSense', label: 'Game Sense' },
                  { key: 'utilityUsage', label: 'Utility' },
                  { key: 'clutchFactor', label: 'Clutch' },
                  { key: 'communication', label: 'Comms' },
                  { key: 'sprayControl', label: 'Spray' },
                ].map(({ key, label }) => {
                  const value = selectedPlayer.ratings[key as keyof typeof selectedPlayer.ratings];
                  const grade = toLetterGrade(value);
                  const gradeClass = getGradeClassFromValue(value);
                  return (
                    <div key={key} className="fa-rating-item">
                      <span className="fa-rating-label">{label}</span>
                      <div className="fa-rating-bar">
                        <div className="fa-rating-fill" style={{ width: `${value}%` }} />
                      </div>
                      <span className={`fa-rating-grade ${gradeClass}`}>{grade}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Agent Pool */}
            <div className="fa-detail-section">
              <div className="fa-detail-section-title">Agent Pool</div>
              <div className="fa-agents">
                {getTopAgents(selectedPlayer).map(agent => (
                  <div key={agent} className="fa-agent">
                    <img src={`/logos/agents/${agent}.png`} alt={agent} />
                    <span>{agent.charAt(0).toUpperCase() + agent.slice(1)}</span>
                  </div>
                ))}
                {getTopAgents(selectedPlayer).length === 0 && (
                  <span className="fa-no-agents">No agents assigned</span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            </div>
            <div className="fa-detail-actions">
              <button
                className="fa-sign-btn"
                onClick={() => handleSignPlayer(selectedPlayer.id)}
                disabled={!canSign}
              >
                {canSign ? `Sign ${selectedPlayer.name}` : 'Roster Full (10/10)'}
              </button>
              {devMode && onEditFreeAgent && (
                <button
                  className="fa-edit-btn"
                  onClick={handleEditPlayer}
                >
                  ✏️ Edit Player
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="fa-no-selection">
            <span>Select a player to view details</span>
          </div>
        )}
      </div>

      {/* Create Player Modal */}
      {showCreateModal && newPlayer && (
        <PlayerEditModal
          player={newPlayer}
          team={userTeam}
          onSave={handleSaveNewPlayer}
          onClose={() => {
            setShowCreateModal(false);
            setNewPlayer(null);
          }}
        />
      )}

      {/* Edit Player Modal */}
      {showEditModal && selectedPlayer && (
        <PlayerEditModal
          player={selectedPlayer}
          team={userTeam}
          onSave={handleSaveEditedPlayer}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
};

export default FreeAgencyPage;