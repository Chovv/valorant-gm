// src/ui/components/PlayByPlay.tsx
import type { RoundLog, BuyState } from '../../types';
import './PlayByPlay.css';

interface PlayByPlayProps {
  roundLogs: RoundLog[];
  homeTeamId: string;
  awayTeamId: string;
  homeAbbr: string;
  awayAbbr: string;
  mapName: string;
}

const BUY_SHORT: Record<BuyState, string> = {
  pistol: 'pistol',
  save: 'save',
  eco: 'eco',
  force: 'force',
  half: 'half buy',
  full: 'full buy',
};

const WIN_LABELS: Record<string, string> = {
  elimination: 'Elimination',
  spike_detonation: 'Spike detonated',
  spike_defused: 'Spike defused',
  time_expired: 'Time expired',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function PlayByPlay({ roundLogs, homeTeamId, awayTeamId, homeAbbr, awayAbbr, mapName }: PlayByPlayProps) {
  if (!roundLogs || roundLogs.length === 0) return null;

  // Precompute streaks
  const streaks: number[] = [];
  for (let i = 0; i < roundLogs.length; i++) {
    if (i === 0 || roundLogs[i].isHalfTime || (roundLogs[i].isOvertime && roundLogs[i].roundNumber === 25)) {
      streaks.push(1);
    } else if (roundLogs[i].winnerTeamId === roundLogs[i - 1].winnerTeamId) {
      streaks.push(streaks[i - 1] + 1);
    } else {
      streaks.push(1);
    }
  }

  return (
    <div className="pbp-container">
      <div className="pbp-header">
        <span className="pbp-title">Play-by-Play</span>
        <span className="pbp-map">{mapName}</span>
      </div>

      <div className="pbp-log">
        {roundLogs.map((round, idx) => {
          const homeWon = round.winnerTeamId === homeTeamId;
          const winnerAbbr = homeWon ? homeAbbr : awayAbbr;
          const streak = streaks[idx];

          // Tags
          const isThrifty = (homeWon && round.homeBuyState !== 'full' && round.awayBuyState === 'full') ||
                           (!homeWon && round.awayBuyState !== 'full' && round.homeBuyState === 'full');
          
          const multiKills = round.kills.reduce((acc, k) => {
            acc[k.killerPlayerId] = Math.max(acc[k.killerPlayerId] || 0, k.killerRoundKills);
            return acc;
          }, {} as Record<string, number>);
          const aceEntry = Object.entries(multiKills).find(([, c]) => c >= 5);
          const quadEntry = !aceEntry && Object.entries(multiKills).find(([, c]) => c >= 4);
          const tripleEntry = !aceEntry && !quadEntry && Object.entries(multiKills).find(([, c]) => c >= 3);

          // Find player name for multi-kills
          const getPlayerName = (pid: string) => {
            const kill = round.kills.find(k => k.killerPlayerId === pid);
            return kill ? kill.killerName : '';
          };

          // First blood info
          const fb = round.kills.find(k => k.isFirstBlood);

          // Build text fragments
          const tags: string[] = [];
          if (isThrifty) tags.push('THRIFTY!');
          if (aceEntry) tags.push(`ACE by ${getPlayerName(aceEntry[0])}!`);
          else if (quadEntry) tags.push(`4K by ${getPlayerName(quadEntry[0])}`);
          else if (tripleEntry) tags.push(`3K by ${getPlayerName(tripleEntry[0])}`);
          if (streak >= 4) tags.push(`${streak} in a row`);

          return (
            <div key={round.roundNumber}>
              {/* Halftime */}
              {round.isHalfTime && (
                <div className="pbp-divider">
                  <span className="pbp-divider-line" />
                  <span className="pbp-divider-text">HALFTIME · {roundLogs[idx - 1]?.homeRoundScore ?? 0}-{roundLogs[idx - 1]?.awayRoundScore ?? 0}</span>
                  <span className="pbp-divider-line" />
                </div>
              )}
              {round.isOvertime && round.roundNumber === 25 && (
                <div className="pbp-divider">
                  <span className="pbp-divider-line" />
                  <span className="pbp-divider-text">OVERTIME</span>
                  <span className="pbp-divider-line" />
                </div>
              )}

              {round.timeout && (
                <div className={`pbp-timeout ${round.timeout.teamId === homeTeamId ? 'home' : 'away'}`}>
                  <span className="pbp-timeout-badge">TIMEOUT</span>
                  <span className="pbp-timeout-team">{round.timeout.teamId === homeTeamId ? homeAbbr : awayAbbr}</span>
                </div>
              )}

              <div className={`pbp-line ${homeWon ? 'home-win' : 'away-win'}`}>
                <span className="pbp-round-num">R{round.roundNumber}</span>
                <span className="pbp-buys">
                  (<span className={`pbp-buy-tag ${round.homeBuyState}`}>{BUY_SHORT[round.homeBuyState]}</span>
                  {' vs '}
                  <span className={`pbp-buy-tag ${round.awayBuyState}`}>{BUY_SHORT[round.awayBuyState]}</span>)
                </span>
                <span className="pbp-text">
                  <strong className={homeWon ? 'pbp-home' : 'pbp-away'}>{winnerAbbr}</strong>
                  {' wins '}
                  <span className="pbp-dim">· {WIN_LABELS[round.winCondition]}</span>
                  {fb && (
                    <span className="pbp-dim"> · FB: {fb.killerName} ({capitalize(fb.killerAgent)}) → {fb.victimName}</span>
                  )}
                  {tags.length > 0 && (
                    <span className="pbp-highlight"> · {tags.join(' · ')}</span>
                  )}
                </span>
                <span className="pbp-score">{round.homeRoundScore}-{round.awayRoundScore}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
