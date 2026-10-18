import type { Category, Equipment, Units } from '../types';

/** The subset of settings that decides what weights you can actually load. */
export interface LoadSettings {
  units: Units;
  barbellWeight: number;
  plates: number[];
  dumbbellIncrement: number;
  cableIncrement: number;
}

export interface LoadProfile {
  equipment: Equipment;
  category: Category;
  lowerBody: boolean;
}

const SCALE = 100; // work in hundredths so 1.25 kg plates stay exact
const EPS = 1e-6;

const perSideCache = new Map<string, boolean[]>();

/** Which per-side plate totals (in hundredths) are reachable with unlimited pairs of the given plates. */
function reachablePerSide(plates: number[], maxPerSide: number): boolean[] {
  const cacheKey = `${plates.join(',')}|${maxPerSide}`;
  const cached = perSideCache.get(cacheKey);
  if (cached) return cached;
  const size = Math.round(maxPerSide * SCALE);
  const reach = new Array<boolean>(size + 1).fill(false);
  reach[0] = true;
  const coins = plates.map((p) => Math.round(p * SCALE)).filter((p) => p > 0);
  for (const coin of coins) {
    for (let i = coin; i <= size; i++) {
      if (reach[i - coin]) reach[i] = true;
    }
  }
  perSideCache.set(cacheKey, reach);
  return reach;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** All barbell totals that can be loaded, ascending. */
export function barbellLoads(s: LoadSettings): number[] {
  const maxPerSide = s.units === 'kg' ? 250 : 550;
  const reach = reachablePerSide(s.plates.length ? s.plates : [s.units === 'kg' ? 1.25 : 2.5], maxPerSide);
  const out: number[] = [];
  for (let i = 0; i < reach.length; i++) {
    if (reach[i]) out.push(round2(s.barbellWeight + (2 * i) / SCALE));
  }
  return out;
}

/** The smallest weight step for the equipment (what one "notch" is). */
export function loadStep(equipment: Equipment, s: LoadSettings): number {
  switch (equipment) {
    case 'dumbbell':
      return s.dumbbellIncrement;
    case 'cable':
    case 'machine':
      return s.cableIncrement;
    case 'bodyweight':
      return s.plates.length ? Math.min(...s.plates) : s.units === 'kg' ? 1.25 : 2.5;
    case 'barbell':
      return 2 * (s.plates.length ? Math.min(...s.plates) : s.units === 'kg' ? 1.25 : 2.5);
  }
}

export type RoundMode = 'nearest' | 'up' | 'down';

function pick(candidates: number[], weight: number, mode: RoundMode): number {
  if (candidates.length === 0) return round2(weight);
  if (mode === 'up') return candidates.find((c) => c >= weight - EPS) ?? candidates[candidates.length - 1];
  if (mode === 'down') {
    for (let i = candidates.length - 1; i >= 0; i--) if (candidates[i] <= weight + EPS) return candidates[i];
    return candidates[0];
  }
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c - weight) < Math.abs(best - weight) - EPS) best = c;
  }
  return best;
}

/** Round a weight to something you can actually load on this equipment. */
export function roundToLoadable(weight: number, equipment: Equipment, s: LoadSettings, mode: RoundMode = 'nearest'): number {
  if (!Number.isFinite(weight)) return 0;
  if (equipment === 'barbell') {
    if (weight <= s.barbellWeight) return s.barbellWeight;
    return pick(barbellLoads(s), weight, mode);
  }
  const step = loadStep(equipment, s);
  const min = equipment === 'bodyweight' ? 0 : step;
  if (step <= 0) return round2(Math.max(min, weight));
  const units = weight / step;
  const n = mode === 'up' ? Math.ceil(units - EPS) : mode === 'down' ? Math.floor(units + EPS) : Math.round(units);
  return round2(Math.max(min, n * step));
}

/** Smallest loadable weight strictly above `current` that is at least `current + increment`. */
export function increaseLoad(current: number, increment: number, equipment: Equipment, s: LoadSettings): number {
  const target = current + increment;
  let next = roundToLoadable(target, equipment, s, 'nearest');
  if (next <= current + EPS) next = roundToLoadable(current + EPS * 10, equipment, s, 'up');
  if (next <= current + EPS) next = roundToLoadable(target, equipment, s, 'up');
  return next;
}

/** Drop by a percentage and round to a loadable weight that is strictly lighter (if possible). */
export function decreaseLoadByPercent(current: number, pct: number, equipment: Equipment, s: LoadSettings): number {
  const target = current * (1 - pct);
  let next = roundToLoadable(target, equipment, s, 'nearest');
  if (next >= current - EPS) next = roundToLoadable(current - EPS * 10, equipment, s, 'down');
  return Math.min(next, current);
}

/**
 * How much to add when progressing. Matches the program rules:
 * lower-body compounds +10 lb / 5 kg, upper-body barbell +5 lb / 2.5 kg,
 * dumbbells +one dumbbell step, cables/machines +stack step, belt +5 lb / 2.5 kg.
 */
export function progressionIncrement(p: LoadProfile, s: LoadSettings): number {
  const kg = s.units === 'kg';
  switch (p.equipment) {
    case 'barbell':
      if (p.lowerBody && p.category === 'compound') return kg ? 5 : 10;
      return kg ? 2.5 : 5;
    case 'machine':
      if (p.lowerBody && p.category === 'compound') return kg ? 5 : 10;
      return s.cableIncrement;
    case 'cable':
      return s.cableIncrement;
    case 'dumbbell':
      return s.dumbbellIncrement;
    case 'bodyweight':
      return kg ? 2.5 : 5;
  }
}

/** Per-side plate breakdown for a barbell total (greedy, largest first). */
export function platesPerSide(total: number, s: LoadSettings): number[] {
  let remaining = round2((total - s.barbellWeight) / 2);
  const out: number[] = [];
  const plates = [...s.plates].sort((a, b) => b - a);
  for (const p of plates) {
    while (remaining >= p - EPS) {
      out.push(p);
      remaining = round2(remaining - p);
    }
  }
  return remaining > EPS ? [] : out;
}
