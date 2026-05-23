// src/sim/vctRecords.ts
// Real VCT records + in-game record tracking

export interface VCTRecord {
  category: string;
  value: number;
  playerName: string;
  teamAbbr: string;
  context: string;       // e.g. "vs SEN on Lotus (36 rounds)" or "vs FNATIC (5 maps)"
  year: number;
  isRealWorld: boolean;   // true = actual VCT record, false = set in-game
  // In-game references (only if isRealWorld === false)
  playerId?: string;
  teamId?: string;
  day?: number;
}

export interface VCTRecordBook {
  // Single map records
  mostKillsSingleMap: VCTRecord;
  highestACSSingleMap: VCTRecord;
  highestKDSingleMap: VCTRecord;    // min 15 rounds
  // Series records
  mostKillsBO3: VCTRecord;
  mostKillsBO5: VCTRecord;
  mostFirstKillsSeries: VCTRecord;  // any format
}

/**
 * Real-world VCT records as of February 2026.
 * These serve as the baseline — in-game performances can break them.
 */
export function getDefaultRecordBook(): VCTRecordBook {
  return {
    mostKillsSingleMap: {
      category: 'Most Kills (Single Map)',
      value: 47,
      playerName: 'aspas',
      teamAbbr: 'LEV',
      context: 'vs SEN on Lotus (36 rounds)',
      year: 2024,
      isRealWorld: true,
    },
    highestACSSingleMap: {
      category: 'Highest ACS (Single Map)',
      value: 516,
      playerName: 'PatMen',
      teamAbbr: 'GE',
      context: 'vs DFM on Breeze (32/5/4)',
      year: 2026,
      isRealWorld: true,
    },
    highestKDSingleMap: {
      category: 'Highest KD (Single Map, 15+ rounds)',
      value: 6.4,
      playerName: 'PatMen',
      teamAbbr: 'GE',
      context: 'vs DFM on Breeze (32/5/4, 17 rounds)',
      year: 2026,
      isRealWorld: true,
    },
    mostKillsBO3: {
      category: 'Most Kills (BO3)',
      value: 82,
      playerName: 'aspas',
      teamAbbr: 'MIBR',
      context: 'vs KRU, VCT Americas Kickoff',
      year: 2025,
      isRealWorld: true,
    },
    mostKillsBO5: {
      category: 'Most Kills (BO5)',
      value: 126,
      playerName: 'marteen',
      teamAbbr: 'M8',
      context: 'vs FNATIC, VCT EMEA Kickoff',
      year: 2026,
      isRealWorld: true,
    },
    mostFirstKillsSeries: {
      category: 'Most First Kills (Series)',
      value: 15,
      playerName: 'aspas',
      teamAbbr: 'MIBR',
      context: 'vs NRG, VCT Champions (BO3, 3 maps)',
      year: 2025,
      isRealWorld: true,
    },
  };
}

/**
 * Patch an existing record book with any missing fields from defaults.
 * Handles saves created before new record categories were added.
 */
export function migrateRecordBook(book: Partial<VCTRecordBook>): VCTRecordBook {
  const defaults = getDefaultRecordBook();
  return { ...defaults, ...book };
}

export interface RecordBroken {
  recordCategory: string;
  oldRecord: VCTRecord;
  newValue: number;
  playerName: string;
  teamAbbr: string;
  context: string;
}

/**
 * Check a single-map stat line against the record book.
 * Returns any records broken (and updates the book in place).
 */
