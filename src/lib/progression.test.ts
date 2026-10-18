import { describe, expect, it } from 'vitest';
import { LOAD_DEFAULTS } from './defaults';
import { deloadReminderWeeks, gradeSession, isStalled, recommend, workingWeight, type ProgressionTarget, type SessionResult } from './progression';
import type { LoadSettings } from './rounding';
import { BOTH_TARGETS, effectiveTargets, STRENGTH_TARGETS } from './targets';
import type { Exercise } from '../types';

const LB: LoadSettings = { units: 'lb', ...LOAD_DEFAULTS.lb };
const KG: LoadSettings = { units: 'kg', ...LOAD_DEFAULTS.kg };

const bench: ProgressionTarget = { sets: 4, repMin: 6, repMax: 10, equipment: 'barbell', category: 'compound', lowerBody: false };
const squat: ProgressionTarget = { sets: 4, repMin: 6, repMax: 10, equipment: 'barbell', category: 'compound', lowerBody: true };
const rdl: ProgressionTarget = { sets: 3, repMin: 8, repMax: 10, equipment: 'barbell', category: 'compound', lowerBody: true };
const legPress: ProgressionTarget = { sets: 3, repMin: 10, repMax: 12, equipment: 'machine', category: 'compound', lowerBody: true };
const incline: ProgressionTarget = { sets: 3, repMin: 8, repMax: 12, equipment: 'dumbbell', category: 'compound', lowerBody: false };
const pushdown: ProgressionTarget = { sets: 3, repMin: 10, repMax: 15, equipment: 'cable', category: 'isolation', lowerBody: false };
const legCurl: ProgressionTarget = { sets: 3, repMin: 10, repMax: 15, equipment: 'machine', category: 'isolation', lowerBody: true };
const pullup: ProgressionTarget = { sets: 3, repMin: 6, repMax: 10, equipment: 'bodyweight', category: 'compound', lowerBody: false };

let t = 10_000;
function session(weight: number | number[], reps: number[], rir?: (number | null)[], plannedAction?: SessionResult['plannedAction']): SessionResult {
  t += 1000;
  return {
    date: t,
    plannedAction,
    sets: reps.map((r, i) => ({ weight: Array.isArray(weight) ? weight[i] : weight, reps: r, rir: rir?.[i] ?? null })),
  };
}

describe('helpers', () => {
  it('workingWeight picks the most common weight, ties go heavier', () => {
    expect(workingWeight([{ weight: 185, reps: 8, rir: null }, { weight: 185, reps: 8, rir: null }, { weight: 175, reps: 8, rir: null }])).toBe(185);
    expect(workingWeight([{ weight: 175, reps: 8, rir: null }, { weight: 185, reps: 8, rir: null }])).toBe(185);
  });

  it('gradeSession only looks at the target number of sets', () => {
    const g = gradeSession(session(185, [10, 10, 10, 10, 4]), bench);
    expect(g.allAtTop).toBe(true);
    expect(g.anyBelow).toBe(false);
  });
});

describe('Rule 1: GO UP', () => {
  it('upper-body barbell: +5 lb when every set hits the top', () => {
    const r = recommend(bench, [session(185, [10, 10, 10, 10])], LB);
    expect(r.action).toBe('up');
    expect(r.weight).toBe(190);
    expect(r.reason).toBe('You hit 10 reps on all 4 sets. Go up to 190 lb.');
  });

  it('lower-body barbell (squat, RDL): +10 lb', () => {
    expect(recommend(squat, [session(225, [10, 10, 10, 10])], LB).weight).toBe(235);
    expect(recommend(rdl, [session(185, [10, 10, 10])], LB).weight).toBe(195);
  });

  it('leg press (lower-body machine compound): +10 lb', () => {
    expect(recommend(legPress, [session(270, [12, 12, 12])], LB).weight).toBe(280);
  });

  it('dumbbells: next dumbbell increment (+5 lb per dumbbell)', () => {
    const r = recommend(incline, [session(60, [12, 12, 12])], LB);
    expect(r.action).toBe('up');
    expect(r.weight).toBe(65);
  });

  it('dumbbells respect a custom increment', () => {
    expect(recommend(incline, [session(60, [12, 12, 12])], { ...LB, dumbbellIncrement: 2.5 }).weight).toBe(62.5);
  });

  it('cable/machine isolation: +5 lb or the stack step from settings', () => {
    expect(recommend(pushdown, [session(50, [15, 15, 15])], LB).weight).toBe(55);
    expect(recommend(pushdown, [session(50, [15, 15, 15])], { ...LB, cableIncrement: 10 }).weight).toBe(60);
    expect(recommend(legCurl, [session(90, [15, 15, 15])], LB).weight).toBe(95);
  });

  it('does not go up when sets were at different weights', () => {
    const r = recommend(bench, [session([185, 185, 185, 175], [10, 10, 10, 10])], LB);
    expect(r.action).toBe('stay');
  });

  it('does not go up when a target set is missing', () => {
    const r = recommend(bench, [session(185, [10, 10, 10])], LB);
    expect(r.action).toBe('stay');
    expect(r.reason).toContain('Finish all 4 sets');
  });

  it('stays if RIR was logged and the first set was RIR 0', () => {
    const r = recommend(bench, [session(185, [10, 10, 10, 10], [0, 1, 1, 0])], LB);
    expect(r.action).toBe('stay');
    expect(r.weight).toBe(185);
    expect(r.reason).toContain('0 reps left');
  });

  it('still goes up when RIR was logged and the first set had reps left', () => {
    const r = recommend(bench, [session(185, [10, 10, 10, 10], [2, 1, 0, 0])], LB);
    expect(r.action).toBe('up');
    expect(r.weight).toBe(190);
  });

  it('goes up when RIR is blank', () => {
    expect(recommend(bench, [session(185, [10, 10, 10, 10], [null, null, null, null])], LB).action).toBe('up');
  });
});

