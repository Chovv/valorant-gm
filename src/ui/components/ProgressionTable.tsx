// src/ui/components/ProgressionTable.tsx
import { useState, useMemo, Fragment } from 'react';
import type { Team, Role, Player } from '../../types';
import type { Region } from '../../types/team';
import { flagSrc } from './MassPlayerEditor';
import { PlayerAvatar } from './PlayerAvatar';
import './ProgressionTable.css';

interface ChurnEvent {
  type: 'release' | 'signing';
  teamId: string;
  teamName: string;
  teamRegion: string;
  playerId: string;
  playerName: string;
  role: Role;
  overall: number;
  playerAge?: number;
  source?: 'free_agent' | 'bench_promotion';
  reason?: string;
}

const ROLE_ICONS: Record<Role, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

const REGION_NAMES: Record<Region | 'all', string> = {
  all: 'All Regions',
  americas: 'Americas',
  emea: 'EMEA',
  pacific: 'Pacific',
  china: 'China',
};

const REGION_LOGOS: Record<Region, string> = {
  americas: '/logos/regions/Americas.png',
  emea: '/logos/regions/EMEA.png',
  pacific: '/logos/regions/Pacific.png',
  china: '/logos/regions/China.png',
};

interface ProgressionEntry {
  playerId: string;
  playerName: string;
  teamId: string;
  teamAbbr: string;
  age: number;
  role: string;
  oldOverall: number;
  newOverall: number;
  change: number;
  ratingChanges: Record<string, number>;
  stage?: 'prospect' | 'developing' | 'prime' | 'veteran' | 'declining';
  oldStage?: 'prospect' | 'developing' | 'prime' | 'veteran' | 'declining';
}

interface Props {
  progression: ProgressionEntry[];
  teams: Team[];
  freeAgents?: Player[];
  churnEvents?: ChurnEvent[];
  onRunChurn?: () => void;
  onViewPlayer?: (playerId: string) => void;
  onViewTeam?: (teamId: string) => void;
  userTeamId?: string | null;
}

const RATING_LABELS: Record<string, string> = {
  aim: 'AIM',
  sprayControl: 'SPRAY',
  gameSense: 'IQ',
  utilityUsage: 'UTIL',
  clutchFactor: 'CLUTCH',
  communication: 'COMMS',
};

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  developing: 'Developing',
  prime: 'Prime',
  veteran: 'Veteran',
  declining: 'Declining',
};

function getOvrTier(ovr: number): string {
  if (ovr >= 90) return '#ffd700';
  if (ovr >= 85) return '#ff6b35';
  if (ovr >= 80) return '#6bf';
  if (ovr >= 75) return '#5d5';
  return '#888';
}

function getTierThreshold(ovr: number): number {
  if (ovr >= 90) return 90;
  if (ovr >= 85) return 85;
  if (ovr >= 80) return 80;
  if (ovr >= 75) return 75;
  return 0;
}

function getTierLabel(ovr: number): string {
  if (ovr >= 90) return 'S';
  if (ovr >= 85) return 'A';
  if (ovr >= 80) return 'B';
  if (ovr >= 75) return 'C';
  return 'D';
}

type ExtraCol = 'age' | 'tier-jump';

// ── ChurnPanel ─────────────────────────────────────────────────────────────

interface Transfer {
  transferType: 'release' | 'incoming'; // release = player was cut, incoming = FA/bench signing
  playerId: string;
  playerName: string;
  role: Role;
  overall: number;
  playerAge?: number;
  playerNationality?: string;
  fromTeamId: string;
  fromTeamName: string;
  fromRegion: string;
  toTeamId?: string;
  toTeamName?: string;
  toRegion?: string;
  reason?: string;
  isCrossGroup: boolean;
  replacedBy?: { playerId: string; playerName: string; overall: number; age?: number; source?: 'free_agent' | 'bench_promotion' };
}

