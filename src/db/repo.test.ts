import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseBackup } from '../lib/backup';
import { db } from './db';
import { changeUnits, ensureSeeded, exportAll, finishWorkout, getActiveWorkout, getProgram, getSettings, importAll, moveExercise, resetAll, saveWorkout, setOverride, startWorkout, swapWorkoutExercise } from './repo';

beforeEach(async () => {
  await resetAll();
});

async function doPush(reps: (i: number) => number) {
  const w = await startWorkout('push');
  const done = { ...w, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((s, i) => ({ ...s, weight: s.weight ?? 100, reps: reps(i), done: true })) })) };
  await saveWorkout(done);
  return finishWorkout(done);
}

describe('repo', () => {
  it('seeds settings, the gym program (6 lifts + core per day) and the home program once', async () => {
    await ensureSeeded();
    expect(await db.exercises.count()).toBe(39);
    expect((await getProgram()).filter((e) => e.day === 'push').map((e) => e.name).at(-1)).toBe('Cable Crunch');
    expect(await getProgram('home')).toHaveLength(18);
    expect((await getSettings()).units).toBe('lb');
  });

  it('runs a full workout and pre-fills the next one from the engine', async () => {
    const program = await getProgram();
    await db.exercises.update(program.find((e) => e.name === 'Barbell Bench Press')!.id, { startWeight: 135 });
    const first = await startWorkout('push');
    expect(first.exercises[0].sets[0].weight).toBe(135);
    expect(first.exercises[0].warmups.length).toBeGreaterThan(0);
    expect(await startWorkout('legs')).toMatchObject({ id: first.id }); // resumes, doesn't duplicate
    await db.workouts.delete(first.id);

    await doPush(() => 10);
    expect(await getActiveWorkout()).toBeUndefined();
    const next = await startWorkout('push');
    const bench = next.exercises.find((e) => e.name === 'Barbell Bench Press')!;
    expect(bench.plannedAction).toBe('up');
    expect(bench.sets[0].weight).toBe(140);
  });

  it('applies a coach override for one session only', async () => {
    await doPush(() => 10);
    await setOverride({ key: 'barbell bench press', weight: 135, action: 'stay', reason: 'x', source: 'coach' });
    const w = await startWorkout('push');
    expect(w.exercises[0].sets[0].weight).toBe(135);
    await finishWorkout({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: true })) })) });
    expect(await db.overrides.count()).toBe(0);
  });

  it('swaps to the alternate and back mid-workout', async () => {
    const w = await startWorkout('pull');
    const pu = w.exercises.find((e) => e.name === 'Pull-Up')!;
    const swapped = await swapWorkoutExercise(w, pu.uid);
    const lp = swapped.exercises.find((e) => e.name === 'Lat Pulldown')!;
    expect(lp.swappedFrom).toBe('Pull-Up');
    const back = await swapWorkoutExercise(swapped, lp.uid);
    expect(back.exercises.find((e) => e.name === 'Pull-Up')?.swappedFrom).toBeUndefined();
  });

  it('reorders exercises', async () => {
    const before = (await getProgram()).filter((e) => e.day === 'push');
    await moveExercise(before[1].id, -1);
    const after = (await getProgram()).filter((e) => e.day === 'push');
    expect(after[0].id).toBe(before[1].id);
    expect(after.map((e) => e.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // The home push day keeps its own order.
    expect((await getProgram('home')).filter((e) => e.day === 'push').map((e) => e.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('exports and re-imports a backup', async () => {
    await doPush(() => 9);
    const backup = await exportAll();
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    await resetAll();
    expect(await db.workouts.count()).toBe(0);
    if (parsed.ok) await importAll(parsed.backup);
    expect(await db.workouts.count()).toBe(1);
    expect(parseBackup('{"nope":1}').ok).toBe(false);
    expect(parseBackup('not json').ok).toBe(false);
  });

  it('converts stored weights when switching units', async () => {
    await doPush(() => 8);
    await changeUnits('kg');
    const s = await getSettings();
    expect(s.units).toBe('kg');
    expect(s.barbellWeight).toBe(20);
    const w = (await db.workouts.toArray())[0];
    expect(w.exercises[1].sets[0].weight).toBe(45.5); // 100 lb -> 45.36 kg -> nearest 0.5
  });

  it('reset wipes everything and re-seeds', async () => {
    await doPush(() => 8);
    await resetAll();
    expect(await db.workouts.count()).toBe(0);
    expect(await db.exercises.count()).toBe(39);
    expect((await getSettings()).onboarded).toBe(false);
  });

  it('adds core and the home program to a program from an older version, once', async () => {
    const gym = (await getProgram()).filter((e) => e.muscles[0] !== 'core').map(({ place: _p, ...e }) => e);
    await db.exercises.clear();
    await db.exercises.bulkPut(gym);
    await db.kv.clear();
    await ensureSeeded();
    const program = await getProgram();
    expect(program.filter((e) => e.day === 'legs').map((e) => e.name).at(-1)).toBe('Ab Wheel Rollout');
    expect(program.filter((e) => e.day === 'legs').map((e) => e.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(await getProgram('home')).toHaveLength(18);
    // Removing the core exercise later sticks.
    await db.exercises.delete(program.find((e) => e.name === 'Ab Wheel Rollout')!.id);
    await ensureSeeded();
    expect((await getProgram()).some((e) => e.name === 'Ab Wheel Rollout')).toBe(false);
  });

  it('runs a home workout from the home program and keeps it in the rotation', async () => {
    const w = await startWorkout('push', 'home');
    expect(w.place).toBe('home');
    expect(w.exercises.map((e) => e.name)).toEqual(['Push-Up', 'Pike Push-Up', 'Decline Push-Up', 'Chair Dip', 'Diamond Push-Up', 'Plank Shoulder Tap']);
    expect(w.exercises[0].sets[0].weight).toBe(0);
    const done = { ...w, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s, weight: 0, reps: ex.repMax, done: true })) })) };
    await finishWorkout(done);
    const swapped = await swapWorkoutExercise(await startWorkout('push', 'home'), (await getActiveWorkout())!.exercises[0].uid);
    expect(swapped.exercises[0].name).toBe('Incline Push-Up');
  });
});
