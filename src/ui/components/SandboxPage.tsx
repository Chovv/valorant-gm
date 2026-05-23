// src/ui/components/SandboxPage.tsx
import { useState, useMemo, useRef, useEffect } from 'react';
import type { Player, Role, Ratings } from '../../types';
import type { Team, Region } from '../../types/team';
import type { MatchFormat, MatchResult, SeasonHistoryEntry } from '../../types/league';
import type { GameState } from '../../sim/gameState';
import { AGENTS } from '../../data/agents';
import { MAPS, simulateMatch } from '../../sim/matchSim';
import { createRNG } from '../../utils/random';
import { PlayerAvatar, InlineFlag } from './PlayerAvatar';
import { AppModal, type ModalConfig } from './PromptModal';
import './SandboxPage.css';

interface SandboxSlot {
  player: Player | null;
  agents: Record<string, string>;
  ovrOverride?: number; // manual ovr tweak, falls back to player.overall
}

interface PresetMeta {
  teamName: string;
  logo: string;
  event: string;
  result: 'winner' | 'runner-up' | 'current';
  abbreviation?: string;
  teamId?: string;
}

interface SandboxTeam {
  slots: SandboxSlot[];
  iglIdx: number | null;
  preset: PresetMeta | null;
  abbrOverride: string;
  logoOverride: string;
}

const EMPTY_TEAM = (): SandboxTeam => ({
  slots: Array.from({ length: 5 }, () => ({ player: null, agents: {} })),
  iglIdx: null,
  preset: null,
  abbrOverride: '',
  logoOverride: '',
});

const SIDE_DEFAULTS: Record<'a' | 'b', { label: string; abbr: string }> = {
  a: { label: 'Red', abbr: 'RED' },
  b: { label: 'Blue', abbr: 'BLUE' },
};

const FORMAT_OPTIONS: { value: MatchFormat; label: string; maps: number }[] = [
  { value: 'bo1', label: 'BO1', maps: 1 },
  { value: 'bo3', label: 'BO3', maps: 3 },
  { value: 'bo5', label: 'BO5', maps: 5 },
];

const REGION_FILTERS: { value: Region | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'americas', label: 'Americas' },
  { value: 'emea', label: 'EMEA' },
  { value: 'pacific', label: 'Pacific' },
  { value: 'china', label: 'China' },
];

const ROLE_FILTERS: { value: Role | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'duelist', label: 'Duelist' },
  { value: 'controller', label: 'Controller' },
  { value: 'initiator', label: 'Initiator' },
  { value: 'sentinel', label: 'Sentinel' },
  { value: 'flex', label: 'Flex' },
];

interface PickerTarget {
  side: 'a' | 'b';
  slotIdx: number;
}

export interface SandboxConfig {
  teamA: SandboxTeam;
  teamB: SandboxTeam;
  format: MatchFormat;
  selectedMaps: string[];
  activeMapTab: number;
}

export const EMPTY_SANDBOX_CONFIG = (): SandboxConfig => ({
  teamA: EMPTY_TEAM(),
  teamB: EMPTY_TEAM(),
  format: 'bo3',
  selectedMaps: [],
  activeMapTab: 0,
});

export interface SandboxPreset {
  id: string;
  name: string;
  logo: string;
  abbreviation: string;
  playerIds: string[];
  ovrOverrides: Record<string, number>; // playerId → ovr
  iglIdx: number | null;
  agents: Record<string, Record<string, string>>; // playerId → map → agentId
  teamId?: string; // source team id for write-back
}

interface SandboxPageProps {
  gameState: GameState;
  onNavigate: (view: string, teamId?: string) => void;
  onSimulate: (match: MatchResult, homeTeam: Team, awayTeam: Team) => void;
  config: SandboxConfig;
  onConfigChange: (config: SandboxConfig) => void;
  onUpdateGameState?: (gs: GameState) => void;
}

