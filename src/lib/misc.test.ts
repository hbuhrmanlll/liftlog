import { describe, expect, it } from 'vitest';
import { EXERCISE_LIBRARY, findLibraryExercise, nextHarder } from '../data/exerciseLibrary';
import { buildSeedProgram } from '../data/seedProgram';
import type { Workout } from '../types';
import { LOAD_DEFAULTS } from './defaults';
import { nextDay } from './schedule';
import { warmupSets } from './warmup';
import { parseYouTubeId, youtubeEmbedUrl, youtubeSearchUrl } from './youtube';

const LB = { units: 'lb' as const, ...LOAD_DEFAULTS.lb };

describe('YouTube helpers', () => {
  it('parses watch, youtu.be, shorts, embed and mobile URLs', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=30s')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('rejects non-YouTube or malformed links', () => {
    expect(parseYouTubeId('https://vimeo.com/12345')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeId('not a url')).toBeNull();
    expect(parseYouTubeId('')).toBeNull();
    expect(parseYouTubeId(undefined)).toBeNull();
    expect(parseYouTubeId('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('builds nocookie embeds and search URLs', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(youtubeSearchUrl('Barbell Bench Press')).toBe('https://www.youtube.com/results?search_query=how+to+Barbell+Bench+Press+proper+form');
  });
});

describe('rotation', () => {
  const w = (day: Workout['day'], startedAt: number, status: Workout['status'] = 'completed'): Workout => ({ id: `${day}${startedAt}`, day, status, startedAt, exercises: [], notes: '' });
  it('starts with Push', () => expect(nextDay([])).toBe('push'));
  it('follows Push -> Pull -> Legs -> Push', () => {
    expect(nextDay([w('push', 1)])).toBe('pull');
    expect(nextDay([w('push', 1), w('pull', 2)])).toBe('legs');
    expect(nextDay([w('push', 1), w('pull', 2), w('legs', 3)])).toBe('push');
  });
  it('ignores active workouts and uses the latest completed one', () => {
    expect(nextDay([w('legs', 3), w('push', 1), w('pull', 5, 'active')])).toBe('push');
  });
});

describe('warm-ups', () => {
  it('bar x 10, 50% x 5, 70% x 3, 85% x 1 rounded to plates', () => {
    expect(warmupSets(225, 'barbell', LB)).toEqual([
      { weight: 45, reps: 10, done: false },
      { weight: 110, reps: 5, done: false },
      { weight: 155, reps: 3, done: false },
      { weight: 190, reps: 1, done: false },
    ]);
  });
  it('skips duplicates for light weights', () => {
    const sets = warmupSets(95, 'barbell', LB);
    expect(sets[0].weight).toBe(45);
    const weights = sets.map((s) => s.weight);
    expect(new Set(weights).size).toBe(weights.length);
    expect(Math.max(...weights)).toBeLessThan(95);
  });
  it('none for unknown weight, bodyweight, or the empty bar', () => {
    expect(warmupSets(null, 'barbell', LB)).toEqual([]);
    expect(warmupSets(45, 'barbell', LB)).toEqual([]);
    expect(warmupSets(10, 'bodyweight', LB)).toEqual([]);
  });
});

describe('seed program', () => {
  const program = buildSeedProgram();
  it('has 6 lifts plus a core exercise per gym day, in the specified order', () => {
    const gym = program.filter((e) => e.place === 'gym');
    expect(gym.filter((e) => e.day === 'push').map((e) => e.name)).toEqual([
      'Barbell Bench Press',
      'Standing Overhead Press',
      'Incline Dumbbell Press',
      'Dumbbell Lateral Raise',
      'Cable Triceps Pushdown',
      'Overhead Cable Triceps Extension',
      'Cable Crunch',
    ]);
    expect(gym.filter((e) => e.day === 'pull')).toHaveLength(7);
    expect(gym.filter((e) => e.day === 'legs')).toHaveLength(7);
  });
  it('has a no-equipment home version of every day that ends with core', () => {
    const home = program.filter((e) => e.place === 'home');
    for (const day of ['push', 'pull', 'legs'] as const) {
      const list = home.filter((e) => e.day === day);
      expect(list).toHaveLength(6);
      expect(list.every((e) => e.equipment === 'bodyweight')).toBe(true);
      expect(list.at(-1)!.muscles[0]).toBe('core');
    }
  });
  it('matches the sets / reps / rest spec', () => {
    const by = (n: string) => program.find((e) => e.name === n)!;
    expect(by('Barbell Bench Press')).toMatchObject({ sets: 4, repMin: 6, repMax: 10 });
    expect(by('Incline Dumbbell Press')).toMatchObject({ sets: 3, repMin: 8, repMax: 12, restSec: 90 });
    expect(by('Pull-Up')).toMatchObject({ sets: 3, repMin: 6, repMax: 10, restSec: 120, alternate: 'Lat Pulldown', equipment: 'bodyweight' });
    expect(by('Romanian Deadlift')).toMatchObject({ sets: 3, repMin: 8, repMax: 10, restSec: 120, lowerBody: true });
    expect(by('Standing Calf Raise')).toMatchObject({ sets: 4, repMin: 12, repMax: 15, restSec: 60 });
    expect(by('Walking Lunge')).toMatchObject({ sets: 3, repMin: 10, repMax: 12, restSec: 90 });
  });
  it('every exercise has 3-5 cues, mistakes, and an alternate', () => {
    for (const e of EXERCISE_LIBRARY) {
      expect(e.cues.length, e.name).toBeGreaterThanOrEqual(3);
      expect(e.cues.length, e.name).toBeLessThanOrEqual(5);
      expect(e.mistakes.length, e.name).toBeGreaterThan(0);
      expect(e.alternate, e.name).toBeTruthy();
    }
  });
  it('every alternate exists in the library', () => {
    for (const e of [...EXERCISE_LIBRARY, ...program]) expect(findLibraryExercise(e.alternate), `${e.name} -> ${e.alternate}`).toBeDefined();
  });
});

describe('harder variations', () => {
  it('skips variations already in the workout', () => {
    expect(nextHarder('Push-Up', [])).toBe('Decline Push-Up');
    expect(nextHarder('Push-Up', ['Push-Up', 'Decline Push-Up'])).toBe('Archer Push-Up');
    expect(nextHarder('Archer Push-Up', [])).toBeUndefined();
    // Every harder variation named in the library exists.
    for (const e of EXERCISE_LIBRARY) if (e.harder) expect(findLibraryExercise(e.harder), e.harder).toBeDefined();
    for (const e of EXERCISE_LIBRARY) if (e.place === 'home') expect(findLibraryExercise(e.alternate), e.alternate).toBeDefined();
  });
});
