// src/ui/components/PlayerAvatar.tsx
// Player avatar component with generic placeholder

import React, { useState } from 'react';
import './PlayerAvatar.css';

interface PlayerAvatarProps {
  playerId?: string;
  playerName: string;
  imageUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80,
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  playerName,
  imageUrl,
  size = 'md',
  className = '',
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(!!imageUrl);

  const px = SIZE_MAP[size] || SIZE_MAP.md;
  
  // Only use custom imageUrl if provided and not errored
  const useCustomImage = imageUrl && !imageError;

  const handleError = () => {
    setImageError(true);
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  // Default: generic person silhouette (no network required)
  if (!useCustomImage) {
    return (
      <div 
        className={`player-avatar player-avatar-${size} player-avatar-placeholder ${className}`}
        style={{ width: px, height: px }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="player-avatar-icon">
          <circle cx="12" cy="8" r="4" />
          <path d="M12 14c-6 0-8 3-8 6v1h16v-1c0-3-2-6-8-6z" />
        </svg>
      </div>
    );
  }

  // Custom image provided
  return (
    <div 
      className={`player-avatar player-avatar-${size} ${className} ${isLoading ? 'loading' : ''}`}
      style={{ width: px, height: px }}
    >
      <img
        src={imageUrl}
        alt={`${playerName} avatar`}
        onError={handleError}
        onLoad={handleLoad}
        className="player-avatar-img"
      />
    </div>
  );
};

export default PlayerAvatar;