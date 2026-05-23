// src/ui/components/ChampionsBracketView.tsx
import { useRef, useEffect, useState, useMemo } from 'react';
import { computeTournamentStats, computeRegionalStats, computeStageRegionalStats, computePlayersToWatch, computeRegionalVsIntl } from '../../sim/tournamentStats';
import { TournamentStatsPanel } from './TournamentStatsPanel';
import { RegionalContextPanel } from './RegionalContextPanel';
import './TournamentStatsPanel.css';
import type { PlayoffMatchup, Team, Region, SuspendedMatchInfo } from '../../types';
import type { ChampionsBracket, ChampionsStepPhase } from '../../sim/internationalBracket';
import { CHAMPIONS_ROUND_ORDER, getChampionsRoundName } from '../../sim/internationalBracket';
import type { PlayoffRound } from '../../types/league';
import { calculateWinProbability } from '../../sim/winProbability';
import './PlayoffBracket.css';

interface ChampionsBracketViewProps {
  bracket: ChampionsBracket;
  teams: Team[];
  userTeamId: string | null;
  kickoffBrackets?: Record<string, import('../../sim/kickoffBracket').KickoffBracket | null>;
  stageGroupStages?: Record<string, { [k: number]: any } | null>;
  stagePlayoffBrackets?: Record<string, { [k: number]: any } | null>;
  stageNum?: 1 | 2;
  onMatchClick?: (matchupId: string) => void;
  onPlayDay?: () => void;
  onWatchMatch?: (matchupId: string) => void;
  onSimMatch?: (matchupId: string) => void;
  suspendedMatchupId?: string | null;
  suspendedMatchInfo?: SuspendedMatchInfo | null;
  canPlay?: boolean;
  roundLabel?: string;
  currentRound?: number;
}

const REGION_COLORS: Record<Region, string> = {
  americas: '#e74c3c',
  emea: '#3498db',
  pacific: '#2ecc71',
  china: '#f1c40f',
};

const REGION_ABBR: Record<Region, string> = {
  americas: 'NA',
  emea: 'EU',
  pacific: 'APAC',
  china: 'CN',
};

const SECTION_META = {
  upper: { label: 'Upper Bracket', color: '#4ade80', icon: '▲' },
  lower: { label: 'Lower Bracket', color: '#f87171', icon: '▼' },
};

const ROW_H = 130;
const CARD_COL_W = '300px';
const CONN_COL_W = '36px';

