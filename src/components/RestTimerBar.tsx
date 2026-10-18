import { SkipForward, Timer } from 'lucide-react';
import { useRestTimer } from '../hooks/restTimer';
import { formatClock } from '../lib/format';

export function RestTimerBar() {
  const t = useRestTimer();
  if (!t.active) return null;
  const pct = t.duration > 0 ? Math.min(100, (t.remaining / t.duration) * 100) : 0;
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-40 px-3 lg:bottom-6 lg:left-64 lg:px-6" role="timer" aria-live="off" aria-label={`Rest timer ${formatClock(t.remaining)} remaining`}>
      <div className="animate-sheet mx-auto max-w-xl overflow-hidden rounded-2xl border border-line bg-surface-2/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="h-1 bg-surface-3">
          <div className="h-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Timer className="size-5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="tnum text-xl font-bold leading-none text-ink">{formatClock(t.remaining)}</div>
            <div className="mt-0.5 truncate text-xs text-ink-3">Rest · {t.label}</div>
          </div>
          <button type="button" onClick={() => t.adjust(-15)} className="tnum h-10 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-surface-3 hover:text-ink" aria-label="Subtract 15 seconds">
            −15
          </button>
          <button type="button" onClick={() => t.adjust(15)} className="tnum h-10 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-surface-3 hover:text-ink" aria-label="Add 15 seconds">
            +15
          </button>
          <button type="button" onClick={t.skip} className="flex h-10 items-center gap-1 rounded-xl bg-surface-3 px-3 text-sm font-semibold text-ink hover:brightness-110" aria-label="Skip rest">
            <SkipForward className="size-4" aria-hidden /> Skip
          </button>
        </div>
      </div>
    </div>
  );
}
