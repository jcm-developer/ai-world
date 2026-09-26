// La sala: suelo de hormigón oscuro con reflejos suaves, paredes de yeso, luz blanca y azul
// fría, un foco cenital con sombras, líneas de luz perimetrales y partículas en suspensión que
// dan volumen al aire. Las superficies usan texturas reales (engine/pbr.js).
//
// Las paredes solo se ven por su cara interior: desde fuera (la cámara) la pared más
// cercana desaparece sola, como en una maqueta.

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { pbr, worldUV } from '../../engine/pbr.js';

const WHITE = 0xf2f5fa;
const COLD_BLUE = 0x6fa4ff;

export function createRoom(scene, renderer, room, shadowMapSize = 2048) {
  const { width: W, depth: D, height: H } = room;
  const group = new THREE.Group();
  scene.add(group);

  RectAreaLightUniformsLib.init();

  // --- Suelo: espejo tenue + hormigón oscuro semitransparente + retícula muy fina
  const pr = renderer.getPixelRatio();
  const mirror = new Reflector(new THREE.PlaneGeometry(W, D), {
    textureWidth: Math.round(window.innerWidth * pr * 0.5),
    textureHeight: Math.round(window.innerHeight * pr * 0.5),
    color: 0x6b7280,
    clipBias: 0.003,
  });
  mirror.rotation.x = -Math.PI / 2;
  group.add(mirror);

  const floor = new THREE.Mesh(
    worldUV(new THREE.PlaneGeometry(W, D)),
    pbr('concrete_floor_worn_001', { size: 3, color: 0x4a505c, roughness: 0.7, transparent: true, opacity: 0.86 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.003;
  floor.receiveShadow = true; // es semitransparente (deja ver el reflejo), pero recibe sombras
  group.add(floor);

  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshBasicMaterial({ map: gridTexture(W, D), transparent: true, depthWrite: false }),
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.005;
  group.add(grid);

  // --- Paredes (cara interior) y techo: yeso oscuro
  const wallMat = pbr('plaster_grey_04', { size: 3, color: 0x2e3440, normalScale: 0.8 });
  // Degradado emisivo: la pared recibe el reflejo de la luz perimetral y se oscurece hacia arriba
  wallMat.emissive = new THREE.Color(0x9fbfff);
  wallMat.emissiveMap = wallWashTexture();
  wallMat.emissiveIntensity = 0.1;
  const walls = [
    { w: W, pos: [0, H / 2, -D / 2], rot: 0 }, // fondo
    { w: W, pos: [0, H / 2, D / 2], rot: Math.PI }, // frente
    { w: D, pos: [-W / 2, H / 2, 0], rot: Math.PI / 2 }, // izquierda
    { w: D, pos: [W / 2, H / 2, 0], rot: -Math.PI / 2 }, // derecha
  ];
  for (const w of walls) {
    const mesh = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(w.w, H)), wallMat);
    mesh.receiveShadow = true;
    mesh.position.set(...w.pos);
    mesh.rotation.y = w.rot;
    group.add(mesh);

    // Línea de luz fría a ras de suelo (se refleja en el suelo)
    const cove = new THREE.Mesh(
      new THREE.PlaneGeometry(w.w - 0.4, 0.035),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(COLD_BLUE).multiplyScalar(1.6), toneMapped: false }),
    );
    cove.position.set(...w.pos);
    cove.position.y = 0.12;
    cove.rotation.y = w.rot;
    cove.translateZ(0.01);
    group.add(cove);
  }

  const ceiling = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(W, D)), wallMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);

  // Tiras verticales de luz blanca en la pared del fondo (ritmo de galería)
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(WHITE).multiplyScalar(1.25), toneMapped: false });
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.04, H * 0.62), stripMat);
    strip.position.set(i * 4.2, H * 0.5, -D / 2 + 0.02);
    group.add(strip);
  }

  // --- Iluminación: blanca cenital + azul fría desde el fondo
  scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x06080c, 0.35));

  const top = new THREE.RectAreaLight(WHITE, 2.6, W * 0.55, D * 0.35);
  top.position.set(0, H - 0.05, -1);
  top.lookAt(0, 0, -1);
  scene.add(top);

  const back = new THREE.RectAreaLight(COLD_BLUE, 3.2, W * 0.7, 2.5);
  back.position.set(0, 2.2, -D / 2 + 0.1);
  back.lookAt(0, 1.2, 0);
  scene.add(back);

  const side = new THREE.RectAreaLight(COLD_BLUE, 1.6, D * 0.6, 2);
  side.position.set(-W / 2 + 0.1, 2.5, 0);
  side.lookAt(0, 1.2, 0);
  scene.add(side);

  // Foco cenital frío: los paneles flotantes proyectan su sombra en el suelo
  const key = new THREE.SpotLight(WHITE, 26, H * 3, 0.85, 0.9, 1.4);
  key.position.set(0, H - 0.2, 2);
  key.target.position.set(0, 0, -1.5);
  key.castShadow = true;
  key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 6;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = H * 3;
  scene.add(key, key.target);

  // --- Partículas de polvo en suspensión
  const dust = createDust(W, D, H);
  group.add(dust.points);

  return {
    update(dt, t) {
      dust.update(t);
    },
  };
}

/** Degradado vertical para las paredes (claro abajo, oscuro arriba). */
function wallWashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgb(120,120,120)');
  g.addColorStop(0.12, 'rgb(46,46,46)');
  g.addColorStop(0.6, 'rgb(14,14,14)');
  g.addColorStop(1, 'rgb(4,4,4)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Retícula muy sutil para el suelo (líneas cada 2 m). */
function gridTexture(W, D) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(150, 175, 215, 0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(W / 2, D / 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Motas de polvo que flotan lentamente y captan la luz. */
function createDust(W, D, H) {
  const COUNT = 700;
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * W;
    positions[i * 3 + 1] = Math.random() * H;
    positions[i * 3 + 2] = (Math.random() - 0.5) * D;
    seeds[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeight: { value: H }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uHeight;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * 0.05 * (0.5 + fract(seed)), uHeight);
        p.x += sin(uTime * 0.2 + seed) * 0.3;
        p.z += cos(uTime * 0.17 + seed * 1.3) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.2 + fract(seed * 7.0) * 1.8) * uPixelRatio * (12.0 / -mv.z);
        // Se desvanecen cerca del suelo y del techo, y parpadean muy despacio
        vAlpha = smoothstep(0.0, 1.0, p.y) * smoothstep(uHeight, uHeight - 1.5, p.y) * (0.35 + 0.35 * sin(uTime * 0.6 + seed * 3.0));
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(vec3(0.75, 0.85, 1.0), a * 0.5);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, update: (t) => (mat.uniforms.uTime.value = t) };
}
