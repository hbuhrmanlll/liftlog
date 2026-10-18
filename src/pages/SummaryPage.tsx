import { Bot, CheckCircle2, Home, Sparkles, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AskCoachOpinion, CoachNotice } from '../components/coach';
import { RichText } from '../components/RichText';
import { Button, Card, DayBadge, RecBadge, SectionTitle, Spinner, Stat, TypingDots } from '../components/ui';
import { saveWorkout } from '../db/repo';
import { latestBodyweight, useBodyweight, useOverrides, useProgram, useSettings, useWorkout, useWorkouts } from '../hooks/useData';
import { loadCoachContext, useCoachAvailability, useCoachRequest } from '../hooks/useCoach';
import { completedSets, exerciseHistory, summarizeSession, workoutDurationSec, workoutSetCount, workoutVolume } from '../lib/calculations';
import { bodyStats, workoutCalories } from '../lib/calories';
import { streamCoach } from '../lib/coachClient';
import { formatCompact, formatDateLong, formatDuration } from '../lib/format';
import { prsForWorkout } from '../lib/insights';
import { formatLoad, recommend } from '../lib/progression';
import { recommendationFor } from '../lib/session';
import { DAY_LABEL } from '../lib/schedule';
import type { Workout } from '../types';

export function SummaryPage() {
  const { id } = useParams();
  const workout = useWorkout(id);
  if (workout === undefined) return <div aria-busy="true" />;
  if (workout === null || workout.status !== 'completed')
    return (
      <Card className="p-6 text-center text-ink-2">
        Workout not found. <Link to="/history" className="font-semibold text-accent">Go to History</Link>
      </Card>
    );
  return <Summary workout={workout} />;
}

