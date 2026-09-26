// Escenario 3 · Detective: «La noche del 13».
//
// ⚠️ SPOILERS: este archivo contiene la solución del caso.
//
// Alguien lanzó migrar_v2.js a escondidas la noche del 13 de marzo, lo que provocó la falsa
// alarma de S-4 y el pedido urgente de un sensor nuevo. El detective debe descubrir quién y por qué.
//
// La escena es la oficina técnica del laboratorio: cada sospechoso está en su puesto haciendo
// algo, y las pruebas son objetos físicos (una carpeta, una pantalla, un abrigo…).

import { EventEmitter } from 'node:events';
import { createNavGrid } from '../../engine/navgrid.js';

export const ROOM = { width: 22, depth: 14, height: 4.2 };
export const REACH = 2.5; // para examinar pruebas
export const TALK_REACH = 2.8; // para hablar con un sospechoso
export const MAX_TICKS = 120;
export const CULPRIT = 'tomas';
const WALK_SPEED = 1.25;
const TALK_ATTENTION_MS = 18000; // tras hablar, el sospechoso vuelve a lo suyo pasado este tiempo

// --- Mobiliario ------------------------------------------------------------------------
// Huella en el suelo (x, z, semiancho hw, semifondo hd, giro rot). El frente de cada mueble
// mira hacia +Z local. El cliente dibuja cada tipo; el servidor lo usa para la búsqueda de caminos.

export const FURNITURE = [
  { id: 'mesa_elena', kind: 'desk', x: -7.4, z: -3.8, hw: 0.85, hd: 0.42, rot: 0, props: ['papers', 'monitor', 'lamp', 'frame'] },
  { id: 'silla_elena', kind: 'chair', x: -7.4, z: -4.55, hw: 0.28, hd: 0.28, rot: 0 },
  { id: 'mesa_marcos', kind: 'desk', x: -2.6, z: -3.8, hw: 0.85, hd: 0.42, rot: 0, props: ['monitor2', 'keyboard', 'mug', 'plantita'] },
  { id: 'silla_marcos', kind: 'chair', x: -2.6, z: -4.55, hw: 0.28, hd: 0.28, rot: 0 },
  { id: 'mesa_lucia', kind: 'desk', x: 2.6, z: -3.8, hw: 0.85, hd: 0.42, rot: 0, props: ['laptop', 'notebook', 'bottle'] },
  { id: 'silla_lucia', kind: 'chair', x: 2.6, z: -4.55, hw: 0.28, hd: 0.28, rot: 0 },
  { id: 'banco_tomas', kind: 'counter', x: 8.4, z: -6.45, hw: 2.3, hd: 0.45, rot: 0, props: ['toolbox', 'coffee_machine'] },
  { id: 'armario_servidores', kind: 'rack', x: -10.2, z: -6.1, hw: 0.4, hd: 0.5, rot: 0 },
  { id: 'recepcion', kind: 'reception', x: -8.4, z: 4.6, hw: 1.3, hd: 0.42, rot: 0 },
  { id: 'perchero', kind: 'coat_rack', x: -10.3, z: 5.9, hw: 0.28, hd: 0.28, rot: 0 },
  { id: 'impresora', kind: 'printer_table', x: 10.25, z: 1.5, hw: 0.45, hd: 0.36, rot: -Math.PI / 2 },
  { id: 'mesa_reuniones', kind: 'meeting_table', x: 1.6, z: 3.0, hw: 1.7, hd: 0.8, rot: 0 },
  { id: 'dispensador', kind: 'water_cooler', x: 5.6, z: -6.5, hw: 0.2, hd: 0.2, rot: 0 },
  { id: 'planta_1', kind: 'plant', x: -10.3, z: -1.2, hw: 0.28, hd: 0.28, rot: 0 },
  { id: 'planta_2', kind: 'plant', x: 10.3, z: -3.2, hw: 0.28, hd: 0.28, rot: 0 },
  { id: 'planta_3', kind: 'plant', x: 10.3, z: 5.8, hw: 0.28, hd: 0.28, rot: 0 },
  { id: 'corcho', kind: 'corkboard', x: 0, z: -6.95, hw: 1.3, hd: 0.05, rot: 0, onWall: true },
];

// --- Pruebas (objetos físicos) ---------------------------------------------------------
// position: dónde está el objeto · standAt: dónde se coloca el detective para examinarlo.