describe('kg mode', () => {
  it('upper-body barbell +2.5 kg', () => {
    expect(recommend(bench, [session(80, [10, 10, 10, 10])], KG).weight).toBe(82.5);
  });
  it('lower-body barbell +5 kg', () => {
    expect(recommend(squat, [session(100, [10, 10, 10, 10])], KG).weight).toBe(105);
  });
  it('dumbbells +2 kg', () => {
    expect(recommend(incline, [session(24, [12, 12, 12])], KG).weight).toBe(26);
  });
  it('cable +2.5 kg', () => {
    expect(recommend(pushdown, [session(25, [15, 15, 15])], KG).weight).toBe(27.5);
  });
  it('formats reasons in kg', () => {
    expect(recommend(bench, [session(80, [10, 10, 10, 10])], KG).reason).toBe('You hit 10 reps on all 4 sets. Go up to 82.5 kg.');
  });
  it('drops 10% to a loadable kg weight', () => {
    const r = recommend(bench, [session(100, [5, 5, 4, 4]), session(100, [5, 5, 5, 4])], KG);
    expect(r.action).toBe('down');
    expect(r.weight).toBe(90);
  });
});

describe('Rule 2: STAY within range', () => {
  it('keeps the weight and asks for one more rep', () => {
    const r = recommend(bench, [session(185, [8, 7, 6, 6])], LB);
    expect(r.action).toBe('stay');
    expect(r.weight).toBe(185);
    expect(r.reason).toBe('You got 8, 7, 6, 6. Stay at 185 lb and try to get one more rep.');
    expect(r.goal).toBe('Beat last time by at least 1 rep on any set');
    expect(r.note).toBeUndefined();
  });

  it('matches the spec example for a 3-set lift', () => {
    const ohp: ProgressionTarget = { ...bench, sets: 3 };
    expect(recommend(ohp, [session(185, [8, 7, 6])], LB).reason).toBe('You got 8, 7, 6. Stay at 185 lb and try to get one more rep.');
  });
});

describe('Rule 3: STAY with a warning', () => {
  it('keeps the weight once when a set falls below the range', () => {
    const r = recommend(bench, [session(185, [8, 6, 5, 5])], LB);
    expect(r.action).toBe('stay');
    expect(r.weight).toBe(185);
    expect(r.note).toContain('2 sets fell below 6 reps');
  });

  it('warns but does not drop when the previous session was fine', () => {
    const r = recommend(bench, [session(185, [7, 6, 5, 5]), session(185, [8, 7, 7, 6])], LB);
    expect(r.action).toBe('stay');
  });

  it('warns but does not drop when the previous low session was at a different weight', () => {
    const r = recommend(bench, [session(185, [7, 6, 5, 5]), session(180, [7, 6, 5, 5])], LB);
    expect(r.action).toBe('stay');
  });
});

