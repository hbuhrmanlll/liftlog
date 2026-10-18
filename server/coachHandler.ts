/**
 * The AI Coach proxy. Holds the API key server-side and forwards a narrow,
 * validated request shape to Claude (Anthropic) or Gemini (Google). Written against the Web
 * Request/Response API so the same code runs in the Vercel function and in the
 * Vite dev/preview server.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages';
import { z } from 'zod';
import {
  ACCESS_CODE_HEADER,
  COACH_MODEL,
  COACH_SYSTEM_PROMPT,
  JSON_TASKS,
  LIMITS,
  OPINION_JSON_SCHEMA,
  STREAM_ERROR_PREFIX,
  STREAM_ERROR_SUFFIX,
  SUGGEST_JSON_SCHEMA,
  TASK_INSTRUCTIONS,
  type CoachTask,
} from '../shared/coach.js';
import { GEMINI_DEFAULT_MODEL, GeminiError, runGemini } from './gemini.js';

export type CoachProvider = 'anthropic' | 'gemini';

type StreamParams = BetaMessageStreamParams;

export interface RunResult {
  text: string;
  stopReason: string | null;
}

/** Runs one streamed request; calls onText for every text delta. Injected in tests. */
export type RunStream = (apiKey: string, params: StreamParams, onText: (delta: string) => void, signal?: AbortSignal) => Promise<RunResult>;

export const defaultRunStream: RunStream = async (apiKey, params, onText, signal) => {
  const client = new Anthropic({ apiKey });
  const stream = client.beta.messages.stream(params, { signal });
  stream.on('text', (delta) => onText(delta));
  const final = await stream.finalMessage();
  const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return { text, stopReason: final.stop_reason };
};

const bodySchema = z.object({
  task: z.enum(['chat', 'wrapup', 'checkin', 'cardio', 'opinion', 'suggest']),
  context: z.string().max(LIMITS.contextChars),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(LIMITS.messageChars) }))
    .min(1)
    .max(LIMITS.messages)
    .refine((m) => m[0].role === 'user' && m[m.length - 1].role === 'user', 'Conversation must start and end with a user message'),
});

const EFFORT: Record<CoachTask, 'low' | 'medium'> = {
  chat: 'medium',
  wrapup: 'low',
  checkin: 'medium',
  cardio: 'low',
  opinion: 'medium',
  suggest: 'medium',
};

