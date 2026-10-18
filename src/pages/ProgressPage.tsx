import { BarChart3, ChevronRight, Scale, Sparkles, Trash2, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartBlock, ExerciseCharts, RangePicker, TrendChart } from '../components/charts';
import { CoachSuggestions } from '../components/coach';
import { MuscleVolume } from '../components/MuscleVolume';
import { Button, Card, EmptyState, IconButton, PageHeader, SectionTitle, Segmented, Sheet, Stat } from '../components/ui';
import { addBodyweight, deleteBodyweight } from '../db/repo';
import { useToast } from '../hooks/toast';
import { useBodyweight, useProgram, useSettings, useWorkouts } from '../hooks/useData';
import { completedWorkouts, DAY_MS, exerciseHistory, muscleSets, personalRecords, rangeStart, startOfWeek, type RangeKey } from '../lib/calculations';
import { formatDate, formatNumber, formatWeight } from '../lib/format';
import { MUSCLE_GROUPS } from '../types';

export function ProgressPage() {
  const settings = useSettings();
  const workouts = useWorkouts();
  const program = useProgram();
  const done = useMemo(() => completedWorkouts(workouts), [workouts]);
  const u = settings.units;

  // Exercises with history, program order first.
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

  const [week, setWeek] = useState<'this' | 'last'>('this');
  const weekStart = startOfWeek(Date.now()) - (week === 'last' ? 7 * DAY_MS : 0);
  const sets = useMemo(() => muscleSets(workouts, weekStart, weekStart + 7 * DAY_MS), [workouts, weekStart]);
  const lowMuscles = MUSCLE_GROUPS.filter((m) => (sets[m] ?? 0) < 10 && !['forearms', 'core'].includes(m));
  const [suggestOpen, setSuggestOpen] = useState(false);

  const allPRs = useMemo(
    () =>
      options
        .map((o) => ({ o, pr: personalRecords(exerciseHistory(done, o.key)) }))
        .filter((x) => x.pr.heaviest)
        .sort((a, b) => (b.pr.best1RM?.value ?? 0) - (a.pr.best1RM?.value ?? 0)),
    [options, done],
  );

  return (
    <div className="animate-fade-up space-y-7">
      <PageHeader title="Progress" subtitle="Charts, records, and weekly volume." />

      {done.length === 0 ? (
        <Card>
          <EmptyState icon={<BarChart3 className="size-7" aria-hidden />} title="No progress to show yet" action={<Link to="/workout"><Button variant="primary">Start a workout</Button></Link>}>
            Finish a workout and your charts, personal records, and weekly volume will appear here.
          </EmptyState>
        </Card>
      ) : (
        <>
          <section>
            <SectionTitle>Exercise progress</SectionTitle>
            <Card className="space-y-5 p-4">
              <div>
                <label htmlFor="exercise-pick" className="mb-1.5 block text-[13px] font-medium text-ink-2">
                  Exercise
                </label>
                <select
                  id="exercise-pick"
                  value={selected?.key}
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
              {selected && (
                <>
                  <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-2 p-4 sm:grid-cols-4">
                    <Stat label="Heaviest" value={pr.heaviest ? `${formatWeight(pr.heaviest.weight)}` : '-'} sub={pr.heaviest ? `${u} x ${pr.heaviest.reps}` : undefined} />
                    <Stat label="Best e1RM" value={pr.best1RM ? formatNumber(pr.best1RM.value) : '-'} sub={pr.best1RM ? `${formatWeight(pr.best1RM.weight)} x ${pr.best1RM.reps}` : undefined} />
                    <Stat label="Best volume" value={pr.bestVolume ? formatNumber(pr.bestVolume.value) : '-'} sub={pr.bestVolume ? formatDate(pr.bestVolume.date) : undefined} />
                    <Stat label="Sessions" value={history.length} />
                  </div>
                  <ExerciseCharts history={history} units={u} />
                  {selected.id && (
                    <Link to={`/exercise/${selected.id}`} className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3 text-[14px] font-medium hover:bg-surface-3">
                      Exercise details, form cues, and rep records
                      <ChevronRight className="size-4 text-ink-3" aria-hidden />
                    </Link>
                  )}
                </>
              )}
            </Card>
          </section>

          <section>
            <SectionTitle
              action={
                <Segmented
                  label="Week"
                  className="w-44"
                  value={week}
                  onChange={setWeek}
                  options={[
                    { value: 'this', label: 'This wk' },
                    { value: 'last', label: 'Last wk' },
                  ]}
                />
              }
            >
              Sets per muscle
            </SectionTitle>
            <Card className="p-4">
              <MuscleVolume sets={sets} />
              {settings.aiEnabled && lowMuscles.length > 0 && week === 'this' && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setSuggestOpen(true)}>
                  <Sparkles className="size-4 text-accent" aria-hidden /> Ask coach how to fill the gaps
                </Button>
              )}
            </Card>
          </section>

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
        </>
      )}

      <BodyweightSection />

      <Sheet open={suggestOpen} onClose={() => setSuggestOpen(false)} title="Fill the gaps" wide>
        <CoachSuggestions program={program} initialPrompt={`These muscle groups are under 10 sets this week: ${lowMuscles.join(', ')}. Suggest additions or swaps to fix that without making sessions much longer.`} />
      </Sheet>
    </div>
  );
}

