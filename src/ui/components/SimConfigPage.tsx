// src/ui/components/SimConfigPage.tsx
import { useState } from 'react';
import type { ChurnConfig } from '../../sim/offseasonChurn';
import { DEFAULT_CHURN_CONFIG } from '../../sim/offseasonChurn';
import type { MatchSimConfig } from '../../data/matchSimConfig';
import { DEFAULT_MATCH_SIM_CONFIG, WEAPON_ORDER, BUY_STATE_ORDER, DEFAULT_HEADSHOT_CHANCE, DEFAULT_WALLBANG_CHANCE, DEFAULT_BUY_STATE_MODS } from '../../data/matchSimConfig';
import { downloadJson, uploadJson } from '../../utils/devToolsIO';
import { LEGACY_AGENTS } from '../../utils/agentIcons';
import './SimConfigPage.css';

interface Props {
  config: ChurnConfig | undefined;
  onChange: (cfg: ChurnConfig) => void;
  matchSimConfig?: MatchSimConfig;
  onChangeMatchSim?: (cfg: MatchSimConfig) => void;
  legacyAgentIcons?: string[];
  onChangeLegacyIcons?: (icons: string[]) => void;
}

// ── Presets ─────────────────────────────────────────────────────────────────
interface Preset {
  id: string;
  label: string;
  emoji: string;
  desc: string;
  config: ChurnConfig;
}

const PRESETS: Preset[] = [
  {
    id: 'no-moves',
    label: 'No Moves',
    emoji: '🔒',
    desc: 'Rosters never change. Pure skill determines results.',
    config: { releaseScoreCeiling: 0, sameRegionWeight: 1.0, crossRegionWeight: 0.0, tier1Quota: 0, tier2Quota: 0, tier3Quota: 0 },
  },
  {
    id: 'realistic',
    label: 'Realistic',
    emoji: '⚖️',
    desc: 'Mirrors real VCT: occasional cuts, strong regional loyalty.',
    config: { releaseScoreCeiling: 50, sameRegionWeight: 1.0, crossRegionWeight: 0.25, tier1Quota: 0, tier2Quota: 1, tier3Quota: 1 },
  },
  {
    id: 'active',
    label: 'Active Market',
    emoji: '📈',
    desc: 'More player movement each offseason. Rosters shuffle regularly.',
    config: { releaseScoreCeiling: 65, sameRegionWeight: 1.0, crossRegionWeight: 0.4, tier1Quota: 1, tier2Quota: 2, tier3Quota: 2 },
  },
  {
    id: 'global',
    label: 'Global League',
    emoji: '🌐',
    desc: 'No regional barriers — players sign anywhere freely.',
    config: { releaseScoreCeiling: 50, sameRegionWeight: 1.0, crossRegionWeight: 1.0, tier1Quota: 0, tier2Quota: 1, tier3Quota: 1 },
  },
  {
    id: 'chaos',
    label: 'Max Chaos',
    emoji: '💥',
    desc: 'Everyone is on the move. Rosters blow up every offseason.',
    config: { releaseScoreCeiling: 80, sameRegionWeight: 1.0, crossRegionWeight: 1.0, tier1Quota: 2, tier2Quota: 2, tier3Quota: 3 },
  },
];

function configsMatch(a: ChurnConfig, b: ChurnConfig): boolean {
  return (Object.keys(a) as (keyof ChurnConfig)[]).every(k => a[k] === b[k]);
}

