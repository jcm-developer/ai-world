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
  { x: -3.2, z: 5, y: 1.3 },
  { x: -1.2, z: 9.5, y: 1.8 },
  { x: 1.3, z: 8, y: 1.6 },
  { x: 3, z: 5.6, y: 1.4 },
  { x: 0.2, z: 13, y: 2.1 },
].map((p, i) => ({ ...p, phase: i * 1.7, lit: 0, target: 0, scan: -1 }));

const thoughtEl = document.getElementById('agent-thought');
const thoughtBox = { width: 290, x: 0, y: 0 };

const agent = { x: 0, z: 6, from: null, to: 0, t: 0, state: 'walk', wait: 0, prev: null, visited: 0 };
let links = [];
let fading = 0;

const particles = Array.from({ length: 50 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1 + 0.3,
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

function drawFloor() {
  const vy = horizon + (mouse.sy - 0.5) * -24;
  const hy = vy + (focal * 1.7) / 40;

  // Horizonte: una sola línea fina que se desvanece en los extremos
  const line = ctx.createLinearGradient(0, 0, W, 0);
  line.addColorStop(0, 'rgba(140,184,255,0)');
  line.addColorStop(0.5, 'rgba(170,205,255,0.4)');
  line.addColorStop(1, 'rgba(140,184,255,0)');
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hy);
  ctx.lineTo(W, hy);
  ctx.stroke();

  // Unas pocas líneas de fuga, apenas insinuadas
  for (let i = -5; i <= 5; i++) {
    const far = project(i * 2.4, 0, 40);
    const near = project(i * 2.4, 0, 0.8);
    const g = ctx.createLinearGradient(0, far.y, 0, H);
    g.addColorStop(0, 'rgba(150,175,215,0)');
    g.addColorStop(1, 'rgba(150,175,215,0.07)');
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(near.x, near.y);
    ctx.stroke();
  }
}

function drawPanel(p, t) {
  const bob = Math.sin(t * 0.6 + p.phase) * 0.06;
  const c = project(p.x, p.y + bob, p.z);
  const w = 1.2 * c.k;
  const h = 0.76 * c.k;
  const depth = Math.min(1, 6 / p.z);
  p.screen = { x: c.x, y: c.y };

  ctx.save();
  ctx.translate(c.x, c.y);
  // Relleno del color del fondo para que los paneles se tapen entre sí
  ctx.fillStyle = 'rgba(6,9,14,0.92)';
  ctx.shadowColor = 'rgba(140,184,255,0.6)';
  ctx.shadowBlur = p.lit * 16;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(170,205,255,${(0.16 + p.lit * 0.5) * depth + 0.04})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);

  // Al inspeccionar, una línea de luz recorre el panel de arriba abajo
  if (p.scan >= 0 && p.scan <= 1) {
    const sy = -h / 2 + p.scan * h;
    ctx.strokeStyle = `rgba(210,228,255,${0.7 * Math.sin(p.scan * Math.PI)})`;
    ctx.beginPath();
    ctx.moveTo(-w / 2, sy);
    ctx.lineTo(w / 2, sy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAgent(t) {
  const base = project(agent.x, 0, agent.z);
  const k = base.k;
  const bob = agent.state === 'walk' ? Math.sin(t * 5) * 0.02 : Math.sin(t * 1.6) * 0.03;
  const core = project(agent.x, 1.05 + bob, agent.z);

  // Anillo fino en el suelo, que respira al inspeccionar
  const pulse = agent.state === 'inspect' ? 1 + Math.sin(t * 4) * 0.1 : 1;
  ctx.strokeStyle = 'rgba(170,205,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, k * 0.26 * pulse, k * 0.065 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Un hilo de luz une el suelo con la presencia
  const beam = ctx.createLinearGradient(0, core.y, 0, base.y);
  beam.addColorStop(0, 'rgba(200,222,255,0.55)');
  beam.addColorStop(1, 'rgba(200,222,255,0)');
  ctx.strokeStyle = beam;
  ctx.beginPath();
  ctx.moveTo(core.x, core.y);
  ctx.lineTo(base.x, base.y);
  ctx.stroke();

  // La IA: un punto de luz con un halo suave
  const r = Math.max(2.5, k * 0.035);
  const halo = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, r * 7);
  halo.addColorStop(0, 'rgba(170,205,255,0.4)');
  halo.addColorStop(1, 'rgba(170,205,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(core.x, core.y, r * 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eef4ff';
  ctx.beginPath();
  ctx.arc(core.x, core.y, r, 0, Math.PI * 2);
  ctx.fill();

  // El pensamiento sigue a la IA, a un lado, sin salirse de la pantalla
  const side = core.x > W * 0.62 ? -1 : 1;
  let x = side > 0 ? core.x + r * 6 : core.x - r * 6 - thoughtBox.width;
  x = Math.min(W - thoughtBox.width - 16, Math.max(16, x));
  // En móvil va bajo el anillo, donde hay sitio, para no tapar los paneles
  const y = W < 700 ? base.y + 20 : core.y - 70;
  thoughtBox.x += (x - thoughtBox.x) * 0.06;
  thoughtBox.y += (y - thoughtBox.y) * 0.06;
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
    ctx.strokeStyle = `rgba(170,205,255,${0.3 * alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // Un punto recorre la conexión (o la va trazando)
    const u = grow >= 1 ? (t * 0.25 + link.seed) % 1 : grow;
    ctx.fillStyle = `rgba(235,242,255,${0.9 * alpha})`;
    ctx.beginPath();
    ctx.arc(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(t, dt) {
  for (const p of particles) {
    p.y -= p.s * dt;
    if (p.y < -0.02) {
      p.y = 1.02;
      p.x = Math.random();
    }
    const a = 0.18 + Math.sin(t * 1.2 + p.tw) * 0.12;
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
    if (target.scan >= 0) target.scan += dt / 1.4;
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
      if (agent.visited >= 7 && fading <= 0) fading = 2.4;
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
  drawFloor();

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
  [0, 1, 2].forEach((i) => (PANELS[i].lit = 1));
  links = [
    { a: 0, b: 1, t: 1, alpha: 1, seed: 0.2 },
    { a: 1, b: 2, t: 1, alpha: 1, seed: 0.5 },
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
