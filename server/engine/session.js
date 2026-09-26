// Sesión: un escenario en marcha con su mundo, sus agentes y sus espectadores.
//
// - Se crea al entrar el primer navegador en el escenario.
// - Los agentes solo consultan al modelo mientras alguien está mirando (ahorra peticiones).
// - Todo lo que ocurre se envía por WebSocket a los navegadores de esa sesión.
// - Un visitante en primera persona puede hablar al agente más cercano (si está a su alcance).

import { log } from '../logger.js';
import { Agent } from './agent.js';
import { createBrain } from './llm.js';

const SIM_HZ = 20; // frecuencia de la simulación de movimiento
const POS_BROADCAST_HZ = 10; // frecuencia de envío de posiciones
const VISITOR_TIMEOUT_MS = 8000; // sin noticias de un visitante en este tiempo, se considera que se fue
const HEAR_RADIUS_M = 6; // a partir de esta distancia la IA no oye al visitante
const VISITOR_SAY_MAX = 200; // caracteres por mensaje
const VISITOR_SAY_MIN_MS = 2500; // pausa mínima entre dos mensajes del mismo visitante
const CONVERSATION_MAX = 6; // intervenciones que recuerda la conversación
const CONVERSATION_TTL_MS = 5 * 60 * 1000; // y cuánto tiempo

export class Session {
  /**
   * @param {object} scenario definición del escenario (ver scenarios/README)
   * @param {import('./memory.js').MemoryStore} store
   * @param {ReturnType<import('./tts.js').createTts>} tts voz de los agentes
   */
  constructor(scenario, store, config, tts) {
    this.scenario = scenario;
    this.store = store;
    this.config = config;
    this.clients = new Set();
    this.tts = tts;
    this.voiceClients = new Set(); // navegadores con la voz activada
    this.visitors = new Map(); // navegador → { x, z, heading, since, at } (espectadores en primera persona)
    this.lastHeardAt = new Map(); // navegador → cuándo habló por última vez
    this.conversation = []; // [{ from: 'visitor' | 'agent', agentId?, text, at }]
    this.generation = 0; // cambia al reiniciar la partida
    this.finished = null; // { outcome, summary } cuando la partida termina
    this.runId = null;

    this.worldMemory = store.scope(scenario.id);
    this.world = scenario.createWorld(this.worldMemory.get('state', null));
    this.#bindWorld();
    this.finished = this.worldMemory.get('finished', null);
    this.helped = this.worldMemory.get('helped', false); // alguien le habló durante esta partida

    // Personajes no autónomos (p. ej. sospechosos): tienen avatar y voz, pero solo hablan cuando se les pregunta
    this.npcs = scenario.npcs ?? [];

    this.agents = scenario.agents.map((def) => {
      const brain = createBrain({ ...config, model: (def.modelEnv && process.env[def.modelEnv]) || config.model });
      const memory = store.scope(`${scenario.id}/${def.id}`, scenario.memoryTags ?? []);
      const agent = new Agent({ session: this, def, memory, brain, config });
      this.#wireAgent(agent);
      return agent;
    });

    this.#startSimulation();
    if (scenario.hasEnding && !this.finished) this.#ensureRun();
  }

  hasViewers() {
    return this.clients.size > 0;
  }

  start() {
    for (const a of this.agents) a.start();
  }

  stop() {
    clearInterval(this.simTimer);
    for (const a of this.agents) a.stop();
    this.persist();
  }

  // --- Espectadores ------------------------------------------------------------------

  addClient(ws) {
    const wasEmpty = this.clients.size === 0;
    this.clients.add(ws);
    this.send(ws, 'world:init', this.initialState());
    if (wasEmpty) {
      log.info(this.scenario.id, 'Hay espectadores: los agentes despiertan.');
      this.broadcastStatus();
    }
  }

  removeClient(ws) {
    this.clients.delete(ws);
    this.voiceClients.delete(ws);
    this.visitors.delete(ws);
    this.lastHeardAt.delete(ws);
    if (this.clients.size === 0) {
      log.info(this.scenario.id, 'Sin espectadores: los agentes quedan en reposo.');
      this.persist();
    }
  }

