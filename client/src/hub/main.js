// Hub: lista los escenarios con su estado y enlaza a los que se pueden jugar.

const REFRESH_MS = 5000;

const STATUS_LABEL = {
  disponible: 'Disponible',
  en_desarrollo: 'En desarrollo',
  proximamente: 'Próximamente',
};

// Iconos de línea fina (24×24) por escenario
const ICONS = {
  orbit: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19.5" cy="12" r="1.3" fill="currentColor"/>',
  key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20M17 12v3M20 12v2"/>',
  flag: '<path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/>',
  flask: '<path d="M10 3h4M10.5 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L13.5 9V3M7.5 15h9"/>',
  lens: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
  mask: '<path d="M4 7c3-1.5 13-1.5 16 0 0 7-3 11-8 11S4 14 4 7z"/><path d="M8.5 11.5h2M13.5 11.5h2"/>',
  link: '<circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/>',
  duel: '<path d="M5 19L19 5M14 5h5v5M19 19L5 5M5 10V5h5"/>',
  podium: '<path d="M3 20h18M9 20V9h6v11M3 20v-6h6M15 20v-4h6v4"/>',
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const grid = document.getElementById('grid');
const upcoming = document.getElementById('upcoming');
const upcomingSection = document.getElementById('upcoming-section');
const modeChip = document.getElementById('mode-chip');

async function load() {
  try {
    const res = await fetch('/api/scenarios');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    modeChip.hidden = !data.mock;
    render(data.scenarios);
  } catch {
    grid.innerHTML = '<div class="loading">No se puede conectar con el servidor. ¿Está arrancado?</div>';
  }
}

const icon = (s, size) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[s.icon] ?? ''}</svg>`;

/** Los mundos jugables van en tarjetas grandes; el resto, en la rejilla de «Lo que viene». */
function render(scenarios) {
  const playable = scenarios.filter((s) => s.status === 'disponible');
  const later = scenarios.filter((s) => s.status !== 'disponible');
  grid.replaceChildren(...playable.map(card));
  upcoming.replaceChildren(...later.map(upcomingItem));
  upcomingSection.hidden = later.length === 0;
}

function card(s, index) {
  const el = document.createElement('a');
  el.className = 'card';
  el.style.setProperty('--card-accent', s.accent);
  el.href = `/play.html?s=${encodeURIComponent(s.id)}`;

  el.innerHTML = `
    <div class="card-top">
      <span class="card-tag"><span class="card-n"></span><span class="card-tagline"></span></span>
      <span class="card-icon">${icon(s, 22)}</span>
    </div>
    <h2 class="card-title"></h2>
    <p class="card-desc"></p>
    <div class="card-foot">
      <span class="card-live"></span>
      <span class="card-cta">Entrar <span aria-hidden="true">→</span></span>
    </div>`;

  el.querySelector('.card-n').textContent = ROMAN[index] ?? String(index + 1);
  el.querySelector('.card-tagline').textContent = `${s.tagline} · ${s.agents}`;
  el.querySelector('.card-title').textContent = s.title;
  el.querySelector('.card-desc').textContent = s.description;
  el.querySelector('.card-live').textContent = liveText(s);
  if (s.live?.viewers) el.querySelector('.card-live').classList.add('on');
  return el;
}

function upcomingItem(s) {
  const li = document.createElement('li');
  li.style.setProperty('--card-accent', s.accent);
  li.innerHTML = `${icon(s, 22)}<strong></strong><span class="up-tag"></span><span class="up-desc"></span>`;
  li.querySelector('strong').textContent = s.title;
  li.querySelector('.up-tag').textContent = `${STATUS_LABEL[s.status] ?? s.status} · ${s.tagline}`;
  li.querySelector('.up-desc').textContent = s.description;
  return li;
}

/** Resumen del estado en vivo de un escenario jugable. */
function liveText(s) {
  const parts = [];
  if (s.live?.viewers) parts.push(`${s.live.viewers} mirando`);
  if (s.runs?.length) {
    const last = s.runs[0];
    const helped = last.helped ? ' con ayuda humana' : '';
    parts.push(last.outcome ? `Última: ${last.outcome.toLowerCase()} en ${last.ticks} turnos${helped}` : `Partida en curso${helped}`);
  } else if (s.tick) {
    parts.push(`${s.tick} ticks vividos`);
  } else {
    parts.push('Sin estrenar');
  }
  return parts.join(' · ');
}

load();
setInterval(load, REFRESH_MS);
