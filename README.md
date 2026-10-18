# LiftLog

A fast, offline-first Push / Pull / Legs workout tracker. It shows you exactly what to lift, lets you log every set in a tap or two, and tells you after each workout whether to go **up**, **stay**, or go **down** next time. There's an optional AI Coach powered by Claude.

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
   - `ANTHROPIC_API_KEY`: your key (see below).
   - `COACH_ACCESS_CODE`: any password you choose. **Recommended**, because without it anyone who finds your URL could use your API credits.

   Then go to **Deployments**, open the latest one, and click **Redeploy** so the variables take effect.
4. Open your `https://<project>.vercel.app` URL on your phone.

**Install on iPhone (Safari):** tap **Share** → **Add to Home Screen** → **Add**.
**Install on Android (Chrome):** tap the **⋮** menu → **Install app** (or **Add to Home screen**).

LiftLog then opens full-screen from your home screen and works offline. If you set `COACH_ACCESS_CODE`, open **Settings → AI Coach** in the app and enter the same code once on each device.

### Deploying on Netlify instead

Netlify works too: **Add new site → Import an existing project →** pick the repo **→ Deploy** (settings come from `netlify.toml`, and `public/_redirects` makes links like `/workout` work). Add `ANTHROPIC_API_KEY` / `COACH_ACCESS_CODE` under **Site configuration → Environment variables**, then **Deploys → Trigger deploy**. Netlify functions have a shorter time limit than Vercel's, so very long AI Coach answers can occasionally get cut off; everything else is identical.

> Your workout data lives on the device you log it on. Use **Settings → Export backup** regularly, and **Import backup** to move data to a new phone.

---

## AI Coach setup

The AI Coach is optional. Without a key, everything else works and AI features show "Set up AI Coach in Settings".

1. **Get an API key:** create an account at [console.anthropic.com](https://console.anthropic.com), add billing/credits, then go to **Settings → API Keys → Create Key**. Copy it (it starts with `sk-ant-`).
2. **Local development:** copy `.env.example` to `.env.local` and paste your key:

   ```bash
   cp .env.example .env.local
   # edit .env.local:
   ANTHROPIC_API_KEY=sk-ant-...
   COACH_ACCESS_CODE=         # optional locally
   ```

   Restart `npm run dev`. The dev server serves `/api/coach` using the same handler as the Vercel function. `.env.local` is git-ignored.
3. **Production:** set the same variables in Vercel (step 3 above).

**Security:** the key is only read on the server (`server/coachHandler.ts`). It is never sent to the browser or bundled into the app (it has no `VITE_` prefix). The browser only talks to `/api/coach`, which accepts a narrow, validated request shape.

**Model:** the coach uses `claude-sonnet-5-5`. To change it, edit `COACH_MODEL` in [`shared/coach.ts`](shared/coach.ts). The coach's rules (system prompt) and the JSON schemas for structured answers live in the same file. Requests use adaptive thinking and streaming, and enable Anthropic's server-side refusal fallback; if your account rejects that beta, the server automatically retries without it.

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
api/coach.ts            Vercel serverless function (holds ANTHROPIC_API_KEY)
server/                 Coach request handler + Vite dev/preview middleware
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
