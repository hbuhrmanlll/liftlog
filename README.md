# LiftLog

A fast, offline-first Push / Pull / Legs workout tracker. It shows you exactly what to lift, lets you log every set in a tap or two, and tells you after each workout whether to go **up**, **stay**, or go **down** next time. There's an optional AI Coach powered by Google Gemini (free tier) or Anthropic Claude.

- **No account, no backend for your data.** Everything is stored on your device (IndexedDB).
- **Installs on your phone** and works offline (PWA).
- **Built with** React, TypeScript, Vite, Tailwind CSS, Dexie, Recharts, React Router, vite-plugin-pwa, and Vitest.

---

## Quick start (on your computer)

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload. Includes the AI Coach API at `/api/coach`. |
| `npm run build` | Type-checks and builds the production app into `dist/`. |
| `npm run preview` | Serves the production build locally, with the service worker and AI Coach API. |
| `npm test` | Runs the unit tests (progression engine, rounding, PRs, coach context, AI parsing, database). |
| `npm run icons` | Regenerates the app icons in `public/` (needs Playwright's Chromium). |

### Try it on your phone over Wi-Fi (before deploying)

```bash
npm run dev -- --host
```

Open the `Network:` URL (for example `http://192.168.1.20:5173`) on your phone while it's on the same Wi-Fi. Phones only allow "Add to Home Screen" with offline support over **HTTPS**, so for a real install, deploy it (below). It's free and takes about 5 minutes.

---

## Deploy for free (Vercel) and install on your phone

The app is static, plus one small serverless function (`api/coach.ts`) that holds your Anthropic API key for the AI Coach. Vercel's free Hobby plan runs both.

1. Push this folder to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, click **Add New → Project**, and import the repo. Vercel detects Vite automatically (settings are in `vercel.json`). Click **Deploy**.
3. *(Optional, for the AI Coach)* In the project, open **Settings → Environment Variables** and add:
   - `GEMINI_API_KEY` (free) or `ANTHROPIC_API_KEY` (paid): your key (see below).
   - `COACH_ACCESS_CODE`: any password you choose. **Recommended**, because without it anyone who finds your URL could use your API credits.

   Then go to **Deployments**, open the latest one, and click **Redeploy** so the variables take effect.
4. Open your `https://<project>.vercel.app` URL on your phone.

**Install on iPhone (Safari):** tap **Share** → **Add to Home Screen** → **Add**.
**Install on Android (Chrome):** tap the **⋮** menu → **Install app** (or **Add to Home screen**).

LiftLog then opens full-screen from your home screen and works offline. If you set `COACH_ACCESS_CODE`, open **Settings → AI Coach** in the app and enter the same code once on each device.

### Deploying on Netlify instead

Netlify works too: **Add new site → Import an existing project →** pick the repo **→ Deploy** (settings come from `netlify.toml`, and `public/_redirects` makes links like `/workout` work). Add `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) and `COACH_ACCESS_CODE` under **Site configuration → Environment variables**, then **Deploys → Trigger deploy**. Netlify functions have a shorter time limit than Vercel's, so very long AI Coach answers can occasionally get cut off; everything else is identical.

> Your workout data lives on the device you log it on. Use **Settings → Export backup** regularly, and **Import backup** to move data to a new phone.

---

## AI Coach setup

The AI Coach is optional. Without a key, everything else works and AI features show "Set up AI Coach in Settings". It supports two providers. Set **one** key:

| Provider | Cost | Variable | Get a key |
| --- | --- | --- | --- |
| **Google Gemini** (Flash) | Free tier, no credit card, daily request limits | `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| **Anthropic Claude** (Sonnet) | Pay as you go, higher-quality answers | `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |

If only `GEMINI_API_KEY` is set, Gemini is used automatically. If both are set, Claude is used unless you add `COACH_PROVIDER=gemini`. `GEMINI_MODEL` overrides the default Gemini model (`gemini-flash-latest`). On the free tier, if you hit Google's daily limit, the coach says it's busy until the limit resets. Note that Google may use free-tier prompts (which include your training summary) to improve its products.

**Get a free Gemini key:** go to https://aistudio.google.com/apikey, sign in with a Google account, click **Create API key**, and copy it (it starts with `AIza`).

**Local development:** copy `.env.example` to `.env.local` and paste your key:

```bash
cp .env.example .env.local
# edit .env.local:
GEMINI_API_KEY=AIza...
```

Restart `npm run dev`. The dev server serves `/api/coach` using the same handler as the deployed function. `.env.local` is git-ignored.

**Production:** add the same variable on your host (Netlify: **Site configuration → Environment variables**, then **Deploys → Trigger deploy**; Vercel: **Settings → Environment Variables**, then **Redeploy**). Also add `COACH_ACCESS_CODE` so only you can use your key.

**Security:** keys are only read on the server (`server/coachEnv.ts`). They are never sent to the browser or bundled into the app (they have no `VITE_` prefix). The browser only talks to `/api/coach`, which accepts a narrow, validated request shape.

**Models and prompts:** the Claude model is `COACH_MODEL` in [`shared/coach.ts`](shared/coach.ts), which also holds the coach's rules (system prompt) and the JSON schemas for structured answers. Both providers get the same rules and data. The Gemini client is [`server/gemini.ts`](server/gemini.ts).

What the coach does:
- **Ask Coach** (workout summary and exercise pages): a second opinion on next session's weight. The rule-based engine stays the default. If the AI disagrees, you see both and pick one. The app never changes your weights on its own, and it caps any AI suggestion at the engine's normal increment.
- **Exercise ideas:** swaps and additions returned as validated JSON (zod), applied with one tap after you confirm.
- **Cardio advice**, a **weekly check-in** on Home, and a **wrap-up** after every workout (saved with the workout in History).
- **Chat** in the Coach tab, streamed and saved on your device.

The coach receives a compact summary of your training (built in [`src/lib/coachContext.ts`](src/lib/coachContext.ts)): the last 4 weeks set by set, weeks 5-8 summarized per exercise, older data condensed, plus PRs, engine recommendations and stalls, weekly sets per muscle, cardio, bodyweight trend, and notes.

---

## How the progression engine works

[`src/lib/progression.ts`](src/lib/progression.ts) is pure TypeScript with full tests. It uses **double progression**: stay at a weight until you hit the top of the rep range on every set, then add weight.

| Situation | Recommendation |
| --- | --- |
| Every target set hit the top of the range at the same weight (and set 1 wasn't RIR 0, if logged) | **Go up**: +10 lb / 5 kg for lower-body barbell or machine compounds, +5 lb / 2.5 kg for upper-body barbell, one dumbbell step, one stack step for cables/machines, +5 lb / 2.5 kg on a belt for bodyweight lifts |
| All sets in range, not all at the top | **Stay** and beat last time by at least one rep |
| Some sets below the range | **Stay** once, with a gentle note |
| Below the range 2 sessions in a row at the same weight | **Go down** about 10% |
| Same weight for 3 sessions with no added reps | **Stalled → deload** 10% for one session, then return to the old weight |
| First time doing an exercise | Uses your starting weight, or asks you to pick one you could lift for the top of the range with 2-3 reps left |

All weights are rounded to what you can actually load, using your barbell, plates, dumbbell, and cable settings. **Get Stronger** mode switches each day's first compound lift to 5 x 3-6 with 4 minutes of rest. **Both** uses 4 x 5-8 on that lift.

---

## Project structure

```
api/coach.ts            Vercel serverless function (holds your API key)
netlify/functions/      Netlify version of the same function
server/                 Coach request handler (Claude + Gemini) + Vite dev/preview middleware
shared/coach.ts         Model name, coach system prompt, JSON schemas (server + app)
src/
  components/           UI building blocks (set logger, charts, coach widgets, ...)
  pages/                Home, Workout, Summary, Coach, History, Progress, Program, Exercise, Settings, Onboarding
  lib/                  Pure logic: progression, rounding, calculations, warm-ups, schedule,
                        coachContext, coachSchemas, backup/CSV, YouTube parsing
  db/                   Dexie schema and repository functions
  data/                 Default PPL program and exercise library (form cues, mistakes, alternates)
  hooks/                Live queries, rest timer, toasts, coach availability
```

Business logic lives in `src/lib` as pure functions with tests next to them (`*.test.ts`). The UI only calls into it.

## Notes

- **Exercise videos:** no YouTube IDs are hard-coded. Each exercise has a **Watch how to do it** button that opens a YouTube search. Paste your favorite video link (watch, youtu.be, or Shorts) on the exercise page to embed it (privacy-enhanced `youtube-nocookie.com`).
- **Volume** = weight x reps for completed working sets. Warm-ups never count. Dumbbell weights are logged per dumbbell. Pull-up volume includes your bodyweight once you log it on the Progress page.
- **Sets per muscle:** the primary muscle gets 1 set and secondary muscles get ½, compared with the common 10-20 hard sets per week guideline.
