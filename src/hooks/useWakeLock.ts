import { useEffect } from 'react';

/** Keeps the screen on while `enabled` (re-acquired when the app comes back to the foreground). */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible' || lock) return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else {
            lock = l;
            l.addEventListener('release', () => {
              if (lock === l) lock = null;
            });
          }
        })
        .catch(() => {
          /* not allowed (battery saver, unsupported) - the workout still works */
        });
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [enabled]);
}
