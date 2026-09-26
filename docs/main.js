// AI World — landing: la sala viva de la portada y las animaciones de scroll

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- Texto partido en palabras ---------- */

/** Envuelve cada palabra de un elemento en <span class="w">, respetando las etiquetas internas. */
function splitWords(root) {
  const words = [];
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(part);
          } else {
            const span = document.createElement('span');
            span.className = 'w';
            span.textContent = part;
            frag.append(span);
            words.push(span);
          }
        }
        child.replaceWith(frag);
      } else {
        walk(child);
      }
    }
  };
  walk(root);
  return words;
}

// Titular: las palabras entran una a una
const title = document.querySelector('.hero h1');
const titleWords = splitWords(title);
titleWords.forEach((w, i) => w.style.setProperty('--i', i));

// Manifiesto: las palabras se encienden a medida que bajas
const manifesto = document.querySelector('[data-words]');
const manifestoWords = splitWords(manifesto);

function updateManifesto() {
  const rect = manifesto.getBoundingClientRect();
  const vh = innerHeight;
  // 0 cuando el texto asoma por abajo, 1 cuando llega a un tercio de la pantalla
  const progress = Math.min(1, Math.max(0, (vh * 0.85 - rect.top) / (rect.height + vh * 0.35)));
  const lit = Math.round(progress * manifestoWords.length);
  manifestoWords.forEach((w, i) => w.classList.toggle('on', i < lit));
}

/* ---------- Pensamientos que se escriben solos ---------- */

async function typeInto(el, text, speed = 30) {
  el.textContent = '';
  for (const char of text) {
    el.textContent += char;
    await sleep(speed);
  }
}

const HERO_THOUGHTS = [
  'Before drawing conclusions, I want to see every piece.',
  'A hypothesis only counts if it survives what I haven’t seen yet.',
  'This doesn’t match what I wrote down earlier. Let me look again.',
  'Hello. I’m still investigating; feel free to stay and watch.',
];

const heroThought = document.getElementById('hero-thought');
if (reduceMotion) {
  heroThought.textContent = HERO_THOUGHTS[0];
  document.getElementById('agent-thought').classList.add('on');
} else {
  (async () => {
    await sleep(2000);
    document.getElementById('agent-thought').classList.add('on');
    for (let i = 0; ; i = (i + 1) % HERO_THOUGHTS.length) {
      await typeInto(heroThought, HERO_THOUGHTS[i], 34);
      await sleep(3800);
    }
  })();
}

/* ---------- Apariciones, navegación y efectos de ratón ---------- */

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
      // El pensamiento de cada mundo empieza a escribirse al aparecer
      const chip = entry.target.querySelector('.world-chip');
      if (chip) {
        const p = chip.querySelector('p');
        if (reduceMotion) p.textContent = chip.dataset.thought;
        else sleep(700).then(() => typeInto(p, chip.dataset.thought, 32));
      }
    }
  },
  { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
);
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

const nav = document.getElementById('nav');
function onScroll() {
  nav.classList.toggle('solid', scrollY > 40);
  updateManifesto();
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
onScroll();

if (finePointer && !reduceMotion) {
  // Capturas que se inclinan hacia el ratón, con un reflejo que lo sigue
  for (const media of document.querySelectorAll('.tilt')) {
    media.addEventListener('pointermove', (e) => {
      const r = media.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      media.style.transform = `perspective(1400px) rotateY(${(x - 0.5) * 5}deg) rotateX(${(0.5 - y) * 4}deg)`;
      media.style.setProperty('--mx', `${x * 100}%`);
      media.style.setProperty('--my', `${y * 100}%`);
    });
    media.addEventListener('pointerleave', () => (media.style.transform = ''));
  }
  // Tarjetas de lo que viene: brillo que sigue al ratón
  for (const card of document.querySelectorAll('.future-grid li')) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
}

/* ---------- La sala de la portada (canvas 2D) ---------- */

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const hero = document.querySelector('.hero');

let W = 0;
let H = 0;
let dpr = 1;
let horizon = 0;
let focal = 0;
const mouse = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 };

// Paneles flotantes, como los objetos de la Sala Meridiano (x lateral, z profundidad, y altura)
const PANELS = [
  { x: -3.1, z: 4.2, y: 1.2 },
  { x: -1.7, z: 7.5, y: 1.6 },
  { x: -0.4, z: 10, y: 1.9 },
  { x: 1.1, z: 8.2, y: 1.5 },
  { x: 2.6, z: 5, y: 1.3 },
  { x: -2.3, z: 12, y: 2.1 },
  { x: 2.2, z: 11.5, y: 2 },
].map((p, i) => ({ ...p, phase: i * 1.7, lit: 0, target: 0, scan: -1, lines: 3 + (i % 3) }));

