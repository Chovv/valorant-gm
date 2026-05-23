// src/ui/components/LiveSimView.tsx
import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import type { Team, MatchResult, RoundLog, KillEvent, BuyState, ShieldType, PlayerMapStats } from '../../types';
import { getUlt } from '../../data/agentAbilities';
import type { AgentAbility } from '../../data/agentAbilities';
import { RoundTimeline } from './RoundTimeline';
import { InlineFlag } from './PlayerAvatar';
import './LiveSimView.css';

export interface LiveSimSession {
  currentMap: number;
  maxRevealed: number;
  viewingRound: number;
  killsShown: number;
  pausedKills: number; // saved position for latest in-progress round
  matchFinished: boolean;
}

interface LiveSimViewProps {
  match: MatchResult;
  homeTeam: Team;
  awayTeam: Team;
  onBack: () => void;
  onViewFullMatch: (matchId: string) => void;
  initialSession?: LiveSimSession;
  onSuspend?: (session: LiveSimSession) => void;
  onSessionUpdate?: (session: LiveSimSession) => void;
  abilityIcons?: Record<string, string>; // abilityId → icon path
  agentAbilities?: Record<string, AgentAbility[]>;
  seedLabel?: { home?: string; away?: string }; // e.g. { home: 'ALPHA#1', away: 'OMEGA#2' }
  legacyAgentIcons?: string[];
}

const LEGACY_MAP: Record<string, string> = { gekko: 'gekko_old.webp', harbor: 'harbor_old.webp', fade: 'fade_old.webp' };

function getAgentIconUrl(agent: string, legacy?: string[]): string {
  if (legacy?.includes(agent) && LEGACY_MAP[agent]) return `/logos/agents/${LEGACY_MAP[agent]}`;
  return `/logos/agents/${agent.toLowerCase()}.png`;
}

