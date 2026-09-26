// La oficina técnica del laboratorio Meridiano: sala, luz de día, mobiliario detallado y las
// pruebas como objetos físicos. Todo se construye con primitivas a partir de la lista de muebles
// y pruebas que envía el servidor (la misma que usa para la búsqueda de caminos).
//
// El sol entra por los ventanales y proyecta sobre el suelo la sombra de los marcos y las lamas
// de las persianas; las superficies usan texturas reales (engine/pbr.js).

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { enableShadows, pbr, worldUV } from '../../engine/pbr.js';

const SANS = "'Inter', 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

// Materiales con texturas reales (UV en metros, ver engine/pbr.js)
const mat = {
  wall: pbr('painted_plaster_wall', { size: 2.4, color: 0xe2e3e6, normalScale: 0.6 }),
  ceiling: pbr('painted_plaster_wall', { size: 3, color: 0xf0f1f3, normalScale: 0.4 }),
  deskTop: pbr('oak_veneer_01', { size: 1.3, roughness: 0.7 }),
  wood: pbr('walnut_veneer_02', { size: 1.3, roughness: 0.75 }),
  metal: new THREE.MeshPhysicalMaterial({ color: 0xb4b9c1, metalness: 1, roughness: 0.32 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24272d, metalness: 0.35, roughness: 0.5 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.45 }),
  fabric: pbr('fabric_pattern_07', { size: 0.09, color: 0x5d6678, normalScale: 0.8 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xece8df, roughness: 0.92 }),
  cork: pbr('fabric_pattern_07', { size: 0.25, color: 0xe0a370, normalScale: 2 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3a7a50, roughness: 0.65, side: THREE.DoubleSide }),
  ceramic: new THREE.MeshPhysicalMaterial({ color: 0xdedad2, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
  red: new THREE.MeshPhysicalMaterial({ color: 0xa8322b, roughness: 0.4, metalness: 0.3, clearcoat: 0.6 }),
  blueGlass: new THREE.MeshPhysicalMaterial({ color: 0x9cc4ec, roughness: 0.05, transparent: true, opacity: 0.45, ior: 1.45, clearcoat: 1 }),
  coat: pbr('fabric_pattern_07', { size: 0.1, color: 0x7d8189 }),
};
// Paredes y techo son planos de una cara: proyectan sombra por las dos para que el sol
// solo entre por las ventanas
mat.wall.shadowSide = THREE.DoubleSide;
mat.ceiling.shadowSide = THREE.DoubleSide;

const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, h, d)), material);
  m.position.set(x, y, z);
  return m;
};
const cyl = (rt, rb, h, material, x = 0, y = 0, z = 0, seg = 20) => {
  const m = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(rt, rb, h, seg)), material);
  m.position.set(x, y, z);
  return m;
};
const glow = (color, scalar = 1.3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(scalar), toneMapped: false });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Pantalla con líneas de "código" o texto (para monitores y portátiles). */
function screenTexture(hue = '#8cb8ff', lines = 14) {
  return canvasTex(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#0b111a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < lines; i++) {
      ctx.fillStyle = i % 5 === 0 ? hue : 'rgba(200,215,235,0.55)';
      ctx.fillRect(12 + (i % 3) * 10, 10 + i * 10, 60 + ((i * 53) % 150), 4);
    }
  });
}

