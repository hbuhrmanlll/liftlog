import { BarChart3, Bell, Bot, CalendarPlus, ChevronRight, Dumbbell, Flame, RefreshCw, Scale, Sparkles, Trash2, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChartBlock, ExerciseCharts, RangePicker, TrendChart } from '../components/charts';
import { CoachNotice, CoachSuggestions } from '../components/coach';
import { MuscleVolume } from '../components/MuscleVolume';
import { WeighInForm } from '../components/WeighInForm';
import { RichText } from '../components/RichText';
import { Button, Card, cx, EmptyState, IconButton, PageHeader, SectionTitle, Segmented, Sheet, Spinner, Stat, Toggle, TypingDots } from '../components/ui';
import { deleteBodyweight, setKv, updateSettings } from '../db/repo';
import { useToast } from '../hooks/toast';
import { loadCoachContext, useCoachAvailability, useCoachRequest } from '../hooks/useCoach';
import { latestBodyweight, useBodyweight, useCardio, useKv, useProgram, useSettings, useWorkouts } from '../hooks/useData';
import { completedWorkouts, DAY_MS, exerciseHistory, muscleSets, personalRecords, rangeStart, startOfWeek, type RangeKey } from '../lib/calculations';
import { bmr, dailyEstimate, missingStats } from '../lib/calories';
import { streamCoach } from '../lib/coachClient';
import { formatCompact, formatDate, formatNumber, formatWeight } from '../lib/format';
import { appUrl, isNativeApp, saveTextFile } from '../lib/platform';
import { progressReport } from '../lib/progressReport';
import { mainLiftKeys, strengthSeries, weeklyWeights } from '../lib/strength';
import { WEEKDAYS, weighInDue, weighInIcs } from '../lib/weighIn';
import { MUSCLE_GROUPS } from '../types';

type Tab = 'overview' | 'strength' | 'weight' | 'exercises';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'strength', label: 'Strength' },
  { value: 'weight', label: 'Weight' },
  { value: 'exercises', label: 'Exercises' },
];

export function ProgressPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview') as Tab;
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Progress" subtitle="How far you've come, and what to do next." />
      <Segmented<Tab> label="Progress section" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} options={TABS} />
      {tab === 'overview' && <Overview />}
      {tab === 'strength' && <StrengthTab />}
      {tab === 'weight' && <WeightTab />}
      {tab === 'exercises' && <ExercisesTab />}
    </div>
  );
}

function Trend({ value, unit, good = 'up' }: { value: number; unit: string; good?: 'up' | 'down' | 'none' }) {
  if (value === 0) return <span className="text-ink-3">no change</span>;
  const up = value > 0;
  const positive = good === 'none' ? null : good === 'up' ? up : !up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cx('inline-flex items-center gap-1 font-semibold', positive === null ? 'text-ink-2' : positive ? 'text-up' : 'text-down')}>
      <Icon className="size-4" aria-hidden />
      {up ? '+' : ''}
      {value}
      {unit}
    </span>
  );
}

