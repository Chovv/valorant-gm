// src/ui/components/RealEventPage.tsx
import { useState, useRef, useEffect } from 'react';
import type { GameState } from '../../sim/gameState';
import type { Region } from '../../types';
import type { Team } from '../../types/team';
import { canEditGroups, swapTeamBetweenGroups, generateGroupSchedule } from '../../sim/stageGroupStage';
import { downloadJson, uploadJson } from '../../utils/devToolsIO';
import './RealEventPage.css';

const REGIONS: Region[] = ['americas', 'emea', 'pacific', 'china'];
const REGION_LABELS: Record<Region, string> = {
  americas: '🌎 Americas',
  emea: '🌍 EMEA',
  pacific: '🌏 Pacific',
  china: '🐉 China',
};
const SEED_LABELS = ['1st', '2nd', '3rd'];
const SEED_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

export interface RealEventSlot { teamId: string; seed: number; }
export interface RealEventConfig {
  enabled: boolean;
  slots: RealEventSlot[];
  swissR1?: Array<[string, string]>;
}

interface Props {
  gameState: GameState;
  onUpdateGameState: (gs: GameState) => void;
}

function TeamLogoPopup({
  teams, picked, current, onSelect, onClose, anchorRef,
}: {
  teams: Team[];
  picked: Set<string>;
  current: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const viewH = window.innerHeight;
    const viewW = window.innerWidth;
    const popupW = 260;
    // always show above if anchor is in the lower 40% of the viewport
    const flipUp = rect.bottom > viewH * 0.6;
    const top = flipUp
      ? Math.max(8, rect.top - 200)
      : rect.bottom + 6;
    const left = Math.min(Math.max(8, rect.left - 60), viewW - popupW - 8);
    setPos({ top, left });
  }, []);

  return (
    <>
      <div className="rep-picker-backdrop" onClick={onClose} />
      <div
        className="rep-picker-popup"
        style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1001 }}
        ref={popupRef}
      >
        <button className="rep-picker-clear" onClick={() => onSelect('')}>✕ Clear slot</button>
        <div className="rep-picker-grid">
          {teams.map(t => {
            const isDimmed = picked.has(t.id) && t.id !== current;
            return (
              <button
                key={t.id}
                className={`rep-picker-tile ${t.id === current ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}`}
                onClick={() => !isDimmed && onSelect(t.id)}
                disabled={isDimmed}
                title={isDimmed ? `${t.name} (already in this match)` : t.name}
              >
                <img src={t.logo} alt={t.abbreviation} className="rep-picker-logo" />
                <span className="rep-picker-abbr">{t.abbreviation}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

type ActivePicker =
  | { kind: 'slot'; region: Region; seed: number; ref: React.RefObject<HTMLButtonElement | null> }
  | { kind: 'swiss'; matchupIdx: number; side: 0 | 1; ref: React.RefObject<HTMLButtonElement | null> };

export function RealEventPage({ gameState, onUpdateGameState }: Props) {
  const cfg: RealEventConfig = (gameState as any).realEventConfig ?? { enabled: false, slots: [] };

  const [slots, setSlots] = useState<RealEventSlot[]>(cfg.slots.length ? cfg.slots : []);
  const [swissR1, setSwissR1] = useState<Array<[string, string]>>(cfg.swissR1 ?? [['',''],['',''],['',''],['','']]);
  const [activePicker, setActivePicker] = useState<ActivePicker | null>(null);

  const exportSettings = () => {
    const data = {
      _type: 'real-event',
      slots,
      swissR1,
    };
    downloadJson(data, 'real-event-settings.json');
  };

  const importSettings = async () => {
    try {
      const data = await uploadJson() as any;
      if (data?._type !== 'real-event') return;
      if (Array.isArray(data.slots)) setSlots(data.slots);
      if (Array.isArray(data.swissR1)) setSwissR1(data.swissR1);
    } catch { /* ignore */ }
  };

  // auto-save on every change
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const r1 = swissR1.some(([a, b]) => a || b) ? swissR1 : undefined;
    onUpdateGameState({
      ...(gameState as any),
      realEventConfig: { enabled: cfg.enabled, slots, swissR1: r1 },
    } as GameState);
  }, [slots, swissR1]);

  const slotRefs = useRef<Record<string, React.RefObject<HTMLButtonElement | null>>>({});
  const swissRefs = useRef<Record<string, React.RefObject<HTMLButtonElement | null>>>({});

  const getSlotRef = (region: Region, seed: number) => {
    const key = `${region}-${seed}`;
    if (!slotRefs.current[key]) slotRefs.current[key] = { current: null };
    return slotRefs.current[key];
  };

  const getSwissRef = (idx: number, side: 0 | 1) => {
    const key = `${idx}-${side}`;
    if (!swissRefs.current[key]) swissRefs.current[key] = { current: null };
    return swissRefs.current[key];
  };

  const getSlotTeam = (region: Region, seed: number): Team | null => {
    const slot = slots.find(s => {
      const t = gameState.teams.find(t => t.id === s.teamId);
      return t?.region === region && s.seed === seed;
    });
    return slot ? gameState.teams.find(t => t.id === slot.teamId) ?? null : null;
  };

  const getSlotTeamId = (region: Region, seed: number) => getSlotTeam(region, seed)?.id ?? '';

  const setSlotTeam = (region: Region, seed: number, teamId: string) => {
    setSlots(prev => {
      const filtered = prev.filter(s => {
        const t = gameState.teams.find(t => t.id === s.teamId);
        return !(t?.region === region && s.seed === seed) && !(s.teamId === teamId && teamId !== '');
      });
      if (!teamId) return filtered;
      return [...filtered, { teamId, seed }];
    });
    setActivePicker(null);
  };

  const swissTeams: Team[] = REGIONS.flatMap(r =>
    [2, 3].map(seed => getSlotTeam(r, seed)).filter(Boolean) as Team[]
  );

  const setSwissSlot = (matchupIdx: number, side: 0 | 1, teamId: string) => {
    setSwissR1(prev => {
      const next = prev.map(p => [...p] as [string, string]);
      if (teamId) {
        for (let i = 0; i < 4; i++)
          for (let s = 0; s < 2; s++)
            if (next[i][s] === teamId && !(i === matchupIdx && s === side)) next[i][s] = '';
      }
      next[matchupIdx][side] = teamId;
      return next;
    });
    setActivePicker(null);
  };

  const randomizeSwiss = () => {
    if (swissTeams.length < 8) return;
    const shuffled = [...swissTeams].sort(() => Math.random() - 0.5);
    setSwissR1([
      [shuffled[0].id, shuffled[1].id],
      [shuffled[2].id, shuffled[3].id],
      [shuffled[4].id, shuffled[5].id],
      [shuffled[6].id, shuffled[7].id],
    ]);
  };

  const randomizeTeams = () => {
    // pick 3 random teams per region (1st, 2nd, 3rd seed)
    const newSlots: RealEventSlot[] = [];
    for (const region of REGIONS) {
      const pool = [...gameState.teams.filter(t => t.region === region)].sort(() => Math.random() - 0.5);
      pool.slice(0, 3).forEach((t, i) => newSlots.push({ teamId: t.id, seed: i + 1 }));
    }
    setSlots(newSlots);
    // clear swiss when teams change
    setSwissR1([['',''],['',''],['',''],['','']]);
  };

  const clear = () => {
    setSlots([]);
    setSwissR1([['',''],['',''],['',''],['','']]);
  };

  const pickedIds = new Set(slots.map(s => s.teamId).filter(Boolean));
  const isComplete = REGIONS.every(r => [1, 2, 3].every(seed => !!getSlotTeamId(r, seed)));
  const swissPickedIds = new Set(swissR1.flat().filter(Boolean));
  const swissTeamById = (id: string) => gameState.teams.find(t => t.id === id);

  const toggleSlotPicker = (region: Region, seed: number) => {
    setActivePicker(p =>
      p?.kind === 'slot' && p.region === region && p.seed === seed
        ? null
        : { kind: 'slot', region, seed, ref: getSlotRef(region, seed) }
    );
  };

  const toggleSwissPicker = (idx: number, side: 0 | 1) => {
    setActivePicker(p =>
      p?.kind === 'swiss' && p.matchupIdx === idx && p.side === side
        ? null
        : { kind: 'swiss', matchupIdx: idx, side: side as 0 | 1, ref: getSwissRef(idx, side) }
    );
  };

  return (
    <div className="rep-page">
      <div className="rep-header">
        <div>
          <h1 className="rep-title">Real Event Override</h1>
          <p className="rep-subtitle">Configure the teams and Swiss matchups for the next international event</p>
        </div>
        <div className="rep-header-actions">
          <button className="rep-action-btn" onClick={randomizeTeams} title="Pick 3 random teams per region">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 4h2l2 3-2 3H2" /><path d="M14 4h-2l-2 3 2 3h2" /><line x1="4" y1="7" x2="12" y2="7" />
            </svg>
            Randomize Teams
          </button>
          <button className="rep-action-btn" onClick={randomizeSwiss} disabled={swissTeams.length < 8} title={swissTeams.length < 8 ? 'Fill all team slots first' : 'Randomize Swiss R1 matchups'}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h9l-3-2m0 4l3-2" /><path d="M14 12H5l3 2m0-4l-3 2" />
            </svg>
            Randomize Swiss
          </button>
          <button className="rep-action-btn rep-action-btn--muted" onClick={clear}>Clear all</button>
          <div className="dt-io-btns">
            <button className="dt-io-btn" onClick={exportSettings} title="Export event config">↓ Export</button>
            <button className="dt-io-btn" onClick={importSettings} title="Import event config">↑ Import</button>
          </div>
        </div>
      </div>

      {!isComplete && (
        <div className="rep-warning">
          ⚠ Some team slots are empty — missing teams will fall back to sim qualifiers
        </div>
      )}

      <div className="rep-section-title">Qualified Teams</div>
      <div className="rep-grid">
        {REGIONS.map(region => {
          const regionTeams = gameState.teams.filter(t => t.region === region);
          return (
            <div key={region} className="rep-region-card">
              <div className="rep-region-title">{REGION_LABELS[region]}</div>
              <div className="rep-slots-row">
                {[1, 2, 3].map(seed => {
                  const team = getSlotTeam(region, seed);
                  const isOpen = activePicker?.kind === 'slot' && activePicker.region === region && activePicker.seed === seed;
                  const ref = getSlotRef(region, seed);
                  return (
                    <div key={seed} className="rep-slot-col">
                      <div className="rep-seed-label" style={{ color: SEED_COLORS[seed - 1] }}>
                        {SEED_LABELS[seed - 1]}
                      </div>
                      <button
                        ref={ref as React.RefObject<HTMLButtonElement>}
                        className={`rep-slot ${team ? 'filled' : 'empty'} ${isOpen ? 'open' : ''}`}
                        onClick={() => toggleSlotPicker(region, seed)}
                        title={team ? team.name : `Pick seed ${seed}`}
                      >
                        {team ? (
                          <>
                            <img src={team.logo} alt={team.abbreviation} className="rep-slot-logo" />
                            <span className="rep-slot-abbr">{team.abbreviation}</span>
                          </>
                        ) : (
                          <span className="rep-slot-empty-icon">+</span>
                        )}
                      </button>
                      <div className="rep-slot-note">{seed === 1 ? 'bye' : 'swiss'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rep-section-title">
        Swiss Round 1 Matchups
        <span className="rep-section-hint">optional — leave blank to use default cross-region seeding</span>
      </div>

      {swissTeams.length < 8 ? (
        <div className="rep-warning">Fill all 12 team slots above to configure Swiss matchups</div>
      ) : (
        <div className="rep-swiss-grid">
          {swissR1.map(([aId, bId], idx) => {
            const teamA = aId ? swissTeamById(aId) : null;
            const teamB = bId ? swissTeamById(bId) : null;
            const aOpen = activePicker?.kind === 'swiss' && activePicker.matchupIdx === idx && activePicker.side === 0;
            const bOpen = activePicker?.kind === 'swiss' && activePicker.matchupIdx === idx && activePicker.side === 1;
            const refA = getSwissRef(idx, 0);
            const refB = getSwissRef(idx, 1);
            return (
              <div key={idx} className="rep-swiss-row">
                <span className="rep-swiss-num">{idx + 1}</span>
                <button
                  ref={refA as React.RefObject<HTMLButtonElement>}
                  className={`rep-swiss-slot ${teamA ? 'filled' : 'empty'} ${aOpen ? 'open' : ''}`}
                  onClick={() => toggleSwissPicker(idx, 0)}
                >
                  {teamA ? (
                    <><img src={teamA.logo} alt="" className="rep-swiss-logo" /><span className="rep-swiss-abbr">{teamA.abbreviation}</span></>
                  ) : <span className="rep-swiss-plus">+</span>}
                </button>
                <span className="rep-swiss-vs">vs</span>
                <button
                  ref={refB as React.RefObject<HTMLButtonElement>}
                  className={`rep-swiss-slot ${teamB ? 'filled' : 'empty'} ${bOpen ? 'open' : ''}`}
                  onClick={() => toggleSwissPicker(idx, 1)}
                >
                  {teamB ? (
                    <><img src={teamB.logo} alt="" className="rep-swiss-logo" /><span className="rep-swiss-abbr">{teamB.abbreviation}</span></>
                  ) : <span className="rep-swiss-plus">+</span>}
                </button>
                {(aId || bId) && (
                  <button className="rep-swiss-clear" onClick={() => setSwissR1(prev => { const n = prev.map(p => [...p] as [string,string]); n[idx] = ['','']; return n; })}>✕</button>
                )}
              </div>
            );
          })}
          <p className="rep-swiss-hint">All 8 Swiss teams must appear exactly once. Seed 1 teams (upper bracket bye) are not in the Swiss pool.</p>
        </div>
      )}

      {activePicker && (
        <TeamLogoPopup
          teams={activePicker.kind === 'slot'
            ? gameState.teams.filter(t => t.region === activePicker.region)
            : swissTeams}
          picked={activePicker.kind === 'slot' ? pickedIds : swissPickedIds}
          current={activePicker.kind === 'slot'
            ? getSlotTeamId(activePicker.region, activePicker.seed)
            : swissR1[activePicker.matchupIdx][activePicker.side]}
          onSelect={id => activePicker.kind === 'slot'
            ? setSlotTeam(activePicker.region, activePicker.seed, id)
            : setSwissSlot(activePicker.matchupIdx, activePicker.side, id)}
          onClose={() => setActivePicker(null)}
          anchorRef={activePicker.ref}
        />
      )}

      <p className="rep-footer-note" style={{ marginTop: 20 }}>
        <strong>Seed 1</strong> gets an upper bracket bye · <strong>Seeds 2–3</strong> enter Swiss ·
        Use <strong>📌 Sim to [Event] (Real Teams)</strong> from the Play dropdown to activate
      </p>

      <StageGroupEditor gameState={gameState} onUpdateGameState={onUpdateGameState} />
    </div>
  );
}

// ── stage group editor ──

function StageGroupEditor({ gameState, onUpdateGameState }: { gameState: GameState; onUpdateGameState: (gs: GameState) => void }) {
  const stageNum = (gameState as any).currentStage as 1 | 2 | undefined;
  const stageGroups = (gameState as any).stageGroupStages as Record<Region, Record<number, any>> | undefined;
  const [swapState, setSwapState] = useState<{ region: Region; teamId: string; groupIdx: number } | null>(null);

  // only show if stage groups exist for any region
  const hasAnyGroups = stageGroups && REGIONS.some(r => stageGroups[r]?.[stageNum ?? 1]);
  if (!hasAnyGroups || !stageNum) return null;

  const handleSwap = (region: Region, targetGroupIdx: number, targetTeamId: string) => {
    if (!swapState || swapState.region !== region) return;
    const gs = stageGroups![region]?.[stageNum];
    if (!gs) return;

    if (swapState.groupIdx === targetGroupIdx) {
      // within-group reorder: swap positions in teams[] and standings[]
      const group = gs.groups[targetGroupIdx];
      const srcIdx = group.teams.findIndex((t: any) => t.teamId === swapState.teamId);
      const dstIdx = group.teams.findIndex((t: any) => t.teamId === targetTeamId);
      if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx) { setSwapState(null); return; }

      // swap team entries
      const tmp = group.teams[srcIdx];
      group.teams[srcIdx] = group.teams[dstIdx];
      group.teams[dstIdx] = tmp;

      // swap standings entries
      const srcSt = group.standings.findIndex((s: any) => s.teamId === swapState.teamId);
      const dstSt = group.standings.findIndex((s: any) => s.teamId === targetTeamId);
      if (srcSt !== -1 && dstSt !== -1) {
        const tmpSt = group.standings[srcSt];
        group.standings[srcSt] = group.standings[dstSt];
        group.standings[dstSt] = tmpSt;
      }

      // regenerate schedule for this group
      const rngSeed = `${(gameState as any).seed}-reorder-${Date.now()}`;
      group.schedule = generateGroupSchedule(`${rngSeed}-${group.name.toLowerCase()}`, group);
      for (const m of group.schedule) m.dayOrder = targetGroupIdx;

      onUpdateGameState({ ...gameState } as GameState);
    } else {
      // cross-group swap
      const rngSeed = `${(gameState as any).seed}-swap-${Date.now()}`;
      swapTeamBetweenGroups(gs, swapState.teamId, targetTeamId, rngSeed);
      onUpdateGameState({ ...gameState } as GameState);
    }

    setSwapState(null);
  };

  return (
    <>
      <div className="rep-section-title" style={{ marginTop: 32 }}>
        Stage {stageNum} Group Draw
        <span className="rep-section-hint">click a team, then click another to swap (within or across groups)</span>
      </div>

      {REGIONS.map(region => {
        const gs = stageGroups![region]?.[stageNum];
        if (!gs) return null;
        const editable = canEditGroups(gs);
        const groups = gs.groups as Array<{ name: string; teams: Array<{ teamId: string }>; standings: any[]; schedule: any[] }>;

        return (
          <div key={region} className="rep-region-card" style={{ marginBottom: 12 }}>
            <div className="rep-region-title">
              {REGION_LABELS[region]}
              {!editable && <span className="rep-section-hint" style={{ marginLeft: 8 }}>matches started — locked</span>}
            </div>
            <div className="rep-stage-groups-row">
              {groups.map((group, gi) => {
                // any group is a target when a swap is active for this region
                const isTarget = editable && swapState?.region === region && swapState.groupIdx !== undefined;

                return (
                  <div key={group.name} className={`rep-stage-group ${isTarget ? 'rep-stage-group-target' : ''}`}>
                    <div className="rep-stage-group-label">{group.name}</div>
                    <div className="rep-stage-group-teams">
                      {group.teams.map(t => {
                        const team = gameState.teams.find(tm => tm.id === t.teamId);
                        if (!team) return null;
                        const isActive = swapState?.teamId === t.teamId;
                        // clickable as swap target: swap is active, this isn't the active team, same region
                        const isSwapTarget = isTarget && !isActive;

                        return (
                          <button
                            key={t.teamId}
                            className={`rep-slot filled ${isActive ? 'open' : ''} ${isSwapTarget ? 'rep-slot-swap-target' : ''}`}
                            disabled={!editable}
                            onClick={() => {
                              if (!editable) return;
                              if (isSwapTarget) {
                                handleSwap(region, gi, t.teamId);
                              } else if (isActive) {
                                setSwapState(null);
                              } else {
                                setSwapState({ region, teamId: t.teamId, groupIdx: gi });
                              }
                            }}
                            title={isSwapTarget ? `Swap with ${team.abbreviation}` : team.name}
                          >
                            <img src={team.logo} alt={team.abbreviation} className="rep-slot-logo" />
                            <span className="rep-slot-abbr">{team.abbreviation}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {editable && <SchedulePreview gs={gs} region={region} gameState={gameState} onUpdateGameState={onUpdateGameState} />}
          </div>
        );
      })}

      {swapState && (
        <p className="rep-footer-note">
          Selected <strong>{gameState.teams.find(t => t.id === swapState.teamId)?.abbreviation}</strong> — click a team in the other group to swap
        </p>
      )}
    </>
  );
}

// ── schedule editor sub-component ──

function SchedulePreview({ gs, region, gameState, onUpdateGameState }: {
  gs: any;
  region: Region;
  gameState: GameState;
  onUpdateGameState: (gs: GameState) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const editable = gs.groups.every((g: any) => g.schedule.every((m: any) => !m.played));
  const getTeam = (id: string) => gameState.teams.find(t => t.id === id);

  const [picker, setPicker] = useState<{ groupIdx: number; matchIdx: number; side: 'home' | 'away' } | null>(null);
  const [dragSrc, setDragSrc] = useState<{ gi: number; mi: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ gi: number; mi: number } | null>(null);
  const pickerRefs = useRef<Record<string, React.RefObject<HTMLButtonElement | null>>>({});
  const getRef = (gi: number, mi: number, side: string) => {
    const key = `${gi}-${mi}-${side}`;
    if (!pickerRefs.current[key]) pickerRefs.current[key] = { current: null };
    return pickerRefs.current[key];
  };

  const save = () => {
    // force fresh references so React detects nested changes
    const updated = { ...gameState } as any;
    updated.stageGroupStages = { ...updated.stageGroupStages };
    updated.stageGroupStages[region] = { ...updated.stageGroupStages[region] };
    const stageNum = (gameState as any).currentStage ?? 1;
    if (updated.stageGroupStages[region][stageNum]) {
      const gsClone = { ...updated.stageGroupStages[region][stageNum] };
      gsClone.groups = gsClone.groups.map((g: any) => ({
        ...g,
        schedule: [...g.schedule],
      }));
      updated.stageGroupStages[region][stageNum] = gsClone;
    }
    onUpdateGameState(updated as GameState);
  };

  const reshuffle = () => {
    if (!editable) return;
    const seed = `${(gameState as any).seed}-reshuffle-${Date.now()}`;
    for (const group of gs.groups) {
      group.schedule = generateGroupSchedule(`${seed}-${group.name.toLowerCase()}`, group);
    }
    // reset dayOrder: Alpha=0, Omega=1
    for (const m of gs.groups[0].schedule) m.dayOrder = 0;
    for (const m of gs.groups[1].schedule) m.dayOrder = 1;
    save();
  };

  const setMatchTeam = (groupIdx: number, matchIdx: number, side: 'home' | 'away', teamId: string) => {
    if (!editable) return;
    const match = gs.groups[groupIdx].schedule[matchIdx];
    // prevent team vs itself
    const opponent = side === 'home' ? match.awayTeamId : match.homeTeamId;
    if (teamId === opponent) return;
    if (side === 'home') match.homeTeamId = teamId;
    else match.awayTeamId = teamId;
    save();
    setPicker(null);
  };

  const togglePicker = (gi: number, mi: number, side: 'home' | 'away') => {
    setPicker(p =>
      p && p.groupIdx === gi && p.matchIdx === mi && p.side === side
        ? null
        : { groupIdx: gi, matchIdx: mi, side }
    );
  };

  // drag-drop: reorder matches
  // same group: swap match content (reorder matchups within group)
  // cross group: swap scheduling (matchday + dayOrder so visual position changes)
  const handleDrop = (targetGi: number, targetMi: number) => {
    if (!editable || !dragSrc) { setDragSrc(null); setDragOver(null); return; }
    if (dragSrc.gi === targetGi && dragSrc.mi === targetMi) { setDragSrc(null); setDragOver(null); return; }

    const srcMatch = gs.groups[dragSrc.gi].schedule[dragSrc.mi];
    const dstMatch = gs.groups[targetGi].schedule[targetMi];
    if (!srcMatch || !dstMatch) return;

    if (dragSrc.gi === targetGi) {
      // same group: swap match content (teams + id)
      const srcData = { id: srcMatch.id, homeTeamId: srcMatch.homeTeamId, awayTeamId: srcMatch.awayTeamId };
      const dstData = { id: dstMatch.id, homeTeamId: dstMatch.homeTeamId, awayTeamId: dstMatch.awayTeamId };
      srcMatch.id = dstData.id; srcMatch.homeTeamId = dstData.homeTeamId; srcMatch.awayTeamId = dstData.awayTeamId;
      dstMatch.id = srcData.id; dstMatch.homeTeamId = srcData.homeTeamId; dstMatch.awayTeamId = srcData.awayTeamId;
    } else {
      // cross group: swap matchday AND dayOrder
      const tmpDay = srcMatch.matchday;
      const tmpOrder = srcMatch.dayOrder ?? 0;
      srcMatch.matchday = dstMatch.matchday;
      srcMatch.dayOrder = dstMatch.dayOrder ?? 1;
      dstMatch.matchday = tmpDay;
      dstMatch.dayOrder = tmpOrder;
    }

    setDragSrc(null);
    setDragOver(null);
    save();
  };

  const addMatch = (groupIdx: number, day: number) => {
    if (!editable) return;
    const group = gs.groups[groupIdx];
    const teamIds = group.teams.map((t: any) => t.teamId);
    // default to first two teams
    group.schedule.push({
      id: `gs_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      homeTeamId: teamIds[0] ?? '',
      awayTeamId: teamIds[1] ?? '',
      format: 'bo3',
      matchday: day,
      dayOrder: groupIdx, // Alpha=0, Omega=1
      played: false,
      result: null,
    });
    save();
  };

  const removeMatch = (groupIdx: number, matchIdx: number) => {
    if (!editable) return;
    gs.groups[groupIdx].schedule.splice(matchIdx, 1);
    save();
  };

  const addMatchday = () => {
    if (!editable) return;
    const maxDay = Math.max(
      ...gs.groups.flatMap((g: any) => g.schedule.map((m: any) => m.matchday)),
      0,
    );
    // add one match per group on the new day
    for (let gi = 0; gi < gs.groups.length; gi++) {
      addMatch(gi, maxDay + 1);
    }
  };

  const removeMatchday = (day: number) => {
    if (!editable) return;
    for (const group of gs.groups) {
      group.schedule = group.schedule.filter((m: any) => m.matchday !== day);
    }
    save();
  };

  if (!expanded) {
    return (
      <button className="rep-action-btn" style={{ margin: '0 12px 12px' }} onClick={() => setExpanded(true)}>
        Show Schedule ({gs.groups[0].schedule.length + gs.groups[1].schedule.length} matches)
      </button>
    );
  }

  // combine both groups by matchday
  type MatchEntry = { match: any; mi: number; gi: number; groupName: string };
  const allEntries: MatchEntry[] = [];
  gs.groups.forEach((group: any, gi: number) => {
    group.schedule.forEach((m: any, mi: number) => {
      allEntries.push({ match: m, mi, gi, groupName: group.name });
    });
  });

  const byDay = new Map<number, MatchEntry[]>();
  for (const e of allEntries) {
    if (!byDay.has(e.match.matchday)) byDay.set(e.match.matchday, []);
    byDay.get(e.match.matchday)!.push(e);
  }
  const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]);

  return (
    <div className="rep-schedule-preview">
      <div className="rep-schedule-preview-header">
        <span className="rep-schedule-preview-title">Schedule</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {editable && <button className="rep-action-btn" onClick={addMatchday}>+ Matchday</button>}
          {editable && <button className="rep-action-btn" onClick={reshuffle}>Reshuffle</button>}
          <button className="rep-action-btn rep-action-btn--muted" onClick={() => { setExpanded(false); setPicker(null); }}>Hide</button>
        </div>
      </div>

      {sortedDays.map(([day, entries]) => (
        <div key={day} className="rep-schedule-day-group">
          <div className="rep-schedule-day-header-row">
            <span className="rep-schedule-day-header">Day {day}</span>
            {editable && (
              <div className="rep-schedule-day-actions">
                <button className="rep-schedule-add-btn" onClick={() => addMatch(0, day)} title="Add Alpha match">+ A</button>
                <button className="rep-schedule-add-btn" onClick={() => addMatch(1, day)} title="Add Omega match">+ O</button>
                <button className="rep-schedule-remove-btn" onClick={() => removeMatchday(day)} title="Remove entire matchday">✕</button>
              </div>
            )}
          </div>
          {entries.sort((a, b) => (a.match.dayOrder ?? 0) - (b.match.dayOrder ?? 0)).map(({ match: m, mi, gi, groupName }) => {
            const home = getTeam(m.homeTeamId);
            const away = getTeam(m.awayTeamId);
            const homeRef = getRef(gi, mi, 'home');
            const awayRef = getRef(gi, mi, 'away');
            const homeOpen = picker?.groupIdx === gi && picker?.matchIdx === mi && picker?.side === 'home';
            const awayOpen = picker?.groupIdx === gi && picker?.matchIdx === mi && picker?.side === 'away';
            const groupTeams = gs.groups[gi].teams.map((t: any) => gameState.teams.find((tm: Team) => tm.id === t.teamId)).filter(Boolean) as Team[];
            const hasPicker = picker?.groupIdx === gi && picker?.matchIdx === mi;

            return (
              <div key={m.id}>
                <div
                  className={`rep-swiss-row ${dragOver?.gi === gi && dragOver?.mi === mi ? 'rep-drag-over' : ''}`}
                  draggable={editable && !picker}
                  onDragStart={() => setDragSrc({ gi, mi })}
                  onDragEnd={() => { setDragSrc(null); setDragOver(null); }}
                  onDragOver={e => { e.preventDefault(); setDragOver({ gi, mi }); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => { e.preventDefault(); handleDrop(gi, mi); }}
                >
                  {editable && <span className="rep-schedule-grip" title="Drag to reorder">⠿</span>}
                  <span className="rep-schedule-group-badge">{groupName[0]}</span>
                  <button
                    ref={homeRef as React.RefObject<HTMLButtonElement>}
                    className={`rep-swiss-slot filled ${homeOpen ? 'open' : ''}`}
                    onClick={() => editable && togglePicker(gi, mi, 'home')}
                    disabled={!editable}
                  >
                    {home ? (
                      <><img src={home.logo} alt="" className="rep-swiss-logo" /><span className="rep-swiss-abbr">{home.abbreviation}</span></>
                    ) : <span className="rep-swiss-plus">?</span>}
                  </button>
                  <span className="rep-swiss-vs">vs</span>
                  <button
                    ref={awayRef as React.RefObject<HTMLButtonElement>}
                    className={`rep-swiss-slot filled ${awayOpen ? 'open' : ''}`}
                    onClick={() => editable && togglePicker(gi, mi, 'away')}
                    disabled={!editable}
                  >
                    {away ? (
                      <><img src={away.logo} alt="" className="rep-swiss-logo" /><span className="rep-swiss-abbr">{away.abbreviation}</span></>
                    ) : <span className="rep-swiss-plus">?</span>}
                  </button>
                  {editable && (
                    <button className="rep-schedule-remove-btn" onClick={() => removeMatch(gi, mi)} title="Remove match">✕</button>
                  )}
                </div>

                {hasPicker && (() => {
                  const opponent = picker!.side === 'home' ? m.awayTeamId : m.homeTeamId;
                  return (
                    <TeamLogoPopup
                      teams={groupTeams}
                      picked={new Set<string>(opponent ? [opponent] : [])}
                      current={picker!.side === 'home' ? m.homeTeamId : m.awayTeamId}
                      onSelect={id => {
                        if (id) setMatchTeam(gi, mi, picker!.side, id);
                        else setPicker(null);
                      }}
                      onClose={() => setPicker(null)}
                      anchorRef={picker!.side === 'home' ? homeRef : awayRef}
                    />
                  );
                })()}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
