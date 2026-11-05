# Project status

_Last updated: 2026-11-04._ Update this file whenever work merges or plans change. Keep it short: current state, what's next and open follow-ups. Put history in [progress.md](progress.md).

## Current state

- **P0 Foundation: done.** The owner approved the Phase 0 gate on 2026-10-30. It includes the encrypted store, lock, app shell, service worker, CSP and network policy, crypto core, LocalDate engine and the Cloudflare relay spike.
- **P1 Core tracking: features complete; closing tasks remain.** Integrated `main` includes:
  - the engine (episodes, cycle prediction and warnings);
  - logging forms;
  - Today, Calendar and the cycle ring;
  - export/import and delete-all;
  - education cards;
  - the visual refresh and daily-use polish;
  - the service-worker navigation fix (`3c96d61`).
- **Development convenience:** `npm run dev` now runs an unlocked development mode with a separate synthetic-only database (`8f383cb`). See the [README](../README.md).

## Next up: finish P1

1. **Preview demo record.** The latest synthetic preview is https://app.flo-preview-cm6.pages.dev (immutable deploy `https://e056cc9b.flo-preview-cm6.pages.dev`, built from `34b38d5`). [docs/deploy/p1-demo.md](deploy/p1-demo.md) records it honestly as **partial**:
   - On real WebKit, delete-all can fail OPFS `getDirectory` with `UnknownError`, and the app correctly shows an “could not confirm” warning.
   - Offline reload acceptance is still unverified.
     Decide whether these limits need a fix or can be documented as known issues for the gate.
2. **P1 phase check.** On the integrated `main`, run `npm run build`, `npm run check`, `npm run e2e`, `npm run test:tz`, coverage, `npm run backtest` and `npm run bench`. Then run one independent review of the P1 package against the [roadmap P1 exit criteria](plan/roadmap.md#p1--core-tracking-her). Item spec: `### p1-phase-verify` in [task-briefs.md](plan/task-briefs.md).
3. **P1 gate.** Prepare a short demo package: what's new, the preview URL, known issues and what's next. Include a brief real-iPhone smoke check. The owner then decides whether to continue to P2.

## Open follow-ups

- **`p1-export-import-followups`** (`src/backup/portable/**`):
  - handle older schema versions before the first schema bump;
  - check that the record id matches its contents on import;
  - set partner import limits after unpair (decide together with `p2-unpair-delete`);
  - neutralise leading-whitespace CSV formulas;
  - use friendlier summary names.
- **Unlocked dev mode:**
  - add a preview-only reset action for its sticky error state;
  - make the Delete All screen copy mention that it clears both local stores.
- **Deferred engine features** (owner, 2026-10-30): pause predictions during pregnancy or postpartum, and support pregnancy without a last-period date.
- **Primary checkout `node_modules` is out of sync with the lockfile.** Vitest 4.1.11 is installed instead of 4.1.12, and `@vitest/coverage-v8`, `fake-indexeddb` and `happy-dom` are missing. `npm run dev` works, but `npm run check` needs `npm ci --ignore-scripts`, which restores the approved lockfile. This also restores the coverage provider, so line coverage has not yet been measured in the primary checkout.
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
