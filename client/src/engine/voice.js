// Voz de los agentes en el navegador.
// Reproduce el audio que genera el servidor o, como respaldo, lee el texto con la voz del
// navegador (Web Speech API). Las frases se dicen en orden (importante en una conversación),
// pero la cola es corta: si se acumulan demasiadas, se descartan las más antiguas.
//
// Informa del avance de cada frase (onStart / onProgress / onEnd) para que el texto en
// pantalla vaya al mismo ritmo que la voz.

export function createVoice({ onStart, onProgress, onEnd } = {}) {
  const audio = new Audio();
  audio.preload = 'auto';
  let enabled = false;
  let speaking = false;
  const queue = [];
  const MAX_QUEUE = 3;
  let current = null;
  let raf = 0;
  let spanishVoice = null;

  // Voz en español del navegador (para el respaldo)
  function pickSpanishVoice() {
    const voices = window.speechSynthesis?.getVoices() ?? [];
    spanishVoice = voices.find((v) => v.lang === 'es-ES') ?? voices.find((v) => v.lang?.startsWith('es')) ?? null;
  }
  if (window.speechSynthesis) {
    pickSpanishVoice();
    window.speechSynthesis.addEventListener?.('voiceschanged', pickSpanishVoice);
  }

  function end() {
    cancelAnimationFrame(raf);
    if (current) onEnd?.(current);
    current = null;
    speaking = false;
    if (queue.length) start(queue.shift());
  }

  /** Mientras suena el audio, se informa del avance en cada fotograma. */
  function trackAudio() {
    if (!current) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) onProgress?.(current, audio.currentTime / audio.duration);
    raf = requestAnimationFrame(trackAudio);
  }

  function start(payload) {
    speaking = true;
    current = payload;
    if (payload.url) {
      audio.src = payload.url;
      audio.onplaying = () => {
        onStart?.(payload);
        trackAudio();
      };
      audio.onended = end;
      audio.onerror = end;
      audio.play().catch(end); // p. ej. si el navegador aún no permite reproducir audio
    } else if (payload.text && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(payload.text);
      u.lang = payload.lang ?? 'es-ES';
      if (spanishVoice) u.voice = spanishVoice;
      u.onstart = () => onStart?.(payload);
      // La voz del navegador avisa de cada palabra: el texto avanza palabra a palabra
      u.onboundary = (e) => onProgress?.(payload, (e.charIndex + (e.charLength || 0)) / payload.text.length);
      u.onend = end;
      u.onerror = end;
      window.speechSynthesis.speak(u);
    } else {
      end();
    }
  }

  function stop() {
    queue.length = 0;
    audio.pause();
    audio.removeAttribute('src');
    window.speechSynthesis?.cancel();
    end();
  }

  return {
    get enabled() {
      return enabled;
    },
    get speaking() {
      return speaking;
    },

    setEnabled(value) {
      enabled = value;
      if (!value) stop();
    },

    /** Mensaje "speech" del servidor: { agentId, url, text } o { agentId, text, fallback }. */
    play(payload) {
      if (!enabled) return;
      if (!speaking) return start(payload);
      queue.push(payload);
      if (queue.length > MAX_QUEUE) queue.shift(); // sin acumular retraso: se descarta la más antigua
    },

    stop,
  };
}
