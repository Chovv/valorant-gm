// src/ui/components/Dashboard.tsx
import type { GameState, DayResult, ScheduledMatch } from '../../sim/gameState';
import type { Region } from '../../types';
import type { KickoffBracket } from '../../sim/kickoffBracket';
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

// derive a team's current kickoff bracket status
function getKickoffStatus(bracket: KickoffBracket, teamId: string) {
  const q = bracket.qualifiers.find(q => q.teamId === teamId);
  if (q) return { status: 'qualified' as const, seed: q.seed, section: q.bracket };

  for (const section of ['upper', 'middle', 'lower'] as const) {
    for (const round of bracket[section]) {
      for (const m of round.matchups) {
        if (!m.winnerId && (m.team1Id === teamId || m.team2Id === teamId)) {
          const lives = section === 'upper' ? 3 : section === 'middle' ? 2 : 1;
          const oppId = m.team1Id === teamId ? m.team2Id : m.team1Id;
          return { status: 'active' as const, section, lives, oppId };
        }
      }
    }
  }

  return { status: 'eliminated' as const };
}

// find user's current position in international playoffs (upper/lower)
function getIntlPlayoffSection(
  bracket: { upper: { matchups: { team1Id: string | null; team2Id: string | null; winnerId: string | null }[] }[]; lower: { matchups: { team1Id: string | null; team2Id: string | null; winnerId: string | null }[] }[] },
  teamId: string
) {
  for (const section of ['upper', 'lower'] as const) {
    for (const round of bracket[section]) {
      for (const m of round.matchups) {
        if (!m.winnerId && (m.team1Id === teamId || m.team2Id === teamId)) {
          const oppId = m.team1Id === teamId ? m.team2Id : m.team1Id;
          return { section, oppId };
        }
      }
    }
  }
  return null;
}

const REGION_NAMES: Record<Region, string> = {
  americas: 'Americas',
  emea: 'EMEA',
  pacific: 'Pacific',
  china: 'China',
};

const SECTION_COLORS = {
  upper: '#ffc048',
  middle: '#59c9ff',
  lower: '#ff4655',
};

