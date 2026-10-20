import { ChevronRight, Flag, HeartPulse, MoreVertical, NotebookPen, Play, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CardioForm } from '../components/CardioForm';
import { ExerciseLogCard } from '../components/ExerciseLogCard';
import { Button, Card, ConfirmDialog, cx, DayBadge, dayStyles, IconButton, PageHeader, SectionTitle, Sheet } from '../components/ui';
import { deleteCardio, discardWorkout, finishWorkout, saveWorkout, startWorkout, swapWorkoutExercise } from '../db/repo';
import { useRestTimer } from '../hooks/restTimer';
import { useToast } from '../hooks/toast';
import { useWakeLock } from '../hooks/useWakeLock';
import { useActiveWorkout, useCardio, useProgram, useSettings, useWorkouts } from '../hooks/useData';
import { exerciseHistory } from '../lib/calculations';
import { formatClock, formatDate } from '../lib/format';
import { recommend } from '../lib/progression';
import { DAY_DESCRIPTION, DAY_LABEL, nextDay } from '../lib/schedule';
import { DAY_TYPES, type DayType, type Workout, type WorkoutExercise } from '../types';

export function WorkoutPage() {
  const active = useActiveWorkout();
  if (active === undefined)
    return (
      <div className="flex min-h-[50dvh] items-center justify-center" aria-busy="true" aria-label="Loading workout">
        <span className="size-6 animate-spin rounded-full border-2 border-ink-3 border-r-transparent" />
      </div>
    );
  if (active === null) return <StartWorkout />;
  return <ActiveWorkout key={active.id} initial={active} />;
}

