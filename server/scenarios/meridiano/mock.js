// Política del cerebro simulado en la Sala Meridiano (MOCK_LLM=true).

import { INSPECT_RADIUS } from './world.js';

const THOUGHTS = [
  'Hay objetos que aún no conozco. Empezaré por el más cercano.',
  'Cada objeto parece contar una parte de la misma historia.',
  'Antes de sacar conclusiones, quiero ver todas las piezas.',
  'Me pregunto si la alarma fue un fallo real o una interpretación.',
  'Las horas coinciden demasiado bien para ser casualidad.',
  'Una hipótesis solo vale si resiste lo que todavía no he visto.',
];

// Relaciones que el cerebro simulado "descubre" cuando conoce ambos objetos
const PAIRS = [
  ['config', 'cronologia', 'El umbral 0,8 de S-4 es el 8,0 original dividido entre 10 por migrar_v2.js.'],
  ['config', 'registro', 'El registro dispara alarmas con el umbral 0,80 que figura en la configuración de S-4.'],
  ['grafica', 'plano', 'El descenso de las 03:00 coincide con la ventilación nocturna junto a S-4.'],
  ['informe', 'registro', 'El autotest CORRECTO del registro contradice el fallo de hardware del informe.'],
  ['config', 'filtro', 'El filtro usa el umbral de la configuración sin comprobar sus unidades.'],
  ['grafica', 'registro', 'Ambos muestran la misma caída de temperatura de S-4 a las 03:14.'],
];

const call = (name, args) => ({ name, args });

export function mockDecide({ world, memory, agentId, turn }) {
  const calls = [];
  const last = memory.recentEvents(1)[0];
  if (turn % 3 === 1) calls.push(call('think', { thought: THOUGHTS[Math.floor(turn / 3) % THOUGHTS.length] }));

  // Tras inspeccionar, recuerda la primera línea con contenido del objeto
  if (last?.type === 'inspect' && last.ok) {
    const o = world.getObject(last.args.object_id);
    const firstLine = o.content.split('\n').find((l) => l.trim().length > 12) ?? o.short;
    return [...calls, call('remember', { note: `${o.id}: ${firstLine.trim().slice(0, 160)}` })];
  }

  const near = world.objectsByDistance(agentId);
  const reachable = near.find((n) => n.distance <= INSPECT_RADIUS && !world.inspected.has(n.object.id));
  if (reachable) return [...calls, call('inspect', { object_id: reachable.object.id })];

  const unexplored = near.find((n) => !world.inspected.has(n.object.id));
  if (unexplored) return [...calls, call('move_to', { object_id: unexplored.object.id })];

  const pair = PAIRS.find(([a, b]) => !world.hasConnection(a, b));
  if (pair) return [...calls, call('connect', { id_a: pair[0], id_b: pair[1], reason: pair[2] })];

  // Todo explorado y conectado: pasea por la sala
  const far = near.filter((n) => n.distance > INSPECT_RADIUS);
  const next = far[Math.floor(Math.random() * far.length)];
  if (!calls.length) calls.push(call('think', { thought: 'S-4 no está averiado: el umbral quedó mal migrado. Sigo observando.' }));
  if (next) calls.push(call('move_to', { object_id: next.object.id }));
  return calls;
}
