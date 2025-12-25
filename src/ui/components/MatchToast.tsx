// src/ui/components/MatchToast.tsx
// Toast notification for match results

import { useEffect, useState } from 'react';
import type { Team } from '../../types';
import './MatchToast.css';

export interface MatchToastData {
  id: string;
  matchId: string;
  userTeam: Team;
  opponent: Team;
  userScore: number;
  opponentScore: number;
  isWin: boolean;
}

interface MatchToastProps {
  toast: MatchToastData;
  onDismiss: (id: string) => void;
  onClick: (matchId: string) => void;
}

export function MatchToast({ toast, onDismiss, onClick }: MatchToastProps) {
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = () => {
    setIsDismissing(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 300); // Match animation duration
  };

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking the close button
    if ((e.target as HTMLElement).closest('.toast-close')) return;
    handleDismiss();
    setTimeout(() => {
      onClick(toast.matchId);
    }, 150);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, 5000); // Auto-dismiss after 5 seconds

    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <div 
      className={`match-toast ${toast.isWin ? 'win' : 'loss'} ${isDismissing ? 'dismissing' : ''}`}
      onClick={handleClick}
    >
      <button 
        className="toast-close" 
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
      >
        ×
      </button>
      <div className="toast-header">
        {toast.isWin ? '🎉 Victory!' : '😔 Defeat'}
      </div>
      <div className="toast-matchup">
        <div className="toast-team">
          <img src={toast.userTeam.logo} alt="" className="toast-logo" />
          <span className="toast-team-name">{toast.userTeam.abbreviation}</span>
          <span className={`toast-score ${toast.isWin ? 'winner' : ''}`}>{toast.userScore}</span>
        </div>
        <span className="toast-vs">-</span>
        <div className="toast-team">
          <span className={`toast-score ${!toast.isWin ? 'winner' : ''}`}>{toast.opponentScore}</span>
          <span className="toast-team-name">{toast.opponent.abbreviation}</span>
          <img src={toast.opponent.logo} alt="" className="toast-logo" />
        </div>
      </div>
      <div className="toast-hint">Click to view details</div>
    </div>
  );
}

interface MatchToastContainerProps {
  toasts: MatchToastData[];
  onDismiss: (id: string) => void;
  onClickMatch: (matchId: string) => void;
}

export function MatchToastContainer({ toasts, onDismiss, onClickMatch }: MatchToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="match-toast-container">
      {toasts.map((toast) => (
        <MatchToast 
          key={toast.id} 
          toast={toast} 
          onDismiss={onDismiss} 
          onClick={onClickMatch}
        />
      ))}
    </div>
  );
}