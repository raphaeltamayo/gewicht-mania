/**
 * Headless playtest harness: plays whole games with random legal moves and
 * asserts the structural invariants of the ruleset.
 *
 *   bun run src/engine/sim.ts [games]
 *
 * This is the fastest way to check that a rules change has not broken the card
 * economy, the hand sizes in particular are load-bearing and easy to get wrong.
 */
import { RULES, attackCount, handAtDuelPhase } from './config';
import { createGame, reduce } from './game';
import { isHidden, type Action, type GameState, type PlayerId } from './types';

const PLAYERS: PlayerId[] = ['A', 'B'];

class InvariantError extends Error {}

function check(condition: boolean, message: string) {
  if (!condition) throw new InvariantError(message);
}

const handIds = (s: GameState, p: PlayerId) =>
  s.players[p].hand.filter((c) => !isHidden(c)).map((c) => (c as { id: string }).id);

/** Picks the next random legal action for whichever player has to act. */
function nextActions(s: GameState, rand: () => number): Action[] {
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

  switch (s.phase) {
    case 'betting': {
      const out: Action[] = [];
      for (const p of PLAYERS) {
        if (s.players[p].betsLocked) continue;
        const free = Array.from({ length: RULES.betMax }, (_, i) => i + 1).filter((v) => !s.players[p].bets.includes(v));
        const slots = s.players[p].bets.map((b, i) => (b === null ? i : -1)).filter((i) => i >= 0);
        if (free.length) {
          out.push({ type: 'placeBet', player: p, slot: slots[0], value: pick(free) });
        } else {
          out.push({ type: 'lockBets', player: p });
        }
      }
      return out;
    }

    case 'reveal':
      return [{ type: 'revealNext' }];

    case 'riverDuelResult':
    case 'riverRecap':
      return [{ type: 'acknowledge' }];

    case 'riverDuel': {
      const duel = s.riverDuel!;
      return PLAYERS.filter((p) => !duel.pending[p] && handIds(s, p).length > 0).map((p) => ({
        type: 'commitDuelCard' as const,
        player: p,
        cardId: pick(handIds(s, p)),
      }));
    }

    case 'buff':
      return PLAYERS.filter((p) => !s.players[p].buffLocked).map((p) =>
        s.players[p].buff
          ? { type: 'lockBuff' as const, player: p }
          : { type: 'setBuff' as const, player: p, cardId: pick(handIds(s, p)) },
      );

    case 'attackPlacement': {
      const out: Action[] = [];
      for (const p of PLAYERS) {
        if (s.players[p].attacksLocked) continue;
        const slot = s.players[p].attacks.findIndex((a) => a === null);
        if (slot === -1) out.push({ type: 'lockAttacks', player: p });
        else out.push({ type: 'placeAttack', player: p, slot, cardId: pick(handIds(s, p)) });
      }
      return out;
    }

    case 'battle': {
      const duel = s.battleDuels[s.battleIndex];
      if (!duel.revealed) return [{ type: 'revealBattleNext' }];
      if (duel.winner === null) {
        return PLAYERS.filter((p) => !duel.pending[p] && handIds(s, p).length > 0).map((p) => ({
          type: 'commitDuelCard' as const,
          player: p,
          cardId: pick(handIds(s, p)),
        }));
      }
      return [];
    }

    case 'damage':
      return [{ type: 'applyDamage' }];

    case 'roundEnd':
      return [{ type: 'nextRound' }];

    default:
      return [];
  }
}

function playGame(seed: number) {
  let s = reduce(createGame(seed), { type: 'startGame', seed });
  let rng = seed >>> 0;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  let seenBuffPhase = false;
  let seenBattlePhase = false;
  let steps = 0;

  while (s.phase !== 'gameOver') {
    if (++steps > 50000) throw new InvariantError(`game did not terminate (round ${s.round})`);

    if (s.phase === 'buff' && !seenBuffPhase) {
      seenBuffPhase = true;
      for (const p of PLAYERS) {
        check(
          s.players[p].riverWins === RULES.riverCap,
          `round ${s.round}: ${p} holds ${s.players[p].riverWins} river cards, expected ${RULES.riverCap}`,
        );
        check(
          s.players[p].hand.length === handAtDuelPhase(s.round),
          `round ${s.round}: ${p} enters the duel phase with ${s.players[p].hand.length} cards, expected ${handAtDuelPhase(s.round)}`,
        );
      }
    }

    if (s.phase === 'battle' && !seenBattlePhase) {
      seenBattlePhase = true;
      for (const p of PLAYERS) {
        check(
          s.players[p].hand.length === 3,
          `round ${s.round}: ${p} has ${s.players[p].hand.length} cards left after committing buff + attacks, expected 3`,
        );
        check(
          s.players[p].attacks.length === attackCount(s.round),
          `round ${s.round}: ${p} committed ${s.players[p].attacks.length} attacks, expected ${attackCount(s.round)}`,
        );
      }
    }

    if (s.phase === 'roundEnd') {
      seenBuffPhase = false;
      seenBattlePhase = false;
    }

    const actions = nextActions(s, rand);
    check(actions.length > 0, `round ${s.round}: stuck in phase ${s.phase}`);
    for (const a of actions) s = reduce(s, a);
  }

  return { rounds: s.round, outcome: s.outcome };
}

const games = Number(process.argv[2] ?? 2000);
const roundCounts: number[] = [];
const outcomes = { A: 0, B: 0, draw: 0 } as Record<string, number>;

for (let i = 0; i < games; i++) {
  try {
    const { rounds, outcome } = playGame(i * 7919 + 13);
    roundCounts.push(rounds);
    outcomes[outcome ?? 'draw'] += 1;
  } catch (err) {
    console.error(`seed ${i * 7919 + 13}: ${(err as Error).message}`);
    process.exit(1);
  }
}

roundCounts.sort((a, b) => a - b);
const mean = roundCounts.reduce((a, b) => a + b, 0) / roundCounts.length;

console.log(`${games} parties simulées, aucune violation d'invariant.`);
console.log(`Manches : min ${roundCounts[0]}, médiane ${roundCounts[Math.floor(roundCounts.length / 2)]}, moyenne ${mean.toFixed(2)}, max ${roundCounts.at(-1)}`);
console.log(`Issues  : A ${outcomes.A}, B ${outcomes.B}, égalité ${outcomes.draw}`);
