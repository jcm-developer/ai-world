// Punto de entrada del servidor del hub: HTTP (Express) + WebSocket en el mismo puerto.
// En producción/Docker también sirve el cliente compilado (client/dist).
//
//   GET /api/scenarios        → catálogo del hub con el estado de cada escenario
//   GET /api/health           → comprobación de salud
//   WS  /ws?scenario=<id>     → sesión en vivo de un escenario

import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';

import { config } from './config.js';
import { MemoryStore } from './engine/memory.js';
import { Session } from './engine/session.js';
import { createTts } from './engine/tts.js';
import { log } from './logger.js';
import { CATALOG, SCENARIOS } from './scenarios/index.js';

const store = new MemoryStore(config.dbPath);
const tts = createTts(config);
const sessions = new Map(); // id de escenario → Session (se crean al entrar el primer navegador)

log.info('memoria', `SQLite en ${config.dbPath}`);

function getSession(id) {
  let session = sessions.get(id);
  if (!session) {
    session = new Session(SCENARIOS.get(id), store, config, tts);
    sessions.set(id, session);
    session.start();
  }
  return session;
}

// --- HTTP -----------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sessions: [...sessions.keys()] });
});

app.get('/api/scenarios', (_req, res) => {
  // Nunca se envía configuración sensible: solo el catálogo y un resumen del estado.
  const list = CATALOG.map((entry) => {
    const session = sessions.get(entry.id);
    const scenario = SCENARIOS.get(entry.id);
    const live = session
      ? { viewers: session.clients.size, agents: session.agents.map((a) => a.status().state), finished: session.finished }
      : null;
    const tick = scenario ? Math.max(0, ...scenario.agents.map((a) => store.scope(`${entry.id}/${a.id}`).tick)) : 0;
    const runs = scenario?.hasEnding ? store.recentRuns(entry.id, 5) : [];
    return { ...entry, live, tick, runs };
  });
  res.json({ scenarios: list, mock: config.mockLlm });
});

// Audio generado para los pensamientos (ids aleatorios de un solo uso, caché pequeña)
app.get('/api/speech/:id', (req, res) => {
  const buf = tts.get(req.params.id);
  if (!buf) return res.status(404).end();
  res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=600' }).send(buf);
});

if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist));
  log.info('http', `Sirviendo el cliente compilado desde ${config.clientDist}`);
} else {
  app.get('/', (_req, res) => {
    res.type('text').send('Servidor de AI World activo. En desarrollo abre el cliente de Vite (http://localhost:5173).');
  });
}

const server = http.createServer(app);

// --- WebSocket --------------------------------------------------------------------

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 });

wss.on('connection', (ws, req) => {
  const id = new URL(req.url, 'http://localhost').searchParams.get('scenario') ?? 'meridiano';
  if (!SCENARIOS.has(id)) {
    ws.close(4004, 'Escenario desconocido');
    return;
  }
  const session = getSession(id);
  session.addClient(ws);
  log.info('ws', `Navegador en ${id} (${session.clients.size} mirando).`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // mensaje mal formado: se ignora
    }
    if (msg?.type === 'control' && ['pause', 'resume', 'reset'].includes(msg.action)) session.control(msg.action);
    else if (msg?.type === 'voice') session.setVoice(ws, Boolean(msg.enabled));
    else if (msg?.type === 'visitor') session.setVisitor(ws, msg);
  });

  ws.on('close', () => {
    session.removeClient(ws);
    log.info('ws', `Navegador sale de ${id} (${session.clients.size} mirando).`);
  });
});

// --- Arranque y apagado -------------------------------------------------------------

server.listen(config.port, () => {
  log.ok('http', `Hub en http://localhost:${config.port} (WebSocket en /ws)`);
  log.info('http', `Escenarios disponibles: ${[...SCENARIOS.keys()].join(', ')}`);
});

function shutdown(signal) {
  log.info('server', `${signal} recibido. Cerrando…`);
  for (const s of sessions.values()) s.stop();
  for (const ws of wss.clients) ws.close(1001, 'Servidor apagándose');
  server.close();
  store.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