export const EVIDENCE = [
  {
    id: 'registro_accesos',
    type: 'datos',
    prop: 'clipboard',
    label: 'Registro de accesos',
    position: { x: -8.6, y: 1.1, z: 4.55 },
    standAt: { x: -8.6, z: 3.45 },
    short: 'Una carpeta con la hoja de fichajes del edificio, sobre el mostrador de recepción.',
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
    prop: 'rack_screen',
    label: 'Registro del servidor',
    position: { x: -10.2, y: 1.45, z: -5.58 },
    standAt: { x: -9.5, z: -4.6 },
    short: 'La pantalla del armario de servidores, con el registro de ejecución.',
    content: `SERVIDOR meridiano-01 — registro de ejecución
13/03 23:58:12  migrar_v2.js ejecutado · terminal T-2 (sala de servidores) · usuario: mrey
13/03 23:58:40  umbrales convertidos (6 sensores)
14/03 03:14:14  [S-4] ANOMALÍA 3/3 → reinicio automático
14/03 09:00     informe nº 17 generado (E. Vidal)`,
  },
  {
    id: 'calendario',
    type: 'documento',
    prop: 'calendar',
    label: 'Calendario',
    position: { x: -0.55, y: 1.75, z: -6.88 },
    standAt: { x: 0, z: -5.75 },
    short: 'La planificación del mes, clavada en el corcho.',
    content: `PLANIFICACIÓN DE MARZO — Laboratorio Meridiano
· 16/03 10:00 — Migración de la configuración a v2 (M. Rey), con revisión previa de los umbrales personalizados.
· 18/03 — Cierre del presupuesto trimestral de compras.
· 20/03 — Fecha límite para enviar pedidos a proveedores (aprueba E. Vidal).`,
  },
  {
    id: 'maquina_cafe',
    type: 'pantalla',
    prop: 'coffee_screen',
    label: 'Máquina de café',
    position: { x: 9.9, y: 1.35, z: -6.3 },
    standAt: { x: 9.7, z: -5.2 },
    short: 'La máquina de café de la sala de servidores, con su registro de ventas en pantalla.',
    content: `MÁQUINA DE CAFÉ — sala de servidores — ventas del 13/03
17:48  café con leche · tarjeta de empleado 0231
18:30  té verde · tarjeta de empleado 0562
22:05  agua · tarjeta de empleado 0562
23:52  café solo · tarjeta de empleado 0417`,
  },
  {
    id: 'correo_impreso',
    type: 'documento',
    prop: 'printer_paper',
    label: 'Correo impreso',
    position: { x: 10.25, y: 1.0, z: 1.5 },
    standAt: { x: 9.1, z: 1.5 },
    short: 'Una hoja olvidada en la bandeja de la impresora.',
    content: `Correo impreso, olvidado en la bandeja de la impresora de la sala de compras.
De: raul.comercial@sensotek.es · Para: t.ferrer@meridiano.lab · Fecha: 11/03
«Tomás: como hablamos, si el pedido del sensor térmico sale antes del día 20, te aplicamos la comisión de siempre. Un saludo, Raúl (Sensotek).»`,
  },
  {
    id: 'foto_t2',
    type: 'documento',
    prop: 'photo',
    label: 'Foto del puesto T-2',
    position: { x: 0.9, y: 0.78, z: 3.1 },
    standAt: { x: 0.9, z: 4.35 },
    short: 'Una fotografía tomada por Seguridad, sobre la mesa de reuniones.',
    content: `Fotografía del puesto T-2 de la sala de servidores, tomada por Seguridad el 14/03 a las 08:30.
En el borde del monitor hay un pósit amarillo: «mrey / Meridiano13!».
Junto al teclado, un vaso de papel de la máquina de café, vacío.`,
  },
  {
    id: 'abrigo',
    type: 'documento',
    prop: 'coat',
    label: 'Abrigo en el perchero',
    position: { x: -10.3, y: 1.35, z: 5.9 },
    standAt: { x: -9.3, z: 5.4 },
    short: 'Un abrigo gris colgado en el perchero de la entrada.',
    content: `Un abrigo gris con una etiqueta cosida: «M. Rey».
En el bolsillo hay una entrada de cine (Cines Odeón · 13/03 · sesión de las 22:15 · sala 4 · fila 7) y un tique del aparcamiento del cine: entrada 22:02, salida 00:52.`,
  },
  {
    id: 'taza',
    type: 'documento',
    prop: 'mug',
    label: 'Taza',
    position: { x: 2.5, y: 0.78, z: 2.8 },
    standAt: { x: 2.6, z: 4.35 },
    short: 'Una taza olvidada en la mesa de reuniones.',
    content: `Una taza de cerámica con restos de café frío y una marca de pintalabios rojo en el borde. Lleva el logotipo del congreso de instrumentación de 2024.`,
  },
];

export const EVIDENCE_IDS = EVIDENCE.map((e) => e.id);
const evidenceById = new Map(EVIDENCE.map((e) => [e.id, e]));

// --- Sospechosos en sus puestos ----------------------------------------------------------
// seat: posición · heading: hacia dónde miran trabajando · activity: pose que anima el cliente
// talkAt: dónde se coloca el detective para hablar con ellos.

export const STATIONS = {
  elena: { x: -7.4, z: -4.55, heading: 0, activity: 'read', seated: true, talkAt: { x: -7.4, z: -2.7 } },
  marcos: { x: -2.6, z: -4.55, heading: 0, activity: 'type', seated: true, talkAt: { x: -2.6, z: -2.7 } },
  lucia: { x: 2.6, z: -4.55, heading: 0, activity: 'type_nervous', seated: true, talkAt: { x: 2.6, z: -2.7 } },
  tomas: { x: 8.2, z: -5.3, heading: 0.25, activity: 'drink', seated: false, talkAt: { x: 7.9, z: -3.7 } },
};

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