export function Dashboard({ gameState, onViewTeam, onViewMatch, recentResults, regionLogos, championsLogo }: DashboardProps) {
  const userTeam = gameState.teams.find(t => t.id === gameState.userTeamId);
  const userStanding = gameState.standings.find(s => s.teamId === gameState.userTeamId);
  const userRegion = userTeam?.region;

  const kickoffBracket = userRegion ? gameState.kickoffBrackets[userRegion] : null;
  const kickoffStatus = kickoffBracket && userTeam ? getKickoffStatus(kickoffBracket, userTeam.id) : null;

  const intl = gameState.internationalTournament;
  const swissEntry = intl ? intl.bracket.swiss.teams.find(t => t.teamId === userTeam?.id) : null;
  const intlTeamEntry = intl ? intl.teams.find(t => t.teamId === userTeam?.id) : null;
  const playoffPos = intl && userTeam ? getIntlPlayoffSection(intl.bracket, userTeam.id) : null;

  const upcomingMatches = gameState.schedule
    .filter((m: ScheduledMatch) => !m.played && (m.homeTeamId === gameState.userTeamId || m.awayTeamId === gameState.userTeamId))
    .slice(0, 5);
  const userRecentMatches = gameState.schedule
    .filter((m: ScheduledMatch) => m.played && m.result && (m.homeTeamId === gameState.userTeamId || m.awayTeamId === gameState.userTeamId))
    .slice(-5)
    .reverse();

  const allRecentEvents = recentResults
    .flatMap(r => r.events.map(e => ({ ...e, day: r.day })))
    .slice(-30)
    .reverse();

  const findMatchId = (resultId: string | undefined): string | null => {
    if (!resultId) return null;
    const s = gameState.schedule.find(m => m.result?.id === resultId);
    if (s) return s.id;
    for (const region of ['americas', 'emea', 'pacific', 'china'] as Region[]) {
      const b = gameState.kickoffBrackets?.[region];
      if (b) {
        for (const section of [...b.upper, ...b.middle, ...b.lower]) {
          for (const mu of section.matchups) {
            if (mu.matchResults?.some(r => r.id === resultId)) return mu.id;
          }
        }
      }
      const rb = gameState.regionalPlayoffs[region];
      if (rb) {
        for (const round of rb.rounds) {
          for (const mu of round.matchups) {
            if (mu.matchResults?.some(r => r.id === resultId)) return mu.id;
          }
        }
      }
    }
    if (intl?.bracket) {
      for (const round of [...intl.bracket.swiss.rounds, ...intl.bracket.upper, ...intl.bracket.lower]) {
        for (const mu of round.matchups) {
          if (mu.matchResults?.some(r => r.id === resultId)) return mu.id;
        }
      }
    }
    return null;
  };

  // qualifier tracker — 4 regions × 3 seeds
  // priority: intl bracket (running) > real event override > kickoff bracket qualifiers
  const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
  const realCfg = (gameState as any).realEventConfig as { enabled: boolean; slots: Array<{ teamId: string; seed: number }> } | undefined;
  const usingOverride = realCfg?.enabled && !intl;

  const displayQuals = regions.map(region => {
    if (intl) {
      return {
        region,
        slots: [1, 2, 3].map(seed => {
          const entry = intl.teams.find(t => t.region === region && t.seed === seed);
          return { seed, team: entry ? gameState.teams.find(t => t.id === entry.teamId) : null };
        }),
      };
    }
    if (usingOverride) {
      return {
        region,
        slots: [1, 2, 3].map(seed => {
          const slot = realCfg!.slots.find(s => {
            const t = gameState.teams.find(t => t.id === s.teamId);
            return t?.region === region && s.seed === seed;
          });
          return { seed, team: slot ? gameState.teams.find(t => t.id === slot.teamId) ?? null : null };
        }),
      };
    }
    const b = gameState.kickoffBrackets[region];
    return {
      region,
      slots: [1, 2, 3].map(seed => {
        const q = b?.qualifiers.find(q => q.seed === seed);
        return { seed, team: q ? gameState.teams.find(t => t.id === q.teamId) : null };
      }),
    };
  });

  return (
    <div className="dashboard-layout">
      <div className="dashboard-left">

        {/* tournament position */}
        <div className="panel dashboard-tournament-pos">
          <div className="panel-header">
            {gameState.phase === 'kickoff_bracket' && '🏆 Kickoff Bracket'}
            {gameState.phase === 'international' && '🌍 VCT Champions'}
            {gameState.phase === 'offseason' && '✅ Season Complete'}
            {gameState.phase === 'preseason' && '📋 Season Preview'}
          </div>
          <div className="panel-body tp-body">

            {/* kickoff phase */}
            {gameState.phase === 'kickoff_bracket' && kickoffStatus && (
              <>
                {kickoffStatus.status === 'active' && (() => {
                  const opp = kickoffStatus.oppId ? gameState.teams.find(t => t.id === kickoffStatus.oppId) : null;
                  const prob = userTeam && opp ? calculateWinProbability(userTeam, opp, 'bo3') : 50;
                  return (
                    <div className="tp-active">
                      <div className="tp-section-row">
                        <span className="tp-section-badge" style={{ background: SECTION_COLORS[kickoffStatus.section] }}>
                          {kickoffStatus.section.toUpperCase()} BRACKET
                        </span>
                        <div className="tp-lives">
                          {[...Array(3)].map((_, i) => (
                            <span key={i} className={`tp-life ${i < kickoffStatus.lives ? 'active' : 'spent'}`}>●</span>
                          ))}
                          <span className="tp-lives-label">{kickoffStatus.lives} {kickoffStatus.lives === 1 ? 'life' : 'lives'}</span>
                        </div>
                      </div>
                      <div className="tp-stake">
                        {kickoffStatus.section === 'upper' ? 'Win → Upper path · Lose → Middle Bracket' :
                         kickoffStatus.section === 'middle' ? 'Win → Middle path · Lose → Lower Bracket' :
                         'Win → Qualify for Champions · Lose → Eliminated'}
                      </div>
                      {opp ? (
                        <div className="tp-next-match" onClick={() => onViewTeam(opp.id)}>
                          <span className="tp-next-label">next up</span>
                          <img src={opp.logo} alt="" className="tp-opp-logo" />
                          <span className="tp-opp-name">{opp.name}</span>
                          <span className={`tp-win-prob ${prob > 50 ? 'fav' : prob < 50 ? 'dog' : ''}`}>{prob}%</span>
                        </div>
                      ) : (
                        <div className="tp-stake" style={{ marginTop: 8, opacity: 0.6 }}>Waiting for next opponent (TBD)</div>
                      )}
                    </div>
                  );
                })()}

                {kickoffStatus.status === 'qualified' && (
                  <div className="tp-qualified">
                    <div className="tp-qual-badge">✓ Qualified for Champions</div>
                    <div className="tp-qual-detail">
                      Seed #{kickoffStatus.seed} · {kickoffStatus.section.charAt(0).toUpperCase() + kickoffStatus.section.slice(1)} Final winner
                    </div>
                    {kickoffStatus.seed === 1 && <div className="tp-stake">You receive a Swiss stage bye at Champions</div>}
                  </div>
                )}

                {kickoffStatus.status === 'eliminated' && (
                  <div className="tp-eliminated">
                    <div className="tp-elim-badge">✗ Eliminated</div>
                    <div className="tp-stake">Did not qualify for Champions this season</div>
                  </div>
                )}
              </>
            )}

            {/* international phase */}
            {gameState.phase === 'international' && intl && (
              <>
                {!intlTeamEntry && (
                  <div className="tp-eliminated">
                    <div className="tp-elim-badge">Not at Champions</div>
                    <div className="tp-stake">
                      {realCfg?.enabled
                        ? 'Your team was not included in the real event override'
                        : `Your team did not qualify from ${userRegion ? REGION_NAMES[userRegion] : ''} Kickoff`}
                    </div>
                  </div>
                )}

                {/* in Swiss */}
                {intlTeamEntry && swissEntry && !swissEntry.advanced && !swissEntry.eliminated && !intl.bracket.swiss.complete && (
                  <div className="tp-active">
                    <div className="tp-section-row">
                      <span className="tp-section-badge" style={{ background: '#9b59b6' }}>SWISS STAGE</span>
                      <div className="tp-swiss-record">
                        <span className="tp-sw-w">{swissEntry.wins}W</span>
                        <span className="tp-sw-sep"> – </span>
                        <span className="tp-sw-l">{swissEntry.losses}L</span>
                      </div>
                    </div>
                    <div className="tp-stake">
                      {3 - swissEntry.wins} more win{3 - swissEntry.wins !== 1 ? 's' : ''} to advance ·{' '}
                      {3 - swissEntry.losses} more loss{3 - swissEntry.losses !== 1 ? 'es' : ''} = eliminated
                    </div>
                  </div>
                )}

                {/* Swiss bye (seed 1) */}
                {intlTeamEntry && intlTeamEntry.seed === 1 && !intl.bracket.swiss.complete && (
                  <div className="tp-qualified">
                    <div className="tp-qual-badge">Swiss Bye — Regional Seed #1</div>
                    <div className="tp-stake">Enter directly into Upper Quarterfinals</div>
                  </div>
                )}

                {/* in playoffs */}
                {intlTeamEntry && intl.bracket.swiss.complete && !intl.champion && (() => {
                  if (playoffPos) {
                    const opp = playoffPos.oppId ? gameState.teams.find(t => t.id === playoffPos.oppId) : null;
                    const prob = userTeam && opp ? calculateWinProbability(userTeam, opp, 'bo5') : 50;
                    return (
                      <div className="tp-active">
                        <div className="tp-section-row">
                          <span className="tp-section-badge" style={{ background: playoffPos.section === 'upper' ? SECTION_COLORS.upper : SECTION_COLORS.lower }}>
                            {playoffPos.section.toUpperCase()} BRACKET
                          </span>
                        </div>
                        {opp && (
                          <div className="tp-next-match" onClick={() => onViewTeam(opp.id)}>
                            <span className="tp-next-label">vs</span>
                            <img src={opp.logo} alt="" className="tp-opp-logo" />
                            <span className="tp-opp-name">{opp.name}</span>
                            <span className={`tp-win-prob ${prob > 50 ? 'fav' : prob < 50 ? 'dog' : ''}`}>{prob}%</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                  // eliminated in playoffs
                  return (
                    <div className="tp-eliminated">
                      <div className="tp-elim-badge">Eliminated from Champions Playoffs</div>
                    </div>
                  );
                })()}

                {/* Swiss eliminated */}
                {swissEntry?.eliminated && (
                  <div className="tp-eliminated">
                    <div className="tp-elim-badge">Eliminated in Swiss ({swissEntry.wins}-3)</div>
                    <div className="tp-stake">Did not advance to Champions playoffs</div>
                  </div>
                )}

                {/* won Champions */}
                {intl.champion === userTeam?.id && (
                  <div className="tp-qualified">
                    <div className="tp-qual-badge" style={{ background: '#ffd700', color: '#0f1115' }}>🏆 VCT Champions Winner!</div>
                  </div>
                )}
              </>
            )}

            {gameState.phase === 'offseason' && (
              <div className="tp-qualified" style={{ background: 'transparent' }}>
                <div className="tp-qual-badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                  {intl?.champion === userTeam?.id ? '🏆 VCT Champions Winner' : 'Season Ended'}
                </div>
                <div className="tp-stake">Head to Free Agency or manage your roster for next season</div>
              </div>
            )}

            {gameState.phase === 'preseason' && (
              <div className="tp-active">
                <div className="tp-stake">Season hasn't started — simulate your first match to begin Kickoff.</div>
              </div>
            )}
          </div>
        </div>

        {/* champions qualifier tracker */}
        <div className="panel dashboard-qual-tracker">
          <div className="panel-header">
            {intl
              ? <>{championsLogo && <img src={championsLogo} alt="" className="qt-header-logo" />}Champions Teams</>
              : usingOverride
                ? `📌 ${realCfg?.eventName || 'Real Event Teams'}`
                : '🎫 Champions Qualifiers'}
          </div>
          <div className="panel-body qt-body">
            {displayQuals.map(({ region, slots }) => (
              <div key={region} className="qt-region">
                <div className="qt-region-header">
                  <img src={regionLogos[region]} alt="" className="qt-region-logo" />
                  <span>{REGION_NAMES[region]}</span>
                </div>
                <div className="qt-slots">
                  {slots.map(({ seed, team }) => {
                    const isUser = team?.id === gameState.userTeamId;
                    const isChamp = intl?.champion === team?.id;
                    return (
                      <div
                        key={seed}
                        className={`qt-slot ${team ? 'filled' : 'pending'} ${isUser ? 'user-team' : ''}`}
                        onClick={team ? () => onViewTeam(team.id) : undefined}
                        title={team ? team.name : 'Not yet determined'}
                      >
                        <span className="qt-seed">#{seed}</span>
                        {team ? (
                          <>
                            <img src={team.logo} alt="" className="qt-team-logo" />
                            <span className="qt-team-abbr">{team.abbreviation}</span>
                            {isChamp && <span className="qt-champ-icon">🏆</span>}
                          </>
                        ) : (
                          <span className="qt-tbd">TBD</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* game log */}
        <div className="panel dashboard-game-log">
          <div className="panel-header">📋 Game Log</div>
          <div className="panel-body">
            <div className="game-log">
              {allRecentEvents.length === 0 ? (
                <div className="game-log-empty">No events yet. Press "Play Match" to advance the simulation.</div>
              ) : (
                allRecentEvents.map((event, idx) => {
                  const userAbbr = userTeam?.abbreviation ?? '';
                  const isUserMatch = event.message.includes(userAbbr);
                  const isChampion = event.type === 'champion_crowned';
                  const isPhaseChange = event.type === 'phase_change';
                  const isPlayoffAdvance = event.type === 'playoff_advance';
                  const isMatchResult = event.type === 'match_result';
                  const isScrimResult = event.type === 'scrim_result';

                  let isUserWin = false, isUserLoss = false;
                  if (isUserMatch && isMatchResult) {
                    const defIdx = event.message.indexOf(' def. ');
                    if (defIdx > -1) {
                      const before = event.message.substring(0, defIdx);
                      const after = event.message.substring(defIdx + 6);
                      if (before.includes(userAbbr)) isUserWin = true;
                      else if (after.includes(userAbbr)) isUserLoss = true;
                    }
                  }

                  const matchData = event.data as { id?: string } | undefined;
                  const matchId = findMatchId(matchData?.id);
                  const isClickable = isMatchResult && matchId;

                  const isChampionsEvent = event.message.includes('Champions') ||
                    event.message.includes('Play-Ins') ||
                    event.message.includes('Quarterfinals:') ||
                    event.message.includes('Semifinals:') ||
                    event.message.includes('Grand Finals');

                  const regionMatch = event.message.match(/^\[([A-Z]+)\]/);
                  const regionKey = regionMatch ? regionMatch[1].toLowerCase() as Region : null;
                  const regionLogo = regionKey && regionLogos[regionKey] ? regionLogos[regionKey] : null;
                  const displayMessage = regionMatch ? event.message.replace(/^\[[A-Z]+\]\s*/, '') : event.message;
                  const eventLogo = isChampionsEvent && championsLogo ? championsLogo : regionLogo;

                  let cls = 'game-log-item';
                  if (isUserWin) cls += ' user-win';
                  else if (isUserLoss) cls += ' user-loss';
                  else if (isUserMatch) cls += ' user-match';
                  if (isChampion) cls += ' champion';
                  if (isPhaseChange) cls += ' phase-change';
                  if (isPlayoffAdvance) cls += ' playoff-advance';
                  if (isChampionsEvent) cls += ' champions-event';
                  if (isScrimResult) cls += ' scrim-result';
                  if (isClickable) cls += ' clickable';

                  return (
                    <div
                      key={idx}
                      className={cls}
                      onClick={() => isClickable && matchId && onViewMatch(matchId)}
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

      {/* right column — team summary + schedule */}
      <div className="dashboard-right">
        <div className="panel dashboard-team-summary">
          <div className="panel-header">{userTeam?.name}</div>
          <div className="panel-body">
            <div className="team-summary">
              <div className="team-record">{userStanding?.wins}-{userStanding?.losses}</div>
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
                      {(userStanding?.roundDifferential ?? 0) >= 0 ? '+' : ''}{userStanding?.roundDifferential}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel dashboard-schedule">
          <div className="panel-header">Your Schedule</div>
          <div className="panel-body">
            <div className="schedule-list">
              {userRecentMatches.map((match: ScheduledMatch) => {
                const isHome = match.homeTeamId === gameState.userTeamId;
                const opp = gameState.teams.find(t => t.id === (isHome ? match.awayTeamId : match.homeTeamId));
                const userScore = isHome ? match.result!.homeScore : match.result!.awayScore;
                const oppScore = isHome ? match.result!.awayScore : match.result!.homeScore;
                const won = userScore > oppScore;
                return (
                  <div key={match.id} className="schedule-item clickable" onClick={() => onViewMatch(match.id)} title="Click to view match details">
                    <span className="schedule-day">Day {match.day}</span>
                    <span className="schedule-matchup">
                      <span className="schedule-team user-team">
                        <img src={userTeam?.logo} alt="" className="schedule-team-logo" />
                        {userTeam?.abbreviation}
                      </span>
                      <span className="vs">vs</span>
                      <span className="schedule-team">
                        <img src={opp?.logo} alt="" className="schedule-team-logo" />
                        {opp?.abbreviation}
                      </span>
                    </span>
                    <span className={`schedule-result ${won ? 'win' : 'loss'}`}>
                      {won ? 'W' : 'L'} {userScore}-{oppScore}
                    </span>
                  </div>
                );
              })}
              {upcomingMatches.map((match: ScheduledMatch) => {
                const isHome = match.homeTeamId === gameState.userTeamId;
                const opp = gameState.teams.find(t => t.id === (isHome ? match.awayTeamId : match.homeTeamId));
                const prob = userTeam && opp ? calculateWinProbability(userTeam, opp, 'bo3') : 50;
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
                        <img src={opp?.logo} alt="" className="schedule-team-logo" />
                        {opp?.abbreviation}
                      </span>
                    </span>
                    <span className={`schedule-odds ${prob > 50 ? 'favorite' : prob < 50 ? 'underdog' : 'even'}`}>{prob}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
