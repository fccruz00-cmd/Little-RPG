# Little RPG, working notes

Browser idle auto-battler, vanilla ES modules, one-file build via
`tools/build_single_file.py` (output `little-rpg.html`). Every progression
number lives in `src/data/balance.js`. Headless test battery lives in the
session scratchpad; serve the repo on :8010 and run the `test-*.mjs` files
with node + Playwright (`executablePath: '/opt/pw-browsers/chromium'`).

The leaderboards are LIVE against the owner's Supabase project (URL and
publishable key in `src/net/config.js`, both public by design). Tests and
localhost never write to the real board: `hasBackend()` is false on
localhost unless a test opts in via `globalThis.__LB_CONFIG`, and the
awakened sandbox build carries a kill-switch in its seed. Keep both
guards when touching `src/net/`.

## Launch checklist (deliberately postponed, owner's words: "puta role")

Do these when the game actually goes to Google Play. None block anything
today.

1. **Play Console setup**: developer account (US$ 25 once), create the
   app, register the four in-app products with EXACTLY these ids:
   `gems_pouch`, `gems_sack`, `gems_chest`, `gems_hoard`
   (must match `PACKS` in `src/store/billing.js`).
2. **Patron shield, server half** (client half already ships, dormant):
   - Play Console -> Setup -> API access -> link a Google Cloud project,
     create a service account, grant it "View financial data, orders and
     cancellation survey responses" on the app, download the JSON key.
   - Supabase -> Edge Functions -> create `verify-purchase`, paste
     `supabase/functions/verify-purchase/index.ts`, DISABLE "Enforce JWT
     verification" for this function.
   - Function secrets: `GOOGLE_SA_JSON` (the whole key file) and
     `ANDROID_PACKAGE` (the app's package name).
   - If not done earlier: run `supabase/verify.sql` once in the SQL
     editor (idempotent; forces Google-verified devices into the patron
     league whatever their save claims).
3. **PWA packaging**: the TWA route (PWABuilder/Bubblewrap) needs the
   game hosted on HTTPS plus a manifest.json and a service worker. The
   hosting half is DONE: GitHub Pages at
   https://fccruz00-cmd.github.io/Little-RPG/ , fed by
   `.github/workflows/pages.yml` (mirrors every push of main and the
   working branch onto `gh-pages`). manifest.json and the service
   worker still do not exist. Note the leaderboard is LIVE on that
   domain: `hasBackend()` is only false on localhost.
4. **Store compliance**: PRIVACY.md still has placeholders and the
   leaderboard now collects a nickname, so the privacy policy and the
   Play Data Safety form are mandatory; the four third-party asset packs
   credited in the README still need their licenses confirmed.
5. **Supabase hygiene**: confirm the database password is freshly reset
   and lives only in the dashboard. The publishable key in the repo is
   fine; the password must never be.

## House rules learned along the way

- Player-facing text avoids em dashes (owner request); commas, colons
  and full stops instead, in BOTH the English keys and the Portuguese
  values of `src/i18n.js`, which must move in lockstep or lookups break.
- English strings ARE the i18n keys: changing one means changing its
  entry in `src/i18n.js` and any `applyStatic` selector table row in
  `src/ui/ui.js`.
- Save compatibility is sacred: new fields get defaults in
  `defaults()`/the constructor, version bumps get a migrate branch, and
  lifetime counters seed only from what an old save can prove.
- After any change: rebuild the single file AND re-inject the awakened
  sandbox seed (the scratchpad snippet), or the two builds drift.
