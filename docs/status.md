# Project status

_Last updated: 2026-11-25._ Keep this short: current state, what's next and open follow-ups.

## Current state

- **Branch `rewrite/flo-lite`** holds Flo Lite, the simple rebuild described in [NEW-APP.md](../NEW-APP.md). `main` still holds the original app until the owner decides to replace it.
- **Built:** her setup and his setup; Today (cycle ring, next-period estimate, fertile-window card only when meaningful, heavy-bleeding warning, info cards); Calendar; a tap-to-save log (sex and desire first, period, body, mood, sleep, activity, alcohol, water, private notes); Patterns by cycle phase; Settings (cycle and period length, contraception, theme, export/import, delete everything); Share (pairing code, per-category switches, pause, "see what he sees", stop sharing); his read-only partner view; offline service worker; the relay Worker.
- **Not deployed.** The relay needs a D1 database and its id in `relay/wrangler.toml` (owner step, see the [README](../README.md#relay-setup-owner)). No real-iPhone check yet.

## Last verification

- `npm run build && npm run check`: PASS (typecheck, ESLint, Prettier, 43 unit tests in 7 files).
- `npm run e2e`: 4 passed (owner flow and the full two-phone sharing flow, on WebKit iPhone SE and iPhone 13 emulation). The sharing spec serves the real relay code from memory via Playwright routing.
- Independent review (flo-reviewer) of import, sync, relay, engine and recovery: first FAIL (malformed import could crash the app; imported role not forced), fixed and re-reviewed PASS.

## Next up

1. Owner: create the D1 database and approve deploying the relay; choose the app address.
2. Deploy a synthetic preview with sharing on, and check both iPhones (install, log, pair, pause, stop, offline reopen).
3. Then the owner decides on real use and on replacing `main` with this branch (tag the old app `flo-v1-final` first).

## Open follow-ups

- Assumptions to confirm with the owner (also in [decisions.md](decisions.md#flo-lite-2026-11-25)): sex is logged as "had sex" plus comfort and satisfaction; water in glasses, activity in minutes; the crisis (self-harm) prompt was not carried over; the emergency card says to call 9-1-1.
- Lock, local encryption and push notifications are deferred until the owner asks.
- Review nits: his phone ignores snapshots older than the last one it saw, so if her phone clock jumps ahead and back, a later pause or category change could be ignored until her clock catches up (stop sharing still works). Fix with a relay-side upload counter. Creating a couple has no rate limit. The test relay store doesn't cascade deletes like D1.