function Summary({ workout }: { workout: Workout }) {
  const location = useLocation();
  const justFinished = Boolean((location.state as { justFinished?: boolean } | null)?.justFinished);
  const settings = useSettings();
  const program = useProgram();
  const workouts = useWorkouts();
  const bodyweight = useBodyweight();
  const overrides = useOverrides();
  const u = settings.units;

  const prs = useMemo(() => prsForWorkout(workout, workouts, u), [workout, workouts, u]);
  const volume = workoutVolume(workout, latestBodyweight(bodyweight));
  const kcal = workoutCalories(workout, bodyStats(settings, latestBodyweight(bodyweight), new Date(workout.startedAt)));
  const recs = useMemo(
    () =>
      workout.exercises
        .filter((ex) => !ex.skipped && completedSets(ex).length > 0)
        .map((ex) => {
          const src = program.find((p) => p.name.toLowerCase() === ex.name.toLowerCase());
          const history = exerciseHistory(workouts, ex.key);
          const r = src
            ? recommendationFor(src, program, workouts, settings)
            : { recommendation: recommend({ sets: ex.targetSets, repMin: ex.repMin, repMax: ex.repMax, equipment: ex.equipment, category: ex.category, lowerBody: ex.lowerBody }, history, settings), targets: { sets: ex.targetSets, repMin: ex.repMin, repMax: ex.repMax } };
          return { ex, rec: r.recommendation, targets: r.targets, lastWeight: history[0] ? Math.max(...history[0].sets.map((s) => s.weight)) : null };
        }),
    [workout, program, workouts, settings],
  );

  return (
    <div className="animate-fade-up space-y-6">
      <header className="pt-2 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-up-soft">
          <CheckCircle2 className="size-8 text-up" aria-hidden />
        </div>
        <h1 className="text-[28px] font-bold tracking-tight">{justFinished ? 'Workout complete' : `${DAY_LABEL[workout.day]} day summary`}</h1>
        <p className="mt-1 flex items-center justify-center gap-2 text-[14px] text-ink-2">
          <DayBadge day={workout.day} size="sm" /> {formatDateLong(workout.startedAt)}
        </p>
      </header>

      <Card className="grid grid-cols-3 gap-x-4 gap-y-5 p-5">
        <Stat label="Duration" value={formatDuration(workoutDurationSec(workout))} />
        <Stat label="Calories" value={kcal === null ? '-' : kcal} sub={kcal === null ? <Link to="/settings#profile" className="text-accent">add weight</Link> : 'kcal (est.)'} />
        <Stat label="Volume" value={formatCompact(volume)} sub={`${u} lifted`} />
        <Stat label="Sets" value={workoutSetCount(workout)} sub="completed" />
        <Stat label="New PRs" value={prs.length} sub={prs.length ? 'nice work' : 'keep pushing'} />
        <Stat label="Exercises" value={workout.exercises.filter((e) => completedSets(e).length > 0).length} sub="logged" />
      </Card>

      {prs.length > 0 && (
        <section>
          <SectionTitle>New personal records</SectionTitle>
          <ul className="space-y-2">
            {prs.map((p, i) => (
              <li key={`${p.key}${p.kind}`} className="animate-pr relative overflow-hidden rounded-2xl border border-accent/40 bg-accent-soft p-4" style={{ animationDelay: `${i * 90}ms` }}>
                <div className="pr-shine pointer-events-none absolute inset-0" aria-hidden />
                <div className="relative flex items-center gap-3">
                  <Trophy className="size-6 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{p.name}</p>
                    <p className="text-[14px] text-ink-2">{p.label}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CoachWrapUp workout={workout} auto={justFinished} />

      <section>
        <SectionTitle>Next time</SectionTitle>
        <div className="space-y-3">
          {recs.length === 0 && <Card className="p-4 text-[14px] text-ink-3">No completed sets in this workout.</Card>}
          {recs.map(({ ex, rec, targets, lastWeight }) => {
            const override = overrides.find((o) => o.key === ex.key);
            return (
              <Card key={ex.uid} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{ex.name}</p>
                    <p className="tnum mt-0.5 text-[13px] text-ink-3">Today: {summarizeSession(completedSets(ex), u, ex.equipment === 'bodyweight')}</p>
                  </div>
                  <RecBadge action={rec.action} />
                </div>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">{rec.reason}</p>
                {rec.note && <p className="mt-1.5 text-[13px] text-down">{rec.note}</p>}
                {override && (
                  <p className="mt-2 text-[13px] font-medium text-accent">
                    You picked the coach's {formatLoad(override.weight, ex.equipment, settings)} for next session.
                  </p>
                )}
                {settings.aiEnabled && (
                  <div className="mt-3">
                    <AskCoachOpinion
                      subject={{ name: ex.name, key: ex.key, profile: { equipment: ex.equipment, category: ex.category, lowerBody: ex.lowerBody }, repMin: targets.repMin, repMax: targets.repMax, sets: targets.sets, lastWeight }}
                      engine={rec}
                      settings={settings}
                      override={override}
                      quiet
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to="/" className="flex-1">
          <Button variant="primary" size="lg" className="w-full">
            <Home className="size-5" aria-hidden /> Done
          </Button>
        </Link>
        <Link to={`/history/${workout.id}`} className="flex-1">
          <Button size="lg" className="w-full">
            View or edit in History
          </Button>
        </Link>
      </div>
    </div>
  );
}

function CoachWrapUp({ workout, auto }: { workout: Workout; auto: boolean }) {
  const settings = useSettings();
  const availability = useCoachAvailability();
  const req = useCoachRequest();
  const [text, setText] = useState('');
  const started = useRef(false);

  const run = () =>
    req.run(async (signal) => {
      const context = await loadCoachContext();
      const lines = workout.exercises
        .filter((e) => !e.skipped && completedSets(e).length)
        .map((e) => `${e.name}: ${summarizeSession(completedSets(e), settings.units, e.equipment === 'bodyweight')}${e.note ? ` (note: ${e.note})` : ''}`)
        .join('\n');
      const full = await streamCoach(
        {
          task: 'wrapup',
          context,
          messages: [{ role: 'user', content: `I just finished my ${DAY_LABEL[workout.day]} workout (${Math.round(workoutDurationSec(workout) / 60)} min).\n${lines}${workout.notes ? `\nMy notes: ${workout.notes}` : ''}\nWrite my wrap-up.` }],
        },
        setText,
        signal,
      );
      if (full) await saveWorkout({ ...workout, coachSummary: full });
    });

  useEffect(() => {
    if (auto && !started.current && !workout.coachSummary && availability.state === 'ready') {
      started.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, availability.state, workout.coachSummary]);

  if (!settings.aiEnabled) return null;
  const shown = text || workout.coachSummary || '';

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft">
          <Bot className="size-4 text-accent" aria-hidden />
        </span>
        <h2 className="text-[15px] font-semibold">Coach's wrap-up</h2>
        {req.loading && <Spinner className="ml-auto text-ink-3" />}
      </div>
      {shown ? (
        <RichText text={shown} />
      ) : availability.state === 'unavailable' ? (
        <CoachNotice compact message={availability.message} kind={availability.kind} />
      ) : req.loading ? (
        <div className="flex items-center gap-2 text-[14px] text-ink-3">
          <TypingDots /> Writing your summary
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => void run()} disabled={availability.state === 'checking'}>
          <Sparkles className="size-4 text-accent" aria-hidden /> Get coach wrap-up
        </Button>
      )}
      {req.error && <p className="mt-2 text-[13px] text-danger">{req.error}</p>}
    </Card>
  );
}
