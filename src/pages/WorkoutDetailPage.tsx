import { ArrowLeft, Bot, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RichText } from '../components/RichText';
import { Button, Card, ConfirmDialog, cx, DayBadge, IconButton, PageHeader, Stat, Stepper } from '../components/ui';
import { deleteWorkout, saveWorkout } from '../db/repo';
import { useToast } from '../hooks/toast';
import { latestBodyweight, useBodyweight, useSettings, useWorkout } from '../hooks/useData';
import { completedSets, workoutDurationSec, workoutSetCount, workoutVolume } from '../lib/calculations';
import { formatClock, formatCompact, formatDateLong, formatDuration, formatTime } from '../lib/format';
import { loadStep } from '../lib/rounding';
import { makeSet } from '../lib/session';
import { DAY_LABEL } from '../lib/schedule';
import type { Workout } from '../types';

export function WorkoutDetailPage() {
  const { id } = useParams();
  const w = useWorkout(id);
  if (w === undefined) return <div aria-busy="true" />;
  if (w === null)
    return (
      <Card className="p-6 text-center text-ink-2">
        This workout no longer exists. <Link to="/history" className="font-semibold text-accent">Back to History</Link>
      </Card>
    );
  return <Detail key={w.id} workout={w} />;
}

function Detail({ workout }: { workout: Workout }) {
  const nav = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const bodyweight = useBodyweight();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Workout>(workout);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const w = editing ? draft : workout;
  const u = settings.units;

  const updateSet = (exUid: string, setId: string, patch: { weight?: number | null; reps?: number | null; rir?: number | null }) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.map((e) => (e.uid !== exUid ? e : { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) })) }));
  const removeSet = (exUid: string, setId: string) => setDraft((d) => ({ ...d, exercises: d.exercises.map((e) => (e.uid !== exUid ? e : { ...e, sets: e.sets.filter((s) => s.id !== setId) })) }));
  const addSet = (exUid: string) =>
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((e) => {
        if (e.uid !== exUid) return e;
        const last = e.sets.filter((s) => s.done).at(-1);
        return { ...e, skipped: false, sets: [...e.sets, { ...makeSet(last?.weight ?? null, last?.reps ?? e.repMin, true), done: true }] };
      }),
    }));

  const save = async () => {
    // Sets without reps are dropped; everything left counts as done.
    const cleaned: Workout = { ...draft, exercises: draft.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => !s.done || (s.reps !== null && s.reps > 0)) })) };
    await saveWorkout(cleaned);
    setEditing(false);
    toast('Workout updated');
  };

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        back={
          <Link to="/history" className="mb-2 inline-flex items-center gap-1 text-[14px] font-medium text-ink-2 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> History
          </Link>
        }
        title={`${DAY_LABEL[w.day]} day`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <DayBadge day={w.day} size="sm" /> {w.place === 'home' && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">Home</span>}
            {formatDateLong(w.startedAt)} · {formatTime(w.startedAt)}
          </span>
        }
        action={
          editing ? (
            <>
              <IconButton
                label="Cancel editing"
                onClick={() => {
                  setDraft(workout);
                  setEditing(false);
                }}
              >
                <X className="size-5" aria-hidden />
              </IconButton>
              <Button variant="primary" size="sm" onClick={() => void save()}>
                <Check className="size-4" aria-hidden /> Save
              </Button>
            </>
          ) : (
            <>
              <IconButton
                label="Edit workout"
                onClick={() => {
                  setDraft(workout);
                  setEditing(true);
                }}
              >
                <Pencil className="size-5" aria-hidden />
              </IconButton>
              <IconButton label="Delete workout" onClick={() => setConfirmDelete(true)} className="hover:text-danger">
                <Trash2 className="size-5" aria-hidden />
              </IconButton>
            </>
          )
        }
      />

      <Card className="grid grid-cols-3 gap-4 p-5">
        <Stat label="Duration" value={formatDuration(workoutDurationSec(w))} />
        <Stat label="Volume" value={formatCompact(workoutVolume(w, latestBodyweight(bodyweight)))} sub={u} />
        <Stat label="Sets" value={workoutSetCount(w)} />
      </Card>

      {w.coachSummary && !editing && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Bot className="size-4 text-accent" aria-hidden />
            <h2 className="text-[14px] font-semibold">Coach's wrap-up</h2>
          </div>
          <RichText text={w.coachSummary} />
        </Card>
      )}

      {w.exercises.map((ex) => {
        const editSets = ex.sets.filter((s) => s.done);
        const sets = completedSets(ex);
        return (
          <Card key={ex.uid} className={cx('p-4', !editing && sets.length === 0 && 'opacity-60')}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold">{ex.name}</h3>
              {ex.skipped && <span className="text-[12px] text-ink-3">Skipped</span>}
            </div>
            {ex.swappedFrom && <p className="mb-2 text-[12px] text-ink-3">Swapped from {ex.swappedFrom}</p>}
            {editing ? (
              <div className="space-y-2">
                {editSets.map((s, i) => (
                  <div key={s.id} className="grid grid-cols-[22px_minmax(0,1.15fr)_minmax(0,1fr)_40px] items-center gap-1.5">
                    <span className="tnum text-center text-[14px] font-semibold text-ink-3">{i + 1}</span>
                    <Stepper compact label={`Set ${i + 1} weight`} value={s.weight} step={loadStep(ex.equipment, settings)} decimals onChange={(v) => updateSet(ex.uid, s.id, { weight: v })} />
                    <Stepper compact label={`Set ${i + 1} reps`} value={s.reps} step={1} onChange={(v) => updateSet(ex.uid, s.id, { reps: v })} />
                    <IconButton label={`Remove set ${i + 1}`} onClick={() => removeSet(ex.uid, s.id)} className="hover:text-danger">
                      <Trash2 className="size-4" aria-hidden />
                    </IconButton>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => addSet(ex.uid)}>
                  <Plus className="size-4" aria-hidden /> Add set
                </Button>
              </div>
            ) : sets.length ? (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    <th className="w-12 pb-1.5 font-semibold">Set</th>
                    <th className="pb-1.5 font-semibold">Weight</th>
                    <th className="pb-1.5 font-semibold">Reps</th>
                    {sets.some((s) => s.durationSec) && <th className="pb-1.5 font-semibold">Time</th>}
                    <th className="pb-1.5 text-right font-semibold">RIR</th>
                  </tr>
                </thead>
                <tbody className="tnum">
                  {sets.map((s, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1.5 text-ink-3">{i + 1}</td>
                      <td className="py-1.5 font-medium">{ex.equipment === 'bodyweight' ? (s.weight > 0 ? `BW +${s.weight} ${u}` : 'Bodyweight') : `${s.weight} ${u}`}</td>
                      <td className="py-1.5 font-medium">{s.reps}</td>
                      {sets.some((x) => x.durationSec) && <td className="py-1.5 text-ink-3">{s.durationSec ? formatClock(s.durationSec) : '-'}</td>}
                      <td className="py-1.5 text-right text-ink-3">{s.rir === null ? '-' : s.rir >= 4 ? '4+' : s.rir}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[13px] text-ink-3">No sets logged.</p>
            )}
            {ex.note && !editing && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{ex.note}</p>}
          </Card>
        );
      })}

      {(editing || w.notes) && (
        <Card className="p-4">
          <h2 className="mb-2 text-[14px] font-semibold">Notes</h2>
          {editing ? (
            <textarea
              aria-label="Workout notes"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              rows={3}
              className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent/60"
            />
          ) : (
            <p className="whitespace-pre-wrap text-[14px] text-ink-2">{w.notes}</p>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this workout?"
        message="It will be removed from your history, PRs, and charts. This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await deleteWorkout(workout.id);
          toast('Workout deleted', 'info');
          nav('/history', { replace: true });
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
