// Cámara en primera persona: ratón para mirar (Pointer Lock) y WASD para caminar,
// con colisiones contra paredes, mobiliario y los avatares de las IAs.

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { resolveCircle } from './collision.js';

const EYE_HEIGHT = 1.65;
const RADIUS = 0.3;
const WALK = 2.0; // m/s
const RUN = 3.8;
const ACCEL = 12;
const STEP_EVERY = 0.62; // metros recorridos entre pasos

export function createFirstPerson({ camera, domElement, getColliders, onStep }) {
  const controls = new PointerLockControls(camera, domElement);
  controls.pointerSpeed = 0.75;
  controls.minPolarAngle = 0.25; // no mirar exactamente al techo ni al suelo
  controls.maxPolarAngle = Math.PI - 0.25;

  const keys = new Set();
  const velocity = new THREE.Vector2();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  let active = false;
  let placed = false;
  let stepDistance = 0;
  let bob = 0;

  const MOVE_KEYS = {
    KeyW: 'f', ArrowUp: 'f',
    KeyS: 'b', ArrowDown: 'b',
    KeyA: 'l', ArrowLeft: 'l',
    KeyD: 'r', ArrowRight: 'r',
    ShiftLeft: 'run', ShiftRight: 'run',
  };

  window.addEventListener('keydown', (e) => {
    if (!active || e.target.closest?.('input, textarea')) return;
    const k = MOVE_KEYS[e.code];
    if (k) {
      keys.add(k);
      if (k !== 'run') e.preventDefault(); // evita que las flechas desplacen la página
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = MOVE_KEYS[e.code];
    if (k) keys.delete(k);
  });
  window.addEventListener('blur', () => keys.clear());

  return {
    controls,
    get active() {
      return active;
    },
    get locked() {
      return controls.isLocked;
    },

    /** Activa la primera persona. La primera vez coloca la cámara en el punto de inicio. */
    enable(start) {
      active = true;
      if (!placed && start) {
        camera.position.set(start.position[0], EYE_HEIGHT, start.position[2]);
        camera.lookAt(...start.lookAt);
        placed = true;
      } else {
        camera.position.y = EYE_HEIGHT;
      }
    },

    disable() {
      active = false;
      keys.clear();
      velocity.set(0, 0);
      if (controls.isLocked) controls.unlock();
    },

    lock() {
      if (active && !controls.isLocked) controls.lock();
    },

    /** Gira la vista hacia un punto (p. ej. el avatar de la IA). */
    lookAt(point) {
      camera.lookAt(point.x, point.y, point.z);
    },

    update(dt) {
      if (!active) return;

      // Dirección deseada según las teclas, relativa hacia dónde mira la cámara
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      let wx = 0;
      let wz = 0;
      if (keys.has('f')) (wx += forward.x), (wz += forward.z);
      if (keys.has('b')) (wx -= forward.x), (wz -= forward.z);
      if (keys.has('r')) (wx += right.x), (wz += right.z);
      if (keys.has('l')) (wx -= right.x), (wz -= right.z);
      const len = Math.hypot(wx, wz);
      const speed = keys.has('run') ? RUN : WALK;
      const tx = len ? (wx / len) * speed : 0;
      const tz = len ? (wz / len) * speed : 0;

      // Aceleración y frenado suaves
      const k = 1 - Math.exp(-dt * ACCEL);
      velocity.x += (tx - velocity.x) * k;
      velocity.y += (tz - velocity.y) * k;

      const prevX = camera.position.x;
      const prevZ = camera.position.z;
      const next = resolveCircle(prevX + velocity.x * dt, prevZ + velocity.y * dt, RADIUS, getColliders());
      camera.position.x = next.x;
      camera.position.z = next.z;

      // Balanceo muy leve de la cabeza y pasos
      const moved = Math.hypot(next.x - prevX, next.z - prevZ);
      bob += moved * 5.5;
      camera.position.y = EYE_HEIGHT + Math.sin(bob) * 0.018 * Math.min(1, moved / (dt * WALK || 1));
      stepDistance += moved;
      if (stepDistance >= STEP_EVERY) {
        stepDistance = 0;
        onStep?.();
      }
    },
  };
}
