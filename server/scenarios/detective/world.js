// Escenario 3 · Detective: «La noche del 13».
//
// ⚠️ SPOILERS: este archivo contiene la solución del caso.
//
// Alguien lanzó migrar_v2.js a escondidas la noche del 13 de marzo, lo que provocó la falsa
// alarma de S-4 y el pedido urgente de un sensor nuevo. El detective debe descubrir quién y por qué.

import { EventEmitter } from 'node:events';

export const ROOM = { width: 26, depth: 16, height: 6.5 };
export const REACH = 2.5; // para examinar pruebas
export const TALK_REACH = 2.8; // para hablar con un sospechoso
export const MAX_TICKS = 120;
export const CULPRIT = 'tomas';
const WALK_SPEED = 1.25;
const WALL_MARGIN = 1.0;
const FACE_POINT = { x: 0, z: 10 }; // los paneles miran hacia la zona de la cámara

// --- Pruebas (paneles flotantes) -------------------------------------------------------

export const EVIDENCE = [
  {
    id: 'registro_accesos',
    type: 'datos',
    label: 'Registro de accesos',
    position: { x: -10, y: 1.8, z: -4 },
    short: 'Una hoja impresa con los fichajes del edificio.',
    content: `REGISTRO DE ACCESOS — Edificio Meridiano — 13/03
08:55  M. Rey (tarjeta 0231) — entrada principal
09:02  E. Vidal (tarjeta 0108) — entrada principal
09:30  L. Mora (tarjeta 0562) — entrada principal
10:15  T. Ferrer (tarjeta 0417) — entrada de servicio
18:10  M. Rey — salida principal
18:40  T. Ferrer — salida de servicio
21:02  E. Vidal — salida principal
23:30  L. Mora — salida principal
23:41  T. Ferrer — entrada de servicio
00:07  T. Ferrer — salida de servicio`,
  },
  {
    id: 'log_servidor',
    type: 'pantalla',
    label: 'Registro del servidor',
    position: { x: -4, y: 1.9, z: -6.6 },
    short: 'Una pantalla con el registro de ejecución del servidor.',
    content: `SERVIDOR meridiano-01 — registro de ejecución
13/03 23:58:12  migrar_v2.js ejecutado · terminal T-2 (sala de servidores) · usuario: mrey
13/03 23:58:40  umbrales convertidos (6 sensores)
14/03 03:14:14  [S-4] ANOMALÍA 3/3 → reinicio automático
14/03 09:00     informe nº 17 generado (E. Vidal)`,
  },
  {
    id: 'calendario',
    type: 'documento',
    label: 'Calendario',
    position: { x: 4, y: 1.9, z: -6.6 },
    short: 'La planificación del mes, clavada en un tablón.',
    content: `PLANIFICACIÓN DE MARZO — Laboratorio Meridiano
· 16/03 10:00 — Migración de la configuración a v2 (M. Rey), con revisión previa de los umbrales personalizados.
· 18/03 — Cierre del presupuesto trimestral de compras.
· 20/03 — Fecha límite para enviar pedidos a proveedores (aprueba E. Vidal).`,
  },
  {
    id: 'maquina_cafe',
    type: 'pantalla',
    label: 'Máquina de café',
    position: { x: 10, y: 1.8, z: -4 },
    short: 'El registro de ventas de la máquina de café de la sala de servidores.',
    content: `MÁQUINA DE CAFÉ — sala de servidores — ventas del 13/03
17:48  café con leche · tarjeta de empleado 0231
18:30  té verde · tarjeta de empleado 0562
22:05  agua · tarjeta de empleado 0562
23:52  café solo · tarjeta de empleado 0417`,
  },
  {
    id: 'correo_impreso',
    type: 'documento',
    label: 'Correo impreso',
    position: { x: 10, y: 1.8, z: 3.2 },
    short: 'Una hoja olvidada en la bandeja de la impresora.',
    content: `Correo impreso, olvidado en la bandeja de la impresora de la sala de compras.
De: raul.comercial@sensotek.es · Para: t.ferrer@meridiano.lab · Fecha: 11/03
«Tomás: como hablamos, si el pedido del sensor térmico sale antes del día 20, te aplicamos la comisión de siempre. Un saludo, Raúl (Sensotek).»`,
  },
  {
    id: 'foto_t2',
    type: 'documento',
    label: 'Foto del puesto T-2',
    position: { x: -10, y: 1.8, z: 3.2 },
    short: 'Una fotografía tomada por Seguridad.',
    content: `Fotografía del puesto T-2 de la sala de servidores, tomada por Seguridad el 14/03 a las 08:30.
En el borde del monitor hay un pósit amarillo: «mrey / Meridiano13!».
Junto al teclado, un vaso de papel de la máquina de café, vacío.`,
  },
  {
    id: 'abrigo',
    type: 'documento',
    label: 'Abrigo en el perchero',
    position: { x: -5.5, y: 1.7, z: 6.2 },
    short: 'Un abrigo gris colgado en el perchero.',
    content: `Un abrigo gris con una etiqueta cosida: «M. Rey».
En el bolsillo hay una entrada de cine (Cines Odeón · 13/03 · sesión de las 22:15 · sala 4 · fila 7) y un tique del aparcamiento del cine: entrada 22:02, salida 00:52.`,
  },
  {
    id: 'taza',
    type: 'documento',
    label: 'Taza',
    position: { x: 5.5, y: 1.7, z: 6.2 },
    short: 'Una taza olvidada en la mesa de reuniones.',
    content: `Una taza de cerámica con restos de café frío y una marca de pintalabios rojo en el borde. Lleva el logotipo del congreso de instrumentación de 2024.`,
  },
];

