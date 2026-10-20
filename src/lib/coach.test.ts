import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSeedProgram } from '../data/seedProgram';
import type { CardioLog, Settings, Workout, WorkoutExercise } from '../types';
import { buildCoachContext } from './coachContext';
import { extractJson, parseOpinion, parseSuggestions, reconcileOpinion } from './coachSchemas';
import { DEFAULT_SETTINGS, LOAD_DEFAULTS } from './defaults';
import { recommend } from './progression';
import { fetchCoachStatus, requestCoachJson, setDeviceGeminiKey, splitStreamError, streamCoach } from './coachClient';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 18, 9).getTime();
const settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true };
const program = buildSeedProgram();

function wex(name: string, sets: [number, number, number | null][], extra: Partial<WorkoutExercise> = {}): WorkoutExercise {
  const ex = program.find((e) => e.name === name)!;
  return {
    uid: name,
    exerciseId: ex.id,
    name,
    key: name.toLowerCase(),
    equipment: ex.equipment,
    category: ex.category,
    lowerBody: ex.lowerBody,
    muscles: ex.muscles,
    targetSets: ex.sets,
    repMin: ex.repMin,
    repMax: ex.repMax,
    restSec: ex.restSec,
    sets: sets.map(([w, r, rir], i) => ({ id: `${name}${i}`, weight: w, reps: r, rir, done: true })),
    warmups: [{ weight: 45, reps: 10, done: true }],
    skipped: false,
    note: '',
    ...extra,
  };
}

function push(daysAgo: number, benchW: number, reps: number[], notes = ''): Workout {
  const start = NOW - daysAgo * DAY;
  return {
    id: `w${daysAgo}`,
    day: 'push',
    status: 'completed',
    startedAt: start,
    finishedAt: start + 65 * 60_000,
    notes,
    exercises: [wex('Barbell Bench Press', reps.map((r, i) => [benchW, r, i === 0 ? 2 : null]), { note: daysAgo === 2 ? 'elbow felt fine' : '' }), wex('Cable Triceps Pushdown', [[50, 12, null], [50, 12, null], [50, 11, null]])],
  };
}

describe('buildCoachContext', () => {
  const workouts = [push(2, 185, [8, 8, 7, 6], 'Felt strong today'), push(9, 185, [8, 8, 7, 6]), push(16, 185, [8, 8, 7, 7]), push(40, 175, [10, 9, 8, 8]), push(80, 155, [10, 10, 9, 9])];
  const cardio: CardioLog[] = [{ id: 'c1', date: NOW - 3 * DAY, type: 'Incline walk', minutes: 25, heartRate: 120 }];
  const bodyweight = [
    { id: 'b1', date: NOW - 50 * DAY, weight: 180 },
    { id: 'b2', date: NOW - 1 * DAY, weight: 182.4 },
  ];
  const text = buildCoachContext({ settings: { ...settings, goal: 'strength' }, program, workouts, cardio, bodyweight, now: NOW });

  it('includes goal, schedule and units', () => {
    expect(text).toContain('Goal: Get Stronger');
    expect(text).toContain('Schedule: 3 days/week');
    expect(text).toContain('Units: lb');
  });

  it('lists the program with strength-mode targets on the main lift', () => {
    expect(text).toContain('Barbell Bench Press: 5x3-6');
    expect(text).toContain('[main lift]');
    expect(text).toContain('Standing Overhead Press: 3x6-10');
  });

  it('includes recent sets with RIR and notes', () => {
    expect(text).toMatch(/Push \(65 min\): Barbell Bench Press 185x8,8,7,6 \(RIR 2,-,-,-\)/);
    expect(text).toContain('Felt strong today');
    expect(text).toContain('elbow felt fine');
  });

  it('never includes warm-up sets', () => {
    expect(text).not.toContain('45x10');
  });

  it('summarizes weeks 5-8 and older data instead of listing every set', () => {
    expect(text).toContain('WEEKS 5-8');
    expect(text).toContain('OLDER THAN 8 WEEKS');
    expect(text).toMatch(/Barbell Bench Press: 1 sessions, top set 175x10/);
    expect(text).not.toContain('175x10,9,8,8');
  });

  it('includes engine recommendations and stall flags', () => {
    expect(text).toContain('ENGINE RECOMMENDATIONS');
    expect(text).toContain('Barbell Bench Press:');
  });

  it('includes PRs, weekly muscle sets, cardio and bodyweight trend', () => {
    expect(text).toContain('PERSONAL RECORDS');
    expect(text).toMatch(/chest \d/);
    expect(text).toContain('Incline walk 25 min, avg HR 120');
    expect(text).toContain('180 lb');
    expect(text).toContain('+2.4 lb');
  });

  it('flags a stall in muscle-building mode', () => {
    const t = buildCoachContext({ settings, program, workouts, cardio, bodyweight, now: NOW });
    expect(t).toContain('[STALLED]');
  });

  it('stays compact and respects the size cap', () => {
    const many = Array.from({ length: 120 }, (_, i) => push(i + 1, 185, [8, 8, 7, 6], 'x'.repeat(150)));
    const big = buildCoachContext({ settings, program, workouts: many, cardio, bodyweight, now: NOW, maxChars: 6000 });
    expect(big.length).toBeLessThanOrEqual(6000);
    expect(big).toContain('PROFILE');
  });

  it('works with no data at all', () => {
    const t = buildCoachContext({ settings, program, workouts: [], cardio: [], bodyweight: [], now: NOW });
    expect(t).toContain('Total workouts logged: 0');
    expect(t).toContain('CARDIO, LAST 4 WEEKS\nNone logged.');
  });
});

