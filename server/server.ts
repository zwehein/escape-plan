// Escape Plan game server
// Express serves the web page; Socket.IO handles live game events.
// Run with `npm start`; the admin page opens automatically

import './env.js'; // first: loads .env (ElevenLabs key) before the other modules read it
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import type { GameServer } from './events.js';
import { registerLobby } from './lobby.js';
import { registerAdmin} from "./admin.js";
import { registerGame } from './game.js';
import { domainClip, registerSocial, warmEmoteVoices } from './social.js';
import { getClip } from './voice.js';
import { emoteSvg } from '../client/src/social/emoteArt.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Socket.IO needs a real HTTP server, not the Express app itself
const httpServer = createServer(app);
const io: GameServer = new Server(httpServer, {
  cors: { origin: '*' },
});

// The built game is served by this process in production. In development,
// players can still use the Vite dev server and its Socket.IO proxy.
const ADMIN_PATH = '/admin.html';
app.get(ADMIN_PATH, (_req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'admin.html')));
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Emote pictures for the admin page's Watch view (same pixels as the game)
app.get('/emotes/:id.svg', (req, res) => {
  const svg = emoteSvg(req.params.id);
  if (!svg) {
    res.sendStatus(404);
    return;
  }
  res.type('image/svg+xml').send(svg);
});

// Voice clips made by the server (voice.ts). The browser only ever gets the
// audio by id, never the ElevenLabs key.
app.get('/voice/:id', (req, res) => {
  const audio = getClip(req.params.id);
  if (!audio) {
    res.sendStatus(404); // the game plays a plain sound effect instead
    return;
  }
  res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' });
  res.send(audio);
});

// Gojo's "Domain Expansion" line; 404 until it has been made (the game plays a sound effect then)
app.get('/voice/line/domain', (_req, res) => {
  const id = domainClip();
  const audio = id ? getClip(id) : null;
  if (!audio) {
    res.sendStatus(404);
    return;
  }
  res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
  res.send(audio);
});

// Admin namespace: set up once, not per player
registerAdmin(io);


// Runs once per client; each area adds its own event handlers
io.on('connection', (socket) => {
  registerSocial(io, socket); // first, so on disconnect it still knows the nickname
  registerLobby(io, socket);
  registerGame(io, socket);
});

// Use httpServer.listen, not app.listen, so Socket.IO is included
httpServer.listen(PORT, HOST, () => {
  const adminUrl = `http://localhost:${PORT}${ADMIN_PATH}`;
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin page: ${adminUrl}`);
  if (process.env.NO_OPEN !== '1') openInBrowser(adminUrl);
  void warmEmoteVoices(); // make the 6 emote voice lines once (cached on disk afterwards)
});

// Opens the admin page in the default browser on macOS, Windows or Linux
function openInBrowser(url: string) {
  const [command, args] =
    process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] :
    ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
}
