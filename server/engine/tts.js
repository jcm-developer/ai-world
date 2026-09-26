// Voz de los agentes (texto a voz).
//
// - Proveedor "openai": genera MP3 con la API de OpenAI (la clave no sale del servidor).
//   El audio se guarda en una caché pequeña en memoria y el navegador lo descarga por id.
// - Proveedor "browser": el servidor no genera nada; el navegador lee el texto con su propia voz.
// - Proveedor "off": sin voz.
//
// Si la generación falla, el navegador recibe el texto y usa su voz como respaldo.

import crypto from 'node:crypto';
import OpenAI from 'openai';
import { log } from '../logger.js';

const CACHE_SIZE = 40; // clips en memoria (los más recientes)
const MAX_CHARS = 400;

export function createTts(config) {
  const provider = config.tts.provider;
  const cache = new Map(); // id → Buffer
  let client = null;
  let warned = false;

  if (provider === 'openai') {
    if (!config.tts.apiKey) {
      log.warn('voz', 'TTS_PROVIDER=openai pero no hay clave; se usará la voz del navegador.');
    } else {
      client = new OpenAI({ apiKey: config.tts.apiKey, baseURL: config.tts.baseUrl, maxRetries: 0, timeout: 20000 });
      log.info('voz', `Voz con ${config.tts.model} (${new URL(config.tts.baseUrl).host}).`);
    }
  }

  function remember(id, buf) {
    cache.set(id, buf);
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  }

  return {
    /** "server" si genera audio, "browser" si lo delega al navegador, "off" si no hay voz. */
    get mode() {
      if (provider === 'off') return 'off';
      return client ? 'server' : 'browser';
    },

    /**
     * Genera el audio de un texto. Devuelve { id } si se generó o { fallback: true } si hay
     * que usar la voz del navegador.
     * @param {{ voice?: string, instructions?: string }} voiceDef voz del agente
     */
    async speak(text, voiceDef = {}) {
      if (!client) return { fallback: true };
      try {
        const res = await client.audio.speech.create({
          model: config.tts.model,
          voice: voiceDef.voice || config.tts.voice,
          input: text.slice(0, MAX_CHARS),
          instructions: voiceDef.instructions || 'Habla en español de España, en voz baja, calmada y reflexiva, como quien piensa en voz alta.',
          response_format: 'mp3',
        });
        const buf = Buffer.from(await res.arrayBuffer());
        const id = crypto.randomUUID();
        remember(id, buf);
        warned = false;
        return { id };
      } catch (err) {
        if (!warned) log.warn('voz', `No se pudo generar la voz (${err?.status ?? 'red'}); se usará la del navegador.`);
        warned = true;
        return { fallback: true };
      }
    },

    /** Audio generado por id (o null si ya salió de la caché). */
    get(id) {
      return cache.get(id) ?? null;
    },
  };
}
