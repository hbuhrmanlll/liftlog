import type { Exercise, Settings, Workout } from '../types';
import { completedSets, completedWorkouts, detectNewPRs, exerciseHistory, type NewPR } from './calculations';
import { recommendationFor, type ExerciseRecommendation } from './session';

export interface DatedPR extends NewPR {
  date: number;
  workoutId: string;
}

/** PRs set in one workout compared with every earlier completed workout. */
export function prsForWorkout(workout: Workout, all: Workout[], units: string): NewPR[] {
  const earlier = all.filter((w) => w.status === 'completed' && w.startedAt < workout.startedAt && w.id !== workout.id);
  const out: NewPR[] = [];
  for (const ex of workout.exercises) {
    const sets = completedSets(ex);
    if (!sets.length) continue;
    out.push(...detectNewPRs(ex.name, ex.key, sets, exerciseHistory(earlier, ex.key), units));
  }
  return out;
}

/** All PRs set since `since`, newest first. Keeps the most meaningful PR per exercise per workout. */
export function recentPRs(workouts: Workout[], units: string, since: number): DatedPR[] {
  const done = completedWorkouts(workouts).filter((w) => w.startedAt >= since);
  const rank = { weight: 0, e1rm: 1, reps: 2, volume: 3 } as const;
  const out: DatedPR[] = [];
  for (const w of done) {
    const prs = prsForWorkout(w, workouts, units);
    const byKey = new Map<string, NewPR>();
    for (const p of prs) {
      const cur = byKey.get(p.key);
      if (!cur || rank[p.kind] < rank[cur.kind]) byKey.set(p.key, p);
    }
    for (const p of byKey.values()) out.push({ ...p, date: w.startedAt, workoutId: w.id });
  }
  return out;
}

export function programRecommendations(program: Exercise[], workouts: Workout[], settings: Settings): ExerciseRecommendation[] {
  return program.map((ex) => recommendationFor(ex, program, workouts, settings));
}
