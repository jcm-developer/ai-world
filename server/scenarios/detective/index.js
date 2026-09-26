// Escenario 3 · Detective «La noche del 13»: una IA detective interroga a cuatro sospechosos,
// cada uno con su propia IA, sus secretos y su voz, y debe acusar al culpable.

import { mockDecide } from './mock.js';
import { buildPerception } from './perception.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { SUSPECTS, SUSPECT_IDS } from './suspects.js';
import { executeTool, TOOL_DEFS } from './tools.js';
import { DetectiveWorld, EVIDENCE_IDS, MAX_TICKS } from './world.js';

export default {
  id: 'detective',
  title: 'La noche del 13',
  hasEnding: true,
  agents: [
    {
      id: 'main',
      name: 'Detective',
      color: '#e6ecf5',
      voice: 'cedar',
      instructions: 'Habla en español de España como una detective serena y analítica: voz grave, pausada, educada pero firme.',
    },
  ],
  // Personajes no autónomos: solo hablan cuando el detective les pregunta.
  // Al navegador solo llegan estos campos públicos (nunca su personalidad ni sus secretos).
  npcs: SUSPECTS.map(({ id, name, title, color, voice, instructions }) => ({ id, name, title, color, voice, instructions })),
  memoryTags: [...EVIDENCE_IDS, ...SUSPECT_IDS],
  memoryWindow: 30,
  freeTools: new Set(['think', 'remember']),

  createWorld: (saved) => new DetectiveWorld(saved),
  systemPrompt: () => SYSTEM_PROMPT,
  tools: () => TOOL_DEFS,
  perceive: buildPerception,
  execute: executeTool,
  mockDecide,

  stats: (world, agents) => [
    { label: 'turno', value: `${agents[0].memory.tick}/${MAX_TICKS}` },
    { label: 'pruebas', value: `${world.examined.size}/${EVIDENCE_IDS.length}` },
    { label: 'preguntas', value: Object.values(world.conversations).reduce((n, c) => n + c.length, 0) },
    { label: 'notas', value: agents[0].memory.noteCount },
  ],

  checkFinish(world, agents) {
    const a = world.accused;
    if (a) {
      const name = SUSPECTS.find((s) => s.id === a.suspect)?.name ?? a.suspect;
      return a.correct
        ? { outcome: 'Caso resuelto', summary: `Acusó a ${name} en el turno ${a.tick}. «${a.reasoning}»` }
        : { outcome: 'Acusación errónea', summary: `Acusó a ${name} en el turno ${a.tick}, pero no era el culpable. «${a.reasoning}»` };
    }
    if (agents[0].memory.tick >= MAX_TICKS && !world.isBusy()) {
      return { outcome: 'Caso sin resolver', summary: `Agotó los ${MAX_TICKS} turnos sin acusar a nadie.` };
    }
    return null;
  },
};
