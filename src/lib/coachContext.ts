/**
 * Builds the compact training summary sent to the AI Coach.
 * Recent weeks are detailed set-by-set; older data is summarized per exercise
 * so requests stay fast and cheap.
 */
import type { BodyweightLog, CardioLog, Exercise, MuscleGroup, Settings, Workout } from '../types';
import { MUSCLE_GROUPS } from '../types';
import { completedSets, completedWorkouts, DAY_MS, epley1RM, exerciseHistory, muscleSets, normalizeKey, personalRecords, workoutDurationSec } from './calculations';
import { DAY_LABEL } from './schedule';
import { recommendationFor } from './session';
import { isMainLift } from './targets';
import { progressReport, progressReportText } from './progressReport';

export interface CoachContextInput {
  settings: Settings;
  program: Exercise[];
  workouts: Workout[];
  cardio: CardioLog[];
  bodyweight: BodyweightLog[];
  now: number;
  /** Max characters; older sections are dropped first when over. */
  maxChars?: number;
}

const GOAL_LABEL: Record<Settings['goal'], string> = { muscle: 'Build Muscle', strength: 'Get Stronger', both: 'Both (muscle + strength)' };
const ACTION_LABEL = { up: 'GO UP', stay: 'STAY', down: 'GO DOWN', deload: 'DELOAD', start: 'NEW' } as const;

const iso = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const w = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString());

function setsLine(sets: { weight: number; reps: number; rir: number | null }[], bodyweight: boolean): string {
  const fmt = (x: number) => (bodyweight ? (x > 0 ? `BW+${w(x)}` : 'BW') : w(x));
  const allSame = sets.every((s) => s.weight === sets[0].weight);
  const core = allSame ? `${fmt(sets[0].weight)}x${sets.map((s) => s.reps).join(',')}` : sets.map((s) => `${fmt(s.weight)}x${s.reps}`).join(',');
  const rirs = sets.map((s) => (s.rir === null ? '-' : s.rir >= 4 ? '4+' : String(s.rir)));
  return rirs.some((r) => r !== '-') ? `${core} (RIR ${rirs.join(',')})` : core;
}

