// src/test-generator.ts
// Test file for development - not used in production

import { createRNG, randomInt, shuffle } from './utils/random';
import { generatePlayer } from './sim/playerGenerator';
import { calculateTeamAttributes } from './sim/teamRatings';
import { createGameState, advanceDay, getCurrentStandings } from './sim/gameState';
import { getAgentsForRole } from './data/agents';
import type { Team, Player, Role, AgentPool } from './types';
import type { RNG } from './utils/random';

function generateAgentPoolForRole(rng: RNG, role: Role): AgentPool {
  const pool: AgentPool = {};
  const roleAgents = getAgentsForRole(role);
  const shuffled = [...roleAgents];
  shuffle(rng, shuffled);
  let idx = 0;
  for (let i = 0; i < 2 && idx < shuffled.length; i++) {
    pool[shuffled[idx++]] = randomInt(rng, 75, 95);
  }
  for (let i = 0; i < 2 && idx < shuffled.length; i++) {
    pool[shuffled[idx++]] = randomInt(rng, 50, 74);
  }
  return pool;
}

function generateRoster(rng: RNG): Player[] {
  const roles: Role[] = ['duelist', 'duelist', 'controller', 'initiator', 'sentinel'];
  return roles.map(role => {
    const player = generatePlayer(rng, { meanOverall: 68, stdDevOverall: 12, minAge: 18, maxAge: 28 });
    return { ...player, role, agentPool: generateAgentPoolForRole(rng, role) };
  });
}

function generateTeam(rng: RNG, name: string, abbr: string, logo: string): Team {
  const roster = generateRoster(rng);
  return {
    id: `team_${abbr.toLowerCase()}`,
    name,
    abbreviation: abbr,
    logo,
    region: 'americas',
    roster,
    staff: { headCoach: null, assistantCoach: null, analyst: null },
    finances: { budget: 1000000, salaryCommitted: 500000, scoutingBudget: 50 },
    attributes: calculateTeamAttributes(roster),
    championships: 0,
    playoffAppearances: 0,
    founded: 2020,
  };
}

function generateLeague(seed: string): Team[] {
  const rng = createRNG(seed);
  const teamData = [
    { name: 'Sentinels', abbr: 'SEN', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Sentinels_logo.svg/250px-Sentinels_logo.svg.png' },
    { name: 'Cloud9', abbr: 'C9', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Cloud9_logo.svg/250px-Cloud9_logo.svg.png' },
    { name: 'NRG Esports', abbr: 'NRG', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2f/NRG_Esports_logo.svg/250px-NRG_Esports_logo.svg.png' },
    { name: '100 Thieves', abbr: '100T', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9b/100_Thieves_logo.svg/250px-100_Thieves_logo.svg.png' },
  ];
  return teamData.map(t => generateTeam(rng, t.name, t.abbr, t.logo));
}

// Test day-by-day simulation
const teams = generateLeague('test-seed');
const gameState = createGameState(teams, 'team_sen', 'test-seed');

console.log('=== VALORANT GM - Day by Day Test ===');
console.log(`You are the GM of: ${teams.find(t => t.id === gameState.userTeamId)?.name}`);

// Advance through preseason
advanceDay(gameState);

console.log('\n--- First 5 Days ---');
for (let i = 0; i < 5; i++) {
  const result = advanceDay(gameState);
  console.log(`\nDay ${gameState.currentDay}: ${result.matchesPlayed.length} matches`);
  result.events.forEach(e => console.log(`  ${e.message}`));
}

console.log('\n--- Standings ---');
console.log(getCurrentStandings(gameState));