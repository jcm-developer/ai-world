// Agente genérico: percibir → pensar → actuar → recordar.
// El escenario aporta el prompt, las herramientas, la percepción y la ejecución;
// este bucle es igual para todos.
//
// - Nunca hay dos peticiones al modelo a la vez (bucle secuencial, no setInterval).
// - Entre dos peticiones pasan al menos TICK_MS milisegundos.
// - No consulta al modelo mientras su avatar camina, si nadie está mirando o si la partida terminó.
// - Ante un 429 espera con backoff exponencial; no reintenta en bucle.
// - Una herramienta inválida se registra y el agente sigue en el siguiente tick.
// - Si un visitante le habla, se detiene y su siguiente petición es una respuesta: "say" y, si le
//   hace caso, una acción. Se adelanta en la cola, pero sigue sin haber dos peticiones a la vez.

import { EventEmitter } from 'node:events';
import { log } from '../logger.js';
import { visitorsSection } from '../scenarios/common/perception.js';
import { REPLY_INSTRUCTION, VISITOR_RULES } from '../scenarios/common/prompt.js';
import { sayTool } from '../scenarios/common/tools.js';

const MAX_CALLS_PER_TICK = 3; // think + remember + una acción física (say también es gratis)
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 120000;
const POLL_MS = 200;
const SAY_COOLDOWN_MS = 30000; // pausa mínima entre dos intervenciones en voz alta (no se aplica al contestar)
const HEARD_TTL_MS = 20000; // si no ha podido contestar en este tiempo, deja de hacerlo

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Agent extends EventEmitter {
  /**
   * @param {object} opts
   * @param {import('./session.js').Session} opts.session
   * @param {{id:string, name:string, color:string}} opts.def
   * @param {import('./memory.js').ScopedMemory} opts.memory
   */
  constructor({ session, def, memory, brain, config }) {
    super();
    this.session = session;
    this.scenario = session.scenario;
    this.def = def;
    this.id = def.id;
    this.memory = memory;
    this.brain = brain;
    this.config = config;
    this.logScope = session.scenario.agents.length > 1 ? def.name : session.scenario.id;

    this.running = false;
    this.paused = false;
    this.halted = null; // motivo si se detiene por un error que requiere intervención (clave, modelo)
    this.thinking = false;
    this.backoffUntil = 0;
    this.rateLimitStreak = 0;
    this.failureStreak = 0;
    this.lastError = null;
    this.lastThought = memory.get('lastThought', null);
    this.lastSaidAt = 0; // cuándo habló por última vez a un visitante
    this.lastSaid = '';
    this.queued = null; // acción pedida junto a un move_to: se ejecuta al llegar
    this.heard = null; // { text, at } lo que le ha dicho un visitante y aún no ha contestado
    this.wake = null; // interrumpe la espera entre turnos
  }

  get world() {
    return this.session.world;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const warning = this.brain.configWarning?.();
    if (warning) log.warn(this.logScope, warning);
    log.ok(this.logScope, `${this.def.name} despierta con ${this.brain.label}.`);
    this.#loop().catch((err) => log.error(this.logScope, 'El bucle se ha detenido por un error inesperado:', err));
  }

  stop() {
    this.running = false;
  }

  pause() {
    this.paused = true;
    this.#emitStatus();
  }

  resume() {
    this.paused = false;
    // Reanudar también limpia una detención por error: el usuario habrá corregido la causa.
    this.halted = null;
    this.backoffUntil = 0;
    this.#emitStatus();
  }

  /** Olvida su estado transitorio (tras reiniciar la partida). */
  resetState() {
    this.queued = null;
    this.heard = null;
    this.lastThought = null;
    this.lastError = null;
    this.rateLimitStreak = 0;
    this.failureStreak = 0;
    this.backoffUntil = 0;
  }

  /** Un visitante cercano le habla: contestará en cuanto pueda (ver #reply). */
  hear(text) {
    // Si vuelve a hablar antes de que conteste, se juntan las dos frases
    this.heard = { text: this.heard ? `${this.heard.text} ${text}` : text, at: Date.now() };
    this.#record(this.memory.tick, 'escucha', { texto: text }, {
      ok: true,
      summary: `El visitante te dice: «${text}»`,
      memoryChanged: false,
    });
    this.wake?.();
  }

  status() {
    const now = Date.now();
    let state = 'activo';
    if (this.halted) state = 'detenido';
    else if (this.session.finished) state = 'terminado';
    else if (this.paused) state = 'pausado';
    else if (this.backoffUntil > now) state = 'en_espera';
    else if (!this.session.hasViewers()) state = 'en_reposo';
    return {
      agentId: this.id,
      name: this.def.name,
      state,
      paused: this.paused,
      thinking: this.thinking,
      halted: this.halted,
      backoffUntil: this.backoffUntil > now ? this.backoffUntil : 0,
      lastError: this.lastError,
      model: this.brain.label,
      mock: Boolean(this.config.mockLlm),
    };
  }

  /** Memoria resumida para el navegador (notas recientes y contadores). */
  snapshot(noteLimit = 20) {
    return { tick: this.memory.tick, notes: this.memory.recentNotes(noteLimit), noteCount: this.memory.noteCount };
  }

  // --- Bucle principal -----------------------------------------------------------

  async #loop() {
    while (this.running) {
      await this.#waitUntilReady();
      if (!this.running) break;
      const started = Date.now();
      if (this.heard) await this.#reply();
      else await this.#tick();
      await this.#rest(Math.max(0, this.config.tickMs - (Date.now() - started)));
    }
  }

  /** Espera entre dos turnos; se corta en cuanto un visitante le habla. */
  #rest(ms) {
    if (this.heard || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  #canAct() {
    return (
      !this.paused &&
      !this.halted &&
      !this.session.finished &&
      this.session.hasViewers() &&
      !this.world.isBusy(this.id) &&
      Date.now() >= this.backoffUntil
    );
  }

  /** Para contestar a un visitante no hace falta estar quieto (puede hablar mientras camina). */
  #canReply() {
    if (this.heard && Date.now() - this.heard.at > HEARD_TTL_MS) this.heard = null;
    return (
      Boolean(this.heard) &&
      !this.paused &&
      !this.halted &&
      !this.session.finished &&
      this.session.hasViewers() &&
      Date.now() >= this.backoffUntil
    );
  }

  async #waitUntilReady() {
    let waitedBackoff = false;
    while (this.running && !this.#canAct() && !this.#canReply()) {
      if (this.backoffUntil) waitedBackoff = true;
      await sleep(POLL_MS);
    }
    if (waitedBackoff && Date.now() >= this.backoffUntil) {
      this.backoffUntil = 0;
      this.#emitStatus();
    }
  }

  async #tick() {
    const { memory, scenario, session } = this;
    const generation = session.generation; // si la partida se reinicia mientras piensa, se descarta

    // Acción en cola (p. ej. "ve al reloj" + "examínalo"): se ejecuta al llegar, sin consultar al modelo
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      const tick = memory.nextTick();
      const result = await scenario.execute(q.name, q.args, this.#toolContext(tick, session.visitorList()));
      if (generation !== session.generation) return;
      this.#recordResult(tick, q, result);
      session.afterTick();
      return;
    }

    // 1. Percibir
    const tick = memory.nextTick();
    const visitors = session.visitorList();
    const newcomer = visitors.some((v) => v.since > this.lastSaidAt);
    const canSpeak = visitors.length > 0 && (newcomer || Date.now() - this.lastSaidAt > SAY_COOLDOWN_MS);
    const perception = withPresence(
      scenario.perceive({
        world: this.world,
        memory,
        agentId: this.id,
        tick,
        // Cada escenario puede pedir más memoria (p. ej. el escape room, donde las pistas son cruciales)
        config: { ...this.config, memoryWindow: scenario.memoryWindow ?? this.config.memoryWindow },
      }),
      visitorsSection(visitors, this.world.agentState(this.id), {
        lastSaidAt: this.lastSaidAt,
        lastSaid: this.lastSaid,
        canSpeak,
        conversation: this.#conversation(),
      }),
    );
    // "say" solo existe si hay alguien y no acaba de hablar (evita que hable en cada turno)
    const tools = [...scenario.tools(this.world, this.id), ...(canSpeak ? [sayTool.definition] : [])];

    // 2. Pensar
    this.#setThinking(true);
    let decision;
    try {
      decision = await this.brain.decide({
        system: scenario.systemPrompt(this.id) + VISITOR_RULES,
        user: perception,
        tools,
        ctx: { world: this.world, memory, agentId: this.id, scenario, visitors }, // solo lo usa el cerebro simulado
      });
      this.#onSuccess();
    } catch (err) {
      this.#onError(err);
      return;
    } finally {
      this.#setThinking(false);
    }
    if (generation !== session.generation || session.finished) return;

    // 3. Actuar
    const { toolCalls, content, finishReason } = decision;
    if (!toolCalls.length) {
      if (finishReason === 'length') log.warn(this.logScope, 'Respuesta cortada por MAX_TOKENS: súbelo en .env si se repite.');
      const snippet = content ? ` Respondió con texto: "${content.replace(/\s+/g, ' ').slice(0, 120)}"` : '';
      this.#record(tick, 'ninguna', {}, {
        ok: false,
        summary: `No llamaste a ninguna herramienta. Debes usar una en cada turno.${snippet}`,
      });
      return;
    }

    if (!(await this.#runCalls(tick, toolCalls, visitors, generation))) return;
    session.afterTick();
  }

  /**
   * Ejecuta las herramientas que pidió el modelo: las gratuitas (think, remember, say) y como mucho
   * una acción física. Devuelve false si la partida se reinició mientras tanto.
   */
  async #runCalls(tick, toolCalls, visitors, generation) {
    const { scenario, session } = this;
    let physicalUsed = false;
    let lastPhysical = null;
    for (const call of toolCalls.slice(0, MAX_CALLS_PER_TICK + 2)) {
      if (session.finished) break;
      const isFree = scenario.freeTools.has(call.name) || call.name === 'say';
      if (call.error) {
        this.#record(tick, call.name, {}, { ok: false, summary: call.error });
        continue;
      }
      if (!isFree && physicalUsed && lastPhysical?.ok && !this.queued) {
        // Pidió dos acciones físicas (p. ej. caminar y examinar): la segunda se hace en el turno siguiente
        this.queued = { name: call.name, args: call.args };
        this.#record(tick, 'en_cola', { accion: call.name, ...call.args }, {
          ok: true,
          summary: `${call.name} se hará en cuanto llegues.`,
          memoryChanged: false,
        });
        continue;
      }
      if (!isFree && physicalUsed) {
        this.#record(tick, call.name, call.args, {
          ok: false,
          summary: 'Ignorada: solo se permite una acción física por turno (además de think).',
        });
        continue;
      }
      if (!isFree) physicalUsed = true;
      // 4. Recordar: la ejecución escribe en la memoria y en el estado del mundo
      const ctx = this.#toolContext(tick, visitors);
      // Las herramientas pueden ser asíncronas (p. ej. preguntar a otro personaje y esperar su respuesta)
      const result = call.name === 'say' ? sayTool.handler(call.args ?? {}, ctx) : await scenario.execute(call.name, call.args, ctx);
      if (generation !== session.generation) return false; // la partida se reinició mientras esperaba
      this.#recordResult(tick, call, result);
      if (!isFree) lastPhysical = { name: call.name, ok: result.ok && !result.queue };
    }
    return true;
  }

  /**
   * Turno de respuesta: el visitante le ha hablado. Una petición con sus herramientas de siempre
   * más "say": contesta y, si decide hacerle caso, actúa ya. Solo gasta turno si hace algo más que
   * hablar. Mientras tanto la sesión le mantiene quieto (ver Session.hear).
   */
  async #reply() {
    const { memory, scenario, session } = this;
    const heard = this.heard;
    this.heard = null;
    const generation = session.generation;
    const visitors = session.visitorList();
    if (!visitors.length) return; // se fue antes de que pudiera contestar
    let tick = memory.tick;

    const perception = withPresence(
      scenario.perceive({
        world: this.world,
        memory,
        agentId: this.id,
        tick,
        config: { ...this.config, memoryWindow: scenario.memoryWindow ?? this.config.memoryWindow },
      }),
      visitorsSection(visitors, this.world.agentState(this.id), {
        lastSaidAt: this.lastSaidAt || Date.now(),
        lastSaid: this.lastSaid,
        canSpeak: false,
        conversation: this.#conversation(),
      }),
    );

    const system = scenario.systemPrompt(this.id) + VISITOR_RULES;
    this.#setThinking(true);
    let decision;
    try {
      decision = await this.brain.decide({
        system,
        user: `${perception}\n\n${REPLY_INSTRUCTION}`,
        tools: [...scenario.tools(this.world, this.id), sayTool.definition],
        ctx: { world: this.world, memory, agentId: this.id, scenario, visitors, heard: heard.text }, // solo lo usa el cerebro simulado
      });
      this.#onSuccess();
    } catch (err) {
      this.#onError(err);
      return;
    } finally {
      this.#setThinking(false);
    }
    if (generation !== session.generation || session.finished) return;

    // Siempre contesta. Si el modelo actuó pero no habló, se le pide solo la respuesta (una
    // segunda petición, nunca a la vez que la primera); si aun así no habla, se usa su texto.
    let calls = decision.toolCalls.filter((c) => !c.error);
    const answered = calls.some((c) => c.name === 'say' && String(c.args?.message ?? '').trim());
    if (!answered) {
      this.#setThinking(true);
      const answer = await this.#askForAnswer(system, perception, visitors, heard.text);
      this.#setThinking(false);
      if (generation !== session.generation || session.finished) return;
      calls = [answer ?? { name: 'say', args: { message: decision.content ?? '' } }, ...calls.filter((c) => c.name !== 'say')];
    }
    // Si le hablaste mientras caminaba, lo que no sea moverse se hace al llegar (como en un turno normal)
    if (this.world.isBusy(this.id)) {
      const later = calls.find((c) => !scenario.freeTools.has(c.name) && c.name !== 'say' && c.name !== 'move_to');
      if (later) {
        calls = calls.filter((c) => c !== later);
        if (!this.queued) this.queued = { name: later.name, args: later.args };
      }
    }
    const acts = calls.some((c) => !scenario.freeTools.has(c.name) && c.name !== 'say');
    if (acts) tick = memory.nextTick(); // hacerle caso cuesta un turno, como cualquier acción
    // La respuesta va primero, para que diga «vale, voy» antes de ponerse en marcha
    calls.sort((x, y) => (y.name === 'say') - (x.name === 'say'));
    if (!(await this.#runCalls(tick, calls, visitors, generation))) return;
    if (acts) session.afterTick();
  }

  /** Segunda oportunidad para contestar al visitante: solo con la herramienta "say". */
  async #askForAnswer(system, perception, visitors, heard) {
    try {
      const decision = await this.brain.decide({
        system,
        user: `${perception}\n\n${REPLY_INSTRUCTION}\nYa has decidido qué hacer; ahora solo falta que le contestes con "say".`,
        tools: [sayTool.definition],
        ctx: { world: this.world, memory: this.memory, agentId: this.id, scenario: this.scenario, visitors, heard }, // solo lo usa el cerebro simulado
      });
      this.#onSuccess();
      return decision.toolCalls.find((c) => c.name === 'say' && String(c.args?.message ?? '').trim()) ?? null;
    } catch (err) {
      this.#onError(err);
      return null;
    }
  }

  /** Conversación reciente con el visitante: sus frases y las de este agente. */
  #conversation() {
    return this.session.recentConversation().filter((c) => c.from === 'visitor' || c.agentId === this.id);
  }

  /** Contexto que reciben las herramientas del escenario. */
  #toolContext(tick, visitors) {
    return {
      world: this.world,
      memory: this.memory,
      agentId: this.id,
      tick,
      visitors,
      brain: this.brain, // para que otros personajes respondan con el mismo modelo
      speakAs: (id, text) => this.session.speakAs(id, text), // bocadillo + voz de cualquier personaje
    };
  }

  /**
   * Registra el resultado de una herramienta. Las herramientas pueden pedir que se registre
   * como otra acción (recordAs, p. ej. "move_to" al acercarse sola) y dejar algo en cola (queue).
   */
  #recordResult(tick, call, result) {
    this.#record(tick, result.recordAs?.type ?? call.name, result.recordAs?.args ?? call.args, result);
    if (result.queue && !this.queued) this.queued = result.queue;
  }

  /** Registra una acción en memoria, en consola y la emite para el navegador. */
  #record(tick, type, args, res) {
    this.memory.logEvent({ tick, type, args, ok: res.ok, summary: res.summary, result: res.result ?? '' });

    if (!res.ok) log.warn(this.logScope, `#${tick} ${type}(${fmtArgs(args)}) ✗ ${res.summary}`);
    else if (type === 'think') log.agent(this.logScope, `#${tick} 💭 “${res.data.thought}”`);
    else if (type === 'say') log.agent(this.logScope, `#${tick} 🗣  “${res.data.message}”`);
    else if (type === 'remember') log.agent(this.logScope, `#${tick} 📝 ${res.data.note}`);
    else log.agent(this.logScope, `#${tick} ${type}(${fmtArgs(args)}) ✓ ${res.summary}`);

    this.emit('action', { tick, type, args, ok: res.ok, summary: res.summary, data: res.data ?? null });

    if (res.ok && type === 'think') {
      this.lastThought = { text: res.data.thought, tick };
      this.memory.set('lastThought', this.lastThought);
      this.emit('thought', this.lastThought);
    }
    if (res.ok && type === 'say') {
      this.lastSaidAt = Date.now();
      this.lastSaid = res.data.message;
      this.emit('said', { text: res.data.message, tick });
    }
    if (res.ok && res.memoryChanged !== false && type !== 'think') this.emit('memory');
  }

  // --- Errores del modelo -----------------------------------------------------------

  #onSuccess() {
    const hadError = this.lastError !== null;
    this.rateLimitStreak = 0;
    this.failureStreak = 0;
    this.lastError = null;
    if (hadError) this.#emitStatus();
  }

  #onError(err) {
    const kind = err?.kind ?? 'network';
    const message = err?.message ?? String(err);
    this.lastError = message;

    switch (kind) {
      case 'rate_limit': {
        this.rateLimitStreak += 1;
        const exp = Math.min(BACKOFF_BASE_MS * 2 ** (this.rateLimitStreak - 1), BACKOFF_MAX_MS);
        const wait = Math.min(Math.max(err.retryAfterMs ?? 0, exp), BACKOFF_MAX_MS);
        this.backoffUntil = Date.now() + wait;
        log.warn(this.logScope, `${message} Esperando ${(wait / 1000).toFixed(0)} s (intento ${this.rateLimitStreak}).`);
        break;
      }
      case 'auth':
      case 'not_found':
        this.halted = message;
        log.error(this.logScope, `${message} El agente queda detenido.`);
        break;
      case 'fallback':
        log.warn(this.logScope, message);
        break;
      default: {
        this.failureStreak += 1;
        const wait = Math.min(BACKOFF_BASE_MS * this.failureStreak, 60000);
        this.backoffUntil = Date.now() + wait;
        log.error(this.logScope, `${message} Nuevo intento en ${(wait / 1000).toFixed(0)} s.`);
      }
    }
    this.#emitStatus();
  }

  #setThinking(value) {
    this.thinking = value;
    this.emit('thinking', value);
  }

  #emitStatus() {
    this.emit('status');
  }
}

/** Inserta la sección de presencia antes de la instrucción final de la percepción. */
function withPresence(perception, presence) {
  if (!presence.length) return perception;
  const blocks = perception.split('\n\n');
  const last = blocks.pop();
  return [...blocks, presence.join('\n'), last].join('\n\n');
}

function fmtArgs(args) {
  if (!args || typeof args !== 'object') return '';
  return Object.values(args)
    .map((v) => {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return s.length > 40 ? `${s.slice(0, 39)}…` : s;
    })
    .join(', ');
}
