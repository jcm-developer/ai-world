// Enlaces de luz: líneas finas que crecen de un punto a otro y por las que viaja un pulso tenue
// (conexiones entre objetos), y haces breves (p. ej. del avatar al objeto que inspecciona).

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const GROW_SECONDS = 1.8;
const LABEL_SECONDS = 9;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uProgress;
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    if (vUv.x > uProgress) discard;
    float pulse = smoothstep(0.08, 0.0, abs(fract(uTime * 0.18 + uSeed) - vUv.x));
    float tip = (1.0 - step(0.999, uProgress)) * smoothstep(0.05, 0.0, uProgress - vUv.x);
    float ends = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x); // extremos suaves
    vec3 color = uColor * (1.0 + pulse * 1.6 + tip * 2.5);
    float alpha = (0.4 + pulse * 0.6 + tip) * ends * uIntensity;
    gl_FragColor = vec4(color, alpha);
  }
`;

function linkMaterial(color, seed) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: seed },
      uIntensity: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** @param {(id: string) => THREE.Vector3|null} resolvePosition posición en el mundo de un id */
export function createLinks(scene, resolvePosition) {
  const root = new THREE.Group();
  scene.add(root);
  const links = new Map(); // "a|b" → { mesh, mat, label, age }
  const beams = [];

  const key = (a, b) => [a, b].sort().join('|');

  /** Añade una conexión. animate=false la muestra completa al instante (estado inicial). */
  function add(a, b, reason, animate = true) {
    const k = key(a, b);
    if (links.has(k)) return;
    const pa = resolvePosition(a)?.clone();
    const pb = resolvePosition(b)?.clone();
    if (!pa || !pb) return;

    // Arco suave por encima de ambos objetos
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y = Math.max(pa.y, pb.y) + 1.0 + pa.distanceTo(pb) * 0.08;
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
    const mat = linkMaterial(0xa9c9ff, Math.random());
    mat.uniforms.uProgress.value = animate ? 0 : 1;
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.007, 6, false), mat);
    mesh.renderOrder = 2;
    root.add(mesh);

    // Etiqueta con el motivo, visible unos segundos al crearse
    const el = document.createElement('div');
    el.className = 'conn-label';
    el.textContent = reason;
    const label = new CSS2DObject(el);
    label.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 0.25, 0));
    root.add(label);
    if (animate) {
      // Solo una etiqueta a la vez: la nueva sustituye a las anteriores
      for (const l of links.values()) l.label.element.classList.remove('visible');
      requestAnimationFrame(() => el.classList.add('visible'));
    }

    links.set(k, { mesh, mat, label, age: animate ? 0 : Infinity });
  }

  /** Sustituye todas las conexiones (al conectar o reconectar con el servidor). */
  function setAll(list) {
    for (const l of links.values()) {
      root.remove(l.mesh, l.label);
      l.label.element.remove();
      l.mesh.geometry.dispose();
      l.mat.dispose();
    }
    links.clear();
    for (const c of list) add(c.a, c.b, c.reason, false);
  }

  /** Haz de luz breve entre dos puntos (p. ej. del avatar al objeto que inspecciona). */
  function beam(from, to, seconds = 1.8, color = 0xdbe9ff) {
    const mat = linkMaterial(color, 0);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(from.clone(), to.clone()), 32, 0.006, 5, false), mat);
    mesh.renderOrder = 3;
    root.add(mesh);
    beams.push({ mesh, mat, age: 0, seconds });
  }

  function update(dt, t) {
    for (const l of links.values()) {
      l.age += dt;
      l.mat.uniforms.uTime.value = t;
      l.mat.uniforms.uProgress.value = Math.min(1, l.age / GROW_SECONDS);
      if (l.age > LABEL_SECONDS && l.label.element.classList.contains('visible')) {
        l.label.element.classList.remove('visible');
      }
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.age += dt;
      const p = b.age / b.seconds;
      b.mat.uniforms.uProgress.value = Math.min(1, p * 3);
      b.mat.uniforms.uIntensity.value = p < 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.3);
      b.mat.uniforms.uTime.value = t;
      if (p >= 1) {
        root.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mat.dispose();
        beams.splice(i, 1);
      }
    }
  }

  return { add, setAll, beam, update };
}