export function buildParams(task: CoachTask, context: string, messages: { role: 'user' | 'assistant'; content: string }[]): StreamParams {
  const format =
    task === 'suggest'
      ? { type: 'json_schema' as const, schema: SUGGEST_JSON_SCHEMA as unknown as Record<string, unknown> }
      : task === 'opinion'
        ? { type: 'json_schema' as const, schema: OPINION_JSON_SCHEMA as unknown as Record<string, unknown> }
        : undefined;
  return {
    model: COACH_MODEL,
    max_tokens: 16000,
    // Server-side fallback: if the model declines, the API retries on a fallback model in the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: format ? { effort: EFFORT[task], format } : { effort: EFFORT[task] },
    cache_control: { type: 'ephemeral' },
    system: [
      { type: 'text', text: COACH_SYSTEM_PROMPT },
      { type: 'text', text: `${TASK_INSTRUCTIONS[task]}\n\n<athlete_data>\n${context}\n</athlete_data>` },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
}

/** Constant-time string comparison so the access code can't be guessed by timing. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export type CoachErrorCode = 'locked' | 'not_configured' | 'bad_request' | 'auth' | 'rate_limited' | 'refused' | 'upstream' | 'overloaded';

export function classifyError(err: unknown): { code: CoachErrorCode; status: number; message: string } {
  if (err instanceof GeminiError) {
    if (err.status === 401 || err.status === 403) return { code: 'auth', status: 502, message: 'The Gemini API key was rejected. Check GEMINI_API_KEY.' };
    if (err.status === 429) return { code: 'rate_limited', status: 429, message: "You've hit Gemini's free-tier limit. Try again later." };
    if (err.status >= 500) return { code: 'overloaded', status: 503, message: 'Gemini is busy. Try again shortly.' };
    return { code: 'upstream', status: 502, message: err.status ? `Gemini returned an error (${err.status}).` : "Couldn't reach the Gemini API." };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { code: 'auth', status: 502, message: 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.' };
  }
  if (err instanceof Anthropic.RateLimitError) return { code: 'rate_limited', status: 429, message: 'The coach is getting too many requests. Try again in a minute.' };
  if (err instanceof Anthropic.BadRequestError) return { code: 'upstream', status: 502, message: 'The coach request was rejected by the API.' };
  if (err instanceof Anthropic.InternalServerError) return { code: 'overloaded', status: 503, message: 'The coach service is busy. Try again shortly.' };
  if (err instanceof Anthropic.APIConnectionError) return { code: 'upstream', status: 502, message: "Couldn't reach the Anthropic API." };
  if (err instanceof Anthropic.APIError) return { code: 'upstream', status: 502, message: `The coach service returned an error (${err.status ?? 'unknown'}).` };
  return { code: 'upstream', status: 500, message: 'Something went wrong talking to the coach.' };
}

export interface HandlerOptions {
  /** Which AI service to use. Defaults to Anthropic. */
  provider?: CoachProvider;
  /** API key for the chosen provider. */
  apiKey: string | undefined;
  /** Model override (used for Gemini; Claude uses COACH_MODEL). */
  model?: string;
  /** Test hook for the Gemini backend. */
  fetchImpl?: typeof fetch;
  /** Optional shared code; when set, requests must send it in the x-coach-code header. */
  accessCode?: string;
  runStream?: RunStream;
}

export async function handleCoachRequest(req: Request, opts: HandlerOptions): Promise<Response> {
  const apiKey = opts.apiKey?.trim();
  const provider: CoachProvider = opts.provider ?? 'anthropic';
  const model = provider === 'gemini' ? opts.model?.trim() || GEMINI_DEFAULT_MODEL : COACH_MODEL;
  const required = opts.accessCode?.trim();
  const authorized = !required || safeEqual(req.headers.get(ACCESS_CODE_HEADER)?.trim() ?? '', required);
  if (req.method === 'GET') return json({ configured: Boolean(apiKey), model, provider, requiresCode: Boolean(required), authorized });
  if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'bad_request' }, 405);
  if (!apiKey) return json({ error: 'AI Coach is not set up. Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) on the server.', code: 'not_configured' }, 503);
  if (!authorized) return json({ error: 'Wrong or missing coach access code.', code: 'locked' }, 401);

  let parsed: z.infer<typeof bodySchema>;
  try {
    const result = bodySchema.safeParse(await req.json());
    if (!result.success) return json({ error: result.error.issues[0]?.message ?? 'Invalid request', code: 'bad_request' }, 400);
    parsed = result.data;
  } catch {
    return json({ error: 'Invalid JSON body', code: 'bad_request' }, 400);
  }

  const baseRun = opts.runStream ?? defaultRunStream;
  // If the API rejects the optional server-side-fallback beta (e.g. not enabled for the
  // account), retry once without it. A 400 arrives before any text is streamed.
  const run: RunStream = async (key, p, onText, signal) => {
    try {
      return await baseRun(key, p, onText, signal);
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError && p.fallbacks) {
        const { fallbacks: _f, betas: _b, ...rest } = p;
        return baseRun(key, rest, onText, signal);
      }
      throw err;
    }
  };
  const params = buildParams(parsed.task, parsed.context, parsed.messages);
  // One function per provider with the same shape: (onText) => final result.
  const execute = (onText: (delta: string) => void): Promise<RunResult> => {
    if (provider === 'gemini') {
      const system = params.system as { text: string }[];
      const jsonSchema = parsed.task === 'suggest' ? SUGGEST_JSON_SCHEMA : parsed.task === 'opinion' ? OPINION_JSON_SCHEMA : undefined;
      return runGemini(apiKey, { model, system: system.map((s) => s.text).join('\n\n'), messages: parsed.messages, jsonSchema }, onText, req.signal, opts.fetchImpl);
    }
    return run(apiKey, params, onText, req.signal);
  };

  // Structured tasks: wait for the full message and return it as JSON text.
  if (JSON_TASKS.includes(parsed.task)) {
    try {
      const result = await execute(() => {});
      if (result.stopReason === 'refusal') return json({ error: "The coach can't help with that request.", code: 'refused' }, 422);
      return json({ text: result.text });
    } catch (err) {
      const e = classifyError(err);
      return json({ error: e.message, code: e.code }, e.status);
    }
  }

  // Text tasks: stream plain text deltas as they arrive.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await execute((delta) => controller.enqueue(encoder.encode(delta)));
        if (result.stopReason === 'refusal') controller.enqueue(encoder.encode(`${STREAM_ERROR_PREFIX}refused${STREAM_ERROR_SUFFIX}`));
      } catch (err) {
        const e = classifyError(err);
        controller.enqueue(encoder.encode(`${STREAM_ERROR_PREFIX}${e.code}${STREAM_ERROR_SUFFIX}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}
