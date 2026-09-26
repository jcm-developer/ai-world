// La sala de El Archivo: un sótano de hormigón, más pequeño y cerrado que la Sala Meridiano,
// con dos fluorescentes en el techo (con sombras), acentos ámbar y un hueco en la pared del
// fondo para la puerta. Detrás de la puerta hay un pasillo corto muy iluminado que solo se ve
// cuando se abre.

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { enableShadows, pbr, worldUV } from '../../engine/pbr.js';

export const DOOR = { width: 1.3, height: 2.3, x: 0 };
const WARM = 0xfff1dc;
const AMBER = 0xf0c674;

export function createRoom(scene, renderer, room, shadowMapSize = 2048) {
  const { width: W, depth: D, height: H } = room;
  const group = new THREE.Group();
  scene.add(group);
  RectAreaLightUniformsLib.init();

  // --- Suelo de hormigón gastado (opaco, recibe las sombras de los muebles)
  const floor = new THREE.Mesh(
    worldUV(new THREE.PlaneGeometry(W, D)),
    pbr('concrete_floor_worn_001', { size: 2.4, color: 0xa29e99, roughness: 0.78, normalScale: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // --- Paredes de bloques de hormigón (cara interior). La del fondo tiene un hueco para la puerta.
  const wallMat = pbr('concrete_wall_004', { size: 0.75, color: 0xa9a7a2, normalScale: 1.1 });
  const ceilingMat = pbr('concrete_wall_007', { size: 2.5, color: 0x5a595e });
  const addWall = (w, h, x, y, z, rotY) => {
    const m = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(w, h)), wallMat);
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
  const ceiling = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(W, D)), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);

  // Rodapié de hormigón algo más oscuro (da escala y asienta las paredes en el suelo)
  const skirtMat = pbr('concrete_wall_007', { size: 1.5, color: 0x5d5c60 });
  const skirt = (len, x, z, rotY) => {
    const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(len, 0.14, 0.04)), skirtMat);
    m.position.set(x, 0.07, z);
    m.rotation.y = rotY;
    m.translateZ(0.02);
    group.add(m);
  };
  skirt(side, -W / 2 + side / 2, -D / 2, 0);
  skirt(side, W / 2 - side / 2, -D / 2, 0);
  skirt(W, 0, D / 2, Math.PI);
  skirt(D, -W / 2, 0, Math.PI / 2);
  skirt(D, W / 2, 0, -Math.PI / 2);

  // Zócalo luminoso ámbar (se refleja en el suelo)
  const coveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(1.3), toneMapped: false });
  const cove = (len, x, z, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.03), coveMat);
    m.position.set(x, 0.17, z);
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
  const corridorMat = pbr('concrete_wall_007', { size: 2, color: 0xa4a6ac });
  const cFloor = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(DOOR.width + 0.4, 3)), corridorMat);
  cFloor.rotation.x = -Math.PI / 2;
  cFloor.position.set(0, 0.001, -1.5);
  corridor.add(cFloor);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(3, DOOR.height + 0.4)), corridorMat);
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

  // --- Iluminación: dos fluorescentes en el techo (con sombras), relleno frío y el HDRI de
  // entorno (lo pone stage.js). La lámpara del escritorio está en props.js.
  scene.add(new THREE.HemisphereLight(0xd8e2f2, 0x0a0908, 0.18));
  // Difusor opalino: brilla, pero sin deslumbrar como un tubo desnudo
  const tubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(WARM).multiplyScalar(1.15), toneMapped: false });
  const housingMat = pbr('metal_plate', { size: 0.6, color: 0x55585e, metalness: 0.6 });
  for (const x of [-W * 0.22, W * 0.22]) {
    const fixture = new THREE.Group();
    fixture.position.set(x, H - 0.06, -0.3);
    fixture.add(new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.26, 0.06, 1.5)), housingMat));
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 1.42), tubeMat);
    diffuser.position.y = -0.04;
    fixture.add(diffuser);
    group.add(fixture);

    const spot = new THREE.SpotLight(WARM, 34, 11, 1.1, 0.8, 1.6);
    spot.position.set(x, H - 0.12, -0.3);
    spot.target.position.set(x * 0.6, 0, -0.1);
    spot.castShadow = true;
    spot.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.025;
    spot.shadow.radius = 5;
    spot.shadow.camera.near = 0.3;
    spot.shadow.camera.far = 12;
    scene.add(spot, spot.target);
  }
  // Luz rebotada del techo y las paredes (sin sombras, muy suave)
  const bounce = new THREE.RectAreaLight(WARM, 0.8, W * 0.6, D * 0.45);
  bounce.position.set(0, H - 0.05, 0);
  bounce.lookAt(0, 0, 0);
  scene.add(bounce);
  const fill = new THREE.RectAreaLight(0x7fa6e8, 1.2, D * 0.6, 1.6);
  fill.position.set(W / 2 - 0.1, 2, 0);
  fill.lookAt(0, 1, 0);
  scene.add(fill);

  enableShadows(group);
  floor.castShadow = false;

  return {
    /** Intensidad de la luz del pasillo (0 cerrado → 1 abierto). */
    setExitLight(k) {
      corridorLight.intensity = 6 * k;
      exitGlowMat.color.setScalar(0.25 + 2 * k);
    },
  };
}
