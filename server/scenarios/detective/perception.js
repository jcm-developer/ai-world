// Percepción del detective: turnos, pruebas y sospechosos por distancia, lo que ha declarado
// cada sospechoso, progreso, memoria y últimas acciones.

import { actionsSection, fmt, notesSection, rememberNudge, thinkOnlyNudge, truncate } from '../common/perception.js';
import { SUSPECTS } from './suspects.js';
import { EVIDENCE, MAX_TICKS, REACH, TALK_REACH } from './world.js';

const RECENT_EVENTS = 6;
const TESTIMONY_PER_SUSPECT = 3;

export function buildPerception({ world, memory, tick, config }) {
  const events = memory.recentEvents(RECENT_EVENTS);
  const left = MAX_TICKS - tick;
  const lines = ['## Tu situación', `Turno ${tick} de ${MAX_TICKS}: te quedan ${left}. Solo puedes acusar una vez.`];
  if (left <= 20) lines.push('Te quedan pocos turnos: si ya tienes una conclusión apoyada en pruebas, acusa.');

  lines.push('', '## Pruebas en la sala (por distancia)');
  const evidence = EVIDENCE.map((e) => ({ e, d: world.distanceTo(e.id) })).sort((a, b) => a.d - b.d);
  for (const { e, d } of evidence) {
    const tags = [d <= REACH ? 'AL ALCANCE' : 'lejos', world.examined.has(e.id) ? 'examinada' : 'SIN EXAMINAR'];
    lines.push(`- ${e.id} · ${fmt(d)} m · ${tags.join(' · ')} — ${e.short}`);
  }

  lines.push('', '## Sospechosos');
  for (const s of SUSPECTS) {
    const d = world.distanceTo(s.id);
    const talks = world.conversations[s.id]?.length ?? 0;
    lines.push(`- ${s.id} · ${s.name}, ${s.title} · ${fmt(d)} m · ${d <= TALK_REACH ? 'AL ALCANCE para hablar' : 'lejos'} · interrogado ${talks} ${talks === 1 ? 'vez' : 'veces'}`);
  }

  // Lo que ha dicho cada uno (lo más reciente), para poder cruzar testimonios
  const testimonies = SUSPECTS.filter((s) => world.conversations[s.id]?.length);
  if (testimonies.length) {
    lines.push('', '## Lo que te han dicho (últimas respuestas)');
    for (const s of testimonies) {
      for (const h of world.conversations[s.id].slice(-TESTIMONY_PER_SUSPECT)) {
        const shown = h.evidence ? ` [le enseñaste: ${h.evidence}]` : '';
        lines.push(`- ${s.id} (turno ${h.tick}) · P: ${truncate(h.q, 120)}${shown} → R: «${truncate(h.a, 260)}»`);
      }
    }
  }

  lines.push('', ...notesSection(memory.relevantNotes(config.memoryWindow)));

  const lastReveal = events.findLast((e) => ['examine', 'ask'].includes(e.type) && e.ok && e.result);
  lines.push('', ...actionsSection(events, { showFull: (e) => e === lastReveal, emptyText: '(ninguna: acabas de llegar a la sala)' }));

  lines.push(...rememberNudge(lastReveal, events, lastReveal?.type === 'ask' ? 'recibir una declaración' : 'examinar una prueba'));
  lines.push(...thinkOnlyNudge(events));
  lines.push('', 'Decide tu siguiente paso y llama a una herramienta.');
  return lines.join('\n');
}
