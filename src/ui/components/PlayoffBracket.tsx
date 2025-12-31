// src/ui/components/PlayoffBracket.tsx
import type { PlayoffBracket as PlayoffBracketType, PlayoffMatchup, Team } from '../../types';
import { calculateWinProbability } from '../../sim/winProbability';
import './PlayoffBracket.css';

interface PlayoffBracketProps {
  bracket: PlayoffBracketType;
  teams: Team[];
  regionChampion?: string | null;
  playoffSeeds?: Map<string, number>; // teamId -> seed number
  onMatchClick?: (matchupId: string) => void;
}

export function PlayoffBracket({ bracket, teams, playoffSeeds, onMatchClick }: PlayoffBracketProps) {
  const getTeam = (teamId: string | null) => {
    if (!teamId) return null;
    return teams.find(t => t.id === teamId);
  };

  const getSeed = (teamId: string | null): number | null => {
    if (!teamId || !playoffSeeds) return null;
    return playoffSeeds.get(teamId) ?? null;
  };

  const renderMatchupCard = (matchup: PlayoffMatchup, isFinalsMatch: boolean = false, isThirdPlace: boolean = false) => {
    const team1 = getTeam(matchup.team1Id);
    const team2 = getTeam(matchup.team2Id);
    const team1Seed = getSeed(matchup.team1Id);
    const team2Seed = getSeed(matchup.team2Id);
    const result = matchup.matchResults?.[0];
    const hasResult = result !== undefined;
    const isClickable = hasResult && team1 && team2;
    const isTbd = !team1 || !team2;

    // Calculate win probability for upcoming matches (both teams known, no result yet)
    const showWinProb = !hasResult && team1 && team2;
    const team1WinProb = showWinProb ? calculateWinProbability(team1, team2, 'bo5') : null;

    let cardClass = 'playoff-matchup-card';
    if (isClickable) cardClass += ' clickable';
    if (isTbd) cardClass += ' tbd';
    if (isFinalsMatch) cardClass += ' finals';
    if (isThirdPlace) cardClass += ' third-place';

    const team1Score = result?.homeScore ?? null;
    const team2Score = result?.awayScore ?? null;
    const team1Won = matchup.winnerId === matchup.team1Id;
    const team2Won = matchup.winnerId === matchup.team2Id;

    return (
      <div
        key={matchup.id}
        className={cardClass}
        onClick={() => {
          if (isClickable && onMatchClick) {
            onMatchClick(matchup.id);
          }
        }}
      >
        {/* Team 1 Row */}
        <div className={`playoff-team-row ${team1Won ? 'winner' : ''} ${team2Won && hasResult ? 'loser' : ''}`}>
          {team1 ? (
            <>
              {team1Seed && <span className="playoff-team-seed">#{team1Seed}</span>}
              <img src={team1.logo} alt={team1.name} className="playoff-team-logo" />
              <span className={`playoff-team-name ${team1Won ? 'winner-text' : ''}`}>
                {team1.name}
              </span>
              {hasResult && (
                <span className={`playoff-team-score ${team1Won ? 'winner-score' : ''}`}>
                  {team1Score}
                </span>
              )}
              {team1WinProb !== null && (
                <span className={`playoff-team-prob ${team1WinProb > 50 ? 'favorite' : team1WinProb < 50 ? 'underdog' : ''}`}>
                  {team1WinProb}%
                </span>
              )}
              {team1Won && isFinalsMatch && (
                <span className="champion-badge">👑</span>
              )}
            </>
          ) : (
            <span className="playoff-team-tbd">TBD</span>
          )}
        </div>

        {/* Team 2 Row */}
        <div className={`playoff-team-row ${team2Won ? 'winner' : ''} ${team1Won && hasResult ? 'loser' : ''}`}>
          {team2 ? (
            <>
              {team2Seed && <span className="playoff-team-seed">#{team2Seed}</span>}
              <img src={team2.logo} alt={team2.name} className="playoff-team-logo" />
              <span className={`playoff-team-name ${team2Won ? 'winner-text' : ''}`}>
                {team2.name}
              </span>
              {hasResult && (
                <span className={`playoff-team-score ${team2Won ? 'winner-score' : ''}`}>
                  {team2Score}
                </span>
              )}
              {team1WinProb !== null && (
                <span className={`playoff-team-prob ${(100 - team1WinProb) > 50 ? 'favorite' : (100 - team1WinProb) < 50 ? 'underdog' : ''}`}>
                  {100 - team1WinProb}%
                </span>
              )}
              {team2Won && isFinalsMatch && (
                <span className="champion-badge">👑</span>
              )}
            </>
          ) : (
            <span className="playoff-team-tbd">TBD</span>
          )}
        </div>
      </div>
    );
  };

  // Organize rounds for display - handle both hyphenated and non-hyphenated names
  const quarterfinals = bracket.rounds.find(r => r.name === 'Quarter-Finals' || r.name === 'Quarterfinals');
  const semifinals = bracket.rounds.find(r => r.name === 'Semi-Finals' || r.name === 'Semifinals');
  const thirdPlace = bracket.rounds.find(r => r.name === '3rd Place Match');
  const finals = bracket.rounds.find(r => r.name === 'Finals');

  return (
    <div className="playoff-container">
      <div className="playoff-bracket-vlr">
        {/* Quarter-Finals (for 6-team brackets) */}
        {quarterfinals && (
          <div className="playoff-round-vlr quarterfinals">
            <div className="playoff-round-title">QUARTER-FINALS</div>
            <div className="playoff-matchups-vlr">
              {quarterfinals.matchups.map(matchup => renderMatchupCard(matchup))}
            </div>
          </div>
        )}

        {/* Semifinals */}
        {semifinals && (
          <div className="playoff-round-vlr semifinals">
            <div className="playoff-round-title">SEMI-FINALS</div>
            <div className="playoff-matchups-vlr">
              {semifinals.matchups.map(matchup => renderMatchupCard(matchup))}
            </div>
          </div>
        )}

        {/* Finals and 3rd Place in same column */}
        <div className="playoff-round-vlr finals-column">
          {/* Finals */}
          {finals && (
            <div className="finals-section">
              <div className="playoff-round-title">FINALS</div>
              <div className="playoff-matchups-vlr">
                {finals.matchups.map(matchup => renderMatchupCard(matchup, true))}
              </div>
            </div>
          )}

          {/* 3rd Place Match */}
          {thirdPlace && (
            <div className="third-place-section">
              <div className="playoff-round-title">3RD PLACE</div>
              <div className="playoff-matchups-vlr">
                {thirdPlace.matchups.map(matchup => renderMatchupCard(matchup, false, true))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// International Bracket with Region Tags
// ============================================

// Region abbreviations and colors for international brackets
const REGION_TAGS: Record<string, { abbr: string; color: string }> = {
  americas: { abbr: 'NA', color: '#ff4655' },    // Red
  emea: { abbr: 'EU', color: '#b8f500' },        // Lime/Yellow-green
  pacific: { abbr: 'APAC', color: '#00d4aa' },   // Cyan/Teal
  china: { abbr: 'CN', color: '#ff6b9d' },       // Pink
};

interface InternationalBracketProps {
  bracket: PlayoffBracketType;
  teams: Team[];
  qualifiedTeams?: Array<{ teamId: string; region: string; seed: number }>;
  champion?: string | null;
  onMatchClick?: (matchupId: string) => void;
}

export function InternationalBracket({ bracket, teams, qualifiedTeams, onMatchClick }: InternationalBracketProps) {
  const getTeam = (teamId: string | null) => {
    if (!teamId) return null;
    return teams.find(t => t.id === teamId);
  };

  const getQualifiedInfo = (teamId: string | null) => {
    if (!teamId || !qualifiedTeams) return null;
    return qualifiedTeams.find(t => t.teamId === teamId) ?? null;
  };

  const renderRegionTag = (teamId: string | null) => {
    const info = getQualifiedInfo(teamId);
    if (!info) return null;
    
    const regionData = REGION_TAGS[info.region] || { abbr: '??', color: '#888' };
    
    return (
      <span 
        className="region-seed-tag"
        style={{ 
          backgroundColor: `${regionData.color}22`,
          borderColor: `${regionData.color}66`,
          color: regionData.color 
        }}
      >
        {regionData.abbr}{info.seed}
      </span>
    );
  };

  const renderMatchupCard = (matchup: PlayoffMatchup, isGrandFinals: boolean = false) => {
    const team1 = getTeam(matchup.team1Id);
    const team2 = getTeam(matchup.team2Id);
    const result = matchup.matchResults?.[0];
    const hasResult = result !== undefined;
    const isClickable = hasResult && team1 && team2;
    const isTbd = !team1 || !team2;

    let cardClass = 'playoff-matchup-card';
    if (isClickable) cardClass += ' clickable';
    if (isTbd) cardClass += ' tbd';
    if (isGrandFinals) cardClass += ' grand-finals';

    const team1Score = result?.homeScore ?? null;
    const team2Score = result?.awayScore ?? null;
    const team1Won = matchup.winnerId === matchup.team1Id;
    const team2Won = matchup.winnerId === matchup.team2Id;

    return (
      <div
        key={matchup.id}
        className={cardClass}
        onClick={() => {
          if (isClickable && onMatchClick) {
            onMatchClick(matchup.id);
          }
        }}
      >
        <div className={`playoff-team-row ${team1Won ? 'winner' : ''} ${team2Won && hasResult ? 'loser' : ''}`}>
          {team1 ? (
            <>
              {renderRegionTag(matchup.team1Id)}
              <img src={team1.logo} alt={team1.name} className="playoff-team-logo" />
              <span className={`playoff-team-name ${team1Won ? 'winner-text' : ''}`}>
                {team1.name}
              </span>
              {hasResult && (
                <span className={`playoff-team-score ${team1Won ? 'winner-score' : ''}`}>
                  {team1Score}
                </span>
              )}
              {team1Won && isGrandFinals && <span className="champion-badge">👑</span>}
            </>
          ) : (
            <span className="playoff-team-tbd">TBD</span>
          )}
        </div>

        <div className={`playoff-team-row ${team2Won ? 'winner' : ''} ${team1Won && hasResult ? 'loser' : ''}`}>
          {team2 ? (
            <>
              {renderRegionTag(matchup.team2Id)}
              <img src={team2.logo} alt={team2.name} className="playoff-team-logo" />
              <span className={`playoff-team-name ${team2Won ? 'winner-text' : ''}`}>
                {team2.name}
              </span>
              {hasResult && (
                <span className={`playoff-team-score ${team2Won ? 'winner-score' : ''}`}>
                  {team2Score}
                </span>
              )}
              {team2Won && isGrandFinals && <span className="champion-badge">👑</span>}
            </>
          ) : (
            <span className="playoff-team-tbd">TBD</span>
          )}
        </div>
      </div>
    );
  };

  // Get specific rounds
  const playIns = bracket.rounds.find(r => r.name === 'Play-Ins');
  const quarterfinals = bracket.rounds.find(r => r.name === 'Quarterfinals');
  const semifinals = bracket.rounds.find(r => r.name === 'Semifinals');
  const grandFinals = bracket.rounds.find(r => r.name === 'Grand Finals');

  return (
    <div className="intl-bracket-container">
      {/* Play-Ins Column - 2x2 Grid */}
      {playIns && (
        <div className="intl-round playins-round">
          <div className="intl-round-header">🎮 PLAY-INS</div>
          <div className="intl-matchups-column playins-grid">
            {playIns.matchups.map((matchup) => (
              <div key={matchup.id} className="intl-matchup-wrapper">
                {renderMatchupCard(matchup)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quarterfinals Column */}
      {quarterfinals && (
        <div className="intl-round">
          <div className="intl-round-header">⚔️ QUARTERFINALS</div>
          <div className="intl-matchups-column">
            {quarterfinals.matchups.map((matchup) => (
              <div key={matchup.id} className="intl-matchup-wrapper">
                {renderMatchupCard(matchup)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Semifinals Column */}
      {semifinals && (
        <div className="intl-round">
          <div className="intl-round-header">🔥 SEMIFINALS</div>
          <div className="intl-matchups-column semis-column">
            {semifinals.matchups.map((matchup) => (
              <div key={matchup.id} className="intl-matchup-wrapper">
                {renderMatchupCard(matchup)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grand Finals Column */}
      {grandFinals && (
        <div className="intl-round finals-round">
          <div className="intl-round-header grand-finals-header">🏆 GRAND FINALS</div>
          <div className="intl-matchups-column finals-column">
            {grandFinals.matchups.map((matchup) => (
              <div key={matchup.id} className="intl-matchup-wrapper">
                {renderMatchupCard(matchup, true)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}