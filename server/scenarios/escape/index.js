// Escenario 2 · El Archivo (escape room): la IA tiene un objetivo, salir, y un límite de turnos.

import { ITEM_IDS, FIXTURE_IDS, EscapeWorld, MAX_TICKS } from './world.js';
import { mockDecide } from './mock.js';
import { buildPerception } from './perception.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { executeTool, TOOL_DEFS } from './tools.js';

export default {
  id: 'escape',
  title: 'El Archivo',
  hasEnding: true,
  syncWorld: true, // el navegador recibe el estado del mundo tras cada turno
  agents: [
    {
      id: 'main',
      name: 'Prisionera',
      color: '#f0c674',
      voice: 'coral',
      instructions: 'Habla en español de España, concentrada y algo tensa pero bajo control, en voz baja, como quien razona deprisa encerrada en una sala.',
    },
  ],
  memoryTags: [...FIXTURE_IDS, ...ITEM_IDS],
  memoryWindow: 30, // las pistas son cortas y cruciales: se le pasan más notas que en la sala libre
  freeTools: new Set(['think', 'remember']), // pensar y anotar no gastan la acción del turno

  createWorld: (saved) => new EscapeWorld(saved),
  systemPrompt: () => SYSTEM_PROMPT,
  tools: () => TOOL_DEFS,
  perceive: buildPerception,
  execute: executeTool,
  mockDecide,

  stats: (world, agents) => [
    { label: 'turno', value: `${agents[0].memory.tick}/${MAX_TICKS}` },
    { label: 'cerraduras', value: `${world.openLocks}/3` },
    { label: 'inventario', value: world.inventory().length },
    { label: 'fallos', value: world.totalFails },
  ],

  /** La partida termina al salir por la puerta o al agotar los turnos. */
  checkFinish(world, agents) {
    const ticks = agents[0].memory.tick;
    if (world.escaped) {
      const fails = world.totalFails;
      return {
        outcome: 'Escapó',
        summary: `Salió del archivo en ${ticks} turnos con ${fails} ${fails === 1 ? 'código fallido' : 'códigos fallidos'}.`,
      };
    }
    if (ticks >= MAX_TICKS && !world.isBusy()) {
      return { outcome: 'Atrapada', summary: `Agotó los ${MAX_TICKS} turnos sin encontrar la salida (${world.openLocks}/3 cerraduras abiertas).` };
    }
    return null;
  },
};
