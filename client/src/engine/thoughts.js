// Pensamientos: texto flotante y discreto junto al avatar, escrito letra a letra.
// Se atenúa tras unos segundos y muestra "···" mientras el modelo está pensando.

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const CHAR_MS = 22;
const VISIBLE_MS = 9000;

export function createThoughts(anchor) {
  const el = document.createElement('div');
  el.className = 'thought';
  anchor.add(new CSS2DObject(el));

  let typing = null;
  let dimTimer = null;
  let current = '';

  // kind: 'thought' (pensamiento) o 'said' (lo que dice en voz alta a un visitante)
  function show(text, kind = 'thought') {
    current = text;
    el.classList.toggle('said', kind === 'said');
    clearInterval(typing);
    clearTimeout(dimTimer);
    el.classList.remove('dim', 'thinking');
    el.classList.add('visible');
    el.textContent = '';
    let i = 0;
    typing = setInterval(() => {
      i += 1;
      el.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typing);
    }, CHAR_MS);
    dimTimer = setTimeout(() => el.classList.add('dim'), VISIBLE_MS);
  }

  /** Indicador de "pensando…" (solo si no hay un pensamiento reciente a la vista). */
  function setThinking(thinking) {
    const showingFresh = el.classList.contains('visible') && !el.classList.contains('dim') && current;
    if (thinking && !showingFresh) {
      el.textContent = '';
      el.classList.add('visible', 'thinking');
      el.classList.remove('said');
      el.classList.remove('dim');
    } else if (!thinking && el.classList.contains('thinking')) {
      el.classList.remove('thinking');
      if (current) {
        el.textContent = current;
        el.classList.add('dim');
      } else el.classList.remove('visible');
    }
  }

  /** Muestra un pensamiento anterior ya atenuado (al cargar la página). */
  function restore(text) {
    current = text;
    el.textContent = text;
    el.classList.add('visible', 'dim');
  }

  // --- Modo sincronizado con la voz: el texto avanza al ritmo del audio ---

  /** Empieza un pensamiento que se irá revelando con progress(). */
  function begin(text, kind = 'thought') {
    current = text;
    el.classList.toggle('said', kind === 'said');
    clearInterval(typing);
    clearTimeout(dimTimer);
    el.classList.remove('dim', 'thinking');
    el.classList.add('visible');
    el.textContent = '';
  }

  /** Revela la fracción indicada (0–1) del pensamiento en curso, sin cortar palabras. */
  function progress(fraction) {
    const n = Math.ceil(current.length * Math.min(1, Math.max(0, fraction)));
    const end = current.indexOf(' ', n);
    el.textContent = current.slice(0, end === -1 ? current.length : end);
  }

  /** Muestra el texto completo y lo atenúa pasado un rato. */
  function finish(text = current, kind) {
    current = text;
    if (kind) el.classList.toggle('said', kind === 'said');
    clearInterval(typing);
    clearTimeout(dimTimer);
    el.classList.remove('thinking', 'dim');
    el.classList.add('visible');
    el.textContent = text;
    dimTimer = setTimeout(() => el.classList.add('dim'), VISIBLE_MS);
  }

  /** Oculta cualquier pensamiento (al reiniciar la partida). */
  function clear() {
    current = '';
    clearInterval(typing);
    clearTimeout(dimTimer);
    el.textContent = '';
    el.classList.remove('visible', 'dim', 'thinking');
  }

  return { show, setThinking, restore, clear, begin, progress, finish };
}