function BodyweightSection() {
  const settings = useSettings();
  const list = useBodyweight();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [range, setRange] = useState<RangeKey>('3M');
  const from = rangeStart(range, Date.now());
  const data = list.filter((b) => b.date >= from).map((b) => ({ date: b.date, value: b.weight }));
  const n = Number(value.replace(',', '.'));
  const valid = Number.isFinite(n) && n > 20 && n < 700;

  return (
    <section>
      <SectionTitle>Bodyweight</SectionTitle>
      <Card className="space-y-4 p-4">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            await addBodyweight(Math.round(n * 10) / 10);
            setValue('');
            toast(`Logged ${Math.round(n * 10) / 10} ${settings.units}`);
          }}
        >
          <div className="flex h-12 flex-1 items-center rounded-xl border border-line bg-surface-2 pr-3.5 focus-within:border-accent/60">
            <Scale className="ml-3.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <input aria-label={`Bodyweight in ${settings.units}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="Today's bodyweight" className="tnum h-full w-full min-w-0 bg-transparent px-2.5 text-[15px] outline-none placeholder:text-ink-3" />
            <span className="text-[14px] text-ink-3">{settings.units}</span>
          </div>
          <Button type="submit" variant="primary" disabled={!valid}>
            Log
          </Button>
        </form>
        {list.length === 0 ? (
          <p className="text-[14px] text-ink-3">Optional: log your bodyweight now and then to see the trend. It also makes volume for pull-ups more accurate.</p>
        ) : (
          <>
            <RangePicker value={range} onChange={setRange} />
            <ChartBlock title="Bodyweight trend">
              <TrendChart data={data} unit={settings.units} label="Bodyweight over time" height={160} />
            </ChartBlock>
            <ul className="divide-y divide-line rounded-xl bg-surface-2">
              {[...list]
                .reverse()
                .slice(0, 5)
                .map((b) => (
                  <li key={b.id} className="flex items-center justify-between px-3 py-1.5 text-[14px]">
                    <span className="text-ink-2">{formatDate(b.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span className="flex items-center gap-1">
                      <span className="tnum font-semibold">
                        {formatWeight(b.weight)} {settings.units}
                      </span>
                      <IconButton label="Delete entry" onClick={() => void deleteBodyweight(b.id)} className="size-8">
                        <Trash2 className="size-3.5" aria-hidden />
                      </IconButton>
                    </span>
                  </li>
                ))}
            </ul>
          </>
        )}
      </Card>
    </section>
  );
}
