// src/ui/components/AgentMetaPage.tsx
import { useState } from 'react';
import type { GameState } from '../../sim/gameState';
import { DEFAULT_AGENT_ROLES, SELECTABLE_ROLES, getAllAgents } from '../../data/agentRoles';
import type { Role } from '../../types/player';
import type { AgentAbility, AbilityUsage, AbilityLethality, UltTimingType } from '../../data/agentAbilities';
import { AGENT_ABILITIES, USAGE_OPTIONS, LETHALITY_OPTIONS, ULT_TIMING_OPTIONS, ULT_TIMING_LABELS, getKillChance, getKillChanceLabel } from '../../data/agentAbilities';
import { downloadJson, uploadJson } from '../../utils/devToolsIO';
import './AgentMetaPage.css';

const BASE_AGENTS_BY_ROLE: Record<string, string[]> = {
  Duelist: ['jett', 'raze', 'phoenix', 'reyna', 'yoru', 'neon', 'iso', 'waylay'],
  Controller: ['omen', 'brimstone', 'astra', 'harbor', 'clove', 'viper'],
  Initiator: ['sova', 'breach', 'skye', 'kayo', 'fade', 'gekko', 'tejo'],
  Sentinel: ['killjoy', 'cypher', 'sage', 'chamber', 'deadlock', 'viper', 'vyse', 'veto'],
};

const ROLE_KEY_MAP: Record<string, string> = {
  duelist: 'Duelist',
  controller: 'Controller',
  initiator: 'Initiator',
  sentinel: 'Sentinel',
};

