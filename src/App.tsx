import { useEffect, useReducer, useRef, useState } from 'react';
import { Session } from './net/session';
import { Board } from './ui/Board';
import { Lobby } from './ui/Lobby';

export default function App() {
  const sessionRef = useRef<Session | null>(null);
  if (!sessionRef.current) sessionRef.current = new Session();
  const session = sessionRef.current;

  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const unsubscribe = session.subscribe(rerender);
    return () => {
      unsubscribe();
    };
  }, [session]);

  useEffect(() => () => session.destroy(), [session]);

  if (!started) return <Lobby session={session} onStarted={() => setStarted(true)} />;

  if (!session.view) {
    return (
      <div className="waiting">
        <p>
          {session.mode === 'host' ? 'Partie créée.' : 'Connexion à la partie…'}
          {session.code && (
            <>
              {' '}
              Code : <code>{session.code}</code>
            </>
          )}
        </p>
        {session.status === 'error' && <p className="error">{session.error}</p>}
        <button
          type="button"
          onClick={() => {
            session.leave();
            setStarted(false);
          }}
        >
          Retour au menu
        </button>
      </div>
    );
  }

  return (
    <Board
      session={session}
      onExit={() => {
        session.leave();
        setStarted(false);
      }}
    />
  );
}
