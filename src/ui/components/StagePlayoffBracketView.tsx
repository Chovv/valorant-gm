// src/ui/components/StagePlayoffBracketView.tsx
// 8-team double-elimination bracket for VCT stage playoffs
// reuses PlayoffBracket.css classes (same grid pattern as ChampionsBracketView)

import { useState, useEffect, useRef, useMemo } from 'react';
import { computeTournamentStats } from '../../sim/tournamentStats';
import { TournamentStatsPanel } from './TournamentStatsPanel';
import type { PlayoffMatchup, Team, SuspendedMatchInfo, MatchResult } from '../../types';
import type { PlayoffRound } from '../../types/league';
import type { StagePlayoffBracket } from '../../sim/stagePlayoffs';
import type { GroupStage } from '../../sim/stageGroupStage';
import { STAGE_PLAYOFF_ROUND_ORDER, getStagePlayoffRoundName } from '../../sim/stagePlayoffs';
import { calculateWinProbability } from '../../sim/winProbability';
import './PlayoffBracket.css';
import './StageGroupStandingsView.css';
import './TournamentStatsPanel.css';

interface Props {
  bracket: StagePlayoffBracket;
  allBrackets?: Record<string, StagePlayoffBracket | undefined>;
  groupStages?: Record<string, GroupStage | undefined>;
  teams: Team[];
  userTeamId: string | null;
  stageNum: 1 | 2;
  currentStep: number;
  selectedRegion?: string;
  onMatchClick?: (matchupId: string) => void;
  onPlayDay?: () => void;
  onWatchMatch?: (matchupId: string) => void;
  onSimMatch?: (matchupId: string) => void;
  suspendedMatchupId?: string | null;
  suspendedMatchInfo?: SuspendedMatchInfo | null;
  canPlay?: boolean;
}

