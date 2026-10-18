// Vercel serverless function: POST /api/coach (and GET for status).
// Reads GEMINI_API_KEY or ANTHROPIC_API_KEY (see server/coachEnv.ts) from the
// Vercel project's environment variables. Max duration is set in vercel.json.
import { coachOptionsFromEnv } from '../server/coachEnv.js';
import { handleCoachRequest } from '../server/coachHandler.js';

export function GET(req: Request): Promise<Response> {
  return handleCoachRequest(req, coachOptionsFromEnv(process.env));
}

export function POST(req: Request): Promise<Response> {
  return handleCoachRequest(req, coachOptionsFromEnv(process.env));
}
