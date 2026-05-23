// src/ui/components/MapPoolPage.tsx
import { useState } from 'react';
import type { Role } from '../../types';
import type { GameState } from '../../sim/gameState';
import { MAPS } from '../../sim/matchSim';
import { downloadJson, uploadJson } from '../../utils/devToolsIO';
import './MapPoolPage.css';

const CORE_ROLES: Role[] = ['duelist', 'controller', 'initiator', 'sentinel'];

const ROLE_ICONS: Record<string, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
};

const ROLE_COLORS: Record<string, string> = {
  duelist: 'var(--role-duelist)',
  controller: 'var(--role-controller)',
  initiator: 'var(--role-initiator)',
  sentinel: 'var(--role-sentinel)',
};

import { getAgentsByRole } from '../../data/agentRoles';

const getAgentIconBase = (agent: string) => `/logos/agents/${agent.toLowerCase()}.png`;
const fmtAgent = (a: string) => a.charAt(0).toUpperCase() + a.slice(1);

interface MapPoolPageProps {
  gameState: GameState;
  onUpdate: (mapPool: string[]) => void;
  onUpdateMeta?: (mapMeta: Record<string, Partial<Record<string, string[]>>>) => void;
  onUpdateVariance?: (val: number) => void;
  onUpdateCustomMapNames?: (names: string[]) => void;
  devMode?: boolean;
  agentRoleOverrides?: Record<string, string[]>;
}

