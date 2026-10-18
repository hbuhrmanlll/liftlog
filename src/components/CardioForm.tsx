import { useState } from 'react';
import { addCardio } from '../db/repo';
import { useToast } from '../hooks/toast';
import { latestBodyweight, useBodyweight, useSettings } from '../hooks/useData';
import { bodyStats, cardioCalories } from '../lib/calories';
import type { Units } from '../types';
import { Button, cx, TextField } from './ui';

const TYPES = ['Walk', 'Incline treadmill', 'Bike', 'Run', 'Rower', 'Elliptical', 'Stairs', 'Other'];

export function CardioForm({ units, onDone }: { units: Units; onDone?: () => void }) {
  const toast = useToast();
  const [type, setType] = useState('Incline treadmill');
  const [minutes, setMinutes] = useState('25');
  const [distance, setDistance] = useState('');
  const [hr, setHr] = useState('');
  const mins = Number(minutes);
  const valid = Number.isFinite(mins) && mins > 0 && mins <= 600;
  const settings = useSettings();
  const bodyweight = useBodyweight();
  const estimate = valid ? cardioCalories({ type, minutes: mins, heartRate: hr ? Number(hr) : undefined }, bodyStats(settings, latestBodyweight(bodyweight))) : null;

  const save = async () => {
    if (!valid) return;
    const d = Number(distance.replace(',', '.'));
    const h = Number(hr);
    await addCardio({ type, minutes: Math.round(mins), distance: distance && Number.isFinite(d) && d > 0 ? d : undefined, heartRate: hr && Number.isFinite(h) && h > 0 ? Math.round(h) : undefined });
    toast(`Logged ${Math.round(mins)} min of ${type.toLowerCase()}`);
    setDistance('');
    setHr('');
    onDone?.();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Type</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={cx('h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors', type === t ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2 hover:text-ink')}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-3 gap-3">
        <TextField label="Minutes" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} required />
        <TextField label={`Distance (${units === 'kg' ? 'km' : 'mi'})`} inputMode="decimal" placeholder="Optional" value={distance} onChange={(e) => setDistance(e.target.value.replace(/[^0-9.,]/g, ''))} />
        <TextField label="Avg heart rate" inputMode="numeric" placeholder="Optional" value={hr} onChange={(e) => setHr(e.target.value.replace(/[^0-9]/g, ''))} />
      </div>
      <p className="text-[13px] text-ink-3">
        {estimate !== null ? (
          <>
            About <strong className="text-ink">{estimate} kcal</strong> burned (estimate{hr ? ', using your heart rate' : ''}).
          </>
        ) : (
          'Add your weight in Settings → Profile to see calories burned.'
        )}
      </p>
      <Button type="submit" variant="primary" className="w-full" disabled={!valid}>
        Log cardio
      </Button>
    </form>
  );
}
