import type { DayType, Schedule, Workout } from '../types';
import { DAY_TYPES } from '../types';

export const DAY_LABEL: Record<DayType, string> = { push: 'Push', pull: 'Pull', legs: 'Legs' };

export const DAY_DESCRIPTION: Record<DayType, string> = {
  push: 'Chest, shoulders, triceps',
  pull: 'Back, rear delts, biceps',
  legs: 'Quads, hamstrings, glutes, calves',
};

/** Next day in the Push -> Pull -> Legs rotation after the last completed workout. */
export function nextDay(workouts: Workout[]): DayType {
  const last = workouts.filter((w) => w.status === 'completed').sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!last) return 'push';
  const i = DAY_TYPES.indexOf(last.day);
  return DAY_TYPES[(i + 1) % DAY_TYPES.length];
}

export function scheduleLabel(s: Schedule): string {
  return s === 6 ? '6 days a week (P/P/L twice)' : '3 days a week (P/P/L once)';
}

/** Workouts per week the schedule calls for. */
export function weeklyTarget(s: Schedule): number {
  return s;
}
