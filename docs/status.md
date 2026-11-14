# Project status

_Last updated: 2026-12-19._ Update this file whenever work merges or plans change. Keep it short: current state, what's next and open follow-ups. Put history in [progress.md](progress.md).

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
   Byte equality and deployed-origin header/network checks passed. Fresh synthetic WebKit smoke
   also passed online navigation and export/import on both descriptors, but offline reload failed
   with an internal WebKit error and Delete All reported OPFS cleanup unconfirmed; observed
   non-OPFS stores were empty. See [docs/deploy/p1-demo.md](deploy/p1-demo.md). These are emulated
   devices, not real iPhones. Ask the owner whether to investigate/fix the findings or carry them
   as unresolved P1 limitations; neither is accepted or fixed yet.
3. **P1 gate.** Complete the current-revision demo package, screenshots and both-phone real-iPhone
   smoke checklist ([test-strategy.md §7](plan/test-strategy.md#7-real-iphone-smoke-checklist-both-phones-at-every-phase-demo-synthetic-data-only)),
   record known issues, then wait for the owner's decision before starting P2.

## Open follow-ups

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
10. Independent of the chain: `p2-quick-hide` and `p2-passkey-unlock` (optional Face ID; depends on feasibility).
11. P2 finish: `p2-preview-relay-deploy`, `p2-integration`, `p2-demo-deploy`, the phase check and the owner gate.

After P2 comes **P2.5**: original intimacy prompts and sexual-wellness lessons, with an independent medical-content review. P3–P7 follow [roadmap.md](plan/roadmap.md); write their detailed tasks when each phase starts.