export function ChampionsBracketView({
  bracket, teams, userTeamId, onMatchClick,
  onPlayDay, onWatchMatch, onSimMatch, suspendedMatchupId, suspendedMatchInfo, canPlay, roundLabel, currentRound,
  kickoffBrackets, stageGroupStages, stagePlayoffBrackets, stageNum,
}: ChampionsBracketViewProps) {
  const getTeam = (id: string | null) => id ? teams.find(t => t.id === id) ?? null : null;
  const isUser = (id: string | null) => !!id && id === userTeamId;

  // anti-spoil: hide downstream slots filled by the suspended match's outcome
  const spoilerTeamIds = useMemo(() => {
    if (!suspendedMatchupId) return null;
    for (const section of [bracket.swiss.rounds, bracket.upper, bracket.lower])
      for (const round of section)
        for (const m of round.matchups)
          if (m.id === suspendedMatchupId && m.team1Id && m.team2Id)
            return new Set([m.team1Id, m.team2Id]);
    return null;
  }, [suspendedMatchupId, bracket]);

  const getRegionInfo = (teamId: string | null) => {
    if (!teamId) return null;
    return bracket.teams.find(t => t.teamId === teamId) ?? null;
  };

  // figure out which matchup is "next"
  let nextMatchupId: string | null = null;
  if (canPlay && currentRound !== undefined && currentRound < CHAMPIONS_ROUND_ORDER.length) {
    const step = CHAMPIONS_ROUND_ORDER[currentRound];
    let round: PlayoffRound | undefined;
    if (step.phase === 'swiss') round = bracket.swiss.rounds[step.roundIdx];
    else if (step.phase === 'upper') round = bracket.upper[step.roundIdx];
    else round = bracket.lower[step.roundIdx];
    if (round) {
      const next = round.matchups.find(m => m.team1Id && m.team2Id && !m.winnerId);
      if (next) nextMatchupId = next.id;
    }
  }

  // active section for play button placement
  let activePhase: ChampionsStepPhase | undefined;
  if (currentRound !== undefined && currentRound < CHAMPIONS_ROUND_ORDER.length) {
    activePhase = CHAMPIONS_ROUND_ORDER[currentRound].phase;
  }

  const activeSectionRef = useRef<HTMLDivElement>(null);
  const prevPhase = useRef(activePhase);
  const [activeTab, setActiveTab] = useState<'bracket' | 'stats'>('bracket');

  // per-section collapse state — persisted in localStorage
  const COLLAPSE_KEY = 'champions-bracket-collapse';
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}'); } catch { return {}; }
  });
  const toggleSection = (key: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      return next;
    });
  };

  // scroll to the active section only when it changes (not on mount)
  useEffect(() => {
    if (prevPhase.current !== undefined && activePhase !== prevPhase.current && activeSectionRef.current) {
      const top = activeSectionRef.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    prevPhase.current = activePhase;
  }, [activePhase, currentRound]);

  // gather all completed match results across every stage
  const allMatches = useMemo(() => {
    const out = [];
    for (const round of bracket.swiss?.rounds ?? [])
      for (const m of round.matchups) out.push(...(m.matchResults ?? []));
    for (const round of bracket.upper ?? [])
      for (const m of round.matchups) out.push(...(m.matchResults ?? []));
    for (const round of bracket.lower ?? [])
      for (const m of round.matchups) out.push(...(m.matchResults ?? []));
    return out;
  }, [bracket]);

  const playerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of teams) for (const p of t.roster) map[p.id] = p.name;
    return map;
  }, [teams]);

  const teamNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of teams) map[t.id] = t.abbreviation;
    return map;
  }, [teams]);

  const playerMeta = useMemo(() => {
    const map: Record<string, { nationality?: string; imageUrl?: string; role?: string }> = {};
    for (const t of teams) for (const p of t.roster) map[p.id] = { nationality: p.nationality, imageUrl: p.imageUrl, role: p.role, age: p.age };
    return map;
  }, [teams]);

  const teamSeeds = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of bracket.teams) m.set(t.teamId, t.seed);
    return m;
  }, [bracket.teams]);

  const tournamentStats = useMemo(
    () => computeTournamentStats(allMatches, playerNames, teamNames, playerMeta, teamSeeds),
    [allMatches, playerNames, teamNames, playerMeta, teamSeeds],
  );

  const regionalStats = useMemo(
    () => {
      // prefer stage data when available (stage 1/2 internationals)
      if (stageGroupStages && stagePlayoffBrackets && stageNum) {
        return computeStageRegionalStats(stageGroupStages, stagePlayoffBrackets, stageNum, playerNames, teamNames, playerMeta);
      }
      return kickoffBrackets ? computeRegionalStats(kickoffBrackets, playerNames, teamNames, playerMeta) : [];
    },
    [kickoffBrackets, stageGroupStages, stagePlayoffBrackets, stageNum, playerNames, teamNames, playerMeta],
  );

  const intlTeamIds = useMemo(
    () => new Set(bracket.teams.map((t: { teamId: string }) => t.teamId)),
    [bracket.teams],
  );

  const playersToWatch = useMemo(
    () => computePlayersToWatch(regionalStats, intlTeamIds, teamSeeds),
    [regionalStats, intlTeamIds, teamSeeds],
  );

  const regionalVsIntl = useMemo(
    () => tournamentStats.matchesPlayed > 0
      ? computeRegionalVsIntl(regionalStats, tournamentStats.players)
      : [],
    [regionalStats, tournamentStats],
  );

  const Chevron = ({ open }: { open: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" style={{ flexShrink: 0, marginLeft: 'auto', transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
      <polyline points="3,5 8,11 13,5" />
    </svg>
  );

  // ── matchup card ──

  const renderMatchupCard = (matchup: PlayoffMatchup, isFinal: boolean = false) => {
    const isSuspended = matchup.id === suspendedMatchupId;
    const result = isSuspended ? undefined : matchup.matchResults?.[0];
    const hasResult = !!result;

    // anti-spoil: mask teams placed by the suspended match's outcome
    const t1Spoiled = !isSuspended && !hasResult && !!spoilerTeamIds?.has(matchup.team1Id!);
    const t2Spoiled = !isSuspended && !hasResult && !!spoilerTeamIds?.has(matchup.team2Id!);
    const team1 = t1Spoiled ? null : getTeam(matchup.team1Id);
    const team2 = t2Spoiled ? null : getTeam(matchup.team2Id);

    const isClickable = hasResult && team1 && team2;
    const isTbd = !team1 || !team2;
    const isNext = !isSuspended && !suspendedMatchupId && matchup.id === nextMatchupId;

    const showWinProb = !hasResult && !isSuspended && team1 && team2;
    const t1WinProb = showWinProb ? calculateWinProbability(team1, team2, matchup.format) : null;
    const t1Won = !isSuspended && matchup.winnerId === matchup.team1Id;
    const t2Won = !isSuspended && matchup.winnerId === matchup.team2Id;

    let cardClass = 'playoff-matchup-card bracket-card';
    if (isClickable) cardClass += ' clickable';
    if (isTbd) cardClass += ' tbd';
    if (isFinal) cardClass += ' finals';
    if ((!t1Spoiled && isUser(matchup.team1Id)) || (!t2Spoiled && isUser(matchup.team2Id))) cardClass += ' user-matchup';
    if (isNext) cardClass += ' next-matchup';
    if (isSuspended) cardClass += ' suspended-live';

    const renderTeamRow = (
      teamId: string | null, won: boolean, lost: boolean,
      score: number | null, winProb: number | null,
    ) => {
      const team = getTeam(teamId);
      const regionInfo = getRegionInfo(teamId);
      const isUserTeam = isUser(teamId);
      return (
        <div className={`playoff-team-row ${won ? 'winner' : ''} ${lost ? 'loser' : ''} ${isUserTeam ? 'user-team-row' : ''}`}>
          {team ? (
            <>
              {regionInfo && (
                <span
                  className="region-seed-tag"
                  style={{
                    backgroundColor: `${REGION_COLORS[regionInfo.region]}22`,
                    borderColor: `${REGION_COLORS[regionInfo.region]}66`,
                    color: REGION_COLORS[regionInfo.region],
                  }}
                >
                  {REGION_ABBR[regionInfo.region]}{regionInfo.seed}
                </span>
              )}
              <img src={team.logo} alt={team.name} className="playoff-team-logo" />
              <span className={`playoff-team-name ${won ? 'winner-text' : ''}`}>
                {team.abbreviation}
              </span>
              {isUserTeam && <span className="user-team-badge">YOU</span>}
              {won && isFinal && <span className="champion-badge">🏆</span>}
              {hasResult && <span className={`playoff-team-score ${won ? 'winner-score' : ''}`}>{score}</span>}
              {winProb !== null && (
                <span className={`playoff-team-prob ${winProb > 50 ? 'favorite' : winProb < 50 ? 'underdog' : ''}`}>
                  {winProb}%
                </span>
              )}
            </>
          ) : (
            <span className="playoff-team-tbd">TBD</span>
          )}
        </div>
      );
    };

    return (
      <div className={cardClass} onClick={() => isSuspended ? onWatchMatch?.(matchup.id) : isClickable && onMatchClick?.(matchup.id)}>
        {isSuspended && (
          <div className="next-matchup-label live-label">
            🔴 {suspendedMatchInfo ? `${suspendedMatchInfo.homeSeriesScore}-${suspendedMatchInfo.awaySeriesScore} · ${suspendedMatchInfo.mapName} ${suspendedMatchInfo.homeMapScore}-${suspendedMatchInfo.awayMapScore}` : 'LIVE'}
          </div>
        )}
        {!isSuspended && isNext && <div className="next-matchup-label">▶ NEXT</div>}
        {renderTeamRow(matchup.team1Id, t1Won, t2Won && hasResult, result?.homeScore ?? null, t1WinProb)}
        {renderTeamRow(matchup.team2Id, t2Won, t1Won && hasResult, result?.awayScore ?? null, t1WinProb !== null ? 100 - t1WinProb : null)}
      </div>
    );
  };

  // ── Swiss stage ──

  const renderSwissStage = () => {
    const swiss = bracket.swiss;
    const isSwissActive = canPlay && activePhase === 'swiss';

    // Which round index is active?
    let activeSwissRound = -1;
    if (isSwissActive && currentRound !== undefined && currentRound < CHAMPIONS_ROUND_ORDER.length) {
      activeSwissRound = CHAMPIONS_ROUND_ORDER[currentRound].roundIdx;
    }

    const swissOpen = !collapsed['swiss'];
    return (
      <div className="kickoff-section" ref={isSwissActive ? activeSectionRef : undefined}>
        <div className="kickoff-section-header collapsible-header" style={{ borderLeftColor: '#a78bfa' }} onClick={() => toggleSection('swiss')}>
          <span className="kickoff-section-icon" style={{ color: '#a78bfa' }}>🎮</span>
          Swiss Stage
          <Chevron open={swissOpen} />
        </div>

        {/* Swiss matchups by round — bracket grid style */}
        {swissOpen && <div style={{ padding: '8px 16px 16px' }}>
          {swiss.rounds.map((round, ri) => {
            if (round.matchups.length === 0) return null;
            const count = round.matchups.length;
            const colParts = Array.from({ length: count }, () => CARD_COL_W).join(` ${CONN_COL_W} `);
            const isActiveRound = ri === activeSwissRound;
            return (
              <div key={ri} style={{ marginBottom: 16 }}>
                <div className="swiss-round-label-row">
                  <span className="swiss-round-label">{round.name}</span>
                  {isActiveRound && onPlayDay && (
                    <>
                      {suspendedMatchupId && onWatchMatch && (
                        <button className="btn btn-live-bracket" onClick={e => { e.stopPropagation(); onWatchMatch(suspendedMatchupId); }}>
                          🔴 {suspendedMatchInfo ? `Watch ${suspendedMatchInfo.homeAbbr} vs ${suspendedMatchInfo.awayAbbr} · Map ${suspendedMatchInfo.mapNumber}` : 'Now Live'}
                        </button>
                      )}
                      {!suspendedMatchupId && nextMatchupId && onWatchMatch && (
                        <button className="btn btn-watch-bracket" onClick={e => { e.stopPropagation(); onWatchMatch(nextMatchupId!); }}>👁 Watch</button>
                      )}
                      {!suspendedMatchupId && nextMatchupId && onSimMatch && (
                        <button className="btn btn-sim-match-bracket" onClick={e => { e.stopPropagation(); onSimMatch(nextMatchupId!); }}>▶ Sim Match</button>
                      )}
                      {nextMatchupId && (
                        <button className="btn btn-play swiss-round-play" onClick={e => { e.stopPropagation(); onPlayDay(); }}>⏩ Sim Round</button>
                      )}
                    </>
                  )}
                </div>
                <div
                  className="bracket-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: colParts,
                    gridTemplateRows: `${ROW_H}px`,
                  }}
                >
                  {round.matchups.map((m, mi) => (
                    <div
                      key={m.id}
                      className="bracket-grid-cell"
                      style={{ gridColumn: mi * 2 + 1, gridRow: 1 }}
                    >
                      {renderMatchupCard(m)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>}
      </div>
    );
  };

  // ── Bracket grid (same as KickoffBracketView) ──

  const renderBracketGrid = (sectionKey: 'upper' | 'lower', rounds: PlayoffRound[]) => {
    const meta = SECTION_META[sectionKey];
    const isActiveSection = canPlay && activePhase === sectionKey;
    const hasAnyTeams = rounds.some(r => r.matchups.some(m => m.team1Id || m.team2Id));

    if (!hasAnyTeams) {
      const isOpen = !collapsed[sectionKey];
      return (
        <div className="kickoff-section" key={sectionKey}>
          <div className="kickoff-section-header collapsible-header" style={{ borderLeftColor: meta.color }} onClick={() => toggleSection(sectionKey)}>
            <span className="kickoff-section-icon" style={{ color: meta.color }}>{meta.icon}</span>
            {meta.label}
            <Chevron open={isOpen} />
          </div>
          {isOpen && <div className="kickoff-section-empty"><span>Waiting for playoff teams...</span></div>}
        </div>
      );
    }

    const baseCount = rounds[0].matchups.length;
    const isOpen = !collapsed[sectionKey];

    // build grid template columns
    const colParts: string[] = [];
    rounds.forEach((_, i) => {
      if (i > 0) colParts.push(CONN_COL_W);
      colParts.push(CARD_COL_W);
    });

    const gridItems: JSX.Element[] = [];

    rounds.forEach((round, ri) => {
      const count = round.matchups.length;
      const rowSpan = Math.max(1, baseCount / count);
      const gridCol = ri * 2 + 1;

      round.matchups.forEach((m, mi) => {
        const gridRow = mi * rowSpan + 1;
        const isGrandFinal = round.name === 'Grand Final';
        gridItems.push(
          <div
            key={m.id}
            className="bracket-grid-cell"
            style={{
              gridColumn: gridCol,
              gridRow: `${gridRow} / span ${rowSpan}`,
            }}
          >
            {renderMatchupCard(m, isGrandFinal)}
          </div>
        );
      });

      // connectors
      if (ri < rounds.length - 1) {
        const nextCount = rounds[ri + 1].matchups.length;
        const connCol = gridCol + 1;

        if (count === nextCount) {
          for (let i = 0; i < count; i++) {
            gridItems.push(
              <div
                key={`c-${ri}-${i}`}
                className="bracket-conn bracket-conn-straight"
                style={{
                  gridColumn: connCol,
                  gridRow: `${i * rowSpan + 1} / span ${rowSpan}`,
                }}
              />
            );
          }
        } else if (count === 2 * nextCount) {
          const nextSpan = baseCount / nextCount;
          for (let i = 0; i < nextCount; i++) {
            gridItems.push(
              <div
                key={`c-${ri}-${i}`}
                className="bracket-conn bracket-conn-merge"
                style={{
                  gridColumn: connCol,
                  gridRow: `${i * nextSpan + 1} / span ${nextSpan}`,
                }}
              />
            );
          }
        }
      }
    });

    return (
      <div className="kickoff-section" key={sectionKey} ref={isActiveSection ? activeSectionRef : undefined}>
        <div className="kickoff-section-header collapsible-header" style={{ borderLeftColor: meta.color }} onClick={() => toggleSection(sectionKey)}>
          <span className="kickoff-section-icon" style={{ color: meta.color }}>{meta.icon}</span>
          {meta.label}
          {isActiveSection && onPlayDay && (
            <>
              {roundLabel && <span className="kickoff-section-round-label" onClick={e => e.stopPropagation()}>{roundLabel}</span>}
              {suspendedMatchupId && onWatchMatch && (
                <button className="btn btn-live-bracket" onClick={e => { e.stopPropagation(); onWatchMatch(suspendedMatchupId); }}>
                  🔴 {suspendedMatchInfo ? `Watch ${suspendedMatchInfo.homeAbbr} vs ${suspendedMatchInfo.awayAbbr} · Map ${suspendedMatchInfo.mapNumber}` : 'Now Live'}
                </button>
              )}
              {!suspendedMatchupId && nextMatchupId && onWatchMatch && (
                <button className="btn btn-watch-bracket" onClick={e => { e.stopPropagation(); onWatchMatch(nextMatchupId!); }}>👁 Watch</button>
              )}
              {!suspendedMatchupId && nextMatchupId && onSimMatch && (
                <button className="btn btn-sim-match-bracket" onClick={e => { e.stopPropagation(); onSimMatch(nextMatchupId!); }}>▶ Sim Match</button>
              )}
              {nextMatchupId && (
                <button className="btn btn-play kickoff-section-play" onClick={e => { e.stopPropagation(); onPlayDay(); }}>⏩ Sim Round</button>
              )}
            </>
          )}
          <Chevron open={isOpen} />
        </div>

        {isOpen && (
          <>
            {/* Round headers */}
            <div className="bracket-header-row" style={{ display: 'grid', gridTemplateColumns: colParts.join(' ') }}>
              {rounds.map((round, ri) => (
                <div
                  key={ri}
                  className="bracket-round-header"
                  style={{ gridColumn: ri * 2 + 1, color: meta.color }}
                >
                  {round.name}
                  <span className="kickoff-round-format">{round.matchups[0]?.format === 'bo5' ? 'BO5' : 'BO3'}</span>
                </div>
              ))}
            </div>

            {/* Bracket grid */}
            <div
              className="bracket-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: colParts.join(' '),
                gridTemplateRows: `repeat(${baseCount}, ${ROW_H}px)`,
              }}
            >
              {gridItems}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── main render ──

  return (
    <div className="kickoff-container champions-bracket-wrap">
      {/* tab toggle */}
      <div className="tsb-tabs">
        <button className={`tsb-tab ${activeTab === 'bracket' ? 'active' : ''}`} onClick={() => setActiveTab('bracket')}>
          Bracket
        </button>
        <button className={`tsb-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
          Tournament Stats
          {tournamentStats.matchesPlayed > 0 && (
            <span className="tsb-match-count">{tournamentStats.matchesPlayed} matches</span>
          )}
        </button>
      </div>

      {activeTab === 'bracket' ? (
        <>
          {renderSwissStage()}
          {renderBracketGrid('upper', bracket.upper)}
          {renderBracketGrid('lower', bracket.lower)}
        </>
      ) : (
        <RegionalContextPanel
          tournamentStats={tournamentStats}
          playersToWatch={playersToWatch}
          regionalVsIntl={regionalVsIntl}
          teams={teams}
        />
      )}
    </div>
  );
}
