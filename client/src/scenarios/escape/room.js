// La sala de El Archivo: más pequeña y cerrada que la Sala Meridiano, con luz cálida,
// acentos ámbar y un hueco en la pared del fondo para la puerta. Detrás de la puerta
// hay un pasillo corto muy iluminado que solo se ve cuando se abre.

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { floorGridTexture } from './textures.js';

export const DOOR = { width: 1.3, height: 2.3, x: 0 };
const WARM = 0xfff1dc;
const AMBER = 0xf0c674;

export function createRoom(scene, renderer, room) {
  const { width: W, depth: D, height: H } = room;
  const group = new THREE.Group();
  scene.add(group);
  RectAreaLightUniformsLib.init();

  // --- Suelo: espejo tenue + capa oscura con retícula
  const pr = renderer.getPixelRatio();
  const mirror = new Reflector(new THREE.PlaneGeometry(W, D), {
    textureWidth: Math.round(window.innerWidth * pr * 0.5),
    textureHeight: Math.round(window.innerHeight * pr * 0.5),
    color: 0x5f6068,
    clipBias: 0.003,
  });
  mirror.rotation.x = -Math.PI / 2;
  group.add(mirror);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: floorGridTexture(W / 1.5, D / 1.5), roughness: 0.55, metalness: 0.1, transparent: true, opacity: 0.86 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.003;
  group.add(floor);

  // --- Paredes (cara interior). La del fondo tiene un hueco para la puerta.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c2b31, roughness: 0.88 });
  const addWall = (w, h, x, y, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    group.add(m);
    return m;
  };
  const side = (W - DOOR.width) / 2;
  addWall(side, H, -W / 2 + side / 2, H / 2, -D / 2, 0);
  addWall(side, H, W / 2 - side / 2, H / 2, -D / 2, 0);
  addWall(DOOR.width, H - DOOR.height, 0, DOOR.height + (H - DOOR.height) / 2, -D / 2, 0);
  addWall(W, H, 0, H / 2, D / 2, Math.PI);
  addWall(D, H, -W / 2, H / 2, 0, Math.PI / 2);
  addWall(D, H, W / 2, H / 2, 0, -Math.PI / 2);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), wallMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);

  // Zócalo luminoso ámbar (se refleja en el suelo)
  const coveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(1.3), toneMapped: false });
  const cove = (len, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.03), coveMat);
    m.position.set(x, 0.1, z);
    m.rotation.y = rotY;
    m.translateZ(0.01);
    group.add(m);
  };
  cove(side - 0.3, -W / 2 + side / 2, -D / 2, 0);
  cove(side - 0.3, W / 2 - side / 2, -D / 2, 0);
  cove(D - 0.4, -W / 2, 0, Math.PI / 2);
  cove(D - 0.4, W / 2, 0, -Math.PI / 2);

  // --- Pasillo detrás de la puerta (luz blanca intensa)
  const corridor = new THREE.Group();
  corridor.position.set(DOOR.x, 0, -D / 2);
  group.add(corridor);
  const corridorMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.7 });
  const cFloor = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.width + 0.4, 3), corridorMat);
  cFloor.rotation.x = -Math.PI / 2;
  cFloor.position.set(0, 0.001, -1.5);
  corridor.add(cFloor);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(3, DOOR.height + 0.4), corridorMat);
    w.position.set(s * (DOOR.width / 2 + 0.2), (DOOR.height + 0.4) / 2, -1.5);
    w.rotation.y = -s * Math.PI / 2;
    corridor.add(w);
  }
  const exitGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf4f8ff).multiplyScalar(2.2), toneMapped: false });
  const exitGlow = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.width + 0.4, DOOR.height + 0.4), exitGlowMat);
  exitGlow.position.set(0, (DOOR.height + 0.4) / 2, -3);
  corridor.add(exitGlow);
  const corridorLight = new THREE.PointLight(0xeef4ff, 0, 9, 1.6);
  corridorLight.position.set(0, 1.6, -0.6);
  corridor.add(corridorLight);

  // --- Iluminación: cálida cenital, relleno frío, lámpara del escritorio
  scene.add(new THREE.HemisphereLight(0xd8e2f2, 0x0a0908, 0.55));
  const top = new THREE.RectAreaLight(WARM, 4.2, W * 0.6, D * 0.45);
  top.position.set(0, H - 0.05, 0);
  top.lookAt(0, 0, 0);
  scene.add(top);
  const fill = new THREE.RectAreaLight(0x7fa6e8, 2.2, D * 0.6, 1.6);
  fill.position.set(W / 2 - 0.1, 2, 0);
  fill.lookAt(0, 1, 0);
  scene.add(fill);

  return {
    /** Intensidad de la luz del pasillo (0 cerrado → 1 abierto). */
    setExitLight(k) {
      corridorLight.intensity = 6 * k;
      exitGlowMat.color.setScalar(0.25 + 2 * k);
    },
  };
}
