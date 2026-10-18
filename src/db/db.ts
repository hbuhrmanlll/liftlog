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

/** The original single-user database name; the first profile takes it over. */
export const LEGACY_DB_NAME = 'liftlog';

/**
 * The signed-in profile's database. Modules import this binding by name, so
 * reassigning it (ES module live binding) switches every query to that profile.
 */
export let db = new LiftLogDB(LEGACY_DB_NAME);

export function switchToProfileDb(dbName: string): LiftLogDB {
  if (db.name !== dbName) {
    db.close();
    db = new LiftLogDB(dbName);
  }
  return db;
}

export const ALL_TABLES = ['settings', 'exercises', 'workouts', 'cardio', 'bodyweight', 'chat', 'overrides', 'kv'] as const;
export type TableName = (typeof ALL_TABLES)[number];
