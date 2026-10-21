/** JSON backup validation and CSV export. Pure functions. */
import { z } from 'zod';
import type { BodyweightLog, CardioLog, ChatMessage, Exercise, KeyValue, Settings, WeightOverride, Workout } from '../types';
import { DAY_TYPES, EQUIPMENT, MUSCLE_GROUPS } from '../types';
import { completedSets, workoutDurationSec, workoutVolume } from './calculations';
import { DEFAULT_SETTINGS } from './defaults';

export interface BackupData {
  settings: Settings[];
  exercises: Exercise[];
  workouts: Workout[];
  cardio: CardioLog[];
  bodyweight: BodyweightLog[];
  chat: ChatMessage[];
  overrides: WeightOverride[];
  kv: KeyValue[];
}

export interface BackupFile {
  app: 'LiftLog';
  version: 1;
  exportedAt: string;
  data: BackupData;
}

const day = z.enum(DAY_TYPES as unknown as [string, ...string[]]);
const equipment = z.enum(EQUIPMENT as unknown as [string, ...string[]]);
const muscle = z.enum(MUSCLE_GROUPS as unknown as [string, ...string[]]);
const action = z.enum(['up', 'stay', 'down', 'deload', 'start']);

const place = z.enum(['gym', 'home']).optional();

const exerciseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  day,
  order: z.number(),
  muscles: z.array(muscle),
  equipment,
  category: z.enum(['compound', 'isolation']),
  lowerBody: z.boolean(),
  sets: z.number().int().min(1),
  repMin: z.number().int().min(1),
  repMax: z.number().int().min(1),
  restSec: z.number().min(0),
  cues: z.array(z.string()),
  mistakes: z.array(z.string()),
  alternate: z.string(),
  harder: z.string().optional(),
  place,
  videoUrl: z.string().optional(),
  startWeight: z.number().optional(),
});

const setSchema = z.object({
  id: z.string(),
  weight: z.number().nullable(),
  reps: z.number().nullable(),
  rir: z.number().nullable(),
  durationSec: z.number().optional(),
  done: z.boolean(),
  extra: z.boolean().optional(),
});

const workoutExerciseSchema = z.object({
  uid: z.string(),
  exerciseId: z.string(),
  name: z.string(),
  key: z.string(),
  equipment,
  category: z.enum(['compound', 'isolation']),
  lowerBody: z.boolean(),
  muscles: z.array(muscle),
  targetSets: z.number(),
  repMin: z.number(),
  repMax: z.number(),
  restSec: z.number(),
  sets: z.array(setSchema),
  warmups: z.array(z.object({ weight: z.number(), reps: z.number(), done: z.boolean() })),
  skipped: z.boolean(),
  swappedFrom: z.string().optional(),
  note: z.string(),
  plannedAction: action.optional(),
  plannedWeight: z.number().nullable().optional(),
});

const workoutSchema = z.object({
  id: z.string(),
  day,
  status: z.enum(['active', 'completed']),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  place,
  exercises: z.array(workoutExerciseSchema),
  notes: z.string(),
  coachSummary: z.string().optional(),
});

const settingsSchema = z.looseObject({
  id: z.literal('settings'),
  units: z.enum(['lb', 'kg']),
});

const backupSchema = z.object({
  app: z.literal('LiftLog'),
  version: z.literal(1),
  exportedAt: z.string(),
  data: z.object({
    settings: z.array(settingsSchema),
    exercises: z.array(exerciseSchema),
    workouts: z.array(workoutSchema),
    cardio: z.array(z.looseObject({ id: z.string(), date: z.number(), type: z.string(), minutes: z.number() })).default([]),
    bodyweight: z.array(z.object({ id: z.string(), date: z.number(), weight: z.number() })).default([]),
    chat: z.array(z.object({ id: z.string(), role: z.enum(['user', 'assistant']), content: z.string(), createdAt: z.number() })).default([]),
    overrides: z.array(z.object({ key: z.string(), weight: z.number(), action, reason: z.string(), source: z.enum(['coach', 'manual']), createdAt: z.number() })).default([]),
    kv: z.array(z.object({ key: z.string(), value: z.unknown() })).default([]),
  }),
});

export function makeBackup(data: BackupData, now = new Date()): BackupFile {
  return { app: 'LiftLog', version: 1, exportedAt: now.toISOString(), data };
}

export type ParseBackupResult = { ok: true; backup: BackupFile; summary: string } | { ok: false; error: string };

export function parseBackup(text: string): ParseBackupResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, error: `That doesn't look like a LiftLog backup (${first?.path.join('.') || 'root'}: ${first?.message ?? 'invalid'}).` };
  }
  const d = result.data.data;
  const settings = d.settings.map((s) => ({ ...DEFAULT_SETTINGS, ...s }) as Settings);
  const backup: BackupFile = {
    app: 'LiftLog',
    version: 1,
    exportedAt: result.data.exportedAt,
    data: {
      settings,
      exercises: d.exercises as Exercise[],
      workouts: d.workouts as Workout[],
      cardio: d.cardio as CardioLog[],
      bodyweight: d.bodyweight,
      chat: d.chat,
      overrides: d.overrides,
      kv: d.kv as KeyValue[],
    },
  };
  const summary = `${d.workouts.length} workouts, ${d.exercises.length} exercises, ${d.cardio.length} cardio logs, ${d.bodyweight.length} bodyweight entries`;
  return { ok: true, backup, summary };
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per working set, plus cardio sessions. */
export function workoutsToCsv(workouts: Workout[], cardio: CardioLog[], units: string): string {
  const header = ['date', 'workout', 'exercise', 'set', `weight_${units}`, 'reps', 'rir', 'workout_duration_min', `workout_volume_${units}`, 'note'];
  const rows: string[] = [header.join(',')];
  const done = workouts.filter((w) => w.status === 'completed').sort((a, b) => a.startedAt - b.startedAt);
  for (const w of done) {
    const date = new Date(w.startedAt).toISOString();
    const dur = Math.round(workoutDurationSec(w) / 60);
    const vol = workoutVolume(w);
    for (const ex of w.exercises) {
      completedSets(ex).forEach((s, i) => {
        rows.push([date, w.day, ex.name, i + 1, s.weight, s.reps, s.rir, dur, vol, ex.note].map(csvCell).join(','));
      });
    }
  }
  for (const c of [...cardio].sort((a, b) => a.date - b.date)) {
    rows.push([new Date(c.date).toISOString(), 'cardio', c.type, '', '', '', '', c.minutes, '', c.notes ?? ''].map(csvCell).join(','));
  }
  return rows.join('\n');
}
