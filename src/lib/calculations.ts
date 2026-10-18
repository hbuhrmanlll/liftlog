/** Pure training math: 1RM, volume, PRs, weekly muscle-group sets. */
import type { CardioLog, MuscleGroup, Workout, WorkoutExercise } from '../types';
import type { LoggedSet, SessionResult } from './progression';

export const DAY_MS = 86_400_000;

/** Epley estimated 1-rep max: weight x (1 + reps / 30). A single is its own 1RM. */
export function epley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Completed working sets with real numbers. Warm-ups are stored separately and never included. */
export function completedSets(ex: WorkoutExercise): LoggedSet[] {
  if (ex.skipped) return [];
  return ex.sets
    .filter((s) => s.done && s.reps !== null && s.reps > 0 && s.weight !== null)
    .map((s) => ({ weight: s.weight as number, reps: s.reps as number, rir: s.rir }));
}

/** Load used for volume. Bodyweight lifts count bodyweight + added load when bodyweight is known. */
export function volumeLoad(weight: number, ex: Pick<WorkoutExercise, 'equipment'>, bodyweight?: number): number {
  if (ex.equipment === 'bodyweight') return (bodyweight ?? 0) + weight;
  return weight;
}

export function exerciseVolume(ex: WorkoutExercise, bodyweight?: number): number {
  return completedSets(ex).reduce((sum, s) => sum + volumeLoad(s.weight, ex, bodyweight) * s.reps, 0);
}

export function workoutVolume(w: Workout, bodyweight?: number): number {
  return Math.round(w.exercises.reduce((sum, ex) => sum + exerciseVolume(ex, bodyweight), 0));
}

export function workoutSetCount(w: Workout): number {
  return w.exercises.reduce((n, ex) => n + completedSets(ex).length, 0);
}

export function workoutDurationSec(w: Workout): number {
  const end = w.finishedAt ?? w.startedAt;
  return Math.max(0, Math.round((end - w.startedAt) / 1000));
}

/** Completed workouts, most recent first. */
export function completedWorkouts(workouts: Workout[]): Workout[] {
  return workouts.filter((w) => w.status === 'completed').sort((a, b) => b.startedAt - a.startedAt);
}

/** Session history for one exercise (by key), most recent first. */
export function exerciseHistory(workouts: Workout[], key: string, excludeWorkoutId?: string): SessionResult[] {
  const out: SessionResult[] = [];
  for (const w of completedWorkouts(workouts)) {
    if (w.id === excludeWorkoutId) continue;
    for (const ex of w.exercises) {
      if (ex.key !== key) continue;
      const sets = completedSets(ex);
      if (sets.length === 0) continue;
      out.push({ date: w.startedAt, sets, plannedAction: ex.plannedAction });
    }
  }
  return out;
}

export interface PersonalRecords {
  heaviest: { weight: number; reps: number; date: number } | null;
  best1RM: { value: number; weight: number; reps: number; date: number } | null;
  bestVolume: { value: number; date: number } | null;
  /** Most reps ever done at each weight. */
  repsAtWeight: Record<string, { reps: number; date: number }>;
}

export function personalRecords(history: SessionResult[]): PersonalRecords {
  const pr: PersonalRecords = { heaviest: null, best1RM: null, bestVolume: null, repsAtWeight: {} };
  // Oldest first so ties keep the earliest date.
  for (const session of [...history].reverse()) {
    let volume = 0;
    for (const s of session.sets) {
      volume += s.weight * s.reps;
      if (!pr.heaviest || s.weight > pr.heaviest.weight || (s.weight === pr.heaviest.weight && s.reps > pr.heaviest.reps)) {
        pr.heaviest = { weight: s.weight, reps: s.reps, date: session.date };
      }
      const e = epley1RM(s.weight, s.reps);
      if (!pr.best1RM || e > pr.best1RM.value) pr.best1RM = { value: e, weight: s.weight, reps: s.reps, date: session.date };
      const k = String(s.weight);
      if (!pr.repsAtWeight[k] || s.reps > pr.repsAtWeight[k].reps) pr.repsAtWeight[k] = { reps: s.reps, date: session.date };
    }
    if (!pr.bestVolume || volume > pr.bestVolume.value) pr.bestVolume = { value: volume, date: session.date };
  }
  return pr;
}

export type PRKind = 'weight' | 'e1rm' | 'reps' | 'volume';

export interface NewPR {
  key: string;
  name: string;
  kind: PRKind;
  label: string;
  value: number;
  previous: number;
}

/**
 * PRs set in `session` compared with everything before it.
 * A first-ever session for a lift does not count (everything would be a PR).
 */
