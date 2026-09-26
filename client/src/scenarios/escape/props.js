// Mobiliario de El Archivo construido con primitivas: puerta, reloj, escritorio con cajón,
// estantería, póster, caja fuerte, papelera, terminal, planta y sillón.
// Cada pieza refleja el estado del mundo (cajón abierto, caja fuerte abierta, luces de
// las cerraduras, marcas UV…) con transiciones suaves.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DOOR } from './room.js';
import { clockFaceTexture, exitSignTexture, prismPosterTexture, terminalTexture, uvTextTexture } from './textures.js';

const BOOK_COLORS = {
  violeta: 0x8d5bd6,
  verde: 0x46b872,
  rojo: 0xd9484d,
  'añil': 0x4b4bb5,
  azul: 0x3a7fe0,
  amarillo: 0xe8c23c,
  naranja: 0xef8a3c,
};
const LED = { off: 0x2a1512, red: 0xff4a3d, green: 0x4dff9a, amber: 0xffc267 };
const HIDDEN_LABELS = new Set(['cajon']); // comparte etiqueta con el escritorio
// Contenedor donde se dibuja cada objeto portátil mientras no se haya cogido
const ITEM_HOME = { linterna_uv: 'cajon', tarjeta: 'caja_fuerte', nota_a: 'caja_fuerte', nota_b: 'papelera' };

const mat = {
  metal: new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.75, roughness: 0.35 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x23262d, metalness: 0.7, roughness: 0.4 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4a3a2e, roughness: 0.7 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x4d3427, roughness: 0.6 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.5 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f6b45, roughness: 0.8 }),
  bookGrey: new THREE.MeshStandardMaterial({ color: 0x3b3d44, roughness: 0.8 }),
};

const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
};

function ledMesh(radius = 0.018) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial({ color: LED.off, toneMapped: false }));
  return m;
}

