import { Music, Play, Trash2, Upload, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { updateSettings } from '../db/repo';
import { useToast } from '../hooks/toast';
import { BUILT_IN_SOUNDS, customSoundName, deleteCustomSound, playSound, primeAudio, saveCustomSound, type SoundId } from '../lib/sounds';
import type { Settings } from '../types';
import { Button, cx, Segmented, Toggle } from './ui';

/** Alert sound, volume (with boost for music), repeats, and vibration for the rest and set timers. */
export function TimerSoundSettings({ s }: { s: Settings }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void customSoundName().then(setCustom);
  }, []);

  const pick = (timerSoundId: SoundId) => {
    void updateSettings({ timerSoundId });
    void playSound(timerSoundId, s.timerVolume, 1);
  };

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const name = await saveCustomSound(file);
      setCustom(name);
      await updateSettings({ timerSoundId: 'custom' });
      void playSound('custom', s.timerVolume, 1);
      toast(`Using "${name}" for timer alerts`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't use that sound", 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeCustom = async () => {
    await deleteCustomSound();
    setCustom(null);
    if (s.timerSoundId === 'custom') await updateSettings({ timerSoundId: 'beep' });
    toast('Your sound was removed');
  };

  const options: { id: SoundId; label: string }[] = [...BUILT_IN_SOUNDS, ...(custom ? [{ id: 'custom' as const, label: custom }] : [])];

  return (
    <>
      <Toggle label="Sound when a timer ends" checked={s.timerSound} onChange={(timerSound) => void updateSettings({ timerSound })} />
      {s.timerSound && (
        <div className="space-y-4 py-3.5">
          <div>
            <p className="mb-2 text-[15px] font-medium text-ink">Alert sound</p>
            <div role="radiogroup" aria-label="Alert sound" className="grid grid-cols-2 gap-2">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={s.timerSoundId === o.id}
                  onClick={() => pick(o.id)}
                  className={cx(
                    'flex h-11 min-w-0 items-center gap-2 rounded-xl border px-3 text-left text-[14px] font-medium transition-colors',
                    s.timerSoundId === o.id ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-ink-2 hover:text-ink',
                  )}
                >
                  {o.id === 'custom' ? <Music className="size-4 shrink-0" aria-hidden /> : <Play className="size-4 shrink-0" aria-hidden />}
                  <span className="truncate">{o.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" aria-hidden /> {custom ? 'Use a different sound' : 'Use my own sound'}
              </Button>
              {custom && (
                <Button size="sm" variant="ghost" onClick={() => void removeCustom()}>
                  <Trash2 className="size-4" aria-hidden /> Remove my sound
                </Button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" aria-label="Choose a sound file" onChange={(e) => void onFile(e.target.files?.[0])} />
            <p className="mt-1.5 text-[12px] text-ink-3">Pick any short audio file from your phone (MP3, M4A, OGG, WAV). Up to 8 seconds of it plays.</p>
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label htmlFor="timer-volume" className="text-[15px] font-medium text-ink">
                Volume
              </label>
              <span className="tnum text-[14px] font-semibold text-ink">{s.timerVolume}%</span>
            </div>
            <div className="flex items-center gap-3">
              <Volume2 className="size-5 shrink-0 text-ink-3" aria-hidden />
              <input
                id="timer-volume"
                type="range"
                min={10}
                max={300}
                step={10}
                value={s.timerVolume}
                onPointerDown={() => primeAudio()}
                onChange={(e) => void updateSettings({ timerVolume: Number(e.target.value) })}
                onPointerUp={(e) => void playSound(s.timerSoundId, Number(e.currentTarget.value), 1)}
                className="h-2 flex-1 cursor-pointer accent-[var(--accent)]"
              />
              <Button size="sm" onClick={() => void playSound(s.timerSoundId, s.timerVolume, s.timerRepeat)}>
                Test
              </Button>
            </div>
            <p className="mt-1.5 text-[12px] text-ink-3">Above 100% boosts the alert so you can hear it over music. Your phone's media volume still sets the maximum.</p>
          </div>

          <div>
            <p className="mb-2 text-[15px] font-medium text-ink">Play it</p>
            <Segmented<number>
              label="Times the alert plays"
              value={s.timerRepeat}
              options={[
                { value: 1, label: 'Once' },
                { value: 2, label: 'Twice' },
                { value: 3, label: '3 times' },
              ]}
              onChange={(timerRepeat) => void updateSettings({ timerRepeat })}
            />
          </div>
        </div>
      )}
      <Toggle label="Vibrate when a timer ends" description="On phones that support it" checked={s.timerVibrate} onChange={(timerVibrate) => void updateSettings({ timerVibrate })} />
    </>
  );
}
