import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { DEFAULT_SETTINGS } from '../lib/defaults';
import type { BodyweightLog, CardioLog, ChatMessage, Exercise, Settings, WeightOverride, Workout } from '../types';

const EMPTY: never[] = [];

export function useSettings(): Settings {
  return useLiveQuery(async () => ({ ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')) }), [], DEFAULT_SETTINGS);
}

/** undefined while loading. */
export function useSettingsLoaded(): Settings | undefined {
  return useLiveQuery(async () => {
    const s = await db.settings.get('settings');
    return s ? { ...DEFAULT_SETTINGS, ...s } : undefined;
  });
}

export function useProgram(): Exercise[] {
  return useLiveQuery(async () => (await db.exercises.toArray()).sort((a, b) => a.order - b.order), [], EMPTY);
}

export function useWorkouts(): Workout[] {
  return useLiveQuery(() => db.workouts.orderBy('startedAt').reverse().toArray(), [], EMPTY);
}

/** undefined while loading, null when none. */
export function useActiveWorkout(): Workout | null | undefined {
  return useLiveQuery(async () => (await db.workouts.where('status').equals('active').first()) ?? null);
}

export function useWorkout(id: string | undefined): Workout | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.workouts.get(id)) ?? null) : null), [id]);
}

export function useCardio(): CardioLog[] {
  return useLiveQuery(() => db.cardio.orderBy('date').reverse().toArray(), [], EMPTY);
}

export function useBodyweight(): BodyweightLog[] {
  return useLiveQuery(() => db.bodyweight.orderBy('date').toArray(), [], EMPTY);
}

export function useOverrides(): WeightOverride[] {
  return useLiveQuery(() => db.overrides.toArray(), [], EMPTY);
}

export function useChat(): ChatMessage[] {
  return useLiveQuery(() => db.chat.orderBy('createdAt').toArray(), [], EMPTY);
}

export function useKv<T>(key: string): T | undefined {
  return useLiveQuery(async () => (await db.kv.get(key))?.value as T | undefined, [key]);
}

export function latestBodyweight(list: BodyweightLog[]): number | undefined {
  return list.length ? list[list.length - 1].weight : undefined;
}
