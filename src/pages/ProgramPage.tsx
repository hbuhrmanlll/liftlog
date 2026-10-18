import { ArrowDown, ArrowUp, ChevronRight, Pencil, Plus, Repeat, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, ConfirmDialog, cx, dayStyles, IconButton, PageHeader, Segmented, Sheet, Stepper, TextField } from '../components/ui';
import { EXERCISE_LIBRARY, findLibraryExercise } from '../data/exerciseLibrary';
import { addExerciseToDay, moveExercise, removeExercise, replaceExercise, resetProgram, updateExercise } from '../db/repo';
import { useToast } from '../hooks/toast';
import { useProgram, useSettings } from '../hooks/useData';
import { formatClock } from '../lib/format';
import { DAY_LABEL } from '../lib/schedule';
import { effectiveTargets, isMainLift } from '../lib/targets';
import { DAY_TYPES, EQUIPMENT, MUSCLE_GROUPS, type Category, type DayType, type Equipment, type Exercise, type LibraryExercise, type MuscleGroup } from '../types';

const DAY_MUSCLES: Record<DayType, MuscleGroup[]> = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['lats', 'upper back', 'rear delts', 'biceps', 'forearms'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
};

export function ProgramPage() {
  const [params, setParams] = useSearchParams();
  const day = (DAY_TYPES as readonly string[]).includes(params.get('day') ?? '') ? (params.get('day') as DayType) : 'push';
  const program = useProgram();
  const settings = useSettings();
  const toast = useToast();
  const list = program.filter((e) => e.day === day);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [swapping, setSwapping] = useState<Exercise | null>(null);
  const [removing, setRemoving] = useState<Exercise | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title="Program"
        subtitle="Your Push / Pull / Legs days. Tap an exercise for form tips and history."
        action={
          <IconButton label="Reset program to default" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="size-5" aria-hidden />
          </IconButton>
        }
      />
      <Segmented<DayType> label="Day" value={day} onChange={(d) => setParams({ day: d }, { replace: true })} options={DAY_TYPES.map((d) => ({ value: d, label: DAY_LABEL[d] }))} />

      {settings.goal !== 'muscle' && (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          {settings.goal === 'strength' ? 'Get Stronger' : 'Both'} mode: the first compound lift each day uses {settings.goal === 'strength' ? '5 sets of 3-6 reps with 4 min rest' : '4 sets of 5-8 reps with 3 min rest'}. Change your goal in Settings.
        </p>
      )}

      <Card as="ul" className="divide-y divide-line overflow-hidden">
        {list.length === 0 && <li className="p-5 text-center text-[14px] text-ink-3">No exercises on {DAY_LABEL[day]} day yet. Add one below.</li>}
        {list.map((ex, i) => {
          const t = effectiveTargets(ex, settings.goal, isMainLift(ex, program));
          return (
            <li key={ex.id} className="flex items-center gap-2 py-2 pl-3 pr-2">
              <span className={cx('tnum flex size-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold', dayStyles.soft[day], dayStyles.text[day])}>{i + 1}</span>
              <Link to={`/exercise/${ex.id}`} className="group min-w-0 flex-1 py-1.5 pl-1">
                <span className="block truncate text-[15px] font-semibold group-hover:underline">{ex.name}</span>
                <span className="tnum block text-[13px] text-ink-3">
                  {t.sets} x {t.repMin}-{t.repMax} · rest {formatClock(t.restSec)} · <span className="capitalize">{ex.equipment}</span>
                  {t.modified && <span className="text-accent"> · strength</span>}
                </span>
              </Link>
              <div className="flex shrink-0 items-center">
                <IconButton label={`Move ${ex.name} up`} disabled={i === 0} onClick={() => void moveExercise(ex.id, -1)} className="size-9">
                  <ArrowUp className="size-4" aria-hidden />
                </IconButton>
                <IconButton label={`Move ${ex.name} down`} disabled={i === list.length - 1} onClick={() => void moveExercise(ex.id, 1)} className="size-9">
                  <ArrowDown className="size-4" aria-hidden />
                </IconButton>
                <IconButton label={`Edit ${ex.name}`} onClick={() => setEditing(ex)} className="size-9">
                  <Pencil className="size-4" aria-hidden />
                </IconButton>
                <IconButton label={`Swap ${ex.name}`} onClick={() => setSwapping(ex)} className="size-9">
                  <Repeat className="size-4" aria-hidden />
                </IconButton>
                <IconButton label={`Remove ${ex.name}`} onClick={() => setRemoving(ex)} className="size-9 hover:text-danger">
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </div>
            </li>
          );
        })}
      </Card>

      <Button variant="secondary" size="lg" className="w-full" onClick={() => setAdding(true)}>
        <Plus className="size-5" aria-hidden /> Add exercise to {DAY_LABEL[day]}
      </Button>
      <p className="text-center text-[13px] text-ink-3">Tip: about 6 exercises per day keeps sessions near 60-75 minutes. Compounds first, isolation last.</p>

      <EditSheet exercise={editing} onClose={() => setEditing(null)} />

      <Sheet open={swapping !== null} onClose={() => setSwapping(null)} title={`Swap ${swapping?.name ?? ''}`} wide>
        {swapping && (
          <LibraryPicker
            day={swapping.day}
            highlight={swapping.alternate}
            exclude={program.map((e) => e.name)}
            onPick={async (lib) => {
              await replaceExercise(swapping.id, lib);
              toast(`Swapped to ${lib.name}`);
              setSwapping(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title={`Add to ${DAY_LABEL[day]} day`} wide>
        <LibraryPicker
          day={day}
          exclude={program.map((e) => e.name)}
          onPick={async (lib) => {
            await addExerciseToDay(day, lib);
            toast(`Added ${lib.name}`);
            setAdding(false);
          }}
        />
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title="Remove exercise?"
        message={
          <>
            Remove <strong className="text-ink">{removing?.name}</strong> from {removing ? DAY_LABEL[removing.day] : ''} day? Your logged history for it is kept.
          </>
        }
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          if (removing) await removeExercise(removing.id);
          toast('Exercise removed', 'info');
        }}
        onClose={() => setRemoving(null)}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Reset program?"
        message="This restores the default 6-exercise Push / Pull / Legs program. Your workout history is kept, but custom exercises, edits, starting weights, and saved videos are lost."
        confirmLabel="Reset program"
        danger
        onConfirm={async () => {
          await resetProgram();
          toast('Program reset to default');
        }}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}

function EditSheet({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  return (
    <Sheet open={exercise !== null} onClose={onClose} title={exercise ? `Edit ${exercise.name}` : 'Edit'}>
      {exercise && <EditForm key={exercise.id} exercise={exercise} onClose={onClose} />}
    </Sheet>
  );
}

function EditForm({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const toast = useToast();
  const [sets, setSets] = useState<number | null>(exercise.sets);
  const [repMin, setRepMin] = useState<number | null>(exercise.repMin);
  const [repMax, setRepMax] = useState<number | null>(exercise.repMax);
  const [rest, setRest] = useState<number | null>(exercise.restSec);
  const [alternate, setAlternate] = useState(exercise.alternate);
  const valid = sets !== null && sets >= 1 && sets <= 10 && repMin !== null && repMax !== null && repMin >= 1 && repMax >= repMin && rest !== null && rest >= 0;

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        await updateExercise(exercise.id, { sets: sets!, repMin: repMin!, repMax: repMax!, restSec: rest!, alternate: alternate.trim() });
        toast('Saved');
        onClose();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Sets</span>
          <Stepper label="Sets" value={sets} onChange={setSets} step={1} min={1} />
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Rest (seconds)</span>
          <Stepper label="Rest seconds" value={rest} onChange={setRest} step={15} min={0} />
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Min reps</span>
          <Stepper label="Minimum reps" value={repMin} onChange={setRepMin} step={1} min={1} />
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Max reps</span>
          <Stepper label="Maximum reps" value={repMax} onChange={setRepMax} step={1} min={1} />
        </div>
      </div>
      {repMin !== null && repMax !== null && repMax < repMin && <p className="text-[13px] text-danger">Max reps must be at least min reps.</p>}
      <TextField label="Alternate exercise" value={alternate} onChange={(e) => setAlternate(e.target.value)} hint="Used for one-tap swaps during a workout." list="library-names" />
      <datalist id="library-names">
        {EXERCISE_LIBRARY.map((l) => (
          <option key={l.name} value={l.name} />
        ))}
      </datalist>
      <p className="text-[13px] text-ink-3">The app adds weight once you hit {repMax ?? '?'} reps on all {sets ?? '?'} sets.</p>
      <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
        Save changes
      </Button>
    </form>
  );
}

function LibraryPicker({ day, exclude, highlight, onPick }: { day: DayType; exclude: string[]; highlight?: string; onPick: (lib: LibraryExercise) => void | Promise<void> }) {
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState(false);
  const excluded = new Set(exclude.map((e) => e.toLowerCase()));
  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return EXERCISE_LIBRARY.filter((l) => !excluded.has(l.name.toLowerCase()))
      .filter((l) => !term || l.name.toLowerCase().includes(term) || l.muscles.some((m) => m.includes(term)) || l.equipment.includes(term))
      .map((l) => ({ l, score: (l.name === highlight ? -10 : 0) + (DAY_MUSCLES[day].includes(l.muscles[0]) ? -1 : 0) }))
      .sort((a, b) => a.score - b.score)
      .map((x) => x.l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, day, highlight, exclude.join('|')]);

  if (custom) return <CustomExerciseForm day={day} onSubmit={onPick} onCancel={() => setCustom(false)} />;

  return (
    <div className="space-y-3">
      <div className="flex h-12 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 focus-within:border-accent/60">
        <Search className="size-4 text-ink-3" aria-hidden />
        <input aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, muscle, or equipment" className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
      </div>
      <ul className="-mx-2 max-h-[52dvh] overflow-y-auto">
        {items.map((l) => (
          <li key={l.name}>
            <button type="button" onClick={() => void onPick(l)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-medium">
                  {l.name}
                  {l.name === highlight && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">Alternate</span>}
                </span>
                <span className="block text-[12px] capitalize text-ink-3">
                  {l.muscles.join(', ')} · {l.equipment} · {l.sets} x {l.repMin}-{l.repMax}
                </span>
              </div>
              <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="px-2 py-4 text-[14px] text-ink-3">No matches.</li>}
      </ul>
      <Button variant="outline" className="w-full" onClick={() => setCustom(true)}>
        <Plus className="size-4" aria-hidden /> Create a custom exercise
      </Button>
    </div>
  );
}

function CustomExerciseForm({ day, onSubmit, onCancel }: { day: DayType; onSubmit: (lib: LibraryExercise) => void | Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState<Equipment>('dumbbell');
  const [category, setCategory] = useState<Category>('isolation');
  const [muscles, setMuscles] = useState<MuscleGroup[]>([DAY_MUSCLES[day][0]]);
  const [sets, setSets] = useState<number | null>(3);
  const [repMin, setRepMin] = useState<number | null>(10);
  const [repMax, setRepMax] = useState<number | null>(15);
  const [rest, setRest] = useState<number | null>(60);
  const valid = name.trim().length >= 2 && muscles.length > 0 && sets && repMin && repMax && repMax >= repMin && rest !== null;
  const known = findLibraryExercise(name);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        void onSubmit({
          name: name.trim(),
          equipment,
          category,
          muscles,
          lowerBody: muscles.some((m) => DAY_MUSCLES.legs.includes(m)),
          sets: sets!,
          repMin: repMin!,
          repMax: repMax!,
          restSec: rest!,
          cues: known?.cues ?? [],
          mistakes: known?.mistakes ?? [],
          alternate: known?.alternate ?? '',
        });
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pec Deck" required />
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Equipment</legend>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((eq) => (
            <button key={eq} type="button" aria-pressed={equipment === eq} onClick={() => setEquipment(eq)} className={cx('h-9 rounded-full px-3.5 text-[13px] font-medium capitalize', equipment === eq ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2')}>
              {eq}
            </button>
          ))}
        </div>
      </fieldset>
      <Segmented<Category>
        label="Category"
        value={category}
        onChange={setCategory}
        options={[
          { value: 'compound', label: 'Compound' },
          { value: 'isolation', label: 'Isolation' },
        ]}
      />
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Muscles (first tap = primary)</legend>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((m) => {
            const idx = muscles.indexOf(m);
            return (
              <button
                key={m}
                type="button"
                aria-pressed={idx >= 0}
                onClick={() => setMuscles((cur) => (idx >= 0 ? cur.filter((x) => x !== m) : [...cur, m]))}
                className={cx('h-9 rounded-full px-3 text-[13px] font-medium capitalize', idx === 0 ? 'bg-accent text-accent-ink' : idx > 0 ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2')}
              >
                {m}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Sets</span>
          <Stepper label="Sets" value={sets} onChange={setSets} step={1} min={1} />
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Rest (seconds)</span>
          <Stepper label="Rest seconds" value={rest} onChange={setRest} step={15} min={0} />
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Min reps</span>
          <Stepper label="Minimum reps" value={repMin} onChange={setRepMin} step={1} min={1} />
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Max reps</span>
          <Stepper label="Maximum reps" value={repMax} onChange={setRepMax} step={1} min={1} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
          Add exercise
        </Button>
      </div>
    </form>
  );
}
