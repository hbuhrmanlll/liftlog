import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutExercise } from '../types';
import {
  chartSeries,
  completedSets,
  detectNewPRs,
  epley1RM,
  exerciseHistory,
  muscleSets,
  personalRecords,
  rangeStart,
  startOfWeek,
  summarizeSession,
  weekStreak,
  weeklyStats,
  workoutDurationSec,
  workoutSetCount,
  workoutVolume,
} from './calculations';

function wex(name: string, sets: [number, number][], extra: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return {
    uid: name,
    exerciseId: name,
    name,
    key: name.toLowerCase(),
    equipment: 'barbell',
    category: 'compound',
    lowerBody: false,
    muscles: ['chest', 'triceps'],
    targetSets: sets.length,
    repMin: 6,
    repMax: 10,
    restSec: 120,
    sets: sets.map(([w, r], i) => ({ id: `${name}${i}`, weight: w, reps: r, rir: null, done: true })),
    warmups: [{ weight: 45, reps: 10, done: true }],
    skipped: false,
    note: '',
    ...extra,
  };
}

function workout(id: string, startedAt: number, exercises: WorkoutExercise[], status: Workout['status'] = 'completed'): Workout {
  return { id, day: 'push', status, startedAt, finishedAt: startedAt + 3600_000, exercises, notes: '' };
}

describe('epley1RM', () => {
  it('uses weight x (1 + reps/30)', () => {
    expect(epley1RM(200, 10)).toBeCloseTo(266.7, 1);
    expect(epley1RM(100, 5)).toBeCloseTo(116.7, 1);
  });
  it('a single is its own max; zero is zero', () => {
    expect(epley1RM(300, 1)).toBe(300);
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
  });
});

describe('volume and counts', () => {
  const w = workout('a', 1000, [wex('Bench', [[185, 8], [185, 8], [185, 7]]), wex('Fly', [[30, 12]], { skipped: true })]);
  it('volume = sum of weight x reps for completed working sets (warm-ups excluded)', () => {
    expect(workoutVolume(w)).toBe(185 * 23);
  });
  it('skipped exercises count for nothing', () => {
    expect(workoutSetCount(w)).toBe(3);
  });
  it('unchecked sets are ignored', () => {
    const e = wex('Bench', [[185, 8]]);
    e.sets.push({ id: 'x', weight: 185, reps: 8, rir: null, done: false });
    expect(completedSets(e)).toHaveLength(1);
  });
  it('keeps the set time when the set timer was used', () => {
    const e = wex('Bench', [[185, 8], [185, 8]]);
    e.sets[0].durationSec = 42;
    expect(completedSets(e).map((s) => s.durationSec)).toEqual([42, undefined]);
  });
  it('bodyweight lifts include bodyweight when known', () => {
    const pu = wex('Pull-Up', [[0, 10], [10, 8]], { equipment: 'bodyweight' });
    expect(workoutVolume(workout('p', 0, [pu]), 180)).toBe(180 * 10 + 190 * 8);
  });
  it('duration', () => {
    expect(workoutDurationSec(w)).toBe(3600);
  });
});

