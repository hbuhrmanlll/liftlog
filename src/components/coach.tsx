import { Bot, Check, CloudOff, MessageCircleQuestion, Plus, RefreshCw, Replace, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { findLibraryExercise } from '../data/exerciseLibrary';
import { addExerciseToDay, clearOverride, replaceExercise, setKv, setOverride } from '../db/repo';
import { useToast } from '../hooks/toast';
import { loadCoachContext, useCoachAvailability, useCoachRequest } from '../hooks/useCoach';
import { requestCoachJson, streamCoach } from '../lib/coachClient';
import { parseOpinion, parseSuggestions, reconcileOpinion, type CoachSuggestion, type ReconciledOpinion } from '../lib/coachSchemas';
import { formatLoad, type Recommendation } from '../lib/progression';
import type { LoadProfile } from '../lib/rounding';
import { DAY_LABEL } from '../lib/schedule';
import type { Exercise, LibraryExercise, Settings, WeightOverride } from '../types';
import { RichText } from './RichText';
import { Button, Card, ConfirmDialog, cx, DayBadge, RecBadge, Spinner, TypingDots } from './ui';

export function CoachNotice({ message, kind, compact }: { message: string; kind: string; compact?: boolean }) {
  const offline = kind === 'offline' || kind === 'unreachable';
  return (
    <div className={cx('flex items-start gap-3 rounded-xl bg-surface-2 text-[14px] text-ink-2', compact ? 'p-3' : 'p-4')}>
      {offline ? <CloudOff className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden /> : <Bot className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p>{message}</p>
        {(kind === 'not_configured' || kind === 'disabled') && (
          <Link to="/settings#ai-coach" className="mt-1.5 inline-flex items-center gap-1 font-semibold text-accent hover:underline">
            <SettingsIcon className="size-3.5" aria-hidden /> Set up AI Coach in Settings
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------- Weight second opinion ----------

export interface OpinionSubject {
  name: string;
  key: string;
  profile: LoadProfile;
  repMin: number;
  repMax: number;
  sets: number;
  lastWeight: number | null;
}

export function AskCoachOpinion({ subject, engine, settings, override, quiet }: { subject: OpinionSubject; engine: Recommendation; settings: Settings; override?: WeightOverride; quiet?: boolean }) {
  const availability = useCoachAvailability();
  const req = useCoachRequest();
  const toast = useToast();
  const [result, setResult] = useState<ReconciledOpinion | null>(null);
  const fmt = (w: number) => formatLoad(w, subject.profile.equipment, settings);

  if (availability.state === 'unavailable') return quiet ? null : <CoachNotice compact message={availability.message} kind={availability.kind} />;

  const ask = () =>
    req.run(async (signal) => {
      const context = await loadCoachContext();
      const engineLine = engine.weight === null ? `no weight yet (${engine.reason})` : `${engine.action.toUpperCase()} to ${fmt(engine.weight)}. Reason: ${engine.reason}`;
      const text = await requestCoachJson(
        {
          task: 'opinion',
          context,
          messages: [
            {
              role: 'user',
              content: `Exercise: ${subject.name} (${subject.profile.equipment}, ${subject.profile.category}${subject.profile.lowerBody ? ', lower body' : ''}). Target: ${subject.sets} sets of ${subject.repMin}-${subject.repMax}. Last working weight: ${subject.lastWeight === null ? 'none' : fmt(subject.lastWeight)}. Engine recommendation for next session: ${engineLine}. Give your second opinion.`,
            },
          ],
        },
        signal,
      );
      const parsed = parseOpinion(text);
      if (!parsed.ok) throw new Error(parsed.error);
      setResult(reconcileOpinion(parsed.data, engine, subject.lastWeight, subject.profile, settings));
    });

  const pick = async (source: 'engine' | 'coach') => {
    if (!result) return;
    if (source === 'engine') {
      await clearOverride(subject.key);
      toast(`Keeping the engine's ${engine.weight !== null ? fmt(engine.weight) : 'plan'}`);
    } else {
      await setOverride({ key: subject.key, weight: result.weight, action: result.action, reason: result.reason, source: 'coach' });
      toast(`Next ${subject.name}: ${fmt(result.weight)} (coach pick)`);
    }
  };

  return (
    <div className="space-y-3">
      {!result && (
        <Button size="sm" variant="outline" onClick={() => void ask()} disabled={req.loading || availability.state === 'checking'}>
          {req.loading ? <Spinner /> : <MessageCircleQuestion className="size-4 text-accent" aria-hidden />}
          {req.loading ? 'Asking coach...' : 'Ask Coach'}
        </Button>
      )}
      {req.error && <p className="text-[13px] text-danger">{req.error}</p>}
      {result && (
        <div className="animate-fade-up rounded-xl border border-line bg-surface-2 p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <Bot className="size-4 text-accent" aria-hidden />
            <span className="text-[13px] font-semibold text-ink">Coach's second opinion</span>
            <RecBadge action={result.action} className="ml-auto" />
          </div>
          <p className="text-[14px] leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">{fmt(result.weight)}</span> - {result.reason}
          </p>
          {result.adjustment && <p className="mt-1.5 text-[12px] text-ink-3">{result.adjustment}</p>}
          {result.agrees ? (
            <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-medium text-up">
              <Check className="size-4" aria-hidden /> Agrees with the engine. No change needed.
            </p>
          ) : (
            <div className="mt-3">
              <p className="mb-2 text-[13px] text-ink-2">The coach and the engine disagree. Which do you want for next session?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant={override?.source === 'coach' ? 'outline' : 'secondary'} onClick={() => void pick('engine')}>
                  Engine: {engine.weight !== null ? fmt(engine.weight) : 'pick'}
                </Button>
                <Button size="sm" variant={override?.source === 'coach' ? 'primary' : 'secondary'} onClick={() => void pick('coach')}>
                  Coach: {fmt(result.weight)}
                </Button>
              </div>
            </div>
          )}
          <button type="button" onClick={() => void ask()} className="mt-2 inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
            <RefreshCw className="size-3" aria-hidden /> Ask again
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Exercise suggestions ----------

function toLibrary(s: CoachSuggestion): LibraryExercise {
  const known = findLibraryExercise(s.name);
  return {
    name: known?.name ?? s.name,
    muscles: s.muscles,
    equipment: s.equipment,
    category: s.category,
    lowerBody: known?.lowerBody ?? s.muscles.some((m) => ['quads', 'hamstrings', 'glutes', 'calves'].includes(m)),
    sets: s.sets,
    repMin: s.repMin,
    repMax: s.repMax,
    restSec: s.restSec,
    cues: s.cues.length ? s.cues : (known?.cues ?? []),
    mistakes: known?.mistakes ?? [],
    alternate: known?.alternate ?? s.replaces ?? '',
  };
}

export function SuggestionList({ suggestions, program }: { suggestions: CoachSuggestion[]; program: Exercise[] }) {
  const toast = useToast();
  const [pending, setPending] = useState<CoachSuggestion | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const apply = async (s: CoachSuggestion) => {
    const lib = toLibrary(s);
    if (s.type === 'swap') {
      const target = program.find((e) => e.name === s.replaces);
      if (!target) return toast('That exercise is no longer in your program', 'error');
      await replaceExercise(target.id, lib);
      toast(`Swapped ${s.replaces} for ${lib.name}`);
    } else {
      await addExerciseToDay(s.day, lib);
      toast(`Added ${lib.name} to ${DAY_LABEL[s.day]}`);
    }
    setApplied((a) => new Set(a).add(s.name + s.replaces));
  };

  return (
    <>
      <ul className="space-y-3">
        {suggestions.map((s) => {
          const done = applied.has(s.name + s.replaces);
          return (
            <li key={s.name + s.replaces} className="animate-fade-up rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-ink">{s.name}</div>
                  <div className="mt-0.5 text-[13px] text-ink-3">
                    {s.sets} x {s.repMin}-{s.repMax} · rest {Math.round((s.restSec / 60) * 10) / 10} min · {s.equipment}
                  </div>
                </div>
                <DayBadge day={s.day} size="sm" />
              </div>
              {s.type === 'swap' && (
                <p className="mt-2 text-[13px] text-ink-2">
                  Replaces <span className="font-medium text-ink">{s.replaces}</span>
                </p>
              )}
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{s.why}</p>
              <Button size="sm" variant={done ? 'ghost' : 'primary'} className="mt-3" disabled={done} onClick={() => setPending(s)}>
                {done ? <Check className="size-4" aria-hidden /> : s.type === 'swap' ? <Replace className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                {done ? 'Done' : s.type === 'swap' ? 'Swap' : 'Add to program'}
              </Button>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        title={pending?.type === 'swap' ? 'Swap exercise?' : 'Add exercise?'}
        message={
          pending?.type === 'swap' ? (
            <>
              Replace <strong className="text-ink">{pending.replaces}</strong> with <strong className="text-ink">{pending.name}</strong> on {DAY_LABEL[pending.day]} day? Your history for {pending.replaces} is kept.
            </>
          ) : (
            <>
              Add <strong className="text-ink">{pending?.name}</strong> ({pending?.sets} x {pending?.repMin}-{pending?.repMax}) to the end of {pending ? DAY_LABEL[pending.day] : ''} day?
            </>
          )
        }
        confirmLabel={pending?.type === 'swap' ? 'Swap' : 'Add'}
        onConfirm={() => (pending ? apply(pending) : undefined)}
        onClose={() => setPending(null)}
      />
    </>
  );
}

/** Ask the coach for swaps/additions. `prompt` pre-fills the reason. */
export function CoachSuggestions({ program, initialPrompt, autoRun }: { program: Exercise[]; initialPrompt?: string; autoRun?: boolean }) {
  const availability = useCoachAvailability();
  const req = useCoachRequest();
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [data, setData] = useState<{ summary: string; suggestions: CoachSuggestion[] } | null>(null);
  const [ran, setRan] = useState(false);

  const run = (text: string) =>
    req.run(async (signal) => {
      const context = await loadCoachContext();
      const raw = await requestCoachJson({ task: 'suggest', context, messages: [{ role: 'user', content: text.trim() || 'Suggest swaps or additions based on my stalls and any muscle groups under 10 sets per week.' }] }, signal);
      const parsed = parseSuggestions(raw, program);
      if (!parsed.ok) throw new Error(parsed.error);
      setData(parsed.data);
    });

  useEffect(() => {
    if (autoRun && !ran && availability.state === 'ready') {
      setRan(true);
      void run(prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, ran, availability.state]);

  if (availability.state === 'unavailable') return <CoachNotice message={availability.message} kind={availability.kind} />;

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(prompt);
        }}
        className="space-y-3"
      >
        <label htmlFor="suggest-prompt" className="block text-[13px] font-medium text-ink-2">
          What's going on? (optional)
        </label>
        <textarea
          id="suggest-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder={'e.g. "My shoulder hurts on overhead press" or "I only have dumbbells today"'}
          className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-accent/60"
        />
        <Button type="submit" variant="primary" disabled={req.loading || availability.state === 'checking'}>
          {req.loading ? <Spinner /> : <Sparkles className="size-4" aria-hidden />}
          {req.loading ? 'Thinking...' : 'Get suggestions'}
        </Button>
      </form>
      {req.loading && (
        <div className="flex items-center gap-2 text-[14px] text-ink-3">
          <TypingDots /> Coach is reviewing your program
        </div>
      )}
      {req.error && <p className="text-[14px] text-danger">{req.error}</p>}
      {data && (
        <div className="space-y-3">
          {data.summary && <RichText text={data.summary} />}
          {data.suggestions.length > 0 ? <SuggestionList suggestions={data.suggestions} program={program} /> : <p className="text-[14px] text-ink-3">No exercise changes suggested.</p>}
        </div>
      )}
    </div>
  );
}

// ---------- Weekly check-in ----------

export interface CheckinRecord {
  at: number;
  text: string;
}

export function WeeklyCheckin({ last }: { last?: CheckinRecord }) {
  const availability = useCoachAvailability();
  const req = useCoachRequest();
  const [text, setText] = useState('');
  const due = !last || Date.now() - last.at > 7 * 86_400_000;
  const shown = text || (!due && last ? last.text : '');

  const run = () =>
    req.run(async (signal) => {
      const context = await loadCoachContext();
      const full = await streamCoach({ task: 'checkin', context, messages: [{ role: 'user', content: 'Give me my weekly check-in for the past 7 days.' }] }, setText, signal);
      await setKv('checkin', { at: Date.now(), text: full } satisfies CheckinRecord);
    });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft">
          <Bot className="size-4 text-accent" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">Weekly check-in</h3>
          <p className="text-[12px] text-ink-3">{due ? 'A coach review of your last 7 days' : `From ${new Date(last!.at).toLocaleDateString('en-US', { weekday: 'long' })}`}</p>
        </div>
      </div>
      {availability.state === 'unavailable' ? (
        <CoachNotice compact message={availability.message} kind={availability.kind} />
      ) : (
        <>
          {shown && <RichText text={shown} />}
          {req.loading && !text && (
            <div className="flex items-center gap-2 text-[14px] text-ink-3">
              <TypingDots /> Reviewing your week
            </div>
          )}
          {req.error && <p className="text-[13px] text-danger">{req.error}</p>}
          {due && !req.loading && !text && (
            <Button variant="primary" size="sm" onClick={() => void run()} disabled={availability.state === 'checking'}>
              <Sparkles className="size-4" aria-hidden /> Get my review
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
