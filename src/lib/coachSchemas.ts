/** Validates the AI's structured output before the app is allowed to act on it. */
import { z } from 'zod';
import type { DayType, Equipment, Exercise, MuscleGroup, RecAction } from '../types';
import { DAY_TYPES, EQUIPMENT, MUSCLE_GROUPS } from '../types';
import type { Recommendation } from './progression';
import { increaseLoad, progressionIncrement, roundToLoadable, type LoadProfile, type LoadSettings } from './rounding';

const suggestionSchema = z
  .object({
    type: z.enum(['add', 'swap']),
    name: z.string().trim().min(2).max(80),
    replaces: z.string().trim().max(80).default(''),
    day: z.enum(DAY_TYPES as unknown as [DayType, ...DayType[]]),
    sets: z.coerce.number().int().min(1).max(8),
    repMin: z.coerce.number().int().min(1).max(50),
    repMax: z.coerce.number().int().min(1).max(50),
    restSec: z.coerce.number().int().min(15).max(600),
    equipment: z.enum(EQUIPMENT as unknown as [Equipment, ...Equipment[]]),
    category: z.enum(['compound', 'isolation']),
    muscles: z.array(z.enum(MUSCLE_GROUPS as unknown as [MuscleGroup, ...MuscleGroup[]])).min(1).max(5),
    why: z.string().trim().min(1).max(600),
    cues: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
  })
  .refine((s) => s.repMin <= s.repMax, { message: 'repMin must be <= repMax', path: ['repMin'] })
  .refine((s) => s.type === 'add' || s.replaces.length > 0, { message: 'A swap needs the exercise it replaces', path: ['replaces'] });

export type CoachSuggestion = z.infer<typeof suggestionSchema>;

const opinionSchema = z.object({
  action: z.enum(['up', 'stay', 'down', 'deload']),
  weight: z.coerce.number().min(0).max(2000),
  reason: z.string().trim().min(1).max(800),
  agreesWithEngine: z.boolean(),
});

export type CoachOpinion = z.infer<typeof opinionSchema>;

/** Pull a JSON object out of model text: handles ```json fences and stray prose around it. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export type ParseResult<T> = { ok: true; data: T; dropped: number } | { ok: false; error: string };

/**
 * Parse exercise suggestions. Invalid individual suggestions are dropped
 * (and counted) instead of failing the whole response. Swaps must name an
 * exercise that is actually in the program.
 */
export function parseSuggestions(raw: unknown, program?: Exercise[]): ParseResult<{ summary: string; suggestions: CoachSuggestion[] }> {
  const json = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!json || typeof json !== 'object') return { ok: false, error: "The coach's reply wasn't in the expected format." };
  const obj = json as { summary?: unknown; suggestions?: unknown };
  if (!Array.isArray(obj.suggestions)) return { ok: false, error: "The coach's reply didn't include any suggestions." };
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const valid: CoachSuggestion[] = [];
  let dropped = 0;
  for (const item of obj.suggestions.slice(0, 5)) {
    const r = suggestionSchema.safeParse(item);
    if (!r.success) {
      dropped += 1;
      continue;
    }
    let s = r.data;
    if (s.type === 'swap' && program) {
      const target = program.find((e) => e.name.toLowerCase() === s.replaces.toLowerCase());
      if (!target) {
        dropped += 1;
        continue;
      }
      s = { ...s, replaces: target.name, day: target.day };
    }
    valid.push(s);
  }
  if (valid.length === 0 && !summary) return { ok: false, error: "The coach's suggestions couldn't be used. Try asking again." };
  return { ok: true, data: { summary, suggestions: valid }, dropped };
}

export function parseOpinion(raw: unknown): ParseResult<CoachOpinion> {
  const json = typeof raw === 'string' ? extractJson(raw) : raw;
  const r = opinionSchema.safeParse(json);
  if (!r.success) return { ok: false, error: "The coach's second opinion wasn't in the expected format." };
  return { ok: true, data: r.data, dropped: 0 };
}

export interface ReconciledOpinion {
  action: RecAction;
  weight: number;
  reason: string;
  agrees: boolean;
  /** Set when the app had to adjust the AI's number (rounding or a too-big jump). */
  adjustment?: string;
}

/**
 * Enforce the app's safety rails on the AI's number: it must be loadable and
 * never jump more than the engine's increment above the last working weight.
 */
export function reconcileOpinion(op: CoachOpinion, engine: Recommendation, lastWeight: number | null, profile: LoadProfile, load: LoadSettings): ReconciledOpinion {
  let weight = roundToLoadable(op.weight, profile.equipment, load);
  let adjustment: string | undefined;
  if (weight !== op.weight) adjustment = `Rounded to ${weight} ${load.units} so you can load it.`;
  if (lastWeight !== null) {
    const maxAllowed = increaseLoad(lastWeight, progressionIncrement(profile, load), profile.equipment, load);
    if (weight > maxAllowed) {
      weight = maxAllowed;
      adjustment = `Capped at ${maxAllowed} ${load.units} - LiftLog never jumps more than one increment at a time.`;
    }
  }
  const agrees = engine.weight !== null && Math.abs(engine.weight - weight) < 1e-6 && (engine.action === op.action || (engine.action === 'start' && op.action === 'stay'));
  return { action: op.action, weight, reason: op.reason, agrees, adjustment };
}
