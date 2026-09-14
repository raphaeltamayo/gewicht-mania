import { SUIT_META, isHidden, type AnyCard, type PlayerState, type Stats, type Suit } from '../engine/types';
import { SUITS } from '../engine/types';

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

  if (isHidden(card)) {
    return <div className={`${cls} card--back`} onClick={onClick} />;
  }

  const meta = SUIT_META[card.suit];
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return (
    <button type="button" className={`${cls} ${red ? 'card--red' : 'card--dark'}`} onClick={onClick} disabled={!onClick}>
      <span className="card__value">{card.value}</span>
      <span className="card__suit">{meta.glyph}</span>
    </button>
  );
}

export function BetChip({
  value,
  onClick,
  selected,
  used,
  hidden,
}: {
  value: number | null;
  onClick?: () => void;
  selected?: boolean;
  used?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return <div className="bet bet--back" />;
  if (value === null) return <div className="bet bet--empty" onClick={onClick} />;
  return (
    <button
      type="button"
      className={`bet ${selected ? 'is-selected' : ''} ${used ? 'is-used' : ''}`}
      onClick={onClick}
      disabled={!onClick}
    >
      {value}
    </button>
  );
}

export function StatRow({ suit, base, current }: { suit: Suit; base: number; current: number }) {
  const meta = SUIT_META[suit];
  const delta = current - base;
  const dead = current <= 0;
  return (
    <div className={`stat ${dead ? 'is-dead' : ''}`}>
      <span className={`stat__glyph stat__glyph--${suit}`}>{meta.glyph}</span>
      <span className="stat__name">{meta.stat}</span>
      <span className="stat__value">
        {current}
        <small>{meta.unit}</small>
      </span>
      {delta !== 0 && <span className={`stat__delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? `+${delta}` : delta}</span>}
    </div>
  );
}

export function TrainPanel({ player, label, stats }: { player: PlayerState; label: string; stats: Stats }) {
  return (
    <div className="train">
      <div className="train__head">
        <span className="train__label">{label}</span>
        <strong className="train__name">{player.train.name}</strong>
        <span className="train__meta">
          {player.train.origin} · {player.train.year}
        </span>
      </div>
      <div className="train__stats">
        {SUITS.map((s) => (
          <StatRow key={s} suit={s} base={player.train.stats[s]} current={stats[s]} />
        ))}
      </div>
    </div>
  );
}
