// src/ui/FreeAgencyPage.tsx
// Free agency browser for ValorantGM

import React, { useState, useMemo } from 'react';
import type { Player, Role, Team } from '../types';
import { ALL_ARCHETYPES } from '../data/archetypes';
import './FreeAgencyPage.css';

interface FreeAgencyPageProps {
  freeAgents: Player[];
  userTeam: Team;
  onSignPlayer: (playerId: string) => void;
  onReleasePlayer: (playerId: string) => void;
  onBack: () => void;
  onViewPlayer: (playerId: string) => void;
}

type SortKey = 'overall' | 'age' | 'potential' | 'name';
type SortDirection = 'asc' | 'desc';

export const FreeAgencyPage: React.FC<FreeAgencyPageProps> = ({
  freeAgents,
  userTeam,
  onSignPlayer,
  onReleasePlayer,
  onBack,
  onViewPlayer,
}) => {
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [ageFilter, setAgeFilter] = useState<'all' | 'young' | 'prime' | 'veteran'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);

  const roster = userTeam.roster;
  const starters = userTeam.startingLineup?.map(s => s.playerId) || roster.slice(0, 5).map(p => p.id);
  const canSign = roster.length < 10;
  const canRelease = roster.length > 5;

  // Filter and sort free agents
  const filteredAgents = useMemo(() => {
    let result = [...freeAgents];

    // Role filter
    if (roleFilter !== 'all') {
      result = result.filter(p => p.role === roleFilter);
    }

    // Age filter
    if (ageFilter === 'young') {
      result = result.filter(p => p.age <= 20);
    } else if (ageFilter === 'prime') {
      result = result.filter(p => p.age >= 21 && p.age <= 26);
    } else if (ageFilter === 'veteran') {
      result = result.filter(p => p.age >= 27);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(query));
    }

    // Sort
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

  const formatRole = (role: Role) => {
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return '⇅';
    return sortDirection === 'desc' ? '↓' : '↑';
  };

  const getOvrClass = (ovr: number) => {
    if (ovr >= 85) return 'elite';
    if (ovr >= 80) return 'great';
    if (ovr >= 75) return 'good';
    if (ovr >= 70) return 'average';
    return 'below';
  };

  const getTopAgents = (player: Player, max: number = 3) => {
    return Object.entries(player.agentPool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([agent]) => agent);
  };

  const getKeyStats = (player: Player) => {
    const stats = [
      { label: 'AIM', value: player.ratings.aim },
      { label: 'UTIL', value: player.ratings.utilityUsage },
      { label: 'IQ', value: player.ratings.gameSense },
      { label: 'CLU', value: player.ratings.clutchFactor },
    ];
    return stats.sort((a, b) => b.value - a.value).slice(0, 2);
  };

  return (
    <div className="free-agency-page">
      {/* Header */}
      <div className="fa-header">
        <button className="back-button" onClick={onBack}>
          <span className="back-icon">←</span>
          Back to Roster
        </button>
        <div className="fa-title">
          <h1>Free Agency</h1>
          <span className="fa-subtitle">Sign players to strengthen your roster</span>
        </div>
        <div className="roster-capacity">
          <div className="capacity-bar">
            <div 
              className="capacity-fill" 
              style={{ width: `${(roster.length / 10) * 100}%` }}
            />
          </div>
          <span className="capacity-text">{roster.length}/10 Roster Spots</span>
        </div>
      </div>

      {/* Current Roster */}
      <div className="fa-section current-roster">
        <div className="section-header">
          <h2>Your Roster</h2>
          <span className="section-hint">Click ✕ to release a bench player</span>
        </div>
        <div className="roster-cards">
          {roster.map(player => {
            const isStarter = starters.includes(player.id);
            const isConfirming = confirmRelease === player.id;
            return (
              <div 
                key={player.id} 
                className={`roster-card ${isStarter ? 'starter' : 'bench'} ${isConfirming ? 'confirming' : ''}`}
              >
                <div className="roster-card-main" onClick={() => onViewPlayer(player.id)}>
                  <div className="roster-card-header">
                    <span className={`role-pip ${player.role}`} />
                    <span className="roster-card-name">{player.name}</span>
                    {isStarter && <span className="starter-badge">★</span>}
                  </div>
                  <div className="roster-card-stats">
                    <span className={`roster-card-ovr ${getOvrClass(player.overall)}`}>
                      {player.overall}
                    </span>
                    <span className="roster-card-role">{formatRole(player.role)}</span>
                  </div>
                </div>
                {!isStarter && canRelease && (
                  <button
                    className={`release-btn ${isConfirming ? 'confirm' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReleaseClick(player.id);
                    }}
                    onBlur={() => setConfirmRelease(null)}
                    title={isConfirming ? 'Click again to confirm' : 'Release player'}
                  >
                    {isConfirming ? '✓' : '✕'}
                  </button>
                )}
              </div>
            );
          })}
          {Array.from({ length: 10 - roster.length }).map((_, i) => (
            <div key={`empty-${i}`} className="roster-card empty">
              <span className="empty-slot">+</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="fa-section">
        <div className="fa-filters">
          <div className="filter-group">
            <label>Role</label>
            <select 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}
            >
              <option value="all">All Roles</option>
              <option value="duelist">Duelist</option>
              <option value="controller">Controller</option>
              <option value="initiator">Initiator</option>
              <option value="sentinel">Sentinel</option>
              <option value="flex">Flex</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Age</label>
            <select 
              value={ageFilter} 
              onChange={(e) => setAgeFilter(e.target.value as typeof ageFilter)}
            >
              <option value="all">All Ages</option>
              <option value="young">Young (17-20)</option>
              <option value="prime">Prime (21-26)</option>
              <option value="veteran">Veteran (27+)</option>
            </select>
          </div>
          <div className="filter-group search">
            <label>Search</label>
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Player name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button 
                  className="search-clear" 
                  onClick={() => setSearchQuery('')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <div className="filter-results">
            <span>{filteredAgents.length}</span> players
          </div>
        </div>
      </div>

      {/* Free Agents Grid */}
      <div className="fa-section">
        <div className="section-header">
          <h2>Available Free Agents</h2>
          <div className="sort-controls">
            <span className="sort-label">Sort by:</span>
            {(['overall', 'age', 'potential', 'name'] as SortKey[]).map(key => (
              <button
                key={key}
                className={`sort-btn ${sortKey === key ? 'active' : ''}`}
                onClick={() => handleSort(key)}
              >
                {key === 'overall' ? 'OVR' : key === 'potential' ? 'POT' : key.charAt(0).toUpperCase() + key.slice(1)}
                {sortKey === key && <span className="sort-dir">{getSortIcon(key)}</span>}
              </button>
            ))}
          </div>
        </div>

        {filteredAgents.length === 0 ? (
          <div className="fa-empty">
            <span className="empty-icon">🔍</span>
            <p>No free agents match your filters.</p>
            <button className="reset-filters" onClick={() => {
              setRoleFilter('all');
              setAgeFilter('all');
              setSearchQuery('');
            }}>
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="fa-grid">
            {filteredAgents.map(player => {
              const topAgents = getTopAgents(player);
              const keyStats = getKeyStats(player);
              const archetype = ALL_ARCHETYPES[player.archetype];
              
              return (
                <div key={player.id} className="fa-card">
                  <div className="fa-card-header">
                    <div className="fa-card-role">
                      <span className={`role-badge ${player.role}`}>
                        {formatRole(player.role)}
                      </span>
                      <span className="player-age">{player.age} yrs</span>
                    </div>
                    <div className={`fa-card-ovr ${getOvrClass(player.overall)}`}>
                      {player.overall}
                    </div>
                  </div>

                  <div className="fa-card-body" onClick={() => onViewPlayer(player.id)}>
                    <h3 className="fa-card-name">{player.name}</h3>
                    {archetype && (
                      <span className="fa-card-archetype" title={archetype.description}>
                        {archetype.name}
                      </span>
                    )}
                    
                    <div className="fa-card-stats">
                      {keyStats.map(stat => (
                        <div key={stat.label} className="mini-stat">
                          <span className="mini-stat-label">{stat.label}</span>
                          <span className="mini-stat-value">{stat.value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="fa-card-agents">
                      {topAgents.map(agent => {
                        const normalizedAgent = agent
                          .toLowerCase()
                          .replace(/\s+/g, '')
                          .replace(/\//g, '');
                        return (
                          <img
                            key={agent}
                            src={`https://www.vlr.gg/img/vlr/game/agents/${normalizedAgent}.png`}
                            alt={agent}
                            className="agent-icon"
                            title={agent.charAt(0).toUpperCase() + agent.slice(1)}
                          />
                        );
                      })}
                    </div>

                    <div className="fa-card-potential">
                      <span className="pot-label">Potential</span>
                      <span className="pot-range">{player.potential.floor} - {player.potential.ceiling}</span>
                    </div>
                  </div>

                  <div className="fa-card-footer">
                    <button
                      className="sign-btn"
                      onClick={() => onSignPlayer(player.id)}
                      disabled={!canSign}
                    >
                      {canSign ? 'Sign Player' : 'Roster Full'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fa-footer">
        <div className="fa-stats">
          <span>Showing <strong>{filteredAgents.length}</strong> of <strong>{freeAgents.length}</strong> free agents</span>
        </div>
      </div>
    </div>
  );
};

export default FreeAgencyPage;