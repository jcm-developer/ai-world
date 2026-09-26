// El mundo: una sala con objetos flotantes y el avatar de la IA.
// El servidor es la única fuente de verdad: aquí vive la posición del avatar
// y aquí se simula su desplazamiento (el navegador solo lo dibuja).
//
// Los objetos esconden una pequeña historia: un sensor "averiado" que en realidad
// no lo está. Las pistas están repartidas entre ellos para que conectarlos tenga sentido.

import { EventEmitter } from 'node:events';

export const ROOM = { width: 32, depth: 20, height: 7 };
export const INSPECT_RADIUS = 2.5; // metros: distancia máxima para inspeccionar
const WALK_SPEED = 1.25; // metros por segundo
const STOP_DISTANCE = 1.6; // a qué distancia del objeto se detiene (delante de su cara frontal)
const WALL_MARGIN = 1.2;
// Todos los paneles se orientan hacia este punto (la zona desde la que mira la cámara)
const FACE_POINT = { x: 0, z: 12 };

export const OBJECTS = [
  {
    id: 'informe',
    type: 'documento',
    label: 'Documento',
    position: { x: -9.5, y: 1.7, z: -4.5 },
    short: 'Un documento impreso con membrete de laboratorio.',
    content: `INFORME DE CALIBRACIÓN Nº 17 — Sala Meridiano
Fecha: 14 de marzo · Equipo de instrumentación

Resumen: la matriz de seis sensores térmicos (S-1 a S-6) funcionó con normalidad salvo S-4. A las 03:14, S-4 disparó tres anomalías consecutivas y el sistema lo reinició automáticamente. Tras el reinicio volvió a dar lecturas normales.

Antecedentes: S-4 es el único sensor con umbral personalizado desde su instalación, porque está junto a la rejilla de ventilación.

Conclusión provisional: probable fallo de hardware en S-4. Se recomienda sustituirlo.

Pendiente: nadie ha revisado todavía la configuración migrada ni el software de filtrado.`,
  },
  {
    id: 'filtro',
    type: 'codigo',
    label: 'Código',
    position: { x: -3.5, y: 1.8, z: -7.2 },
    short: 'Un fragmento de código fuente suspendido en el aire.',
    content: `// filtro.js — detección de anomalías en la matriz de sensores (v2)
const historial = new Map();

export function procesarLectura(sensor, valor, cfg) {
  const h = historial.get(sensor) ?? [];
  h.push(valor);
  if (h.length > 6) h.shift();          // media móvil de 6 lecturas
  historial.set(sensor, h);

  const media = h.reduce((a, b) => a + b, 0) / h.length;
  const desviacion = Math.abs(valor - media);
  // Se usa el umbral tal cual llega de la configuración, sin comprobar unidades
  const umbral = cfg.sensores[sensor].umbral_desviacion;

  if (desviacion > umbral) {
    contarAnomalia(sensor);
    if (anomalias(sensor) >= cfg.sensores[sensor].reinicio_tras) {
      reiniciarSensor(sensor);          // deja el sensor sin leer ~30 s
    }
  } else {
    limpiarAnomalias(sensor);
  }
  return { media, desviacion, anomalia: desviacion > umbral };
}`,
  },
  {
    id: 'grafica',
    type: 'grafica',
    label: 'Gráfica',
    position: { x: 3.5, y: 1.9, z: -7.4 },
    short: 'Una gráfica con una serie temporal luminosa.',
    content: `Temperatura de S-4 (°C) durante la noche del 14 de marzo, de 00:00 a 06:00, una lectura cada 10 min.
Valor estable en torno a 21,4 °C. A partir de las 03:00 desciende suavemente hasta un mínimo de 20,3 °C (intervalo 03:10–03:20) y se recupera antes de las 04:00.
Variación máxima respecto a la media: 1,1 °C. Punto marcado en rojo: la alarma de las 03:14.
Leyenda al pie: "Los otros cinco sensores no muestran este descenso".`,
    visual: {
      from: '00:00',
      to: '06:00',
      stepMin: 10,
      unit: '°C',
      series: [
        21.4, 21.5, 21.4, 21.3, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.4, 21.5, 21.4,
        21.2, 20.3, 20.6, 20.9, 21.1, 21.3, 21.4, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.4,
      ],
      markIndex: 19,
      markLabel: 'alarma 03:14',
    },
  },
  {
    id: 'config',
    type: 'datos',
    label: 'Estructura de datos',
    position: { x: 9.8, y: 1.7, z: -3.8 },
    short: 'Una estructura de datos jerárquica, como un árbol de nodos.',
    content: `{
  "sala": "Meridiano",
  "version_config": "2.0",
  "migrado_por": "migrar_v2.js · 13/03 23:58",
  "unidad_umbral": "°C",
  "sensores": {
    "S-1": { "zona": "oeste",          "umbral_desviacion": 8.0, "reinicio_tras": 3 },
    "S-2": { "zona": "oeste",          "umbral_desviacion": 8.0, "reinicio_tras": 3 },
    "S-3": { "zona": "centro",         "umbral_desviacion": 8.0, "reinicio_tras": 3 },
    "S-4": { "zona": "norte · rejilla", "umbral_desviacion": 0.8, "reinicio_tras": 3 },
    "S-5": { "zona": "este",           "umbral_desviacion": 8.0, "reinicio_tras": 3 },
    "S-6": { "zona": "este",           "umbral_desviacion": 8.0, "reinicio_tras": 3 }
  }
}`,
  },
  {
    id: 'registro',
    type: 'pantalla',
    label: 'Pantalla virtual',
    position: { x: 9.5, y: 1.9, z: 4.5 },
    short: 'Una pantalla virtual con un registro de texto que se desplaza.',
    content: `REGISTRO DEL SISTEMA — nodo meridiano-01 — 14/03
03:00:00  ventilación: ciclo nocturno iniciado (40 min)
03:13:56  [S-4] lectura 20.61 °C · media 21.38 · desv 0.77 · ok
03:14:02  [S-4] lectura 20.47 °C · media 21.40 · desv 0.93 > umbral 0.80 → ANOMALÍA 1/3
03:14:08  [S-4] lectura 20.41 °C · media 21.33 · desv 0.92 > umbral 0.80 → ANOMALÍA 2/3
03:14:14  [S-4] lectura 20.35 °C · media 21.25 · desv 0.90 > umbral 0.80 → ANOMALÍA 3/3
03:14:14  [S-4] reinicio automático solicitado
03:14:44  [S-4] en línea · autotest de hardware: CORRECTO
03:14:50  [S-1][S-2][S-3][S-5][S-6] sin anomalías (umbral 8.0)
03:40:00  ventilación: ciclo nocturno finalizado`,
  },
  {
    id: 'plano',
    type: 'plano',
    label: 'Plano',
    position: { x: 1.0, y: 1.6, z: 6.8 },
    short: 'Un plano arquitectónico translúcido de una sala.',
    content: `Plano de la Sala Meridiano (escala 1:100).
Seis sensores térmicos: S-1 y S-2 en la pared oeste, S-3 en el centro, S-5 y S-6 en la pared este.
S-4 está en la pared norte, a 0,5 m de la rejilla de ventilación.
Anotación a lápiz junto a la rejilla: "la ventilación nocturna arranca a las 03:00 y dura 40 min; el aire entra frío".`,
    visual: {
      w: 20,
      h: 12,
      sensors: [
        { id: 'S-1', x: 1, y: 3 },
        { id: 'S-2', x: 1, y: 9 },
        { id: 'S-3', x: 10, y: 6 },
        { id: 'S-4', x: 10, y: 0.8 },
        { id: 'S-5', x: 19, y: 3 },
        { id: 'S-6', x: 19, y: 9 },
      ],
      vent: { x: 10.8, y: 0, w: 2.4 },
      door: { x: 8.5, y: 12, w: 3 },
    },
  },
  {
    id: 'cronologia',
    type: 'cronologia',
    label: 'Cronología',
    position: { x: -9.0, y: 1.8, z: 5.0 },
    short: 'Una línea de tiempo con hitos marcados.',
    content: `Cronología de la Sala Meridiano:
· 12/03 16:20 — Calibración manual de S-1 a S-6. Todo correcto.
· 13/03 23:58 — Se ejecuta migrar_v2.js: convierte los umbrales de décimas de grado a grados (divide entre 10). Comentario del script: "se asume que todos los umbrales v1 están en décimas".
· 14/03 03:00 — Arranca la ventilación nocturna programada.
· 14/03 03:14 — Alarma en S-4 y reinicio automático.
· 14/03 09:00 — Informe nº 17: se propone sustituir S-4.
· 16/03 11:30 — Pedido de un sensor nuevo (1.240 €), pendiente de aprobación.`,
    visual: {
      events: [
        { t: '12/03 16:20', label: 'Calibración manual' },
        { t: '13/03 23:58', label: 'migrar_v2.js (÷10)' },
        { t: '14/03 03:00', label: 'Ventilación nocturna' },
        { t: '14/03 03:14', label: 'Alarma S-4', alert: true },
        { t: '14/03 09:00', label: 'Informe nº 17' },
        { t: '16/03 11:30', label: 'Pedido 1.240 €' },
      ],
    },
  },
];

