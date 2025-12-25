// src/ui/components/PlayerStatsTable.tsx
// Displays player match history and career statistics with expandable map details

import { useState } from 'react';
import type { PlayerCareerStats, PlayerMatchRecord } from '../../types/playerStats';
import './PlayerStatsTable.css';

interface PlayerStatsTableProps {
  stats: PlayerCareerStats | undefined;
  onMatchClick?: (matchId: string) => void;
}

export function PlayerStatsTable({ stats, onMatchClick }: PlayerStatsTableProps) {
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());

  if (!stats || stats.matchHistory.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header">Match History</div>
        <div className="panel-body">
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            No match history available yet.
          </p>
        </div>
      </div>
    );
  }

  const toggleExpand = (matchId: string, idx: number) => {
    const key = `${matchId}-${idx}`;
    setExpandedMatches(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Get recent matches (most recent first)
  const recentMatches = [...stats.matchHistory].reverse().slice(0, 20);

  return (
    <div className="player-stats-section">
      {/* Career Summary */}
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">Career Statistics</div>
        <div className="panel-body">
          <div className="career-stats-grid">
            <div className="career-stat-group">
              <h4>Record</h4>
              <div className="stat-row">
                <span className="label">Matches</span>
                <span className="value">{stats.matchWins}-{stats.matchLosses}</span>
              </div>
              <div className="stat-row">
                <span className="label">Maps</span>
                <span className="value">{stats.mapWins}-{stats.mapLosses}</span>
              </div>
              <div className="stat-row">
                <span className="label">Win Rate</span>
                <span className="value">
                  {stats.totalMatches > 0 
                    ? `${((stats.matchWins / stats.totalMatches) * 100).toFixed(1)}%` 
                    : '0%'}
                </span>
              </div>
            </div>
            
            <div className="career-stat-group">
              <h4>Combat</h4>
              <div className="stat-row">
                <span className="label">K/D</span>
                <span className={`value ${stats.avgKD >= 1 ? 'positive' : 'negative'}`}>
                  {stats.avgKD.toFixed(2)}
                </span>
              </div>
              <div className="stat-row">
                <span className="label">Avg ACS</span>
                <span className="value acs">{Math.round(stats.avgACS)}</span>
              </div>
              <div className="stat-row">
                <span className="label">KDA</span>
                <span className="value">
                  {stats.avgKillsPerMap.toFixed(1)}/{stats.avgDeathsPerMap.toFixed(1)}/{stats.avgAssistsPerMap.toFixed(1)}
                </span>
              </div>
            </div>
            
            <div className="career-stat-group">
              <h4>First Bloods</h4>
              <div className="stat-row">
                <span className="label">FK/Map</span>
                <span className="value">{stats.avgFirstKillsPerMap.toFixed(2)}</span>
              </div>
              <div className="stat-row">
                <span className="label">FD/Map</span>
                <span className="value">{stats.avgFirstDeathsPerMap.toFixed(2)}</span>
              </div>
              <div className="stat-row">
                <span className="label">FK-FD</span>
                <span className={`value ${(stats.totalFirstKills - stats.totalFirstDeaths) >= 0 ? 'positive' : 'negative'}`}>
                  {stats.totalFirstKills - stats.totalFirstDeaths >= 0 ? '+' : ''}
                  {stats.totalFirstKills - stats.totalFirstDeaths}
                </span>
              </div>
            </div>
            
            <div className="career-stat-group">
              <h4>Totals</h4>
              <div className="stat-row">
                <span className="label">Kills</span>
                <span className="value">{stats.totalKills}</span>
              </div>
              <div className="stat-row">
                <span className="label">Deaths</span>
                <span className="value">{stats.totalDeaths}</span>
              </div>
              <div className="stat-row">
                <span className="label">Assists</span>
                <span className="value">{stats.totalAssists}</span>
              </div>
            </div>
          </div>
          
          {/* Playoff stats if applicable */}
          {stats.playoffMatches > 0 && (
            <div className="playoff-stats-summary">
              <h4>🏆 Playoff Stats</h4>
              <div className="playoff-stats-row">
                <span>Matches: {stats.playoffMatchWins}-{stats.playoffMatches - stats.playoffMatchWins}</span>
                <span>Maps: {stats.playoffMapWins}-{stats.playoffMaps - stats.playoffMapWins}</span>
                <span>K/D: {stats.playoffDeaths > 0 
                  ? (stats.playoffKills / stats.playoffDeaths).toFixed(2) 
                  : stats.playoffKills.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Match History Table with Expandable Rows */}
      <div className="panel">
        <div className="panel-header">
          Recent Matches
          <span className="header-hint">Click row to expand map details</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="stats-table player-match-history expandable">
            <thead>
              <tr>
                <th style={{ width: '30px' }}></th>
                <th>Day</th>
                <th>Opponent</th>
                <th>Result</th>
                <th>K</th>
                <th>D</th>
                <th>A</th>
                <th>K/D</th>
                <th>ACS</th>
                <th>FK</th>
                <th>FD</th>
              </tr>
            </thead>
            <tbody>
              {recentMatches.map((match, idx) => {
                const key = `${match.matchId}-${idx}`;
                const isExpanded = expandedMatches.has(key);
                return (
                  <MatchRow
                    key={key}
                    match={match}
                    idx={idx}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExpand(match.matchId, idx)}
                    onMatchClick={onMatchClick}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface MatchRowProps {
  match: PlayerMatchRecord;
  idx: number;
  isExpanded: boolean;
  onToggle: () => void;
  onMatchClick?: (matchId: string) => void;
}

function MatchRow({ match, isExpanded, onToggle, onMatchClick }: MatchRowProps) {
  const kd = match.totalDeaths > 0 
    ? (match.totalKills / match.totalDeaths).toFixed(2) 
    : match.totalKills.toFixed(2);
  const avgACS = match.mapsPlayed > 0 
    ? Math.round(match.totalACS / match.mapsPlayed) 
    : 0;

  const handleRowClick = (e: React.MouseEvent) => {
    // If clicking the view match button, don't toggle expand
    if ((e.target as HTMLElement).closest('.view-match-btn')) {
      return;
    }
    onToggle();
  };

  return (
    <>
      {/* Main match row */}
      <tr 
        className={`match-row ${isExpanded ? 'expanded' : ''}`}
        onClick={handleRowClick}
      >
        <td className="expand-cell">
          <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
            ▶
          </span>
        </td>
        <td className="day-cell">
          {match.isPlayoff && <span className="playoff-badge">🏆</span>}
          {match.tournamentType === 'international' && <span className="intl-badge">🌍</span>}
          Day {match.date}
        </td>
        <td className="opponent-cell">
          <span className="vs">vs</span>
          <span className="opponent-abbr">{match.opponentAbbr}</span>
        </td>
        <td className={`result-cell ${match.won ? 'win' : 'loss'}`}>
          {match.won ? 'W' : 'L'} {match.mapScore}
        </td>
        <td>{match.totalKills}</td>
        <td>{match.totalDeaths}</td>
        <td>{match.totalAssists}</td>
        <td className={parseFloat(kd) >= 1 ? 'positive' : 'negative'}>
          {kd}
        </td>
        <td className="acs">{avgACS}</td>
        <td>{match.totalFirstKills}</td>
        <td>
          {match.totalFirstDeaths}
          {onMatchClick && (
            <button 
              className="view-match-btn"
              onClick={(e) => {
                e.stopPropagation();
                onMatchClick(match.matchId);
              }}
              title="View full match details"
            >
              →
            </button>
          )}
        </td>
      </tr>

      {/* Expanded map details */}
      {isExpanded && match.mapStats.map((mapStat, mapIdx) => (
        <tr 
          key={`${match.matchId}-map-${mapIdx}`} 
          className="map-detail-row"
        >
          <td className="map-connector">
            {mapIdx === match.mapStats.length - 1 ? '└' : '├'}
          </td>
          <td className="map-name" colSpan={2}>
            <div className="map-info">
              {mapStat.agent && (
                <img 
                  src={`https://www.vlr.gg/img/vlr/game/agents/${mapStat.agent.toLowerCase()}.png`}
                  alt={mapStat.agent}
                  className="agent-icon-small"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <span className="map-label">{mapStat.map}</span>
              <span className="agent-label">{mapStat.agent}</span>
            </div>
          </td>
          <td className={`result-cell ${mapStat.won ? 'win' : 'loss'}`}>
            {mapStat.won ? 'W' : 'L'} {mapStat.roundScore}
          </td>
          <td>{mapStat.kills}</td>
          <td>{mapStat.deaths}</td>
          <td>{mapStat.assists}</td>
          <td className={mapStat.deaths > 0 ? (mapStat.kills / mapStat.deaths >= 1 ? 'positive' : 'negative') : 'positive'}>
            {mapStat.deaths > 0 ? (mapStat.kills / mapStat.deaths).toFixed(2) : mapStat.kills.toFixed(2)}
          </td>
          <td className="acs">{mapStat.acs}</td>
          <td>{mapStat.firstKills}</td>
          <td>{mapStat.firstDeaths}</td>
        </tr>
      ))}
    </>
  );
}