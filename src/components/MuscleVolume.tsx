import { MUSCLE_GROUPS, type MuscleGroup } from '../types';
import { cx } from './ui';

const LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  triceps: 'Triceps',
  lats: 'Lats',
  'upper back': 'Upper back',
  'rear delts': 'Rear delts',
  biceps: 'Biceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
};

const MAX = 24;

/** Horizontal bars of weekly hard sets per muscle with the 10-20 target zone shaded. */
export function MuscleVolume({ sets, compact }: { sets: Partial<Record<MuscleGroup, number>>; compact?: boolean }) {
  const rows = MUSCLE_GROUPS.filter((m) => !compact || (sets[m] ?? 0) > 0 || !['forearms', 'core'].includes(m));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-4 rounded-sm bg-accent-soft ring-1 ring-accent/40" aria-hidden /> Target: 10-20 sets
        </span>
        <span className="whitespace-nowrap">Secondary muscles count ½</span>
      </div>
      <ul className="space-y-1.5" aria-label="Hard sets per muscle group this week">
        {rows.map((m) => {
          const v = Math.round((sets[m] ?? 0) * 2) / 2;
          const status = v === 0 ? 'none' : v < 10 ? 'low' : v > 20 ? 'high' : 'ok';
          return (
            <li key={m} className="grid grid-cols-[88px_1fr_64px] items-center gap-2 text-[13px]">
              <span className="truncate text-ink-2">{LABEL[m]}</span>
              <div className="relative h-5 rounded-md bg-surface-2" aria-hidden>
                <div className="absolute inset-y-0 rounded-sm bg-accent-soft" style={{ left: `${(10 / MAX) * 100}%`, width: `${(10 / MAX) * 100}%` }} />
                <div
                  className={cx('absolute inset-y-[5px] left-0 rounded-r-[4px] transition-[width] duration-500', status === 'ok' || status === 'high' ? 'bg-accent' : 'bg-ink-3')}
                  style={{ width: `${Math.min(100, (v / MAX) * 100)}%` }}
                />
              </div>
              <span className="tnum text-right">
                <span className="font-semibold text-ink">{v}</span>
                {status === 'low' && <span className="ml-1 text-[11px] text-down">low</span>}
                {status === 'high' && <span className="ml-1 text-[11px] text-ink-3">high</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
