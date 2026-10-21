import type { DayType, Exercise, LibraryExercise, TrainingPlace } from '../types';
import { findLibraryExercise } from './exerciseLibrary';

type Plan = Record<DayType, { name: string; overrides?: Partial<LibraryExercise> }[]>;

/** One core exercise per day, last in the session. Added to older programs too (see repo.ensureProgramExtras). */
export const GYM_CORE: Record<DayType, string> = { push: 'Cable Crunch', pull: 'Hanging Knee Raise', legs: 'Ab Wheel Rollout' };

/** The default gym PPL program: 6 lifts per day, compounds first, then core. */
const PROGRAM: Plan = {
  push: [
    { name: 'Barbell Bench Press' },
    { name: 'Standing Overhead Press' },
    { name: 'Incline Dumbbell Press' },
    { name: 'Dumbbell Lateral Raise' },
    { name: 'Cable Triceps Pushdown' },
    { name: 'Overhead Cable Triceps Extension' },
    { name: GYM_CORE.push },
  ],
  pull: [
    { name: 'Barbell Row' },
    { name: 'Pull-Up' },
    { name: 'Seated Cable Row' },
    { name: 'Face Pull' },
    { name: 'Barbell Curl', overrides: { name: 'Barbell or EZ-Bar Curl', alternate: 'Dumbbell Curl' } },
    { name: 'Hammer Curl' },
    { name: GYM_CORE.pull },
  ],
  legs: [
    { name: 'Barbell Back Squat' },
    { name: 'Romanian Deadlift' },
    { name: 'Leg Press' },
    { name: 'Lying Leg Curl', overrides: { name: 'Lying or Seated Leg Curl', alternate: 'Dumbbell Romanian Deadlift' } },
    { name: 'Walking Lunge' },
    { name: 'Standing Calf Raise' },
    { name: GYM_CORE.legs },
  ],
};

/** No-equipment version of each day for training at home. Same muscles, progressed by reps. */
const HOME_PROGRAM: Plan = {
  push: [{ name: 'Push-Up' }, { name: 'Pike Push-Up' }, { name: 'Decline Push-Up' }, { name: 'Chair Dip' }, { name: 'Diamond Push-Up' }, { name: 'Plank Shoulder Tap' }],
  pull: [{ name: 'Table Inverted Row' }, { name: 'Towel Door Row' }, { name: 'Reverse Snow Angel' }, { name: 'Prone Y-T-W Raise' }, { name: 'Backpack Biceps Curl' }, { name: 'Reverse Crunch' }],
  legs: [
    { name: 'Bodyweight Squat' },
    { name: 'Bulgarian Split Squat (Chair)' },
    { name: 'Single-Leg Romanian Deadlift' },
    { name: 'Single-Leg Glute Bridge' },
    { name: 'Single-Leg Calf Raise' },
    { name: 'Dead Bug' },
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

function build(plan: Plan, place: TrainingPlace): Exercise[] {
  const out: Exercise[] = [];
  (Object.keys(plan) as DayType[]).forEach((day) => {
    plan[day].forEach((entry, order) => {
      const lib = findLibraryExercise(entry.name);
      if (!lib) throw new Error(`Seed exercise missing from library: ${entry.name}`);
      out.push(exerciseFromLibrary({ ...lib, ...entry.overrides, place }, day, order));
    });
  });
  return out;
}

export function buildHomeProgram(): Exercise[] {
  return build(HOME_PROGRAM, 'home');
}

/** The gym program plus the home program. */
export function buildSeedProgram(): Exercise[] {
  return [...build(PROGRAM, 'gym'), ...buildHomeProgram()];
}
