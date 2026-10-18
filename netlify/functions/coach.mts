// Netlify function for the AI Coach (same handler as the Vercel function in api/coach.ts).
// public/_redirects routes /api/* here. Set ANTHROPIC_API_KEY (and optionally
// COACH_ACCESS_CODE) under Site configuration -> Environment variables.
import { handleCoachRequest } from '../../server/coachHandler.js';

export default (req: Request): Promise<Response> =>
  handleCoachRequest(req, { apiKey: process.env.ANTHROPIC_API_KEY, accessCode: process.env.COACH_ACCESS_CODE });
