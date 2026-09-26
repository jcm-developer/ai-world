// Vista 3D de la Sala Meridiano: sala, objetos flotantes y conexiones de luz.

import * as THREE from 'three';
import { roomWalls } from '../../engine/collision.js';
import { createLinks } from '../../engine/links.js';
import { createObjects } from './objects.js';
import { createRoom } from './room.js';

/** Cámara y niebla de este escenario. */
export const stageOptions = {
  camera: { position: [0, 6.8, 15.5], target: [0, 1.5, -1] },
  // Punto de inicio en primera persona
  fpsStart: { position: [-5.5, 1.65, 8.8], lookAt: [0, 1.5, -2] },
  fogDensity: 0.026,
};

export function mount({ scene, renderer, agents }) {
  let room = null;
  let walls = [];
  const objects = createObjects(scene);
  const links = createLinks(scene, (id) => objects.getPosition(id));
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  return {
    /** Estado completo del mundo (al entrar o al reiniciar la partida). */
    init(world) {
      if (!room) room = createRoom(scene, renderer, world.room);
      walls = roomWalls(world.room.width, world.room.depth);
      objects.build(world.objects, world.room.height);
      links.setAll(world.connections);
    },

    /** Posiciones de los avatares: resalta el objeto al que se dirige alguno. */
    onAgentsPos(list) {
      objects.setTarget(list.find((a) => a.walking)?.targetObject ?? null);
    },

    onAction(action) {
      if (!action.ok) return;
      const data = action.data ?? {};
      const agent = agents.get(action.agentId);

      switch (action.type) {
        case 'move_to':
          objects.setTarget(data.objectId);
          break;
        case 'inspect':
          objects.reveal(data.objectId, data.object);
          agent?.avatar.pulse(1);
          if (agent && objects.getPosition(data.objectId, to)) links.beam(agent.avatar.chestPosition(from), to);
          break;
        case 'connect':
          links.add(data.a, data.b, data.reason, true);
          agent?.avatar.pulse(0.7);
          break;
        case 'remember':
          agent?.avatar.pulse(0.4);
          break;
      }
    },

    /** Obstáculos para la cámara en primera persona. */
    colliders() {
      return [...walls, ...objects.colliders()];
    },

    update(dt, t) {
      room?.update(dt, t);
      objects.update(dt, t);
      links.update(dt, t);
    },
  };
}