const TIERS = [
  { label: 'Unplayable', value: -50, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', desc: 'Avoided, big perf penalty if forced' },
  { label: 'Weak',       value: -25, color: '#fb923c', bg: 'rgba(251,146,60,0.12)', desc: 'Less likely from pool' },
  { label: 'Default',    value:   0, color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.04)', desc: 'Normal behaviour' },
  { label: 'Strong',     value:  25, color: '#4ade80', bg: 'rgba(74,222,128,0.12)', desc: 'Pool players pick more, some bleed' },
  { label: 'Meta',       value:  50, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', desc: '~80-90% pick rate, strong bleed' },
  { label: 'God-tier',   value: 100, color: '#ffd700', bg: 'rgba(255,215,0,0.12)',  desc: 'Hard forced — every team plays this agent' },
] as const;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const getAgentIcon = (agent: string) => `/logos/agents/${agent.toLowerCase()}.png`;
const getTier = (val: number) => TIERS.find(t => t.value === val) ?? null;

interface CustomAgent {
  id: string;
  displayName: string;
  role: string;
  icon?: string; // filename in /logos/agents/, e.g. "miks.png"
}

interface AgentMetaPageProps {
  gameState: GameState;
  onUpdate: (agentMeta: Record<string, number>) => void;
  onUpdateRoleOverrides?: (overrides: Record<string, Role[]>) => void;
  onUpdateDisabled?: (disabled: string[]) => void;
  onUpdateCustomAgents?: (agents: CustomAgent[]) => void;
  onUpdateAbilities?: (abilities: Record<string, AgentAbility[]>) => void;
  devMode?: boolean;
}

export function AgentMetaPage({ gameState, onUpdate, onUpdateRoleOverrides, onUpdateDisabled, onUpdateCustomAgents, onUpdateAbilities, devMode }: AgentMetaPageProps) {
  const meta = gameState.agentMeta ?? {};
  const roleOverrides = gameState.agentRoleOverrides ?? {};
  const disabled = new Set(gameState.disabledAgents ?? []);
  const customAgents: CustomAgent[] = gameState.customAgents ?? [];
  const [pageTab, setPageTab] = useState<'meta' | 'roles' | 'abilities'>('meta');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<string>('duelist');
  const [newIcon, setNewIcon] = useState('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [validationWarn, setValidationWarn] = useState<string | null>(null);

  // auto-dismiss validation warning
  const showWarn = (msg: string) => {
    setValidationWarn(msg);
    setTimeout(() => setValidationWarn(null), 3000);
  };

  // abilities: gameState override → data file defaults
  const abilitiesMap = gameState.agentAbilities ?? {};
  const getAgentAbilities = (agent: string): AgentAbility[] => {
    const saved = abilitiesMap[agent.toLowerCase()];
    if (!saved) return AGENT_ABILITIES[agent.toLowerCase()] ?? [];
    // migrate: patch saved utility ults missing timing fields with defaults
    const defaults = AGENT_ABILITIES[agent.toLowerCase()] ?? [];
    return saved.map(ab => {
      if (ab.type !== 'ultimate' || ab.ultTiming) return ab;
      // find matching default by id or by being the only ult
      const defUlt = defaults.find(d => d.id === ab.id && d.type === 'ultimate')
        ?? defaults.find(d => d.type === 'ultimate');
      if (!defUlt?.ultTiming) return ab;
      return {
        ...ab,
        ultTiming: defUlt.ultTiming,
        ultAttackRate: ab.ultAttackRate ?? defUlt.ultAttackRate,
        ultDefenseRate: ab.ultDefenseRate ?? defUlt.ultDefenseRate,
        ultEconomy: ab.ultEconomy ?? defUlt.ultEconomy,
      };
    });
  };
  const setAgentAbilities = (agent: string, abilities: AgentAbility[]) => {
    if (!onUpdateAbilities) return;
    const updated = { ...abilitiesMap, [agent.toLowerCase()]: abilities };
    onUpdateAbilities(updated);
  };
  const addAbility = (agent: string) => {
    const current = getAgentAbilities(agent);
    const idx = current.length + 1;
    const newAb: AgentAbility = {
      id: `${agent.toLowerCase()}-ability-${idx}`,
      name: '',
      type: 'basic',
      usage: 'occasional',
      lethality: 'moderate',
      aoe: false,
      maxKills: 1,
      headshotRate: 0,
      uses: 1,
      refreshOnKill: false,
      refreshKillReq: 0,
      chain: false,
      ecoWeapon: false,
      ultCost: 0,
      utilityBonus: 0,
    };
    setAgentAbilities(agent, [...current, newAb]);
  };
  const removeAbility = (agent: string, idx: number) => {
    const current = getAgentAbilities(agent);
    setAgentAbilities(agent, current.filter((_, i) => i !== idx));
  };
  const moveAbility = (agent: string, idx: number, dir: -1 | 1) => {
    const current = getAgentAbilities(agent).map(a => ({ ...a }));
    const target = idx + dir;
    if (target < 0 || target >= current.length) return;
    [current[idx], current[target]] = [current[target], current[idx]];
    setAgentAbilities(agent, current);
  };
  const updateAbility = (agent: string, idx: number, field: keyof AgentAbility, val: any) => {
    const current = getAgentAbilities(agent).map(a => ({ ...a }));
    if (!current[idx]) return;
    (current[idx] as any)[field] = val;
    // auto-set ultCost and utilityBonus to 0 for non-ult types
    if (field === 'type' && val !== 'ultimate') {
      current[idx].ultCost = 0;
      current[idx].utilityBonus = 0;
      current[idx].ultTiming = undefined;
      current[idx].ultAttackRate = undefined;
      current[idx].ultDefenseRate = undefined;
      current[idx].ultEconomy = undefined;
    }
    setAgentAbilities(agent, current);
  };

  // validation rules for numeric fields
  const FIELD_RULES: Record<string, { min: number; max: number; int?: boolean; label: string }> = {
    headshotRate:   { min: 0, max: 100, label: 'HS %' },
    uses:           { min: 1, max: 10, int: true, label: 'Uses/rnd' },
    ultCost:        { min: 1, max: 12, int: true, label: 'Ult cost' },
    maxKills:       { min: 1, max: 5, int: true, label: 'Max kills/use' },
    refreshKillReq: { min: 0, max: 5, int: true, label: 'Kills req' },
    utilityBonus:   { min: 0, max: 15, int: true, label: 'Util bonus' },
  };
  const validateAndSet = (agent: string, idx: number, field: string, raw: string) => {
    const rule = FIELD_RULES[field];
    if (!rule) return;
    const num = rule.int ? parseInt(raw) : parseFloat(raw);
    if (isNaN(num)) { showWarn(`${rule.label}: not a number`); return; }
    if (num < rule.min || num > rule.max) { showWarn(`${rule.label}: must be ${rule.min}–${rule.max}`); return; }
    // HS% is entered as 0-100 but stored as 0-1
    const stored = field === 'headshotRate' ? num / 100 : num;
    updateAbility(agent, idx, field as keyof AgentAbility, stored);
  };

  const totalAbilityCount = Object.values(BASE_AGENTS_BY_ROLE).flat().reduce((sum, a) => sum + getAgentAbilities(a).length, 0);
  const agentsWithAbilities = Object.values(BASE_AGENTS_BY_ROLE).flat().filter(a => getAgentAbilities(a).length > 0).length;

  const setValue = (agent: string, value: number) => {
    const updated = { ...meta };
    if (value === 0) delete updated[agent];
    else updated[agent] = value;
    onUpdate(updated);
  };

  const toggleDisabled = (agent: string) => {
    if (!onUpdateDisabled) return;
    const arr = gameState.disabledAgents ?? [];
    if (disabled.has(agent)) {
      onUpdateDisabled(arr.filter(a => a !== agent));
    } else {
      onUpdateDisabled([...arr, agent]);
    }
  };

  // resolve icon: custom agents can have a custom icon filename
  const customIconMap = new Map(customAgents.filter(a => a.icon).map(a => [a.id, a.icon!]));
  const legacyIcons: string[] = (gameState as any).legacyAgentIcons ?? [];
  const legacyMap: Record<string, string> = { gekko: 'gekko_old.webp', harbor: 'harbor_old.webp', fade: 'fade_old.webp' };
  const getIcon = (agent: string) => {
    const custom = customIconMap.get(agent);
    if (custom) return `/logos/agents/${custom}`;
    if (legacyIcons.includes(agent) && legacyMap[agent]) return `/logos/agents/${legacyMap[agent]}`;
    return getAgentIcon(agent);
  };

  const addCustomAgent = () => {
    const id = newName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (!id || customAgents.some(a => a.id === id)) return;
    const allBase = Object.values(BASE_AGENTS_BY_ROLE).flat();
    if (allBase.includes(id)) return;

    const agent: CustomAgent = { id, displayName: newName.trim(), role: newRole };
    if (newIcon.trim()) agent.icon = newIcon.trim();
    onUpdateCustomAgents?.([...customAgents, agent]);
    // register in role overrides so sim picks it up
    onUpdateRoleOverrides?.({ ...roleOverrides, [id]: [newRole as Role] });
    setNewName('');
    setNewIcon('');
  };

  const removeCustomAgent = (id: string) => {
    onUpdateCustomAgents?.(customAgents.filter(a => a.id !== id));
    const updatedMeta = { ...meta };
    delete updatedMeta[id];
    onUpdate(updatedMeta);
    onUpdateDisabled?.((gameState.disabledAgents ?? []).filter(a => a !== id));
    const updatedOverrides = { ...roleOverrides };
    delete updatedOverrides[id];
    onUpdateRoleOverrides?.(updatedOverrides as Record<string, Role[]>);
  };

  const resetAll = () => onUpdate({});

  // merge base + custom agents by role
  const agentsByRole: Record<string, string[]> = {};
  for (const [role, agents] of Object.entries(BASE_AGENTS_BY_ROLE)) {
    agentsByRole[role] = [...agents];
  }
  for (const ca of customAgents) {
    const roleKey = ROLE_KEY_MAP[ca.role] ?? 'Duelist';
    if (!agentsByRole[roleKey]) agentsByRole[roleKey] = [];
    if (!agentsByRole[roleKey].includes(ca.id)) agentsByRole[roleKey].push(ca.id);
  }

  const customIds = new Set(customAgents.map(a => a.id));
  const allKnownAgents = new Set(Object.values(agentsByRole).flat());
  const orphanCustom = Object.keys(meta).filter(a => !allKnownAgents.has(a));

  const activeCount = Object.keys(meta).length;
  const buffCount = Object.values(meta).filter(v => v > 0).length;
  const nerfCount = Object.values(meta).filter(v => v < 0).length;
  const godCount = Object.values(meta).filter(v => v === 100).length;
  const disabledCount = disabled.size;

  const renderAgentRow = (agent: string, isCustom = false) => {
    const val = meta[agent] ?? 0;
    const isDisabled = disabled.has(agent);
    const activeTier = getTier(val);
    const displayName = isCustom
      ? (customAgents.find(a => a.id === agent)?.displayName ?? capitalize(agent))
      : capitalize(agent);

    return (
      <div key={agent} className={`am-row ${val !== 0 ? 'modified' : ''} ${isDisabled ? 'disabled-agent' : ''}`}>
        <div className="am-agent-info">
          {devMode && (
            <button
              className={`am-toggle-btn ${isDisabled ? 'off' : 'on'}`}
              onClick={() => toggleDisabled(agent)}
              title={isDisabled ? 'Enable agent' : 'Disable agent'}
            >
              {isDisabled ? '○' : '●'}
            </button>
          )}
          <img src={getIcon(agent)} alt={agent} className="am-agent-icon" />
          <span className="am-agent-name">
            {displayName}
            {isCustom && <span className="am-custom-badge">custom</span>}
          </span>
          {isDisabled && <span className="am-disabled-badge">off</span>}
          {isCustom && devMode && (
            <button className="am-remove" onClick={() => removeCustomAgent(agent)} title="Remove custom agent">×</button>
          )}
        </div>

        <div className="am-tier-buttons">
          {TIERS.map(tier => {
            const isActive = val === tier.value;
            return (
              <button
                key={tier.value}
                className={`am-tier-btn ${isActive ? 'active' : ''}`}
                style={isActive ? { background: tier.bg, borderColor: tier.color, color: tier.color } : {}}
                onClick={() => devMode && setValue(agent, tier.value)}
                title={tier.desc}
                disabled={!devMode}
              >
                {tier.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const allAgents = getAllAgents(roleOverrides as any);

  const toggleRole = (agent: string, role: Role) => {
    if (!onUpdateRoleOverrides) return;
    const current = roleOverrides[agent] ?? DEFAULT_AGENT_ROLES[agent] ?? ['duelist'];
    const updated = current.includes(role)
      ? current.filter(r => r !== role)
      : [...current, role];
    if (updated.length === 0) return;
    onUpdateRoleOverrides({ ...roleOverrides, [agent]: updated as Role[] });
  };

  const isDefaultRoles = (agent: string) => {
    const def = (DEFAULT_AGENT_ROLES[agent] ?? []).slice().sort().join(',');
    const cur = (roleOverrides[agent] ?? DEFAULT_AGENT_ROLES[agent] ?? []).slice().sort().join(',');
    return def === cur;
  };

  const exportSettings = () => {
    const data = {
      _type: 'agent-meta',
      agentMeta: meta,
      agentRoleOverrides: roleOverrides,
      disabledAgents: gameState.disabledAgents ?? [],
      customAgents,
      agentAbilities: abilitiesMap,
    };
    downloadJson(data, 'agent-meta-settings.json');
  };

  const importSettings = async () => {
    try {
      const data = await uploadJson() as any;
      if (data?._type !== 'agent-meta') { showWarn('Not an agent meta export file'); return; }
      if (data.agentMeta) onUpdate(data.agentMeta);
      if (data.agentRoleOverrides) onUpdateRoleOverrides?.(data.agentRoleOverrides);
      if (data.disabledAgents) onUpdateDisabled?.(data.disabledAgents);
      if (data.customAgents) onUpdateCustomAgents?.(data.customAgents);
      if (data.agentAbilities) onUpdateAbilities?.(data.agentAbilities);
    } catch { showWarn('Failed to read file'); }
  };

  return (
    <>
      <div className="content-header">
        <h1>Agent Meta</h1>
        <div className="am-page-tabs">
          <button className={`am-page-tab ${pageTab === 'meta' ? 'active' : ''}`} onClick={() => setPageTab('meta')}>⚡ Buffs / Nerfs</button>
          <button className={`am-page-tab ${pageTab === 'roles' ? 'active' : ''}`} onClick={() => setPageTab('roles')}>🎭 Role Eligibility</button>
          <button className={`am-page-tab ${pageTab === 'abilities' ? 'active' : ''}`} onClick={() => setPageTab('abilities')}>🔥 Abilities</button>
          {devMode && (
            <div className="dt-io-btns">
              <button className="dt-io-btn" onClick={exportSettings} title="Export all agent meta settings">↓ Export</button>
              <button className="dt-io-btn" onClick={importSettings} title="Import agent meta settings from file">↑ Import</button>
            </div>
          )}
        </div>
      </div>

      {/* validation / import toast */}
      {validationWarn && (
        <div className="am-ab-warn">
          <span className="am-ab-warn-icon">⚠</span>
          {validationWarn}
        </div>
      )}

      {pageTab === 'meta' && <div className="am-page">
        <div className="am-top-bar">
          <div className="am-top-stats">
            <div className="am-stat">
              <span className="am-stat-value">{activeCount}</span>
              <span className="am-stat-label">Modified</span>
            </div>
            <div className="am-stat">
              <span className="am-stat-value am-stat-buff">{buffCount}</span>
              <span className="am-stat-label">Buffed</span>
            </div>
            <div className="am-stat">
              <span className="am-stat-value am-stat-nerf">{nerfCount}</span>
              <span className="am-stat-label">Nerfed</span>
            </div>
            {godCount > 0 && (
              <div className="am-stat">
                <span className="am-stat-value" style={{ color: '#ffd700' }}>{godCount}</span>
                <span className="am-stat-label">God-tier</span>
              </div>
            )}
            {disabledCount > 0 && (
              <div className="am-stat">
                <span className="am-stat-value" style={{ color: '#666' }}>{disabledCount}</span>
                <span className="am-stat-label">Disabled</span>
              </div>
            )}
          </div>
          <div className="am-top-actions">
            <div className="am-tier-legend">
              {TIERS.filter(t => t.value !== 0).map(t => (
                <span key={t.value} className="am-legend-item" style={{ color: t.color }}>
                  {t.label}
                </span>
              ))}
            </div>
            {devMode && (
              <button className="am-reset-all" onClick={resetAll} disabled={activeCount === 0}>
                Reset All
              </button>
            )}
          </div>
        </div>

        <div className="am-grid">
          {Object.entries(agentsByRole).map(([role, agents]) => (
            <div key={role} className="panel">
              <div className="panel-header">
                {role}
                <span className="panel-header-sub">{agents.length} agents</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                {agents.map(agent => renderAgentRow(agent, customIds.has(agent)))}
              </div>
            </div>
          ))}

          {orphanCustom.length > 0 && (
            <div className="panel am-custom-panel">
              <div className="panel-header">
                Other Custom
                <span className="panel-header-sub">{orphanCustom.length} agents</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                {orphanCustom.map(agent => renderAgentRow(agent, true))}
              </div>
            </div>
          )}
        </div>

        {devMode && (
          <div className="panel am-add-panel">
            <div className="panel-header">
              Add Custom Agent
              <span className="panel-header-sub">appears in sim agent pool</span>
            </div>
            <div className="panel-body">
              <div className="am-add-form">
                <div className="am-add-field">
                  <label className="am-add-label">Name</label>
                  <input
                    type="text"
                    className="am-add-input"
                    placeholder="e.g. Miks"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomAgent()}
                  />
                </div>
                <div className="am-add-field">
                  <label className="am-add-label">Role</label>
                  <select
                    className="am-add-select"
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                  >
                    <option value="duelist">Duelist</option>
                    <option value="controller">Controller</option>
                    <option value="initiator">Initiator</option>
                    <option value="sentinel">Sentinel</option>
                  </select>
                </div>
                <div className="am-add-field">
                  <label className="am-add-label">Icon file</label>
                  <input
                    type="text"
                    className="am-add-input"
                    placeholder="e.g. miks.png"
                    value={newIcon}
                    onChange={e => setNewIcon(e.target.value)}
                  />
                </div>
                <button
                  className="am-add-btn"
                  onClick={addCustomAgent}
                  disabled={!newName.trim()}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      }

      {pageTab === 'roles' && (
        <div className="am-roles-page">
          <div className="am-roles-hint">
            Toggle which roles each agent can be assigned. Changes apply to all agent selection logic — pick rates, pool validation, and bleed thresholds.
          </div>
          <div className="am-roles-grid">
            {allAgents.map(agent => {
              const currentRoles = (roleOverrides[agent] ?? DEFAULT_AGENT_ROLES[agent] ?? []) as Role[];
              const isModified = !isDefaultRoles(agent);
              const isDisabledAgent = disabled.has(agent);
              return (
                <div key={agent} className={`am-roles-row ${isModified ? 'modified' : ''} ${isDisabledAgent ? 'disabled-agent' : ''}`}>
                  <div className="am-agent-info">
                    <img src={getIcon(agent)} alt={agent} className="am-agent-icon" />
                    <span className="am-agent-name">
                      {capitalize(agent)}
                      {isDisabledAgent && <span className="am-disabled-badge">off</span>}
                    </span>
                    {isModified && <span className="am-roles-modified-dot" title="Modified from default" />}
                  </div>
                  <div className="am-roles-toggles">
                    {SELECTABLE_ROLES.map(role => {
                      const active = currentRoles.includes(role);
                      const isOnly = active && currentRoles.length === 1;
                      return (
                        <button
                          key={role}
                          className={`am-role-toggle ${active ? 'active' : ''} role-${role}`}
                          onClick={() => devMode && !isOnly && toggleRole(agent, role)}
                          disabled={!devMode || isOnly}
                          title={isOnly ? 'Must have at least one role' : role}
                        >
                          {role.charAt(0).toUpperCase() + role.slice(1, 4)}
                        </button>
                      );
                    })}
                    {devMode && isModified && (
                      <button
                        className="am-roles-reset-btn"
                        onClick={() => {
                          const updated = { ...roleOverrides };
                          delete updated[agent];
                          onUpdateRoleOverrides?.(updated);
                        }}
                        title="Reset to default"
                      >↺</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {pageTab === 'abilities' && (
        <div className="am-abilities-page">

          <div className="am-top-bar">
            <div className="am-top-stats">
              <div className="am-stat">
                <span className="am-stat-value">{agentsWithAbilities}</span>
                <span className="am-stat-label">Agents</span>
              </div>
              <div className="am-stat">
                <span className="am-stat-value am-stat-buff">{totalAbilityCount}</span>
                <span className="am-stat-label">Abilities</span>
              </div>
            </div>
            <div className="am-abilities-hint">
              Per-agent damaging ability data. Usage × Lethality controls how often each ability produces kills in the sim.
            </div>
          </div>

          <div className="am-grid">
            {Object.entries(agentsByRole).map(([role, agents]) => (
              <div key={role} className="panel">
                <div className="panel-header">
                  {role}
                  <span className="panel-header-sub">{agents.length} agents</span>
                </div>
                <div className="panel-body" style={{ padding: 0 }}>
                  {agents.map(agent => {
                    const abilities = getAgentAbilities(agent);
                    const isExpanded = expandedAgent === agent;
                    const isCustom = customIds.has(agent);
                    return (
                      <div key={agent} className={`am-ab-agent ${isExpanded ? 'expanded' : ''}`}>
                        <div
                          className="am-ab-agent-header"
                          onClick={() => setExpandedAgent(isExpanded ? null : agent)}
                        >
                          <div className="am-agent-info">
                            <img src={getIcon(agent)} alt={agent} className="am-agent-icon" />
                            <span className="am-agent-name">
                              {isCustom
                                ? (customAgents.find(a => a.id === agent)?.displayName ?? capitalize(agent))
                                : capitalize(agent)}
                              {isCustom && <span className="am-custom-badge">custom</span>}
                            </span>
                          </div>
                          <div className="am-ab-count-row">
                            {abilities.length > 0 && (
                              <div className="am-ab-icons">
                                {abilities.map((ab, i) => ab.icon
                                  ? <img key={i} src={ab.icon} alt={ab.name} className="am-ab-icon-tiny" title={ab.name || ab.id} />
                                  : <span key={i} className="am-ab-icon-placeholder" title={ab.name || ab.id}>{ab.type === 'ultimate' ? 'X' : ab.type === 'signature' ? 'Q' : 'C'}</span>
                                )}
                              </div>
                            )}
                            <span className={`am-ab-count ${abilities.length > 0 ? 'has-data' : ''}`}>
                              {abilities.length} {abilities.length === 1 ? 'ability' : 'abilities'}
                            </span>
                            <span className="am-ab-chevron">{isExpanded ? '▾' : '▸'}</span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="am-ab-body">
                            {abilities.map((ab, idx) => (
                              <div key={ab.id || idx} className="am-ab-card">
                                {/* row 1: type pills + name + id + remove */}
                                <div className="am-ab-row1">
                                  <div className="am-ab-type-pills">
                                    {(['basic', 'signature', 'ultimate'] as const).map(t => (
                                      <button
                                        key={t}
                                        className={`am-ab-pill ${ab.type === t ? `active type-${t}` : ''}`}
                                        onClick={() => devMode && updateAbility(agent, idx, 'type', t)}
                                        disabled={!devMode}
                                      >
                                        {t === 'basic' ? 'C' : t === 'signature' ? 'Q/E' : 'X'}
                                      </button>
                                    ))}
                                  </div>
                                  <input
                                    className="am-ab-name-input"
                                    value={ab.name}
                                    placeholder="Ability name"
                                    onChange={e => devMode && updateAbility(agent, idx, 'name', e.target.value)}
                                    disabled={!devMode}
                                  />
                                  <input
                                    className="am-ab-id-input"
                                    value={ab.id}
                                    placeholder="id"
                                    onChange={e => devMode && updateAbility(agent, idx, 'id', e.target.value)}
                                    disabled={!devMode}
                                  />
                                  {devMode && (
                                    <div className="am-ab-reorder">
                                      <button className="am-ab-arrow" onClick={() => moveAbility(agent, idx, -1)} disabled={idx === 0} title="Move up">▲</button>
                                      <button className="am-ab-arrow" onClick={() => moveAbility(agent, idx, 1)} disabled={idx === abilities.length - 1} title="Move down">▼</button>
                                    </div>
                                  )}
                                  {devMode && (
                                    <button className="am-ab-remove" onClick={() => removeAbility(agent, idx)} title="Remove ability">×</button>
                                  )}
                                </div>

                                {/* row 2: icon path */}
                                <div className="am-ab-icon-row">
                                  <span className="am-ab-lbl">Icon</span>
                                  <input
                                    className="am-ab-text-sm"
                                    value={ab.icon ?? ''}
                                    placeholder="/assets/abilities/..."
                                    onChange={e => devMode && updateAbility(agent, idx, 'icon', e.target.value || undefined)}
                                    disabled={!devMode}
                                  />
                                </div>

                                {/* row 3: usage × lethality */}
                                <div className="am-ab-axes">
                                  <div className="am-ab-axis">
                                    <span className="am-ab-lbl">Usage</span>
                                    <div className="am-ab-axis-pills">
                                      {USAGE_OPTIONS.map(u => (
                                        <button
                                          key={u}
                                          className={`am-ab-axis-pill ${ab.usage === u ? `active usage-${u}` : ''}`}
                                          onClick={() => devMode && updateAbility(agent, idx, 'usage', u)}
                                          disabled={!devMode}
                                        >
                                          {u}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="am-ab-axis">
                                    <span className="am-ab-lbl">Lethality</span>
                                    <div className="am-ab-axis-pills">
                                      {LETHALITY_OPTIONS.map(l => (
                                        <button
                                          key={l}
                                          className={`am-ab-axis-pill ${ab.lethality === l ? `active lethality-${l}` : ''}`}
                                          onClick={() => devMode && updateAbility(agent, idx, 'lethality', l)}
                                          disabled={!devMode}
                                        >
                                          {l}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="am-ab-computed">
                                    <span className="am-ab-lbl">
                                      {ab.killChance !== undefined && ab.killChance > 0 ? 'Override %' : 'Eff. kill %'}
                                    </span>
                                    {ab.killChance !== undefined && ab.killChance > 0 ? (
                                      <div className="am-ab-override-row">
                                        <input
                                          className="am-ab-override-input"
                                          defaultValue={Math.round(ab.killChance * 1000) / 10}
                                          onBlur={e => {
                                            if (!devMode) return;
                                            const v = parseFloat(e.target.value);
                                            if (isNaN(v) || v < 0 || v > 100) { showWarn('Override %: must be 0–100'); return; }
                                            updateAbility(agent, idx, 'killChance', v / 100);
                                          }}
                                          disabled={!devMode}
                                        />
                                        {devMode && (
                                          <button
                                            className="am-ab-override-clear"
                                            onClick={() => updateAbility(agent, idx, 'killChance', undefined)}
                                            title="Clear override, use Usage × Lethality"
                                          >×</button>
                                        )}
                                      </div>
                                    ) : (
                                      <span
                                        className={`am-ab-computed-val ${devMode ? 'clickable' : ''}`}
                                        onClick={() => devMode && updateAbility(agent, idx, 'killChance', getKillChance(ab))}
                                        title={devMode ? 'Click to set manual override' : ''}
                                      >
                                        {getKillChanceLabel(ab)}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* row 4: numeric fields */}
                                <div className="am-ab-nums">
                                  <div className="am-ab-f">
                                    <span className="am-ab-lbl">HS %</span>
                                    <input
                                      className="am-ab-val"
                                      defaultValue={Math.round(ab.headshotRate * 100)}
                                      onBlur={e => devMode && validateAndSet(agent, idx, 'headshotRate', e.target.value)}
                                      disabled={!devMode}
                                    />
                                  </div>
                                  <div className="am-ab-f">
                                    <span className="am-ab-lbl">Uses/rnd</span>
                                    <input
                                      className="am-ab-val"
                                      defaultValue={ab.uses}
                                      onBlur={e => devMode && validateAndSet(agent, idx, 'uses', e.target.value)}
                                      disabled={!devMode}
                                    />
                                  </div>
                                  <div className="am-ab-f">
                                    <span className="am-ab-lbl">Max kills/use</span>
                                    <input
                                      className="am-ab-val"
                                      defaultValue={ab.maxKills}
                                      onBlur={e => devMode && validateAndSet(agent, idx, 'maxKills', e.target.value)}
                                      disabled={!devMode}
                                    />
                                  </div>
                                  {ab.type === 'ultimate' && (
                                    <div className="am-ab-f">
                                      <span className="am-ab-lbl">Ult cost</span>
                                      <input
                                        className="am-ab-val"
                                        defaultValue={ab.ultCost}
                                        onBlur={e => devMode && validateAndSet(agent, idx, 'ultCost', e.target.value)}
                                        disabled={!devMode}
                                      />
                                    </div>
                                  )}
                                  {ab.type === 'ultimate' && (
                                    <div className="am-ab-f">
                                      <span className="am-ab-lbl">Util bonus</span>
                                      <input
                                        className="am-ab-val"
                                        defaultValue={ab.utilityBonus ?? 0}
                                        onBlur={e => devMode && validateAndSet(agent, idx, 'utilityBonus', e.target.value)}
                                        disabled={!devMode}
                                        title="pIndex bonus to team when activated (0 = kill ult, >0 = utility ult)"
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* row 4: toggle flags */}
                                <div className="am-ab-flags">
                                  <button
                                    className={`am-ab-flag ${ab.aoe ? 'on' : ''}`}
                                    onClick={() => devMode && updateAbility(agent, idx, 'aoe', !ab.aoe)}
                                    disabled={!devMode}
                                  >
                                    AOE
                                  </button>
                                  <button
                                    className={`am-ab-flag ${ab.refreshOnKill ? 'on' : ''}`}
                                    onClick={() => devMode && updateAbility(agent, idx, 'refreshOnKill', !ab.refreshOnKill)}
                                    disabled={!devMode}
                                  >
                                    Refresh
                                  </button>
                                  {ab.refreshOnKill && (
                                    <div className="am-ab-f" style={{ marginLeft: 2 }}>
                                      <span className="am-ab-lbl">Kills req</span>
                                      <input
                                        className="am-ab-val"
                                        defaultValue={ab.refreshKillReq}
                                        onBlur={e => devMode && validateAndSet(agent, idx, 'refreshKillReq', e.target.value)}
                                        disabled={!devMode}
                                      />
                                    </div>
                                  )}
                                  <button
                                    className={`am-ab-flag ${ab.chain ? 'on chain' : ''}`}
                                    onClick={() => devMode && updateAbility(agent, idx, 'chain', !ab.chain)}
                                    disabled={!devMode}
                                    title="100% chance to keep using this ability for subsequent kills in a round"
                                  >
                                    Chain
                                  </button>
                                  <button
                                    className={`am-ab-flag ${ab.ecoWeapon ? 'on eco' : ''}`}
                                    onClick={() => devMode && updateAbility(agent, idx, 'ecoWeapon', !ab.ecoWeapon)}
                                    disabled={!devMode}
                                    title="Auto-replaces pistol/eco tier guns (Classic, Ghost, Sheriff) — player always uses this ability over bad weapons"
                                  >
                                    Eco weapon
                                  </button>
                                </div>

                                {/* row 5: ult config — timing/rates for utility ults, economy for kill ults */}
                                {ab.type === 'ultimate' && (
                                  <div className="am-ab-ult-timing">
                                    {ab.ultTiming || (ab.utilityBonus ?? 0) > 0 ? (
                                      <>
                                        <div className="am-ab-axis">
                                          <span className="am-ab-lbl">Ult timing</span>
                                          <div className="am-ab-axis-pills">
                                            {ULT_TIMING_OPTIONS.map(t => (
                                              <button
                                                key={t}
                                                className={`am-ab-axis-pill ${ab.ultTiming === t ? `active timing-${t}` : ''}`}
                                                onClick={() => devMode && updateAbility(agent, idx, 'ultTiming', t)}
                                                disabled={!devMode}
                                                title={
                                                  t === 'preRound' ? 'Fires before duels start (execute ults)' :
                                                  t === 'reactive' ? 'Fires after own team loses a player (defense holds)' :
                                                  t === 'midRound' ? 'Fires after 2+ duels regardless of deaths' :
                                                  t === 'corpseEnemy' ? 'Needs an enemy corpse to cast (cypher)' :
                                                  t === 'allyRes' ? 'Revives a dead teammate mid-round (sage)' :
                                                  'Self-resurrects on death, must get a kill to survive (clove)'
                                                }
                                              >
                                                {ULT_TIMING_LABELS[t]}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                        {/* rate inputs — only for timings that use them (not allyRes/selfRes) */}
                                        {ab.ultTiming && ab.ultTiming !== 'allyRes' && ab.ultTiming !== 'selfRes' && (
                                          <div className="am-ab-nums" style={{ marginTop: 6 }}>
                                            <div className="am-ab-f">
                                              <span className="am-ab-lbl">Atk rate %</span>
                                              <input
                                                className="am-ab-val"
                                                defaultValue={Math.round((ab.ultAttackRate ?? 0.80) * 100)}
                                                onBlur={e => {
                                                  if (!devMode) return;
                                                  const v = parseInt(e.target.value);
                                                  if (isNaN(v) || v < 0 || v > 100) { showWarn('Atk rate: must be 0–100'); return; }
                                                  updateAbility(agent, idx, 'ultAttackRate', v / 100);
                                                }}
                                                disabled={!devMode}
                                                title="Chance to use ult on attack side (0-100%)"
                                              />
                                            </div>
                                            <div className="am-ab-f">
                                              <span className="am-ab-lbl">Def rate %</span>
                                              <input
                                                className="am-ab-val"
                                                defaultValue={Math.round((ab.ultDefenseRate ?? 0.80) * 100)}
                                                onBlur={e => {
                                                  if (!devMode) return;
                                                  const v = parseInt(e.target.value);
                                                  if (isNaN(v) || v < 0 || v > 100) { showWarn('Def rate: must be 0–100'); return; }
                                                  updateAbility(agent, idx, 'ultDefenseRate', v / 100);
                                                }}
                                                disabled={!devMode}
                                                title="Chance to use ult on defense side (0-100%)"
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="am-ab-flags">
                                        <button
                                          className={`am-ab-flag ${ab.ultEconomy ? 'on economy' : ''}`}
                                          onClick={() => devMode && updateAbility(agent, idx, 'ultEconomy', !ab.ultEconomy)}
                                          disabled={!devMode}
                                          title="Ult replaces rifle buy — player buys a pistol and uses ult weapon instead (saves team money)"
                                        >
                                          Ult economy
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                            {devMode && (
                              <button className="am-ab-add" onClick={() => addAbility(agent)}>+ Add ability</button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
