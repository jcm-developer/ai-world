// Escenario: renderer, cámara cinematográfica, controles orbitales, iluminación de entorno (HDRI)
// y postproceso: oclusión ambiental (GTAO), bloom sutil y antialiasing (SMAA).
//
// Calidad: "alta" en escritorio; "baja" en pantallas táctiles (sin GTAO ni SMAA y sombras más
// pequeñas). Se puede forzar con ?quality=alta|baja.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { setMaxAnisotropy } from './pbr.js';

export const BG_COLOR = 0x05070b;
const IDLE_AUTOROTATE_MS = 25000; // tras este tiempo sin tocar la cámara, vuelve a girar despacio

/** Nivel de calidad gráfica: ?quality=alta|baja o, por defecto, según el dispositivo. */
function pickQuality() {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'alta' || q === 'baja') return q;
  return matchMedia('(pointer: coarse)').matches ? 'baja' : 'alta';
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   camera?: { position: number[], target: number[] },
 *   fogDensity?: number,
 *   exposure?: number,
 *   environment?: { hdri: string, intensity?: number, rotation?: number },
 *   ao?: { radius?: number, intensity?: number },
 * }} opts ajustes del escenario
 */
export function createStage(container, { camera: cameraPreset, fogDensity = 0.026, exposure = 1.05, environment, ao } = {}) {
  const quality = pickQuality();
  const high = quality === 'alta';
  const renderer = new THREE.WebGLRenderer({ antialias: !high, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 1.75 : 1.25));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Sombras suaves (cada escenario decide qué luces las proyectan)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
  container.appendChild(renderer.domElement);

  // Capa HTML para etiquetas y pensamientos anclados a objetos 3D
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.className = 'labels-layer';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG_COLOR);
  scene.fog = new THREE.FogExp2(BG_COLOR, fogDensity);

  // Iluminación de entorno: un HDRI real por escenario (solo luz y reflejos, no se ve de fondo).
  // Mientras carga, un entorno genérico suave.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  if (environment?.hdri) {
    new HDRLoader().load(`/assets/hdri/${environment.hdri}_1k.hdr`, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.environmentIntensity = environment.intensity ?? 0.5;
      scene.environmentRotation.y = environment.rotation ?? 0;
      hdr.dispose();
    });
  }

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

  // Postproceso: escena → oclusión ambiental → bloom sutil → salida (tone mapping + sRGB) → antialiasing
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (high) {
    const gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight, undefined, {
      radius: ao?.radius ?? 0.45,
      distanceExponent: 1.4,
      thickness: 1.2,
      scale: 1,
      samples: 16,
    });
    gtao.blendIntensity = ao?.intensity ?? 0.9;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.65, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  if (high) composer.addPass(new SMAAPass());

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
    quality,
    /** Tamaño recomendado del mapa de sombras según la calidad. */
    shadowMapSize: high ? 2048 : 1024,
    setMode,
    get mode() {
      return mode;
    },
    onFrame: (cb) => callbacks.push(cb),
    start: () => renderer.setAnimationLoop(frame),
  };
}
