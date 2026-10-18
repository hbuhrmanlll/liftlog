/**
 * Reads the AI Coach configuration from environment variables, shared by the
 * Vercel function, the Netlify function, and the local dev server.
 *
 *   GEMINI_API_KEY      Google Gemini key (free tier) - used automatically if it's the only key
 *   ANTHROPIC_API_KEY   Anthropic (Claude) key
 *   COACH_PROVIDER      Optional: "gemini" or "anthropic" to choose explicitly
 *   GEMINI_MODEL        Optional: Gemini model id (default: gemini-flash-latest)
 *   COACH_ACCESS_CODE   Optional: password the app must send before the coach answers
 */
import type { CoachProvider, HandlerOptions } from './coachHandler.js';

export function coachOptionsFromEnv(env: Record<string, string | undefined>): HandlerOptions {
  const explicit = env.COACH_PROVIDER?.trim().toLowerCase();
  const provider: CoachProvider =
    explicit === 'gemini' || explicit === 'anthropic' ? explicit : env.GEMINI_API_KEY?.trim() && !env.ANTHROPIC_API_KEY?.trim() ? 'gemini' : 'anthropic';
  return {
    provider,
    apiKey: provider === 'gemini' ? env.GEMINI_API_KEY : env.ANTHROPIC_API_KEY,
    model: provider === 'gemini' ? env.GEMINI_MODEL : undefined,
    accessCode: env.COACH_ACCESS_CODE,
  };
}
