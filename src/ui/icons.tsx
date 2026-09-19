import { Club, Diamond, Heart, Spade, type LucideIcon } from 'lucide-react';
import type { Suit } from '../engine/types';

const SUIT_ICON: Record<Suit, LucideIcon> = {
  hearts: Heart,
  diamonds: Diamond,
  clubs: Club,
  spades: Spade,
};

/**
 * The four suits double as the four train stats, so they show up on cards, on
 * stat rows and in the log. One component keeps them consistent everywhere.
 */
export function SuitIcon({ suit, size = 16, className }: { suit: Suit; size?: number; className?: string }) {
  const Icon = SUIT_ICON[suit];
  const filled = suit === 'hearts' || suit === 'diamonds';
  return (
    <Icon
      size={size}
      className={`suit suit--${suit} ${className ?? ''}`}
      strokeWidth={2}
      fill={filled ? 'currentColor' : 'currentColor'}
      aria-hidden
    />
  );
}

export { Bot, Home, Hourglass, Layers, Lock, RotateCcw, Shuffle, Swords, TrainFront, Users, Zap } from 'lucide-react';
