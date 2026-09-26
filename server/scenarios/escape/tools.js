// Herramientas del agente en El Archivo. Toda acción se valida en el servidor:
// distancia, inventario, cerraduras bloqueadas, formato de los códigos…
//
// ⚠️ SPOILERS: los textos de respuesta revelan parte de la solución.

import { fail, fn, rememberTool, thinkTool } from '../common/tools.js';
import { COMBINATIONS, FIXTURE_IDS, ITEM_IDS, ITEMS, LOCKS, REACH } from './world.js';

const fixtureId = { type: 'string', enum: FIXTURE_IDS, description: 'Id de un objeto de la sala.' };
const anyId = { type: 'string', enum: [...FIXTURE_IDS, ...ITEM_IDS], description: 'Id de un objeto de la sala o de tu inventario.' };
const itemId = { type: 'string', enum: ITEM_IDS, description: 'Id de un objeto portátil.' };

export const TOOL_DEFS = [
  fn('move_to', 'Camina hasta un objeto de la sala.', { object_id: fixtureId }),
  fn('examine', `Examina de cerca un objeto de la sala (a menos de ${REACH} m) o uno de tu inventario.`, { object_id: anyId }),
  fn('take', 'Coge un objeto portátil que esté a la vista (dentro de algo abierto o examinado) y guárdalo en tu inventario.', { item_id: itemId }),
  fn('use', 'Usa un objeto de tu inventario sobre un objeto de la sala.', { item_id: itemId, target_id: fixtureId }),
  fn('enter_code', 'Introduce un código numérico en una cerradura (cajón, caja fuerte o puerta).', {
    target_id: { type: 'string', enum: Object.keys(LOCKS), description: 'Cerradura donde introducir el código.' },
    code: { type: 'string', description: 'Solo dígitos, sin espacios.' },
  }),
  fn('combine', 'Combina dos objetos de tu inventario.', { item_a: itemId, item_b: itemId }),
  rememberTool.definition,
  thinkTool.definition,
];

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Si el objeto está lejos, se pide acercarse: executeTool camina hasta él y deja la acción en cola. */
function needsReach(world, id) {
  return world.distanceTo(id) > REACH ? { approach: id } : null;
}

