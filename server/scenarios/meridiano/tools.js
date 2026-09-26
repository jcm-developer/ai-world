// Herramientas del agente en la Sala Meridiano: esquemas en formato OpenAI, validación y ejecución.
// Toda acción se valida aquí, en el servidor: el modelo no puede saltarse las reglas
// del mundo (por ejemplo, inspeccionar un objeto lejano).

import { INSPECT_RADIUS, OBJECT_IDS } from './world.js';
import { fn, rememberTool, thinkTool, fail } from '../common/tools.js';

const LIMITS = { reason: 240 };

/** Definiciones que se envían al modelo (tool calling formato OpenAI). */
export const TOOL_DEFS = (() => {
  const objectId = {
    type: 'string',
    enum: OBJECT_IDS,
    description: 'Identificador del objeto (tal y como aparece en tu percepción).',
  };
  return [
    fn('move_to', 'Camina hacia un objeto de la sala hasta quedar a su lado.', { object_id: objectId }),
    fn('inspect', `Examina de cerca un objeto y revela su contenido detallado. Debe estar a menos de ${INSPECT_RADIUS} m.`, {
      object_id: objectId,
    }),
    fn('connect', 'Crea una línea de luz entre dos objetos que ya has inspeccionado y que están relacionados.', {
      id_a: objectId,
      id_b: objectId,
      reason: { type: 'string', description: 'Motivo concreto de la relación (una frase).' },
    }),
    rememberTool.definition,
    thinkTool.definition,
  ];
})();

const HANDLERS = {
  move_to(args, { world, agentId }) {
    const id = str(args.object_id);
    if (!world.getObject(id)) return fail(unknownObject(id));
    const a = world.agent(agentId);
    if (a.walking && a.targetObject === id) return fail(`Ya estás caminando hacia ${id}.`);
    const distance = world.distanceTo(agentId, id);
    if (distance <= INSPECT_RADIUS) return fail(`Ya estás junto a ${id} (${distance.toFixed(1)} m). Puedes inspeccionarlo.`);
    const path = world.moveTo(agentId, id);
    return {
      ok: true,
      summary: `Caminas hacia ${id} (${path.toFixed(1)} m).`,
      data: { objectId: id, target: a.target },
      memoryChanged: false,
    };
  },

  inspect(args, { world, agentId }) {
    const id = str(args.object_id);
    const o = world.getObject(id);
    if (!o) return fail(unknownObject(id));
    const distance = world.distanceTo(agentId, id);
    if (distance > INSPECT_RADIUS) {
      return fail(`${id} está a ${distance.toFixed(1)} m; necesitas estar a menos de ${INSPECT_RADIUS} m. Usa move_to primero.`);
    }
    const firstTime = world.markInspected(id);
    return {
      ok: true,
      summary: firstTime ? `Inspeccionas ${id} por primera vez.` : `Vuelves a inspeccionar ${id} (ya lo conocías).`,
      result: o.content,
      data: { objectId: id, object: world.publicObject(id, true), firstTime },
    };
  },

  connect(args, { world, tick }) {
    const a = str(args.id_a);
    const b = str(args.id_b);
    const reason = str(args.reason).trim();
    if (!world.getObject(a)) return fail(unknownObject(a));
    if (!world.getObject(b)) return fail(unknownObject(b));
    if (a === b) return fail('No puedes conectar un objeto consigo mismo.');
    if (!reason) return fail('Falta el motivo de la conexión.');
    if (reason.length > LIMITS.reason) return fail(`El motivo es demasiado largo (máximo ${LIMITS.reason} caracteres).`);
    const unknown = [a, b].filter((id) => !world.inspected.has(id));
    if (unknown.length) return fail(`Aún no has inspeccionado ${unknown.join(' ni ')}; no puedes afirmar una relación.`);
    if (!world.addConnection(a, b, reason, tick)) return fail(`${a} y ${b} ya estaban conectados.`);
    return { ok: true, summary: `Conectas ${a} ↔ ${b}.`, data: { a, b, reason } };
  },

  remember: rememberTool.handler,
  think: thinkTool.handler,
};

/** Valida y ejecuta una herramienta. */
export function executeTool(name, args, ctx) {
  const handler = HANDLERS[name];
  if (!handler) return fail(`La herramienta "${name}" no existe. Usa move_to, inspect, connect, remember o think.`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) return fail('Los argumentos deben ser un objeto JSON.');
  return handler(args, ctx);
}

const str = (v) => (typeof v === 'string' ? v : '');
const unknownObject = (id) => `El objeto "${id || '(vacío)'}" no existe. Ids válidos: ${OBJECT_IDS.join(', ')}.`;