export function checkMapRecords(
  book: VCTRecordBook,
  kills: number,
  deaths: number,
  acs: number,
  totalRounds: number,
  playerName: string,
  teamAbbr: string,
  mapName: string,
  playerId: string,
  teamId: string,
  day: number,
  year: number
): RecordBroken[] {
  const broken: RecordBroken[] = [];
  const kd = deaths === 0 ? kills : Math.round((kills / deaths) * 100) / 100;
  const context = `on ${mapName} (${kills}/${deaths}, ${totalRounds} rounds)`;

  if (kills > book.mostKillsSingleMap.value) {
    broken.push({
      recordCategory: book.mostKillsSingleMap.category,
      oldRecord: { ...book.mostKillsSingleMap },
      newValue: kills,
      playerName,
      teamAbbr,
      context,
    });
    book.mostKillsSingleMap = {
      category: book.mostKillsSingleMap.category,
      value: kills,
      playerName,
      teamAbbr,
      context,
      year,
      isRealWorld: false,
      playerId,
      teamId,
      day,
    };
  }

  if (acs > book.highestACSSingleMap.value) {
    broken.push({
      recordCategory: book.highestACSSingleMap.category,
      oldRecord: { ...book.highestACSSingleMap },
      newValue: acs,
      playerName,
      teamAbbr,
      context,
    });
    book.highestACSSingleMap = {
      category: book.highestACSSingleMap.category,
      value: acs,
      playerName,
      teamAbbr,
      context,
      year,
      isRealWorld: false,
      playerId,
      teamId,
      day,
    };
  }

  // KD only counts for maps with 15+ rounds (avoids inflated short stomps)
  if (totalRounds >= 15 && kd > book.highestKDSingleMap.value) {
    broken.push({
      recordCategory: book.highestKDSingleMap.category,
      oldRecord: { ...book.highestKDSingleMap },
      newValue: kd,
      playerName,
      teamAbbr,
      context,
    });
    book.highestKDSingleMap = {
      category: book.highestKDSingleMap.category,
      value: kd,
      playerName,
      teamAbbr,
      context,
      year,
      isRealWorld: false,
      playerId,
      teamId,
      day,
    };
  }

  return broken;
}

/**
 * Check series kill total against the record book.
 * Returns any records broken (and updates the book in place).
 */
export function checkSeriesRecords(
  book: VCTRecordBook,
  totalKills: number,
  totalFirstKills: number,
  mapsPlayed: number,
  format: string,
  playerName: string,
  teamAbbr: string,
  opponentAbbr: string,
  playerId: string,
  teamId: string,
  day: number,
  year: number
): RecordBroken[] {
  const broken: RecordBroken[] = [];
  const context = `vs ${opponentAbbr} (${format.toUpperCase()}, ${mapsPlayed} maps)`;

  // Check format-specific record
  if (format === 'bo3' && totalKills > book.mostKillsBO3.value) {
    broken.push({
      recordCategory: book.mostKillsBO3.category,
      oldRecord: { ...book.mostKillsBO3 },
      newValue: totalKills,
      playerName,
      teamAbbr,
      context,
    });
    book.mostKillsBO3 = {
      category: book.mostKillsBO3.category,
      value: totalKills,
      playerName,
      teamAbbr,
      context,
      year,
      isRealWorld: false,
      playerId,
      teamId,
      day,
    };
  }

  if (format === 'bo5' && totalKills > book.mostKillsBO5.value) {
    broken.push({
      recordCategory: book.mostKillsBO5.category,
      oldRecord: { ...book.mostKillsBO5 },
      newValue: totalKills,
      playerName,
      teamAbbr,
      context,
    });
    book.mostKillsBO5 = {
      category: book.mostKillsBO5.category,
      value: totalKills,
      playerName,
      teamAbbr,
      context,
      year,
      isRealWorld: false,
      playerId,
      teamId,
      day,
    };
  }

  // Check most first kills (any format)
  if (totalFirstKills > book.mostFirstKillsSeries.value) {
    broken.push({
      recordCategory: book.mostFirstKillsSeries.category,
      oldRecord: { ...book.mostFirstKillsSeries },
      newValue: totalFirstKills,
      playerName,
      teamAbbr,
      context,
    });
    book.mostFirstKillsSeries = {
      category: book.mostFirstKillsSeries.category,
      value: totalFirstKills,
      playerName,
      teamAbbr,
      context,
      year,
      isRealWorld: false,
      playerId,
      teamId,
      day,
    };
  }

  return broken;
}