const thoughtEl = document.getElementById('agent-thought');
const thoughtBox = { width: 290, x: 0, y: 0 };

const agent = { x: 0, z: 6, from: null, to: 0, t: 0, state: 'walk', wait: 0, prev: null, visited: 0 };
let links = [];
let fading = 0;

const particles = Array.from({ length: 150 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.4 + 0.3,
  s: Math.random() * 0.012 + 0.004,
  tw: Math.random() * Math.PI * 2,
}));

function resize() {
  const r = hero.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = r.width;
  H = r.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // El horizonte queda justo por debajo del texto, para que la sala no lo tape
  const copy = document.querySelector('.hero-copy').getBoundingClientRect();
  horizon = Math.min(H * 0.8, Math.max(H * 0.58, copy.bottom - r.top + 70));
  focal = Math.min(W, 1600) * (W < 700 ? 0.8 : 0.5);
  thoughtBox.width = thoughtEl.offsetWidth;
}

/** Proyecta un punto de la sala (x, y, z) en la pantalla. */
function project(x, y, z) {
  const vx = W / 2 + (mouse.sx - 0.5) * -60;
  const vy = horizon + (mouse.sy - 0.5) * -24;
  const k = focal / z;
  // En pantallas estrechas la sala se junta hacia el centro para que se vea entera
  const spread = W < 700 ? 0.55 : 1;
  return { x: vx + x * k * spread, y: vy + (1.7 - y) * k, k };
}

function drawFloor(t) {
  const vx = W / 2 + (mouse.sx - 0.5) * -60;
  const vy = horizon + (mouse.sy - 0.5) * -24;

  // Resplandor del horizonte
  const glow = ctx.createLinearGradient(0, vy - 60, 0, vy + 120);
  glow.addColorStop(0, 'rgba(111,164,255,0)');
  glow.addColorStop(0.35, 'rgba(111,164,255,0.10)');
  glow.addColorStop(1, 'rgba(111,164,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, vy - 60, W, 180);

  const line = ctx.createLinearGradient(0, 0, W, 0);
  line.addColorStop(0, 'rgba(140,184,255,0)');
  line.addColorStop(0.5, 'rgba(160,200,255,0.55)');
  line.addColorStop(1, 'rgba(140,184,255,0)');
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, vy + focal * 1.7 / 40);
  ctx.lineTo(W, vy + focal * 1.7 / 40);
  ctx.stroke();

  // Líneas que convergen en el punto de fuga
  ctx.lineWidth = 1;
  for (let i = -18; i <= 18; i++) {
    const far = project(i * 1.2, 0, 40);
    const near = project(i * 1.2, 0, 0.6);
    const g = ctx.createLinearGradient(0, far.y, 0, H);
    g.addColorStop(0, 'rgba(150,175,215,0)');
    g.addColorStop(1, 'rgba(150,175,215,0.13)');
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(near.x, near.y);
    ctx.stroke();
  }

  // Líneas transversales que avanzan despacio hacia ti
  const offset = (t * 0.35) % 1.2;
  for (let d = 40; d > 0.6; d -= 1.2) {
    const z = d - offset;
    if (z < 0.6) continue;
    const p = project(0, 0, z);
    const a = Math.min(0.16, 1.1 / z) * Math.min(1, (40 - z) / 10);
    ctx.strokeStyle = `rgba(150,175,215,${a})`;
    ctx.beginPath();
    ctx.moveTo(0, p.y);
    ctx.lineTo(W, p.y);
    ctx.stroke();
  }
  return { vx, vy };
}

