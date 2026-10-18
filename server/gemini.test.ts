import { describe, expect, it } from 'vitest';
import { coachOptionsFromEnv } from './coachEnv.js';
import { handleCoachRequest } from './coachHandler.js';
import { buildGeminiBody, GEMINI_DEFAULT_MODEL, readChunk } from './gemini.js';

function sse(chunks: object[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const part = (text: string, extra: object = {}) => ({ candidates: [{ content: { parts: [{ text, ...extra }] } }] });

const request = (task: string) =>
  new Request('http://x/api/coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task, context: '## PROFILE', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'bench?' }] }),
  });

describe('Gemini backend', () => {
  it('streams text and sends the key in a header, never the URL', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const fetchImpl = (async (u: string, i: RequestInit) => {
      url = u;
      init = i;
      return sse([part('Your bench '), part('thinking...', { thought: true }), part('is fine.')]);
    }) as unknown as typeof fetch;
    const res = await handleCoachRequest(request('chat'), { provider: 'gemini', apiKey: 'AIza-test', fetchImpl });
    expect(await res.text()).toBe('Your bench is fine.');
    expect(url).toContain(`/models/${GEMINI_DEFAULT_MODEL}:streamGenerateContent?alt=sse`);
    expect(url).not.toContain('AIza');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
    const body = JSON.parse(String(init?.body));
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.systemInstruction.parts[0].text).toContain('<athlete_data>');
  });

  it('asks for JSON on structured tasks', async () => {
    const fetchImpl = (async () => sse([part('{"summary":"ok",'), part('"suggestions":[]}')])) as unknown as typeof fetch;
    const res = await handleCoachRequest(request('suggest'), { provider: 'gemini', apiKey: 'k', fetchImpl });
    expect(await res.json()).toEqual({ text: '{"summary":"ok","suggestions":[]}' });
    const b = buildGeminiBody({ model: 'm', system: 's', messages: [{ role: 'user', content: 'x' }], jsonSchema: { type: 'object' } });
    expect((b.generationConfig as { responseMimeType?: string }).responseMimeType).toBe('application/json');
  });

  it('treats a safety block as a refusal', async () => {
    expect(readChunk({ promptFeedback: { blockReason: 'SAFETY' } }).blocked).toBe(true);
    const fetchImpl = (async () => sse([{ candidates: [{ finishReason: 'SAFETY' }] }])) as unknown as typeof fetch;
    const res = await handleCoachRequest(request('opinion'), { provider: 'gemini', apiKey: 'k', fetchImpl });
    expect((await res.json()).code).toBe('refused');
  });

  it('maps a bad key and the free-tier limit to friendly codes', async () => {
    const badKey = (async () => new Response(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }), { status: 400 })) as unknown as typeof fetch;
    expect((await (await handleCoachRequest(request('suggest'), { provider: 'gemini', apiKey: 'k', fetchImpl: badKey })).json()).code).toBe('auth');
    const limited = (async () => new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }), { status: 429 })) as unknown as typeof fetch;
    expect(await (await handleCoachRequest(request('chat'), { provider: 'gemini', apiKey: 'k', fetchImpl: limited })).text()).toBe('\n\n[[coach-error:rate_limited]]');
    const offline = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect((await (await handleCoachRequest(request('suggest'), { provider: 'gemini', apiKey: 'k', fetchImpl: offline })).json()).code).toBe('upstream');
  });

  it('status reports the Gemini model', async () => {
    const res = await handleCoachRequest(new Request('http://x/api/coach'), { provider: 'gemini', apiKey: 'k', model: 'gemini-test' });
    expect(await res.json()).toMatchObject({ configured: true, provider: 'gemini', model: 'gemini-test' });
  });
});

describe('coachOptionsFromEnv', () => {
  it('uses Gemini automatically when it is the only key', () => {
    expect(coachOptionsFromEnv({ GEMINI_API_KEY: 'g' })).toMatchObject({ provider: 'gemini', apiKey: 'g' });
  });
  it('prefers Anthropic when both keys exist unless told otherwise', () => {
    expect(coachOptionsFromEnv({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' })).toMatchObject({ provider: 'anthropic', apiKey: 'a' });
    expect(coachOptionsFromEnv({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', COACH_PROVIDER: 'Gemini' })).toMatchObject({ provider: 'gemini', apiKey: 'g' });
  });
  it('passes the model and access code through', () => {
    expect(coachOptionsFromEnv({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-x', COACH_ACCESS_CODE: 'c' })).toMatchObject({ model: 'gemini-x', accessCode: 'c' });
    expect(coachOptionsFromEnv({})).toMatchObject({ provider: 'anthropic', apiKey: undefined });
  });
});