describe('Rule 4: GO DOWN after 2 sessions below range at the same weight', () => {
  it('drops ~10% rounded to a loadable barbell weight', () => {
    const r = recommend(bench, [session(185, [6, 5, 5, 4]), session(185, [7, 6, 5, 5])], LB);
    expect(r.action).toBe('down');
    // 185 * 0.9 = 166.5 -> nearest loadable with 2.5 lb plates is 165
    expect(r.weight).toBe(165);
    expect(r.reason).toContain('Two sessions in a row under 6 reps at 185 lb');
  });

  it('drops dumbbells to a real dumbbell', () => {
    const r = recommend(incline, [session(70, [7, 6, 6]), session(70, [8, 7, 6])], LB);
    expect(r.action).toBe('down');
    expect(r.weight).toBe(65);
  });

  it('always lands strictly lighter even for small weights', () => {
    const r = recommend(pushdown, [session(20, [8, 8, 7]), session(20, [9, 8, 8])], LB);
    expect(r.action).toBe('down');
    expect(r.weight).toBe(15);
  });

  it('bodyweight with no added load suggests assistance instead', () => {
    const r = recommend(pullup, [session(0, [5, 4, 3]), session(0, [5, 4, 4])], LB);
    expect(r.action).toBe('down');
    expect(r.weight).toBe(0);
    expect(r.reason).toContain('assistance');
  });

  it('bodyweight with added load drops the belt weight', () => {
    const r = recommend(pullup, [session(25, [5, 4, 4]), session(25, [5, 5, 4])], LB);
    expect(r.action).toBe('down');
    expect(r.weight).toBeLessThan(25);
  });
});

describe('Rule 5: STALL -> deload', () => {
  it('flags 3 sessions at the same weight with no added reps', () => {
    const history = [session(185, [8, 7, 7, 6]), session(185, [8, 8, 7, 6]), session(185, [8, 8, 7, 6])];
    expect(isStalled(history, bench)).toBe(true);
    const r = recommend(bench, history, LB);
    expect(r.action).toBe('deload');
    expect(r.stalled).toBe(true);
    expect(r.weight).toBe(165);
    expect(r.reason).toContain('No progress in 3 sessions at 185 lb');
  });

  it('is not stalled when reps went up', () => {
    const history = [session(185, [8, 8, 8, 7]), session(185, [8, 8, 7, 6]), session(185, [8, 8, 7, 6])];
    expect(isStalled(history, bench)).toBe(false);
    expect(recommend(bench, history, LB).action).toBe('stay');
  });

  it('is not stalled with only 2 sessions', () => {
    expect(isStalled([session(185, [8, 7, 7, 6]), session(185, [8, 7, 7, 6])], bench)).toBe(false);
  });

  it('is not stalled when weight changed', () => {
    expect(isStalled([session(190, [8, 7, 7, 6]), session(185, [8, 8, 7, 6]), session(185, [8, 8, 7, 6])], bench)).toBe(false);
  });

  it('after a deload session, goes back to the pre-deload weight', () => {
    const history = [session(165, [10, 10, 10, 9], undefined, 'deload'), session(185, [8, 7, 7, 6]), session(185, [8, 8, 7, 6]), session(185, [8, 8, 7, 6])];
    const r = recommend(bench, history, LB);
    expect(r.action).toBe('up');
    expect(r.weight).toBe(185);
    expect(r.reason).toContain('Deload done');
  });

  it('the 2-session drop rule wins over the stall rule', () => {
    const history = [session(185, [6, 5, 5, 5]), session(185, [6, 5, 5, 5]), session(185, [7, 6, 6, 6])];
    expect(recommend(bench, history, LB).action).toBe('down');
  });

  it('hitting the top beats a stall', () => {
    const history = [session(185, [10, 10, 10, 10]), session(185, [10, 10, 10, 10]), session(185, [10, 10, 10, 10])];
    expect(recommend(bench, history, LB).action).toBe('up');
  });
});

describe('Rule 6: rounding to loadable weights', () => {
  it('rounds to what the plates allow when only big plates exist', () => {
    const bigPlates: LoadSettings = { ...LB, plates: [45, 25, 10] };
    // 190 isn't loadable with 45/25/10 plates; the next loadable weight up is 195 (bar + 2 x 75).
    const r = recommend(bench, [session(185, [10, 10, 10, 10])], bigPlates);
    expect(r.action).toBe('up');
    expect(r.weight).toBe(195);
  });

  it('respects a custom barbell weight', () => {
    const r = recommend(bench, [session(100, [10, 10, 10, 10])], { ...LB, barbellWeight: 35 });
    expect(r.weight).toBe(105);
  });

  it('rounds a starting weight to something loadable', () => {
    const r = recommend(incline, [], LB, { startWeight: 47 });
    expect(r.weight).toBe(45);
  });
});

describe('Rule 7: first-time exercises', () => {
  it('asks for a starting weight when there is no history', () => {
    const r = recommend(bench, [], LB);
    expect(r.action).toBe('start');
    expect(r.weight).toBeNull();
    expect(r.reason).toBe('First time: pick a weight you could lift for 10 reps with 2-3 reps left.');
  });

  it('uses the starting weight entered during onboarding', () => {
    const r = recommend(bench, [], LB, { startWeight: 135 });
    expect(r.action).toBe('start');
    expect(r.weight).toBe(135);
  });

  it('bodyweight lifts start at bodyweight', () => {
    const r = recommend(pullup, [], LB);
    expect(r.weight).toBe(0);
  });

  it('ignores sessions with no completed sets', () => {
    expect(recommend(bench, [{ date: 1, sets: [] }], LB).action).toBe('start');
  });
});

