// Core domain types shared across the app. Pure data only; no behavior.

export type DayType = 'push' | 'pull' | 'legs';
export const DAY_TYPES: readonly DayType[] = ['push', 'pull', 'legs'] as const;

export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight';
export const EQUIPMENT: readonly Equipment[] = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'] as const;

export type Category = 'compound' | 'isolation';

export type MuscleGroup =
  | 'chest'
  | 'shoulders'
  | 'triceps'
  | 'lats'
  | 'upper back'
  | 'rear delts'
  | 'biceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'shoulders',
  'triceps',
  'lats',
  'upper back',
  'rear delts',
  'biceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
] as const;

export type Units = 'lb' | 'kg';
export type Goal = 'muscle' | 'strength' | 'both';
export type Schedule = 3 | 6;
export type Theme = 'dark' | 'light';

/** An exercise in the user's program. `muscles[0]` is the primary muscle. */
export interface Exercise {
  id: string;
  name: string;
  day: DayType;
  order: number;
  muscles: MuscleGroup[];
  equipment: Equipment;
  category: Category;
  /** Lower-body lifts get bigger jumps (squat, RDL, leg press). */
  lowerBody: boolean;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  cues: string[];
  mistakes: string[];
  alternate: string;
  videoUrl?: string;
  /** Starting weight entered during onboarding / first workout. */
  startWeight?: number;
}

/** A catalog entry that can be added to the program. */
export type LibraryExercise = Omit<Exercise, 'id' | 'day' | 'order' | 'startWeight' | 'videoUrl'>;

export interface SetLog {
  id: string;
  weight: number | null;
  reps: number | null;
  /** Reps in reserve. 4 means "4 or more". null = not logged. */
  rir: number | null;
  done: boolean;
  extra?: boolean;
}

export interface WarmupSet {
  weight: number;
  reps: number;
  done: boolean;
}

export type RecAction = 'up' | 'stay' | 'down' | 'deload' | 'start';

/** One exercise inside a logged workout. It snapshots the targets used that day. */
export interface WorkoutExercise {
  uid: string;
  exerciseId: string;
  name: string;
  /** Normalized name; history and PRs are grouped by this. */
  key: string;
  equipment: Equipment;
  category: Category;
  lowerBody: boolean;
  muscles: MuscleGroup[];
  targetSets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  sets: SetLog[];
  warmups: WarmupSet[];
  skipped: boolean;
  swappedFrom?: string;
  note: string;
  /** What the engine recommended going into this session. */
  plannedAction?: RecAction;
  plannedWeight?: number | null;
}

export interface Workout {
  id: string;
  day: DayType;
  status: 'active' | 'completed';
  startedAt: number;
  finishedAt?: number;
  exercises: WorkoutExercise[];
  notes: string;
  coachSummary?: string;
}

export interface CardioLog {
  id: string;
  date: number;
  type: string;
  minutes: number;
  distance?: number;
  heartRate?: number;
  notes?: string;
}

export interface BodyweightLog {
  id: string;
  date: number;
  weight: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

/** A user-approved weight override for the next session (e.g. picked from the AI's second opinion). */
export interface WeightOverride {
  key: string;
  weight: number;
  action: RecAction;
  reason: string;
  source: 'coach' | 'manual';
  createdAt: number;
}

export interface KeyValue {
  key: string;
  value: unknown;
}

export interface Settings {
  id: 'settings';
  onboarded: boolean;
  units: Units;
  schedule: Schedule;
  goal: Goal;
  theme: Theme;
  barbellWeight: number;
  /** Plate denominations available (per side, assumed in pairs). */
  plates: number[];
  dumbbellIncrement: number;
  cableIncrement: number;
  restCompoundSec: number;
  restIsolationSec: number;
  timerSound: boolean;
  timerVibrate: boolean;
  deloadReminders: boolean;
  warmupSuggestions: boolean;
  aiEnabled: boolean;
}