export function buildCoachContext(input: CoachContextInput): string {
  const { settings, program, workouts, cardio, bodyweight, now } = input;
  const maxChars = input.maxChars ?? 12_000;
  const u = settings.units;
  const done = completedWorkouts(workouts);
  const sections: { title: string; body: string; priority: number }[] = [];

  sections.push({
    priority: 0,
    title: 'PROFILE',
    body: [
      `Goal: ${GOAL_LABEL[settings.goal]}`,
      `Schedule: ${settings.schedule} days/week (Push/Pull/Legs rotation${settings.schedule === 6 ? ' twice' : ' once'})`,
      `Units: ${u}. Barbell ${settings.barbellWeight} ${u}; dumbbell step ${settings.dumbbellIncrement} ${u}; cable/machine step ${settings.cableIncrement} ${u}`,
      `Today: ${iso(now)}. Total workouts logged: ${done.length}${done[0] ? `; last workout ${iso(done[0].startedAt)} (${DAY_LABEL[done[0].day]})` : ''}`,
    ].join('\n'),
  });

  // Program + engine recommendations
  const programLines: string[] = [];
  const recLines: string[] = [];
  const gymProgram = program.filter((e) => e.place !== 'home');
  const homeProgram = program.filter((e) => e.place === 'home');
  const days = [
    ...(['push', 'pull', 'legs'] as const).map((day) => ({ day, list: gymProgram, title: DAY_LABEL[day] })),
    ...(homeProgram.length ? (['push', 'pull', 'legs'] as const).map((day) => ({ day, list: homeProgram, title: `${DAY_LABEL[day]} at home (no equipment)` })) : []),
  ];
  for (const { day, list: source, title } of days) {
    const list = source.filter((e) => e.day === day).sort((a, b) => a.order - b.order);
    programLines.push(`${title}:`);
    for (const ex of list) {
      const r = recommendationFor(ex, program, workouts, settings);
      const t = r.targets;
      programLines.push(`  - ${ex.name}: ${t.sets}x${t.repMin}-${t.repMax}, rest ${Math.round(t.restSec / 60 * 10) / 10} min, ${ex.equipment}/${ex.category}${isMainLift(ex, gymProgram) ? ' [main lift]' : ''}; muscles ${ex.muscles.join(', ')}`);
      const rec = r.recommendation;
      if (rec.action !== 'start' || rec.weight !== null) {
        recLines.push(`- ${ex.name}: ${ACTION_LABEL[rec.action]}${rec.weight !== null ? ` -> ${w(rec.weight)} ${u}` : ''}. ${rec.reason}${rec.stalled ? ' [STALLED]' : ''}`);
      }
    }
  }
  sections.push({ priority: 0, title: 'CURRENT PROGRAM', body: programLines.join('\n') });
  sections.push({ priority: 1, title: 'PROGRESS REPORT (all time)', body: progressReportText(progressReport({ settings, program, workouts, cardio, bodyweight, now }), u) });
  sections.push({ priority: 0, title: "ENGINE RECOMMENDATIONS FOR NEXT SESSION (rule-based default)", body: recLines.join('\n') || 'No history yet.' });

  // Weekly muscle sets
  const ms = muscleSets(workouts, now - 7 * DAY_MS, now + 1);
  const msLine = MUSCLE_GROUPS.filter((m) => (ms[m as MuscleGroup] ?? 0) > 0)
    .map((m) => `${m} ${w(ms[m as MuscleGroup] ?? 0)}`)
    .join(', ');
  const low = MUSCLE_GROUPS.filter((m) => (ms[m] ?? 0) < 10 && m !== 'forearms' && m !== 'core');
  sections.push({
    priority: 1,
    title: 'HARD SETS PER MUSCLE, LAST 7 DAYS (primary=1, secondary=0.5; guideline 10-20)',
    body: (msLine || 'None') + (done.length ? `\nUnder 10: ${low.join(', ') || 'none'}` : ''),
  });

  // PRs
  const keys = new Map<string, string>();
  for (const wo of done) for (const ex of wo.exercises) if (!keys.has(ex.key)) keys.set(ex.key, ex.name);
  const prLines: string[] = [];
  for (const [key, name] of keys) {
    const pr = personalRecords(exerciseHistory(workouts, key));
    if (!pr.heaviest) continue;
    prLines.push(`- ${name}: heaviest ${w(pr.heaviest.weight)}x${pr.heaviest.reps}; best e1RM ${Math.round(pr.best1RM?.value ?? 0)}; best session volume ${Math.round(pr.bestVolume?.value ?? 0)}`);
  }
  if (prLines.length) sections.push({ priority: 2, title: `PERSONAL RECORDS (${u})`, body: prLines.join('\n') });

  // Recent sessions: last 4 weeks in detail
  const recentCut = now - 28 * DAY_MS;
  const midCut = now - 56 * DAY_MS;
  const recent = done.filter((x) => x.startedAt >= recentCut);
  if (recent.length) {
    const lines = recent.map((wo) => {
      const exLines = wo.exercises
        .map((ex) => {
          if (ex.skipped) return `${ex.name}: skipped`;
          const sets = completedSets(ex);
          if (!sets.length) return null;
          return `${ex.name} ${setsLine(sets, ex.equipment === 'bodyweight')}${ex.note ? ` [note: ${ex.note.slice(0, 120)}]` : ''}`;
        })
        .filter(Boolean)
        .join(' | ');
      const notes = wo.notes ? ` Notes: "${wo.notes.slice(0, 200)}"` : '';
      return `${iso(wo.startedAt)} ${DAY_LABEL[wo.day]}${wo.place === 'home' ? ' at home' : ''} (${Math.round(workoutDurationSec(wo) / 60)} min): ${exLines}.${notes}`;
    });
    sections.push({ priority: 1, title: `SESSIONS, LAST 4 WEEKS (newest first; weight x reps in ${u})`, body: lines.join('\n') });
  }

  // Weeks 5-8 summarized per exercise
  const mid = done.filter((x) => x.startedAt < recentCut && x.startedAt >= midCut);
  if (mid.length) {
    sections.push({ priority: 3, title: 'WEEKS 5-8 (summary per exercise)', body: summarizeByExercise(mid) });
  }
  const old = done.filter((x) => x.startedAt < midCut);
  if (old.length) {
    sections.push({ priority: 4, title: `OLDER THAN 8 WEEKS (${old.length} workouts, summary)`, body: summarizeByExercise(old) });
  }

  // Cardio
  const recentCardio = cardio.filter((c) => c.date >= recentCut).sort((a, b) => b.date - a.date);
  sections.push({
    priority: 2,
    title: 'CARDIO, LAST 4 WEEKS',
    body: recentCardio.length
      ? `${recentCardio.length} sessions, ${recentCardio.reduce((s, c) => s + c.minutes, 0)} min total.\n` +
        recentCardio
          .slice(0, 12)
          .map((c) => `${iso(c.date)} ${c.type} ${c.minutes} min${c.distance ? `, ${c.distance} ${u === 'kg' ? 'km' : 'mi'}` : ''}${c.heartRate ? `, avg HR ${c.heartRate}` : ''}`)
          .join('\n')
      : 'None logged.',
  });

  // Bodyweight trend
  const bw = bodyweight.filter((b) => b.date >= midCut).sort((a, b) => a.date - b.date);
  if (bw.length) {
    const first = bw[0];
    const last = bw[bw.length - 1];
    const diff = Math.round((last.weight - first.weight) * 10) / 10;
    sections.push({
      priority: 2,
      title: 'BODYWEIGHT (last 8 weeks)',
      body: `${w(first.weight)} ${u} (${iso(first.date)}) -> ${w(last.weight)} ${u} (${iso(last.date)}), change ${diff >= 0 ? '+' : ''}${diff} ${u} over ${bw.length} entries`,
    });
  }

  return assemble(sections, maxChars);
}

