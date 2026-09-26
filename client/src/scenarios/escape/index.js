// Vista 3D de El Archivo (escape room): sala, mobiliario con estado, efectos de las acciones
// (haz UV, destellos en las cerraduras, puerta que se abre) e inventario en pantalla.

import * as THREE from 'three';
import { box, circle, roomWalls } from '../../engine/collision.js';
import { createLinks } from '../../engine/links.js';
import { createInventoryHud } from './hud.js';
import { createProps } from './props.js';
import { createRoom, DOOR } from './room.js';

// Huella en el suelo de cada mueble: [semiancho, semifondo] o { r } para los redondos
const FOOTPRINT = {
  desk: [0.82, 0.4],
  shelf: [0.77, 0.2],
  safe: [0.42, 0.37],
  terminal: [0.47, 0.32],
  armchair: [0.5, 0.42],
  bin: { r: 0.26 },
  plant: { r: 0.3 },
};

export const stageOptions = {
  camera: { position: [0.5, 8.2, 10.8], target: [0, 0.9, -0.8] },
  fpsStart: { position: [0.6, 1.65, 4.3], lookAt: [0, 1.3, -3] },
  fogDensity: 0.018,
  exposure: 1.0,
  environment: { hdri: 'empty_warehouse_01', intensity: 0.35 },
  ao: { radius: 0.5, intensity: 1 },
};

export function mount({ scene, renderer, stage, agents, sfx }) {
  let room = null;
  let props = null;
  let staticColliders = [];
  let doorOpen = false;
  let doorWasOpen = null; // para sonar solo cuando la puerta pasa de cerrada a abierta
  const hud = createInventoryHud();
  const links = createLinks(scene, (id) => props?.anchor(id) ?? null);
  const halo = createTargetHalo(scene);

  // Luz violeta temporal al usar la linterna UV
  const uvLight = new THREE.PointLight(0xa56bff, 0, 4, 1.5);
  scene.add(uvLight);
  let uvLightT = 0;

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  function setTarget(id) {
    const p = id && props?.anchor(id, to);
    halo.show(p ? new THREE.Vector3(p.x, 0, p.z) : null);
  }

  return {
    init(world) {
      if (!room) room = createRoom(scene, renderer, world.room, stage.shadowMapSize);
      if (!props) props = createProps(scene, world, stage.shadowMapSize);
      staticColliders = buildColliders(world);
      this.onWorldUpdate(world);
    },

    onWorldUpdate(world) {
      if (doorWasOpen === false && world.doorOpen) sfx?.('door');
      doorWasOpen = world.doorOpen;
      doorOpen = world.doorOpen;
      props.apply(world);
      hud.set(world.inventory);
    },

    onAgentsPos(list) {
      const walking = list.find((a) => a.walking);
      setTarget(walking && walking.targetObject !== 'salida' ? walking.targetObject : null);
    },

    onAction(action) {
      const data = action.data ?? {};
      const agent = agents.get(action.agentId);
      if (action.type === 'enter_code' && data.lock) props.flash(data.lock, Boolean(data.opened));
      if (!action.ok) return;

      switch (action.type) {
        case 'move_to':
          setTarget(data.target);
          break;
        case 'examine':
          agent?.avatar.pulse(0.8);
          if (agent && props.anchor(data.target, to)) links.beam(agent.avatar.chestPosition(from), to, 1.2);
          break;
        case 'use':
          agent?.avatar.pulse(1);
          if (data.effect?.startsWith('uv') && agent && props.anchor(data.target, to)) {
            links.beam(agent.avatar.chestPosition(from), to, 2.4, 0xb27dff);
            uvLight.position.copy(to).add(new THREE.Vector3(0, 0.3, 0));
            uvLightT = 2.4;
          }
          break;
        case 'take':
        case 'combine':
        case 'remember':
          agent?.avatar.pulse(0.5);
          break;
      }
    },

    /** Obstáculos para la primera persona (la puerta deja de bloquear al abrirse). */
    colliders() {
      return doorOpen ? staticColliders : [...staticColliders, box(DOOR.x, -5, DOOR.width / 2, 0.12)];
    },

    update(dt, t) {
      props?.update(dt, t);
      links.update(dt, t);
      halo.update(dt, t);
      room?.setExitLight(props?.doorOpenAmount() ?? 0);
      uvLightT = Math.max(0, uvLightT - dt);
      uvLight.intensity = uvLightT > 0 ? 3 * Math.min(1, uvLightT) : 0;
    },
  };
}

/** Paredes (con hueco para la puerta), pasillo y muebles. */
function buildColliders(world) {
  const { width: W, depth: D } = world.room;
  const list = roomWalls(W, D, { backGaps: [{ x: DOOR.x, width: DOOR.width }] });
  // Pasillo detrás de la puerta
  const cw = DOOR.width / 2 + 0.2;
  list.push(box(DOOR.x - cw - 0.25, -D / 2 - 1.6, 0.25, 1.7), box(DOOR.x + cw + 0.25, -D / 2 - 1.6, 0.25, 1.7), box(DOOR.x, -D / 2 - 3.25, cw + 0.5, 0.25));
  for (const f of world.fixtures) {
    const fp = FOOTPRINT[f.kind];
    if (!fp) continue;
    list.push(fp.r ? circle(f.position.x, f.position.z, fp.r) : box(f.position.x, f.position.z, fp[0], fp[1], f.face));
  }
  return list;
}

/** Halo en el suelo bajo el objeto al que se dirige la IA. */
function createTargetHalo(scene) {
  const matHalo = new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.03, 0.0, abs(d - 0.8 - 0.05 * sin(uTime * 2.5)));
        float disc = smoothstep(1.0, 0.0, d) * 0.12;
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.5), (ring * 0.5 + disc) * uAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), matHalo);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.renderOrder = 4;
  scene.add(mesh);
  let visible = false;
  return {
    show(pos) {
      visible = Boolean(pos);
      if (pos) mesh.position.set(pos.x, 0.012, pos.z);
    },
    update(dt, t) {
      matHalo.uniforms.uTime.value = t;
      const a = matHalo.uniforms.uAlpha;
      a.value += ((visible ? 1 : 0) - a.value) * (1 - Math.exp(-dt * 4));
    },
  };
}