export function detectNewPRs(name: string, key: string, session: LoggedSet[], previous: SessionResult[], units: string): NewPR[] {
  if (previous.length === 0 || session.length === 0) return [];
  const before = personalRecords(previous);
  const out: NewPR[] = [];
  const heaviest = session.reduce((m, s) => (s.weight > m.weight ? s : m), session[0]);
  if (before.heaviest && heaviest.weight > before.heaviest.weight) {
    out.push({ key, name, kind: 'weight', label: `Heaviest: ${heaviest.weight} ${units} x ${heaviest.reps}`, value: heaviest.weight, previous: before.heaviest.weight });
  }
  const best = session.reduce((m, s) => Math.max(m, epley1RM(s.weight, s.reps)), 0);
  if (before.best1RM && best > before.best1RM.value) {
    out.push({ key, name, kind: 'e1rm', label: `Best est. 1RM: ${Math.round(best)} ${units}`, value: best, previous: before.best1RM.value });
  }
  for (const s of session) {
    const prior = before.repsAtWeight[String(s.weight)];
    if (prior && s.reps > prior.reps && !out.some((p) => p.kind === 'reps')) {
      out.push({ key, name, kind: 'reps', label: `Rep PR: ${s.reps} reps at ${s.weight} ${units}`, value: s.reps, previous: prior.reps });
    }
  }
  const vol = session.reduce((sum, s) => sum + s.weight * s.reps, 0);
  if (before.bestVolume && vol > before.bestVolume.value && vol > 0) {
    out.push({ key, name, kind: 'volume', label: `Session volume: ${Math.round(vol).toLocaleString()} ${units}`, value: vol, previous: before.bestVolume.value });
  }
  return out;
}

/** Start of the week (Monday 00:00 local) containing `ts`. */
export function startOfWeek(ts: number): number {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Hard sets per muscle group. The primary muscle (first listed) gets a full
 * set; secondary muscles get half a set, which is the common way to count
 * indirect work.
 */
export function muscleSets(workouts: Workout[], from: number, to: number): Record<MuscleGroup, number> {
  const out = {} as Record<MuscleGroup, number>;
  for (const w of workouts) {
    if (w.status !== 'completed' || w.startedAt < from || w.startedAt >= to) continue;
    for (const ex of w.exercises) {
      const n = completedSets(ex).length;
      if (n === 0) continue;
      ex.muscles.forEach((m, i) => {
        out[m] = (out[m] ?? 0) + (i === 0 ? n : n * 0.5);
      });
    }
  }
  return out;
}

export interface WeeklyStats {
  workouts: number;
  volume: number;
  sets: number;
  cardioMinutes: number;
  cardioSessions: number;
  muscleSets: Record<MuscleGroup, number>;
}

export function weeklyStats(workouts: Workout[], cardio: CardioLog[], now: number, bodyweight?: number): WeeklyStats {
  const from = startOfWeek(now);
  const to = from + 7 * DAY_MS;
  const inWeek = workouts.filter((w) => w.status === 'completed' && w.startedAt >= from && w.startedAt < to);
  const c = cardio.filter((x) => x.date >= from && x.date < to);
  return {
    workouts: inWeek.length,
    volume: inWeek.reduce((s, w) => s + workoutVolume(w, bodyweight), 0),
    sets: inWeek.reduce((s, w) => s + workoutSetCount(w), 0),
    cardioMinutes: c.reduce((s, x) => s + x.minutes, 0),
    cardioSessions: c.length,
    muscleSets: muscleSets(workouts, from, to),
  };
}

/** Consecutive weeks (ending this week or last week) with at least one workout. */
export function weekStreak(workouts: Workout[], now: number): number {
  const weeks = new Set(completedWorkouts(workouts).map((w) => startOfWeek(w.startedAt)));
  let cursor = startOfWeek(now);
  if (!weeks.has(cursor)) cursor -= 7 * DAY_MS;
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = startOfWeek(cursor - 3 * DAY_MS);
  }
  return streak;
}

export interface ChartPoint {
  date: number;
  topWeight: number;
  e1rm: number;
  volume: number;
}

/** One point per session, oldest first, for the progress charts. */
export function chartSeries(history: SessionResult[]): ChartPoint[] {
  return [...history].reverse().map((s) => ({
    date: s.date,
    topWeight: s.sets.reduce((m, x) => Math.max(m, x.weight), 0),
    e1rm: Math.round(s.sets.reduce((m, x) => Math.max(m, epley1RM(x.weight, x.reps)), 0)),
    volume: Math.round(s.sets.reduce((sum, x) => sum + x.weight * x.reps, 0)),
  }));
}

export type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'All';

export function rangeStart(range: RangeKey, now: number): number {
  switch (range) {
    case '1M':
      return now - 30 * DAY_MS;
    case '3M':
      return now - 91 * DAY_MS;
    case '6M':
      return now - 182 * DAY_MS;
    case '1Y':
      return now - 365 * DAY_MS;
    case 'All':
      return 0;
  }
}

/** "185 lb x 8, 8, 7" style summary of a session. */
export function summarizeSession(sets: LoggedSet[], units: string, bodyweight = false): string {
  if (sets.length === 0) return '';
  const allSame = sets.every((s) => s.weight === sets[0].weight);
  const fmtW = (w: number) => (bodyweight ? (w > 0 ? `BW +${w} ${units}` : 'BW') : `${w} ${units}`);
  if (allSame) return `${fmtW(sets[0].weight)} x ${sets.map((s) => s.reps).join(', ')}`;
  return sets.map((s) => `${fmtW(s.weight)} x ${s.reps}`).join(', ');
}
