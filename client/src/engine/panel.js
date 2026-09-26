// Panel lateral minimalista y plegable, común a todos los escenarios:
// estado, pensamientos (uno por agente), cifras del escenario, memoria reciente,
// actividad y controles (pausar/reanudar, reiniciar). También el aviso de fin de partida.

const MAX_ACTIVITY = 7;
const COLLAPSE_KEY = 'aiworld.panelCollapsed';

const $ = (sel) => document.querySelector(sel);

const STATE_TEXT = {
  activo: 'Explorando',
  pensando: 'Pensando…',
  pausado: 'En pausa',
  detenido: 'Detenido',
  en_espera: 'En espera',
  en_reposo: 'En reposo',
  terminado: 'Partida terminada',
  desconectado: 'Sin conexión',
};

export function createPanel({ onControl }) {
  const panel = $('#panel');
  const toggle = $('#panel-toggle');
  const titleEl = $('#scenario-title');
  const status = $('#status');
  const statusText = status.querySelector('.status-text');
  const thoughtsEl = $('#thoughts');
  const thoughtsTitle = $('#thoughts-title');
  const statsEl = $('#stats');
  const notesEl = $('#notes');
  const activityEl = $('#activity');
  const pauseBtn = $('#agent-toggle');
  const resetBtn = $('#agent-reset');
  const modelEl = $('#model');
  const banner = $('#connection-banner');
  const finishedEl = $('#finished');

  let agents = new Map(); // id → { def, memory, thought, thinking }
  let lastStatus = null;
  let connected = false;
  let knownNoteIds = new Set();
  let countdown = null;

  try {
    if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
  } catch {
    /* sin almacenamiento: se ignora */
  }

  toggle.addEventListener('click', () => setCollapsed(!panel.classList.contains('collapsed')));
  pauseBtn.addEventListener('click', () => {
    const anyActive = lastStatus?.agents.some((a) => !a.paused && a.state !== 'detenido');
    onControl(anyActive ? 'pause' : 'resume');
  });
  resetBtn.addEventListener('click', () => {
    if (confirm('¿Reiniciar la partida? Se borrará lo que la IA ha aprendido en este escenario.')) onControl('reset');
  });
  finishedEl.querySelector('[data-action="reset"]').addEventListener('click', () => onControl('reset'));
  // Pulsar fuera de la tarjeta la cierra para poder mirar la escena
  finishedEl.addEventListener('click', (e) => {
    if (e.target === finishedEl) finishedEl.hidden = true;
  });

  function setCollapsed(collapsed) {
    panel.classList.toggle('collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Mostrar panel' : 'Plegar panel');
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  }

  const multi = () => agents.size > 1;

  // --- Estado --------------------------------------------------------------------

  function renderStatus() {
    clearInterval(countdown);
    if (!connected) {
      status.dataset.state = 'desconectado';
      statusText.textContent = STATE_TEXT.desconectado;
      pauseBtn.disabled = resetBtn.disabled = true;
      return;
    }
    const s = lastStatus;
    if (!s) return;
    pauseBtn.disabled = resetBtn.disabled = false;
    pauseBtn.textContent = s.agents.some((a) => !a.paused && a.state !== 'detenido') ? 'Pausar' : 'Reanudar';
    pauseBtn.disabled = Boolean(s.finished);
    const models = [...new Set(s.agents.map((a) => a.model))];
    modelEl.textContent = models.join(' · ');
    modelEl.title = modelEl.textContent;

    // Estado combinado: el más relevante entre los agentes
    const states = s.agents.map((a) => a.state);
    let state = ['detenido', 'terminado', 'en_espera', 'pausado', 'en_reposo'].find((st) => states.includes(st)) ?? 'activo';
    if (state === 'activo' && [...agents.values()].some((a) => a.thinking)) state = 'pensando';
    status.dataset.state = state;
    status.title = s.agents.map((a) => a.halted || a.lastError).filter(Boolean).join(' · ');
    statusText.textContent = STATE_TEXT[state] ?? state;

    // Cuenta atrás durante el backoff por límite de peticiones
    const until = Math.max(0, ...s.agents.map((a) => a.backoffUntil || 0));
    if (state === 'en_espera' && until) {
      const tickDown = () => {
        const secs = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        statusText.textContent = `En espera · ${secs} s`;
        if (secs <= 0) clearInterval(countdown);
      };
      tickDown();
      countdown = setInterval(tickDown, 1000);
    }
  }

  // --- Pensamientos ------------------------------------------------------------

  function renderThoughts() {
    thoughtsTitle.textContent = multi() ? 'Pensamientos' : 'Último pensamiento';
    thoughtsEl.replaceChildren();
    for (const a of agents.values()) {
      const row = document.createElement('p');
      row.className = 'last-thought';
      if (multi()) row.append(agentTag(a.def));
      row.append(document.createTextNode(a.thought || '—'));
      thoughtsEl.append(row);
    }
  }

  // --- Memoria -----------------------------------------------------------------

  function renderNotes() {
    const all = [];
    for (const a of agents.values()) for (const n of a.memory?.notes ?? []) all.push({ ...n, def: a.def });
    all.sort((x, y) => y.id - x.id);

    notesEl.replaceChildren();
    if (!all.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Aún no ha guardado nada.';
      notesEl.append(li);
    }
    const firstRender = knownNoteIds.size === 0;
    for (const note of all) {
      const li = document.createElement('li');
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.textContent = `#${note.tick}`;
      li.append(tick);
      if (multi()) li.append(agentTag(note.def));
      li.append(document.createTextNode(note.text));
      if (!firstRender && !knownNoteIds.has(note.id)) li.classList.add('fresh');
      notesEl.append(li);
    }
    knownNoteIds = new Set(all.map((n) => n.id));
  }

  function agentTag(def) {
    const tag = document.createElement('span');
    tag.className = 'agent-tag';
    tag.style.setProperty('--agent', def.color);
    tag.textContent = def.name;
    return tag;
  }

  return {
    /** Estado completo al entrar en el escenario (o al reiniciar). */
    init({ scenario, agents: defs, stats, status: st }) {
      titleEl.textContent = scenario.title;
      document.title = `${scenario.title} · AI World`;
      // Los personajes no autónomos (sospechosos…) no tienen pensamientos ni memoria propios
      agents = new Map(defs.filter((d) => d.role !== 'npc').map((d) => [d.id, { def: d, memory: d.memory, thought: d.lastThought?.text ?? '', thinking: false }]));
      knownNoteIds = new Set();
      activityEl.replaceChildren();
      renderThoughts();
      renderNotes();
      this.setStats(stats);
      this.setStatus(st);
      this.showFinished(st.finished);
    },

    setConnected(value) {
      connected = value;
      banner.hidden = value;
      renderStatus();
    },

    setStatus(s) {
      lastStatus = s;
      renderStatus();
    },

    setThinking(agentId, value) {
      const a = agents.get(agentId);
      if (a) a.thinking = value;
      renderStatus();
    },

    setThought(agentId, text) {
      const a = agents.get(agentId);
      if (!a) return;
      a.thought = text;
      renderThoughts();
    },

    setMemory(agentId, memory) {
      const a = agents.get(agentId);
      if (!a) return;
      a.memory = memory;
      renderNotes();
    },

    /** Cifras que define cada escenario: [{ label, value }]. */
    setStats(stats) {
      statsEl.replaceChildren();
      statsEl.hidden = !stats.length;
      statsEl.style.gridTemplateColumns = `repeat(${Math.max(1, stats.length)}, 1fr)`;
      for (const s of stats) {
        const div = document.createElement('div');
        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = s.value;
        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = s.label;
        div.append(value, label);
        statsEl.append(div);
      }
    },

    addActivity(action) {
      const li = document.createElement('li');
      if (!action.ok) li.classList.add('fail');
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.textContent = `#${action.tick}`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = action.type;
      const text = document.createElement('span');
      text.className = 'text';
      text.textContent = action.summary;
      li.title = action.summary;
      li.append(tick);
      const a = agents.get(action.agentId);
      if (multi() && a) li.append(agentTag(a.def));
      li.append(name, text);
      activityEl.prepend(li);
      while (activityEl.children.length > MAX_ACTIVITY) activityEl.lastChild.remove();
    },

    /** Muestra u oculta el aviso de fin de partida. */
    showFinished(result) {
      finishedEl.hidden = !result;
      if (!result) return;
      finishedEl.querySelector('.finished-label').textContent = result.helped ? 'Partida terminada · con ayuda humana' : 'Partida terminada';
      finishedEl.querySelector('.finished-outcome').textContent = result.outcome;
      finishedEl.querySelector('.finished-summary').textContent = result.summary ?? '';
    },
  };
}
