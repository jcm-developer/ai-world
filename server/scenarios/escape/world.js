// Escenario 2 · El Archivo (escape room).
// El sótano del laboratorio Meridiano, sellado tras el incidente. La IA tiene que salir.
//
// ⚠️ SPOILERS: este archivo contiene la solución completa del escape room.
//
// Todo el estado vive aquí: objetos fijos, objetos portátiles (dónde están),
// cerraduras (abiertas, fallos, bloqueos), inventario y la salida.

import { EventEmitter } from 'node:events';

export const ROOM = { width: 14, depth: 10, height: 4.2 };
export const REACH = 2.3; // metros para examinar, coger o manipular algo
export const MAX_TICKS = 150; // turnos antes de quedar atrapada
export const SHOW_LIMIT = true; // el agente conoce el límite de turnos
const WALK_SPEED = 1.25;
const STOP_DISTANCE = 1.2;
const WALL_MARGIN = 0.8;
const FAILS_BEFORE_LOCK = 3;
const LOCK_TURNS = 3;
const START = { x: 0, z: 2, heading: Math.PI };
const EXIT_POINT = { x: 0, z: -6.8 }; // detrás de la puerta

// --- Objetos fijos -----------------------------------------------------------------
// position: centro del objeto · face: dirección (rad) hacia la que mira su frente,
// que es desde donde el avatar se acerca.

export const FIXTURES = [
  {
    id: 'puerta',
    label: 'Puerta',
    kind: 'door',
    position: { x: 0, y: 1.1, z: -4.85 },
    face: 0,
    short: 'Una puerta metálica blindada con un letrero: SALIDA.',
  },
  {
    id: 'reloj',
    label: 'Reloj',
    kind: 'clock',
    position: { x: -3.6, y: 2.7, z: -4.92 },
    face: 0,
    short: 'Un reloj de pared analógico.',
    text: 'Un reloj de pared analógico, detenido. Las agujas marcan las 7:45 y el segundero no se mueve.',
  },
  {
    id: 'escritorio',
    label: 'Escritorio',
    kind: 'desk',
    position: { x: -5.9, y: 0.4, z: -1.6 },
    face: Math.PI / 2,
    short: 'Un escritorio metálico con un papel encima y un cajón.',
    text: 'Un escritorio metálico. Sobre él hay una nota escrita a mano: «Si vuelve a irse la luz, el cajón se abre con la hora en que se detuvo todo».',
  },
  {
    id: 'cajon',
    label: 'Cajón',
    kind: 'drawer',
    position: { x: -5.55, y: 0.55, z: -1.6 },
    face: Math.PI / 2,
    lock: 'cajon',
    short: 'El cajón del escritorio, con un candado de 3 dígitos.',
    text: 'El cajón del escritorio, con un candado de combinación de 3 dígitos.',
  },
  {
    id: 'estanteria',
    label: 'Estantería',
    kind: 'shelf',
    position: { x: 6.55, y: 1.2, z: -1.8 },
    face: -Math.PI / 2,
    short: 'Una estantería con libros de colores.',
    text: 'Una estantería con siete libros de tapas lisas, cada uno de un color: violeta, verde, rojo, añil, azul, amarillo y naranja. No tienen título ni marcas visibles.',
    uvText:
      'Bajo la luz ultravioleta aparecen cifras escritas con tinta invisible en tres lomos: el libro azul lleva un 4, el rojo un 1 y el verde un 8. En la balda, con la misma tinta: «En el orden de la luz».',
  },
  {
    id: 'poster',
    label: 'Póster',
    kind: 'poster',
    position: { x: 6.93, y: 2.0, z: 2.2 },
    face: -Math.PI / 2,
    short: 'Un póster enmarcado con un prisma.',
    text: 'Un póster divulgativo: un prisma descompone un rayo de luz blanca en un abanico de colores. Pie de foto: «Newton, 1666: rojo, naranja, amarillo, verde, azul, añil y violeta, siempre en ese orden».',
  },
  {
    id: 'caja_fuerte',
    label: 'Caja fuerte',
    kind: 'safe',
    position: { x: 4.2, y: 0.45, z: -4.35 },
    face: 0,
    lock: 'caja_fuerte',
    short: 'Una caja fuerte con teclado numérico.',
    text: 'Una caja fuerte de acero con un teclado de 3 dígitos.',
  },
  {
    id: 'papelera',
    label: 'Papelera',
    kind: 'bin',
    position: { x: -2.8, y: 0.3, z: 3.6 },
    face: Math.PI,
    container: true,
    short: 'Una papelera de rejilla con papeles arrugados.',
    text: 'Una papelera de rejilla llena de papeles arrugados.',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    kind: 'terminal',
    position: { x: -6.2, y: 0.9, z: 2.4 },
    face: Math.PI / 2,
    short: 'Un terminal encendido que muestra un registro.',
    text: `Un terminal encendido. En pantalla:
REGISTRO DEL SISTEMA — nodo meridiano-01 — 14/03 (copia de seguridad)
03:00:00  ventilación: ciclo nocturno iniciado
03:13:56  [S-4] lectura 20,61 °C · ok
03:14:02  [S-4] lectura 20,47 °C → ANOMALÍA 1/3
03:14:08  [S-4] lectura 20,41 °C → ANOMALÍA 2/3
03:14:14  [S-4] lectura 20,35 °C → ANOMALÍA 3/3 · reinicio
03:14:44  [S-4] en línea · autotest CORRECTO
03:15:10  [S-4] lectura 21,02 °C · ok
03:40:00  ventilación: ciclo nocturno finalizado`,
  },
  {
    id: 'planta',
    label: 'Planta',
    kind: 'plant',
    position: { x: 6.1, y: 0, z: 4.3 },
    face: Math.PI,
    short: 'Un ficus en una maceta.',
    text: 'Un ficus de plástico, polvoriento. No hay nada entre sus hojas ni en la maceta.',
  },
  {
    id: 'sillon',
    label: 'Sillón',
    kind: 'armchair',
    position: { x: 2.6, y: 0, z: 3.9 },
    face: Math.PI,
    short: 'Un sillón de cuero gastado.',
    text: 'Un sillón de cuero gastado. Bajo el cojín solo hay polvo.',
  },
];