function Slider({ label, hint, value, min, max, step = 1, format, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; step?: number;
  format?: (v: number) => string; onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = format ? format(value) : String(value);
  return (
    <div className="sc-row">
      <div className="sc-label-row">
        <span className="sc-label">{label}</span>
        <span className="sc-value">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        className="sc-slider"
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="sc-hint">{hint}</span>
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="sc-section">
      <div className="sc-section-header">
        <span className="sc-section-icon">{icon}</span>
        <span className="sc-section-title">{title}</span>
      </div>
      <div className="sc-section-body">
        {children}
      </div>
    </div>
  );
}

export function SimConfigPage({ config, onChange, matchSimConfig, onChangeMatchSim, legacyAgentIcons = [], onChangeLegacyIcons }: Props) {
  const cfg = { ...DEFAULT_CHURN_CONFIG, ...config };
  const [pageTab, setPageTab] = useState<'churn' | 'matchsim'>('churn');

  // match sim config
  const msCfg = { ...DEFAULT_MATCH_SIM_CONFIG, ...matchSimConfig };

  const set = (key: keyof ChurnConfig, val: number) => {
    onChange({ ...cfg, [key]: val });
  };

  const reset = () => {
    onChange({ ...DEFAULT_CHURN_CONFIG });
  };

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const TIER_LABELS = [
    { key: 'tier1Quota' as const, label: 'Tier 1 — Decent run', hint: 'Won multiple bracket matches, missed Champions.', color: '#5d5' },
    { key: 'tier2Quota' as const, label: 'Tier 2 — Average', hint: 'Won a match or two before exiting.', color: '#59c9ff' },
    { key: 'tier3Quota' as const, label: 'Tier 3 — Early exit', hint: 'Lost in the first round.', color: '#ff6b35' },
  ];

  const activePreset = PRESETS.find(p => configsMatch(p.config, cfg))?.id ?? null;

  // match sim helpers
  const setMs = (patch: Partial<MatchSimConfig>) => {
    onChangeMatchSim?.({ ...msCfg, ...patch });
  };
  const setHs = (weapon: string, val: number) => {
    onChangeMatchSim?.({ ...msCfg, headshotChance: { ...msCfg.headshotChance, [weapon]: val } });
  };
  const setWb = (weapon: string, val: number) => {
    onChangeMatchSim?.({ ...msCfg, wallbangChance: { ...msCfg.wallbangChance, [weapon]: val } });
  };
  const setBuy = (state: string, val: number) => {
    onChangeMatchSim?.({ ...msCfg, buyStateMods: { ...msCfg.buyStateMods, [state]: val } });
  };
  const resetMs = () => {
    onChangeMatchSim?.({ ...DEFAULT_MATCH_SIM_CONFIG });
  };
  const exportMs = () => downloadJson({ _type: 'match-sim-config', ...msCfg }, 'match-sim-config.json');
  const importMs = async () => {
    try {
      const data = await uploadJson() as any;
      if (data?._type !== 'match-sim-config') return;
      const { _type, ...rest } = data;
      onChangeMatchSim?.({ ...DEFAULT_MATCH_SIM_CONFIG, ...rest });
    } catch { /* ignore */ }
  };

  return (
    <div className="sc-page">
      <div className="sc-page-header">
        <div>
          <h1 className="sc-title">Sim Config</h1>
          <div className="sc-page-tabs">
            <button className={`am-page-tab ${pageTab === 'churn' ? 'active' : ''}`} onClick={() => setPageTab('churn')}>🔄 Offseason</button>
            <button className={`am-page-tab ${pageTab === 'matchsim' ? 'active' : ''}`} onClick={() => setPageTab('matchsim')}>🎯 Match Sim</button>
          </div>
        </div>
        {pageTab === 'churn' && (
          <div className="sc-header-actions">
            <button className="btn btn-ghost sc-btn-reset" onClick={reset}>Reset defaults</button>
          </div>
        )}
        {pageTab === 'matchsim' && (
          <div className="sc-header-actions">
            <div className="dt-io-btns">
              <button className="dt-io-btn" onClick={exportMs}>↓ Export</button>
              <button className="dt-io-btn" onClick={importMs}>↑ Import</button>
            </div>
            <button className="btn btn-ghost sc-btn-reset" onClick={resetMs}>Reset defaults</button>
          </div>
        )}
      </div>

      {pageTab === 'churn' && <>
      <p className="sc-subtitle">Tune AI roster behaviour between seasons</p>

      {/* presets */}
      <div className="sc-presets">
        {PRESETS.map(p => (
          <button
            key={p.id}
            className={`sc-preset-btn ${activePreset === p.id ? 'active' : ''}`}
            onClick={() => onChange({ ...p.config })}
            title={p.desc}
          >
            <span className="sc-preset-emoji">{p.emoji}</span>
            <span className="sc-preset-label">{p.label}</span>
            <span className="sc-preset-desc">{p.desc}</span>
          </button>
        ))}
      </div>

      <div className="sc-body">

        <Section icon="✂️" title="Release Frequency">
          <p className="sc-desc">
            Controls how many players AI teams cut each offseason based on their bracket performance.
          </p>
          <div className="sc-field-group">
            <Slider
              label="Release score ceiling"
              hint="Players scoring above this threshold are untouchable. Raise it for more aggressive cuts."
              value={cfg.releaseScoreCeiling} min={30} max={80}
              onChange={v => set('releaseScoreCeiling', v)}
            />
          </div>
          <div className="sc-tier-grid">
            {TIER_LABELS.map(t => (
              <div key={t.key} className="sc-tier-card">
                <div className="sc-tier-top">
                  <span className="sc-tier-label" style={{ color: t.color }}>{t.label}</span>
                  <span className="sc-tier-val" style={{ color: t.color }}>{cfg[t.key]}</span>
                </div>
                <input
                  type="range" min={0} max={t.key === 'tier3Quota' ? 3 : 2} step={1}
                  value={cfg[t.key]}
                  className="sc-slider"
                  style={{ '--pct': `${(cfg[t.key] / (t.key === 'tier3Quota' ? 3 : 2)) * 100}%` } as React.CSSProperties}
                  onChange={e => set(t.key, Number(e.target.value))}
                />
                <span className="sc-tier-hint">{t.hint}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section icon="🌍" title="Regional Affinity">
          <p className="sc-desc">
            How strongly AI teams prefer players from their own region when signing free agents.
            NA↔EU transfers happen freely. NA/EU↔Pacific/China face an additional language-barrier penalty regardless of this setting.
          </p>
          <div className="sc-affinity-grid">
            <Slider
              label="Same-region weight"
              hint="Multiplier on a player's OVR when they're from the signing team's region. Keep at 100%."
              value={cfg.sameRegionWeight} min={0.5} max={1.0} step={0.05} format={pct}
              onChange={v => set('sameRegionWeight', v)}
            />
            <Slider
              label="Cross-region weight"
              hint="0% = players never cross regions. 100% = fully global league."
              value={cfg.crossRegionWeight} min={0} max={1.0} step={0.05} format={pct}
              onChange={v => set('crossRegionWeight', v)}
            />
            <div className="sc-preview">
              <span className="sc-preview-label">80 OVR · Role match · Effective signing score</span>
              <div className="sc-preview-bars">
                <div className="sc-bar-row">
                  <span>Same region</span>
                  <div className="sc-bar-track">
                    <div className="sc-bar sc-bar-same" style={{ width: `${Math.min(100, cfg.sameRegionWeight * 100)}%` }} />
                  </div>
                  <span className="sc-bar-val" style={{ color: '#0ac8b9' }}>{Math.round(cfg.sameRegionWeight * 80 * 1.15)}</span>
                </div>
                <div className="sc-bar-row">
                  <span>Cross-region (NA↔EU)</span>
                  <div className="sc-bar-track">
                    <div className="sc-bar sc-bar-cross" style={{ width: `${Math.min(100, cfg.crossRegionWeight * 100)}%` }} />
                  </div>
                  <span className="sc-bar-val" style={{ color: '#ffc048' }}>{Math.round(cfg.crossRegionWeight * 80 * 1.15)}</span>
                </div>
                <div className="sc-bar-row">
                  <span>Cross-group (NA↔Pacific)</span>
                  <div className="sc-bar-track">
                    <div className="sc-bar sc-bar-barrier" style={{ width: `${Math.min(100, cfg.crossRegionWeight * 0.08 * 100)}%` }} />
                  </div>
                  <span className="sc-bar-val" style={{ color: '#888' }}>{Math.round(cfg.crossRegionWeight * 0.08 * 80 * 1.15)}</span>
                </div>
              </div>
            </div>
          </div>
        </Section>

      </div>

      <p className="sc-footer-note">Changes take effect at the start of the next offseason.</p>
      </>}

      {pageTab === 'matchsim' && <>
      <p className="sc-subtitle">Tune combat mechanics, weapon stats, and economy. Changes apply to all future matches.</p>

      <div className="sc-body">
        <Section icon="⚔️" title="Combat">
          <div className="sc-field-group">
            <Slider
              label="Trade chance"
              hint="Probability a teammate swings after a kill. Higher = more trades, shorter rounds."
              value={msCfg.tradeChance} min={0} max={1} step={0.05} format={pct}
              onChange={v => setMs({ tradeChance: v })}
            />
            <Slider
              label="Assist base chance"
              hint="Base probability of an assist per kill. Initiators and controllers add to this."
              value={msCfg.assistBaseChance} min={0} max={1} step={0.05} format={pct}
              onChange={v => setMs({ assistBaseChance: v })}
            />
            <Slider
              label="Adaptation strength"
              hint="Multiplier on diminishing returns for hot players. 0 = off (no penalty), 2 = double penalty."
              value={msCfg.adaptationStrength} min={0} max={2} step={0.1}
              format={v => `${v.toFixed(1)}x`}
              onChange={v => setMs({ adaptationStrength: v })}
            />
            <Slider
              label="Momentum strength"
              hint="Controls momentum, hot hand, and series confidence. 0 = off, 1 = normal, 2 = legendary mode (more upsets & cinderella runs)."
              value={msCfg.momentumStrength ?? 1} min={0} max={2} step={1}
              format={v => v === 0 ? 'Off' : v === 1 ? 'Normal' : 'Legendary'}
              onChange={v => setMs({ momentumStrength: v })}
            />
          </div>
        </Section>

        <Section icon="🔫" title="Weapon Headshot %">
          <p className="sc-desc">Per-weapon chance of a headshot on gun kills (0–100). Does not affect ability kills.</p>
          <div className="sc-weapon-grid">
            {WEAPON_ORDER.map(w => {
              const val = Math.round((msCfg.headshotChance[w] ?? DEFAULT_HEADSHOT_CHANCE[w] ?? 0.25) * 100);
              const def = Math.round((DEFAULT_HEADSHOT_CHANCE[w] ?? 0.25) * 100);
              const isModified = val !== def;
              return (
                <div key={w} className={`sc-weapon-row ${isModified ? 'modified' : ''}`}>
                  <span className="sc-weapon-name">{w}</span>
                  <input
                    className="sc-weapon-val"
                    defaultValue={val}
                    onBlur={e => {
                      const n = parseInt(e.target.value);
                      if (isNaN(n) || n < 0 || n > 100) return;
                      setHs(w, n / 100);
                    }}
                  />
                  <span className="sc-weapon-def">{def}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section icon="🧱" title="Weapon Wallbang %">
          <p className="sc-desc">Per-weapon chance of a wallbang on gun kills (0–100).</p>
          <div className="sc-weapon-grid">
            {WEAPON_ORDER.map(w => {
              const val = Math.round((msCfg.wallbangChance[w] ?? DEFAULT_WALLBANG_CHANCE[w] ?? 0.05) * 100);
              const def = Math.round((DEFAULT_WALLBANG_CHANCE[w] ?? 0.05) * 100);
              const isModified = val !== def;
              return (
                <div key={w} className={`sc-weapon-row ${isModified ? 'modified' : ''}`}>
                  <span className="sc-weapon-name">{w}</span>
                  <input
                    className="sc-weapon-val"
                    defaultValue={val}
                    onBlur={e => {
                      const n = parseInt(e.target.value);
                      if (isNaN(n) || n < 0 || n > 100) return;
                      setWb(w, n / 100);
                    }}
                  />
                  <span className="sc-weapon-def">{def}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section icon="💰" title="Economy — Buy State Modifiers">
          <p className="sc-desc">pIndex modifier applied to every player based on buy state. More negative = bigger disadvantage.</p>
          <div className="sc-weapon-grid">
            {BUY_STATE_ORDER.map(s => {
              const val = msCfg.buyStateMods[s] ?? DEFAULT_BUY_STATE_MODS[s] ?? 0;
              const def = DEFAULT_BUY_STATE_MODS[s] ?? 0;
              const isModified = val !== def;
              return (
                <div key={s} className={`sc-weapon-row ${isModified ? 'modified' : ''}`}>
                  <span className="sc-weapon-name" style={{ textTransform: 'capitalize' }}>{s}</span>
                  <input
                    className="sc-weapon-val"
                    defaultValue={val}
                    onBlur={e => {
                      const n = parseInt(e.target.value);
                      if (isNaN(n) || n < -100 || n > 50) return;
                      setBuy(s, n);
                    }}
                  />
                  <span className="sc-weapon-def">{def}</span>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* visual settings */}
      {onChangeLegacyIcons && (
        <div className="sc-section-block">
          <Section title="Visual Settings" desc="Cosmetic options that don't affect simulation.">
            <div className="sc-legacy-icons">
              <div className="sc-legacy-label">Legacy Agent Icons</div>
              <div className="sc-legacy-desc">Use older agent artwork where available</div>
              <div className="sc-legacy-grid">
                {Object.entries(LEGACY_AGENTS).map(([id, file]) => {
                  const isOn = legacyAgentIcons.includes(id);
                  return (
                    <button
                      key={id}
                      className={`sc-legacy-tile ${isOn ? 'active' : ''}`}
                      onClick={() => {
                        const next = isOn
                          ? legacyAgentIcons.filter(a => a !== id)
                          : [...legacyAgentIcons, id];
                        onChangeLegacyIcons(next);
                      }}
                      title={`${id} — ${isOn ? 'using legacy' : 'using current'}`}
                    >
                      <div className="sc-legacy-tile-imgs">
                        <img src={`/logos/agents/${id}.png`} alt="" className={`sc-legacy-img ${!isOn ? 'current' : ''}`} />
                        <img src={`/logos/agents/${file}`} alt="" className={`sc-legacy-img ${isOn ? 'current' : ''}`} />
                      </div>
                      <span className="sc-legacy-tile-name">{id}</span>
                      <span className={`sc-legacy-tile-badge ${isOn ? 'on' : 'off'}`}>{isOn ? 'Legacy' : 'Current'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>
        </div>
      )}
      </>}
    </div>
  );
}
