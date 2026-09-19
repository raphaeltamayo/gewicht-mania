import { useState } from 'react';
import { hasTurn } from '../net/ice';
import type { Session } from '../net/session';
import { Bot, Hourglass, TrainFront, Users } from './icons';
import { TRAIN_PHOTO } from './photo';

export function Lobby({ session, onStarted }: { session: Session; onStarted: () => void }) {
  const [code, setCode] = useState('');

  const go = (fn: () => void) => {
    fn();
    onStarted();
  };

  return (
    <div className="lobby">
      {TRAIN_PHOTO ? (
        <img className="lobby__hero" src={TRAIN_PHOTO} alt="Un TGV en ligne" />
      ) : (
        <div className="lobby__hero lobby__hero--missing">
          <span>Ajoute la photo du train dans</span>
          <code>src/assets/train.jpg</code>
        </div>
      )}

      <h1>
        Gewicht <span>Mania</span>
      </h1>
      <p className="lobby__tag">Prototype, 2 joueurs</p>

      <div className="lobby__cards">
        <div className="lobby__card">
          <h2>
            <Bot size={18} /> Solo contre le bot
          </h2>
          <p>Tu joues le siège A, le bot tient le siège B. Il ne voit ni ta main ni tes mises.</p>
          <button type="button" className="primary" onClick={() => go(() => session.startSolo())}>
            Jouer en solo
          </button>
        </div>

        <div className="lobby__card">
          <h2>
            <TrainFront size={18} /> Créer une partie
          </h2>
          <p>Tu joues le siège A. Un code apparaît en haut de l&apos;écran : transmets-le à ton adversaire.</p>
          <button type="button" className="primary" onClick={() => go(() => session.host())}>
            Créer
          </button>
        </div>

        <div className="lobby__card">
          <h2>
            <Users size={18} /> Rejoindre
          </h2>
          <p>Entre le code de ton adversaire. Tu joueras le siège B.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={5}
            spellCheck={false}
          />
          <button type="button" className="primary" disabled={code.length < 4} onClick={() => go(() => session.join(code))}>
            Rejoindre
          </button>
        </div>

        <div className="lobby__card">
          <h2>
            <Hourglass size={18} /> Partie locale
          </h2>
          <p>Un seul écran, on se passe l&apos;appareil entre les phases secrètes. Pratique pour tester les règles.</p>
          <button type="button" onClick={() => go(() => session.startLocal())}>
            Jouer en local
          </button>
        </div>
      </div>

      {!hasTurn && (
        <p className="lobby__warn">
          <span>
            Aucun serveur TURN configuré : la connexion directe fonctionne entre deux connexions fixes, mais échouera
            souvent en 4G ou 5G. Voir <code>.env.example</code>.
          </span>
        </p>
      )}
    </div>
  );
}