// --- Objetos portátiles --------------------------------------------------------------

export const ITEMS = {
  linterna_uv: { label: 'Linterna UV', text: 'Una linterna de luz ultravioleta. Sirve para revelar tintas invisibles.', start: 'cajon' },
  tarjeta: { label: 'Tarjeta de acceso', text: 'Una tarjeta magnética: «Archivo · Nivel 2».', start: 'caja_fuerte' },
  nota_a: {
    label: 'Media nota (izquierda)',
    text: 'La mitad izquierda de una nota rasgada en vertical:\n«La salida se ab—\n última lectura q—\n saltar la alar—\n sin la co—»',
    start: 'caja_fuerte',
  },
  nota_b: {
    label: 'Media nota (derecha)',
    text: 'La mitad derecha de una nota rasgada en vertical:\n«—re con la\n —ue hizo\n —ma,\n —ma.»',
    start: 'papelera',
  },
  nota_completa: {
    label: 'Nota completa',
    text: 'Las dos mitades encajan: «La salida se abre con la última lectura que hizo saltar la alarma, sin la coma.»',
    start: null, // se obtiene combinando nota_a y nota_b
  },
};

export const LOCKS = {
  cajon: { digits: 3, code: '745', contains: ['linterna_uv'] },
  caja_fuerte: { digits: 3, code: '184', contains: ['tarjeta', 'nota_a'] },
  puerta: { digits: 4, code: '2035', contains: [], needsCard: true },
};

export const COMBINATIONS = [{ parts: ['nota_a', 'nota_b'], result: 'nota_completa' }];

// Lo que el navegador dibuja de cada objeto (las marcas UV solo se envían una vez reveladas)
const VISUALS = {
  clock: { hours: 7, minutes: 45 },
  books: ['violeta', 'verde', 'rojo', 'añil', 'azul', 'amarillo', 'naranja'],
  uvMarks: [
    { book: 'azul', text: '4' },
    { book: 'rojo', text: '1' },
    { book: 'verde', text: '8' },
  ],
  uvShelfText: 'En el orden de la luz',
  terminal: FIXTURES.find((f) => f.id === 'terminal').text.split('\n').slice(1),
};

