# Escape Plan

Classic Mode includes the pure game engine, Socket.IO server, and a React client
with original block-style pixel assets. The server owns movement, turn deadlines,
scores, and rematches; the browser renders server state.

## Development

New here? [docs/TWO_COMPUTER_SETUP.md](docs/TWO_COMPUTER_SETUP.md) walks through running
the game, getting an ElevenLabs API key for the voices, and playing on several computers.

Use Node.js 22.12+, 24.x, or 26+ and npm, matching Vitest's supported runtimes.

```sh
npm install
npm test
npm run typecheck
npm run build
```

The server computer is for the admin page only. Set the server computer's LAN
IP in `client/src/config.ts` (e.g. `http://192.168.1.23:3000`), then:

- **Server computer:** `npm start`. The admin page
  (`http://localhost:3000/admin.html`) opens automatically to view connected
  clients, reset scores, or close the server; set `ADMIN_PASSWORD` before starting the server.
  Set `NO_OPEN=1` to skip opening the browser.
- **Each player computer:** `npm run dev:client`, then open
  `http://localhost:5173`. Players enter nicknames, and the server pairs them
  automatically.

Step-by-step instructions for macOS, Windows and Linux are in
[docs/TWO_COMPUTER_SETUP.md](docs/TWO_COMPUTER_SETUP.md).

For client hot reload, run `npm run dev` and `npm run dev:client` in separate
terminals, then open `http://localhost:5173`. Vite proxies Socket.IO to port
3000. The server address is hard-coded in `client/src/config.ts`
(`SERVER_URL`); when it is empty, the browser connects to its own origin.

Controls: Arrow keys or WASD, or the on-screen direction buttons. The yellow
outline marks locally predictable legal destinations; the server validates
every submitted move. The countdown uses the server's published time and
deadline. At zero, the server makes a random legal move.

The npm workspace `@escape-plan/game-core` exposes an ESM entry point and generated
TypeScript declarations. Build before importing it from Node.js:

```js
import { createSession, startMatch, move } from '@escape-plan/game-core';

const unwrap = result => {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

// Production adapters supply their own clock and randomness.
let session = unwrap(createSession(['alice', 'bob']));
session = unwrap(startMatch(session, 0, Math.random, { width: 5, height: 5 }));
const result = move(session, session.match.turn.playerId, 'up', 100);
if (result.ok) session = result.value;
else console.log(result.error.code); // The chosen direction may be blocked.
```

## Core API

All state types are readonly. Functions return new state without modifying inputs.
Fallible calls return `{ ok: true, value }` or `{ ok: false, error: { code } }`.
Coordinates are zero-based; board cells are row-major (`y * width + x`).
Player IDs are opaque, distinct, nonempty strings; nickname handling belongs to
the later networking layer.

| Function | Contract |
| --- | --- |
| `createSession([playerA, playerB])` | Creates an empty two-player session with zero scores. |
| `generateMap(rng, options?)` | Generates a valid map and starts; defaults to 5×5 and stops after 1,000 failed candidates. |
| `validateMap(map)` | Checks dimensions, composition, connected free cells, tunnel reachability, and distinct playable starts. |
| `tileAt(board, coordinate)` | Returns a tile, or `undefined` outside the board. |
| `legalMoves(board, position, role)` | Returns legal directions and target coordinates without considering turn ownership. |
| `startMatch(session, now, rng, options?)` | Requires an empty session; generates the board, randomises roles, and starts the warden's turn. |
| `move(session, playerId, direction, now)` | Validates and applies an active player's move before the deadline. |
| `resolveTimeout(session, now, rng)` | At or after expiry, applies a random legal move through the same scoring and turn rules. |
| `voteRematch(session, playerId, accept, now, rng)` | Replaces a finished-match vote; two yes votes create a new match with the winner as warden. |
| `resetSession(session)` | Returns an empty session, preserving identities and clearing scores. |

Dimensions must be integers of at least five in each direction. Obstacles occupy
`floor(width * height * 0.20)` cells, one cell is a tunnel, and the rest are free.
The generator connects all free cells and makes the tunnel reachable; both
starting cells are free, distinct, and have a legal opening move.

The engine never reads the clock or schedules a timer. `now` is a finite,
nonnegative timestamp in milliseconds; active actions cannot predate the current
turn's start. Classic and custom-map turns last 15,000 milliseconds; Chaos turns
last 20,000 milliseconds. Custom maps support 5%–30% obstacles. A move exactly at the deadline
is rejected with `TURN_EXPIRED`; a timeout exactly at the deadline is accepted.
An early timeout returns `TIMEOUT_NOT_DUE` without drawing randomness or changing
state. Random generators must return finite values in `[0, 1)`.

Capture occurs when either character moves onto the other's cell, awarding the
warden one point. Tunnel entry awards the prisoner one point. Finished matches
have an outcome and rematch votes, but no active turn. Additional actions cannot
increment scores again. Rematches retain scores and board dimensions. If map
generation fails when the second vote is submitted, retain the previous session
and retry that vote; no partial state change is returned.

The caller must retain only successful transitions and serialise their application.
Socket identity, request deduplication, reconnect handling, timer scheduling,
admin controls, and UI are outside this package.
