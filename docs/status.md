# Project status

_Last updated: 2026-11-27._ Keep this short: current state, what's next and open follow-ups.

## Current state

- **Branch `rewrite/flo-lite`** holds Flo Lite, the simple rebuild described in [NEW-APP.md](../NEW-APP.md). `main` still holds the original app until the owner decides to replace it.
- **Built:** her setup and his setup; Today (cycle ring, next-period estimate, fertile-window card only when meaningful, heavy-bleeding warning, info cards); Calendar; a tap-to-save log (sex and desire first, period, body, mood, sleep, activity, alcohol, water, private notes); Patterns by cycle phase; Settings (cycle and period length, contraception, theme, export/import, delete everything); Share (pairing code, per-category switches, pause, "see what he sees", stop sharing); his read-only partner view; offline service worker; the relay Worker.
- **UI revamp (2026-11-26, deployed):** a new purple-pastel design system with light and dark themes, inline SVG icons and a floating tab bar with an animated indicator; a lively cycle ring; a log grouped into collapsible sections with a progress bar, emoji and level tiles, and a small celebration on save; Patterns as bars and meters; illustrated empty, waiting and paused states; a warmer partner view; friendlier onboarding and error screens. All motion respects reduced motion. Copy meaning and the medical and consent wording are unchanged; data shapes, sharing, crypto, relay and engine are untouched. Commits `afdb60c` to `f8f67bd`.
- **Reminders (2026-11-27):** Web Push reminders as approved in [decisions.md](decisions.md#scope-2026-11-15): each phone plans its reminders locally (`src/notify/`), registers only wake-up times with the relay, and the service worker (`src/sw.ts`, now built from TypeScript) writes the text from local data. The relay stores push devices and times in D1 and sends encrypted ticks from a 5-minute cron (`relay/src/push.ts`). Settings has a Reminders card and IUD insertion date and interval; Share has "Tell him when my period starts". Commits `dbba46b`, `918bea6`.
- **Live at https://flo-lite.pages.dev** (last deployed 2026-11-27 from this branch with reminders, `d475861`; the branch is pushed to GitHub; relay `flo-lite-relay` with D1 `flo-lite`). See [docs/deploy/flo-lite.md](deploy/flo-lite.md) and the README's "Getting started on the iPhones". Checked live with synthetic data in emulated WebKit only; not yet on a real iPhone.

## Last verification

- `npm run build && npm run check`: PASS (typecheck, ESLint, Prettier, 73 unit tests in 9 files, including the RFC 8291 push encryption example byte for byte and VAPID signature verification).
- `npm run e2e`: 6 passed (owner flow, including the Reminders card, the full two-phone sharing flow, and a layout guard that every main screen fits the width and ends above the tab bar; WebKit iPhone SE and iPhone 13 emulation). The sharing spec serves the real relay code from memory via Playwright routing.
- UI revamp: every screen and state (30, including his views and the error screen) screenshotted on iPhone SE and iPhone 13 emulation, light and dark, and reviewed by eye, with automated checks for sideways overflow, overlapping or clipped text and controls, and content under the tab bar: none found. Emulation only; headless WebKit does not render the tab bar's backdrop blur.
- Independent review (flo-reviewer) of import, sync, relay, engine and recovery: first FAIL (malformed import could crash the app; imported role not forced), fixed and re-reviewed PASS.
- Independent review of reminders: first FAIL (a bad push key could stall the cron for everyone; the partner event named the period in plain text to the relay), fixed in `918bea6` and re-reviewed PASS; the relay now also stops retrying sends the push service refuses for good.
- Push delivery itself is not tested on a real iPhone yet: WebKit emulation has no push service.

## Next up

1. Owner: open https://flo-lite.pages.dev, then install on both iPhones from the Home Screen and try it (install, log, pair, pause, stop, offline reopen). Report anything confusing or broken.
2. Then the owner decides on replacing `main` with this branch (tag the old app `flo-v1-final` first).

## Open follow-ups

- Check the revamp on a real iPhone: tab bar blur, safe-area spacing, animation feel and dark mode.
- The sharing spec timed out once on iPhone SE emulation during the revamp (1.8 min, probably machine load); every rerun since has passed. Watch for it.
- Assumptions to confirm with the owner (also in [decisions.md](decisions.md#flo-lite-2026-11-25)): sex is logged as "had sex" plus comfort and satisfaction; water in glasses, activity in minutes; the crisis (self-harm) prompt was not carried over; the emergency card says to call 9-1-1.
- Lock and local encryption are deferred until the owner asks.
- Reminder follow-ups from review: tests for the service worker's partner-signal check; no rate limit on new push devices or partner signals; linking his phone needs only the couple ID; each cron run can send up to 40 pushes, which might exceed the Free plan's CPU budget with many devices (fine for two); a VAPID key change needs both phones to turn reminders off and on; the service worker writing "last shown" can race a settings change in the app; an export counts as a backup even if the file save is cancelled; discreet wording is off by default; a phone with a badly wrong clock can't register times.
- Review nits: his phone ignores snapshots older than the last one it saw, so if her phone clock jumps ahead and back, a later pause or category change could be ignored until her clock catches up (stop sharing still works). Fix with a relay-side upload counter. Creating a couple has no rate limit. The test relay store doesn't cascade deletes like D1.