export const FIXTURE_IDS = FIXTURES.map((f) => f.id);
export const ITEM_IDS = Object.keys(ITEMS);
const byId = new Map(FIXTURES.map((f) => [f.id, f]));

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export class EscapeWorld extends EventEmitter {
  constructor(saved = null) {
    super();
    const s = saved ?? {};
    // Dónde está cada objeto portátil: id de contenedor, 'inventario', o null (aún no existe)
    this.itemLocation = s.itemLocation ?? Object.fromEntries(ITEM_IDS.map((id) => [id, ITEMS[id].start]));
    this.locks = s.locks ?? Object.fromEntries(Object.keys(LOCKS).map((id) => [id, { open: false, fails: 0, blockedUntil: 0, totalFails: 0 }]));
    this.examined = new Set(s.examined ?? []);
    this.examineCount = s.examineCount ?? {}; // id → veces examinado (para detectar repeticiones)
    this.usedOn = s.usedOn ?? {}; // item → { objetivo: 'efecto' | 'sin efecto' }
    this.uvRevealed = s.uvRevealed ?? false;
    this.cardInserted = s.cardInserted ?? false;
    this.escaped = s.escaped ?? false;
    this.tick = 0; // turno actual del agente (lo actualizan las herramientas)
    const pos = s.agent ?? START;
    this.agentData = { x: pos.x, z: pos.z, heading: pos.heading, walking: false, target: null, targetObject: null, exiting: false };
    // Si la puerta ya estaba abierta al recuperar la partida, retoma la salida
    if (this.locks.puerta.open && !this.escaped) this.#walkTo(EXIT_POINT, 'salida', true);
  }

  // --- Consultas ---------------------------------------------------------------------

  getFixture(id) {
    return byId.get(id) ?? null;
  }

  agent() {
    return this.agentData;
  }

  isBusy() {
    return this.agentData.walking;
  }

  distanceTo(id) {
    const f = byId.get(id);
    if (!f) return Infinity;
    return Math.hypot(f.position.x - this.agentData.x, f.position.z - this.agentData.z);
  }

  fixturesByDistance() {
    return FIXTURES.map((f) => ({ fixture: f, distance: this.distanceTo(f.id) })).sort((a, b) => a.distance - b.distance);
  }

  inventory() {
    return ITEM_IDS.filter((id) => this.itemLocation[id] === 'inventario');
  }

  /** Objetos portátiles visibles dentro de un contenedor (abierto o examinado). */
  itemsIn(containerId) {
    if (!this.isContainerOpen(containerId)) return [];
    return ITEM_IDS.filter((id) => this.itemLocation[id] === containerId);
  }

  isContainerOpen(id) {
    const f = byId.get(id);
    if (!f) return false;
    if (f.lock) return this.locks[f.lock].open;
    if (f.container) return this.examined.has(id);
    return false;
  }

  /** Descripción actual de un objeto fijo según el estado del mundo. */
  describe(id) {
    const f = byId.get(id);
    const parts = [f.id === 'estanteria' && this.uvRevealed ? `${f.text}\n${f.uvText}` : f.text ?? f.short];
    if (f.lock) {
      const l = this.locks[f.lock];
      parts.push(l.open ? 'Está ABIERTO: ya no hace falta ningún código aquí.' : 'Está cerrado.');
    }
    // El escritorio informa del estado real de su cajón
    if (f.id === 'escritorio') {
      const open = this.locks.cajon.open;
      const inside = this.itemsIn('cajon');
      parts.push(
        open
          ? `El cajón (id: cajon) ya está ABIERTO${inside.length ? `; dentro hay: ${inside.join(', ')}` : ' y vacío'}.`
          : 'El cajón (id: cajon) está cerrado con un candado de 3 dígitos.',
      );
    }
    if (f.id === 'puerta') parts.push(this.doorStatus());
    if (f.lock || f.container) {
      const items = this.itemsIn(id);
      if (this.isContainerOpen(id)) parts.push(items.length ? `Dentro hay: ${items.join(', ')}.` : 'Está vacío.');
    }
    return parts.filter(Boolean).join(' ');
  }

  doorStatus() {
    const l = this.locks.puerta;
    if (l.open) return 'La puerta está abierta.';
    return this.cardInserted
      ? 'El lector tiene la tarjeta insertada y el teclado de 4 dígitos está iluminado.'
      : 'El teclado de 4 dígitos está apagado; el lector de tarjetas está vacío.';
  }

  // --- Acciones (ya validadas por las herramientas) -------------------------------------

  moveTo(id) {
    const f = byId.get(id);
    const hx = ROOM.width / 2 - WALL_MARGIN;
    const hz = ROOM.depth / 2 - WALL_MARGIN;
    return this.#walkTo(
      {
        x: clamp(f.position.x + Math.sin(f.face) * STOP_DISTANCE, -hx, hx),
        z: clamp(f.position.z + Math.cos(f.face) * STOP_DISTANCE, -hz, hz),
      },
      id,
    );
  }

  examine(id) {
    this.examined.add(id);
    this.examineCount[id] = (this.examineCount[id] ?? 0) + 1;
  }

  /** Anota dónde se ha probado un objeto del inventario y si tuvo efecto. */
  recordUse(item, target, worked) {
    this.usedOn[item] = { ...(this.usedOn[item] ?? {}), [target]: worked ? 'efecto' : 'sin efecto' };
  }

  take(itemId) {
    this.itemLocation[itemId] = 'inventario';
  }

  revealUv() {
    this.uvRevealed = true;
  }

  insertCard() {
    this.cardInserted = true;
    this.itemLocation.tarjeta = 'puerta';
  }

  combine(a, b, result) {
    this.itemLocation[a] = null;
    this.itemLocation[b] = null;
    this.itemLocation[result] = 'inventario';
  }

  /**
   * Intenta un código en una cerradura. Devuelve { ok, opened, blocked, fails }.
   * Tras FAILS_BEFORE_LOCK fallos seguidos, la cerradura se bloquea LOCK_TURNS turnos.
   */
  tryCode(lockId, code, tick) {
    const l = this.locks[lockId];
    if (code === LOCKS[lockId].code) {
      l.open = true;
      l.fails = 0;
      if (lockId === 'puerta') this.#walkTo(EXIT_POINT, 'salida', true);
      return { ok: true, opened: true };
    }
    l.fails += 1;
    l.totalFails += 1;
    l.tried = [...new Set([...(l.tried ?? []), code])]; // códigos incorrectos ya probados
    let blocked = false;
    if (l.fails >= FAILS_BEFORE_LOCK) {
      l.blockedUntil = tick + LOCK_TURNS;
      l.fails = 0;
      blocked = true;
    }
    return { ok: false, blocked, fails: l.fails };
  }

  get totalFails() {
    return Object.values(this.locks).reduce((n, l) => n + l.totalFails, 0);
  }

  get openLocks() {
    return Object.values(this.locks).filter((l) => l.open).length;
  }

  // --- Simulación ----------------------------------------------------------------------

  #walkTo(point, targetObject, exiting = false) {
    const a = this.agentData;
    a.target = { ...point };
    a.targetObject = targetObject;
    a.walking = true;
    a.exiting = exiting;
    return Math.hypot(point.x - a.x, point.z - a.z);
  }

  update(dt) {
    const a = this.agentData;
    if (!a.walking || !a.target) return false;
    const dx = a.target.x - a.x;
    const dz = a.target.z - a.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    if (dist <= step) {
      a.x = a.target.x;
      a.z = a.target.z;
      a.walking = false;
      a.target = null;
      const f = byId.get(a.targetObject);
      if (f) a.heading = Math.atan2(f.position.x - a.x, f.position.z - a.z);
      if (a.exiting) this.escaped = true;
      const targetObject = a.targetObject;
      a.targetObject = null;
      a.exiting = false;
      this.emit('arrived', 'main', targetObject);
    } else {
      a.x += (dx / dist) * step;
      a.z += (dz / dist) * step;
      a.heading = Math.atan2(dx, dz);
    }
    return true;
  }

  // --- Estado para el navegador y para guardar ---------------------------------------------

  agentState() {
    const a = this.agentData;
    return { x: round(a.x), z: round(a.z), heading: round(a.heading), walking: a.walking, targetObject: a.targetObject };
  }

  /** Estado visible en el navegador (sin códigos ni textos ocultos). */
  publicState() {
    return {
      room: ROOM,
      maxTicks: MAX_TICKS,
      fixtures: FIXTURES.map((f) => ({ id: f.id, label: f.label, kind: f.kind, position: f.position, face: f.face, examined: this.examined.has(f.id) })),
      items: Object.fromEntries(ITEM_IDS.map((id) => [id, { label: ITEMS[id].label, location: this.itemLocation[id] }])),
      inventory: this.inventory().map((id) => ({ id, label: ITEMS[id].label })),
      locks: Object.fromEntries(Object.entries(this.locks).map(([id, l]) => [id, { open: l.open, blocked: l.blockedUntil > this.tick && !l.open }])),
      uvRevealed: this.uvRevealed,
      cardInserted: this.cardInserted,
      doorOpen: this.locks.puerta.open,
      escaped: this.escaped,
      visuals: {
        clock: VISUALS.clock,
        books: VISUALS.books,
        terminal: VISUALS.terminal,
        uvMarks: this.uvRevealed ? VISUALS.uvMarks : [],
        uvShelfText: this.uvRevealed ? VISUALS.uvShelfText : '',
      },
    };
  }

  serialize() {
    const a = this.agentData;
    return {
      itemLocation: this.itemLocation,
      locks: this.locks,
      examined: [...this.examined],
      examineCount: this.examineCount,
      usedOn: this.usedOn,
      uvRevealed: this.uvRevealed,
      cardInserted: this.cardInserted,
      escaped: this.escaped,
      agent: { x: a.x, z: a.z, heading: a.heading },
    };
  }
}