export function createOffice(scene, world, shadowMapSize = 2048) {
  const { room } = world;
  const root = new THREE.Group();
  scene.add(root);
  RectAreaLightUniformsLib.init();

  const chairs = new Map(); // id de sospechoso → silla (gira con él)
  const evidence = new Map(); // id → { group, anchor }
  const blinkers = []; // luces del armario de servidores


  // --- Sala: moqueta, paredes, ventanales con persianas, techo con plafones ---------------

  function buildRoom(group, { width: W, depth: D, height: H }) {
    const carpet = new THREE.Mesh(
      worldUV(new THREE.PlaneGeometry(W, D)),
      pbr('laminate_floor_02', { size: 2.4, color: 0xcfc6ba, roughness: 0.85 }),
    );
    carpet.rotation.x = -Math.PI / 2;
    group.add(carpet);

    const wall = (w, h, x, y, z, rotY) => {
      const m = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(w, h)), mat.wall);
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      group.add(m);
    };
    wall(W, H, 0, H / 2, -D / 2, 0);
    wall(W, H, 0, H / 2, D / 2, Math.PI);
    wall(D, H, W / 2, H / 2, 0, -Math.PI / 2);
    // Pared izquierda con ventanales: tramos de pared entre ventanas
    const winZ = [-4.2, -0.6, 3.0];
    const winW = 2.8;
    const winY0 = 0.9;
    const winH = 2.3;
    wall(D, winY0, -W / 2, winY0 / 2, 0, Math.PI / 2);
    wall(D, H - winY0 - winH, -W / 2, winY0 + winH + (H - winY0 - winH) / 2, 0, Math.PI / 2);
    let prev = -D / 2;
    for (const z of [...winZ, D / 2 + winW / 2]) {
      const from = prev;
      const to = z - winW / 2;
      if (to > from) wall(to - from, winH, -W / 2, winY0 + winH / 2, (from + to) / 2, Math.PI / 2);
      prev = z + winW / 2;
    }
    // Ventanas: cielo luminoso, marcos y persianas a medio bajar
    const skyMat = new THREE.MeshBasicMaterial({
      map: canvasTex(64, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#dfeaff');
        g.addColorStop(1, '#a9c3e6');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }),
      toneMapped: false,
      color: new THREE.Color(1.25, 1.25, 1.25),
    });
    for (const z of winZ) {
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), skyMat);
      sky.position.set(-W / 2 - 0.05, winY0 + winH / 2, z);
      sky.rotation.y = Math.PI / 2;
      group.add(sky);
      for (const dz of [-winW / 2, 0, winW / 2]) group.add(box(0.08, winH, 0.06, mat.metal, -W / 2 + 0.02, winY0 + winH / 2, z + dz));
      group.add(box(0.1, 0.06, winW, mat.metal, -W / 2 + 0.03, winY0, z));
      group.add(box(0.1, 0.06, winW, mat.metal, -W / 2 + 0.03, winY0 + winH, z));
      for (let i = 0; i < 11; i++) {
        const slat = box(0.02, 0.05, winW - 0.1, mat.ceramic, -W / 2 + 0.12, winY0 + winH - 0.08 - i * 0.1, z);
        slat.rotation.z = 0.5;
        group.add(slat);
      }
    }

    const ceiling = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(W, D)), mat.ceiling);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = H;
    group.add(ceiling);
    const panelMat = glow(0xf4f7ff, 1.35);
    for (const x of [-6, 0, 6]) {
      for (const z of [-3.5, 2.5]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), panelMat);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, H - 0.01, z);
        group.add(p);
      }
    }
    // Rótulo en la pared del fondo
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.4),
      new THREE.MeshBasicMaterial({
        map: canvasTex(768, 128, (ctx, w, h) => {
          ctx.fillStyle = '#1b1e24';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#e6ecf5';
          ctx.font = `500 52px ${SANS}`;
          ctx.textBaseline = 'middle';
          ctx.fillText('MERIDIANO', 36, h / 2);
          ctx.fillStyle = '#8cb8ff';
          ctx.font = `300 34px ${SANS}`;
          ctx.fillText('· oficina técnica', 360, h / 2 + 3);
        }),
      }),
    );
    sign.position.set(-5, 2.9, -D / 2 + 0.02);
    group.add(sign);

    // Luz: sol por los ventanales (con sombras), cielo difuso por las ventanas, plafones y el
    // HDRI de oficina para el ambiente y los reflejos (lo pone stage.js)
    scene.add(new THREE.HemisphereLight(0xe4ecf7, 0x1a1c20, 0.2));
    const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
    sun.position.set(-W / 2 - 7, 8.5, 2.5);
    sun.target.position.set(-W / 2 + 5, 0, -1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowMapSize * 2, shadowMapSize * 2);
    const reach = Math.max(W, D) / 2 + 3;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: 40 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    const daylight = new THREE.RectAreaLight(0xe6efff, 2.6, D * 0.8, winH);
    daylight.position.set(-W / 2 + 0.1, winY0 + winH / 2, -0.5);
    daylight.lookAt(0, 1, -0.5);
    scene.add(daylight);
    const top = new THREE.RectAreaLight(0xfff6ea, 1.4, W * 0.7, D * 0.55);
    top.position.set(0, H - 0.05, 0);
    top.lookAt(0, 0, 0);
    scene.add(top);
  }

  // --- Mobiliario ------------------------------------------------------------------------

  function buildFurniture(f) {
    const g = new THREE.Group();
    g.position.set(f.x, 0, f.z);
    g.rotation.y = f.rot ?? 0;
    const builder = FURNITURE_BUILDERS[f.kind];
    if (builder) builder(g, f);
    root.add(g);
    if (f.kind === 'chair') chairs.set(f.id.replace('silla_', ''), g);
  }

  const FURNITURE_BUILDERS = {
    desk(g, f) {
      g.add(box(1.7, 0.05, 0.84, mat.deskTop, 0, 0.74, 0));
      for (const x of [-0.8, 0.8]) g.add(box(0.05, 0.72, 0.76, mat.metal, x, 0.36, 0));
      g.add(box(1.6, 0.42, 0.02, mat.dark, 0, 0.5, 0.38)); // faldón frontal
      for (const p of f.props ?? []) DESK_PROPS[p]?.(g);
    },
    chair(g) {
      const seat = new THREE.Group();
      seat.add(box(0.5, 0.08, 0.48, mat.fabric, 0, 0.46, 0));
      seat.add(box(0.46, 0.55, 0.07, mat.fabric, 0, 0.8, -0.24));
      seat.add(cyl(0.03, 0.03, 0.36, mat.metal, 0, 0.26, 0));
      for (let i = 0; i < 5; i++) {
        const leg = box(0.04, 0.03, 0.3, mat.metal, 0, 0.06, 0);
        leg.rotation.y = (i / 5) * Math.PI * 2;
        leg.translateZ(0.14);
        seat.add(leg);
      }
      g.add(seat);
    },
    counter(g, f) {
      g.add(box(4.6, 0.86, 0.86, mat.dark, 0, 0.43, 0));
      g.add(box(4.66, 0.05, 0.92, mat.deskTop, 0, 0.89, 0));
      for (let i = -2; i <= 2; i++) g.add(box(0.02, 0.6, 0.01, mat.metal, i * 0.9, 0.45, 0.435));
      if (f.props?.includes('toolbox')) {
        g.add(box(0.5, 0.22, 0.26, mat.red, -1.3, 1.03, -0.05));
        g.add(box(0.3, 0.04, 0.05, mat.black, -1.3, 1.16, -0.05));
      }
      if (f.props?.includes('coffee_machine')) {
        g.add(box(0.46, 0.62, 0.42, mat.black, 1.5, 1.22, -0.1));
        g.add(box(0.1, 0.06, 0.1, mat.metal, 1.5, 1.04, 0.1));
        g.add(cyl(0.035, 0.03, 0.08, mat.ceramic, 1.5, 0.96, 0.12));
      }
      // Estante con cajas sobre el banco
      g.add(box(3, 0.03, 0.3, mat.metal, -0.4, 1.75, -0.28));
      for (let i = 0; i < 5; i++) g.add(box(0.36, 0.26, 0.26, i % 2 ? mat.fabric : mat.wood, -1.6 + i * 0.55, 1.9, -0.28));
    },
    rack(g) {
      g.add(box(0.8, 2.05, 1.0, mat.black, 0, 1.025, 0));
      for (let i = 0; i < 9; i++) {
        g.add(box(0.7, 0.12, 0.02, mat.dark, 0, 0.3 + i * 0.19, 0.51));
        for (let j = 0; j < 3; j++) {
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), glow(j === 2 ? 0xffc267 : 0x4dff9a, 1.6));
          led.position.set(0.24 + j * 0.04, 0.3 + i * 0.19, 0.525);
          g.add(led);
          blinkers.push({ mesh: led, seed: Math.random() * 10 });
        }
      }
    },
    reception(g) {
      g.add(box(2.6, 1.02, 0.8, mat.wood, 0, 0.51, 0));
      g.add(box(2.7, 0.05, 0.9, mat.deskTop, 0, 1.05, 0));
      g.add(box(2.5, 0.08, 0.02, glow(0x8cb8ff, 1.1), 0, 0.12, 0.41)); // línea de luz inferior
    },
    coat_rack(g) {
      g.add(cyl(0.025, 0.025, 1.8, mat.metal, 0, 0.9, 0));
      g.add(cyl(0.22, 0.25, 0.04, mat.metal, 0, 0.02, 0));
      for (let i = 0; i < 4; i++) {
        const hook = box(0.02, 0.02, 0.18, mat.metal, 0, 1.72, 0);
        hook.rotation.y = (i / 4) * Math.PI * 2;
        hook.translateZ(0.08);
        g.add(hook);
      }
    },
    printer_table(g) {
      g.add(box(0.9, 0.04, 0.7, mat.deskTop, 0, 0.72, 0));
      for (const [x, z] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) g.add(box(0.04, 0.7, 0.04, mat.metal, x, 0.35, z));
      g.add(box(0.56, 0.26, 0.44, mat.ceramic, 0, 0.87, 0));
      g.add(box(0.44, 0.02, 0.08, mat.dark, 0, 0.96, 0.24));
    },
    meeting_table(g) {
      g.add(box(3.4, 0.06, 1.6, mat.wood, 0, 0.75, 0));
      for (const x of [-1.2, 1.2]) g.add(box(0.12, 0.72, 1.0, mat.metal, x, 0.36, 0));
      // Sillas alrededor (vacías)
      for (const x of [-1.1, 0, 1.1]) {
        for (const side of [-1, 1]) {
          const c = new THREE.Group();
          FURNITURE_BUILDERS.chair(c);
          c.position.set(x, 0, side * 1.15);
          c.rotation.y = side > 0 ? Math.PI : 0;
          g.add(c);
        }
      }
      g.add(box(0.3, 0.02, 0.42, mat.paper, -1.0, 0.79, 0.2)); // documentos sueltos
    },
    water_cooler(g) {
      g.add(box(0.32, 1.0, 0.32, mat.ceramic, 0, 0.5, 0));
      g.add(cyl(0.14, 0.14, 0.42, mat.blueGlass, 0, 1.22, 0));
      g.add(box(0.06, 0.05, 0.04, mat.dark, 0, 0.8, 0.17));
    },
    plant(g) {
      g.add(cyl(0.22, 0.17, 0.46, mat.dark, 0, 0.23, 0));
      for (let i = 0; i < 16; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6), mat.leaf);
        const a = i * 2.4;
        leaf.scale.set(0.45, 1, 0.2);
        leaf.position.set(Math.cos(a) * 0.15, 0.7 + (i % 6) * 0.13, Math.sin(a) * 0.15);
        leaf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
        g.add(leaf);
      }
    },
    corkboard(g) {
      g.add(box(2.6, 1.3, 0.03, mat.cork, 0, 1.75, 0));
      g.add(box(2.7, 1.4, 0.02, mat.wood, 0, 1.75, -0.01));
      // Papeles clavados (decorativos)
      for (const [x, y, r] of [[0.55, 2.05, 0.05], [0.95, 1.6, -0.08], [0.35, 1.45, 0.03], [-1.0, 2.1, -0.04]]) {
        const p = box(0.32, 0.4, 0.005, mat.paper, x, y, 0.02);
        p.rotation.z = r;
        g.add(p);
      }
    },
  };

  const DESK_PROPS = {
    monitor(g) {
      addMonitor(g, 0.15, '#c3a6ff');
    },
    monitor2(g) {
      addMonitor(g, -0.33, '#7fd6b0');
      addMonitor(g, 0.33, '#8cb8ff');
    },
    keyboard(g) {
      g.add(box(0.44, 0.02, 0.14, mat.dark, 0, 0.775, -0.15));
      g.add(box(0.06, 0.02, 0.1, mat.dark, 0.32, 0.775, -0.15));
    },
    laptop(g) {
      g.add(box(0.36, 0.02, 0.25, mat.metal, 0, 0.775, -0.08));
      const lid = new THREE.Group();
      lid.position.set(0, 0.785, 0.045);
      lid.rotation.x = -0.35;
      lid.add(box(0.36, 0.24, 0.012, mat.metal, 0, 0.12, 0));
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.21), new THREE.MeshBasicMaterial({ map: screenTexture('#7fc8e8'), toneMapped: false }));
      screen.position.set(0, 0.12, -0.008);
      screen.rotation.y = Math.PI;
      lid.add(screen);
      g.add(lid);
    },
    papers(g) {
      for (let i = 0; i < 4; i++) {
        const p = box(0.22, 0.004, 0.3, mat.paper, -0.5 + i * 0.02, 0.77 + i * 0.005, -0.1 + i * 0.01);
        p.rotation.y = i * 0.1;
        g.add(p);
      }
    },
    lamp(g) {
      g.add(box(0.14, 0.02, 0.14, mat.dark, 0.68, 0.775, 0.2));
      g.add(box(0.02, 0.4, 0.02, mat.dark, 0.68, 0.97, 0.2));
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 20, 1, true), mat.dark);
      shade.position.set(0.62, 1.18, 0.12);
      shade.rotation.x = -0.5;
      g.add(shade);
      const light = new THREE.PointLight(0xffc98a, 0.9, 3, 1.8);
      light.position.set(0.6, 1.1, 0.05);
      g.add(light);
    },
    frame(g) {
      const f = box(0.14, 0.18, 0.02, mat.wood, -0.7, 0.86, 0.25);
      f.rotation.x = 0.2;
      g.add(f);
    },
    mug(g) {
      g.add(cyl(0.04, 0.035, 0.1, mat.ceramic, 0.6, 0.8, -0.1));
    },
    plantita(g) {
      g.add(cyl(0.05, 0.04, 0.08, mat.ceramic, -0.72, 0.8, 0.22));
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat.leaf);
      l.position.set(-0.72, 0.88, 0.22);
      g.add(l);
    },
    notebook(g) {
      const n = box(0.18, 0.012, 0.24, mat.red, 0.45, 0.772, -0.12);
      n.rotation.y = -0.3;
      g.add(n);
    },
    bottle(g) {
      g.add(cyl(0.035, 0.035, 0.22, mat.blueGlass, -0.6, 0.87, 0.1));
    },
  };

  function addMonitor(g, x, hue) {
    g.add(box(0.2, 0.02, 0.14, mat.dark, x, 0.775, 0.18));
    g.add(box(0.03, 0.3, 0.03, mat.dark, x, 0.93, 0.2));
    g.add(box(0.56, 0.34, 0.03, mat.black, x, 1.12, 0.18));
    // La pantalla mira hacia quien se sienta (hacia -Z local)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshBasicMaterial({ map: screenTexture(hue), toneMapped: false }));
    screen.position.set(x, 1.12, 0.163);
    screen.rotation.y = Math.PI;
    g.add(screen);
  }

  // --- Pruebas como objetos físicos --------------------------------------------------------

  function buildEvidence(e) {
    const g = new THREE.Group();
    g.position.set(e.position.x, e.position.y, e.position.z);
    const b = EVIDENCE_BUILDERS[e.prop];
    if (b) b(g);
    root.add(g);
    evidence.set(e.id, { group: g, data: e });
  }

  const EVIDENCE_BUILDERS = {
    clipboard(g) {
      const c = new THREE.Group();
      c.add(box(0.26, 0.012, 0.34, mat.wood));
      c.add(box(0.22, 0.004, 0.3, mat.paper, 0, 0.008, 0.01));
      c.add(box(0.1, 0.02, 0.03, mat.metal, 0, 0.015, -0.15));
      c.rotation.y = 0.2;
      c.position.y = -0.04;
      g.add(c);
    },
    rack_screen(g) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.36),
        new THREE.MeshBasicMaterial({
          map: canvasTex(512, 320, (ctx, w, h) => {
            ctx.fillStyle = '#050b10';
            ctx.fillRect(0, 0, w, h);
            ctx.font = `20px ${MONO}`;
            ctx.fillStyle = '#7fd6b0';
            ctx.fillText('meridiano-01 · registro', 18, 34);
            for (let i = 0; i < 8; i++) {
              ctx.fillStyle = i === 2 ? '#f0c674' : 'rgba(190,210,230,0.6)';
              ctx.fillRect(18, 60 + i * 30, 120 + ((i * 71) % 300), 8);
            }
          }),
          toneMapped: false,
        }),
      );
      s.position.z = 0.005;
      g.add(s);
    },
    calendar(g) {
      g.add(box(0.5, 0.62, 0.006, mat.paper));
      g.add(box(0.5, 0.1, 0.008, mat.red, 0, 0.26, 0.001));
    },
    coffee_screen(g) {
      const s = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 0.13),
        new THREE.MeshBasicMaterial({
          map: canvasTex(256, 160, (ctx, w, h) => {
            ctx.fillStyle = '#0c1016';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#f0c674';
            ctx.font = `600 30px ${SANS}`;
            ctx.fillText('CAFÉ', 20, 50);
            ctx.fillStyle = 'rgba(220,230,240,0.7)';
            ctx.font = `20px ${MONO}`;
            ctx.fillText('ventas: ver', 20, 100);
          }),
          toneMapped: false,
        }),
      );
      s.position.set(0, 0, 0.012);
      g.add(s);
    },
    printer_paper(g) {
      const p = box(0.21, 0.004, 0.28, mat.paper, 0, 0, 0);
      p.rotation.y = 0.1;
      g.add(p);
    },
    photo(g) {
      const p = box(0.2, 0.004, 0.15, mat.paper, 0, 0, 0);
      p.rotation.y = -0.3;
      g.add(p);
      const img = box(0.17, 0.005, 0.11, mat.dark, 0, 0.001, 0);
      img.rotation.y = -0.3;
      g.add(img);
    },
    coat(g) {
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 6, 16), mat.coat);
      c.scale.set(1, 1, 0.5);
      c.position.set(0.12, -0.05, 0.05);
      g.add(c);
      g.add(box(0.36, 0.06, 0.16, mat.coat, 0.12, 0.38, 0.05)); // hombros
    },
    mug(g) {
      g.add(cyl(0.045, 0.04, 0.1, mat.ceramic, 0, 0.05, 0));
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 16), mat.red);
      lip.position.set(0.02, 0.1, 0.03);
      lip.rotation.x = Math.PI / 2;
      lip.scale.set(0.6, 0.6, 0.6);
      g.add(lip);
    },
  };

  // Se construye al final: los constructores de arriba son constantes y deben existir antes
  buildRoom(root, room);
  for (const f of world.furniture) buildFurniture(f);
  for (const e of world.evidence) buildEvidence(e);
  enableShadows(root);

  return {
    evidence,
    chairs,
    /** Posición de mundo de una prueba (para haces y halos). */
    evidencePosition(id, out = new THREE.Vector3()) {
      const e = evidence.get(id);
      return e ? out.copy(e.group.position) : null;
    },
    /** Obstáculos para la primera persona. */
    colliders() {
      return world.furniture.filter((f) => !f.onWall).map((f) => ({ type: 'box', x: f.x, z: f.z, hw: f.hw, hd: f.hd, rot: f.rot ?? 0 }));
    },
    update(dt, t) {
      for (const b of blinkers) b.mesh.visible = Math.sin(t * 3 + b.seed * 7) > -0.6;
    },
  };
}
