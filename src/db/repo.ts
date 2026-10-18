/** All database reads/writes go through here so pages stay simple. */
import { buildSeedProgram, exerciseFromLibrary } from '../data/seedProgram';
import { findLibraryExercise } from '../data/exerciseLibrary';
import { makeBackup, type BackupData, type BackupFile } from '../lib/backup';
import { normalizeKey } from '../lib/calculations';
import { DEFAULT_SETTINGS, LB_PER_KG, LOAD_DEFAULTS } from '../lib/defaults';
import { buildWorkout, buildWorkoutExercise, uid } from '../lib/session';
import type { DayType, Exercise, LibraryExercise, Settings, Units, WeightOverride, Workout, WorkoutExercise } from '../types';
import { db } from './db';

export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.settings, db.exercises, async () => {
    const existing = await db.settings.get('settings');
    if (!existing) await db.settings.put(DEFAULT_SETTINGS);
    if ((await db.exercises.count()) === 0) await db.exercises.bulkPut(buildSeedProgram());
  });
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'settings' });
}

// ---------- Units ----------

const roundHalf = (n: number) => Math.round(n * 2) / 2;

/** Switch units and convert every stored weight so history stays correct. */
export async function changeUnits(to: Units): Promise<void> {
  const settings = await getSettings();
  if (settings.units === to) return;
  const factor = to === 'kg' ? 1 / LB_PER_KG : LB_PER_KG;
  const conv = (w: number | null | undefined) => (w === null || w === undefined ? w : roundHalf(w * factor));
  await db.transaction('rw', [db.settings, db.workouts, db.exercises, db.overrides, db.bodyweight], async () => {
    const workouts = await db.workouts.toArray();
    await db.workouts.bulkPut(
      workouts.map((w) => ({
        ...w,
        exercises: w.exercises.map((ex) => ({
          ...ex,
          plannedWeight: conv(ex.plannedWeight) ?? null,
          sets: ex.sets.map((s) => ({ ...s, weight: conv(s.weight) ?? null })),
          warmups: ex.warmups.map((s) => ({ ...s, weight: conv(s.weight) as number })),
        })),
      })),
    );
    const exercises = await db.exercises.toArray();
    await db.exercises.bulkPut(exercises.map((e) => (e.startWeight === undefined ? e : { ...e, startWeight: conv(e.startWeight) as number })));
    const overrides = await db.overrides.toArray();
    await db.overrides.bulkPut(overrides.map((o) => ({ ...o, weight: conv(o.weight) as number })));
    const bw = await db.bodyweight.toArray();
    await db.bodyweight.bulkPut(bw.map((b) => ({ ...b, weight: Math.round(b.weight * factor * 10) / 10 })));
    await db.settings.put({ ...settings, units: to, ...LOAD_DEFAULTS[to] });
  });
}

// ---------- Program ----------

export async function getProgram(): Promise<Exercise[]> {
  return (await db.exercises.toArray()).sort((a, b) => a.order - b.order);
}

async function renumber(day: DayType): Promise<void> {
  const list = (await db.exercises.where('day').equals(day).toArray()).sort((a, b) => a.order - b.order);
  await db.exercises.bulkPut(list.map((e, i) => ({ ...e, order: i })));
}

export async function updateExercise(id: string, patch: Partial<Exercise>): Promise<void> {
  await db.exercises.update(id, patch);
}

export async function addExerciseToDay(day: DayType, lib: LibraryExercise, position?: number): Promise<Exercise> {
  const list = (await db.exercises.where('day').equals(day).toArray()).sort((a, b) => a.order - b.order);
  const ex = exerciseFromLibrary(lib, day, position ?? list.length);
  await db.transaction('rw', db.exercises, async () => {
    if (position !== undefined) {
      await db.exercises.bulkPut(list.map((e) => (e.order >= position ? { ...e, order: e.order + 1 } : e)));
    }
    await db.exercises.put(ex);
    await renumber(day);
  });
  return ex;
}

export async function removeExercise(id: string): Promise<void> {
  const ex = await db.exercises.get(id);
  if (!ex) return;
  await db.transaction('rw', db.exercises, async () => {
    await db.exercises.delete(id);
    await renumber(ex.day);
  });
}

export async function moveExercise(id: string, direction: -1 | 1): Promise<void> {
  const ex = await db.exercises.get(id);
  if (!ex) return;
  const list = (await db.exercises.where('day').equals(ex.day).toArray()).sort((a, b) => a.order - b.order);
  const i = list.findIndex((e) => e.id === id);
  const j = i + direction;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.exercises.bulkPut(list.map((e, k) => ({ ...e, order: k })));
}

/** Replace a program exercise with another (keeps position). */
export async function replaceExercise(id: string, lib: LibraryExercise): Promise<void> {
  const ex = await db.exercises.get(id);
  if (!ex) return;
  await db.exercises.put({ ...exerciseFromLibrary(lib, ex.day, ex.order), id: ex.id });
}

export async function resetProgram(): Promise<void> {
  await db.transaction('rw', db.exercises, async () => {
    await db.exercises.clear();
    await db.exercises.bulkPut(buildSeedProgram());
  });
}

// ---------- Workouts ----------

export async function getActiveWorkout(): Promise<Workout | undefined> {
  return db.workouts.where('status').equals('active').first();
}

export async function startWorkout(day: DayType): Promise<Workout> {
  const existing = await getActiveWorkout();
  if (existing) return existing;
  const [settings, program, workouts, overrides] = await Promise.all([getSettings(), getProgram(), db.workouts.toArray(), db.overrides.toArray()]);
  const workout = buildWorkout(day, program, workouts, settings, overrides, Date.now());
  await db.workouts.put(workout);
  return workout;
}

