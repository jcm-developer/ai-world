// Cliente del modelo de lenguaje, compatible con cualquier API al estilo OpenAI
// (NVIDIA NIM, OpenAI, Ollama, LM Studio, OpenRouter...). Solo cambian BASE_URL, MODEL y la clave.
//
// Este módulo NO reintenta: clasifica los errores y el bucle del agente decide
// cuándo volver a intentarlo (backoff exponencial ante 429).

import OpenAI from 'openai';
import { isLocalProvider } from '../config.js';
import { MockBrain } from './mockBrain.js';

export class LlmError extends Error {
  /**
   * @param {'rate_limit'|'auth'|'not_found'|'bad_request'|'server'|'network'|'bad_response'|'fallback'} kind
   */
  constructor(kind, message, { status, retryAfterMs } = {}) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function createBrain(config) {
  return config.mockLlm ? new MockBrain() : new OpenAIBrain(config);
}

class OpenAIBrain {
  constructor(config) {
    this.config = config;
    this.toolChoice = config.toolChoice;
    // Parámetros que se ajustan solos si el proveedor los rechaza (p. ej. los modelos
    // recientes de OpenAI exigen max_completion_tokens y no admiten temperature).
    this.tokenParam = 'max_tokens';
    this.sendTemperature = true;
    this.reasoningEffort = ['', 'none', 'off'].includes(config.reasoningEffort) ? null : config.reasoningEffort;
    this.client = new OpenAI({
      // Los servidores locales no piden clave, pero el SDK exige un valor no vacío.
      apiKey: config.apiKey || 'sin-clave',
      baseURL: config.baseUrl,
      maxRetries: 0, // los reintentos los gestiona el agente
      timeout: config.requestTimeoutMs,
    });
  }

  get label() {
    return `${this.config.model} · ${new URL(this.config.baseUrl).host}`;
  }

  /** Comprueba la configuración antes de arrancar. Devuelve un aviso o null. */
  configWarning() {
    if (!this.config.apiKey && !isLocalProvider()) {
      return 'No hay clave configurada (NVIDIA_API_KEY o API_KEY). Las peticiones fallarán con 401.';
    }
    return null;
  }

  /**
   * Pide al modelo la siguiente decisión.
   * @returns {Promise<{ toolCalls: Array<{name:string,args:object|null,error?:string}>, content: string, finishReason: string }>}
   */
  async decide({ system, user, tools }) {
    if (this.#useResponses()) return this.#decideWithResponses({ system, user, tools });
    let res;
    try {
      res = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        tools,
        tool_choice: this.toolChoice,
        ...(this.sendTemperature ? { temperature: this.config.temperature } : {}),
        [this.tokenParam]: this.config.maxTokens,
        ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
      });
    } catch (err) {
      throw this.#classify(err);
    }

    const msg = res.choices?.[0]?.message;
    if (!msg) throw new LlmError('bad_response', 'La respuesta del modelo no contiene ningún mensaje.');

    let toolCalls = (msg.tool_calls ?? [])
      .filter((c) => c?.function?.name)
      .map((c) => parseCall(c.function.name, c.function.arguments));

    // Algunos modelos escriben la llamada como texto en lugar de usar tool_calls.
    if (!toolCalls.length && msg.content) toolCalls = extractCallsFromText(msg.content);

    return { toolCalls, content: msg.content ?? '', finishReason: res.choices[0].finish_reason ?? '' };
  }

