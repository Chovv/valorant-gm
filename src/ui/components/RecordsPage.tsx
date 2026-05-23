// src/ui/components/RecordsPage.tsx
import { useMemo } from 'react';
import type { VCTRecordBook, VCTRecord } from '../../sim/vctRecords';
import type { Team, Player } from '../../types';
import type { GameState } from '../../sim/gameState';
import { collectSeasonAwards } from '../../sim/gameState';
import { PlayerAvatar } from './PlayerAvatar';
import './RecordsPage.css';

interface RecordsPageProps {
  recordBook: VCTRecordBook;
  teams: Team[];
  gameState: GameState;
}

const SINGLE_MAP_RECORDS: Array<{ key: keyof VCTRecordBook; unit: string; label: string }> = [
  { key: 'mostKillsSingleMap', unit: 'kills', label: 'Most Kills' },
  { key: 'highestACSSingleMap', unit: 'ACS', label: 'Highest ACS' },
  { key: 'highestKDSingleMap', unit: 'KD', label: 'Best KD' },
];

const SERIES_RECORDS: Array<{ key: keyof VCTRecordBook; unit: string; label: string }> = [
  { key: 'mostKillsBO3', unit: 'kills', label: 'Most Kills (BO3)' },
  { key: 'mostKillsBO5', unit: 'kills', label: 'Most Kills (BO5)' },
  { key: 'mostFirstKillsSeries', unit: 'FKs', label: 'Most First Kills' },
];

const AWARD_COLS: Array<{ key: string; label: string; tip: string }> = [
  { key: 'mvp', label: 'MVP', tip: 'Series MVP — highest average ACS across all maps in a series' },
  { key: 'clutchKing', label: 'Clutch', tip: 'Clutch King — most 1vX round wins in a series' },
  { key: 'firstBlood', label: 'FB', tip: 'First Blood — most opening kills in a series' },
  { key: 'kdDiff', label: 'KD+', tip: 'KD Diff — highest kill-death differential in a series' },
  { key: 'raidBoss', label: 'Raid', tip: 'Raid Boss — most multi-kill rounds (3K/4K/ACE) weighted by difficulty' },
];

export function RecordsPage({ recordBook, teams, gameState }: RecordsPageProps) {
  const seasonAwards = useMemo(() => collectSeasonAwards(gameState), [gameState]);

  const findPlayer = (record: VCTRecord): Player | undefined => {
    if (record.playerId) {
      for (const team of teams) {
        const p = team.roster.find(r => r.id === record.playerId);
        if (p) return p;
      }
    }
    const nameLower = record.playerName.toLowerCase();
    for (const team of teams) {
      const p = team.roster.find(r => r.name.toLowerCase() === nameLower);
      if (p) return p;
    }
    return undefined;
  };

  const findTeam = (record: VCTRecord): Team | undefined => {
    if (record.teamId) return teams.find(t => t.id === record.teamId);
    const abbrLower = record.teamAbbr.toLowerCase();
    return teams.find(t => t.abbreviation.toLowerCase() === abbrLower);
  };

  const formatValue = (record: VCTRecord) => {
    if (record.category.includes('KD')) return record.value.toFixed(2);
    return record.value.toString();
  };

  const renderRecord = (record: VCTRecord, unit: string, label: string, index: number) => {
    const player = findPlayer(record);
    const team = findTeam(record);

    return (
      <div key={record.category} className="rec-card" style={{ animationDelay: `${index * 0.06}s` }}>
        <div className="rec-card-label">{label}</div>
        <div className="rec-card-value-row">
          <span className="rec-card-value">{formatValue(record)}</span>
          <span className="rec-card-unit">{unit}</span>
        </div>
        <div className="rec-card-player">
          <PlayerAvatar
            playerId={player?.id}
            playerName={record.playerName}
            imageUrl={player?.imageUrl}
            nationality={player?.nationality}
            size="sm"
          />
          <div className="rec-card-info">
            <div className="rec-card-name">
              {record.playerName}
              {team && <img src={team.logo} alt="" className="rec-card-team-logo" />}
              <span className="rec-card-team">{record.teamAbbr}</span>
            </div>
            <div className="rec-card-context">{record.context}</div>
          </div>
        </div>
        <div className="rec-card-footer">
          <span className="rec-card-year">{record.year}</span>
          {record.isRealWorld ? (
            <span className="record-tag real">VCT</span>
          ) : (
            <span className="record-tag sim">SIM</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="content-header">
        <h1>VCT Records</h1>
      </div>

      <div className="records-page-grid">
        {/* Left column: Record cards */}
        <div className="records-left">
          <div className="records-section-label">Single Map</div>
          <div className="rec-cards-row">
            {SINGLE_MAP_RECORDS.map(({ key, unit, label }, i) =>
              recordBook[key] ? renderRecord(recordBook[key], unit, label, i) : (
                <div key={key} className="rec-card rec-card-empty">
                  <div className="rec-card-label">{label}</div>
                  <div className="rec-card-empty-text">No record yet</div>
                </div>
              )
            )}
          </div>

          <div className="records-section-label">Series</div>
          <div className="rec-cards-row">
            {SERIES_RECORDS.map(({ key, unit, label }, i) =>
              recordBook[key] ? renderRecord(recordBook[key], unit, label, i + 3) : (
                <div key={key} className="rec-card rec-card-empty">
                  <div className="rec-card-label">{label}</div>
                  <div className="rec-card-empty-text">No record yet</div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Right column: Season Awards */}
        <div className="records-right">
          <div className="records-section-label">Season Awards</div>
          {seasonAwards.length > 0 ? (
            <div className="panel awards-panel">
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="awards-table">
                  <thead>
                    <tr>
                      <th className="awards-th-rank">#</th>
                      <th className="awards-th-player">Player</th>
                      {AWARD_COLS.map(c => (
                        <th key={c.key} className="awards-th-stat awards-th-named" data-tip={c.tip}>{c.label}</th>
                      ))}
                      <th className="awards-th-stat awards-th-total">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonAwards.slice(0, 20).map((a, i) => {
                      const team = teams.find(t => t.id === a.teamId);
                      const player = team?.roster.find(p => p.id === a.playerId);
                      return (
                        <tr key={a.playerId} className="awards-row" style={{ animationDelay: `${i * 0.04}s` }}>
                          <td className="awards-rank">{i + 1}</td>
                          <td className="awards-player-cell">
                            <PlayerAvatar playerId={player?.id} playerName={a.playerName} imageUrl={player?.imageUrl} nationality={player?.nationality} size="sm" />
                            <div className="awards-player-info">
                              <span className="awards-player-name">{a.playerName}</span>
                              {team && (
                                <span className="awards-player-team">
                                  <img src={team.logo} alt="" className="awards-team-logo" />
                                  {team.abbreviation}
                                </span>
                              )}
                            </div>
                          </td>
                          {AWARD_COLS.map(c => {
                            const val = (a as any)[c.key] as number;
                            return (
                              <td key={c.key} className={`awards-stat ${val > 0 ? 'has-value' : ''}`}>
                                {val || '–'}
                              </td>
                            );
                          })}
                          <td className="awards-stat awards-total">{a.total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="panel awards-panel">
              <div className="panel-body awards-empty">
                No awards yet — play some matches to see accolades here.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
