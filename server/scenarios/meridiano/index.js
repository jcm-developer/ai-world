// Escenario 1 · Sala Meridiano: exploración libre.
// Una IA curiosa recorre una sala con siete objetos que esconden una pequeña historia.
// No tiene objetivo ni final: su memoria se conserva entre sesiones.

import { mockDecide } from './mock.js';
import { buildPerception } from './perception.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { executeTool, TOOL_DEFS } from './tools.js';
import { OBJECT_IDS, World } from './world.js';

export default {
  id: 'meridiano',
  title: 'Sala Meridiano',
  hasEnding: false,
  agents: [
    {
      id: 'main',
      name: 'Explorador',
      color: '#8cb8ff',
      voice: 'marin',
      instructions: 'Habla en español de España, en voz baja y serena, con curiosidad tranquila, como quien piensa en voz alta en un museo vacío.',
    },
  ],
  memoryTags: OBJECT_IDS, // ids que se indexan en las notas para recuperarlas por relevancia
  freeTools: new Set(['think', 'remember']), // pensar y anotar no gastan la acción del turno

  createWorld: (saved) => new World(saved, ['main']),
  systemPrompt: () => SYSTEM_PROMPT,
  tools: () => TOOL_DEFS,
  perceive: buildPerception,
  execute: executeTool,
  mockDecide,

  /** Cifras que muestra el panel lateral. */
  stats: (world, agents) => [
    { label: 'explorado', value: `${world.inspected.size}/${OBJECT_IDS.length}` },
    { label: 'conexiones', value: world.connections.length },
    { label: 'notas', value: agents[0].memory.noteCount },
    { label: 'tick', value: agents[0].memory.tick },
  ],
};
