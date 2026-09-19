import { attackCount, dealCount, RULES } from './config';
import { buildDeck, drawDemoTrain } from './cards';
import { randomInt, shuffle } from './rng';
import {
  OTHER,
  SUITS,
  SUIT_META,
  isHidden,
  real,
  type Action,
  type Attack,
  type Card,
  type Duel,
  type GameState,
  type PlayerId,
  type PlayerState,
  type Stats,
  type Train,
} from './types';

const PLAYERS: PlayerId[] = ['A', 'B'];

const zeroStats = (): Stats => ({ hearts: 0, diamonds: 0, clubs: 0, spades: 0 });

const clone = <T>(v: T): T => structuredClone(v);

function log(state: GameState, text: string) {
  state.log.push({ round: state.round, text });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function emptyPlayer(train: Train): PlayerState {
  return {
    train,
    stats: { ...train.stats },
    hand: [],
    bets: Array(RULES.riverSize).fill(null),
    betsLocked: false,
    buff: null,
    buffLocked: false,
    attacks: [],
    attacksLocked: false,
    riverWins: 0,
  };
}

export function createGame(seed: number): GameState {
  let rng = seed | 0;
  const [trainA, r1] = drawDemoTrain(rng);
  rng = r1;
  // The two champions must be visibly different, so B cannot roll A's name.
  const [trainB, r2] = drawDemoTrain(rng, [trainA.name]);
  rng = r2;

  const state: GameState = {
    rng,
    round: 0,
    phase: 'lobby',
    deck: [],
    discard: [],
    river: [],
    players: { A: emptyPlayer(trainA), B: emptyPlayer(trainB) },
    betDeadline: null,
    revealIndex: 0,
    riverDuelSlot: null,
    riverDuel: null,
    battleIndex: 0,
    battleDuels: [],
    attacks: [],
    damageTaken: { A: zeroStats(), B: zeroStats() },
    log: [],
    outcome: null,
  };
  return state;
}

/**
 * Étape 1 (SETUP) + opening of Étape 2. Deck C is rebuilt and reshuffled, so no
 * card can appear twice within the round.
 */
function startRound(state: GameState) {
  state.round += 1;
  const round = state.round;

  const [deck, rng] = shuffle(buildDeck(), state.rng);
  state.rng = rng;
  state.deck = deck;
  state.discard = [];

  for (const p of PLAYERS) {
    const ps = state.players[p];
    if (RULES.resetStatsEachRound) ps.stats = { ...ps.train.stats };
    ps.hand = [];
    ps.bets = Array(RULES.riverSize).fill(null);
    ps.betsLocked = false;
    ps.buff = null;
    ps.buffLocked = false;
    ps.attacks = Array(attackCount(round)).fill(null);
    ps.attacksLocked = false;
    ps.riverWins = 0;
  }

  for (const p of PLAYERS) drawTo(state, p, dealCount(round));

  state.river = [];
  for (let i = 0; i < RULES.riverSize; i++) {
    state.river.push({ card: popDeck(state), resolution: 'pending', winner: null });
  }

  state.revealIndex = 0;
  state.riverDuelSlot = null;
  state.riverDuel = null;
  state.battleIndex = 0;
  state.battleDuels = [];
  state.attacks = [];
  state.damageTaken = { A: zeroStats(), B: zeroStats() };
  state.phase = 'betting';
  state.betDeadline = Date.now() + RULES.betSeconds * 1000;

  log(state, `Manche ${round} : ${dealCount(round)} cartes distribuées, rivière de ${RULES.riverSize}.`);
}

// ---------------------------------------------------------------------------
// Deck helpers
// ---------------------------------------------------------------------------

function popDeck(state: GameState): Card {
  if (state.deck.length === 0) {
    // Shouldn't happen with a 60-card deck, but a prototype should not crash.
    const [reshuffled, rng] = shuffle(state.discard, state.rng);
    state.rng = rng;
    state.deck = reshuffled;
    state.discard = [];
    log(state, 'Pioche épuisée : la défausse est remélangée.');
  }
  return state.deck.pop()!;
}

function drawTo(state: GameState, player: PlayerId, count: number) {
  const hand = state.players[player].hand;
  for (let i = 0; i < count; i++) hand.push(popDeck(state));
}

function takeFromHand(state: GameState, player: PlayerId, cardId: string): Card | null {
  const hand = state.players[player].hand;
  const idx = hand.findIndex((c) => !isHidden(c) && c.id === cardId);
  if (idx === -1) return null;
  return real(hand.splice(idx, 1)[0]);
}

// ---------------------------------------------------------------------------
// Etape 2: betting
// ---------------------------------------------------------------------------

function placeBet(state: GameState, player: PlayerId, slot: number, value: number) {
  const ps = state.players[player];
  if (ps.betsLocked) return;
  if (slot < 0 || slot >= RULES.riverSize) return;
  if (value < 1 || value > RULES.betMax) return;

  // Bet cards are interchangeable right up to the last moment: dropping a value
  // that is already placed elsewhere swaps the two slots rather than duplicating.
  const existing = ps.bets.indexOf(value);
  const displaced = ps.bets[slot];
  if (existing !== -1) ps.bets[existing] = displaced;
  ps.bets[slot] = value;
}

function autoFillBets(state: GameState, player: PlayerId, reason = 'au hasard') {
  const ps = state.players[player];
  const unused: number[] = [];
  for (let v = 1; v <= RULES.betMax; v++) if (!ps.bets.includes(v)) unused.push(v);
  if (unused.length === 0) return;

  const [shuffled, rng] = shuffle(unused, state.rng);
  state.rng = rng;
  let k = 0;
  for (let i = 0; i < ps.bets.length; i++) {
    if (ps.bets[i] === null) ps.bets[i] = shuffled[k++];
  }
  log(state, `Joueur ${player} : ${shuffled.length} mise(s) placée(s) ${reason}.`);
}

function maybeStartReveal(state: GameState) {
  if (state.phase !== 'betting') return;
  if (!state.players.A.betsLocked || !state.players.B.betsLocked) return;
  state.phase = 'reveal';
  state.revealIndex = 0;
  state.betDeadline = null;
  log(state, 'Phase de révélation : la rivière est évaluée de gauche à droite.');
}

// ---------------------------------------------------------------------------
// Etape 3: reveal and river duels
// ---------------------------------------------------------------------------

function giveRiverCard(state: GameState, slotIndex: number, winner: PlayerId) {
  const slot = state.river[slotIndex];
  slot.resolution = 'won';
  slot.winner = winner;
  state.players[winner].hand.push(slot.card);
  state.players[winner].riverWins += 1;
}

/**
 * Reaching the 4-card cap ends the contest immediately: every card still in the
 * river, unrevealed or contested, goes to the opponent. Because the capped
 * player holds exactly 4, the opponent always ends on 4 as well.
 */
function awardRemainderTo(state: GameState, player: PlayerId) {
  let given = 0;
  for (let i = 0; i < state.river.length; i++) {
    const slot = state.river[i];
    if (slot.resolution === 'won') continue;
    slot.resolution = 'won';
    slot.winner = player;
    state.players[player].hand.push(slot.card);
    state.players[player].riverWins += 1;
    given++;
  }
  if (given > 0) log(state, `Joueur ${player} récupère les ${given} carte(s) restantes de la rivière.`);
  state.riverDuel = null;
  state.riverDuelSlot = null;
  enterRiverRecap(state);
}

/**
 * A beat between Étape 3 and Étape 4.
 *
 * Without it the board could jump from "place your duel card" straight to the
 * buff phase: a duel resolving can push a player to the 4-card cap, which hands
 * the whole rest of the river to the opponent at once. All of that used to
 * happen between two frames, so nobody ever saw what they had won.
 */
function enterRiverRecap(state: GameState) {
  state.phase = 'riverRecap';
  state.riverDuel = null;
  state.riverDuelSlot = null;
}

function contestedSlots(state: GameState): number[] {
  const out: number[] = [];
  state.river.forEach((s, i) => {
    if (s.resolution === 'contested') out.push(i);
  });
  return out;
}

function newDuel(seedA: Card[] = [], seedB: Card[] = []): Duel {
  return {
    stacks: { A: seedA, B: seedB },
    pending: { A: null, B: null },
    revealed: false,
    winner: null,
  };
}

function revealNext(state: GameState) {
  if (state.phase !== 'reveal') return;
  const i = state.revealIndex;
  if (i >= state.river.length) return;

  const betA = state.players.A.bets[i];
  const betB = state.players.B.bets[i];
  const slot = state.river[i];

  if (betA !== null && betB !== null && betA > betB) {
    giveRiverCard(state, i, 'A');
    log(state, `Rivière ${i + 1} : A mise ${betA} contre ${betB}, A remporte la carte.`);
  } else if (betA !== null && betB !== null && betB > betA) {
    giveRiverCard(state, i, 'B');
    log(state, `Rivière ${i + 1} : B mise ${betB} contre ${betA}, B remporte la carte.`);
  } else {
    slot.resolution = 'contested';
    log(state, `Rivière ${i + 1} : égalité à ${betA}, la carte reste en jeu.`);
  }

  state.revealIndex = i + 1;

  for (const p of PLAYERS) {
    if (state.players[p].riverWins >= RULES.riverCap) {
      awardRemainderTo(state, OTHER[p]);
      return;
    }
  }

  if (state.revealIndex >= state.river.length) startRiverDuels(state);
}

function startRiverDuels(state: GameState) {
  const contested = contestedSlots(state);
  if (contested.length === 0) {
    enterRiverRecap(state);
    return;
  }
  state.phase = 'riverDuel';
  state.riverDuelSlot = contested[0];
  state.riverDuel = newDuel();
  log(state, `${contested.length} carte(s) à départager au duel.`);
}

function advanceRiverDuel(state: GameState) {
  const contested = contestedSlots(state);
  if (contested.length === 0) {
    enterRiverRecap(state);
    return;
  }
  state.phase = 'riverDuel';
  state.riverDuelSlot = contested[0];
  state.riverDuel = newDuel();
}

// ---------------------------------------------------------------------------
// Duels (shared by Étape 3 and Étape 4)
// ---------------------------------------------------------------------------

function activeDuel(state: GameState): Duel | null {
  if (state.phase === 'riverDuel') return state.riverDuel;
  if (state.phase === 'battle') return state.battleDuels[state.battleIndex] ?? null;
  return null;
}

function commitDuelCard(state: GameState, player: PlayerId, cardId: string) {
  const duel = activeDuel(state);
  if (!duel) return;
  // During a battle duel, cards are only committed to break a revealed tie.
  if (state.phase === 'battle' && !duel.revealed) return;
  if (duel.pending[player]) return;

  const card = takeFromHand(state, player, cardId);
  if (!card) return;
  duel.pending[player] = card;

  if (duel.pending.A && duel.pending.B) {
    duel.stacks.A.push(real(duel.pending.A));
    duel.stacks.B.push(real(duel.pending.B));
    duel.pending = { A: null, B: null };
    duel.revealed = true;
    resolveDuel(state, duel);
  }
}

function topOf(duel: Duel, player: PlayerId): Card | null {
  const stack = duel.stacks[player];
  return stack.length ? stack[stack.length - 1] : null;
}

function canEscalate(state: GameState): boolean {
  return state.players.A.hand.length > 0 && state.players.B.hand.length > 0;
}

function resolveDuel(state: GameState, duel: Duel) {
  const a = topOf(duel, 'A');
  const b = topOf(duel, 'B');
  if (!a || !b) return;

  if (a.value > b.value) duel.winner = 'A';
  else if (b.value > a.value) duel.winner = 'B';
  else if (RULES.exhaustedDuelIsDraw && !canEscalate(state)) duel.winner = 'draw';
  else {
    // Tie with cards left: both players stack another card on top.
    duel.winner = null;
    return;
  }

  if (state.phase === 'riverDuel') finishRiverDuel(state, duel);
  else finishBattleDuel(state, duel);
}

function discardDuel(state: GameState, duel: Duel) {
  state.discard.push(...duel.stacks.A, ...duel.stacks.B);
}

function finishRiverDuel(state: GameState, duel: Duel) {
  const slotIndex = state.riverDuelSlot;
  if (slotIndex === null) return;
  const played = duel.stacks.A.length;

  if (duel.winner === 'draw') {
    // Nobody can escalate: hand the card to whoever is further from the cap.
    const a = state.players.A.riverWins;
    const b = state.players.B.riverWins;
    if (a !== b) {
      giveRiverCard(state, slotIndex, a < b ? 'A' : 'B');
      log(state, `Rivière ${slotIndex + 1} : duel nul, la carte va au joueur le moins avancé.`);
    } else {
      state.river[slotIndex].resolution = 'won';
      state.river[slotIndex].winner = null;
      state.discard.push(state.river[slotIndex].card);
      log(state, `Rivière ${slotIndex + 1} : duel nul, la carte est défaussée.`);
    }
  } else if (duel.winner) {
    giveRiverCard(state, slotIndex, duel.winner);
    const top = topOf(duel, duel.winner)!;
    log(state, `Rivière ${slotIndex + 1} : ${duel.winner} l'emporte avec un ${top.value}.`);
  }

  discardDuel(state, duel);

  // One card drawn for every card played, immediately, so the hand is whole
  // before the next duel.
  if (RULES.redrawImmediatelyAfterDuel) {
    for (const p of PLAYERS) drawTo(state, p, played);
  }

  // Stop here and leave the settled duel on the board. What happens next — the
  // next duel, or the cap handing the rest of the river to one player — only
  // runs once the players acknowledge this result.
  state.phase = 'riverDuelResult';
}

/** Leave `riverDuelResult`: apply the cap rule, then move to the next duel. */
function resumeAfterRiverDuel(state: GameState) {
  for (const p of PLAYERS) {
    if (state.players[p].riverWins >= RULES.riverCap) {
      awardRemainderTo(state, OTHER[p]);
      return;
    }
  }
  advanceRiverDuel(state);
}

// ---------------------------------------------------------------------------
// Etape 4: buff, attacks, battle
// ---------------------------------------------------------------------------

function enterBuffPhase(state: GameState) {
  state.phase = 'buff';
  for (const p of PLAYERS) {
    state.players[p].attacks = Array(attackCount(state.round)).fill(null);
    state.players[p].attacksLocked = false;
  }
  log(state, 'Phase de duel : chaque joueur choisit sa carte de buff.');
}

function setBuff(state: GameState, player: PlayerId, cardId: string) {
  const ps = state.players[player];
  if (ps.buff || ps.buffLocked) return;
  const card = takeFromHand(state, player, cardId);
  if (!card) return;
  ps.buff = card;
}

/**
 * Validating the buff is what actually commits it. Without this step the phase
 * would advance the instant the second player picked a card, which left no
 * window at all to undo a mis-tap — and against the bot, no window means none.
 */
function lockBuff(state: GameState, player: PlayerId) {
  const ps = state.players[player];
  if (!ps.buff) return;
  ps.buffLocked = true;

  if (state.players.A.buffLocked && state.players.B.buffLocked) {
    state.phase = 'attackPlacement';
    log(state, `Bataille : ${attackCount(state.round)} cartes d'attaque à placer.`);
  }
}

/**
 * Take the buff back. Only legal while the buff phase is still running, which
 * means the opponent has not committed yet: once both buffs are in, the engine
 * has already moved on to `attackPlacement` and there is nothing to undo.
 */
function clearBuff(state: GameState, player: PlayerId) {
  const ps = state.players[player];
  if (ps.buffLocked) return;
  if (!ps.buff || isHidden(ps.buff)) return;
  ps.hand.push(ps.buff);
  ps.buff = null;
}

function placeAttack(state: GameState, player: PlayerId, slot: number, cardId: string) {
  const ps = state.players[player];
  if (ps.attacksLocked) return;
  if (slot < 0 || slot >= ps.attacks.length) return;

  const card = takeFromHand(state, player, cardId);
  if (!card) return;

  const displaced = ps.attacks[slot];
  if (displaced) ps.hand.push(displaced);
  ps.attacks[slot] = card;
}

function clearAttack(state: GameState, player: PlayerId, slot: number) {
  const ps = state.players[player];
  if (ps.attacksLocked) return;
  const card = ps.attacks[slot];
  if (!card) return;
  ps.attacks[slot] = null;
  ps.hand.push(card);
}

function lockAttacks(state: GameState, player: PlayerId) {
  const ps = state.players[player];
  if (ps.attacks.some((c) => c === null)) return;
  ps.attacksLocked = true;

  if (state.players.A.attacksLocked && state.players.B.attacksLocked) {
    state.phase = 'battle';
    state.battleIndex = 0;
    state.battleDuels = state.players.A.attacks.map((_, i) =>
      newDuel([real(state.players.A.attacks[i])], [real(state.players.B.attacks[i])]),
    );
    log(state, 'Les paires sont formées. Révélation des duels.');
  }
}

function revealBattleNext(state: GameState) {
  if (state.phase !== 'battle') return;
  const duel = state.battleDuels[state.battleIndex];
  if (!duel || duel.revealed) return;
  duel.revealed = true;
  resolveDuel(state, duel);
}

function finishBattleDuel(state: GameState, duel: Duel) {
  const index = state.battleIndex;

  if (duel.winner && duel.winner !== 'draw') {
    const card = topOf(duel, duel.winner)!;
    const attack: Attack = { attacker: duel.winner, suit: card.suit, value: card.value };
    state.attacks.push(attack);
    state.damageTaken[OTHER[duel.winner]][card.suit] += card.value;
    log(state, `Duel ${index + 1} : ${duel.winner} l'emporte, ${card.value} en ${SUIT_META[card.suit].stat}.`);
  } else {
    log(state, `Duel ${index + 1} : nul, aucune attaque.`);
  }

  discardDuel(state, duel);

  // One card drawn for every card played in an additional duel, so the hand stays
  // at the size it had when the battle started. The first card of each stack is
  // the original attack, which is not replaced.
  const escalations = duel.stacks.A.length - 1;
  if (escalations > 0) {
    for (const p of PLAYERS) drawTo(state, p, escalations);
  }

  state.battleIndex = index + 1;
  if (state.battleIndex >= state.battleDuels.length) {
    state.phase = 'damage';
    log(state, 'Tous les duels sont résolus : révélation des buffs.');
  }
}

function applyDamage(state: GameState) {
  if (state.phase !== 'damage') return;

  for (const p of PLAYERS) {
    const ps = state.players[p];
    if (ps.buff && !isHidden(ps.buff)) {
      ps.stats[ps.buff.suit] += ps.buff.value;
      log(state, `Buff ${p} : +${ps.buff.value} en ${SUIT_META[ps.buff.suit].stat}.`);
    }
  }

  for (const p of PLAYERS) {
    const ps = state.players[p];
    for (const suit of SUITS) ps.stats[suit] -= state.damageTaken[p][suit];
  }

  const deadA = SUITS.some((s) => state.players.A.stats[s] <= 0);
  const deadB = SUITS.some((s) => state.players.B.stats[s] <= 0);

  if (deadA && deadB) {
    state.outcome = 'draw';
    state.phase = 'gameOver';
    log(state, 'Les deux trains sont éliminés, égalité.');
  } else if (deadA || deadB) {
    state.outcome = deadA ? 'B' : 'A';
    state.phase = 'gameOver';
    log(state, `Le train de ${deadA ? 'A' : 'B'} est éliminé, ${state.outcome} gagne.`);
  } else {
    state.phase = 'roundEnd';
    log(state, 'Aucun train éliminé : nouvelle manche.');
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(prev: GameState, action: Action): GameState {
  const state = clone(prev);

  switch (action.type) {
    case 'startGame': {
      const fresh = createGame(action.seed);
      startRound(fresh);
      return fresh;
    }

    case 'placeBet':
      placeBet(state, action.player, action.slot, action.value);
      break;

    case 'clearBet': {
      const ps = state.players[action.player];
      if (!ps.betsLocked) ps.bets[action.slot] = null;
      break;
    }

    case 'lockBets': {
      const ps = state.players[action.player];
      if (state.phase === 'betting' && !ps.bets.some((b) => b === null)) {
        ps.betsLocked = true;
        maybeStartReveal(state);
      }
      break;
    }

    case 'fillBets': {
      if (state.phase !== 'betting') break;
      if (state.players[action.player].betsLocked) break;
      autoFillBets(state, action.player);
      break;
    }

    case 'acknowledge': {
      if (state.phase === 'riverDuelResult') resumeAfterRiverDuel(state);
      else if (state.phase === 'riverRecap') enterBuffPhase(state);
      break;
    }

    case 'betTimeout': {
      if (state.phase !== 'betting') break;
      for (const p of PLAYERS) {
        if (!state.players[p].betsLocked) {
          if (RULES.autoFillBetsOnTimeout) autoFillBets(state, p, 'au hasard (temps écoulé)');
          state.players[p].betsLocked = true;
        }
      }
      maybeStartReveal(state);
      break;
    }

    case 'revealNext':
      revealNext(state);
      break;

    case 'commitDuelCard':
      commitDuelCard(state, action.player, action.cardId);
      break;

    case 'revealDuel':
      // River duels flip automatically once both cards are in; this exists so the
      // UI can force a flip if a rule variant ever needs a manual step.
      break;

    case 'setBuff':
      if (state.phase === 'buff') setBuff(state, action.player, action.cardId);
      break;

    case 'clearBuff':
      if (state.phase === 'buff') clearBuff(state, action.player);
      break;

    case 'lockBuff':
      if (state.phase === 'buff') lockBuff(state, action.player);
      break;

    case 'placeAttack':
      if (state.phase === 'attackPlacement') placeAttack(state, action.player, action.slot, action.cardId);
      break;

    case 'clearAttack':
      if (state.phase === 'attackPlacement') clearAttack(state, action.player, action.slot);
      break;

    case 'lockAttacks':
      if (state.phase === 'attackPlacement') lockAttacks(state, action.player);
      break;

    case 'revealBattleNext':
      revealBattleNext(state);
      break;

    case 'applyDamage':
      applyDamage(state);
      break;

    case 'nextRound':
      if (state.phase === 'roundEnd') startRound(state);
      break;
  }

  return state;
}

export function newSeed(): number {
  const [v] = randomInt(Date.now() | 0, 1, 2 ** 30);
  return v;
}
