import { CalendarDays, ChevronLeft, ChevronRight, Clock, Dumbbell, HeartPulse, List, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, cx, DayBadge, dayStyles, EmptyState, IconButton, PageHeader, Segmented } from '../components/ui';
import { deleteCardio } from '../db/repo';
import { useToast } from '../hooks/toast';
import { latestBodyweight, useBodyweight, useCardio, useSettings, useWorkouts } from '../hooks/useData';
import { completedWorkouts, startOfDay, workoutDurationSec, workoutSetCount, workoutVolume } from '../lib/calculations';
import { formatCompact, formatDate, formatDuration } from '../lib/format';
import { bodyStats, cardioCalories, workoutCalories, type BodyStats } from '../lib/calories';
import type { CardioLog, Workout } from '../types';

type Entry = { kind: 'workout'; date: number; w: Workout } | { kind: 'cardio'; date: number; c: CardioLog };

export function HistoryPage() {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const workouts = useWorkouts();
  const cardio = useCardio();
  const settings = useSettings();
  const bodyweight = useBodyweight();
  const done = useMemo(() => completedWorkouts(workouts), [workouts]);
  const bw = latestBodyweight(bodyweight);
  const stats = bodyStats(settings, bw);

  const entries = useMemo<Entry[]>(() => [...done.map((w) => ({ kind: 'workout' as const, date: w.startedAt, w })), ...cardio.map((c) => ({ kind: 'cardio' as const, date: c.date, c }))].sort((a, b) => b.date - a.date), [done, cardio]);

  const grouped = useMemo(() => {
    const out: { label: string; items: Entry[] }[] = [];
    for (const e of entries) {
      const label = new Date(e.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (out[out.length - 1]?.label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [entries]);

  return (
    <div className="animate-fade-up">
      <PageHeader title="History" subtitle={done.length ? `${done.length} workout${done.length === 1 ? '' : 's'} logged` : undefined} />
      <Segmented
        label="History view"
        className="mb-5"
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: <span className="inline-flex items-center gap-1.5"><List className="size-4" aria-hidden />List</span> },
          { value: 'calendar', label: <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />Calendar</span> },
        ]}
      />
      {entries.length === 0 ? (
        <Card>
          <EmptyState icon={<Dumbbell className="size-7" aria-hidden />} title="No workouts yet" action={<Link to="/workout"><Button variant="primary">Start your first Push day</Button></Link>}>
            Every finished workout and cardio session shows up here.
          </EmptyState>
        </Card>
      ) : view === 'list' ? (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.label}>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-ink-3">{g.label}</h2>
              <Card as="ul" className="divide-y divide-line overflow-hidden">
                {g.items.map((e) => (e.kind === 'workout' ? <WorkoutRow key={e.w.id} w={e.w} units={settings.units} bw={bw} stats={stats} /> : <CardioRow key={e.c.id} c={e.c} units={settings.units} stats={stats} />))}
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <CalendarView workouts={done} cardio={cardio} />
      )}
    </div>
  );
}