function playerFlavor(name: string, age: number | undefined, overall: number, source: 'free_agent' | 'bench_promotion' | undefined): string {
  const isPromo = source === 'bench_promotion';
  if (isPromo) return `promotes ${name} to the starting lineup`;
  // flavor based on age + overall
  if (age !== undefined) {
    if (age <= 20) return `signs young prospect ${name}`;
    if (age <= 23 && overall < 80) return `signs developing talent ${name}`;
    if (age >= 30 && overall >= 85) return `signs veteran ${name}`;
    if (age >= 30) return `signs aging veteran ${name}`;
    if (age >= 28) return `signs experienced ${name}`;
  }
  if (overall >= 88) return `signs star ${name}`;
  if (overall >= 83) return `signs proven ${name}`;
  return `signs ${name}`;
}

const WEST_REGIONS = new Set(['americas', 'emea']);
const EAST_REGIONS = new Set(['pacific', 'china']);

function isCrossGroupTransfer(from: string, to: string): boolean {
  return (WEST_REGIONS.has(from) && EAST_REGIONS.has(to)) ||
         (EAST_REGIONS.has(from) && WEST_REGIONS.has(to));
}

function getOvrColor(ovr: number): string {
  if (ovr >= 90) return '#ffd700';
  if (ovr >= 85) return '#ff6b35';
  if (ovr >= 80) return '#59c9ff';
  if (ovr >= 75) return '#5d5';
  return '#888';
}

function TeamChip({ teamId, teamName, teams, userTeamId, onViewTeam }: {
  teamId: string; teamName: string; teams: Team[];
  userTeamId?: string | null; onViewTeam?: (id: string) => void;
}) {
  const team = teams.find(t => t.id === teamId);
  const isUser = teamId === userTeamId;
  return (
    <span className={`tr-team-chip ${isUser ? 'tr-user' : ''}`} onClick={() => onViewTeam?.(teamId)}>
      {team?.logo && <img src={team.logo} alt="" className="tr-team-logo" />}
      {team?.abbreviation || teamName}
    </span>
  );
}

