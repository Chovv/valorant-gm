// src/ui/components/StageGroupStandingsView.tsx
// group standings (Alpha & Omega) + match schedule using smc-card format

import { useState, useMemo } from 'react';
import { computeTournamentStats } from '../../sim/tournamentStats';
import { TournamentStatsPanel } from './TournamentStatsPanel';
import type { Team, SuspendedMatchInfo, MatchResult } from '../../types';
import type { GroupStage, StageGroup, GroupMatch } from '../../sim/stageGroupStage';
import { sortGroupStandings } from '../../sim/stageGroupStage';
import { getTeamOverall } from '../../sim/teamRatings';
import './StageGroupStandingsView.css';
import './SchedulePage.css';
import './TournamentStatsPanel.css';

const ROLE_ICONS: Record<string, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

function getOvrColor(ovr: number): string {
  if (ovr >= 90) return '#ffd700';
  if (ovr >= 80) return 'var(--accent)';
  if (ovr >= 70) return 'var(--success)';
  if (ovr >= 55) return 'var(--warning)';
  return 'var(--text-muted)';
}

interface Props {
  groupStage: GroupStage;
  allGroupStages?: Record<string, GroupStage | undefined>;
  selectedRegion?: string;
  teams: Team[];
  userTeamId: string | null;
  onViewTeam?: (teamId: string) => void;
  onSimMatchup?: (matchId: string) => void;
  onWatchMatchup?: (matchId: string) => void;
  onMatchClick?: (matchId: string) => void;
  suspendedMatchupId?: string | null;
  suspendedMatchInfo?: SuspendedMatchInfo | null;
  onSimMatchday?: (matchIds: string[]) => void;
  onSimAllMatchdays?: () => void;
}

