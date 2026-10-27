// Admin area: a separate '/admin' namespace that only the server operator can join.

import type { GameServer } from './events.js';
import { getDashboardState, printDashboard} from './dashboard.js';
import { resetGame } from './game.js';
import { registerAdminSocial } from './social.js';

// Read the password from an environment variable; fall back to a default for local testing
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

if (process.env.NODE_ENV === 'production' && ADMIN_PASSWORD === 'admin123') {
  throw new Error('Set a unique ADMIN_PASSWORD before starting in production.');
}

export function registerAdmin(io: GameServer): void {
  const admin = io.of('/admin');

  // Runs BEFORE a connection is accepted: check the password
  admin.use((socket, next) => {
    const password: unknown = socket.handshake.auth.password;
    if (password === ADMIN_PASSWORD) {
      next();                                       // let them in
    } else {
      next(new Error('Wrong admin password'));      // refuse the connection
    }
  });

  // Runs only for admins who passed the password check
  admin.on('connection', (socket) => {
    console.log(`\n[Admin] Admin connected (${socket.id})`);

    // Send the current dashboard immediately so the page isn't empty
    socket.emit('admin:dashboard', getDashboardState(io));

    socket.on('disconnect', () => {
      console.log(`\n[Admin] Admin disconnected (${socket.id})`);
    });

    // Mute a player / turn chat off (social.ts)
    registerAdminSocial(io, socket, (event) => printDashboard(io, event));

    // Reset button: game.ts cancels the turn timers, sets scores to 0,
    // sends server:reset to the players and starts a fresh match
    socket.on('admin:reset', (done) => {
      resetGame(io);

      // Log it, refresh the admin dashboard, and confirm to the admin who clicked
      printDashboard(io, 'Admin reset the game');
      if (typeof done === 'function') {
        done(true);
      }
    });

    socket.on('admin:shutdown', (done) => {
      if (typeof done === 'function') done(true);
      console.log('[Admin] Server shutdown requested');
      setTimeout(() => io.close(() => process.exit(0)), 200);
    });
  });
}
