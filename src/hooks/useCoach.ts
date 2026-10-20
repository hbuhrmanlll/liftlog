import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import { buildCoachContext } from '../lib/coachContext';
import { CoachError, fetchCoachStatus, friendlyCoachError, type CoachErrorKind } from '../lib/coachClient';
import { DEFAULT_SETTINGS } from '../lib/defaults';
import { useSettings } from './useData';

export type CoachAvailability = { state: 'checking' } | { state: 'ready'; model: string } | { state: 'unavailable'; kind: CoachErrorKind | 'disabled'; message: string };

let cached: { at: number; result: CoachAvailability } | null = null;

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Whether the AI Coach can be used right now (enabled, online, server has a key). */
export function useCoachAvailability(): CoachAvailability & { refresh: () => void } {
  const settings = useSettings();
  const online = useOnline();
  const [result, setResult] = useState<CoachAvailability>(() => cached?.result ?? { state: 'checking' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!settings.aiEnabled) {
      setResult({ state: 'unavailable', kind: 'disabled', message: 'AI Coach is turned off. Turn it on in Settings.' });
      return;
    }
    if (!online) {
      setResult({ state: 'unavailable', kind: 'offline', message: friendlyCoachError('offline') });
      return;
    }
    if (cached && Date.now() - cached.at < 60_000 && nonce === 0) {
      setResult(cached.result);
      return;
    }
    const ac = new AbortController();
    setResult((r) => (r.state === 'ready' ? r : { state: 'checking' }));
    fetchCoachStatus(ac.signal)
      .then((s) => {
        const r: CoachAvailability = !s.configured
          ? { state: 'unavailable', kind: 'not_configured', message: friendlyCoachError('not_configured') }
          : !s.authorized
            ? { state: 'unavailable', kind: 'locked', message: friendlyCoachError('locked') }
            : { state: 'ready', model: s.model };
        cached = { at: Date.now(), result: r };
        setResult(r);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const kind = err instanceof CoachError ? err.kind : 'unreachable';
        const r: CoachAvailability = { state: 'unavailable', kind, message: err instanceof CoachError ? err.message : friendlyCoachError(kind) };
        cached = { at: Date.now(), result: r };
        setResult(r);
      });
    return () => ac.abort();
  }, [settings.aiEnabled, online, nonce]);

  const refresh = useCallback(() => {
    cached = null;
    setNonce((n) => n + 1);
  }, []);

  return { ...result, refresh };
}

/** Builds the coach context fresh from the database. */
export async function loadCoachContext(): Promise<string> {
  const [s, program, workouts, cardio, bodyweight] = await Promise.all([db.settings.get('settings'), db.exercises.toArray(), db.workouts.toArray(), db.cardio.toArray(), db.bodyweight.toArray()]);
  return buildCoachContext({ settings: { ...DEFAULT_SETTINGS, ...s }, program, workouts, cardio, bodyweight, now: Date.now() });
}

/** Tracks an in-flight coach request with abort-on-unmount. */
export function useCoachRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const run = useCallback(async <T,>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    ctrl.current?.abort();
    const ac = new AbortController();
    ctrl.current = ac;
    setLoading(true);
    setError(null);
    try {
      return await fn(ac.signal);
    } catch (err) {
      if (err instanceof CoachError && err.kind === 'aborted') return undefined;
      setError(err instanceof CoachError ? err.message : 'Something went wrong talking to the coach.');
      return undefined;
    } finally {
      if (ctrl.current === ac) setLoading(false);
    }
  }, []);

  const stop = useCallback(() => {
    ctrl.current?.abort();
    setLoading(false);
  }, []);

  return { loading, error, setError, run, stop };
}
