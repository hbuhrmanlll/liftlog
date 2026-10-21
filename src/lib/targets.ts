import type { Exercise, Goal } from '../types';

export interface Targets {
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  /** True when the goal changed this lift's targets (e.g. strength mode). */
  modified: boolean;
}

/** The first compound lift of a gym day (by order) is the "main lift". Home exercises never are. */
export function isMainLift(exercise: Exercise, dayExercises: Exercise[]): boolean {
  if (exercise.place === 'home') return false;
  const first = [...dayExercises]
    .filter((e) => e.day === exercise.day && e.category === 'compound' && e.place !== 'home')
    .sort((a, b) => a.order - b.order)[0];
  return first?.id === exercise.id;
}

export const STRENGTH_TARGETS = { sets: 5, repMin: 3, repMax: 6, restSec: 240 } as const;
export const BOTH_TARGETS = { sets: 4, repMin: 5, repMax: 8, restSec: 180 } as const;

/**
 * Targets for today given the training goal.
 * - Build Muscle: the program as written.
 * - Get Stronger: the main lift becomes 5 x 3-6 with 3-5 min rest.
 * - Both: the main lift becomes 4 x 5-8 with 3 min rest; everything else stays.
 */
export function effectiveTargets(exercise: Exercise, goal: Goal, mainLift: boolean): Targets {
  const base = { sets: exercise.sets, repMin: exercise.repMin, repMax: exercise.repMax, restSec: exercise.restSec, modified: false };
  if (!mainLift) return base;
  if (goal === 'strength') return { ...STRENGTH_TARGETS, modified: true };
  if (goal === 'both') return { ...BOTH_TARGETS, modified: true };
  return base;
}
