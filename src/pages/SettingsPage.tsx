import { Bot, CheckCircle2, ChevronRight, Download, FileSpreadsheet, ListChecks, Moon, RefreshCw, Sun, Trash2, Upload, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ProfileSettings } from '../components/ProfileSettings';
import { Button, Card, ConfirmDialog, cx, PageHeader, Segmented, Spinner, Stepper, TextField, Toggle } from '../components/ui';
import { db } from '../db/db';
import { changeUnits, exportAll, getProgram, importAll, resetAll, updateExercise, updateSettings } from '../db/repo';
import { useToast } from '../hooks/toast';
import { useCoachAvailability } from '../hooks/useCoach';
import { useSettings } from '../hooks/useData';
import { parseBackup, workoutsToCsv, type BackupFile } from '../lib/backup';
import { getAccessCode, setAccessCode } from '../lib/coachClient';
import { clearCrash, lastCrash } from '../lib/crashLog';
import { LOAD_DEFAULTS } from '../lib/defaults';
import { formatClock } from '../lib/format';
import type { Goal, Schedule, Units } from '../types';

const ALL_PLATES: Record<Units, number[]> = { lb: [55, 45, 35, 25, 10, 5, 2.5, 1.25], kg: [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5] };

function Group({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wider text-ink-3">{title}</h2>
      <Card className="divide-y divide-line px-4">{children}</Card>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="py-3.5">
      <div className="mb-2">
        <div className="text-[15px] font-medium text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-ink-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage() {
  const s = useSettings();
  const toast = useToast();
  const location = useLocation();
  const coach = useCoachAvailability();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingUnits, setPendingUnits] = useState<Units | null>(null);
  const [pendingImport, setPendingImport] = useState<{ backup: BackupFile; summary: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [restChanged, setRestChanged] = useState(false);
  const [code, setCode] = useState(getAccessCode);
  const [crash, setCrash] = useState(lastCrash);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [location.hash]);

  const exportJson = async () => {
    const backup = await exportAll();
    download(`liftlog-backup-${today}.json`, JSON.stringify(backup, null, 2), 'application/json');
    toast('Backup downloaded');
  };

  const exportCsv = async () => {
    const [workouts, cardio] = await Promise.all([db.workouts.toArray(), db.cardio.toArray()]);
    download(`liftlog-history-${today}.csv`, workoutsToCsv(workouts, cardio, s.units), 'text/csv');
    toast('CSV downloaded');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const result = parseBackup(await file.text());
    if (fileRef.current) fileRef.current.value = '';
    if (!result.ok) return toast(result.error, 'error');
    setPendingImport({ backup: result.backup, summary: result.summary });
  };

  const applyRestToProgram = async () => {
    const program = await getProgram();
    await Promise.all(program.map((e) => updateExercise(e.id, { restSec: e.category === 'compound' ? s.restCompoundSec : s.restIsolationSec })));
    setRestChanged(false);
    toast('Rest times applied to every exercise');
  };

  return (
    <div className="animate-fade-up space-y-7">
      <PageHeader title="Settings" />

      <ProfileSettings />

      <Group title="Appearance">
        <Row label="Theme">
          <Segmented
            label="Theme"
            value={s.theme}
            onChange={(theme) => void updateSettings({ theme })}
            options={[
              { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon className="size-4" aria-hidden />Dark</span> },
              { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun className="size-4" aria-hidden />Light</span> },
            ]}
          />
        </Row>
      </Group>

      <Group title="Training">
        <Row label="Units">
          <Segmented<Units>
            label="Units"
            value={s.units}
            onChange={(u) => u !== s.units && setPendingUnits(u)}
            options={[
              { value: 'lb', label: 'lb' },
              { value: 'kg', label: 'kg' },
            ]}
          />
        </Row>
        <Row label="Schedule" hint="Home always suggests the next day in the Push → Pull → Legs rotation.">
          <Segmented<Schedule>
            label="Schedule"
            value={s.schedule}
            onChange={(schedule) => void updateSettings({ schedule })}
            options={[
              { value: 3, label: '3 days / week' },
              { value: 6, label: '6 days / week' },
            ]}
          />
        </Row>
        <Row label="Goal" hint={s.goal === 'strength' ? 'Main lifts (first compound each day) use 5 x 3-6 with 3-5 min rest.' : s.goal === 'both' ? 'Main lifts use 4 x 5-8 with 3 min rest; everything else stays in muscle-building ranges.' : 'The classic program: 6-15 reps for size.'}>
          <Segmented<Goal>
            label="Goal"
            value={s.goal}
            onChange={(goal) => void updateSettings({ goal })}
            options={[
              { value: 'muscle', label: 'Build Muscle' },
              { value: 'strength', label: 'Get Stronger' },
              { value: 'both', label: 'Both' },
            ]}
          />
        </Row>
        <Link to="/program" className="flex items-center gap-3 py-3.5 text-[15px] font-medium hover:text-accent">
          <ListChecks className="size-5 text-ink-3" aria-hidden /> Edit program (exercises, sets, reps, rest)
          <ChevronRight className="ml-auto size-4 text-ink-3" aria-hidden />
        </Link>
      </Group>

      <Group title="Equipment">
        <Row label="Barbell weight">
          <Stepper label="Barbell weight" value={s.barbellWeight} onChange={(v) => v !== null && v > 0 && void updateSettings({ barbellWeight: v })} step={s.units === 'kg' ? 2.5 : 5} decimals className="max-w-48" />
        </Row>
        <Row label="Available plates" hint="Recommended weights are rounded to what you can load with these (in pairs).">
          <div className="flex flex-wrap gap-2">
            {ALL_PLATES[s.units].map((p) => {
              const on = s.plates.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const plates = on ? s.plates.filter((x) => x !== p) : [...s.plates, p].sort((a, b) => b - a);
                    if (plates.length === 0) return toast('Keep at least one plate size', 'error');
                    void updateSettings({ plates });
                  }}
                  className={cx('tnum h-10 min-w-14 rounded-xl px-3 text-[14px] font-semibold transition-colors', on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-3 hover:text-ink')}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </Row>
        <Row label="Dumbbell increment" hint="The jump between dumbbells at your gym (per dumbbell).">
          <Stepper label="Dumbbell increment" value={s.dumbbellIncrement} onChange={(v) => v !== null && v > 0 && void updateSettings({ dumbbellIncrement: v })} step={s.units === 'kg' ? 0.5 : 2.5} decimals className="max-w-48" />
        </Row>
        <Row label="Cable / machine increment" hint="One plate on the weight stack.">
          <Stepper label="Cable increment" value={s.cableIncrement} onChange={(v) => v !== null && v > 0 && void updateSettings({ cableIncrement: v })} step={s.units === 'kg' ? 0.5 : 2.5} decimals className="max-w-48" />
        </Row>
        <div className="py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void updateSettings(LOAD_DEFAULTS[s.units]);
              toast('Equipment reset to defaults');
            }}
          >
            Reset equipment to defaults
          </Button>
        </div>
      </Group>

      <Group title="Rest timer">
        <Row label="Default rest: compound lifts" hint={formatClock(s.restCompoundSec)}>
          <Stepper
            label="Compound rest seconds"
            value={s.restCompoundSec}
            onChange={(v) => {
              if (v === null) return;
              void updateSettings({ restCompoundSec: v });
              setRestChanged(true);
            }}
            step={15}
            min={15}
            className="max-w-48"
          />
        </Row>
        <Row label="Default rest: isolation lifts" hint={formatClock(s.restIsolationSec)}>
          <Stepper
            label="Isolation rest seconds"
            value={s.restIsolationSec}
            onChange={(v) => {
              if (v === null) return;
              void updateSettings({ restIsolationSec: v });
              setRestChanged(true);
            }}
            step={15}
            min={15}
            className="max-w-48"
          />
        </Row>
        {restChanged && (
          <div className="py-3">
            <Button size="sm" variant="primary" onClick={() => void applyRestToProgram()}>
              Apply these rest times to every exercise
            </Button>
          </div>
        )}
        <Toggle label="Sound when rest ends" checked={s.timerSound} onChange={(timerSound) => void updateSettings({ timerSound })} />
        <Toggle label="Vibrate when rest ends" description="On phones that support it" checked={s.timerVibrate} onChange={(timerVibrate) => void updateSettings({ timerVibrate })} />
        <Toggle
          label="Pre-fill sets with targets"
          description="Off: every set starts blank and you type in each one (targets show as hints)"
          checked={s.prefillSets}
          onChange={(prefillSets) => void updateSettings({ prefillSets })}
        />
        <Toggle label="Warm-up suggestions" description="Ramp-up sets for the first compound lift (not counted)" checked={s.warmupSuggestions} onChange={(warmupSuggestions) => void updateSettings({ warmupSuggestions })} />
        <Toggle label="Weekly weigh-in reminder" description="Reminder on Home; change the day in Progress → Weight" checked={s.weighInReminders} onChange={(weighInReminders) => void updateSettings({ weighInReminders })} />
        <Toggle label="Deload reminders" description="A nudge after 6-8 weeks of continuous training" checked={s.deloadReminders} onChange={(deloadReminders) => void updateSettings({ deloadReminders })} />
      </Group>

      <Group title="AI Coach" id="ai-coach">
        <Toggle label="AI Coach" description="Chat, second opinions, suggestions, and workout wrap-ups powered by Claude." checked={s.aiEnabled} onChange={(aiEnabled) => void updateSettings({ aiEnabled })} />
        {s.aiEnabled && (
          <div className="py-3.5">
            <div className="flex items-center gap-2 text-[14px]">
              {coach.state === 'checking' ? (
                <>
                  <Spinner className="text-ink-3" /> Checking connection...
                </>
              ) : coach.state === 'ready' ? (
                <>
                  <CheckCircle2 className="size-4 text-up" aria-hidden /> <span className="text-ink">Connected</span> <span className="text-ink-3">· {coach.model}</span>
                </>
              ) : (
                <>
                  <XCircle className="size-4 text-down" aria-hidden /> <span className="text-ink-2">{coach.message}</span>
                </>
              )}
              <button type="button" onClick={coach.refresh} className="ml-auto inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink" aria-label="Check AI Coach connection again">
                <RefreshCw className="size-3.5" aria-hidden /> Check
              </button>
            </div>
            <form
              className="mt-4 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setAccessCode(code);
                coach.refresh();
                toast(code.trim() ? 'Access code saved on this device' : 'Access code cleared');
              }}
            >
              <TextField
                className="flex-1"
                label="Access code (optional)"
                type="password"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                hint="Only needed if you set COACH_ACCESS_CODE on your server. Stored on this device only."
              />
              <Button type="submit" className="mb-[22px]">
                Save
              </Button>
            </form>
            {coach.state === 'unavailable' && coach.kind !== 'offline' && (
              <div className="mt-3 rounded-xl bg-surface-2 p-4 text-[13px] leading-relaxed text-ink-2">
                <p className="mb-2 flex items-center gap-2 font-semibold text-ink">
                  <Bot className="size-4 text-accent" aria-hidden /> How to set up the AI Coach
                </p>
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>
                    Get a <strong className="text-ink">free</strong> Google Gemini key at{' '}
                    <a className="font-medium text-accent hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                      aistudio.google.com/apikey
                    </a>{' '}
                    (no credit card). Or use a paid Claude key from{' '}
                    <a className="font-medium text-accent hover:underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
                      console.anthropic.com
                    </a>
                    .
                  </li>
                  <li>
                    <strong className="text-ink">On Netlify:</strong> Site configuration → Environment variables → add <code className="rounded bg-surface-3 px-1">GEMINI_API_KEY</code>, then Deploys → Trigger deploy.{' '}
                    <strong className="text-ink">On Vercel:</strong> Project → Settings → Environment Variables → same name, then redeploy.
                  </li>
                  <li>
                    <strong className="text-ink">Running on your computer:</strong> put <code className="rounded bg-surface-3 px-1">GEMINI_API_KEY=your-key</code> in a file named <code className="rounded bg-surface-3 px-1">.env.local</code> in the project folder, then restart <code className="rounded bg-surface-3 px-1">npm run dev</code>.
                  </li>
                  <li>
                    Recommended when deployed: also add <code className="rounded bg-surface-3 px-1">COACH_ACCESS_CODE</code> (any password) so only you can use your key, and enter the same code above.
                  </li>
                </ol>
                <p className="mt-2 text-ink-3">The key stays on the server and is never sent to your phone. Everything else in LiftLog works without it.</p>
              </div>
            )}
          </div>
        )}
      </Group>

      <Group title="Your data">
        <div className="space-y-2 py-3.5">
          <p className="mb-3 text-[13px] text-ink-3">This profile's data is stored only on this device. Export a backup regularly, especially before switching phones.</p>
          <Button className="w-full justify-start" onClick={() => void exportJson()}>
            <Download className="size-4" aria-hidden /> Export backup (JSON)
          </Button>
          <Button className="w-full justify-start" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" aria-hidden /> Import backup (JSON)
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Choose a backup file" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button className="w-full justify-start" onClick={() => void exportCsv()}>
            <FileSpreadsheet className="size-4" aria-hidden /> Export workout history (CSV)
          </Button>
        </div>
        <div className="py-3.5">
          <Button variant="danger" className="w-full justify-start" onClick={() => setConfirmReset(true)}>
            <Trash2 className="size-4" aria-hidden /> Reset all data
          </Button>
        </div>
      </Group>

      {crash && (
        <Group title="Diagnostics">
          <div className="py-3.5">
            <p className="mb-2 text-[13px] text-ink-3">Last error ({new Date(crash.at).toLocaleString()}). Copy it and send it to whoever helps you with the app.</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-3 text-[12px] text-ink-2 select-all">{crash.details}</pre>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void navigator.clipboard?.writeText(crash.details).then(() => toast('Copied'))}>
                Copy
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearCrash();
                  setCrash(null);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </Group>
      )}

      <p className="pb-4 text-center text-[12px] text-ink-3">LiftLog 1.0 · Data stays on your device</p>

      <ConfirmDialog
        open={pendingUnits !== null}
        title={`Switch to ${pendingUnits}?`}
        message={`All logged weights, starting weights, and bodyweight entries will be converted to ${pendingUnits} (rounded to the nearest 0.5). Plate and increment settings reset to ${pendingUnits} defaults.`}
        confirmLabel="Convert"
        onConfirm={async () => {
          if (pendingUnits) await changeUnits(pendingUnits);
          toast(`Switched to ${pendingUnits}`);
        }}
        onClose={() => setPendingUnits(null)}
      />
      <ConfirmDialog
        open={pendingImport !== null}
        title="Replace all data with this backup?"
        message={
          <>
            The backup contains {pendingImport?.summary} (exported {pendingImport ? new Date(pendingImport.backup.exportedAt).toLocaleString() : ''}).
            <br />
            <strong className="text-ink">Everything currently in LiftLog on this device will be overwritten.</strong>
          </>
        }
        confirmLabel="Replace my data"
        danger
        onConfirm={async () => {
          if (pendingImport) await importAll(pendingImport.backup);
          toast('Backup restored');
        }}
        onClose={() => setPendingImport(null)}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Reset all data?"
        message="This permanently deletes every workout, PR, cardio log, bodyweight entry, chat, and program change in this profile. Other profiles aren't affected. Export a backup first if you might want it back."
        confirmLabel="Delete everything"
        danger
        requireText="RESET"
        onConfirm={async () => {
          await resetAll();
          toast('All data reset', 'info');
        }}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