// pie chart ult indicator
function UltOrb({ current, cost, flash }: { current: number; cost: number; flash?: boolean }) {
  const sz = 28;
  const cx = sz / 2;
  const cy = sz / 2;
  const r = 11;
  const circ = 2 * Math.PI * r;
  const frac = Math.min(current / cost, 1);
  const filled = circ * frac;
  const isFull = current >= cost;
  return (
    <svg className={`ls-bc-ult-svg ${isFull ? 'full' : ''} ${flash ? 'flash' : ''}`} width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
      {/* bg ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--text-dark)" strokeWidth="2" />
      {/* progress arc */}
      {frac > 0 && (
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={isFull ? '#ffd700' : 'var(--text)'}
          strokeWidth="2"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
      )}
      {/* fill circle when full */}
      {isFull && <circle cx={cx} cy={cy} r={r - 1} fill="rgba(255, 215, 0, 0.15)" />}
      {/* center: orb count or star */}
      {isFull ? (
        <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="#ffd700">★</text>
      ) : (
        <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fontFamily="Rajdhani, sans-serif" fill="var(--text)">{current}</text>
      )}
    </svg>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const WIN_LABELS: Record<string, string> = {
  elimination: 'Elimination',
  spike_detonation: 'Spike detonated',
  spike_defused: 'Spike defused',
  time_expired: 'Time expired',
};

const WIN_ICONS_SRC: Record<string, string> = {
  elimination: '/logos/timeline/elim.png',
  spike_detonation: '/logos/timeline/boom.png',
  spike_defused: '/logos/timeline/defuse.png',
  time_expired: '/logos/timeline/time.png',
};

const BUY_LABELS: Record<BuyState, string> = {
  pistol: 'Pistol',
  save: 'Save',
  eco: 'Eco',
  force: 'Force Buy',
  half: 'Half Buy',
  full: 'Full Buy',
};

const SPEEDS = [0.5, 1, 2, 4];

// helpers for splitting utility ults into pre-round vs mid-round
type UtilUlt = NonNullable<RoundLog['utilityUlts']>[number];
const isPreRound = (uu: UtilUlt) => (uu.afterKillIndex ?? -1) < 0;
const preRoundUlts = (rd: RoundLog | undefined) => rd?.utilityUlts?.filter(isPreRound) ?? [];
const preRoundUltCount = (rd: RoundLog | undefined) => preRoundUlts(rd).length;

// build interleaved feed of kills + mid-round ults, ordered by afterKillIndex
type FeedItem = { type: 'kill'; kill: KillEvent; ki: number } | { type: 'ult'; ult: UtilUlt };
function buildKillFeed(rd: RoundLog, kCount: number): FeedItem[] {
  const midUlts = rd.utilityUlts?.filter(uu => !isPreRound(uu)) ?? [];
  const items: FeedItem[] = [];
  for (let ki = 0; ki < kCount; ki++) {
    for (const uu of midUlts) if (uu.afterKillIndex === ki) items.push({ type: 'ult', ult: uu });
    items.push({ type: 'kill', kill: rd.kills[ki], ki });
  }
  // trailing ults that fire at or after kCount (visible once enough kills shown)
  for (const uu of midUlts) if ((uu.afterKillIndex ?? 0) >= kCount && (uu.afterKillIndex ?? 0) <= rd.kills.length) {
    // only show if all kills are revealed (round fully shown)
    if (kCount >= rd.kills.length) items.push({ type: 'ult', ult: uu });
  }
  return items;
}

function WeaponIcon({ weapon }: { weapon: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = `/logos/gun_icons/${weapon.toLowerCase().replace(/ /g, '_')}_icon.png`;

  if (imgFailed) {
    return <span className="ls-kill-weapon-text" title={weapon}>{weapon}</span>;
  }

  return (
    <img
      src={src}
      alt=""
      className="ls-kill-weapon-icon"
      title={weapon}
      onError={() => setImgFailed(true)}
    />
  );
}

function getRoundFlavor(
  round: RoundLog,
  prevRound: RoundLog | null,
  homeTeamId: string,
  homeAbbr: string,
  awayAbbr: string,
): string[] {
  const lines: string[] = [];
  const homeWon = round.winnerTeamId === homeTeamId;
  const winnerAbbr = homeWon ? homeAbbr : awayAbbr;
  const loserAbbr = homeWon ? awayAbbr : homeAbbr;
  const winnerBuy = homeWon ? round.homeBuyState : round.awayBuyState;
  const loserBuy = homeWon ? round.awayBuyState : round.homeBuyState;

  if (prevRound) {
    const prevWinner = prevRound.winnerTeamId;
    if (round.winnerTeamId === prevWinner) {
      const streak = round.roundNumber - 1;
      if (streak >= 3) lines.push(`${winnerAbbr} keeps the momentum going`);
    } else {
      lines.push(`${winnerAbbr} breaks the streak`);
    }
  }

  if (winnerBuy === 'eco' || winnerBuy === 'half' || winnerBuy === 'save' || winnerBuy === 'force') {
    if (loserBuy === 'full') {
      const label = winnerBuy === 'force' ? 'force buy' : winnerBuy === 'half' ? 'half buy' : 'eco';
      lines.push(`${winnerAbbr} pulls off the ${label} upset!`);
    }
  }

  const winnerAlive = homeWon ? round.homeAlive : round.awayAlive;
  if (winnerAlive === 5 && round.kills.length > 0) {
    lines.push(`Flawless round for ${winnerAbbr}`);
  }

  if (round.clutch) {
    const { playerName, opponents } = round.clutch;
    if (opponents >= 4) lines.push(`${playerName} with the UNBELIEVABLE 1v${opponents} clutch!`);
    else if (opponents === 3) lines.push(`INCREDIBLE 1v3 clutch from ${playerName}!`);
    else if (opponents === 2) lines.push(`${playerName} wins the 1v2 clutch`);
    else lines.push(`${playerName} wins the 1v1`);
  }

  return lines.slice(0, 2);
}

// derive alive/dead from kills shown so far
function getAliveState(
  round: RoundLog | null,
  killsVisible: number,
  homePlayerStats: PlayerMapStats[],
  awayPlayerStats: PlayerMapStats[],
): { home: Map<string, boolean>; away: Map<string, boolean> } {
  const home = new Map<string, boolean>();
  const away = new Map<string, boolean>();

  for (const p of homePlayerStats) home.set(p.playerId, true);
  for (const p of awayPlayerStats) away.set(p.playerId, true);

  if (!round) return { home, away };

  const set = (id: string, alive: boolean) => {
    if (home.has(id)) home.set(id, alive);
    if (away.has(id)) away.set(id, alive);
  };

  // index res events by afterKillIndex for interleaved processing
  const resAt = new Map<number, string[]>();
  for (const uu of round.utilityUlts ?? []) {
    if (!uu.targetPlayerId) continue;
    const aki = uu.afterKillIndex ?? -1;
    if (aki < 0 || aki > killsVisible) continue; // pre-round or not yet visible
    const arr = resAt.get(aki) ?? [];
    arr.push(uu.targetPlayerId);
    resAt.set(aki, arr);
  }

  // res at position 0 (before any kills — unlikely but safe)
  for (const tid of resAt.get(0) ?? []) set(tid, true);

  for (let ki = 0; ki < killsVisible; ki++) {
    set(round.kills[ki].victimPlayerId, false);
    // res events that fire after this kill (afterKillIndex === ki+1)
    for (const tid of resAt.get(ki + 1) ?? []) set(tid, true);
  }

  return { home, away };
}

// running K/D/A from revealed rounds
function getRunningStats(
  roundLogs: RoundLog[],
  killsShown: number,
  viewingRound: number,
  playerIds: string[],
): Map<string, { kills: number; deaths: number; assists: number }> {
  const stats = new Map<string, { kills: number; deaths: number; assists: number }>();
  for (const id of playerIds) stats.set(id, { kills: 0, deaths: 0, assists: 0 });

  for (let i = 0; i < viewingRound && i < roundLogs.length; i++) {
    const round = roundLogs[i];
    // for the current viewing round, only count up to killsShown
    const killLimit = (i === viewingRound - 1) ? killsShown : round.kills.length;
    const kills = round.kills.slice(0, killLimit);
    for (const kill of kills) {
      const ks = stats.get(kill.killerPlayerId);
      if (ks) ks.kills++;
      const vs = stats.get(kill.victimPlayerId);
      if (vs) vs.deaths++;
    }
    // accumulate assists from round log (full round once any kills revealed)
    if (killLimit > 0 && round.playerAssists) {
      for (const [pid, count] of Object.entries(round.playerAssists)) {
        const s = stats.get(pid);
        if (s) s.assists += count;
      }
    }
  }

  return stats;
}

interface ScoreboardEntry {
  playerId: string;
  name: string;
  agent: string;
  isAlive: boolean;
  kills: number;
  deaths: number;
  assists: number;
  weapon: string;
  shield: ShieldType;
  ultCurrent: number;
  ultCost: number;
}

// derive ult orb count from round logs
function getUltCharge(
  roundLogs: RoundLog[],
  killsShown: number,
  viewingRound: number,
  playerIds: string[],
  agents: Map<string, string>,
  agentAbilities?: Record<string, AgentAbility[]>,
): Map<string, { current: number; cost: number }> {
  const charge = new Map<string, number>();
  for (const id of playerIds) charge.set(id, 0);

  // utility ult costs for agents whose ults aren't in the ability system
  const UTIL_ULT_COST: Record<string, number> = {
    sage: 8, killjoy: 7, viper: 8, astra: 7, breach: 7, harbor: 7,
    cypher: 6, fade: 7, deadlock: 7, vyse: 8, gekko: 7, skye: 6,
    omen: 7, clove: 7,
  };

  // build cost lookup — prefer user config, then static data, then utility map, then 7
  const costMap = new Map<string, number>();
  for (const id of playerIds) {
    const agent = agents.get(id) || '';
    const key = agent.toLowerCase();
    const userUlt = agentAbilities?.[key]?.find(a => a.type === 'ultimate');
    const staticUlt = getUlt(agent);
    const cost = userUlt?.ultCost ?? staticUlt?.ultCost ?? UTIL_ULT_COST[key] ?? 7;
    costMap.set(id, cost);
  }

  for (let i = 0; i < viewingRound && i < roundLogs.length; i++) {
    const log = roundLogs[i];
    const isCurrentRound = i === viewingRound - 1;

    // halftime: reset all charges
    if (log.isHalfTime) {
      for (const id of playerIds) charge.set(id, 0);
    }

    // overtime reset: every OT pair start, set to ultCost - 3
    if (log.isOvertime && (log.roundNumber - 25) % 2 === 0) {
      for (const id of playerIds) charge.set(id, Math.max(0, (costMap.get(id) ?? 7) - 3));
    }

    const killLimit = isCurrentRound ? killsShown : log.kills.length;
    const kills = log.kills.slice(0, killLimit);

    // utility ult consumption: reset charge for players who used non-kill ults
    // pre-round ults consume immediately; mid-round ults wait until enough kills revealed
    if (log.utilityUlts) {
      for (const uu of log.utilityUlts) {
        const isMid = !isPreRound(uu);
        if (isMid && isCurrentRound && killLimit < (uu.afterKillIndex ?? 0)) continue;
        if (charge.has(uu.playerId)) charge.set(uu.playerId, 0);
      }
    }

    for (const kill of kills) {
      // ult activation: reset to 0 first
      if ((kill as any).isUltActivation && charge.has(kill.killerPlayerId)) {
        charge.set(kill.killerPlayerId, 0);
      }
      // +1 for kill
      if (charge.has(kill.killerPlayerId)) {
        charge.set(kill.killerPlayerId, (charge.get(kill.killerPlayerId) ?? 0) + 1);
      }
    }

    // orb pickup: +1 post-round for completed rounds only (not the round we're viewing)
    if (!isCurrentRound) {
      for (const id of playerIds) charge.set(id, (charge.get(id) ?? 0) + 1);
    }
  }

  const result = new Map<string, { current: number; cost: number }>();
  for (const id of playerIds) {
    const cost = costMap.get(id) ?? 7;
    result.set(id, { current: Math.min(charge.get(id) ?? 0, cost), cost });
  }
  return result;
}

// team-coordinated shield buy — one team roll sets the floor, per-player variance upgrades
const TEAM_SHIELD_FLOOR: Record<BuyState, [ShieldType, number][]> = {
  pistol: [['none', 1.00]],
  save:   [['light', 1.00]],
  eco:    [['light', 1.00]],
  force:  [['light', 1.00]],
  half:   [['heavy', 1.00]],
  full:   [['heavy', 1.00]],
};
const PLAYER_SHIELD_UPGRADE: Record<BuyState, [number, ShieldType][]> = {
  pistol: [],
  save:   [],
  eco:    [[0.25, 'regen']],
  force:  [[0.30, 'regen'], [0.05, 'heavy']],
  half:   [],
  full:   [],
};

function assignShields(buyState: BuyState, playerIds: string[], roundNum: number): Map<string, ShieldType> {
  const result = new Map<string, ShieldType>();
  // deterministic seed per round+roster
  let seed = roundNum * 37;
  for (const ch of (playerIds[0] || '')) seed += ch.charCodeAt(0);

  // team floor roll
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  const floorRoll = (seed & 0xffff) / 0x10000;
  const floors = TEAM_SHIELD_FLOOR[buyState];
  let floor: ShieldType = floors[floors.length - 1][0];
  for (const [type, cumProb] of floors) {
    if (floorRoll < cumProb) { floor = type; break; }
  }

  // per-player upgrade from floor
  const upgrades = PLAYER_SHIELD_UPGRADE[buyState];
  for (const id of playerIds) {
    if (!upgrades.length) { result.set(id, floor); continue; }
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const roll = (seed & 0xffff) / 0x10000;
    let picked = floor;
    let cum = 0;
    for (const [chance, type] of upgrades) {
      cum += chance;
      if (roll < cum) { picked = type; break; }
    }
    result.set(id, picked);
  }
  return result;
}

// weapon pool per buy state (fallback for old saves without playerWeapons)
const LOADOUTS: Record<BuyState, string[]> = {
  pistol: ['classic', 'classic', 'frenzy', 'ghost', 'sheriff'],
  save: ['classic', 'classic', 'frenzy', 'ghost', 'sheriff'],
  eco: ['sheriff', 'sheriff', 'marshal', 'stinger', 'ghost'],
  force: ['spectre', 'spectre', 'marshal', 'stinger', 'spectre'],
  half: ['spectre', 'spectre', 'spectre', 'spectre', 'vandal'],
  full: ['vandal', 'vandal', 'phantom', 'phantom', 'operator'],
};

function assignWeapons(buyState: BuyState, playerIds: string[], roundNum: number): Map<string, string> {
  const pool = [...LOADOUTS[buyState]];
  let seed = roundNum * 31;
  for (const ch of (playerIds[0] || '')) seed += ch.charCodeAt(0);
  for (let i = pool.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const result = new Map<string, string>();
  playerIds.forEach((id, i) => result.set(id, pool[i % pool.length]));
  return result;
}

export function LiveSimView({ match, homeTeam, awayTeam, onBack, onViewFullMatch, initialSession, onSuspend, onSessionUpdate, abilityIcons, agentAbilities, seedLabel, legacyAgentIcons }: LiveSimViewProps) {
  const agentIcon = (agent: string) => getAgentIconUrl(agent, legacyAgentIcons);
  const [currentMap, setCurrentMap] = useState(initialSession?.currentMap ?? 0);
  const [maxRevealed, setMaxRevealed] = useState(initialSession?.maxRevealed ?? 0);
  const [viewingRound, setViewingRound] = useState(initialSession?.viewingRound ?? 0);
  const [killsShown, setKillsShown] = useState(initialSession?.killsShown ?? 0);
  // when >= 0, the kill at this index shows its ult banner but hides the kill row (pending next Enter)
  const [bannerOnlyIdx, setBannerOnlyIdx] = useState(-1);
  const bannerOnlyRef = useRef(-1);
  const setBannerOnly = (v: number) => { bannerOnlyRef.current = v; setBannerOnlyIdx(v); };
  // how many utility ults (pre-round) have been revealed for the current round
  const [utilUltsShown, setUtilUltsShown] = useState(0);
  const utilUltsRef = useRef(0);
  const setUtilUlts = (v: number) => { utilUltsRef.current = v; setUtilUltsShown(v); };
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [isInstant, setIsInstant] = useState(false);
  const [matchFinished, setMatchFinished] = useState(initialSession?.matchFinished ?? false);
  const feedRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedKillsRef = useRef<number>(initialSession?.pausedKills ?? -1); // saves killsShown for in-progress round when navigating away
  // +1 badge tracking: set of active bump keys like "player123-k"
  const [activeBumps, setActiveBumps] = useState<Set<string>>(new Set());
  const prevStatsRef = useRef<Map<string, { kills: number; deaths: number; assists: number }>>(new Map());

  const mapData = match.mapScores[currentMap];
  const roundLogs: RoundLog[] = mapData?.roundLogs || [];
  const totalRounds = roundLogs.length;

  const viewingData = viewingRound > 0 ? roundLogs[viewingRound - 1] : null;
  const prevViewData = viewingRound > 1 ? roundLogs[viewingRound - 2] : null;

  const homeStats = mapData?.homePlayerStats || [];
  const awayStats = mapData?.awayPlayerStats || [];

  let homeMapWins = 0;
  let awayMapWins = 0;
  for (let i = 0; i < currentMap; i++) {
    if (match.mapScores[i].homeRounds > match.mapScores[i].awayRounds) homeMapWins++;
    else awayMapWins++;
  }
  const formatMaxMaps = match.format === 'bo5' ? 5 : match.format === 'bo3' ? 3 : 1;

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [viewingRound, killsShown]);

  // scoreboard data
  const allPlayerIds = useMemo(() => [
    ...homeStats.map(p => p.playerId),
    ...awayStats.map(p => p.playerId),
  ], [homeStats, awayStats]);

  // when an ult banner is pending, clamp visible kills so scoreboard doesn't spoil
  const effectiveKills = bannerOnlyIdx >= 0 ? bannerOnlyIdx : killsShown;

  const runningStats = useMemo(
    () => getRunningStats(roundLogs, effectiveKills, viewingRound, allPlayerIds),
    [roundLogs, effectiveKills, viewingRound, allPlayerIds],
  );

  const aliveState = useMemo(
    () => getAliveState(viewingData, effectiveKills, homeStats, awayStats),
    [viewingData, effectiveKills, homeStats, awayStats],
  );

  const homeWeapons = useMemo(() => {
    if (!viewingData) return new Map<string, string>();
    // read from sim snapshot when available
    if (viewingData.playerWeapons) {
      const m = new Map<string, string>();
      for (const p of homeStats) {
        const w = viewingData.playerWeapons[p.playerId];
        if (w) m.set(p.playerId, w);
      }
      return m;
    }
    // fallback for old saves
    return assignWeapons(viewingData.homeBuyState, homeStats.map(p => p.playerId), viewingData.roundNumber);
  }, [viewingData, homeStats]);

  const awayWeapons = useMemo(() => {
    if (!viewingData) return new Map<string, string>();
    if (viewingData.playerWeapons) {
      const m = new Map<string, string>();
      for (const p of awayStats) {
        const w = viewingData.playerWeapons[p.playerId];
        if (w) m.set(p.playerId, w);
      }
      return m;
    }
    return assignWeapons(viewingData.awayBuyState, awayStats.map(p => p.playerId), viewingData.roundNumber);
  }, [viewingData, awayStats]);

  const homeShields = useMemo(() => {
    if (!viewingData) return new Map<string, ShieldType>();
    if (viewingData.playerShields) {
      const m = new Map<string, ShieldType>();
      for (const p of homeStats) {
        const s = viewingData.playerShields[p.playerId];
        if (s) m.set(p.playerId, s);
      }
      return m;
    }
    return assignShields(viewingData.homeBuyState, homeStats.map(p => p.playerId), viewingData.roundNumber);
  }, [viewingData, homeStats]);

  const awayShields = useMemo(() => {
    if (!viewingData) return new Map<string, ShieldType>();
    if (viewingData.playerShields) {
      const m = new Map<string, ShieldType>();
      for (const p of awayStats) {
        const s = viewingData.playerShields[p.playerId];
        if (s) m.set(p.playerId, s);
      }
      return m;
    }
    return assignShields(viewingData.awayBuyState, awayStats.map(p => p.playerId), viewingData.roundNumber);
  }, [viewingData, awayStats]);

  // agent map for ult cost lookup
  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of homeStats) m.set(p.playerId, p.agent);
    for (const p of awayStats) m.set(p.playerId, p.agent);
    return m;
  }, [homeStats, awayStats]);

  const ultStatus = useMemo(
    () => getUltCharge(roundLogs, effectiveKills, viewingRound, allPlayerIds, agentMap, agentAbilities),
    [roundLogs, effectiveKills, viewingRound, allPlayerIds, agentMap, agentAbilities],
  );

  const buildScoreboard = (stats: PlayerMapStats[], side: 'home' | 'away'): ScoreboardEntry[] => {
    const aliveMap = side === 'home' ? aliveState.home : aliveState.away;
    const team = side === 'home' ? homeTeam : awayTeam;
    const weapons = side === 'home' ? homeWeapons : awayWeapons;
    const shields = side === 'home' ? homeShields : awayShields;
    return stats.map(p => {
      const running = runningStats.get(p.playerId);
      const rosterPlayer = team.roster.find(r => r.id === p.playerId);
      return {
        playerId: p.playerId,
        name: rosterPlayer?.name || p.playerId.slice(0, 6),
        agent: p.agent,
        isAlive: aliveMap.get(p.playerId) ?? true,
        kills: running?.kills ?? 0,
        deaths: running?.deaths ?? 0,
        assists: running?.assists ?? 0,
        weapon: weapons.get(p.playerId) || 'classic',
        shield: shields.get(p.playerId) || 'none',
        ultCurrent: ultStatus.get(p.playerId)?.current ?? 0,
        ultCost: ultStatus.get(p.playerId)?.cost ?? 7,
      };
    });
  };

  const homeScoreboard = useMemo(() =>
    buildScoreboard(homeStats, 'home').sort((a, b) => b.kills - a.kills || a.deaths - b.deaths),
    [homeStats, aliveState, runningStats],
  );
  const awayScoreboard = useMemo(() =>
    buildScoreboard(awayStats, 'away').sort((a, b) => b.kills - a.kills || a.deaths - b.deaths),
    [awayStats, aliveState, runningStats],
  );


  // track ult completion flash
  const prevUltFullRef = useRef<Set<string>>(new Set());
  const [ultFlash, setUltFlash] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevUltFullRef.current;
    const flashes: string[] = [];
    for (const e of [...homeScoreboard, ...awayScoreboard]) {
      const isFull = e.ultCurrent >= e.ultCost;
      if (isFull && !prev.has(e.playerId)) flashes.push(e.playerId);
    }
    const nextFull = new Set<string>();
    for (const e of [...homeScoreboard, ...awayScoreboard]) {
      if (e.ultCurrent >= e.ultCost) nextFull.add(e.playerId);
    }
    prevUltFullRef.current = nextFull;

    if (flashes.length > 0) {
      setUltFlash(p => {
        const n = new Set(p);
        for (const f of flashes) n.add(f);
        return n;
      });
      setTimeout(() => {
        setUltFlash(p => {
          const n = new Set(p);
          for (const f of flashes) n.delete(f);
          return n;
        });
      }, 800);
    }
  }, [homeScoreboard, awayScoreboard]);

  // detect stat changes and fire bump animations
  useEffect(() => {
    const newBumps: string[] = [];
    for (const [id, curr] of runningStats) {
      const prev = prevStatsRef.current.get(id);
      if (prev) {
        if (curr.kills > prev.kills) newBumps.push(`${id}-k`);
        if (curr.deaths > prev.deaths) newBumps.push(`${id}-d`);
        if (curr.assists > prev.assists) newBumps.push(`${id}-a`);
      }
    }
    if (newBumps.length > 0) {
      setActiveBumps(prev => {
        const next = new Set(prev);
        for (const b of newBumps) next.add(b);
        return next;
      });
      // clear bumps after animation
      setTimeout(() => {
        setActiveBumps(prev => {
          const next = new Set(prev);
          for (const b of newBumps) next.delete(b);
          return next;
        });
      }, 600);
    }
    prevStatsRef.current = new Map(
      [...runningStats].map(([id, s]) => [id, { kills: s.kills, deaths: s.deaths, assists: s.assists }])
    );
  }, [runningStats]);

  // state machine
  const playingRef = useRef(false);
  const instantRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const showNextKill = (roundIdx: number, killIdx: number) => {
    clearTimer();
    const rd = roundLogs[roundIdx];
    if (!rd) return;
    const totalKills = rd.kills.length;

    if (killIdx >= totalKills) {
      if (playingRef.current) {
        if (roundIdx + 1 >= totalRounds) {
          setIsPlaying(false);
          playingRef.current = false;
        } else {
          const delay = 800 / SPEEDS[speedIdx];
          timerRef.current = setTimeout(() => advanceRound(roundIdx + 1), delay);
        }
      }
      return;
    }

    // check for ult activation — show banner first, then reveal kill row after delay
    const nextKill = rd.kills[killIdx];
    if (nextKill && (nextKill as any).isUltActivation) {
      const burst = getAoeBurstSize(rd, killIdx);
      setKillsShown(killIdx + 1);
      setBannerOnly(killIdx);
      const bannerDelay = 600 / SPEEDS[speedIdx];
      timerRef.current = setTimeout(() => {
        setBannerOnly(-1);
        if (burst > 1) setKillsShown(killIdx + burst);
        const killDelay = (200 + Math.random() * 500) / SPEEDS[speedIdx];
        timerRef.current = setTimeout(() => showNextKill(roundIdx, killIdx + burst), killDelay);
      }, bannerDelay);
      return;
    }

    setKillsShown(killIdx + 1);
    // if this kill starts an AOE burst, reveal the rest immediately
    const burst = getAoeBurstSize(rd, killIdx);
    if (burst > 1) {
      setKillsShown(killIdx + burst);
      const delay = (200 + Math.random() * 500) / SPEEDS[speedIdx];
      timerRef.current = setTimeout(() => showNextKill(roundIdx, killIdx + burst), delay);
      return;
    }
    const delay = (200 + Math.random() * 500) / SPEEDS[speedIdx];
    timerRef.current = setTimeout(() => showNextKill(roundIdx, killIdx + 1), delay);
  };

  // autoplay: step through utility ults one by one, then start kill feed
  const showNextUtilUlt = (roundIdx: number, ultIdx: number) => {
    clearTimer();
    const rd = roundLogs[roundIdx];
    const totalUtil = preRoundUltCount(rd);
    if (ultIdx >= totalUtil) {
      // all utility ults shown, start kills
      const delay = totalUtil > 0 ? (300 / SPEEDS[speedIdx]) : (150 + Math.random() * 200) / SPEEDS[speedIdx];
      timerRef.current = setTimeout(() => showNextKill(roundIdx, 0), delay);
      return;
    }
    setUtilUlts(ultIdx + 1);
    const delay = 500 / SPEEDS[speedIdx];
    timerRef.current = setTimeout(() => showNextUtilUlt(roundIdx, ultIdx + 1), delay);
  };

  const advanceRound = (roundIdx: number) => {
    clearTimer();
    pausedKillsRef.current = -1; // clear paused state for new round
    if (roundIdx >= totalRounds) {
      setIsPlaying(false);
      playingRef.current = false;
      return;
    }
    setMaxRevealed(roundIdx + 1);
    setViewingRound(roundIdx + 1);
    setKillsShown(0);
    setUtilUlts(0);
    const delay = (150 + Math.random() * 200) / SPEEDS[speedIdx];
    timerRef.current = setTimeout(() => showNextUtilUlt(roundIdx, 0), delay);
  };

  useEffect(() => () => clearTimer(), []);

  // Report session state to parent so sidebar navigation can capture it
  useEffect(() => {
    if (onSessionUpdate) {
      onSessionUpdate({
        currentMap,
        maxRevealed,
        viewingRound,
        killsShown,
        pausedKills: pausedKillsRef.current,
        matchFinished,
      });
    }
  }, [currentMap, maxRevealed, viewingRound, killsShown, matchFinished]);

  const stopAll = () => {
    clearTimer();
    playingRef.current = false;
    setIsPlaying(false);
  };

  // Suspend playback and save session for later resume
  const handleSuspendBack = () => {
    stopAll();
    if (onSuspend) {
      onSuspend({
        currentMap,
        maxRevealed,
        viewingRound,
        killsShown,
        pausedKills: pausedKillsRef.current,
        matchFinished,
      });
    } else {
      onBack();
    }
  };

  const handlePlay = () => {
    if (maxRevealed >= totalRounds) return;
    setIsPlaying(true);
    playingRef.current = true;
    if (maxRevealed === 0) advanceRound(0);
    else advanceRound(maxRevealed);
  };

  const handlePause = () => {
    stopAll();
    if (viewingRound > 0) {
      const rd = roundLogs[viewingRound - 1];
      if (rd) {
        setKillsShown(rd.kills.length);
        setUtilUlts(preRoundUltCount(rd));
      }
    }
  };

  const handleSimNextRound = () => {
    if (maxRevealed >= totalRounds) return;
    stopAll();
    advanceRound(maxRevealed);
  };

  const handlePrevRound = () => {
    if (viewingRound > 0) {
      if (viewingRound === maxRevealed) {
        pausedKillsRef.current = killsShown;
      }
      stopAll();
      setBannerOnly(-1);
      const prevIdx = viewingRound - 2;
      const prevRd = prevIdx >= 0 ? roundLogs[prevIdx] : null;
      setViewingRound(prev => prev - 1);
      setKillsShown(instantRef.current && prevRd ? prevRd.kills.length : 0);
      setUtilUlts(preRoundUltCount(prevRd));
    }
  };

  const handleNextView = () => {
    if (viewingRound < maxRevealed) {
      stopAll();
      setBannerOnly(-1);
      const nextRd = roundLogs[viewingRound];
      setViewingRound(viewingRound + 1);
      setKillsShown(instantRef.current && nextRd ? nextRd.kills.length : 0);
      setUtilUlts(preRoundUltCount(nextRd));
    }
  };

  const handleSkipToEnd = () => {
    stopAll();
    setBannerOnly(-1);
    setMaxRevealed(totalRounds);
    setViewingRound(totalRounds);
    if (totalRounds > 0) {
      const rd = roundLogs[totalRounds - 1];
      setKillsShown(rd?.kills.length ?? 0);
      setUtilUlts(preRoundUltCount(rd));
    }
  };

  const handleNextMap = () => {
    stopAll();
    setBannerOnly(-1);
    if (currentMap < match.mapScores.length - 1) {
      setCurrentMap(prev => prev + 1);
      setMaxRevealed(0);
      setViewingRound(0);
      setKillsShown(0);
      setUtilUlts(0);
      // reset to step mode for the new map
      setIsInstant(false);
      instantRef.current = false;
      prevMapDecided.current = false;
    } else {
      setMatchFinished(true);
    }
  };

  const handleRoundClick = (rn: number) => {
    // save frontier position before navigating away
    if (viewingRound === maxRevealed && viewingRound > 0) {
      pausedKillsRef.current = killsShown;
    }
    stopAll();
    setBannerOnly(-1);
    setViewingRound(rn);
    const rd = roundLogs[rn - 1];
    // instant mode: show all kills + result immediately
    setKillsShown(instantRef.current && rd ? rd.kills.length : 0);
    setUtilUlts(preRoundUltCount(rd));
  };

  const cycleSpeed = () => setSpeedIdx(prev => (prev + 1) % SPEEDS.length);

  const toggleInstant = () => {
    const next = !isInstant;
    setIsInstant(next);
    instantRef.current = next;
    // switching to instant on an already-revealed round: show everything
    if (next && viewingRound > 0 && viewingRound <= maxRevealed) {
      const rd = roundLogs[viewingRound - 1];
      if (rd) {
        setKillsShown(rd.kills.length);
        setUtilUlts(preRoundUltCount(rd));
        setBannerOnly(-1);
      }
    }
  };

  // count how many AOE splash kills follow this kill
  // only bundles kills explicitly marked isAoeSplash (from the sim's AOE loop)
  // chain kills from Neon/Jett etc. reveal one at a time
  const getAoeBurstSize = (rd: RoundLog, killIdx: number): number => {
    let count = 1;
    while (killIdx + count < rd.kills.length) {
      const next = rd.kills[killIdx + count] as any;
      if (!next.isAoeSplash) break;
      count++;
    }
    return count;
  };

  // per-kill step: reveals one kill at a time (or a burst for AOE), then result, then next round
  // instant mode: reveals the entire round at once per press
  const handleStep = () => {
    stopAll();

    // if a banner is showing with hidden kill row, reveal the kill row + AOE burst
    if (bannerOnlyRef.current >= 0) {
      const rd = roundLogs[viewingRound - 1];
      const burst = rd ? getAoeBurstSize(rd, bannerOnlyRef.current) : 1;
      if (burst > 1) setKillsShown(prev => Math.min(prev + burst - 1, rd.kills.length));
      setBannerOnly(-1);
      if (!instantRef.current) return;
    }

    if (maxRevealed === 0) {
      setMaxRevealed(1);
      setViewingRound(1);
      setUtilUlts(0);
      const rd = roundLogs[0];
      if (instantRef.current && rd) {
        setKillsShown(rd.kills.length);
        setUtilUlts(preRoundUltCount(rd));
      } else {
        setKillsShown(0);
      }
      return;
    }
    if (viewingRound === 0) {
      setViewingRound(1);
      setUtilUlts(0);
      const rd = roundLogs[0];
      if (instantRef.current && rd) {
        setKillsShown(rd.kills.length);
        setUtilUlts(preRoundUltCount(rd));
      } else {
        setKillsShown(0);
      }
      return;
    }

    const rd = roundLogs[viewingRound - 1];
    if (!rd) return;
    const totalKills = rd.kills.length;
    const totalUtil = preRoundUltCount(rd);

    if (instantRef.current) {
      // instant: if round not fully shown, show it all; otherwise advance
      if (killsShown < totalKills || utilUltsShown < totalUtil) {
        setKillsShown(totalKills);
        setUtilUlts(totalUtil);
      } else if (viewingRound < maxRevealed) {
        const nextRd = roundLogs[viewingRound];
        setViewingRound(viewingRound + 1);
        setKillsShown(nextRd ? nextRd.kills.length : 0);
        setUtilUlts(preRoundUltCount(nextRd));
      } else if (maxRevealed < totalRounds) {
        const nextIdx = maxRevealed;
        const nextRd = roundLogs[nextIdx];
        setMaxRevealed(nextIdx + 1);
        setViewingRound(nextIdx + 1);
        setKillsShown(nextRd ? nextRd.kills.length : 0);
        setUtilUlts(preRoundUltCount(nextRd));
      }
      return;
    }

    // step mode: reveal utility ults one at a time first
    if (utilUltsRef.current < totalUtil) {
      setUtilUlts(utilUltsRef.current + 1);
      return;
    }

    if (killsShown < totalKills) {
      // reveal next kill — works for both current and past rounds
      const nextKill = rd.kills[killsShown];
      const burst = getAoeBurstSize(rd, killsShown);
      if (nextKill && (nextKill as any).isUltActivation) {
        setKillsShown(killsShown + 1);
        setBannerOnly(killsShown);
        return;
      }
      setKillsShown(prev => Math.min(prev + burst, totalKills));
    } else if (viewingRound < maxRevealed) {
      // replaying past rounds: advance to next revealed round
      setViewingRound(viewingRound + 1);
      setKillsShown(0);
      setUtilUlts(0);
    } else if (maxRevealed < totalRounds) {
      // frontier: reveal new round
      const nextIdx = maxRevealed;
      setMaxRevealed(nextIdx + 1);
      setViewingRound(nextIdx + 1);
      setKillsShown(0);
      setUtilUlts(0);
    }
  };

  const mapDecided = maxRevealed >= totalRounds && totalRounds > 0;
  const isLastMap = currentMap >= match.mapScores.length - 1;

  // auto-switch to instant mode when map is fully revealed (for backtracking)
  const prevMapDecided = useRef(false);
  useEffect(() => {
    if (mapDecided && !prevMapDecided.current) {
      setIsInstant(true);
      instantRef.current = true;
    }
    prevMapDecided.current = mapDecided;
  }, [mapDecided]);

  const activeRoundTotalKills = viewingRound > 0 ? (roundLogs[viewingRound - 1]?.kills.length ?? 0) : 0;
  const activeRoundTotalUtil = viewingRound > 0 ? preRoundUltCount(roundLogs[viewingRound - 1]) : 0;
  const activeRoundDone = viewingRound > 0 && killsShown >= activeRoundTotalKills && utilUltsShown >= activeRoundTotalUtil;

  // Whether the latest revealed round has been fully revealed (all kills shown)
  // Used for feed items — prevents spoiling when user navigates to a past round
  const latestRoundTotalKills = maxRevealed > 0 ? (roundLogs[maxRevealed - 1]?.kills.length ?? 0) : 0;
  const latestRoundComplete = (() => {
    if (maxRevealed === 0) return false;
    // Currently viewing the latest round — use live killsShown
    if (viewingRound === maxRevealed) return killsShown >= latestRoundTotalKills;
    // Navigated away — check saved pause position
    if (pausedKillsRef.current >= 0) return pausedKillsRef.current >= latestRoundTotalKills;
    // No pause saved (round completed before navigation, or autoplay moved on)
    return true;
  })();

  const isAnimatingLatest = viewingRound === maxRevealed && !activeRoundDone && viewingRound > 0;
  // Whether latest round is still hidden (not fully revealed) — regardless of which round is viewed
  const latestStillHidden = maxRevealed > 0 && !latestRoundComplete;
  // show pre-round score when stepping through kills (any round, not just frontier)
  const isRoundInProgress = viewingRound > 0 && !activeRoundDone;
  const displayHomeScore = isRoundInProgress
    ? (prevViewData?.homeRoundScore ?? 0)
    : (viewingData?.homeRoundScore ?? 0);
  const displayAwayScore = isRoundInProgress
    ? (prevViewData?.awayRoundScore ?? 0)
    : (viewingData?.awayRoundScore ?? 0);

  const timelineReveal = latestStillHidden ? maxRevealed - 1 : maxRevealed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); isPlaying ? handlePause() : handlePlay(); }
      if (e.key === 'ArrowRight') handleNextView();
      if (e.key === 'ArrowLeft') handlePrevRound();
      if (e.key === 'Enter') { e.preventDefault(); handleStep(); }
      if (e.key === 'i' || e.key === 'I') toggleInstant();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlaying, viewingRound, maxRevealed, killsShown, bannerOnlyIdx, utilUltsShown]);

  const feedLogs = roundLogs.slice(0, maxRevealed);

  // render kill row — wallbang before headshot (fixed order)
  const renderKill = (kill: KillEvent, ki: number, hideKillRow: boolean = false) => {
    const isHome = kill.killerTeamId === match.homeTeamId;
    const killerAbbr = isHome ? homeTeam.abbreviation : awayTeam.abbreviation;
    const victimAbbr = isHome ? awayTeam.abbreviation : homeTeam.abbreviation;

    const roman = kill.killerRoundKills >= 2
      ? ['', 'I', 'II', 'III', 'IV', 'V'][Math.min(kill.killerRoundKills, 5)]
      : null;

    // ult activation banner — always shown, persists in feed
    const ultBanner = (kill as any).isUltActivation ? (
      <div className={`ls-ult-banner ${isHome ? 'home' : 'away'}`}>
        <span className="ls-ult-emoji">‼️</span>
        <img src={agentIcon(kill.killerAgent)} alt="" className="ls-ult-agent" />
        <span className="ls-ult-text">
          <span className="ls-ult-name">{killerAbbr} {kill.killerName}</span>
          <span className="ls-ult-label">activates</span>
          <span className="ls-ult-ability">{kill.weapon}</span>
        </span>
        {abilityIcons?.[(kill as any).abilityId] && (
          <img src={abilityIcons[(kill as any).abilityId]} alt="" className="ls-ult-ability-icon" />
        )}
      </div>
    ) : null;

    return (
      <Fragment key={ki}>
        {ultBanner}
        {!hideKillRow && (
        <div className={`ls-kill ${kill.killerTeamId === viewingData?.attackingTeamId ? 'atk' : 'def'}`}>
        {roman && <span className={`ls-kill-multi ${kill.killerRoundKills >= 5 ? 'ace' : ''}`}>{roman}</span>}
        <div className="ls-kill-left">
          <img src={agentIcon(kill.killerAgent)} alt="" className="ls-kill-agent" />
          <span className="ls-kill-name">{killerAbbr} {kill.killerName}</span>
        </div>
        <div className="ls-kill-center">
          {kill.isAbilityKill ? (
            (kill as any).abilityId && abilityIcons?.[(kill as any).abilityId]
              ? <img src={abilityIcons[(kill as any).abilityId]} alt="" className="ls-kill-weapon-icon ability-icon" title={kill.weapon} />
              : <img src={agentIcon(kill.killerAgent)} alt="" className="ls-kill-weapon-icon ability-icon" title={kill.weapon} />
          ) : (
            <WeaponIcon weapon={kill.weapon} />
          )}
          {kill.isWallbang && <img src="/logos/killfeed/wallbang_icon.png" alt="WB" className="ls-kill-mod-icon" title="Wallbang" />}
          {kill.isHeadshot && <img src="/logos/killfeed/headshot_icon.png" alt="HS" className="ls-kill-mod-icon" title="Headshot" />}
        </div>
        <div className="ls-kill-right">
          <span className="ls-kill-name">{victimAbbr} {kill.victimName}</span>
          <img src={agentIcon(kill.victimAgent)} alt="" className="ls-kill-agent victim" />
        </div>
      </div>
        )}
      </Fragment>
    );
  };

  // match complete
  if (matchFinished) {
    const homeWon = match.homeScore > match.awayScore;
    const winnerTeam = homeWon ? homeTeam : awayTeam;
    const loserTeam = homeWon ? awayTeam : homeTeam;
    return (
      <div className="live-sim-page">
        <div className="ls-complete-screen">
          <div className="ls-mc-backdrop">
            <img src={winnerTeam.logo} alt="" className="ls-mc-bg-logo" />
          </div>

          <button className="ls-mc-back-btn" onClick={onBack}>← Back</button>

          {/* Main hero section */}
          <div className="ls-mc-hero">
            <div className={`ls-mc-team ${homeWon ? 'winner' : 'loser'}`}>
              <img src={homeTeam.logo} alt="" className="ls-mc-logo" />
              <span className="ls-mc-name">{homeTeam.name}</span>
            </div>

            <div className="ls-mc-score-block">
              <div className="ls-mc-scores">
                <span className={`ls-mc-num ${homeWon ? 'win' : ''}`}>{match.homeScore}</span>
                <span className="ls-mc-colon">:</span>
                <span className={`ls-mc-num ${!homeWon ? 'win' : ''}`}>{match.awayScore}</span>
              </div>
              <div className="ls-mc-label">MATCH COMPLETE</div>
            </div>

            <div className={`ls-mc-team right ${!homeWon ? 'winner' : 'loser'}`}>
              <img src={awayTeam.logo} alt="" className="ls-mc-logo" />
              <span className="ls-mc-name">{awayTeam.name}</span>
            </div>
          </div>

          {/* Map scores */}
          <div className="ls-mc-maps">
            {match.mapScores.map((ms, i) => {
              const hw = ms.homeRounds > ms.awayRounds;
              return (
                <div key={i} className={`ls-mc-map ${hw ? 'home-win' : 'away-win'}`}>
                  <div className="ls-mc-map-bar" />
                  <span className="ls-mc-map-label">MAP {i + 1}</span>
                  <span className="ls-mc-map-name">{ms.map}</span>
                  <span className="ls-mc-map-score">
                    <span className={hw ? 'w' : ''}>{ms.homeRounds}</span>
                    <span className="sep">-</span>
                    <span className={!hw ? 'w' : ''}>{ms.awayRounds}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Series summary stats */}
          {(() => {
            const totalRounds = match.mapScores.reduce((s, ms) => s + ms.homeRounds + ms.awayRounds, 0);
            // Pistol rounds: round index 0 (first half) and 12 (second half)
            let homePistols = 0, awayPistols = 0;
            for (const ms of match.mapScores) {
              if (ms.roundLogs) {
                for (const r of ms.roundLogs) {
                  if (r.roundNumber === 1 || r.roundNumber === 13) {
                    if (r.winnerTeamId === match.homeTeamId) homePistols++;
                    else awayPistols++;
                  }
                }
              }
            }
            // FK totals per team
            let homeFKs = 0, awayFKs = 0;
            for (const ms of match.mapScores) {
              for (const ps of (ms.homePlayerStats || [])) homeFKs += ps.firstKills;
              for (const ps of (ms.awayPlayerStats || [])) awayFKs += ps.firstKills;
            }
            return (
              <div className="ls-mc-summary">
                <div className="ls-mc-summary-stat">
                  <span className="ls-mc-summary-val">{totalRounds}</span>
                  <span className="ls-mc-summary-label">Rounds</span>
                </div>
                <div className="ls-mc-summary-divider" />
                <div className="ls-mc-summary-stat">
                  <span className="ls-mc-summary-val">{homePistols}-{awayPistols}</span>
                  <span className="ls-mc-summary-label">Pistols</span>
                </div>
                <div className="ls-mc-summary-divider" />
                <div className="ls-mc-summary-stat">
                  <span className="ls-mc-summary-val">{homeFKs}-{awayFKs}</span>
                  <span className="ls-mc-summary-label">First Bloods</span>
                </div>
              </div>
            );
          })()}

          {/* Awards bar */}
          {match.awards && match.awards.length > 0 && (
            <div className="ls-mc-awards">
              {match.awards.map((award, i) => {
                const isHome = award.teamId === match.homeTeamId;
                const awardTeam = isHome ? homeTeam : awayTeam;
                const awardPlayer = awardTeam.roster.find(p => p.id === award.playerId);
                return (
                  <div key={i} className={`ls-mc-award ${isHome ? 'home' : 'away'}`}>
                    <img src={agentIcon(award.playerAgent)} alt="" className="ls-mc-award-icon" />
                    <div className="ls-mc-award-info">
                      <span className="ls-mc-award-label">{award.label}</span>
                      <span className="ls-mc-award-name"><InlineFlag code={awardPlayer?.nationality} />{award.playerName}</span>
                      <span className="ls-mc-award-value">{award.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons */}
          <div className="ls-mc-actions">
            <button className="btn btn-secondary" onClick={onBack}>Back to Game</button>
            <button className="btn btn-play" onClick={() => onViewFullMatch(match.id)}>View Full Stats →</button>
          </div>
        </div>
      </div>
    );
  }

  const homeAliveCount = [...aliveState.home.values()].filter(Boolean).length;
  const awayAliveCount = [...aliveState.away.values()].filter(Boolean).length;

  return (
    <div className="live-sim-page">
      {/* broadcast header */}
      <div className={`ls-header ${viewingData?.attackingTeamId === match.homeTeamId ? 'home-atk' : 'home-def'}`}>
        <div className="ls-hdr-left">
          <button className="ls-back-btn" onClick={handleSuspendBack} title="Back">
            <span className="ls-back-arrow">←</span>
          </button>
          {viewingRound > 0 && viewingData && (
            <span className={`ls-rb-buy ${viewingData.attackingTeamId === match.homeTeamId ? 'home-atk' : 'home-def'}`}>
              {BUY_LABELS[viewingData.homeBuyState]} vs {BUY_LABELS[viewingData.awayBuyState]}
            </span>
          )}
        </div>

        <div className="ls-hdr-center-meta">
          <span className="ls-hdr-round-status">
            {viewingRound > 0 ? `Round ${viewingRound}` : 'Pre-match'}
            {viewingRound > 0 && isAnimatingLatest && <span className="ls-status-dot live">· Live</span>}
            {viewingRound > 0 && !isAnimatingLatest && activeRoundDone && viewingRound === maxRevealed && (
              <span className={`ls-status-dot ${viewingData?.winnerTeamId === match.homeTeamId ? 'home' : 'away'}`}>
                · {viewingData?.winnerTeamId === match.homeTeamId ? homeTeam.abbreviation : awayTeam.abbreviation} wins
              </span>
            )}
            {viewingRound > 0 && !isAnimatingLatest && viewingRound < maxRevealed && (
              <span className="ls-status-dot replay">· Replay</span>
            )}
          </span>
        </div>

        <div className="ls-hdr-meta" />
      </div>

      {/* timeline strip — full width above columns */}
      <div className="ls-timeline-top">
        <RoundTimeline
          roundLogs={roundLogs.slice(0, timelineReveal)}
          homeTeamId={match.homeTeamId}
          awayTeamId={match.awayTeamId}
          homeAbbr={homeTeam.abbreviation}
          awayAbbr={awayTeam.abbreviation}
          homeLogo={homeTeam.logo}
          awayLogo={awayTeam.logo}
          revealUpTo={timelineReveal}
          onRoundClick={handleRoundClick}
        />
      </div>

      {/* three-column layout */}
      <div className="ls-main">
        {/* left: round history */}
        <div className="ls-panel-left">
          <div className="ls-history" ref={feedRef}>
            {maxRevealed === 0 ? (
              <div className="ls-feed-empty">
                <div className="ls-feed-empty-icon">▶</div>
                <div>Press <kbd>Space</kbd> or click Play</div>
                <div className="ls-feed-hint"><kbd>←</kbd> <kbd>→</kbd> to browse</div>
              </div>
            ) : (
              feedLogs.map((round, idx) => {
                const homeWon = round.winnerTeamId === match.homeTeamId;
                const winnerAbbr = homeWon ? homeTeam.abbreviation : awayTeam.abbreviation;
                const isViewing = idx + 1 === viewingRound;
                const isLatestRevealed = idx + 1 === maxRevealed;
                const multi = getMultiKill(round);
                const showSummary = !isLatestRevealed || (isLatestRevealed && latestRoundComplete);

                return (
                  <div
                    key={round.roundNumber}
                    className={`ls-round ${isViewing ? 'viewing' : 'past'}`}
                    onClick={() => handleRoundClick(round.roundNumber)}
                  >
                    {round.isHalfTime && (
                      <div className="ls-divider">
                        <span className="ls-divider-line" />
                        <span className="ls-divider-text">HT · {roundLogs[idx - 1]?.homeRoundScore ?? 0}-{roundLogs[idx - 1]?.awayRoundScore ?? 0}</span>
                        <span className="ls-divider-line" />
                      </div>
                    )}
                    {round.isOvertime && round.roundNumber === 25 && (
                      <div className="ls-divider">
                        <span className="ls-divider-line" />
                        <span className="ls-divider-text">OVERTIME</span>
                        <span className="ls-divider-line" />
                      </div>
                    )}

                    {round.timeout && showSummary && (
                      <div className={`ls-timeout-row ${round.timeout.teamId === match.homeTeamId ? 'home' : 'away'}`}>
                        <span className="ls-timeout-tag">TIMEOUT</span>
                        <span className="ls-timeout-name">{round.timeout.teamId === match.homeTeamId ? homeTeam.abbreviation : awayTeam.abbreviation}</span>
                      </div>
                    )}

                    {showSummary ? (
                      <div className={`ls-round-summary ${homeWon ? 'home-win' : 'away-win'}`}>
                        <span className="ls-round-num">R{round.roundNumber}</span>
                        <span className="ls-round-winner">{winnerAbbr}</span>
                        <img src={WIN_ICONS_SRC[round.winCondition]} alt="" className="ls-round-wc-icon" />
                        {multi && <span className="ls-multi">{multi.label} {getPlayerName(round, multi.pid)}</span>}
                        <span className="ls-round-score">{round.homeRoundScore}-{round.awayRoundScore}</span>
                      </div>
                    ) : (
                      <div className="ls-round-active-placeholder">
                        <span className="ls-round-num">R{round.roundNumber}</span>
                        <span className="ls-active-ongoing">IN PROGRESS</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* center: broadcast scoreboard + kill feed */}
        <div className="ls-panel-center">
          <img
            className="ls-map-bg"
            src={`/logos/maps_pic/${(mapData?.map || '').toLowerCase()}.webp`}
            onError={(e) => { (e.target as HTMLImageElement).src = `/logos/maps_pic/${(mapData?.map || '').toLowerCase()}.jpg`; }}
            alt=""
          />
          {/* broadcast scoreboard */}
          <div className="ls-bc">
            {viewingData && (
              <div className={`ls-bc-scoreline ${viewingData.attackingTeamId === match.homeTeamId ? 'home-atk' : 'home-def'}`}>
                <div className="ls-bc-sl-team home">
                  <span className="ls-bc-sl-buy">{BUY_LABELS[viewingData.homeBuyState]}</span>
                  <span className={`ls-bc-sl-tag ${viewingData.attackingTeamId === match.homeTeamId ? 'atk' : 'def'}`}>
                    {viewingData.attackingTeamId === match.homeTeamId ? 'ATK' : 'DEF'}
                  </span>
                  <img src={homeTeam.logo} alt="" className="ls-bc-sl-logo" />
                  <div className="ls-bc-sl-team-col">
                    <span className="ls-bc-sl-name">
                      {homeTeam.abbreviation}
                      {viewingData.momentum && viewingData.momentum.home >= 3 && <span className="ls-momentum-fire">🔥</span>}
                    </span>
                    {homeTeam.staff.headCoach && (
                      <span className="ls-bc-sl-coach">
                        <InlineFlag code={homeTeam.staff.headCoach.nationality} size={10} />
                        {homeTeam.staff.headCoach.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ls-bc-sl-center">
                  <div className="ls-bc-sl-num-col">
                    <span className={`ls-bc-sl-num ${displayHomeScore > displayAwayScore ? 'home-lead' : ''}`}>{displayHomeScore}</span>
                    {formatMaxMaps > 1 && (
                      <div className="ls-diamonds home">
                        {Array.from({ length: Math.ceil(formatMaxMaps / 2) }).map((_, di, arr) => (
                          <span key={di} className={`ls-diamond ${di >= arr.length - homeMapWins ? 'filled' : ''}`} />
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="ls-bc-sl-div">-</span>
                  <div className="ls-bc-sl-num-col">
                    <span className={`ls-bc-sl-num ${displayAwayScore > displayHomeScore ? 'away-lead' : ''}`}>{displayAwayScore}</span>
                    {formatMaxMaps > 1 && (
                      <div className="ls-diamonds away">
                        {Array.from({ length: Math.ceil(formatMaxMaps / 2) }).map((_, di) => (
                          <span key={di} className={`ls-diamond ${di < awayMapWins ? 'filled' : ''}`} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="ls-bc-sl-team away">
                  <div className="ls-bc-sl-team-col away">
                    <span className="ls-bc-sl-name">
                      {viewingData.momentum && viewingData.momentum.away >= 3 && <span className="ls-momentum-fire">🔥</span>}
                      {awayTeam.abbreviation}
                    </span>
                    {awayTeam.staff.headCoach && (
                      <span className="ls-bc-sl-coach">
                        <InlineFlag code={awayTeam.staff.headCoach.nationality} size={10} />
                        {awayTeam.staff.headCoach.name}
                      </span>
                    )}
                  </div>
                  <img src={awayTeam.logo} alt="" className="ls-bc-sl-logo" />
                  <span className={`ls-bc-sl-tag ${viewingData.attackingTeamId !== match.homeTeamId ? 'atk' : 'def'}`}>
                    {viewingData.attackingTeamId !== match.homeTeamId ? 'ATK' : 'DEF'}
                  </span>
                  <span className="ls-bc-sl-buy">{BUY_LABELS[viewingData.awayBuyState]}</span>
                </div>
                <span className="ls-bc-sl-mapname">{mapData?.map}</span>
              </div>
            )}
            {viewingData?.timeout && (
              <div className={`ls-timeout-banner ${viewingData.timeout.teamId === match.homeTeamId ? 'home' : 'away'}`}>
                <span className="ls-timeout-label">TIMEOUT</span>
                <span className="ls-timeout-team">
                  {(() => {
                    const isHome = viewingData.timeout.teamId === match.homeTeamId;
                    const t = isHome ? homeTeam : awayTeam;
                    const coach = t.staff.headCoach;
                    return <>{t.abbreviation}{coach ? <span className="ls-timeout-coach"> {coach.name}</span> : ''}</>;
                  })()}
                </span>
              </div>
            )}
            <div className="ls-bc-rows">
              {Array.from({ length: 5 }).map((_, i) => {
                const h = homeScoreboard[i];
                const a = awayScoreboard[i];
                if (!h && !a) return null;
                const hDead = h && !h.isAlive;
                const aDead = a && !a.isAlive;
                const homeIsAtk = viewingData?.attackingTeamId === match.homeTeamId;
                const hRole = homeIsAtk ? 'atk' : 'def';
                const aRole = homeIsAtk ? 'def' : 'atk';
                return (
                  <div key={i} className={`ls-bc-row ${i % 2 === 0 ? 'even' : 'odd'}`}>
                    {/* home side */}
                    <div className={`ls-bc-side home ${hRole}`}>
                      <div className={`ls-bc-loadout home ${hRole} ${hDead ? 'dead' : ''}${h && h.ultCurrent >= h.ultCost ? ' ult-ready' : ''}`}>
                        {h && <>
                          <div className="ls-bc-shield-col">
                            {h.shield !== 'none' && <img src={`/logos/gun_icons/${h.shield}_shield.webp`} alt="" className="ls-bc-shield-icon" />}
                          </div>
                          <img src={`/logos/gun_icons/${h.weapon.toLowerCase().replace(/ /g, '_')}_icon.png`} alt="" className="ls-bc-weapon" />
                          <div className="ls-bc-ult-col"><UltOrb current={h.ultCurrent} cost={h.ultCost} flash={ultFlash.has(h.playerId)} /></div>
                        </>}
                      </div>
                      <div className={`ls-bc-identity home ${hRole} ${hDead ? 'dead' : ''}`}>
                        {h && <>
                          <img src={agentIcon(h.agent)} alt="" className="ls-bc-agent" />
                          <span className="ls-bc-name">{h.name}</span>
                          <div className="ls-bc-kda">
                            <span className="ls-bc-kda-num">{h.kills}</span><span className="ls-bc-slash">/</span>
                            <span className="ls-bc-kda-num">{h.deaths}</span><span className="ls-bc-slash">/</span>
                            <span className="ls-bc-kda-num">{h.assists}</span>
                          </div>
                        </>}
                      </div>
                    </div>

                    {/* away side */}
                    <div className={`ls-bc-side away ${aRole}`}>
                      <div className={`ls-bc-identity away ${aRole} ${aDead ? 'dead' : ''}`}>
                        {a && <>
                          <div className="ls-bc-kda">
                            <span className="ls-bc-kda-num">{a.kills}</span><span className="ls-bc-slash">/</span>
                            <span className="ls-bc-kda-num">{a.deaths}</span><span className="ls-bc-slash">/</span>
                            <span className="ls-bc-kda-num">{a.assists}</span>
                          </div>
                          <span className="ls-bc-name">{a.name}</span>
                          <img src={agentIcon(a.agent)} alt="" className="ls-bc-agent" />
                        </>}
                      </div>
                      <div className={`ls-bc-loadout away ${aRole} ${aDead ? 'dead' : ''}${a && a.ultCurrent >= a.ultCost ? ' ult-ready' : ''}`}>
                        {a && <>
                          <div className="ls-bc-ult-col"><UltOrb current={a.ultCurrent} cost={a.ultCost} flash={ultFlash.has(a.playerId)} /></div>
                          <img src={`/logos/gun_icons/${a.weapon.toLowerCase().replace(/ /g, '_')}_icon.png`} alt="" className="ls-bc-weapon" />
                          <div className="ls-bc-shield-col">
                            {a.shield !== 'none' && <img src={`/logos/gun_icons/${a.shield}_shield.webp`} alt="" className="ls-bc-shield-icon" />}
                          </div>
                        </>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* kill feed below */}
          <div className="ls-feed-area">
          {viewingRound > 0 && viewingData ? (() => {
            const round = roundLogs[viewingRound - 1];
            if (!round) return null;
            const homeWon = round.winnerTeamId === match.homeTeamId;
            const winnerAbbr = homeWon ? homeTeam.abbreviation : awayTeam.abbreviation;
            const isLatestRevealed = viewingRound === maxRevealed;
            const kCount = bannerOnlyIdx >= 0 ? bannerOnlyIdx + 1 : killsShown;
            const prevR = viewingRound > 1 ? roundLogs[viewingRound - 2] : null;
            const multi = getMultiKill(round);
            const flavorLines = getRoundFlavor(round, prevR, match.homeTeamId, homeTeam.abbreviation, awayTeam.abbreviation);
            const showResult = activeRoundDone;
            const attackersWon = round.winnerTeamId === round.attackingTeamId;

            return (
              <div className="ls-stage">
                <div className="ls-kills-wrapper">
  <div className="ls-kills">
                  {preRoundUlts(round).slice(0, isLatestRevealed ? utilUltsShown : undefined).map((uu, ui) => {
                    const isHome = uu.teamId === match.homeTeamId;
                    const abbr = isHome ? homeTeam.abbreviation : awayTeam.abbreviation;
                    return (
                      <div key={`uu-${ui}`} className={`ls-ult-banner ${isHome ? 'home' : 'away'}`}>
                        <span className="ls-ult-emoji">‼️</span>
                        <img src={agentIcon(uu.agent)} alt="" className="ls-ult-agent" />
                        <span className="ls-ult-text">
                          <span className="ls-ult-name">{abbr} {uu.playerName}</span>
                          <span className="ls-ult-label">activates</span>
                          <span className="ls-ult-ability">{uu.abilityName}</span>
                          {uu.targetPlayerName && <>
                            <span className="ls-ult-label">on</span>
                            {uu.targetAgent && <img src={agentIcon(uu.targetAgent)} alt="" className="ls-ult-target-agent" />}
                            <span className="ls-ult-name">{uu.targetPlayerName}</span>
                          </>}
                        </span>
                        {abilityIcons?.[uu.abilityId] && (
                          <img src={abilityIcons[uu.abilityId]} alt="" className="ls-ult-ability-icon" />
                        )}
                      </div>
                    );
                  })}
                  {kCount > 0 && buildKillFeed(round, kCount).map((item, fi) => {
                    if (item.type === 'ult') {
                      const uu = item.ult;
                      const isHome = uu.teamId === match.homeTeamId;
                      const abbr = isHome ? homeTeam.abbreviation : awayTeam.abbreviation;
                      return (
                        <div key={`mu-${fi}`} className={`ls-ult-banner ${isHome ? 'home' : 'away'}`}>
                          <span className="ls-ult-emoji">‼️</span>
                          <img src={agentIcon(uu.agent)} alt="" className="ls-ult-agent" />
                          <span className="ls-ult-text">
                            <span className="ls-ult-name">{abbr} {uu.playerName}</span>
                            <span className="ls-ult-label">activates</span>
                            <span className="ls-ult-ability">{uu.abilityName}</span>
                            {uu.targetPlayerName && <>
                              <span className="ls-ult-label">on</span>
                              {uu.targetAgent && <img src={agentIcon(uu.targetAgent)} alt="" className="ls-ult-target-agent" />}
                              <span className="ls-ult-name">{uu.targetPlayerName}</span>
                            </>}
                          </span>
                          {abilityIcons?.[uu.abilityId] && (
                            <img src={abilityIcons[uu.abilityId]} alt="" className="ls-ult-ability-icon" />
                          )}
                        </div>
                      );
                    }
                    return renderKill(item.kill, item.ki, bannerOnlyIdx >= 0 && item.ki >= bannerOnlyIdx);
                  })}
                  {showResult && flavorLines.length > 0 && (
                    <div className="ls-flavor">
                      {flavorLines.map((line, fi) => (
                        <span key={fi} className="ls-flavor-line">{line}</span>
                      ))}
                    </div>
                  )}
                  {showResult && (
                    <div className={`ls-kill-result ${attackersWon ? 'atk' : 'def'}`}>
                      <img src={WIN_ICONS_SRC[round.winCondition]} alt="" className="ls-result-icon" />
                      <span className="ls-result-text">{winnerAbbr} wins</span>
                      <span className="ls-result-side-tag">{attackersWon ? 'Attackers' : 'Defenders'}</span>
                      <span className="ls-result-wc-text">{WIN_LABELS[round.winCondition]}</span>
                      {multi && <span className="ls-multi">{multi.label} {getPlayerName(round, multi.pid)}</span>}
                      <span className="ls-result-score">{round.homeRoundScore}-{round.awayRoundScore}</span>
                    </div>
                  )}
                </div>
                </div>
              </div>
            );
          })() : (
            <div className="ls-stage-empty">
              <span>Kill feed appears here</span>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="ls-controls">
        <div className="ls-ctrl-left">
          {isPlaying ? (
            <button className="ls-btn primary" onClick={handlePause} title="Pause (Space)">Pause</button>
          ) : (
            <button className="ls-btn primary" onClick={handlePlay} disabled={maxRevealed >= totalRounds} title="Play (Space)">Play</button>
          )}
          <button className="ls-btn text" onClick={handleSkipToEnd} disabled={maxRevealed >= totalRounds} title="Skip to end">Skip All</button>
        </div>

        <div className="ls-ctrl-center">
          <span className="ls-counter">
            R{viewingRound}/{maxRevealed}
            {viewingRound !== maxRevealed && <span className="ls-counter-hint"> (viewing)</span>}
          </span>
          <span className="ls-keyhints">
            <kbd>←</kbd><kbd>→</kbd> nav
            <kbd>Enter</kbd> step
            <kbd>Space</kbd> play
            <kbd>I</kbd> mode
          </span>
        </div>

        <div className="ls-ctrl-right">
          <button className={`ls-instant-toggle ${isInstant ? 'active' : ''}`} onClick={toggleInstant} title="Instant round reveal (I)">
            {isInstant ? 'Instant' : 'Step'}
          </button>
          <button className="ls-speed" onClick={cycleSpeed}>{SPEEDS[speedIdx]}×</button>
          {mapDecided && (
            <button className="btn btn-play ls-advance" onClick={handleNextMap}>
              {isLastMap ? 'Finish' : `Map ${currentMap + 2} →`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getMultiKill(round: RoundLog) {
  const counts: Record<string, number> = {};
  for (const k of round.kills) {
    counts[k.killerPlayerId] = Math.max(counts[k.killerPlayerId] || 0, k.killerRoundKills);
  }
  for (const [pid, c] of Object.entries(counts)) {
    if (c >= 5) return { pid, label: 'ACE', count: c };
    if (c >= 4) return { pid, label: '4K', count: c };
    if (c >= 3) return { pid, label: '3K', count: c };
  }
  return null;
}

function getPlayerName(round: RoundLog, pid: string) {
  const k = round.kills.find(k => k.killerPlayerId === pid);
  return k?.killerName ?? '';
}