function StartWorkout() {
  const nav = useNavigate();
  const workouts = useWorkouts();
  const program = useProgram();
  const settings = useSettings();
  const cardio = useCardio();
  const toast = useToast();
  const suggested = nextDay(workouts);

  const start = async (day: DayType) => {
    await startWorkout(day);
    nav('/workout');
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Workout" subtitle="Pick today's session. Next in your rotation is highlighted." />
      <div className="space-y-3">
        {DAY_TYPES.map((d) => {
          const isNext = d === suggested;
          return (
            <button
              key={d}
              type="button"
              onClick={() => void start(d)}
              className={cx('group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors', isNext ? 'border-accent/50 bg-surface' : 'border-line bg-surface hover:bg-surface-2')}
            >
              <span className={cx('flex size-12 shrink-0 items-center justify-center rounded-xl', dayStyles.soft[d])}>
                <Play className={cx('size-5 fill-current', dayStyles.text[d])} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[19px] font-bold">{DAY_LABEL[d]}</span>
                  {isNext && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-ink">Next up</span>}
                </span>
                <span className="block text-[13px] text-ink-3">
                  {DAY_DESCRIPTION[d]} · {program.filter((e) => e.day === d).length} exercises
                </span>
              </span>
              <ChevronRight className="size-5 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          );
        })}
      </div>

      <section>
        <SectionTitle>Log cardio</SectionTitle>
        <Card className="p-4">
          <CardioForm units={settings.units} />
        </Card>
      </section>

      {cardio.length > 0 && (
        <section>
          <SectionTitle>Recent cardio</SectionTitle>
          <Card as="ul" className="divide-y divide-line">
            {cardio.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <HeartPulse className="size-5 shrink-0 text-push" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">
                    {c.type} · {c.minutes} min
                  </p>
                  <p className="text-[12px] text-ink-3">
                    {formatDate(c.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {c.distance ? ` · ${c.distance} ${settings.units === 'kg' ? 'km' : 'mi'}` : ''}
                    {c.heartRate ? ` · ${c.heartRate} bpm` : ''}
                  </p>
                </div>
                <IconButton
                  label="Delete cardio entry"
                  onClick={async () => {
                    await deleteCardio(c.id);
                    toast('Cardio entry deleted', 'info');
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function useElapsed(since: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return Math.max(0, Math.round((now - since) / 1000));
}

function ActiveWorkout({ initial }: { initial: Workout }) {
  const nav = useNavigate();
  const settings = useSettings();
  const program = useProgram();
  const allWorkouts = useWorkouts();
  const timer = useRestTimer();
  const toast = useToast();
  useWakeLock(settings.keepAwake);
  const [workout, setWorkout] = useState<Workout>(initial);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [menu, setMenu] = useState(false);
  const [notesOpen, setNotesOpen] = useState(Boolean(initial.notes));
  const [cardioOpen, setCardioOpen] = useState(false);
  const elapsed = useElapsed(workout.startedAt);
  const first = useRef(true);

  // Auto-save every change so closing the app mid-workout is safe.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void saveWorkout(workout);
  }, [workout]);

  const history = useMemo(() => allWorkouts.filter((w) => w.status === 'completed'), [allWorkouts]);
  const perExercise = useMemo(
    () =>
      workout.exercises.map((ex) => {
        const h = exerciseHistory(history, ex.key, workout.id);
        const src = program.find((p) => p.id === ex.exerciseId);
        const rec = recommend({ sets: ex.targetSets, repMin: ex.repMin, repMax: ex.repMax, equipment: ex.equipment, category: ex.category, lowerBody: ex.lowerBody }, h, settings, {
          startWeight: src && src.name === ex.name ? src.startWeight : undefined,
        });
        return { last: h[0], rec, src };
      }),
    // Only recompute when the exercise list identity (not set values) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, program, settings, workout.id, workout.exercises.map((e) => e.uid).join()],
  );

  const onChange = useCallback((next: WorkoutExercise) => {
    setWorkout((w) => ({ ...w, exercises: w.exercises.map((e) => (e.uid === next.uid ? next : e)) }));
  }, []);

  const totals = useMemo(() => {
    const live = workout.exercises.filter((e) => !e.skipped);
    const total = live.reduce((n, e) => n + e.sets.length, 0);
    const done = live.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    return { total, done };
  }, [workout]);

  const onSetDone = useCallback(
    (ex: WorkoutExercise, setIndex: number) => {
      const remainingElsewhere = workout.exercises.some((e) => e.uid !== ex.uid && !e.skipped && e.sets.some((s) => !s.done));
      const remainingHere = ex.sets.some((s, i) => i !== setIndex && !s.done);
      if (remainingElsewhere || remainingHere) timer.start(ex.restSec, ex.name);
      else timer.skip();
      if ('vibrate' in navigator && settings.timerVibrate) navigator.vibrate(15);
    },
    [workout.exercises, timer, settings.timerVibrate],
  );

  const swap = async (uid: string) => {
    const updated = await swapWorkoutExercise(workout, uid);
    first.current = true;
    setWorkout(updated);
    const ex = updated.exercises.find((e) => e.uid !== uid && !workout.exercises.some((o) => o.uid === e.uid));
    toast(ex ? `Swapped to ${ex.name}` : 'Swapped');
  };

  const finish = async () => {
    timer.skip();
    const done = await finishWorkout(workout);
    nav(`/workout/summary/${done.id}`, { replace: true, state: { justFinished: true } });
  };

  const unchecked = totals.total - totals.done;
  const pct = totals.total ? (totals.done / totals.total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <DayBadge day={workout.day} size="sm" />
              <span className="tnum text-[13px] font-medium text-ink-3" aria-label={`Elapsed ${formatClock(elapsed)}`}>
                {formatClock(elapsed)}
              </span>
            </div>
            <p className="tnum mt-1 text-[13px] text-ink-2">
              {totals.done} of {totals.total} sets
            </p>
          </div>
          <IconButton label="Workout options" onClick={() => setMenu(true)}>
            <MoreVertical className="size-5" aria-hidden />
          </IconButton>
          <Button variant="primary" onClick={() => (unchecked > 0 ? setConfirmFinish(true) : void finish())} disabled={totals.done === 0}>
            <Flag className="size-4" aria-hidden /> Finish
          </Button>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={totals.total} aria-valuenow={totals.done} aria-label="Workout progress">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <h1 className="sr-only">{DAY_LABEL[workout.day]} workout in progress</h1>

      {workout.exercises.length === 0 && (
        <Card className="p-5 text-[15px] text-ink-2">
          This day has no exercises.{' '}
          <button type="button" className="font-semibold text-accent" onClick={() => nav('/program')}>
            Add some in Program
          </button>
          .
        </Card>
      )}

      {workout.exercises.map((ex, i) => (
        <ExerciseLogCard
          key={ex.uid}
          index={i}
          ex={ex}
          source={perExercise[i]?.src}
          settings={settings}
          lastSession={perExercise[i]?.last}
          rec={perExercise[i]?.rec ?? { action: 'start', weight: null, reason: '', goal: '', stalled: false }}
          onChange={onChange}
          onSetDone={onSetDone}
          onSwap={() => void swap(ex.uid)}
        />
      ))}

      <Card className="p-4">
        {notesOpen ? (
          <>
            <label htmlFor="workout-notes" className="mb-2 block text-[13px] font-semibold text-ink-2">
              Workout notes
            </label>
            <textarea
              id="workout-notes"
              value={workout.notes}
              onChange={(e) => setWorkout((w) => ({ ...w, notes: e.target.value }))}
              rows={3}
              placeholder="How did it feel? Sleep, energy, anything to remember."
              className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent/60"
            />
          </>
        ) : (
          <button type="button" onClick={() => setNotesOpen(true)} className="flex items-center gap-2 text-[14px] font-medium text-ink-2 hover:text-ink">
            <NotebookPen className="size-4" aria-hidden /> Add workout notes
          </button>
        )}
      </Card>

      <Button variant="primary" size="xl" className="w-full" onClick={() => (unchecked > 0 ? setConfirmFinish(true) : void finish())} disabled={totals.done === 0}>
        <Flag className="size-5" aria-hidden /> Finish workout
      </Button>
      {totals.done === 0 && <p className="text-center text-[13px] text-ink-3">Check off at least one set to finish.</p>}

      <Sheet open={menu} onClose={() => setMenu(false)} title="Workout options">
        <div className="-mx-2 flex flex-col">
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2"
            onClick={() => {
              setMenu(false);
              setCardioOpen(true);
            }}
          >
            <HeartPulse className="size-5 text-ink-2" aria-hidden />
            <span className="text-[15px] font-medium">Log cardio</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2"
            onClick={() => {
              setMenu(false);
              setNotesOpen(true);
            }}
          >
            <NotebookPen className="size-5 text-ink-2" aria-hidden />
            <span className="text-[15px] font-medium">Workout notes</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-danger hover:bg-danger-soft"
            onClick={() => {
              setMenu(false);
              setConfirmDiscard(true);
            }}
          >
            <Trash2 className="size-5" aria-hidden />
            <span className="text-[15px] font-medium">Discard workout</span>
          </button>
        </div>
      </Sheet>

      <Sheet open={cardioOpen} onClose={() => setCardioOpen(false)} title="Log cardio">
        <CardioForm units={settings.units} onDone={() => setCardioOpen(false)} />
      </Sheet>

      <ConfirmDialog
        open={confirmFinish}
        title="Finish workout?"
        message={
          <>
            You have <strong className="text-ink">{unchecked}</strong> unchecked set{unchecked === 1 ? '' : 's'}. Only checked sets are saved and count toward your progress.
          </>
        }
        confirmLabel="Finish"
        onConfirm={finish}
        onClose={() => setConfirmFinish(false)}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this workout?"
        message="Everything logged in this session will be deleted. This can't be undone."
        confirmLabel="Discard"
        danger
        onConfirm={async () => {
          timer.skip();
          await discardWorkout(workout.id);
          nav('/', { replace: true });
        }}
        onClose={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
