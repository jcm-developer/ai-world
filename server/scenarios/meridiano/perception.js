// Percepción en la Sala Meridiano: convierte el estado de la sala y la memoria del agente
// en un texto breve. El contexto se mantiene pequeño y constante: lo cercano,
// las notas relevantes y las últimas acciones.

import { actionsSection, fmt, notesSection, rememberNudge, thinkOnlyNudge } from '../common/perception.js';
import { INSPECT_RADIUS } from './world.js';

const RECENT_EVENTS = 5;

export function buildPerception({ world, memory, agentId, tick, config }) {
  const nearby = world.objectsByDistance(agentId);
  const events = memory.recentEvents(RECENT_EVENTS);
  const { inspected, connections } = world;
  const total = nearby.length;
  const a = world.agent(agentId);

  const lines = ['## Tu estado'];
  lines.push(
    `Tick ${tick}. Estás en (${fmt(a.x)}, ${fmt(a.z)}). Has inspeccionado ${inspected.size} de ${total} objetos y creado ${connections.length} conexiones.`,
  );
  if (inspected.size === total) {
    lines.push('Ya conoces todos los objetos: dedica tus turnos a relacionarlos, contrastar hipótesis y sacar conclusiones.');
  }

  lines.push('', '## Lo que percibes (ordenado por distancia)');
  for (const { object: o, distance } of nearby) {
    const tags = [distance <= INSPECT_RADIUS ? 'AL ALCANCE' : 'lejos', inspected.has(o.id) ? 'inspeccionado' : 'SIN INSPECCIONAR'];
    lines.push(`- ${o.id} · ${o.type} · ${fmt(distance)} m · ${tags.join(' · ')} — ${o.short}`);
  }

  if (connections.length) {
    lines.push('', '## Conexiones que ya has creado');
    for (const c of connections) lines.push(`- ${c.a} ↔ ${c.b}: ${c.reason}`);
  }

  // Memoria: notas recientes + notas antiguas sobre lo que tiene al alcance
  const focus = nearby.filter((n) => n.distance <= INSPECT_RADIUS).map((n) => n.object.id);
  lines.push('', ...notesSection(memory.relevantNotes(config.memoryWindow, focus)));

  // El contenido de la inspección más reciente se muestra completo
  const lastInspect = events.findLast((e) => e.type === 'inspect' && e.ok);
  lines.push('', ...actionsSection(events, { showFull: (e) => e === lastInspect, emptyText: '(ninguna: acabas de despertar en esta sala)' }));

  lines.push(...rememberNudge(lastInspect, events, `inspeccionar ${lastInspect?.args.object_id}`));
  lines.push(...thinkOnlyNudge(events));
  lines.push('', 'Decide tu siguiente paso y llama a una herramienta.');
  return lines.join('\n');
}