function summarizeByExercise(workouts: Workout[]): string {
  const by = new Map<string, { name: string; sessions: number; topW: number; topReps: number; best1: number; firstE1: number; lastE1: number }>();
  for (const wo of [...workouts].sort((a, b) => a.startedAt - b.startedAt)) {
    for (const ex of wo.exercises) {
      const sets = completedSets(ex);
      if (!sets.length) continue;
      const key = normalizeKey(ex.name);
      const e1 = Math.max(...sets.map((s) => epley1RM(s.weight, s.reps)));
      const top = sets.reduce((m, s) => (s.weight > m.weight || (s.weight === m.weight && s.reps > m.reps) ? s : m), sets[0]);
      const cur = by.get(key) ?? { name: ex.name, sessions: 0, topW: 0, topReps: 0, best1: 0, firstE1: e1, lastE1: e1 };
      cur.sessions += 1;
      if (top.weight > cur.topW || (top.weight === cur.topW && top.reps > cur.topReps)) {
        cur.topW = top.weight;
        cur.topReps = top.reps;
      }
      cur.best1 = Math.max(cur.best1, e1);
      cur.lastE1 = e1;
      by.set(key, cur);
    }
  }
  return [...by.values()]
    .map((x) => `- ${x.name}: ${x.sessions} sessions, top set ${w(x.topW)}x${x.topReps}, e1RM ${Math.round(x.firstE1)} -> ${Math.round(x.lastE1)} (best ${Math.round(x.best1)})`)
    .join('\n');
}

function assemble(sections: { title: string; body: string; priority: number }[], maxChars: number): string {
  const render = (list: typeof sections) => list.map((s) => `## ${s.title}\n${s.body}`).join('\n\n');
  let list = [...sections];
  let text = render(list);
  // Drop the least important sections first until it fits.
  while (text.length > maxChars && list.some((s) => s.priority > 0)) {
    const maxP = Math.max(...list.map((s) => s.priority));
    const idx = list.map((s) => s.priority).lastIndexOf(maxP);
    list = list.filter((_, i) => i !== idx);
    text = render(list);
  }
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 20)}\n...[truncated]`;
  return text;
}