const REGION_LABELS: Record<string, string> = { americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' };

export function StageGroupStandingsView({
  groupStage, allGroupStages, selectedRegion, teams, userTeamId, onViewTeam,
  onSimMatchup, onWatchMatchup, onMatchClick,
  suspendedMatchupId, suspendedMatchInfo,
  onSimMatchday, onSimAllMatchdays,
}: Props) {
  const getTeam = (id: string) => teams.find(t => t.id === id);
  const [activeTab, setActiveTab] = useState<'groups' | 'stats'>('groups');
  const [statsScope, setStatsScope] = useState<'all' | 'region'>('region');

  // collect all matches across all regions' group stages for stats
  const allMatches = useMemo(() => {
    const out: MatchResult[] = [];
    const stages = allGroupStages ?? { _: groupStage };
    for (const gs of Object.values(stages)) {
      if (!gs?.groups) continue;
      for (const group of gs.groups)
        for (const m of group.schedule)
          if (m.played && m.result) out.push(m.result);
    }
    return out;
  }, [groupStage, allGroupStages]);

  // region-only matches (from current groupStage which is already the selected region's data)
  const regionMatches = useMemo(() => {
    const out: MatchResult[] = [];
    for (const group of groupStage.groups)
      for (const m of group.schedule)
        if (m.played && m.result) out.push(m.result);
    return out;
  }, [groupStage]);

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

  return (
    <div className="stage-groups-page">
      {/* tab toggle */}
      <div className="tsb-tabs">
        <button className={`tsb-tab ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveTab('groups')}>
          Groups
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
      <div className="stage-groups-wrap">
        {groupStage.groups.map(group => (
          <GroupTable
            key={group.name}
            group={group}
            getTeam={getTeam}
            userTeamId={userTeamId}
            onViewTeam={onViewTeam}
          />
        ))}
      </div>

      <MatchSchedule
        groupStage={groupStage}
        teams={teams}
        userTeamId={userTeamId}
        onSimMatchup={onSimMatchup}
        onWatchMatchup={onWatchMatchup}
        onMatchClick={onMatchClick}
        suspendedMatchupId={suspendedMatchupId}
        suspendedMatchInfo={suspendedMatchInfo}
        onSimMatchday={onSimMatchday}
        onSimAllMatchdays={onSimAllMatchdays}
      />
      </>
      )}
    </div>
  );
}

// ── group table ──

function GroupTable({ group, getTeam, userTeamId, onViewTeam }: {
  group: StageGroup;
  getTeam: (id: string) => Team | undefined;
  userTeamId: string | null;
  onViewTeam?: (id: string) => void;
}) {
  const sorted = sortGroupStandings(group);
  const totalMatches = group.schedule.length;
  const played = group.schedule.filter(m => m.played).length;

  return (
    <div className="stage-group-panel">
      <div className="stage-group-header">
        <span className="stage-group-name">Group {group.name}</span>
        <span className="stage-group-progress">{played}/{totalMatches} matches</span>
      </div>
      <div className="sg-grid">
        <div className="sg-grid-head">
          <span className="sg-col sg-col-rank">#</span>
          <span className="sg-col sg-col-team">Team</span>
          <span className="sg-col sg-col-record">W-L</span>
          <span className="sg-col sg-col-maps">Maps</span>
          <span className="sg-col sg-col-rd">RD</span>
          <span className="sg-col sg-col-status">Status</span>
        </div>
        {sorted.map((entry, idx) => {
          const team = getTeam(entry.teamId);
          const isUser = entry.teamId === userTeamId;
          const rank = idx + 1;
          const mapDiff = entry.mapWins - entry.mapLosses;

          let status = '';
          let statusClass = '';
          if (played === totalMatches) {
            if (rank === 1) { status = 'UB Semi (Bye)'; statusClass = 'sg-qualified-top'; }
            else if (rank <= 3) { status = 'UB Round 1'; statusClass = 'sg-qualified'; }
            else if (rank === 4) { status = 'LB Round 1'; statusClass = 'sg-qualified-low'; }
            else { status = 'Eliminated'; statusClass = 'sg-eliminated'; }
          } else if (entry.wins + entry.losses > 0) {
            if (rank <= 4) { statusClass = 'sg-on-track'; status = rank === 1 ? '1st' : `${rank}th`; }
            else { statusClass = 'sg-outside'; status = `${rank}th`; }
          }

          return (
            <div
              key={entry.teamId}
              className={`sg-grid-row ${isUser ? 'sg-user' : ''} ${rank === 4 ? 'sg-cutoff' : ''}`}
              onClick={() => onViewTeam?.(entry.teamId)}
            >
              <span className="sg-col sg-col-rank">{rank}</span>
              <span className="sg-col sg-col-team">
                {team?.logo && <img src={team.logo} alt="" className="sg-team-logo" />}
                <span className="sg-team-name">{team?.abbreviation ?? '???'}</span>
                {isUser && <span className="sg-you-badge">YOU</span>}
              </span>
              <span className="sg-col sg-col-record">{entry.wins}-{entry.losses}</span>
              <span className="sg-col sg-col-maps">
                <span className={mapDiff > 0 ? 'sg-pos' : mapDiff < 0 ? 'sg-neg' : ''}>{mapDiff > 0 ? '+' : ''}{mapDiff}</span>
              </span>
              <span className="sg-col sg-col-rd">
                <span className={entry.roundDifferential > 0 ? 'sg-pos' : entry.roundDifferential < 0 ? 'sg-neg' : ''}>{entry.roundDifferential > 0 ? '+' : ''}{entry.roundDifferential}</span>
              </span>
              <span className={`sg-col sg-col-status ${statusClass}`}>{status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── match schedule using smc-card format ──

function MatchSchedule({ groupStage, teams, userTeamId, onSimMatchup, onWatchMatchup, onMatchClick, suspendedMatchupId, suspendedMatchInfo, onSimMatchday, onSimAllMatchdays }: {
  groupStage: GroupStage;
  teams: Team[];
  userTeamId: string | null;
  onSimMatchup?: (id: string) => void;
  onWatchMatchup?: (id: string) => void;
  onMatchClick?: (id: string) => void;
  suspendedMatchupId?: string | null;
  suspendedMatchInfo?: SuspendedMatchInfo | null;
  onSimMatchday?: (matchIds: string[]) => void;
  onSimAllMatchdays?: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const getTeam = (id: string) => teams.find(t => t.id === id);

  // compute W-L from the group schedule up to (but not including) a given matchday
  const getRecordBefore = (teamId: string, matchday: number) => {
    for (const group of groupStage.groups) {
      const isInGroup = group.teams.some(t => t.teamId === teamId);
      if (!isInGroup) continue;
      let w = 0, l = 0;
      for (const gm of group.schedule) {
        if (!gm.played || !gm.result || gm.matchday >= matchday) continue;
        if (gm.homeTeamId !== teamId && gm.awayTeamId !== teamId) continue;
        const isHome = gm.homeTeamId === teamId;
        const ts = isHome ? gm.result.homeScore : gm.result.awayScore;
        const os = isHome ? gm.result.awayScore : gm.result.homeScore;
        ts > os ? w++ : l++;
      }
      return { wins: w, losses: l };
    }
    return { wins: 0, losses: 0 };
  };

  const getStarPlayer = (team: Team) => {
    const starterIds = team.startingLineup?.length
      ? new Set(team.startingLineup.map(s => s.playerId))
      : new Set(team.roster.slice(0, 5).map(p => p.id));
    const starters = team.roster.filter(p => starterIds.has(p.id));
    return starters.length ? [...starters].sort((a, b) => b.overall - a.overall)[0] : null;
  };

  const allMatches = (() => {
    const out: Array<GroupMatch & { groupName: string }> = [];
    for (const group of groupStage.groups)
      for (const m of group.schedule) out.push({ ...m, groupName: group.name });
    return out.sort((a, b) => a.matchday - b.matchday || (a.dayOrder ?? 0) - (b.dayOrder ?? 0));
  })();

  const byDay = (() => {
    const map = new Map<number, Array<GroupMatch & { groupName: string }>>();
    for (const m of allMatches) {
      if (!map.has(m.matchday)) map.set(m.matchday, []);
      map.get(m.matchday)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  })();

  const firstUnplayedDay = byDay.find(([, ms]) => ms.some(m => !m.played))?.[0] ?? -1;
  const hasUnplayed = allMatches.some(m => !m.played);
  const toggleDay = (day: number) => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(day) ? next.delete(day) : next.add(day);
    return next;
  });

  const renderTeamRow = (team: Team | undefined, match: GroupMatch & { groupName: string }, side: 'home' | 'away') => {
    if (!team) return <div className="smc-team-row tbd"><span className="smc-name tbd">TBD</span></div>;

    const star = getStarPlayer(team);
    const ovr = getTeamOverall(team.roster);
    const isUser = team.id === userTeamId;
    const isSuspended = match.id === suspendedMatchupId;
    const hasResult = match.played && match.result && !isSuspended;
    const isWinner = hasResult && (
      (side === 'home' && match.result!.homeScore > match.result!.awayScore) ||
      (side === 'away' && match.result!.awayScore > match.result!.homeScore)
    );
    const isLoser = hasResult && !isWinner;
    const score = hasResult ? (side === 'home' ? match.result!.homeScore : match.result!.awayScore) : null;
    const canAct = !match.played && !isSuspended;

    // record before this match + delta from this match's result
    const rec = getRecordBefore(team.id, match.matchday);
    const recordStr = hasResult
      ? (isWinner ? `${rec.wins + 1}-${rec.losses}` : `${rec.wins}-${rec.losses + 1}`)
      : `${rec.wins}-${rec.losses}`;

    return (
      <div className={`smc-team-row ${isUser ? 'is-user' : ''} ${isWinner ? 'is-winner' : ''} ${isLoser ? 'is-loser' : ''}`}>
        <img src={team.logo} alt="" className="smc-logo" />
        <div className="smc-team-details">
          <span className={`smc-name ${isUser ? 'user' : ''}`}>{team.name}</span>
          <span className="smc-meta">
            {hasResult ? (
              <>
                {isWinner ? (
                  <><span className="smc-record-hl win">{rec.wins + 1}</span>-{rec.losses}</>
                ) : (
                  <>{rec.wins}-<span className="smc-record-hl loss">{rec.losses + 1}</span></>
                )}
              </>
            ) : recordStr}
            , {ovr} ovr
          </span>
        </div>
        <div className="smc-star">
          {star && (
            <>
              <img src={ROLE_ICONS[star.role] || ROLE_ICONS.flex} alt="" className="smc-star-role-icon" />
              <span className="smc-star-name">{star.name}</span>
              <span className="smc-star-ovr" style={{ color: getOvrColor(star.overall) }}>{star.overall}</span>
            </>
          )}
        </div>
        <div className="smc-action">
          {isSuspended && side === 'home' ? (
            <button className="smc-btn live" onClick={e => { e.stopPropagation(); onWatchMatchup?.(match.id); }}>Now<br />Live</button>
          ) : isSuspended && side === 'away' ? null
          : score !== null ? (
            <span className={`smc-score ${isWinner ? 'winner' : ''}`}>{score}</span>
          ) : canAct ? (
            side === 'home'
              ? <button className="smc-btn watch" onClick={e => { e.stopPropagation(); onWatchMatchup?.(match.id); }}>Watch<br />game</button>
              : <button className="smc-btn sim" onClick={e => { e.stopPropagation(); onSimMatchup?.(match.id); }}>Sim<br />game</button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="sg-schedule">
      <div className="sg-schedule-header">
        <span className="sg-schedule-title">Match Schedule</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasUnplayed && firstUnplayedDay > 0 && onSimMatchday && (
            <button className="sg-show-all-btn" onClick={() => {
              const ids = byDay.find(([d]) => d === firstUnplayedDay)?.[1]?.filter(m => !m.played).map(m => m.id) ?? [];
              if (ids.length) onSimMatchday(ids);
            }}>
              Sim Matchday {firstUnplayedDay}
            </button>
          )}
          {hasUnplayed && onSimAllMatchdays && (
            <button className="sg-show-all-btn" onClick={onSimAllMatchdays}>
              Sim All Matchdays
            </button>
          )}
        </div>
      </div>

      {byDay.map(([day, matches]) => {
        const dayDone = matches.every(m => m.played);
        const isCurrent = day === firstUnplayedDay;
        const isCollapsed = collapsed.has(day);

        return (
          <div key={day} className={`sg-matchday ${isCurrent ? 'sg-matchday-current' : ''}`}>
            <div
              className="sg-matchday-label"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => toggleDay(day)}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                <polyline points="3,5 8,11 13,5" />
              </svg>
              Matchday {day}
              {dayDone && <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700, opacity: 0.8 }}>✓</span>}
              {!dayDone && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{matches.filter(m => m.played).length}/{matches.length}</span>}
            </div>
            {!isCollapsed && (
            <div className="smc-grid sg-matchday-grid">
              {matches.map(m => {
              const home = getTeam(m.homeTeamId);
              const away = getTeam(m.awayTeamId);
              const isUser = m.homeTeamId === userTeamId || m.awayTeamId === userTeamId;
              const isSuspended = m.id === suspendedMatchupId;
              const hasResult = m.played && !isSuspended;
              const clickable = hasResult && m.result;

              return (
                <div
                  key={m.id}
                  className={`smc-card ${isUser ? 'user-match' : ''} ${hasResult ? 'played' : 'pending'} ${isSuspended ? 'live' : ''} ${clickable ? 'clickable' : ''}`}
                  onClick={clickable ? () => onMatchClick?.(m.id) : undefined}
                >
                  {renderTeamRow(home, m, 'home')}
                  <div className="smc-divider" />
                  {renderTeamRow(away, m, 'away')}
                  <div className="smc-card-footer">
                    <span className="smc-card-group-tag">{m.groupName}</span>
                    <span className="smc-format-badge">BO3</span>
                    {isSuspended && suspendedMatchInfo && (
                      <span className="smc-status-badge live-badge">● Map {suspendedMatchInfo.mapNumber}: {suspendedMatchInfo.mapName} · {suspendedMatchInfo.homeMapScore}-{suspendedMatchInfo.awayMapScore}</span>
                    )}
                    {isSuspended && !suspendedMatchInfo && <span className="smc-status-badge live-badge">● In Progress</span>}
                    {hasResult && <span className="smc-status-badge final">Final</span>}
                    {!m.played && !isSuspended && <span className="smc-status-badge pending">Upcoming</span>}
                  </div>
                </div>
              );
            })}
          </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