function WorkoutRow({ w, units, bw, stats }: { w: Workout; units: string; bw?: number; stats: BodyStats }) {
  const kcal = workoutCalories(w, stats);
  return (
    <li>
      <Link to={`/history/${w.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2">
        <div className={cx('flex size-11 shrink-0 flex-col items-center justify-center rounded-xl', dayStyles.soft[w.day])}>
          <span className={cx('text-[11px] font-semibold uppercase leading-none', dayStyles.text[w.day])}>{new Date(w.startedAt).toLocaleDateString('en-US', { weekday: 'short' })}</span>
          <span className={cx('tnum text-[17px] font-bold leading-tight', dayStyles.text[w.day])}>{new Date(w.startedAt).getDate()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <DayBadge day={w.day} size="sm" /> {w.place === 'home' && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">Home</span>}
            {w.coachSummary && <span className="text-[11px] text-ink-3">Coach note</span>}
          </div>
          <p className="tnum mt-1 text-[13px] text-ink-3">
            <Clock className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
            {formatDuration(workoutDurationSec(w))} · {workoutSetCount(w)} sets · {formatCompact(workoutVolume(w, bw))} {units}
            {kcal !== null && kcal > 0 && ` · ${kcal} kcal`}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  );
}

function CardioRow({ c, units, stats }: { c: CardioLog; units: string; stats: BodyStats }) {
  const kcal = cardioCalories(c, stats);
  const toast = useToast();
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2">
        <HeartPulse className="size-5 text-ink-2" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">
          {c.type} · {c.minutes} min
        </p>
        <p className="text-[13px] text-ink-3">
          {formatDate(c.date, { weekday: 'short', month: 'short', day: 'numeric' })}
          {c.distance ? ` · ${c.distance} ${units === 'kg' ? 'km' : 'mi'}` : ''}
          {c.heartRate ? ` · ${c.heartRate} bpm` : ''}
          {kcal ? ` · ${kcal} kcal` : ''}
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
  );
}

function CalendarView({ workouts, cardio }: { workouts: Workout[]; cardio: CardioLog[] }) {
  const nav = useNavigate();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const byDay = useMemo(() => {
    const m = new Map<number, Workout[]>();
    for (const w of workouts) {
      const k = startOfDay(w.startedAt);
      m.set(k, [...(m.get(k) ?? []), w]);
    }
    return m;
  }, [workouts]);
  const cardioDays = useMemo(() => new Set(cardio.map((c) => startOfDay(c.date))), [cardio]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(Date.now());
  const cells: (number | null)[] = [...Array<null>(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1).getTime())];
  const monthCount = workouts.filter((w) => new Date(w.startedAt).getMonth() === month && new Date(w.startedAt).getFullYear() === year).length;

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <IconButton label="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))}>
          <ChevronLeft className="size-5" aria-hidden />
        </IconButton>
        <div className="text-center">
          <h2 className="text-[17px] font-semibold">{cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          <p className="text-[12px] text-ink-3">
            {monthCount} workout{monthCount === 1 ? '' : 's'}
          </p>
        </div>
        <IconButton label="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))}>
          <ChevronRight className="size-5" aria-hidden />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-3" aria-hidden>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="pb-2">
            {d.slice(0, 1)}
            <span className="hidden sm:inline">{d.slice(1)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((ts, i) => {
          if (ts === null) return <div key={`e${i}`} />;
          const ws = byDay.get(ts) ?? [];
          const w = ws[0];
          const hasCardio = cardioDays.has(ts);
          const label = `${new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${ws.length ? `: ${ws.map((x) => x.day).join(', ')} workout` : ''}${hasCardio ? ', cardio' : ''}`;
          return (
            <button
              key={ts}
              type="button"
              disabled={!w}
              onClick={() => w && nav(`/history/${w.id}`)}
              aria-label={label}
              className={cx(
                'relative flex aspect-square flex-col items-center justify-center rounded-xl text-[14px] font-medium transition-colors',
                w ? cx(dayStyles.soft[w.day], dayStyles.text[w.day], 'font-bold hover:brightness-125') : 'text-ink-3',
                ts === today && 'ring-2 ring-accent/70',
              )}
            >
              <span className="tnum">{new Date(ts).getDate()}</span>
              <span className="absolute bottom-1.5 flex gap-0.5">
                {ws.map((x) => (
                  <span key={x.id} className={cx('size-1.5 rounded-full', dayStyles.dot[x.day])} />
                ))}
                {hasCardio && <span className="size-1.5 rounded-full bg-ink-2" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[12px] text-ink-2">
        {(['push', 'pull', 'legs'] as const).map((d) => (
          <span key={d} className="inline-flex items-center gap-1.5">
            <span className={cx('size-2.5 rounded-full', dayStyles.dot[d])} />
            {d[0].toUpperCase() + d.slice(1)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-ink-2" /> Cardio
        </span>
      </div>
    </Card>
  );
}
