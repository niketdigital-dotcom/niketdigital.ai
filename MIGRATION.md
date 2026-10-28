# Migration note — preserving your existing AdGenius AI items

## What must be preserved

From the inspected Muse-hosted app (`adgenius-ai`, inspected 2026-10-28):

- **Profile:** business name "Niket digital"
- **Saved item 1:** 1 Meta campaign plan
- **Saved item 2:** 1 ad-copy set of 5 variations
- **Saved item 3:** 1 creative image / creative concept

All other tables in that capture were empty (clients, metric rows,
integrations, tracking, assistant messages, tasks).

## Why this is manual

No automated export exists for the Muse-hosted app: there is no
source-export, GitHub-export, or data-export action in that build.
Therefore this production codebase does NOT contain the full text of those
3 items, and their content is deliberately NOT invented or guessed here.

## What you must do (when you are ready, after deployment)

1. Open your Muse-hosted AdGenius AI app and open each of the 3 saved items.
2. Copy the text / download the creative image.
3. In the new production app, sign up, complete Settings with
   "Niket digital" as your business name, then paste each item into the
   matching section and click Save (Meta campaign → AI Ads Creator,
   ad copy → Ad Copy Generator, creative → Creative Studio concept).
4. Check Dashboard: you should see 3 saved items under your account only.

Do NOT delete the Muse-hosted app until you have copied these 3 items
and confirmed they appear in the new app.
