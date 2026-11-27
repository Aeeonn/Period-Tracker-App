# Project status

_Last updated: 2026-11-26._ Keep this short: current state, what's next and open follow-ups.

## Current state

- **Branch `rewrite/flo-lite`** holds Flo Lite, the simple rebuild described in [NEW-APP.md](../NEW-APP.md). `main` still holds the original app until the owner decides to replace it.
- **Built:** her setup and his setup; Today (cycle ring, next-period estimate, fertile-window card only when meaningful, heavy-bleeding warning, info cards); Calendar; a tap-to-save log (sex and desire first, period, body, mood, sleep, activity, alcohol, water, private notes); Patterns by cycle phase; Settings (cycle and period length, contraception, theme, export/import, delete everything); Share (pairing code, per-category switches, pause, "see what he sees", stop sharing); his read-only partner view; offline service worker; the relay Worker.
- **UI revamp (2026-11-26, not deployed yet):** a new purple-pastel design system with light and dark themes, inline SVG icons and a floating tab bar with an animated indicator; a lively cycle ring; a log grouped into collapsible sections with a progress bar, emoji and level tiles, and a small celebration on save; Patterns as bars and meters; illustrated empty, waiting and paused states; a warmer partner view; friendlier onboarding and error screens. All motion respects reduced motion. Copy meaning and the medical and consent wording are unchanged; data shapes, sharing, crypto, relay and engine are untouched. Commits `afdb60c` to `f8f67bd`.
- **Live at https://flo-lite.pages.dev** (deployed 2026-11-25 from this branch, before the UI revamp; relay `flo-lite-relay` with D1 `flo-lite`). See [docs/deploy/flo-lite.md](deploy/flo-lite.md) and the README's "Getting started on the iPhones". Checked live with synthetic data in emulated WebKit only; not yet on a real iPhone.

## Last verification

- `npm run build && npm run check`: PASS (typecheck, ESLint, Prettier, 43 unit tests in 7 files).
- `npx playwright test --workers=1`: 6 passed (owner flow, the full two-phone sharing flow, and a layout guard that every main screen fits the width and ends above the tab bar; WebKit iPhone SE and iPhone 13 emulation). The sharing spec serves the real relay code from memory via Playwright routing.
- UI revamp: every screen and state (30, including his views and the error screen) screenshotted on iPhone SE and iPhone 13 emulation, light and dark, and reviewed by eye, with automated checks for sideways overflow, overlapping or clipped text and controls, and content under the tab bar: none found. Emulation only; headless WebKit does not render the tab bar's backdrop blur.
- Independent review (flo-reviewer) of import, sync, relay, engine and recovery: first FAIL (malformed import could crash the app; imported role not forced), fixed and re-reviewed PASS.

## Next up

1. Owner: look over the UI revamp on this branch (preview deploy or `npm run dev`), then install on both iPhones from the Home Screen and try it (install, log, pair, pause, stop, offline reopen). Report anything confusing or broken.
2. Then the owner decides on replacing `main` with this branch (tag the old app `flo-v1-final` first).

## Open follow-ups

- Check the revamp on a real iPhone: tab bar blur, safe-area spacing, animation feel and dark mode.
- The sharing spec timed out once on iPhone SE emulation during the revamp (1.8 min, probably machine load); every rerun since has passed. Watch for it.
- Assumptions to confirm with the owner (also in [decisions.md](decisions.md#flo-lite-2026-11-25)): sex is logged as "had sex" plus comfort and satisfaction; water in glasses, activity in minutes; the crisis (self-harm) prompt was not carried over; the emergency card says to call 9-1-1.
- Lock, local encryption and push notifications are deferred until the owner asks.
- Review nits: his phone ignores snapshots older than the last one it saw, so if her phone clock jumps ahead and back, a later pause or category change could be ignored until her clock catches up (stop sharing still works). Fix with a relay-side upload counter. Creating a couple has no rate limit. The test relay store doesn't cascade deletes like D1.
