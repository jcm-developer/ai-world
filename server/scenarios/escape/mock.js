// Política del cerebro simulado en El Archivo (MOCK_LLM=true): resuelve la sala paso a paso,
// con algún error deliberado, para probar el escenario sin gastar peticiones.
//
// ⚠️ SPOILERS: contiene la solución.

import { LOCKS, REACH } from './world.js';

const call = (name, args) => ({ name, args });

/** Pasos en orden: el primero cuya condición `done` no se cumpla es el siguiente. */
const STEPS = [
  { at: 'reloj', done: (w) => w.examined.has('reloj'), act: () => call('examine', { object_id: 'reloj' }), say: 'Un reloj parado. La hora podría ser importante.' },
  { at: 'planta', done: (w) => w.examined.has('planta'), act: () => call('examine', { object_id: 'planta' }), say: 'Miro la planta, por si acaso.' },
  { at: 'escritorio', done: (w) => w.examined.has('escritorio'), act: () => call('examine', { object_id: 'escritorio' }), say: 'El escritorio tiene una nota.' },
  { at: 'cajon', done: (w) => w.locks.cajon.totalFails > 0 || w.locks.cajon.open, act: () => call('enter_code', { target_id: 'cajon', code: '457' }), say: 'Pruebo una combinación con esas cifras.' },
  { at: 'cajon', done: (w) => w.locks.cajon.open, act: () => call('enter_code', { target_id: 'cajon', code: LOCKS.cajon.code }), say: 'Mejor en el orden de la hora.' },
  { at: 'cajon', done: (w) => w.itemLocation.linterna_uv !== 'cajon', act: () => call('take', { item_id: 'linterna_uv' }), say: 'Una linterna UV. Puede revelar tinta invisible.' },
  { at: 'estanteria', done: (w) => w.uvRevealed, act: () => call('use', { item_id: 'linterna_uv', target_id: 'estanteria' }), say: 'Ilumino los libros con la luz ultravioleta.' },
  { at: 'poster', done: (w) => w.examined.has('poster'), act: () => call('examine', { object_id: 'poster' }), say: '«El orden de la luz»: el póster del prisma.' },
  { at: 'caja_fuerte', done: (w) => w.locks.caja_fuerte.open, act: () => call('enter_code', { target_id: 'caja_fuerte', code: LOCKS.caja_fuerte.code }), say: 'Ordeno las cifras según el espectro.' },
  { at: 'caja_fuerte', done: (w) => w.itemLocation.tarjeta !== 'caja_fuerte', act: () => call('take', { item_id: 'tarjeta' }), say: 'Una tarjeta de acceso.' },
  { at: 'caja_fuerte', done: (w) => w.itemLocation.nota_a !== 'caja_fuerte', act: () => call('take', { item_id: 'nota_a' }), say: 'Y media nota rasgada.' },
  { at: 'papelera', done: (w) => w.examined.has('papelera'), act: () => call('examine', { object_id: 'papelera' }), say: 'La otra mitad podría estar entre los papeles.' },
  { at: 'papelera', done: (w) => w.itemLocation.nota_b !== 'papelera', act: () => call('take', { item_id: 'nota_b' }), say: 'Aquí está.' },
  { at: null, done: (w) => w.itemLocation.nota_completa === 'inventario', act: () => call('combine', { item_a: 'nota_a', item_b: 'nota_b' }), say: 'Uno las dos mitades.' },
  { at: 'terminal', done: (w) => w.examined.has('terminal'), act: () => call('examine', { object_id: 'terminal' }), say: 'La nota habla de una alarma: el terminal.' },
  { at: 'puerta', done: (w) => w.cardInserted, act: () => call('use', { item_id: 'tarjeta', target_id: 'puerta' }), say: 'Inserto la tarjeta en el lector.' },
  { at: 'puerta', done: (w) => w.locks.puerta.open, act: () => call('enter_code', { target_id: 'puerta', code: LOCKS.puerta.code }), say: 'La última lectura, sin la coma.' },
];

export function mockDecide({ world, turn }) {
  const step = STEPS.find((s) => !s.done(world));
  if (!step) return [call('think', { thought: 'Ya estoy fuera.' })];
  if (step.at && world.distanceTo(step.at) > REACH) {
    return [call('move_to', { object_id: step.at })];
  }
  const calls = [];
  if (turn % 2 === 1) calls.push(call('think', { thought: step.say }));
  calls.push(step.act());
  return calls;
}
