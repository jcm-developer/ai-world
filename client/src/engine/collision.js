// Colisiones en el plano del suelo (XZ) para la cámara en primera persona.
// Los obstáculos son cajas orientadas o círculos; el jugador es un círculo.
//
//   { type: 'box', x, z, hw, hd, rot }   caja de semiancho hw (eje X local) y semifondo hd (eje Z local),
//                                         girada rot radianes en Y (mismo convenio que Object3D.rotation.y)
//   { type: 'circle', x, z, r }

const box = (x, z, hw, hd, rot = 0) => ({ type: 'box', x, z, hw, hd, rot });
export const circle = (x, z, r) => ({ type: 'circle', x, z, r });
export { box };

/**
 * Paredes de una sala rectangular centrada en el origen, como cajas gruesas por fuera.
 * `gaps` permite dejar huecos en la pared del fondo: [{ x, width }].
 */
export function roomWalls(width, depth, { backGaps = [] } = {}) {
  const T = 0.5; // semigrosor
  const hw = width / 2;
  const hd = depth / 2;
  const walls = [
    box(0, hd + T, hw + 2 * T, T), // frente
    box(-hw - T, 0, T, hd + 2 * T), // izquierda
    box(hw + T, 0, T, hd + 2 * T), // derecha
  ];
  // Fondo, partido en tramos alrededor de los huecos
  let from = -hw - 2 * T;
  for (const g of [...backGaps].sort((a, b) => a.x - b.x)) {
    const to = g.x - g.width / 2;
    walls.push(box((from + to) / 2, -hd - T, (to - from) / 2, T));
    from = g.x + g.width / 2;
  }
  const to = hw + 2 * T;
  walls.push(box((from + to) / 2, -hd - T, (to - from) / 2, T));
  return walls;
}

/**
 * Empuja un círculo (px, pz, radio r) fuera de todos los obstáculos.
 * Devuelve la posición corregida { x, z }.
 */
export function resolveCircle(px, pz, r, colliders, iterations = 3) {
  let x = px;
  let z = pz;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const c of colliders) {
      if (c.type === 'circle') {
        const dx = x - c.x;
        const dz = z - c.z;
        const dist = Math.hypot(dx, dz);
        const min = r + c.r;
        if (dist < min) {
          const nx = dist > 1e-6 ? dx / dist : 1;
          const nz = dist > 1e-6 ? dz / dist : 0;
          x = c.x + nx * min;
          z = c.z + nz * min;
          moved = true;
        }
        continue;
      }
      // Caja orientada: se pasa el punto a coordenadas locales de la caja
      const cos = Math.cos(c.rot);
      const sin = Math.sin(c.rot);
      const dx = x - c.x;
      const dz = z - c.z;
      let lx = dx * cos - dz * sin;
      let lz = dx * sin + dz * cos;
      const qx = Math.max(-c.hw, Math.min(c.hw, lx));
      const qz = Math.max(-c.hd, Math.min(c.hd, lz));
      const ex = lx - qx;
      const ez = lz - qz;
      const dist = Math.hypot(ex, ez);
      if (dist >= r) continue;
      if (dist > 1e-6) {
        // Fuera de la caja pero demasiado cerca: se empuja desde el punto más cercano
        lx = qx + (ex / dist) * r;
        lz = qz + (ez / dist) * r;
      } else {
        // Dentro de la caja: se saca por el lado más próximo
        const px2 = c.hw - Math.abs(lx);
        const pz2 = c.hd - Math.abs(lz);
        if (px2 < pz2) lx = Math.sign(lx || 1) * (c.hw + r);
        else lz = Math.sign(lz || 1) * (c.hd + r);
      }
      // De vuelta a coordenadas del mundo
      x = c.x + lx * cos + lz * sin;
      z = c.z - lx * sin + lz * cos;
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}
