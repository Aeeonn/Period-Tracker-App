# Verification strategy and quality gates (Step 8)

**Status:** Stage E revision, 2026-10-02 (Stage C draft corrected after the Stage D critique; see [stage-e-resolution.md](stage-e-resolution.md)). **Nothing in this file has been run.** No phone benchmarks, sandbox fixtures, security proofs or test suites exist yet. Phase 0 builds them. All test commands are run by crewmates (implementers, verifiers, integration and deploy tasks), never by the first mate.

## 1. Test pyramid and tools

| Layer | Tool (exact versions pinned in P0) | What it covers | Command |
|---|---|---|---|
| Unit | Vitest | All modules; pure engine; crypto wrappers; repositories | `npm run test` |
| Property-based | `fast-check` in Vitest | Engine invariants E1–E7; consent property CR-08; sync merge commutativity and idempotence; LocalDate round trips | `npm run test` |
| Golden vectors | Vitest table tests reading `tests/golden/*.json` | **Every TV-* vector in [algorithms-spec.md](algorithms-spec.md)**, transcribed exactly as written there. Algorithm auditors re-derive them independently before reading the code | `npm run test:golden` |
| Backtesting | `tools/backtest` (Node + tsx) | A18: MAE, ±1/±2 days, coverage, width vs the B28 and BAVG baselines on synthetic suites | `npm run backtest` |
| Component | Vitest + `@testing-library/preact` + happy-dom | Screens and components; copy lint on rendered strings | `npm run test` |
| End-to-end | Playwright **WebKit** with iPhone device descriptors (a small iPhone such as SE 3rd gen and a 6.1" model, from the pinned Playwright's descriptor list) | User journeys; three-tap rule; offline; update; sharing journeys with two browser contexts as two devices | `npm run e2e` |
| Offline and update | Playwright (`context.setOffline`, two built versions served one after the other) | Offline boot; SW update with pending writes; no data loss | `npm run e2e -- --grep @sw` |
| Migration | Vitest with fake-indexeddb, plus Playwright on real WebKit IndexedDB | Fixtures for every schema version; idempotence; abort safety | `npm run test:migrations` |
| Crypto | Vitest (Node WebCrypto) plus Playwright WebKit | Round trip; wrong passphrase; tamper detection (AAD); NIST/RFC known-answer tests where they exist (HKDF RFC 5869, PBKDF2 RFC 6070-style for SHA-256) | `npm run test:crypto` |
| Backup | Vitest plus Playwright | Export → wipe → restore equals the original; wrong code; truncated file | `npm run test -- backup` |
| Permissions and consent | Vitest (crypto level) plus Playwright (two contexts) | CR-01 to CR-21 (T-CON-*) | `npm run test:consent` |
| Two-device sync and conflicts | Vitest with an in-memory relay; Playwright with two contexts plus the local relay | Merge, tombstones, conflict copies, offline queues | `npm run test:sync` |
| Relay | Vitest against the Worker run locally (wrangler/Miniflare local mode, dev dependency) with local D1 | Signature checks, roles, nonces, quotas, deletion | `npm run relay:test` |
| Pairing, revocation, rotation, unpairing | Playwright (two contexts) | Full flows; replay and swap attacks | `npm run e2e -- --grep @pairing` |
| Time zones | Vitest with `TZ=` and Playwright `timezoneId` | A0 vectors; logs across DST; travel scenario | `npm run test:tz` (matrix: Pacific/Auckland, America/New_York, Europe/Berlin, UTC, America/Los_Angeles) |
| Accessibility | `@axe-core/playwright` on every screen in light and dark | WCAG 2.2 AA automated subset: 0 serious or critical | `npm run e2e -- --grep @a11y` |
| Performance | Build size check; Vitest bench; Playwright traces with CPU throttling | Budgets in [architecture.md §8](architecture.md#8-performance-budgets-verified-in-p0-on-real-phones-playwright-measures-cpu-throttled-proxies-in-ci) | `npm run check:size`, `npm run bench` |
| No unexpected network | Playwright request recorder across all journeys | Every request origin must be in `tools/allowed-endpoints.json` (T-NET-01) | `npm run e2e -- --grep @network` |
| Screenshots | Playwright screenshots on the iPhone descriptors, light and dark, synthetic data only | Visual review artefacts for the UX verifier (not pixel-diff gating) | `npm run e2e:shots` |
| Static checks | `tsc --noEmit`, ESLint (with bans: `innerHTML`, `geolocation`, `console` in src, `Date` constructed from a `LocalDate`), copy lint, `check:deps`, `check:secrets`, `check:no-real-data` | Code and supply chain | `npm run check` |

**Coverage targets.** Line coverage of at least 95% for `engine`, `crypto`, `data`, `share`, `sync`, `pairing` and `backup`, and at least 80% overall. Coverage is a floor, not proof.

## 2. Test catalogue (IDs referenced by the plan)

| ID | Test |
|---|---|
| T-ENG-01 | Golden vectors TV-D*, TV-E*, TV-P*, TV-L*, TV-F*, TV-W*, TV-K*, TV-I1, TV-A1 (P1 scope) |
| T-ENG-02 | Golden TV-H*, TV-B*, TV-M*, TV-X*, TV-T* (P3), TV-G* (P4), TV-PM*, TV-C* (P4/P5) |
| T-ENG-03 | Properties E1–E7 (fast-check, ≥1,000 runs each) |
| T-ENG-04 | Backtest on the **frozen** synthetic scenarios ([algorithms-spec.md A18](algorithms-spec.md#a18-accuracy-measurement-and-backtesting)), per scenario: *stable* and *outlier*: MAE(v1) ≤ min(MAE(B28), MAE(BAVG)) + 0.25 day; *drift*: MAE(v1) < MAE(BAVG) over the predictions after the change (hand vector TV-A2); *stable, 6+ prior cycles*: window coverage ≥ 70%; *skipped logs* and *irregular*: reported only, no pass/fail. Synthetic results never claim real-world or Flo-equivalent accuracy |
| T-ENG-05 | (P3) A12 null calibration: on ≥2,000 synthetic phase-independent histories per scenario (3, 4 and 6 cycles; 40% and 80% logging), the share of histories showing any TENDENCY for one metric is ≤ 5% (the binomial 95% interval must include or lie below 5%); the report also gives power on planted patterns |
| T-CON-01…21 | One test per consent rule CR-01…CR-21 ([security-privacy.md §2](security-privacy.md#2-consent-and-privacy-rules-testable)) |
| T-SEC-01 | Raw IndexedDB dump contains no synthetic canary string after logging canaries |
| T-SEC-02 | Lock: cold start is locked; background longer than the timeout locks; keys are dropped from memory (the state handle is null) |
| T-SEC-03 | Relay DB (local D1) dump contains no canary; every body parses as an envelope |
| T-SEC-04 | `_headers` contains the exact CSP and headers; a preview response check confirms the deployed headers |
| T-SEC-05 | `check:deps`: exact pins, lockfile integrity, licence allowlist, no high or critical audit findings |
| T-SEC-06 | XSS: content cards and user notes containing `<script>`/`onerror` payloads render as text |
| T-SEC-07 | Real device: passkey PRF unlock works offline and fails safely when cancelled (FB-07) |
| T-SEC-08 | Deployed-asset integrity: every file served by a preview (or later production) origin byte-equals the build output, so no host feature injected a script or third-party origin (for example analytics or email obfuscation) |
| T-NET-01 | Network allowlist across all journeys |
| T-DATE-01 | Time-zone matrix and DST vectors (A0) |
| T-MIG-01 | v(N−1) fixture → vN, idempotent, abort-safe, export equality |
| T-SW-01 | Offline cold start shows Today after unlock |
| T-SW-02 | A pending write during update is never lost; the old cache is removed only after activation; IndexedDB is untouched by the SW |
| T-SW-03 | Newer schema than code → read-only mode, no writes |
| T-BAK-01 | JSON and CSV export → import round trip is equal (synthetic two-year dataset) |
| T-BAK-02 | Encrypted backup → wipe → restore with the passphrase, and with the recovery code; a wrong secret fails cleanly |
| T-BAK-03 | Restore test leaves the DB unchanged |
| T-BAK-04 | His backups and exports contain none of her shared projections (plaintext or ciphertext) and no category keys; his backup contains only couple entries he wrote (canary scan of the files) |
| T-SYNC-01 | Merge is commutative, associative and idempotent (property test) |
| T-SYNC-02 | Concurrent edits → winner by HLC; the loser lands in conflict copies (never dropped) |
| T-SYNC-03 | Offline queue survives restart and replays in order |
| T-SYNC-04 | Tombstone horizon exceeded → full resync without resurrecting deleted entries |
| T-PAIR-01 | Pairing happy path; safety codes match |
| T-PAIR-02 | Attacker-aware pairing, with an attacker who has seen every QR code or pairing file: (a) substituted keys in QR-B → the two safety codes differ and confirming a mismatch aborts; (b) a revealed nonce that does not match QR-A's commitment → his phone aborts; (c) her phone refuses to reveal its nonce before it has recorded QR-B; (d) changing any transcript field changes the code (property test); (e) QR-A carries no secret (field allowlist) |
| T-PAIR-03 | Expired or reused session is rejected |
| T-PAIR-04 | Revoke → rotation → his old key cannot open new slots; relay old slots deleted |
| T-PAIR-05 | Unpair from either side → his phone purges her projections; couple entries follow the AP-08 default |
| T-RELAY-01 | Unsigned, expired, replayed or wrong-role requests → 401/403; quota error → client queues |
| T-RELAY-02 | Relay metadata minimisation: Workers logs/observability off and no Logpush or tail consumer in the committed and deployed configuration; relay source has no `console.*` and never reads the client IP or `cf` geolocation fields; D1 schema has no IP, user-agent or precise wall-clock columns (cursors are sequence numbers); slot and record ids are opaque. This minimises, but cannot remove, what the account owner and Cloudflare can see (security-privacy.md T13) |
| T-UX-01 | Three-tap rule: period start (1), flow (2), symptom (2), mood (2) from Today |
| T-UX-02 | Uncertainty shown on every prediction surface (window plus "Why?") |
| T-UX-03 | Copy lint: banned phrases are absent from all strings and content |
| T-UX-04 | No "safe day" or "zero chance" in any screen, insight or notification (search of every rendered state from the synthetic journeys), including every A5 suppression category |
| T-UX-05 | Operator disclosure: onboarding (both roles) and Sharing help show the fixed text saying who runs the hosting and relay and what that operator could technically see or change (security-privacy.md PR-08) |
| T-A11Y-01 | axe: 0 serious or critical on every screen in light and dark; targets ≥24 px (design 44) |
| T-PERF-01 | Size, engine bench and interaction budgets |
| T-CONTENT-01 | Every content card has ≥1 source with URL and access date, a `lastReviewed` value, and passes the copy lint |
| T-REM-01 | In-app reminder evaluation (during bleeding, symptom log, custom) and generic push text |

## 3. Constitution enforcement matrix (every Section 3 and 4 rule)

| ID | Rule | Enforced by | Checked by |
|---|---|---|---|
| S3-01 | Two iPhones; her phone logs; his shows the partner view; both add couple entries | Role chosen at onboarding; partner mode has no logging API ([architecture.md §4.4](architecture.md#44-permissions)) | T-CON-07, T-PAIR-01, phase demo smoke |
| S3-02 | iPhone Safari PWA reachable from anywhere and fully usable offline | Cloudflare Pages + SW precache; local-first data; preview URLs from the `*-deploy` items | T-SW-01, FB-03, T-SEC-08, smoke checklist |
| S3-03 | $0 recurring; no always-on home server; free tiers only see ciphertext; can move away | Storage decision; hard-$0 gate | FB-01, T-SEC-03, ADR-0003 review at gate-p0 |
| S3-04 | Health data only on storage we control, E2EE including sync | Envelopes; key hierarchy | T-SEC-01, T-SEC-03, T-CON-08 |
| S3-05 | AI is local-only and rule-based; no cloud AI | No AI dependency; network allowlist | T-NET-01, `check:deps`, reviewer |
| S3-06 | Sub-agent models with explicit IDs, high or above | [agent-operating-model.md](agent-operating-model.md); `crew-dispatch.json` | p0-dispatch-validate report; startup checks in every task |
| S3-07 | Firstmate backlog is the source of truth; GitHub board optional | [backlog-import.md](backlog-import.md) | Consistency check; gate review |
| S3-08 | Stop for approval at the 6 checkpoints | Captain-held gates (`p0-approvals` at import; the others when actionable); concrete per-item answers for accounts, credentials, deploys and money (plan.md §18 B); no default from plan approval | Backlog holds; first mate procedure; consistency check X5 |
| S3-09 | Workspace | The registered `~/code/flo` local-only project (supersedes the prompt's old `flo_remade` path; intake record) | Phase 0 setup check |
| S4-1 | Her data, her control (all sub-rules) | CR-01…CR-21 | T-CON-01…21 |
| S4-2 | Privacy by design (all sub-rules) | PR-01…PR-08 | T-NET-01, `check:*`, T-SEC-03, T-SEC-08, T-RELAY-02, T-UX-05, reviewer |
| S4-3 | Security: encryption at rest, lock, auto-lock, CSP, dependencies, delete-all | SR-01…SR-08 | T-SEC-01…07, T-CON-20 |
| S4-4a | Informational only, never a diagnosis | Copy rules; checker output tiers | T-UX-03, medical fact-check verify |
| S4-4b | No "safe days"; never implies birth control; always shows pregnancy is possible plus uncertainty | A5; permanent fertility line | T-UX-04, T-ENG-03 (E4) |
| S4-4c | Every prediction shows its uncertainty | E3; UI pattern §6 of the UX spec | T-UX-02 |
| S4-4d | Warning patterns → clinician guidance from guidelines | A11 rules with a source per rule | T-ENG-01 (TV-W*), medical-safety verify |
| S4-4e | Original cited education, including contraception, EC, test timing, STI prevention | Content plan, card schema | T-CONTENT-01, medical-content verify |
| S4-5 | Intellectual property: functionality not assets; own name | Original content; placeholder name pending approval | Reviewer checklist (no Flo strings or assets); AP-20 |
| S4-6a | Local calendar dates; no UTC/DST errors | A0 | T-DATE-01 |
| S4-6b | Versioned schema; tested migrations; updates never lose data | §5.3 and §7 of the architecture | T-MIG-01, T-SW-02, T-SW-03 |
| S4-6c | Sync never silently loses either person's edits | Single-writer records plus conflict copies | T-SYNC-02, T-SYNC-04 |
| S4-7a | Logging ≤3 taps from Today | Quick-log design | T-UX-01 |
| S4-7b | Partner tips from her logs, not stereotypes | Tips built only from projections and support cards; copy lint | T-CON-16, T-UX-03, UX verifier |
| S4-7c | WCAG 2.2 AA, large targets, light and dark | Design tokens | T-A11Y-01, VoiceOver smoke |
| S4-8 | Full export (JSON, CSV) and import, plus encrypted backup and restore, tested end to end | Backup module (backup retention pending AP-01) | T-BAK-01…03 |
| S4-9 | Mainstream typed stack, strict TS, automated tests | ADR-0001 | `tsc --noEmit` in `npm run check`; coverage |
| S4-10 | No real health data in repo, issues, logs, screenshots or fixtures | Synthetic generator; checks | `check:no-real-data`, reviewer, brief rule |

## 4. Definition of Ready (task)

A task is Ready when all of these hold:
- A brief exists in [task-briefs.md](task-briefs.md) with:
  - goal;
  - owned files and files it must not touch;
  - interfaces;
  - Given/When/Then acceptance criteria;
  - test commands;
  - constitution rules;
  - risk, route, model and effort.
- Every `blocked-by` dependency is Done, and the phase gate is approved.
- High-risk tasks: the matching verify task is filed as a dependency of the integration task or the gate.
- No open product question touches this task.
- Every dependency is **landed** on local `main` (see [agent-operating-model.md §3](agent-operating-model.md#3-the-loop-for-every-task)); the task branch starts from that `main`.
- Required credentials or approvals exist. Otherwise the task is *blocked*, which does not count as a failed round.

## 5. Definition of Done (task)

A task is Done when all of these hold:
- Every acceptance criterion passes, using the brief's commands, run by the implementer.
- `npm run check` is green. The e2e subset named in the brief is green.
- Exactly **one Conventional Commit** on the task branch, rebased on the current `main`, with `npm run check` re-run after the rebase. The task is Done when the first mate has landed it through the guarded local fast-forward path with the configured merge authority. If behaviour or a decision changed, the task report proposes the ADR text and the progress-log line. **Only the phase's integration task writes `docs/adr/*` and `docs/progress.md`**, which avoids file conflicts within a wave.
- No synthetic-data rule violations and no secrets.
- High-risk: the independent verify report says **PASS** for this exact revision. Low-risk UI: included in the wave review.
- The report follows the format (≤15 lines): revision, files changed, evidence, open issues.

## 6. Phase gates

Every `gate-phase-N` is a captain hold. It is approved only when all of these hold:
1. All phase tasks are Done, and all required verify reports PASS on the final integrated revision.
2. On the integrated `main`: `npm run check`, `npm run e2e`, the TZ matrix, a11y and network all pass; P1 onward also needs `npm run backtest` output.
3. Coverage targets are met, and performance budgets are met (or deviations are listed).
4. The phase-demo package is delivered:
   - what's new;
   - the preview URL with synthetic data produced by `pN-demo-deploy` and recorded in `docs/deploy/pN-demo.md`;
   - screenshots;
   - the test and verification report;
   - known issues;
   - decisions made;
   - what's next.
5. Both people completed the real-iPhone smoke checklist (§7), with issues recorded.
6. The captain says "continue". The first mate records it.

The first mate sets the `gate-phase-N` captain hold only when the gate is actionable, that is, when `pN-phase-verify` is Done; it is not held at import ([backlog-import.md](backlog-import.md#import-procedure-first-mate-after-approval)).

## 7. Real-iPhone smoke checklist (both phones, at every phase demo; synthetic data only)

Record the iOS version and iPhone model of each phone. Do not use real health data; use the demo data generator.

**Install and offline**
1. Install from Safari using the preview URL in `docs/deploy/pN-demo.md`: Share → Add to Home Screen → Open as Web App. The app opens full-screen and shows the "Preview — synthetic data only" banner.
2. Airplane mode → force-quit → reopen. The app opens offline and unlocks.

**Logging and lock**

3. Generate demo data. Log a period start (1 tap) and a symptom (2 taps), then check both.
4. Background the app for longer than the timeout. It locks. Quick-hide locks instantly.

**Predictions and copy**

5. Today shows a window and the "No day is 'safe'…" line. Calendar marks are understandable without colour.

**Accessibility**

6. With VoiceOver on, a day cell reads its full meaning. With large text, nothing is clipped.

**Sharing (P2+)**

7. Pair in person (three scans: he scans her first code, she scans his, he scans her confirmation code). The 6-digit safety codes match. His view says "Nothing shared yet".
8. She enables one category. "See what he sees" matches his screen.
9. She pauses: his view shows "Paused by her" within one sync. She revokes: his view loses the category, and the revoke message was shown to her.
10. He writes a love note. It shows only in the display mode she chose.

**Backup and update**

11. Back up to Files. Delete all data. Restore with the recovery code. The data is back.
12. After an app update is deployed: the "Update ready" chip appears, restart works, and no data is lost.

**Notifications (P2+)**

13. With push enabled, the generic text appears on the lock screen with no health details.

**Report**

14. Note anything confusing in plain words and send it to the first mate.

## 8. Mechanical checks vs independent critique

[consistency-check.md](consistency-check.md) records the **mechanical** checks run on this plan, with commands and results. They do not replace the **Stage D** plan critique (an independent Opus scout, report at `~/firstmate/data/flo-plan-critique/report.md`). The Stage E fixes for its findings are recorded in [stage-e-resolution.md](stage-e-resolution.md). Neither is a security, medical or device proof, and neither is plan approval.