function ChurnPanel({ churnEvents, teams, freeAgents, userTeamId, progression, onViewPlayer, onViewTeam }: {
  churnEvents: ChurnEvent[]; teams: Team[]; freeAgents: Player[];
  userTeamId?: string | null;
  progression?: { playerId: string; change: number }[];
  onViewPlayer?: (id: string) => void; onViewTeam?: (id: string) => void;
}) {
  const progMap = useMemo(() => {
    const m = new Map<string, number>();
    progression?.forEach(p => m.set(p.playerId, p.change));
    return m;
  }, [progression]);

  const [churnRegion, setChurnRegion] = useState<string>('all');

  // helper: get region for a teamId — falls back to teams array for older saves without teamRegion
  const regionOf = (teamId: string, storedRegion?: string): string =>
    storedRegion || teams.find(t => t.id === teamId)?.region || '';

  // build transfer list: pair release+signing by playerId
  const transfers = useMemo<Transfer[]>(() => {
    const releases = churnEvents.filter(e => e.type === 'release');
    const signings = churnEvents.filter(e => e.type === 'signing');
    // build a quick id→nationality lookup from current roster + FA pool
    const nationalityMap = new Map<string, string>();
    teams.forEach(t => t.roster.forEach(p => { if (p.nationality) nationalityMap.set(p.id, p.nationality); }));
    freeAgents.forEach(p => { if (p.nationality) nationalityMap.set(p.id, p.nationality); });
    const releaseRows: Transfer[] = releases
      .map(r => {
        const s = signings.find(s => s.playerId === r.playerId);
        // skip: player re-signed by same team (bug in old saves, prevented in new runs)
        if (s && s.teamId === r.teamId) return null;
        const fromRegion = regionOf(r.teamId, r.teamRegion);
        const toRegion = s ? regionOf(s.teamId, s.teamRegion) : undefined;
        // find who replaced them: a signing to the same team, same role, different player
        const replacement = signings.find(sg =>
          sg.teamId === r.teamId &&
          sg.playerId !== r.playerId &&
          sg.role === r.role
        );
        return {
          transferType: 'release' as const,
          playerId: r.playerId,
          playerName: r.playerName,
          role: r.role,
          overall: r.overall,
          playerAge: r.playerAge,
          playerNationality: nationalityMap.get(r.playerId),
          fromTeamId: r.teamId,
          fromTeamName: r.teamName,
          fromRegion,
          toTeamId: s?.teamId,
          toTeamName: s?.teamName,
          toRegion,
          reason: r.reason,
          isCrossGroup: toRegion ? isCrossGroupTransfer(fromRegion, toRegion) : false,
          replacedBy: replacement ? { playerId: replacement.playerId, playerName: replacement.playerName, overall: replacement.overall, age: replacement.playerAge, source: replacement.source } : undefined,
        };
      })
      .filter((t): t is Transfer => t !== null);

    // incoming rows: signings for players who were NOT released this offseason
    const releasedIds = new Set(releases.map(r => r.playerId));
    const incomingRows: Transfer[] = signings
      .filter(s => !releasedIds.has(s.playerId))
      .map(s => {
        const toRegion = regionOf(s.teamId, s.teamRegion);
        const isBench = s.source === 'bench_promotion';
        return {
          transferType: 'incoming' as const,
          playerId: s.playerId,
          playerName: s.playerName,
          role: s.role,
          overall: s.overall,
          playerAge: s.playerAge,
          playerNationality: nationalityMap.get(s.playerId),
          fromTeamId: '',
          fromTeamName: isBench ? 'Bench' : 'Free Agent',
          fromRegion: '',
          toTeamId: s.teamId,
          toTeamName: s.teamName,
          toRegion: toRegion,
          isCrossGroup: false,
        };
      });

    const all = [...releaseRows, ...incomingRows];
    const seen = new Set<string>();
    const deduped = all.filter(t => {
      const key = `${t.transferType}-${t.playerId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduped.sort((a, b) => b.overall - a.overall);
  }, [churnEvents, teams]);

  const regions: string[] = ['americas', 'emea', 'pacific', 'china'];

  const filtered = churnRegion === 'all'
    ? transfers
    : transfers.filter(t => t.fromRegion === churnRegion || t.toRegion === churnRegion);

  const crossGroupCount = transfers.filter(t => t.isCrossGroup).length;

  const ROLE_FULL: Record<string, string> = {
    duelist: 'Duelist', controller: 'Controller', initiator: 'Initiator',
    sentinel: 'Sentinel', flex: 'Flex',
  };

  return (
    <div className="panel prog-churn-panel">
      <div className="panel-header tr-header">
        <span>🔄 Roster Moves</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {crossGroupCount > 0 && (
            <span className="tr-cross-badge">🌐 {crossGroupCount} cross-region</span>
          )}
          <span className="tr-count">{filtered.length} moves</span>
        </div>
      </div>
      <div className="tr-region-bar">
        {(['all', ...regions] as string[]).map(r => (
          <button key={r} className={`tr-region-btn ${churnRegion === r ? 'active' : ''}`}
            onClick={() => setChurnRegion(r)}>
            {r === 'all' ? 'All' : REGION_NAMES[r as Region]}
          </button>
        ))}
      </div>
      <div className="tr-list">
        {filtered.map(t => {
          const isUserFrom = t.fromTeamId === userTeamId;
          const isUserTo = t.toTeamId === userTeamId;
          const p = teams.flatMap(tm => tm.roster).find(p => p.id === t.playerId)
            ?? freeAgents.find(p => p.id === t.playerId);
          return (
            <div key={`${t.transferType}-${t.playerId}`} className={`tr-row ${isUserFrom || isUserTo ? 'tr-row-user' : ''} ${t.isCrossGroup ? 'tr-row-cross' : ''} ${t.transferType === 'incoming' ? 'tr-row-incoming' : ''}`}>
              <span className="tr-ovr" style={{ color: getOvrColor(t.overall) }}>{t.overall}</span>
              {(() => { const d = progMap.get(t.playerId); if (!d) return null; return <span className={`tr-ovr-delta ${d > 0 ? 'tr-delta-up' : 'tr-delta-down'}`}>[{d > 0 ? `+${d}` : d}]</span>; })()}
              {t.playerNationality && (
                <img src={flagSrc(t.playerNationality)} alt={t.playerNationality} className="tr-flag" />
              )}
              <span className="tr-player" onClick={() => p && onViewPlayer?.(p.id)}>
                {t.playerName}
              </span>
              <span className="tr-role">{t.playerAge != null ? `${t.playerAge}yo · ` : ''}{ROLE_FULL[t.role] ?? t.role}</span>

              {t.transferType === 'release' ? (
                // release row: OldTeam → NewTeam/FA
                <>
                  <TeamChip teamId={t.fromTeamId} teamName={t.fromTeamName} teams={teams}
                    userTeamId={userTeamId} onViewTeam={onViewTeam} />
                  <span className={`tr-arrow ${t.isCrossGroup ? 'tr-arrow-cross' : ''}`}>→</span>
                  {t.toTeamId ? (
                    <TeamChip teamId={t.toTeamId} teamName={t.toTeamName!} teams={teams}
                      userTeamId={userTeamId} onViewTeam={onViewTeam} />
                  ) : (
                    <span className="tr-fa">Free Agent</span>
                  )}
                  {t.toRegion && REGION_LOGOS[t.toRegion as Region] && (
                    <img src={REGION_LOGOS[t.toRegion as Region]} alt={t.toRegion} className="tr-region-icon" />
                  )}
                  {t.replacedBy && (
                    <span className="tr-replaced-by">
                      {teams.find(tm => tm.id === t.fromTeamId)?.abbreviation ?? t.fromTeamName} {playerFlavor(t.replacedBy.playerName, t.replacedBy.age, t.replacedBy.overall, t.replacedBy.source)}
                      <span className="tr-replaced-ovr" style={{ color: getOvrColor(t.replacedBy.overall) }}>{t.replacedBy.overall}</span>
                    </span>
                  )}
                </>
              ) : (
                // incoming row: FA/Bench → Team
                <>
                  <span className="tr-fa">Free Agent</span>
                  <span className="tr-arrow">→</span>
                  {t.toTeamId ? (
                    <TeamChip teamId={t.toTeamId} teamName={t.toTeamName!} teams={teams}
                      userTeamId={userTeamId} onViewTeam={onViewTeam} />
                  ) : (
                    <span className="tr-fa tr-bench-label">Starting</span>
                  )}
                  {t.toRegion && REGION_LOGOS[t.toRegion as Region] && (
                    <img src={REGION_LOGOS[t.toRegion as Region]} alt={t.toRegion} className="tr-region-icon" />
                  )}
                </>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="tr-empty">No moves in this region.</div>}
      </div>
    </div>
  );
}

// ── ProgressionTable ────────────────────────────────────────────────────────

export function ProgressionTable({ progression, teams, freeAgents = [], churnEvents = [], onRunChurn, onViewPlayer, onViewTeam, userTeamId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region | 'all' | 'FA'>('all');
  const [includeFAs, setIncludeFAs] = useState(() => {
    try { return localStorage.getItem('valogm_prog_includeFAs') === 'true'; } catch { return false; }
  });

  const toggleIncludeFAs = () => {
    const next = !includeFAs;
    setIncludeFAs(next);
    try { localStorage.setItem('valogm_prog_includeFAs', String(next)); } catch {}
  };

  const regions: Region[] = ['americas', 'emea', 'pacific', 'china'];
  const faCount = progression.filter(p => p.teamId === 'FA').length;

  const getTeam = (teamId: string) => teams.find(t => t.id === teamId);
  const getPlayer = (playerId: string, teamId: string) => {
    if (teamId === 'FA') return freeAgents.find(p => p.id === playerId);
    const team = getTeam(teamId);
    return team?.roster.find(p => p.id === playerId);
  };
  const getRegion = (teamId: string): Region | undefined => getTeam(teamId)?.region;

  // filter by region + FA toggle
  const filtered = selectedRegion === 'FA'
    ? progression.filter(p => p.teamId === 'FA')
    : selectedRegion === 'all'
      ? (includeFAs ? progression : progression.filter(p => p.teamId !== 'FA'))
      : progression.filter(p => getRegion(p.teamId) === selectedRegion);

  const improved = [...filtered].filter(p => p.change > 0).sort((a, b) => b.change - a.change);
  const regressed = [...filtered].filter(p => p.change < 0).sort((a, b) => a.change - b.change);
  const unchanged = filtered.filter(p => p.change === 0).length;

  // narrative lists
  const risingRookies = filtered
    .filter(p => (p.stage === 'prospect' || p.stage === 'developing') && p.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);

  const fadingStars = filtered
    .filter(p => p.oldOverall >= 85 && p.change <= -3)
    .sort((a, b) => a.change - b.change)
    .slice(0, 5);

  const breakoutSeason = filtered
    .filter(p => getTierThreshold(p.newOverall) > getTierThreshold(p.oldOverall) && p.change > 0)
    .sort((a, b) => b.newOverall - a.newOverall || b.change - a.change)
    .slice(0, 5);

  const veteranResurgence = filtered
    .filter(p => (p.stage === 'veteran' || p.stage === 'declining' || p.oldStage === 'veteran' || p.oldStage === 'declining') && p.change >= 2)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);

  const enteringPrime = filtered
    .filter(p => p.stage === 'prime' && p.oldStage && p.oldStage !== 'prime' && p.change >= 2)
    .sort((a, b) => b.newOverall - a.newOverall)
    .slice(0, 5);

  const renderRow = (p: ProgressionEntry, i: number, mode: 'full' | 'compact', extraCol?: ExtraCol) => {
    const team = getTeam(p.teamId);
    const player = getPlayer(p.playerId, p.teamId);
    const isUser = p.teamId === userTeamId;
    const isExpanded = expandedId === p.playerId;
    const region = getRegion(p.teamId);
    const isIGL = team ? team.iglId === p.playerId : player?.isIGL;

    // colSpan for detail row: rank + player + stage + age + ovr + delta
    let colSpan = mode === 'full' ? 6 : 5;

    return (
      <Fragment key={p.playerId}>
        <tr
          className={`prog-row ${isUser ? 'user-row' : ''} ${isExpanded ? 'expanded' : ''}`}
          onClick={() => setExpandedId(isExpanded ? null : p.playerId)}
        >
          <td className="col-rank">
            <span className="rank-number">{i + 1}</span>
            {region && selectedRegion === 'all' && (
              <img
                src={REGION_LOGOS[region]}
                alt=""
                className={`row-region-watermark ${isUser ? 'user-row-watermark' : ''}`}
              />
            )}
          </td>
          <td className="col-player">
            <div className="prog-player-cell">
              <PlayerAvatar
                playerId={p.playerId}
                playerName={p.playerName}
                imageUrl={player?.imageUrl}
                nationality={player?.nationality}
                size="md"
              />
              <div className="prog-player-info">
                <div className="prog-player-name-row">
                  <span
                    className={`prog-player-link ${isUser ? 'user-team' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onViewPlayer?.(p.playerId); }}
                  >
                    {p.playerName}
                  </span>
                </div>
                {p.teamId === 'FA' ? (
                  <span className="prog-player-fa">FA</span>
                ) : team && (
                  <span
                    className="prog-player-team"
                    onClick={(e) => { e.stopPropagation(); onViewTeam?.(p.teamId); }}
                  >
                    <img src={team.logo} alt="" className="prog-team-logo-inline" />
                    {team.abbreviation}
                  </span>
                )}
              </div>
              <div className="prog-role-stack">
                {isIGL && <span className="prog-igl-badge">IGL</span>}
                <img
                  src={ROLE_ICONS[p.role as Role] || ROLE_ICONS.flex}
                  alt={p.role}
                  className="prog-role-icon"
                  title={p.role.charAt(0).toUpperCase() + p.role.slice(1)}
                />
              </div>
            </div>
          </td>
          {mode === 'full' && (
            <td className="col-stage">
              {p.oldStage && p.oldStage !== (p.stage || 'prime') ? (
                <span className="stage-transition">
                  <span className={`stage-badge stage-${p.oldStage}`}>
                    {STAGE_LABELS[p.oldStage]}
                  </span>
                  <span className="stage-arrow">→</span>
                  <span className={`stage-badge stage-${p.stage || 'prime'}`}>
                    {STAGE_LABELS[p.stage || 'prime']}
                  </span>
                </span>
              ) : (
                <span className={`stage-badge stage-${p.stage || 'prime'}`}>
                  {STAGE_LABELS[p.stage || 'prime']}
                </span>
              )}
            </td>
          )}
          {mode === 'full' && (
            <td className="col-age">{p.age}</td>
          )}
          {mode === 'compact' && extraCol === 'age' && (
            <td className="col-age">{p.age}</td>
          )}
          {mode === 'compact' && extraCol === 'tier-jump' && (
            <td className="col-tier-jump">
              <span className="tier-jump">
                <span className="tier-letter" style={{ color: getOvrTier(p.oldOverall) }}>{getTierLabel(p.oldOverall)}</span>
                <span className="tier-arrow">→</span>
                <span className="tier-letter" style={{ color: getOvrTier(p.newOverall) }}>{getTierLabel(p.newOverall)}</span>
              </span>
            </td>
          )}
          <td className="col-ovr col-new">
            <span className="ovr-badge" style={{ background: getOvrTier(p.newOverall) }}>
              {p.newOverall}
            </span>
          </td>
          <td className="col-delta">
            <span className={`prog-delta ${p.change > 0 ? 'prog-up' : p.change < 0 ? 'prog-down' : ''}`}>
              {p.change > 0 ? '+' : ''}{p.change}
            </span>
          </td>
        </tr>
        {isExpanded && (
          <tr className="prog-detail-row">
            <td colSpan={colSpan}>
              <div className="prog-detail-chips">
                {Object.entries(p.ratingChanges).map(([key, val]) => (
                  <span key={key} className={`prog-chip ${val > 0 ? 'chip-up' : val < 0 ? 'chip-down' : 'chip-neutral'}`}>
                    {RATING_LABELS[key] || key}
                    <span className="chip-val">{val > 0 ? '+' : ''}{val}</span>
                  </span>
                ))}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const renderTable = (list: ProgressionEntry[], mode: 'full' | 'compact', extraCol?: ExtraCol) => (
    <table className={`prog-table ${mode === 'compact' ? 'prog-table-compact' : ''}`}>
      <thead>
        <tr>
          <th className="col-rank">#</th>
          <th className="col-player">Player</th>
          {mode === 'full' && <th className="col-stage">Stage</th>}
          {mode === 'full' && <th className="col-age">Age</th>}
          {mode === 'compact' && extraCol === 'age' && <th className="col-age">Age</th>}
          {mode === 'compact' && extraCol === 'tier-jump' && <th className="col-tier-jump">Tier</th>}
          <th className="col-ovr">OVR</th>
          <th className="col-delta">Δ</th>
        </tr>
      </thead>
      <tbody>
        {list.map((p, i) => renderRow(p, i, mode, extraCol))}
      </tbody>
    </table>
  );

  const renderNarrativePanel = (
    icon: string,
    title: string,
    subtitle: string,
    list: ProgressionEntry[],
    extraCol?: ExtraCol,
  ) => (
    <div className="panel prog-narrative-panel">
      <div className="panel-header prog-narrative-header">
        <span className="narrative-icon">{icon}</span>
        <div className="narrative-title-group">
          <span className="narrative-title">{title}</span>
          <span className="narrative-subtitle">{subtitle}</span>
        </div>
        <span className="narrative-count">{list.length}</span>
      </div>
      <div className="panel-body prog-panel-body">
        {list.length > 0 ? renderTable(list, 'compact', extraCol) : (
          <div className="prog-empty">None this offseason.</div>
        )}
      </div>
    </div>
  );

  const allSorted = [...filtered].sort((a, b) => b.change - a.change);

  return (
    <div className="progression-page">
      <div className="prog-title-row">
        <h1>Offseason News</h1>
        <span className="prog-count">{filtered.length} players</span>
      </div>

      {/* roster moves from AI churn */}
      {churnEvents.length > 0 ? (
        <ChurnPanel
          churnEvents={churnEvents}
          teams={teams}
          freeAgents={freeAgents}
          userTeamId={userTeamId}
          progression={progression}
          onViewPlayer={onViewPlayer}
          onViewTeam={onViewTeam}
        />
      ) : onRunChurn ? (
        <div className="panel prog-churn-panel">
          <div className="panel-header">🔄 Roster Moves</div>
          <div className="panel-body" style={{ padding: '16px', textAlign: 'center' }}>
            <button className="btn btn-primary" onClick={onRunChurn}>Generate Roster Moves</button>
          </div>
        </div>
      ) : null}

      <div className="prog-controls-row">
        <div className="prog-summary-strip">
          <div className="prog-stat-pill">
            <span className="pill-val prog-up">{improved.length}</span>
            <span className="pill-label">improved</span>
          </div>
          <div className="prog-stat-pill">
            <span className="pill-val prog-down">{regressed.length}</span>
            <span className="pill-label">regressed</span>
          </div>
          <div className="prog-stat-pill">
            <span className="pill-val">{unchanged}</span>
            <span className="pill-label">unchanged</span>
          </div>
        </div>

        <div className="prog-region-tabs">
          <button
            className={`prog-region-tab ${selectedRegion === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedRegion('all')}
          >
            All
          </button>
          {regions.map(r => (
            <button
              key={r}
              className={`prog-region-tab ${selectedRegion === r ? 'active' : ''}`}
              onClick={() => setSelectedRegion(r)}
            >
              {REGION_NAMES[r]}
            </button>
          ))}
          {faCount > 0 && (
            <button
              className={`prog-region-tab prog-fa-tab ${selectedRegion === 'FA' ? 'active' : ''}`}
              onClick={() => setSelectedRegion('FA')}
            >
              Free Agents
              <span className="prog-fa-count">{faCount}</span>
            </button>
          )}
          {selectedRegion === 'all' && faCount > 0 && (
            <button
              className={`prog-fa-toggle ${includeFAs ? 'active' : ''}`}
              onClick={toggleIncludeFAs}
              title={includeFAs ? 'Exclude free agents from All' : 'Include free agents in All'}
            >
              {includeFAs ? '− FAs' : '+ FAs'}
            </button>
          )}
        </div>
      </div>

      <div className="prog-dual-grid">
        <div className="panel prog-panel">
          <div className="panel-header prog-panel-header">
            <span className="prog-panel-icon prog-up">▲</span> Most Improved
          </div>
          <div className="panel-body prog-panel-body">
            {improved.length > 0 ? renderTable(improved.slice(0, 10), 'full') : (
              <div className="prog-empty">No players improved.</div>
            )}
          </div>
        </div>
        <div className="panel prog-panel">
          <div className="panel-header prog-panel-header">
            <span className="prog-panel-icon prog-down">▼</span> Most Regressed
          </div>
          <div className="panel-body prog-panel-body">
            {regressed.length > 0 ? renderTable(regressed.slice(0, 10), 'full') : (
              <div className="prog-empty">No players regressed.</div>
            )}
          </div>
        </div>
      </div>

      <div className="prog-narrative-section">
        <h2 className="prog-section-title">Offseason Stories</h2>
        <div className="prog-narrative-grid">
          {renderNarrativePanel('🚀', 'Ones to Watch', 'Young talent on the rise', risingRookies, 'age')}
          {renderNarrativePanel('💥', 'Noticeably Improved', 'Jumped to a new tier', breakoutSeason, 'tier-jump')}
          {renderNarrativePanel('⭐', 'Entering Their Prime', 'Peak years ahead', enteringPrime, 'age')}
          {renderNarrativePanel('🔥', 'Second Wind', 'Veterans defying the odds', veteranResurgence, 'age')}
          {renderNarrativePanel('📉', 'On the Decline', 'Stars trending downward', fadingStars, 'age')}
        </div>
      </div>

      <div className="panel prog-all-panel">
        <div
          className="panel-header prog-panel-header prog-all-header"
          onClick={() => setShowAll(!showAll)}
        >
          <span>All Players ({filtered.length})</span>
          <span className="prog-chevron">{showAll ? '▲' : '▼'}</span>
        </div>
        {showAll && (
          <div className="panel-body prog-panel-body">
            {renderTable(allSorted, 'full')}
          </div>
        )}
      </div>
    </div>
  );
}
