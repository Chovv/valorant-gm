// src/ui/components/SchedulePage.tsx
// Revamped schedule page with week-based calendar view and match cards

import { useState, useMemo } from 'react';
import type { Team, Region } from '../../types';
import type { ScheduledMatch } from '../../sim/gameState';
import { calculateWinProbability } from '../../sim/winProbability';
import './SchedulePage.css';

const REGION_LOGOS: Record<Region, string> = {
  americas: '/logos/regions/Americas.png',
  emea: '/logos/regions/EMEA.png',
  pacific: '/logos/regions/Pacific.png',
  china: '/logos/regions/China.png',
};

const REGION_NAMES: Record<Region, string> = {
  americas: 'Americas',
  emea: 'EMEA',
  pacific: 'Pacific',
  china: 'China',
};

interface SchedulePageProps {
  schedule: ScheduledMatch[];
  teams: Team[];
  userTeamId: string | null;
  currentDay: number;
  selectedRegion: Region;
  onRegionChange: (region: Region) => void;
  onViewMatch: (matchId: string) => void;
}

export function SchedulePage({
  schedule,
  teams,
  userTeamId,
  currentDay,
  selectedRegion,
  onRegionChange,
  onViewMatch,
}: SchedulePageProps) {
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week');
  const [filterTeamId, setFilterTeamId] = useState<string | 'all'>('all');
  const [showCompleted, setShowCompleted] = useState(true);

  // Get teams for current region
  const regionTeams = useMemo(() => {
    return teams.filter(t => t.region === selectedRegion);
  }, [teams, selectedRegion]);

  // Filter schedule by region and team
  const filteredSchedule = useMemo(() => {
    return schedule.filter(match => {
      // Region filter
      if (match.region !== selectedRegion) return false;
      
      // Team filter
      if (filterTeamId !== 'all') {
        if (match.homeTeamId !== filterTeamId && match.awayTeamId !== filterTeamId) {
          return false;
        }
      }
      
      // Show/hide completed
      if (!showCompleted && match.played) return false;
      
      return true;
    });
  }, [schedule, selectedRegion, filterTeamId, showCompleted]);

  // Group matches by week (4 days per week)
  const weeklySchedule = useMemo(() => {
    const weeks: Map<number, ScheduledMatch[]> = new Map();
    
    filteredSchedule.forEach(match => {
      const weekNum = Math.ceil(match.day / 4);
      if (!weeks.has(weekNum)) {
        weeks.set(weekNum, []);
      }
      weeks.get(weekNum)!.push(match);
    });
    
    // Sort matches within each week by day
    weeks.forEach((matches, weekNum) => {
      weeks.set(weekNum, matches.sort((a, b) => a.day - b.day));
    });
    
    return weeks;
  }, [filteredSchedule]);

  // Get current week
  const currentWeek = Math.ceil(currentDay / 4);

  // Get team by ID
  const getTeam = (teamId: string) => teams.find(t => t.id === teamId);

  // Check if match involves user team
  const isUserMatch = (match: ScheduledMatch) => 
    match.homeTeamId === userTeamId || match.awayTeamId === userTeamId;

  // Get match result class for user's team
  const getUserMatchResult = (match: ScheduledMatch) => {
    if (!match.played || !match.result || !isUserMatch(match)) return '';
    
    const isHome = match.homeTeamId === userTeamId;
    const userScore = isHome ? match.result.homeScore : match.result.awayScore;
    const oppScore = isHome ? match.result.awayScore : match.result.homeScore;
    
    return userScore > oppScore ? 'win' : 'loss';
  };

  return (
    <div className="schedule-page">
      {/* Header */}
      <div className="content-header">
        <img
          src={REGION_LOGOS[selectedRegion]}
          alt=""
          className="region-header-logo"
        />
        <h1>{REGION_NAMES[selectedRegion]} Schedule</h1>
      </div>

      {/* Region Tabs */}
      <div className="region-tabs">
        {(['americas', 'emea', 'pacific', 'china'] as Region[]).map(region => (
          <button
            key={region}
            className={`region-tab ${selectedRegion === region ? 'active' : ''}`}
            onClick={() => onRegionChange(region)}
          >
            <img src={REGION_LOGOS[region]} alt="" className="region-tab-logo" />
            {REGION_NAMES[region]}
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="schedule-filters">
        <div className="filter-group">
          <label>View:</label>
          <div className="toggle-buttons">
            <button
              className={viewMode === 'week' ? 'active' : ''}
              onClick={() => setViewMode('week')}
            >
              📅 Week
            </button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              📋 List
            </button>
          </div>
        </div>

        <div className="filter-group">
          <label>Team:</label>
          <select
            value={filterTeamId}
            onChange={(e) => setFilterTeamId(e.target.value)}
            className="team-filter-select"
          >
            <option value="all">All Teams</option>
            <option value={userTeamId || ''} disabled={!userTeamId}>
              ★ My Team
            </option>
            <optgroup label="Teams">
              {regionTeams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.abbreviation} - {team.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="filter-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Show Completed
          </label>
        </div>
      </div>

      {/* Week View */}
      {viewMode === 'week' && (
        <div className="schedule-weeks">
          {Array.from(weeklySchedule.entries())
            .sort(([a], [b]) => a - b)
            .map(([weekNum, matches]) => {
              const isCurrentWeek = weekNum === currentWeek;
              const isPastWeek = weekNum < currentWeek;
              const weekStartDay = (weekNum - 1) * 4 + 1;
              const weekEndDay = weekNum * 4;
              
              return (
                <div
                  key={weekNum}
                  className={`schedule-week ${isCurrentWeek ? 'current' : ''} ${isPastWeek ? 'past' : ''}`}
                >
                  <div className="week-header">
                    <span className="week-title">
                      Week {weekNum}
                      {isCurrentWeek && <span className="current-badge">Current</span>}
                    </span>
                    <span className="week-days">Days {weekStartDay}-{weekEndDay}</span>
                  </div>
                  
                  <div className="week-matches">
                    {matches.map(match => {
                      const homeTeam = getTeam(match.homeTeamId);
                      const awayTeam = getTeam(match.awayTeamId);
                      const isUser = isUserMatch(match);
                      const resultClass = getUserMatchResult(match);
                      const isClickable = match.played && match.result;
                      const isToday = match.day === currentDay;
                      
                      // Calculate win probability for upcoming matches
                      const homeWinProb = !match.played && homeTeam && awayTeam 
                        ? calculateWinProbability(homeTeam, awayTeam, 'bo3')
                        : null;
                      
                      return (
                        <div
                          key={match.id}
                          className={`match-card ${isUser ? 'user-match' : ''} ${resultClass} ${isClickable ? 'clickable' : ''} ${isToday ? 'today' : ''}`}
                          onClick={() => isClickable && onViewMatch(match.id)}
                        >
                          <div className="match-day-badge">
                            Day {match.day}
                            {isToday && <span className="today-indicator">Today</span>}
                          </div>
                          
                          <div className="match-teams">
                            <div className={`match-team home ${match.homeTeamId === userTeamId ? 'is-user' : ''}`}>
                              <img src={homeTeam?.logo} alt="" className="match-team-logo" />
                              <span className="match-team-name">{homeTeam?.abbreviation}</span>
                              {match.played && match.result && (
                                <span className={`match-team-score ${match.result.homeScore > match.result.awayScore ? 'winner' : ''}`}>
                                  {match.result.homeScore}
                                </span>
                              )}
                              {!match.played && homeWinProb !== null && (
                                <span className={`match-team-prob ${homeWinProb > 50 ? 'favorite' : homeWinProb < 50 ? 'underdog' : ''}`}>
                                  {homeWinProb}%
                                </span>
                              )}
                            </div>
                            
                            <div className="match-vs">vs</div>
                            
                            <div className={`match-team away ${match.awayTeamId === userTeamId ? 'is-user' : ''}`}>
                              <img src={awayTeam?.logo} alt="" className="match-team-logo" />
                              <span className="match-team-name">{awayTeam?.abbreviation}</span>
                              {match.played && match.result && (
                                <span className={`match-team-score ${match.result.awayScore > match.result.homeScore ? 'winner' : ''}`}>
                                  {match.result.awayScore}
                                </span>
                              )}
                              {!match.played && homeWinProb !== null && (
                                <span className={`match-team-prob ${(100 - homeWinProb) > 50 ? 'favorite' : (100 - homeWinProb) < 50 ? 'underdog' : ''}`}>
                                  {100 - homeWinProb}%
                                </span>
                              )}
                            </div>
                          </div>

                          {!match.played && (
                            <div className="match-upcoming-badge">Upcoming</div>
                          )}
                          
                          {match.played && match.result && (
                            <div className="match-result-badge">
                              Final
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="schedule-list-view">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Home</th>
                <th></th>
                <th>Away</th>
                <th>Result / Odds</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedule
                .sort((a, b) => a.day - b.day)
                .map(match => {
                  const homeTeam = getTeam(match.homeTeamId);
                  const awayTeam = getTeam(match.awayTeamId);
                  const isUser = isUserMatch(match);
                  const resultClass = getUserMatchResult(match);
                  const isClickable = match.played && match.result;
                  const isToday = match.day === currentDay;
                  const isPast = match.day < currentDay;
                  
                  // Calculate win probability for upcoming matches
                  const homeWinProb = !match.played && homeTeam && awayTeam 
                    ? calculateWinProbability(homeTeam, awayTeam, 'bo3')
                    : null;
                  
                  return (
                    <tr
                      key={match.id}
                      className={`${isUser ? 'user-match-row' : ''} ${resultClass} ${isClickable ? 'clickable' : ''} ${isToday ? 'today-row' : ''} ${isPast && !match.played ? 'missed' : ''}`}
                      onClick={() => isClickable && onViewMatch(match.id)}
                    >
                      <td className="day-col">
                        <span className="day-num">Day {match.day}</span>
                        {isToday && <span className="today-dot"></span>}
                      </td>
                      <td className="team-col home">
                        <div className={`team-cell ${match.homeTeamId === userTeamId ? 'is-user' : ''}`}>
                          <img src={homeTeam?.logo} alt="" className="table-team-logo" />
                          <span>{homeTeam?.abbreviation}</span>
                        </div>
                      </td>
                      <td className="vs-col">vs</td>
                      <td className="team-col away">
                        <div className={`team-cell ${match.awayTeamId === userTeamId ? 'is-user' : ''}`}>
                          <img src={awayTeam?.logo} alt="" className="table-team-logo" />
                          <span>{awayTeam?.abbreviation}</span>
                        </div>
                      </td>
                      <td className="result-col">
                        {match.played && match.result ? (
                          <span className={`result-score ${match.result.homeScore > match.result.awayScore ? 'home-win' : 'away-win'}`}>
                            {match.result.homeScore} - {match.result.awayScore}
                          </span>
                        ) : homeWinProb !== null ? (
                          <span className="result-odds">
                            <span className={homeWinProb > 50 ? 'favorite' : 'underdog'}>{homeWinProb}%</span>
                            {' - '}
                            <span className={100 - homeWinProb > 50 ? 'favorite' : 'underdog'}>{100 - homeWinProb}%</span>
                          </span>
                        ) : (
                          <span className="result-pending">-</span>
                        )}
                      </td>
                      <td className="status-col">
                        {match.played ? (
                          <span className="status-badge completed">Played</span>
                        ) : isToday ? (
                          <span className="status-badge today">Today</span>
                        ) : (
                          <span className="status-badge upcoming">Upcoming</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {filteredSchedule.length === 0 && (
        <div className="schedule-empty">
          <div className="empty-icon">📅</div>
          <h3>No Matches Found</h3>
          <p>
            {filterTeamId !== 'all'
              ? 'No matches for the selected team in this region.'
              : !showCompleted
              ? 'No upcoming matches. Enable "Show Completed" to see past results.'
              : 'No matches scheduled for this region.'}
          </p>
        </div>
      )}

      {/* Season Progress */}
      <div className="season-progress-panel">
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{
              width: `${(filteredSchedule.filter(m => m.played).length / Math.max(filteredSchedule.length, 1)) * 100}%`
            }}
          />
        </div>
        <div className="progress-weeks">
          {Array.from(weeklySchedule.keys()).sort((a, b) => a - b).map(weekNum => {
            const weekMatches = weeklySchedule.get(weekNum) || [];
            const playedCount = weekMatches.filter(m => m.played).length;
            const totalCount = weekMatches.length;
            const isComplete = playedCount === totalCount;
            const isCurrent = weekNum === currentWeek;
            
            return (
              <div
                key={weekNum}
                className={`progress-week-dot ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`}
                title={`Week ${weekNum}: ${playedCount}/${totalCount} matches`}
              >
                {isCurrent ? '●' : isComplete ? '✓' : '○'}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}