export function createProps(scene, state) {
  const root = new THREE.Group();
  scene.add(root);
  const fixtures = new Map(); // id → { group, anchor: Vector3 local, ... }
  const leds = {}; // lockId → { mesh, flashUntil, flashColor }
  const anim = {
    drawer: { mesh: null, open: 0, target: 0 },
    safeDoor: { mesh: null, open: 0, target: 0 },
    door: { mesh: null, open: 0, target: 0 },
  };
  const items = {}; // id de objeto portátil → mesh visible en su contenedor
  const uvGroup = new THREE.Group(); // marcas de tinta invisible
  let uvShown = false;
  const room = state.room;
  // Las funciones de construcción están declaradas más abajo (se elevan con function)
  const builders = {
    door: buildDoor,
    clock: buildClock,
    desk: buildDesk,
    shelf: buildShelf,
    poster: buildPoster,
    safe: buildSafe,
    bin: buildBin,
    terminal: buildTerminal,
    plant: buildPlant,
    armchair: buildArmchair,
  };

  for (const f of state.fixtures) {
    const g = new THREE.Group();
    const onWall = ['clock', 'poster'].includes(f.kind);
    g.position.set(f.position.x, onWall ? f.position.y : 0, f.position.z);
    g.rotation.y = f.face;
    const entry = { group: g, anchor: new THREE.Vector3(0, 1, 0), kind: f.kind };
    builders[f.kind]?.(g, entry, f);
    root.add(g);
    fixtures.set(f.id, entry);

    if (!HIDDEN_LABELS.has(f.id)) {
      const el = document.createElement('div');
      el.className = 'obj-label';
      el.innerHTML = '<span class="type"></span>';
      el.querySelector('.type').textContent = f.label;
      const label = new CSS2DObject(el);
      label.position.copy(entry.labelAt ?? entry.anchor.clone().add(new THREE.Vector3(0, 0.55, 0)));
      g.add(label);
      entry.label = el;
    }
  }

  // --- Constructores por tipo ---------------------------------------------------------

  function buildDoor(g, entry) {
    // La puerta se construye respecto a la línea de la pared del fondo
    g.position.z = -room.depth / 2;
    g.position.x = DOOR.x;
    const frameMat = mat.darkMetal;
    g.add(box(0.08, DOOR.height + 0.08, 0.14, frameMat, -DOOR.width / 2 - 0.04, DOOR.height / 2, 0.02));
    g.add(box(0.08, DOOR.height + 0.08, 0.14, frameMat, DOOR.width / 2 + 0.04, DOOR.height / 2, 0.02));
    g.add(box(DOOR.width + 0.16, 0.08, 0.14, frameMat, 0, DOOR.height + 0.04, 0.02));
    // Hoja con bisagra a la izquierda
    const hinge = new THREE.Group();
    hinge.position.set(-DOOR.width / 2, 0, 0.03);
    const leaf = box(DOOR.width, DOOR.height, 0.06, mat.metal, DOOR.width / 2, DOOR.height / 2, 0);
    hinge.add(leaf);
    hinge.add(box(0.04, 0.18, 0.04, mat.darkMetal, DOOR.width - 0.12, 1.1, 0.05)); // tirador
    g.add(hinge);
    anim.door.mesh = hinge;
    // Letrero de salida
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.2),
      new THREE.MeshBasicMaterial({ map: exitSignTexture(), toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }),
    );
    sign.position.set(0, DOOR.height + 0.3, 0.02);
    g.add(sign);
    // Lector de tarjetas y teclado a la derecha
    g.add(box(0.12, 0.17, 0.04, mat.darkMetal, DOOR.width / 2 + 0.35, 1.55, 0.03));
    const readerLed = ledMesh();
    readerLed.position.set(DOOR.width / 2 + 0.35, 1.6, 0.06);
    g.add(readerLed);
    leds.reader = { mesh: readerLed };
    const keypad = box(0.2, 0.28, 0.04, mat.darkMetal, DOOR.width / 2 + 0.35, 1.2, 0.03);
    g.add(keypad);
    const keyGlowMat = new THREE.MeshBasicMaterial({ color: 0x0c1016, toneMapped: false });
    const keyGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.2), keyGlowMat);
    keyGlow.position.set(DOOR.width / 2 + 0.35, 1.19, 0.052);
    g.add(keyGlow);
    entry.keyGlow = keyGlowMat;
    const doorLed = ledMesh();
    doorLed.position.set(DOOR.width / 2 + 0.35, 1.37, 0.06);
    g.add(doorLed);
    leds.puerta = { mesh: doorLed };
    entry.anchor.set(0.5, 1.3, 0.1);
    entry.labelAt = new THREE.Vector3(0, DOOR.height + 0.62, 0.05);
  }

  function buildClock(g, entry, f) {
    const v = state.visuals.clock;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 48), mat.darkMetal);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.33, 48), new THREE.MeshStandardMaterial({ map: clockFaceTexture(v.hours, v.minutes), roughness: 0.5 }));
    face.position.z = 0.032;
    g.add(face);
    entry.anchor.set(0, 0, 0.05);
    entry.labelAt = new THREE.Vector3(0, -0.55, 0.05);
    entry.floorOffset = f.position.y; // para el halo en el suelo
  }

  function buildDesk(g, entry) {
    g.add(box(1.6, 0.05, 0.75, mat.wood, 0, 0.76, 0));
    for (const [x, z] of [[-0.74, -0.32], [0.74, -0.32], [-0.74, 0.32], [0.74, 0.32]]) g.add(box(0.05, 0.74, 0.05, mat.darkMetal, x, 0.37, z));
    // Cajón deslizante con candado
    const drawer = new THREE.Group();
    drawer.position.set(0.35, 0.64, 0);
    drawer.add(box(0.6, 0.14, 0.66, mat.metal, 0, 0, 0));
    drawer.add(box(0.12, 0.02, 0.02, mat.darkMetal, 0, 0, 0.34)); // tirador
    const lockLed = ledMesh(0.014);
    lockLed.position.set(0.2, 0.02, 0.34);
    drawer.add(lockLed);
    leds.cajon = { mesh: lockLed };
    // Linterna UV dentro del cajón
    const torch = new THREE.Group();
    torch.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 16), mat.darkMetal));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), new THREE.MeshBasicMaterial({ color: 0xb27dff, toneMapped: false }));
    tip.position.y = 0.11;
    torch.add(tip);
    torch.rotation.z = Math.PI / 2;
    torch.position.set(0, 0.08, 0.1);
    drawer.add(torch);
    items.linterna_uv = torch;
    g.add(drawer);
    anim.drawer.mesh = drawer;
    // Nota sobre la mesa y lámpara
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.27), mat.paper);
    note.rotation.x = -Math.PI / 2;
    note.rotation.z = 0.2;
    note.position.set(-0.25, 0.79, 0.1);
    g.add(note);
    const lamp = new THREE.Group();
    lamp.add(box(0.14, 0.02, 0.14, mat.darkMetal, 0, 0.01, 0));
    lamp.add(box(0.02, 0.42, 0.02, mat.darkMetal, 0, 0.22, 0));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.12, 24, 1, true), mat.darkMetal);
    shade.position.set(0, 0.44, 0.05);
    shade.rotation.x = 0.5;
    lamp.add(shade);
    const bulb = new THREE.PointLight(0xffc98a, 1.2, 3.5, 1.8);
    bulb.position.set(0, 0.38, 0.1);
    lamp.add(bulb);
    lamp.position.set(-0.62, 0.78, -0.2);
    g.add(lamp);
    entry.anchor.set(0, 0.85, 0.2);
  }

  function buildShelf(g, entry) {
    const W = 1.5;
    const H = 2.2;
    const Dp = 0.36;
    g.add(box(0.04, H, Dp, mat.darkMetal, -W / 2, H / 2, 0));
    g.add(box(0.04, H, Dp, mat.darkMetal, W / 2, H / 2, 0));
    g.add(box(W, 0.04, Dp, mat.darkMetal, 0, H, 0));
    g.add(box(W, 0.02, Dp, mat.darkMetal, 0, 0.05, -0.0));
    const shelvesY = [0.45, 0.95, 1.45];
    for (const y of shelvesY) g.add(box(W, 0.03, Dp, mat.darkMetal, 0, y, 0));
    // Libros de colores en la balda central
    const books = state.visuals.books;
    const bookX = {};
    books.forEach((color, i) => {
      const x = -0.42 + i * 0.12;
      bookX[color] = x;
      const h = 0.3 + ((i * 37) % 5) * 0.012;
      g.add(box(0.095, h, 0.24, new THREE.MeshStandardMaterial({ color: BOOK_COLORS[color] ?? 0x888888, roughness: 0.6 }), x, 0.965 + h / 2, 0.02));
    });
    // Libros neutros en las otras baldas
    for (const y of [0.47, 1.47]) {
      for (let i = 0; i < 9; i++) {
        const h = 0.26 + ((i * 13) % 4) * 0.02;
        g.add(box(0.085, h, 0.22, mat.bookGrey, -0.6 + i * 0.13, y + 0.015 + h / 2, 0.02));
      }
    }
    entry.bookX = bookX;
    entry.anchor.set(0, 1.1, 0.2);
    entry.labelAt = new THREE.Vector3(0, H + 0.3, 0);
    uvGroup.visible = false;
    g.add(uvGroup);
    entry.uvGroup = uvGroup;
  }

  function buildPoster(g, entry) {
    g.add(box(1.0, 1.3, 0.03, mat.darkMetal, 0, 0, 0));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.2), new THREE.MeshBasicMaterial({ map: prismPosterTexture(), toneMapped: false, color: new THREE.Color(0.85, 0.85, 0.85) }));
    art.position.z = 0.017;
    g.add(art);
    entry.anchor.set(0, 0, 0.05);
    entry.labelAt = new THREE.Vector3(0, -0.85, 0.05);
    entry.floorOffset = 2.0;
  }

  function buildSafe(g, entry) {
    g.add(box(0.8, 0.9, 0.7, mat.darkMetal, 0, 0.45, 0));
    const hinge = new THREE.Group();
    hinge.position.set(-0.36, 0.45, 0.355);
    hinge.add(box(0.72, 0.8, 0.05, mat.metal, 0.36, 0, 0));
    hinge.add(box(0.14, 0.14, 0.03, mat.darkMetal, 0.58, 0.12, 0.035)); // teclado
    const led = ledMesh(0.015);
    led.position.set(0.58, 0.24, 0.04);
    hinge.add(led);
    leds.caja_fuerte = { mesh: led };
    g.add(hinge);
    anim.safeDoor.mesh = hinge;
    // Contenido: tarjeta y media nota
    const card = box(0.16, 0.005, 0.1, new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.4 }), -0.1, 0.12, 0.05);
    const note = box(0.14, 0.003, 0.18, mat.paper, 0.14, 0.11, 0.02);
    g.add(card, note);
    items.tarjeta = card;
    items.nota_a = note;
    entry.anchor.set(0, 0.6, 0.35);
  }

  function buildBin(g, entry) {
    const basket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.18, 0.45, 24, 6, true),
      new THREE.MeshStandardMaterial({ color: 0x6b6f78, metalness: 0.6, roughness: 0.4, wireframe: true }),
    );
    basket.position.y = 0.225;
    g.add(basket);
    for (let i = 0; i < 5; i++) {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), mat.paper);
      ball.position.set(Math.cos(i * 1.7) * 0.08, 0.3 + (i % 2) * 0.05, Math.sin(i * 1.7) * 0.08);
      g.add(ball);
    }
    const halfNote = box(0.12, 0.003, 0.16, mat.paper, 0, 0.42, 0.02);
    halfNote.rotation.z = 0.4;
    g.add(halfNote);
    items.nota_b = halfNote;
    entry.anchor.set(0, 0.35, 0);
  }

  function buildTerminal(g, entry) {
    g.add(box(0.9, 0.04, 0.6, mat.darkMetal, 0, 0.74, 0));
    g.add(box(0.05, 0.72, 0.5, mat.darkMetal, -0.42, 0.36, 0));
    g.add(box(0.05, 0.72, 0.5, mat.darkMetal, 0.42, 0.36, 0));
    g.add(box(0.7, 0.44, 0.04, mat.darkMetal, 0, 1.08, -0.12));
    g.add(box(0.06, 0.2, 0.06, mat.darkMetal, 0, 0.86, -0.14));
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.64, 0.4),
      new THREE.MeshBasicMaterial({ map: terminalTexture(state.visuals.terminal), toneMapped: false, color: new THREE.Color(1.1, 1.1, 1.1) }),
    );
    screen.position.set(0, 1.08, -0.098);
    g.add(screen);
    g.add(box(0.4, 0.015, 0.14, mat.metal, 0, 0.77, 0.1)); // teclado
    const glow = new THREE.PointLight(0x8cb8ff, 0.5, 2, 2);
    glow.position.set(0, 1.08, 0.2);
    g.add(glow);
    entry.anchor.set(0, 1.08, -0.05);
  }

  function buildPlant(g, entry) {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 24), mat.ceramic).translateY(0.2));
    for (let i = 0; i < 14; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6), mat.leaf);
      const a = i * 2.4;
      leaf.scale.set(0.45, 1, 0.2);
      leaf.position.set(Math.cos(a) * 0.14, 0.62 + (i % 5) * 0.12, Math.sin(a) * 0.14);
      leaf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6);
      g.add(leaf);
    }
    entry.anchor.set(0, 0.8, 0);
  }

  function buildArmchair(g, entry) {
    g.add(box(0.8, 0.22, 0.75, mat.leather, 0, 0.3, 0));
    g.add(box(0.8, 0.6, 0.15, mat.leather, 0, 0.62, -0.32));
    g.add(box(0.12, 0.28, 0.7, mat.leather, -0.44, 0.48, 0));
    g.add(box(0.12, 0.28, 0.7, mat.leather, 0.44, 0.48, 0));
    for (const [x, z] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) g.add(box(0.04, 0.2, 0.04, mat.darkMetal, x, 0.1, z));
    entry.anchor.set(0, 0.5, 0);
  }

  // --- Estado ----------------------------------------------------------------------------

  function setLed(id, color) {
    const led = leds[id];
    if (led) led.base = color;
  }

  function apply(s) {
    anim.drawer.target = s.locks.cajon.open ? 1 : 0;
    anim.safeDoor.target = s.locks.caja_fuerte.open ? 1 : 0;
    anim.door.target = s.doorOpen ? 1 : 0;

    for (const id of ['cajon', 'caja_fuerte', 'puerta']) {
      const l = s.locks[id];
      setLed(id, l.open ? LED.green : l.blocked ? LED.amber : LED.red);
    }
    if (!s.cardInserted && !s.doorOpen) setLed('puerta', LED.off);
    setLed('reader', s.cardInserted ? LED.green : LED.red);
    const door = fixtures.get('puerta');
    if (door) door.keyGlow.color.set(s.cardInserted || s.doorOpen ? 0x3a5a8a : 0x0c1016);

    // Objetos portátiles: visibles solo mientras sigan en su contenedor
    for (const [id, mesh] of Object.entries(items)) mesh.visible = s.items[id]?.location === ITEM_HOME[id];

    // Etiquetas de objetos ya examinados
    for (const f of s.fixtures) fixtures.get(f.id)?.label?.classList.toggle('known', f.examined);

    // Tinta invisible (se borra si la partida se reinicia)
    if (s.visuals.uvMarks.length && !uvShown) showUv(s.visuals);
    if (!s.visuals.uvMarks.length && uvShown) {
      uvGroup.clear();
      uvGroup.visible = false;
      uvShown = false;
    }
  }

  function showUv(v) {
    const shelf = fixtures.get('estanteria');
    if (!shelf) return;
    for (const mark of v.uvMarks) {
      const x = shelf.bookX[mark.book];
      if (x === undefined) continue;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.09, 0.09),
        new THREE.MeshBasicMaterial({ map: uvTextTexture(mark.text), transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      m.position.set(x, 1.13, 0.145);
      uvGroup.add(m);
    }
    if (v.uvShelfText) {
      const t = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.08),
        new THREE.MeshBasicMaterial({ map: uvTextTexture(v.uvShelfText, { width: 1024, height: 96, size: 56 }), transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      t.position.set(0, 0.93, 0.185);
      uvGroup.add(t);
    }
    uvGroup.visible = true;
    uvShown = true;
  }

  /** Destello en la luz de una cerradura (verde si acierta, rojo si falla). */
  function flash(lockId, ok) {
    const led = leds[lockId];
    if (!led) return;
    led.flashUntil = performance.now() + 900;
    led.flashColor = ok ? LED.green : LED.red;
  }

  /** Posición de mundo de un objeto (para haces de luz y halos). */
  function anchor(id, out = new THREE.Vector3()) {
    const f = fixtures.get(id === 'cajon' ? 'escritorio' : id);
    if (!f) return null;
    return f.group.localToWorld(out.copy(f.anchor));
  }

  const tmpColor = new THREE.Color();
  function update(dt, t) {
    const k = 1 - Math.exp(-dt * 3);
    for (const a of Object.values(anim)) a.open += (a.target - a.open) * k;
    if (anim.drawer.mesh) anim.drawer.mesh.position.z = anim.drawer.open * 0.38;
    if (anim.safeDoor.mesh) anim.safeDoor.mesh.rotation.y = -anim.safeDoor.open * 1.9;
    if (anim.door.mesh) anim.door.mesh.rotation.y = anim.door.open * 1.7;

    const now = performance.now();
    for (const led of Object.values(leds)) {
      const blink = led.flashUntil > now ? (Math.floor(now / 120) % 2 ? led.flashColor : LED.off) : led.base ?? LED.off;
      led.mesh.material.color.copy(tmpColor.set(blink));
    }
    if (uvGroup.visible) for (const m of uvGroup.children) m.material.opacity = 0.75 + Math.sin(t * 2 + m.position.x * 10) * 0.25;
  }

  return { apply, flash, anchor, update, doorOpenAmount: () => anim.door.open, fixtures };
}

