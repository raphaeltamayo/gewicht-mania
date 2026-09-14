import { RULES } from './config';
import { randomInt } from './rng';
import { SUITS, type Card, type Suit, type Train } from './types';

/**
 * Deck C: four suits x values 1..15, so 60 unique cards, four copies of each
 * value, one per suit. Rebuilt and reshuffled at the start of every round, which
 * is what "a card cannot be drawn twice in the same round" means in practice.
 */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let value = 1; value <= RULES.deckMaxValue; value++) {
      deck.push({ id: `${suit}-${value}`, suit, value });
    }
  }
  return deck;
}

const DEMO_NAMES = [
  ['Aiguillon', 'France', 1974],
  ['Nordwind', 'Allemagne', 1962],
  ['Vespertine', 'Italie', 1988],
  ['Kestrel', 'Royaume-Uni', 1955],
  ['Orlov', 'Russie', 1971],
  ['Stellaria', 'Suisse', 1993],
  ['Mistral II', 'France', 1981],
  ['Hakuba', 'Japon', 1967],
  ['Cordillera', 'Espagne', 1979],
  ['Vlieger', 'Pays-Bas', 1958],
] as const;

/**
 * Placeholder train for the prototype: a random name from the list above and
 * four stats rolled in `demoStatRange`. Swap this out for the real train deck
 * when the cards are ready, nothing else in the engine needs to change.
 */
export function drawDemoTrain(rngState: number, exclude: string[] = []): [Train, number] {
  let rng = rngState;
  const pool = DEMO_NAMES.filter(([name]) => !exclude.includes(name));
  const [nameIdx, r1] = randomInt(rng, 0, pool.length - 1);
  rng = r1;
  const [name, origin, year] = pool[nameIdx];

  const stats = {} as Record<Suit, number>;
  const [lo, hi] = RULES.demoStatRange;
  for (const suit of SUITS) {
    const [v, next] = randomInt(rng, lo, hi);
    rng = next;
    stats[suit] = v;
  }
  return [{ name, origin, year, stats }, rng];
}