export function MapPoolPage({ gameState, onUpdate, onUpdateMeta, onUpdateVariance, onUpdateCustomMapNames, devMode, agentRoleOverrides = {} }: MapPoolPageProps) {
  const [activeTab, setActiveTab] = useState<'pool' | 'meta'>('pool');
  const [expandedMap, setExpandedMap] = useState<string | null>(null);

  const pool = gameState.mapPool ?? [...MAPS];
  const mapMeta = gameState.mapMeta ?? {};
  const legacyIcons: string[] = (gameState as any).legacyAgentIcons ?? [];
  const legacyMap: Record<string, string> = { gekko: 'gekko_old.webp', harbor: 'harbor_old.webp', fade: 'fade_old.webp' };
  const getAgentIcon = (agent: string) => {
    if (legacyIcons.includes(agent) && legacyMap[agent]) return `/logos/agents/${legacyMap[agent]}`;
    return getAgentIconBase(agent);
  };
  // all custom map names ever added (persisted so removed ones aren't lost)
  const knownCustomMaps: string[] = (gameState as any).customMapNames ?? [];
  const allKnown = [...MAPS, ...knownCustomMaps.filter(m => !MAPS.includes(m))];
  const customMaps = pool.filter(m => !MAPS.includes(m));
  const activeStandard = MAPS.filter(m => pool.includes(m));
  const inactiveMaps = allKnown.filter(m => !pool.includes(m));

  const updateCustomNames = (names: string[]) => {
    onUpdateCustomMapNames?.(names);
  };

  const toggle = (mapName: string) => {
    const isActive = pool.includes(mapName);
    const updated = isActive ? pool.filter(m => m !== mapName) : [...pool, mapName];
    if (updated.length < 5) return;
    onUpdate(updated);
  };

  const addCustomMap = (name: string) => {
    if (!name || pool.includes(name)) return;
    if (!knownCustomMaps.includes(name)) updateCustomNames([...knownCustomMaps, name]);
    onUpdate([...pool, name]);
  };

  const removeFromPool = (mapName: string) => {
    const updated = pool.filter(m => m !== mapName);
    if (updated.length < 5) return;
    onUpdate(updated);
  };

  const deleteCustomMap = (mapName: string) => {
    // fully remove a custom map (from pool and known list)
    const updated = pool.filter(m => m !== mapName);
    if (updated.length < 5) return;
    updateCustomNames(knownCustomMaps.filter(m => m !== mapName));
    onUpdate(updated);
  };

  const setMetaAgent = (mapName: string, role: string, idx: number, agent: string) => {
    if (!onUpdateMeta) return;
    const current: string[] = [...((mapMeta[mapName]?.[role] as string[]) ?? [])];
    if (agent === '') {
      current.splice(idx, 1);
    } else {
      // remove agent from other slots first (no duplicates)
      const filtered = current.filter((a, i) => i === idx || a !== agent);
      filtered[idx] = agent;
      // re-compact
      const compacted = filtered.filter(Boolean);
      onUpdateMeta({
        ...mapMeta,
        [mapName]: { ...(mapMeta[mapName] ?? {}), [role]: compacted },
      });
      return;
    }
    onUpdateMeta({
      ...mapMeta,
      [mapName]: { ...(mapMeta[mapName] ?? {}), [role]: current.filter(Boolean) },
    });
  };

  const clearMapMeta = (mapName: string) => {
    if (!onUpdateMeta) return;
    const updated = { ...mapMeta };
    delete updated[mapName];
    onUpdateMeta(updated);
  };

  // count configured roles for a map
  const countConfigured = (mapName: string) =>
    CORE_ROLES.filter(r => ((mapMeta[mapName]?.[r] as string[]) ?? []).length > 0).length;

  const exportSettings = () => {
    const data = {
      _type: 'map-pool',
      mapPool: pool,
      mapMeta,
      agentVariance: gameState.agentVariance ?? 15,
      customMapNames: knownCustomMaps,
    };
    downloadJson(data, 'map-pool-settings.json');
  };

  const importSettings = async () => {
    try {
      const data = await uploadJson() as any;
      if (data?._type !== 'map-pool') return;
      if (data.customMapNames && Array.isArray(data.customMapNames)) updateCustomNames(data.customMapNames);
      if (data.mapPool && Array.isArray(data.mapPool)) onUpdate(data.mapPool);
      if (data.mapMeta) onUpdateMeta?.(data.mapMeta);
      if (data.agentVariance !== undefined) onUpdateVariance?.(data.agentVariance);
    } catch { /* ignore */ }
  };

  return (
    <>
      <div className="content-header">
        <h1>Map Pool</h1>
        {devMode && (
          <div className="dt-io-btns">
            <button className="dt-io-btn" onClick={exportSettings} title="Export map pool + meta">↓ Export</button>
            <button className="dt-io-btn" onClick={importSettings} title="Import map pool settings">↑ Import</button>
          </div>
        )}
      </div>

      <div className="mp-page">
        <div className="mp-tabs">
          <button
            className={`mp-tab-btn ${activeTab === 'pool' ? 'active' : ''}`}
            onClick={() => setActiveTab('pool')}
          >
            🗺️ Map Pool
          </button>
          <button
            className={`mp-tab-btn ${activeTab === 'meta' ? 'active' : ''}`}
            onClick={() => setActiveTab('meta')}
          >
            🤖 AI Map Meta
          </button>
        </div>

        {activeTab === 'pool' && (
          <>
            <div className="mp-top-bar">
              <div className="mp-top-stats">
                <div className="mp-stat">
                  <span className="mp-stat-value">{pool.length}</span>
                  <span className="mp-stat-label">Active</span>
                </div>
                <div className="mp-stat">
                  <span className="mp-stat-value">{activeStandard.length}</span>
                  <span className="mp-stat-label">Standard</span>
                </div>
                <div className="mp-stat">
                  <span className="mp-stat-value">{customMaps.length}</span>
                  <span className="mp-stat-label">Custom</span>
                </div>
                <div className="mp-stat">
                  <span className="mp-stat-value">{inactiveMaps.length}</span>
                  <span className="mp-stat-label">Removed</span>
                </div>
              </div>
              {devMode && (
                <button
                  className="mp-reset-btn"
                  onClick={() => { updateCustomNames([]); onUpdate([...MAPS]); }}
                  disabled={
                    pool.length === MAPS.length &&
                    customMaps.length === 0 &&
                    MAPS.every(m => pool.includes(m))
                  }
                >
                  Reset to Default
                </button>
              )}
            </div>

            <div className="mp-grid">
              <div className="panel">
                <div className="panel-header">
                  Active Pool
                  <span className="panel-header-sub">{pool.length} maps in rotation</span>
                </div>
                <div className="panel-body" style={{ padding: 0 }}>
                  {pool.length === 0 ? (
                    <div className="mp-empty">No maps active</div>
                  ) : (
                    pool.map(mapName => {
                      const isCustom = !MAPS.includes(mapName);
                      return (
                        <div key={mapName} className="mp-row">
                          <div className="mp-row-info">
                            <span className="mp-status on" />
                            <span className="mp-map-name">{mapName}</span>
                            {isCustom && <span className="mp-badge custom">Custom</span>}
                          </div>
                          {devMode && (
                            <button
                              className="mp-action-btn remove"
                              onClick={() => removeFromPool(mapName)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mp-right-col">
                <div className="panel">
                  <div className="panel-header">
                    Removed
                    <span className="panel-header-sub">{inactiveMaps.length} maps out of rotation</span>
                  </div>
                  <div className="panel-body" style={{ padding: 0 }}>
                    {inactiveMaps.length === 0 ? (
                      <div className="mp-empty">All maps are active</div>
                    ) : (
                      inactiveMaps.map(mapName => {
                        const isCustom = !MAPS.includes(mapName);
                        return (
                          <div key={mapName} className="mp-row inactive">
                            <div className="mp-row-info">
                              <span className="mp-status off" />
                              <span className="mp-map-name">{mapName}</span>
                              {isCustom && <span className="mp-badge custom">Custom</span>}
                            </div>
                            {devMode && (
                              <div className="mp-row-actions">
                                <button className="mp-action-btn add" onClick={() => toggle(mapName)}>
                                  Add
                                </button>
                                {isCustom && (
                                  <button className="mp-action-btn delete" onClick={() => deleteCustomMap(mapName)} title="Permanently delete">
                                    ✕
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {devMode && (
                  <div className="panel">
                    <div className="panel-header">
                      Add Custom Map
                      <span className="panel-header-sub">New maps not in default rotation</span>
                    </div>
                    <div className="panel-body">
                      <input
                        type="text"
                        className="mp-add-input"
                        placeholder="Type map name and press Enter..."
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const name = input.value.trim();
                            if (!name) return;
                            addCustomMap(name);
                            input.value = '';
                          }
                        }}
                      />
                      <div className="mp-add-hint">Press Enter to add. Min 5 maps total required for BO5.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'meta' && (
          <div className="mp-meta-section">
            <div className="mp-meta-controls">
              <div className="mp-meta-hint">
                Set preferred agents per role per map for AI teams. Players with ≥40 comfort on a meta
                agent will prioritise it. Leave a slot empty to fall back to each player&apos;s own pool.
              </div>
              <div className="mp-meta-variance-row">
                <div className="mp-meta-variance-label">
                  <span className="mp-meta-variance-title">Agent Strictness</span>
                  <span className="mp-meta-variance-desc">How often AI deviates from priority 1 agent</span>
                </div>
                <div className="mp-meta-variance-control">
                  <span className="mp-meta-variance-tick strict">Strict</span>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={gameState.agentVariance ?? 15}
                    onChange={e => onUpdateVariance?.(Number(e.target.value))}
                    className="mp-meta-variance-slider"
                    disabled={!onUpdateVariance}
                  />
                  <span className="mp-meta-variance-tick loose">Loose</span>
                  <div className="mp-meta-variance-badge">
                    <span className="mp-meta-variance-value">{gameState.agentVariance ?? 15}%</span>
                    <span className="mp-meta-variance-preset">
                      {(gameState.agentVariance ?? 15) <= 10 ? 'Pro-style' :
                       (gameState.agentVariance ?? 15) <= 20 ? 'Realistic' :
                       (gameState.agentVariance ?? 15) <= 35 ? 'Creative' : 'Chaotic'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {[...MAPS, ...pool.filter(m => !MAPS.includes(m))].sort((a, b) => { const aIn = pool.includes(a) ? 0 : 1; const bIn = pool.includes(b) ? 0 : 1; return aIn - bIn; }).map(mapName => {
              const inPool = pool.includes(mapName);
              const configured = countConfigured(mapName);
              const isExpanded = expandedMap === mapName;
              return (
                <div key={mapName} className={`mp-meta-card ${isExpanded ? 'expanded' : ''} ${!inPool ? 'inactive' : ''}`}>
                  {/* Card header — click to expand */}
                  <button
                    className="mp-meta-card-header"
                    onClick={() => setExpandedMap(isExpanded ? null : mapName)}
                  >
                    <span className="mp-meta-map-name">{mapName}</span>
                    {!inPool && (
                      <span className="mp-meta-inactive-badge">Not in pool</span>
                    )}
                    <div className="mp-meta-card-summary">
                      {CORE_ROLES.map(role => {
                        const prefs: string[] = (mapMeta[mapName]?.[role] as string[]) ?? [];
                        return (
                          <div key={role} className="mp-meta-summary-role">
                            <img
                              src={ROLE_ICONS[role]}
                              alt={role}
                              className="mp-meta-summary-role-icon"
                            />
                            {prefs.length > 0 ? (
                              <div className="mp-meta-summary-agents">
                                {prefs.slice(0, 3).map(agent => (
                                  <img
                                    key={agent}
                                    src={getAgentIcon(agent)}
                                    alt={agent}
                                    className="mp-meta-summary-agent-icon"
                                    title={fmtAgent(agent)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <span className="mp-meta-summary-empty">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mp-meta-card-right">
                      {configured > 0 && (
                        <span className="mp-meta-configured-badge">{configured}/4</span>
                      )}
                      <span className="mp-meta-chevron">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="mp-meta-card-body">
                      {CORE_ROLES.map(role => {
                        const prefs: string[] = (mapMeta[mapName]?.[role] as string[]) ?? [];
                        const agents = getAgentsByRole(role as any, agentRoleOverrides as any);
                        return (
                          <div key={role} className="mp-meta-role-section">
                            <div className="mp-meta-role-header">
                              <img
                                src={ROLE_ICONS[role]}
                                alt={role}
                                className="mp-meta-role-icon"
                              />
                              <span
                                className="mp-meta-role-name"
                                style={{ color: ROLE_COLORS[role] }}
                              >
                                {fmtAgent(role)}
                              </span>
                              <div className="mp-meta-priority-labels">
                                <span>Priority 1</span>
                                <span>Priority 2</span>
                                <span>Priority 3</span>
                              </div>
                            </div>
                            <div className="mp-meta-agent-slots">
                              {[0, 1, 2].map(idx => {
                                const selected = prefs[idx] ?? '';
                                return (
                                  <div
                                    key={idx}
                                    className={`mp-meta-slot ${selected ? 'filled' : 'empty'} slot-${idx + 1}`}
                                  >
                                    {selected ? (
                                      <>
                                        <img
                                          src={getAgentIcon(selected)}
                                          alt={selected}
                                          className="mp-meta-slot-agent-icon"
                                        />
                                        <span className="mp-meta-slot-agent-name">
                                          {fmtAgent(selected)}
                                        </span>
                                        {onUpdateMeta && (
                                          <button
                                            className="mp-meta-slot-clear"
                                            onClick={() => setMetaAgent(mapName, role, idx, '')}
                                            title="Clear"
                                          >
                                            ×
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <span className="mp-meta-slot-placeholder">
                                        {idx === 0 ? 'Main' : idx === 1 ? 'Secondary' : 'Pocket'}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Agent picker grid */}
                            {onUpdateMeta && (
                              <div className="mp-meta-agent-picker">
                                {agents.map(agent => {
                                  const slotIdx = prefs.indexOf(agent);
                                  const isSelected = slotIdx !== -1;
                                  return (
                                    <button
                                      key={agent}
                                      className={`mp-meta-agent-btn ${isSelected ? `selected slot-${slotIdx + 1}` : ''}`}
                                      onClick={() => {
                                        if (isSelected) {
                                          setMetaAgent(mapName, role, slotIdx, '');
                                        } else {
                                          // fill next empty slot
                                          const nextSlot = [0, 1, 2].find(i => !prefs[i]);
                                          if (nextSlot !== undefined) {
                                            setMetaAgent(mapName, role, nextSlot, agent);
                                          }
                                        }
                                      }}
                                      title={fmtAgent(agent)}
                                    >
                                      <img
                                        src={getAgentIcon(agent)}
                                        alt={agent}
                                        className="mp-meta-agent-btn-icon"
                                      />
                                      <span className="mp-meta-agent-btn-name">{fmtAgent(agent)}</span>
                                      {isSelected && (
                                        <span className="mp-meta-agent-slot-badge">{slotIdx + 1}</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {configured > 0 && onUpdateMeta && (
                        <div className="mp-meta-card-footer">
                          <button className="mp-meta-clear-all" onClick={() => clearMapMeta(mapName)}>
                            Clear all for {mapName}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