describe('parseSuggestions', () => {
  const good = {
    summary: 'Your overhead press has stalled.',
    suggestions: [
      { type: 'swap', name: 'Seated Dumbbell Shoulder Press', replaces: 'standing overhead press', day: 'push', sets: 3, repMin: 8, repMax: 12, restSec: 120, equipment: 'dumbbell', category: 'compound', muscles: ['shoulders', 'triceps'], why: 'Easier on the lower back.', cues: ['a', 'b', 'c'] },
      { type: 'add', name: 'Cable Fly', replaces: '', day: 'push', sets: 3, repMin: 12, repMax: 15, restSec: 60, equipment: 'cable', category: 'isolation', muscles: ['chest'], why: 'Chest is under 10 sets.', cues: [] },
    ],
  };

  it('accepts valid suggestions and normalizes the swap target', () => {
    const r = parseSuggestions(JSON.stringify(good), program);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.suggestions).toHaveLength(2);
    expect(r.data.suggestions[0].replaces).toBe('Standing Overhead Press');
    expect(r.dropped).toBe(0);
  });

  it('handles ```json fences and surrounding prose', () => {
    const r = parseSuggestions('Here you go:\n```json\n' + JSON.stringify(good) + '\n```\nEnjoy!', program);
    expect(r.ok).toBe(true);
    const r2 = parseSuggestions('Sure! ' + JSON.stringify(good) + ' Hope that helps.', program);
    expect(r2.ok).toBe(true);
  });

  it('drops invalid items but keeps valid ones', () => {
    const bad = {
      ...good,
      suggestions: [
        ...good.suggestions,
        { ...good.suggestions[1], repMin: 15, repMax: 8 },
        { ...good.suggestions[1], sets: 40 },
        { ...good.suggestions[1], equipment: 'kettlebell' },
        { ...good.suggestions[0], replaces: '' },
        { ...good.suggestions[0], replaces: 'Not In Program' },
        { name: 'missing everything' },
        'string item',
      ],
    };
    const r = parseSuggestions(bad, program);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.suggestions).toHaveLength(2);
    expect(r.dropped).toBe(3); // only the first 5 items are considered
  });

  it('rejects malformed responses', () => {
    expect(parseSuggestions('not json at all').ok).toBe(false);
    expect(parseSuggestions('{"summary": "x"').ok).toBe(false);
    expect(parseSuggestions({ summary: 'x', suggestions: 'nope' }).ok).toBe(false);
    expect(parseSuggestions(null).ok).toBe(false);
    expect(parseSuggestions(42).ok).toBe(false);
    expect(parseSuggestions({ summary: '', suggestions: [{ type: 'add' }] }).ok).toBe(false);
  });

  it('keeps a safety-only summary with zero suggestions', () => {
    const r = parseSuggestions({ summary: 'Stop pressing and see a physical therapist.', suggestions: [] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.suggestions).toHaveLength(0);
  });

  it('coerces numeric strings', () => {
    const r = parseSuggestions({ summary: '', suggestions: [{ ...good.suggestions[1], sets: '3', repMin: '12', repMax: '15', restSec: '60' }] });
    expect(r.ok && r.data.suggestions[0].sets).toBe(3);
  });
});

