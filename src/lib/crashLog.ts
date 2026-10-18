/** Keeps the most recent crash on this device so it can be copied from Settings. */
const KEY = 'liftlog.lastError';
const RELOAD_KEY = 'liftlog.autoReloadAt';

export interface CrashRecord {
  at: number;
  path: string;
  details: string;
}

export function describeError(error: unknown): string {
  const e = error instanceof Error ? error : new Error(String(error));
  const stack = (e.stack ?? '').split('\n').slice(0, 6).join('\n');
  return `${e.name}: ${e.message}\n${stack}\n\nApp path: ${location.pathname}\n${navigator.userAgent}`;
}

export function recordCrash(error: unknown): CrashRecord {
  const rec = { at: Date.now(), path: location.pathname, details: describeError(error) };
  try {
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {
    /* storage unavailable */
  }
  return rec;
}

export function lastCrash(): CrashRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CrashRecord) : null;
  } catch {
    return null;
  }
}

export function clearCrash(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Reload the page once to recover, but never twice within 15 seconds
 * (so a page that always crashes shows the error instead of looping).
 * Returns true if a reload was started.
 */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 15_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
