import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cancelTimerAlerts, ensureNotificationPermission, scheduleRestAlert, scheduleSetAlert } from '../lib/notifications';
import { isNativeApp } from '../lib/platform';
import { playSound, primeAudio, type SoundId } from '../lib/sounds';

interface TimerState {
  endAt: number;
  duration: number;
  label: string;
}

interface RestTimerApi {
  active: boolean;
  remaining: number;
  duration: number;
  label: string;
  start: (seconds: number, label: string) => void;
  adjust: (delta: number) => void;
  skip: () => void;
}

/** A set being timed. Changes only on start/stop, so cards don't re-render every tick. */
export interface RunningSet {
  setId: string;
  label: string;
  startAt: number;
  target: number;
}

interface SetTimerApi {
  running: RunningSet | null;
  startSet: (setId: string, label: string) => void;
  /** Stops the set timer and returns the elapsed seconds (null if it wasn't running). */
  stopSet: () => number | null;
}

export interface TimerAlertSettings {
  sound: boolean;
  vibrate: boolean;
  soundId: SoundId;
  volume: number;
  repeat: number;
  setTarget: number;
}

const Ctx = createContext<RestTimerApi | null>(null);
const SetCtx = createContext<SetTimerApi | null>(null);
const STORAGE_KEY = 'liftlog.restTimer';

function load(): TimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as TimerState;
    return s.endAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function save(s: TimerState | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: timer still works in memory */
  }
}

export function RestTimerProvider({ children, alerts }: { children: ReactNode; alerts: TimerAlertSettings }) {
  const [state, setState] = useState<TimerState | null>(() => (typeof window === 'undefined' ? null : load()));
  const [now, setNow] = useState(() => Date.now());
  const [running, setRunning] = useState<RunningSet | null>(null);
  const prefs = useRef(alerts);
  prefs.current = alerts;
  const live = useRef({ state, running });
  live.current = { state, running };
  const asked = useRef(false);

  const alert = useCallback(() => {
    const p = prefs.current;
    if (p.vibrate && 'vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    if (p.sound) void playSound(p.soundId, p.volume, p.repeat);
  }, []);

  useEffect(() => {
    if (!state) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (state && now >= state.endAt) {
      alert();
      setState(null);
      save(null);
    }
  }, [now, state, alert]);

  // Set timer: one alert when the target time is reached; it keeps counting after that.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(alert, Math.max(0, running.startAt + running.target * 1000 - Date.now()));
    return () => window.clearTimeout(id);
  }, [running, alert]);

  // In the Android app, hand pending alerts to Android while the app is in the
  // background (screen off), and take them back when it returns.
  useEffect(() => {
    if (!isNativeApp) return;
    const onVisibility = () => {
      const { state: s, running: r } = live.current;
      if (document.visibilityState === 'hidden') {
        if (s) void scheduleRestAlert(s.endAt, s.label);
        if (r) void scheduleSetAlert(r.startAt + r.target * 1000, r.label);
      } else {
        void cancelTimerAlerts();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const askOnce = () => {
    if (isNativeApp && !asked.current) {
      asked.current = true;
      void ensureNotificationPermission();
    }
  };

  const start = useCallback((seconds: number, label: string) => {
    primeAudio();
    askOnce();
    const s = { endAt: Date.now() + seconds * 1000, duration: seconds, label };
    setNow(Date.now());
    setState(s);
    save(s);
  }, []);

  const adjust = useCallback((delta: number) => {
    setState((s) => {
      if (!s) return s;
      const endAt = Math.max(Date.now() + 1000, s.endAt + delta * 1000);
      const next = { ...s, endAt, duration: Math.max(s.duration + delta, 1) };
      save(next);
      return next;
    });
  }, []);

  const skip = useCallback(() => {
    setState(null);
    save(null);
  }, []);

  const startSet = useCallback((setId: string, label: string) => {
    primeAudio();
    askOnce();
    // Starting a set ends any rest that was still counting down.
    setState(null);
    save(null);
    setRunning({ setId, label, startAt: Date.now(), target: Math.max(5, prefs.current.setTarget) });
  }, []);

  const stopSet = useCallback(() => {
    const r = live.current.running;
    setRunning(null);
    return r ? Math.max(1, Math.round((Date.now() - r.startAt) / 1000)) : null;
  }, []);

  const api = useMemo<RestTimerApi>(
    () => ({
      active: Boolean(state),
      remaining: state ? Math.max(0, Math.ceil((state.endAt - now) / 1000)) : 0,
      duration: state?.duration ?? 0,
      label: state?.label ?? '',
      start,
      adjust,
      skip,
    }),
    [state, now, start, adjust, skip],
  );
  const setApi = useMemo<SetTimerApi>(() => ({ running, startSet, stopSet }), [running, startSet, stopSet]);

  return (
    <SetCtx.Provider value={setApi}>
      <Ctx.Provider value={api}>{children}</Ctx.Provider>
    </SetCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRestTimer(): RestTimerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRestTimer must be used inside RestTimerProvider');
  return v;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSetTimer(): SetTimerApi {
  const v = useContext(SetCtx);
  if (!v) throw new Error('useSetTimer must be used inside RestTimerProvider');
  return v;
}
