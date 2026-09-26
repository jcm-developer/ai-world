// Hablar con la IA: mantén pulsada la T para hablar y suéltala para enviar (pulsar para hablar).
// La voz se transcribe en el navegador (Web Speech API). Si no hay reconocimiento de voz o
// no hay permiso para el micrófono, la T abre un campo de texto.
//
// El navegador solo envía el texto: el servidor decide si la IA te oye (distancia) y responde.

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
const CAPTION_MS = 6000;
const NOTICE_MS = 4000;
const MAX_LISTEN_MS = 30000; // aunque no sueltes la T, se envía pasado este tiempo
const FAST_FAIL_MS = 400; // si el reconocimiento se corta nada más empezar…
const MAX_FAST_FAILS = 3; // …tantas veces seguidas, se pasa a escribir

/**
 * @param {object} opts
 * @param {() => boolean} opts.canTalk si ahora mismo puedes hablar (en primera persona, dentro de la sala)
 * @param {() => void} opts.onStart empiezas a hablar (la IA se calla)
 * @param {(text: string) => void} opts.onSend mensaje terminado
 */
export function createTalk({ canTalk, onStart, onSend }) {
  const box = document.getElementById('talk');
  const label = box.querySelector('.talk-label');
  const live = box.querySelector('.talk-live');
  const form = box.querySelector('.talk-form');
  const input = form.querySelector('input');
  const caption = document.getElementById('caption');
  const hint = document.getElementById('talk-hint');

  let mode = Recognition ? 'voice' : 'text';
  let rec = null;
  let listening = false;
  let held = false; // la T sigue pulsada
  let startedAt = 0;
  let fastFails = 0;
  let listenTimer = 0;
  let finalText = '';
  let interimText = '';
  let captionTimer = 0;
  let maxLength = 200;

  // Mientras hablas o hay un subtítulo, la ayuda de teclas de la primera persona se oculta
  const syncBusy = () => document.body.classList.toggle('talk-busy', !box.hidden || !caption.hidden);

  function open(state) {
    clearTimeout(captionTimer);
    caption.hidden = true;
    box.hidden = false;
    box.dataset.state = state;
    syncBusy();
  }

  function close() {
    box.hidden = true;
    syncBusy();
    form.hidden = true;
    live.textContent = '';
    input.value = '';
    input.blur();
  }

  function send(text) {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
    close();
    if (clean) onSend(clean);
  }

  // --- Voz ---------------------------------------------------------------------------

  function startListening() {
    if (listening) return;
    held = true;
    fastFails = 0;
    finalText = '';
    interimText = '';
    if (!startRecognition()) return;
    listening = true;
    label.textContent = 'Escuchando… suelta la T para enviar';
    live.textContent = '';
    open('listening');
    onStart?.();
    clearTimeout(listenTimer);
    listenTimer = setTimeout(stopListening, MAX_LISTEN_MS);
  }

  /**
   * Una sesión de reconocimiento. Chrome la corta solo (silencio, red, el aviso de permiso del
   * micrófono…): si la T sigue pulsada, se abre otra y se conserva lo ya transcrito.
   */
  function startRecognition() {
    rec = new Recognition();
    rec.lang = 'es-ES';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interimText += e.results[i][0].transcript;
      }
      live.textContent = `${finalText}${interimText}`;
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        giveUp('No hay acceso al micrófono: pulsa T para escribir tu mensaje.');
      }
    };
    rec.onend = () => {
      if (!listening) return;
      // Lo reconocido hasta ahora se da por bueno antes de abrir otra sesión
      finalText += interimText;
      interimText = '';
      if (held) {
        fastFails = performance.now() - startedAt < FAST_FAIL_MS ? fastFails + 1 : 0;
        if (fastFails >= MAX_FAST_FAILS) giveUp('El reconocimiento de voz no responde: pulsa T para escribir tu mensaje.');
        else startRecognition();
        return;
      }
      finish();
    };
    startedAt = performance.now();
    try {
      rec.start();
      return true;
    } catch {
      return false;
    }
  }

  function finish() {
    listening = false;
    clearTimeout(listenTimer);
    send(finalText);
  }

  /** Sin micrófono o sin reconocimiento de voz: a partir de ahora, por escrito. */
  function giveUp(message) {
    mode = 'text';
    listening = false;
    held = false;
    clearTimeout(listenTimer);
    close();
    notice(message);
  }

  function stopListening() {
    held = false;
    if (!listening) return;
    label.textContent = 'Enviando…';
    rec.stop(); // al terminar llega onend con el texto final
  }

  // --- Texto --------------------------------------------------------------------------

  function openInput() {
    label.textContent = 'Escribe y pulsa Intro · Esc para cancelar';
    live.textContent = '';
    form.hidden = false;
    input.maxLength = maxLength;
    open('typing');
    // Se enfoca en el siguiente fotograma para que la T no acabe escrita en el campo
    requestAnimationFrame(() => input.focus());
    onStart?.();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    e.stopPropagation(); // mientras escribes, las teclas no mueven la cámara
  });
  input.addEventListener('blur', () => {
    if (!box.hidden && box.dataset.state === 'typing' && !input.value.trim()) close();
  });

  // --- Teclado ------------------------------------------------------------------------

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyT' || e.repeat || e.target.closest?.('input, textarea')) return;
    if (!canTalk()) return;
    e.preventDefault();
    if (mode === 'voice') startListening();
    else openInput();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyT') stopListening();
  });
  // Si cambias de pestaña con la T pulsada, el navegador no avisa al soltarla: se envía ya.
  // (No se usa «blur»: el aviso de permiso del micrófono también quita el foco a la página.)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopListening();
  });

  // --- Subtítulos y avisos ----------------------------------------------------------

  function showCaption(who, text, variant) {
    clearTimeout(captionTimer);
    caption.dataset.variant = variant;
    caption.querySelector('.caption-who').textContent = who;
    caption.querySelector('.caption-text').textContent = text;
    caption.hidden = !box.hidden; // no tapa lo que estás diciendo
    syncBusy();
    captionTimer = setTimeout(() => {
      caption.hidden = true;
      syncBusy();
    }, variant === 'notice' ? NOTICE_MS : CAPTION_MS);
  }

  function notice(text) {
    showCaption('', text, 'notice');
  }

  return {
    get mode() {
      return mode;
    },

    configure({ maxLength: max } = {}) {
      if (Number.isFinite(max)) maxLength = max;
    },

    /** Mensaje "visitor:said" del servidor: lo que dijiste tú (o otro visitante) y si te oyó. */
    showSaid(p) {
      if (p.mine && !p.heard) notice(p.reason || 'La IA no te ha oído.');
      else showCaption(p.mine ? 'Tú' : 'Visitante', p.text, p.mine ? 'mine' : 'other');
    },

    /** Indicación junto a la mira: si la IA te puede oír desde donde estás. */
    setReach(state) {
      // state: null (no aplica), 'near' o 'far'
      hint.hidden = !state || !box.hidden;
      if (!state) return;
      hint.dataset.state = state;
      hint.innerHTML = state === 'near' ? '<kbd>T</kbd> hablar' : 'Acércate a la IA para hablarle';
    },
  };
}