  /**
   * Conversación sin herramientas (p. ej. un personaje que responde a una pregunta).
   * @param {{ system: string, messages: Array<{role:'user'|'assistant', content:string}>, maxTokens?: number }} opts
   * @returns {Promise<string>} el texto de la respuesta
   */
  async complete({ system, messages, maxTokens = 1200 }) {
    try {
      if (this.#useResponses()) {
        const res = await this.client.responses.create({
          model: this.config.model,
          instructions: system,
          input: messages,
          max_output_tokens: maxTokens,
          ...(this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {}),
          store: false,
        });
        return (res.output_text ?? '').trim();
      }
      const res = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'system', content: system }, ...messages],
        [this.tokenParam]: maxTokens,
        ...(this.sendTemperature ? { temperature: this.config.temperature } : {}),
      });
      return (res.choices?.[0]?.message?.content ?? '').trim();
    } catch (err) {
      throw this.#classify(err);
    }
  }

  /**
   * La API Responses de OpenAI permite combinar herramientas y razonamiento en modelos como
   * gpt-5.4-mini (en chat/completions no está permitido). Se usa con OpenAI cuando hay
   * razonamiento activado, o siempre si API_MODE=responses.
   */
  #useResponses() {
    const mode = this.config.apiMode;
    if (mode === 'responses') return true;
    if (mode === 'chat' || this.responsesUnavailable) return false;
    return Boolean(this.reasoningEffort) && /(^|\.)openai\.com$/.test(new URL(this.config.baseUrl).host);
  }

  async #decideWithResponses({ system, user, tools }) {
    let res;
    try {
      res = await this.client.responses.create({
        model: this.config.model,
        instructions: system,
        input: [{ role: 'user', content: user }],
        tools: tools.map((t) => ({
          type: 'function',
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
          strict: false,
        })),
        tool_choice: this.toolChoice === 'required' ? 'required' : 'auto',
        parallel_tool_calls: true,
        max_output_tokens: this.config.maxTokens,
        ...(this.reasoningEffort ? { reasoning: { effort: this.reasoningEffort } } : {}),
        store: false, // no se guarda nada en el servidor del proveedor
      });
    } catch (err) {
      // Si el proveedor no tiene esta API, se vuelve a chat/completions desde el siguiente tick
      if (err instanceof OpenAI.APIError && err.status === 404) {
        this.responsesUnavailable = true;
        throw new LlmError('fallback', 'El proveedor no tiene la API Responses; se usará chat/completions.', { status: 404 });
      }
      throw this.#classify(err);
    }

    const output = res.output ?? [];
    let toolCalls = output.filter((o) => o.type === 'function_call').map((o) => parseCall(o.name, o.arguments));
    const content = res.output_text ?? '';
    if (!toolCalls.length && content) toolCalls = extractCallsFromText(content);
    const finishReason = res.incomplete_details?.reason === 'max_output_tokens' ? 'length' : res.status ?? '';
    return { toolCalls, content, finishReason };
  }

  /** Traduce los errores del SDK a errores propios, sin exponer cabeceras ni la clave. */
  #classify(err) {
    if (!(err instanceof OpenAI.APIError) || err.status === undefined) {
      const timeout = err instanceof OpenAI.APIConnectionTimeoutError;
      return new LlmError('network', timeout ? 'Tiempo de espera agotado.' : `Error de conexión: ${err?.message ?? err}`);
    }

    const status = err.status;
    const detail = shortMessage(err);

    if (status === 429) {
      return new LlmError('rate_limit', `Límite de peticiones alcanzado (429). ${detail}`, {
        status,
        retryAfterMs: parseRetryAfter(err.headers),
      });
    }
    if (status === 401 || status === 403) {
      return new LlmError('auth', `Clave rechazada por el proveedor (${status}). Revisa la clave en .env.`, { status });
    }
    if (status === 404) {
      return new LlmError('not_found', `Modelo o endpoint no encontrado (404): "${this.config.model}". Revisa MODEL y BASE_URL. ${detail}`, { status });
    }
    if ((status === 400 || status === 422) && this.toolChoice === 'required' && /tool_choice|required/i.test(detail)) {
      // El proveedor no admite tool_choice "required": pasamos a "auto" desde el siguiente tick.
      this.toolChoice = 'auto';
      return new LlmError('fallback', 'El proveedor no admite tool_choice="required"; se usará "auto".', { status });
    }
    if (status === 400 && this.tokenParam === 'max_tokens' && /max_completion_tokens/i.test(detail)) {
      this.tokenParam = 'max_completion_tokens';
      return new LlmError('fallback', 'El modelo exige max_completion_tokens; se usará desde el siguiente tick.', { status });
    }
    if ((status === 400 || status === 422) && this.reasoningEffort && /reasoning/i.test(detail)) {
      this.reasoningEffort = null;
      return new LlmError('fallback', 'El modelo no admite reasoning_effort; se desactiva.', { status });
    }
    if (status === 400 && this.sendTemperature && /temperature/i.test(detail)) {
      this.sendTemperature = false;
      return new LlmError('fallback', 'El modelo no admite temperature personalizada; se omitirá.', { status });
    }
    if (status >= 500) return new LlmError('server', `Error del proveedor (${status}). ${detail}`, { status });
    return new LlmError('bad_request', `Petición rechazada (${status}). ${detail}`, { status });
  }
}

/** Parsea los argumentos JSON de una llamada; si fallan, se devuelve el error para registrarlo. */
function parseCall(name, rawArgs) {
  if (rawArgs && typeof rawArgs === 'object') return { name, args: rawArgs };
  try {
    const args = JSON.parse(rawArgs || '{}');
    return { name, args };
  } catch {
    return { name, args: null, error: `JSON de argumentos inválido: ${String(rawArgs).slice(0, 120)}` };
  }
}

/**
 * Rescata llamadas escritas como texto, p. ej.:
 *   <tool_call>{"name": "think", "arguments": {"thought": "..."}}</tool_call>
 *   ```json {"name": "move_to", "arguments": {...}} ```
 */
function extractCallsFromText(text) {
  const candidates = [];
  for (const m of text.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g)) candidates.push(m[1]);
  if (!candidates.length) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    candidates.push(fenced ? fenced[1] : text);
  }
  const calls = [];
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim());
      for (const item of Array.isArray(obj) ? obj : [obj]) {
        const name = item?.name ?? item?.function?.name;
        const args = item?.arguments ?? item?.parameters ?? item?.function?.arguments;
        if (typeof name === 'string') calls.push(parseCall(name, args));
      }
    } catch {
      // No era JSON: se ignora.
    }
  }
  return calls;
}

/** Lee la cabecera Retry-After (segundos o fecha HTTP) y la devuelve en milisegundos. */
function parseRetryAfter(headers) {
  const raw = typeof headers?.get === 'function' ? headers.get('retry-after') : headers?.['retry-after'];
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function shortMessage(err) {
  const body = err.error;
  const msg = (body && (body.message || body.detail || body.error?.message)) || err.message || '';
  return String(msg).replace(/\s+/g, ' ').slice(0, 200);
}