describe('history and PRs', () => {
  const ws = [
    workout('1', 1000, [wex('Bench', [[175, 10], [175, 9]])]),
    workout('2', 2000, [wex('Bench', [[185, 8], [185, 8]])]),
    workout('3', 3000, [wex('Bench', [[185, 9], [185, 8]])]),
    workout('4', 4000, [wex('Bench', [[200, 1]])], 'active'),
  ];

  it('exerciseHistory is most recent first and ignores active workouts', () => {
    const h = exerciseHistory(ws, 'bench');
    expect(h.map((x) => x.date)).toEqual([3000, 2000, 1000]);
  });

  it('can exclude a workout', () => {
    expect(exerciseHistory(ws, 'bench', '3')).toHaveLength(2);
  });

  it('personalRecords', () => {
    const pr = personalRecords(exerciseHistory(ws, 'bench'));
    expect(pr.heaviest).toMatchObject({ weight: 185, reps: 9 });
    expect(pr.best1RM?.value).toBeCloseTo(epley1RM(185, 9), 5);
    expect(pr.bestVolume?.value).toBe(175 * 19);
    expect(pr.repsAtWeight['175'].reps).toBe(10);
    expect(pr.repsAtWeight['185'].reps).toBe(9);
  });

  it('detects new PRs against prior history', () => {
    const prev = exerciseHistory(ws, 'bench');
    const prs = detectNewPRs('Bench', 'bench', [{ weight: 190, reps: 8, rir: null }, { weight: 185, reps: 10, rir: null }], prev, 'lb');
    const kinds = prs.map((p) => p.kind).sort();
    expect(kinds).toEqual(['e1rm', 'reps', 'volume', 'weight']);
  });

  it('no PRs for a first-ever session', () => {
    expect(detectNewPRs('Bench', 'bench', [{ weight: 100, reps: 5, rir: null }], [], 'lb')).toEqual([]);
  });

  it('no PRs when nothing improved', () => {
    expect(detectNewPRs('Bench', 'bench', [{ weight: 175, reps: 5, rir: null }], exerciseHistory(ws, 'bench'), 'lb')).toEqual([]);
  });

  it('chartSeries oldest first', () => {
    const c = chartSeries(exerciseHistory(ws, 'bench'));
    expect(c.map((p) => p.topWeight)).toEqual([175, 185, 185]);
    expect(c[2].volume).toBe(185 * 17);
  });
});

describe('weekly stats', () => {
  // Wed 2026-10-14 12:00 local
  const now = new Date(2026, 9, 14, 12).getTime();
  const monday = startOfWeek(now);

  it('startOfWeek is Monday 00:00', () => {
    const d = new Date(monday);
    expect(d.getDay()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  it('muscleSets counts primary as 1 and secondary as 0.5', () => {
    const ws = [workout('a', monday + 3600_000, [wex('Bench', [[185, 8], [185, 8], [185, 8]])])];
    const m = muscleSets(ws, monday, monday + 7 * 86_400_000);
    expect(m.chest).toBe(3);
    expect(m.triceps).toBe(1.5);
  });

  it('weeklyStats only counts this week, includes cardio', () => {
    const ws = [workout('a', monday + 3600_000, [wex('Bench', [[100, 10]])]), workout('b', monday - 3600_000, [wex('Bench', [[100, 10]])])];
    const s = weeklyStats(ws, [{ id: 'c', date: monday + 1000, type: 'Walk', minutes: 30 }], now);
    expect(s.workouts).toBe(1);
    expect(s.volume).toBe(1000);
    expect(s.cardioMinutes).toBe(30);
  });

  it('weekStreak counts consecutive weeks', () => {
    const W = 7 * 86_400_000;
    const ws = [workout('a', monday + 1000, []), workout('b', monday - W + 1000, []), workout('c', monday - 3 * W + 1000, [])];
    expect(weekStreak(ws, now)).toBe(2);
    expect(weekStreak([], now)).toBe(0);
  });

  it('rangeStart', () => {
    expect(rangeStart('All', now)).toBe(0);
    expect(rangeStart('1M', now)).toBeLessThan(now);
  });
});

describe('summarizeSession', () => {
  it('formats "Last time" lines', () => {
    expect(summarizeSession([{ weight: 185, reps: 8, rir: null }, { weight: 185, reps: 8, rir: null }, { weight: 185, reps: 7, rir: null }], 'lb')).toBe('185 lb x 8, 8, 7');
    expect(summarizeSession([{ weight: 185, reps: 8, rir: null }, { weight: 175, reps: 9, rir: null }], 'lb')).toBe('185 lb x 8, 175 lb x 9');
    expect(summarizeSession([{ weight: 0, reps: 8, rir: null }], 'lb', true)).toBe('BW x 8');
  });
});
