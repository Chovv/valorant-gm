// src/sim/trading.ts
// Trading system for ValorantGM

import type { Player, Team } from '../types';
import type { StartingSlot } from '../types/roster';

export interface TradeResult {
  success: boolean;
  message: string;
  updatedTeams: Team[];
}

/**
 * Execute a trade between two teams (supports multiple players)
 * @param teams - All teams in the league
 * @param team1Id - First team's ID (usually user's team)
 * @param team2Id - Second team's ID
 * @param player1Ids - Players from team1 to trade away
 * @param player2Ids - Players from team2 to receive
 * @returns TradeResult with success status and updated teams
 */
export function executeTrade(
  teams: Team[],
  team1Id: string,
  team2Id: string,
  player1Ids: string[],
  player2Ids: string[]
): TradeResult {
  const team1 = teams.find(t => t.id === team1Id);
  const team2 = teams.find(t => t.id === team2Id);

  if (!team1 || !team2) {
    return { success: false, message: 'Invalid team(s)', updatedTeams: teams };
  }

  const players1 = player1Ids.map(id => team1.roster.find(p => p.id === id)).filter((p): p is Player => !!p);
  const players2 = player2Ids.map(id => team2.roster.find(p => p.id === id)).filter((p): p is Player => !!p);

  if (players1.length !== player1Ids.length || players2.length !== player2Ids.length) {
    return { success: false, message: 'Invalid player(s)', updatedTeams: teams };
  }

  // Calculate roster sizes after trade
  const team1NewSize = team1.roster.length - players1.length + players2.length;
  const team2NewSize = team2.roster.length - players2.length + players1.length;

  // Check minimum roster size (need at least 5 players after trade)
  if (team1NewSize < 5) {
    return { 
      success: false, 
      message: `${team1.abbreviation} would have fewer than 5 players after trade`, 
      updatedTeams: teams 
    };
  }

  if (team2NewSize < 5) {
    return { 
      success: false, 
      message: `${team2.abbreviation} would have fewer than 5 players after trade`, 
      updatedTeams: teams 
    };
  }

  // Create new rosters with swapped players
  const newTeam1Roster = team1.roster.filter(p => !player1Ids.includes(p.id));
  newTeam1Roster.push(...players2);

  const newTeam2Roster = team2.roster.filter(p => !player2Ids.includes(p.id));
  newTeam2Roster.push(...players1);

  // Update starting lineups - remove traded players if they were starters
  const newTeam1Lineup = updateLineupAfterTrade(team1.startingLineup, player1Ids, players2, newTeam1Roster);
  const newTeam2Lineup = updateLineupAfterTrade(team2.startingLineup, player2Ids, players1, newTeam2Roster);

  // Update IGL if traded player was IGL
  const newTeam1IglId = player1Ids.includes(team1.iglId || '') ? null : team1.iglId;
  const newTeam2IglId = player2Ids.includes(team2.iglId || '') ? null : team2.iglId;

  // Create updated teams array
  const updatedTeams = teams.map(team => {
    if (team.id === team1Id) {
      return {
        ...team,
        roster: newTeam1Roster,
        startingLineup: newTeam1Lineup,
        iglId: newTeam1IglId,
      };
    }
    if (team.id === team2Id) {
      return {
        ...team,
        roster: newTeam2Roster,
        startingLineup: newTeam2Lineup,
        iglId: newTeam2IglId,
      };
    }
    return team;
  });

  // Build trade message
  const team1Names = players1.map(p => p.name).join(', ');
  const team2Names = players2.map(p => p.name).join(', ');

  return {
    success: true,
    message: `Trade complete: ${team1Names} → ${team2.abbreviation}, ${team2Names} → ${team1.abbreviation}`,
    updatedTeams,
  };
}

/**
 * Update a team's starting lineup after a trade
 * If traded players were starters, try to replace with incoming players
 */
function updateLineupAfterTrade(
  lineup: StartingSlot[] | undefined,
  tradedPlayerIds: string[],
  incomingPlayers: Player[],
  newRoster: Player[]
): StartingSlot[] | undefined {
  if (!lineup) return undefined;

  const updatedLineup = [...lineup];
  const usedIncomingPlayers = new Set<string>();

  // For each traded player that was a starter, try to replace with an incoming player
  for (const tradedId of tradedPlayerIds) {
    const slotIndex = updatedLineup.findIndex(s => s.playerId === tradedId);
    if (slotIndex !== -1) {
      // Find an incoming player to fill this slot (prefer same role)
      const slot = updatedLineup[slotIndex];
      let replacement = incomingPlayers.find(p => 
        p.role === slot.assignedRole && !usedIncomingPlayers.has(p.id)
      );
      
      // If no same-role player, use any available incoming player
      if (!replacement) {
        replacement = incomingPlayers.find(p => !usedIncomingPlayers.has(p.id));
      }

      if (replacement) {
        updatedLineup[slotIndex] = { 
          playerId: replacement.id, 
          assignedRole: slot.assignedRole 
        };
        usedIncomingPlayers.add(replacement.id);
      } else {
        // No replacement available - pick from remaining roster
        const availablePlayer = newRoster.find(p => 
          !updatedLineup.some(s => s.playerId === p.id)
        );
        if (availablePlayer) {
          updatedLineup[slotIndex] = {
            playerId: availablePlayer.id,
            assignedRole: slot.assignedRole
          };
        }
      }
    }
  }

  return updatedLineup;
}

/**
 * Get trade value estimation for a player (for display purposes)
 * Higher = more valuable
 */
export function getTradeValue(player: Player): number {
  let value = player.overall * 10;
  
  // Age factor - younger players are more valuable
  if (player.age <= 20) value += 150;
  else if (player.age <= 23) value += 100;
  else if (player.age <= 26) value += 50;
  else if (player.age >= 30) value -= 100;
  
  // Potential ceiling bonus
  value += (player.potential.ceiling - player.overall) * 5;
  
  // Elite players get bonus
  if (player.overall >= 85) value += 200;
  else if (player.overall >= 80) value += 100;
  
  return Math.round(value);
}

/**
 * Check if a trade is valid
 */
export function canTrade(
  team1: Team,
  team2: Team,
  player1Ids: string[],
  player2Ids: string[]
): { valid: boolean; reason?: string } {
  if (player1Ids.length === 0 && player2Ids.length === 0) {
    return { valid: false, reason: 'Select players from both teams' };
  }

  if (player1Ids.length === 0) {
    return { valid: false, reason: 'Select at least one player to trade away' };
  }

  if (player2Ids.length === 0) {
    return { valid: false, reason: 'Select at least one player to receive' };
  }

  // Calculate roster sizes after trade
  const team1NewSize = team1.roster.length - player1Ids.length + player2Ids.length;
  const team2NewSize = team2.roster.length - player2Ids.length + player1Ids.length;

  if (team1NewSize < 5) {
    return { valid: false, reason: `${team1.abbreviation} would have fewer than 5 players` };
  }

  if (team2NewSize < 5) {
    return { valid: false, reason: `${team2.abbreviation} would have fewer than 5 players` };
  }

  return { valid: true };
}