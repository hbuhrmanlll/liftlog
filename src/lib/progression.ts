/**
 * Progression engine: decides whether to go UP, STAY, or go DOWN next session.
 *
 * Uses double progression: work inside a rep range at a fixed weight, and only
 * add weight once every target set reaches the top of the range.
 * Pure functions only - no I/O, no dates from the clock.
 */
import type { Category, Equipment, RecAction } from '../types';
import { decreaseLoadByPercent, increaseLoad, progressionIncrement, roundToLoadable, type LoadSettings } from './rounding';

export interface LoggedSet {
  weight: number;
  reps: number;
  /** Reps in reserve, 4 = "4 or more", null = not logged. */
  rir: number | null;
  /** Seconds the set took, if it was timed. */
  durationSec?: number;
}

export interface SessionResult {
  date: number;
  /** Completed working sets only (warm-ups excluded). */
  sets: LoggedSet[];
  /** What the engine recommended going into that session, if known. */
  plannedAction?: RecAction;
}

export interface ProgressionTarget {
  sets: number;
  repMin: number;
  repMax: number;
  equipment: Equipment;
  category: Category;
  lowerBody: boolean;
  /** Home (no equipment): progress by reps, then by the harder variation. */
  home?: boolean;
  harder?: string;
  easier?: string;
}

export interface Recommendation {
  action: RecAction;
  /** Weight to use next session. null = no history and no starting weight yet. */
  weight: number | null;
  /** Short plain-English explanation. */
  reason: string;
  /** What to aim for next session. */
  goal: string;
  /** Extra gentle warning, if any. */
  note?: string;
  stalled: boolean;
}

export interface RecommendOptions {
  startWeight?: number;
}

const EPS = 1e-6;
const same = (a: number, b: number) => Math.abs(a - b) < EPS;

export function formatLoad(weight: number, equipment: Equipment, s: Pick<LoadSettings, 'units'>): string {
  const w = Number.isInteger(weight) ? `${weight}` : `${Math.round(weight * 100) / 100}`;
  if (equipment === 'bodyweight') return weight <= 0 ? 'bodyweight' : `bodyweight +${w} ${s.units}`;
  return `${w} ${s.units}`;
}

/** The weight most sets were done at (ties go to the heavier weight). */
export function workingWeight(sets: LoggedSet[]): number {
  const counts = new Map<number, number>();
  for (const st of sets) counts.set(st.weight, (counts.get(st.weight) ?? 0) + 1);
  let best = -Infinity;
  let bestCount = 0;
  for (const [w, c] of counts) {
    if (c > bestCount || (c === bestCount && w > best)) {
      best = w;
      bestCount = c;
    }
  }
  return best === -Infinity ? 0 : best;
}

/** The sets that count for evaluation: the first N target sets. */
function evaluatedSets(session: SessionResult, target: ProgressionTarget): LoggedSet[] {
  return session.sets.slice(0, target.sets);
}

function totalRepsAt(session: SessionResult, weight: number): number {
  return session.sets.filter((s) => same(s.weight, weight)).reduce((n, s) => n + s.reps, 0);
}

export interface SessionGrade {
  weight: number;
  allAtTop: boolean;
  anyBelow: boolean;
  missingSets: number;
  reps: number[];
}

export function gradeSession(session: SessionResult, target: ProgressionTarget): SessionGrade {
  const sets = evaluatedSets(session, target);
  const weight = workingWeight(sets);
  const missingSets = Math.max(0, target.sets - sets.length);
  const sameWeight = sets.every((s) => same(s.weight, weight));
  const allAtTop = missingSets === 0 && sameWeight && sets.every((s) => s.reps >= target.repMax);
  const anyBelow = sets.some((s) => s.reps < target.repMin);
  return { weight, allAtTop, anyBelow, missingSets, reps: sets.map((s) => s.reps) };
}

/**
 * Stalled = the last 3 sessions were at the same weight and neither of the
 * two most recent beat the total reps of the first of those three.
 */
export function isStalled(history: SessionResult[], target: ProgressionTarget): boolean {
  if (history.length < 3) return false;
  const [s0, s1, s2] = history;
  if (s0.plannedAction === 'deload' || s1.plannedAction === 'deload') return false;
  const w = gradeSession(s2, target).weight;
  if (!same(gradeSession(s1, target).weight, w) || !same(gradeSession(s0, target).weight, w)) return false;
  if (gradeSession(s0, target).allAtTop) return false;
  const base = totalRepsAt(s2, w);
  return totalRepsAt(s1, w) <= base && totalRepsAt(s0, w) <= base;
}

