/** One summary of overall progress, used by the Progress page and the AI coach. Pure. */
import type { BodyweightLog, CardioLog, Exercise, Settings, Workout } from '../types';
import { completedWorkouts, DAY_MS, workoutVolume } from './calculations';
import { bodyStats, cardioCalories, workoutCalories, type BodyStats } from './calories';
import { recentPRs } from './insights';
import { liftTrend, mainLiftKeys, strengthSeries, weeksTraining, weightTrend, type LiftTrend, type WeightTrend } from './strength';

export interface ProgressReport {
  workouts: number;
  weeks: number;
  /** Average workouts per week vs. the schedule (1 = right on target). */
  consistency: number;
  avgPerWeek: number;
  totalVolume: number;
  prs: number;
  calories: { total: number; last30: number; perWorkout: number | null; known: boolean };
  strength: { first: number; latest: number; changePct: number } | null;
  lifts: LiftTrend[];
  weight: WeightTrend;
  stats: BodyStats;
}

export function progressReport(input: { settings: Settings; program: Exercise[]; workouts: Workout[]; cardio: CardioLog[]; bodyweight: BodyweightLog[]; now: number }): ProgressReport {
  const { settings, program, workouts, cardio, bodyweight, now } = input;
  const done = completedWorkouts(workouts);
  const weeks = weeksTraining(workouts, now);
  const avgPerWeek = weeks ? Math.round((done.length / weeks) * 10) / 10 : 0;
  const latestWeight = [...bodyweight].sort((a, b) => b.date - a.date)[0]?.weight;
  const stats = bodyStats(settings, latestWeight, new Date(now));

  let total = 0;
  let last30 = 0;
  let known = true;
  for (const w of done) {
    const k = workoutCalories(w, stats);
    if (k === null) known = false;
    total += k ?? 0;
    if (w.startedAt >= now - 30 * DAY_MS) last30 += k ?? 0;
  }
  for (const c of cardio) {
    const k = cardioCalories(c, stats);
    total += k ?? 0;
    if (c.date >= now - 30 * DAY_MS) last30 += k ?? 0;
  }

  const keys = mainLiftKeys(program);
  const series = strengthSeries(workouts, keys.map((k) => k.key));
  const firstFull = series.find((p) => p.lifts === Math.max(...series.map((s) => s.lifts))) ?? series[0];
  const latest = series[series.length - 1];
  const strength = firstFull && latest ? { first: firstFull.score, latest: latest.score, changePct: firstFull.score ? Math.round(((latest.score - firstFull.score) / firstFull.score) * 1000) / 10 : 0 } : null;

  // All lifts you've done, main lifts first.
  const seen = new Map<string, string>();
  for (const k of keys) seen.set(k.key, k.name);
  for (const w of done) for (const ex of w.exercises) if (!seen.has(ex.key)) seen.set(ex.key, ex.name);
  const lifts = [...seen.entries()].map(([key, name]) => liftTrend(workouts, key, name)).filter((t): t is LiftTrend => t !== null);

  return {
    workouts: done.length,
    weeks,
    avgPerWeek,
    consistency: settings.schedule ? Math.round((avgPerWeek / settings.schedule) * 100) / 100 : 0,
    totalVolume: done.reduce((s, w) => s + workoutVolume(w, latestWeight), 0),
    prs: recentPRs(workouts, settings.units, 0).length,
    calories: { total, last30, perWorkout: known && done.length ? Math.round(done.reduce((s, w) => s + (workoutCalories(w, stats) ?? 0), 0) / done.length) : null, known },
    strength,
    lifts,
    weight: weightTrend(bodyweight, now),
    stats,
  };
}

/** Compact text version for the AI coach. */
export function progressReportText(r: ProgressReport, units: string): string {
  const lines = [
    `Training: ${r.workouts} workouts over ${r.weeks} week(s), avg ${r.avgPerWeek}/week (${Math.round(r.consistency * 100)}% of schedule). PRs set: ${r.prs}.`,
    r.strength ? `Strength score (sum of main-lift e1RMs): ${r.strength.first} -> ${r.strength.latest} ${units} (${r.strength.changePct >= 0 ? '+' : ''}${r.strength.changePct}%).` : 'Strength score: not enough data yet.',
    ...r.lifts.slice(0, 8).map((l) => `- ${l.name}: e1RM ${l.first} -> ${l.latest} (best ${l.best}, ${l.changePct >= 0 ? '+' : ''}${l.changePct}%, ${l.sessions} sessions)`),
    r.weight.latest
      ? `Bodyweight: ${r.weight.first?.weight} -> ${r.weight.latest.weight} ${units} (${r.weight.change >= 0 ? '+' : ''}${r.weight.change}); recent rate ${r.weight.weeklyRate ?? 'n/a'} ${units}/week; ${r.weight.entries} weigh-ins.`
      : 'Bodyweight: not logged.',
    `Estimated calories burned (workouts + cardio): ${Math.round(r.calories.last30)} kcal in the last 30 days, ${Math.round(r.calories.total)} total${r.calories.known ? '' : ' (partial: profile stats missing)'}.`,
    `Profile: ${r.stats.sex}${r.stats.age ? `, age ${r.stats.age}` : ''}${r.stats.heightCm ? `, ${Math.round(r.stats.heightCm)} cm` : ''}.`,
  ];
  return lines.join('\n');
}
