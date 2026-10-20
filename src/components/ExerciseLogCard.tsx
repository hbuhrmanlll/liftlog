import { Check, ChevronDown, Flame, Hourglass, Info, MoreHorizontal, NotebookPen, Plus, Repeat, SkipForward, Trash2, Undo2 } from 'lucide-react';
import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { findLibraryExercise } from '../data/exerciseLibrary';
import { useSetTimer } from '../hooks/restTimer';
import { summarizeSession } from '../lib/calculations';
import { formatClock } from '../lib/format';
import { formatLoad, type Recommendation, type SessionResult } from '../lib/progression';
import { loadStep } from '../lib/rounding';
import { makeSet, propagateWeight } from '../lib/session';
import type { Exercise, Settings, WorkoutExercise } from '../types';
import { CuesAndMistakes, VideoBlock } from './ExerciseGuide';
import { Button, cx, InfoTip, RecBadge, Sheet, Stepper } from './ui';

const RIR_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4+' },
];

export interface ExerciseLogCardProps {
  index: number;
  ex: WorkoutExercise;
  source?: Exercise;
  settings: Settings;
  lastSession?: SessionResult;
  rec: Recommendation;
  onChange: (next: WorkoutExercise) => void;
  onSetDone: (ex: WorkoutExercise, setIndex: number) => void;
  onSwap: () => void;
}