function drawPanel(p, t) {
  const bob = Math.sin(t * 0.8 + p.phase) * 0.08;
  const c = project(p.x, p.y + bob, p.z);
  const w = 1.25 * c.k;
  const h = 0.8 * c.k;
  const depth = Math.min(1, 6 / p.z);
  p.screen = { x: c.x, y: c.y };

  // Charco de luz en el suelo
  const floor = project(p.x, 0, p.z);
  const pool = ctx.createRadialGradient(floor.x, floor.y, 0, floor.x, floor.y, w * 0.9);
  pool.addColorStop(0, `rgba(170,200,255,${0.1 + p.lit * 0.18})`);
  pool.addColorStop(1, 'rgba(170,200,255,0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(floor.x, floor.y, w * 0.9, w * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.shadowColor = `rgba(140,184,255,${0.35 + p.lit * 0.5})`;
  ctx.shadowBlur = 18 + p.lit * 26;
  ctx.fillStyle = `rgba(10,15,26,${0.82})`;
  ctx.strokeStyle = `rgba(160,200,255,${(0.35 + p.lit * 0.6) * depth + 0.1})`;
  ctx.lineWidth = Math.max(0.6, c.k / 180);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();

  // Contenido: renglones que se revelan al inspeccionar
  const pad = w * 0.1;
  ctx.fillStyle = `rgba(140,184,255,${0.55 * depth})`;
  ctx.fillRect(-w / 2 + pad, -h / 2 + pad, w * 0.28, Math.max(1, h * 0.05));
  for (let i = 0; i < p.lines; i++) {
    const ly = -h / 2 + pad * 2 + i * h * 0.13;
    const lw = (w - pad * 2) * (0.5 + ((i * 37 + p.lines * 13) % 45) / 100);
    ctx.fillStyle = `rgba(200,215,240,${(0.08 + p.lit * 0.3) * depth})`;
    ctx.fillRect(-w / 2 + pad, ly, lw, Math.max(1, h * 0.035));
  }

  // Barrido de luz al inspeccionar
  if (p.scan >= 0 && p.scan <= 1) {
    const sy = -h / 2 + p.scan * h;
    const g = ctx.createLinearGradient(0, sy - h * 0.2, 0, sy + 2);
    g.addColorStop(0, 'rgba(140,184,255,0)');
    g.addColorStop(1, 'rgba(190,215,255,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, Math.max(-h / 2, sy - h * 0.2), w, Math.min(h * 0.2, sy + h / 2));
  }
  ctx.restore();
}

function drawAgent(t) {
  const base = project(agent.x, 0, agent.z);
  const top = project(agent.x, 1.25, agent.z);
  const k = base.k;
  const bodyH = base.y - top.y;
  const walking = agent.state === 'walk';

  // Anillo en el suelo
  const pulse = agent.state === 'inspect' ? 1 + Math.sin(t * 6) * 0.12 : 1;
  ctx.strokeStyle = 'rgba(170,205,255,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, k * 0.32 * pulse, k * 0.08 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  const halo = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, k * 0.4);
  halo.addColorStop(0, 'rgba(170,205,255,0.35)');
  halo.addColorStop(1, 'rgba(170,205,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, k * 0.4, k * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Silueta holográfica
  const sway = walking ? Math.sin(t * 7) * k * 0.012 : 0;
  ctx.save();
  ctx.translate(base.x + sway, 0);
  ctx.shadowColor = 'rgba(140,184,255,0.9)';
  ctx.shadowBlur = 22;
  const body = ctx.createLinearGradient(0, top.y, 0, base.y);
  body.addColorStop(0, 'rgba(220,235,255,0.75)');
  body.addColorStop(1, 'rgba(140,184,255,0.15)');
  ctx.fillStyle = body;
  const bw = k * 0.12;
  const headR = k * 0.055;
  ctx.beginPath();
  ctx.arc(0, top.y + headR, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-bw / 2, top.y + headR * 2.3, bw, bodyH * 0.45, bw * 0.4);
  ctx.fill();
  // Piernas que se alternan al caminar
  const step = walking ? Math.sin(t * 7) * k * 0.025 : 0;
  ctx.fillRect(-bw * 0.35 + step, top.y + headR * 2.3 + bodyH * 0.45, bw * 0.26, bodyH * 0.42);
  ctx.fillRect(bw * 0.09 - step, top.y + headR * 2.3 + bodyH * 0.45, bw * 0.26, bodyH * 0.42);
  ctx.restore();

  // El bocadillo flota sobre la cabeza, a un lado, sin salirse de la pantalla
  const side = base.x > W * 0.62 ? -1 : 1;
  let x = side > 0 ? base.x + k * 0.12 : base.x - k * 0.12 - thoughtBox.width;
  x = Math.min(W - thoughtBox.width - 16, Math.max(16, x));
  // En móvil va bajo los pies, donde hay sitio, para no tapar los paneles
  const y = W < 700 ? base.y + 18 : top.y - 86;
  thoughtBox.x += (x - thoughtBox.x) * 0.08;
  thoughtBox.y += (y - thoughtBox.y) * 0.08;
  thoughtEl.style.transform = `translate(${thoughtBox.x}px, ${thoughtBox.y}px)`;
}

function drawLinks(t) {
  for (const link of links) {
    const a = PANELS[link.a].screen;
    const b = PANELS[link.b].screen;
    if (!a || !b) continue;
    const grow = Math.min(1, link.t);
    const ex = a.x + (b.x - a.x) * grow;
    const ey = a.y + (b.y - a.y) * grow;
    const alpha = link.alpha;
    ctx.save();
    ctx.shadowColor = 'rgba(140,184,255,0.9)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = `rgba(170,205,255,${0.55 * alpha})`;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 20;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    // Chispa que recorre la conexión
    if (grow >= 1) {
      const u = (t * 0.35 + link.seed) % 1;
      ctx.fillStyle = `rgba(230,240,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(230,240,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(ex, ey, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawParticles(t, dt) {
  for (const p of particles) {
    p.y -= p.s * dt;
    if (p.y < -0.02) {
      p.y = 1.02;
      p.x = Math.random();
    }
    const a = 0.25 + Math.sin(t * 1.5 + p.tw) * 0.2;
    ctx.fillStyle = `rgba(200,220,255,${Math.max(0, a)})`;
    ctx.beginPath();
    ctx.arc(p.x * W + (mouse.sx - 0.5) * -20 * p.r, p.y * H, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Un paso de la «mente» de la portada: caminar, inspeccionar, conectar ideas. */
function think(dt) {
  if (fading > 0) {
    fading -= dt;
    for (const p of PANELS) p.target = 0;
    for (const l of links) l.alpha = Math.max(0, fading / 2);
    if (fading <= 0) {
      links = [];
      agent.visited = 0;
      agent.prev = null;
    }
  }

  const target = PANELS[agent.to];
  // Se detiene un poco delante del panel
  const gx = target.x * 0.85;
  const gz = target.z - 1.1;
  if (agent.state === 'walk') {
    const dx = gx - agent.x;
    const dz = gz - agent.z;
    const dist = Math.hypot(dx, dz);
    const speed = 1.6 * dt;
    if (dist <= speed) {
      agent.x = gx;
      agent.z = gz;
      agent.state = 'inspect';
      agent.wait = 1.6;
      target.scan = 0;
    } else {
      agent.x += (dx / dist) * speed;
      agent.z += (dz / dist) * speed;
    }
  } else {
    agent.wait -= dt;
    if (target.scan >= 0) target.scan += dt / 1.2;
    target.target = 1;
    if (agent.wait <= 0) {
      target.scan = -1;
      // Conecta con algo que ya había visto
      if (agent.prev !== null && fading <= 0) {
        const exists = links.some((l) => (l.a === agent.prev && l.b === agent.to) || (l.b === agent.prev && l.a === agent.to));
        if (!exists) links.push({ a: agent.prev, b: agent.to, t: 0, alpha: 1, seed: Math.random() });
      }
      agent.prev = agent.to;
      agent.visited++;
      if (agent.visited >= 9 && fading <= 0) fading = 2.4;
      let next;
      do next = Math.floor(Math.random() * PANELS.length);
      while (next === agent.to);
      agent.to = next;
      agent.state = 'walk';
    }
  }

  for (const p of PANELS) p.lit += (p.target - p.lit) * Math.min(1, dt * 2.5);
  for (const l of links) l.t += dt * 0.9;
}

let last = performance.now();
let running = true;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  mouse.sx += (mouse.x - mouse.sx) * 0.04;
  mouse.sy += (mouse.y - mouse.sy) * 0.04;

  think(dt);
  ctx.clearRect(0, 0, W, H);
  drawFloor(t);

  // De lejos a cerca, con la IA en su sitio
  const items = [...PANELS.map((p) => ({ z: p.z, draw: () => drawPanel(p, t) })), { z: agent.z, draw: () => drawAgent(t) }];
  items.sort((a, b) => b.z - a.z).forEach((it) => it.draw());
  drawLinks(t);
  drawParticles(t, dt);

  if (running) requestAnimationFrame(frame);
}

resize();
addEventListener('resize', resize);
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX / innerWidth;
  mouse.y = e.clientY / innerHeight;
});

if (reduceMotion) {
  // Una sola imagen fija: algunos paneles estudiados y conectados
  [0, 2, 3, 4].forEach((i) => (PANELS[i].lit = 1));
  links = [
    { a: 0, b: 2, t: 1, alpha: 1, seed: 0.2 },
    { a: 2, b: 3, t: 1, alpha: 1, seed: 0.5 },
    { a: 3, b: 4, t: 1, alpha: 1, seed: 0.8 },
  ];
  running = false;
  requestAnimationFrame(frame);
  requestAnimationFrame(() => requestAnimationFrame(frame));
} else {
  // Solo se anima mientras la portada está a la vista
  new IntersectionObserver(([entry]) => {
    const visible = entry.isIntersecting;
    if (visible && !running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
    running = visible;
  }).observe(hero);
  requestAnimationFrame(frame);
}
