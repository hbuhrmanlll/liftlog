import { describe, expect, it } from 'vitest';
import { buildSeedProgram } from '../data/seedProgram';
import type { BodyweightLog, Workout, WorkoutExercise } from '../types';
import { DEFAULT_SETTINGS } from './defaults';
import { activityCalories, ageFromBirthYear, bmr, bodyStats, cardioCalories, keytelPerMinute, liftingMet, missingStats, toKg, workoutCalories } from './calories';
import { progressReport, progressReportText } from './progressReport';
import { liftTrend, mainLiftKeys, strengthSeries, weeklyWeights, weightTrend } from './strength';
import { lastWeighInDay, weighInDue, weighInIcs } from './weighIn';

const DAY = 86_400_000;
const male = { sex: 'male' as const, age: 30, heightCm: 180, weightKg: 80 };

describe('calories', () => {
  it('Mifflin-St Jeor BMR', () => {
    expect(bmr(male)).toBe(1780); // 800 + 1125 - 150 + 5
    expect(bmr({ ...male, sex: 'female' })).toBe(1614);
    expect(bmr({ ...male, sex: 'unspecified' })).toBe(1697);
    expect(bmr({ sex: 'male', weightKg: 80 })).toBeNull();
  });

  it('activity calories use corrected METs, falling back to weight only', () => {
    // 5 METs x (1780/1440 kcal/min) x 60 min
    expect(activityCalories(5, 60, male)).toBe(371);
    expect(activityCalories(5, 60, { sex: 'male', weightKg: 80 })).toBe(400);
    expect(activityCalories(5, 60, { sex: 'male' })).toBeNull();
    expect(activityCalories(5, 0, male)).toBe(0);
  });

  it('lifting MET depends on session density', () => {
    expect(liftingMet(12, 60)).toBe(3.5); // long rests
    expect(liftingMet(19, 60)).toBe(5.0);
    expect(liftingMet(30, 60)).toBe(6.0);
  });

  it('workout calories cap a workout left open for hours', () => {
    const ex: WorkoutExercise = {
      uid: 'a', exerciseId: 'a', name: 'Bench', key: 'bench', equipment: 'barbell', category: 'compound', lowerBody: false, muscles: ['chest'], targetSets: 4, repMin: 6, repMax: 10, restSec: 120,
      sets: Array.from({ length: 20 }, (_, i) => ({ id: String(i), weight: 100, reps: 8, rir: null, done: true })), warmups: [], skipped: false, note: '',
    };
    const w = (minutes: number): Workout => ({ id: 'w', day: 'push', status: 'completed', startedAt: 0, finishedAt: minutes * 60_000, exercises: [ex], notes: '' });
    const normal = workoutCalories(w(60), male)!;
    expect(normal).toBeGreaterThan(200);
    expect(normal).toBeLessThan(500);
    expect(workoutCalories(w(600), male)).toBe(workoutCalories(w(95), male)); // 20 sets x 4 + 15 = 95 min cap
  });

  it('cardio uses heart rate (Keytel) when possible, METs otherwise', () => {
    expect(keytelPerMinute(140, male)).toBeCloseTo(13.19, 1); // (-55.0969 + 88.33 + 15.90 + 6.05) / 4.184
    expect(keytelPerMinute(140, { ...male, sex: 'unspecified' })).toBeNull();
    expect(cardioCalories({ type: 'Run', minutes: 30, heartRate: 150 }, male)).toBe(Math.round(keytelPerMinute(150, male)! * 30));
    expect(cardioCalories({ type: 'Walk', minutes: 30 }, male)).toBe(Math.round(3.5 * (1780 / 1440) * 30));
    expect(cardioCalories({ type: 'Something new', minutes: 30 }, male)).toBe(Math.round(5 * (1780 / 1440) * 30));
  });

  it('builds stats from settings and converts pounds', () => {
    const s = bodyStats({ ...DEFAULT_SETTINGS, sex: 'female', birthYear: 1996, heightCm: 165 }, 154, new Date(2026, 5, 1));
    expect(s.age).toBe(30);
    expect(s.weightKg).toBeCloseTo(69.85, 1);
    expect(toKg(80, 'kg')).toBe(80);
    expect(ageFromBirthYear(undefined)).toBeUndefined();
    expect(missingStats({ sex: 'male' })).toEqual(['weight', 'age', 'height']);
  });
});

function session(name: string, day: number, weight: number, reps: number[]): Workout {
  const key = name.toLowerCase();
  return {
    id: `${key}${day}`,
    day: 'push',
    status: 'completed',
    startedAt: day * DAY,
    finishedAt: day * DAY + 3600_000,
    notes: '',
    exercises: [
      { uid: key, exerciseId: key, name, key, equipment: 'barbell', category: 'compound', lowerBody: false, muscles: ['chest'], targetSets: reps.length, repMin: 6, repMax: 10, restSec: 120, sets: reps.map((r, i) => ({ id: `${i}`, weight, reps: r, rir: null, done: true })), warmups: [], skipped: false, note: '' },
    ],
  };
}

