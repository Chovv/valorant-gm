// src/ui/components/PlayersPage.tsx
import { useState, useMemo } from 'react';
import type { Team, Player, Role, Region } from '../../types';
import type { StartingSlot } from '../../types/roster';
import { getRolePenalty } from '../../types/roster';
import { getIGLBonusForPlayer } from '../../sim/iglBonus';
import { analyzeComposition } from '../../sim/compositionBonus';

// Role icons
const ROLE_ICONS: Record<Role, string> = {
  duelist: '/logos/regions/duelistIcon.png',
  controller: '/logos/regions/controllerIcon.png',
  initiator: '/logos/regions/initiatorIcon.png',
  sentinel: '/logos/regions/sentinelIcon.png',
  flex: '/logos/regions/filler.png',
};

// Region logos
const REGION_LOGOS: Record<Region, string> = {
  americas: '/logos/regions/Americas.png',
  emea: '/logos/regions/EMEA.png',
  pacific: '/logos/regions/Pacific.png',
  china: '/logos/regions/China.png',
};

interface PlayersPageProps {
  teams: Team[];
  onViewPlayer: (playerId: string) => void;
  onViewTeam: (teamId: string) => void;
}

type SortKey = 'name' | 'team' | 'region' | 'role' | 'overall' | 'effectiveOvr' | 'potCeiling' | 'potFloor' | 'age' | 
               'aim' | 'gameSense' | 'utilityUsage' | 'clutchFactor' | 'communication' |
               'kills' | 'deaths' | 'assists' | 'kd' | 'acs' | 'mapsPlayed';

type SortDirection = 'asc' | 'desc';

