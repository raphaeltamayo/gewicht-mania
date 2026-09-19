/**
 * Every rules decision that could reasonably have gone the other way lives here,
 * so playtests can change the game without touching the engine.
 *
 * The comments record what was actually decided, and why, for the ones that were
 * ambiguous in the written ruleset.
 */
export const RULES = {
  /** Cards dealt in Étape 1 of round 1. Grows by 1 each round. */
  baseDeal: 3,
  /** Attack cards played in Étape 4 of round 1. Grows by 1 each round. */
  baseAttacks: 3,
  /** Size of the river. */
  riverSize: 8,
  /** Cards a single player may win from the river before the rest go to the opponent. */
  riverCap: 4,
  /** Bet deck is 1..betMax, one deck per player, no duplicates within a deck. */
  betMax: 8,
  /** Deck C is 4 suits x 1..deckMaxValue. */
  deckMaxValue: 15,

  /** Étape 2 thinking-phase timer, in seconds. */
  betSeconds: 120,
  /**
   * Bets not placed when the timer expires are filled in at random from the
   * player's unused bet cards.
   */
  autoFillBetsOnTimeout: true,

  /**
   * The river is walked left to right (reading direction). Slots where both bets
   * were equal stay in the river and are settled afterwards by face-down duels.
   */
  revealLeftToRight: true,

  /**
   * Cards played into a duel are discarded and immediately replaced from the
   * deck, so a player's hand is whole again before the next duel. (If false,
   * replacements are only drawn at the end of the round.)
   */
  redrawImmediatelyAfterDuel: true,

  /**
   * Train stats are restored to their printed values at the end of every round:
   * damage does NOT carry over. A train must be killed within a single round.
   *
   * Flip this to false for the variant where damage persists between rounds and
   * only the buff is stripped, worth trying once the base game feels right.
   */
  resetStatsEachRound: true,

  /**
   * If a duel ties and neither player has a card left to escalate with, the duel
   * is a draw and no attack lands.
   */
  exhaustedDuelIsDraw: true,

  /** Demo trains roll each stat uniformly in this range. */
  demoStatRange: [10, 30] as [number, number],
};

/**
 * The bet deck's printed ranks, weakest first.
 *
 * The engine orders bets 1..8 because that is what comparing them needs, but the
 * cards on the table are a German-suited deck: 7, 8, 9, 10, Unter, Ober, König,
 * Ass. That is the vocabulary players use out loud, so the log speaks it too —
 * a line reading "mise 8 contre 7" next to a board showing A and K is a puzzle
 * nobody should have to solve.
 */
export const BET_RANKS = ['7', '8', '9', '10', 'U', 'O', 'K', 'A'];

/** Printed rank of a bet value (1 = weakest). */
export const betRank = (value: number) => BET_RANKS[value - 1] ?? String(value);

/** Cards dealt in Étape 1 of a given round (1-indexed). */
export const dealCount = (round: number) => RULES.baseDeal + (round - 1);

/** Attack cards each player commits in Étape 4 of a given round. */
export const attackCount = (round: number) => RULES.baseAttacks + (round - 1);

/**
 * Hand size a player should hold entering Étape 4.
 * Always `dealCount + riverCap`, which is 7 in round 1, 8 in round 2, and so on.
 * After committing 1 buff and `attackCount` attacks, exactly 3 cards remain.
 */
export const handAtDuelPhase = (round: number) => dealCount(round) + RULES.riverCap;
