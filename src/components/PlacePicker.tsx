import { Dumbbell, House } from 'lucide-react';
import { updateSettings } from '../db/repo';
import type { TrainingPlace } from '../types';
import { Segmented } from './ui';

/** "Where are you training today?" The choice is remembered for next time. */
export function PlacePicker({ value, className }: { value: TrainingPlace; className?: string }) {
  return (
    <Segmented<TrainingPlace>
      label="Where are you training today?"
      className={className}
      value={value}
      onChange={(lastPlace) => void updateSettings({ lastPlace })}
      options={[
        {
          value: 'gym',
          label: (
            <span className="inline-flex items-center justify-center gap-1.5">
              <Dumbbell className="size-4" aria-hidden /> Gym
            </span>
          ),
        },
        {
          value: 'home',
          label: (
            <span className="inline-flex items-center justify-center gap-1.5">
              <House className="size-4" aria-hidden /> Home
            </span>
          ),
        },
      ]}
    />
  );
}