  send(ws, type, payload) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, payload }));
  }

  broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload });
    for (const ws of this.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  }

  broadcastStatus() {
    this.broadcast('status', this.status());
  }

  /** Un navegador activa o desactiva la voz (solo se genera audio si alguien la escucha). */
  setVoice(ws, enabled) {
    if (enabled) this.voiceClients.add(ws);
    else this.voiceClients.delete(ws);
  }

  /**
   * Posición de un espectador en primera persona (o su salida con present=false).
   * Los agentes la perciben como un visitante en la sala.
   */
  setVisitor(ws, { present, x, z, heading }) {
    const ok = [x, z, heading].every(Number.isFinite);
    if (!present || !ok) {
      this.visitors.delete(ws);
      return;
    }
    const prev = this.visitors.get(ws);
    this.visitors.set(ws, { x, z, heading, since: prev?.since ?? Date.now(), at: Date.now() });
  }

  /** Visitantes presentes (se descartan los que llevan un rato sin dar señales). */
  visitorList() {
    const now = Date.now();
    for (const [ws, v] of this.visitors) if (now - v.at > VISITOR_TIMEOUT_MS) this.visitors.delete(ws);
    return [...this.visitors.values()];
  }

  /**
   * Un visitante habla. Solo cuenta si está en la sala en primera persona y cerca de un agente;
   * el más cercano le oye y le contestará. Todos los navegadores ven lo que dijo.
   */
  hear(ws, { text }) {
    this.visitorList(); // descarta visitantes que ya no dan señales
    const visitor = this.visitors.get(ws);
    const clean = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, VISITOR_SAY_MAX) : '';
    if (!visitor || !clean) return;
    const now = Date.now();
    if (now - (this.lastHeardAt.get(ws) ?? 0) < VISITOR_SAY_MIN_MS) {
      this.send(ws, 'visitor:said', { text: clean, heard: false, mine: true, reason: 'Espera un momento antes de volver a hablar.' });
      return;
    }
    this.lastHeardAt.set(ws, now);

    const listener = this.finished ? null : this.#nearestAgent(visitor);
    const reason = this.finished ? 'La partida ha terminado.' : listener ? '' : 'Estás demasiado lejos: acércate para que te oiga.';
    for (const client of this.clients) {
      const mine = client === ws;
      this.send(client, 'visitor:said', { text: clean, heard: Boolean(listener), mine, reason: mine ? reason : '', agentId: listener?.id ?? null });
    }
    if (!listener) return;

    this.#addToConversation({ from: 'visitor', text: clean });
    // En los escenarios con final, la partida queda marcada como «con ayuda humana»
    if (this.scenario.hasEnding && !this.helped) {
      this.helped = true;
      this.worldMemory.set('helped', true);
      if (this.runId) this.store.markHelped(this.runId);
    }
    log.info(this.scenario.id, `Visitante → ${listener.def.name}: “${clean}”`);
    listener.hear(clean);
  }

  /** Conversación reciente con los visitantes (intervenciones de los últimos minutos). */
  recentConversation() {
    const since = Date.now() - CONVERSATION_TTL_MS;
    this.conversation = this.conversation.filter((c) => c.at >= since).slice(-CONVERSATION_MAX);
    return this.conversation;
  }

  /** Un personaje (agente o no) dice algo en voz alta: bocadillo en la escena y voz. */
  speakAs(id, text) {
    const def = this.agents.find((a) => a.id === id)?.def ?? this.npcs.find((n) => n.id === id);
    if (!def) return;
    this.broadcast('said', { agentId: id, text });
    this.#speak({ id, def }, text, 'said').catch(() => {});
  }

  async #speak(agent, text, kind = 'thought') {
    if (this.tts.mode === 'off' || this.voiceClients.size === 0) return;
    const generation = this.generation;
    const res = this.tts.mode === 'server' ? await this.tts.speak(text, agent.def) : { fallback: true };
    if (generation !== this.generation) return; // la partida se reinició mientras se generaba
    const payload = res.id
      ? { agentId: agent.id, url: `/api/speech/${res.id}`, text, kind }
      : { agentId: agent.id, text, kind, fallback: true, lang: 'es-ES' };
    const msg = JSON.stringify({ type: 'speech', payload });
    for (const ws of this.voiceClients) if (ws.readyState === ws.OPEN) ws.send(msg);
  }

  // --- Controles -----------------------------------------------------------------------

  control(action) {
    if (action === 'pause') this.agents.forEach((a) => a.pause());
    else if (action === 'resume') this.agents.forEach((a) => a.resume());
    else if (action === 'reset') this.reset();
    log.info(this.scenario.id, `Control: ${action}.`);
    this.broadcastStatus();
  }

  /** Reinicia la partida: borra la memoria del escenario y crea un mundo nuevo. */
  reset() {
    this.generation += 1;
    if (this.runId && !this.finished) this.store.endRun(this.runId, { outcome: 'reiniciada', summary: '', ticks: this.#maxTick() });
    this.runId = null;
    this.store.clearPrefix(this.scenario.id);
    this.world = this.scenario.createWorld(null);
    this.#bindWorld();
    this.finished = null;
    this.helped = false;
    this.conversation = [];
    for (const a of this.agents) a.resetState();
    if (this.scenario.hasEnding) this.#ensureRun();
    this.broadcast('world:init', this.initialState());
  }

  // --- Estado ----------------------------------------------------------------------------

  status() {
    return {
      paused: this.agents.every((a) => a.paused),
      finished: this.finished,
      viewers: this.clients.size,
      agents: this.agents.map((a) => a.status()),
    };
  }

  initialState() {
    return {
      scenario: { id: this.scenario.id, title: this.scenario.title, hasEnding: Boolean(this.scenario.hasEnding) },
      voice: this.tts.mode,
      talk: { radius: HEAR_RADIUS_M, maxLength: VISITOR_SAY_MAX },
      world: this.world.publicState(),
      agents: [
        ...this.agents.map((a) => ({
          ...a.def,
          state: this.world.agentState(a.id),
          lastThought: a.lastThought,
          memory: a.snapshot(),
        })),
        ...this.npcs.map((n) => ({ ...n, role: 'npc', state: this.world.agentState(n.id), lastThought: null, memory: null })),
      ],
      stats: this.scenario.stats?.(this.world, this.agents) ?? [],
      status: this.status(),
    };
  }

  /** Guarda el estado del mundo (se llama tras cada tick y al quedarse sin espectadores). */
  persist() {
    this.worldMemory.set('state', this.world.serialize());
  }

  /** Tras cada tick de un agente: guarda, actualiza estadísticas y comprueba si la partida terminó. */
  afterTick() {
    this.persist();
    this.broadcast('stats', this.scenario.stats?.(this.world, this.agents) ?? []);
    if (this.scenario.syncWorld) this.broadcast('world:update', this.world.publicState());
    this.#checkFinish();
  }

  // --- Interno -------------------------------------------------------------------------

  #wireAgent(agent) {
    const withId = (payload) => ({ agentId: agent.id, ...payload });
    agent.on('action', (a) => this.broadcast('action', withId(a)));
    agent.on('thought', (t) => {
      this.broadcast('thought', withId(t));
      this.#speak(agent, t.text).catch(() => {});
    });
    agent.on('said', (s) => {
      if (this.visitors.size) this.#addToConversation({ from: 'agent', agentId: agent.id, text: s.text });
      this.broadcast('said', withId(s));
      this.#speak(agent, s.text, 'said').catch(() => {});
    });
    agent.on('thinking', (thinking) => this.broadcast('thinking', withId({ thinking })));
    agent.on('memory', () => this.broadcast('memory', withId({ memory: agent.snapshot() })));
    agent.on('status', () => this.broadcastStatus());
  }

  #startSimulation() {
    let last = Date.now();
    let lastBroadcast = 0;
    this.simTimer = setInterval(() => {
      const now = Date.now();
      const moved = this.world.update((now - last) / 1000);
      last = now;
      if (moved && now - lastBroadcast >= 1000 / POS_BROADCAST_HZ) {
        lastBroadcast = now;
        this.broadcast('agents:pos', this.#positions());
      }
    }, 1000 / SIM_HZ);
  }

  /** Al llegar un avatar a su destino se guarda y se envía la posición final exacta. */
  #bindWorld() {
    this.world.on?.('arrived', () => {
      this.persist();
      this.broadcast('agents:pos', this.#positions());
      if (this.scenario.syncWorld) this.broadcast('world:update', this.world.publicState());
      this.#checkFinish();
    });
  }

  /** Posiciones de todos los personajes (agentes y no autónomos). */
  #positions() {
    return [...this.agents.map((a) => a.id), ...this.npcs.map((n) => n.id)].map((id) => ({ agentId: id, ...this.world.agentState(id) }));
  }

  #addToConversation(entry) {
    this.conversation.push({ ...entry, at: Date.now() });
    this.recentConversation();
  }

  /** El agente autónomo más cercano al visitante, si le puede oír. */
  #nearestAgent(visitor) {
    let best = null;
    let bestDist = HEAR_RADIUS_M;
    for (const agent of this.agents) {
      const pos = this.world.agentState(agent.id);
      const dist = Math.hypot(pos.x - visitor.x, pos.z - visitor.z);
      if (dist <= bestDist) {
        best = agent;
        bestDist = dist;
      }
    }
    return best;
  }

  #ensureRun() {
    this.runId = this.worldMemory.get('runId', null);
    if (!this.runId) {
      this.runId = this.store.startRun(this.scenario.id, this.agents.map((a) => a.brain.label));
      this.worldMemory.set('runId', this.runId);
    }
  }

  #checkFinish() {
    if (this.finished || !this.scenario.checkFinish) return;
    const result = this.scenario.checkFinish(this.world, this.agents);
    if (result) this.#finish(result);
  }

  #finish(result) {
    if (this.helped) result = { ...result, helped: true };
    this.finished = result;
    this.worldMemory.set('finished', result);
    if (this.runId) this.store.endRun(this.runId, { ...result, ticks: this.#maxTick() });
    log.ok(this.scenario.id, `Partida terminada: ${result.outcome}. ${result.summary ?? ''}`);
    this.broadcast('finished', result);
    this.broadcastStatus();
  }

  #maxTick() {
    return Math.max(0, ...this.agents.map((a) => a.memory.tick));
  }
}
