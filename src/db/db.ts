import Dexie, { type EntityTable } from 'dexie';
import type { BodyweightLog, CardioLog, ChatMessage, Exercise, KeyValue, Settings, WeightOverride, Workout } from '../types';

export class LiftLogDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  workouts!: EntityTable<Workout, 'id'>;
  cardio!: EntityTable<CardioLog, 'id'>;
  bodyweight!: EntityTable<BodyweightLog, 'id'>;
  chat!: EntityTable<ChatMessage, 'id'>;
  overrides!: EntityTable<WeightOverride, 'key'>;
  kv!: EntityTable<KeyValue, 'key'>;

  constructor(name = 'liftlog') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      exercises: 'id, day, order',
      workouts: 'id, status, startedAt, day',
      cardio: 'id, date',
      bodyweight: 'id, date',
      chat: 'id, createdAt',
      overrides: 'key',
      kv: 'key',
    });
  }
}

export const db = new LiftLogDB();

export const ALL_TABLES = ['settings', 'exercises', 'workouts', 'cardio', 'bodyweight', 'chat', 'overrides', 'kv'] as const;
export type TableName = (typeof ALL_TABLES)[number];
