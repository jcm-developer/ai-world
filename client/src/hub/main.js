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

const grid = document.getElementById('grid');
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

function render(scenarios) {
  grid.replaceChildren(...scenarios.map(card));
}

function card(s) {
  const playable = s.status === 'disponible';
  const el = document.createElement(playable ? 'a' : 'article');
  el.className = `card${playable ? ' playable' : ''}`;
  el.style.setProperty('--card-accent', s.accent);
  if (playable) el.href = `/play.html?s=${encodeURIComponent(s.id)}`;

  el.innerHTML = `
    <div class="card-top">
      <span class="card-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[s.icon] ?? ''}</svg></span>
      <span class="badge badge-${s.status}"></span>
    </div>
    <h2 class="card-title"></h2>
    <div class="card-meta"></div>
    <p class="card-desc"></p>
    <div class="card-foot">
      <span class="card-live"></span>
      ${playable ? '<span class="card-cta">Entrar <span aria-hidden="true">→</span></span>' : ''}
    </div>`;

  el.querySelector('.badge').textContent = STATUS_LABEL[s.status] ?? s.status;
  el.querySelector('.card-title').textContent = s.title;
  el.querySelector('.card-meta').textContent = `${s.tagline} · ${s.agents}`;
  el.querySelector('.card-desc').textContent = s.description;
  el.querySelector('.card-live').textContent = liveText(s);
  if (s.live?.viewers) el.querySelector('.card-live').classList.add('on');
  return el;
}

/** Resumen del estado en vivo de un escenario jugable. */
function liveText(s) {
  if (s.status !== 'disponible') return '';
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
