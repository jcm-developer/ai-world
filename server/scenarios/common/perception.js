// Piezas comunes para construir el texto de percepción de cualquier escenario:
// memoria relevante, últimas acciones y recordatorios de comportamiento.

const MAX_RESULT_CHARS = 220;

/** Número con una decimal y coma (formato español). */
export const fmt = (n) => n.toFixed(1).replace('.', ',');

export function truncate(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function indent(s, pad = '    ') {
  return s
    .split('\n')
    .map((l) => `${pad}${l}`)
    .join('\n');
}

/**
 * Sección "Tu memoria" con las notas relevantes.
 * annotate(note) puede añadir una marca a cada nota (p. ej. «[YA RESUELTO]»).
 */
export function notesSection(notes, annotate = () => '') {
  const lines = ['## Tu memoria (notas relevantes)'];
  if (notes.length) for (const n of notes) lines.push(`- [tick ${n.tick}] ${n.text}${annotate(n)}`);
  else lines.push('- (vacía: aún no has guardado ninguna nota)');
  return lines;
}

/**
 * Sección "Tus últimas acciones". El resultado completo solo se muestra en el evento
 * que indique showFull (p. ej. la última inspección); el resto, resumido.
 */
export function actionsSection(events, { showFull = () => false, emptyText = '(ninguna: acabas de despertar aquí)' } = {}) {
  const lines = ['## Tus últimas acciones'];
  if (!events.length) lines.push(`- ${emptyText}`);
  for (const e of events) {
    const args = Object.values(e.args ?? {}).map((v) => JSON.stringify(v)).join(', ');
    const status = e.ok ? 'ok' : 'ERROR';
    let text = `- tick ${e.tick} · ${e.type}(${truncate(args, 80)}) → ${status}: ${e.summary}`;
    if (showFull(e) && e.result) text += `\n  RESULTADO:\n${indent(e.result)}`;
    else if (e.result && e.type !== 'inspect') text += ` ${truncate(e.result, MAX_RESULT_CHARS)}`;
    lines.push(text);
  }
  return lines;
}

/** Si en el último turno solo pensó, se le pide que actúe (evita quedarse dando vueltas). */
export function thinkOnlyNudge(events) {
  const lastTick = events.at(-1)?.tick;
  const lastTurn = events.filter((e) => e.tick === lastTick);
  // Pensar, anotar o hablar no cuentan como acción: si solo hizo eso, se le pide que actúe
  return lastTurn.length && lastTurn.every((e) => ['think', 'remember', 'say'].includes(e.type))
    ? ['', 'En tu último turno no hiciste ninguna acción física (solo pensaste o anotaste). Ahora actúa: acompaña tu pensamiento de una acción física.']
    : [];
}

/** Si acaba de descubrir algo (evento `event`) y aún no ha usado remember, se le recuerda. */
export function rememberNudge(event, events, what) {
  if (!event) return [];
  const since = events.slice(events.indexOf(event) + 1);
  return since.some((e) => e.type === 'remember' && e.ok)
    ? []
    : ['', `Acabas de ${what}: guarda con remember lo esencial antes de seguir, o lo olvidarás.`];
}

/**
 * Sección "Presencia": visitantes humanos en la sala respecto a la posición y orientación
 * del agente (distancia, dirección y si le están mirando).
 * @param {Array<{x:number, z:number, heading:number, since:number}>} visitors
 * @param {{x:number, z:number, heading:number}} me
 * @param {{ lastSaidAt?: number, lastSaid?: string, canSpeak?: boolean, conversation?: Array<{from:string, text:string}> }} talk
 *   lo último que le dijo, si puede hablar ya y la conversación reciente con el visitante
 */
export function visitorsSection(visitors, me, { lastSaidAt = 0, lastSaid = '', canSpeak = true, conversation = [] } = {}) {
  if (!visitors.length) return [];
  const lines = ['## Presencia'];
  for (const v of visitors) {
    const dx = v.x - me.x;
    const dz = v.z - me.z;
    const dist = Math.hypot(dx, dz);
    // Delante = hacia donde mira el agente; derecha = su mano derecha
    const ahead = dx * Math.sin(me.heading) + dz * Math.cos(me.heading);
    const right = -dx * Math.cos(me.heading) + dz * Math.sin(me.heading);
    const angle = (Math.atan2(right, ahead) * 180) / Math.PI;
    const side = angle > 0 ? 'derecha' : 'izquierda';
    const abs = Math.abs(angle);
    const where =
      abs < 30 ? 'delante de ti' : abs < 70 ? `delante, a tu ${side}` : abs < 115 ? `a tu ${side}` : abs < 150 ? `detrás, a tu ${side}` : 'detrás de ti';
    // ¿Te está mirando? Ángulo entre su mirada y la dirección hacia ti
    const toMe = Math.atan2(-dx, -dz);
    let diff = Math.abs(toMe - v.heading) % (2 * Math.PI);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    const looking = diff < 0.45 ? ' Te está mirando.' : '';
    const near = dist < 1.5 ? ' Está muy cerca, casi a tu lado.' : '';
    const secs = Math.round((Date.now() - v.since) / 1000);
    const time = secs < 60 ? `hace ${secs} s` : `hace ${Math.round(secs / 60)} min`;
    lines.push(`Hay un visitante humano en la sala, a ${fmt(dist)} m, ${where}.${near}${looking} (Entró ${time}.)`);
  }
  const newest = Math.max(...visitors.map((v) => v.since));
  if (lastSaidAt < newest) {
    lines.push('Acaba de entrar alguien y aún no le has dicho nada: salúdale con say.');
  } else {
    const ago = Math.round((Date.now() - lastSaidAt) / 1000);
    lines.push(`Ya le saludaste; no vuelvas a saludar. Lo último que le dijiste (hace ${ago} s): «${lastSaid}».`);
    lines.push(canSpeak ? 'Si tienes algo nuevo que contarle (un descubrimiento, una duda, una hipótesis), puedes decírselo con say.' : 'Acabas de hablarle: ahora céntrate en lo tuyo.');
  }
  // Conversación reciente: lo que te ha dicho el visitante y lo que le has contestado
  if (conversation.some((c) => c.from === 'visitor')) {
    lines.push('', 'Conversación reciente con el visitante (de la más antigua a la más nueva):');
    for (const c of conversation) lines.push(`- ${c.from === 'visitor' ? 'Visitante' : 'Tú'}: «${c.text}»`);
  }
  return lines;
}
