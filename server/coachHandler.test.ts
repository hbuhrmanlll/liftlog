import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { COACH_MODEL, COACH_SYSTEM_PROMPT } from '../shared/coach.js';
import { buildParams, handleCoachRequest, type RunStream } from './coachHandler.js';

const body = (task: string, extra: object = {}) =>
  new Request('http://x/api/coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task, context: '## PROFILE\nGoal: Build Muscle', messages: [{ role: 'user', content: 'Why am I stuck on bench?' }], ...extra }),
  });

describe('coach handler', () => {
  it('GET reports whether a key is configured, never the key', async () => {
    const res = await handleCoachRequest(new Request('http://x/api/coach'), { apiKey: 'sk-ant-secret' });
    const data = await res.json();
    expect(data).toEqual({ configured: true, model: COACH_MODEL, provider: 'anthropic', requiresCode: false, authorized: true });
    expect(JSON.stringify(data)).not.toContain('secret');
    const res2 = await handleCoachRequest(new Request('http://x/api/coach'), { apiKey: undefined });
    expect((await res2.json()).configured).toBe(false);
  });

  it('enforces the optional access code', async () => {
    const run: RunStream = async () => ({ text: '{}', stopReason: 'end_turn' });
    const locked = await handleCoachRequest(body('suggest'), { apiKey: 'k', accessCode: 'lift123', runStream: run });
    expect(locked.status).toBe(401);
    expect((await locked.json()).code).toBe('locked');
    const withCode = body('suggest');
    withCode.headers.set('x-coach-code', 'lift123');
    expect((await handleCoachRequest(withCode, { apiKey: 'k', accessCode: 'lift123', runStream: run })).status).toBe(200);
    const status = await (await handleCoachRequest(new Request('http://x/api/coach'), { apiKey: 'k', accessCode: 'lift123' })).json();
    expect(status).toMatchObject({ requiresCode: true, authorized: false });
  });

  it('answers CORS preflight so the Android app and GitHub Pages can call it', async () => {
    const res = await handleCoachRequest(new Request('http://x/api/coach', { method: 'OPTIONS' }), { apiKey: 'k' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-headers')).toContain('x-coach-code');
    const get = await handleCoachRequest(new Request('http://x/api/coach'), { apiKey: 'k' });
    expect(get.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('POST without a key returns not_configured', async () => {
    const res = await handleCoachRequest(body('chat'), { apiKey: '' });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('not_configured');
  });

  it('rejects invalid bodies', async () => {
    const run = vi.fn<RunStream>();
    const bad = await handleCoachRequest(body('hack'), { apiKey: 'k', runStream: run });
    expect(bad.status).toBe(400);
    const tooLong = await handleCoachRequest(body('chat', { messages: [{ role: 'user', content: 'x'.repeat(9000) }] }), { apiKey: 'k', runStream: run });
    expect(tooLong.status).toBe(400);
    const endsAssistant = await handleCoachRequest(body('chat', { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }] }), { apiKey: 'k', runStream: run });
    expect(endsAssistant.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('streams text deltas for chat', async () => {
    const run: RunStream = async (_k, _p, onText) => {
      onText('Your bench ');
      onText('has stalled.');
      return { text: 'Your bench has stalled.', stopReason: 'end_turn' };
    };
    const res = await handleCoachRequest(body('chat'), { apiKey: 'k', runStream: run });
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('Your bench has stalled.');
  });

  it('appends an error marker if streaming fails midway', async () => {
    const run: RunStream = async (_k, _p, onText) => {
      onText('Partial');
      throw new Anthropic.APIConnectionError({ message: 'boom' });
    };
    const res = await handleCoachRequest(body('wrapup'), { apiKey: 'k', runStream: run });
    expect(await res.text()).toBe('Partial\n\n[[coach-error:upstream]]');
  });

  it('JSON tasks return the model text for client-side validation', async () => {
    const run: RunStream = async () => ({ text: '{"summary":"x","suggestions":[]}', stopReason: 'end_turn' });
    const res = await handleCoachRequest(body('suggest'), { apiKey: 'k', runStream: run });
    expect(await res.json()).toEqual({ text: '{"summary":"x","suggestions":[]}' });
  });

  it('maps refusals and API errors to friendly codes', async () => {
    const refused = await handleCoachRequest(body('opinion'), { apiKey: 'k', runStream: async () => ({ text: '', stopReason: 'refusal' }) });
    expect(refused.status).toBe(422);
    expect((await refused.json()).code).toBe('refused');
    const authErr = new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'bad' } }, 'bad', new Headers());
    const auth = await handleCoachRequest(body('suggest'), {
      apiKey: 'k',
      runStream: async () => {
        throw authErr;
      },
    });
    expect((await auth.json()).code).toBe('auth');
  });
});

describe('fallback retry', () => {
  it('retries once without the fallback beta if the API rejects it', async () => {
    const seen: unknown[] = [];
    const run: RunStream = async (_k, p, onText) => {
      seen.push(p.fallbacks);
      if (p.fallbacks) throw new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks' } }, 'bad', new Headers());
      onText('ok');
      return { text: 'ok', stopReason: 'end_turn' };
    };
    const res = await handleCoachRequest(body('chat'), { apiKey: 'k', runStream: run });
    expect(await res.text()).toBe('ok');
    expect(seen).toEqual(['default', undefined]);
  });
});

describe('buildParams', () => {
  it('uses the configured model, adaptive thinking, the coach rules, and server-side fallback', () => {
    const p = buildParams('chat', 'CTX', [{ role: 'user', content: 'hi' }]);
    expect(p.model).toBe(COACH_MODEL);
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.fallbacks).toBe('default');
    expect(p.betas).toContain('server-side-fallback-2026-07-01');
    const system = p.system as { text: string }[];
    expect(system[0].text).toBe(COACH_SYSTEM_PROMPT);
    expect(system[1].text).toContain('<athlete_data>\nCTX\n</athlete_data>');
    expect(p.output_config?.format).toBeUndefined();
  });

  it('adds a JSON schema for structured tasks', () => {
    expect(buildParams('suggest', 'c', [{ role: 'user', content: 'x' }]).output_config?.format?.type).toBe('json_schema');
    expect(buildParams('opinion', 'c', [{ role: 'user', content: 'x' }]).output_config?.format?.type).toBe('json_schema');
  });

  it('system prompt carries the safety rules', () => {
    expect(COACH_SYSTEM_PROMPT).toMatch(/chest pain/);
    expect(COACH_SYSTEM_PROMPT).toMatch(/not a doctor/);
    expect(COACH_SYSTEM_PROMPT).toMatch(/Never recommend a weight increase larger/);
  });
});
