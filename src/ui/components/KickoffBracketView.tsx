// src/ui/components/KickoffBracketView.tsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { computeTournamentStats } from '../../sim/tournamentStats';
import { TournamentStatsPanel } from './TournamentStatsPanel';
import type { PlayoffMatchup, Team, SuspendedMatchInfo } from '../../types';
import type { KickoffBracket, BracketSection, SeedEntry } from '../../sim/kickoffBracket';
import type { PlayoffRound } from '../../types/league';
import { calculateWinProbability } from '../../sim/winProbability';
import './PlayoffBracket.css';

interface KickoffBracketViewProps {
  bracket: KickoffBracket;
  allBrackets?: Record<string, KickoffBracket | null>;
  teams: Team[];
  userTeamId: string | null;
  onMatchClick?: (matchupId: string) => void;
  onPlayDay?: () => void;
  onWatchMatch?: (matchupId: string) => void;
  onSimMatch?: (matchupId: string) => void;
  suspendedMatchupId?: string | null;
  suspendedMatchInfo?: SuspendedMatchInfo | null;
  canPlay?: boolean;
  roundLabel?: string;
  activeSection?: BracketSection;
  activeRoundIdx?: number;
  intlEventName?: string;
  devMode?: boolean;
  onReseed?: (seeds: SeedEntry[]) => void;
}

const SECTION_META: Record<BracketSection, { label: string; color: string; icon: string }> = {
  upper: { label: 'Upper Bracket', color: '#4ade80', icon: '▲' },
  middle: { label: 'Middle Bracket', color: '#fbbf24', icon: '◆' },
  lower: { label: 'Lower Bracket', color: '#f87171', icon: '▼' },
};

// Row height per grid slot (px)
const ROW_H = 130;
const CARD_COL_W = '260px';
const CONN_COL_W = '36px';

// check if bracket has any played matches
function bracketHasResults(bracket: KickoffBracket): boolean {
  const allRounds = [...bracket.upper, ...bracket.middle, ...bracket.lower];
  return allRounds.some(r => r.matchups.some(m => m.winnerId));
}

