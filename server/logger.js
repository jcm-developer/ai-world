// Logger mínimo con colores y redacción de secretos.
// Cualquier texto que pase por aquí se limpia: la clave nunca aparece en consola.

import { config } from './config.js';

const secrets = [config.apiKey, config.tts.apiKey].filter((s) => s && s.length >= 8);

// Patrones de claves habituales, por si alguna llega por otra vía (mensajes de error, etc.)
const KEY_PATTERNS = [/nvapi-[\w-]{10,}/g, /sk-[\w-]{16,}/g, /Bearer\s+[\w.-]{10,}/gi];

export function redact(value) {
  let text = typeof value === 'string' ? value : safeStringify(value);
  for (const s of secrets) text = text.split(s).join('[REDACTADO]');
  for (const re of KEY_PATTERNS) text = text.replace(re, '[REDACTADO]');
  return text;
}

function safeStringify(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const useColor = process.stdout.isTTY;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const time = () => new Date().toISOString().slice(11, 19);

function write(stream, color, scope, parts) {
  const msg = parts.map(redact).join(' ');
  stream.write(`${paint('90', time())} ${paint(color, scope.padEnd(7))} ${msg}\n`);
}

export const log = {
  info: (scope, ...parts) => write(process.stdout, '36', scope, parts),
  ok: (scope, ...parts) => write(process.stdout, '32', scope, parts),
  warn: (scope, ...parts) => write(process.stderr, '33', scope, parts),
  error: (scope, ...parts) => write(process.stderr, '31', scope, parts),
  agent: (scope, ...parts) => write(process.stdout, '35', scope, parts),
};
