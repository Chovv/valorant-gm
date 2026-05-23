// src/ui/components/RoundTimeline.tsx
import type { RoundLog } from '../../types';
import './RoundTimeline.css';

interface RoundTimelineProps {
  roundLogs: RoundLog[];
  homeTeamId: string;
  awayTeamId: string;
  homeAbbr: string;
  awayAbbr: string;
  homeLogo?: string;
  awayLogo?: string;
  revealUpTo?: number; // if set, only show rounds up to this number (1-indexed)
  onRoundClick?: (roundNumber: number) => void;
}

const WIN_ICONS: Record<string, string> = {
  elimination: '/logos/timeline/elim.png',
  spike_detonation: '/logos/timeline/boom.png',
  spike_defused: '/logos/timeline/defuse.png',
  time_expired: '/logos/timeline/time.png',
};

const WIN_TITLES: Record<string, string> = {
  elimination: 'Elimination',
  spike_detonation: 'Spike detonated',
  spike_defused: 'Spike defused',
  time_expired: 'Time expired',
};

export function RoundTimeline({ roundLogs, homeTeamId, awayTeamId, homeAbbr, awayAbbr, homeLogo, awayLogo, revealUpTo, onRoundClick }: RoundTimelineProps) {
  if (!roundLogs || roundLogs.length === 0) return null;

  const isRevealed = (r: RoundLog) => revealUpTo === undefined || r.roundNumber <= revealUpTo;

  // split rounds into halves + OT
  const firstHalf = roundLogs.filter(r => r.roundNumber <= 12);
  const secondHalf = roundLogs.filter(r => r.roundNumber >= 13 && r.roundNumber <= 24);
  const overtime = roundLogs.filter(r => r.roundNumber > 24);

  const halftimeRevealed = revealUpTo === undefined || revealUpTo >= 12;
  const halftimeScore = halftimeRevealed && firstHalf.length > 0
    ? { home: firstHalf[firstHalf.length - 1].homeRoundScore, away: firstHalf[firstHalf.length - 1].awayRoundScore }
    : null;

  const renderCell = (round: RoundLog, teamId: string, side: 'home' | 'away') => {
    const revealed = isRevealed(round);
    const won = revealed && round.winnerTeamId === teamId;
    const clickable = revealed && onRoundClick;
    const hasTimeout = revealed && round.timeout?.teamId === teamId;

    if (!revealed) {
      return (
        <div key={`${round.roundNumber}-${side}`} className="rt-cell pending" />
      );
    }

    // color by side: red for attackers, teal for defenders
    const isAtk = round.attackingTeamId === teamId;
    const sideClass = isAtk ? 'atk' : 'def';

    return (
      <div
        key={`${round.roundNumber}-${side}`}
        className={`rt-cell ${won ? `won ${sideClass}` : 'lost'} ${hasTimeout ? 'has-timeout' : ''} ${clickable ? 'clickable' : ''}`}
        title={hasTimeout ? `Timeout → R${round.roundNumber}: ${won ? WIN_TITLES[round.winCondition] : 'Loss'}` : won ? `R${round.roundNumber}: ${WIN_TITLES[round.winCondition]}` : `R${round.roundNumber}`}
        onClick={clickable ? () => onRoundClick(round.roundNumber) : undefined}
      >
        {hasTimeout && <span className="rt-timeout-mark">T</span>}
        {won && <img src={WIN_ICONS[round.winCondition]} alt="" className="rt-icon" />}
      </div>
    );
  };

  const renderSection = (rounds: RoundLog[], label?: string) => (
    <div className="rt-section">
      {label && <div className="rt-section-label">{label}</div>}
      <div className="rt-round-nums">
        {rounds.map(r => {
          const revealed = isRevealed(r);
          const clickable = revealed && onRoundClick;
          return (
            <div
              key={r.roundNumber}
              className={`rt-round-num ${clickable ? 'clickable' : ''} ${revealUpTo === r.roundNumber ? 'active' : ''}`}
              onClick={clickable ? () => onRoundClick(r.roundNumber) : undefined}
            >
              {r.roundNumber}
            </div>
          );
        })}
      </div>
      <div className="rt-row home">
        {rounds.map(r => renderCell(r, homeTeamId, 'home'))}
      </div>
      <div className="rt-row away">
        {rounds.map(r => renderCell(r, awayTeamId, 'away'))}
      </div>
    </div>
  );

  return (
    <div className="rt-container">
      <div className="rt-teams">
        <div className="rt-team-label rt-spacer" />
        <div className="rt-team-label home">
          {homeLogo && <img src={homeLogo} alt="" className="rt-team-logo" />}
          <span>{homeAbbr}</span>
        </div>
        <div className="rt-team-label away">
          {awayLogo && <img src={awayLogo} alt="" className="rt-team-logo" />}
          <span>{awayAbbr}</span>
        </div>
      </div>

      <div className="rt-sections">
        {renderSection(firstHalf)}

        {secondHalf.length > 0 && (
          <>
            <div className="rt-divider">
              <span className="rt-divider-label">
                {halftimeScore ? `${halftimeScore.home}-${halftimeScore.away}` : 'HT'}
              </span>
            </div>
            {renderSection(secondHalf)}
          </>
        )}

        {overtime.length > 0 && (
          <>
            <div className="rt-divider">
              <span className="rt-divider-label">OT</span>
            </div>
            {renderSection(overtime)}
          </>
        )}
      </div>
    </div>
  );
}
