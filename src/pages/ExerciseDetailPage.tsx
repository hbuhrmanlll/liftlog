import { AlertTriangle, ArrowLeft, Link2, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ExerciseCharts } from '../components/charts';
import { SetLogTable } from '../components/SetLogTable';
import { AskCoachOpinion, CoachSuggestions } from '../components/coach';
import { CuesAndMistakes, VideoBlock } from '../components/ExerciseGuide';
import { Button, Card, DayBadge, EmptyState, PageHeader, RecBadge, SectionTitle, Sheet, Stat, TextField } from '../components/ui';
import { clearOverride, updateExercise } from '../db/repo';
import { useToast } from '../hooks/toast';
import { useOverrides, useProgram, useSettings, useWorkouts } from '../hooks/useData';
import { exerciseHistory, normalizeKey, personalRecords } from '../lib/calculations';
import { formatClock, formatNumber, formatWeight } from '../lib/format';
import { formatLoad } from '../lib/progression';
import { recommendationFor } from '../lib/session';
import { parseYouTubeId } from '../lib/youtube';

export function ExerciseDetailPage() {
  const { id } = useParams();
  const program = useProgram();
  const workouts = useWorkouts();
  const settings = useSettings();
  const overrides = useOverrides();
  const toast = useToast();
  const ex = program.find((e) => e.id === id);
  const [url, setUrl] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const key = ex ? normalizeKey(ex.name) : '';
  const history = useMemo(() => (ex ? exerciseHistory(workouts, key) : []), [workouts, key, ex]);
  const pr = useMemo(() => personalRecords(history), [history]);
  const rec = useMemo(() => (ex ? recommendationFor(ex, program, workouts, settings) : null), [ex, program, workouts, settings]);

  if (!ex || !rec) {
    return program.length === 0 ? (
      <div aria-busy="true" />
    ) : (
      <Card>
        <EmptyState icon={<AlertTriangle className="size-7" aria-hidden />} title="Exercise not found" action={<Link to="/program"><Button>Open Program</Button></Link>}>
          It may have been removed from your program.
        </EmptyState>
      </Card>
    );
  }

  const r = rec.recommendation;
  const override = overrides.find((o) => o.key === key);
  const urlValue = url ?? ex.videoUrl ?? '';
  const urlValid = urlValue.trim() === '' || parseYouTubeId(urlValue) !== null;
  const repRecords = Object.entries(pr.repsAtWeight)
    .map(([w, v]) => ({ weight: Number(w), ...v }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);
  const fmt = (w: number) => formatLoad(w, ex.equipment, settings);

  const saveUrl = async () => {
    const trimmed = urlValue.trim();
    if (trimmed && !parseYouTubeId(trimmed)) return;
    await updateExercise(ex.id, { videoUrl: trimmed || undefined });
    setUrl(null);
    toast(trimmed ? 'Video saved' : 'Video removed');
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        back={
          <Link to="/program" className="mb-2 inline-flex items-center gap-1 text-[14px] font-medium text-ink-2 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Program
          </Link>
        }
        title={ex.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <DayBadge day={ex.day} size="sm" />
            <span className="capitalize">{ex.equipment}</span>·<span className="capitalize">{ex.category}</span>
          </span>
        }
      />

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wider text-ink-3">Next session</p>
            <p className="tnum mt-1 text-2xl font-bold">{override ? fmt(override.weight) : r.weight !== null ? fmt(r.weight) : 'Pick a weight'}</p>
            <p className="tnum text-[13px] text-ink-3">
              {rec.targets.sets} x {rec.targets.repMin}-{rec.targets.repMax} · rest {formatClock(rec.targets.restSec)}
              {rec.targets.modified ? ' · strength targets' : ''}
            </p>
          </div>
          <RecBadge action={override ? override.action : r.action} />
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{r.reason}</p>
        {r.note && <p className="mt-1.5 text-[13px] text-down">{r.note}</p>}
        {override && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-2 text-[13px]">
            <span className="text-ink-2">
              Using the coach's pick ({fmt(override.weight)}) instead of the engine's {r.weight !== null ? fmt(r.weight) : 'plan'}.
            </span>
            <button type="button" className="shrink-0 font-semibold text-accent hover:underline" onClick={() => void clearOverride(key)}>
              Undo
            </button>
          </div>
        )}
        {settings.aiEnabled && (
          <div className="mt-4 flex flex-wrap gap-2">
            <AskCoachOpinion
              subject={{ name: ex.name, key, profile: ex, repMin: rec.targets.repMin, repMax: rec.targets.repMax, sets: rec.targets.sets, lastWeight: history[0] ? Math.max(...history[0].sets.map((s) => s.weight)) : null }}
              engine={r}
              settings={settings}
              override={override}
            />
            {r.stalled && (
              <Button size="sm" variant="outline" onClick={() => setSuggestOpen(true)}>
                <Sparkles className="size-4 text-accent" aria-hidden /> Suggest a swap
              </Button>
            )}
          </div>
        )}
      </Card>

      <section className="space-y-4">
        <SectionTitle>How to do it</SectionTitle>
        <VideoBlock name={ex.name} videoUrl={ex.videoUrl} />
        <Card className="p-4">
          <CuesAndMistakes cues={ex.cues} mistakes={ex.mistakes} />
          <div className="mt-5 flex flex-wrap gap-1.5">
            {ex.muscles.map((m, i) => (
              <span key={m} className={i === 0 ? 'rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-semibold capitalize text-accent' : 'rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium capitalize text-ink-2'}>
                {m}
                {i === 0 ? ' (primary)' : ''}
              </span>
            ))}
          </div>
          {ex.alternate && <p className="mt-3 text-[13px] text-ink-3">Alternate: {ex.alternate}</p>}
        </Card>
        <Card className="p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveUrl();
            }}
            className="space-y-3"
          >
            <TextField
              label="Your favorite YouTube video (optional)"
              placeholder="https://youtu.be/..."
              value={urlValue}
              inputMode="url"
              autoComplete="off"
              onChange={(e) => setUrl(e.target.value)}
              hint={urlValid ? 'Paste a youtube.com/watch, youtu.be, or /shorts/ link to show it embedded above.' : <span className="text-danger">That doesn't look like a YouTube video link.</span>}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" disabled={!urlValid || urlValue === (ex.videoUrl ?? '')}>
                <Link2 className="size-4" aria-hidden /> Save video
              </Button>
              {ex.videoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await updateExercise(ex.id, { videoUrl: undefined });
                    setUrl(null);
                    toast('Video removed', 'info');
                  }}
                >
                  <Trash2 className="size-4" aria-hidden /> Remove
                </Button>
              )}
            </div>
          </form>
        </Card>
      </section>

      <section>
        <SectionTitle>Your history</SectionTitle>
        {history.length === 0 ? (
          <Card className="p-4 text-[14px] text-ink-3">No sessions logged yet. Your charts and records will show up after your first workout with this exercise.</Card>
        ) : (
          <div className="space-y-4">
            <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              <Stat label="Heaviest" value={pr.heaviest ? formatWeight(pr.heaviest.weight) : '-'} sub={pr.heaviest ? `${settings.units} x ${pr.heaviest.reps}` : undefined} />
              <Stat label="Best e1RM" value={pr.best1RM ? formatNumber(pr.best1RM.value) : '-'} sub={settings.units} />
              <Stat label="Best volume" value={pr.bestVolume ? formatNumber(pr.bestVolume.value) : '-'} sub={settings.units} />
              <Stat label="Sessions" value={history.length} />
            </Card>
            <Card className="p-4">
              <ExerciseCharts history={history} units={settings.units} />
            </Card>
            {repRecords.length > 0 && (
              <Card className="p-4">
                <h3 className="mb-2 text-[15px] font-semibold">Most reps at each weight</h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {repRecords.map((x) => (
                    <li key={x.weight} className="tnum rounded-xl bg-surface-2 px-3 py-2 text-[14px]">
                      <span className="font-semibold">{x.reps} reps</span> <span className="text-ink-3">@ {formatWeight(x.weight)} {settings.units}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <SetLogTable history={history} units={settings.units} bodyweight={ex.equipment === 'bodyweight'} />
          </div>
        )}
      </section>

      <Sheet open={suggestOpen} onClose={() => setSuggestOpen(false)} title={`Alternatives to ${ex.name}`} wide>
        <CoachSuggestions program={program} initialPrompt={`${ex.name} has stalled (${r.reason}). Suggest a swap for it on ${ex.day} day.`} autoRun />
      </Sheet>
    </div>
  );
}
