# Project status

_Last updated: 2026-11-16._ Update this file whenever work merges or plans change. Keep it short: current state, what's next and open follow-ups. Put history in [progress.md](progress.md).

## Current state

- **P0 Foundation: done.** The owner approved the Phase 0 gate on 2026-10-30. It includes the encrypted store, lock, app shell, service worker, CSP and network policy, crypto core, LocalDate engine and the Cloudflare relay spike.
- **Scope narrowed (2026-11-15, [ADR-0017](adr/0017-narrowed-scope.md)).** The owner cut the plan to what the two of them need. Three steps replace P2–P7: launch for real use, lean partner sharing, then patterns and intimacy. See the [current roadmap](plan/roadmap.md#current-roadmap-narrowed-2026-11-15) and [decisions.md](decisions.md#scope-2026-11-15). No code changed.
- **P1 Core tracking: features complete; closed on the owner's phone checks.** Integrated `main` includes:
  - the engine (episodes, cycle prediction and warnings);
  - logging forms;
  - Today, Calendar and the cycle ring;
  - export/import and delete-all; portable files exclude device identities, and legacy imports skip and disclose them (`0bd7009`);
  - the cited core education-card catalog and A17 selector, now displayed on Today alongside rule-specific sourced warnings;
  - the visual refresh and daily-use polish;
  - the service-worker navigation fix (`3c96d61`).
- **UI refresh (2026-11-15, owner request):** the app frame, Today and Log were rebuilt for everyday use; Calendar and Settings lost their intro text.
  - Frame: no brand row or role pill; the preview notice and Settings share one slim row. Owner tabs are Today, a raised centre Log button and Calendar. The empty Insights and Us tabs are hidden until those screens exist (this differs from [ux-spec.md §2](plan/ux-spec.md#2-two-experiences-and-navigation), which lists five tabs).
  - Today: the cycle ring is first on screen; the "Still bleeding today?" prompt sits under the action buttons and the reminder banner no longer repeats it.
  - Log: chip-only trackers **save on tap** and clear when tapped again; typed trackers (notes, temperature, sleep, sex details and similar) keep a Save button and the unsaved-edits guard. A previous/next day stepper was added. Fixed: every tracker editor was displayed at once because a grid rule overrode `hidden`.
  - Second pass (same day): onboarding and the lock screens use the same soft cards and pill buttons (look only; no lock behaviour changed, and the recovery-code boxes are now labelled "Position N" with the full name kept for screen readers). Settings and Log share one compact tracker list: pinned trackers first in the user's order with arrow buttons, then the rest with a Pin button. Calendar day details lost their heavy outline.
- **Onboarding shortened (2026-11-16, owner decision):** the "Who runs the app's servers?" step and its "Pair now" button are gone. The owner finishes on the reminders step ("Continue to Today"); the partner gets a short "You're ready" step that says sharing is off.
- **Development convenience:** `npm run dev` now runs an unlocked development mode with a separate synthetic-only database (`8f383cb`). See the [README](../README.md).
- **Face ID unlock (`p2-passkey-unlock`, built early at the owner's request, 2026-11-14):** optional passkey-PRF unlock from Settings, and the Lock-after setting is now honoured (default 1 minute) ([ADR-0016](adr/0016-passkey-face-id-unlock.md)). The owner reports Face ID setup, unlock, passphrase fallback and offline unlock passed on both phones after being asked to use https://flo-preview-cm6.pages.dev with synthetic data ([record](deploy/face-id-preview.md)); automated tests use a synthetic WebAuthn stub.

## Next up: step 1 — close P1 and launch for real use

Details and the "done when" list are in the [roadmap](plan/roadmap.md#step-1--close-p1-and-launch-for-real-use). No phase report or demo package is needed.

1. **Data-loss and lockout fixes** (sensitive: import, lock; review each):
   - handle older schema versions on import before the first schema bump (`src/backup/portable/**`);
   - check that a record id matches its contents on import;
   - a malformed passkey field must not block passphrase unlock;
   - restored `lockTimeoutSec` values outside 0/60/300/900 snap to an offered choice.
2. **Emergency wording** (medical content; review): align W-01 with Canadian 9-1-1 guidance; consider moving W-11 source links outside the assertive announcement and adding a direct 9-1-1 call action.
3. **Backup:** a passphrase-protected export file and a monthly "back up now" nudge, reusing export/import (sensitive: crypto, backup; review).
4. **Ask the owner:**
   - the explicit go-ahead for real data, and which address to use (the app is at https://flo-preview-cm6.pages.dev; Face ID and local data are tied to the address);
   - whether her IUD is copper or hormonal, so she picks the right method in the app;
   - whether free-text notes should stay private from the partner view (assumed yes).
5. **Launch:** she installs from the chosen address and does one real export-then-import round trip on her phone.

## After launch

- **Step 2 — lean partner sharing.** Start with an ADR for the lean design (pairing code, one couple key, snapshot format, relay requests); it replaces ADR-0004 and ADR-0005. Then relay, pairing, sharing controls, partner view, couple space, daily push and unpair. See the [roadmap](plan/roadmap.md#step-2--lean-partner-sharing). The P2 briefs in `task-briefs.md` are reference only.
- **Step 3 — patterns and intimacy.** Descriptive per-phase summaries (including satisfaction), cycle history, prediction track record, and original intimacy prompts and lessons. The intimacy content does not depend on step 2 and can start at any time. See the [roadmap](plan/roadmap.md#step-3--patterns-and-intimacy).

## Last full verification (integrated `main` at `0171a809`, 2026-11-14)

- `npm run build && npm run check`: PASS; 58 test files / 434 tests.
- Full `npm run e2e -- --workers=1`: 214 passed. The default 8-worker run had 5 iPhone 13 timeouts; serial execution passed.
- `npm run test:tz`: PASS in all 5 zones. `npm run backtest` and `npm run bench`: PASS.
- `npx vitest run --coverage`: 81.43% overall line coverage; engine 97.75%, crypto 95.82%, data 95.14%, backup 95.10%.
- Owner's real-iPhone checks (iPhone 16 Pro, iOS 26.7.3; iPhone 12, iOS 18.6.7): install, offline reopen, unlock, Delete All, auto-lock, prediction/Calendar, VoiceOver/large text and Face ID reported as passed ([record](deploy/p1-demo.md)). Playwright WebKit emulation failed offline reload and could not confirm OPFS cleanup; these are treated as automation limits.

## Open follow-ups

- **UI refresh, still open:**
  - real-iPhone check of the new look: safe areas around the centre Log button, the date stepper with the native date picker, the lock and recovery screens;
  - pinned trackers are not stored: the order and the hidden trackers reset each time the app is reopened (storing them needs a profile field, so a contract change);
  - the "Preview — synthetic data only" notice is shown in every build and must change before real use (launch step);
  - Calendar day cells were not redesigned.
- **Face ID, real iPhone:** check that setup still works with Lock after set to "Immediately" (the passkey sheet may count as hidden).
- **Test timeouts:** parallel full E2E runs, one time-zone matrix run and one coverage run had timeouts that passed on a serial retry. The causes are not established. Run Playwright with `--workers=1`.
- **Today:** avoid exhausting the card rotation through repeated log saves, and guard overlapping Today refresh/history writes.
- **Unlocked dev mode:** make the Delete All screen copy mention that it clears both local stores.
- **Documentation debt:** the synthetic data generator is already v2 with no skipped seeds (`08dc10b`). Text that still describes v1 or skipped seeds (for example around A18) is out of date, not an open decision.
- **Dropped with ADR-0017** (listed once so they are not lost; reopen only if the owner asks): Face ID focus move, neutral passkey name, "unavailable" copy and iCloud Keychain note; create-then-get PRF fallback check; CSV formula neutralising and friendlier summary names in export; a reset action for the unlocked dev mode; the deferred pregnancy/postpartum engine features; the older P0 lock E2E note (the full serial run passes).
