// src/ui/components/Dashboard.tsx
import type { GameState, DayResult, ScheduledMatch } from '../../sim/gameState';
import type { Region, } from '../../types';
import { toLetterGrade, getGradeClass } from '../../utils/letterGrade';
import { calculateWinProbability } from '../../sim/winProbability';

interface DashboardProps {
  gameState: GameState;
  onViewTeam: (teamId: string) => void;
  onViewMatch: (matchId: string) => void;
  recentResults: DayResult[];
  regionLogos: Record<Region, string>;
  championsLogo?: string;
}

export function Dashboard({ gameState, onViewTeam, onViewMatch, recentResults, regionLogos, championsLogo }: DashboardProps) {
  const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
  const userStanding = gameState.standings.find(s => s.teamId === gameState.userTeamId);
  
  // Sort standings for user's region
  const userRegion = userTeam?.region;
  const regionStandings = [...gameState.standings]
    .filter(s => {
      const team = gameState.teams.find(t => t.id === s.teamId);
      return team?.region === userRegion;
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return (b.mapWins - b.mapLosses) - (a.mapWins - a.mapLosses);
    });

  const userRank = regionStandings.findIndex(s => s.teamId === gameState.userTeamId) + 1;

  // Get upcoming schedule for user team
  const upcomingMatches = gameState.schedule
    .filter((m: ScheduledMatch) => !m.played && (m.homeTeamId === gameState.userTeamId || m.awayTeamId === gameState.userTeamId))
    .slice(0, 5);

  // Get recent results for user team
  const userRecentMatches = gameState.schedule
    .filter((m: ScheduledMatch) => m.played && m.result && (m.homeTeamId === gameState.userTeamId || m.awayTeamId === gameState.userTeamId))
    .slice(-5)
    .reverse();

  // Flatten ALL recent events from day results for the game log
  const allRecentEvents = recentResults
    .flatMap(r => r.events.map(e => ({ ...e, day: r.day })))
    .slice(-30)
    .reverse();

  // Helper to find match ID from a result (checks schedule and playoffs)
  const findMatchIdFromResult = (resultId: string | undefined): string | null => {
    if (!resultId) return null;
    
    // Check regular schedule
    const scheduledMatch = gameState.schedule.find(m => m.result?.id === resultId);
    if (scheduledMatch) return scheduledMatch.id;
    
    // Check regional playoffs
    for (const region of ['americas', 'emea', 'pacific', 'china'] as Region[]) {
      const bracket = gameState.regionalPlayoffs[region];
      if (bracket) {
        for (const round of bracket.rounds) {
          for (const matchup of round.matchups) {
            if (matchup.matchResults?.some(r => r.id === resultId)) {
              return matchup.id;
            }
          }
        }
      }
    }
    
    // Check international tournament
    if (gameState.internationalTournament?.bracket) {
      for (const round of gameState.internationalTournament.bracket.rounds) {
        for (const matchup of round.matchups) {
          if (matchup.matchResults?.some(r => r.id === resultId)) {
            return matchup.id;
          }
        }
      }
    }
    
    return null;
  };

  // Check if playoffs have started for user's region
  const playoffsStarted = gameState.phase === 'regional_playoffs' || 
    gameState.phase === 'international' || 
    (userRegion && gameState.regionalPlayoffs[userRegion] !== undefined);

  return (
    <div className="dashboard-grid">
      {/* Left Column - Standings */}
      <div className="panel">
        <div className="panel-header">{userRegion?.toUpperCase()} Standings</div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="standings-table">
            <thead>
              <tr>
                <th></th>
                <th>Team</th>
                <th>W</th>
                <th>L</th>
              </tr>
            </thead>
            <tbody>
              {regionStandings.map((entry, idx) => {
                const team = gameState.teams.find(t => t.id === entry.teamId);
                const isUser = entry.teamId === gameState.userTeamId;
                const madePlayoffs = idx < 6;
                const eliminated = idx >= 6;
                
                // Determine clinch indicator
                let clinchIndicator = null;
                if (playoffsStarted) {
                  if (madePlayoffs) {
                    clinchIndicator = <span className="clinch-indicator clinched" title="Clinched playoffs">x</span>;
                  } else if (eliminated) {
                    clinchIndicator = <span className="clinch-indicator eliminated" title="Eliminated">z</span>;
                  }
                }
                
                return (
                  <tr key={entry.teamId} className={eliminated && playoffsStarted ? 'eliminated-row' : ''}>
                    <td className="rank">{idx + 1}</td>
                    <td>
                      <span 
                        className={`team-name-with-logo ${isUser ? 'user-team' : ''}`}
                        onClick={() => onViewTeam(entry.teamId)}
                      >
                        {clinchIndicator}
                        <img 
                          src={team?.logo} 
                          alt="" 
                          className="standings-team-logo"
                        />
                        {team?.abbreviation}
                      </span>
                    </td>
                    <td className="record">{entry.wins}</td>
                    <td className="record">{entry.losses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Center Column - Team Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Team Summary */}
        <div className="panel">
          <div className="panel-header">{userTeam?.name}</div>
          <div className="panel-body">
            <div className="team-summary">
              <div className="team-record">
                {userStanding?.wins}-{userStanding?.losses}
              </div>
              <div className="team-standing">
                {userRank === 1 ? '1st' : userRank === 2 ? '2nd' : userRank === 3 ? '3rd' : `${userRank}th`} in {userRegion?.toUpperCase()}
              </div>
              
              <div className="team-stats-grid">
                <div className="stat-group">
                  <h4>Team Ratings</h4>
                  <div className="stat-row">
                    <span className="label">Firepower</span>
                    <span className="value">
                      {userTeam?.attributes.firepower} <span className={`grade ${getGradeClass(toLetterGrade(userTeam?.attributes.firepower ?? 0))}`}>{toLetterGrade(userTeam?.attributes.firepower ?? 0)}</span>
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Utility</span>
                    <span className="value">
                      {userTeam?.attributes.utilityDepth} <span className={`grade ${getGradeClass(toLetterGrade(userTeam?.attributes.utilityDepth ?? 0))}`}>{toLetterGrade(userTeam?.attributes.utilityDepth ?? 0)}</span>
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Macro</span>
                    <span className="value">
                      {userTeam?.attributes.macroPlay} <span className={`grade ${getGradeClass(toLetterGrade(userTeam?.attributes.macroPlay ?? 0))}`}>{toLetterGrade(userTeam?.attributes.macroPlay ?? 0)}</span>
                    </span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Mental</span>
                    <span className="value">
                      {userTeam?.attributes.mentalStrength} <span className={`grade ${getGradeClass(toLetterGrade(userTeam?.attributes.mentalStrength ?? 0))}`}>{toLetterGrade(userTeam?.attributes.mentalStrength ?? 0)}</span>
                    </span>
                  </div>
                </div>
                <div className="stat-group">
                  <h4>Map Record</h4>
                  <div className="stat-row">
                    <span className="label">Maps Won</span>
                    <span className="value">{userStanding?.mapWins}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Maps Lost</span>
                    <span className="value">{userStanding?.mapLosses}</span>
                  </div>
                  <div className="stat-row">
                    <span className="label">Round Diff</span>
                    <span className="value">
                      {(userStanding?.roundDifferential ?? 0) >= 0 ? '+' : ''}
                      {userStanding?.roundDifferential}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Your Schedule */}
        <div className="panel">
          <div className="panel-header">Your Schedule</div>
          <div className="panel-body">
            <div className="schedule-list">
              {/* Recent Results */}
              {userRecentMatches.map((match: ScheduledMatch) => {
                const isHome = match.homeTeamId === gameState.userTeamId;
                const opponent = gameState.teams.find(t => t.id === (isHome ? match.awayTeamId : match.homeTeamId));
                const userScore = isHome ? match.result!.homeScore : match.result!.awayScore;
                const oppScore = isHome ? match.result!.awayScore : match.result!.homeScore;
                const won = userScore > oppScore;
                
                return (
                  <div 
                    key={match.id} 
                    className="schedule-item clickable"
                    onClick={() => onViewMatch(match.id)}
                    title="Click to view match details"
                  >
                    <span className="schedule-day">Day {match.day}</span>
                    <span className="schedule-matchup">
                      <span className="schedule-team user-team">
                        <img src={userTeam?.logo} alt="" className="schedule-team-logo" />
                        {userTeam?.abbreviation}
                      </span>
                      <span className="vs">vs</span>
                      <span className="schedule-team">
                        <img src={opponent?.logo} alt="" className="schedule-team-logo" />
                        {opponent?.abbreviation}
                      </span>
                    </span>
                    <span className={`schedule-result ${won ? 'win' : 'loss'}`}>
                      {won ? 'W' : 'L'} {userScore}-{oppScore}
                    </span>
                  </div>
                );
              })}
              
              {/* Upcoming */}
              {upcomingMatches.map((match: ScheduledMatch) => {
                const isHome = match.homeTeamId === gameState.userTeamId;
                const opponent = gameState.teams.find(t => t.id === (isHome ? match.awayTeamId : match.homeTeamId));
                
                // Calculate win probability
                const winProb = userTeam && opponent 
                  ? calculateWinProbability(userTeam, opponent, 'bo3')
                  : 50;
                
                return (
                  <div key={match.id} className="schedule-item">
                    <span className="schedule-day">Day {match.day}</span>
                    <span className="schedule-matchup">
                      <span className="schedule-team user-team">
                        <img src={userTeam?.logo} alt="" className="schedule-team-logo" />
                        {userTeam?.abbreviation}
                      </span>
                      <span className="vs">{isHome ? 'vs' : '@'}</span>
                      <span className="schedule-team">
                        <img src={opponent?.logo} alt="" className="schedule-team-logo" />
                        {opponent?.abbreviation}
                      </span>
                    </span>
                    <span className={`schedule-odds ${winProb > 50 ? 'favorite' : winProb < 50 ? 'underdog' : 'even'}`}>
                      {winProb}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Game Log */}
      <div className="panel" style={{ maxHeight: '600px', display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">📋 Game Log</div>
        <div className="panel-body" style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          <div className="game-log">
            {allRecentEvents.length === 0 ? (
              <div className="game-log-empty">
                No events yet. Press "Play Day" to advance the simulation.
              </div>
            ) : (
              allRecentEvents.map((event, idx) => {
                const userAbbr = userTeam?.abbreviation ?? '';
                const isUserMatch = event.message.includes(userAbbr);
                const isChampion = event.type === 'champion_crowned';
                const isPhaseChange = event.type === 'phase_change';
                const isPlayoffAdvance = event.type === 'playoff_advance';
                const isMatchResult = event.type === 'match_result';
                const isScrimResult = event.type === 'scrim_result';
                
                // Determine if user won or lost (message format: "WINNER def. LOSER X-Y")
                let isUserWin = false;
                let isUserLoss = false;
                if (isUserMatch && isMatchResult) {
                  // Check if user's abbreviation is before "def." (winner) or after (loser)
                  const defIndex = event.message.indexOf(' def. ');
                  if (defIndex > -1) {
                    const beforeDef = event.message.substring(0, defIndex);
                    const afterDef = event.message.substring(defIndex + 6);
                    if (beforeDef.includes(userAbbr)) {
                      isUserWin = true;
                    } else if (afterDef.includes(userAbbr)) {
                      isUserLoss = true;
                    }
                  }
                }
                
                // Try to find the match ID from the result data
                const matchData = event.data as { id?: string } | undefined;
                const resultId = matchData?.id;
                const matchId = findMatchIdFromResult(resultId);
                const isClickable = isMatchResult && matchId;
                
                // Check if this is a Champions/international event
                const isChampionsEvent = event.message.includes('Champions') || 
                                        event.message.includes('Play-Ins') ||
                                        event.message.includes('Quarterfinals:') ||
                                        event.message.includes('Semifinals:') ||
                                        event.message.includes('Grand Finals');
                
                // Extract region from message [AMERICAS], [EMEA], etc.
                const regionMatch = event.message.match(/^\[([A-Z]+)\]/);
                const regionKey = regionMatch ? regionMatch[1].toLowerCase() as Region : null;
                const regionLogo = regionKey && regionLogos[regionKey] ? regionLogos[regionKey] : null;
                const displayMessage = regionMatch ? event.message.replace(/^\[[A-Z]+\]\s*/, '') : event.message;
                
                // Determine which logo to show
                const eventLogo = isChampionsEvent && championsLogo ? championsLogo : regionLogo;
                
                let className = 'game-log-item';
                if (isUserWin) className += ' user-win';
                else if (isUserLoss) className += ' user-loss';
                else if (isUserMatch) className += ' user-match';
                if (isChampion) className += ' champion';
                if (isPhaseChange) className += ' phase-change';
                if (isPlayoffAdvance) className += ' playoff-advance';
                if (isChampionsEvent) className += ' champions-event';
                if (isScrimResult) className += ' scrim-result';
                if (isClickable) className += ' clickable';
                
                return (
                  <div 
                    key={idx} 
                    className={className}
                    onClick={() => {
                      if (isClickable && matchId) {
                        onViewMatch(matchId);
                      }
                    }}
                    style={isClickable ? { cursor: 'pointer' } : undefined}
                    title={isClickable ? 'Click to view match details' : undefined}
                  >
                    <span className="game-log-day">Day {event.day}</span>
                    {eventLogo && <img src={eventLogo} alt="" className="game-log-region-logo" />}
                    <span className="game-log-message">{displayMessage}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}