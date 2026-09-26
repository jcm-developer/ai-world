// Vista 3D de «La noche del 13»: la sala y los paneles de pruebas de la Sala Meridiano,
// con el detective y los cuatro sospechosos como avatares holográficos.

import * as THREE from 'three';
import { roomWalls } from '../../engine/collision.js';
import { createLinks } from '../../engine/links.js';
import { createObjects } from '../meridiano/objects.js';
import { createRoom } from '../meridiano/room.js';

export const stageOptions = {
  camera: { position: [0, 7.5, 13.5], target: [0, 1.4, -1] },
  fpsStart: { position: [-2.5, 1.65, 6.2], lookAt: [0, 1.5, -1] },
  fogDensity: 0.024,
};

export function mount({ scene, renderer, agents }) {
  let room = null;
  let walls = [];
  const objects = createObjects(scene);
  const links = createLinks(scene, (id) => objects.getPosition(id) ?? agentHead(id));
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  function agentHead(id) {
    const a = agents.get(id);
    return a ? new THREE.Vector3(a.avatar.root.position.x, 1.5, a.avatar.root.position.z) : null;
  }

  return {
    init(world) {
      if (!room) room = createRoom(scene, renderer, world.room);
      walls = roomWalls(world.room.width, world.room.depth);
      objects.build(world.objects, world.room.height);
    },

    onAgentsPos(list) {
      const detective = list.find((a) => a.agentId === 'main');
      objects.setTarget(detective?.walking ? detective.targetObject : null);
    },

    onAction(action) {
      if (!action.ok) return;
      const data = action.data ?? {};
      const detective = agents.get(action.agentId);
      switch (action.type) {
        case 'move_to':
          objects.setTarget(data.target);
          break;
        case 'examine':
          objects.reveal(data.objectId, data.object);
          detective?.avatar.pulse(1);
          if (detective && objects.getPosition(data.objectId, to)) links.beam(detective.avatar.chestPosition(from), to);
          break;
        case 'ask': {
          // Haz tenue entre detective y sospechoso; si enseña una prueba, la prueba se ilumina
          const suspect = agents.get(data.suspect);
          suspect?.avatar.pulse(0.8);
          if (detective && suspect) links.beam(detective.avatar.chestPosition(from), suspect.avatar.chestPosition(to), 1.6, 0xffc9a3);
          if (data.evidence && detective && objects.getPosition(data.evidence, to)) links.beam(to, detective.avatar.chestPosition(from), 1.6);
          break;
        }
        case 'accuse':
          agents.get(data.suspect)?.avatar.pulse(1.5);
          detective?.avatar.pulse(1.5);
          break;
      }
    },

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
