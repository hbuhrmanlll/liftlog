/** Builds the pre-filled exercise rows for a new workout. Pure; no DB access. */
import type { Exercise, Settings, SetLog, WeightOverride, Workout, WorkoutExercise } from '../types';
import { exerciseHistory, normalizeKey } from './calculations';
import { recommend, type Recommendation } from './progression';
import { effectiveTargets, isMainLift } from './targets';
import { warmupSets } from './warmup';

let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${r}_${seq}`;
}

export interface ExerciseRecommendation {
  exercise: Exercise;
  recommendation: Recommendation;
  targets: ReturnType<typeof effectiveTargets>;
  override?: WeightOverride;
}

/** Engine recommendation for one program exercise, using the goal-adjusted targets. */
export function recommendationFor(exercise: Exercise, program: Exercise[], workouts: Workout[], settings: Settings, excludeWorkoutId?: string): ExerciseRecommendation {
  const targets = effectiveTargets(exercise, settings.goal, isMainLift(exercise, program));
  const history = exerciseHistory(workouts, normalizeKey(exercise.name), excludeWorkoutId);
  const recommendation = recommend({ ...targets, equipment: exercise.equipment, category: exercise.category, lowerBody: exercise.lowerBody }, history, settings, {
    startWeight: exercise.startWeight,
  });
  return { exercise, recommendation, targets };
}

function prefillReps(rec: Recommendation, i: number, repMin: number, repMax: number, lastReps: number[]): number {
  switch (rec.action) {
    case 'up':
    case 'down':
    case 'deload':
      return repMin;
    case 'start':
      return repMax;
    case 'stay': {
      const last = lastReps[i] ?? lastReps[lastReps.length - 1] ?? repMin;
      return Math.min(repMax, Math.max(repMin, last + 1));
    }
  }
}

export function makeSet(weight: number | null, reps: number | null, extra = false): SetLog {
  return { id: uid('set'), weight, reps, rir: null, done: false, ...(extra ? { extra: true } : {}) };
}

export function buildWorkoutExercise(
  exercise: Exercise,
  program: Exercise[],
  workouts: Workout[],
  settings: Settings,
  override?: WeightOverride,
): WorkoutExercise {
  const { recommendation: rec, targets } = recommendationFor(exercise, program, workouts, settings);
  const key = normalizeKey(exercise.name);
  const history = exerciseHistory(workouts, key);
  const lastReps = history[0]?.sets.map((s) => s.reps) ?? [];
  const weight = override ? override.weight : rec.weight;
  const action = override ? override.action : rec.action;
  const main = isMainLift(exercise, program);
  const sets: SetLog[] = Array.from({ length: targets.sets }, (_, i) => makeSet(weight, prefillReps({ ...rec, action }, i, targets.repMin, targets.repMax, lastReps)));
  return {
    uid: uid('wex'),
    exerciseId: exercise.id,
    name: exercise.name,
    key,
    equipment: exercise.equipment,
    category: exercise.category,
    lowerBody: exercise.lowerBody,
    muscles: [...exercise.muscles],
    targetSets: targets.sets,
    repMin: targets.repMin,
    repMax: targets.repMax,
    restSec: targets.restSec,
    sets,
    warmups: main && settings.warmupSuggestions ? warmupSets(weight, exercise.equipment, settings) : [],
    skipped: false,
    note: '',
    plannedAction: action,
    plannedWeight: weight,
  };
}

export function buildWorkout(day: Workout['day'], program: Exercise[], workouts: Workout[], settings: Settings, overrides: WeightOverride[], now: number): Workout {
  const byKey = new Map(overrides.map((o) => [o.key, o]));
  const dayExercises = program.filter((e) => e.day === day).sort((a, b) => a.order - b.order);
  return {
    id: uid('wo'),
    day,
    status: 'active',
    startedAt: now,
    exercises: dayExercises.map((ex) => buildWorkoutExercise(ex, program, workouts, settings, byKey.get(normalizeKey(ex.name)))),
    notes: '',
  };
}

/**
 * When the user changes a set's weight, copy it to later sets that are not
 * done yet and still hold the old value (or are empty). Saves typing.
 */
export function propagateWeight(sets: SetLog[], index: number, newWeight: number | null): SetLog[] {
  const old = sets[index]?.weight ?? null;
  return sets.map((s, i) => {
    if (i === index) return { ...s, weight: newWeight };
    if (i > index && !s.done && (s.weight === old || s.weight === null)) return { ...s, weight: newWeight };
    return s;
  });
}
