// Hablar con la IA: mantén pulsada la T para hablar y suéltala para enviar (pulsar para hablar).
// La voz se transcribe en el navegador (Web Speech API). Si no hay reconocimiento de voz o
// no hay permiso para el micrófono, la T abre un campo de texto.
//
// El navegador solo envía el texto: el servidor decide si la IA te oye (distancia) y responde.

const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
const CAPTION_MS = 6000;
const NOTICE_MS = 4000;

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
    rec = new Recognition();
    rec.lang = 'es-ES';
    rec.interimResults = true;
    rec.continuous = true;
    finalText = '';
    interimText = '';
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
        // Sin micrófono o sin permiso: a partir de ahora, por escrito
        mode = 'text';
        listening = false;
        close();
        notice('No hay acceso al micrófono: pulsa T para escribir tu mensaje.');
      }
    };
    rec.onend = () => {
      if (!listening) return;
      listening = false;
      send(`${finalText}${interimText}`);
    };
    try {
      rec.start();
    } catch {
      return;
    }
    listening = true;
    label.textContent = 'Escuchando… suelta la T para enviar';
    live.textContent = '';
    open('listening');
    onStart?.();
  }

  function stopListening() {
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
  window.addEventListener('blur', stopListening);

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