describe('parseOpinion / reconcileOpinion', () => {
  const LB = { units: 'lb' as const, ...LOAD_DEFAULTS.lb };
  const benchProfile = { equipment: 'barbell' as const, category: 'compound' as const, lowerBody: false };
  const target = { sets: 4, repMin: 6, repMax: 10, ...benchProfile };
  const engine = recommend(target, [{ date: 1, sets: [10, 10, 10, 10].map((r) => ({ weight: 185, reps: r, rir: null })) }], LB);

  it('parses a valid opinion', () => {
    const r = parseOpinion('{"action":"up","weight":190,"reason":"All 4 sets at 10.","agreesWithEngine":true}');
    expect(r.ok).toBe(true);
  });

  it('rejects malformed opinions', () => {
    expect(parseOpinion('{"action":"jump","weight":190,"reason":"x","agreesWithEngine":true}').ok).toBe(false);
    expect(parseOpinion('{"action":"up","weight":-5,"reason":"x","agreesWithEngine":true}').ok).toBe(false);
    expect(parseOpinion('{"action":"up"}').ok).toBe(false);
    expect(parseOpinion('<html>').ok).toBe(false);
  });

  it('agrees when the numbers match', () => {
    const r = reconcileOpinion({ action: 'up', weight: 190, reason: 'ok', agreesWithEngine: true }, engine, 185, benchProfile, LB);
    expect(r.agrees).toBe(true);
    expect(r.adjustment).toBeUndefined();
  });

  it('never allows a bigger jump than the engine increment', () => {
    const r = reconcileOpinion({ action: 'up', weight: 205, reason: 'go big', agreesWithEngine: false }, engine, 185, benchProfile, LB);
    expect(r.weight).toBe(190);
    expect(r.adjustment).toContain('Capped');
  });

  it('rounds to a loadable weight', () => {
    const r = reconcileOpinion({ action: 'stay', weight: 187, reason: 'x', agreesWithEngine: false }, engine, 185, benchProfile, LB);
    expect(r.weight).toBe(185);
    expect(r.agrees).toBe(false);
  });
});

describe('extractJson / splitStreamError', () => {
  it('extractJson returns undefined for garbage', () => {
    expect(extractJson('hello')).toBeUndefined();
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('splitStreamError strips the server error marker', () => {
    expect(splitStreamError('Good work.\n\n[[coach-error:rate_limited]]')).toEqual({ text: 'Good work.', error: 'rate_limited' });
    expect(splitStreamError('plain')).toEqual({ text: 'plain' });
  });
});

describe('Gemini key saved on the phone', () => {
  const store = new Map<string, string>();
  const sse = (...texts: string[]) =>
    new Response(texts.map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`).join(''), { status: 200 });

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    setDeviceGeminiKey('AIza-test');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('streams straight from Gemini with the coach prompt and the key in a header', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => sse('Keep ', 'pushing.'));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    const text = await streamCoach({ task: 'chat', context: 'Goal: Build Muscle', messages: [{ role: 'user', content: 'Hi' }] }, (t) => seen.push(t));
    expect(text).toBe('Keep pushing.');
    expect(seen).toEqual(['Keep ', 'Keep pushing.']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
    const sent = JSON.parse(String(init?.body)) as { systemInstruction: { parts: { text: string }[] } };
    expect(sent.systemInstruction.parts[0].text).toContain('Goal: Build Muscle');
  });

  it('reports a rejected key as an auth problem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 })));
    await expect(fetchCoachStatus()).rejects.toMatchObject({ kind: 'auth' });
    await expect(requestCoachJson({ task: 'suggest', context: '', messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ kind: 'auth' });
  });

  it('reports a working key as connected without using a server', async () => {
    const fetchMock = vi.fn(async () => new Response('{"name":"models/gemini-flash-latest"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchCoachStatus()).toMatchObject({ configured: true, authorized: true });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('generativelanguage.googleapis.com');
  });
});
