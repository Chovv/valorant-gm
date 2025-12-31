// src/ui/components/PlayerDetailPage.tsx
// Comprehensive player detail page with ratings, stats, potential, and career history

import { useState, useMemo } from 'react';
import type { Player, Team, Role } from '../../types';
import { toLetterGrade, getGradeClass } from '../../utils/letterGrade';
import { ALL_ARCHETYPES } from '../../data/archetypes';
import { PlayerStatsTable } from './PlayerStatsTable';
import { PlayerAvatar } from './PlayerAvatar';
import './PlayerDetailPage.css';

const ROLE_ICONS: Record<Role, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

interface PlayerOVRInfo {
  baseOvr: number;
  effectiveOvr: number;
  rolePenalty: number;
  iglBonus: number;
  compositionPenalty: number;
  isStarter: boolean;
  assignedRole: Role;
}

interface PlayerDetailPageProps {
  player: Player;
  team: Team;
  ovrInfo: PlayerOVRInfo;
  onBack: () => void;
  onViewMatch: (matchId: string) => void;
  onEditPlayer?: () => void;
  canEdit: boolean;
}

export function PlayerDetailPage({
  player,
  team,
  ovrInfo,
  onBack,
  onViewMatch,
  onEditPlayer,
  canEdit,
}: PlayerDetailPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'ratings' | 'stats'>('overview');

  // Calculate development phase
  const developmentPhase = useMemo(() => {
    const age = player.age;
    const peakAge = player.development.peakAge;
    
    if (age < peakAge - 2) return { label: 'Developing', color: '#22c55e', icon: '📈' };
    if (age <= peakAge + 1) return { label: 'Prime', color: '#fbbf24', icon: '⭐' };
    if (age <= peakAge + 3) return { label: 'Veteran', color: '#f97316', icon: '🎖️' };
    return { label: 'Declining', color: '#ef4444', icon: '📉' };
  }, [player.age, player.development.peakAge]);

  // Calculate potential progress
  const potentialProgress = useMemo(() => {
    const { floor, ceiling } = player.potential;
    const current = player.overall;
    const range = ceiling - floor;
    const progress = range > 0 ? ((current - floor) / range) * 100 : 100;
    return Math.min(100, Math.max(0, progress));
  }, [player.potential, player.overall]);

  // Agent pool sorted by priority
  const sortedAgentPool = useMemo(() => {
    return Object.entries(player.agentPool)
      .sort((a, b) => b[1] - a[1])
      .map(([agent, priority]) => ({
        agent,
        priority,
        label: priority >= 75 ? 'Main' : priority >= 50 ? 'Secondary' : 'Pocket',
        color: priority >= 75 ? '#fbbf24' : priority >= 50 ? '#0ac8b9' : '#6b7280',
      }));
  }, [player.agentPool]);

  // Rating weights for the player's role
  const ratingConfig = useMemo(() => {
    const configs: Record<Role, Array<{ key: keyof Player['ratings']; label: string; icon: string; weight: number }>> = {
      duelist: [
        { key: 'aim', label: 'Aim', icon: '🎯', weight: 35 },
        { key: 'clutchFactor', label: 'Clutch', icon: '💎', weight: 20 },
        { key: 'gameSense', label: 'Game Sense', icon: '🧠', weight: 20 },
        { key: 'sprayControl', label: 'Spray Control', icon: '🔫', weight: 15 },
        { key: 'utilityUsage', label: 'Utility', icon: '💨', weight: 5 },
        { key: 'communication', label: 'Comms', icon: '📢', weight: 5 },
      ],
      controller: [
        { key: 'utilityUsage', label: 'Utility', icon: '💨', weight: 30 },
        { key: 'gameSense', label: 'Game Sense', icon: '🧠', weight: 25 },
        { key: 'communication', label: 'Comms', icon: '📢', weight: 20 },
        { key: 'aim', label: 'Aim', icon: '🎯', weight: 15 },
        { key: 'clutchFactor', label: 'Clutch', icon: '💎', weight: 5 },
        { key: 'sprayControl', label: 'Spray Control', icon: '🔫', weight: 5 },
      ],
      initiator: [
        { key: 'utilityUsage', label: 'Utility', icon: '💨', weight: 30 },
        { key: 'gameSense', label: 'Game Sense', icon: '🧠', weight: 25 },
        { key: 'aim', label: 'Aim', icon: '🎯', weight: 20 },
        { key: 'communication', label: 'Comms', icon: '📢', weight: 15 },
        { key: 'clutchFactor', label: 'Clutch', icon: '💎', weight: 5 },
        { key: 'sprayControl', label: 'Spray Control', icon: '🔫', weight: 5 },
      ],
      sentinel: [
        { key: 'gameSense', label: 'Game Sense', icon: '🧠', weight: 25 },
        { key: 'utilityUsage', label: 'Utility', icon: '💨', weight: 25 },
        { key: 'clutchFactor', label: 'Clutch', icon: '💎', weight: 20 },
        { key: 'aim', label: 'Aim', icon: '🎯', weight: 15 },
        { key: 'communication', label: 'Comms', icon: '📢', weight: 10 },
        { key: 'sprayControl', label: 'Spray Control', icon: '🔫', weight: 5 },
      ],
      flex: [
        { key: 'gameSense', label: 'Game Sense', icon: '🧠', weight: 25 },
        { key: 'aim', label: 'Aim', icon: '🎯', weight: 20 },
        { key: 'utilityUsage', label: 'Utility', icon: '💨', weight: 20 },
        { key: 'clutchFactor', label: 'Clutch', icon: '💎', weight: 15 },
        { key: 'communication', label: 'Comms', icon: '📢', weight: 10 },
        { key: 'sprayControl', label: 'Spray Control', icon: '🔫', weight: 10 },
      ],
    };
    return configs[player.role] || configs.flex;
  }, [player.role]);

  const isIGL = team.iglId === player.id;

  return (
    <div className="player-detail-page">
      {/* Back Button */}
      <button className="back-button" onClick={onBack}>
        ← Back to {team.name}
      </button>

      {/* Hero Section */}
      <div className="player-hero">
        <div className="hero-left">
          <PlayerAvatar
            playerId={player.id}
            playerName={player.name}
            imageUrl={player.imageUrl}
            size="xl"
            className="player-avatar-hero rectangular"
          />
          <div className="player-info">
              <h1 className="player-name">{player.name}</h1>
              <div className="player-meta">
                <div className={`role-tag role-${player.role}`}>
                  <img src={ROLE_ICONS[player.role]} alt="" className="role-icon-small" />
                  {player.role.toUpperCase()}
                </div>
                <span className="team-name">{team.name}</span>
                <span className="player-age">Age {player.age}</span>
                {isIGL && <span className="igl-badge">IGL</span>}
              </div>
              <div className="archetype-tag">
                {ALL_ARCHETYPES[player.archetype]?.name || player.archetype.replace(/_/g, ' ')}
              </div>
            </div>
        </div>

        <div className="hero-right">
          <div className="ovr-display">
            <div className="ovr-circle">
              <span className="ovr-value">{ovrInfo.effectiveOvr}</span>
              <span className="ovr-label">{ovrInfo.isStarter ? 'EFF' : 'OVR'}</span>
            </div>
            {ovrInfo.isStarter && (
              <div className="ovr-breakdown">
                <div className="breakdown-row base-row">
                  <span className="breakdown-label">Base</span>
                  <span className="breakdown-value">{ovrInfo.baseOvr}</span>
                </div>
                {ovrInfo.rolePenalty !== 0 && (
                  <div className={`breakdown-row ${ovrInfo.rolePenalty > 0 ? 'positive' : 'negative'}`}>
                    <span className="breakdown-label">Role</span>
                    <span className="breakdown-value">{ovrInfo.rolePenalty > 0 ? '+' : ''}{ovrInfo.rolePenalty}</span>
                  </div>
                )}
                {ovrInfo.iglBonus !== 0 && (
                  <div className={`breakdown-row ${ovrInfo.iglBonus > 0 ? 'positive' : 'negative'}`}>
                    <span className="breakdown-label">IGL</span>
                    <span className="breakdown-value">{ovrInfo.iglBonus > 0 ? '+' : ''}{ovrInfo.iglBonus}</span>
                  </div>
                )}
                {ovrInfo.compositionPenalty !== 0 && (
                  <div className="breakdown-row comp-penalty" title="Team is missing a core role">
                    <span className="breakdown-label">Comp</span>
                    <span className="breakdown-value">{ovrInfo.compositionPenalty}</span>
                  </div>
                )}
                {ovrInfo.assignedRole !== player.role && (
                  <div className="breakdown-row off-role">
                    <span className="breakdown-label">Playing</span>
                    <span className={`breakdown-value role-text role-${ovrInfo.assignedRole}`}>
                      {ovrInfo.assignedRole.charAt(0).toUpperCase() + ovrInfo.assignedRole.slice(1)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {canEdit && onEditPlayer && (
            <button className="edit-button" onClick={onEditPlayer}>
              ✏️ Edit Player
            </button>
          )}
        </div>
      </div>

      {/* Development Phase Banner */}
      <div className="development-banner" style={{ borderColor: developmentPhase.color }}>
        <span className="phase-icon">{developmentPhase.icon}</span>
        <span className="phase-label" style={{ color: developmentPhase.color }}>
          {developmentPhase.label}
        </span>
        <span className="phase-detail">
          Peak Age: {player.development.peakAge} • Current: {player.age}
        </span>
      </div>

      {/* Tab Navigation */}
      <div className="detail-tabs">
        <button
          className={`detail-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📋 Overview
        </button>
        <button
          className={`detail-tab ${activeTab === 'ratings' ? 'active' : ''}`}
          onClick={() => setActiveTab('ratings')}
        >
          📊 Ratings
        </button>
        <button
          className={`detail-tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          🏆 Career Stats
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="overview-grid">
            {/* Potential Card */}
            <div className="detail-card potential-card">
              <h3>Potential</h3>
              <div className="potential-visual">
                <div className="potential-bar-container">
                  <div className="potential-scale">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                    <span>75</span>
                    <span>99</span>
                  </div>
                  <div className="potential-bar">
                    <div
                      className="potential-range"
                      style={{
                        left: `${player.potential.floor}%`,
                        width: `${player.potential.ceiling - player.potential.floor}%`,
                      }}
                    />
                    <div
                      className="potential-current"
                      style={{ left: `${player.overall}%` }}
                    />
                  </div>
                  <div className="potential-labels">
                    <span className="floor-label" style={{ left: `${player.potential.floor}%` }}>
                      {player.potential.floor}
                    </span>
                    <span className="current-label" style={{ left: `${player.overall}%` }}>
                      {player.overall}
                    </span>
                    <span className="ceiling-label" style={{ left: `${player.potential.ceiling}%` }}>
                      {player.potential.ceiling}
                    </span>
                  </div>
                </div>
                <div className="potential-stats">
                  <div className="pot-stat">
                    <span className="pot-label">Floor</span>
                    <span className="pot-value floor">{player.potential.floor}</span>
                  </div>
                  <div className="pot-stat">
                    <span className="pot-label">Current</span>
                    <span className="pot-value current">{player.overall}</span>
                  </div>
                  <div className="pot-stat">
                    <span className="pot-label">Ceiling</span>
                    <span className="pot-value ceiling">{player.potential.ceiling}</span>
                  </div>
                </div>
                <div className="potential-progress-bar">
                  <div className="progress-fill" style={{ width: `${potentialProgress}%` }} />
                  <span className="progress-text">{potentialProgress.toFixed(0)}% of potential reached</span>
                </div>
              </div>
            </div>

            {/* Agent Pool Card */}
            <div className="detail-card agents-card">
              <h3>Agent Pool</h3>
              <div className="agents-grid">
                {sortedAgentPool.map(({ agent,  label, color }) => (
                  <div key={agent} className="agent-item" style={{ borderColor: color }}>
                    <img
                      src={`/logos/agents/${agent.toLowerCase()}.png`}
                      alt={agent}
                      className="agent-icon"
                    />
                    <span className="agent-name">{agent}</span>
                    <span className="agent-priority" style={{ backgroundColor: color }}>
                      {label}
                    </span>
                  </div>
                ))}
                {sortedAgentPool.length === 0 && (
                  <div className="no-agents">No agents in pool</div>
                )}
              </div>
            </div>

            {/* Info Card */}
            <div className="detail-card info-card">
              <h3>Player Info</h3>
              <div className="info-rows">
                <div className="info-row">
                  <span className="info-label">Background</span>
                  <span className="info-value">{player.background.replace(/_/g, ' ')}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Years in League</span>
                  <span className="info-value">{player.yearsInLeague}</span>
                </div>
                {player.contract ? (
                  <>
                    <div className="info-row">
                      <span className="info-label">Salary</span>
                      <span className="info-value">${player.contract.salary.toLocaleString()}/yr</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Contract</span>
                      <span className="info-value">{player.contract.yearsRemaining} year(s) left</span>
                    </div>
                  </>
                ) : (
                  <div className="info-row">
                    <span className="info-label">Status</span>
                    <span className="info-value free-agent">Free Agent</span>
                  </div>
                )}
              </div>
            </div>

            {/* Personality Card */}
            <div className="detail-card personality-card">
              <h3>Personality</h3>
              <div className="personality-grid">
                {[
                  { key: 'leadership', label: 'Leadership', icon: '👑' },
                  { key: 'workEthic', label: 'Work Ethic', icon: '💪' },
                  { key: 'mentality', label: 'Mentality', icon: '🧠' },
                  { key: 'teamPlayer', label: 'Team Player', icon: '🤝' },
                  { key: 'coachability', label: 'Coachability', icon: '📚' },
                ].map(({ key, label, icon }) => {
                  const value = player.personality[key as keyof typeof player.personality];
                  const grade = toLetterGrade(value);
                  const gradeClass = getGradeClass(grade);
                  return (
                    <div key={key} className="personality-item">
                      <span className="pers-icon">{icon}</span>
                      <span className="pers-label">{label}</span>
                      <span className={`pers-grade ${gradeClass}`}>{grade}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Development Card */}
            <div className="detail-card development-card">
              <h3>Development</h3>
              <div className="dev-stats">
                <div className="dev-stat">
                  <span className="dev-label">Peak Age</span>
                  <span className="dev-value">{player.development.peakAge}</span>
                </div>
                <div className="dev-stat" title={`Higher = faster skill improvement during training/offseason. At ${(player.development.learningRate * 100).toFixed(0)}%, this player gains ~${(player.development.learningRate * 3).toFixed(1)} rating points per offseason (before age adjustments).`}>
                  <span className="dev-label">Learning Rate <span className="tooltip-icon">ⓘ</span></span>
                  <div className="dev-bar">
                    <div
                      className="dev-bar-fill learning"
                      style={{ width: `${player.development.learningRate * 100}%` }}
                    />
                  </div>
                  <span className="dev-percent">{(player.development.learningRate * 100).toFixed(0)}%</span>
                </div>
                <div className="dev-stat" title={`Higher = more unpredictable year-to-year rating changes. At ${(player.development.volatility * 100).toFixed(0)}%, ratings can swing ±${(player.development.volatility * 5).toFixed(1)} points randomly each season.`}>
                  <span className="dev-label">Volatility <span className="tooltip-icon">ⓘ</span></span>
                  <div className="dev-bar">
                    <div
                      className="dev-bar-fill volatility"
                      style={{ width: `${player.development.volatility * 100}%` }}
                    />
                  </div>
                  <span className="dev-percent">{(player.development.volatility * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ratings Tab */}
        {activeTab === 'ratings' && (
          <div className="ratings-section">
            <div className="ratings-grid">
              {ratingConfig.map(({ key, label, icon, weight }) => {
                const value = player.ratings[key];
                const grade = toLetterGrade(value);
                const gradeClass = getGradeClass(grade);
                
                return (
                  <div key={key} className="rating-card">
                    <div className="rating-header">
                      <span className="rating-icon">{icon}</span>
                      <span className="rating-name">{label}</span>
                      <span className="rating-weight">{weight}%</span>
                    </div>
                    <div className="rating-bar-container">
                      <div className="rating-bar">
                        <div
                          className={`rating-bar-fill ${gradeClass}`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                    <div className="rating-footer">
                      <span className={`rating-grade ${gradeClass}`}>{grade}</span>
                      <span className="rating-number">{value}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rating Summary */}
            <div className="rating-summary">
              <div className="summary-item">
                <span className="summary-label">Overall</span>
                <span className="summary-value">{player.overall}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Best Skill</span>
                <span className="summary-value">
                  {(() => {
                    const best = ratingConfig.reduce((a, b) => 
                      player.ratings[a.key] > player.ratings[b.key] ? a : b
                    );
                    return `${best.label} (${player.ratings[best.key]})`;
                  })()}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Needs Work</span>
                <span className="summary-value">
                  {(() => {
                    const worst = ratingConfig.reduce((a, b) => 
                      player.ratings[a.key] < player.ratings[b.key] ? a : b
                    );
                    return `${worst.label} (${player.ratings[worst.key]})`;
                  })()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="stats-section">
            <PlayerStatsTable
              stats={player.careerStats}
              onMatchClick={onViewMatch}
            />
          </div>
        )}
      </div>
    </div>
  );
}