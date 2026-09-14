import { OTHER, isHidden, type AnyCard, type GameState, type PlayerId } from './types';

const hide = (c: AnyCard | null, index = 0): AnyCard | null =>
  c === null ? null : isHidden(c) ? c : { id: `hidden-${index}`, hidden: true };

const hideAll = (cards: AnyCard[]): AnyCard[] => cards.map((c, i) => hide(c, i)!);

/**
 * Strips everything `viewer` is not entitled to see, so the host can broadcast a
 * state to the guest without leaking the hand, the bets, or the face-down cards.
 *
 * This is the only thing standing between a player and their opponent's hand, so
 * when a new secret is added to GameState it has to be handled here too.
 */
export function redact(state: GameState, viewer: PlayerId): GameState {
  const view = structuredClone(state);
  const foe = OTHER[viewer];
  const opponent = view.players[foe];

  opponent.hand = hideAll(opponent.hand);

  // Bets stay secret until the slot they sit on has actually been revealed.
  if (view.phase === 'betting') {
    opponent.bets = opponent.bets.map(() => null);
  } else if (view.phase === 'reveal') {
    opponent.bets = opponent.bets.map((b, i) => (i < view.revealIndex ? b : null));
  }

  // The buff is flipped only once every battle duel has been settled.
  const buffsRevealed = view.phase === 'damage' || view.phase === 'roundEnd' || view.phase === 'gameOver';
  if (!buffsRevealed) opponent.buff = hide(opponent.buff, 99);

  opponent.attacks = opponent.attacks.map((card, i) => {
    const duel = view.battleDuels[i];
    const flipped = view.phase !== 'attackPlacement' && (duel?.revealed ?? false);
    return flipped ? card : hide(card, i);
  });

  for (const duel of view.battleDuels) {
    if (!duel.revealed) duel.stacks[foe] = hideAll(duel.stacks[foe]) as never;
    duel.pending[foe] = duel.pending[foe] ? (hide(duel.pending[foe], 0) as never) : null;
  }

  if (view.riverDuel) {
    if (!view.riverDuel.revealed) {
      view.riverDuel.stacks[foe] = hideAll(view.riverDuel.stacks[foe]) as never;
    }
    view.riverDuel.pending[foe] = view.riverDuel.pending[foe] ? ({ id: 'hidden-p', hidden: true } as never) : null;
  }

  // The draw pile's order is a secret too, but its size is public.
  view.deck = view.deck.map((_, i) => ({ id: `deck-${i}`, hidden: true })) as never;
  view.rng = 0;

  return view;
}
