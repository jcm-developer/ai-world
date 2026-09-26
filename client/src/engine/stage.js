// Escenario: renderer, cámara cinematográfica, controles orbitales y postproceso (bloom sutil).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

export const BG_COLOR = 0x05070b;
const IDLE_AUTOROTATE_MS = 25000; // tras este tiempo sin tocar la cámara, vuelve a girar despacio

/**
 * @param {HTMLElement} container
 * @param {{ camera?: { position: number[], target: number[] }, fogDensity?: number }} opts ajustes del escenario
 */
export function createStage(container, { camera: cameraPreset, fogDensity = 0.026 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Capa HTML para etiquetas y pensamientos anclados a objetos 3D
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.className = 'labels-layer';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG_COLOR);
  scene.fog = new THREE.FogExp2(BG_COLOR, fogDensity);

  // Entorno suave para reflejos en materiales metálicos/brillantes
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;

  // Cámara gran angular, ligeramente elevada
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(...(cameraPreset?.position ?? [0, 6.8, 15.5]));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...(cameraPreset?.target ?? [0, 1.5, -1]));
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 4;
  controls.maxDistance = 32;
  controls.maxPolarAngle = Math.PI * 0.47; // no bajar por debajo del suelo
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.12;

  // Parámetro opcional ?cam=x,y,z,tx,ty,tz para fijar la cámara (útil para capturas)
  const cam = new URLSearchParams(location.search).get('cam')?.split(',').map(Number);
  if (cam?.length === 6 && cam.every(Number.isFinite)) {
    camera.position.set(cam[0], cam[1], cam[2]);
    controls.target.set(cam[3], cam[4], cam[5]);
    controls.autoRotate = false;
  }

  let idleTimer = null;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener('end', () => {
    idleTimer = setTimeout(() => (controls.autoRotate = true), IDLE_AUTOROTATE_MS);
  });

  // Postproceso: escena → bloom sutil → salida (tone mapping + sRGB)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.65, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    labelRenderer.setSize(w, h);
  });

  // Modos de cámara: 'orbit' (vista general) o 'fps' (primera persona, la mueve firstPerson.js)
  let mode = 'orbit';
  const orbitPose = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  function setMode(next) {
    if (next === mode) return;
    if (next === 'fps') {
      orbitPose.position.copy(camera.position);
      orbitPose.target.copy(controls.target);
      controls.enabled = false;
      controls.autoRotate = false;
      clearTimeout(idleTimer);
      camera.fov = 72;
    } else {
      camera.position.copy(orbitPose.position);
      controls.target.copy(orbitPose.target);
      controls.enabled = true;
      camera.fov = 58;
    }
    camera.updateProjectionMatrix();
    mode = next;
  }

  // Bucle de render con callbacks por frame
  const callbacks = [];
  const clock = new THREE.Clock();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    for (const cb of callbacks) cb(dt, t);
    if (mode === 'orbit') controls.update();
    composer.render();
    labelRenderer.render(scene, camera);
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    setMode,
    get mode() {
      return mode;
    },
    onFrame: (cb) => callbacks.push(cb),
    start: () => renderer.setAnimationLoop(frame),
  };
}
