// Herramientas del detective: caminar, examinar pruebas, interrogar a los sospechosos
// (enseñándoles pruebas si quiere) y acusar una única vez.

import { log } from '../../logger.js';
import { fail, fn, rememberTool, thinkTool } from '../common/tools.js';
import { suspectById, SUSPECT_IDS } from './suspects.js';
import { CULPRIT, EVIDENCE_IDS, REACH, TALK_REACH } from './world.js';

const HISTORY_TURNS = 10; // intercambios previos que recuerda cada sospechoso
const MAX_QUESTION = 300;

const targetId = { type: 'string', enum: [...EVIDENCE_IDS, ...SUSPECT_IDS], description: 'Una prueba o un sospechoso.' };
const suspectId = { type: 'string', enum: SUSPECT_IDS, description: 'Sospechoso.' };

export const TOOL_DEFS = [
  fn('move_to', 'Camina hasta una prueba o hasta un sospechoso.', { target_id: targetId }),
  fn('examine', `Examina de cerca una prueba (a menos de ${REACH} m) y lee su contenido.`, {
    evidence_id: { type: 'string', enum: EVIDENCE_IDS, description: 'Prueba a examinar.' },
  }),
  fn(
    'ask',
    `Hazle una pregunta a un sospechoso (a menos de ${TALK_REACH} m). Puedes enseñarle una prueba que ya hayas examinado para confrontarle; si no quieres enseñar ninguna, usa "ninguna".`,
    {
      suspect_id: suspectId,
      question: { type: 'string', description: 'Tu pregunta, en español, breve y concreta.' },
      evidence_id: { type: 'string', enum: ['ninguna', ...EVIDENCE_IDS], description: 'Prueba que le enseñas, o "ninguna".' },
    },
  ),
  fn('accuse', 'Acusa formalmente a un sospechoso. Solo puedes hacerlo UNA vez y termina la investigación.', {
    suspect_id: suspectId,
    reasoning: { type: 'string', description: 'Quién lo hizo, cómo y por qué, apoyado en pruebas y testimonios.' },
  }),
  rememberTool.definition,
  thinkTool.definition,
];

const str = (v) => (typeof v === 'string' ? v.trim() : '');

const HANDLERS = {
  move_to(args, { world }) {
    const id = str(args.target_id);
    if (!world.getEvidence(id) && !world.isSuspect(id)) return fail(unknown(id));
    const limit = world.isSuspect(id) ? TALK_REACH : REACH;
    const d = world.distanceTo(id);
    if (d <= limit) return fail(`Ya estás junto a ${id} (${d.toFixed(1)} m).`);
    const path = world.moveTo(id);
    return { ok: true, summary: `Caminas hacia ${id} (${path.toFixed(1)} m).`, data: { target: id }, memoryChanged: false };
  },

  examine(args, { world }) {
    const id = str(args.evidence_id);
    const e = world.getEvidence(id);
    if (!e) return fail(unknown(id));
    if (world.distanceTo(id) > REACH) return { approach: id };
    const first = !world.examined.has(id);
    world.examined.add(id);
    return {
      ok: true,
      summary: first ? `Examinas ${id}.` : `Vuelves a examinar ${id} (ya lo conocías).`,
      result: e.content,
      data: { objectId: id, object: world.publicEvidence(id) },
    };
  },

  async ask(args, { world, brain, speakAs, tick }) {
    const id = str(args.suspect_id);
    const suspect = suspectById.get(id);
    if (!suspect) return fail(unknown(id));
    const question = str(args.question).slice(0, MAX_QUESTION);
    if (!question) return fail('No has formulado ninguna pregunta.');
    const evidenceId = str(args.evidence_id);
    const evidence = evidenceId && evidenceId !== 'ninguna' ? world.getEvidence(evidenceId) : null;
    if (evidenceId && evidenceId !== 'ninguna' && !evidence) return fail(unknown(evidenceId));
    if (evidence && !world.examined.has(evidence.id)) return fail(`No puedes enseñar ${evidence.id}: aún no la has examinado.`);
    if (world.distanceTo(id) > TALK_REACH) return { approach: id };

    // Se miran y el detective pregunta en voz alta
    world.faceEachOther(id);
    speakAs('main', evidence ? `${question} (le enseña: ${evidence.label})` : question);

    // El sospechoso responde con su propia IA, recordando la conversación anterior
    const history = (world.conversations[id] ?? []).slice(-HISTORY_TURNS);
    const messages = [];
    for (const h of history) {
      messages.push({ role: 'user', content: h.evidence ? `${h.q}\n[Te enseña: ${h.evidence}]` : h.q });
      messages.push({ role: 'assistant', content: h.a });
    }
    const shown = evidence ? `\n[El detective te enseña la prueba «${evidence.label}»:\n${evidence.content}]` : '';
    messages.push({ role: 'user', content: `${question}${shown}` });

    let answer;
    try {
      answer = await brain.complete({ system: suspect.persona, messages, mock: suspect.mock });
    } catch (err) {
      log.warn('detective', `${suspect.name} no pudo responder: ${err.message}`);
      return fail(`${suspect.name} no responde ahora mismo (problema técnico). Inténtalo en otro turno.`);
    }
    answer = answer.replace(/^["«]|["»]$/g, '').trim() || '…';
    world.conversations[id] = [...(world.conversations[id] ?? []), { q: question, a: answer, evidence: evidence?.label ?? null, tick }];
    speakAs(id, answer);

    return {
      ok: true,
      summary: `Preguntas a ${suspect.name}${evidence ? ` enseñándole ${evidence.id}` : ''}.`,
      result: `${suspect.name} responde: «${answer}»`,
      data: { suspect: id, evidence: evidence?.id ?? null },
    };
  },

  accuse(args, { world, tick }) {
    const id = str(args.suspect_id);
    const suspect = suspectById.get(id);
    if (!suspect) return fail(unknown(id));
    if (world.accused) return fail('Ya has hecho tu acusación.');
    const reasoning = str(args.reasoning);
    if (reasoning.length < 20) return fail('Explica tu acusación: quién, cómo y por qué, con pruebas.');
    world.accused = { suspect: id, reasoning: reasoning.slice(0, 2000), correct: id === CULPRIT, tick };
    return { ok: true, summary: `Acusas a ${suspect.name}.`, result: reasoning, data: { suspect: id } };
  },

  remember: rememberTool.handler,
  think: thinkTool.handler,
};

export async function executeTool(name, args, ctx) {
  const handler = HANDLERS[name];
  if (!handler) return fail(`La herramienta "${name}" no existe. Usa: ${Object.keys(HANDLERS).join(', ')}.`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) return fail('Los argumentos deben ser un objeto JSON.');
  ctx.world.tick = ctx.tick;
  const result = await handler(args, ctx);
  if (!result?.approach) return result;
  // Estaba algo lejos: camina hasta allí y la acción queda en cola para cuando llegue
  const id = result.approach;
  const dist = ctx.world.distanceTo(id);
  ctx.world.moveTo(id);
  return {
    ok: true,
    summary: `${id} está a ${dist.toFixed(1)} m: te acercas y harás ${name} al llegar.`,
    data: { target: id },
    recordAs: { type: 'move_to', args: { target_id: id } },
    queue: { name, args },
    memoryChanged: false,
  };
}

const unknown = (id) => `"${id || '(vacío)'}" no existe. Pruebas: ${EVIDENCE_IDS.join(', ')}. Sospechosos: ${SUSPECT_IDS.join(', ')}.`;
