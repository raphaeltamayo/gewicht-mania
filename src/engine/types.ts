/**
 * Core vocabulary for Gewicht Mania.
 *
 * The engine is a pure state machine: `reduce(state, action) -> state`. It has no
 * knowledge of React, the network, or timers. Everything the UI or the netcode
 * needs to do is expressed as an Action.
 */

/** The four suits double as the four train stats. */
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

export const SUIT_META: Record<Suit, { glyph: string; stat: string; unit: string }> = {
  hearts: { glyph: '♥', stat: 'Longueur', unit: 'm' },
  diamonds: { glyph: '♦', stat: 'Poids', unit: 't' },
  clubs: { glyph: '♣', stat: 'Énergie', unit: 'kW' },
  spades: { glyph: '♠', stat: 'Vitesse', unit: 'km/h' },
};

export type PlayerId = 'A' | 'B';

export const OTHER: Record<PlayerId, PlayerId> = { A: 'B', B: 'A' };

/** A card from deck C (the draw pile). */
export type Card = {
  id: string;
  suit: Suit;
  value: number;
  hidden?: false;
};

/**
 * Stand-in sent to a player for a card they are not allowed to see.
 * Produced only by `redact()`; the engine itself never creates one.
 */
export type HiddenCard = { id: string; hidden: true };

export type AnyCard = Card | HiddenCard;

export function isHidden(c: AnyCard | null | undefined): c is HiddenCard {
  return !!c && (c as HiddenCard).hidden === true;
}

/** Narrows to a real card. Throws if the engine ever touches a redacted one. */
export function real(c: AnyCard | null | undefined): Card {
  if (!c || isHidden(c)) throw new Error('engine touched a hidden card');
  return c;
}

export type Train = {
  name: string;
  origin: string;
  year: number;
  /** Base stats, restored at the start of every round. */
  stats: Record<Suit, number>;
};

export type Stats = Record<Suit, number>;

/** One of the 8 face-up cards in the middle of the board. */
export type RiverSlot = {
  card: Card;
  /** `pending` = not yet revealed, `contested` = both bets were equal. */
  resolution: 'pending' | 'won' | 'contested';
  winner: PlayerId | null;
};

/**
 * A face-down card duel. `stacks` grow by one card each time the duel ties and
 * has to escalate; the top card of each stack is the one currently fighting.
 */
export type Duel = {
  stacks: Record<PlayerId, Card[]>;
  /** Cards both players have committed but not yet flipped. */
  pending: Record<PlayerId, Card | null>;
  revealed: boolean;
  winner: PlayerId | 'draw' | null;
};

export type Attack = {
  attacker: PlayerId;
  suit: Suit;
  value: number;
};

export type PlayerState = {
  train: Train;
  /** Working copy of the stats: buffed, damaged, and reset every round. */
  stats: Stats;
  hand: AnyCard[];
  /** bets[i] is the bet card value placed opposite river slot i, or null. */
  bets: (number | null)[];
  betsLocked: boolean;
  buff: AnyCard | null;
  /** attacks[i] is the card committed to battle slot i. */
  attacks: (AnyCard | null)[];
  attacksLocked: boolean;
  /** Cards won from the river this round (capped at 4). */
  riverWins: number;
};

export type Phase =
  | 'lobby'
  /** Étape 2 — both players place their 8 bet cards under a timer. */
  | 'betting'
  /** Étape 3a — walking the river left to right comparing bets. */
  | 'reveal'
  /** Étape 3b — face-down duels over the slots where bets tied. */
  | 'riverDuel'
  /** Étape 4a — each player commits one face-down buff card. */
  | 'buff'
  /** Étape 4b — each player commits their attack cards face down. */
  | 'attackPlacement'
  /** Étape 4c — flipping the attack pairs one at a time. */
  | 'battle'
  /** Étape 4d — buffs revealed, damage applied. */
  | 'damage'
  | 'roundEnd'
  | 'gameOver';

export type LogEntry = { round: number; text: string };

export type GameState = {
  /** Kept in state so a game can be replayed exactly from its seed. */
  rng: number;
  round: number;
  phase: Phase;
  deck: Card[];
  discard: Card[];
  river: RiverSlot[];
  players: Record<PlayerId, PlayerState>;

  /** Epoch ms when the betting timer expires. */
  betDeadline: number | null;
  /** Cursor into `river` during the reveal phase. */
  revealIndex: number;
  /** Index into the contested-slot list during river duels. */
  riverDuelSlot: number | null;
  riverDuel: Duel | null;
  /** Cursor into `battleDuels`. */
  battleIndex: number;
  battleDuels: Duel[];
  attacks: Attack[];
  /** Damage taken, per player, per stat — applied all at once in `damage`. */
  damageTaken: Record<PlayerId, Stats>;

  log: LogEntry[];
  outcome: PlayerId | 'draw' | null;
};

export type Action =
  | { type: 'startGame'; seed: number }
  | { type: 'placeBet'; player: PlayerId; slot: number; value: number }
  | { type: 'clearBet'; player: PlayerId; slot: number }
  | { type: 'lockBets'; player: PlayerId }
  | { type: 'betTimeout' }
  | { type: 'revealNext' }
  | { type: 'commitDuelCard'; player: PlayerId; cardId: string }
  | { type: 'revealDuel' }
  | { type: 'setBuff'; player: PlayerId; cardId: string }
  | { type: 'placeAttack'; player: PlayerId; slot: number; cardId: string }
  | { type: 'clearAttack'; player: PlayerId; slot: number }
  | { type: 'lockAttacks'; player: PlayerId }
  | { type: 'revealBattleNext' }
  | { type: 'applyDamage' }
  | { type: 'nextRound' };
