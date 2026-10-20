/**
 * Google Gemini backend for the AI Coach (free tier friendly).
 * Uses the Gemini REST API directly with fetch, so there is no extra dependency.
 * Shared by the server function and by the app itself when a key is saved on the phone.
 * Docs: https://ai.google.dev/api/generate-content
 */

/** Google's alias for the newest Flash model; override with GEMINI_MODEL. */
export const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';

export const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const BASE = GEMINI_MODELS_URL;

export interface GeminiResult {
  text: string;
  stopReason: string | null;
}

export class GeminiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

export interface GeminiCall {
  model: string;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** When set, ask for a JSON object matching this schema (the app validates it afterwards). */
  jsonSchema?: object;
}

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const BLOCKED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY']);

export function buildGeminiBody(call: GeminiCall): Record<string, unknown> {
  const system = call.jsonSchema
    ? `${call.system}\n\nRespond with ONLY a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(call.jsonSchema)}`
    : call.system;
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: call.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: {
      maxOutputTokens: 8192,
      ...(call.jsonSchema ? { responseMimeType: 'application/json' } : {}),
    },
  };
}

/** Pulls visible text and the stop state out of one streamed chunk. */
export function readChunk(chunk: GeminiChunk): { text: string; blocked: boolean } {
  if (chunk.promptFeedback?.blockReason) return { text: '', blocked: true };
  const c = chunk.candidates?.[0];
  const text = (c?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  return { text, blocked: Boolean(c?.finishReason && BLOCKED.has(c.finishReason)) };
}

/** Streams a Gemini response (server-sent events), calling onText for every text delta. */
export async function runGemini(apiKey: string, call: GeminiCall, onText: (delta: string) => void, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<GeminiResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/${encodeURIComponent(call.model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(buildGeminiBody(call)),
      signal,
    });
  } catch {
    throw new GeminiError(0, "Couldn't reach the Gemini API.");
  }
  if (!res.ok || !res.body) {
    let message = `Gemini returned ${res.status}`;
    try {
      const data = (await res.json()) as { error?: { message?: string; status?: string } };
      if (data.error?.message) message = data.error.message;
      // An invalid key comes back as 400 with this reason.
      if (data.error?.message?.includes('API key not valid') || data.error?.status === 'PERMISSION_DENIED') throw new GeminiError(401, message);
    } catch (err) {
      if (err instanceof GeminiError) throw err;
    }
    throw new GeminiError(res.status, message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let blocked = false;
  const handleLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    let chunk: GeminiChunk;
    try {
      chunk = JSON.parse(payload) as GeminiChunk;
    } catch {
      return;
    }
    const r = readChunk(chunk);
    if (r.blocked) blocked = true;
    if (r.text) {
      full += r.text;
      onText(r.text);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handleLine(buffer.slice(0, nl).replace(/\r$/, ''));
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer) handleLine(buffer.trim());
  return { text: full, stopReason: blocked && !full ? 'refusal' : 'end_turn' };
}
