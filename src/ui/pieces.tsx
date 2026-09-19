import type { CSSProperties } from 'react';
import { RULES } from '../engine/config';
import { SUITS, SUIT_META, isHidden, type AnyCard, type PlayerState, type Stats, type Suit } from '../engine/types';
import { Layers, SuitIcon, TrainFront } from './icons';
import { TRAIN_PHOTO } from './photo';

const BET_MAX = RULES.betMax;

export function CardView({
  card,
  selected,
  onClick,
  small,
  muted,
}: {
  card: AnyCard | null;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  muted?: boolean;
}) {
  const cls = ['card', small ? 'card--sm' : '', selected ? 'is-selected' : '', muted ? 'is-muted' : ''].join(' ');

  if (!card) return <div className={`${cls} card--empty`} onClick={onClick} />;
  if (isHidden(card)) return <div className={`${cls} card--back`} onClick={onClick} />;

  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return (
    <button
      type="button"
      className={`${cls} ${red ? 'card--red' : 'card--dark'}`}
      onClick={onClick}
      disabled={!onClick}
      title={`${card.value} ${SUIT_META[card.suit].stat}`}
    >
      <span className="card__value">{card.value}</span>
      <SuitIcon suit={card.suit} size={small ? 13 : 16} />
    </button>
  );
}

/**
 * A bet card, 1 to 8.
 *
 * The number alone was not enough to read the board: at a glance 1 and 8 look
 * the same, and betting is entirely about which of two numbers is bigger. So the
 * chip is filled in proportion to its value — a 1 is a sliver, an 8 is full —
 * and the fill deepens with it. Comparing two chips becomes a matter of looking
 * at the bars, not reading and ranking two digits.
 */
export function BetChip({
  value,
  onClick,
  selected,
  hidden,
}: {
  value: number | null;
  onClick?: () => void;
  selected?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return <div className="bet bet--back" />;
  if (value === null) return <div className="bet bet--empty" onClick={onClick} />;

  const level = value / BET_MAX;
  return (
    <button
      type="button"
      className={`bet bet--filled ${selected ? 'is-selected' : ''} ${value > BET_MAX * 0.625 ? 'is-strong' : ''}`}
      // Pale at 1, deep at 8. The digit flips to white past the point where the
      // fill is dark enough to swallow dark ink.
      style={{ '--fill': `${level * 100}%`, '--ink': `${88 - level * 56}%` } as CSSProperties}
      onClick={onClick}
      disabled={!onClick}
      title={`Mise ${value} sur ${BET_MAX}`}
    >
      <span className="bet__value">{value}</span>
    </button>
  );
}

export function StatRow({ suit, base, current }: { suit: Suit; base: number; current: number }) {
  const meta = SUIT_META[suit];
  const delta = current - base;
  const dead = current <= 0;
  return (
    <div className={`stat ${dead ? 'is-dead' : ''}`}>
      <SuitIcon suit={suit} size={15} />
      <span className="stat__name">{meta.stat}</span>
      <span className="stat__value">
        {current}
        <small>{meta.unit}</small>
      </span>
      {delta !== 0 && (
        <span className={`stat__delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? `+${delta}` : delta}</span>
      )}
    </div>
  );
}

export function TrainPanel({
  player,
  label,
  stats,
  tone,
  handCount,
}: {
  player: PlayerState;
  label: string;
  stats: Stats;
  tone: 'a' | 'b';
  /** Cards held. Shown as a badge so the opponent's hand needs no row of its own. */
  handCount?: number;
}) {
  return (
    <div className={`train train--${tone}`}>
      <div className="train__head">
        {TRAIN_PHOTO ? (
          <img className="train__art" src={TRAIN_PHOTO} alt="" />
        ) : (
          <span className="train__art train__art--placeholder">
            <TrainFront size={20} />
          </span>
        )}
        <div className="train__ident">
          <div className="train__label">{label}</div>
          <strong className="train__name">{player.train.name}</strong>{' '}
          <span className="train__meta">
            {player.train.origin}, {player.train.year}
          </span>
        </div>
        {handCount !== undefined && (
          <span className="train__hand" title={`${handCount} carte(s) en main`}>
            <Layers size={13} />
            {handCount}
          </span>
        )}
      </div>
      <div className="train__stats">
        {SUITS.map((s) => (
          <StatRow key={s} suit={s} base={player.train.stats[s]} current={stats[s]} />
        ))}
      </div>
    </div>
  );
}
