import type { Equipment, WarmupSet } from '../types';
import { roundToLoadable, type LoadSettings } from './rounding';

const RAMP: { pct: number; reps: number }[] = [
  { pct: 0.5, reps: 5 },
  { pct: 0.7, reps: 3 },
  { pct: 0.85, reps: 1 },
];

/**
 * Warm-up ramp for the first compound lift: empty bar x 10, then 50% x 5,
 * 70% x 3, 85% x 1, rounded to loadable weights. Never counted as working sets.
 */
export function warmupSets(workWeight: number | null, equipment: Equipment, s: LoadSettings): WarmupSet[] {
  if (workWeight === null || workWeight <= 0 || equipment === 'bodyweight') return [];
  const out: WarmupSet[] = [];
  if (equipment === 'barbell') {
    if (workWeight <= s.barbellWeight) return [];
    out.push({ weight: s.barbellWeight, reps: 10, done: false });
  }
  for (const step of RAMP) {
    const w = roundToLoadable(workWeight * step.pct, equipment, s, 'nearest');
    const last = out[out.length - 1]?.weight ?? 0;
    if (w <= last || w >= workWeight) continue;
    out.push({ weight: w, reps: step.reps, done: false });
  }
  return out;
}
