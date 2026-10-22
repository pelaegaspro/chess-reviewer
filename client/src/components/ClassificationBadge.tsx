import React from 'react';
import { MoveClassification } from '../types';

interface ClassificationBadgeProps {
  classification?: MoveClassification | string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

interface BadgeInfo {
  icon: string;
  label: string;
  color: string;
}

const BADGE_MAP: Record<string, BadgeInfo> = {
  brilliant: { icon: '/badges/brilliant.svg', label: 'Brilliant', color: '#1baca6' },
  great: { icon: '/badges/great.svg', label: 'Great', color: '#5c8bb0' },
  best: { icon: '/badges/best.svg', label: 'Best', color: '#81b64c' },
  excellent: { icon: '/badges/excellent.svg', label: 'Excellent', color: '#96bc4b' },
  good: { icon: '/badges/good.svg', label: 'Good', color: '#8fa89b' },
  book: { icon: '/badges/book.svg', label: 'Book', color: '#c28b5e' },
  inaccuracy: { icon: '/badges/inaccuracy.svg', label: 'Inaccuracy', color: '#f0c15c' },
  mistake: { icon: '/badges/mistake.svg', label: 'Mistake', color: '#e6912c' },
  missed_win: { icon: '/badges/missed_win.svg', label: 'Missed win', color: '#db5c5c' },
  blunder: { icon: '/badges/blunder.svg', label: 'Blunder', color: '#ca3431' },
  forced: { icon: '/badges/forced.svg', label: 'Forced', color: '#73706c' }
};

const SIZE_CLASSES = {
  xs: 'w-4 h-4 min-w-[16px] min-h-[16px]',
  sm: 'w-5 h-5 min-w-[20px] min-h-[20px]',
  md: 'w-6 h-6 min-w-[24px] min-h-[24px]',
  lg: 'w-8 h-8 min-w-[32px] min-h-[32px]'
};

export const ClassificationBadge: React.FC<ClassificationBadgeProps> = ({
  classification,
  size = 'sm',
  showLabel = false,
  className = ''
}) => {
  if (!classification) return null;

  const key = classification.toLowerCase().replace(/[-\s]/g, '_');
  const badge = BADGE_MAP[key] || BADGE_MAP.best;
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.sm;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <img
        src={badge.icon}
        alt={badge.label}
        className={`${sizeClass} object-contain flex-shrink-0 select-none drop-shadow-sm`}
        title={badge.label}
        draggable={false}
      />
      {showLabel && (
        <span className="font-bold text-xs" style={{ color: badge.color }}>
          {badge.label}
        </span>
      )}
    </div>
  );
};
