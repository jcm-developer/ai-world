// Búsqueda de caminos sobre una rejilla (A*), para que los avatares rodeen los muebles
// en lugar de atravesarlos.
//
// - Los obstáculos son cajas orientadas en el plano del suelo (misma convención que el cliente:
//   { x, z, hw, hd, rot }), infladas con el radio del avatar.
// - El camino resultante se suaviza eliminando puntos intermedios con línea de visión directa.

const SQRT2 = Math.SQRT2;

/**
 * @param {{ width: number, depth: number, cell?: number, radius?: number, obstacles: Array<{x:number,z:number,hw:number,hd:number,rot?:number}> }} opts
 */
export function createNavGrid({ width, depth, cell = 0.2, radius = 0.35, obstacles }) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(depth / cell);
  const blocked = new Uint8Array(cols * rows);
  const x0 = -width / 2;
  const z0 = -depth / 2;

  const toCell = (x, z) => [Math.floor((x - x0) / cell), Math.floor((z - z0) / cell)];
  const center = (c, r) => ({ x: x0 + (c + 0.5) * cell, z: z0 + (r + 0.5) * cell });
  const inside = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
  const isFree = (c, r) => inside(c, r) && !blocked[r * cols + c];

  // Marca como bloqueadas las celdas cuyo centro cae dentro de un obstáculo (inflado) o junto a las paredes
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = center(c, r);
      if (p.x < x0 + radius || p.x > -x0 - radius || p.z < z0 + radius || p.z > -z0 - radius) {
        blocked[r * cols + c] = 1;
        continue;
      }
      for (const o of obstacles) {
        const cos = Math.cos(o.rot ?? 0);
        const sin = Math.sin(o.rot ?? 0);
        const dx = p.x - o.x;
        const dz = p.z - o.z;
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        if (Math.abs(lx) <= o.hw + radius && Math.abs(lz) <= o.hd + radius) {
          blocked[r * cols + c] = 1;
          break;
        }
      }
    }
  }

  /** Celda libre más cercana (por si el origen o el destino caen junto a un mueble). */
  function nearestFree(c, r) {
    if (isFree(c, r)) return [c, r];
    for (let d = 1; d < Math.max(cols, rows); d++) {
      for (let dc = -d; dc <= d; dc++) {
        for (const dr of [-d, d]) if (isFree(c + dc, r + dr)) return [c + dc, r + dr];
      }
      for (let dr = -d + 1; dr < d; dr++) {
        for (const dc of [-d, d]) if (isFree(c + dc, r + dr)) return [c + dc, r + dr];
      }
    }
    return null;
  }

  /** ¿Hay línea de visión libre entre dos celdas? (recorrido de la recta con pasos pequeños) */
  function lineOfSight(a, b) {
    const pa = center(...a);
    const pb = center(...b);
    const dist = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    const steps = Math.ceil(dist / (cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const [c, r] = toCell(pa.x + (pb.x - pa.x) * t, pa.z + (pb.z - pa.z) * t);
      if (!isFree(c, r)) return false;
    }
    return true;
  }

  /**
   * Camino de `from` a `to` como lista de puntos { x, z } (sin incluir el origen).
   * Si no hay camino, devuelve la recta directa como último recurso.
   */
  function findPath(from, to) {
    const start = nearestFree(...toCell(from.x, from.z));
    const goal = nearestFree(...toCell(to.x, to.z));
    if (!start || !goal) return [to];

    const key = (c, r) => r * cols + c;
    const g = new Float32Array(cols * rows).fill(Infinity);
    const came = new Int32Array(cols * rows).fill(-1);
    const open = [[0, start[0], start[1]]]; // montículo binario simple por f
    g[key(...start)] = 0;
    const h = (c, r) => {
      const dx = Math.abs(c - goal[0]);
      const dr = Math.abs(r - goal[1]);
      return (dx + dr) + (SQRT2 - 2) * Math.min(dx, dr);
    };
    const push = (item) => {
      open.push(item);
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (open[p][0] <= open[i][0]) break;
        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop();
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };

    let found = false;
    while (open.length) {
      const [, c, r] = pop();
      if (c === goal[0] && r === goal[1]) {
        found = true;
        break;
      }
      const gc = g[key(c, r)];
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (!dc && !dr) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (!isFree(nc, nr)) continue;
          if (dc && dr && (!isFree(c + dc, r) || !isFree(c, r + dr))) continue; // sin cortar esquinas
          const ng = gc + (dc && dr ? SQRT2 : 1);
          const k = key(nc, nr);
          if (ng < g[k]) {
            g[k] = ng;
            came[k] = key(c, r);
            push([ng + h(nc, nr), nc, nr]);
          }
        }
      }
    }
    if (!found) return [to];

    // Reconstrucción y suavizado (se conservan solo los puntos sin línea de visión entre ellos)
    const cells = [];
    for (let k = key(...goal); k !== -1; k = came[k]) cells.push([k % cols, Math.floor(k / cols)]);
    cells.reverse();
    const smooth = [cells[0]];
    let anchor = cells[0];
    for (let i = 2; i < cells.length; i++) {
      if (!lineOfSight(anchor, cells[i])) {
        anchor = cells[i - 1];
        smooth.push(anchor);
      }
    }
    const points = smooth.slice(1).map((c) => center(...c));
    points.push({ x: to.x, z: to.z }); // el destino exacto al final
    return points;
  }

  return { findPath, isFreeAt: (x, z) => isFree(...toCell(x, z)) };
}
