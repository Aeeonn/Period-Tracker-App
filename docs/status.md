# Project status

_Last updated: 2026-11-14._ Update this file whenever work merges or plans change. Keep it short: current state, what's next and open follow-ups. Put history in [progress.md](progress.md).

## Current state

- **P0 Foundation: done.** The owner approved the Phase 0 gate on 2026-10-30. It includes the encrypted store, lock, app shell, service worker, CSP and network policy, crypto core, LocalDate engine and the Cloudflare relay spike.
- **P1 Core tracking: features complete; closing tasks remain.** Integrated `main` includes:
  - the engine (episodes, cycle prediction and warnings);
  - logging forms;
  - Today, Calendar and the cycle ring;
  - export/import and delete-all; portable files exclude device identities, and legacy imports skip and disclose them (`0bd7009`);
  - the cited core education-card catalog and A17 selector, now displayed on Today alongside rule-specific sourced warnings;
  - the visual refresh and daily-use polish;
  - the service-worker navigation fix (`3c96d61`).
- **Development convenience:** `npm run dev` now runs an unlocked development mode with a separate synthetic-only database (`8f383cb`). See the [README](../README.md).
- **Face ID unlock (`p2-passkey-unlock`, built early at the owner's request, 2026-11-14):** optional passkey-PRF unlock from Settings, and the Lock-after setting is now honoured (default 1 minute) ([ADR-0016](adr/0016-passkey-face-id-unlock.md)). Automated proof uses a synthetic WebAuthn stub; real-iPhone enrolment, unlock, cancel fallback and offline unlock are still to be checked by the owner on the synthetic preview https://face-id.flo-preview-cm6.pages.dev ([record](deploy/face-id-preview.md)).

## Next up: finish P1

1. **P1 phase verification.** Automated checks completed on integrated `main` at `0171a809`:
   - `npm run build && npm run check`: PASS; 58 test files / 434 tests.
   - `npx playwright test tests/e2e/today.spec.ts tests/e2e/settings.spec.ts --workers=1`: 38
     passed. Full `npm run e2e -- --workers=1`: 214 passed. The default 8-worker run had 5
     iPhone 13 timeouts; serial execution passed.
   - `npm run test:tz`: PASS in all 5 configured zones (58 files / 434 tests per zone).
   - `npx vitest run --coverage`: 81.43% overall line coverage; engine 97.75%, crypto 95.82%,
     data 95.14%, backup 95.10%. `share`, `sync` and `pairing` have no files yet.
   - `npm run backtest`: PASS; frozen synthetic stable, drift and outlier targets met.
     `npm run bench`: PASS; 730-record load averaged about 132 ms, p95 about 167 ms (1.5 s
     target).
   - The integrated P1 phase report/review against all [roadmap exit criteria](plan/roadmap.md#p1--core-tracking-her)
     is still outstanding; these command results alone do not close the gate.
2. **Preview and demo.** The latest synthetic preview is https://0adba595.flo-preview-cm6.pages.dev
   (branch alias https://p1-gate-0171a80.flo-preview-cm6.pages.dev, revision `0171a80`).
   Byte equality and deployed-origin header/network checks passed. Playwright WebKit emulation
   failed offline reload and could not confirm OPFS cleanup, but the owner's **real-iPhone smoke
   (2026-11-14)** passed: on the iPhone 16 Pro (iOS 26.7.3) the installed app reopened offline,
   unlocked and showed synthetic entries, and Delete All reported “Your local data was removed”;
   the iPhone 12 (iOS 18.6.7) installed, set up and unlocked. The emulation failures are treated as
   automation limitations; no app change was needed. See [docs/deploy/p1-demo.md](deploy/p1-demo.md).
3. **P1 gate.** Remaining: smoke checklist items 4–6 (auto-lock, prediction copy/Calendar marks,
   VoiceOver/large text) were not run; the integrated phase report/review and the demo package
   (what's new, screenshots, known issues, what's next) are still to do. Then wait for the owner's
   decision before starting P2.

## Open follow-ups

- **Face ID review follow-ups (ADR-0016):**
  - real iPhone: check Face ID setup still works with Lock after set to "Immediately" (the passkey sheet may count as hidden), and check the create-then-get PRF fallback;
  - move focus to the passphrase field or new button when the Face ID card changes state;
  - neutral passkey name in the Passwords app (`Flo unlock`), for discretion;
  - Settings "unavailable" copy over-states the Home Screen requirement; record iCloud Keychain sync of the passkey in the T3 notes;
  - a malformed passkey field should not block passphrase unlock; restored `lockTimeoutSec` values outside 0/60/300/900 should snap to an offered choice.
- **E2E under parallel load:** the full `npm run e2e` run had 7 iPhone 13 click timeouts (PBKDF2 under parallel workers); all passed with `--workers=1`. Watch for flakiness.

- **`p1-export-import-followups`** (`src/backup/portable/**`):
  - handle older schema versions before the first schema bump;
  - check that the record id matches its contents on import;
  - set partner import limits after unpair (decide together with `p2-unpair-delete`);
  - neutralise leading-whitespace CSV formulas;
  - use friendlier summary names.
- **Today integration review follow-ups:**
  - avoid exhausting the card rotation through repeated log saves and guard overlapping Today refresh/history writes;
  - consider moving W-11 source links outside the assertive announcement and adding a direct 9-1-1 call action;
  - align W-01 emergency wording with Canadian 9-1-1 guidance.
- **Unlocked dev mode:**
  - add a preview-only reset action for its sticky error state;
  - make the Delete All screen copy mention that it clears both local stores.
- **Deferred engine features** (owner, 2026-10-30): pause predictions during pregnancy or postpartum, and support pregnancy without a last-period date.
- **Older P0 lock E2E specs** were written before onboarding came first (`2eaf45f`). If they fail in the P1 phase check, fix their setup steps; keep the lock assertions and do not change routing or security behaviour.
- **Documentation debt:** the synthetic data generator is already v2 with no skipped seeds (`08dc10b`). Text that still describes v1 or skipped seeds (for example around A18) is out of date, not an open decision.

## After the P1 gate: P2 couple features

Items are listed in dependency order. Specs are in [task-briefs.md](plan/task-briefs.md) under each id, and dependencies are in [backlog.md](plan/backlog.md). Nearly all P2 work is in a sensitive area, so plan an independent review for each.

1. `p2-identity`: device and owner/partner identity keys and certificates.
2. `p2-relay-worker`: relay Worker and D1 with signed requests, slots, the couple log and deletion.
3. `p2-share-keys` (after identity): category key epochs, wrapping keys for the partner, and rotation.
4. `p2-sync-core` (after identity): HLC, merge, tombstones, conflict copies, and the outbox/inbox.
5. `p2-projection` (after share-keys): share categories and an allow-listed projection builder.
6. `p2-push` (after relay): generic Web Push.
7. `p2-transport` (after sync-core and relay): the relay client and manual `.flosync` file exchange.
8. `p2-pairing` (after share-keys and relay): in-person pairing with two-way QR codes, a safety code and a fallback code.
9. `p2-share-controls`, `p2-partner-view`, `p2-couple-space`, `p2-backup` and `p2-unpair-delete` (after pairing, transport and projection).
10. Independent of the chain: `p2-quick-hide`. (`p2-passkey-unlock` was built early; see Current state.)
11. P2 finish: `p2-preview-relay-deploy`, `p2-integration`, `p2-demo-deploy`, the phase check and the owner gate.

After P2 comes **P2.5**: original intimacy prompts and sexual-wellness lessons, with an independent medical-content review. P3–P7 follow [roadmap.md](plan/roadmap.md); write their detailed tasks when each phase starts.