export function SandboxPage({ gameState, onNavigate, onSimulate, config, onConfigChange, onUpdateGameState }: SandboxPageProps) {
  const [teamA, setTeamA] = useState<SandboxTeam>(config.teamA);
  const [teamB, setTeamB] = useState<SandboxTeam>(config.teamB);
  const [format, setFormat] = useState<MatchFormat>(config.format);
  const [selectedMaps, setSelectedMaps] = useState<string[]>(config.selectedMaps);
  const [activeMapTab, setActiveMapTab] = useState(config.activeMapTab);
  const [compMap, setCompMap] = useState<string | null>(null);

  // sync config back to parent so it persists across view changes
  useEffect(() => {
    onConfigChange({ teamA, teamB, format, selectedMaps, activeMapTab });
  }, [teamA, teamB, format, selectedMaps, activeMapTab]);

  // picker state
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerRegion, setPickerRegion] = useState<Region | 'all'>('all');
  const [pickerRole, setPickerRole] = useState<Role | 'all'>('all');
  const [rosterPopup, setRosterPopup] = useState<'a' | 'b' | null>(null);
  const [logoInputOpen, setLogoInputOpen] = useState<'a' | 'b' | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [agentPicker, setAgentPicker] = useState<{ side: 'a' | 'b'; slot: number } | null>(null);
  const [copyPopup, setCopyPopup] = useState<'a' | 'b' | null>(null);
  const [editingPreset, setEditingPreset] = useState<{ id: string; name: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<ModalConfig | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const agentBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const rosterBtnRefA = useRef<HTMLButtonElement>(null);
  const rosterBtnRefB = useRef<HTMLButtonElement>(null);

  // combined agent list: static + custom
  const allAgentsList = useMemo(() => {
    const custom = (gameState as any).customAgents as Array<{ id: string; displayName: string; role: string; icon?: string }> | undefined;
    const base = AGENTS.map(a => ({ id: a.id, displayName: a.displayName, role: a.role as string, icon: undefined as string | undefined }));
    const baseIds = new Set(base.map(a => a.id));
    const extra = (custom || []).filter(a => !baseIds.has(a.id)).map(a => ({ id: a.id, displayName: a.displayName, role: a.role, icon: a.icon }));
    return [...base, ...extra];
  }, [gameState]);

  const getAgentIcon = (agentId: string) => {
    const legacyIcons: string[] = (gameState as any).legacyAgentIcons ?? [];
    const custom = allAgentsList.find(a => a.id === agentId);
    if (custom?.icon) return `/logos/agents/${custom.icon}`;
    const legacyMap: Record<string, string> = { gekko: 'gekko_old.webp', harbor: 'harbor_old.webp', fade: 'fade_old.webp' };
    if (legacyIcons.includes(agentId) && legacyMap[agentId]) return `/logos/agents/${legacyMap[agentId]}`;
    return `/logos/agents/${agentId.toLowerCase()}.png`;
  };

  const getAgentName = (agentId: string) => {
    const found = allAgentsList.find(a => a.id === agentId);
    return found?.displayName || agentId;
  };

  useEffect(() => {
    if (pickerTarget && searchRef.current) searchRef.current.focus();
  }, [pickerTarget]);

  // auto-dismiss snackbar
  useEffect(() => {
    if (!snackbar) return;
    const t = setTimeout(() => setSnackbar(null), 2000);
    return () => clearTimeout(t);
  }, [snackbar]);

  // close popups on scroll outside the popup container
  const rosterPopupRef = useRef<HTMLDivElement>(null);
  const agentPopupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!rosterPopup && !agentPicker) return;
    const close = (e: Event) => {
      // ignore scrolls inside the popup itself
      if (rosterPopupRef.current?.contains(e.target as Node)) return;
      if (agentPopupRef.current?.contains(e.target as Node)) return;
      setRosterPopup(null);
      setEditingPreset(null);
      setAgentPicker(null);
    };
    document.addEventListener('scroll', close, true);
    return () => document.removeEventListener('scroll', close, true);
  }, [rosterPopup, agentPicker]);

  const mapsNeeded = FORMAT_OPTIONS.find(f => f.value === format)!.maps;

  // player → team lookup
  const playerTeamMap = useMemo(() => {
    const m = new Map<string, { abbr: string; region: Region }>();
    for (const t of gameState.teams) {
      for (const p of t.roster) {
        m.set(p.id, { abbr: t.abbreviation, region: t.region });
      }
    }
    return m;
  }, [gameState.teams]);

  // all players
  const allPlayers = useMemo(() => {
    const roster: Player[] = [];
    for (const t of gameState.teams) {
      for (const p of t.roster) roster.push(p);
    }
    return [...roster, ...(gameState.freeAgents || [])];
  }, [gameState.teams, gameState.freeAgents]);

  // ids already picked
  const pickedIds = useMemo(() => {
    const s = new Set<string>();
    for (const slot of [...teamA.slots, ...teamB.slots]) {
      if (slot.player) s.add(slot.player.id);
    }
    return s;
  }, [teamA, teamB]);

  // filtered player list for picker
  const filteredPlayers = useMemo(() => {
    const q = pickerSearch.toLowerCase().trim();
    return allPlayers
      .filter(p => {
        if (q && !p.name.toLowerCase().includes(q)) return false;
        if (pickerRole !== 'all' && p.role !== pickerRole) return false;
        if (pickerRegion !== 'all') {
          const info = playerTeamMap.get(p.id);
          if (!info || info.region !== pickerRegion) return false;
        }
        return true;
      })
      .sort((a, b) => b.overall - a.overall);
  }, [allPlayers, pickerSearch, pickerRegion, pickerRole, playerTeamMap]);

  // build historical team presets from seasonHistory
  interface HistoryPreset {
    label: string;
    playerIds: string[];
    iglId: string | null;
    group: 'current' | 'history';
    teamName: string;
    logo: string;
    event: string; // e.g. "Masters Reykjavik 2021"
    result: 'winner' | 'runner-up' | 'current';
    playerOvrs: Record<string, number>; // playerId → snapshot ovr
    abbreviation?: string;
    teamId?: string;
  }

  const historyPresets = useMemo(() => {
    const presets: HistoryPreset[] = [];
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    const sandboxIgls: Record<string, string> = (gameState as any).sandboxIgls ?? {};

    // current franchise rosters
    for (const t of gameState.teams) {
      const starters = t.startingLineup?.map(s => s.playerId) || t.roster.slice(0, 5).map(p => p.id);
      if (starters.length >= 3) {
        presets.push({
          label: t.name,
          playerIds: starters.slice(0, 5),
          iglId: t.iglId,
          group: 'current',
          teamName: t.name,
          logo: t.logo || '',
          event: '',
          result: 'current',
          playerOvrs: {},
          abbreviation: t.abbreviation,
          teamId: t.id,
        });
      }
    }

    // historical event rosters (sorted to match history tab order)
    const sorted = [...(gameState.seasonHistory || [])].sort((a, b) => {
      const ai = a.sortIndex ?? null;
      const bi = b.sortIndex ?? null;
      if (ai !== null && bi !== null) return ai - bi;
      if (a.year !== b.year) return a.year - b.year;
      if (ai !== null && bi === null) return -1;
      if (ai === null && bi !== null) return 1;
      const typeOrd: Record<string, number> = { masters: 0, champions: 1 };
      return (typeOrd[a.tournamentType || 'champions'] ?? 0) - (typeOrd[b.tournamentType || 'champions'] ?? 0);
    });
    for (const entry of sorted) {
      const yr = String(entry.year);
      const eventLabel = entry.eventName
        ? (entry.eventName.includes(yr) ? entry.eventName : `${entry.eventName} ${yr}`)
        : yr;

      const resolveIds = (roster: Array<{ playerId: string; playerName: string }>) =>
        roster.map(r => {
          if (r.playerId) return r.playerId;
          const byName = allPlayers.find(p => p.name.toLowerCase() === r.playerName.toLowerCase());
          return byName?.id || '';
        }).filter(Boolean).slice(0, 5);

      // resolve a single roster entry's ID (same fallback as resolveIds)
      const resolveId = (r: { playerId: string; playerName: string }) => {
        if (r.playerId) return r.playerId;
        return allPlayers.find(p => p.name.toLowerCase() === r.playerName.toLowerCase())?.id || null;
      };

      // build playerId → ovr map from roster entries that have ovr set
      const buildOvrMap = (roster: Array<{ playerId: string; playerName: string; ovr?: number }>) => {
        const map: Record<string, number> = {};
        for (const r of roster) {
          if (!r.ovr) continue;
          const id = r.playerId || allPlayers.find(p => p.name.toLowerCase() === r.playerName.toLowerCase())?.id;
          if (id) map[id] = r.ovr;
        }
        return map;
      };

      if (entry.championRoster?.length) {
        const team = gameState.teams.find(t => t.id === entry.worldChampionId);
        const teamName = team?.name || entry.worldChampionCustom?.name || 'Champion';
        const logo = team?.logo || entry.worldChampionCustom?.logo || '';
        const ids = resolveIds(entry.championRoster);
        const igl = entry.championRoster.find(r => r.isIGL);
        const abbr = team?.abbreviation || entry.worldChampionCustom?.abbreviation;
        const histId = `hist__${entry.id || eventLabel}__winner`;
        // igl fallback: roster isIGL → saved sandbox igl → current team igl
        const iglId = igl ? resolveId(igl)
          : sandboxIgls[histId]
            || (team?.iglId && ids.includes(team.iglId) ? team.iglId : null);
        presets.push({
          label: `${teamName} — ${eventLabel} (Winner)`,
          playerIds: ids,
          iglId,
          group: 'history',
          teamName,
          logo,
          event: eventLabel,
          result: 'winner',
          playerOvrs: buildOvrMap(entry.championRoster),
          abbreviation: abbr,
          teamId: histId,
        });
      }

      if (entry.runnerUpRoster?.length) {
        const team = gameState.teams.find(t => t.id === entry.runnerUpId);
        const teamName = team?.name || entry.runnerUpCustom?.name || 'Runner-Up';
        const logo = team?.logo || entry.runnerUpCustom?.logo || '';
        const ids = resolveIds(entry.runnerUpRoster);
        const igl = entry.runnerUpRoster.find(r => r.isIGL);
        const abbr = team?.abbreviation || entry.runnerUpCustom?.abbreviation;
        const histId = `hist__${entry.id || eventLabel}__runner-up`;
        const iglId = igl ? resolveId(igl)
          : sandboxIgls[histId]
            || (team?.iglId && ids.includes(team.iglId) ? team.iglId : null);
        presets.push({
          label: `${teamName} — ${eventLabel} (Runner-Up)`,
          playerIds: ids,
          iglId,
          group: 'history',
          teamName,
          logo,
          event: eventLabel,
          result: 'runner-up',
          playerOvrs: buildOvrMap(entry.runnerUpRoster),
          abbreviation: abbr,
          teamId: histId,
        });
      }
    }

    return presets;
  }, [gameState.seasonHistory, gameState.teams, allPlayers, (gameState as any).sandboxIgls]);

  // build a stub Player for history roster entries where the real player was retired/culled
  const buildStubPlayer = (rosterId: string, entry?: { playerName: string; nationality?: string; isIGL?: boolean }): Player => ({
    id: rosterId,
    name: entry?.playerName || rosterId,
    age: 25,
    role: 'flex',
    background: 'unknown_talent',
    archetype: 'entry_fragger',
    ratings: { aim: 70, sprayControl: 70, gameSense: 70, utilityUsage: 70, clutchFactor: 70, communication: 70 },
    potential: { ceiling: 80, floor: 60 },
    overall: 70,
    consistency: 65,
    development: { peakAge: 23, volatility: 0.3, learningRate: 0.3 },
    personality: { leadership: 50, coachability: 50, workEthic: 50, mentality: 50, teamPlayer: 50 },
    contract: null,
    agentPool: {},
    draftYear: null,
    draftPick: null,
    yearsInLeague: 3,
    retired: true,
    nationality: entry?.nationality,
    isIGL: entry?.isIGL,
  });

  // load a history preset into a team side
  const loadPreset = (side: 'a' | 'b', preset: HistoryPreset) => {
    const playerById = new Map(allPlayers.map(p => [p.id, p]));

    // find roster entries from history for stub building
    const histRosters = new Map<string, { playerName: string; nationality?: string; isIGL?: boolean }>();
    for (const entry of gameState.seasonHistory || []) {
      for (const r of [...(entry.championRoster || []), ...(entry.runnerUpRoster || [])]) {
        if (!histRosters.has(r.playerId)) histRosters.set(r.playerId, r);
      }
    }

    // pull existing agents from teamMapComps for current rosters
    const teamComps = preset.teamId ? (gameState.teamMapComps ?? {})[preset.teamId] ?? {} : {};

    const set = side === 'a' ? setTeamA : setTeamB;
    set(() => {
      const slots: SandboxSlot[] = Array.from({ length: 5 }, (_, i) => {
        const id = preset.playerIds[i];
        if (!id) return { player: null, agents: {} };
        // try id lookup, then name lookup from history, then stub
        let player = playerById.get(id);
        if (!player) {
          const hist = histRosters.get(id);
          if (hist) player = allPlayers.find(p => p.name.toLowerCase() === hist.playerName.toLowerCase()) || buildStubPlayer(id, hist);
          else player = buildStubPlayer(id);
        }
        // cascade: historical ovr → current ovr
        const snapOvr = preset.playerOvrs[id];
        // populate agents from teamMapComps: map → agentId
        const agents: Record<string, string> = {};
        for (const [map, comps] of Object.entries(teamComps)) {
          if (comps[id]) agents[map] = comps[id];
        }
        return { player, agents, ovrOverride: snapOvr };
      });
      const iglIdx = preset.iglId
        ? preset.playerIds.findIndex(id => id === preset.iglId)
        : null;
      return {
        slots,
        iglIdx: iglIdx !== null && iglIdx >= 0 ? iglIdx : null,
        preset: {
          teamName: preset.teamName,
          logo: preset.logo,
          event: preset.event,
          result: preset.result,
          abbreviation: preset.abbreviation,
          teamId: preset.teamId,
        },
        abbrOverride: preset.abbreviation || '',
        logoOverride: '',
      };
    });
  };

  const slotOvr = (s: SandboxSlot) => s.ovrOverride ?? s.player?.overall ?? 0;

  const avgOvr = (team: SandboxTeam) => {
    const filled = team.slots.filter(s => s.player);
    if (!filled.length) return '—';
    return Math.round(filled.reduce((a, s) => a + slotOvr(s), 0) / filled.length);
  };

  const teamFull = (team: SandboxTeam) => team.slots.every(s => s.player);
  const bothReady = teamFull(teamA) && teamFull(teamB) && selectedMaps.length === mapsNeeded;

  const openPicker = (side: 'a' | 'b', slotIdx: number) => {
    setPickerTarget({ side, slotIdx });
    setPickerSearch('');
    setPickerRegion('all');
    setPickerRole('all');
  };

  const pickPlayer = (player: Player) => {
    if (!pickerTarget) return;
    const set = pickerTarget.side === 'a' ? setTeamA : setTeamB;
    set(prev => {
      const next = { ...prev, slots: [...prev.slots] };
      next.slots[pickerTarget.slotIdx] = { player, agents: {} };
      return next;
    });
    setPickerTarget(null);
  };

  const removePlayer = (side: 'a' | 'b', idx: number) => {
    const set = side === 'a' ? setTeamA : setTeamB;
    set(prev => {
      const next = { ...prev, slots: [...prev.slots] };
      next.slots[idx] = { player: null, agents: {} };
      if (next.iglIdx === idx) next.iglIdx = null;
      return next;
    });
  };

  const setSlotOvr = (side: 'a' | 'b', idx: number, val: string) => {
    const num = parseInt(val, 10);
    const set = side === 'a' ? setTeamA : setTeamB;
    set(prev => {
      const next = { ...prev, slots: [...prev.slots] };
      const slot = next.slots[idx];
      if (!slot.player) return prev;
      // clear override if empty or matches original
      if (isNaN(num) || num === slot.player.overall) {
        next.slots[idx] = { ...slot, ovrOverride: undefined };
      } else {
        next.slots[idx] = { ...slot, ovrOverride: Math.max(1, Math.min(99, num)) };
      }
      return next;
    });
  };

  const toggleMap = (map: string) => {
    setSelectedMaps(prev => {
      if (prev.includes(map)) return prev.filter(m => m !== map);
      if (prev.length >= mapsNeeded) return prev;
      return [...prev, map];
    });
  };

  const reorderMaps = (from: number, to: number) => {
    if (from === to) return;
    setSelectedMaps(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const setAgent = (side: 'a' | 'b', slotIdx: number, map: string, agentId: string) => {
    const team = side === 'a' ? teamA : teamB;
    const set = side === 'a' ? setTeamA : setTeamB;
    set(prev => {
      const next = { ...prev, slots: [...prev.slots] };
      next.slots[slotIdx] = {
        ...next.slots[slotIdx],
        agents: { ...next.slots[slotIdx].agents, [map]: agentId },
      };
      // clear empty agent entries
      if (!agentId) delete next.slots[slotIdx].agents[map];
      return next;
    });

    // write back to teamMapComps for current rosters
    const tid = team.preset?.teamId;
    const pid = team.slots[slotIdx]?.player?.id;
    if (tid && pid && onUpdateGameState) {
      const comps = { ...(gameState.teamMapComps ?? {}) };
      comps[tid] = { ...(comps[tid] ?? {}) };
      comps[tid][map] = { ...(comps[tid][map] ?? {}) };
      if (agentId) {
        comps[tid][map][pid] = agentId;
      } else {
        delete comps[tid][map][pid];
      }
      onUpdateGameState({ ...gameState, teamMapComps: comps });
    }
  };

  const copyAgentsFrom = (side: 'a' | 'b', fromMap: string, toMap: string) => {
    if (!fromMap || !toMap || fromMap === toMap) return;
    const team = side === 'a' ? teamA : teamB;
    const set = side === 'a' ? setTeamA : setTeamB;
    set(prev => {
      const next = { ...prev, slots: [...prev.slots] };
      for (let i = 0; i < 5; i++) {
        const agent = next.slots[i].agents[fromMap];
        if (agent) {
          next.slots[i] = {
            ...next.slots[i],
            agents: { ...next.slots[i].agents, [toMap]: agent },
          };
        }
      }
      return next;
    });

    // write back for synced teams
    const tid = team.preset?.teamId;
    if (tid && onUpdateGameState) {
      const comps = { ...(gameState.teamMapComps ?? {}) };
      comps[tid] = { ...(comps[tid] ?? {}) };
      comps[tid][toMap] = { ...(comps[tid][toMap] ?? {}) };
      for (let i = 0; i < 5; i++) {
        const pid = team.slots[i]?.player?.id;
        const agent = team.slots[i]?.agents[fromMap];
        if (pid && agent) comps[tid][toMap][pid] = agent;
      }
      onUpdateGameState({ ...gameState, teamMapComps: comps });
    }
  };

  const copyAgentsFromPrev = (side: 'a' | 'b', toMapIdx: number) => {
    if (toMapIdx === 0) return;
    const prevMap = selectedMaps[toMapIdx - 1];
    const curMap = selectedMaps[toMapIdx];
    if (!prevMap || !curMap) return;
    copyAgentsFrom(side, prevMap, curMap);
  };

  const resetAll = () => {
    setTeamA(EMPTY_TEAM());
    setTeamB(EMPTY_TEAM());
    setSelectedMaps([]);
    setActiveMapTab(0);
  };

  // saved presets (persisted on gameState)
  const savedPresets: SandboxPreset[] = (gameState as any).sandboxPresets ?? [];

  // find saved preset matching current roster
  const findMatchingPreset = (team: SandboxTeam) => {
    const ids = team.slots.map(s => s.player?.id).filter(Boolean).sort();
    if (ids.length < 5) return null;
    return savedPresets.find(p => {
      const pIds = [...p.playerIds].sort();
      return pIds.length === ids.length && pIds.every((id, i) => id === ids[i]);
    }) || null;
  };

  const savePreset = (side: 'a' | 'b') => {
    if (!onUpdateGameState) return;
    const team = side === 'a' ? teamA : teamB;
    if (!team.slots.every(s => s.player)) return;

    const existing = findMatchingPreset(team);

    const buildData = (id: string, name: string): SandboxPreset => ({
      id,
      name,
      logo: team.logoOverride?.trim() || team.preset?.logo || '',
      abbreviation: team.abbrOverride?.trim() || team.preset?.abbreviation || '',
      playerIds: team.slots.map(s => s.player!.id),
      ovrOverrides: Object.fromEntries(
        team.slots.filter(s => s.ovrOverride !== undefined).map((s, i) => [team.slots[i].player!.id, s.ovrOverride!])
      ),
      iglIdx: team.iglIdx,
      agents: Object.fromEntries(
        team.slots
          .filter(s => s.player && Object.keys(s.agents).length > 0)
          .map(s => [s.player!.id, s.agents])
      ),
      teamId: team.preset?.teamId,
    });

    const updated = { ...gameState } as any;
    if (existing) {
      updated.sandboxPresets = savedPresets.map(p =>
        p.id === existing.id ? buildData(existing.id, existing.name) : p
      );
      onUpdateGameState(updated);
      setSnackbar(`Updated "${existing.name}"`);
    } else {
      const name = prompt('Preset name:');
      if (!name?.trim()) return;
      updated.sandboxPresets = [...savedPresets, buildData(
        `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name.trim()
      )];
      onUpdateGameState(updated);
      setSnackbar(`Saved "${name.trim()}"`);
    }
  };

  const deletePreset = (presetId: string) => {
    if (!onUpdateGameState) return;
    const updated = { ...gameState } as any;
    updated.sandboxPresets = savedPresets.filter(p => p.id !== presetId);
    onUpdateGameState(updated);
  };

  const renamePreset = (presetId: string, newName: string) => {
    if (!onUpdateGameState || !newName.trim()) return;
    const updated = { ...gameState } as any;
    updated.sandboxPresets = savedPresets.map(p =>
      p.id === presetId ? { ...p, name: newName.trim() } : p
    );
    onUpdateGameState(updated);
    setEditingPreset(null);
  };

  // persist agents + igl for a synced team (historical or current)
  const saveSync = (side: 'a' | 'b') => {
    if (!onUpdateGameState) return;
    const team = side === 'a' ? teamA : teamB;
    const tid = team.preset?.teamId;
    if (!tid) return;

    const updated = { ...gameState } as any;

    // bulk write agents to teamMapComps
    const comps = { ...(updated.teamMapComps ?? {}) };
    comps[tid] = {};
    for (const slot of team.slots) {
      if (!slot.player) continue;
      for (const [map, agent] of Object.entries(slot.agents)) {
        if (!agent) continue;
        if (!comps[tid][map]) comps[tid][map] = {};
        comps[tid][map][slot.player.id] = agent;
      }
    }
    updated.teamMapComps = comps;

    // persist igl
    const igls = { ...(updated.sandboxIgls ?? {}) };
    const iglPlayer = team.iglIdx !== null ? team.slots[team.iglIdx]?.player : null;
    if (iglPlayer) igls[tid] = iglPlayer.id;
    else delete igls[tid];
    updated.sandboxIgls = igls;

    onUpdateGameState(updated);
    setSnackbar('Saved');
  };

  const loadSavedPreset = (side: 'a' | 'b', preset: SandboxPreset) => {
    const playerById = new Map(allPlayers.map(p => [p.id, p]));

    // find roster entries from history for stub building
    const histRosters = new Map<string, { playerName: string; nationality?: string; isIGL?: boolean }>();
    for (const entry of gameState.seasonHistory || []) {
      for (const r of [...(entry.championRoster || []), ...(entry.runnerUpRoster || [])]) {
        if (!histRosters.has(r.playerId)) histRosters.set(r.playerId, r);
      }
    }

    // detect legacy slot-indexed agents (keys are "0","1",...) vs playerId-keyed
    const agentKeys = Object.keys(preset.agents);
    const isLegacy = agentKeys.length > 0 && agentKeys.every(k => /^\d+$/.test(k) && Number(k) < 10);

    const set = side === 'a' ? setTeamA : setTeamB;
    set(() => {
      const slots: SandboxSlot[] = Array.from({ length: 5 }, (_, i) => {
        const id = preset.playerIds[i];
        if (!id) return { player: null, agents: {} };
        let player = playerById.get(id);
        if (!player) {
          const hist = histRosters.get(id);
          player = hist
            ? allPlayers.find(p => p.name.toLowerCase() === hist.playerName.toLowerCase()) || buildStubPlayer(id, hist)
            : buildStubPlayer(id);
        }
        // resolve agents: legacy uses slot index, new uses playerId
        const agents = isLegacy
          ? (preset.agents[String(i)] || {})
          : (preset.agents[id] || {});
        const ovrOverride = preset.ovrOverrides[id];
        return { player, agents, ovrOverride };
      });
      return {
        slots,
        iglIdx: preset.iglIdx,
        preset: {
          teamName: preset.name,
          logo: preset.logo,
          event: '',
          result: 'current' as const,
          abbreviation: preset.abbreviation,
          teamId: preset.teamId,
        },
        abbrOverride: preset.abbreviation,
        logoOverride: preset.logo || '',
      };
    });
  };

  const changeFormat = (f: MatchFormat) => {
    setFormat(f);
    const needed = FORMAT_OPTIONS.find(o => o.value === f)!.maps;
    setSelectedMaps(prev => prev.slice(0, needed));
    setActiveMapTab(0);
  };

  // build temporary team + run simulation
  const runSimulation = () => {
    if (!bothReady) return;

    // helper: clone player with scaled ratings to hit target OVR
    const cloneWithOvr = (p: Player, targetOvr: number): Player => {
      if (targetOvr === p.overall) return { ...p };
      const delta = targetOvr - p.overall;
      const scale = (v: number) => Math.max(1, Math.min(99, Math.round(v + delta)));
      const ratings: Ratings = {
        aim: scale(p.ratings.aim),
        sprayControl: scale(p.ratings.sprayControl),
        gameSense: scale(p.ratings.gameSense),
        utilityUsage: scale(p.ratings.utilityUsage),
        clutchFactor: scale(p.ratings.clutchFactor),
        communication: scale(p.ratings.communication),
      };
      return { ...p, ratings, overall: targetOvr };
    };

    // build roster arrays with OVR overrides applied
    const buildRoster = (team: SandboxTeam) =>
      team.slots.map(s => cloneWithOvr(s.player!, slotOvr(s)));

    const homeRoster = buildRoster(teamA);
    const awayRoster = buildRoster(teamB);

    // build Team objects
    const makeTeam = (team: SandboxTeam, roster: Player[], id: string, side: 'a' | 'b'): Team => {
      const iglPlayer = team.iglIdx !== null ? roster[team.iglIdx] : null;
      if (iglPlayer) {
        // +1 igl bonus → gs 77
        iglPlayer.ratings = { ...iglPlayer.ratings, gameSense: 77 };
      }

      // abbreviation cascade: manual override → preset abbreviation → side default
      const defaults = SIDE_DEFAULTS[side];
      const name = team.preset?.teamName || defaults.label;
      const abbr = team.abbrOverride?.trim() || team.preset?.abbreviation || defaults.abbr;

      return {
        id,
        name,
        abbreviation: abbr,
        logo: team.logoOverride?.trim() || team.preset?.logo || '',
        region: 'americas' as Region,
        roster,
        startingLineup: roster.map(p => ({ playerId: p.id, assignedRole: 'flex' as Role })),
        iglId: iglPlayer?.id || null,
        staff: { headCoach: null, assistantCoach: null, analyst: null },
        finances: { budget: 0, salaryCommitted: 0, scoutingBudget: 0 },
        attributes: { firepower: 0, utilityDepth: 0, macroPlay: 0, mentalStrength: 0 },
        championships: 0,
        playoffAppearances: 0,
        founded: 2020,
      };
    };

    const homeTeam = makeTeam(teamA, homeRoster, 'sandbox-home', 'a');
    const awayTeam = makeTeam(teamB, awayRoster, 'sandbox-away', 'b');

    // build teamMapComps: teamId → map → playerId → agentId
    const teamMapComps: Record<string, Record<string, Record<string, string>>> = {
      [homeTeam.id]: {},
      [awayTeam.id]: {},
    };
    // build noPenalty: teamId → map → [] (empty = no penalties for anyone)
    const noPenalty: Record<string, Record<string, string[]>> = {
      [homeTeam.id]: {},
      [awayTeam.id]: {},
    };

    for (const map of selectedMaps) {
      teamMapComps[homeTeam.id][map] = {};
      teamMapComps[awayTeam.id][map] = {};
      noPenalty[homeTeam.id][map] = [];
      noPenalty[awayTeam.id][map] = [];

      for (let i = 0; i < 5; i++) {
        const aAgent = teamA.slots[i].agents[map];
        if (aAgent) teamMapComps[homeTeam.id][map][homeRoster[i].id] = aAgent;
        const bAgent = teamB.slots[i].agents[map];
        if (bAgent) teamMapComps[awayTeam.id][map][awayRoster[i].id] = bAgent;
      }
    }

    const rng = createRNG(`sandbox-${Date.now()}`);
    const result = simulateMatch(
      rng,
      homeTeam.id,
      awayTeam.id,
      homeRoster,
      awayRoster,
      format,
      homeTeam.startingLineup,
      awayTeam.startingLineup,
      homeTeam,
      awayTeam,
      false, // isPlayoff
      selectedMaps, // mapPool — exactly the maps we picked
      gameState.agentMeta,
      undefined, // mapMeta
      0, // agentVariance — 0 since we're assigning manually
      teamMapComps,
      null, // userTeamId
      undefined, // agentRoleOverrides
      noPenalty,
      undefined, // teamMapCompBuffs
      undefined, // disabledAgents
      gameState.agentAbilities,
      undefined, // matchSimConfig
    );

    onSimulate(result, homeTeam, awayTeam);
  };

  // all maps: active pool + all standard + custom (even removed ones)
  const activePool: string[] = (gameState as any).mapPool?.length ? (gameState as any).mapPool : MAPS;
  const customNames: string[] = (gameState as any).customMapNames ?? [];
  const mapPool = [...new Set([...activePool, ...MAPS, ...customNames])];

  const renderTeam = (team: SandboxTeam, side: 'a' | 'b') => {
    const set = side === 'a' ? setTeamA : setTeamB;
    const defaults = SIDE_DEFAULTS[side];
    return (
      <div className="sandbox-team">
        <div className="sandbox-team-header">
          <div className="sandbox-team-label">
            <span className="sandbox-team-label-side">{defaults.label}</span>
            <input
              type="text"
              className="sandbox-abbr-input"
              value={team.abbrOverride}
              placeholder={team.preset?.abbreviation || defaults.abbr}
              onChange={e => set(prev => ({ ...prev, abbrOverride: e.target.value.toUpperCase().slice(0, 5) }))}
              title="Team abbreviation"
            />
            {team.preset && (
              <div className="sandbox-team-meta">
                {(team.logoOverride || team.preset.logo) && <img className="sandbox-team-logo" src={team.logoOverride || team.preset.logo} alt="" onError={e => (e.currentTarget.style.display = 'none')} />}
                <span className="sandbox-team-meta-name">{team.preset.teamName}</span>
                {team.preset.event && <span className="sandbox-team-meta-event">{team.preset.event}</span>}
                {team.preset.result !== 'current' && (
                  <span className={`sandbox-team-result-tag ${team.preset.result}`}>
                    {team.preset.result === 'winner' ? '★ Winner' : 'Runner-Up'}
                  </span>
                )}
              </div>
            )}
            {!team.preset && team.logoOverride && (
              <div className="sandbox-team-meta">
                <img className="sandbox-team-logo" src={team.logoOverride} alt="" onError={e => (e.currentTarget.style.display = 'none')} />
              </div>
            )}
          </div>
          <span className="sandbox-team-ovr">AVG {avgOvr(team)}</span>
        </div>
        <div className="sandbox-preset-row">
          <button
            ref={side === 'a' ? rosterBtnRefA : rosterBtnRefB}
            className="sandbox-preset-btn"
            onClick={() => setRosterPopup(rosterPopup === side ? null : side)}
          >
            Load roster…
          </button>
          {team.slots.some(s => s.player) && (
            <button
              className={`sandbox-preset-icon-btn ${logoInputOpen === side ? 'open' : ''}`}
              onClick={() => setLogoInputOpen(logoInputOpen === side ? null : side)}
              title="Set team logo URL"
            >
              {team.logoOverride ? (
                <img src={team.logoOverride} alt="" className="sandbox-logo-toggle-img" onError={e => (e.currentTarget.style.display = 'none')} />
              ) : '🖼'}
            </button>
          )}
          {team.slots.some(s => s.player) && (
            <button
              className="sandbox-preset-icon-btn"
              onClick={() => { set(EMPTY_TEAM()); setLogoInputOpen(prev => prev === side ? null : prev); }}
              title="Clear roster"
            >✕</button>
          )}
          {onUpdateGameState && teamFull(team) && (() => {
            const isSynced = !!team.preset?.teamId;
            if (isSynced) return (
              <button className="sandbox-preset-save-btn" onClick={() => saveSync(side)} title="Save agents & IGL">
                Save
              </button>
            );
            const match = findMatchingPreset(team);
            return (
              <button className="sandbox-preset-save-btn" onClick={() => savePreset(side)} title={match ? `Update "${match.name}"` : 'Save as new preset'}>
                {match ? 'Update' : 'Save'}
              </button>
            );
          })()}
        </div>
        {logoInputOpen === side && team.slots.some(s => s.player) && (
          <div className="sandbox-logo-row">
            <input
              type="text"
              className="sandbox-logo-input"
              value={team.logoOverride}
              placeholder="Logo URL (e.g. /logos/teams/tsm.png)"
              onChange={e => set(prev => ({ ...prev, logoOverride: e.target.value }))}
              autoFocus
            />
            {team.logoOverride && (
              <button className="sandbox-logo-clear" onClick={() => set(prev => ({ ...prev, logoOverride: '' }))}>✕</button>
            )}
          </div>
        )}
        <div className="sandbox-team-body">
          {team.slots.map((slot, i) => (
            <div key={i} className="sandbox-slot" onClick={e => {
              // skip if user was selecting text in the OVR input
              const sel = window.getSelection();
              if (sel && sel.type === 'Range') return;
              if (document.activeElement?.tagName === 'INPUT') return;
              openPicker(side, i);
            }}>
              {slot.player ? (
                <>
                  <button
                    className={`sandbox-slot-igl-btn ${team.iglIdx === i ? 'active' : ''}`}
                    onClick={e => { e.stopPropagation(); set(prev => ({ ...prev, iglIdx: prev.iglIdx === i ? null : i })); }}
                    title={team.iglIdx === i ? 'Remove IGL' : 'Set as IGL'}
                  >
                    {team.iglIdx === i ? '★' : '☆'}
                  </button>
                  <PlayerAvatar
                    playerName={slot.player.name}
                    imageUrl={slot.player.imageUrl}
                    nationality={slot.player.nationality}
                    size="sm"
                  />
                  <div className="sandbox-slot-player">
                    <span className="sandbox-slot-name">{slot.player.name}</span>
                    {team.iglIdx === i && <span className="sandbox-slot-igl">IGL</span>}
                  </div>
                  <input
                    className={`sandbox-slot-ovr-input ${slot.ovrOverride !== undefined ? 'edited' : ''}`}
                    type="number"
                    min={1}
                    max={99}
                    value={slot.ovrOverride ?? slot.player.overall}
                    onClick={e => e.stopPropagation()}
                    onChange={e => { e.stopPropagation(); setSlotOvr(side, i, e.target.value); }}
                    title={slot.ovrOverride !== undefined ? `Original: ${slot.player.overall}` : undefined}
                  />
                  <button
                    className="sandbox-slot-remove"
                    onClick={e => { e.stopPropagation(); removePlayer(side, i); }}
                    title="Remove"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <span className="sandbox-slot-num">{i + 1}</span>
                  <span className="sandbox-slot-empty">Select player…</span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // verified comps: teamId → map → true
  const verifiedComps: Record<string, Record<string, boolean>> = (gameState as any).verifiedComps ?? {};

  const isVerified = (teamId: string | undefined, map: string) =>
    teamId ? !!verifiedComps[teamId]?.[map] : false;

  const toggleVerified = (teamId: string | undefined, map: string) => {
    if (!teamId || !onUpdateGameState) return;
    const updated = { ...gameState } as any;
    const comps = { ...(updated.verifiedComps ?? {}) };
    comps[teamId] = { ...(comps[teamId] ?? {}) };
    if (comps[teamId][map]) delete comps[teamId][map];
    else comps[teamId][map] = true;
    updated.verifiedComps = comps;
    onUpdateGameState(updated);
  };

  const tidA = teamA.preset?.teamId;
  const tidB = teamB.preset?.teamId;

  // maps with at least one agent configured for either team
  const configuredMaps = (map: string) => {
    const aHas = teamA.slots.some(s => s.player && s.agents[map]);
    const bHas = teamB.slots.some(s => s.player && s.agents[map]);
    return aHas || bHas;
  };

  const renderAgentAssignments = () => {
    const hasFilled = teamA.slots.some(s => s.player) || teamB.slots.some(s => s.player);
    if (!hasFilled) return <p className="sandbox-placeholder">Add players to set agent assignments</p>;

    const activeMap = compMap || mapPool[0] || null;
    if (!activeMap) return null;

    // maps that have agents configured (for copy-from list)
    const mapsWithAgents = (side: 'a' | 'b') => {
      const team = side === 'a' ? teamA : teamB;
      return mapPool.filter(m => m !== activeMap && team.slots.some(s => s.player && s.agents[m]));
    };

    const renderSide = (team: SandboxTeam, side: 'a' | 'b', label: string) => {
      const isSynced = !!team.preset?.teamId;
      const copyMaps = mapsWithAgents(side);
      const isCopyOpen = copyPopup === side;
      return (
        <div className="sandbox-comp-side">
          <div className="sandbox-comp-side-header">
            <span>{label}</span>
            {isSynced && <span className="sandbox-agent-synced">synced</span>}
          </div>
          {team.slots.map((slot, i) => {
            if (!slot.player) return null;
            const cur = slot.agents[activeMap] || '';
            const isOpen = agentPicker?.side === side && agentPicker?.slot === i;
            const refKey = `${side}-${i}`;
            return (
              <div key={i} className="sandbox-comp-row">
                <span className="sandbox-comp-player">{slot.player.name}</span>
                <button
                  ref={el => { agentBtnRefs.current[refKey] = el; }}
                  className={`sandbox-agent-btn ${cur ? 'has-agent' : ''} ${isOpen ? 'open' : ''}`}
                  onClick={() => setAgentPicker(isOpen ? null : { side, slot: i })}
                >
                  {cur ? (
                    <>
                      <img src={getAgentIcon(cur)} alt="" className="sandbox-agent-btn-icon" onError={e => (e.currentTarget.style.display = 'none')} />
                      <span className="sandbox-agent-btn-name">{getAgentName(cur)}</span>
                    </>
                  ) : (
                    <span className="sandbox-agent-btn-auto">Auto</span>
                  )}
                  <span className="sandbox-agent-btn-chevron">▼</span>
                </button>
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div className="sandbox-comp-layout">
        <div className="sandbox-comp-sidebar">
          {mapPool.map(m => {
            const isActive = m === activeMap;
            const isInSeries = selectedMaps.includes(m);
            const hasComps = configuredMaps(m);
            const isInactive = !activePool.includes(m);
            // thumbnail summary from both teams
            const aAgents = teamA.slots
              .filter(s => s.player && s.agents[m])
              .map(s => s.agents[m]);
            const bAgents = teamB.slots
              .filter(s => s.player && s.agents[m])
              .map(s => s.agents[m]);
            const thumbs = [...aAgents, ...bAgents];
            return (
              <button
                key={m}
                className={`sandbox-comp-map-btn ${isActive ? 'active' : ''} ${isInSeries ? 'in-series' : ''} ${isInactive ? 'inactive' : ''}`}
                onClick={() => { setCompMap(m); setCopyPopup(null); }}
              >
                <span className="sandbox-comp-map-name">{m}</span>
                {(tidA || tidB) && (
                  <span className="sandbox-comp-verified-wrap">
                    {tidA && (
                      <span
                        className={`sandbox-verified-cb side-a ${isVerified(tidA, m) ? 'checked' : ''}`}
                        title={isVerified(tidA, m) ? 'Red comp verified — click to unverify' : 'Mark Red comp as verified (real data)'}
                        onClick={e => { e.stopPropagation(); toggleVerified(tidA, m); }}
                      >
                        {isVerified(tidA, m) && (
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5.5L4.2 7.5L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                    )}
                    {tidB && (
                      <span
                        className={`sandbox-verified-cb side-b ${isVerified(tidB, m) ? 'checked' : ''}`}
                        title={isVerified(tidB, m) ? 'Blue comp verified — click to unverify' : 'Mark Blue comp as verified (real data)'}
                        onClick={e => { e.stopPropagation(); toggleVerified(tidB, m); }}
                      >
                        {isVerified(tidB, m) && (
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5.5L4.2 7.5L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                    )}
                  </span>
                )}
                {isInSeries && (
                  <span className="sandbox-comp-map-pick">{selectedMaps.indexOf(m) + 1}</span>
                )}
                {thumbs.length > 0 && (
                  <div className="sandbox-comp-map-thumbs">
                    {aAgents.map((a, i) => (
                      <img key={`a${i}`} src={getAgentIcon(a)} alt="" className="sandbox-comp-map-thumb" />
                    ))}
                    {aAgents.length > 0 && bAgents.length > 0 && (
                      <span className="sandbox-comp-map-sep" />
                    )}
                    {bAgents.map((a, i) => (
                      <img key={`b${i}`} src={getAgentIcon(a)} alt="" className="sandbox-comp-map-thumb" />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="sandbox-comp-editor">
          <div className="sandbox-comp-editor-title">{activeMap}</div>
          <div className="sandbox-comp-grid">
            {renderSide(teamA, 'a', SIDE_DEFAULTS.a.label)}
            {renderSide(teamB, 'b', SIDE_DEFAULTS.b.label)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="sandbox-page">
      <div className="sandbox-header">
        <div>
          <span className="sandbox-title">Sandbox</span>
          <span className="sandbox-title-sub">Custom match simulator</span>
        </div>
        <div className="sandbox-format">
          {FORMAT_OPTIONS.map(f => (
            <button
              key={f.value}
              className={`sandbox-format-btn ${format === f.value ? 'active' : ''}`}
              onClick={() => changeFormat(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sandbox-teams">
        {renderTeam(teamA, 'a')}
        <div className="sandbox-vs">VS</div>
        {renderTeam(teamB, 'b')}
      </div>

      <div className="sandbox-section">
        <div className="sandbox-section-header">
          <span>Map Veto</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
            {selectedMaps.length}/{mapsNeeded}
          </span>
        </div>
        <div className="sandbox-section-body">
          {selectedMaps.length > 0 && (
            <div className="sandbox-picks">
              {selectedMaps.map((m, i) => (
                <button
                  key={m}
                  className={`sandbox-pick-chip ${dragIdx === i ? 'dragging' : ''} ${dragOverIdx === i ? 'drag-over' : ''}`}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                  onDrop={() => { if (dragIdx !== null) reorderMaps(dragIdx, i); setDragIdx(null); setDragOverIdx(null); }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  onClick={() => toggleMap(m)}
                >
                  {(isVerified(tidA, m) || isVerified(tidB, m)) && (
                    <span className="sandbox-veto-dots">
                      {isVerified(tidA, m) && <span className="sandbox-veto-dot side-a" />}
                      {isVerified(tidB, m) && <span className="sandbox-veto-dot side-b" />}
                    </span>
                  )}
                  <span className="sandbox-pick-num">{i + 1}</span>
                  <span className="sandbox-pick-name">{m}</span>
                  <span className="sandbox-pick-x">✕</span>
                </button>
              ))}
            </div>
          )}
          <div className="sandbox-maps">
            {mapPool.filter(m => !selectedMaps.includes(m)).map((m: string) => {
              const full = selectedMaps.length >= mapsNeeded;
              const isInactive = !activePool.includes(m);
              return (
                <button
                  key={m}
                  className={`sandbox-map-chip ${full ? 'disabled' : ''} ${isInactive ? 'out-of-pool' : ''}`}
                  onClick={() => toggleMap(m)}
                >
                  {(isVerified(tidA, m) || isVerified(tidB, m)) && (
                    <span className="sandbox-veto-dots">
                      {isVerified(tidA, m) && <span className="sandbox-veto-dot side-a" />}
                      {isVerified(tidB, m) && <span className="sandbox-veto-dot side-b" />}
                    </span>
                  )}
                  {m}
                </button>
              );
            })}
          </div>
          {selectedMaps.length < mapsNeeded && (
            <p className="sandbox-maps-hint">
              Pick {mapsNeeded - selectedMaps.length} more map{mapsNeeded - selectedMaps.length > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      <div className="sandbox-section sandbox-section-comp">
        <div className="sandbox-section-header">Agent Assignments</div>
        <div className="sandbox-section-body sandbox-section-body-comp">
          {renderAgentAssignments()}
        </div>
      </div>

      <div className="sandbox-controls">
        <button className="sandbox-sim-btn" disabled={!bothReady} onClick={runSimulation}>
          Simulate
        </button>
        <button className="sandbox-reset-btn" onClick={resetAll}>Reset All</button>
        <span className="sandbox-status">
          {!teamFull(teamA) && !teamFull(teamB) && 'Fill both rosters to simulate'}
          {teamFull(teamA) && !teamFull(teamB) && 'Team B needs players'}
          {!teamFull(teamA) && teamFull(teamB) && 'Team A needs players'}
          {teamFull(teamA) && teamFull(teamB) && selectedMaps.length < mapsNeeded && `Select ${mapsNeeded - selectedMaps.length} more map${mapsNeeded - selectedMaps.length > 1 ? 's' : ''}`}
          {bothReady && 'Ready to simulate'}
        </span>
      </div>

      {/* agent picker popup (fixed, outside containers) */}
      {agentPicker && (() => {
        const refKey = `${agentPicker.side}-${agentPicker.slot}`;
        const btnEl = agentBtnRefs.current[refKey];
        const team = agentPicker.side === 'a' ? teamA : teamB;
        const map = compMap || mapPool[0] || '';
        if (!map) return null;
        const cur = team.slots[agentPicker.slot]?.agents[map] || '';

        const agentsByRole = new Map<string, typeof allAgentsList>();
        for (const a of allAgentsList) {
          if (!agentsByRole.has(a.role)) agentsByRole.set(a.role, []);
          agentsByRole.get(a.role)!.push(a);
        }
        const roleOrder = ['duelist', 'controller', 'initiator', 'sentinel'];

        const pos = (() => {
          if (!btnEl) return {};
          const rect = btnEl.getBoundingClientRect();
          const popupH = 340;
          const flipUp = rect.bottom + popupH > window.innerHeight;
          return {
            position: 'fixed' as const,
            top: flipUp ? Math.max(8, rect.top - popupH) : rect.bottom + 4,
            left: Math.min(rect.left, window.innerWidth - 230),
            zIndex: 1001,
          };
        })();

        return (
          <>
            <div className="sandbox-agent-popup-backdrop" onClick={() => setAgentPicker(null)} />
            <div ref={agentPopupRef} className="sandbox-agent-popup" style={pos}>
              <button
                className={`sandbox-agent-popup-auto ${!cur ? 'selected' : ''}`}
                onClick={() => { setAgent(agentPicker.side, agentPicker.slot, map, ''); setAgentPicker(null); }}
              >
                Auto
              </button>
              {roleOrder.map(role => {
                const agents = agentsByRole.get(role);
                if (!agents?.length) return null;
                return (
                  <div key={role} className="sandbox-agent-popup-group">
                    <div className={`sandbox-agent-popup-role ${role}`}>{role}</div>
                    <div className="sandbox-agent-popup-icons">
                      {agents.map(a => (
                        <button
                          key={a.id}
                          className={`sandbox-agent-popup-tile ${cur === a.id ? 'selected' : ''}`}
                          onClick={() => { setAgent(agentPicker.side, agentPicker.slot, map, a.id); setAgentPicker(null); }}
                          title={a.displayName}
                        >
                          <img src={getAgentIcon(a.id)} alt="" className="sandbox-agent-popup-icon" onError={e => (e.currentTarget.style.display = 'none')} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* roster preset popup */}
      {rosterPopup && (() => {
        const btnRef = rosterPopup === 'a' ? rosterBtnRefA : rosterBtnRefB;
        const current = historyPresets.filter(p => p.group === 'current');
        const historical = historyPresets.filter(p => p.group === 'history');
        // group historical by event
        const byEvent = new Map<string, typeof historical>();
        for (const p of historical) {
          const key = p.event;
          if (!byEvent.has(key)) byEvent.set(key, []);
          byEvent.get(key)!.push(p);
        }
        return (
          <>
            <div className="sandbox-roster-popup-backdrop" onClick={() => { setRosterPopup(null); setEditingPreset(null); }} />
            <div ref={rosterPopupRef} className="sandbox-roster-popup" style={(() => {
              if (!btnRef.current) return {};
              const rect = btnRef.current.getBoundingClientRect();
              return { position: 'fixed' as const, top: rect.bottom + 6, left: rect.left, zIndex: 1001 };
            })()}>
              {savedPresets.length > 0 && (
                <div className="sandbox-roster-popup-section">
                  <div className="sandbox-roster-popup-label">Saved Presets</div>
                  <div className="sandbox-roster-saved-list">
                    {savedPresets.map(p => {
                      const isEditing = editingPreset?.id === p.id;
                      return isEditing ? (
                        <div key={p.id} className="sandbox-roster-tile saved editing">
                          <input
                            className="sandbox-roster-tile-rename"
                            autoFocus
                            defaultValue={editingPreset.name}
                            onKeyDown={e => {
                              if (e.key === 'Enter') renamePreset(p.id, (e.target as HTMLInputElement).value);
                              if (e.key === 'Escape') setEditingPreset(null);
                            }}
                            onBlur={e => renamePreset(p.id, e.target.value)}
                            onClick={e => e.stopPropagation()}
                          />
                        </div>
                      ) : (
                        <button
                          key={p.id}
                          className="sandbox-roster-tile saved"
                          onClick={() => { loadSavedPreset(rosterPopup, p); setRosterPopup(null); }}
                          title={`${p.name} (${p.playerIds.length}/5)`}
                        >
                          <span className="sandbox-roster-tile-name">{p.name}</span>
                          <button
                            className="sandbox-roster-tile-edit"
                            onClick={e => { e.stopPropagation(); setEditingPreset({ id: p.id, name: p.name }); }}
                            title="Rename preset"
                          >✎</button>
                          <button
                            className="sandbox-roster-tile-delete"
                            onClick={e => {
                              e.stopPropagation();
                              setConfirmModal({
                                kind: 'confirm', title: 'Delete Preset',
                                message: `Are you sure you want to delete "${p.name}"?`,
                                confirmLabel: 'Delete', danger: true,
                                onConfirm: () => { deletePreset(p.id); setConfirmModal(null); },
                                onCancel: () => setConfirmModal(null),
                              });
                            }}
                            title="Delete preset"
                          >✕</button>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {current.length > 0 && (
                <div className="sandbox-roster-popup-section">
                  <div className="sandbox-roster-popup-label">Current Rosters</div>
                  <div className="sandbox-roster-popup-grid">
                    {current.map((p, i) => (
                      <button
                        key={`c-${i}`}
                        className="sandbox-roster-tile"
                        onClick={() => { loadPreset(rosterPopup, p); setRosterPopup(null); }}
                        title={p.teamName}
                      >
                        {p.logo && <img src={p.logo} alt="" className="sandbox-roster-tile-logo" />}
                        <span className="sandbox-roster-tile-abbr">{p.abbreviation || p.teamName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {[...byEvent.entries()].map(([event, presets]) => (
                <div className="sandbox-roster-popup-section" key={event}>
                  <div className="sandbox-roster-popup-label">{event}</div>
                  <div className="sandbox-roster-popup-grid">
                    {presets.map((p, i) => (
                      <button
                        key={`h-${event}-${i}`}
                        className={`sandbox-roster-tile ${p.result}`}
                        onClick={() => { loadPreset(rosterPopup, p); setRosterPopup(null); }}
                        title={`${p.teamName} — ${p.result === 'winner' ? 'Winner' : 'Runner-Up'}`}
                      >
                        {p.logo && <img src={p.logo} alt="" className="sandbox-roster-tile-logo" />}
                        <span className="sandbox-roster-tile-abbr">{p.abbreviation || p.teamName}</span>
                        <span className={`sandbox-roster-tile-tag ${p.result}`}>
                          {p.result === 'winner' ? '★' : '▲'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* player picker modal */}
      {pickerTarget && (
        <div className="sandbox-picker-overlay" onClick={() => setPickerTarget(null)}>
          <div className="sandbox-picker" onClick={e => e.stopPropagation()}>
            <div className="sandbox-picker-header">
              <span className="sandbox-picker-title">
                Select Player — {SIDE_DEFAULTS[pickerTarget.side].label} Slot {pickerTarget.slotIdx + 1}
              </span>
              <button className="sandbox-picker-close" onClick={() => setPickerTarget(null)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="sandbox-picker-filters">
              <input
                ref={searchRef}
                className="sandbox-picker-search"
                type="text"
                placeholder="Search by name…"
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
              />
              <div className="sandbox-picker-filter-row">
                <div className="sandbox-picker-filter-group">
                  {REGION_FILTERS.map(r => (
                    <button
                      key={r.value}
                      className={`sandbox-picker-chip ${pickerRegion === r.value ? 'active' : ''}`}
                      onClick={() => setPickerRegion(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="sandbox-picker-filter-group">
                  {ROLE_FILTERS.map(r => (
                    <button
                      key={r.value}
                      className={`sandbox-picker-chip ${pickerRole === r.value ? 'active' : ''}`}
                      onClick={() => setPickerRole(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sandbox-picker-list-header">
              <span className="sandbox-picker-col-name">Player</span>
              <span className="sandbox-picker-col-role">Role</span>
              <span className="sandbox-picker-col-team">Team</span>
              <span className="sandbox-picker-col-ovr">OVR</span>
            </div>

            <div className="sandbox-picker-list">
              {filteredPlayers.length === 0 && (
                <div className="sandbox-picker-empty">No players match filters</div>
              )}
              {filteredPlayers.map(p => {
                const picked = pickedIds.has(p.id);
                const info = playerTeamMap.get(p.id);
                return (
                  <div
                    key={p.id}
                    className={`sandbox-picker-row ${picked ? 'picked' : ''}`}
                    onClick={() => !picked && pickPlayer(p)}
                  >
                    <div className="sandbox-picker-col-name">
                      {p.nationality && <InlineFlag code={p.nationality} />}
                      <span className="sandbox-picker-player-name">{p.name}</span>
                    </div>
                    <span className={`sandbox-picker-col-role sandbox-slot-role ${p.role}`}>{p.role}</span>
                    <span className="sandbox-picker-col-team">{info?.abbr || 'FA'}</span>
                    <span className="sandbox-picker-col-ovr">{p.overall}</span>
                  </div>
                );
              })}
            </div>

            <div className="sandbox-picker-footer">
              <span className="sandbox-picker-count">{filteredPlayers.length} players</span>
            </div>
          </div>
        </div>
      )}

      {/* snackbar */}
      {snackbar && (
        <div className="sandbox-snackbar">{snackbar}</div>
      )}

      {confirmModal && <AppModal {...confirmModal} />}
    </div>
  );
}
