import { useEffect, useReducer, useRef, useState } from 'react';
import { Session } from './net/session';
import { Board } from './ui/Board';
import { Lobby } from './ui/Lobby';

/** The room code, big enough to read aloud, with a copy button for chat apps. */
function ShareCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <div className="sharecode">
      <code className="sharecode__value">{code}</code>
      <button
        type="button"
        onClick={() => {
          // Unavailable over plain http and in some in-app browsers; the code is
          // on screen either way, so a failure just leaves the button silent.
          navigator.clipboard?.writeText(code).then(
            () => setCopied(true),
            () => {},
          );
        }}
      >
        {copied ? 'Copié' : 'Copier'}
      </button>
    </div>
  );
}

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

  // The host sits here until the guest is connected: no cards are dealt and no
  // timer is running until there are two players.
  if (!session.view) {
    return (
      <div className="waiting">
        {session.mode === 'host' ? (
          <>
            <p className="waiting__lead">Transmets ce code à ton adversaire.</p>
            <ShareCode code={session.code} />
            <p className="muted">La partie est distribuée et le chrono démarre quand il rejoint.</p>
          </>
        ) : (
          <p className="waiting__lead">
            Connexion à la partie <code>{session.code}</code>…
          </p>
        )}
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
