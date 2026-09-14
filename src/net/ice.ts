/**
 * WebRTC connects the two browsers directly — no port forwarding, ever.
 *
 * STUN alone is enough for most home connections. It is NOT enough when either
 * player is on mobile data: carriers sit behind CGNAT/symmetric NAT, where hole
 * punching fails and the traffic has to be relayed by a TURN server.
 *
 * Drop free TURN credentials into a `.env.local` (see `.env.example`) and mobile
 * starts working. Without them the game still runs fine between two home
 * connections.
 */
const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME as string | undefined;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

export const hasTurn = Boolean(TURN_URL && TURN_USERNAME && TURN_CREDENTIAL);

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(hasTurn
    ? [
        {
          urls: TURN_URL!.split(',').map((u) => u.trim()),
          username: TURN_USERNAME!,
          credential: TURN_CREDENTIAL!,
        },
      ]
    : []),
];
