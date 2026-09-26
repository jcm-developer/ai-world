// Vista 3D de «La noche del 13»: la oficina técnica con cada sospechoso en su puesto,
// las pruebas como objetos físicos y tarjetas holográficas con lo que el detective va leyendo.

import * as THREE from 'three';
import { roomWalls } from '../../engine/collision.js';
import { createLinks } from '../../engine/links.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { renderContent } from '../meridiano/contentTextures.js';
import { createOffice } from './office.js';

export const stageOptions = {
  camera: { position: [0.5, 9.5, 12.5], target: [0, 0.8, -1.2] },
  fpsStart: { position: [-1.5, 1.65, 6.2], lookAt: [0, 1.2, -3] },
  fogDensity: 0.012,
};

const CARD_W = 1.25;
const CARD_H = 0.82;
const CARD_SHOW_S = 14; // segundos visible tras examinar la prueba
const CARD_NEAR_M = 3; // en primera persona, se muestra al acercarte

export function mount({ scene, renderer, stage, agents }) {
  let office = null;
  let walls = [];
  let targetId = null;
  const labels = new Map(); // prueba → elemento de etiqueta
  const cards = new Map(); // prueba → { group, mat, showUntil }
  const decorated = new Set(); // sospechosos a los que ya se les dio nombre y objetos
  const links = createLinks(scene, (id) => office?.evidencePosition(id) ?? null);
  const halo = createHalo(scene);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  void renderer;

  /** Etiqueta con el nombre y el cargo sobre cada sospechoso, y el objeto que tiene en la mano. */
  function decorateSuspects() {
    for (const a of agents.all()) {
      if (a.def.role !== 'npc' || decorated.has(a.def.id)) continue;
      decorated.add(a.def.id);
      const el = document.createElement('div');
      el.className = 'npc-label';
      el.innerHTML = '<span class="npc-name"></span><span class="npc-title"></span>';
      el.querySelector('.npc-name').textContent = a.def.name;
      el.querySelector('.npc-title').textContent = a.def.title ?? '';
      el.style.setProperty('--agent', a.def.color);
      const tag = new CSS2DObject(el);
      tag.position.set(0, -0.28, 0);
      a.avatar.thoughtAnchor.add(tag);

      if (a.def.id === 'tomas') {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xece8df, roughness: 0.5 }));
        cup.position.set(0, -0.33, 0.05);
        a.avatar.hands.R.add(cup);
      }
      if (a.def.id === 'elena') {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.32), new THREE.MeshStandardMaterial({ color: 0xece8df, roughness: 0.9, side: THREE.DoubleSide }));
        sheet.position.set(-0.1, -0.34, 0.1);
        sheet.rotation.set(-0.9, 0, 0);
        a.avatar.hands.L.add(sheet);
      }
    }
  }

  /** Tarjeta holográfica con el contenido de una prueba examinada. */
  function showCard(obj) {
    let card = cards.get(obj.id);
    if (!card && !obj.content) return; // sin contenido todavía no hay nada que mostrar
    if (!card) {
      const texture = renderContent({ ...obj, label: obj.label }, CARD_W, CARD_H);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), material);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD_W + 0.04, CARD_H + 0.04)),
        new THREE.LineBasicMaterial({ color: 0xf0b8a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
      );
      const group = new THREE.Group();
      group.add(mesh, edge);
      const p = office.evidencePosition(obj.id);
      group.position.set(p.x, Math.max(p.y + 0.85, 1.9), p.z);
      scene.add(group);
      card = { group, mat: material, edge: edge.material, showUntil: 0, opacity: 0 };
      cards.set(obj.id, card);
    }
    card.showUntil = performance.now() / 1000 + CARD_SHOW_S;
    labels.get(obj.id)?.classList.add('known');
  }

  return {
    init(world) {
      if (!office) {
        office = createOffice(scene, world);
        walls = roomWalls(world.room.width, world.room.depth);
        for (const e of world.evidence) {
          const el = document.createElement('div');
          el.className = 'obj-label';
          el.innerHTML = '<span class="type"></span>';
          el.querySelector('.type').textContent = e.label;
          const label = new CSS2DObject(el);
          label.position.set(0, 0.32, 0);
          office.evidence.get(e.id).group.add(label);
          labels.set(e.id, el);
        }
      }
      decorateSuspects();
      // Estado de las pruebas (al entrar o al reiniciar la partida)
      for (const e of world.evidence) {
        labels.get(e.id)?.classList.toggle('known', Boolean(e.content));
        if (e.content && !cards.has(e.id)) showCard(e);
        const card = cards.get(e.id);
        if (card && !e.content) {
          scene.remove(card.group);
          cards.delete(e.id);
        }
      }
      for (const c of cards.values()) c.showUntil = 0; // al cargar no se muestran todas a la vez
    },

    onAgentsPos(list) {
      const d = list.find((a) => a.agentId === 'main');
      targetId = d?.walking ? d.targetObject : null;
    },

    onAction(action) {
      if (!action.ok) return;
      const data = action.data ?? {};
      const detective = agents.get(action.agentId);
      switch (action.type) {
        case 'move_to':
          targetId = data.target ?? null;
          break;
        case 'examine':
          if (data.object) showCard(data.object);
          detective?.avatar.pulse(1);
          if (detective && office.evidencePosition(data.objectId, to)) links.beam(detective.avatar.chestPosition(from), to);
          break;
        case 'ask': {
          const suspect = agents.get(data.suspect);
          suspect?.avatar.pulse(0.8);
          if (detective && suspect) links.beam(detective.avatar.chestPosition(from), suspect.avatar.chestPosition(to).setY(1.1), 1.6, 0xffc9a3);
          if (data.evidence) showCard({ id: data.evidence });
          break;
        }
        case 'accuse':
          agents.get(data.suspect)?.avatar.pulse(1.5);
          detective?.avatar.pulse(1.5);
          break;
      }
    },

    colliders() {
      return office ? [...walls, ...office.colliders()] : walls;
    },

    update(dt, t) {
      office?.update(dt, t);
      links.update(dt, t);

      // Las sillas giran con quien está sentado en ellas
      if (office) {
        for (const [id, chair] of office.chairs) {
          const a = agents.get(id);
          if (a) chair.rotation.y = a.avatar.root.rotation.y;
        }
      }

      // Halo bajo el objetivo del detective (prueba o sospechoso)
      let haloPos = null;
      if (targetId) {
        const e = office?.evidencePosition(targetId, to);
        if (e) haloPos = e;
        else if (agents.get(targetId)) haloPos = agents.get(targetId).avatar.root.position;
      }
      halo.show(haloPos);
      halo.update(dt, t);

      // Tarjetas: visibles un rato tras examinar, o al acercarte en primera persona; miran a la cámara
      const now = performance.now() / 1000;
      const cam = stage.camera.position;
      for (const c of cards.values()) {
        const near = stage.mode === 'fps' && Math.hypot(cam.x - c.group.position.x, cam.z - c.group.position.z) < CARD_NEAR_M;
        const goal = now < c.showUntil || near ? 0.95 : 0;
        c.opacity += (goal - c.opacity) * (1 - Math.exp(-dt * 4));
        c.mat.opacity = c.opacity;
        c.edge.opacity = c.opacity * 0.6;
        c.group.visible = c.opacity > 0.01;
        c.group.rotation.y = Math.atan2(cam.x - c.group.position.x, cam.z - c.group.position.z);
        c.group.position.y += Math.sin(t * 1.2 + c.group.position.x) * 0.0006;
      }
    },
  };
}

/** Halo en el suelo bajo el objetivo al que se dirige el detective. */
function createHalo(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.03, 0.0, abs(d - 0.8 - 0.05 * sin(uTime * 2.5)));
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.7), (ring * 0.55 + smoothstep(1.0, 0.0, d) * 0.1) * uAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 48), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  mesh.renderOrder = 4;
  scene.add(mesh);
  let visible = false;
  return {
    show(pos) {
      visible = Boolean(pos);
      if (pos) mesh.position.set(pos.x, 0.015, pos.z);
    },
    update(dt, t) {
      material.uniforms.uTime.value = t;
      material.uniforms.uAlpha.value += ((visible ? 1 : 0) - material.uniforms.uAlpha.value) * (1 - Math.exp(-dt * 4));
    },
  };
}
