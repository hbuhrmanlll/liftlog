import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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

const Ctx = createContext<RestTimerApi | null>(null);
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

let audioCtx: AudioContext | null = null;
/** Create/resume the audio context during a user tap so the end beep is allowed later. */
export function primeAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audioCtx ??= new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* ignore */
  }
}

function beep() {
  try {
    primeAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    [0, 0.22].forEach((offset, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } catch {
    /* ignore */
  }
}

export function RestTimerProvider({ children, sound, vibrate }: { children: ReactNode; sound: boolean; vibrate: boolean }) {
  const [state, setState] = useState<TimerState | null>(() => (typeof window === 'undefined' ? null : load()));
  const [now, setNow] = useState(() => Date.now());
  const prefs = useRef({ sound, vibrate });
  prefs.current = { sound, vibrate };

  useEffect(() => {
    if (!state) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (state && now >= state.endAt) {
      if (prefs.current.vibrate && 'vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      if (prefs.current.sound) beep();
      setState(null);
      save(null);
    }
  }, [now, state]);

  const start = useCallback((seconds: number, label: string) => {
    primeAudio();
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

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRestTimer(): RestTimerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRestTimer must be used inside RestTimerProvider');
  return v;
}
