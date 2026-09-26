// Materiales realistas: texturas PBR escaneadas (Poly Haven, CC0) en public/assets/pbr/<id>/
// y utilidades para que su tamaño sea real en cualquier objeto.
//
// - Las UV se proyectan en metros (worldUV): una veta de madera o una junta de hormigón mide
//   lo mismo en una mesa que en una estantería, en lugar de estirarse por cada cara.
// - `size` indica cuántos metros cubre una repetición de la textura.
// - `color` tiñe la textura (útil para oscurecer o calentar un material sin otra imagen).

import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const cache = new Map();
let anisotropy = 8;

// Texturas que también traen mapa de metal
const WITH_METAL = new Set(['metal_plate']);

/** Ajusta la anisotropía máxima según la tarjeta gráfica (lo llama stage.js). */
export function setMaxAnisotropy(value) {
  anisotropy = Math.min(16, value || 8);
}

/**
 * Carga (una sola vez) una textura y la entrega cuando está lista. Hasta entonces el material
 * no la usa: un mapa de rugosidad sin cargar se lee como negro (rugosidad 0, un espejo).
 */
function texture(url, srgb, size, onReady) {
  const key = `${url}@${size}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = { tex: null, waiting: [] };
    cache.set(key, entry);
    loader.load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.anisotropy = anisotropy;
      tex.repeat.set(1 / size, 1 / size);
      entry.tex = tex;
      for (const cb of entry.waiting) cb(tex);
      entry.waiting = [];
    });
  }
  if (entry.tex) onReady(entry.tex);
  else entry.waiting.push(onReady);
}

/**
 * Material PBR a partir de una textura de public/assets/pbr.
 * @param {string} id carpeta de la textura (p. ej. 'oak_veneer_01')
 * @param {{ size?: number, normalScale?: number } & THREE.MeshStandardMaterialParameters} opts
 */
export function pbr(id, { size = 1, normalScale = 1, ...params } = {}) {
  const base = `/assets/pbr/${id}`;
  // Valores planos mientras cargan las texturas (rugosidad media, sin metal)
  const roughness = params.roughness ?? 1;
  const metalness = params.metalness ?? (WITH_METAL.has(id) ? 1 : 0);
  const mat = new THREE.MeshStandardMaterial({ ...params, roughness: Math.min(roughness, 0.8), metalness: 0 });
  mat.normalScale.set(normalScale, normalScale);
  const set = (prop, apply) => (tex) => {
    mat[prop] = tex;
    apply?.();
    mat.needsUpdate = true;
  };
  texture(`${base}/color.webp`, true, size, set('map'));
  texture(`${base}/normal.webp`, false, size, set('normalMap'));
  texture(`${base}/rough.webp`, false, size, set('roughnessMap', () => (mat.roughness = roughness)));
  if (WITH_METAL.has(id)) texture(`${base}/metal.webp`, false, size, set('metalnessMap', () => (mat.metalness = metalness)));
  else mat.metalness = metalness;
  return mat;
}

/**
 * Reproyecta las UV de una geometría en metros según la orientación de cada cara
 * (proyección por caja). Sirve para cajas, planos y, de forma aproximada, cilindros.
 */
export function worldUV(geometry) {
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  if (!pos || !normal || !uv) return geometry;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x, z);
    else if (nx >= nz) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * Activa sombras en todo lo que tiene un material iluminado. Los brillos, pantallas y
 * efectos (MeshBasicMaterial, shaders, transparentes) ni proyectan ni reciben sombra.
 */
export function enableShadows(root, { cast = true, receive = true } = {}) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const lit = m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial);
    if (!lit || m.transparent) return;
    obj.castShadow = cast && !obj.userData.noShadow;
    obj.receiveShadow = receive;
  });
}
