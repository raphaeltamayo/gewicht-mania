/**
 * A single-player opponent.
 *
 * The bot is deliberately fed the *redacted* view of the game, exactly what a
 * remote guest would receive. It cannot see your hand, your bets, or your
 * face-down cards, so it can never cheat — if it ever looks clairvoyant, that is
 * a bug in `redact()`, not in here.
 *
 * `nextAction` returns one action at a time, or null when the bot is waiting on
 * the human. Flow-control steps (revealing the river, flipping duels) stay in
 * the player's hands, so the pacing of a solo game is the same as a hot-seat one.
 */
import { attackCount, RULES } from './config';
import {
  isHidden,
  OTHER,
  SUITS,
  type Action,
  type AnyCard,
  type Card,
  type GameState,
  type PlayerId,
} from './types';

/** Stable pseudo-random in [0,1) derived from a string, so a card's jitter never changes mid-decision. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const ownCards = (hand: AnyCard[]): Card[] => hand.filter((c): c is Card => !isHidden(c));

/** Highest first. */
const byValueDesc = (a: Card, b: Card) => b.value - a.value;

/**
 * Bet assignment: the bot wants the big river cards, so it ranks the slots by
 * card value and spends its highest bets on the best ones.
 *
 * The jitter is what keeps it beatable. Without it the bot would play the single
 * optimal permutation every round and the betting phase would be solved after
 * two games; with it, it misprices a slot or two and you can steal a card by
 * reading which ones it undervalued.
 */
function desiredBets(view: GameState): number[] {
  const ranked = view.river
    .map((slot, index) => ({ index, score: slot.card.value + (hash01(slot.card.id) * 5 - 2.5) }))
    .sort((a, b) => b.score - a.score);

  const bets = Array<number>(RULES.riverSize).fill(0);
  ranked.forEach(({ index }, rank) => {
    bets[index] = RULES.betMax - rank;
  });
  return bets;
}

/**
 * Cards the bot refuses to spend on a duel, because it needs them for Étape 4.
 * It keeps back roughly what it will have to commit: one buff plus the attacks.
 */
function reserveCount(view: GameState): number {
  return 1 + attackCount(view.round);
}

/** Pick a card to throw into a face-down duel over a river card. */
function duelCard(view: GameState, seat: PlayerId, prize: number): Card | null {
  const hand = ownCards(view.players[seat].hand).sort(byValueDesc);
  if (hand.length === 0) return null;

  // Spend a big card on a big prize, otherwise bid low and keep the powder dry.
  const spare = hand.length - reserveCount(view);
  if (prize >= 12 && spare > 0) return hand[0];
  if (spare <= 0) return hand[hand.length - 1];
  return hand[Math.min(hand.length - 1, Math.floor(hand.length / 2))];
}

/**
 * Buff choice: shore up the stat closest to zero, because a train dies the
 * moment any single stat hits zero.
 */
function buffCard(view: GameState, seat: PlayerId): Card | null {
  const hand = ownCards(view.players[seat].hand);
  if (hand.length === 0) return null;

  const stats = view.players[seat].stats;
  const weakest = SUITS.reduce((lo, s) => (stats[s] < stats[lo] ? s : lo), SUITS[0]);

  const onWeakest = hand.filter((c) => c.suit === weakest).sort(byValueDesc);
  if (onWeakest.length) return onWeakest[0];
  return [...hand].sort(byValueDesc)[0];
}

export function nextAction(view: GameState, seat: PlayerId): Action | null {
  const me = view.players[seat];

  switch (view.phase) {
    case 'betting': {
      if (me.betsLocked) return null;
      const want = desiredBets(view);
      // Walking the slots in order and letting the engine's swap rule do the
      // work converges on `want` in at most riverSize placements.
      for (let slot = 0; slot < want.length; slot++) {
        if (me.bets[slot] !== want[slot]) {
          return { type: 'placeBet', player: seat, slot, value: want[slot] };
        }
      }
      return { type: 'lockBets', player: seat };
    }

    case 'riverDuel': {
      const duel = view.riverDuel;
      if (!duel || duel.pending[seat]) return null;
      const slot = view.riverDuelSlot;
      const prize = slot === null ? 8 : view.river[slot].card.value;
      const card = duelCard(view, seat, prize);
      return card ? { type: 'commitDuelCard', player: seat, cardId: card.id } : null;
    }

    case 'buff': {
      if (me.buffLocked) return null;
      if (me.buff) return { type: 'lockBuff', player: seat };
      const card = buffCard(view, seat);
      return card ? { type: 'setBuff', player: seat, cardId: card.id } : null;
    }

    case 'attackPlacement': {
      if (me.attacksLocked) return null;
      const empty = me.attacks.findIndex((a) => a === null);
      if (empty === -1) return { type: 'lockAttacks', player: seat };

      // Strongest cards go to battle. Which slot gets which is a coin flip for
      // both sides anyway — the opponent's slots are face down — so the bot
      // shuffles its order rather than always leading with its best.
      const hand = ownCards(me.hand)
        .sort(byValueDesc)
        .slice(0, me.attacks.filter((a) => a === null).length)
        .sort((a, b) => hash01(a.id + view.round) - hash01(b.id + view.round));
      const card = hand[0];
      return card ? { type: 'placeAttack', player: seat, slot: empty, cardId: card.id } : null;
    }

    case 'battle': {
      const duel = view.battleDuels[view.battleIndex];
      // Only a revealed tie asks for another card.
      if (!duel || !duel.revealed || duel.winner !== null || duel.pending[seat]) return null;
      const hand = ownCards(me.hand).sort(byValueDesc);
      // A tie-break is worth winning outright: the loser eats the damage.
      return hand.length ? { type: 'commitDuelCard', player: seat, cardId: hand[0].id } : null;
    }

    default:
      // reveal / damage / roundEnd / gameOver are driven by the human's buttons.
      return null;
  }
}

/** How long to wait before playing, so the bot reads as a player and not a script. */
export function thinkDelay(view: GameState, seat: PlayerId): number {
  switch (view.phase) {
    // Bets are secret until the reveal, so there is nothing to watch: fill them
    // in quickly and let the human use the full timer.
    case 'betting':
      return view.players[seat].bets.some((b) => b === null) ? 40 : 300;
    case 'attackPlacement':
      return 180;
    default:
      return 550;
  }
}

export const BOT_SEAT: PlayerId = 'B';
export const HUMAN_SEAT: PlayerId = OTHER[BOT_SEAT];
