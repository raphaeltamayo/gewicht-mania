import Peer, { type DataConnection } from 'peerjs';
import { createGame, newSeed, reduce } from '../engine/game';
import { redact } from '../engine/redact';
import type { Action, GameState, PlayerId } from '../engine/types';
import { ICE_SERVERS } from './ice';

export type Mode = 'local' | 'host' | 'guest';
export type NetStatus = 'idle' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'error';

type Message = { t: 'action'; action: Action } | { t: 'state'; state: GameState };

/** PeerJS ids are global, so room codes get a namespace to avoid collisions. */
const roomId = (code: string) => `gewicht-mania-${code.toLowerCase()}`;

const makeCode = () => {
  // No 0/O/1/I — these get read aloud over voice chat.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
};

/**
 * Owns the game for one browser tab.
 *
 * `local` and `host` run the authoritative engine; `guest` holds only a redacted
 * view and sends actions upstream. Because actions are plain JSON, swapping the
 * transport for a real server later means replacing this file and nothing else.
 */
export class Session {
  mode: Mode = 'local';
  /** Which seat this browser plays. In `local` mode it is switchable. */
  seat: PlayerId = 'A';
  status: NetStatus = 'idle';
  code = '';
  error = '';
  /** What the UI renders: already redacted for `seat`. */
  view: GameState | null = null;

  private authoritative: GameState | null = null;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private get isAuthority() {
    return this.mode === 'local' || this.mode === 'host';
  }

  private publish() {
    if (!this.authoritative) return;
    this.view = redact(this.authoritative, this.seat);
    if (this.mode === 'host' && this.conn?.open) {
      this.conn.send({ t: 'state', state: redact(this.authoritative, 'B') } satisfies Message);
    }
    this.emit();
  }

  // -------------------------------------------------------------------------
  // Entry points
  // -------------------------------------------------------------------------

  startLocal() {
    this.mode = 'local';
    this.seat = 'A';
    this.status = 'connected';
    this.authoritative = reduce(createGame(newSeed()), { type: 'startGame', seed: newSeed() });
    this.publish();
  }

  /** In hot-seat mode, hand the device over. */
  switchSeat(seat: PlayerId) {
    if (this.mode !== 'local') return;
    this.seat = seat;
    this.publish();
  }

  host() {
    this.mode = 'host';
    this.seat = 'A';
    this.code = makeCode();
    this.status = 'waiting';
    this.authoritative = reduce(createGame(newSeed()), { type: 'startGame', seed: newSeed() });
    this.view = redact(this.authoritative, 'A');
    this.emit();

    this.peer = new Peer(roomId(this.code), { config: { iceServers: ICE_SERVERS } });
    this.peer.on('error', (err) => this.fail(err.message));
    this.peer.on('connection', (conn) => {
      if (this.conn?.open) {
        conn.close();
        return;
      }
      this.conn = conn;
      conn.on('open', () => {
        this.status = 'connected';
        this.publish();
      });
      conn.on('data', (raw) => {
        const msg = raw as Message;
        if (msg.t !== 'action') return;
        // The guest only ever gets to act as B, whatever it claims to be.
        const action = forceSeat(msg.action, 'B');
        if (action) this.apply(action);
      });
      conn.on('close', () => {
        this.status = 'disconnected';
        this.emit();
      });
    });
  }

  join(code: string) {
    this.mode = 'guest';
    this.seat = 'B';
    this.code = code.trim().toUpperCase();
    this.status = 'connecting';
    this.emit();

    this.peer = new Peer({ config: { iceServers: ICE_SERVERS } });
    this.peer.on('error', (err) => this.fail(err.message));
    this.peer.on('open', () => {
      const conn = this.peer!.connect(roomId(this.code), { reliable: true });
      this.conn = conn;
      conn.on('open', () => {
        this.status = 'connected';
        this.emit();
      });
      conn.on('data', (raw) => {
        const msg = raw as Message;
        if (msg.t !== 'state') return;
        this.view = msg.state;
        this.emit();
      });
      conn.on('close', () => {
        this.status = 'disconnected';
        this.emit();
      });
    });
  }

  private fail(message: string) {
    this.status = 'error';
    this.error = message;
    this.emit();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  dispatch = (action: Action) => {
    if (this.isAuthority) this.apply(action);
    else if (this.conn?.open) this.conn.send({ t: 'action', action: forceSeat(action, 'B') ?? action } satisfies Message);
  };

  private apply(action: Action) {
    if (!this.authoritative) return;
    this.authoritative = reduce(this.authoritative, action);
    this.publish();
  }

  restart() {
    if (!this.isAuthority) return;
    this.authoritative = reduce(createGame(newSeed()), { type: 'startGame', seed: newSeed() });
    this.publish();
  }

  destroy() {
    this.conn?.close();
    this.peer?.destroy();
    this.listeners.clear();
  }
}

/**
 * Rewrites the `player` field of a player-scoped action, so a guest cannot send
 * an action claiming to be the host. Returns null for actions a guest may not
 * send at all.
 */
function forceSeat(action: Action, seat: PlayerId): Action | null {
  if ('player' in action) return { ...action, player: seat };
  // Flow-control actions are driven by the host only.
  switch (action.type) {
    case 'revealNext':
    case 'revealDuel':
    case 'revealBattleNext':
    case 'applyDamage':
    case 'nextRound':
    case 'betTimeout':
      return action;
    default:
      return null;
  }
}