// Orientación (rotación en Y) de cada panel: su cara frontal mira hacia FACE_POINT
for (const o of OBJECTS) o.rotationY = Math.atan2(FACE_POINT.x - o.position.x, FACE_POINT.z - o.position.z);

export const OBJECT_IDS = OBJECTS.map((o) => o.id);
const byId = new Map(OBJECTS.map((o) => [o.id, o]));

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Estado vivo de la sala: posición de cada avatar, objetos inspeccionados y conexiones.
 * Se serializa en la memoria del escenario para recordar la sala entre sesiones.
 */
export class World extends EventEmitter {
  /** @param {object|null} saved estado guardado (serialize) o null para empezar de cero */
  constructor(saved = null, agentIds = ['main']) {
    super();
    this.inspected = new Set(saved?.inspected ?? []);
    this.connections = saved?.connections ?? [];
    this.agents = new Map();
    for (const id of agentIds) {
      const pos = saved?.agents?.[id];
      this.agents.set(id, {
        x: pos?.x ?? 0,
        z: pos?.z ?? 1.5,
        heading: pos?.heading ?? Math.PI,
        walking: false,
        target: null, // punto {x, z} al que camina
        targetObject: null, // id del objeto de destino
      });
    }
  }

  get objectIds() {
    return OBJECT_IDS;
  }