function Overview() {
  const settings = useSettings();
  const program = useProgram();
  const workouts = useWorkouts();
  const cardio = useCardio();
  const bodyweight = useBodyweight();
  const now = Date.now();
  const report = useMemo(() => progressReport({ settings, program, workouts, cardio, bodyweight, now }), [settings, program, workouts, cardio, bodyweight, now]);
  const u = settings.units;
  const weekStart = startOfWeek(now);
  const sets = useMemo(() => muscleSets(workouts, weekStart, weekStart + 7 * DAY_MS), [workouts, weekStart]);
  const missing = missingStats(report.stats);

  if (report.workouts === 0)
    return (
      <Card>
        <EmptyState icon={<BarChart3 className="size-7" aria-hidden />} title="No progress to show yet" action={<Link to="/workout"><Button variant="primary">Start a workout</Button></Link>}>
          Finish a workout and your strength, weight, and calorie trends will appear here, along with a coach review.
        </EmptyState>
      </Card>
    );

  return (
    <div className="space-y-6">
      <Card className="grid grid-cols-2 gap-x-4 gap-y-5 p-5 sm:grid-cols-4">
        <Stat label="Workouts" value={report.workouts} sub={`over ${report.weeks} week${report.weeks === 1 ? '' : 's'}`} />
        <Stat label="Per week" value={report.avgPerWeek} sub={`${Math.round(report.consistency * 100)}% of your ${settings.schedule}-day plan`} />
        <Stat label="PRs" value={report.prs} sub="personal records" />
        <Stat label="Volume" value={formatCompact(report.totalVolume)} sub={`${u} lifted`} />
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/progress?tab=strength" className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-ink-3">
            <Dumbbell className="size-4" aria-hidden /> Strength
          </div>
          {report.strength ? (
            <>
              <p className="tnum mt-2 text-2xl font-bold">
                {formatNumber(report.strength.latest)} <span className="text-[14px] font-medium text-ink-3">{u} score</span>
              </p>
              <p className="mt-1 text-[14px]">
                <Trend value={report.strength.changePct} unit="%" /> <span className="text-ink-3">since you started</span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-ink-3">Log your main lifts to see a strength score.</p>
          )}
        </Link>
        <Link to="/progress?tab=weight" className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-ink-3">
            <Scale className="size-4" aria-hidden /> Bodyweight
          </div>
          {report.weight.latest ? (
            <>
              <p className="tnum mt-2 text-2xl font-bold">
                {formatWeight(report.weight.latest.weight)} <span className="text-[14px] font-medium text-ink-3">{u}</span>
              </p>
              <p className="mt-1 text-[14px]">
                <Trend value={report.weight.change} unit={` ${u}`} good="none" /> <span className="text-ink-3">since {formatDate(report.weight.first!.date)}</span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-ink-3">Log a weekly weigh-in to track your weight.</p>
          )}
        </Link>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-ink-3">
          <Flame className="size-4 text-push" aria-hidden /> Calories burned (estimate)
        </div>
        {report.calories.total > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-4">
            <Stat label="Last 30 days" value={formatNumber(report.calories.last30)} sub="kcal" />
            <Stat label="All time" value={formatCompact(report.calories.total)} sub="kcal" />
            <Stat label="Per workout" value={report.calories.perWorkout ?? '-'} sub="kcal avg" />
          </div>
        ) : null}
        {missing.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-3">
            Add your {missing.join(', ')} in{' '}
            <Link to="/settings#profile" className="font-semibold text-accent hover:underline">
              Settings → Profile
            </Link>{' '}
            for {report.calories.total > 0 ? 'more accurate' : ''} calorie estimates.
          </p>
        )}
        {bmr(report.stats) !== null && (
          <p className="mt-3 text-[13px] text-ink-3">
            Resting burn about {formatNumber(bmr(report.stats)!)} kcal/day; a typical day with light activity about {formatNumber(dailyEstimate(report.stats)!)} kcal, plus your workouts.
          </p>
        )}
      </Card>

      {settings.aiEnabled && <ProgressReview />}

      <section>
        <SectionTitle>Sets per muscle this week</SectionTitle>
        <Card className="p-4">
          <MuscleVolume sets={sets} compact />
        </Card>
      </section>
    </div>
  );
}

interface ReviewRecord {
  at: number;
  text: string;
}

