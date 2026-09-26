// Piezas comunes a todos los escenarios: helpers de definición y las herramientas
// que comparte cualquier agente (pensar en voz alta y recordar).

const LIMITS = { thought: 280, note: 400 };

/** Define una herramienta en formato OpenAI (todos los parámetros obligatorios). */
export function fn(name, description, properties) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
    },
  };
}

export const fail = (summary) => ({ ok: false, summary });
const str = (v) => (typeof v === 'string' ? v : '');

/** think(thought): pensamiento breve que se muestra en el mundo. No consume la acción del turno. */
export const thinkTool = {
  definition: fn('think', 'Expresa un razonamiento breve que se mostrará en el mundo junto a ti.', {
    thought: { type: 'string', description: 'Tu pensamiento, una o dos frases.' },
  }),
  handler(args) {
    const thought = str(args.thought).trim();
    if (!thought) return fail('El pensamiento está vacío.');
    const text = thought.length > LIMITS.thought ? `${thought.slice(0, LIMITS.thought - 1)}…` : thought;
    return { ok: true, summary: 'Pensamiento expresado.', data: { thought: text } };
  },
};

/** remember(note): guarda una nota en la memoria persistente del agente. */
export const rememberTool = {
  definition: fn('remember', 'Guarda una nota en tu memoria persistente.', {
    note: { type: 'string', description: 'Lo que quieres recordar, concreto y breve.' },
  }),
  handler(args, { memory, tick }) {
    // Algunos modelos copian el formato de su percepción ("[tick 8] ..."): se quita el prefijo.
    const note = str(args.note).replace(/^\s*\[tick \d+\]\s*/i, '').trim();
    if (!note) return fail('La nota está vacía.');
    if (note.length > LIMITS.note) return fail(`La nota es demasiado larga (máximo ${LIMITS.note} caracteres).`);
    if (!memory.addNote(note, tick)) return fail('Ya tenías exactamente esa nota guardada.');
    return { ok: true, summary: 'Nota guardada en memoria.', data: { note } };
  },
};

/**
 * say(message): la IA habla en voz alta a un visitante humano presente en la sala.
 * Solo se ofrece al modelo mientras hay alguien; no consume la acción del turno.
 */
export const sayTool = {
  definition: fn('say', 'Dile algo en voz alta, breve, al visitante humano que está en la sala contigo.', {
    message: { type: 'string', description: 'Lo que le dices (una o dos frases).' },
  }),
  handler(args, { visitors }) {
    const message = str(args.message).trim();
    if (!visitors?.length) return fail('No hay nadie en la sala a quien hablar.');
    if (!message) return fail('No has dicho nada.');
    const text = message.length > 220 ? `${message.slice(0, 219)}…` : message;
    return { ok: true, summary: 'Hablas al visitante.', data: { message: text }, memoryChanged: false };
  },
};