  getObject(id) {
    return byId.get(id) ?? null;
  }

  agent(id) {
    return this.agents.get(id);
  }

  /** El agente está ocupado (caminando) y no debe consultar al modelo. */
  isBusy(agentId) {
    return this.agents.get(agentId)?.walking ?? false;
  }

  /** Distancia horizontal (en metros) entre un avatar y un objeto. */
  distanceTo(agentId, objectId) {
    const o = byId.get(objectId);
    const a = this.agents.get(agentId);
    if (!o || !a) return Infinity;
    return Math.hypot(o.position.x - a.x, o.position.z - a.z);
  }

  /** Objetos ordenados por distancia al avatar. */
  objectsByDistance(agentId) {
    return OBJECTS.map((o) => ({ object: o, distance: this.distanceTo(agentId, o.id) })).sort((a, b) => a.distance - b.distance);
  }

  /**
   * Inicia el desplazamiento hacia un objeto. El avatar se detiene a STOP_DISTANCE
   * delante de la cara frontal del panel, sin salirse de la sala.
   * Devuelve la distancia a recorrer.
   */
  moveTo(agentId, objectId) {
    const o = byId.get(objectId);
    const a = this.agents.get(agentId);
    const hx = ROOM.width / 2 - WALL_MARGIN;
    const hz = ROOM.depth / 2 - WALL_MARGIN;
    a.target = {
      x: clamp(o.position.x + Math.sin(o.rotationY) * STOP_DISTANCE, -hx, hx),
      z: clamp(o.position.z + Math.cos(o.rotationY) * STOP_DISTANCE, -hz, hz),
    };
    a.targetObject = objectId;
    a.walking = true;
    return Math.hypot(a.target.x - a.x, a.target.z - a.z);
  }

  /** Marca un objeto como inspeccionado. Devuelve true si es la primera vez. */
  markInspected(objectId) {
    if (this.inspected.has(objectId)) return false;
    this.inspected.add(objectId);
    return true;
  }

  hasConnection(idA, idB) {
    const [a, b] = [idA, idB].sort();
    return this.connections.some((c) => c.a === a && c.b === b);
  }

  /** Crea una conexión (el par se guarda ordenado). Devuelve false si ya existía. */
  addConnection(idA, idB, reason, tick) {
    if (this.hasConnection(idA, idB)) return false;
    const [a, b] = [idA, idB].sort();
    this.connections.push({ a, b, reason, tick });
    return true;
  }

  /**
   * Avanza la simulación dt segundos. Devuelve true si algún avatar se ha movido.
   * Emite 'arrived' al llegar al destino.
   */
  update(dt) {
    let moved = false;
    for (const [id, a] of this.agents) {
      if (!a.walking || !a.target) continue;
      moved = true;
      const dx = a.target.x - a.x;
      const dz = a.target.z - a.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;

      if (dist <= step) {
        a.x = a.target.x;
        a.z = a.target.z;
        a.walking = false;
        a.target = null;
        // Al llegar, mira hacia el objeto
        const o = byId.get(a.targetObject);
        if (o) a.heading = Math.atan2(o.position.x - a.x, o.position.z - a.z);
        const objectId = a.targetObject;
        a.targetObject = null;
        this.emit('arrived', id, objectId);
      } else {
        a.x += (dx / dist) * step;
        a.z += (dz / dist) * step;
        a.heading = Math.atan2(dx, dz);
      }
    }
    return moved;
  }

  /** Estado de un avatar para el navegador. */
  agentState(agentId) {
    const a = this.agents.get(agentId);
    return {
      x: round(a.x, 3),
      z: round(a.z, 3),
      heading: round(a.heading, 3),
      walking: a.walking,
      targetObject: a.targetObject,
    };
  }

  /**
   * Estado del mundo para el navegador: el contenido detallado de cada objeto
   * solo se incluye si ya se ha inspeccionado.
   */
  publicState() {
    return {
      room: ROOM,
      objects: OBJECTS.map((o) => this.publicObject(o.id, this.inspected.has(o.id))),
      connections: this.connections,
    };
  }

  publicObject(id, revealed) {
    const o = byId.get(id);
    const base = { id: o.id, type: o.type, label: o.label, short: o.short, position: o.position, rotationY: o.rotationY };
    return revealed ? { ...base, content: o.content, visual: o.visual ?? null } : base;
  }

  /** Estado a guardar en la memoria del escenario. */
  serialize() {
    const agents = {};
    for (const [id, a] of this.agents) agents[id] = { x: a.x, z: a.z, heading: a.heading };
    return { inspected: [...this.inspected], connections: this.connections, agents };
  }
}
