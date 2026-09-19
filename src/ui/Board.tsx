import { useEffect, useMemo, useState } from 'react';
import { RULES, attackCount } from '../engine/config';
import {
  OTHER,
  SUIT_META,
  isHidden,
  type Action,
  type AnyCard,
  type Card,
  type GameState,
  type PlayerId,
} from '../engine/types';
import type { Session } from '../net/session';
import { Bot, Home, Hourglass, Lock, RotateCcw, Shuffle, SuitIcon, Swords, Users, Zap } from './icons';
import { BetChip, CardView, TrainPanel } from './pieces';

const asCard = (c: AnyCard | null): Card | null => (c && !isHidden(c) ? c : null);

/** Kept short: on a phone this shares the top bar with two pills. */
const PHASE_TITLE: Record<GameState['phase'], string> = {
  lobby: 'En attente',
  betting: 'É2 réflexion',
  reveal: 'É3 révélation',
  riverDuel: 'É3 duels',
  riverDuelResult: 'É3 résultat',
  riverRecap: 'É3 bilan',
  buff: 'É4 buff',
  attackPlacement: 'É4 attaques',
  battle: 'É4 bataille',
  damage: 'É4 dégâts',
  roundEnd: 'Fin de manche',
  gameOver: 'Terminé',
};

export function Board({ session, onExit }: { session: Session; onExit: () => void }) {
  const view = session.view!;
  const me = session.seat;
  const foe = OTHER[me];
  const mine = view.players[me];
  const theirs = view.players[foe];
  const dispatch = session.dispatch;

  const [selectedBet, setSelectedBet] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [curtain, setCurtain] = useState(false);

  // Selections never survive a phase change.
  useEffect(() => {
    setSelectedBet(null);
    setSelectedCard(null);
  }, [view.phase, view.round]);

  useBetTimer(view, dispatch, session.mode !== 'guest');

  const unplacedBets = useMemo(() => {
    const placed = new Set(mine.bets.filter((b): b is number => b !== null));
    return Array.from({ length: RULES.betMax }, (_, i) => i + 1).filter((v) => !placed.has(v));
  }, [mine.bets]);

  const handClickable = handIsClickable(view.phase);

  function onHandCard(card: Card) {
    switch (view.phase) {
      case 'buff':
        if (!mine.buff) dispatch({ type: 'setBuff', player: me, cardId: card.id });
        break;
      case 'riverDuel':
      case 'battle': {
        const duel = view.phase === 'riverDuel' ? view.riverDuel : view.battleDuels[view.battleIndex];
        if (!duel || duel.pending[me]) break;
        if (view.phase === 'battle' && !(duel.revealed && duel.winner === null)) break;
        dispatch({ type: 'commitDuelCard', player: me, cardId: card.id });
        break;
      }
      case 'attackPlacement':
        setSelectedCard((prev) => (prev === card.id ? null : card.id));
        break;
      default:
        break;
    }
  }

  function onRiverSlot(index: number) {
    if (view.phase !== 'betting' || mine.betsLocked) return;
    if (selectedBet !== null) {
      dispatch({ type: 'placeBet', player: me, slot: index, value: selectedBet });
      setSelectedBet(null);
    } else if (mine.bets[index] !== null) {
      dispatch({ type: 'clearBet', player: me, slot: index });
    }
  }

  function onAttackSlot(index: number) {
    if (view.phase !== 'attackPlacement' || mine.attacksLocked) return;
    if (selectedCard) {
      dispatch({ type: 'placeAttack', player: me, slot: index, cardId: selectedCard });
      setSelectedCard(null);
    } else if (mine.attacks[index]) {
      dispatch({ type: 'clearAttack', player: me, slot: index });
    }
  }

  /** Clicking your own buff takes it back, as long as the phase is still open. */
  const onClearBuff =
    view.phase === 'buff' && mine.buff && !mine.buffLocked
      ? () => dispatch({ type: 'clearBuff', player: me })
      : undefined;

  const riverStage =
    view.phase === 'betting' ||
    view.phase === 'reveal' ||
    view.phase === 'riverDuel' ||
    view.phase === 'riverDuelResult' ||
    view.phase === 'riverRecap';

  return (
    <div className="board">
      <Header session={session} onExit={onExit} />

      <TrainPanel
        player={theirs}
        label={session.mode === 'solo' ? 'Bot (B)' : `Adversaire (${foe})`}
        stats={theirs.stats}
        tone={foe === 'A' ? 'a' : 'b'}
        handCount={theirs.hand.length}
      />

      <main className="board__stage">
        {riverStage ? (
        <section className="river">
          <div className="river__row">
            {theirs.bets.map((b, i) => (
              <BetChip key={i} value={b} hidden={b === null && view.phase !== 'betting'} />
            ))}
          </div>

          <div className="river__row">
            {view.river.map((slot, i) => {
              const contested = slot.resolution === 'contested';
              const duelHere = view.phase === 'riverDuel' && view.riverDuelSlot === i;
              return (
                <div
                  key={i}
                  className={`slot ${slot.resolution === 'won' ? 'is-won' : ''} ${contested ? 'is-contested' : ''} ${
                    duelHere ? 'is-active' : ''
                  } ${view.phase === 'reveal' && i === view.revealIndex ? 'is-next' : ''}`}
                  onClick={() => onRiverSlot(i)}
                >
                  <CardView card={slot.card} muted={slot.resolution === 'won'} />
                  {slot.resolution === 'won' && <span className="slot__tag">{slot.winner ?? '.'}</span>}
                  {contested && <span className="slot__tag slot__tag--tie">=</span>}
                </div>
              );
            })}
          </div>

          <div className="river__row">
            {mine.bets.map((b, i) => (
              <BetChip key={i} value={b} onClick={() => onRiverSlot(i)} />
            ))}
          </div>
        </section>
        ) : (
          <BattleStage view={view} me={me} onAttackSlot={onAttackSlot} onClearBuff={onClearBuff} />
        )}

        {/* The recap lists this round's log itself, so showing it twice would
            just squeeze the river out of the stage. */}
        {view.phase !== 'riverRecap' && <LogView view={view} />}
      </main>

      <TrainPanel
        player={mine}
        label={`Toi (${me})`}
        stats={mine.stats}
        tone={me === 'A' ? 'a' : 'b'}
        handCount={mine.hand.length}
      />

      <PhaseBar
        view={view}
        me={me}
        dispatch={dispatch}
        unplacedBets={unplacedBets}
        selectedBet={selectedBet}
        setSelectedBet={setSelectedBet}
        onExit={onExit}
        onRestart={session.mode === 'guest' ? undefined : () => session.restart()}
      />

      <section className="hand">
        <div className="hand__cards">
          {mine.hand.map((c, i) => {
            const card = asCard(c);
            if (!card) return <CardView key={i} card={c} />;
            return (
              <CardView
                key={card.id}
                card={card}
                selected={selectedCard === card.id}
                onClick={handClickable ? () => onHandCard(card) : undefined}
              />
            );
          })}
        </div>
      </section>

      {session.mode === 'local' && (
        <div className="hotseat">
          <button
            type="button"
            onClick={() => {
              setCurtain(true);
              session.switchSeat(foe);
            }}
          >
            <Users size={15} /> Passer la main au joueur {foe}
          </button>
        </div>
      )}

      {curtain && (
        <div className="curtain">
          <p>Passe l&apos;appareil au joueur {me}.</p>
          <button type="button" className="primary" onClick={() => setCurtain(false)}>
            Je suis {me}, afficher le plateau
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function handIsClickable(phase: GameState['phase']) {
  return phase === 'buff' || phase === 'attackPlacement' || phase === 'riverDuel' || phase === 'battle';
}

function Header({ session, onExit }: { session: Session; onExit: () => void }) {
  const view = session.view!;
  // Two-step, because a stray tap on the top bar should not bin a live game.
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(id);
  }, [confirming]);

  const statusText: Record<string, string> = {
    idle: '',
    waiting: 'en attente du second joueur',
    connecting: 'connexion en cours',
    connected: 'connecté',
    disconnected: 'déconnecté',
    error: `erreur : ${session.error}`,
  };
  return (
    <header className="topbar">
      <div className="topbar__title">
        <strong>Manche {view.round}</strong>
        <span className="muted"> · {PHASE_TITLE[view.phase]}</span>
      </div>
      <div className="topbar__right">
        {(session.mode === 'host' || session.mode === 'guest') && (
          <span className={`pill pill--${session.status}`}>
            {session.code && <code>{session.code}</code>} {statusText[session.status]}
          </span>
        )}
        {session.mode === 'solo' && (
          <span className="pill">
            <Bot size={13} /> Solo
          </span>
        )}
        <span className="pill">Siège {session.seat}</span>
        <button
          type="button"
          className={`topbar__exit ${confirming ? 'is-confirming' : ''}`}
          title="Retour au menu"
          onClick={() => (confirming ? onExit() : setConfirming(true))}
        >
          {confirming ? 'Quitter ?' : <Home size={15} />}
        </button>
      </div>
    </header>
  );
}

function BattleStage({
  view,
  me,
  onAttackSlot,
  onClearBuff,
}: {
  view: GameState;
  me: PlayerId;
  onAttackSlot: (i: number) => void;
  onClearBuff?: () => void;
}) {
  const foe = OTHER[me];
  const mine = view.players[me];
  const theirs = view.players[foe];

  return (
    <section className="battle">
      <div className="battle__buffs">
        <BuffSlot label={`Buff ${foe}`} card={theirs.buff} />
        <BuffSlot label="Ton buff" card={mine.buff} onClick={onClearBuff} />
      </div>

      <div className="battle__duels">
        {Array.from({ length: attackCount(view.round) }).map((_, i) => {
          const duel = view.battleDuels[i];
          const active = view.phase === 'battle' && view.battleIndex === i;
          const stackFoe = duel ? duel.stacks[foe] : theirs.attacks[i] ? [theirs.attacks[i]!] : [];
          const stackMine = duel ? duel.stacks[me] : mine.attacks[i] ? [mine.attacks[i]!] : [];
          return (
            <div key={i} className={`duel ${active ? 'is-active' : ''} ${duel?.winner ? `won-${duel.winner}` : ''}`}>
              <div className="duel__stack">
                {stackFoe.length ? (
                  stackFoe.map((c, k) => <CardView key={k} card={c} small />)
                ) : (
                  <CardView card={null} small />
                )}
              </div>
              <div className="duel__verdict">
                {duel?.winner === 'draw' ? 'nul' : duel?.winner ? (duel.winner === me ? 'gagné' : 'perdu') : `#${i + 1}`}
              </div>
              <div className="duel__stack" onClick={() => onAttackSlot(i)}>
                {stackMine.length ? (
                  stackMine.map((c, k) => <CardView key={k} card={c} small />)
                ) : (
                  <CardView card={null} small onClick={() => onAttackSlot(i)} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BuffSlot({ label, card, onClick }: { label: string; card: AnyCard | null; onClick?: () => void }) {
  const real = asCard(card);
  return (
    <div className={`buffslot ${onClick ? 'is-removable' : ''}`}>
      <span className="muted">{label}</span>
      <CardView card={card} small onClick={onClick} />
      {onClick && <span className="buffslot__undo">toucher pour retirer</span>}
      {real && (
        <span className="buffslot__effect">
          <Zap size={13} />+{real.value} {SUIT_META[real.suit].stat}
        </span>
      )}
    </div>
  );
}

function PhaseBar({
  view,
  me,
  dispatch,
  unplacedBets,
  selectedBet,
  setSelectedBet,
  onExit,
  onRestart,
}: {
  view: GameState;
  me: PlayerId;
  dispatch: (a: Action) => void;
  unplacedBets: number[];
  selectedBet: number | null;
  setSelectedBet: (v: number | null) => void;
  onExit: () => void;
  onRestart?: () => void;
}) {
  const mine = view.players[me];
  const theirs = view.players[OTHER[me]];

  switch (view.phase) {
    case 'betting':
      return (
        <div className="phasebar">
          <div className="phasebar__hint">
            {mine.betsLocked ? (
              <>
                <Lock size={15} /> Mises figées, en attente de l&apos;adversaire.
              </>
            ) : (
              'Choisis une mise, puis touche la case sous la carte. Touche une mise placée pour la retirer.'
            )}
          </div>
          {!mine.betsLocked && (
            <div className="bettray">
              {unplacedBets.map((v) => (
                <BetChip
                  key={v}
                  value={v}
                  selected={selectedBet === v}
                  onClick={() => setSelectedBet(selectedBet === v ? null : v)}
                />
              ))}
            </div>
          )}
          <div className="phasebar__actions">
            <Countdown deadline={view.betDeadline} />
            <button
              type="button"
              disabled={mine.betsLocked || !mine.bets.some((b) => b === null)}
              onClick={() => dispatch({ type: 'fillBets', player: me })}
            >
              <Shuffle size={15} /> Compléter au hasard
            </button>
            <button
              type="button"
              className="primary"
              disabled={mine.betsLocked || mine.bets.some((b) => b === null)}
              onClick={() => dispatch({ type: 'lockBets', player: me })}
            >
              <Lock size={15} /> Valider
            </button>
          </div>
        </div>
      );

    case 'reveal':
      return (
        <div className="phasebar">
          <div className="phasebar__hint">
            Cartes remportées : toi {mine.riverWins}, adversaire {theirs.riverWins}
          </div>
          <div className="phasebar__actions">
            <button type="button" className="primary" onClick={() => dispatch({ type: 'revealNext' })}>
              Révéler la case {view.revealIndex + 1}
            </button>
          </div>
        </div>
      );

    case 'riverDuel': {
      const duel = view.riverDuel;
      const waiting = duel?.pending[me];
      return (
        <div className="phasebar">
          <div className="phasebar__hint">
            <Swords size={15} />
            Égalité de mise sur la case {(view.riverDuelSlot ?? 0) + 1}.{' '}
            {waiting ? 'En attente de l’adversaire.' : 'Choisis une carte de ta main, face cachée.'}
          </div>
          <div className="phasebar__stacks">
            <DuelStacks duel={duel} me={me} />
          </div>
        </div>
      );
    }

    case 'riverDuelResult': {
      const duel = view.riverDuel;
      const slot = (view.riverDuelSlot ?? 0) + 1;
      const won = duel?.winner === me;
      const drawn = duel?.winner === 'draw';
      return (
        <div className={`phasebar phasebar--result ${won ? 'is-win' : drawn ? '' : 'is-loss'}`}>
          <div className="phasebar__hint">
            <Swords size={15} />
            <strong>
              {drawn ? `Case ${slot} : duel nul.` : won ? `Tu remportes la case ${slot}.` : `L’adversaire remporte la case ${slot}.`}
            </strong>
          </div>
          <div className="phasebar__hint">
            <DuelStacks duel={duel} me={me} />
          </div>
          <div className="phasebar__actions">
            <span className="muted">
              Cartes : toi {mine.riverWins}, adversaire {theirs.riverWins}
            </span>
            <button type="button" className="primary" onClick={() => dispatch({ type: 'acknowledge' })}>
              Continuer
            </button>
          </div>
        </div>
      );
    }

    case 'riverRecap': {
      const mineWon = view.river.filter((s) => s.winner === me).length;
      const theirsWon = view.river.filter((s) => s.winner === OTHER[me]).length;
      const discarded = view.river.filter((s) => s.resolution === 'won' && s.winner === null).length;
      return (
        <div className="phasebar phasebar--result">
          <div className="phasebar__hint">
            <strong>Bilan de la rivière</strong>
          </div>
          <div className="phasebar__hint">
            <span className="damage-chip">Toi {mineWon}</span>
            <span className="damage-chip">Adversaire {theirsWon}</span>
            {discarded > 0 && <span className="damage-chip">Défaussées {discarded}</span>}
          </div>
          {/* The whole round's Étape 3, so a cap award or a duel resolved in the
              same tick is still readable here rather than having flashed past. */}
          <div className="recap__log">
            {view.log
              .filter((l) => l.round === view.round)
              .slice(-5)
              .map((l, i) => (
                <div key={i}>{l.text}</div>
              ))}
          </div>
          <div className="phasebar__actions">
            <button type="button" className="primary" onClick={() => dispatch({ type: 'acknowledge' })}>
              Passer à l’étape 4
            </button>
          </div>
        </div>
      );
    }

    case 'buff':
      return (
        <div className="phasebar">
          <div className="phasebar__hint">
            <Zap size={15} />
            {mine.buffLocked
              ? 'Buff validé, en attente de l’adversaire.'
              : mine.buff
                ? 'Touche le buff pour le reprendre, ou valide.'
                : 'Choisis une carte de ta main : sa valeur s’ajoutera à la statistique de son signe.'}
          </div>
          <div className="phasebar__actions">
            <button
              type="button"
              className="primary"
              disabled={!mine.buff || mine.buffLocked}
              onClick={() => dispatch({ type: 'lockBuff', player: me })}
            >
              <Lock size={15} /> Valider mon buff
            </button>
          </div>
        </div>
      );

    case 'attackPlacement': {
      const remaining = mine.attacks.filter((a) => a === null).length;
      return (
        <div className="phasebar">
          <div className="phasebar__hint">
            <Swords size={15} />
            {mine.attacksLocked
              ? 'Attaques figées, en attente de l’adversaire.'
              : `Carte puis case d’attaque. Touche une carte placée pour la reprendre. ${remaining} restante(s).`}
          </div>
          <div className="phasebar__actions">
            <button
              type="button"
              className="primary"
              disabled={mine.attacksLocked || remaining > 0}
              onClick={() => dispatch({ type: 'lockAttacks', player: me })}
            >
              <Lock size={15} /> Valider mes attaques
            </button>
          </div>
        </div>
      );
    }

    case 'battle': {
      const duel = view.battleDuels[view.battleIndex];
      const tie = duel?.revealed && duel.winner === null;
      return (
        <div className="phasebar">
          <div className="phasebar__hint">
            <Swords size={15} />
            {tie
              ? duel.pending[me]
                ? 'Duel supplémentaire, en attente de l’adversaire.'
                : 'Égalité : pose une carte supplémentaire par-dessus.'
              : `Duel ${view.battleIndex + 1} sur ${view.battleDuels.length}.`}
          </div>
          <div className="phasebar__actions">
            {!duel?.revealed && (
              <button type="button" className="primary" onClick={() => dispatch({ type: 'revealBattleNext' })}>
                Révéler le duel {view.battleIndex + 1}
              </button>
            )}
          </div>
        </div>
      );
    }

    case 'damage':
      return (
        <div className="phasebar">
          <div className="phasebar__hint">
            <span>Buffs révélés. Dégâts à appliquer :</span>
            {view.attacks.length === 0 ? (
              <span>aucun</span>
            ) : (
              view.attacks.map((a, i) => (
                <span key={i} className="damage-chip">
                  {a.attacker} inflige {a.value} <SuitIcon suit={a.suit} size={13} />
                </span>
              ))
            )}
          </div>
          <div className="phasebar__actions">
            <button type="button" className="primary" onClick={() => dispatch({ type: 'applyDamage' })}>
              Appliquer les dégâts
            </button>
          </div>
        </div>
      );

    case 'roundEnd':
      return (
        <div className="phasebar">
          <div className="phasebar__hint">Aucun train éliminé. Le plateau est réinitialisé.</div>
          <div className="phasebar__actions">
            <button type="button" className="primary" onClick={() => dispatch({ type: 'nextRound' })}>
              Manche {view.round + 1}
            </button>
          </div>
        </div>
      );

    case 'gameOver':
      return (
        <div className="phasebar phasebar--end">
          <div className="phasebar__hint">
            <strong>
              {view.outcome === 'draw'
                ? 'Égalité, les deux trains sont éliminés.'
                : view.outcome === me
                  ? 'Tu gagnes la partie.'
                  : 'Tu perds la partie.'}
            </strong>
          </div>
          <div className="phasebar__actions">
            {onRestart && (
              <button type="button" className="primary" onClick={onRestart}>
                <RotateCcw size={15} /> Rejouer
              </button>
            )}
            <button type="button" onClick={onExit}>
              <Home size={15} /> Menu principal
            </button>
          </div>
        </div>
      );

    default:
      return null;
  }
}

function DuelStacks({ duel, me }: { duel: GameState['riverDuel']; me: PlayerId }) {
  if (!duel) return null;
  const foe = OTHER[me];
  return (
    <>
      <div className="duel__stack">
        {duel.stacks[foe].map((c, i) => (
          <CardView key={i} card={c} small />
        ))}
        {duel.pending[foe] && <CardView card={duel.pending[foe]} small />}
      </div>
      <span className="muted">vs</span>
      <div className="duel__stack">
        {duel.stacks[me].map((c, i) => (
          <CardView key={i} card={c} small />
        ))}
        {duel.pending[me] && <CardView card={duel.pending[me]} small />}
      </div>
    </>
  );
}

function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span className={`timer ${left <= 10 ? 'is-urgent' : ''}`}>
      <Hourglass size={14} />
      {left}s
    </span>
  );
}

/** Only the authority fires the timeout, so it happens exactly once. */
function useBetTimer(view: GameState, dispatch: (a: Action) => void, isAuthority: boolean) {
  useEffect(() => {
    if (!isAuthority || view.phase !== 'betting' || !view.betDeadline) return;
    const delay = Math.max(0, view.betDeadline - Date.now());
    const id = setTimeout(() => dispatch({ type: 'betTimeout' }), delay);
    return () => clearTimeout(id);
  }, [isAuthority, view.phase, view.betDeadline, dispatch]);
}

function LogView({ view }: { view: GameState }) {
  const recent = view.log.slice(-3).reverse();
  return (
    <section className="log">
      {recent.map((entry, i) => (
        <div key={i} className={i === 0 ? 'log__line is-latest' : 'log__line'}>
          <span className="muted">M{entry.round}</span> {entry.text}
        </div>
      ))}
    </section>
  );
}
