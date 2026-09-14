import { useState } from 'react';
import { hasTurn } from '../net/ice';
import type { Session } from '../net/session';

export function Lobby({ session, onStarted }: { session: Session; onStarted: () => void }) {
  const [code, setCode] = useState('');

  const go = (fn: () => void) => {
    fn();
    onStarted();
  };

  return (
    <div className="lobby">
      <h1>
        Gewicht <span>Mania</span>
      </h1>
      <p className="lobby__tag">Prototype — 2 joueurs</p>

      <div className="lobby__cards">
        <div className="lobby__card">
          <h2>Créer une partie</h2>
          <p>Tu joues le siège A. Un code apparaît en haut de l’écran : transmets-le à ton adversaire.</p>
          <button type="button" onClick={() => go(() => session.host())}>
            Créer
          </button>
        </div>

        <div className="lobby__card">
          <h2>Rejoindre</h2>
          <p>Entre le code de ton adversaire. Tu joueras le siège B.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={5}
            spellCheck={false}
          />
          <button type="button" disabled={code.length < 4} onClick={() => go(() => session.join(code))}>
            Rejoindre
          </button>
        </div>

        <div className="lobby__card">
          <h2>Partie locale</h2>
          <p>Un seul écran, on se passe l’appareil entre les phases secrètes. Pratique pour tester les règles.</p>
          <button type="button" onClick={() => go(() => session.startLocal())}>
            Jouer en local
          </button>
        </div>
      </div>

      {!hasTurn && (
        <p className="lobby__warn">
          Aucun serveur TURN configuré : la connexion directe fonctionne entre deux connexions fixes, mais échouera
          souvent en 4G/5G. Voir <code>.env.example</code>.
        </p>
      )}
    </div>
  );
}