// Move SortHeader outside the component to avoid re-creation during render
function SortHeader({ 
  label, 
  sortKeyName, 
  currentSortKey, 
  sortDirection, 
  onSort, 
  className = '' 
}: { 
  label: string; 
  sortKeyName: SortKey; 
  currentSortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  return (
    <th 
      className={`sortable-header ${className} ${currentSortKey === sortKeyName ? 'active' : ''}`}
      onClick={() => onSort(sortKeyName)}
    >
      {label}
      {currentSortKey === sortKeyName && (
        <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
      )}
    </th>
  );
}

/**
 * Calculate effective OVR for a player including role penalty, IGL bonus, and composition penalty
 */
function calculatePlayerEffectiveOvr(
  player: Player, 
  team: Team
): { effectiveOvr: number; assignedRole: Role | null; isStarter: boolean; rolePenalty: number; iglBonus: number; compPenalty: number } {
  // Get lineup, defaulting to first 5 players in natural roles if not set
  const lineup: StartingSlot[] = team.startingLineup || team.roster.slice(0, 5).map(p => ({
    playerId: p.id,
    assignedRole: p.role,
  }));
  
  // Check if player is in starting lineup
  const slot = lineup.find(s => s.playerId === player.id);
  
  if (!slot) {
    // Not a starter - just show base OVR
    return { effectiveOvr: player.overall, assignedRole: null, isStarter: false, rolePenalty: 0, iglBonus: 0, compPenalty: 0 };
  }
  
  // Get role penalty
  const rolePenalty = getRolePenalty(player.role, slot.assignedRole);
  const baseEffective = player.overall + rolePenalty;
  
  // Get IGL bonus (if applicable)
  const iglBonus = getIGLBonusForPlayer(player, team, lineup);
  const iglOvrImpact = Math.round(iglBonus * 0.5);
  
  // Get composition penalty
  const compResult = analyzeComposition(lineup);
  const compPenalty = compResult.penalty;
  
  return { 
    effectiveOvr: baseEffective + iglOvrImpact + compPenalty, 
    assignedRole: slot.assignedRole,
    isStarter: true,
    rolePenalty,
    iglBonus: iglOvrImpact,
    compPenalty
  };
}

export function PlayersPage({ teams, onViewPlayer, onViewTeam }: PlayersPageProps) {
  const [sortKey, setSortKey] = useState<SortKey>('effectiveOvr');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Flatten all players with their team info and effective OVR
  const allPlayers = useMemo(() => {
    const players: Array<Player & { 
      team: Team; 
      effectiveOvr: number; 
      assignedRole: Role | null;
      isStarter: boolean;
      rolePenalty: number;
      iglBonus: number;
      compPenalty: number;
    }> = [];
    for (const team of teams) {
      for (const player of team.roster) {
        const { effectiveOvr, assignedRole, isStarter, rolePenalty, iglBonus, compPenalty } = calculatePlayerEffectiveOvr(
          player, 
          team
        );
        players.push({ 
          ...player, 
          team, 
          effectiveOvr,
          assignedRole,
          isStarter,
          rolePenalty,
          iglBonus,
          compPenalty
        });
      }
    }
    return players;
  }, [teams]);

  // Filter players
  const filteredPlayers = useMemo(() => {
    return allPlayers.filter(player => {
      if (roleFilter !== 'all' && player.role !== roleFilter) return false;
      if (regionFilter !== 'all' && player.team.region !== regionFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!player.name.toLowerCase().includes(query) && 
            !player.team.name.toLowerCase().includes(query) &&
            !player.team.abbreviation.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [allPlayers, roleFilter, regionFilter, searchQuery]);

  // Sort players
  const sortedPlayers = useMemo(() => {
    const sorted = [...filteredPlayers];
    
    sorted.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortKey) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'team':
          aVal = a.team.name.toLowerCase();
          bVal = b.team.name.toLowerCase();
          break;
        case 'region':
          aVal = a.team.region;
          bVal = b.team.region;
          break;
        case 'role':
          aVal = a.role;
          bVal = b.role;
          break;
        case 'overall':
          aVal = a.overall;
          bVal = b.overall;
          break;
        case 'effectiveOvr':
          aVal = a.effectiveOvr;
          bVal = b.effectiveOvr;
          break;
        case 'potCeiling':
          aVal = a.potential.ceiling;
          bVal = b.potential.ceiling;
          break;
        case 'potFloor':
          aVal = a.potential.floor;
          bVal = b.potential.floor;
          break;
        case 'age':
          aVal = a.age;
          bVal = b.age;
          break;
        case 'aim':
          aVal = a.ratings.aim;
          bVal = b.ratings.aim;
          break;
        case 'gameSense':
          aVal = a.ratings.gameSense;
          bVal = b.ratings.gameSense;
          break;
        case 'utilityUsage':
          aVal = a.ratings.utilityUsage;
          bVal = b.ratings.utilityUsage;
          break;
        case 'clutchFactor':
          aVal = a.ratings.clutchFactor;
          bVal = b.ratings.clutchFactor;
          break;
        case 'communication':
          aVal = a.ratings.communication;
          bVal = b.ratings.communication;
          break;
        case 'kills':
          aVal = a.careerStats?.totalKills ?? 0;
          bVal = b.careerStats?.totalKills ?? 0;
          break;
        case 'deaths':
          aVal = a.careerStats?.totalDeaths ?? 0;
          bVal = b.careerStats?.totalDeaths ?? 0;
          break;
        case 'assists':
          aVal = a.careerStats?.totalAssists ?? 0;
          bVal = b.careerStats?.totalAssists ?? 0;
          break;
        case 'kd':
          aVal = a.careerStats?.avgKD ?? 0;
          bVal = b.careerStats?.avgKD ?? 0;
          break;
        case 'acs':
          aVal = a.careerStats?.avgACS ?? 0;
          bVal = b.careerStats?.avgACS ?? 0;
          break;
        case 'mapsPlayed':
          aVal = a.careerStats?.totalMaps ?? 0;
          bVal = b.careerStats?.totalMaps ?? 0;
          break;
        default:
          aVal = a.effectiveOvr;
          bVal = b.effectiveOvr;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDirection === 'asc' 
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return sorted;
  }, [filteredPlayers, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  // const getRoleClass = (role: string) => `role-${role.toLowerCase()}`;

  const getRatingClass = (rating: number) => {
    if (rating >= 80) return 'rating-elite';
    if (rating >= 70) return 'rating-high';
    if (rating >= 55) return 'rating-mid';
    return 'rating-low';
  };

  return (
    <div className="players-page">
      <div className="content-header">
        <h1>All Players</h1>
        <span className="player-count">{sortedPlayers.length} players</span>
      </div>

      {/* Filters */}
      <div className="players-filters">
        <div className="filter-group">
          <label>Search</label>
          <input
            type="text"
            className="filter-input"
            placeholder="Player or team name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Role</label>
          <select 
            className="filter-select"
            value={roleFilter} 
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="duelist">Duelist</option>
            <option value="controller">Controller</option>
            <option value="initiator">Initiator</option>
            <option value="sentinel">Sentinel</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Region</label>
          <select 
            className="filter-select"
            value={regionFilter} 
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="all">All Regions</option>
            <option value="americas">Americas</option>
            <option value="emea">EMEA</option>
            <option value="pacific">Pacific</option>
            <option value="china">China</option>
          </select>
        </div>
      </div>

      {/* Players Table */}
      <div className="panel">
        <div className="players-table-wrapper">
          <table className="players-table">
            <thead>
              <tr>
                <th className="rank-col">#</th>
                <SortHeader label="Player" sortKeyName="name" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="player-col" />
                <SortHeader label="Team" sortKeyName="team" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="team-col" />
                <SortHeader label="Region" sortKeyName="region" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="region-col" />
                <SortHeader label="Role" sortKeyName="role" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="role-col" />
                <SortHeader label="OVR" sortKeyName="effectiveOvr" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
                <SortHeader label="Base" sortKeyName="overall" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
                <SortHeader label="POT" sortKeyName="potCeiling" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
                <SortHeader label="Age" sortKeyName="age" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
                <SortHeader label="AIM" sortKeyName="aim" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="skill-col" />
                <SortHeader label="GAME" sortKeyName="gameSense" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="skill-col" />
                <SortHeader label="UTIL" sortKeyName="utilityUsage" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="skill-col" />
                <SortHeader label="CLUT" sortKeyName="clutchFactor" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="skill-col" />
                <SortHeader label="COMM" sortKeyName="communication" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="skill-col" />
                <SortHeader label="K" sortKeyName="kills" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
                <SortHeader label="D" sortKeyName="deaths" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
                <SortHeader label="A" sortKeyName="assists" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
                <SortHeader label="K/D" sortKeyName="kd" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
                <SortHeader label="ACS" sortKeyName="acs" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
                <SortHeader label="Maps" sortKeyName="mapsPlayed" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} className="stat-col" />
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player, index) => {
                return (
                  <tr key={player.id} className={`player-row ${player.isStarter ? 'is-starter' : ''}`}>
                    <td className="rank-col">{index + 1}</td>
                    <td className="player-col">
                      <span 
                        className="player-name-link"
                        onClick={() => onViewPlayer(player.id)}
                      >
                        {player.name}
                      </span>
                      {player.team.iglId === player.id && (
                        <span className="igl-badge" title="In-Game Leader">IGL</span>
                      )}
                    </td>
                    <td className="team-col">
                      <div className="team-cell" onClick={() => onViewTeam(player.team.id)}>
                        <img src={player.team.logo} alt={player.team.abbreviation} className="team-mini-logo" />
                        <span className="team-abbr-link">{player.team.abbreviation}</span>
                      </div>
                    </td>
                    <td className="region-col">
                      <img 
                        src={REGION_LOGOS[player.team.region]} 
                        alt={player.team.region} 
                        className="region-icon"
                        title={player.team.region.charAt(0).toUpperCase() + player.team.region.slice(1)}
                      />
                    </td>
                    <td className="role-col">
                      <div className="role-cell-with-icon">
                        <img 
                          src={ROLE_ICONS[player.role]} 
                          alt={player.role} 
                          className="role-icon" 
                          title={player.role.charAt(0).toUpperCase() + player.role.slice(1)}
                        />
                      </div>
                      {player.assignedRole && player.assignedRole !== player.role && (
                        <span className="off-role-indicator" title={`Playing ${player.assignedRole}`}>
                          →<img src={ROLE_ICONS[player.assignedRole]} alt="" className="role-icon-small" />
                        </span>
                      )}
                    </td>
                    <td className={`stat-col ${getRatingClass(player.effectiveOvr)}`}>
                      <strong>{player.effectiveOvr}</strong>
                      {player.rolePenalty !== 0 && (
                        <span className="modifier-badge role-debuff" title="Off-Role Penalty">
                          ({player.rolePenalty})
                        </span>
                      )}
                      {player.iglBonus !== 0 && (
                        <span className={`modifier-badge ${player.iglBonus > 0 ? 'buff' : 'debuff'}`} title="IGL Bonus">
                          ({player.iglBonus > 0 ? '+' : ''}{player.iglBonus})
                        </span>
                      )}
                      {player.compPenalty !== 0 && (
                        <span className="modifier-badge comp-debuff" title="Unbalanced Composition">
                          ({player.compPenalty})
                        </span>
                      )}
                    </td>
                    <td className={`stat-col base-ovr ${getRatingClass(player.overall)}`}>
                      {player.overall}
                    </td>
                    <td className={`stat-col ${getRatingClass(player.potential.ceiling)}`}>{player.potential.ceiling}</td>
                    <td className="stat-col">{player.age}</td>
                    <td className="skill-col">{player.ratings.aim}</td>
                    <td className="skill-col">{player.ratings.gameSense}</td>
                    <td className="skill-col">{player.ratings.utilityUsage}</td>
                    <td className="skill-col">{player.ratings.clutchFactor}</td>
                    <td className="skill-col">{player.ratings.communication}</td>
                    <td className="stat-col">{player.careerStats?.totalKills ?? '-'}</td>
                    <td className="stat-col">{player.careerStats?.totalDeaths ?? '-'}</td>
                    <td className="stat-col">{player.careerStats?.totalAssists ?? '-'}</td>
                    <td className={`stat-col ${player.careerStats && player.careerStats.avgKD >= 1 ? 'positive' : player.careerStats ? 'negative' : ''}`}>
                      {player.careerStats?.avgKD.toFixed(2) ?? '-'}
                    </td>
                    <td className="stat-col acs">{player.careerStats?.avgACS.toFixed(0) ?? '-'}</td>
                    <td className="stat-col">{player.careerStats?.totalMaps ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}