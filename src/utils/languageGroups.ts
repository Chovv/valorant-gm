// src/utils/languageGroups.ts
// Maps nationality codes to language/culture groups for roster synergy scoring

export type LanguageGroup =
  | 'english'     // US, CA, AU, GB, NZ, IE, SG, PH, IN (EN)
  | 'portuguese'  // BR, PT
  | 'spanish'     // CL, AR, MX, CO, PE, UY, VE, EC, BO, PR, PA, GT
  | 'korean'      // KR
  | 'japanese'    // JP
  | 'chinese'     // CN, TW, HK, MO
  | 'turkish'     // TR
  | 'russian'     // RU, KZ, UA, BY, GE (CIS lingua franca)
  | 'nordic'      // SE, FI, DK, NO
  | 'french'      // FR, BE (FR), MA (partial)
  | 'german'      // DE, AT, CH
  | 'polish'      // PL
  | 'other';      // everything else — neutral

const LANGUAGE_MAP: Record<string, LanguageGroup> = {
  // English
  US: 'english', CA: 'english', AU: 'english', GB: 'english',
  NZ: 'english', IE: 'english', SG: 'english', PH: 'english', IN: 'english',
  // Portuguese
  BR: 'portuguese', PT: 'portuguese',
  // Spanish
  CL: 'spanish', AR: 'spanish', MX: 'spanish', CO: 'spanish',
  PE: 'spanish', UY: 'spanish', VE: 'spanish', EC: 'spanish',
  BO: 'spanish', PR: 'spanish', PA: 'spanish', GT: 'spanish', DO: 'spanish',
  // Korean
  KR: 'korean',
  // Japanese
  JP: 'japanese',
  // Chinese
  CN: 'chinese', TW: 'chinese', HK: 'chinese', MO: 'chinese',
  // Turkish
  TR: 'turkish',
  // Russian / CIS
  RU: 'russian', KZ: 'russian', UA: 'russian', BY: 'russian', GE: 'russian',
  // Nordic
  SE: 'nordic', FI: 'nordic', DK: 'nordic', NO: 'nordic',
  // French
  FR: 'french', BE: 'french', MA: 'french',
  // German
  DE: 'german', AT: 'german', CH: 'german',
  // Polish
  PL: 'polish',
  // Other EMEA that share enough to cooperate
  CZ: 'other', SK: 'other', HU: 'other', RO: 'other', HR: 'other',
  RS: 'other', BA: 'other', BG: 'other', LT: 'other', LV: 'other',
  EE: 'other', IL: 'other', IT: 'other', ES: 'other', NL: 'other',
  PT2: 'other',
};

export function getLanguageGroup(nationality: string | undefined): LanguageGroup {
  if (!nationality) return 'other';
  return LANGUAGE_MAP[nationality.toUpperCase()] ?? 'other';
}

export const LANGUAGE_GROUP_LABELS: Record<LanguageGroup, string> = {
  english: 'English',
  portuguese: 'Portuguese',
  spanish: 'Spanish',
  korean: 'Korean',
  japanese: 'Japanese',
  chinese: 'Chinese',
  turkish: 'Turkish',
  russian: 'Russian / CIS',
  nordic: 'Nordic',
  french: 'French',
  german: 'German',
  polish: 'Polish',
  other: 'Other',
};

// groups that can communicate well enough together (partial synergy)
export const BRIDGE_GROUPS: Partial<Record<LanguageGroup, LanguageGroup[]>> = {
  english: ['nordic'],        // many nordics speak fluent english
  nordic: ['english'],
  spanish: ['portuguese'],    // ibero-romance — not the same, but workable
  portuguese: ['spanish'],
  russian: ['other'],         // slavic-ish
  chinese: ['taiwanese'],
};

export interface LangAffinityResult {
  score: number;          // 0.0 – 1.0
  label: string;          // "Native", "Bridge", "Barrier"
  tier: 'native' | 'bridge' | 'barrier';
  rosterLang: LanguageGroup; // majority language of the existing roster
  playerLang: LanguageGroup;
}

/** Score how well a player's language fits a roster's dominant language. */
export function langAffinity(
  playerNationality: string | undefined,
  rosterNationalities: (string | undefined)[],
): LangAffinityResult {
  const rosterGroups = rosterNationalities.map(getLanguageGroup);
  // find majority language on roster
  const freq = new Map<LanguageGroup, number>();
  for (const g of rosterGroups) freq.set(g, (freq.get(g) ?? 0) + 1);
  let rosterLang: LanguageGroup = 'other';
  let maxFreq = 0;
  for (const [g, n] of freq) { if (n > maxFreq) { maxFreq = n; rosterLang = g; } }

  const playerLang = getLanguageGroup(playerNationality);

  if (playerLang === rosterLang) {
    return { score: 1.0, label: 'Native', tier: 'native', rosterLang, playerLang };
  }
  const bridges = BRIDGE_GROUPS[rosterLang] ?? [];
  if (bridges.includes(playerLang)) {
    return { score: 0.65, label: 'Bridge', tier: 'bridge', rosterLang, playerLang };
  }
  // english is a near-universal bridge in esports (55%)
  if (playerLang === 'english' || rosterLang === 'english') {
    return { score: 0.55, label: 'Bridge', tier: 'bridge', rosterLang, playerLang };
  }
  return { score: 0.15, label: 'Barrier', tier: 'barrier', rosterLang, playerLang };
}

/** Convenience: get roster nationalities from a Team's roster. */
export function rosterNationalities(roster: { nationality?: string }[]): string[] {
  return roster.map(p => p.nationality).filter((n): n is string => !!n);
}

// east-asian langs that operate behind a near-hard language wall
const MONOLINGUAL: Set<LanguageGroup> = new Set(['korean', 'japanese', 'chinese']);

/**
 * Score how well a player's nationality fits a team's anchored home language.
 * Unlike langAffinity(), this uses a fixed homeLang (not drifting roster majority)
 * and enforces hard walls for KR/JP/CN teams where English isn't a real bridge.
 */
export function langScoreForLang(playerNat: string | undefined, homeLang: LanguageGroup): number {
  const playerLang = getLanguageGroup(playerNat);
  if (playerLang === homeLang) return 1.0;

  if (MONOLINGUAL.has(homeLang)) {
    // small adjacency bump for east-asian neighbours (KR↔JP↔CN) — still very low
    if (MONOLINGUAL.has(playerLang)) return 0.12;
    // english is NOT a functional bridge for these orgs
    return 0.08;
  }

  const bridges = BRIDGE_GROUPS[homeLang] ?? [];
  if (bridges.includes(playerLang)) return 0.65;
  // english is a genuine lingua franca for americas/emea/sea teams
  if (playerLang === 'english' || homeLang === 'english') return 0.55;
  return 0.15;
}
