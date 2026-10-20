/** Browser-side client for the /api/coach proxy. Never sees the API key. */
import { ACCESS_CODE_HEADER, COACH_ENDPOINT, STREAM_ERROR_PREFIX, STREAM_ERROR_SUFFIX, type CoachRequestBody, type CoachStatus } from '../../shared/coach';

export type CoachErrorKind = 'locked' | 'offline' | 'not_configured' | 'unreachable' | 'auth' | 'rate_limited' | 'refused' | 'upstream' | 'aborted' | 'bad_request' | 'overloaded';

export class CoachError extends Error {
  kind: CoachErrorKind;
  constructor(kind: CoachErrorKind, message?: string) {
    super(message ?? friendlyCoachError(kind));
    this.kind = kind;
  }
}

export function friendlyCoachError(kind: CoachErrorKind): string {
  switch (kind) {
    case 'locked':
      return 'This coach server needs an access code. Enter it in Settings → AI Coach.';
    case 'offline':
      return "You're offline. The AI Coach needs a connection - everything else in LiftLog works offline.";
    case 'not_configured':
      return "The AI Coach isn't set up yet.";
    case 'unreachable':
      return "Couldn't reach the AI Coach server. Check your connection and try again.";
    case 'auth':
      return 'The AI Coach API key was rejected. Check ANTHROPIC_API_KEY on your server.';
    case 'rate_limited':
      return 'The coach is busy right now. Try again in a minute.';
    case 'refused':
      return "The coach can't help with that one. Try rephrasing.";
    case 'overloaded':
      return 'The coach service is busy. Try again shortly.';
    case 'aborted':
      return 'Stopped.';
    case 'bad_request':
      return 'That request was too long or malformed. Try a shorter message.';
    case 'upstream':
      return 'Something went wrong talking to the coach. Try again.';
  }
}

const KNOWN: CoachErrorKind[] = ['locked', 'not_configured', 'auth', 'rate_limited', 'refused', 'upstream', 'bad_request', 'overloaded'];
const toKind = (code: unknown): CoachErrorKind => (typeof code === 'string' && (KNOWN as string[]).includes(code) ? (code as CoachErrorKind) : 'upstream');

const CODE_KEY = 'liftlog.coachCode';

/** The access code lives only in this browser's storage (not in backups). */
export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAccessCode(code: string): void {
  try {
    if (code.trim()) localStorage.setItem(CODE_KEY, code.trim());
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* ignore */
  }
}

// The installed app and GitHub Pages have no server of their own, so they call the
// coach function on another host (VITE_COACH_URL, set at build time).
const COACH_URL = import.meta.env.VITE_COACH_URL || COACH_ENDPOINT;

function serverName(): string {
  try {
    return new URL(COACH_URL, window.location.href).host;
  } catch {
    return COACH_URL;
  }
}

/** Explains a status reply that isn't the coach's JSON, so a setup problem is visible on the phone. */
async function describeBadStatus(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  // Netlify's page for a missing or private site (its server header is hidden from cross-origin pages).
  if (/site-not-found|Not Found - Request ID/i.test(text)) {
    return `Netlify says ${serverName()} doesn't exist. If the site is set to Private, open it in Netlify and click Make public; private sites only open in a browser that's logged in to Netlify.`;
  }
  return `${friendlyCoachError('not_configured')} (${serverName()} answered HTTP ${res.status}.)`;
}

function authHeaders(): Record<string, string> {
  const code = getAccessCode();
  return code ? { [ACCESS_CODE_HEADER]: code } : {};
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export async function fetchCoachStatus(signal?: AbortSignal): Promise<CoachStatus> {
  if (isOffline()) throw new CoachError('offline');
  let res: Response;
  try {
    res = await fetch(COACH_URL, { method: 'GET', signal, headers: { accept: 'application/json', ...authHeaders() } });
  } catch {
    if (isOffline()) throw new CoachError('offline');
    throw new CoachError('unreachable', `Couldn't reach the AI Coach server (${serverName()}). Check your connection and try again.`);
  }
  const type = res.headers.get('content-type') ?? '';
  // A static host without the function returns index.html or a 404.
  if (!res.ok || !type.includes('application/json')) throw new CoachError('not_configured', await describeBadStatus(res));
  const data = (await res.json()) as Partial<CoachStatus>;
  return { configured: Boolean(data.configured), model: String(data.model ?? ''), requiresCode: Boolean(data.requiresCode), authorized: data.authorized !== false };
}

async function post(body: CoachRequestBody, signal?: AbortSignal): Promise<Response> {
  if (isOffline()) throw new CoachError('offline');
  let res: Response;
  try {
    res = await fetch(COACH_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(body), signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new CoachError('aborted');
    throw new CoachError(isOffline() ? 'offline' : 'unreachable');
  }
  if (!res.ok) {
    let code: unknown;
    try {
      code = ((await res.json()) as { code?: unknown }).code;
    } catch {
      code = res.status === 404 ? 'not_configured' : 'upstream';
    }
    if (res.status === 404) code = 'not_configured';
    throw new CoachError(toKind(code));
  }
  return res;
}

/** Strip and decode an error marker the server appends if a stream fails midway. */
export function splitStreamError(text: string): { text: string; error?: CoachErrorKind } {
  const i = text.indexOf(STREAM_ERROR_PREFIX);
  if (i < 0) return { text };
  const rest = text.slice(i + STREAM_ERROR_PREFIX.length);
  const code = rest.slice(0, rest.indexOf(STREAM_ERROR_SUFFIX));
  return { text: text.slice(0, i), error: toKind(code) };
}

/** Streams a text task. Calls onText with the full text so far. Returns the final text. */
export async function streamCoach(body: CoachRequestBody, onText: (full: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await post(body, signal);
  if (!res.body) {
    const t = await res.text();
    const s = splitStreamError(t);
    if (s.error) throw new CoachError(s.error);
    onText(s.text);
    return s.text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      const s = splitStreamError(full);
      // Hide a partial error marker while it is still arriving.
      const visible = s.error ? s.text : full.includes('\n\n[[') ? full.slice(0, full.indexOf('\n\n[[')) : full;
      onText(visible);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new CoachError('aborted');
    throw new CoachError(isOffline() ? 'offline' : 'unreachable');
  }
  full += decoder.decode();
  const s = splitStreamError(full);
  if (s.error) {
    if (s.text.trim()) onText(s.text);
    throw new CoachError(s.error);
  }
  onText(s.text);
  return s.text.trim();
}

/** Runs a structured (JSON) task and returns the raw model text for validation. */
export async function requestCoachJson(body: CoachRequestBody, signal?: AbortSignal): Promise<string> {
  const res = await post(body, signal);
  const data = (await res.json()) as { text?: unknown };
  if (typeof data.text !== 'string') throw new CoachError('upstream');
  return data.text;
}
