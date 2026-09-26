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

/* ---------- Constelación de la portada (canvas 2D) ---------- */

// Unas pocas pistas repartidas por el fondo. Una mente (un punto de luz) viaja
// despacio de una a otra; al llegar la ilumina y la une con la anterior con un
// hilo fino, como las conexiones de la Sala Meridiano. Los hilos se desvanecen.

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const hero = document.querySelector('.hero');

let W = 0;
let H = 0;
const mouse = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 };

// Siempre la misma constelación: aleatorio con semilla
function seeded(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}
const rand = seeded(1313);

// Las pistas evitan la zona del titular (en móvil, toda la franja central)
const narrow = innerWidth < 700;
const CLUES = [];
while (CLUES.length < (narrow ? 16 : 24)) {
  const x = 0.04 + rand() * 0.92;
  const y = 0.08 + rand() * 0.86;
  if (narrow ? y > 0.3 && y < 0.68 : x > 0.2 && x < 0.8 && y > 0.22 && y < 0.7) continue;
  CLUES.push({ x, y, depth: 0.35 + rand() * 0.65, tw: rand() * Math.PI * 2, lit: 0, litUntil: 0, ring: -1 });
}

const mind = { from: 0, to: 0, t: 1, dur: 1, rest: 0.6, history: [0], trail: [] };
let links = [];
let clock = 0;

function resize() {
  const r = hero.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = r.width;
  H = r.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Posición en pantalla de una pista, con un paralaje muy leve según su profundidad. */
function screenOf(c) {
  return {
    x: c.x * W + (mouse.sx - 0.5) * -34 * c.depth,
    y: c.y * H + (mouse.sy - 0.5) * -22 * c.depth,
  };
}

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** Elige la siguiente pista entre las más cercanas que no haya visitado hace poco. */
function nextClue() {
  const here = CLUES[mind.to];
  const options = CLUES.map((c, i) => ({ i, d: Math.hypot((c.x - here.x) * W, (c.y - here.y) * H) }))
    .filter((o) => !mind.history.includes(o.i))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  return options[Math.floor(rand() * options.length)] ?? { i: Math.floor(rand() * CLUES.length), d: 300 };
}

function think(dt) {
  clock += dt;
  if (mind.t < 1) {
    mind.t = Math.min(1, mind.t + dt / mind.dur);
    if (mind.t >= 1) {
      // Llega: ilumina la pista y la conecta con la anterior
      const clue = CLUES[mind.to];
      clue.litUntil = clock + 14;
      clue.ring = 0;
      if (mind.from !== mind.to) links.push({ a: mind.from, b: mind.to, grow: 0, born: clock });
      mind.rest = 1.4;
    }
  } else {
    mind.rest -= dt;
    if (mind.rest <= 0) {
      const next = nextClue();
      mind.from = mind.to;
      mind.to = next.i;
      mind.t = 0;
      mind.dur = 2.4 + next.d / 260;
      mind.history = [...mind.history.slice(-6), next.i];
    }
  }

  for (const c of CLUES) {
    const target = clock < c.litUntil ? 1 : 0;
    c.lit += (target - c.lit) * Math.min(1, dt * 1.5);
    if (c.ring >= 0) c.ring = c.ring + dt / 1.8 > 1 ? -1 : c.ring + dt / 1.8;
  }
  for (const l of links) l.grow = Math.min(1, l.grow + dt / 1.4);
  links = links.filter((l) => clock - l.born < 16);
}

function mindPosition() {
  const a = screenOf(CLUES[mind.from]);
  const b = screenOf(CLUES[mind.to]);
  const u = ease(mind.t);
  // Un arco suave en lugar de una línea recta
  const bend = Math.sin(u * Math.PI) * Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.12);
  const nx = -(b.y - a.y);
  const ny = b.x - a.x;
  const len = Math.hypot(nx, ny) || 1;
  return { x: a.x + (b.x - a.x) * u + (nx / len) * bend, y: a.y + (b.y - a.y) * u + (ny / len) * bend };
}

function draw(t) {
  ctx.clearRect(0, 0, W, H);

  // Hilos entre pistas: aparecen trazándose y se apagan despacio
  for (const l of links) {
    const age = clock - l.born;
    const fade = age > 11 ? Math.max(0, 1 - (age - 11) / 5) : 1;
    const a = screenOf(CLUES[l.a]);
    const b = screenOf(CLUES[l.b]);
    const g = ease(l.grow);
    ctx.strokeStyle = `rgba(170,205,255,${0.26 * fade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * g, a.y + (b.y - a.y) * g);
    ctx.stroke();
  }

  // Pistas
  for (const c of CLUES) {
    const p = screenOf(c);
    const tw = Math.sin(t * 0.9 + c.tw) * 0.05;
    if (c.lit > 0.02) {
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
      halo.addColorStop(0, `rgba(170,205,255,${0.22 * c.lit})`);
      halo.addColorStop(1, 'rgba(170,205,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(215,228,250,${0.16 + c.depth * 0.12 + c.lit * 0.6 + tw})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.7 + c.depth * 0.8 + c.lit * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // Un anillo que se abre una vez al descubrirla
    if (c.ring >= 0) {
      ctx.strokeStyle = `rgba(190,215,255,${0.5 * (1 - c.ring)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 + ease(c.ring) * 22, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // La mente y su estela
  const m = mindPosition();
  mind.trail.push(m);
  if (mind.trail.length > 36) mind.trail.shift();
  for (let i = 1; i < mind.trail.length; i++) {
    const p0 = mind.trail[i - 1];
    const p1 = mind.trail[i];
    ctx.strokeStyle = `rgba(200,222,255,${(i / mind.trail.length) * 0.35})`;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  const halo = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 22);
  halo.addColorStop(0, 'rgba(170,205,255,0.32)');
  halo.addColorStop(1, 'rgba(170,205,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2f6ff';
  ctx.beginPath();
  ctx.arc(m.x, m.y, 2.1, 0, Math.PI * 2);
  ctx.fill();
}

let last = performance.now();
let running = true;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  mouse.sx += (mouse.x - mouse.sx) * 0.03;
  mouse.sy += (mouse.y - mouse.sy) * 0.03;
  think(dt);
  draw(now / 1000);
  if (running) requestAnimationFrame(frame);
}

resize();
addEventListener('resize', resize);
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX / innerWidth;
  mouse.y = e.clientY / innerHeight;
});

if (reduceMotion) {
  // Una sola imagen fija: un pequeño recorrido ya trazado
  const path = [0, 3, 7, 11, 5];
  path.forEach((i, n) => {
    CLUES[i].litUntil = Infinity;
    CLUES[i].lit = 1;
    if (n > 0) links.push({ a: path[n - 1], b: i, grow: 1, born: Infinity });
  });
  mind.from = mind.to = path.at(-1);
  links.forEach((l) => (l.born = 0));
  running = false;
  requestAnimationFrame(frame);
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