// seeds panel with optional dev-mode drag reordering
function SeedsPanel({ seeds, getTeam, isUser, devMode, onReseed, bracket }: {
  seeds: SeedEntry[];
  getTeam: (id: string | null) => Team | null;
  isUser: (id: string | null) => boolean;
  devMode?: boolean;
  onReseed?: (seeds: SeedEntry[]) => void;
  bracket: KickoffBracket;
}) {
  const [editSeeds, setEditSeeds] = useState<SeedEntry[] | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const canEdit = !!devMode && !!onReseed && !bracketHasResults(bracket);
  const isEditing = canEdit && editSeeds !== null;
  const displaySeeds = editSeeds ?? seeds;

  const handleDragStart = (i: number) => setDragIdx(i);
  const handleDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOverIdx(i); };
  const handleDragLeave = () => setDragOverIdx(null);
  const handleDrop = (i: number) => {
    if (dragIdx === null || dragIdx === i || !editSeeds) return;
    const next = [...editSeeds];
    // swap teams between the two seed positions
    const tmpTeam = next[dragIdx].teamId;
    const tmpBye = next[dragIdx].hasBye;
    next[dragIdx] = { ...next[dragIdx], teamId: next[i].teamId, hasBye: next[i].hasBye };
    next[i] = { ...next[i], teamId: tmpTeam, hasBye: tmpBye };
    setEditSeeds(next);
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  const handleConfirm = () => {
    if (editSeeds && onReseed) {
      // reassign seed numbers + byes (top 4 get bye)
      const reseeded = editSeeds.map((s, i) => ({
        teamId: s.teamId,
        seed: i + 1,
        hasBye: i < 4,
      }));
      onReseed(reseeded);
      setEditSeeds(null);
    }
  };

  const handleCancel = () => setEditSeeds(null);

  return (
    <div className="kickoff-seeds-panel">
      <div className="kickoff-seeds-title">
        Seeds
        {canEdit && !isEditing && (
          <button className="btn btn-sm dev-reseed-btn" onClick={() => setEditSeeds([...seeds])}>
            🔧 Edit Seeds
          </button>
        )}
        {isEditing && (
          <div className="dev-reseed-actions">
            <button className="btn btn-sm dev-reseed-confirm" onClick={handleConfirm}>✓ Apply</button>
            <button className="btn btn-sm dev-reseed-cancel" onClick={handleCancel}>✕ Cancel</button>
          </div>
        )}
      </div>
      <div className="kickoff-seeds-grid">
        {displaySeeds.map((s, i) => {
          const team = getTeam(s.teamId);
          if (!team) return null;
          const isDragging = dragIdx === i;
          const isDragOver = dragOverIdx === i && dragIdx !== i;
          return (
            <div
              key={`${s.seed}-${s.teamId}`}
              className={`kickoff-seed-item ${s.hasBye ? 'has-bye' : ''} ${isUser(s.teamId) ? 'user-seed' : ''} ${isDragging ? 'seed-dragging' : ''} ${isDragOver ? 'seed-drag-over' : ''} ${isEditing ? 'seed-editable' : ''}`}
              draggable={isEditing}
              onDragStart={isEditing ? () => handleDragStart(i) : undefined}
              onDragOver={isEditing ? (e) => handleDragOver(e, i) : undefined}
              onDragLeave={isEditing ? handleDragLeave : undefined}
              onDrop={isEditing ? () => handleDrop(i) : undefined}
              onDragEnd={isEditing ? handleDragEnd : undefined}
            >
              {isEditing && <span className="seed-drag-handle">⠿</span>}
              <span className="kickoff-seed-num">#{s.seed}</span>
              <img src={team.logo} alt={team.name} className="kickoff-seed-logo" />
              <span className="kickoff-seed-name">{team.abbreviation}</span>
              {isUser(s.teamId) && <span className="user-team-badge">YOU</span>}
              {s.hasBye && <span className="kickoff-bye-tag">BYE</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function KickoffBracketView({
  bracket, teams, userTeamId, onMatchClick,
  onPlayDay, onWatchMatch, onSimMatch, suspendedMatchupId, suspendedMatchInfo, canPlay, roundLabel,
  activeSection, activeRoundIdx, allBrackets, intlEventName, devMode, onReseed,
}: KickoffBracketViewProps) {
  const getTeam = (id: string | null) => id ? teams.find(t => t.id === id) ?? null : null;
  const getSeed = (id: string | null) => bracket.seeds.find(s => s.teamId === id)?.seed ?? null;
  const isUser = (id: string | null) => !!id && id === userTeamId;

  // anti-spoil: hide downstream slots filled by the suspended match's outcome
  const spoilerTeamIds = useMemo(() => {
    if (!suspendedMatchupId) return null;
    for (const section of [bracket.upper, bracket.middle, bracket.lower])
      for (const round of section)
        for (const m of round.matchups)
          if (m.id === suspendedMatchupId && m.team1Id && m.team2Id)
            return new Set([m.team1Id, m.team2Id]);
    return null;
  }, [suspendedMatchupId, bracket]);
  const activeSectionRef = useRef<HTMLDivElement>(null);
  const prevSection = useRef(activeSection);
  const [activeTab, setActiveTab] = useState<'bracket' | 'stats'>('bracket');

  const COLLAPSE_KEY = 'kickoff-bracket-collapse';
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
  const Chevron = ({ open }: { open: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" style={{ flexShrink: 0, marginLeft: 'auto', transition: 'transform 0.2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
      <polyline points="3,5 8,11 13,5" />
    </svg>
  );

  const allMatches = useMemo(() => {
    const out = [];
    for (const section of [bracket.upper, bracket.middle, bracket.lower])
      for (const round of section)
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

  const tournamentStats = useMemo(
    () => computeTournamentStats(allMatches, playerNames, teamNames, playerMeta),
    [allMatches, playerNames, teamNames, playerMeta],
  );

  // scroll to the active section only when it changes (not on mount)
  useEffect(() => {
    if (prevSection.current !== undefined && activeSection !== prevSection.current && activeSectionRef.current) {
      const top = activeSectionRef.current.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    prevSection.current = activeSection;
  }, [activeSection, activeRoundIdx]);

  // next matchup to be played
  let nextMatchupId: string | null = null;
  if (canPlay && activeSection !== undefined && activeRoundIdx !== undefined) {
    const round = bracket[activeSection]?.[activeRoundIdx];
    if (round) {
      const next = round.matchups.find(m => m.team1Id && m.team2Id && !m.winnerId);
      if (next) nextMatchupId = next.id;
    }
  }

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
      const seed = getSeed(teamId);
      const isUserTeam = isUser(teamId);
      return (
        <div className={`playoff-team-row ${won ? 'winner' : ''} ${lost ? 'loser' : ''} ${isUserTeam ? 'user-team-row' : ''}`}>
          {team ? (
            <>
              {seed && <span className="playoff-team-seed">#{seed}</span>}
              <img src={team.logo} alt={team.name} className="playoff-team-logo" />
              <span className={`playoff-team-name ${won ? 'winner-text' : ''}`}>
                {team.abbreviation}
                {isUserTeam && <span className="user-team-badge">YOU</span>}
              </span>
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

  // ── bracket grid ──

  const renderBracketGrid = (section: BracketSection, rounds: PlayoffRound[]) => {
    const meta = SECTION_META[section];
    const isActiveSection = canPlay && section === activeSection;
    const hasAnyTeams = rounds.length > 0 && rounds.some(r => r.matchups.some(m => m.team1Id || m.team2Id));
    const isOpen = !collapsed[section];

    if (!hasAnyTeams || rounds.length === 0) {
      return (
        <div className="kickoff-section" key={section}>
          <div className="kickoff-section-header collapsible-header" style={{ borderLeftColor: meta.color }} onClick={() => toggleSection(section)}>
            <span className="kickoff-section-icon" style={{ color: meta.color }}>{meta.icon}</span>
            {meta.label}
            <Chevron open={isOpen} />
          </div>
          {isOpen && <div className="kickoff-section-empty"><span>Waiting for teams to drop down...</span></div>}
        </div>
      );
    }

    const baseCount = rounds[0].matchups.length;

    // build grid template columns: [round] [conn] [round] [conn] ...
    const colParts: string[] = [];
    rounds.forEach((_, i) => {
      if (i > 0) colParts.push(CONN_COL_W);
      colParts.push(CARD_COL_W);
    });

    const gridItems: JSX.Element[] = [];

    rounds.forEach((round, ri) => {
      const count = round.matchups.length;
      const rowSpan = Math.max(1, baseCount / count);
      const gridCol = ri * 2 + 1; // 1-indexed

      // matchup cards
      round.matchups.forEach((m, mi) => {
        const gridRow = mi * rowSpan + 1;
        const isFinal = round.name.includes('Final');
        gridItems.push(
          <div
            key={m.id}
            className="bracket-grid-cell"
            style={{
              gridColumn: gridCol,
              gridRow: `${gridRow} / span ${rowSpan}`,
            }}
          >
            {renderMatchupCard(m, isFinal)}
          </div>
        );
      });

      // connectors to next round
      if (ri < rounds.length - 1) {
        const nextCount = rounds[ri + 1].matchups.length;
        const connCol = gridCol + 1;

        if (count === nextCount) {
          // straight: 1-to-1
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
          // merge: 2-to-1
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
      <div className="kickoff-section" key={section} ref={isActiveSection ? activeSectionRef : undefined}>
        <div className="kickoff-section-header collapsible-header" style={{ borderLeftColor: meta.color }} onClick={() => toggleSection(section)}>
          <span className="kickoff-section-icon" style={{ color: meta.color }}>{meta.icon}</span>
          {meta.label}
          {isActiveSection && onPlayDay && (
            <>
              {roundLabel && <span className="kickoff-section-round-label">{roundLabel}</span>}
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
    <div className="kickoff-container">
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

      {activeTab === 'stats' ? (
        <TournamentStatsPanel stats={tournamentStats} teams={teams} />
      ) : (
      <>
      {/* Seeds */}
      <SeedsPanel
        seeds={bracket.seeds}
        getTeam={getTeam}
        isUser={isUser}
        devMode={devMode}
        onReseed={onReseed}
        bracket={bracket}
      />

      {/* Qualifiers */}
      {bracket.qualifiers.length > 0 && (
        <div className="kickoff-qualifiers-panel">
          <div className="kickoff-qualifiers-title">🏆 Qualified for {intlEventName || 'Champions'}</div>
          <div className="kickoff-qualifiers-list">
            {bracket.qualifiers.map(q => {
              const team = getTeam(q.teamId);
              const label = q.bracket === 'upper' ? 'Upper Final' : q.bracket === 'middle' ? 'Middle Final' : 'Lower Final';
              const color = SECTION_META[q.bracket].color;
              return (
                <div key={q.teamId} className={`kickoff-qualifier-item ${isUser(q.teamId) ? 'user-seed' : ''}`}>
                  <span className="kickoff-qualifier-seed" style={{ color }}>#{q.seed}</span>
                  <img src={team?.logo} alt="" className="kickoff-seed-logo" />
                  <span className="kickoff-qualifier-name">{team?.name}</span>
                  <span className="kickoff-qualifier-via" style={{ color }}>via {label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bracket sections */}
      {renderBracketGrid('upper', bracket.upper)}
      {renderBracketGrid('middle', bracket.middle)}
      {renderBracketGrid('lower', bracket.lower)}
      </>
      )}
    </div>
  );
}
