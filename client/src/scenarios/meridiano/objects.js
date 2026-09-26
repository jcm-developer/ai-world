// Objetos flotantes: paneles de cristal oscuro con su contenido dibujado en la cara frontal.
// Antes de inspeccionarlos muestran solo su descripción corta; al inspeccionarlos,
// un barrido de luz los recorre y revela el contenido detallado.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { box } from '../../engine/collision.js';
import { renderContent, renderHidden } from './contentTextures.js';

// Tamaño del panel (ancho × alto en metros) según el tipo de objeto
const SIZES = {
  documento: [1.7, 2.2],
  codigo: [2.7, 1.9],
  grafica: [2.7, 1.7],
  datos: [2.4, 1.95],
  pantalla: [3.0, 1.7],
  plano: [2.6, 1.7],
  cronologia: [3.2, 1.35],
};

const EDGE_IDLE = 0.28;
const EDGE_TARGET = 0.6;
const EDGE_KNOWN = 0.42;
const SCAN_DURATION = 1.6; // segundos del barrido de inspección

export function createObjects(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const items = new Map();
  let targetId = null;
  let roomHeight = 7;

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0b0f17,
    metalness: 0.4,
    roughness: 0.18,
    transparent: true,
    opacity: 0.88,
  });

  function build(list, height = roomHeight) {
    roomHeight = height;
    clear();
    list.forEach((obj, index) => items.set(obj.id, createItem(obj, index)));
  }

  function clear() {
    for (const item of items.values()) {
      root.remove(item.group, item.base);
      item.label.element.remove();
      item.group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && o.material !== glassMat) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
    }
    items.clear();
  }

  function createItem(obj, index) {
    const [w, h] = SIZES[obj.type] ?? [1.8, 1.3];
    const { x, y, z } = obj.position;
    const revealed = Boolean(obj.content);

    // Grupo flotante (panel + marco + barrido)
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = obj.rotationY ?? 0; // orientación calculada por el servidor
    root.add(group);

    const slab = new THREE.Mesh(new RoundedBoxGeometry(w + 0.08, h + 0.08, 0.035, 4, 0.02), glassMat);
    group.add(slab);

    const screenMat = new THREE.MeshBasicMaterial({
      map: revealed ? renderContent(obj, w, h) : renderHidden(obj, w, h),
      transparent: true,
      opacity: revealed ? 0.96 : 0.82,
      toneMapped: false,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
    screen.position.z = 0.02;
    group.add(screen);

    // Marco luminoso fino
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x9cc2ff,
      transparent: true,
      opacity: revealed ? EDGE_KNOWN : EDGE_IDLE,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w + 0.08, h + 0.08)), edgeMat);
    edges.position.z = 0.019;
    group.add(edges);

    // Barrido de luz (visible solo durante la inspección)
    const scanMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xcfe2ff).multiplyScalar(1.6),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, 0.018), scanMat);
    scan.position.z = 0.03;
    group.add(scan);

    // Base fija en el suelo: halo y cono de luz volumétrica desde el techo
    const base = new THREE.Group();
    base.position.set(x, 0, z);
    root.add(base);

    const haloMat = haloMaterial();
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.011;
    base.add(halo);

    const coneMat = coneMaterial();
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 1.35, roomHeight, 40, 1, true), coneMat);
    cone.position.y = roomHeight / 2;
    base.add(cone);

    // Etiqueta HTML bajo el panel
    const el = document.createElement('div');
    el.className = `obj-label${revealed ? ' known' : ''}`;
    el.innerHTML = `<span class="type"></span><span class="id"></span>`;
    el.querySelector('.type').textContent = obj.label;
    el.querySelector('.id').textContent = obj.id;
    const label = new CSS2DObject(el);
    label.position.set(0, -h / 2 - 0.22, 0);
    group.add(label);

    return {
      obj,
      w,
      h,
      group,
      base,
      screenMat,
      edgeMat,
      scanMat,
      scan,
      haloMat,
      coneMat,
      label,
      revealed,
      baseY: y,
      phase: index * 1.37,
      scanT: -1, // < 0: sin barrido en curso
      pending: null, // objeto revelado a aplicar a mitad del barrido
      glow: revealed ? 0.35 : 0, // intensidad extra de halo/cono
    };
  }

  /** Inspección: barrido de luz y revelado del contenido. */
  function reveal(id, publicObj) {
    const item = items.get(id);
    if (!item) return;
    item.pending = publicObj;
    item.scanT = 0;
  }

  function setTarget(id) {
    targetId = id;
  }

  function getPosition(id, out = new THREE.Vector3()) {
    const item = items.get(id);
    return item ? out.set(item.obj.position.x, item.obj.position.y, item.obj.position.z) : null;
  }

  function update(dt, t) {
    for (const item of items.values()) {
      // Flotación suave
      item.group.position.y = item.baseY + Math.sin(t * 0.55 + item.phase) * 0.06;
      item.group.rotation.z = Math.sin(t * 0.3 + item.phase) * 0.008;

      // Barrido de inspección
      if (item.scanT >= 0) {
        item.scanT += dt / SCAN_DURATION;
        const p = Math.min(item.scanT, 1);
        item.scan.position.y = item.h / 2 - p * item.h;
        item.scanMat.opacity = Math.sin(p * Math.PI) * 0.9;
        if (p >= 0.5 && item.pending) applyReveal(item);
        if (p >= 1) item.scanT = -1;
      }

      const targeted = item.obj.id === targetId;
      const scanning = item.scanT >= 0;
      const goalGlow = scanning ? 1 : targeted ? 0.7 : item.revealed ? 0.35 : 0;
      item.glow += (goalGlow - item.glow) * (1 - Math.exp(-dt * 3));

      const edgeGoal = scanning ? 0.95 : targeted ? EDGE_TARGET : item.revealed ? EDGE_KNOWN : EDGE_IDLE;
      item.edgeMat.opacity += (edgeGoal - item.edgeMat.opacity) * (1 - Math.exp(-dt * 4));
      item.haloMat.uniforms.uGlow.value = item.glow;
      item.coneMat.uniforms.uGlow.value = item.glow;
      item.coneMat.uniforms.uTime.value = t;
    }
  }

  function applyReveal(item) {
    const obj = item.pending;
    item.pending = null;
    const old = item.screenMat.map;
    item.screenMat.map = renderContent(obj, item.w, item.h);
    item.screenMat.opacity = 0.96;
    item.screenMat.needsUpdate = true;
    old?.dispose();
    item.obj = { ...item.obj, ...obj };
    item.revealed = true;
    item.label.element.classList.add('known');
  }

  /** Obstáculos para la primera persona: cada panel como una caja fina orientada. */
  function colliders() {
    return [...items.values()].map((it) => box(it.obj.position.x, it.obj.position.z, it.w / 2 + 0.06, 0.1, it.group.rotation.y));
  }

  return { build, reveal, setTarget, getPosition, update, colliders, has: (id) => items.has(id) };
}

/** Halo circular en el suelo bajo cada objeto. */
function haloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float disc = smoothstep(1.0, 0.0, d) * 0.1;
        float ring = smoothstep(0.014, 0.0, abs(d - 0.78)) * 0.13;
        gl_FragColor = vec4(vec3(0.62, 0.76, 1.0), (disc + ring) * (0.6 + uGlow * 1.4));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Cono de luz volumétrica falsa: se desvanece en los bordes y hacia el suelo. */
function coneMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying float vH;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vH = uv.y; // 0 abajo, 1 arriba
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      uniform float uTime;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying float vH;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vPosW);
        float facing = abs(dot(normalize(vNormalW), viewDir));
        float soft = pow(facing, 1.6);                 // bordes suaves
        float fall = (smoothstep(0.0, 0.9, vH) * 0.8 + 0.2) * smoothstep(1.0, 0.8, vH); // denso arriba, sin borde duro
        float shimmer = 0.9 + 0.1 * sin(uTime * 0.8 + vPosW.y * 2.0);
        float a = soft * fall * shimmer * (0.016 + uGlow * 0.03);
        gl_FragColor = vec4(vec3(0.82, 0.9, 1.0), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}
