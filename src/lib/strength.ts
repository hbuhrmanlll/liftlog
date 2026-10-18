/**
 * Strength and bodyweight tracking over time. Pure functions.
 * The "strength score" is the sum of your best estimated 1-rep max on each
 * day's main lift (e.g. bench + row + squat), carried forward week to week.
 */
import type { BodyweightLog, Exercise, Workout } from '../types';
import { completedWorkouts, DAY_MS, epley1RM, exerciseHistory, normalizeKey, startOfWeek } from './calculations';
import { isMainLift } from './targets';

export interface LiftTrend {
  key: string;
  name: string;
  first: number;
  best: number;
  latest: number;
  changePct: number;
  sessions: number;
}

export function mainLifts(program: Exercise[]): Exercise[] {
  return program.filter((e) => isMainLift(e, program));
}

/** Best e1RM per session for a lift, oldest first. */
function e1rmSessions(workouts: Workout[], key: string): { date: number; e1rm: number }[] {
  return exerciseHistory(workouts, key)
    .map((s) => ({ date: s.date, e1rm: Math.max(...s.sets.map((x) => epley1RM(x.weight, x.reps))) }))
    .reverse();
}

export function liftTrend(workouts: Workout[], key: string, name: string): LiftTrend | null {
  const sessions = e1rmSessions(workouts, key);
  if (!sessions.length) return null;
  const first = Math.round(sessions[0].e1rm);
  const latest = Math.round(sessions[sessions.length - 1].e1rm);
  const best = Math.round(Math.max(...sessions.map((s) => s.e1rm)));
  return { key, name, first, best, latest, sessions: sessions.length, changePct: first > 0 ? Math.round(((latest - first) / first) * 1000) / 10 : 0 };
}

export interface StrengthPoint {
  date: number;
  score: number;
  /** Lifts included so far (a lift counts once you've done it at least once). */
  lifts: number;
}

/** Weekly strength score, oldest first. Each lift's best-so-far e1RM is carried forward. */
export function strengthSeries(workouts: Workout[], liftKeys: string[]): StrengthPoint[] {
  const perLift = liftKeys.map((k) => e1rmSessions(workouts, k));
  const all = perLift.flat();
  if (!all.length) return [];
  const startWeek = startOfWeek(Math.min(...all.map((s) => s.date)));
  const endWeek = startOfWeek(Math.max(...all.map((s) => s.date)));
  const out: StrengthPoint[] = [];
  for (let week = startWeek; week <= endWeek; week = startOfWeek(week + 8 * DAY_MS)) {
    const end = week + 7 * DAY_MS;
    let score = 0;
    let lifts = 0;
    for (const sessions of perLift) {
      const upto = sessions.filter((s) => s.date < end);
      if (!upto.length) continue;
      score += Math.max(...upto.map((s) => s.e1rm));
      lifts += 1;
    }
    out.push({ date: week, score: Math.round(score), lifts });
  }
  return out;
}

export interface WeightTrend {
  first?: BodyweightLog;
  latest?: BodyweightLog;
  change: number;
  /** Average change per week over the last 4 weeks of entries (units per week). */
  weeklyRate: number | null;
  entries: number;
}

export function weightTrend(entries: BodyweightLog[], now: number): WeightTrend {
  const sorted = [...entries].sort((a, b) => a.date - b.date);
  if (!sorted.length) return { change: 0, weeklyRate: null, entries: 0 };
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const recent = sorted.filter((e) => e.date >= now - 28 * DAY_MS);
  let weeklyRate: number | null = null;
  if (recent.length >= 2) {
    const span = (recent[recent.length - 1].date - recent[0].date) / (7 * DAY_MS);
    if (span >= 1) weeklyRate = Math.round(((recent[recent.length - 1].weight - recent[0].weight) / span) * 10) / 10;
  }
  return { first, latest, change: Math.round((latest.weight - first.weight) * 10) / 10, weeklyRate, entries: sorted.length };
}

/** One point per week (the last entry in that week), oldest first, for a clean weekly chart. */
export function weeklyWeights(entries: BodyweightLog[]): { date: number; value: number }[] {
  const byWeek = new Map<number, BodyweightLog>();
  for (const e of [...entries].sort((a, b) => a.date - b.date)) byWeek.set(startOfWeek(e.date), e);
  return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, e]) => ({ date: week, value: e.weight }));
}

export function mainLiftKeys(program: Exercise[]): { key: string; name: string }[] {
  return mainLifts(program).map((e) => ({ key: normalizeKey(e.name), name: e.name }));
}

export function weeksTraining(workouts: Workout[], now: number): number {
  const done = completedWorkouts(workouts);
  if (!done.length) return 0;
  return Math.max(1, Math.ceil((now - done[done.length - 1].startedAt) / (7 * DAY_MS)));
}