export async function saveWorkout(w: Workout): Promise<void> {
  await db.workouts.put(w);
}

/** Swap an exercise in the active workout for its alternate. */
export async function swapWorkoutExercise(workout: Workout, exUid: string): Promise<Workout> {
  const [settings, program, workouts, overrides] = await Promise.all([getSettings(), getProgram(), db.workouts.toArray(), db.overrides.toArray()]);
  const idx = workout.exercises.findIndex((e) => e.uid === exUid);
  if (idx < 0) return workout;
  const current = workout.exercises[idx];
  const source = program.find((p) => p.id === current.exerciseId);
  const altName = current.swappedFrom ? current.swappedFrom : (source?.alternate ?? findLibraryExercise(current.name)?.alternate);
  if (!altName) return workout;
  const lib = findLibraryExercise(altName) ?? (source ? { ...source, name: altName, alternate: source.name } : undefined);
  if (!lib) return workout;
  const temp: Exercise = { ...lib, id: current.exerciseId, day: workout.day, order: source?.order ?? idx };
  const override = overrides.find((o) => o.key === normalizeKey(lib.name));
  const built: WorkoutExercise = buildWorkoutExercise(temp, program.map((p) => (p.id === temp.id ? temp : p)), workouts, settings, override);
  const swappedBack = current.swappedFrom && normalizeKey(current.swappedFrom) === normalizeKey(lib.name);
  const next: WorkoutExercise = { ...built, swappedFrom: swappedBack ? undefined : current.name, note: current.note };
  const updated = { ...workout, exercises: workout.exercises.map((e, i) => (i === idx ? next : e)) };
  await db.workouts.put(updated);
  return updated;
}

export async function finishWorkout(w: Workout): Promise<Workout> {
  const finished: Workout = { ...w, status: 'completed', finishedAt: Date.now() };
  await db.transaction('rw', db.workouts, db.overrides, async () => {
    await db.workouts.put(finished);
    // Overrides apply to one session only.
    const keys = w.exercises.filter((e) => !e.skipped).map((e) => e.key);
    await db.overrides.bulkDelete(keys);
  });
  return finished;
}

export async function discardWorkout(id: string): Promise<void> {
  await db.workouts.delete(id);
}

export async function deleteWorkout(id: string): Promise<void> {
  await db.workouts.delete(id);
}

export async function setOverride(o: Omit<WeightOverride, 'createdAt'>): Promise<void> {
  await db.overrides.put({ ...o, createdAt: Date.now() });
}

export async function clearOverride(key: string): Promise<void> {
  await db.overrides.delete(key);
}

// ---------- Cardio / bodyweight ----------

export async function addCardio(entry: { type: string; minutes: number; distance?: number; heartRate?: number; notes?: string; date?: number }): Promise<void> {
  await db.cardio.put({ id: uid('cardio'), date: entry.date ?? Date.now(), type: entry.type, minutes: entry.minutes, distance: entry.distance, heartRate: entry.heartRate, notes: entry.notes });
}

export async function deleteCardio(id: string): Promise<void> {
  await db.cardio.delete(id);
}

export async function addBodyweight(weight: number, date = Date.now()): Promise<void> {
  await db.bodyweight.put({ id: uid('bw'), date, weight });
}

export async function deleteBodyweight(id: string): Promise<void> {
  await db.bodyweight.delete(id);
}

// ---------- Key/value ----------

export async function getKv<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

// ---------- Backup ----------

export async function exportAll(): Promise<BackupFile> {
  const data: BackupData = {
    settings: await db.settings.toArray(),
    exercises: await db.exercises.toArray(),
    workouts: await db.workouts.toArray(),
    cardio: await db.cardio.toArray(),
    bodyweight: await db.bodyweight.toArray(),
    chat: await db.chat.toArray(),
    overrides: await db.overrides.toArray(),
    kv: await db.kv.toArray(),
  };
  return makeBackup(data);
}

export async function importAll(backup: BackupFile): Promise<void> {
  const d = backup.data;
  await db.transaction('rw', [db.settings, db.exercises, db.workouts, db.cardio, db.bodyweight, db.chat, db.overrides, db.kv], async () => {
    await Promise.all([db.settings.clear(), db.exercises.clear(), db.workouts.clear(), db.cardio.clear(), db.bodyweight.clear(), db.chat.clear(), db.overrides.clear(), db.kv.clear()]);
    await db.settings.bulkPut(d.settings.length ? d.settings : [DEFAULT_SETTINGS]);
    await db.exercises.bulkPut(d.exercises.length ? d.exercises : buildSeedProgram());
    await db.workouts.bulkPut(d.workouts);
    await db.cardio.bulkPut(d.cardio);
    await db.bodyweight.bulkPut(d.bodyweight);
    await db.chat.bulkPut(d.chat);
    await db.overrides.bulkPut(d.overrides);
    await db.kv.bulkPut(d.kv);
  });
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', [db.settings, db.exercises, db.workouts, db.cardio, db.bodyweight, db.chat, db.overrides, db.kv], async () => {
    await Promise.all([db.settings.clear(), db.exercises.clear(), db.workouts.clear(), db.cardio.clear(), db.bodyweight.clear(), db.chat.clear(), db.overrides.clear(), db.kv.clear()]);
  });
  await ensureSeeded();
}

export async function clearChat(): Promise<void> {
  await db.chat.clear();
}

export async function addChatMessage(role: 'user' | 'assistant', content: string): Promise<string> {
  const id = uid('msg');
  await db.chat.put({ id, role, content, createdAt: Date.now() });
  return id;
}

export async function updateChatMessage(id: string, content: string): Promise<void> {
  await db.chat.update(id, { content });
}
