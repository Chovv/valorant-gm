// src/utils/agentIcons.ts
// shared agent icon resolver — checks legacy overrides on gameState

// agents known to have _old variants in /logos/agents/
export const LEGACY_AGENTS: Record<string, string> = {
  gekko: 'gekko_old.webp',
  harbor: 'harbor_old.webp',
  fade: 'fade_old.webp',
};

// returns icon path, respecting legacy overrides
export function resolveAgentIcon(
  agentId: string,
  legacyIcons?: string[],
  customAgents?: Array<{ id: string; icon?: string }>
): string {
  // custom agent icon override
  const custom = customAgents?.find(a => a.id === agentId);
  if (custom?.icon) return `/logos/agents/${custom.icon}`;

  // legacy override
  if (legacyIcons?.includes(agentId) && LEGACY_AGENTS[agentId]) {
    return `/logos/agents/${LEGACY_AGENTS[agentId]}`;
  }

  return `/logos/agents/${agentId.toLowerCase()}.png`;
}
