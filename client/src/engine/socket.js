// Conexión WebSocket con el servidor, con reconexión automática.
// Mensajes: { type, payload }. El navegador solo recibe estado del mundo, nunca configuración.

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 8000;

/** Conecta con la sesión de un escenario. */
export function connectSocket(scenarioId, { onMessage, onOpen, onClose }) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws?scenario=${encodeURIComponent(scenarioId)}`;
  let ws = null;
  let retry = RETRY_MIN_MS;

  function open() {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => {
      retry = RETRY_MIN_MS;
      onOpen?.();
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg && typeof msg.type === 'string') onMessage(msg.type, msg.payload);
    });
    ws.addEventListener('close', () => {
      onClose?.();
      setTimeout(open, retry);
      retry = Math.min(retry * 2, RETRY_MAX_MS);
    });
  }

  open();

  return {
    send(type, data = {}) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data }));
    },
  };
}
