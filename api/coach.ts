// Vercel serverless function: POST /api/coach (and GET for status).
// Reads ANTHROPIC_API_KEY from the Vercel project's environment variables.
// Max duration is set in vercel.json so long coach answers can finish streaming.
import { handleCoachRequest } from '../server/coachHandler.js';

export function GET(req: Request): Promise<Response> {
  return handleCoachRequest(req, { apiKey: process.env.ANTHROPIC_API_KEY, accessCode: process.env.COACH_ACCESS_CODE });
}

export function POST(req: Request): Promise<Response> {
  return handleCoachRequest(req, { apiKey: process.env.ANTHROPIC_API_KEY, accessCode: process.env.COACH_ACCESS_CODE });
}