// Rejilla de navegación compartida: muebles (salvo los de pared) y los propios sospechosos
const NAV = createNavGrid({
  width: ROOM.width,
  depth: ROOM.depth,
  obstacles: [
    ...FURNITURE.filter((f) => !f.onWall),
    ...Object.values(STATIONS).map((s) => ({ x: s.x, z: s.z, hw: 0.25, hd: 0.25 })),
  ],
});

export class DetectiveWorld extends EventEmitter {
  constructor(saved = null) {
    super();
    const s = saved ?? {};
    this.examined = new Set(s.examined ?? []);
    this.conversations = s.conversations ?? {}; // sospechoso → [{ q, a, evidence, tick }]
    this.accused = s.accused ?? null; // { suspect, reasoning, correct, tick }
    this.tick = 0;
    const d = s.detective ?? { x: 0, z: 5.6, heading: Math.PI };
    this.detective = { x: d.x, z: d.z, heading: d.heading, walking: false, path: [], targetObject: null };
    this.suspects = {};
    for (const [id, st] of Object.entries(STATIONS)) {
      this.suspects[id] = { x: st.x, z: st.z, heading: st.heading, attentionUntil: 0 };
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

  /** Camina (rodeando los muebles) hasta una prueba o hasta el puesto de un sospechoso. */
  moveTo(id) {
    const dest = STATIONS[id]?.talkAt ?? evidenceById.get(id)?.standAt;
    const a = this.detective;
    a.path = NAV.findPath(a, dest);
    a.targetObject = id;
    a.walking = true;
    // Longitud total del recorrido
    let len = 0;
    let prev = a;
    for (const p of a.path) {
      len += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    return len;
  }

  /** El sospechoso deja lo que hace y gira la silla hacia el detective; el detective le mira. */
  faceEachOther(suspectId) {
    const s = this.suspects[suspectId];
    const a = this.detective;
    s.heading = Math.atan2(a.x - s.x, a.z - s.z);
    s.attentionUntil = Date.now() + TALK_ATTENTION_MS;
    a.heading = Math.atan2(s.x - a.x, s.z - a.z);
    this.emit('arrived', 'main', suspectId); // fuerza el envío de posiciones y orientaciones
    // Pasado un rato, vuelve a su tarea
    clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      if (Date.now() < s.attentionUntil) return;
      s.heading = STATIONS[suspectId].heading;
      this.emit('arrived', 'main', null);
    }, TALK_ATTENTION_MS + 50);
  }

  update(dt) {
    const a = this.detective;
    if (!a.walking) return false;
    let step = WALK_SPEED * dt;
    while (step > 0 && a.path.length) {
      const p = a.path[0];
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= step) {
        a.x = p.x;
        a.z = p.z;
        step -= dist;
        a.path.shift();
      } else {
        a.x += (dx / dist) * step;
        a.z += (dz / dist) * step;
        a.heading = Math.atan2(dx, dz);
        step = 0;
      }
    }
    if (!a.path.length) {
      a.walking = false;
      const t = this.suspects[a.targetObject] ?? evidenceById.get(a.targetObject)?.position;
      if (t) a.heading = Math.atan2(t.x - a.x, t.z - a.z);
      const id = a.targetObject;
      a.targetObject = null;
      this.emit('arrived', 'main', id);
    }
    return true;
  }

  agentState(id) {
    if (this.suspects[id]) {
      const s = this.suspects[id];
      const st = STATIONS[id];
      const attending = Date.now() < s.attentionUntil;
      const pose = attending ? (st.seated ? 'sit' : 'stand_hold') : st.activity;
      return { x: s.x, z: s.z, heading: round(s.heading), walking: false, targetObject: null, pose };
    }
    const a = this.detective;
    return { x: round(a.x), z: round(a.z), heading: round(a.heading), walking: a.walking, targetObject: a.targetObject, pose: 'stand' };
  }

  /** Estado para el navegador (el contenido de las pruebas solo si ya se han examinado). */
  publicState() {
    return {
      room: ROOM,
      furniture: FURNITURE,
      evidence: EVIDENCE.map((e) => this.publicEvidence(e.id)),
      accused: this.accused ? { suspect: this.accused.suspect } : null,
    };
  }

  publicEvidence(id) {
    const e = evidenceById.get(id);
    const base = { id: e.id, type: e.type, prop: e.prop, label: e.label, short: e.short, position: e.position };
    return this.examined.has(id) ? { ...base, content: e.content } : base;
  }

  serialize() {
    const a = this.detective;
    return {
      examined: [...this.examined],
      conversations: this.conversations,
      accused: this.accused,
      detective: { x: a.x, z: a.z, heading: a.heading },
    };
  }
}