const REGION_LABELS: Record<string, string> = { americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' };

const SECTION_META = {
  upper: { label: 'Upper Bracket', color: '#4ade80', icon: '▲' },
  lower: { label: 'Lower Bracket', color: '#f87171', icon: '▼' },
};

const ROW_H = 130;
const CARD_COL_W = '280px';
const CONN_COL_W = '36px';

export function StagePlayoffBracketView({
  bracket, allBrackets, groupStages, teams, userTeamId, stageNum, currentStep,
  selectedRegion, onMatchClick, onPlayDay, onWatchMatch, onSimMatch,
  suspendedMatchupId, suspendedMatchInfo, canPlay,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  const [activeTab, setActiveTab] = useState<'bracket' | 'stats'>('bracket');
  const [statsScope, setStatsScope] = useState<'all' | 'region'>('region');

  const getTeam = (id: string | null) => id ? teams.find(t => t.id === id) ?? null : null;
  const isUser = (id: string | null) => !!id && id === userTeamId;

  // anti-spoil: hide downstream slots filled by the suspended match's outcome
  const spoilerTeamIds = useMemo(() => {
    if (!suspendedMatchupId) return null;
    for (const rounds of [bracket.upper, bracket.lower])
      for (const round of rounds)
        for (const m of round.matchups)
          if (m.id === suspendedMatchupId && m.team1Id && m.team2Id)
            return new Set([m.team1Id, m.team2Id]);
    return null;
  }, [suspendedMatchupId, bracket]);

  // collect all matches from all regions' groups + playoffs for stats
  const allMatches = useMemo(() => {
    const out: MatchResult[] = [];
    const brackets = allBrackets ?? { _: bracket };
    for (const b of Object.values(brackets)) {
      if (!b) continue;
      for (const rounds of [b.upper, b.lower])
        for (const round of rounds)
          for (const m of round.matchups) out.push(...(m.matchResults ?? []));
    }
    if (groupStages) {
      for (const gs of Object.values(groupStages)) {
        if (!gs?.groups) continue;
        for (const group of gs.groups)
          for (const m of group.schedule)
            if (m.played && m.result) out.push(m.result);
      }
    }
    return out;
  }, [bracket, allBrackets, groupStages]);

  // region-only matches
  const regionMatches = useMemo(() => {
    if (!selectedRegion) return allMatches;
    const out: MatchResult[] = [];
    const b = allBrackets?.[selectedRegion];
    if (b) {
      for (const rounds of [b.upper, b.lower])
        for (const round of rounds)
          for (const m of round.matchups) out.push(...(m.matchResults ?? []));
    }
    const gs = groupStages?.[selectedRegion];
    if (gs?.groups) {
      for (const group of gs.groups)
        for (const m of group.schedule)
          if (m.played && m.result) out.push(m.result);
    }
    return out;
  }, [selectedRegion, allBrackets, groupStages]);

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
    const map: Record<string, { nationality?: string; imageUrl?: string; role?: string; age?: number }> = {};
    for (const t of teams) for (const p of t.roster) map[p.id] = { nationality: p.nationality, imageUrl: p.imageUrl, role: p.role, age: p.age };
    return map;
  }, [teams]);

  const tournamentStats = useMemo(
    () => computeTournamentStats(allMatches, playerNames, teamNames, playerMeta),
    [allMatches, playerNames, teamNames, playerMeta],
  );

  const regionStats = useMemo(
    () => computeTournamentStats(regionMatches, playerNames, teamNames, playerMeta),
    [regionMatches, playerNames, teamNames, playerMeta],
  );

  const activeStats = statsScope === 'region' && selectedRegion ? regionStats : tournamentStats;

  // find the current active phase from STAGE_PLAYOFF_ROUND_ORDER
  const activePhase = currentStep < STAGE_PLAYOFF_ROUND_ORDER.length
    ? STAGE_PLAYOFF_ROUND_ORDER[currentStep].phase
    : null;

  // find next unplayed matchup
  // find next unplayed matchup (no useMemo — bracket mutates in place)
  const nextMatchupId = (() => {
    if (currentStep >= STAGE_PLAYOFF_ROUND_ORDER.length) return null;
    const step = STAGE_PLAYOFF_ROUND_ORDER[currentStep];
    const rounds = step.phase === 'upper' ? bracket.upper : bracket.lower;
    const round = rounds[step.roundIdx];
    if (!round) return null;
    const m = round.matchups.find(mu => mu.team1Id && mu.team2Id && !mu.winnerId);
    return m?.id ?? null;
  })();

  // auto-scroll only when the active bracket section changes (upper ↔ lower)
  const prevPhase = useRef<string | null>(null);
  useEffect(() => {
    if (prevPhase.current !== null && activePhase !== prevPhase.current && activePhase) {
      if (collapsed[activePhase]) {
        setCollapsed(prev => ({ ...prev, [activePhase]: false }));
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = document.querySelector('.active-section');
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }));
    }
    prevPhase.current = activePhase;
  }, [activePhase]);

  const Chevron = ({ open }: { open: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" style={{ flexShrink: 0, marginLeft: 'auto', transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
      <polyline points="3,5 8,11 13,5" />
    </svg>
  );

  // match number and TBD routing labels per bracket position
  // upper[roundIdx][matchupIdx] and lower[roundIdx][matchupIdx]
  const MATCH_LABELS: Record<string, Record<number, Record<number, { num: string; tbd1?: string; tbd2?: string }>>> = {
    upper: {
      0: { 0: { num: 'M1', tbd1: 'Omega #2', tbd2: 'Alpha #3' }, 1: { num: 'M2', tbd1: 'Alpha #2', tbd2: 'Omega #3' } },
      1: { 0: { num: 'M3', tbd1: 'Alpha #1', tbd2: 'Winner M1' }, 1: { num: 'M4', tbd1: 'Omega #1', tbd2: 'Winner M2' } },
      2: { 0: { num: 'M9', tbd1: 'Winner M3', tbd2: 'Winner M4' } },
      3: { 0: { num: 'M12', tbd1: 'Winner M9', tbd2: 'Winner M11' } },
    },
    lower: {
      0: { 0: { num: 'M5', tbd1: 'Omega #4', tbd2: 'Loser M1' }, 1: { num: 'M6', tbd1: 'Alpha #4', tbd2: 'Loser M2' } },
      1: { 0: { num: 'M7', tbd1: 'Winner M5', tbd2: 'Loser M4' }, 1: { num: 'M8', tbd1: 'Winner M6', tbd2: 'Loser M3' } },
      2: { 0: { num: 'M10', tbd1: 'Winner M7', tbd2: 'Winner M8' } },
      3: { 0: { num: 'M11', tbd1: 'Loser M9', tbd2: 'Winner M10' } },
    },
  };

  // matchup card
  const renderCard = (matchup: PlayoffMatchup, isFinal = false, sectionKey = 'upper', roundIdx = 0, matchIdx = 0) => {
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
    const labels = MATCH_LABELS[sectionKey]?.[roundIdx]?.[matchIdx];
    const isBo5 = matchup.format === 'bo5';

    const showProb = !hasResult && !isSuspended && team1 && team2;
    const t1Prob = showProb ? calculateWinProbability(team1, team2, matchup.format) : null;
    const t1Won = !isSuspended && matchup.winnerId === matchup.team1Id;
    const t2Won = !isSuspended && matchup.winnerId === matchup.team2Id;

    let cls = 'playoff-matchup-card bracket-card';
    if (isClickable) cls += ' clickable';
    if (isTbd) cls += ' tbd';
    if (isFinal) cls += ' finals';
    if ((!t1Spoiled && isUser(matchup.team1Id)) || (!t2Spoiled && isUser(matchup.team2Id))) cls += ' user-matchup';
    if (isNext) cls += ' next-matchup';
    if (isSuspended) cls += ' suspended-live';

    const seedLabels = bracket.seedLabels ?? {};

    const renderRow = (teamId: string | null, won: boolean, lost: boolean, score: number | null, prob: number | null, tbdLabel?: string) => {
      const team = getTeam(teamId);
      const isU = isUser(teamId);
      const seedLabel = teamId ? seedLabels[teamId] : null;
      return (
        <div className={`playoff-team-row ${won ? 'winner' : ''} ${lost ? 'loser' : ''} ${isU ? 'user-team-row' : ''}`}>
          {team ? (
            <>
              {seedLabel && <span className="playoff-team-seed">{seedLabel}</span>}
              <img src={team.logo} alt={team.name} className="playoff-team-logo" />
              <span className={`playoff-team-name ${won ? 'winner-text' : ''}`}>
                {team.abbreviation}
                {isU && <span className="user-team-badge">YOU</span>}
              </span>
              {won && isFinal && <span className="champion-badge">🏆</span>}
              {hasResult && <span className={`playoff-team-score ${won ? 'winner-score' : ''}`}>{score}</span>}
              {prob !== null && (
                <span className={`playoff-team-prob ${prob > 50 ? 'favorite' : prob < 50 ? 'underdog' : ''}`}>{prob}%</span>
              )}
            </>
          ) : (
            <span className="playoff-team-tbd">{tbdLabel ?? 'TBD'}</span>
          )}
        </div>
      );
    };

    return (
      <div className={cls} onClick={() => isSuspended ? onWatchMatch?.(matchup.id) : isClickable && onMatchClick?.(matchup.id)}>
        {labels && <div className="bracket-match-label">{labels.num}{isBo5 ? ' · Bo5' : ''}</div>}
        {isSuspended && (
          <div className="next-matchup-label live-label">
            🔴 {suspendedMatchInfo ? `${suspendedMatchInfo.homeSeriesScore}-${suspendedMatchInfo.awaySeriesScore} · ${suspendedMatchInfo.mapName} ${suspendedMatchInfo.homeMapScore}-${suspendedMatchInfo.awayMapScore}` : 'LIVE'}
          </div>
        )}
        {!isSuspended && isNext && <div className="next-matchup-label">▶ NEXT</div>}
        {renderRow(matchup.team1Id, t1Won, t2Won && hasResult, result?.homeScore ?? null, t1Prob, labels?.tbd1)}
        {renderRow(matchup.team2Id, t2Won, t1Won && hasResult, result?.awayScore ?? null, t1Prob !== null ? 100 - t1Prob : null, labels?.tbd2)}
      </div>
    );
  };

  // bracket grid (same pattern as ChampionsBracketView.renderBracketGrid)
  const renderGrid = (sectionKey: 'upper' | 'lower', rounds: PlayoffRound[]) => {
    const meta = SECTION_META[sectionKey];
    const isActive = canPlay && activePhase === sectionKey;
    const hasTeams = rounds.some(r => r.matchups.some(m => m.team1Id || m.team2Id));
    const isOpen = !collapsed[sectionKey];

    if (!hasTeams) {
      return (
        <div className="kickoff-section" key={sectionKey}>
          <div className="kickoff-section-header collapsible-header" style={{ borderLeftColor: meta.color }} onClick={() => toggle(sectionKey)}>
            <span className="kickoff-section-icon" style={{ color: meta.color }}>{meta.icon}</span>
            {meta.label}
            <Chevron open={isOpen} />
          </div>
          {isOpen && <div className="kickoff-section-empty"><span>Waiting for playoff teams...</span></div>}
        </div>
      );
    }

    const baseCount = rounds[0].matchups.length;
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
        const isGF = round.name === 'Grand Final';
        gridItems.push(
          <div
            key={m.id}
            className="bracket-grid-cell"
            style={{ gridColumn: gridCol, gridRow: `${gridRow} / span ${rowSpan}` }}
          >
            {renderCard(m, isGF, sectionKey, ri, mi)}
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
                style={{ gridColumn: connCol, gridRow: `${i * rowSpan + 1} / span ${rowSpan}` }}
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
                style={{ gridColumn: connCol, gridRow: `${i * nextSpan + 1} / span ${nextSpan}` }}
              />
            );
          }
        }
      }
    });

    return (
      <div className="kickoff-section" key={sectionKey}>
        <div
          className={`kickoff-section-header collapsible-header ${isActive ? 'active-section' : ''}`}
          style={{ borderLeftColor: meta.color }}
          onClick={() => toggle(sectionKey)}
        >
          <span className="kickoff-section-icon" style={{ color: meta.color }}>{meta.icon}</span>
          {meta.label}
          {isActive && (
            <>
              {suspendedMatchupId && onWatchMatch && (
                <button className="btn btn-live-bracket" onClick={e => { e.stopPropagation(); onWatchMatch(suspendedMatchupId); }}>
                  🔴 {suspendedMatchInfo ? `Watch ${suspendedMatchInfo.homeAbbr} vs ${suspendedMatchInfo.awayAbbr} · Map ${suspendedMatchInfo.mapNumber}` : 'Now Live'}
                </button>
              )}
              {!suspendedMatchupId && nextMatchupId && onWatchMatch && (
                <button className="btn btn-watch-bracket" onClick={e => { e.stopPropagation(); onWatchMatch(nextMatchupId); }}>👁 Watch</button>
              )}
              {!suspendedMatchupId && nextMatchupId && onSimMatch && (
                <button className="btn btn-sim-match-bracket" onClick={e => { e.stopPropagation(); onSimMatch(nextMatchupId); }}>▶ Sim Match</button>
              )}
              {nextMatchupId && onPlayDay && (
                <button className="btn btn-play kickoff-section-play" onClick={e => { e.stopPropagation(); onPlayDay(); }}>⏩ Sim Round</button>
              )}
            </>
          )}
          <Chevron open={isOpen} />
        </div>

        {isOpen && (
          <>
            <div className="bracket-header-row" style={{ display: 'grid', gridTemplateColumns: colParts.join(' ') }}>
              {rounds.map((round, ri) => (
                <div key={ri} className="bracket-round-header" style={{ gridColumn: ri * 2 + 1, color: meta.color }}>
                  {round.name}
                  <span className="kickoff-round-format">{round.matchups[0]?.format === 'bo5' ? 'BO5' : 'BO3'}</span>
                </div>
              ))}
            </div>
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

  // qualified teams banner
  const qualified = bracket.qualifiedTeams.map(id => getTeam(id)).filter(Boolean);

  return (
    <div className="kickoff-container">
      {/* tab toggle */}
      <div className="tsb-tabs">
        <button className={`tsb-tab ${activeTab === 'bracket' ? 'active' : ''}`} onClick={() => setActiveTab('bracket')}>
          Bracket
        </button>
        <button className={`tsb-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
          Regional Stats
          {activeStats.matchesPlayed > 0 && (
            <span className="tsb-match-count">{activeStats.matchesPlayed} matches</span>
          )}
        </button>
      </div>

      {activeTab === 'stats' ? (
        <>
          {selectedRegion && (
            <div className="tsb-tabs" style={{ marginBottom: 0, borderBottom: 'none', paddingTop: 0 }}>
              <button className={`tsb-tab ${statsScope === 'region' ? 'active' : ''}`} onClick={() => setStatsScope('region')}>
                {REGION_LABELS[selectedRegion] ?? selectedRegion}
                {regionStats.matchesPlayed > 0 && <span className="tsb-match-count">{regionStats.matchesPlayed}</span>}
              </button>
              <button className={`tsb-tab ${statsScope === 'all' ? 'active' : ''}`} onClick={() => setStatsScope('all')}>
                All Regions
                {tournamentStats.matchesPlayed > 0 && <span className="tsb-match-count">{tournamentStats.matchesPlayed}</span>}
              </button>
            </div>
          )}
          <TournamentStatsPanel stats={activeStats} teams={teams} />
        </>
      ) : (
      <>
      {qualified.length > 0 && (
        <div className="stage-playoff-qualified">
          <span className="stage-playoff-qualified-label">Qualified for International</span>
          <div className="stage-playoff-qualified-teams">
            {qualified.map((t, i) => t && (
              <span key={t.id} className="stage-playoff-qualified-team">
                <img src={t.logo} alt="" className="playoff-team-logo" />
                {t.abbreviation}
                <span className="stage-playoff-seed">#{i + 1}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {renderGrid('upper', bracket.upper)}
      {renderGrid('lower', bracket.lower)}
      </>
      )}
    </div>
  );
}
