// src/ui/components/TradePage.tsx
// Trading interface for ValorantGM - supports multi-player trades

import { useState, useMemo } from 'react';
import type { Team, Region } from '../../types';
import { getTradeValue, canTrade } from '../../sim/trading';
import './TradePage.css';

interface TradePageProps {
  teams: Team[];
  userTeamId: string;
  onExecuteTrade: (team1Id: string, team2Id: string, player1Ids: string[], player2Ids: string[]) => void;
  onViewPlayer: (playerId: string) => void;
}

export function TradePage({ teams, userTeamId, onExecuteTrade, onViewPlayer }: TradePageProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedUserPlayers, setSelectedUserPlayers] = useState<Set<string>>(new Set());
  const [selectedOtherPlayers, setSelectedOtherPlayers] = useState<Set<string>>(new Set());
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');
  const [tradeMessage, setTradeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const userTeam = teams.find(t => t.id === userTeamId);
  const otherTeams = useMemo(() => 
    teams.filter(t => t.id !== userTeamId && (regionFilter === 'all' || t.region === regionFilter)),
    [teams, userTeamId, regionFilter]
  );
  const selectedTeam = selectedTeamId ? teams.find(t => t.id === selectedTeamId) : null;

  // Get selected players
  const userPlayers = useMemo(() => 
    Array.from(selectedUserPlayers).map(id => userTeam?.roster.find(p => p.id === id)).filter(Boolean),
    [selectedUserPlayers, userTeam]
  );
  const otherPlayersSelected = useMemo(() => 
    Array.from(selectedOtherPlayers).map(id => selectedTeam?.roster.find(p => p.id === id)).filter(Boolean),
    [selectedOtherPlayers, selectedTeam]
  );

  // Calculate total values
  const userTotalValue = useMemo(() => 
    userPlayers.reduce((sum, p) => sum + (p ? getTradeValue(p) : 0), 0),
    [userPlayers]
  );
  const otherTotalValue = useMemo(() => 
    otherPlayersSelected.reduce((sum, p) => sum + (p ? getTradeValue(p) : 0), 0),
    [otherPlayersSelected]
  );
  const valueDiff = otherTotalValue - userTotalValue;

  // Check if trade is valid
  const tradeValidation = useMemo(() => {
    if (!userTeam || !selectedTeam) {
      return { valid: false, reason: 'Select a team to trade with' };
    }
    return canTrade(
      userTeam, 
      selectedTeam, 
      Array.from(selectedUserPlayers), 
      Array.from(selectedOtherPlayers)
    );
  }, [userTeam, selectedTeam, selectedUserPlayers, selectedOtherPlayers]);

  const handleExecuteTrade = () => {
    if (!selectedTeam || !tradeValidation.valid) return;

    onExecuteTrade(
      userTeamId, 
      selectedTeam.id, 
      Array.from(selectedUserPlayers), 
      Array.from(selectedOtherPlayers)
    );
    
    // Show success message
    const userNames = userPlayers.map(p => p?.name).join(', ');
    const otherNames = otherPlayersSelected.map(p => p?.name).join(', ');
    setTradeMessage({
      type: 'success',
      text: `Trade complete! ${userNames} → ${selectedTeam.abbreviation}, ${otherNames} → ${userTeam?.abbreviation}`
    });

    // Reset selections
    setSelectedUserPlayers(new Set());
    setSelectedOtherPlayers(new Set());

    // Clear message after 5 seconds
    setTimeout(() => setTradeMessage(null), 5000);
  };

  const toggleUserPlayer = (playerId: string) => {
    setSelectedUserPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const toggleOtherPlayer = (playerId: string) => {
    setSelectedOtherPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const clearSelections = () => {
    setSelectedUserPlayers(new Set());
    setSelectedOtherPlayers(new Set());
  };

  const getRoleClass = (role: string) => `role-${role.toLowerCase()}`;
  
  const getRatingClass = (rating: number) => {
    if (rating >= 80) return 'rating-elite';
    if (rating >= 70) return 'rating-high';
    if (rating >= 55) return 'rating-mid';
    return 'rating-low';
  };

  const getValueDiffClass = (diff: number) => {
    if (diff > 100) return 'value-great';
    if (diff > 0) return 'value-good';
    if (diff < -100) return 'value-bad';
    if (diff < 0) return 'value-poor';
    return 'value-neutral';
  };

  // Calculate roster sizes after trade
  const userNewRosterSize = userTeam ? userTeam.roster.length - selectedUserPlayers.size + selectedOtherPlayers.size : 0;
  const otherNewRosterSize = selectedTeam ? selectedTeam.roster.length - selectedOtherPlayers.size + selectedUserPlayers.size : 0;

  return (
    <div className="trade-page">
      <div className="content-header">
        <h1>Trade Center</h1>
        <span className="header-subtitle">Select multiple players for trades (1-for-2, 2-for-1, etc.)</span>
      </div>

      {/* Trade Message */}
      {tradeMessage && (
        <div className={`trade-message ${tradeMessage.type}`}>
          {tradeMessage.type === 'success' ? '✅' : '❌'} {tradeMessage.text}
        </div>
      )}

      {/* Trade Interface */}
      <div className="trade-interface">
        {/* Your Team */}
        <div className="trade-side user-side">
          <div className="trade-side-header">
            <img src={userTeam?.logo} alt={userTeam?.name} className="trade-team-logo" />
            <div className="trade-team-info">
              <h2>{userTeam?.name}</h2>
              <span className="trade-team-badge">Your Team</span>
            </div>
          </div>

          <div className="trade-player-list">
            <div className="list-header">
              <span>Select players to trade away</span>
              <span className="roster-count">
                {selectedUserPlayers.size > 0 && (
                  <span className="selected-count">{selectedUserPlayers.size} selected • </span>
                )}
                {userTeam?.roster.length} players
              </span>
            </div>
            <div className="player-list-scroll">
              {userTeam?.roster.map(player => {
                const isSelected = selectedUserPlayers.has(player.id);
                const tradeValue = getTradeValue(player);
                const isIGL = userTeam.iglId === player.id;
                
                return (
                  <div 
                    key={player.id}
                    className={`trade-player-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleUserPlayer(player.id)}
                  >
                    <div className="player-card-main">
                      <div className="player-card-info">
                        <span 
                          className="player-name"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewPlayer(player.id);
                          }}
                        >
                          {player.name}
                        </span>
                        {isIGL && <span className="igl-badge-small">IGL</span>}
                        <div className="player-meta">
                          <span className={`role-pill-small ${getRoleClass(player.role)}`}>
                            {player.role.slice(0, 3).toUpperCase()}
                          </span>
                          <span className="player-age">{player.age} yrs</span>
                        </div>
                      </div>
                      <div className="player-card-stats">
                        <div className={`player-ovr ${getRatingClass(player.overall)}`}>
                          {player.overall}
                        </div>
                        <div className="player-value">
                          <span className="value-label">Value</span>
                          <span className="value-number">{tradeValue}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Trade Summary (Center) */}
        <div className="trade-center">
          <div className="trade-summary">
            <h3>Trade Summary</h3>
            
            <div className="trade-arrows">
              <div className="trade-arrow-section">
                <div className="arrow-label">You send ({selectedUserPlayers.size})</div>
                <div className="arrow-player-list">
                  {userPlayers.length > 0 ? (
                    userPlayers.map(player => player && (
                      <div key={player.id} className="arrow-player-item">
                        <span className="arrow-player-name">{player.name}</span>
                        <span className={`arrow-player-ovr ${getRatingClass(player.overall)}`}>
                          {player.overall}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="arrow-placeholder">Select players</span>
                  )}
                </div>
                {userPlayers.length > 0 && (
                  <div className="arrow-total">
                    Total Value: <strong>{userTotalValue}</strong>
                  </div>
                )}
                <div className="trade-arrow">→</div>
              </div>

              <div className="trade-arrow-section">
                <div className="arrow-label">You receive ({selectedOtherPlayers.size})</div>
                <div className="arrow-player-list">
                  {otherPlayersSelected.length > 0 ? (
                    otherPlayersSelected.map(player => player && (
                      <div key={player.id} className="arrow-player-item">
                        <span className="arrow-player-name">{player.name}</span>
                        <span className={`arrow-player-ovr ${getRatingClass(player.overall)}`}>
                          {player.overall}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="arrow-placeholder">Select players</span>
                  )}
                </div>
                {otherPlayersSelected.length > 0 && (
                  <div className="arrow-total">
                    Total Value: <strong>{otherTotalValue}</strong>
                  </div>
                )}
                <div className="trade-arrow">←</div>
              </div>
            </div>

            {/* Roster Size Preview */}
            {(selectedUserPlayers.size > 0 || selectedOtherPlayers.size > 0) && (
              <div className="roster-preview">
                <div className="roster-preview-item">
                  <span className="roster-preview-label">{userTeam?.abbreviation} roster:</span>
                  <span className={`roster-preview-value ${userNewRosterSize < 5 ? 'invalid' : ''}`}>
                    {userTeam?.roster.length} → {userNewRosterSize}
                  </span>
                </div>
                {selectedTeam && (
                  <div className="roster-preview-item">
                    <span className="roster-preview-label">{selectedTeam.abbreviation} roster:</span>
                    <span className={`roster-preview-value ${otherNewRosterSize < 5 ? 'invalid' : ''}`}>
                      {selectedTeam.roster.length} → {otherNewRosterSize}
                    </span>
                  </div>
                )}
              </div>
            )}

            {userPlayers.length > 0 && otherPlayersSelected.length > 0 && (
              <div className={`value-comparison ${getValueDiffClass(valueDiff)}`}>
                <span className="value-diff-label">Value difference:</span>
                <span className="value-diff-number">
                  {valueDiff > 0 ? '+' : ''}{valueDiff}
                  {valueDiff > 0 ? ' (You win)' : valueDiff < 0 ? ' (They win)' : ' (Even)'}
                </span>
              </div>
            )}

            {(selectedUserPlayers.size > 0 || selectedOtherPlayers.size > 0) && (
              <button className="clear-selections-btn" onClick={clearSelections}>
                Clear Selections
              </button>
            )}

            <button 
              className="execute-trade-btn"
              disabled={!tradeValidation.valid}
              onClick={handleExecuteTrade}
            >
              {tradeValidation.valid ? '🤝 Execute Trade' : tradeValidation.reason}
            </button>
          </div>
        </div>

        {/* Other Team */}
        <div className="trade-side other-side">
          <div className="trade-side-header">
            {selectedTeam ? (
              <>
                <img src={selectedTeam.logo} alt={selectedTeam.name} className="trade-team-logo" />
                <div className="trade-team-info">
                  <h2>{selectedTeam.name}</h2>
                  <span className="trade-team-region">{selectedTeam.region.toUpperCase()}</span>
                </div>
              </>
            ) : (
              <div className="trade-team-info">
                <h2>Select a Team</h2>
                <span className="trade-team-region">Choose a trade partner</span>
              </div>
            )}
          </div>

          {/* Team Selector */}
          <div className="team-selector">
            <div className="team-selector-filters">
              <select 
                value={regionFilter}
                onChange={(e) => {
                  setRegionFilter(e.target.value as Region | 'all');
                  setSelectedTeamId(null);
                  setSelectedOtherPlayers(new Set());
                }}
                className="region-filter"
              >
                <option value="all">All Regions</option>
                <option value="americas">Americas</option>
                <option value="emea">EMEA</option>
                <option value="pacific">Pacific</option>
                <option value="china">China</option>
              </select>
            </div>
            
            <div className="team-selector-list">
              {otherTeams.map(team => (
                <button
                  key={team.id}
                  className={`team-selector-btn ${selectedTeamId === team.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedTeamId(team.id);
                    setSelectedOtherPlayers(new Set());
                  }}
                >
                  <img src={team.logo} alt={team.abbreviation} className="team-selector-logo" />
                  <span className="team-selector-abbr">{team.abbreviation}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Selected Team's Roster */}
          {selectedTeam && (
            <div className="trade-player-list">
              <div className="list-header">
                <span>Select players to receive</span>
                <span className="roster-count">
                  {selectedOtherPlayers.size > 0 && (
                    <span className="selected-count">{selectedOtherPlayers.size} selected • </span>
                  )}
                  {selectedTeam.roster.length} players
                </span>
              </div>
              <div className="player-list-scroll">
                {selectedTeam.roster.map(player => {
                  const isSelected = selectedOtherPlayers.has(player.id);
                  const tradeValue = getTradeValue(player);
                  const isIGL = selectedTeam.iglId === player.id;
                  
                  return (
                    <div 
                      key={player.id}
                      className={`trade-player-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleOtherPlayer(player.id)}
                    >
                      <div className="player-card-main">
                        <div className="player-card-info">
                          <span 
                            className="player-name"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewPlayer(player.id);
                            }}
                          >
                            {player.name}
                          </span>
                          {isIGL && <span className="igl-badge-small">IGL</span>}
                          <div className="player-meta">
                            <span className={`role-pill-small ${getRoleClass(player.role)}`}>
                              {player.role.slice(0, 3).toUpperCase()}
                            </span>
                            <span className="player-age">{player.age} yrs</span>
                          </div>
                        </div>
                        <div className="player-card-stats">
                          <div className={`player-ovr ${getRatingClass(player.overall)}`}>
                            {player.overall}
                          </div>
                          <div className="player-value">
                            <span className="value-label">Value</span>
                            <span className="value-number">{tradeValue}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TradePage;