# UI refresh preview deployment record

Synthetic-data-only preview of the rebuilt app frame, Today, Log, onboarding and lock screens, and
of the shortened onboarding (see [status.md](../status.md)). This is not approval for real health
data and not the launch for real use.

## Deployment — 2026-11-16

- Revision: `3082198` (local `main`; five commits ahead of GitHub when deployed, because pushing was
  blocked in that session).
- Command: `tools/deploy/pages-preview.sh app --branch ui-refresh`.
- Alias: https://ui-refresh.flo-preview-cm6.pages.dev (deployment
  https://48d6a7e7.flo-preview-cm6.pages.dev).
- Build listing SHA-256: `72932c254a64b1fdf1e18264acb58070fdd45a528f741da84df7143cbabf0d5e`.
- `npx --no-install tsx tools/deploy/check-preview.ts https://ui-refresh.flo-preview-cm6.pages.dev app`:
  PASS (8 served files byte-equal). The alias returns HTTP 200 with the strict first-party CSP,
  `referrer-policy: no-referrer` and `x-content-type-options: nosniff`.
- Before deploy, on the same revision: `npm run build && npm run check` (462 unit tests) and the full
  Playwright suite with `--workers=2` (218 tests) passed in WebKit iPhone emulation.
- The main address https://flo-preview-cm6.pages.dev was **not** changed; it still serves revision
  `c9ced53`.

The build shows "Preview — synthetic data only". Use made-up data. The address is a new origin, so
the lock, Face ID and any entries must be set up again here; nothing carries over from other links.

## What to try on the phones (not yet done)

1. Open the alias in Safari, add it to the Home Screen and open it from there.
2. Setup: welcome, role, create lock, recovery code (boxes labelled "Position N"), basics, reminders,
   then "Continue to Today". There is no server-disclosure step.
3. Today: the ring is visible without scrolling; "Period started" then the "Still bleeding today?"
   prompt appears under the buttons.
4. Centre Log button: tap a flow level and a mood; each saves at once and shows under "This day".
   Tap one again to remove it. Use the arrows beside the date to change day.
5. Check the centre Log button and tab bar are not cut off by the Home indicator, and that the date
   field opens the iOS date picker.
6. Settings → Your trackers: move one with the arrows, hide one, pin one.

No real-iPhone result is recorded yet.
