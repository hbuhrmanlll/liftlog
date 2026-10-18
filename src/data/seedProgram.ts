import type { DayType, Exercise, LibraryExercise } from '../types';
import { findLibraryExercise } from './exerciseLibrary';

/** The default PPL program: 6 exercises per day, compounds first. */
const PROGRAM: Record<DayType, { name: string; overrides?: Partial<LibraryExercise> }[]> = {
  push: [
    { name: 'Barbell Bench Press' },
    { name: 'Standing Overhead Press' },
    { name: 'Incline Dumbbell Press' },
    { name: 'Dumbbell Lateral Raise' },
    { name: 'Cable Triceps Pushdown' },
    { name: 'Overhead Cable Triceps Extension' },
  ],
  pull: [
    { name: 'Barbell Row' },
    { name: 'Pull-Up' },
    { name: 'Seated Cable Row' },
    { name: 'Face Pull' },
    { name: 'Barbell Curl', overrides: { name: 'Barbell or EZ-Bar Curl', alternate: 'Dumbbell Curl' } },
    { name: 'Hammer Curl' },
  ],
  legs: [
    { name: 'Barbell Back Squat' },
    { name: 'Romanian Deadlift' },
    { name: 'Leg Press' },
    { name: 'Lying Leg Curl', overrides: { name: 'Lying or Seated Leg Curl', alternate: 'Dumbbell Romanian Deadlift' } },
    { name: 'Walking Lunge' },
    { name: 'Standing Calf Raise' },
  ],
};

let counter = 0;
export function newId(prefix = 'id'): string {
  counter += 1;
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}_${rand}_${counter}`;
}

export function exerciseFromLibrary(lib: LibraryExercise, day: DayType, order: number): Exercise {
  return {
    ...lib,
    cues: [...lib.cues],
    mistakes: [...lib.mistakes],
    muscles: [...lib.muscles],
    id: newId('ex'),
    day,
    order,
  };
}

export function buildSeedProgram(): Exercise[] {
  const out: Exercise[] = [];
  (Object.keys(PROGRAM) as DayType[]).forEach((day) => {
    PROGRAM[day].forEach((entry, order) => {
      const lib = findLibraryExercise(entry.name);
      if (!lib) throw new Error(`Seed exercise missing from library: ${entry.name}`);
      out.push(exerciseFromLibrary({ ...lib, ...entry.overrides }, day, order));
    });
  });
  return out;
}