function list(reps: number[]): string {
  return reps.join(', ');
}

/**
 * Main entry point.
 * @param history completed sessions for this exercise, MOST RECENT FIRST.
 */
export function recommend(
  target: ProgressionTarget,
  history: SessionResult[],
  load: LoadSettings,
  opts: RecommendOptions = {},
): Recommendation {
  const fmt = (w: number) => formatLoad(w, target.equipment, load);
  const isBodyweight = target.equipment === 'bodyweight';
  const sessions = history.filter((h) => h.sets.length > 0);

  // Rule 7: first time doing this exercise.
  if (sessions.length === 0) {
    if (opts.startWeight !== undefined && opts.startWeight !== null && Number.isFinite(opts.startWeight)) {
      const w = roundToLoadable(opts.startWeight, target.equipment, load);
      return {
        action: 'start',
        weight: w,
        reason: `Starting weight. Aim for ${target.repMax} reps with 2-3 left in the tank.`,
        goal: `${target.sets} sets of ${target.repMin}-${target.repMax} reps`,
        stalled: false,
      };
    }
    return {
      action: 'start',
      weight: isBodyweight ? 0 : null,
      reason: isBodyweight
        ? `First time: start with bodyweight and see how many clean reps you get.`
        : `First time: pick a weight you could lift for ${target.repMax} reps with 2-3 reps left.`,
      goal: `${target.sets} sets of ${target.repMin}-${target.repMax} reps`,
      stalled: false,
    };
  }

  const last = sessions[0];
  const g0 = gradeSession(last, target);
  const w = g0.weight;
  const increment = progressionIncrement(target, load);

  // After a planned deload session, return to the pre-deload weight.
  if (last.plannedAction === 'deload' && sessions[1] && !g0.anyBelow) {
    const back = gradeSession(sessions[1], target).weight;
    if (back > w + EPS) {
      return {
        action: 'up',
        weight: back,
        reason: `Deload done. Head back to ${fmt(back)} and try to beat your old reps.`,
        goal: `Beat ${list(gradeSession(sessions[1], target).reps)} at ${fmt(back)}`,
        stalled: false,
      };
    }
  }

  // Rule 1: GO UP.
  if (g0.allAtTop) {
    const firstRir = last.sets[0]?.rir;
    if (firstRir === 0) {
      return {
        action: 'stay',
        weight: w,
        reason: `You hit ${target.repMax} reps on all ${target.sets} sets, but your first set was all-out (0 reps left). Stay at ${fmt(w)} one more time and make it feel smoother.`,
        goal: `${target.sets} x ${target.repMax} with at least 1 rep left on set 1`,
        stalled: false,
      };
    }
    const next = increaseLoad(w, increment, target.equipment, load);
    if (target.home && target.harder) {
      return {
        action: 'up',
        weight: w,
        reason: `You hit ${target.repMax} reps on all ${target.sets} sets. Make it harder: switch to ${target.harder} (tap ⋯ on the exercise), or slow every rep to 3 seconds down.`,
        goal: `${target.sets} sets of ${target.repMin}+ reps of ${target.harder}`,
        stalled: false,
      };
    }
    if (target.home) {
      return {
        action: 'up',
        weight: next,
        reason: `You hit ${target.repMax} reps on all ${target.sets} sets. Add ${Math.round((next - w) * 100) / 100} ${load.units}: wear a backpack with books or water bottles (${fmt(next)}), or slow every rep to 3 seconds down.`,
        goal: `${target.sets} sets of ${target.repMin}+ reps at ${fmt(next)}`,
        stalled: false,
      };
    }
    if (isBodyweight) {
      const added = next;
      return {
        action: 'up',
        weight: added,
        reason: `You hit ${target.repMax} reps on all ${target.sets} sets. Add ${Math.round((added - w) * 100) / 100} ${load.units} with a dip belt (${fmt(added)}).`,
        goal: `${target.sets} sets of ${target.repMin}+ reps at ${fmt(added)}`,
        stalled: false,
      };
    }
    return {
      action: 'up',
      weight: next,
      reason: `You hit ${target.repMax} reps on all ${target.sets} sets. Go up to ${fmt(next)}.`,
      goal: `${target.sets} sets of at least ${target.repMin} reps at ${fmt(next)}`,
      stalled: false,
    };
  }

  // Rule 4: GO DOWN after 2 sessions in a row below the range at the same weight.
  const prev = sessions[1];
  if (g0.anyBelow && prev) {
    const g1 = gradeSession(prev, target);
    if (g1.anyBelow && same(g1.weight, w)) {
      if (isBodyweight) {
        if (w <= EPS) {
          return {
            action: 'down',
            weight: 0,
            reason: target.home
              ? `Two sessions in a row under ${target.repMin} reps. Switch to an easier version${target.easier ? ` (${target.easier})` : ''} and build back up.`
              : `Two sessions in a row under ${target.repMin} reps. Use band assistance or switch to the alternate (e.g. Lat Pulldown) to get quality reps in the range.`,
            goal: `${target.sets} sets of ${target.repMin}-${target.repMax} reps`,
            stalled: false,
          };
        }
        const next = Math.max(0, roundToLoadable(w * 0.9, 'bodyweight', load, 'down'));
        const lighter = next < w - EPS ? next : Math.max(0, w - increment);
        return {
          action: 'down',
          weight: lighter,
          reason: `Two sessions in a row under ${target.repMin} reps at ${fmt(w)}. Drop to ${fmt(lighter)} and build back up.`,
          goal: `${target.sets} sets of ${target.repMin}-${target.repMax} reps`,
          stalled: false,
        };
      }
      const next = decreaseLoadByPercent(w, 0.1, target.equipment, load);
      return {
        action: 'down',
        weight: next,
        reason: `Two sessions in a row under ${target.repMin} reps at ${fmt(w)}. Drop about 10% to ${fmt(next)} and build back up.`,
        goal: `${target.sets} sets of ${target.repMin}-${target.repMax} reps at ${fmt(next)}`,
        stalled: false,
      };
    }
  }

  // Rule 5: STALL -> deload.
  if (isStalled(sessions, target)) {
    const next = isBodyweight
      ? Math.max(0, roundToLoadable(w * 0.9, 'bodyweight', load, 'down'))
      : decreaseLoadByPercent(w, 0.1, target.equipment, load);
    return {
      action: 'deload',
      weight: next,
      reason: `No progress in 3 sessions at ${fmt(w)}. Take one lighter session at ${fmt(next)}, then build back up.`,
      goal: `Easy, crisp reps at ${fmt(next)}; leave 3+ reps in the tank`,
      stalled: true,
    };
  }

  // Rule 3: STAY with a gentle warning.
  if (g0.anyBelow) {
    const below = g0.reps.filter((r) => r < target.repMin).length;
    return {
      action: 'stay',
      weight: w,
      reason: `You got ${list(g0.reps)}. Stay at ${fmt(w)} and aim for at least ${target.repMin} reps on every set.`,
      goal: `At least ${target.repMin} reps on all ${target.sets} sets`,
      note: `${below} set${below === 1 ? '' : 's'} fell below ${target.repMin} reps. That's normal now and then - rest a little longer and keep the weight once more.`,
      stalled: false,
    };
  }

  // Rule 2: STAY and beat last time.
  const missing = g0.missingSets > 0 ? ` Finish all ${target.sets} sets next time.` : '';
  return {
    action: 'stay',
    weight: w,
    reason: `You got ${list(g0.reps)}. Stay at ${fmt(w)} and try to get one more rep.${missing}`,
    goal: `Beat last time by at least 1 rep on any set`,
    stalled: false,
  };
}

/**
 * General deload reminder: after 6+ weeks of continuous training
 * (no break longer than 10 days) since the last break or deload.
 * Returns the number of continuous weeks, or 0 if no reminder is due.
 */
export function deloadReminderWeeks(workoutDates: number[], now: number, lastDeloadAt?: number): number {
  if (workoutDates.length === 0) return 0;
  const DAY = 86_400_000;
  const sorted = [...workoutDates].sort((a, b) => a - b);
  // Training must still be ongoing.
  if (now - sorted[sorted.length - 1] > 10 * DAY) return 0;
  let start = sorted[sorted.length - 1];
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i] - sorted[i - 1] > 10 * DAY) break;
    start = sorted[i - 1];
  }
  if (lastDeloadAt && lastDeloadAt > start) start = lastDeloadAt;
  const weeks = Math.floor((now - start) / (7 * DAY));
  return weeks >= 6 ? weeks : 0;
}
