// Gestor de agentes en la escena: un avatar holográfico (con su color) y sus pensamientos
// flotantes por cada agente de la sesión.

import { createAvatar } from './avatar.js';
import { createThoughts } from './thoughts.js';

export function createAgents(scene) {
  const agents = new Map(); // id → { def, avatar, thoughts }

  /** Sincroniza los avatares con la lista de agentes recibida del servidor. */
  function sync(defs) {
    const ids = new Set(defs.map((d) => d.id));
    for (const [id, a] of agents) {
      if (!ids.has(id)) {
        a.avatar.dispose();
        agents.delete(id);
      }
    }
    for (const def of defs) {
      let a = agents.get(def.id);
      if (!a) {
        const avatar = createAvatar(scene, { color: def.color });
        a = { def, avatar, thoughts: createThoughts(avatar.thoughtAnchor) };
        agents.set(def.id, a);
      }
      a.def = def;
      if (def.state) a.avatar.setState(def.state, true);
      if (def.lastThought) a.thoughts.restore(def.lastThought.text);
      else a.thoughts.clear();
    }
  }

  return {
    sync,
    get: (id) => agents.get(id),
    all: () => [...agents.values()],
    setState(id, state) {
      agents.get(id)?.avatar.setState(state);
    },
    update(dt, t) {
      for (const a of agents.values()) a.avatar.update(dt, t);
    },
  };
}
