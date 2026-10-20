import type { Settings, Units } from '../types';

export interface UnitLoadDefaults {
  barbellWeight: number;
  plates: number[];
  dumbbellIncrement: number;
  cableIncrement: number;
}

export const LOAD_DEFAULTS: Record<Units, UnitLoadDefaults> = {
  lb: { barbellWeight: 45, plates: [45, 35, 25, 10, 5, 2.5], dumbbellIncrement: 5, cableIncrement: 5 },
  kg: { barbellWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], dumbbellIncrement: 2, cableIncrement: 2.5 },
};

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  onboarded: false,
  units: 'lb',
  schedule: 3,
  goal: 'muscle',
  theme: 'dark',
  ...LOAD_DEFAULTS.lb,
  restCompoundSec: 150,
  restIsolationSec: 60,
  timerSound: true,
  timerVibrate: true,
  timerSoundId: 'beep',
  timerVolume: 100,
  timerRepeat: 1,
  setTimerEnabled: false,
  setTimerSec: 45,
  keepAwake: true,
  deloadReminders: true,
  warmupSuggestions: true,
  aiEnabled: true,
  prefillSets: true,
  weighInReminders: true,
  weighInDay: 1,
  sex: 'unspecified',
};

export const LB_PER_KG = 2.2046226218;
