// src/ui/components/HistoryPage.tsx
import { useState, useMemo, useRef, useEffect } from 'react';
import type { GameState } from '../../sim/gameState';
import type { SeasonHistoryEntry, Region, TournamentType, TournamentStatus } from '../../types';
import { TOURNAMENT_LABELS } from '../../types';
import type { Player, PlayerAwardType } from '../../types/player';
import { PlayerAvatar } from './PlayerAvatar';
import { flagSrc, ALL_COUNTRIES } from './MassPlayerEditor';
import './HistoryPage.css';

const REGION_LABELS: Record<Region, string> = { americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' };
const REGIONS: Region[] = ['americas', 'emea', 'pacific', 'china'];

// tier color for OVR values
function getOvrColor(ovr: number): string {
  if (ovr >= 90) return '#ffd700';
  if (ovr >= 80) return 'var(--accent)';
  if (ovr >= 70) return 'var(--success)';
  if (ovr >= 55) return 'var(--warning)';
  return 'var(--text-muted)';
}

const ROLE_ICONS: Record<string, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

const AWARD_META: Record<string, { label: string; desc: string; scope: 'event' | 'season' }> = {
  clutchKing: { label: 'Clutch King', desc: 'Most clutch round wins across the season', scope: 'season' },
  entryFragger: { label: 'Entry Fragger', desc: 'Highest first kills per map across the season', scope: 'season' },
  bestDuelist: { label: 'Best Duelist', desc: 'Highest ACS among duelists this season', scope: 'season' },
  bestController: { label: 'Best Controller', desc: 'Highest ACS among controllers this season', scope: 'season' },
  bestInitiator: { label: 'Best Initiator', desc: 'Highest ACS among initiators this season', scope: 'season' },
  bestSentinel: { label: 'Best Sentinel', desc: 'Highest ACS among sentinels this season', scope: 'season' },
  finalsMvp: { label: 'Finals MVP', desc: 'Most valuable player of the Grand Finals', scope: 'event' },
  seasonMvp: { label: 'Season MVP', desc: 'Best overall performer across all matches', scope: 'season' },
  rookieOfYear: { label: 'Rookie of the Year', desc: 'Top performer in their first or second year', scope: 'season' },
  tournamentAcsLeader: { label: 'ACS Leader', desc: 'Highest average combat score at the international event', scope: 'event' },
  tournamentKdLeader: { label: 'K/D Leader', desc: 'Best kill/death ratio at the international event', scope: 'event' },
};

interface HistoryPageProps {
  gameState: GameState;
  onNavigateToPlayer?: (playerId: string) => void;
  onNavigateToTeam?: (teamId: string) => void;
  devMode?: boolean;
  onUpdateGameState?: (gs: GameState) => void;
}

// team picker value: either existing team or custom name+logo
interface TeamPickerValue {
  mode: 'existing' | 'custom';
  teamId?: string;
  name?: string;
  logo?: string;
  abbreviation?: string;
}

function TeamPicker({ teams, value, onChange, placeholder }: {
  teams: GameState['teams'];
  value: TeamPickerValue | null;
  onChange: (val: TeamPickerValue | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(value?.mode === 'custom');
  const ref = useRef<HTMLDivElement>(null);

  const selected = value?.mode === 'existing' && value.teamId ? teams.find(t => t.id === value.teamId) : null;
  const filtered = query
    ? teams.filter(t => t.name.toLowerCase().includes(query.toLowerCase()) || t.abbreviation.toLowerCase().includes(query.toLowerCase()))
    : teams;

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (isCustom) {
    return (
      <div className="history-picker" ref={ref}>
        <div className="history-picker-custom">
          <input
            type="text"
            value={value?.name || ''}
            onChange={e => onChange({ mode: 'custom', name: e.target.value, logo: value?.logo || '', abbreviation: value?.abbreviation || '' })}
            placeholder="Team name..."
            className="history-picker-search"
          />
          <input
            type="text"
            value={value?.abbreviation || ''}
            onChange={e => onChange({ mode: 'custom', name: value?.name || '', logo: value?.logo || '', abbreviation: e.target.value.toUpperCase().slice(0, 5) })}
            placeholder="Abbrev (e.g. SEN)"
            className="history-picker-search history-picker-abbr-input"
          />
          <input
            type="text"
            value={value?.logo || ''}
            onChange={e => onChange({ mode: 'custom', name: value?.name || '', logo: e.target.value, abbreviation: value?.abbreviation || '' })}
            placeholder="Logo path (e.g. /logos/teams/loud.png)"
            className="history-picker-search history-picker-logo-input"
          />
          {value?.logo && <img src={value.logo} alt="" className="history-picker-logo-preview" onError={e => (e.currentTarget.style.display = 'none')} />}
        </div>
        <button className="history-picker-toggle" onClick={() => { setIsCustom(false); onChange(null); }}>
          Switch to existing team
        </button>
      </div>
    );
  }

  return (
    <div className="history-picker" ref={ref}>
      <div className="history-picker-input" onClick={() => setIsOpen(true)}>
        {selected ? (
          <span className="history-picker-selected">
            <img src={selected.logo} alt="" className="history-picker-logo" />
            {selected.name}
            <button className="history-picker-clear" onClick={(e) => { e.stopPropagation(); onChange(null); setQuery(''); }}>×</button>
          </span>
        ) : (
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
            placeholder={placeholder || 'Search team...'}
            className="history-picker-search"
          />
        )}
      </div>
      {isOpen && !selected && (
        <div className="history-picker-dropdown">
          <div className="history-picker-option history-picker-custom-opt" onClick={() => { setIsCustom(true); setIsOpen(false); onChange({ mode: 'custom', name: '', logo: '', abbreviation: '' }); }}>
            ✎ Custom team (not in save)
          </div>
          {filtered.length === 0 ? (
            <div className="history-picker-empty">No matching teams</div>
          ) : filtered.slice(0, 12).map(t => (
            <div key={t.id} className="history-picker-option" onClick={() => { onChange({ mode: 'existing', teamId: t.id }); setIsOpen(false); setQuery(''); }}>
              <img src={t.logo} alt="" className="history-picker-logo" />
              <span>{t.name}</span>
              <span className="history-picker-abbr">{t.abbreviation}</span>
            </div>
          ))}
        </div>
      )}
      <button className="history-picker-toggle" onClick={() => { setIsCustom(true); onChange({ mode: 'custom', name: '', logo: '', abbreviation: '' }); }}>
        Team not in save?
      </button>
    </div>
  );
}

// single player picker
function PlayerPicker({ teams, freeAgents, value, onChange, placeholder }: {
  teams: GameState['teams'];
  freeAgents: Player[];
  value: { playerId: string; teamId: string; playerName?: string } | null;
  onChange: (val: { playerId: string; playerName: string; teamId: string } | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allPlayers = useMemo(() => {
    const result: Array<{ player: Player; teamId: string; teamName: string }> = [];
    for (const t of teams) for (const p of t.roster) result.push({ player: p, teamId: t.id, teamName: t.abbreviation });
    for (const p of freeAgents) result.push({ player: p, teamId: '', teamName: 'FA' });
    return result;
  }, [teams, freeAgents]);

  const selected = value?.playerId ? allPlayers.find(e => e.player.id === value.playerId) : null;
  // handle custom (non-existent) player selection
  const isCustomSelected = value && !value.playerId;
  const filtered = query ? allPlayers.filter(e => e.player.name.toLowerCase().includes(query.toLowerCase())) : allPlayers;

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="history-picker" ref={ref}>
      <div className="history-picker-input" onClick={() => setIsOpen(true)}>
        {selected ? (
          <span className="history-picker-selected">
            <PlayerAvatar playerId={selected.player.id} playerName={selected.player.name} imageUrl={selected.player.imageUrl} nationality={selected.player.nationality} size="sm" />
            {selected.player.name}
            <span className="history-picker-abbr">{selected.teamName}</span>
            <button className="history-picker-clear" onClick={(e) => { e.stopPropagation(); onChange(null); setQuery(''); }}>×</button>
          </span>
        ) : isCustomSelected ? (() => {
          // try to match custom player by name
          const matched = allPlayers.find(e => e.player.name.toLowerCase() === (value?.playerName || '').toLowerCase());
          return (
            <span className="history-picker-selected history-picker-selected-custom">
              {matched ? (
                <PlayerAvatar playerId={matched.player.id} playerName={matched.player.name} imageUrl={matched.player.imageUrl} nationality={matched.player.nationality} size="sm" />
              ) : (
                <span className="history-roster-chip-icon">?</span>
              )}
              {value?.playerName || 'Custom'}
              <button className="history-picker-clear" onClick={(e) => { e.stopPropagation(); onChange(null); setQuery(''); }}>×</button>
            </span>
          );
        })() : (
          <input type="text" value={query} onChange={e => { setQuery(e.target.value); setIsOpen(true); }} placeholder={placeholder || 'Search player...'} className="history-picker-search" />
        )}
      </div>
      {isOpen && !selected && !isCustomSelected && (
        <div className="history-picker-dropdown">
          {query.trim() && (
            <div className="history-picker-option history-picker-custom-opt" onClick={() => { onChange({ playerId: '', playerName: query.trim(), teamId: '' }); setIsOpen(false); setQuery(''); }}>
              + Add "{query.trim()}" (not in save)
            </div>
          )}
          {filtered.slice(0, 15).map(e => (
            <div key={e.player.id} className="history-picker-option" onClick={() => { onChange({ playerId: e.player.id, playerName: e.player.name, teamId: e.teamId }); setIsOpen(false); setQuery(''); }}>
              <PlayerAvatar playerId={e.player.id} playerName={e.player.name} imageUrl={e.player.imageUrl} nationality={e.player.nationality} size="sm" />
              <span>{e.player.name}</span>
              <span className="history-picker-abbr">{e.teamName}</span>
            </div>
          ))}
          {!query.trim() && filtered.length === 0 && (
            <div className="history-picker-empty">No players available</div>
          )}
        </div>
      )}
    </div>
  );
}

// inline flag picker for custom roster players
function RosterChipFlag({ nationality, onChange }: { nationality?: string; onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const countries = search
    ? ALL_COUNTRIES.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()))
    : ALL_COUNTRIES;

  return (
    <span className="roster-chip-flag-wrapper" ref={ref}>
      <button className="roster-chip-flag-btn" onClick={() => setIsOpen(!isOpen)} title="Set nationality">
        {nationality ? <img src={flagSrc(nationality)} alt="" className="roster-chip-flag-img" /> : <span className="roster-chip-flag-placeholder">?</span>}
      </button>
      {isOpen && (
        <div className="roster-chip-flag-dropdown">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search country..."
            className="roster-chip-flag-search"
            autoFocus
          />
          <div className="roster-chip-flag-list">
            {nationality && (
              <div className="roster-chip-flag-option" onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}>
                <span className="roster-chip-flag-placeholder">✕</span> Clear flag
              </div>
            )}
            {countries.slice(0, 15).map(c => (
              <div key={c.code} className="roster-chip-flag-option" onClick={() => { onChange(c.code); setIsOpen(false); setSearch(''); }}>
                <img src={flagSrc(c.code)} alt="" className="roster-chip-flag-img" />
                {c.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

// multi-player picker for championship rosters
function RosterPicker({ teams, freeAgents, selected, onChange, label }: {
  teams: GameState['teams'];
  freeAgents: Player[];
  selected: Array<{ playerId: string; playerName: string; nationality?: string; isIGL?: boolean; ovr?: number }>;
  onChange: (val: Array<{ playerId: string; playerName: string; nationality?: string; isIGL?: boolean; ovr?: number }>) => void;
  label: string;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allPlayers = useMemo(() => {
    const result: Array<{ player: Player; teamName: string }> = [];
    for (const t of teams) for (const p of t.roster) result.push({ player: p, teamName: t.abbreviation });
    for (const p of freeAgents) result.push({ player: p, teamName: 'FA' });
    return result;
  }, [teams, freeAgents]);

  const selectedIds = new Set(selected.map(s => s.playerId).filter(Boolean));
  const filtered = (query ? allPlayers.filter(e => e.player.name.toLowerCase().includes(query.toLowerCase())) : allPlayers)
    .filter(e => !selectedIds.has(e.player.id));

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const add = (player: Player) => {
    onChange([...selected, { playerId: player.id, playerName: player.name, nationality: player.nationality, ovr: player.overall }]);
    setQuery('');
  };

  const addCustom = () => {
    if (!query.trim()) return;
    // custom player: empty playerId, just a display name
    onChange([...selected, { playerId: '', playerName: query.trim() }]);
    setQuery('');
    setIsOpen(false);
  };

  const removeAt = (idx: number) => {
    onChange(selected.filter((_, i) => i !== idx));
  };

  const setNationalityAt = (idx: number, nat: string) => {
    onChange(selected.map((s, i) => i === idx ? { ...s, nationality: nat || undefined } : s));
  };

  const setOvrAt = (idx: number, val: string) => {
    const num = parseInt(val, 10);
    onChange(selected.map((s, i) => i === idx ? { ...s, ovr: isNaN(num) ? undefined : Math.max(1, Math.min(99, num)) } : s));
  };

  const toggleIGL = (idx: number) => {
    onChange(selected.map((s, i) => {
      if (i === idx) return { ...s, isIGL: !s.isIGL || undefined };
      // only one IGL per roster — clear others
      return { ...s, isIGL: undefined };
    }));
  };

  return (
    <div className="history-roster-picker" ref={ref}>
      <div className="history-roster-label">{label}</div>
      {selected.length > 0 && (
        <div className="history-roster-chips">
          {selected.map((s, idx) => {
            // resolve: by ID first, then by name match
            const p = s.playerId
              ? allPlayers.find(e => e.player.id === s.playerId)
              : allPlayers.find(e => e.player.name.toLowerCase() === s.playerName.toLowerCase());
            const nat = p ? p.player.nationality : s.nationality;
            const isLinked = !!p;
            return (
              <span key={`${s.playerId || s.playerName}-${idx}`} className={`history-roster-chip ${!s.playerId && !isLinked ? 'history-roster-chip-custom' : ''} ${s.isIGL ? 'history-roster-chip-igl' : ''}`}>
                {p ? (
                  <PlayerAvatar playerId={p.player.id} playerName={s.playerName} imageUrl={p.player.imageUrl} nationality={p.player.nationality} size="sm" />
                ) : (
                  <RosterChipFlag nationality={s.nationality} onChange={val => setNationalityAt(idx, val)} />
                )}
                {s.playerName}
                {s.isIGL && <span className="hx-igl-badge">IGL</span>}
                <button className="history-roster-chip-igl-btn" onClick={() => toggleIGL(idx)} title={s.isIGL ? 'Remove IGL' : 'Set as IGL'}>
                  {s.isIGL ? '★' : '☆'}
                </button>
                <input
                  type="number"
                  className={`history-roster-chip-ovr ${s.ovr !== undefined ? 'has-ovr' : ''}`}
                  value={s.ovr ?? ''}
                  min={1}
                  max={99}
                  placeholder="OVR"
                  onChange={e => setOvrAt(idx, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  title="OVR at this tournament"
                />
                <button className="history-roster-chip-x" onClick={() => removeAt(idx)}>×</button>
              </span>
            );
          })}
        </div>
      )}
      <div className="history-picker" style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={e => { if (e.key === 'Enter' && query.trim()) { e.preventDefault(); addCustom(); } }}
          placeholder="Add player..."
          className="history-picker-search history-roster-input"
        />
        {isOpen && (
          <div className="history-picker-dropdown">
            {query.trim() && (
              <div className="history-picker-option history-picker-custom-opt" onClick={addCustom}>
                + Add "{query.trim()}" (not in save)
              </div>
            )}
            {filtered.slice(0, 10).map(e => (
              <div key={e.player.id} className="history-picker-option" onClick={() => { add(e.player); setIsOpen(false); }}>
                <PlayerAvatar playerId={e.player.id} playerName={e.player.name} imageUrl={e.player.imageUrl} nationality={e.player.nationality} size="sm" />
                <span>{e.player.name}</span>
                <span className="history-picker-abbr">{e.teamName}</span>
              </div>
            ))}
            {!query.trim() && filtered.length === 0 && (
              <div className="history-picker-empty">All players added</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// flag picker for tournament location
function LocationFlagPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = value ? ALL_COUNTRIES.find(c => c.code === value) : null;
  const filtered = query
    ? ALL_COUNTRIES.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.code.toLowerCase().includes(query.toLowerCase()))
    : ALL_COUNTRIES;

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="history-flag-picker" ref={ref}>
      <button className="history-flag-btn" onClick={() => setIsOpen(!isOpen)} type="button">
        {selected ? <img src={flagSrc(selected.code)} alt={selected.name} className="history-flag-img" /> : <span className="history-flag-placeholder">🏳</span>}
      </button>
      {isOpen && (
        <div className="history-flag-dropdown">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search country..."
            className="history-flag-search"
            autoFocus
          />
          <div className="history-flag-list">
            {value && (
              <div className="history-picker-option history-flag-clear-opt" onClick={() => { onChange(''); setIsOpen(false); setQuery(''); }}>
                Clear flag
              </div>
            )}
            {filtered.slice(0, 20).map(c => (
              <div key={c.code} className="history-picker-option" onClick={() => { onChange(c.code); setIsOpen(false); setQuery(''); }}>
                <img src={flagSrc(c.code)} alt="" className="history-flag-img" />
                <span>{c.name}</span>
                <span className="history-picker-abbr">{c.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// assign awards using the manually picked rosters
function assignManualAwards(state: GameState, entry: SeasonHistoryEntry) {
  const year = entry.year;
  const allPlayers = [...state.teams.flatMap(t => t.roster), ...(state.freeAgents || [])];

  const give = (playerId: string, type: PlayerAwardType, detail?: string) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;
    if (!player.awards) player.awards = [];
    if (player.awards.some(a => a.type === type && a.year === year)) return;
    player.awards.push({ type, year, detail });
  };

  // champion roster — use picked players, not current team roster
  if (entry.championRoster) {
    for (const p of entry.championRoster) give(p.playerId, 'world_champion');
  }

  if (entry.finalsMvp) give(entry.finalsMvp.playerId, 'finals_mvp');
  if (entry.seasonMvp) give(entry.seasonMvp.playerId, 'season_mvp');
}

// remove awards for a deleted manual entry
function removeManualAwards(state: GameState, year: number) {
  const allPlayers = [...state.teams.flatMap(t => t.roster), ...(state.freeAgents || [])];
  for (const player of allPlayers) {
    if (player.awards) {
      player.awards = player.awards.filter(a => a.year !== year);
      if (player.awards.length === 0) delete player.awards;
    }
  }
}

export function HistoryPage({ gameState, onNavigateToPlayer, onNavigateToTeam, devMode, onUpdateGameState }: HistoryPageProps) {
  const storedHistory = (gameState.seasonHistory || []).slice();
  const entryKeyOf = (h: SeasonHistoryEntry) => h.id || `${h.year}-${h.tournamentType || 'champions'}-${h.eventName || ''}`;
  const storedKeys = new Set(storedHistory.map(h => entryKeyOf(h)));

  // compute status for each entry based on manual override or game state
  const getStatus = (entry: SeasonHistoryEntry): TournamentStatus => {
    if (entry.manualStatus) return entry.manualStatus;
    const { currentYear, phase } = gameState;
    if (entry.year < currentYear) return 'completed';
    if (entry.year > currentYear) return 'upcoming';
    // entry.year === currentYear
    const type = entry.tournamentType || 'champions';
    const mainEventType = gameState.currentTournamentType || 'champions';
    if (type === mainEventType) {
      // this is the main event of the season
      if (phase === 'international') return 'ongoing';
      if (phase === 'offseason') return 'completed';
      return 'upcoming'; // preseason or kickoff
    }
    // not the main event — treat as side event
    if (phase === 'kickoff_bracket') return 'ongoing';
    if (phase === 'preseason') return 'upcoming';
    return 'completed';
  };

  // generate virtual entries for current season tournaments that don't have entries yet
  const virtualEntries = useMemo(() => {
    const { currentYear, phase } = gameState;
    const tournType = gameState.currentTournamentType || 'champions';
    const entries: SeasonHistoryEntry[] = [];

    // current year main event — show if no entry of this type exists yet for this year
    const hasEntry = storedHistory.some(h => h.year === currentYear && (h.tournamentType || 'champions') === tournType);
    if (!hasEntry && phase !== 'offseason') {
      entries.push({
        id: `virtual-${currentYear}-${tournType}`,
        year: currentYear,
        tournamentType: tournType,
        worldChampionId: null, runnerUpId: null,
        finalsMvp: null, seasonMvp: null, rookieOfYear: null,
        kickoffWinners: { americas: null, emea: null, pacific: null, china: null },
        allVctFirst: [], allVctSecond: [],
        clutchKing: null, entryFragger: null,
        bestDuelist: null, bestController: null, bestInitiator: null, bestSentinel: null,
      });
    }

    return entries;
  }, [gameState.currentYear, gameState.phase, gameState.currentTournamentType, storedHistory]);

  const history = [...storedHistory, ...virtualEntries].sort((a, b) => {
    const ai = a.sortIndex ?? null;
    const bi = b.sortIndex ?? null;
    // both have sortIndex — use it as primary key
    if (ai !== null && bi !== null) return ai - bi;
    // one has sortIndex, one doesn't — the one with sortIndex keeps its position relative to year-based sort
    if (a.year !== b.year) return a.year - b.year;
    // within same year: use sortIndex if present
    if (ai !== null && bi === null) return -1;
    if (ai === null && bi !== null) return 1;
    // fallback: masters before champions
    const typeOrder = { masters: 0, champions: 1 };
    return (typeOrder[a.tournamentType || 'champions'] ?? 0) - (typeOrder[b.tournamentType || 'champions'] ?? 0);
  });

  // most recent entry = last in ascending list
  const mostRecentKey = history.length > 0 ? entryKeyOf(history[history.length - 1]) : null;

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null); // null = adding new, string = editing existing
  const [editYear, setEditYear] = useState<number>(gameState.currentYear - 1);
  const [formTournamentType, setFormTournamentType] = useState<TournamentType>('champions');
  const [formEventName, setFormEventName] = useState('');
  const [formStatus, setFormStatus] = useState<TournamentStatus>('completed');

  // editor form state
  const [formChampion, setFormChampion] = useState<TeamPickerValue | null>(null);
  const [formRunnerUp, setFormRunnerUp] = useState<TeamPickerValue | null>(null);
  const [formFinalsMvp, setFormFinalsMvp] = useState<{ playerId: string; playerName: string; teamId: string } | null>(null);
  const [formLocation, setFormLocation] = useState('');
  const [formLocationFlag, setFormLocationFlag] = useState('');
  const [formDateRange, setFormDateRange] = useState('');
  const [formChampRoster, setFormChampRoster] = useState<Array<{ playerId: string; playerName: string; nationality?: string; isIGL?: boolean; ovr?: number }>>([]);
  const [formRunnerUpRoster, setFormRunnerUpRoster] = useState<Array<{ playerId: string; playerName: string; nationality?: string; isIGL?: boolean; ovr?: number }>>([]);

  const freeAgents = gameState.freeAgents || [];

  const hasChampion = formChampion && (formChampion.mode === 'existing' ? !!formChampion.teamId : !!formChampion.name);
  const canSave = formStatus !== 'completed' || hasChampion; // upcoming/ongoing don't need a champion

  const resetForm = () => {
    setFormChampion(null);
    setFormRunnerUp(null);
    setFormFinalsMvp(null);
    setFormLocation('');
    setFormLocationFlag('');
    setFormDateRange('');
    setFormTournamentType('champions');
    setFormEventName('');
    setFormStatus('upcoming');
    setFormChampRoster([]);
    setFormRunnerUpRoster([]);
    setShowEditor(false);
    setEditingKey(null);
  };

  const handleEditEntry = (entry: SeasonHistoryEntry) => {
    const key = entryKeyOf(entry);
    setEditingKey(key);
    setEditYear(entry.year);
    setFormTournamentType(entry.tournamentType || 'champions');
    setFormEventName(entry.eventName || '');
    setFormStatus(entry.manualStatus || getStatus(entry));
    setFormLocation(entry.location || '');
    setFormLocationFlag(entry.locationFlag || '');
    setFormDateRange(entry.dateRange || '');

    // champion team
    if (entry.worldChampionId) {
      setFormChampion({ mode: 'existing', teamId: entry.worldChampionId });
    } else if (entry.worldChampionCustom?.name) {
      setFormChampion({ mode: 'custom', name: entry.worldChampionCustom.name, logo: entry.worldChampionCustom.logo, abbreviation: entry.worldChampionCustom.abbreviation || '' });
    } else {
      setFormChampion(null);
    }

    // runner-up
    if (entry.runnerUpId) {
      setFormRunnerUp({ mode: 'existing', teamId: entry.runnerUpId });
    } else if (entry.runnerUpCustom?.name) {
      setFormRunnerUp({ mode: 'custom', name: entry.runnerUpCustom.name, logo: entry.runnerUpCustom.logo, abbreviation: entry.runnerUpCustom.abbreviation || '' });
    } else {
      setFormRunnerUp(null);
    }

    // finals mvp
    setFormFinalsMvp(entry.finalsMvp ? { playerId: entry.finalsMvp.playerId, playerName: entry.finalsMvp.playerName, teamId: entry.finalsMvp.teamId } : null);

    // championship roster
    setFormChampRoster(entry.championRoster || []);
    setFormRunnerUpRoster(entry.runnerUpRoster || []);

    setShowEditor(true);
  };

  const handleSaveEntry = () => {
    if (!onUpdateGameState || !canSave) return;

    // Generate or reuse id
    const entryId = editingKey || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const toTeamId = (v: TeamPickerValue | null) => v?.mode === 'existing' ? v.teamId || null : null;
    const toCustom = (v: TeamPickerValue | null) => v?.mode === 'custom' && v.name ? { name: v.name, logo: v.logo || '', abbreviation: v.abbreviation || undefined } : undefined;

    const entry: SeasonHistoryEntry = {
      id: entryId,
      year: editYear,
      isManual: true,
      tournamentType: formTournamentType,
      eventName: formEventName || undefined,
      manualStatus: formStatus,
      location: formLocation || undefined,
      locationFlag: formLocationFlag || undefined,
      dateRange: formDateRange || undefined,
      worldChampionId: toTeamId(formChampion),
      worldChampionCustom: toCustom(formChampion),
      runnerUpId: toTeamId(formRunnerUp),
      runnerUpCustom: toCustom(formRunnerUp),
      finalsMvp: formFinalsMvp ? { playerId: formFinalsMvp.playerId, playerName: formFinalsMvp.playerName, teamId: formFinalsMvp.teamId, avgACS: 0 } : null,
      seasonMvp: null,
      rookieOfYear: null,
      championRoster: formChampRoster.length > 0 ? formChampRoster : undefined,
      runnerUpRoster: formRunnerUpRoster.length > 0 ? formRunnerUpRoster : undefined,
      kickoffWinners: { americas: null, emea: null, pacific: null, china: null },
      allVctFirst: [],
      allVctSecond: [],
      clutchKing: null,
      entryFragger: null,
      bestDuelist: null,
      bestController: null,
      bestInitiator: null,
      bestSentinel: null,
    };

    const updated = { ...gameState };
    if (!updated.seasonHistory) updated.seasonHistory = [];
    // replace in-place if editing, append if new
    if (editingKey) {
      removeManualAwards(updated, editYear);
      const idx = updated.seasonHistory.findIndex(h => entryKeyOf(h) === editingKey);
      if (idx >= 0) {
        updated.seasonHistory = [...updated.seasonHistory];
        updated.seasonHistory[idx] = entry;
      } else {
        updated.seasonHistory.push(entry);
      }
    } else {
      updated.seasonHistory.push(entry);
    }
    assignManualAwards(updated, entry);

    onUpdateGameState(updated);
    resetForm();
  };

  const handleDeleteEntry = (entry: SeasonHistoryEntry) => {
    if (!onUpdateGameState) return;
    const nameParts = [TOURNAMENT_LABELS[entry.tournamentType || 'champions']];
    if (entry.eventName) nameParts.push(entry.eventName);
    nameParts.push(String(entry.year));
    const label = nameParts.join(' ');
    if (!confirm(`Delete ${label} history entry?`)) return;
    const updated = { ...gameState };
    removeManualAwards(updated, entry.year);
    const key = entryKeyOf(entry);
    updated.seasonHistory = (updated.seasonHistory || []).filter(h => entryKeyOf(h) !== key);
    onUpdateGameState(updated);
    if (expandedKey === key) setExpandedKey(null);
  };

  const handleMoveEntry = (entryKey: string, direction: 'up' | 'down') => {
    if (!onUpdateGameState) return;
    const idx = history.findIndex(h => entryKeyOf(h) === entryKey);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= history.length) return;

    // build desired display order by swapping in the current sorted array
    const reordered = [...history];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    // build a key→position map from the desired order
    const posMap = new Map<string, number>();
    reordered.forEach((h, i) => posMap.set(entryKeyOf(h), i));

    // stamp every stored entry with its new sortIndex
    const updated = { ...gameState };
    updated.seasonHistory = (gameState.seasonHistory || []).map(h => {
      const pos = posMap.get(entryKeyOf(h));
      return pos !== undefined ? { ...h, sortIndex: pos } : h;
    });
    onUpdateGameState(updated);
  };

  // rendering helpers
  const findTeam = (teamId: string | null) => teamId ? gameState.teams.find(t => t.id === teamId) : undefined;
  const findTeamByName = (name: string) => gameState.teams.find(t => t.name.toLowerCase() === name.toLowerCase() || t.abbreviation.toLowerCase() === name.toLowerCase());
  const findPlayer = (playerId: string) => [...gameState.teams.flatMap(t => t.roster), ...freeAgents].find(p => p.id === playerId);
  const findPlayerByName = (name: string) => [...gameState.teams.flatMap(t => t.roster), ...freeAgents].find(p => p.name.toLowerCase() === name.toLowerCase());
  // resolve a roster entry: by ID first, then by name match
  const resolvePlayer = (p: { playerId: string; playerName: string }) => p.playerId ? findPlayer(p.playerId) : findPlayerByName(p.playerName);

  const renderTeamCell = (teamId: string | null, custom?: { name: string; logo: string }) => {
    let team = findTeam(teamId);
    // try matching custom team by name if no ID match
    if (!team && custom?.name) team = findTeamByName(custom.name);
    if (team) {
      return (
        <span className="history-team-link" onClick={(e) => { e.stopPropagation(); onNavigateToTeam?.(team!.id); }}>
          <img src={team.logo} alt="" className="history-team-logo-lg" />
          <span>{team.name}</span>
        </span>
      );
    }
    // custom team fallback
    if (custom?.name) {
      return (
        <span className="history-team-link history-team-custom">
          {custom.logo && <img src={custom.logo} alt="" className="history-team-logo-lg" onError={e => (e.currentTarget.style.display = 'none')} />}
          <span>{custom.name}</span>
        </span>
      );
    }
    return <span className="history-empty">—</span>;
  };

  const renderPlayerCell = (info: { playerId: string; playerName: string; teamId: string } | null, opts?: { hideTeam?: boolean }) => {
    if (!info) return <span className="history-empty">—</span>;
    const player = resolvePlayer(info);
    const team = !opts?.hideTeam && info.teamId ? findTeam(info.teamId) : null;
    const pid = player?.id || info.playerId;
    if (!pid) {
      return <span className="history-player-custom">{info.playerName}</span>;
    }
    return (
      <span className="history-player-link" onClick={(e) => { e.stopPropagation(); onNavigateToPlayer?.(pid); }}>
        <PlayerAvatar playerId={player?.id} playerName={info.playerName} imageUrl={player?.imageUrl} nationality={player?.nationality} size="sm" />
        <span className="history-player-name">{info.playerName}</span>
        {team && <img src={team.logo} alt="" className="history-team-logo" />}
      </span>
    );
  };

  const renderAllVctPanel = (entry: SeasonHistoryEntry) => {
    const renderTable = (label: string, players: SeasonHistoryEntry['allVctFirst']) => {
      if (!players.length) return null;
      return (
        <div className="history-allvct-block">
          <div className="history-allvct-label">{label}</div>
          <table className="history-allvct-table">
            <thead><tr><th>Player</th><th>Role</th><th>Avg ACS</th><th>Score</th></tr></thead>
            <tbody>
              {players.map(p => {
                const team = findTeam(p.teamId);
                const player = resolvePlayer(p);
                const pid = player?.id || p.playerId;
                return (
                  <tr key={p.playerId || p.playerName}>
                    <td>
                      <span className="history-player-link" onClick={() => pid && onNavigateToPlayer?.(pid)}>
                        <PlayerAvatar playerId={player?.id} playerName={p.playerName} imageUrl={player?.imageUrl} nationality={player?.nationality} size="sm" />
                        <span className="history-player-name">{p.playerName}</span>
                        {team && <img src={team.logo} alt="" className="history-team-logo" />}
                        {team && <span className="history-abbr">{team.abbreviation}</span>}
                      </span>
                    </td>
                    <td><img src={ROLE_ICONS[p.role] || ROLE_ICONS.flex} alt={p.role} className="hx-role-icon" title={p.role.charAt(0).toUpperCase() + p.role.slice(1)} /></td>
                    <td>{p.avgACS}</td>
                    <td>{p.score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    };
    return (
      <div className="history-allvct-panel">
        {renderTable('All-VCT First Team', entry.allVctFirst)}
        {renderTable('All-VCT Second Team', entry.allVctSecond)}
      </div>
    );
  };

  const renderKickoffPanel = (entry: SeasonHistoryEntry) => (
    <div className="history-kickoff-grid">
      {REGIONS.map(region => (
        <div key={region} className="history-kickoff-item">
          <div className="history-kickoff-region">{REGION_LABELS[region]}</div>
          {renderTeamCell(entry.kickoffWinners[region], entry.kickoffWinnersCustom?.[region] || undefined)}
        </div>
      ))}
    </div>
  );

  const renderAwardRow = (key: string, info: { playerId: string; playerName: string; teamId: string }, stat?: string) => {
    const meta = AWARD_META[key];
    if (!meta) return null;
    const player = resolvePlayer(info);
    const team = info.teamId ? findTeam(info.teamId) : null;
    const pid = player?.id || info.playerId;
    const roleIcon = key.startsWith('best') ? ROLE_ICONS[key.replace('best', '').toLowerCase()] : null;
    return (
      <div className="hx-award-row" key={key} onClick={() => pid && onNavigateToPlayer?.(pid)}>
        <div className="hx-award-row-left">
          <PlayerAvatar playerId={player?.id} playerName={info.playerName} imageUrl={player?.imageUrl} nationality={player?.nationality} size="sm" />
          <div className="hx-award-row-info">
            <div className="hx-award-row-header">
              {roleIcon && <img src={roleIcon} alt="" className="hx-role-icon" />}
              <span className="hx-award-row-label">{meta.label}</span>
              <span className={`hx-award-scope ${meta.scope}`}>{meta.scope === 'event' ? 'Event' : 'Season'}</span>
            </div>
            <span className="hx-award-row-name">{info.playerName}</span>
            {team && <span className="hx-award-row-team"><img src={team.logo} alt="" className="hx-award-row-team-logo" />{team.abbreviation}</span>}
          </div>
        </div>
        <div className="hx-award-row-right">
          {stat && <span className="hx-award-row-stat">{stat}</span>}
          <div className="hx-award-row-desc">{meta.desc}</div>
        </div>
      </div>
    );
  };

  // dev: export/import history
  const importRef = useRef<HTMLInputElement>(null);

  const exportHistory = () => {
    const data = gameState.seasonHistory || [];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valogm-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importHistory = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateGameState) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const entries = JSON.parse(reader.result as string) as SeasonHistoryEntry[];
        if (!Array.isArray(entries)) return;
        // merge: imported entries replace by id, new ones append
        const existing = new Map((gameState.seasonHistory || []).map(h => [h.id || `${h.year}-${h.tournamentType || 'champions'}`, h]));
        for (const entry of entries) {
          const key = entry.id || `${entry.year}-${entry.tournamentType || 'champions'}`;
          existing.set(key, { ...entry, isManual: true });
        }
        onUpdateGameState({ seasonHistory: [...existing.values()] });
      } catch { /* invalid json */ }
    };
    reader.readAsText(file);
    // reset so same file can be re-imported
    e.target.value = '';
  };

  // empty state
  if (history.length === 0 && !devMode) {
    return (
      <>
        <div className="content-header"><h1>League History</h1></div>
        <div className="panel">
          <div className="panel-body" style={{ color: 'var(--text-muted)', padding: 24 }}>
            No completed seasons yet. Finish a season to see history here.
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="history-page">
      <div className="content-header">
        <h1>League History</h1>
        {devMode && (
          <div className="history-header-actions">
            <button className="history-io-btn" onClick={exportHistory} title="Export history as JSON">↓ Export</button>
            <button className="history-io-btn" onClick={() => importRef.current?.click()} title="Import history from JSON">↑ Import</button>
            <input ref={importRef} type="file" accept=".json" onChange={importHistory} style={{ display: 'none' }} />
            <button className="history-add-btn" onClick={() => {
              if (showEditor) { resetForm(); } else { setEditingKey(null); setShowEditor(true); }
            }}>
              {showEditor ? 'Cancel' : '+ Add Year'}
            </button>
          </div>
        )}
      </div>

      {/* editor */}
      {showEditor && devMode && (
        <div className="history-editor panel">
          <div className="panel-header">{editingKey ? 'Edit History Entry' : 'Add Historical Season'}</div>
          <div className="panel-body">
            <div className="history-editor-grid">
              <div className="history-editor-field">
                <label>Year</label>
                <input type="number" value={editYear} onChange={e => setEditYear(Number(e.target.value))} className="history-editor-input" />
              </div>
              <div className="history-editor-field">
                <label>Tournament</label>
                <select value={formTournamentType} onChange={e => setFormTournamentType(e.target.value as TournamentType)} className="history-editor-input">
                  {(Object.entries(TOURNAMENT_LABELS) as [TournamentType, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="history-editor-field">
                <label>Status</label>
                <select value={formStatus} onChange={e => setFormStatus(e.target.value as TournamentStatus)} className="history-editor-input">
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            {/* event info — always shown */}
            <div className="history-editor-grid">
              <div className="history-editor-field">
                <label>Event Name</label>
                <input type="text" value={formEventName} onChange={e => setFormEventName(e.target.value)} placeholder="e.g. Stage 1, Berlin, Reykjavik" className="history-editor-input" />
              </div>
              <div className="history-editor-field">
                <label>Location</label>
                <div className="history-location-editor">
                  <LocationFlagPicker value={formLocationFlag} onChange={setFormLocationFlag} />
                  <input type="text" value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="e.g. Shanghai" className="history-editor-input" />
                </div>
              </div>
              <div className="history-editor-field">
                <label>Date</label>
                <input type="text" value={formDateRange} onChange={e => setFormDateRange(e.target.value)} placeholder="e.g. Sep 24 – Oct 18, 2026" className="history-editor-input" />
              </div>
            </div>

            {/* results — only for completed/ongoing */}
            {formStatus !== 'upcoming' && (
              <>
                <div className="history-editor-section-label">Results</div>
                <div className="history-editor-grid">
                  <div className="history-editor-field">
                    <label>Champion {formStatus === 'completed' && <span className="required">*</span>}</label>
                    <TeamPicker teams={gameState.teams} value={formChampion} onChange={setFormChampion} placeholder="Search champion..." />
                  </div>
                  <div className="history-editor-field">
                    <label>Runner-Up</label>
                    <TeamPicker teams={gameState.teams} value={formRunnerUp} onChange={setFormRunnerUp} placeholder="Search runner-up..." />
                  </div>
                  <div className="history-editor-field">
                    <label>Finals MVP</label>
                    <PlayerPicker teams={gameState.teams} freeAgents={freeAgents} value={formFinalsMvp} onChange={setFormFinalsMvp} placeholder="Search finals MVP..." />
                  </div>
                </div>
              </>
            )}

            {/* championship roster — only for completed */}
            {formStatus === 'completed' && hasChampion && (
              <RosterPicker
                teams={gameState.teams}
                freeAgents={freeAgents}
                selected={formChampRoster}
                onChange={setFormChampRoster}
                label="Championship Roster (players who receive the ring)"
              />
            )}

            {/* runner-up roster */}
            {formStatus === 'completed' && formRunnerUp && (formRunnerUp.mode === 'existing' ? !!formRunnerUp.teamId : !!formRunnerUp.name) && (
              <RosterPicker
                teams={gameState.teams}
                freeAgents={freeAgents}
                selected={formRunnerUpRoster}
                onChange={setFormRunnerUpRoster}
                label="Runner-Up Roster"
              />
            )}

            <div className="history-editor-actions">
              <button className="history-editor-save" onClick={handleSaveEntry} disabled={!canSave}>{editingKey ? 'Update Entry' : 'Save Entry'}</button>
              <button className="history-editor-cancel" onClick={resetForm}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* main table */}
      {(history.length > 0 || showEditor) && (
        <div className="panel">
          <div className="panel-header">Champions & Awards</div>
          <div className="panel-body" style={{ padding: 0 }}>
            {history.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--text-muted)' }}>No entries yet — add one above.</div>
            ) : (
              <table className="history-table">
                <thead>
                  <tr>
                    <th className="history-th-season">Season</th>
                    <th className="history-th-tournament">Tournament</th>
                    <th className="history-th-status">Status</th>
                    <th className="history-th-location">Location</th>
                    <th className="history-th-date">Date</th>
                    <th className="history-th-team">Champion</th>
                    <th className="history-th-team">Runner-Up</th>
                    <th className="history-th-player">Finals MVP</th>
                    {devMode && <th className="history-th-actions"></th>}
                  </tr>
                </thead>
                <tbody>
                  {history.map(entry => {
                    const key = entryKeyOf(entry);
                    const isVirtual = !storedKeys.has(key);
                    const isLatest = key === mostRecentKey;
                    const rowStatus = getStatus(entry);
                    const isExpanded = expandedKey === key;
                    return (
                    <tr
                      key={key}
                      className={`history-row ${isLatest ? 'history-row-latest' : ''} history-row-${rowStatus} ${isExpanded ? 'history-row-expanded' : ''}`}
                      onClick={() => setExpandedKey(isExpanded ? null : key)}
                    >
                      <td className="history-season-cell">
                        <span className={`history-season-btn ${isExpanded ? 'expanded' : ''}`}>
                          {entry.year}
                        </span>
                      </td>
                      <td>
                        <span className={`history-tournament-tag ${entry.tournamentType || 'champions'}`}>
                          {TOURNAMENT_LABELS[entry.tournamentType || 'champions']}
                        </span>
                        {entry.eventName && <div className="history-event-name">{entry.eventName}</div>}
                      </td>
                      <td>
                        {(() => {
                          const status = getStatus(entry);
                          return <span className={`history-status-badge status-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
                        })()}
                      </td>
                      <td className="history-location-cell">
                        <span className="history-location-inner">
                          {entry.locationFlag && <img src={flagSrc(entry.locationFlag)} alt="" className="history-location-flag" />}
                          {entry.location || <span className="history-empty">—</span>}
                        </span>
                      </td>
                      <td className="history-date-cell">{entry.dateRange || <span className="history-empty">—</span>}</td>
                      <td>{renderTeamCell(entry.worldChampionId, entry.worldChampionCustom)}</td>
                      <td>{renderTeamCell(entry.runnerUpId, entry.runnerUpCustom)}</td>
                      <td>{renderPlayerCell(entry.finalsMvp, { hideTeam: true })}</td>
                      {devMode && (
                        <td className="history-actions-cell" onClick={e => e.stopPropagation()}>
                          {(() => {
                            const idx = history.indexOf(entry);
                            const canUp = idx > 0;
                            const canDown = idx < history.length - 1;
                            return (
                              <>
                                <span className="history-move-btns">
                                  <button className="history-move-btn" disabled={!canUp} onClick={() => handleMoveEntry(key, 'up')} title="Move up">▲</button>
                                  <button className="history-move-btn" disabled={!canDown} onClick={() => handleMoveEntry(key, 'down')} title="Move down">▼</button>
                                </span>
                              </>
                            );
                          })()}
                          <button className="history-edit-btn" onClick={() => handleEditEntry(entry)} title="Edit entry">✎</button>
                          {entry.isManual && (
                            <button className="history-delete-btn" onClick={() => handleDeleteEntry(entry)} title="Delete entry">✕</button>
                          )}
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* expanded detail */}
      {expandedKey && (() => {
        const entry = history.find(h => entryKeyOf(h) === expandedKey);
        if (!entry) return null;

        const status = getStatus(entry);
        const tournLabel = TOURNAMENT_LABELS[entry.tournamentType || 'champions'];
        // if eventName already contains the tournament type or year, show it standalone
        const eventTitle = entry.eventName || `${tournLabel} ${entry.year}`;

        const champTeam = findTeam(entry.worldChampionId) || (entry.worldChampionCustom?.name ? findTeamByName(entry.worldChampionCustom.name) : undefined);
        const runnerUpTeam = findTeam(entry.runnerUpId) || (entry.runnerUpCustom?.name ? findTeamByName(entry.runnerUpCustom.name) : undefined);
        const champName = champTeam?.name || entry.worldChampionCustom?.name;
        const champLogo = champTeam?.logo || entry.worldChampionCustom?.logo;
        const runnerUpName = runnerUpTeam?.name || entry.runnerUpCustom?.name;
        const runnerUpLogo = runnerUpTeam?.logo || entry.runnerUpCustom?.logo;

        const champRoster = entry.championRoster || [];
        const runnerUpRoster = entry.runnerUpRoster || [];

        const hasAllVct = entry.allVctFirst.length > 0 || entry.allVctSecond.length > 0;
        const hasKickoff = REGIONS.some(r => entry.kickoffWinners[r] || entry.kickoffWinnersCustom?.[r]);
        const hasSpecialty = entry.clutchKing || entry.entryFragger || entry.bestDuelist || entry.bestController || entry.bestInitiator || entry.bestSentinel || entry.tournamentAcsLeader || entry.tournamentKdLeader;
        const hasMvp = entry.finalsMvp || entry.seasonMvp || entry.rookieOfYear;
        const hasResults = champName || runnerUpName;

        // check if any player in the current roster has been explicitly tagged as IGL
        const rosterHasIGLTag = (roster: typeof champRoster) => roster.some(p => p.isIGL);

        const rosterAvgOvr = (roster: typeof champRoster) => {
          const withOvr = roster.filter(p => p.ovr);
          if (!withOvr.length) return null;
          return Math.round(withOvr.reduce((a, p) => a + (p.ovr || 0), 0) / withOvr.length);
        };

        const renderRosterPlayer = (p: { playerId: string; playerName: string; nationality?: string; isIGL?: boolean; ovr?: number }, idx: number, team?: typeof champTeam, roster?: typeof champRoster, _isRunner?: boolean) => {
          const player = resolvePlayer(p);
          const nat = player?.nationality || p.nationality;
          const pid = player?.id || p.playerId;
          const useTeamFallback = team?.iglId && roster && !rosterHasIGLTag(roster);
          const isIGL = p.isIGL || (useTeamFallback && pid === team.iglId);
          return (
            <div key={`${p.playerId || p.playerName}-${idx}`} className="hx-roster-player" onClick={() => pid && onNavigateToPlayer?.(pid)}>
              <PlayerAvatar playerName={p.playerName} playerId={player?.id} imageUrl={player?.imageUrl} nationality={nat} size="sm" />
              <span className="hx-roster-name">{p.playerName}</span>
              {isIGL && <span className="hx-igl-badge" title="In-Game Leader">IGL</span>}
              {p.ovr && <span className="hx-roster-ovr" style={{ color: getOvrColor(p.ovr) }}>{p.ovr}</span>}
            </div>
          );
        };

        const renderMvpCard = (awardKey: string, info: { playerId: string; playerName: string; teamId: string; avgACS?: number; score?: number } | null, prestige?: boolean) => {
          if (!info) return null;
          const meta = AWARD_META[awardKey];
          const player = resolvePlayer(info);
          const team = info.teamId ? findTeam(info.teamId) : null;
          const pid = player?.id || info.playerId;
          const stat = awardKey === 'finalsMvp' && info.avgACS ? `${info.avgACS} ACS` : info.score ? `Score: ${info.score}` : null;
          return (
            <div className={`hx-award-card ${prestige ? 'hx-award-prestige' : ''}`} onClick={() => pid && onNavigateToPlayer?.(pid)}>
              <div className="hx-award-card-header">
                <div className="hx-award-label">{meta?.label || awardKey}</div>
                {meta && <span className={`hx-award-scope ${meta.scope}`}>{meta.scope === 'event' ? 'Event' : 'Season'}</span>}
              </div>
              <div className="hx-award-player">
                <PlayerAvatar playerName={info.playerName} playerId={player?.id} imageUrl={player?.imageUrl} nationality={player?.nationality} size={prestige ? 'lg' : 'md'} />
                <div className="hx-award-info">
                  <span className="hx-award-name">{info.playerName}</span>
                  {team && (
                    <span className="hx-award-team">
                      <img src={team.logo} alt="" className="hx-award-team-logo" />
                      {team.abbreviation}
                    </span>
                  )}
                  {stat && <span className="hx-award-stat">{stat}</span>}
                </div>
              </div>
              {meta && <div className="hx-award-desc">{meta.desc}</div>}
            </div>
          );
        };

        const renderSide = (
          teamName: string | undefined,
          teamLogo: string | undefined,
          team: typeof champTeam,
          roster: typeof champRoster,
          tag: string,
          tagClass: string,
          sideClass: string,
          isRunner?: boolean
        ) => {
          const avg = rosterAvgOvr(roster);
          const ovrEl = avg !== null ? <span className="hx-side-avg-ovr" style={{ color: getOvrColor(avg) }}>AVG {avg}</span> : null;
          return (
          <div className={`hx-side ${sideClass}`}>
            {teamName ? (
              <>
                {/* logo glow bg */}
                {teamLogo && <img src={teamLogo} alt="" className="hx-side-bg-logo" />}
                <div className="hx-side-header">
                  {isRunner ? (
                    <>{ovrEl}<span className={`hx-side-tag ${tagClass}`}>{tag}</span></>
                  ) : (
                    <><span className={`hx-side-tag ${tagClass}`}>{tag}</span>{ovrEl}</>
                  )}
                </div>
                <div className="hx-side-team" onClick={() => team && onNavigateToTeam?.(team.id)}>
                  {teamLogo && <img src={teamLogo} alt="" className="hx-side-logo" onError={e => (e.currentTarget.style.display = 'none')} />}
                  <span className="hx-side-name">{teamName}</span>
                </div>
                {roster.length > 0 && (
                  <div className="hx-roster">{roster.map((p, i) => renderRosterPlayer(p, i, team ?? undefined, roster, isRunner))}</div>
                )}
              </>
            ) : (
              <div className="hx-side-tbd">TBD</div>
            )}
          </div>
          );
        };

        return (
          <div className="hx-detail" key={expandedKey}>
            {/* banner */}
            <div className="hx-banner">
              <div className="hx-banner-left">
                <span className={`hx-banner-tag ${entry.tournamentType || 'champions'}`}>{tournLabel}</span>
                <div className="hx-banner-title">{eventTitle}</div>
                <div className="hx-banner-meta">
                  {entry.locationFlag && <img src={flagSrc(entry.locationFlag)} alt="" className="hx-banner-flag" />}
                  {entry.location && <span>{entry.location}</span>}
                  {entry.location && entry.dateRange && <span className="hx-banner-sep">•</span>}
                  {entry.dateRange && <span>{entry.dateRange}</span>}
                </div>
              </div>
              <span className={`history-status-badge status-${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </div>

            {/* grand finals + awards side by side */}
            {hasResults && (
              <div className="hx-hero-row">
                {/* awards column */}
                {hasMvp && (
                  <div className="hx-hero-awards">
                    {renderMvpCard('finalsMvp', entry.finalsMvp, true)}
                    {renderMvpCard('seasonMvp', entry.seasonMvp)}
                    {renderMvpCard('rookieOfYear', entry.rookieOfYear)}
                  </div>
                )}
                {/* matchup */}
                <div className="hx-matchup">
                  <div className="hx-matchup-header">
                    <div className="hx-matchup-label">Grand Finals</div>
                    <div className="hx-matchup-decoration"></div>
                  </div>
                  <div className="hx-matchup-teams">
                    {renderSide(champName, champLogo, champTeam, champRoster, 'Champion', 'hx-tag-champ', 'hx-side-champ')}
                    <div className="hx-vs-divider">
                      <div className="hx-vs-line"></div>
                      <span className="hx-vs-text">VS</span>
                      <div className="hx-vs-line"></div>
                    </div>
                    {renderSide(runnerUpName, runnerUpLogo, runnerUpTeam, runnerUpRoster, 'Runner-Up', 'hx-tag-runner', 'hx-side-runner', true)}
                  </div>
                </div>
              </div>
            )}

            {/* awards only (no matchup results) */}
            {!hasResults && hasMvp && (
              <div className="hx-awards-row">
                {renderMvpCard('finalsMvp', entry.finalsMvp, true)}
                {renderMvpCard('seasonMvp', entry.seasonMvp)}
                {renderMvpCard('rookieOfYear', entry.rookieOfYear)}
              </div>
            )}

            {/* All-VCT left + Kickoff/Awards right */}
            {(hasAllVct || hasKickoff || hasSpecialty) && (
              <div className="hx-panels-grid">
                {hasAllVct && (
                  <div className="panel">
                    <div className="panel-header">All-VCT Teams</div>
                    <div className="panel-body" style={{ padding: 0 }}>{renderAllVctPanel(entry)}</div>
                  </div>
                )}
                {(hasKickoff || hasSpecialty) && (
                  <div className="hx-right-stack">
                    {hasKickoff && (
                      <div className="panel">
                        <div className="panel-header">Kickoff Champions</div>
                        <div className="panel-body">{renderKickoffPanel(entry)}</div>
                      </div>
                    )}
                    {hasSpecialty && (
                      <div className="panel">
                        <div className="panel-header">Awards</div>
                        <div className="panel-body" style={{ padding: 0 }}>
                          <div className="hx-season-awards">
                            {/* event awards */}
                            {(entry.tournamentAcsLeader || entry.tournamentKdLeader) && (
                              <>
                                <div className="hx-awards-section-label"><span className="hx-award-scope event">Event</span></div>
                                {entry.tournamentAcsLeader && renderAwardRow('tournamentAcsLeader', entry.tournamentAcsLeader, `${entry.tournamentAcsLeader.avgACS} ACS`)}
                                {entry.tournamentKdLeader && renderAwardRow('tournamentKdLeader', entry.tournamentKdLeader, `${entry.tournamentKdLeader.kd} K/D`)}
                              </>
                            )}
                            {/* season awards */}
                            {(entry.clutchKing || entry.entryFragger || entry.bestDuelist || entry.bestController || entry.bestInitiator || entry.bestSentinel) && (
                              <>
                                <div className="hx-awards-section-label"><span className="hx-award-scope season">Season</span></div>
                                {entry.clutchKing && renderAwardRow('clutchKing', entry.clutchKing, `${entry.clutchKing.count} clutches`)}
                                {entry.entryFragger && renderAwardRow('entryFragger', entry.entryFragger, `${entry.entryFragger.fkPerMap} FK/map`)}
                                {entry.bestDuelist && renderAwardRow('bestDuelist', entry.bestDuelist)}
                                {entry.bestController && renderAwardRow('bestController', entry.bestController)}
                                {entry.bestInitiator && renderAwardRow('bestInitiator', entry.bestInitiator)}
                                {entry.bestSentinel && renderAwardRow('bestSentinel', entry.bestSentinel)}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* upcoming placeholder */}
            {!hasResults && !hasMvp && !hasAllVct && !hasKickoff && !hasSpecialty && (
              <div className="hx-upcoming-note">
                {status === 'upcoming' ? 'Event hasn\'t started yet. Results will appear here once the tournament concludes.'
                  : 'No additional details available for this event.'}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