describe('strength tracking', () => {
  const program = buildSeedProgram();
  const base = 20_000; // a Monday far from epoch edge cases doesn't matter for these assertions
  const workouts = [session('Barbell Bench Press', base, 135, [10, 10, 10, 10]), session('Barbell Back Squat', base + 2, 185, [8, 8, 8, 8]), session('Barbell Bench Press', base + 14, 145, [10, 9, 8, 8])];

  it('main lifts are the first compound of each day', () => {
    expect(mainLiftKeys(program).map((l) => l.name)).toEqual(['Barbell Bench Press', 'Barbell Row', 'Barbell Back Squat']);
  });

  it('lift trend from first to latest e1RM', () => {
    const t = liftTrend(workouts, 'barbell bench press', 'Bench')!;
    expect(t.first).toBe(180); // 135 x (1 + 10/30)
    expect(t.latest).toBe(193); // 145 x 1.333
    expect(t.changePct).toBe(7.2); // (193 - 180) / 180
    expect(liftTrend(workouts, 'nope', 'x')).toBeNull();
  });

  it('strength score carries each lift forward week to week', () => {
    const series = strengthSeries(workouts, ['barbell bench press', 'barbell back squat']);
    expect(series.length).toBeGreaterThanOrEqual(3);
    const last = series[series.length - 1];
    expect(last.lifts).toBe(2);
    expect(last.score).toBe(428); // 193.3 bench + 234.3 squat
    expect(strengthSeries([], ['x'])).toEqual([]);
  });

  it('weight trend and weekly points', () => {
    const now = 100 * DAY;
    const entries: BodyweightLog[] = [
      { id: 'a', date: now - 60 * DAY, weight: 190 },
      { id: 'b', date: now - 21 * DAY, weight: 186 },
      { id: 'c', date: now - 20 * DAY, weight: 185.6 },
      { id: 'd', date: now, weight: 184 },
    ];
    const t = weightTrend(entries, now);
    expect(t.change).toBe(-6);
    expect(t.weeklyRate).toBeCloseTo(-0.7, 1);
    expect(weeklyWeights(entries).length).toBe(3);
    expect(weightTrend([], now)).toMatchObject({ entries: 0, weeklyRate: null });
  });

  it('progress report summarizes everything for the page and the coach', () => {
    const r = progressReport({ settings: { ...DEFAULT_SETTINGS, sex: 'male', birthYear: 1996, heightCm: 180 }, program, workouts, cardio: [{ id: 'c', date: (base + 3) * DAY, type: 'Walk', minutes: 30 }], bodyweight: [{ id: 'b', date: base * DAY, weight: 180 }], now: (base + 15) * DAY });
    expect(r.workouts).toBe(3);
    expect(r.strength?.latest).toBeGreaterThan(0);
    expect(r.calories.total).toBeGreaterThan(0);
    expect(r.lifts[0].name).toBe('Barbell Bench Press');
    const text = progressReportText(r, 'lb');
    expect(text).toContain('Strength score');
    expect(text).toContain('Barbell Bench Press: e1RM 180 -> 193');
  });
});

describe('weekly weigh-in', () => {
  // Wednesday 2026-10-14 10:00 local
  const wed = new Date(2026, 9, 14, 10).getTime();

  it('finds the most recent weigh-in day', () => {
    expect(new Date(lastWeighInDay(1, wed)).getDay()).toBe(1); // Monday
    expect(new Date(lastWeighInDay(1, wed)).getDate()).toBe(12);
    expect(new Date(lastWeighInDay(3, wed)).getDate()).toBe(14); // today
  });

  it('is due until you weigh in on or just before the day', () => {
    expect(weighInDue([], 1, wed)).toBe(true);
    expect(weighInDue([{ id: 'a', date: new Date(2026, 9, 12, 7).getTime(), weight: 180 }], 1, wed)).toBe(false);
    expect(weighInDue([{ id: 'a', date: new Date(2026, 9, 11, 7).getTime(), weight: 180 }], 1, wed)).toBe(false); // a day early counts
    expect(weighInDue([{ id: 'a', date: new Date(2026, 9, 5, 7).getTime(), weight: 180 }], 1, wed)).toBe(true);
  });

  it('builds a weekly repeating calendar reminder', () => {
    const ics = weighInIcs(1, 'https://liftlog.example', new Date(wed));
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('DTSTART:20261019T080000');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});