describe('bodyweight exercises (pull-ups)', () => {
  it('adds reps until all sets hit the top', () => {
    const r = recommend(pullup, [session(0, [10, 9, 8])], LB);
    expect(r.action).toBe('stay');
    expect(r.weight).toBe(0);
    expect(r.reason).toContain('Stay at bodyweight and try to get one more rep');
  });

  it('adds weight via a belt once the top of the range is hit on all sets', () => {
    const r = recommend(pullup, [session(0, [10, 10, 10])], LB);
    expect(r.action).toBe('up');
    expect(r.weight).toBe(5);
    expect(r.reason).toContain('dip belt');
  });

  it('belt increments in kg', () => {
    expect(recommend(pullup, [session(0, [10, 10, 10])], KG).weight).toBe(2.5);
  });
});

describe('strength mode', () => {
  const ex: Exercise = {
    id: 'b',
    name: 'Barbell Bench Press',
    day: 'push',
    order: 0,
    muscles: ['chest'],
    equipment: 'barbell',
    category: 'compound',
    lowerBody: false,
    sets: 4,
    repMin: 6,
    repMax: 10,
    restSec: 150,
    cues: [],
    mistakes: [],
    alternate: '',
  };

  it('switches the main lift to 5 x 3-6 with 3-5 min rest', () => {
    const t = effectiveTargets(ex, 'strength', true);
    expect(t).toMatchObject({ sets: 5, repMin: 3, repMax: 6, modified: true });
    expect(t.restSec).toBeGreaterThanOrEqual(180);
    expect(t.restSec).toBeLessThanOrEqual(300);
  });

  it('leaves other lifts alone', () => {
    expect(effectiveTargets(ex, 'strength', false)).toMatchObject({ sets: 4, repMin: 6, repMax: 10, modified: false });
    expect(effectiveTargets(ex, 'muscle', true)).toMatchObject({ sets: 4, repMin: 6, repMax: 10, modified: false });
  });

  it('"Both" uses 4 x 5-8 on the main lift', () => {
    expect(effectiveTargets(ex, 'both', true)).toMatchObject({ ...BOTH_TARGETS, modified: true });
  });

  const strengthBench: ProgressionTarget = { ...bench, ...STRENGTH_TARGETS };

  it('goes up when all 5 sets hit 6 reps', () => {
    const r = recommend(strengthBench, [session(225, [6, 6, 6, 6, 6])], LB);
    expect(r.action).toBe('up');
    expect(r.weight).toBe(230);
    expect(r.reason).toBe('You hit 6 reps on all 5 sets. Go up to 230 lb.');
  });

  it('stays inside 3-6', () => {
    const r = recommend(strengthBench, [session(225, [6, 5, 5, 4, 4])], LB);
    expect(r.action).toBe('stay');
    expect(r.note).toBeUndefined();
  });

  it('warns below 3 reps and drops after two sessions', () => {
    expect(recommend(strengthBench, [session(245, [3, 3, 2, 2, 2])], LB).note).toBeDefined();
    const r = recommend(strengthBench, [session(245, [3, 3, 2, 2, 2]), session(245, [3, 3, 3, 2, 2])], LB);
    expect(r.action).toBe('down');
    expect(r.weight).toBe(220);
  });

  it('reps above the top of the range count as hitting the top', () => {
    expect(recommend(strengthBench, [session(225, [8, 8, 7, 7, 6])], LB).action).toBe('up');
  });
});

describe('deload reminder', () => {
  const DAY = 86_400_000;
  const now = 100 * DAY;

  it('is due after 6+ weeks of continuous training', () => {
    const dates = Array.from({ length: 22 }, (_, i) => now - i * 2 * DAY); // every other day for 6 weeks
    expect(deloadReminderWeeks(dates, now)).toBeGreaterThanOrEqual(6);
  });

  it('is not due after a recent break', () => {
    const dates = [now - 60 * DAY, now - 55 * DAY, now - 20 * DAY, now - 18 * DAY, now - 2 * DAY];
    expect(deloadReminderWeeks(dates, now)).toBe(0);
  });

  it('is not due when you stopped training', () => {
    const dates = Array.from({ length: 30 }, (_, i) => now - 20 * DAY - i * 2 * DAY);
    expect(deloadReminderWeeks(dates, now)).toBe(0);
  });

  it('resets after a deload', () => {
    const dates = Array.from({ length: 30 }, (_, i) => now - i * 2 * DAY);
    expect(deloadReminderWeeks(dates, now, now - 7 * DAY)).toBe(0);
  });

  it('handles no workouts', () => {
    expect(deloadReminderWeeks([], now)).toBe(0);
  });
});