const HANDLERS = {
  move_to(args, { world }) {
    const id = str(args.object_id);
    if (!world.getFixture(id)) return fail(unknown(id));
    const d = world.distanceTo(id);
    if (d <= REACH) return fail(`Ya estás junto a ${id} (${d.toFixed(1)} m).`);
    const path = world.moveTo(id);
    return { ok: true, summary: `Caminas hacia ${id} (${path.toFixed(1)} m).`, data: { target: id }, memoryChanged: false };
  },

  examine(args, { world }) {
    const id = str(args.object_id);
    if (ITEMS[id]) {
      if (world.itemLocation[id] !== 'inventario') return fail(`No llevas ${id} en tu inventario.`);
      return { ok: true, summary: `Examinas ${id}.`, result: ITEMS[id].text, data: { target: id } };
    }
    if (!world.getFixture(id)) return fail(unknown(id));
    const far = needsReach(world, id);
    if (far) return far;
    world.examine(id);
    return { ok: true, summary: `Examinas ${id}.`, result: world.describe(id), data: { target: id } };
  },

  take(args, { world }) {
    const id = str(args.item_id);
    if (!ITEMS[id]) return fail(unknown(id));
    const where = world.itemLocation[id];
    if (where === 'inventario') return fail(`Ya llevas ${id}.`);
    if (!where || !world.getFixture(where) || !world.itemsIn(where).includes(id)) {
      return fail(`No ves ${id} por ninguna parte. Busca en lo que tengas abierto o hayas examinado.`);
    }
    const far = needsReach(world, where);
    if (far) return far;
    world.take(id);
    return { ok: true, summary: `Coges ${id} de ${where}.`, result: ITEMS[id].text, data: { item: id, from: where } };
  },

  use(args, { world }) {
    const item = str(args.item_id);
    const target = str(args.target_id);
    if (!ITEMS[item]) return fail(unknown(item));
    if (!world.getFixture(target)) return fail(unknown(target));
    if (world.itemLocation[item] !== 'inventario') return fail(`No llevas ${item} en tu inventario.`);
    const far = needsReach(world, target);
    if (far) return far;

    if (item === 'linterna_uv' && target === 'estanteria') {
      const first = !world.uvRevealed;
      world.recordUse(item, target, true);
      world.revealUv();
      world.examine(target);
      return {
        ok: true,
        summary: first ? 'La luz ultravioleta revela algo en la estantería.' : 'La luz UV vuelve a mostrar las marcas de la estantería.',
        result: world.getFixture('estanteria').uvText,
        data: { item, target, effect: 'uv' },
      };
    }
    if (item === 'linterna_uv') {
      world.recordUse(item, target, false);
      return { ok: true, summary: `Iluminas ${target} con la luz UV: no aparece nada.`, data: { item, target, effect: 'uv_nothing' } };
    }
    if (item === 'tarjeta' && target === 'puerta') {
      world.recordUse(item, target, true);
      world.insertCard();
      return { ok: true, summary: 'El lector acepta la tarjeta: el teclado de la puerta se ilumina.', data: { item, target, effect: 'card' } };
    }
    world.recordUse(item, target, false);
    return fail(`Usar ${item} sobre ${target} no tiene ningún efecto.`);
  },

  enter_code(args, { world, tick }) {
    const lockId = str(args.target_id);
    const code = str(args.code).replace(/\s+/g, '');
    const lock = LOCKS[lockId];
    if (!lock) return fail(`"${lockId}" no es una cerradura. Cerraduras: ${Object.keys(LOCKS).join(', ')}.`);
    const state = world.locks[lockId];
    if (state.open) return fail(`${lockId} ya está abierto: no necesita ningún código.`);
    if (lock.needsCard && !world.cardInserted) return fail('El teclado de la puerta está apagado. Parece que necesita algo antes.');
    if (state.blockedUntil > tick) {
      return fail(`${lockId} está bloqueado por demasiados intentos fallidos. Se desbloquea en ${state.blockedUntil - tick} turno(s).`);
    }
    if (!/^\d+$/.test(code)) return fail('El código solo puede contener dígitos.');
    if (code.length !== lock.digits) return fail(`${lockId} pide un código de ${lock.digits} dígitos.`);
    if (state.tried?.includes(code)) return fail(`Ya probaste ${code} en ${lockId} y era incorrecto. Busca la pista que te falta.`);
    const far = needsReach(world, lockId);
    if (far) return far;

    const res = world.tryCode(lockId, code, tick);
    if (res.opened) {
      const inside = lock.contains.length ? ` Dentro hay: ${lock.contains.join(', ')}.` : '';
      const summary = lockId === 'puerta' ? '¡La puerta se abre! Sales del archivo.' : `${lockId} se abre.${inside}`;
      return { ok: true, summary, data: { lock: lockId, opened: true } };
    }
    const why = res.blocked
      ? `Código incorrecto. Demasiados fallos: ${lockId} queda bloqueado ${3} turnos.`
      : `Código incorrecto (${res.fails} fallo(s) seguidos; al tercero se bloquea).`;
    return { ok: false, summary: why, data: { lock: lockId, opened: false, blocked: res.blocked } };
  },

  combine(args, { world }) {
    const a = str(args.item_a);
    const b = str(args.item_b);
    for (const id of [a, b]) {
      if (!ITEMS[id]) return fail(unknown(id));
      if (world.itemLocation[id] !== 'inventario') return fail(`No llevas ${id} en tu inventario.`);
    }
    if (a === b) return fail('Necesitas dos objetos distintos.');
    const combo = COMBINATIONS.find((c) => c.parts.includes(a) && c.parts.includes(b));
    if (!combo) return fail(`${a} y ${b} no encajan entre sí.`);
    world.combine(a, b, combo.result);
    return { ok: true, summary: `Combinas ${a} y ${b}: obtienes ${combo.result}.`, result: ITEMS[combo.result].text, data: { result: combo.result } };
  },

  remember: rememberTool.handler,
  think: thinkTool.handler,
};

export function executeTool(name, args, ctx) {
  const handler = HANDLERS[name];
  if (!handler) return fail(`La herramienta "${name}" no existe. Usa: ${Object.keys(HANDLERS).join(', ')}.`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) return fail('Los argumentos deben ser un objeto JSON.');
  ctx.world.tick = ctx.tick;
  const result = handler(args, ctx);
  if (!result?.approach) return result;
  // Estaba algo lejos: camina hasta el objeto y la acción queda en cola para cuando llegue
  const id = result.approach;
  const dist = ctx.world.distanceTo(id);
  ctx.world.moveTo(id);
  return {
    ok: true,
    summary: `${id} está a ${dist.toFixed(1)} m: te acercas y harás ${name} al llegar.`,
    data: { target: id },
    recordAs: { type: 'move_to', args: { object_id: id } },
    queue: { name, args },
    memoryChanged: false,
  };
}

const unknown = (id) => `"${id || '(vacío)'}" no existe. Objetos: ${FIXTURE_IDS.join(', ')}. Portátiles: ${ITEM_IDS.join(', ')}.`;
