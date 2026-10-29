# AdGenius AI — Production version (Step 2)

This is the **separate production codebase** for AdGenius AI. It is NOT the
Muse-hosted app. The design is preserved: deep navy, electric blue,
purple/cyan accents, white/light-gray background, and the same collapsible
sidebar with all 17 sections:

Dashboard, AI Ads Creator, Google Ads Builder, Ad Copy Generator, Creative
Studio, Audience Planner, Campaign Analyzer, Landing Page Builder, Tracking
& Analytics, Budget Optimizer, Marketing Reports, Client Management,
AI Assistant, Integrations, Plans & Pricing, Settings, Help Center.

## What was built in Step 2

- Vite + React + TypeScript + Tailwind frontend
- Supabase Auth: email sign-up, sign-in, sign-out, password reset
- Business profile (onboarding, editable in Settings)
- Supabase tables with Row Level Security: every row belongs to one user,
  and users can only see/edit/delete their own rows (see `supabase/schema.sql`)
- Saved campaigns, ad copy, audience plans, landing pages, budget plans,
  reports, clients, tasks, metric rows, tracking IDs, and integration status
- Server-side AI only: the browser calls `/api/ai-generate` and `/api/ai-chat`.
  Those Vercel functions verify your Supabase login, then call an
  OpenAI-compatible AI provider using `AI_API_KEY` from server environment
  variables. The key is never in browser code and never in GitHub.
- Campaign Analyzer and Reports calculate CTR, CPC, CPL, and ROAS ONLY from
  metric rows you enter. Empty data shows "no data" — never invented numbers.
- Google Ads headlines/descriptions are checked against 30/90 characters.
- Integrations show "Not connected" or "Saved, not verified" only. Nothing
  publishes ads or changes live budgets in this build.

## What is NOT done yet (needs your confirmation in later steps)

1. **GitHub upload** — Step 3. This code has NOT been pushed anywhere.
2. **Supabase SQL** — you must run `supabase/schema.sql` in your Supabase
   SQL Editor (a later step, with exact clicks).
3. **Vercel deployment** — Step 4. This code has NOT been deployed.
4. **AI key setup** — you must add `AI_API_KEY` in Vercel Environment
   Variables. Until then, AI calls return a clear "not configured" error
   instead of fake content.
5. **Meta/Google Ads OAuth and publishing** — later, after you are ready.
   It needs developer apps, permissions, and approvals, and it will never
   publish without your explicit authorization.
6. **Payments** — choosing a plan only changes your profile. No payment
   provider is connected, and no money is charged.
7. **Image generation** — Creative Studio generates concept text only.
   Real image generation needs an image-provider key set server-side later.
   No fake image is ever shown.

## Step 5 Part 2 — Meta / Google OAuth (read-only test only)

This step adds Connect buttons on the Integrations page. Connecting does
**not** publish ads, does not change live budgets, and does not turn on
live ad-account reads.

**In plain words, what happens when you click Connect:**
1. The app sends you to Meta or Google to sign in there. You never give
   AdGenius AI your Facebook or Google password.
2. Meta or Google sends a one-time code back to the app's server.
3. The server swaps that code for a token, checks it worked, then
   **throws the token away**. It is not saved, not shown in the browser,
   and not logged.
4. The app then shows “Connected (read-only test)” — that is only a
   status label. It is not a live ad-account connection yet.

**What you must add in the Meta console:**
- Redirect URI, copied exactly:
  `https://niketdigitalai.vercel.app/api/auth/meta/callback`
- The app requests only `ads_read` and `business_management`.
  Publishing (`ads_management`) is not requested here.

**What you must add in the Google console:**
- Redirect URI, copied exactly:
  `https://niketdigitalai.vercel.app/api/auth/google/callback`
- The app requests only the Google Ads read-only scope:
  `https://www.googleapis.com/auth/adwords`

**What you must add in Vercel Environment Variables ONLY**
(never in GitHub, never in frontend code, never in chat):
- `META_APP_ID`
- `META_APP_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Then redeploy in Vercel, go to Integrations, and click Connect.

**Still not done after this step:**
- Meta App Review and Business Verification for other users.
- Google Ads developer token approval.
- A vault / encrypted place to store tokens — required before any
  live ad-account read is turned on.
- Publishing ads — that needs a separate, explicitly approved step
  with write scopes, and it is not enabled by connecting here.

## Your existing saved items

See `MIGRATION.md`. Your Muse app profile ("Niket digital") and its 3 saved
items must be copied/re-entered by hand into the new app, because no
automated export exists. Their full text is NOT invented here.

## Files

- `src/` — frontend (App, pages, Supabase client)
- `api/` — Vercel serverless AI functions (server only)
- `supabase/schema.sql` — database tables + RLS policies
- `.env.example` — placeholder variable names ONLY, no real keys
- `STEP2-CHECKLIST.md` — what to confirm before Step 3

## Local run (optional, later)

```bash
npm install
cp .env.example .env.local   # then fill in YOUR values in .env.local only
npm run dev
```

Never commit `.env.local`. `.gitignore` already excludes `.env` files.
