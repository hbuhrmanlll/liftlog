/**
 * Vite plugin that serves /api/coach during `npm run dev` and `npm run preview`,
 * using the same handler as the Vercel function. The API key comes from
 * .env.local (ANTHROPIC_API_KEY) and never reaches the browser bundle.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import { COACH_ENDPOINT } from '../shared/coach.js';
import { handleCoachRequest, type HandlerOptions } from './coachHandler.js';

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }
  const controller = new AbortController();
  req.on('close', () => {
    if (!req.complete) controller.abort();
  });
  return new Request(`http://localhost${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    signal: controller.signal,
  });
}

async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

export function coachDevApi(getOptions: () => HandlerOptions): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== COACH_ENDPOINT) return next();
    toWebRequest(req)
      .then((request) => handleCoachRequest(request, getOptions()))
      .then((response) => sendWebResponse(res, response))
      .catch((err: unknown) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Dev API error', code: 'upstream' }));
      });
  };
  return {
    name: 'liftlog-coach-dev-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
