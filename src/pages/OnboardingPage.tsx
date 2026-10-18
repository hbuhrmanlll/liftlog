import { ArrowLeft, ArrowRight, Check, Dumbbell, Flame, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { LogoMark } from '../components/Logo';
import { Button, Card, cx, DayBadge, Segmented } from '../components/ui';
import { changeUnits, updateExercise, updateSettings } from '../db/repo';
import { useProgram, useSettings } from '../hooks/useData';
import { roundToLoadable } from '../lib/rounding';
import { DAY_DESCRIPTION } from '../lib/schedule';
import { DAY_TYPES, type Goal, type Schedule, type Units } from '../types';

const GOALS: { value: Goal; title: string; body: string; Icon: typeof Flame }[] = [
  { value: 'muscle', title: 'Build Muscle', body: 'Moderate reps (6-15). The classic PPL.', Icon: Flame },
  { value: 'strength', title: 'Get Stronger', body: 'Heavier main lifts: 5 sets of 3-6.', Icon: TrendingUp },
  { value: 'both', title: 'Both', body: 'Main lifts 4 x 5-8, the rest for size.', Icon: Target },
];

export function OnboardingPage() {
  const settings = useSettings();
  const program = useProgram();
  const [step, setStep] = useState(0);
  const [weights, setWeights] = useState<Record<string, string>>({});

  const finish = async (saveWeights: boolean) => {
    if (saveWeights) {
      for (const ex of program) {
        const raw = weights[ex.id];
        const n = raw ? Number(raw.replace(',', '.')) : NaN;
        if (Number.isFinite(n) && n > 0) await updateExercise(ex.id, { startWeight: roundToLoadable(n, ex.equipment, settings) });
      }
    }
    // App redirects to Home as soon as the saved setting is observed.
    await updateSettings({ onboarded: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-9" />
          <span className="text-lg font-bold tracking-tight">LiftLog</span>
        </div>
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 2`}>
          {[0, 1].map((i) => (
            <span key={i} className={cx('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-accent' : 'w-1.5 bg-surface-3')} />
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="animate-fade-up flex flex-1 flex-col">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight">Let's set up your Push / Pull / Legs.</h1>
          <p className="mt-2 text-[15px] text-ink-2">Three quick choices. You can change any of them later in Settings.</p>

          <div className="mt-8 space-y-6">
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink-2">Units</h2>
              <Segmented<Units>
                label="Units"
                value={settings.units}
                onChange={(u) => void changeUnits(u)}
                options={[
                  { value: 'lb', label: 'Pounds (lb)' },
                  { value: 'kg', label: 'Kilograms (kg)' },
                ]}
              />
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink-2">How often do you want to train?</h2>
              <div className="grid grid-cols-2 gap-3">
                {([3, 6] as Schedule[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={settings.schedule === s}
                    onClick={() => void updateSettings({ schedule: s })}
                    className={cx('rounded-2xl border p-4 text-left transition-colors', settings.schedule === s ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2')}
                  >
                    <div className="text-2xl font-bold">{s} days</div>
                    <div className="mt-0.5 text-[13px] text-ink-2">{s === 3 ? 'P / P / L once a week' : 'P / P / L twice a week'}</div>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink-2">Main goal</h2>
              <div className="space-y-2">
                {GOALS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    aria-pressed={settings.goal === g.value}
                    onClick={() => void updateSettings({ goal: g.value })}
                    className={cx('flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors', settings.goal === g.value ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2')}
                  >
                    <g.Icon className={cx('size-5 shrink-0', settings.goal === g.value ? 'text-accent' : 'text-ink-3')} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{g.title}</div>
                      <div className="text-[13px] text-ink-2">{g.body}</div>
                    </div>
                    {settings.goal === g.value && <Check className="size-5 text-accent" aria-hidden />}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-auto pt-8">
            <Button variant="primary" size="xl" className="w-full" onClick={() => setStep(1)}>
              Continue <ArrowRight className="size-5" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="animate-fade-up flex flex-1 flex-col">
          <button type="button" onClick={() => setStep(0)} className="mb-3 inline-flex items-center gap-1 self-start text-sm font-medium text-ink-2 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Starting weights</h1>
          <p className="mt-2 text-[15px] text-ink-2">
            Pick a weight you could lift for the top of the rep range with <strong className="text-ink">2-3 reps left</strong>. Not sure? Skip it and enter weights during your first workout.
          </p>

          <div className="mt-6 space-y-5">
            {DAY_TYPES.map((day) => (
              <Card key={day} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <DayBadge day={day} />
                  <span className="text-xs text-ink-3">{DAY_DESCRIPTION[day]}</span>
                </div>
                <ul className="divide-y divide-line">
                  {program
                    .filter((e) => e.day === day)
                    .map((ex) => (
                      <li key={ex.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <label htmlFor={`sw-${ex.id}`} className="block truncate text-[15px] font-medium">
                            {ex.name}
                          </label>
                          <span className="text-xs text-ink-3">
                            {ex.sets} x {ex.repMin}-{ex.repMax}
                            {ex.equipment === 'dumbbell' ? ' · per dumbbell' : ''}
                          </span>
                        </div>
                        {ex.equipment === 'bodyweight' ? (
                          <span className="flex h-11 w-28 items-center justify-center text-sm text-ink-3">Bodyweight</span>
                        ) : (
                          <div className="flex h-11 w-28 items-center rounded-xl border border-line bg-surface-2 pr-3 focus-within:border-accent/60">
                            <input
                              id={`sw-${ex.id}`}
                              inputMode="decimal"
                              placeholder="-"
                              value={weights[ex.id] ?? ''}
                              onChange={(e) => setWeights((w) => ({ ...w, [ex.id]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                              className="tnum h-full w-full min-w-0 bg-transparent text-right text-base font-semibold outline-none placeholder:text-ink-3"
                            />
                            <span className="ml-1.5 text-sm text-ink-3">{settings.units}</span>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              </Card>
            ))}
          </div>

          <div className="sticky bottom-0 mt-6 flex flex-col gap-2 bg-gradient-to-t from-bg via-bg to-transparent pb-[env(safe-area-inset-bottom)] pt-6">
            <Button variant="primary" size="xl" className="w-full" onClick={() => void finish(true)}>
              <Dumbbell className="size-5" aria-hidden /> Save and start lifting
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => void finish(false)}>
              Skip - I'll enter weights during my first workout
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
