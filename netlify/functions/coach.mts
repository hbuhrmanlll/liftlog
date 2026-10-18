// Netlify function for the AI Coach (same handler as the Vercel function in api/coach.ts).
// public/_redirects routes /api/* here. Set GEMINI_API_KEY (or ANTHROPIC_API_KEY) and
// optionally COACH_ACCESS_CODE under Site configuration -> Environment variables.
import { coachOptionsFromEnv } from '../../server/coachEnv.js';
import { handleCoachRequest } from '../../server/coachHandler.js';

export default (req: Request): Promise<Response> => handleCoachRequest(req, coachOptionsFromEnv(process.env));
