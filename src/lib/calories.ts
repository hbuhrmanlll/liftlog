/**
 * Calorie estimates. These are estimates (typically within about 20%), not
 * measurements. Pure functions.
 *
 * - Resting burn (BMR): Mifflin-St Jeor equation, from sex, age, height, weight.
 * - Activity burn: MET x resting burn per minute x minutes ("corrected MET"
 *   method from the Compendium of Physical Activities), so age, height and sex
 *   are taken into account, not just weight.
 * - Cardio with an average heart rate: Keytel et al. (2005) heart-rate equation.
 */
import type { CardioLog, Settings, Sex, Units, Workout } from '../types';
import { workoutDurationSec, workoutSetCount } from './calculations';
import { LB_PER_KG } from './defaults';

export interface BodyStats {
  sex: Sex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
}

export function toKg(weight: number, units: Units): number {
  return units === 'kg' ? weight : weight / LB_PER_KG;
}

export function ageFromBirthYear(birthYear: number | undefined, now = new Date()): number | undefined {
  if (!birthYear) return undefined;
  const age = now.getFullYear() - birthYear;
  return age > 0 && age < 120 ? age : undefined;
}

export function bodyStats(settings: Pick<Settings, 'sex' | 'birthYear' | 'heightCm' | 'units'>, latestWeight: number | undefined, now = new Date()): BodyStats {
  return {
    sex: settings.sex,
    age: ageFromBirthYear(settings.birthYear, now),
    heightCm: settings.heightCm,
    weightKg: latestWeight !== undefined ? toKg(latestWeight, settings.units) : undefined,
  };
}

/** Mifflin-St Jeor resting energy, kcal/day. "unspecified" uses the midpoint of the two constants. */
export function bmr(s: BodyStats): number | null {
  if (!s.weightKg || !s.heightCm || !s.age) return null;
  const constant = s.sex === 'male' ? 5 : s.sex === 'female' ? -161 : -78;
  return Math.round(10 * s.weightKg + 6.25 * s.heightCm - 5 * s.age + constant);
}

/** What's missing for a full estimate, in plain words. */
export function missingStats(s: BodyStats): string[] {
  const out: string[] = [];
  if (!s.weightKg) out.push('weight');
  if (!s.age) out.push('age');
  if (!s.heightCm) out.push('height');
  return out;
}

/** kcal for `minutes` of an activity with this MET value. Null if weight is unknown. */
export function activityCalories(met: number, minutes: number, s: BodyStats): number | null {
  if (minutes <= 0) return 0;
  const rest = bmr(s);
  if (rest !== null) return Math.round(met * (rest / 1440) * minutes);
  // Fallback: classic MET formula (1 MET = 1 kcal/kg/hour) when only weight is known.
  if (s.weightKg) return Math.round(met * s.weightKg * (minutes / 60));
  return null;
}

/**
 * MET for a lifting session from how dense it was (Compendium: resistance
 * training 3.5 general, 5.0 moderate, 6.0 vigorous).
 */
export function liftingMet(sets: number, minutes: number): number {
  if (minutes <= 0 || sets <= 0) return 3.5;
  const perMin = sets / minutes;
  if (perMin >= 0.45) return 6.0;
  if (perMin >= 0.28) return 5.0;
  return 3.5;
}

/** Minutes that count: the logged duration, capped so a workout left open overnight isn't counted. */
export function effectiveMinutes(w: Workout): number {
  const logged = workoutDurationSec(w) / 60;
  const cap = workoutSetCount(w) * 4 + 15;
  return Math.max(0, Math.min(logged, cap, 240));
}

export function workoutCalories(w: Workout, s: BodyStats): number | null {
  const minutes = effectiveMinutes(w);
  return activityCalories(liftingMet(workoutSetCount(w), minutes), minutes, s);
}

const CARDIO_MET: Record<string, number> = {
  walk: 3.5,
  'incline treadmill': 6.0,
  bike: 6.8,
  run: 9.8,
  rower: 7.0,
  elliptical: 5.0,
  stairs: 8.8,
};

export function cardioMet(type: string): number {
  return CARDIO_MET[type.trim().toLowerCase()] ?? 5.0;
}

/** Keytel (2005) heart-rate based kcal/min. Needs sex, age and weight. */
export function keytelPerMinute(hr: number, s: BodyStats): number | null {
  if (!s.weightKg || !s.age || s.sex === 'unspecified' || hr < 80 || hr > 210) return null;
  const kj =
    s.sex === 'male'
      ? -55.0969 + 0.6309 * hr + 0.1988 * s.weightKg + 0.2017 * s.age
      : -20.4022 + 0.4472 * hr - 0.1263 * s.weightKg + 0.074 * s.age;
  const kcal = kj / 4.184;
  return kcal > 0 ? kcal : null;
}

export function cardioCalories(c: Pick<CardioLog, 'type' | 'minutes' | 'heartRate'>, s: BodyStats): number | null {
  if (c.heartRate) {
    const perMin = keytelPerMinute(c.heartRate, s);
    if (perMin !== null) return Math.round(perMin * c.minutes);
  }
  return activityCalories(cardioMet(c.type), c.minutes, s);
}

/** Rough total daily burn: BMR x a light activity factor (1.375), for context only. */
export function dailyEstimate(s: BodyStats): number | null {
  const rest = bmr(s);
  return rest === null ? null : Math.round(rest * 1.375);
}
