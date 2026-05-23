// src/ui/components/PlayerAvatar.tsx
// Player avatar component with generic placeholder and optional flag badge

import React, { useState } from 'react';
import { flagSrc } from './MassPlayerEditor';
import './PlayerAvatar.css';

interface PlayerAvatarProps {
  playerId?: string;
  playerName: string;
  imageUrl?: string;
  nationality?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showFlag?: boolean;
}

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80,
};

// Flag badge dimensions scale with avatar size
const FLAG_SIZE: Record<string, { w: number; h: number; offset: number; ring: number }> = {
  xs: { w: 10, h: 8, offset: -2, ring: 1 },
  sm: { w: 14, h: 10, offset: -3, ring: 1.5 },
  md: { w: 18, h: 14, offset: -4, ring: 1.5 },
  lg: { w: 22, h: 16, offset: -4, ring: 2 },
  xl: { w: 26, h: 20, offset: -5, ring: 2 },
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  playerName,
  imageUrl,
  nationality,
  size = 'md',
  className = '',
  showFlag = true,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(!!imageUrl);

  const px = SIZE_MAP[size] || SIZE_MAP.md;
  const useCustomImage = imageUrl && !imageError;

  const handleError = () => { setImageError(true); setIsLoading(false); };
  const handleLoad = () => { setIsLoading(false); };

  const flagInfo = FLAG_SIZE[size] || FLAG_SIZE.md;

  const flagBadge = nationality && showFlag ? (
    <img
      src={flagSrc(nationality)}
      alt={nationality}
      className="player-avatar-flag"
      style={{
        width: flagInfo.w,
        height: flagInfo.h,
        bottom: flagInfo.offset,
        left: flagInfo.offset,
        boxShadow: `0 0 0 ${flagInfo.ring}px var(--bg-card)`,
      }}
    />
  ) : null;

  if (!useCustomImage) {
    return (
      <div className={`player-avatar-wrap ${className}`}>
        <div
          className={`player-avatar player-avatar-${size} player-avatar-placeholder`}
          style={{ width: px, height: px }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="player-avatar-icon">
            <circle cx="12" cy="8" r="4" />
            <path d="M12 14c-6 0-8 3-8 6v1h16v-1c0-3-2-6-8-6z" />
          </svg>
        </div>
        {flagBadge}
      </div>
    );
  }

  return (
    <div className={`player-avatar-wrap ${className}`}>
      <div
        className={`player-avatar player-avatar-${size} ${isLoading ? 'loading' : ''}`}
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
      {flagBadge}
    </div>
  );
};

export default PlayerAvatar;

/** Tiny inline flag for use before player names (no avatar context) */
export const InlineFlag: React.FC<{ code?: string; size?: number }> = ({ code, size = 14 }) => {
  if (!code) return null;
  return (
    <img
      src={flagSrc(code)}
      alt={code}
      className="inline-flag"
      style={{ width: size, height: Math.round(size * 0.75) }}
    />
  );
};
