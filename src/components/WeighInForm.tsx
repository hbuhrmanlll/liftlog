import { Scale } from 'lucide-react';
import { useState } from 'react';
import { addBodyweight } from '../db/repo';
import { useToast } from '../hooks/toast';
import { useSettings } from '../hooks/useData';
import { Button } from './ui';

/** One-line bodyweight entry. */
export function WeighInForm({ compact }: { compact?: boolean }) {
  const settings = useSettings();
  const toast = useToast();
  const [value, setValue] = useState('');
  const n = Number(value.replace(',', '.'));
  const valid = Number.isFinite(n) && n > 20 && n < 700;
  return (
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
        <input
          aria-label={`Bodyweight in ${settings.units}`}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
          placeholder={compact ? 'Your weight today' : "Today's weight"}
          className="tnum h-full w-full min-w-0 bg-transparent px-2.5 text-[15px] outline-none placeholder:text-ink-3"
        />
        <span className="text-[14px] text-ink-3">{settings.units}</span>
      </div>
      <Button type="submit" variant="primary" disabled={!valid}>
        Log
      </Button>
    </form>
  );
}