for (const e of EVIDENCE) e.rotationY = Math.atan2(FACE_POINT.x - e.position.x, FACE_POINT.z - e.position.z);
export const EVIDENCE_IDS = EVIDENCE.map((e) => e.id);
const evidenceById = new Map(EVIDENCE.map((e) => [e.id, e]));

// Posiciones de los sospechosos (de pie, mirando hacia el centro de la sala)
export const SUSPECT_POSITIONS = {
  elena: { x: -5, z: 0.5 },
  marcos: { x: -1.8, z: -2.6 },
  lucia: { x: 1.8, z: -2.6 },
  tomas: { x: 5, z: 0.5 },
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export class DetectiveWorld extends EventEmitter {
  constructor(saved = null) {
    super();
    const s = saved ?? {};
    this.examined = new Set(s.examined ?? []);
    this.conversations = s.conversations ?? {}; // sospechoso → [{ q, a, evidence, tick }]
    this.accused = s.accused ?? null; // { suspect, reasoning, correct }
    this.tick = 0;
    const d = s.detective ?? { x: 0, z: 5, heading: Math.PI };
    this.detective = { x: d.x, z: d.z, heading: d.heading, walking: false, target: null, targetObject: null };
    // Los sospechosos no se mueven, pero giran para mirar a quien les habla
    this.suspects = {};
    for (const [id, p] of Object.entries(SUSPECT_POSITIONS)) {
      this.suspects[id] = { x: p.x, z: p.z, heading: s.suspectHeadings?.[id] ?? Math.atan2(-p.x, -p.z) };
    }
  }

  getEvidence(id) {
    return evidenceById.get(id) ?? null;
  }

  isSuspect(id) {
    return id in this.suspects;
  }

  isBusy() {
    return this.detective.walking;
  }

  /** Distancia del detective a una prueba o a un sospechoso. */
  distanceTo(id) {
    const target = this.suspects[id] ?? evidenceById.get(id)?.position;
    if (!target) return Infinity;
    return Math.hypot(target.x - this.detective.x, target.z - this.detective.z);
  }

  /** Camina hasta una prueba (frente al panel) o hasta un sospechoso (frente a él). */
  moveTo(id) {
    const hx = ROOM.width / 2 - WALL_MARGIN;
    const hz = ROOM.depth / 2 - WALL_MARGIN;
    let point;
    if (this.suspects[id]) {
      const s = this.suspects[id];
      const dx = this.detective.x - s.x;
      const dz = this.detective.z - s.z;
      const len = Math.hypot(dx, dz) || 1;
      point = { x: s.x + (dx / len) * 1.4, z: s.z + (dz / len) * 1.4 };
    } else {
      const e = evidenceById.get(id);
      point = { x: e.position.x + Math.sin(e.rotationY) * 1.6, z: e.position.z + Math.cos(e.rotationY) * 1.6 };
    }
    const a = this.detective;
    a.target = { x: clamp(point.x, -hx, hx), z: clamp(point.z, -hz, hz) };
    a.targetObject = id;
    a.walking = true;
    return Math.hypot(a.target.x - a.x, a.target.z - a.z);
  }

  /** Detective y sospechoso se miran al hablar. */
  faceEachOther(suspectId) {
    const s = this.suspects[suspectId];
    const a = this.detective;
    s.heading = Math.atan2(a.x - s.x, a.z - s.z);
    a.heading = Math.atan2(s.x - a.x, s.z - a.z);
    this.emit('arrived', 'main', suspectId); // fuerza el envío de posiciones/orientaciones
  }

  update(dt) {
    const a = this.detective;
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
      const t = this.suspects[a.targetObject] ?? evidenceById.get(a.targetObject)?.position;
      if (t) a.heading = Math.atan2(t.x - a.x, t.z - a.z);
      const id = a.targetObject;
      a.targetObject = null;
      this.emit('arrived', 'main', id);
    } else {
      a.x += (dx / dist) * step;
      a.z += (dz / dist) * step;
      a.heading = Math.atan2(dx, dz);
    }
    return true;
  }

  agentState(id) {
    if (this.suspects[id]) {
      const s = this.suspects[id];
      return { x: s.x, z: s.z, heading: round(s.heading), walking: false, targetObject: null };
    }
    const a = this.detective;
    return { x: round(a.x), z: round(a.z), heading: round(a.heading), walking: a.walking, targetObject: a.targetObject };
  }

  /** Estado para el navegador (el contenido de las pruebas solo si ya se han examinado). */
  publicState() {
    return {
      room: ROOM,
      objects: EVIDENCE.map((e) => this.publicEvidence(e.id)),
      connections: [],
      accused: this.accused ? { suspect: this.accused.suspect } : null,
    };
  }

  publicEvidence(id) {
    const e = evidenceById.get(id);
    const base = { id: e.id, type: e.type, label: e.label, short: e.short, position: e.position, rotationY: e.rotationY };
    return this.examined.has(id) ? { ...base, content: e.content } : base;
  }

  serialize() {
    const a = this.detective;
    return {
      examined: [...this.examined],
      conversations: this.conversations,
      accused: this.accused,
      detective: { x: a.x, z: a.z, heading: a.heading },
      suspectHeadings: Object.fromEntries(Object.entries(this.suspects).map(([id, s]) => [id, s.heading])),
    };
  }
}