function ProgressReview() {
  const availability = useCoachAvailability();
  const req = useCoachRequest();
  const saved = useKv<ReviewRecord>('progressReview');
  const [text, setText] = useState('');
  const shown = text || saved?.text || '';

  const run = () =>
    req.run(async (signal) => {
      setText('');
      const context = await loadCoachContext();
      const full = await streamCoach({ task: 'progress', context, messages: [{ role: 'user', content: 'Review my overall progress. What should I keep doing, and what should I improve?' }] }, setText, signal);
      if (full) await setKv('progressReview', { at: Date.now(), text: full } satisfies ReviewRecord);
    });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft">
          <Bot className="size-4 text-accent" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Coach's progress review</h2>
          <p className="text-[12px] text-ink-3">{saved && !text ? `From ${formatDate(saved.at, { month: 'short', day: 'numeric' })}` : 'What to keep doing and what to improve'}</p>
        </div>
        {req.loading && <Spinner className="text-ink-3" />}
      </div>
      {availability.state === 'unavailable' ? (
        <CoachNotice compact message={availability.message} kind={availability.kind} />
      ) : (
        <>
          {shown && <RichText text={shown} />}
          {req.loading && !text && (
            <div className="flex items-center gap-2 text-[14px] text-ink-3">
              <TypingDots /> Looking at your progress
            </div>
          )}
          {req.error && <p className="mt-2 text-[13px] text-danger">{req.error}</p>}
          {!req.loading && (
            <Button size="sm" variant={shown ? 'outline' : 'primary'} className="mt-3" onClick={() => void run()} disabled={availability.state === 'checking'}>
              {shown ? <RefreshCw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              {shown ? 'Get a fresh review' : 'Review my progress'}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

function StrengthTab() {
  const settings = useSettings();
  const program = useProgram();
  const workouts = useWorkouts();
  const bodyweight = useBodyweight();
  const cardio = useCardio();
  const [range, setRange] = useState<RangeKey>('All');
  const u = settings.units;
  const lifts = useMemo(() => mainLiftKeys(program), [program]);
  const series = useMemo(() => strengthSeries(workouts, lifts.map((l) => l.key)), [workouts, lifts]);
  const report = useMemo(() => progressReport({ settings, program, workouts, cardio, bodyweight, now: Date.now() }), [settings, program, workouts, cardio, bodyweight]);
  const from = rangeStart(range, Date.now());
  const data = series.filter((p) => p.date >= from).map((p) => ({ date: p.date, value: p.score }));
  const bw = latestBodyweight(bodyweight);
  const latest = series[series.length - 1];

  if (!series.length)
    return (
      <Card>
        <EmptyState icon={<Dumbbell className="size-7" aria-hidden />} title="No strength data yet">
          Your strength score appears after you log {lifts.map((l) => l.name).join(', ') || 'your main lifts'}.
        </EmptyState>
      </Card>
    );

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Strength score" value={formatNumber(latest.score)} sub={`${u} · sum of best e1RMs`} />
          <Stat label="Per bodyweight" value={bw ? `${(latest.score / bw).toFixed(2)}x` : '-'} sub={bw ? 'score ÷ bodyweight' : 'log your weight'} />
        </div>
        <p className="text-[13px] text-ink-3">
          Adds up your best estimated 1-rep max on each day's main lift: {lifts.map((l) => l.name).join(' + ')}.
        </p>
        <RangePicker value={range} onChange={setRange} />
        <ChartBlock title="Strength score by week">
          <TrendChart data={data} unit={u} label="Strength score by week" />
        </ChartBlock>
      </Card>

      <section>
        <SectionTitle>Every lift, first session → now</SectionTitle>
        <Card as="ul" className="divide-y divide-line">
          {report.lifts.map((l) => {
            const ex = program.find((p) => p.name.toLowerCase() === l.key);
            const row = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{l.name}</p>
                  <p className="tnum text-[13px] text-ink-3">
                    e1RM {l.first} → {l.latest} {u} · best {l.best} · {l.sessions} session{l.sessions === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="tnum text-[14px]">
                  <Trend value={l.changePct} unit="%" />
                </span>
              </>
            );
            return (
              <li key={l.key}>
                {ex ? (
                  <Link to={`/exercise/${ex.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    {row}
                    <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3">{row}</div>
                )}
              </li>
            );
          })}
        </Card>
      </section>
    </div>
  );
}


function WeightTab() {
  const settings = useSettings();
  const list = useBodyweight();
  const toast = useToast();
  const [range, setRange] = useState<RangeKey>('6M');
  const now = Date.now();
  const due = weighInDue(list, settings.weighInDay, now);
  const report = useMemo(() => ({ trend: progressReport({ settings, program: [], workouts: [], cardio: [], bodyweight: list, now }).weight }), [settings, list, now]);
  const t = report.trend;
  const from = rangeStart(range, now);
  const weekly = weeklyWeights(list).filter((p) => p.date >= from);
  const u = settings.units;

  return (
    <div className="space-y-6">
      <Card className={cx('space-y-3 p-4', due && 'border-accent/40')}>
        <div className="flex items-center gap-2">
          <Scale className="size-5 text-accent" aria-hidden />
          <h2 className="text-[15px] font-semibold">{due ? 'Time for your weekly weigh-in' : 'Weekly weigh-in done ✓'}</h2>
        </div>
        <p className="text-[13px] text-ink-3">Weigh yourself once a week on {WEEKDAYS[settings.weighInDay]}, same time of day (ideally in the morning before eating).</p>
        <WeighInForm />
      </Card>

      {t.latest ? (
        <>
          <Card className="grid grid-cols-3 gap-4 p-4">
            <Stat label="Now" value={formatWeight(t.latest.weight)} sub={u} />
            <Stat label="Change" value={`${t.change > 0 ? '+' : ''}${t.change}`} sub={`${u} since ${formatDate(t.first!.date)}`} />
            <Stat label="Per week" value={t.weeklyRate === null ? '-' : `${t.weeklyRate > 0 ? '+' : ''}${t.weeklyRate}`} sub={t.weeklyRate === null ? 'needs 2+ weeks' : `${u}/week (last 4 wks)`} />
          </Card>
          <Card className="space-y-4 p-4">
            <RangePicker value={range} onChange={setRange} />
            <ChartBlock title="Weight by week" sub="Last weigh-in of each week">
              <TrendChart data={weekly} unit={u} label="Bodyweight by week" height={180} />
            </ChartBlock>
          </Card>
          <section>
            <SectionTitle>Weigh-ins</SectionTitle>
            <Card as="ul" className="divide-y divide-line">
              {[...list]
                .reverse()
                .slice(0, 12)
                .map((b) => (
                  <li key={b.id} className="flex items-center justify-between px-4 py-2 text-[14px]">
                    <span className="text-ink-2">{formatDate(b.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span className="flex items-center gap-1">
                      <span className="tnum font-semibold">
                        {formatWeight(b.weight)} {u}
                      </span>
                      <IconButton label="Delete weigh-in" onClick={() => void deleteBodyweight(b.id)} className="size-8">
                        <Trash2 className="size-3.5" aria-hidden />
                      </IconButton>
                    </span>
                  </li>
                ))}
            </Card>
          </section>
        </>
      ) : (
        <p className="px-1 text-[14px] text-ink-3">Your first weigh-in starts the chart.</p>
      )}

      <section>
        <SectionTitle>Reminder</SectionTitle>
        <Card className="space-y-3 px-4 py-2">
          <Toggle
            label="Remind me every week"
            description="Shows a reminder on Home when it's time to weigh in"
            checked={settings.weighInReminders}
            onChange={(weighInReminders) => void updateSettings({ weighInReminders })}
          />
          <div className="pb-2">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Weigh-in day</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={settings.weighInDay === i}
                  onClick={() => void updateSettings({ weighInDay: i })}
                  className={cx('h-9 min-w-11 rounded-lg px-2.5 text-[13px] font-semibold', settings.weighInDay === i ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2')}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="pb-3">
            <Button
              size="sm"
              onClick={() => {
                void saveTextFile('liftlog-weekly-weigh-in.ics', weighInIcs(settings.weighInDay, appUrl()), 'text/calendar')
                  .then(() => !isNativeApp && toast('Open the downloaded file to add the reminder to your calendar', 'info'))
                  .catch(() => {});
              }}
            >
              <CalendarPlus className="size-4" aria-hidden /> Add a weekly phone reminder
            </Button>
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-ink-3">
              <Bell className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Adds a repeating {WEEKDAYS[settings.weighInDay]} 8:00 AM event to your calendar app, so your phone notifies you even when LiftLog is closed.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}

function ExercisesTab() {
  const settings = useSettings();
  const workouts = useWorkouts();
  const program = useProgram();
  const done = useMemo(() => completedWorkouts(workouts), [workouts]);
  const u = settings.units;

  const options = useMemo(() => {
    const seen = new Map<string, { key: string; name: string; id?: string }>();
    for (const e of program) seen.set(e.name.toLowerCase(), { key: e.name.toLowerCase(), name: e.name, id: e.id });
    for (const w of done) for (const ex of w.exercises) if (!seen.has(ex.key)) seen.set(ex.key, { key: ex.key, name: ex.name });
    return [...seen.values()].filter((o) => exerciseHistory(done, o.key).length > 0);
  }, [program, done]);

  const [key, setKey] = useState<string | undefined>();
  const selected = options.find((o) => o.key === key) ?? options[0];
  const history = useMemo(() => (selected ? exerciseHistory(done, selected.key) : []), [selected, done]);
  const pr = useMemo(() => personalRecords(history), [history]);
  const weekStart = startOfWeek(Date.now());
  const [suggestOpen, setSuggestOpen] = useState(false);
  const lowMuscles = MUSCLE_GROUPS.filter((m) => (muscleSets(workouts, weekStart, weekStart + 7 * DAY_MS)[m] ?? 0) < 10 && !['forearms', 'core'].includes(m));

  const allPRs = useMemo(
    () =>
      options
        .map((o) => ({ o, pr: personalRecords(exerciseHistory(done, o.key)) }))
        .filter((x) => x.pr.heaviest)
        .sort((a, b) => (b.pr.best1RM?.value ?? 0) - (a.pr.best1RM?.value ?? 0)),
    [options, done],
  );

  if (!selected)
    return (
      <Card>
        <EmptyState icon={<BarChart3 className="size-7" aria-hidden />} title="No exercises logged yet">
          Finish a workout to see charts for every exercise.
        </EmptyState>
      </Card>
    );

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-4">
        <div>
          <label htmlFor="exercise-pick" className="mb-1.5 block text-[13px] font-medium text-ink-2">
            Exercise
          </label>
          <select
            id="exercise-pick"
            value={selected.key}
            onChange={(e) => setKey(e.target.value)}
            className="h-12 w-full appearance-none rounded-xl border border-line bg-surface-2 bg-[length:16px] bg-[right_14px_center] bg-no-repeat px-3.5 pr-10 text-[15px] font-medium text-ink outline-none focus:border-accent/60"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23767d88' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-2 p-4 sm:grid-cols-4">
          <Stat label="Heaviest" value={pr.heaviest ? formatWeight(pr.heaviest.weight) : '-'} sub={pr.heaviest ? `${u} x ${pr.heaviest.reps}` : undefined} />
          <Stat label="Best e1RM" value={pr.best1RM ? formatNumber(pr.best1RM.value) : '-'} sub={pr.best1RM ? `${formatWeight(pr.best1RM.weight)} x ${pr.best1RM.reps}` : undefined} />
          <Stat label="Best volume" value={pr.bestVolume ? formatNumber(pr.bestVolume.value) : '-'} sub={pr.bestVolume ? formatDate(pr.bestVolume.date) : undefined} />
          <Stat label="Sessions" value={history.length} />
        </div>
        <ExerciseCharts history={history} units={u} />
        {selected.id && (
          <Link to={`/exercise/${selected.id}`} className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-[14px] font-medium hover:bg-surface-3">
            Full set-by-set log, form cues, and records
            <ChevronRight className="size-4 text-ink-3" aria-hidden />
          </Link>
        )}
      </Card>

      {settings.aiEnabled && lowMuscles.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => setSuggestOpen(true)}>
          <Sparkles className="size-4 text-accent" aria-hidden /> Ask coach how to fill muscle gaps
        </Button>
      )}

      <section>
        <SectionTitle>Personal records</SectionTitle>
        <Card as="ul" className="divide-y divide-line">
          {allPRs.map(({ o, pr: p }) => (
            <li key={o.key} className="flex items-center gap-3 px-4 py-3">
              <Trophy className="size-4 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{o.name}</span>
              <span className="tnum text-right text-[13px] text-ink-2">
                {formatWeight(p.heaviest!.weight)} x {p.heaviest!.reps}
                <span className="block text-[11px] text-ink-3">e1RM {formatNumber(p.best1RM?.value ?? 0)}</span>
              </span>
            </li>
          ))}
        </Card>
      </section>

      <Sheet open={suggestOpen} onClose={() => setSuggestOpen(false)} title="Fill the gaps" wide>
        <CoachSuggestions program={program} initialPrompt={`These muscle groups are under 10 sets this week: ${lowMuscles.join(', ')}. Suggest additions or swaps to fix that without making sessions much longer.`} />
      </Sheet>
    </div>
  );
}
