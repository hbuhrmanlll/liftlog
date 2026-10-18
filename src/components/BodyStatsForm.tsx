import { useState } from 'react';
import { addBodyweight, updateSettings } from '../db/repo';
import { ageFromBirthYear } from '../lib/calories';
import type { Settings, Sex } from '../types';
import { Button, Segmented, TextField } from './ui';

const CM_PER_IN = 2.54;

function heightParts(cm: number | undefined): { ft: string; inch: string; cm: string } {
  if (!cm) return { ft: '', inch: '', cm: '' };
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: String(Math.floor(totalIn / 12)), inch: String(totalIn % 12), cm: String(Math.round(cm)) };
}

/** Age, sex, height and current weight - used for calorie estimates and the coach. */
export function BodyStatsForm({ settings, latestWeight, submitLabel = 'Save', onSaved, secondary }: { settings: Settings; latestWeight?: number; submitLabel?: string; onSaved?: () => void; secondary?: React.ReactNode }) {
  const initial = heightParts(settings.heightCm);
  const [sex, setSex] = useState<Sex>(settings.sex);
  const [age, setAge] = useState(String(ageFromBirthYear(settings.birthYear) ?? ''));
  const [ft, setFt] = useState(initial.ft);
  const [inch, setInch] = useState(initial.inch);
  const [cm, setCm] = useState(initial.cm);
  const [weight, setWeight] = useState(latestWeight !== undefined ? String(latestWeight) : '');
  const [error, setError] = useState<string | null>(null);
  const metric = settings.units === 'kg';

  const save = async () => {
    const a = age ? Number(age) : undefined;
    if (a !== undefined && (!Number.isFinite(a) || a < 13 || a > 100)) return setError('Enter an age between 13 and 100.');
    let heightCm: number | undefined;
    if (metric ? cm : ft || inch) {
      heightCm = metric ? Number(cm) : (Number(ft || 0) * 12 + Number(inch || 0)) * CM_PER_IN;
      if (!Number.isFinite(heightCm) || heightCm < 120 || heightCm > 230) return setError('That height looks off. Check it and try again.');
    }
    const w = weight ? Number(weight.replace(',', '.')) : undefined;
    if (w !== undefined && (!Number.isFinite(w) || w < (metric ? 30 : 66) || w > (metric ? 300 : 660))) return setError('That weight looks off. Check it and try again.');
    setError(null);
    await updateSettings({ sex, birthYear: a ? new Date().getFullYear() - a : undefined, heightCm: heightCm ? Math.round(heightCm * 10) / 10 : undefined });
    if (w !== undefined && w !== latestWeight) await addBodyweight(Math.round(w * 10) / 10);
    onSaved?.();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Sex (for calorie math)</span>
        <Segmented<Sex>
          label="Sex"
          value={sex}
          onChange={setSex}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'unspecified', label: 'Skip' },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 32" />
        <TextField label={`Weight (${settings.units})`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder={metric ? 'e.g. 80' : 'e.g. 180'} />
      </div>
      {metric ? (
        <TextField label="Height (cm)" inputMode="numeric" value={cm} onChange={(e) => setCm(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 178" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Height (ft)" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value.replace(/\D/g, '').slice(0, 1))} placeholder="5" />
          <TextField label="Height (in)" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="10" />
        </div>
      )}
      {error && (
        <p className="text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}
      <p className="text-[12px] text-ink-3">Used only to estimate calories and give the coach context. Stored on this phone in your profile.</p>
      <Button type="submit" variant="primary" size="lg" className="w-full">
        {submitLabel}
      </Button>
      {secondary}
    </form>
  );
}
