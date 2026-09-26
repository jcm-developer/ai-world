// Configuración central del servidor.
// Lee el archivo .env de la raíz del proyecto (si existe) y valida los valores.
// En Docker las variables llegan por el entorno y el .env no es necesario.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

/** Lee un entero de una variable de entorno, con valor por defecto y límites. */
function intEnv(name, def, min, max) {
  const raw = process.env[name];
  const n = raw === undefined || raw === '' ? def : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function boolEnv(name, def = false) {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (raw === '') return def;
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(raw);
}

// La clave admite dos nombres: NVIDIA_API_KEY (por defecto) o API_KEY (otros proveedores).
const apiKey = (process.env.API_KEY || process.env.NVIDIA_API_KEY || '').trim();

export const config = Object.freeze({
  port: intEnv('PORT', 3000, 1, 65535),

  // Proveedor compatible con OpenAI: basta con cambiar estas tres variables.
  baseUrl: (process.env.BASE_URL || 'https://integrate.api.nvidia.com/v1').trim(),
  model: (process.env.MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b').trim(),
  apiKey,

  // Bucle del agente
  tickMs: intEnv('TICK_MS', 3000, 1000, 60000),
  memoryWindow: intEnv('MEMORY_WINDOW', 12, 1, 100),
  toolChoice: (process.env.TOOL_CHOICE || 'required').trim(), // 'required' o 'auto'
  temperature: Number.parseFloat(process.env.TEMPERATURE || '0.6'),
  maxTokens: intEnv('MAX_TOKENS', 1500, 64, 16000),
  // Razonamiento interno del modelo (modelos que lo admiten, p. ej. gpt-5.x): none | low | medium | high.
  // Con 'low' resuelve mucho mejor los acertijos y apenas añade latencia.
  reasoningEffort: (process.env.REASONING_EFFORT ?? 'low').trim().toLowerCase(),
  // API del proveedor: 'auto' (Responses con OpenAI si hay razonamiento; chat/completions en el resto),
  // 'chat' o 'responses'
  apiMode: (process.env.API_MODE || 'auto').trim().toLowerCase(),
  // Los free tiers pueden tardar bastante en responder cuando hay cola
  requestTimeoutMs: intEnv('REQUEST_TIMEOUT_MS', 90000, 5000, 300000),

  // Modo simulado: un "cerebro" falso sin red, útil para probar sin clave.
  mockLlm: boolEnv('MOCK_LLM', false),

  // Base de datos SQLite (memoria persistente del agente)
  dbPath: path.resolve(__dirname, process.env.DB_PATH || './data/ai-world.db'),

  // Voz de los agentes: 'openai' (API de OpenAI), 'browser' (voz del navegador) u 'off'
  tts: {
    provider: (process.env.TTS_PROVIDER || 'openai').trim().toLowerCase(),
    // Por defecto usa la misma clave; TTS_API_KEY permite otra (p. ej. si el modelo principal es de NVIDIA)
    apiKey: (process.env.TTS_API_KEY || apiKey).trim(),
    baseUrl: (process.env.TTS_BASE_URL || 'https://api.openai.com/v1').trim(),
    model: (process.env.TTS_MODEL || 'gpt-4o-mini-tts').trim(),
    voice: (process.env.TTS_VOICE || 'marin').trim(),
  },

  // Carpeta con el cliente compilado (npm run build) para servirlo en producción
  clientDist: path.resolve(__dirname, '../client/dist'),
});

/** Indica si la URL base apunta a un servidor local (Ollama, LM Studio...), que no necesita clave. */
export function isLocalProvider() {
  return /localhost|127\.0\.0\.1|host\.docker\.internal|ollama/i.test(config.baseUrl);
}