export const ExerciseLogCard = memo(function ExerciseLogCard({ index, ex, source, settings, lastSession, rec, onChange, onSetDone, onSwap }: ExerciseLogCardProps) {
  const [menu, setMenu] = useState(false);
  const [guide, setGuide] = useState(false);
  const [noteOpen, setNoteOpen] = useState(Boolean(ex.note));
  const [warmOpen, setWarmOpen] = useState(true);
  const step = loadStep(ex.equipment, settings);
  const done = ex.sets.filter((s) => s.done).length;
  const allDone = done >= ex.sets.length && ex.sets.length > 0;
  const bw = ex.equipment === 'bodyweight';
  const lib = source ?? findLibraryExercise(ex.name);
  const alternate = ex.swappedFrom ?? lib?.alternate;
  const fmt = (w: number) => formatLoad(w, ex.equipment, settings);
  const setTimer = useSetTimer();
  const nextSet = ex.sets.findIndex((x) => !x.done);
  const timingHere = setTimer.running !== null && ex.sets.some((x) => x.id === setTimer.running?.setId);

  const updateSet = (i: number, patch: Partial<WorkoutExercise['sets'][number]>) => {
    let sets = ex.sets;
    if ('weight' in patch) sets = propagateWeight(sets, i, patch.weight ?? null);
    sets = sets.map((s, k) => (k === i ? { ...s, ...patch, weight: 'weight' in patch ? (patch.weight ?? null) : s.weight } : s));
    onChange({ ...ex, sets });
  };

  const toggleDone = (i: number) => {
    const s = ex.sets[i];
    if (!s.done && !canComplete(s)) return;
    // Finishing the set that's being timed records how long it took.
    const durationSec = !s.done && setTimer.running?.setId === s.id ? setTimer.stopSet() : null;
    const next = {
      ...ex,
      sets: ex.sets.map((x, k) => (k === i ? { ...x, done: !x.done, weight: x.weight ?? (bw ? 0 : x.weight), ...(durationSec ? { durationSec } : {}) } : x)),
    };
    onChange(next);
    if (!s.done) onSetDone(next, i);
  };

  const addSet = () => {
    const last = ex.sets[ex.sets.length - 1];
    onChange({ ...ex, sets: [...ex.sets, makeSet(last?.weight ?? null, last?.reps ?? ex.repMin, true)] });
  };

  const canComplete = (s: WorkoutExercise['sets'][number]) => s.reps !== null && s.reps > 0 && (bw || (s.weight !== null && s.weight > 0));

  const removeSet = (i: number) => onChange({ ...ex, sets: ex.sets.filter((_, k) => k !== i) });

  return (
    <article className={cx('rounded-2xl border bg-surface transition-colors', allDone ? 'border-up/30' : 'border-line', ex.skipped && 'opacity-60')} aria-label={ex.name}>
      <header className="flex items-start gap-3 px-4 pb-2 pt-4">
        <span className={cx('tnum mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold', allDone ? 'bg-up text-black' : 'bg-surface-2 text-ink-2')}>{allDone ? <Check className="size-4" strokeWidth={3} aria-hidden /> : index + 1}</span>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => setGuide(true)} className="group flex max-w-full items-center gap-1.5 text-left">
            <h3 className="truncate text-[17px] font-semibold leading-tight text-ink group-hover:underline">{ex.name}</h3>
            <Info className="size-4 shrink-0 text-ink-3" aria-hidden />
          </button>
          <p className="tnum mt-0.5 text-[13px] text-ink-3">
            {ex.targetSets} x {ex.repMin}-{ex.repMax}
            {ex.name.toLowerCase().includes('lunge') ? ' per leg' : ''} · rest {formatClock(ex.restSec)}
            {ex.equipment === 'dumbbell' ? ' · per dumbbell' : ''}
            {bw ? ` · added ${settings.units}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => setMenu(true)} aria-label={`More options for ${ex.name}`} className="-mr-1 flex size-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2 hover:text-ink">
          <MoreHorizontal className="size-5" aria-hidden />
        </button>
      </header>

      <div className="space-y-2 px-4">
        {ex.swappedFrom && <p className="text-[12px] text-ink-3">Swapped from {ex.swappedFrom}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {ex.plannedAction && <RecBadge action={ex.plannedAction} />}
          <span className="text-[13px] text-ink-2">{ex.plannedAction === 'start' && ex.plannedWeight === null ? rec.reason : rec.goal}</span>
        </div>
        <p className="text-[13px] text-ink-3">
          {lastSession ? (
            <>
              Last time: <span className="tnum font-medium text-ink-2">{summarizeSession(lastSession.sets, settings.units, bw)}</span>
            </>
          ) : (
            'First time logging this exercise'
          )}
        </p>
      </div>

      {ex.skipped ? (
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-[14px] text-ink-3">Skipped today</span>
          <Button size="sm" onClick={() => onChange({ ...ex, skipped: false })}>
            <Undo2 className="size-4" aria-hidden /> Undo skip
          </Button>
        </div>
      ) : (
        <>
          {ex.warmups.length > 0 && (
            <div className="mx-4 mt-3 rounded-xl bg-surface-2/60 px-3 py-2">
              <button type="button" onClick={() => setWarmOpen((o) => !o)} aria-expanded={warmOpen} className="flex w-full items-center gap-2 py-1 text-[13px] font-semibold text-ink-2">
                <Flame className="size-4 text-push" aria-hidden /> Warm-up sets <span className="font-normal text-ink-3">· not counted</span>
                <ChevronDown className={cx('ml-auto size-4 transition-transform', warmOpen && 'rotate-180')} aria-hidden />
              </button>
              {warmOpen && (
                <ul className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {ex.warmups.map((w, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        aria-pressed={w.done}
                        onClick={() => onChange({ ...ex, warmups: ex.warmups.map((x, k) => (k === i ? { ...x, done: !x.done } : x)) })}
                        className={cx('tnum flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition-colors', w.done ? 'bg-up-soft text-up' : 'bg-surface text-ink-2 hover:text-ink')}
                      >
                        {w.done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                        {i === 0 && ex.equipment === 'barbell' && w.weight === settings.barbellWeight ? 'Bar' : `${w.weight}`} x {w.reps}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-3 px-4">
            <div className="grid grid-cols-[22px_minmax(0,1.15fr)_minmax(0,1fr)_48px] items-center gap-x-1.5 px-0.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              <span>Set</span>
              <span className="text-center">{bw ? `+${settings.units}` : settings.units}</span>
              <span className="text-center">Reps</span>
              <span className="sr-only">Done</span>
            </div>
            <ol className="space-y-2">
              {ex.sets.map((s, i) => (
                <li key={s.id}>
                  <div className="grid grid-cols-[22px_minmax(0,1.15fr)_minmax(0,1fr)_48px] items-center gap-x-1.5">
                    <span className={cx('tnum text-center text-[15px] font-semibold', s.done ? 'text-up' : 'text-ink-3')}>{i + 1}</span>
                    <Stepper
                      compact
                      label={`Set ${i + 1} weight`}
                      value={s.weight}
                      step={step}
                      decimals
                      placeholder={ex.plannedWeight ? `${ex.plannedWeight}` : settings.units}
                      start={ex.sets[i - 1]?.weight ?? ex.plannedWeight ?? undefined}
                      onChange={(v) => updateSet(i, { weight: v })}
                      className={cx(s.done && 'border-transparent bg-up-soft')}
                    />
                    <Stepper compact label={`Set ${i + 1} reps`} value={s.reps} step={1} placeholder={`${ex.repMin}-${ex.repMax}`} start={ex.repMax} onChange={(v) => updateSet(i, { reps: v })} className={cx(s.done && 'border-transparent bg-up-soft')} />
                    <button
                      type="button"
                      onClick={() => toggleDone(i)}
                      aria-pressed={s.done}
                      aria-label={s.done ? `Set ${i + 1} done. Tap to undo` : `Complete set ${i + 1}`}
                      disabled={!s.done && !canComplete(s)}
                      title={!s.done && !canComplete(s) ? 'Enter weight and reps first' : undefined}
                      className={cx(
                        'flex size-12 items-center justify-center rounded-xl transition-all active:scale-90 disabled:opacity-35',
                        s.done ? 'bg-up text-black shadow-[0_0_0_4px_var(--up-soft)]' : 'border-2 border-line bg-surface-2 text-ink-3 hover:border-up/60 hover:text-up',
                      )}
                    >
                      <Check className="size-6" strokeWidth={3} aria-hidden />
                    </button>
                  </div>
                  {s.done && (
                    <div className="animate-fade-up ml-[28px] mt-1.5 flex items-center gap-1" role="group" aria-label={`Reps in reserve for set ${i + 1}`}>
                      {s.durationSec ? <span className="tnum mr-1.5 text-[12px] text-ink-3">{formatClock(s.durationSec)} ·</span> : null}
                      <span className="mr-1 text-[12px] text-ink-3">Reps left?</span>
                      {RIR_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={s.rir === o.value}
                          onClick={() => updateSet(i, { rir: s.rir === o.value ? null : o.value })}
                          className={cx('tnum h-7 min-w-8 rounded-lg px-2 text-[12px] font-semibold transition-colors', s.rir === o.value ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-3 hover:text-ink')}
                        >
                          {o.label}
                        </button>
                      ))}
                      <InfoTip label="What is RIR?">
                        <strong>RIR = reps in reserve.</strong> How many more good reps you could have done. 0 = you couldn't do another, 2 = two left in the tank. Optional - it helps the coach fine-tune your weights.
                      </InfoTip>
                      {s.extra && (
                        <button type="button" onClick={() => removeSet(i)} aria-label={`Remove set ${i + 1}`} className="ml-auto flex size-7 items-center justify-center rounded-lg text-ink-3 hover:text-danger">
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                  {!s.done && s.extra && (
                    <div className="ml-[28px] mt-1">
                      <button type="button" onClick={() => removeSet(i)} className="text-[12px] text-ink-3 hover:text-danger">
                        Remove extra set
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {noteOpen && (
            <div className="mt-3 px-4">
              <label htmlFor={`note-${ex.uid}`} className="sr-only">
                Note for {ex.name}
              </label>
              <textarea
                id={`note-${ex.uid}`}
                value={ex.note}
                onChange={(e) => onChange({ ...ex, note: e.target.value })}
                placeholder="Note (e.g. felt easy, grip slipped, use wider stance)"
                rows={2}
                className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent/60"
              />
            </div>
          )}

          {settings.setTimerEnabled && nextSet >= 0 && (
            <div className="mt-3 px-4">
              {timingHere ? (
                <p className="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent-soft text-[14px] font-medium text-ink">
                  <Hourglass className="size-4 text-accent" aria-hidden /> Timing set {ex.sets.findIndex((x) => x.id === setTimer.running?.setId) + 1}. Tap ✓ when you finish it.
                </p>
              ) : (
                <Button size="sm" className="w-full" onClick={() => setTimer.startSet(ex.sets[nextSet].id, `${ex.name} · set ${nextSet + 1}`)}>
                  <Hourglass className="size-4" aria-hidden /> Start set {nextSet + 1} timer ({formatClock(settings.setTimerSec)})
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center gap-1 px-2 pb-2 pt-2">
            <Button variant="ghost" size="sm" onClick={addSet}>
              <Plus className="size-4" aria-hidden /> Add set
            </Button>
            {!noteOpen && (
              <Button variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
                <NotebookPen className="size-4" aria-hidden /> Note
              </Button>
            )}
            <span className="tnum ml-auto pr-2 text-[12px] text-ink-3">
              {done}/{ex.sets.length} sets
            </span>
          </div>
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={ex.name}>
        <div className="-mx-2 flex flex-col">
          {[
            { Icon: Plus, label: 'Add an extra set', on: addSet, show: !ex.skipped },
            { Icon: Repeat, label: alternate ? `Swap to ${alternate}` : 'No alternate set', on: onSwap, show: Boolean(alternate), sub: 'Uses its own history and recommendation' },
            { Icon: NotebookPen, label: 'Add a note', on: () => setNoteOpen(true), show: !ex.skipped },
            { Icon: Info, label: 'How to do it', on: () => setGuide(true), show: true },
            ex.skipped ? { Icon: Undo2, label: 'Undo skip', on: () => onChange({ ...ex, skipped: false }), show: true } : { Icon: SkipForward, label: 'Skip this exercise today', on: () => onChange({ ...ex, skipped: true }), show: true, sub: "Skipped exercises don't affect progression" },
          ]
            .filter((a) => a.show)
            .map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  setMenu(false);
                  a.on();
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2"
              >
                <a.Icon className="size-5 shrink-0 text-ink-2" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-ink">{a.label}</span>
                  {a.sub && <span className="block text-[12px] text-ink-3">{a.sub}</span>}
                </span>
              </button>
            ))}
        </div>
      </Sheet>

      <Sheet open={guide} onClose={() => setGuide(false)} title={ex.name}>
        <div className="space-y-5">
          <VideoBlock name={ex.name} videoUrl={source?.name === ex.name ? source.videoUrl : undefined} />
          <CuesAndMistakes cues={lib?.cues ?? []} mistakes={lib?.mistakes ?? []} />
          {rec.weight !== null && (
            <p className="text-[14px] text-ink-2">
              Today's target: <strong className="text-ink">{fmt(ex.plannedWeight ?? rec.weight)}</strong> for {ex.targetSets} x {ex.repMin}-{ex.repMax}.
            </p>
          )}
          {source && (
            <Link to={`/exercise/${source.id}`} className="inline-flex text-[14px] font-semibold text-accent hover:underline">
              Full history and charts
            </Link>
          )}
        </div>
      </Sheet>
    </article>
  );
});
