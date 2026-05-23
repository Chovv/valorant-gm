// src/ui/components/TradePage.tsx
// Trading interface for ValorantGM - Modern esports design

import { useState, useMemo } from 'react';
import type { Team, Region, Role } from '../../types';
import { getTradeValue, canTrade } from '../../sim/trading';
import { InlineFlag } from './PlayerAvatar';
import './TradePage.css';

// Role icons
const ROLE_ICONS: Record<Role, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

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
    
    const userNames = userPlayers.map(p => p?.name).join(', ');
    const otherNames = otherPlayersSelected.map(p => p?.name).join(', ');
    setTradeMessage({
      type: 'success',
      text: `Trade complete! ${userNames} → ${selectedTeam.abbreviation}, ${otherNames} → ${userTeam?.abbreviation}`
    });

    setSelectedUserPlayers(new Set());
    setSelectedOtherPlayers(new Set());
    setTimeout(() => setTradeMessage(null), 5000);
  };

  const toggleUserPlayer = (playerId: string) => {
    setSelectedUserPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const toggleOtherPlayer = (playerId: string) => {
    setSelectedOtherPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const clearSelections = () => {
    setSelectedUserPlayers(new Set());
    setSelectedOtherPlayers(new Set());
  };

  const getRatingClass = (rating: number) => {
    if (rating >= 85) return 'rating-elite';
    if (rating >= 75) return 'rating-high';
    if (rating >= 65) return 'rating-mid';
    return 'rating-low';
  };

  const getValueClass = (diff: number) => {
    if (diff > 50) return 'value-great';
    if (diff > 0) return 'value-good';
    if (diff < -50) return 'value-bad';
    if (diff < 0) return 'value-poor';
    return 'value-neutral';
  };

  const userNewRosterSize = userTeam ? userTeam.roster.length - selectedUserPlayers.size + selectedOtherPlayers.size : 0;
  const otherNewRosterSize = selectedTeam ? selectedTeam.roster.length - selectedOtherPlayers.size + selectedUserPlayers.size : 0;

  return (
    <div className="trade-page">
      {/* Header */}
      <div className="trade-header">
        <div className="trade-header-content">
          <h1>Trade Center</h1>
          <p>Build your championship roster through strategic trades</p>
        </div>
      </div>

      {/* Trade Message Toast */}
      {tradeMessage && (
        <div className={`trade-toast ${tradeMessage.type}`}>
          <span className="toast-icon">{tradeMessage.type === 'success' ? '✓' : '✕'}</span>
          <span className="toast-text">{tradeMessage.text}</span>
        </div>
      )}

      {/* Main Trade Interface */}
      <div className="trade-layout">
        {/* Left Side - Your Team */}
        <div className="trade-panel your-team">
          <div className="panel-header-trade">
            <div className="team-identity">
              <img src={userTeam?.logo} alt="" className="team-logo-lg" />
              <div className="team-details">
                <span className="your-team-badge">YOUR TEAM</span>
                <h2>{userTeam?.name}</h2>
                <span className="roster-info">{userTeam?.roster.length} Players</span>
              </div>
            </div>
          </div>

          <div className="panel-subheader">
            <span>Select players to trade away</span>
            {selectedUserPlayers.size > 0 && (
              <span className="selection-badge">{selectedUserPlayers.size} selected</span>
            )}
          </div>

          <div className="player-grid">
            {userTeam?.roster.map(player => {
              const isSelected = selectedUserPlayers.has(player.id);
              const tradeValue = getTradeValue(player);
              const isIGL = userTeam.iglId === player.id;
              
              return (
                <div 
                  key={player.id}
                  className={`player-trade-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleUserPlayer(player.id)}
                >
                  <div className="card-select-indicator">
                    <div className="checkbox">{isSelected && '✓'}</div>
                  </div>
                  
                  <div className="card-main">
                    <div className="card-left">
                      <img src={ROLE_ICONS[player.role]} alt="" className="role-icon-sm" />
                      <div className="player-info">
                        <span 
                          className="player-name"
                          onClick={(e) => { e.stopPropagation(); onViewPlayer(player.id); }}
                        >
                          <InlineFlag code={player.nationality} />
                          {player.name}
                          {isIGL && <span className="igl-tag">IGL</span>}
                        </span>
                        <span className="player-meta">{player.age} yrs • POT {player.potential.ceiling}</span>
                      </div>
                    </div>
                    
                    <div className="card-right">
                      <div className={`ovr-badge ${getRatingClass(player.overall)}`}>
                        {player.overall}
                      </div>
                      <div className="trade-value">
                        <span className="value-num">{tradeValue}</span>
                        <span className="value-label">VAL</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center - Trade Summary */}
        <div className="trade-center-panel">
          <div className="trade-flow">
            {/* Outgoing */}
            <div className="flow-section outgoing">
              <div className="flow-header">
                <span className="flow-icon">↑</span>
                <span className="flow-label">SENDING</span>
              </div>
              <div className="flow-players">
                {userPlayers.length > 0 ? (
                  userPlayers.map(player => player && (
                    <div key={player.id} className="flow-player">
                      <img src={ROLE_ICONS[player.role]} alt="" className="flow-role-icon" />
                      <span className="flow-name"><InlineFlag code={player.nationality} />{player.name}</span>
                      <span className={`flow-ovr ${getRatingClass(player.overall)}`}>{player.overall}</span>
                    </div>
                  ))
                ) : (
                  <div className="flow-empty">Select players above</div>
                )}
              </div>
              {userPlayers.length > 0 && (
                <div className="flow-total">
                  <span>Total Value</span>
                  <span className="total-value">{userTotalValue}</span>
                </div>
              )}
            </div>

            {/* Trade Arrow */}
            <div className="trade-exchange">
              <div className="exchange-icon">⇄</div>
            </div>

            {/* Incoming */}
            <div className="flow-section incoming">
              <div className="flow-header">
                <span className="flow-icon">↓</span>
                <span className="flow-label">RECEIVING</span>
              </div>
              <div className="flow-players">
                {otherPlayersSelected.length > 0 ? (
                  otherPlayersSelected.map(player => player && (
                    <div key={player.id} className="flow-player">
                      <img src={ROLE_ICONS[player.role]} alt="" className="flow-role-icon" />
                      <span className="flow-name"><InlineFlag code={player.nationality} />{player.name}</span>
                      <span className={`flow-ovr ${getRatingClass(player.overall)}`}>{player.overall}</span>
                    </div>
                  ))
                ) : (
                  <div className="flow-empty">Select players below</div>
                )}
              </div>
              {otherPlayersSelected.length > 0 && (
                <div className="flow-total">
                  <span>Total Value</span>
                  <span className="total-value">{otherTotalValue}</span>
                </div>
              )}
            </div>
          </div>

          {/* Value Analysis */}
          {(userPlayers.length > 0 || otherPlayersSelected.length > 0) && (
            <div className="trade-analysis">
              {userPlayers.length > 0 && otherPlayersSelected.length > 0 && (
                <div className={`value-meter ${getValueClass(valueDiff)}`}>
                  <div className="meter-label">Trade Value</div>
                  <div className="meter-value">
                    {valueDiff > 0 ? '+' : ''}{valueDiff}
                  </div>
                  <div className="meter-status">
                    {valueDiff > 50 ? 'Great Deal!' : 
                     valueDiff > 0 ? 'Good Trade' : 
                     valueDiff === 0 ? 'Even Trade' :
                     valueDiff > -50 ? 'Slight Loss' : 'Bad Deal'}
                  </div>
                </div>
              )}

              <div className="roster-impact">
                <div className="impact-row">
                  <span className="impact-team">{userTeam?.abbreviation}</span>
                  <span className={`impact-change ${userNewRosterSize < 5 ? 'invalid' : ''}`}>
                    {userTeam?.roster.length} → {userNewRosterSize}
                  </span>
                </div>
                {selectedTeam && (
                  <div className="impact-row">
                    <span className="impact-team">{selectedTeam.abbreviation}</span>
                    <span className={`impact-change ${otherNewRosterSize < 5 ? 'invalid' : ''}`}>
                      {selectedTeam.roster.length} → {otherNewRosterSize}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="trade-actions">
            {(selectedUserPlayers.size > 0 || selectedOtherPlayers.size > 0) && (
              <button className="btn-clear" onClick={clearSelections}>
                Clear All
              </button>
            )}
            <button 
              className={`btn-execute ${tradeValidation.valid ? 'ready' : ''}`}
              disabled={!tradeValidation.valid}
              onClick={handleExecuteTrade}
            >
              {tradeValidation.valid ? (
                <>
                  <span className="btn-icon">🤝</span>
                  Execute Trade
                </>
              ) : (
                <span className="btn-disabled-text">{tradeValidation.reason}</span>
              )}
            </button>
          </div>
        </div>

        {/* Right Side - Other Team */}
        <div className="trade-panel other-team">
          <div className="panel-header-trade">
            {selectedTeam ? (
              <div className="team-identity">
                <img src={selectedTeam.logo} alt="" className="team-logo-lg" />
                <div className="team-details">
                  <span className="region-badge">{selectedTeam.region.toUpperCase()}</span>
                  <h2>{selectedTeam.name}</h2>
                  <span className="roster-info">{selectedTeam.roster.length} Players</span>
                </div>
              </div>
            ) : (
              <div className="team-identity empty">
                <div className="empty-logo">?</div>
                <div className="team-details">
                  <h2>Select Trade Partner</h2>
                  <span className="roster-info">Choose a team below</span>
                </div>
              </div>
            )}
          </div>

          {/* Team Selector */}
          <div className="team-selector-section">
            <select 
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value as Region | 'all');
                setSelectedTeamId(null);
                setSelectedOtherPlayers(new Set());
              }}
              className="region-select"
            >
              <option value="all">All Regions</option>
              <option value="americas">Americas</option>
              <option value="emea">EMEA</option>
              <option value="pacific">Pacific</option>
              <option value="china">China</option>
            </select>
            
            <div className="team-chips">
              {otherTeams.map(team => (
                <button
                  key={team.id}
                  className={`team-chip ${selectedTeamId === team.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedTeamId(team.id);
                    setSelectedOtherPlayers(new Set());
                  }}
                >
                  <img src={team.logo} alt="" className="chip-logo" />
                  <span className="chip-abbr">{team.abbreviation}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Other Team's Roster */}
          {selectedTeam ? (
            <>
              <div className="panel-subheader">
                <span>Select players to receive</span>
                {selectedOtherPlayers.size > 0 && (
                  <span className="selection-badge incoming">{selectedOtherPlayers.size} selected</span>
                )}
              </div>

              <div className="player-grid">
                {selectedTeam.roster.map(player => {
                  const isSelected = selectedOtherPlayers.has(player.id);
                  const tradeValue = getTradeValue(player);
                  const isIGL = selectedTeam.iglId === player.id;
                  
                  return (
                    <div 
                      key={player.id}
                      className={`player-trade-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleOtherPlayer(player.id)}
                    >
                      <div className="card-select-indicator">
                        <div className="checkbox">{isSelected && '✓'}</div>
                      </div>
                      
                      <div className="card-main">
                        <div className="card-left">
                          <img src={ROLE_ICONS[player.role]} alt="" className="role-icon-sm" />
                          <div className="player-info">
                            <span 
                              className="player-name"
                              onClick={(e) => { e.stopPropagation(); onViewPlayer(player.id); }}
                            >
                              <InlineFlag code={player.nationality} />
                              {player.name}
                              {isIGL && <span className="igl-tag">IGL</span>}
                            </span>
                            <span className="player-meta">{player.age} yrs • POT {player.potential.ceiling}</span>
                          </div>
                        </div>
                        
                        <div className="card-right">
                          <div className={`ovr-badge ${getRatingClass(player.overall)}`}>
                            {player.overall}
                          </div>
                          <div className="trade-value">
                            <span className="value-num">{tradeValue}</span>
                            <span className="value-label">VAL</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-roster-message">
              <div className="empty-icon">👆</div>
              <p>Select a team above to view their roster</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TradePage;