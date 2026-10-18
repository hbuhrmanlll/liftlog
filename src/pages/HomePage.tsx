import { AlertTriangle, ChevronRight, Clock, Dumbbell, Flame, ListChecks, Play, Trophy, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WeeklyCheckin, type CheckinRecord } from '../components/coach';
import { MuscleVolume } from '../components/MuscleVolume';
import { Button, Card, cx, DayBadge, dayStyles, RecBadge, SectionTitle, Stat } from '../components/ui';
import { setKv, startWorkout } from '../db/repo';
import { latestBodyweight, useActiveWorkout, useBodyweight, useCardio, useKv, useProgram, useSettings, useWorkouts } from '../hooks/useData';
import { completedWorkouts, DAY_MS, startOfWeek, weeklyStats, weekStreak } from '../lib/calculations';
import { bodyStats, cardioCalories, workoutCalories } from '../lib/calories';
import { WEEKDAYS, weighInDue } from '../lib/weighIn';
import { WeighInForm } from '../components/WeighInForm';
import { useProfile } from '../hooks/profile';
import { formatCompact, formatDate, formatDuration, relativeDay } from '../lib/format';
import { programRecommendations, recentPRs } from '../lib/insights';
import { deloadReminderWeeks, formatLoad } from '../lib/progression';
import { DAY_DESCRIPTION, DAY_LABEL, nextDay } from '../lib/schedule';
import { DAY_TYPES, type DayType } from '../types';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const nav = useNavigate();
  const settings = useSettings();
  const program = useProgram();
  const workouts = useWorkouts();
  const cardio = useCardio();
  const bodyweight = useBodyweight();
  const active = useActiveWorkout();
  const deloadDismissed = useKv<number>('deloadDismissedAt');
  const checkin = useKv<CheckinRecord>('checkin');
  const now = Date.now();

  const done = useMemo(() => completedWorkouts(workouts), [workouts]);
  const next = nextDay(workouts);
  const dayExercises = program.filter((e) => e.day === next);
  const stats = useMemo(() => weeklyStats(workouts, cardio, now, latestBodyweight(bodyweight)), [workouts, cardio, bodyweight, now]);
  const { profile } = useProfile();
  const weekCalories = useMemo(() => {
    const s = bodyStats(settings, latestBodyweight(bodyweight));
    const from = startOfWeek(now);
    const lift = workouts.filter((w) => w.status === 'completed' && w.startedAt >= from).map((w) => workoutCalories(w, s));
    const cardioK = cardio.filter((c) => c.date >= from).map((c) => cardioCalories(c, s));
    const all = [...lift, ...cardioK];
    return all.some((k) => k === null) && all.every((k) => k === null) ? null : all.reduce<number>((t, k) => t + (k ?? 0), 0);
  }, [settings, bodyweight, workouts, cardio, now]);
  const weighIn = settings.weighInReminders && weighInDue(bodyweight, settings.weighInDay, now) && new Date(now).getDay() === settings.weighInDay ? 'today' : settings.weighInReminders && weighInDue(bodyweight, settings.weighInDay, now) && bodyweight.length > 0 ? 'overdue' : settings.weighInReminders && bodyweight.length === 0 ? 'first' : null;
  const streak = useMemo(() => weekStreak(workouts, now), [workouts, now]);
  const prs = useMemo(() => recentPRs(workouts, settings.units, now - 14 * DAY_MS).slice(0, 4), [workouts, settings.units, now]);
  const recs = useMemo(() => programRecommendations(program, workouts, settings), [program, workouts, settings]);
  const stalled = recs.filter((r) => r.recommendation.stalled);
  const nextPlan = recs.filter((r) => r.exercise.day === next && r.recommendation.action !== 'start');
  const deloadWeeks = settings.deloadReminders ? deloadReminderWeeks(done.map((w) => w.startedAt), now, deloadDismissed) : 0;
  const lastOfNext = done.find((w) => w.day === next);
  const estMinutes = Math.round(dayExercises.reduce((m, e) => m + e.sets * (e.restSec / 60 + 0.75), 0) + 5);

  const start = async (day: DayType) => {
    await startWorkout(day);
    nav('/workout');
  };

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex items-end justify-between pt-2">
        <div>
          <p className="text-[13px] font-medium text-ink-3">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="mt-0.5 text-[28px] font-bold tracking-tight">
            {greeting()}, {profile.displayName.split(' ')[0]}
          </h1>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13px] font-semibold ring-1 ring-line" title="Weeks in a row with at least one workout">
            <Flame className="size-4 text-push" aria-hidden />
            {streak} week{streak === 1 ? '' : 's'}
          </div>
        )}
      </header>

      {/* Next / active workout */}
      {active ? (
        <Card className="overflow-hidden">
          <div className={cx('h-1', dayStyles.dot[active.day])} />
          <div className="p-5">
            <div className="flex items-center justify-between">
              <DayBadge day={active.day} />
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-accent">
                <span className="size-2 animate-pulse rounded-full bg-accent" /> In progress
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">{DAY_LABEL[active.day]} day</h2>
            <p className="mt-1 text-[15px] text-ink-2">
              Started {formatDuration(Math.round((now - active.startedAt) / 1000))} ago · {active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)} sets done
            </p>
            <Button variant="primary" size="xl" className="mt-5 w-full" onClick={() => nav('/workout')}>
              <Play className="size-5 fill-current" aria-hidden /> Resume workout
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className={cx('h-1', dayStyles.dot[next])} />
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-ink-3">Next up</span>
              <span className="flex items-center gap-1 text-[13px] text-ink-3">
                <Clock className="size-3.5" aria-hidden /> ~{estMinutes} min
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <h2 className={cx('text-[34px] font-extrabold leading-none tracking-tight', dayStyles.text[next])}>{DAY_LABEL[next]}</h2>
              <span className="text-[15px] text-ink-2">{DAY_DESCRIPTION[next]}</span>
            </div>
            <p className="mt-2 text-[13px] text-ink-3">{lastOfNext ? `Last ${DAY_LABEL[next]} day: ${relativeDay(lastOfNext.startedAt, now)}` : done.length === 0 ? 'Your first workout. Let’s go.' : `First ${DAY_LABEL[next]} day`}</p>
            <ul className="mt-4 space-y-2">
              {dayExercises.map((ex) => {
                const r = recs.find((x) => x.exercise.id === ex.id);
                const rec = r?.recommendation;
                return (
                  <li key={ex.id} className="flex items-center gap-3 text-[14px]">
                    <span className="min-w-0 flex-1 truncate text-ink">{ex.name}</span>
                    <span className="tnum shrink-0 text-ink-3">
                      {r?.targets.sets}x{r?.targets.repMin}-{r?.targets.repMax}
                    </span>
                    <span className="tnum w-24 shrink-0 text-right font-medium text-ink-2">{rec && rec.weight !== null ? formatLoad(rec.weight, ex.equipment, settings).replace('bodyweight', 'BW') : '-'}</span>
                  </li>
                );
              })}
            </ul>
            <Button variant="primary" size="xl" className="mt-5 w-full" onClick={() => void start(next)}>
              <Play className="size-5 fill-current" aria-hidden /> Start {DAY_LABEL[next]} workout
            </Button>
            <div className="mt-3 flex items-center justify-center gap-1 text-[13px] text-ink-3">
              <span>Or start</span>
              {DAY_TYPES.filter((d) => d !== next).map((d, i) => (
                <span key={d}>
                  {i > 0 && 'or '}
                  <button type="button" className={cx('font-semibold hover:underline', dayStyles.text[d])} onClick={() => void start(d)}>
                    {DAY_LABEL[d]}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Alerts */}
      {weighIn && (
        <Card className="space-y-3 border-accent/40 p-4">
          <div>
            <p className="font-semibold text-ink">{weighIn === 'first' ? 'Start your weight tracker' : weighIn === 'today' ? `It's ${WEEKDAYS[settings.weighInDay]}: weekly weigh-in` : 'Weekly weigh-in is due'}</p>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {weighIn === 'first' ? 'Log your weight once a week to see your trend next to your strength.' : 'Same time of day as last week, ideally in the morning before eating.'}{' '}
              <Link to="/progress?tab=weight" className="font-semibold text-accent hover:underline">
                Weight tracker
              </Link>
            </p>
          </div>
          <WeighInForm compact />
        </Card>
      )}

      {(deloadWeeks > 0 || stalled.length > 0) && (
        <div className="space-y-3">
          {deloadWeeks > 0 && (
            <Card className="flex items-start gap-3 border-down/30 bg-down-soft p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-down" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">Time for a deload week?</p>
                <p className="mt-0.5 text-[14px] text-ink-2">You've trained {deloadWeeks} weeks straight. A lighter week (about 10% less weight, fewer sets) every 6-8 weeks helps you recover and keep progressing.</p>
              </div>
              <button type="button" aria-label="Dismiss deload reminder" className="text-ink-3 hover:text-ink" onClick={() => void setKv('deloadDismissedAt', Date.now())}>
                <X className="size-5" aria-hidden />
              </button>
            </Card>
          )}
          {stalled.map(({ exercise, recommendation }) => (
            <Link key={exercise.id} to={`/exercise/${exercise.id}`} className="flex items-center gap-3 rounded-2xl border border-down/30 bg-down-soft p-4 transition-colors hover:brightness-110">
              <AlertTriangle className="size-5 shrink-0 text-down" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{exercise.name} has stalled</p>
                <p className="mt-0.5 text-[14px] text-ink-2">{recommendation.reason}</p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      {/* This week */}
      <section>
        <SectionTitle>This week</SectionTitle>
        <Card className="grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-4">
          <Stat label="Workouts" value={`${stats.workouts}/${settings.schedule}`} sub={stats.workouts >= settings.schedule ? 'Goal hit' : `${settings.schedule - stats.workouts} to go`} />
          <Stat label="Volume" value={formatCompact(stats.volume)} sub={settings.units} />
          <Stat label="Calories" value={weekCalories === null ? '-' : formatCompact(weekCalories)} sub={weekCalories === null ? <Link to="/settings#profile" className="text-accent">add your weight</Link> : 'kcal burned (est.)'} />
          <Stat label="Cardio" value={`${stats.cardioMinutes}`} sub={`min · ${stats.cardioSessions} session${stats.cardioSessions === 1 ? '' : 's'}`} />
        </Card>
      </section>

      {settings.aiEnabled && done.length > 0 && <WeeklyCheckin last={checkin} />}

      <section>
        <SectionTitle action={<Link to="/progress" className="text-[13px] font-semibold text-accent hover:underline">Details</Link>}>Sets per muscle this week</SectionTitle>
        <Card className="p-4">
          {stats.sets === 0 ? <p className="text-[14px] text-ink-3">No sets logged this week yet. Aim for roughly 10-20 hard sets per muscle each week.</p> : <MuscleVolume sets={stats.muscleSets} compact />}
        </Card>
      </section>

      <section>
        <SectionTitle>Recent PRs</SectionTitle>
        {prs.length === 0 ? (
          <Card className="flex items-center gap-3 p-4 text-[14px] text-ink-3">
            <Trophy className="size-5 shrink-0" aria-hidden />
            {done.length < 2 ? 'Personal records show up here once you repeat a workout and beat it.' : 'No new PRs in the last 2 weeks. Keep chipping away - one more rep counts.'}
          </Card>
        ) : (
          <Card as="ul" className="divide-y divide-line">
            {prs.map((p) => (
              <li key={`${p.workoutId}${p.key}`} className="flex items-center gap-3 px-4 py-3">
                <Trophy className="size-5 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{p.name}</p>
                  <p className="text-[13px] text-ink-3">{p.label}</p>
                </div>
                <span className="text-[12px] text-ink-3">{formatDate(p.date)}</span>
              </li>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionTitle action={<Link to="/program" className="text-[13px] font-semibold text-accent hover:underline">Edit program</Link>}>Your program</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {DAY_TYPES.map((d) => (
            <Link key={d} to={`/program?day=${d}`} className="group rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
              <div className="flex items-center justify-between">
                <DayBadge day={d} />
                <ChevronRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
              <p className="mt-2 text-[13px] text-ink-3">{program.filter((e) => e.day === d).length} exercises</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">
                {program
                  .filter((e) => e.day === d)
                  .slice(0, 3)
                  .map((e) => e.name)
                  .join(', ')}
              </p>
            </Link>
          ))}
        </div>
        <Link to="/program" className="mt-3 flex items-center gap-2 text-[13px] text-ink-3 hover:text-ink lg:hidden">
          <ListChecks className="size-4" aria-hidden /> Add, remove, reorder, or swap exercises
        </Link>
      </section>

      {done.length === 0 && !active && (
        <Card className="flex items-center gap-3 p-4">
          <Dumbbell className="size-5 shrink-0 text-ink-3" aria-hidden />
          <p className="text-[14px] text-ink-2">
            No workouts yet. Start your first <span className="font-semibold text-push">Push</span> day above - weights and reps are pre-filled, just tap the check after each set.
          </p>
        </Card>
      )}

      {nextPlan.length > 0 && !active && (
        <section>
          <SectionTitle>Next {DAY_LABEL[next]} day plan</SectionTitle>
          <Card as="ul" className="divide-y divide-line">
            {nextPlan.map(({ exercise, recommendation }) => (
                <li key={exercise.id}>
                  <Link to={`/exercise/${exercise.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{exercise.name}</p>
                      <p className="line-clamp-1 text-[13px] text-ink-3">{recommendation.reason}</p>
                    </div>
                    <RecBadge action={recommendation.action} />
                  </Link>
                </li>
              ))}
          </Card>
        </section>
      )}
    </div>
  );
}
