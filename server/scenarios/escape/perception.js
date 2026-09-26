// Percepción en El Archivo: situación (turnos, inventario), objetos por distancia con su estado,
// progreso (qué ha conseguido y qué ha probado), memoria y últimas acciones.

import { actionsSection, fmt, notesSection, rememberNudge, thinkOnlyNudge } from '../common/perception.js';
import { FIXTURE_IDS, ITEMS, LOCKS, MAX_TICKS, REACH, SHOW_LIMIT } from './world.js';

const RECENT_EVENTS = 6;
const REVEALING = new Set(['examine', 'use', 'combine', 'take']);
const REPEAT_WINDOW = 10; // acciones físicas recientes en las que se buscan repeticiones
const PHYSICAL = new Set(['examine', 'take', 'use', 'enter_code', 'combine']);

export function buildPerception({ world, memory, tick, config }) {
  const events = memory.recentEvents(RECENT_EVENTS);
  const lines = ['## Tu situación'];

  const turns = SHOW_LIMIT ? ` Turno ${tick} de ${MAX_TICKS}: te quedan ${MAX_TICKS - tick}.` : ` Turno ${tick}.`;
  lines.push(`Estás encerrada en el archivo.${turns}`);
  if (SHOW_LIMIT && MAX_TICKS - tick <= 20) lines.push('¡Queda poco tiempo! Céntrate en lo que te acerca a la salida.');

  const inv = world.inventory();
  lines.push(`Inventario: ${inv.length ? inv.map((id) => `${id} (${ITEMS[id].label})`).join(', ') : 'vacío'}.`);

  lines.push('', '## Lo que ves (ordenado por distancia)');
  for (const { fixture: f, distance } of world.fixturesByDistance()) {
    const tags = [distance <= REACH ? 'AL ALCANCE' : 'lejos', world.examined.has(f.id) ? 'examinado' : 'SIN EXAMINAR'];
    if (f.lock) {
      const l = world.locks[f.lock];
      const blocked = !l.open && l.blockedUntil > tick ? ` · bloqueado ${l.blockedUntil - tick} turno(s)` : '';
      tags.push(l.open ? 'ABIERTO' : `cerradura de ${LOCKS[f.lock].digits} dígitos${blocked}`);
    }
    if (f.id === 'puerta') tags.push(world.locks.puerta.open ? 'ABIERTA' : world.cardInserted ? 'tarjeta insertada, teclado encendido' : 'teclado apagado');
    const visible = f.lock || f.container ? world.itemsIn(f.id) : [];
    if (visible.length) tags.push(`dentro: ${visible.join(', ')}`);
    lines.push(`- ${f.id} · ${fmt(distance)} m · ${tags.join(' · ')} — ${f.short}`);
  }

  lines.push('', ...progressSection(world));
  // Las notas sobre cerraduras ya abiertas se marcan como resueltas para que no vuelva a ellas
  const solved = (note) => {
    const open = note.tags.filter((id) => LOCKS[id] && world.locks[id].open);
    return open.length ? ` [YA RESUELTO: ${open.join(', ')} abierto]` : '';
  };
  lines.push('', ...notesSection(memory.relevantNotes(config.memoryWindow), solved));

  // El resultado del último descubrimiento se muestra completo
  const lastReveal = events.findLast((e) => REVEALING.has(e.type) && e.ok && e.result);
  lines.push('', ...actionsSection(events, { showFull: (e) => e === lastReveal, emptyText: '(ninguna: acabas de despertar aquí dentro)' }));

  lines.push(...rememberNudge(lastReveal, events, `descubrir algo con ${lastReveal?.type}`));
  lines.push(...thinkOnlyNudge(events));
  lines.push(...repetitionNudge(memory.recentEvents(REPEAT_WINDOW * 2), world));
  lines.push('', 'Decide tu siguiente paso y llama a una herramienta.');
  return lines.join('\n');
}

/** Resumen de lo conseguido y lo probado, para que no repita lo que ya hizo. */
function progressSection(world) {
  const lines = ['## Progreso'];
  const open = [];
  const pending = [];
  for (const [id, lock] of Object.entries(LOCKS)) {
    if (world.locks[id].open) {
      const left = id === 'puerta' ? [] : world.itemsIn(id);
      open.push(`${id} (${left.length ? `queda dentro: ${left.join(', ')}` : 'ya vacío'})`);
    } else {
      const extra = id === 'puerta' && !world.cardInserted ? ', teclado apagado' : '';
      const tried = world.locks[id].tried?.length ? `; ya probaste sin éxito: ${world.locks[id].tried.join(', ')}` : '';
      pending.push(`${id} (${lock.digits} dígitos${extra}${tried})`);
    }
  }
  lines.push(`- Cerraduras abiertas: ${open.length ? `${open.join(', ')}. No vuelvas a meter códigos en ellas` : 'ninguna'}.`);
  lines.push(`- Cerraduras pendientes: ${pending.length ? pending.join(', ') : 'ninguna'}.`);

  const tried = Object.entries(world.usedOn).map(
    ([item, targets]) => `${item} → ${Object.entries(targets).map(([t, r]) => `${t} (${r})`).join(', ')}`,
  );
  if (tried.length) lines.push(`- Objetos usados y dónde: ${tried.join('; ')}.`);
  const neverUsed = world.inventory().filter((id) => !world.usedOn[id] && !id.startsWith('nota'));
  if (neverUsed.length) lines.push(`- En tu inventario sin usar todavía: ${neverUsed.join(', ')}.`);

  const seen = Object.entries(world.examineCount).map(([id, n]) => (n > 1 ? `${id} ×${n}` : id));
  const unseen = FIXTURE_IDS.filter((id) => !world.examined.has(id));
  lines.push(`- Ya examinado: ${seen.length ? seen.join(', ') : 'nada'}. Volver a examinar algo no revela nada nuevo salvo que haya cambiado.`);
  if (unseen.length) lines.push(`- Sin examinar todavía: ${unseen.join(', ')}.`);
  return lines;
}

/** Si repite la misma acción sobre lo mismo, se le avisa y se le sugiere cambiar de enfoque. */
function repetitionNudge(events, world) {
  const physical = events.filter((e) => PHYSICAL.has(e.type)).slice(-REPEAT_WINDOW);
  const counts = new Map();
  for (const e of physical) {
    const target = e.args?.object_id ?? e.args?.target_id ?? e.args?.item_id ?? '';
    const key = `${e.type}(${target})`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = [...counts].filter(([, n]) => n >= 2).map(([k, n]) => `${k} ×${n}`);
  if (!repeated.length) return [];
  // Cuando se atasca: dónde no ha probado todavía cada objeto de su inventario (pista genérica, no la solución)
  const untried = world
    .inventory()
    .filter((id) => !id.startsWith('nota'))
    .map((id) => {
      const pending = FIXTURE_IDS.filter((f) => !world.usedOn[id]?.[f]);
      return pending.length ? `${id} aún no probado en: ${pending.join(', ')}` : null;
    })
    .filter(Boolean);
  return [
    '',
    `⚠ Estás repitiendo acciones: ${repeated.join(', ')}. Lo que ya sabes no va a cambiar. Cambia de enfoque: prueba los objetos de tu inventario sobre cosas donde aún no los has usado, examina lo que te falta o combina lo que llevas.`,
    ...untried.map((u) => `  · ${u}.`),
  ];
}
