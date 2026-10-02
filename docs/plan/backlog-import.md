# Backlog import — P0–P2 (Step 10)

**Status:** Stage E revision, 2026-10-02 (Stage C draft corrected after the Stage D critique; see [stage-e-resolution.md](stage-e-resolution.md)). **Do not import yet.** The first mate imports this file only **after Stage F approval** (`flo-plan-approval`). Crewmates never import it. Implementation tasks are deliberately not in the live backlog now.

- **What it contains.** One item per P0–P2 implementation task, deploy task, verify task and gate:
  - **98** items in total;
  - **53** ship tasks (including 6 preview-deploy items: `p0-relay-spike`, `p0-probe-deploy`, `p0-demo-deploy`, `p1-demo-deploy`, `p2-preview-relay-deploy`, `p2-demo-deploy`, labelled `deploy` except the spike);
  - **40** scout tasks;
  - **5** gates.
- **The briefs** are in [task-briefs.md](task-briefs.md). Each item's `brief` link gives the self-contained brief that the first mate turns into a `bin/fm-brief.sh` launch brief.
- **Field meanings.**
  - `kind` is the Firstmate task kind (`ship`, `scout` or `gate`).
  - `type` is the plan type (feature, verify, gate or chore). Deploy items are chores with the label `deploy`.
  - `wave` is the scheduling group. At most 3 crewmates run at once. Foundation tasks run alone. Tasks in the same wave never own the same file, and no two tasks without a dependency path between them own the same file.
  - `owns` lists repository paths. Verify and gate items own none; their reports go to `~/firstmate/data/<id>/report.md`.
  - `blocked-by` means **landed**: a ship item is Done only when the first mate has landed it on local `main` through `bin/fm-merge-local.sh`; a verify item is Done when its PASS is recorded *and* the verified ship task has landed with exactly the reviewed commit ([agent-operating-model.md §3](agent-operating-model.md#3-the-loop-for-every-task)). So every dependency edge means the dependent starts from a `main` that already contains its predecessors.
- **Checks.** The dependency graph, wave ownership, acceptance-file ownership, test assignment, feature coverage, hold timing and deploy traceability are checked mechanically by [tools/check_plan.py](tools/check_plan.py) and recorded in [consistency-check.md](consistency-check.md).

## Import procedure (first mate, after approval)

1. Confirm `flo-plan-approval` is resolved and the approval-list answers are recorded.
2. Run the commands in the [import script](#import-script) **in order**. The order is topological, because `--blocked-by` targets must already exist.
3. The script holds **only `p0-approvals`** at import, because it is the only gate the captain can act on immediately. Every other gate is held **when it becomes actionable**, that is, when its last dependency is Done. Until then it stays blocked by its dependencies, so nothing can pass it, and it does not clutter the captain's view:

   | Gate | Hold when | Command |
   |---|---|---|
   | `p0-device-feasibility` | `p0-probe-deploy` is Done | `"$FM/fm-captain-hold.sh" hold p0-device-feasibility --reason "Run the probe on both iPhones and record results (captain + partner)"` |
   | `gate-phase-0` | `p0-phase-verify` is Done | `"$FM/fm-captain-hold.sh" hold gate-phase-0 --reason "Phase 0 gate: demo and captain approval"` |
   | `gate-phase-1` | `p1-phase-verify` is Done | `"$FM/fm-captain-hold.sh" hold gate-phase-1 --reason "Phase 1 gate: demo and captain approval"` |
   | `gate-phase-2` | `p2-phase-verify` is Done | `"$FM/fm-captain-hold.sh" hold gate-phase-2 --reason "Phase 2 gate: demo and captain approval"` |

4. Each item's `route` names the model. Model and effort are passed explicitly at dispatch. Verify the model and thinking at worker startup.
5. Record in each ship item's note the delivery mode (`local-only`) and the current `yolo` posture, as Firstmate requires at intake.

## Items

### p0-approvals

- title: Collect all P0 account, credential, install and deployment approvals
- kind: gate
- type: gate
- phase: P0
- wave: P0-W1
- risk: high
- features: —
- blocked-by: flo-plan-approval
- owns: —
- tests: —
- route: captain hold (first mate; no crewmate)
- labels: phase:P0, type:gate, risk:high, wave:P0-W1
- brief: [task-briefs.md#p0-approvals](task-briefs.md#p0-approvals)

### p0-dispatch-validate

- title: Validate crew-dispatch routing rules, model availability and actual thinking
- kind: scout
- type: chore
- phase: P0
- wave: P0-W1
- risk: low
- features: —
- blocked-by: flo-plan-approval
- owns: —
- tests: —
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:chore, risk:low, wave:P0-W1
- brief: [task-briefs.md#p0-dispatch-validate](task-briefs.md#p0-dispatch-validate)

### p0-agents-skills

- title: Project AGENTS.md (<150 lines) and reusable skills
- kind: ship
- type: chore
- phase: P0
- wave: P0-W1
- risk: low
- features: —
- blocked-by: flo-plan-approval
- owns: `AGENTS.md`, `.agents/skills/task-brief/SKILL.md`, `.agents/skills/verification-protocol/SKILL.md`, `.agents/skills/cycle-math/SKILL.md`, `docs/progress.md`
- tests: —
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:chore, risk:low, wave:P0-W1
- brief: [task-briefs.md#p0-agents-skills](task-briefs.md#p0-agents-skills)

### p0-verifier-sandbox-proof

- title: Prove verifier tool/OS safeguards on a disposable fixture
- kind: ship
- type: chore
- phase: P0
- wave: P0-W2
- risk: high
- features: —
- blocked-by: p0-approvals
- owns: `tools/verifier-sandbox/README.md`, `tools/verifier-sandbox/sandbox.json`, `tools/verifier-sandbox/fixture-proof.sh`, `docs/plan/agent-operating-model.md`
- tests: —
- route: rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p0-verifier-sandbox-proof-verify` before merge
- labels: phase:P0, type:chore, risk:high, wave:P0-W2
- brief: [task-briefs.md#p0-verifier-sandbox-proof](task-briefs.md#p0-verifier-sandbox-proof)

### p0-verifier-sandbox-proof-verify

- title: Verify prove verifier tool/OS safeguards on a disposable fixture
- kind: scout
- type: verify
- phase: P0
- wave: P0-W3
- risk: high
- features: —
- blocked-by: p0-verifier-sandbox-proof
- owns: —
- tests: —
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W3
- brief: [task-briefs.md#p0-verifier-sandbox-proof-verify](task-briefs.md#p0-verifier-sandbox-proof-verify)

### p0-toolchain

- title: Pinned TypeScript/Vite/Vitest/Playwright toolchain and local check scripts
- kind: ship
- type: chore
- phase: P0
- wave: P0-W2
- risk: high
- features: —
- blocked-by: p0-approvals, p0-agents-skills
- owns: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `tools/check-deps.ts`, `tools/check-secrets.ts`, `tools/check-no-real-data.ts`, `tools/copy-lint.ts`, `tools/check-size.ts`, `tools/allowed-licenses.json`, `tests/golden/README.md`
- tests: T-SEC-05, T-UX-03, T-CON-14
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-toolchain-verify` before merge
- labels: phase:P0, type:chore, risk:high, wave:P0-W2
- brief: [task-briefs.md#p0-toolchain](task-briefs.md#p0-toolchain)

### p0-toolchain-verify

- title: Verify pinned TypeScript/Vite/Vitest/Playwright toolchain and local check scripts
- kind: scout
- type: verify
- phase: P0
- wave: P0-W3
- risk: high
- features: —
- blocked-by: p0-toolchain
- owns: —
- tests: T-SEC-05, T-UX-03, T-CON-14
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W3
- brief: [task-briefs.md#p0-toolchain-verify](task-briefs.md#p0-toolchain-verify)

### p0-relay-spike

- title: Cloudflare free-plan relay spike and live preview push-test endpoint (FB-01, FB-02, FB-09; serves FB-06)
- kind: ship
- type: chore
- phase: P0
- wave: P0-W4
- risk: high
- features: —
- blocked-by: p0-approvals, p0-toolchain-verify
- owns: `relay-spike/**`, `docs/deploy/p0-relay-spike.md`
- tests: T-RELAY-02
- route: rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p0-relay-spike-verify` before merge
- labels: phase:P0, type:chore, risk:high, wave:P0-W4
- brief: [task-briefs.md#p0-relay-spike](task-briefs.md#p0-relay-spike)

### p0-relay-spike-verify

- title: Verify cloudflare free-plan relay spike and live preview push-test endpoint
- kind: scout
- type: verify
- phase: P0
- wave: P0-W5
- risk: high
- features: —
- blocked-by: p0-relay-spike
- owns: —
- tests: T-RELAY-02
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W5
- brief: [task-briefs.md#p0-relay-spike-verify](task-briefs.md#p0-relay-spike-verify)

### p0-feasibility-probe

- title: Device feasibility probe page (synthetic, no health data)
- kind: ship
- type: feature
- phase: P0
- wave: P0-W4
- risk: medium
- features: —
- blocked-by: p0-toolchain-verify
- owns: `probe/index.html`, `probe/probe.ts`, `probe/README.md`
- tests: T-NET-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:feature, risk:medium, wave:P0-W4
- brief: [task-briefs.md#p0-feasibility-probe](task-briefs.md#p0-feasibility-probe)

### p0-probe-deploy

- title: Deploy the synthetic feasibility probe to a Cloudflare Pages preview URL
- kind: ship
- type: chore
- phase: P0
- wave: P0-W6
- risk: medium
- features: —
- blocked-by: p0-feasibility-probe, p0-relay-spike-verify
- owns: `tools/deploy/**`, `docs/deploy/p0-probe.md`
- tests: T-SEC-08
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:chore, risk:medium, wave:P0-W6, deploy
- brief: [task-briefs.md#p0-probe-deploy](task-briefs.md#p0-probe-deploy)

### p0-device-feasibility

- title: Run the probe on both iPhones and record results (captain + partner)
- kind: gate
- type: gate
- phase: P0
- wave: P0-W7
- risk: high
- features: —
- blocked-by: p0-probe-deploy
- owns: —
- tests: —
- route: captain hold (first mate; no crewmate)
- labels: phase:P0, type:gate, risk:high, wave:P0-W7
- brief: [task-briefs.md#p0-device-feasibility](task-briefs.md#p0-device-feasibility)

### p0-contracts

- title: Shared contracts: types, enums, engine/crypto/store/share/sync interfaces
- kind: ship
- type: feature
- phase: P0
- wave: P0-W5
- risk: high
- features: —
- blocked-by: p0-toolchain-verify
- owns: `src/contracts/**`
- tests: —
- route: rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p0-contracts-verify` before merge
- labels: phase:P0, type:feature, risk:high, wave:P0-W5
- brief: [task-briefs.md#p0-contracts](task-briefs.md#p0-contracts)

### p0-contracts-verify

- title: Verify shared contracts: types, enums, engine/crypto/store/share/sync interfaces
- kind: scout
- type: verify
- phase: P0
- wave: P0-W6
- risk: high
- features: —
- blocked-by: p0-contracts
- owns: —
- tests: —
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W6
- brief: [task-briefs.md#p0-contracts-verify](task-briefs.md#p0-contracts-verify)

### p0-design-tokens

- title: Design tokens and base components (light/dark, 44px targets)
- kind: ship
- type: feature
- phase: P0
- wave: P0-W7
- risk: low
- features: —
- blocked-by: p0-contracts-verify
- owns: `src/ui/tokens.css`, `src/ui/tokens.ts`, `src/ui/components/base/**`
- tests: T-A11Y-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:feature, risk:low, wave:P0-W7
- brief: [task-briefs.md#p0-design-tokens](task-briefs.md#p0-design-tokens)

### p0-localdate

- title: LocalDate library (A0) with time-zone and DST tests
- kind: ship
- type: feature
- phase: P0
- wave: P0-W8
- risk: high
- features: —
- blocked-by: p0-contracts-verify
- owns: `src/lib/localdate/**`, `tests/golden/a0-dates.json`
- tests: T-DATE-01, T-ENG-01
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-localdate-verify` before merge
- labels: phase:P0, type:feature, risk:high, wave:P0-W8
- brief: [task-briefs.md#p0-localdate](task-briefs.md#p0-localdate)

### p0-localdate-verify

- title: Verify localDate library (A0) with time-zone and DST tests
- kind: scout
- type: verify
- phase: P0
- wave: P0-W9
- risk: high
- features: —
- blocked-by: p0-localdate
- owns: —
- tests: T-DATE-01, T-ENG-01
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W9
- brief: [task-briefs.md#p0-localdate-verify](task-briefs.md#p0-localdate-verify)

### p0-crypto-core

- title: WebCrypto primitives, envelopes and key hierarchy helpers
- kind: ship
- type: feature
- phase: P0
- wave: P0-W8
- risk: high
- features: —
- blocked-by: p0-contracts-verify
- owns: `src/crypto/primitives/**`, `src/crypto/envelope/**`, `src/crypto/keyring/**`
- tests: T-SEC-01
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-crypto-core-verify` before merge
- labels: phase:P0, type:feature, risk:high, wave:P0-W8
- brief: [task-briefs.md#p0-crypto-core](task-briefs.md#p0-crypto-core)

### p0-crypto-core-verify

- title: Verify webCrypto primitives, envelopes and key hierarchy helpers
- kind: scout
- type: verify
- phase: P0
- wave: P0-W9
- risk: high
- features: —
- blocked-by: p0-crypto-core
- owns: —
- tests: T-SEC-01
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W9
- brief: [task-briefs.md#p0-crypto-core-verify](task-briefs.md#p0-crypto-core-verify)

### p0-app-shell

- title: App shell, manifest, icons and tab layout
- kind: ship
- type: feature
- phase: P0
- wave: P0-W8
- risk: low
- features: —
- blocked-by: p0-design-tokens
- owns: `index.html`, `public/manifest.webmanifest`, `public/icons/**`, `src/ui/layout/**`
- tests: T-A11Y-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:feature, risk:low, wave:P0-W8
- brief: [task-briefs.md#p0-app-shell](task-briefs.md#p0-app-shell)

### p0-service-worker

- title: Service worker: precache, offline boot, safe update protocol
- kind: ship
- type: feature
- phase: P0
- wave: P0-W9
- risk: high
- features: —
- blocked-by: p0-app-shell
- owns: `src/sw/**`, `tools/build-precache.ts`
- tests: T-SW-01, T-SW-02
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-service-worker-verify` before merge
- labels: phase:P0, type:feature, risk:high, wave:P0-W9
- brief: [task-briefs.md#p0-service-worker](task-briefs.md#p0-service-worker)

### p0-service-worker-verify

- title: Verify service worker: precache, offline boot, safe update protocol
- kind: scout
- type: verify
- phase: P0
- wave: P0-W10
- risk: high
- features: —
- blocked-by: p0-service-worker
- owns: —
- tests: T-SW-01, T-SW-02
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W10
- brief: [task-briefs.md#p0-service-worker-verify](task-briefs.md#p0-service-worker-verify)

### p0-db-store

- title: Encrypted IndexedDB record store, opaque ids and migration framework
- kind: ship
- type: feature
- phase: P0
- wave: P0-W10
- risk: high
- features: —
- blocked-by: p0-crypto-core-verify, p0-localdate-verify
- owns: `src/data/store/**`, `src/data/migrations/**`, `tests/fixtures/schema/**`
- tests: T-SEC-01, T-MIG-01, T-SW-03
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-db-store-verify` before merge
- labels: phase:P0, type:feature, risk:high, wave:P0-W10
- brief: [task-briefs.md#p0-db-store](task-briefs.md#p0-db-store)

### p0-db-store-verify

- title: Verify encrypted IndexedDB record store, opaque ids and migration framework
- kind: scout
- type: verify
- phase: P0
- wave: P0-W11
- risk: high
- features: —
- blocked-by: p0-db-store
- owns: —
- tests: T-SEC-01, T-MIG-01, T-SW-03
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W11
- brief: [task-briefs.md#p0-db-store-verify](task-briefs.md#p0-db-store-verify)

### p0-csp-network

- title: Security headers, CSP and network-allowlist e2e test
- kind: ship
- type: feature
- phase: P0
- wave: P0-W10
- risk: high
- features: —
- blocked-by: p0-app-shell, p0-toolchain-verify
- owns: `public/_headers`, `tools/allowed-endpoints.json`, `tests/e2e/p0-network.spec.ts`, `tests/e2e/p0-headers.spec.ts`
- tests: T-SEC-04, T-NET-01
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-csp-network-verify` before merge
- labels: phase:P0, type:feature, risk:high, wave:P0-W10
- brief: [task-briefs.md#p0-csp-network](task-briefs.md#p0-csp-network)

### p0-csp-network-verify

- title: Verify security headers, CSP and network-allowlist e2e test
- kind: scout
- type: verify
- phase: P0
- wave: P0-W11
- risk: high
- features: —
- blocked-by: p0-csp-network
- owns: —
- tests: T-SEC-04, T-NET-01
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W11
- brief: [task-briefs.md#p0-csp-network-verify](task-briefs.md#p0-csp-network-verify)

### p0-synthetic-data

- title: Seeded synthetic data generator and fixture provenance rules
- kind: ship
- type: feature
- phase: P0
- wave: P0-W11
- risk: medium
- features: —
- blocked-by: p0-contracts-verify, p0-localdate-verify
- owns: `tools/synthetic/**`
- tests: —
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:feature, risk:medium, wave:P0-W11
- brief: [task-briefs.md#p0-synthetic-data](task-briefs.md#p0-synthetic-data)

### p0-lock

- title: Passphrase setup, recovery code, unlock and auto-lock
- kind: ship
- type: feature
- phase: P0
- wave: P0-W12
- risk: high
- features: F-024
- blocked-by: p0-db-store-verify
- owns: `src/lock/core/**`, `src/ui/screens/lock/core/**`
- tests: T-SEC-02
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-lock-verify` before merge
- labels: phase:P0, type:feature, risk:high, wave:P0-W12
- brief: [task-briefs.md#p0-lock](task-briefs.md#p0-lock)

### p0-lock-verify

- title: Verify passphrase setup, recovery code, unlock and auto-lock
- kind: scout
- type: verify
- phase: P0
- wave: P0-W13
- risk: high
- features: F-024
- blocked-by: p0-lock
- owns: —
- tests: T-SEC-02
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W13
- brief: [task-briefs.md#p0-lock-verify](task-briefs.md#p0-lock-verify)

### p0-lowrisk-review

- title: P0 wave review of low/medium-risk work
- kind: scout
- type: verify
- phase: P0
- wave: P0-W12
- risk: low
- features: —
- blocked-by: p0-design-tokens, p0-app-shell, p0-feasibility-probe, p0-synthetic-data, p0-agents-skills, p0-probe-deploy
- owns: —
- tests: T-A11Y-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:verify, risk:low, wave:P0-W12
- brief: [task-briefs.md#p0-lowrisk-review](task-briefs.md#p0-lowrisk-review)

### p0-integration

- title: P0 integration: shell + lock + store wiring, feasibility record
- kind: ship
- type: chore
- phase: P0
- wave: P0-W14
- risk: medium
- features: —
- blocked-by: p0-lock-verify, p0-service-worker-verify, p0-csp-network-verify, p0-lowrisk-review, p0-device-feasibility, p0-verifier-sandbox-proof-verify, p0-dispatch-validate
- owns: `src/app/**`, `tests/e2e/p0-shell.spec.ts`, `tests/e2e/p0-lock.spec.ts`, `tests/e2e/p0-offline.spec.ts`, `docs/feasibility/**`, `docs/progress.md`, `docs/adr/**`
- tests: T-SW-01, T-SEC-02
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:chore, risk:medium, wave:P0-W14
- brief: [task-briefs.md#p0-integration](task-briefs.md#p0-integration)

### p0-demo-deploy

- title: Deploy the integrated P0 build to the preview URL for the phase demo
- kind: ship
- type: chore
- phase: P0
- wave: P0-W15
- risk: medium
- features: —
- blocked-by: p0-integration
- owns: `docs/deploy/p0-demo.md`
- tests: T-SEC-04, T-NET-01, T-SEC-08
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P0, type:chore, risk:medium, wave:P0-W15, deploy
- brief: [task-briefs.md#p0-demo-deploy](task-briefs.md#p0-demo-deploy)

### p0-phase-verify

- title: P0 phase verification report
- kind: scout
- type: verify
- phase: P0
- wave: P0-W16
- risk: high
- features: —
- blocked-by: p0-demo-deploy
- owns: —
- tests: —
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P0, type:verify, risk:high, wave:P0-W16
- brief: [task-briefs.md#p0-phase-verify](task-briefs.md#p0-phase-verify)

### gate-phase-0

- title: Phase 0 gate: demo and captain approval
- kind: gate
- type: gate
- phase: P0
- wave: P0-W17
- risk: high
- features: —
- blocked-by: p0-phase-verify
- owns: —
- tests: —
- route: captain hold (first mate; no crewmate)
- labels: phase:P0, type:gate, risk:high, wave:P0-W17
- brief: [task-briefs.md#gate-phase-0](task-briefs.md#gate-phase-0)

### p1-log-repo

- title: Log repository and settings repository on the encrypted store
- kind: ship
- type: feature
- phase: P1
- wave: P1-W1
- risk: high
- features: F-009, F-013
- blocked-by: gate-phase-0
- owns: `src/data/repos/**`
- tests: T-PERF-01
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-log-repo-verify` before merge
- labels: phase:P1, type:feature, risk:high, wave:P1-W1
- brief: [task-briefs.md#p1-log-repo](task-briefs.md#p1-log-repo)

### p1-log-repo-verify

- title: Verify log repository and settings repository on the encrypted store
- kind: scout
- type: verify
- phase: P1
- wave: P1-W2
- risk: high
- features: F-009, F-013
- blocked-by: p1-log-repo
- owns: —
- tests: T-PERF-01
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P1, type:verify, risk:high, wave:P1-W2
- brief: [task-briefs.md#p1-log-repo-verify](task-briefs.md#p1-log-repo-verify)

### p1-episodes

- title: Engine A1/A3: bleeding episodes, spotting, assumed days, period length
- kind: ship
- type: feature
- phase: P1
- wave: P1-W2
- risk: high
- features: F-001, F-011
- blocked-by: gate-phase-0
- owns: `src/engine/episodes/**`, `tests/golden/p1-episodes.json`
- tests: T-ENG-01, T-ENG-03
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-episodes-verify` before merge
- labels: phase:P1, type:feature, risk:high, wave:P1-W2
- brief: [task-briefs.md#p1-episodes](task-briefs.md#p1-episodes)

### p1-episodes-verify

- title: Verify engine A1/A3: bleeding episodes, spotting, assumed days, period length
- kind: scout
- type: verify
- phase: P1
- wave: P1-W3
- risk: high
- features: F-001, F-011
- blocked-by: p1-episodes
- owns: —
- tests: T-ENG-01, T-ENG-03
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P1, type:verify, risk:high, wave:P1-W3
- brief: [task-briefs.md#p1-episodes-verify](task-briefs.md#p1-episodes-verify)

### p1-onboarding

- title: Onboarding (no account): install check, role, basics, reminders opt-in
- kind: ship
- type: feature
- phase: P1
- wave: P1-W2
- risk: medium
- features: F-020, F-015
- blocked-by: gate-phase-0
- owns: `src/ui/screens/onboarding/**`
- tests: T-A11Y-01, T-UX-05
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:feature, risk:medium, wave:P1-W2
- brief: [task-briefs.md#p1-onboarding](task-briefs.md#p1-onboarding)

### p1-quick-log

- title: Quick log sheet (≤3 taps) with undo
- kind: ship
- type: feature
- phase: P1
- wave: P1-W3
- risk: medium
- features: F-001, F-009, F-010
- blocked-by: gate-phase-0, p1-log-repo-verify
- owns: `src/ui/screens/quicklog/**`
- tests: T-UX-01, T-A11Y-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:feature, risk:medium, wave:P1-W3
- brief: [task-briefs.md#p1-quick-log](task-briefs.md#p1-quick-log)

### p1-cycle-engine

- title: Engine v1: A2 prediction, A4 fertility + suppression, A5 chance, A16 P1 modifiers, runEngine
- kind: ship
- type: feature
- phase: P1
- wave: P1-W4
- risk: high
- features: F-002, F-003, F-004, F-007, F-008, F-015, F-019, F-071, F-072
- blocked-by: p1-episodes-verify
- owns: `src/engine/cycle/**`, `src/engine/index.ts`, `src/engine/params.ts`, `tests/golden/p1-cycle.json`
- tests: T-ENG-01, T-ENG-03, T-UX-04, T-CON-15
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-cycle-engine-verify` before merge
- labels: phase:P1, type:feature, risk:high, wave:P1-W4
- brief: [task-briefs.md#p1-cycle-engine](task-briefs.md#p1-cycle-engine)

### p1-cycle-engine-verify

- title: Verify engine v1: A2 prediction, A4 fertility + suppression, A5 chance, A16 P1 modifiers, runEngine
- kind: scout
- type: verify
- phase: P1
- wave: P1-W5
- risk: high
- features: F-002, F-003, F-004, F-007, F-008, F-015, F-019, F-071, F-072
- blocked-by: p1-cycle-engine
- owns: —
- tests: T-ENG-01, T-ENG-03, T-UX-04, T-CON-15
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P1, type:verify, risk:high, wave:P1-W5
- brief: [task-briefs.md#p1-cycle-engine-verify](task-briefs.md#p1-cycle-engine-verify)

### p1-log-forms

- title: Log detail forms for every P1 tracker and tracker customization
- kind: ship
- type: feature
- phase: P1
- wave: P1-W3
- risk: medium
- features: F-009, F-010, F-011, F-012, F-013, F-014, F-105
- blocked-by: p1-log-repo-verify
- owns: `src/ui/screens/log/**`
- tests: T-A11Y-01, T-UX-03, T-SEC-06
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:feature, risk:medium, wave:P1-W3
- brief: [task-briefs.md#p1-log-forms](task-briefs.md#p1-log-forms)

### p1-calendar

- title: Calendar month/year views, day detail, overrides and cycle exclusion
- kind: ship
- type: feature
- phase: P1
- wave: P1-W4
- risk: medium
- features: F-005, F-019
- blocked-by: p1-log-repo-verify
- owns: `src/ui/screens/calendar/**`
- tests: T-A11Y-01, T-UX-02
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:feature, risk:medium, wave:P1-W4
- brief: [task-briefs.md#p1-calendar](task-briefs.md#p1-calendar)

### p1-today

- title: Today screen: cycle day, prediction window, chance card, prompts, cards
- kind: ship
- type: feature
- phase: P1
- wave: P1-W6
- risk: medium
- features: F-002, F-004, F-006, F-033
- blocked-by: p1-cycle-engine-verify
- owns: `src/ui/screens/today/**`
- tests: T-UX-01, T-UX-02, T-UX-04
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:feature, risk:medium, wave:P1-W6
- brief: [task-briefs.md#p1-today](task-briefs.md#p1-today)

### p1-content-core

- title: P1 core education cards (15) with sources and selection (A17)
- kind: ship
- type: feature
- phase: P1
- wave: P1-W4
- risk: high
- features: F-035
- blocked-by: gate-phase-0
- owns: `src/content/cards/core/**`, `src/content/sources.json`, `src/content/index.ts`
- tests: T-CONTENT-01, T-UX-03, T-CON-14, T-SEC-06
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-content-core-verify` before merge
- labels: phase:P1, type:feature, risk:high, wave:P1-W4
- brief: [task-briefs.md#p1-content-core](task-briefs.md#p1-content-core)

### p1-content-core-verify

- title: Verify p1 core education cards (15) with sources and selection (A17)
- kind: scout
- type: verify
- phase: P1
- wave: P1-W5
- risk: high
- features: F-035
- blocked-by: p1-content-core
- owns: —
- tests: T-CONTENT-01, T-UX-03, T-CON-14
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P1, type:verify, risk:high, wave:P1-W5
- brief: [task-briefs.md#p1-content-core-verify](task-briefs.md#p1-content-core-verify)

### p1-warnings-v1

- title: Engine A11 warnings v1 (W-01..W-07, W-11)
- kind: ship
- type: feature
- phase: P1
- wave: P1-W6
- risk: high
- features: F-033
- blocked-by: p1-cycle-engine-verify, p1-content-core-verify
- owns: `src/engine/warnings/**`, `tests/golden/p1-warnings.json`, `src/engine/index.ts`
- tests: T-ENG-01
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-warnings-v1-verify` before merge
- labels: phase:P1, type:feature, risk:high, wave:P1-W6
- brief: [task-briefs.md#p1-warnings-v1](task-briefs.md#p1-warnings-v1)

### p1-warnings-v1-verify

- title: Verify engine A11 warnings v1 (W-01..W-07, W-11)
- kind: scout
- type: verify
- phase: P1
- wave: P1-W7
- risk: high
- features: F-033
- blocked-by: p1-warnings-v1
- owns: —
- tests: T-ENG-01
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P1, type:verify, risk:high, wave:P1-W7
- brief: [task-briefs.md#p1-warnings-v1-verify](task-briefs.md#p1-warnings-v1-verify)

### p1-backtest

- title: Backtesting harness with baselines (A18)
- kind: ship
- type: feature
- phase: P1
- wave: P1-W6
- risk: medium
- features: F-003
- blocked-by: p1-cycle-engine-verify
- owns: `tools/backtest/**`
- tests: T-ENG-04
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:feature, risk:medium, wave:P1-W6
- brief: [task-briefs.md#p1-backtest](task-briefs.md#p1-backtest)

### p1-export-import

- title: JSON and CSV export/import
- kind: ship
- type: feature
- phase: P1
- wave: P1-W5
- risk: high
- features: F-023
- blocked-by: p1-log-repo-verify
- owns: `src/backup/portable/**`
- tests: T-BAK-01, T-BAK-04
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-export-import-verify` before merge
- labels: phase:P1, type:feature, risk:high, wave:P1-W5
- brief: [task-briefs.md#p1-export-import](task-briefs.md#p1-export-import)

### p1-export-import-verify

- title: Verify jSON and CSV export/import
- kind: scout
- type: verify
- phase: P1
- wave: P1-W7
- risk: high
- features: F-023
- blocked-by: p1-export-import
- owns: —
- tests: T-BAK-01
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P1, type:verify, risk:high, wave:P1-W7
- brief: [task-briefs.md#p1-export-import-verify](task-briefs.md#p1-export-import-verify)

### p1-delete-all

- title: Delete all my data (local crypto-erasure)
- kind: ship
- type: feature
- phase: P1
- wave: P1-W7
- risk: high
- features: F-022
- blocked-by: p1-log-repo-verify
- owns: `src/data/wipe/**`, `src/ui/screens/settings/delete/**`
- tests: T-CON-20
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-delete-all-verify` before merge
- labels: phase:P1, type:feature, risk:high, wave:P1-W7
- brief: [task-briefs.md#p1-delete-all](task-briefs.md#p1-delete-all)

### p1-delete-all-verify

- title: Verify delete all my data (local crypto-erasure)
- kind: scout
- type: verify
- phase: P1
- wave: P1-W8
- risk: high
- features: F-022
- blocked-by: p1-delete-all
- owns: —
- tests: T-CON-20
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P1, type:verify, risk:high, wave:P1-W8
- brief: [task-briefs.md#p1-delete-all-verify](task-briefs.md#p1-delete-all-verify)

### p1-reminders-inapp

- title: In-app reminders: still bleeding, symptom log, period window, custom
- kind: ship
- type: feature
- phase: P1
- wave: P1-W8
- risk: medium
- features: F-017
- blocked-by: p1-cycle-engine-verify
- owns: `src/reminders/inapp/**`, `src/ui/components/reminder-banner/**`
- tests: T-REM-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:feature, risk:medium, wave:P1-W8
- brief: [task-briefs.md#p1-reminders-inapp](task-briefs.md#p1-reminders-inapp)

### p1-settings

- title: Settings: units, week start, theme, lock timeout, trackers, about
- kind: ship
- type: feature
- phase: P1
- wave: P1-W8
- risk: low
- features: F-021
- blocked-by: p1-log-repo-verify
- owns: `src/ui/screens/settings/main/**`
- tests: T-A11Y-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:feature, risk:low, wave:P1-W8
- brief: [task-briefs.md#p1-settings](task-briefs.md#p1-settings)

### p1-lowrisk-review

- title: P1 wave review of low/medium-risk work
- kind: scout
- type: verify
- phase: P1
- wave: P1-W9
- risk: low
- features: —
- blocked-by: p1-onboarding, p1-quick-log, p1-log-forms, p1-calendar, p1-today, p1-backtest, p1-reminders-inapp, p1-settings
- owns: —
- tests: T-A11Y-01, T-UX-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:verify, risk:low, wave:P1-W9
- brief: [task-briefs.md#p1-lowrisk-review](task-briefs.md#p1-lowrisk-review)

### p1-integration

- title: P1 integration: routes, engine worker, Today/Calendar/Log wiring, e2e
- kind: ship
- type: chore
- phase: P1
- wave: P1-W10
- risk: medium
- features: —
- blocked-by: p1-lowrisk-review, p1-warnings-v1-verify, p1-export-import-verify, p1-delete-all-verify, p1-content-core-verify
- owns: `src/app/**`, `tests/e2e/p1-journeys.spec.ts`, `tests/e2e/p1-tz.spec.ts`, `docs/progress.md`, `docs/adr/**`
- tests: T-UX-01, T-UX-04, T-NET-01, T-DATE-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:chore, risk:medium, wave:P1-W10
- brief: [task-briefs.md#p1-integration](task-briefs.md#p1-integration)

### p1-demo-deploy

- title: Deploy the integrated P1 build to the preview URL for the phase demo
- kind: ship
- type: chore
- phase: P1
- wave: P1-W11
- risk: medium
- features: —
- blocked-by: p1-integration
- owns: `docs/deploy/p1-demo.md`
- tests: T-SEC-04, T-NET-01, T-SEC-08
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P1, type:chore, risk:medium, wave:P1-W11, deploy
- brief: [task-briefs.md#p1-demo-deploy](task-briefs.md#p1-demo-deploy)

### p1-phase-verify

- title: P1 phase verification report
- kind: scout
- type: verify
- phase: P1
- wave: P1-W12
- risk: high
- features: —
- blocked-by: p1-demo-deploy
- owns: —
- tests: —
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P1, type:verify, risk:high, wave:P1-W12
- brief: [task-briefs.md#p1-phase-verify](task-briefs.md#p1-phase-verify)

### gate-phase-1

- title: Phase 1 gate: demo and captain approval
- kind: gate
- type: gate
- phase: P1
- wave: P1-W13
- risk: high
- features: —
- blocked-by: p1-phase-verify
- owns: —
- tests: —
- route: captain hold (first mate; no crewmate)
- labels: phase:P1, type:gate, risk:high, wave:P1-W13
- brief: [task-briefs.md#gate-phase-1](task-briefs.md#gate-phase-1)

### p2-identity

- title: Device and owner/partner identity keys and certificates
- kind: ship
- type: feature
- phase: P2
- wave: P2-W1
- risk: high
- features: F-025
- blocked-by: gate-phase-1
- owns: `src/crypto/identity/**`
- tests: T-PAIR-01
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-identity-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W1
- brief: [task-briefs.md#p2-identity](task-briefs.md#p2-identity)

### p2-identity-verify

- title: Verify device and owner/partner identity keys and certificates
- kind: scout
- type: verify
- phase: P2
- wave: P2-W2
- risk: high
- features: F-025
- blocked-by: p2-identity
- owns: —
- tests: T-PAIR-01
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W2
- brief: [task-briefs.md#p2-identity-verify](task-briefs.md#p2-identity-verify)

### p2-share-keys

- title: Category key epochs, wrap/unwrap to partner, rotation
- kind: ship
- type: feature
- phase: P2
- wave: P2-W3
- risk: high
- features: F-060, F-101
- blocked-by: p2-identity-verify
- owns: `src/share/keys/**`
- tests: T-CON-01, T-CON-02, T-CON-05, T-PAIR-04
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-share-keys-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W3
- brief: [task-briefs.md#p2-share-keys](task-briefs.md#p2-share-keys)

### p2-share-keys-verify

- title: Verify category key epochs, wrap/unwrap to partner, rotation
- kind: scout
- type: verify
- phase: P2
- wave: P2-W4
- risk: high
- features: F-060, F-101
- blocked-by: p2-share-keys
- owns: —
- tests: T-CON-01, T-CON-02, T-CON-05, T-PAIR-04
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W4
- brief: [task-briefs.md#p2-share-keys-verify](task-briefs.md#p2-share-keys-verify)

### p2-sync-core

- title: Sync core: HLC, merge, tombstones, conflict copies, outbox/inbox
- kind: ship
- type: feature
- phase: P2
- wave: P2-W3
- risk: high
- features: F-025
- blocked-by: p2-identity-verify
- owns: `src/sync/core/**`
- tests: T-SYNC-01, T-SYNC-02, T-SYNC-03, T-SYNC-04
- route: rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p2-sync-core-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W3
- brief: [task-briefs.md#p2-sync-core](task-briefs.md#p2-sync-core)

### p2-sync-core-verify

- title: Verify sync core: HLC, merge, tombstones, conflict copies, outbox/inbox
- kind: scout
- type: verify
- phase: P2
- wave: P2-W4
- risk: high
- features: F-025
- blocked-by: p2-sync-core
- owns: —
- tests: T-SYNC-01, T-SYNC-02, T-SYNC-03, T-SYNC-04
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W4
- brief: [task-briefs.md#p2-sync-core-verify](task-briefs.md#p2-sync-core-verify)

### p2-relay-worker

- title: Relay Worker + D1: signed requests, slots, couple log, deletion
- kind: ship
- type: feature
- phase: P2
- wave: P2-W2
- risk: high
- features: F-025
- blocked-by: gate-phase-1
- owns: `relay/src/api/**`, `relay/schema.sql`, `relay/wrangler.toml`, `relay/package.json`, `relay/test/**`
- tests: T-RELAY-01, T-CON-07, T-SEC-03, T-RELAY-02
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-relay-worker-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W2
- brief: [task-briefs.md#p2-relay-worker](task-briefs.md#p2-relay-worker)

### p2-relay-worker-verify

- title: Verify relay Worker + D1: signed requests, slots, couple log, deletion
- kind: scout
- type: verify
- phase: P2
- wave: P2-W3
- risk: high
- features: F-025
- blocked-by: p2-relay-worker
- owns: —
- tests: T-RELAY-01, T-CON-07, T-SEC-03
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W3
- brief: [task-briefs.md#p2-relay-worker-verify](task-briefs.md#p2-relay-worker-verify)

### p2-projection

- title: Share categories and projection builder (allow-listed fields)
- kind: ship
- type: feature
- phase: P2
- wave: P2-W5
- risk: high
- features: F-056, F-059, F-101
- blocked-by: p2-share-keys-verify
- owns: `src/share/projection/**`
- tests: T-CON-08, T-CON-09, T-CON-11, T-CON-12
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-projection-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W5
- brief: [task-briefs.md#p2-projection](task-briefs.md#p2-projection)

### p2-projection-verify

- title: Verify share categories and projection builder (allow-listed fields)
- kind: scout
- type: verify
- phase: P2
- wave: P2-W6
- risk: high
- features: F-056, F-059, F-101
- blocked-by: p2-projection
- owns: —
- tests: T-CON-08, T-CON-09, T-CON-11, T-CON-12
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W6
- brief: [task-briefs.md#p2-projection-verify](task-briefs.md#p2-projection-verify)

### p2-transport

- title: Sync transports: relay client and manual .flosync file exchange
- kind: ship
- type: feature
- phase: P2
- wave: P2-W5
- risk: high
- features: F-025
- blocked-by: p2-sync-core-verify, p2-relay-worker-verify
- owns: `src/sync/transport/**`
- tests: T-SYNC-01, T-SYNC-03
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-transport-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W5
- brief: [task-briefs.md#p2-transport](task-briefs.md#p2-transport)

### p2-transport-verify

- title: Verify sync transports: relay client and manual .flosync file exchange
- kind: scout
- type: verify
- phase: P2
- wave: P2-W6
- risk: high
- features: F-025
- blocked-by: p2-transport
- owns: —
- tests: T-SYNC-01, T-SYNC-03
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W6
- brief: [task-briefs.md#p2-transport-verify](task-briefs.md#p2-transport-verify)

### p2-pairing

- title: In-person pairing: two-way QR, safety code, fallback code
- kind: ship
- type: feature
- phase: P2
- wave: P2-W5
- risk: high
- features: F-055
- blocked-by: p2-share-keys-verify, p2-relay-worker-verify
- owns: `src/pairing/core/**`, `src/ui/screens/pairing/**`
- tests: T-PAIR-01, T-PAIR-02, T-PAIR-03, T-CON-01
- route: rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p2-pairing-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W5
- brief: [task-briefs.md#p2-pairing](task-briefs.md#p2-pairing)

### p2-pairing-verify

- title: Verify in-person pairing: two-way QR, safety code, fallback code
- kind: scout
- type: verify
- phase: P2
- wave: P2-W6
- risk: high
- features: F-055
- blocked-by: p2-pairing
- owns: —
- tests: T-PAIR-01, T-PAIR-02, T-PAIR-03, T-CON-01
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W6
- brief: [task-briefs.md#p2-pairing-verify](task-briefs.md#p2-pairing-verify)

### p2-share-controls

- title: Sharing controls: enable, pause, revoke, start date, preview, consent log
- kind: ship
- type: feature
- phase: P2
- wave: P2-W7
- risk: high
- features: F-060, F-101
- blocked-by: p2-projection-verify, p2-pairing-verify
- owns: `src/share/service/**`, `src/ui/screens/sharing/**`
- tests: T-CON-03, T-CON-04, T-CON-05, T-CON-06, T-CON-10, T-CON-17, T-UX-05
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-share-controls-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W7
- brief: [task-briefs.md#p2-share-controls](task-briefs.md#p2-share-controls)

### p2-share-controls-verify

- title: Verify sharing controls: enable, pause, revoke, start date, preview, consent log
- kind: scout
- type: verify
- phase: P2
- wave: P2-W8
- risk: high
- features: F-060, F-101
- blocked-by: p2-share-controls
- owns: —
- tests: T-CON-03, T-CON-04, T-CON-05, T-CON-06, T-CON-10, T-CON-17
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W8
- brief: [task-briefs.md#p2-share-controls-verify](task-briefs.md#p2-share-controls-verify)

### p2-partner-view

- title: Partner Today/Calendar from shared projections only; tips from her data
- kind: ship
- type: feature
- phase: P2
- wave: P2-W7
- risk: high
- features: F-056, F-057, F-061
- blocked-by: p2-projection-verify, p2-transport-verify
- owns: `src/ui/screens/partner/**`
- tests: T-CON-07, T-CON-16, T-UX-04
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-partner-view-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W7
- brief: [task-briefs.md#p2-partner-view](task-briefs.md#p2-partner-view)

### p2-partner-view-verify

- title: Verify partner Today/Calendar from shared projections only; tips from her data
- kind: scout
- type: verify
- phase: P2
- wave: P2-W8
- risk: high
- features: F-056, F-057, F-061
- blocked-by: p2-partner-view
- owns: —
- tests: T-CON-07, T-CON-16, T-UX-04
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W8
- brief: [task-briefs.md#p2-partner-view-verify](task-briefs.md#p2-partner-view-verify)

### p2-couple-space

- title: Couple space: entries, love notes, support cards, insight flags
- kind: ship
- type: feature
- phase: P2
- wave: P2-W7
- risk: high
- features: F-102, F-115, F-117
- blocked-by: p2-transport-verify, p2-pairing-verify
- owns: `src/couple/**`, `src/ui/screens/couple/**`
- tests: T-CON-13, T-CON-18
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-couple-space-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W7
- brief: [task-briefs.md#p2-couple-space](task-briefs.md#p2-couple-space)

### p2-couple-space-verify

- title: Verify couple space: entries, love notes, support cards, insight flags
- kind: scout
- type: verify
- phase: P2
- wave: P2-W8
- risk: high
- features: F-102, F-115, F-117
- blocked-by: p2-couple-space
- owns: —
- tests: T-CON-13, T-CON-18
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W8
- brief: [task-briefs.md#p2-couple-space-verify](task-briefs.md#p2-couple-space-verify)

### p2-backup

- title: Encrypted backup file, restore, restore test, optional relay backup
- kind: ship
- type: feature
- phase: P2
- wave: P2-W9
- risk: high
- features: F-119, F-025
- blocked-by: p2-transport-verify
- owns: `src/backup/encrypted/**`, `src/ui/screens/backup/**`
- tests: T-BAK-02, T-BAK-03, T-BAK-04
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-backup-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W9
- brief: [task-briefs.md#p2-backup](task-briefs.md#p2-backup)

### p2-backup-verify

- title: Verify encrypted backup file, restore, restore test, optional relay backup
- kind: scout
- type: verify
- phase: P2
- wave: P2-W10
- risk: high
- features: F-119, F-025
- blocked-by: p2-backup
- owns: —
- tests: T-BAK-02, T-BAK-03
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W10
- brief: [task-briefs.md#p2-backup-verify](task-briefs.md#p2-backup-verify)

### p2-unpair-delete

- title: Unpair from either side; remote parts of delete-all
- kind: ship
- type: feature
- phase: P2
- wave: P2-W9
- risk: high
- features: F-060, F-022
- blocked-by: p2-share-controls-verify, p2-couple-space-verify
- owns: `src/share/unpair/**`, `src/data/wipe-remote/**`
- tests: T-CON-19, T-CON-20, T-PAIR-05
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-unpair-delete-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W9
- brief: [task-briefs.md#p2-unpair-delete](task-briefs.md#p2-unpair-delete)

### p2-unpair-delete-verify

- title: Verify unpair from either side; remote parts of delete-all
- kind: scout
- type: verify
- phase: P2
- wave: P2-W10
- risk: high
- features: F-060, F-022
- blocked-by: p2-unpair-delete
- owns: —
- tests: T-CON-19, T-CON-20, T-PAIR-05
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W10
- brief: [task-briefs.md#p2-unpair-delete-verify](task-briefs.md#p2-unpair-delete-verify)

### p2-push

- title: Generic Web Push: subscription, SW handler, relay cron sender
- kind: ship
- type: feature
- phase: P2
- wave: P2-W4
- risk: high
- features: F-018, F-058, F-114
- blocked-by: p2-relay-worker-verify
- owns: `src/reminders/push/**`, `src/sw/push-handler.ts`, `relay/src/cron/**`, `src/sw/entry.ts`, `relay/wrangler.toml`
- tests: T-CON-16, T-REM-01
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-push-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W4
- brief: [task-briefs.md#p2-push](task-briefs.md#p2-push)

### p2-push-verify

- title: Verify generic Web Push: subscription, SW handler, relay cron sender
- kind: scout
- type: verify
- phase: P2
- wave: P2-W9
- risk: high
- features: F-018, F-058, F-114
- blocked-by: p2-push
- owns: —
- tests: T-CON-16, T-REM-01
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W9
- brief: [task-briefs.md#p2-push-verify](task-briefs.md#p2-push-verify)

### p2-preview-relay-deploy

- title: Deploy the verified relay, D1 schema, preview-only secrets and cron to the preview relay (synthetic only)
- kind: ship
- type: chore
- phase: P2
- wave: P2-W10
- risk: high
- features: F-025
- blocked-by: p2-relay-worker-verify, p2-push-verify
- owns: `relay/wrangler.toml`, `tools/deploy/relay-preview.sh`, `docs/deploy/p2-relay.md`
- tests: T-RELAY-01, T-RELAY-02
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-preview-relay-deploy-verify` before merge
- labels: phase:P2, type:chore, risk:high, wave:P2-W10, deploy
- brief: [task-briefs.md#p2-preview-relay-deploy](task-briefs.md#p2-preview-relay-deploy)

### p2-preview-relay-deploy-verify

- title: Verify deploy the verified relay, D1 schema, preview-only secrets and cron to the preview relay (synthetic only)
- kind: scout
- type: verify
- phase: P2
- wave: P2-W11
- risk: high
- features: F-025
- blocked-by: p2-preview-relay-deploy
- owns: —
- tests: T-RELAY-01, T-RELAY-02
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W11
- brief: [task-briefs.md#p2-preview-relay-deploy-verify](task-briefs.md#p2-preview-relay-deploy-verify)

### p2-quick-hide

- title: Quick-hide: neutral screen and immediate lock
- kind: ship
- type: feature
- phase: P2
- wave: P2-W2
- risk: high
- features: F-113
- blocked-by: gate-phase-1
- owns: `src/lock/quickhide/**`, `src/ui/components/hide-button/**`
- tests: T-CON-21
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-quick-hide-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W2
- brief: [task-briefs.md#p2-quick-hide](task-briefs.md#p2-quick-hide)

### p2-quick-hide-verify

- title: Verify quick-hide: neutral screen and immediate lock
- kind: scout
- type: verify
- phase: P2
- wave: P2-W11
- risk: high
- features: F-113
- blocked-by: p2-quick-hide
- owns: —
- tests: T-CON-21
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W11
- brief: [task-briefs.md#p2-quick-hide-verify](task-briefs.md#p2-quick-hide-verify)

### p2-passkey-unlock

- title: Optional Face ID unlock via passkey PRF (feasibility-gated)
- kind: ship
- type: feature
- phase: P2
- wave: P2-W11
- risk: high
- features: F-024
- blocked-by: gate-phase-1
- owns: `src/lock/passkey/**`, `src/ui/screens/lock/passkey/**`
- tests: T-SEC-07
- route: rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-passkey-unlock-verify` before merge
- labels: phase:P2, type:feature, risk:high, wave:P2-W11
- brief: [task-briefs.md#p2-passkey-unlock](task-briefs.md#p2-passkey-unlock)

### p2-passkey-unlock-verify

- title: Verify optional Face ID unlock via passkey PRF (feasibility-gated)
- kind: scout
- type: verify
- phase: P2
- wave: P2-W12
- risk: high
- features: F-024
- blocked-by: p2-passkey-unlock
- owns: —
- tests: T-SEC-07
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W12
- brief: [task-briefs.md#p2-passkey-unlock-verify](task-briefs.md#p2-passkey-unlock-verify)

### p2-integration

- title: P2 integration: two-device journeys, settings sync/backup wiring
- kind: ship
- type: chore
- phase: P2
- wave: P2-W13
- risk: medium
- features: —
- blocked-by: p2-unpair-delete-verify, p2-push-verify, p2-backup-verify, p2-partner-view-verify, p2-quick-hide-verify, p2-passkey-unlock-verify
- owns: `src/app/**`, `tests/e2e/p2-two-device.spec.ts`, `tests/e2e/p2-consent.spec.ts`, `docs/progress.md`, `docs/adr/**`
- tests: T-CON-01, T-CON-19, T-PAIR-05, T-NET-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P2, type:chore, risk:medium, wave:P2-W13
- brief: [task-briefs.md#p2-integration](task-briefs.md#p2-integration)

### p2-demo-deploy

- title: Deploy the integrated P2 build against the preview relay for the two-phone demo
- kind: ship
- type: chore
- phase: P2
- wave: P2-W14
- risk: medium
- features: —
- blocked-by: p2-integration, p2-preview-relay-deploy-verify
- owns: `docs/deploy/p2-demo.md`
- tests: T-SEC-04, T-NET-01, T-SEC-08
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P2, type:chore, risk:medium, wave:P2-W14, deploy
- brief: [task-briefs.md#p2-demo-deploy](task-briefs.md#p2-demo-deploy)

### p2-lowrisk-review

- title: P2 wave review of low/medium-risk work
- kind: scout
- type: verify
- phase: P2
- wave: P2-W14
- risk: low
- features: —
- blocked-by: p2-integration
- owns: —
- tests: T-A11Y-01
- route: rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high
- labels: phase:P2, type:verify, risk:low, wave:P2-W14
- brief: [task-briefs.md#p2-lowrisk-review](task-briefs.md#p2-lowrisk-review)

### p2-phase-verify

- title: P2 phase verification report (privacy/consent focus)
- kind: scout
- type: verify
- phase: P2
- wave: P2-W15
- risk: high
- features: —
- blocked-by: p2-lowrisk-review, p2-demo-deploy
- owns: —
- tests: —
- route: rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high
- labels: phase:P2, type:verify, risk:high, wave:P2-W15
- brief: [task-briefs.md#p2-phase-verify](task-briefs.md#p2-phase-verify)

### gate-phase-2

- title: Phase 2 gate: demo and captain approval
- kind: gate
- type: gate
- phase: P2
- wave: P2-W16
- risk: high
- features: —
- blocked-by: p2-phase-verify
- owns: —
- tests: —
- route: captain hold (first mate; no crewmate)
- labels: phase:P2, type:gate, risk:high, wave:P2-W16
- brief: [task-briefs.md#gate-phase-2](task-briefs.md#gate-phase-2)

## Waves

| Wave | Items (≤3 crewmates; gates do not occupy a slot) |
|---|---|
| P0-W1 | p0-approvals, p0-dispatch-validate, p0-agents-skills |
| P0-W2 | p0-verifier-sandbox-proof, p0-toolchain |
| P0-W3 | p0-verifier-sandbox-proof-verify, p0-toolchain-verify |
| P0-W4 | p0-relay-spike, p0-feasibility-probe |
| P0-W5 | p0-relay-spike-verify, p0-contracts |
| P0-W6 | p0-probe-deploy, p0-contracts-verify |
| P0-W7 | p0-device-feasibility, p0-design-tokens |
| P0-W8 | p0-localdate, p0-crypto-core, p0-app-shell |
| P0-W9 | p0-localdate-verify, p0-crypto-core-verify, p0-service-worker |
| P0-W10 | p0-service-worker-verify, p0-db-store, p0-csp-network |
| P0-W11 | p0-db-store-verify, p0-csp-network-verify, p0-synthetic-data |
| P0-W12 | p0-lock, p0-lowrisk-review |
| P0-W13 | p0-lock-verify |
| P0-W14 | p0-integration |
| P0-W15 | p0-demo-deploy |
| P0-W16 | p0-phase-verify |
| P0-W17 | gate-phase-0 |
| P1-W1 | p1-log-repo |
| P1-W2 | p1-log-repo-verify, p1-episodes, p1-onboarding |
| P1-W3 | p1-episodes-verify, p1-quick-log, p1-log-forms |
| P1-W4 | p1-cycle-engine, p1-calendar, p1-content-core |
| P1-W5 | p1-cycle-engine-verify, p1-content-core-verify, p1-export-import |
| P1-W6 | p1-today, p1-warnings-v1, p1-backtest |
| P1-W7 | p1-warnings-v1-verify, p1-export-import-verify, p1-delete-all |
| P1-W8 | p1-delete-all-verify, p1-reminders-inapp, p1-settings |
| P1-W9 | p1-lowrisk-review |
| P1-W10 | p1-integration |
| P1-W11 | p1-demo-deploy |
| P1-W12 | p1-phase-verify |
| P1-W13 | gate-phase-1 |
| P2-W1 | p2-identity |
| P2-W2 | p2-identity-verify, p2-relay-worker, p2-quick-hide |
| P2-W3 | p2-share-keys, p2-sync-core, p2-relay-worker-verify |
| P2-W4 | p2-share-keys-verify, p2-sync-core-verify, p2-push |
| P2-W5 | p2-projection, p2-transport, p2-pairing |
| P2-W6 | p2-projection-verify, p2-transport-verify, p2-pairing-verify |
| P2-W7 | p2-share-controls, p2-partner-view, p2-couple-space |
| P2-W8 | p2-share-controls-verify, p2-partner-view-verify, p2-couple-space-verify |
| P2-W9 | p2-backup, p2-unpair-delete, p2-push-verify |
| P2-W10 | p2-backup-verify, p2-unpair-delete-verify, p2-preview-relay-deploy |
| P2-W11 | p2-preview-relay-deploy-verify, p2-quick-hide-verify, p2-passkey-unlock |
| P2-W12 | p2-passkey-unlock-verify |
| P2-W13 | p2-integration |
| P2-W14 | p2-demo-deploy, p2-lowrisk-review |
| P2-W15 | p2-phase-verify |
| P2-W16 | gate-phase-2 |

## Import script

Run from any directory after Stage F approval. Bodies stay short; the brief link carries the detail.

```bash
FM=~/firstmate/bin
"$FM/fm-tasks-axi.sh" add p0-approvals "Collect all P0 account, credential, install and deployment approvals" --kind gate --repo flo --blocked-by flo-plan-approval --body "Phase P0 · gate · risk high · wave P0-W1 · features none · route: captain hold (first mate; no crewmate) · brief: docs/plan/task-briefs.md#p0-approvals"
"$FM/fm-captain-hold.sh" hold p0-approvals --reason "Collect all P0 account, credential, install and deployment approvals"
"$FM/fm-tasks-axi.sh" add p0-dispatch-validate "Validate crew-dispatch routing rules, model availability and actual thinking" --kind scout --repo flo --blocked-by flo-plan-approval --body "Phase P0 · chore · risk low · wave P0-W1 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-dispatch-validate"
"$FM/fm-tasks-axi.sh" add p0-agents-skills "Project AGENTS.md (<150 lines) and reusable skills" --kind ship --repo flo --blocked-by flo-plan-approval --body "Phase P0 · chore · risk low · wave P0-W1 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-agents-skills"
"$FM/fm-tasks-axi.sh" add p0-verifier-sandbox-proof "Prove verifier tool/OS safeguards on a disposable fixture" --kind ship --repo flo --blocked-by p0-approvals --body "Phase P0 · chore · risk high · wave P0-W2 · features none · route: rule 2 (design/extensive/ambiguous or escalation) → github-copilot/claude-opus-5.5, effort high; required independent verify p0-verifier-sandbox-proof-verify before merge · brief: docs/plan/task-briefs.md#p0-verifier-sandbox-proof"
"$FM/fm-tasks-axi.sh" add p0-verifier-sandbox-proof-verify "Verify prove verifier tool/OS safeguards on a disposable fixture" --kind scout --repo flo --blocked-by p0-verifier-sandbox-proof --body "Phase P0 · verify · risk high · wave P0-W3 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-verifier-sandbox-proof-verify"
"$FM/fm-tasks-axi.sh" add p0-toolchain "Pinned TypeScript/Vite/Vitest/Playwright toolchain and local check scripts" --kind ship --repo flo --blocked-by p0-approvals --blocked-by p0-agents-skills --body "Phase P0 · chore · risk high · wave P0-W2 · features none · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p0-toolchain-verify before merge · brief: docs/plan/task-briefs.md#p0-toolchain"
"$FM/fm-tasks-axi.sh" add p0-toolchain-verify "Verify pinned TypeScript/Vite/Vitest/Playwright toolchain and local check scripts" --kind scout --repo flo --blocked-by p0-toolchain --body "Phase P0 · verify · risk high · wave P0-W3 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-toolchain-verify"
"$FM/fm-tasks-axi.sh" add p0-relay-spike "Cloudflare free-plan relay spike and live preview push-test endpoint (FB-01, FB-02, FB-09; serves FB-06)" --kind ship --repo flo --blocked-by p0-approvals --blocked-by p0-toolchain-verify --body "Phase P0 · chore · risk high · wave P0-W4 · features none · route: rule 2 (design/extensive/ambiguous or escalation) → github-copilot/claude-opus-5.5, effort high; required independent verify p0-relay-spike-verify before merge · brief: docs/plan/task-briefs.md#p0-relay-spike"
"$FM/fm-tasks-axi.sh" add p0-relay-spike-verify "Verify cloudflare free-plan relay spike and live preview push-test endpoint" --kind scout --repo flo --blocked-by p0-relay-spike --body "Phase P0 · verify · risk high · wave P0-W5 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-relay-spike-verify"
"$FM/fm-tasks-axi.sh" add p0-feasibility-probe "Device feasibility probe page (synthetic, no health data)" --kind ship --repo flo --blocked-by p0-toolchain-verify --body "Phase P0 · feature · risk medium · wave P0-W4 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-feasibility-probe"
"$FM/fm-tasks-axi.sh" add p0-probe-deploy "Deploy the synthetic feasibility probe to a Cloudflare Pages preview URL" --kind ship --repo flo --blocked-by p0-feasibility-probe --blocked-by p0-relay-spike-verify --body "Phase P0 · chore · risk medium · wave P0-W6 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-probe-deploy"
"$FM/fm-tasks-axi.sh" add p0-device-feasibility "Run the probe on both iPhones and record results (captain + partner)" --kind gate --repo flo --blocked-by p0-probe-deploy --body "Phase P0 · gate · risk high · wave P0-W7 · features none · route: captain hold (first mate; no crewmate) · brief: docs/plan/task-briefs.md#p0-device-feasibility"
"$FM/fm-tasks-axi.sh" add p0-contracts "Shared contracts: types, enums, engine/crypto/store/share/sync interfaces" --kind ship --repo flo --blocked-by p0-toolchain-verify --body "Phase P0 · feature · risk high · wave P0-W5 · features none · route: rule 2 (design/extensive/ambiguous or escalation) → github-copilot/claude-opus-5.5, effort high; required independent verify p0-contracts-verify before merge · brief: docs/plan/task-briefs.md#p0-contracts"
"$FM/fm-tasks-axi.sh" add p0-contracts-verify "Verify shared contracts: types, enums, engine/crypto/store/share/sync interfaces" --kind scout --repo flo --blocked-by p0-contracts --body "Phase P0 · verify · risk high · wave P0-W6 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-contracts-verify"
"$FM/fm-tasks-axi.sh" add p0-design-tokens "Design tokens and base components (light/dark, 44px targets)" --kind ship --repo flo --blocked-by p0-contracts-verify --body "Phase P0 · feature · risk low · wave P0-W7 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-design-tokens"
"$FM/fm-tasks-axi.sh" add p0-localdate "LocalDate library (A0) with time-zone and DST tests" --kind ship --repo flo --blocked-by p0-contracts-verify --body "Phase P0 · feature · risk high · wave P0-W8 · features none · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p0-localdate-verify before merge · brief: docs/plan/task-briefs.md#p0-localdate"
"$FM/fm-tasks-axi.sh" add p0-localdate-verify "Verify localDate library (A0) with time-zone and DST tests" --kind scout --repo flo --blocked-by p0-localdate --body "Phase P0 · verify · risk high · wave P0-W9 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-localdate-verify"
"$FM/fm-tasks-axi.sh" add p0-crypto-core "WebCrypto primitives, envelopes and key hierarchy helpers" --kind ship --repo flo --blocked-by p0-contracts-verify --body "Phase P0 · feature · risk high · wave P0-W8 · features none · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p0-crypto-core-verify before merge · brief: docs/plan/task-briefs.md#p0-crypto-core"
"$FM/fm-tasks-axi.sh" add p0-crypto-core-verify "Verify webCrypto primitives, envelopes and key hierarchy helpers" --kind scout --repo flo --blocked-by p0-crypto-core --body "Phase P0 · verify · risk high · wave P0-W9 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-crypto-core-verify"
"$FM/fm-tasks-axi.sh" add p0-app-shell "App shell, manifest, icons and tab layout" --kind ship --repo flo --blocked-by p0-design-tokens --body "Phase P0 · feature · risk low · wave P0-W8 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-app-shell"
"$FM/fm-tasks-axi.sh" add p0-service-worker "Service worker: precache, offline boot, safe update protocol" --kind ship --repo flo --blocked-by p0-app-shell --body "Phase P0 · feature · risk high · wave P0-W9 · features none · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p0-service-worker-verify before merge · brief: docs/plan/task-briefs.md#p0-service-worker"
"$FM/fm-tasks-axi.sh" add p0-service-worker-verify "Verify service worker: precache, offline boot, safe update protocol" --kind scout --repo flo --blocked-by p0-service-worker --body "Phase P0 · verify · risk high · wave P0-W10 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-service-worker-verify"
"$FM/fm-tasks-axi.sh" add p0-db-store "Encrypted IndexedDB record store, opaque ids and migration framework" --kind ship --repo flo --blocked-by p0-crypto-core-verify --blocked-by p0-localdate-verify --body "Phase P0 · feature · risk high · wave P0-W10 · features none · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p0-db-store-verify before merge · brief: docs/plan/task-briefs.md#p0-db-store"
"$FM/fm-tasks-axi.sh" add p0-db-store-verify "Verify encrypted IndexedDB record store, opaque ids and migration framework" --kind scout --repo flo --blocked-by p0-db-store --body "Phase P0 · verify · risk high · wave P0-W11 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-db-store-verify"
"$FM/fm-tasks-axi.sh" add p0-csp-network "Security headers, CSP and network-allowlist e2e test" --kind ship --repo flo --blocked-by p0-app-shell --blocked-by p0-toolchain-verify --body "Phase P0 · feature · risk high · wave P0-W10 · features none · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p0-csp-network-verify before merge · brief: docs/plan/task-briefs.md#p0-csp-network"
"$FM/fm-tasks-axi.sh" add p0-csp-network-verify "Verify security headers, CSP and network-allowlist e2e test" --kind scout --repo flo --blocked-by p0-csp-network --body "Phase P0 · verify · risk high · wave P0-W11 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-csp-network-verify"
"$FM/fm-tasks-axi.sh" add p0-synthetic-data "Seeded synthetic data generator and fixture provenance rules" --kind ship --repo flo --blocked-by p0-contracts-verify --blocked-by p0-localdate-verify --body "Phase P0 · feature · risk medium · wave P0-W11 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-synthetic-data"
"$FM/fm-tasks-axi.sh" add p0-lock "Passphrase setup, recovery code, unlock and auto-lock" --kind ship --repo flo --blocked-by p0-db-store-verify --body "Phase P0 · feature · risk high · wave P0-W12 · features F-024 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p0-lock-verify before merge · brief: docs/plan/task-briefs.md#p0-lock"
"$FM/fm-tasks-axi.sh" add p0-lock-verify "Verify passphrase setup, recovery code, unlock and auto-lock" --kind scout --repo flo --blocked-by p0-lock --body "Phase P0 · verify · risk high · wave P0-W13 · features F-024 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-lock-verify"
"$FM/fm-tasks-axi.sh" add p0-lowrisk-review "P0 wave review of low/medium-risk work" --kind scout --repo flo --blocked-by p0-design-tokens --blocked-by p0-app-shell --blocked-by p0-feasibility-probe --blocked-by p0-synthetic-data --blocked-by p0-agents-skills --blocked-by p0-probe-deploy --body "Phase P0 · verify · risk low · wave P0-W12 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-lowrisk-review"
"$FM/fm-tasks-axi.sh" add p0-integration "P0 integration: shell + lock + store wiring, feasibility record" --kind ship --repo flo --blocked-by p0-lock-verify --blocked-by p0-service-worker-verify --blocked-by p0-csp-network-verify --blocked-by p0-lowrisk-review --blocked-by p0-device-feasibility --blocked-by p0-verifier-sandbox-proof-verify --blocked-by p0-dispatch-validate --body "Phase P0 · chore · risk medium · wave P0-W14 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-integration"
"$FM/fm-tasks-axi.sh" add p0-demo-deploy "Deploy the integrated P0 build to the preview URL for the phase demo" --kind ship --repo flo --blocked-by p0-integration --body "Phase P0 · chore · risk medium · wave P0-W15 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p0-demo-deploy"
"$FM/fm-tasks-axi.sh" add p0-phase-verify "P0 phase verification report" --kind scout --repo flo --blocked-by p0-demo-deploy --body "Phase P0 · verify · risk high · wave P0-W16 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p0-phase-verify"
"$FM/fm-tasks-axi.sh" add gate-phase-0 "Phase 0 gate: demo and captain approval" --kind gate --repo flo --blocked-by p0-phase-verify --body "Phase P0 · gate · risk high · wave P0-W17 · features none · route: captain hold (first mate; no crewmate) · brief: docs/plan/task-briefs.md#gate-phase-0"
"$FM/fm-tasks-axi.sh" add p1-log-repo "Log repository and settings repository on the encrypted store" --kind ship --repo flo --blocked-by gate-phase-0 --body "Phase P1 · feature · risk high · wave P1-W1 · features F-009, F-013 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p1-log-repo-verify before merge · brief: docs/plan/task-briefs.md#p1-log-repo"
"$FM/fm-tasks-axi.sh" add p1-log-repo-verify "Verify log repository and settings repository on the encrypted store" --kind scout --repo flo --blocked-by p1-log-repo --body "Phase P1 · verify · risk high · wave P1-W2 · features F-009, F-013 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p1-log-repo-verify"
"$FM/fm-tasks-axi.sh" add p1-episodes "Engine A1/A3: bleeding episodes, spotting, assumed days, period length" --kind ship --repo flo --blocked-by gate-phase-0 --body "Phase P1 · feature · risk high · wave P1-W2 · features F-001, F-011 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p1-episodes-verify before merge · brief: docs/plan/task-briefs.md#p1-episodes"
"$FM/fm-tasks-axi.sh" add p1-episodes-verify "Verify engine A1/A3: bleeding episodes, spotting, assumed days, period length" --kind scout --repo flo --blocked-by p1-episodes --body "Phase P1 · verify · risk high · wave P1-W3 · features F-001, F-011 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p1-episodes-verify"
"$FM/fm-tasks-axi.sh" add p1-onboarding "Onboarding (no account): install check, role, basics, reminders opt-in" --kind ship --repo flo --blocked-by gate-phase-0 --body "Phase P1 · feature · risk medium · wave P1-W2 · features F-020, F-015 · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-onboarding"
"$FM/fm-tasks-axi.sh" add p1-quick-log "Quick log sheet (≤3 taps) with undo" --kind ship --repo flo --blocked-by gate-phase-0 --blocked-by p1-log-repo-verify --body "Phase P1 · feature · risk medium · wave P1-W3 · features F-001, F-009, F-010 · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-quick-log"
"$FM/fm-tasks-axi.sh" add p1-cycle-engine "Engine v1: A2 prediction, A4 fertility + suppression, A5 chance, A16 P1 modifiers, runEngine" --kind ship --repo flo --blocked-by p1-episodes-verify --body "Phase P1 · feature · risk high · wave P1-W4 · features F-002, F-003, F-004, F-007, F-008, F-015, F-019, F-071, F-072 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p1-cycle-engine-verify before merge · brief: docs/plan/task-briefs.md#p1-cycle-engine"
"$FM/fm-tasks-axi.sh" add p1-cycle-engine-verify "Verify engine v1: A2 prediction, A4 fertility + suppression, A5 chance, A16 P1 modifiers, runEngine" --kind scout --repo flo --blocked-by p1-cycle-engine --body "Phase P1 · verify · risk high · wave P1-W5 · features F-002, F-003, F-004, F-007, F-008, F-015, F-019, F-071, F-072 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p1-cycle-engine-verify"
"$FM/fm-tasks-axi.sh" add p1-log-forms "Log detail forms for every P1 tracker and tracker customization" --kind ship --repo flo --blocked-by p1-log-repo-verify --body "Phase P1 · feature · risk medium · wave P1-W3 · features F-009, F-010, F-011, F-012, F-013, F-014, F-105 · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-log-forms"
"$FM/fm-tasks-axi.sh" add p1-calendar "Calendar month/year views, day detail, overrides and cycle exclusion" --kind ship --repo flo --blocked-by p1-log-repo-verify --body "Phase P1 · feature · risk medium · wave P1-W4 · features F-005, F-019 · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-calendar"
"$FM/fm-tasks-axi.sh" add p1-today "Today screen: cycle day, prediction window, chance card, prompts, cards" --kind ship --repo flo --blocked-by p1-cycle-engine-verify --body "Phase P1 · feature · risk medium · wave P1-W6 · features F-002, F-004, F-006, F-033 · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-today"
"$FM/fm-tasks-axi.sh" add p1-content-core "P1 core education cards (15) with sources and selection (A17)" --kind ship --repo flo --blocked-by gate-phase-0 --body "Phase P1 · feature · risk high · wave P1-W4 · features F-035 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p1-content-core-verify before merge · brief: docs/plan/task-briefs.md#p1-content-core"
"$FM/fm-tasks-axi.sh" add p1-content-core-verify "Verify p1 core education cards (15) with sources and selection (A17)" --kind scout --repo flo --blocked-by p1-content-core --body "Phase P1 · verify · risk high · wave P1-W5 · features F-035 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p1-content-core-verify"
"$FM/fm-tasks-axi.sh" add p1-warnings-v1 "Engine A11 warnings v1 (W-01..W-07, W-11)" --kind ship --repo flo --blocked-by p1-cycle-engine-verify --blocked-by p1-content-core-verify --body "Phase P1 · feature · risk high · wave P1-W6 · features F-033 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p1-warnings-v1-verify before merge · brief: docs/plan/task-briefs.md#p1-warnings-v1"
"$FM/fm-tasks-axi.sh" add p1-warnings-v1-verify "Verify engine A11 warnings v1 (W-01..W-07, W-11)" --kind scout --repo flo --blocked-by p1-warnings-v1 --body "Phase P1 · verify · risk high · wave P1-W7 · features F-033 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p1-warnings-v1-verify"
"$FM/fm-tasks-axi.sh" add p1-backtest "Backtesting harness with baselines (A18)" --kind ship --repo flo --blocked-by p1-cycle-engine-verify --body "Phase P1 · feature · risk medium · wave P1-W6 · features F-003 · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-backtest"
"$FM/fm-tasks-axi.sh" add p1-export-import "JSON and CSV export/import" --kind ship --repo flo --blocked-by p1-log-repo-verify --body "Phase P1 · feature · risk high · wave P1-W5 · features F-023 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p1-export-import-verify before merge · brief: docs/plan/task-briefs.md#p1-export-import"
"$FM/fm-tasks-axi.sh" add p1-export-import-verify "Verify jSON and CSV export/import" --kind scout --repo flo --blocked-by p1-export-import --body "Phase P1 · verify · risk high · wave P1-W7 · features F-023 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p1-export-import-verify"
"$FM/fm-tasks-axi.sh" add p1-delete-all "Delete all my data (local crypto-erasure)" --kind ship --repo flo --blocked-by p1-log-repo-verify --body "Phase P1 · feature · risk high · wave P1-W7 · features F-022 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p1-delete-all-verify before merge · brief: docs/plan/task-briefs.md#p1-delete-all"
"$FM/fm-tasks-axi.sh" add p1-delete-all-verify "Verify delete all my data (local crypto-erasure)" --kind scout --repo flo --blocked-by p1-delete-all --body "Phase P1 · verify · risk high · wave P1-W8 · features F-022 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p1-delete-all-verify"
"$FM/fm-tasks-axi.sh" add p1-reminders-inapp "In-app reminders: still bleeding, symptom log, period window, custom" --kind ship --repo flo --blocked-by p1-cycle-engine-verify --body "Phase P1 · feature · risk medium · wave P1-W8 · features F-017 · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-reminders-inapp"
"$FM/fm-tasks-axi.sh" add p1-settings "Settings: units, week start, theme, lock timeout, trackers, about" --kind ship --repo flo --blocked-by p1-log-repo-verify --body "Phase P1 · feature · risk low · wave P1-W8 · features F-021 · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-settings"
"$FM/fm-tasks-axi.sh" add p1-lowrisk-review "P1 wave review of low/medium-risk work" --kind scout --repo flo --blocked-by p1-onboarding --blocked-by p1-quick-log --blocked-by p1-log-forms --blocked-by p1-calendar --blocked-by p1-today --blocked-by p1-backtest --blocked-by p1-reminders-inapp --blocked-by p1-settings --body "Phase P1 · verify · risk low · wave P1-W9 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-lowrisk-review"
"$FM/fm-tasks-axi.sh" add p1-integration "P1 integration: routes, engine worker, Today/Calendar/Log wiring, e2e" --kind ship --repo flo --blocked-by p1-lowrisk-review --blocked-by p1-warnings-v1-verify --blocked-by p1-export-import-verify --blocked-by p1-delete-all-verify --blocked-by p1-content-core-verify --body "Phase P1 · chore · risk medium · wave P1-W10 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-integration"
"$FM/fm-tasks-axi.sh" add p1-demo-deploy "Deploy the integrated P1 build to the preview URL for the phase demo" --kind ship --repo flo --blocked-by p1-integration --body "Phase P1 · chore · risk medium · wave P1-W11 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p1-demo-deploy"
"$FM/fm-tasks-axi.sh" add p1-phase-verify "P1 phase verification report" --kind scout --repo flo --blocked-by p1-demo-deploy --body "Phase P1 · verify · risk high · wave P1-W12 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p1-phase-verify"
"$FM/fm-tasks-axi.sh" add gate-phase-1 "Phase 1 gate: demo and captain approval" --kind gate --repo flo --blocked-by p1-phase-verify --body "Phase P1 · gate · risk high · wave P1-W13 · features none · route: captain hold (first mate; no crewmate) · brief: docs/plan/task-briefs.md#gate-phase-1"
"$FM/fm-tasks-axi.sh" add p2-identity "Device and owner/partner identity keys and certificates" --kind ship --repo flo --blocked-by gate-phase-1 --body "Phase P2 · feature · risk high · wave P2-W1 · features F-025 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-identity-verify before merge · brief: docs/plan/task-briefs.md#p2-identity"
"$FM/fm-tasks-axi.sh" add p2-identity-verify "Verify device and owner/partner identity keys and certificates" --kind scout --repo flo --blocked-by p2-identity --body "Phase P2 · verify · risk high · wave P2-W2 · features F-025 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-identity-verify"
"$FM/fm-tasks-axi.sh" add p2-share-keys "Category key epochs, wrap/unwrap to partner, rotation" --kind ship --repo flo --blocked-by p2-identity-verify --body "Phase P2 · feature · risk high · wave P2-W3 · features F-060, F-101 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-share-keys-verify before merge · brief: docs/plan/task-briefs.md#p2-share-keys"
"$FM/fm-tasks-axi.sh" add p2-share-keys-verify "Verify category key epochs, wrap/unwrap to partner, rotation" --kind scout --repo flo --blocked-by p2-share-keys --body "Phase P2 · verify · risk high · wave P2-W4 · features F-060, F-101 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-share-keys-verify"
"$FM/fm-tasks-axi.sh" add p2-sync-core "Sync core: HLC, merge, tombstones, conflict copies, outbox/inbox" --kind ship --repo flo --blocked-by p2-identity-verify --body "Phase P2 · feature · risk high · wave P2-W3 · features F-025 · route: rule 2 (design/extensive/ambiguous or escalation) → github-copilot/claude-opus-5.5, effort high; required independent verify p2-sync-core-verify before merge · brief: docs/plan/task-briefs.md#p2-sync-core"
"$FM/fm-tasks-axi.sh" add p2-sync-core-verify "Verify sync core: HLC, merge, tombstones, conflict copies, outbox/inbox" --kind scout --repo flo --blocked-by p2-sync-core --body "Phase P2 · verify · risk high · wave P2-W4 · features F-025 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-sync-core-verify"
"$FM/fm-tasks-axi.sh" add p2-relay-worker "Relay Worker + D1: signed requests, slots, couple log, deletion" --kind ship --repo flo --blocked-by gate-phase-1 --body "Phase P2 · feature · risk high · wave P2-W2 · features F-025 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-relay-worker-verify before merge · brief: docs/plan/task-briefs.md#p2-relay-worker"
"$FM/fm-tasks-axi.sh" add p2-relay-worker-verify "Verify relay Worker + D1: signed requests, slots, couple log, deletion" --kind scout --repo flo --blocked-by p2-relay-worker --body "Phase P2 · verify · risk high · wave P2-W3 · features F-025 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-relay-worker-verify"
"$FM/fm-tasks-axi.sh" add p2-projection "Share categories and projection builder (allow-listed fields)" --kind ship --repo flo --blocked-by p2-share-keys-verify --body "Phase P2 · feature · risk high · wave P2-W5 · features F-056, F-059, F-101 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-projection-verify before merge · brief: docs/plan/task-briefs.md#p2-projection"
"$FM/fm-tasks-axi.sh" add p2-projection-verify "Verify share categories and projection builder (allow-listed fields)" --kind scout --repo flo --blocked-by p2-projection --body "Phase P2 · verify · risk high · wave P2-W6 · features F-056, F-059, F-101 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-projection-verify"
"$FM/fm-tasks-axi.sh" add p2-transport "Sync transports: relay client and manual .flosync file exchange" --kind ship --repo flo --blocked-by p2-sync-core-verify --blocked-by p2-relay-worker-verify --body "Phase P2 · feature · risk high · wave P2-W5 · features F-025 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-transport-verify before merge · brief: docs/plan/task-briefs.md#p2-transport"
"$FM/fm-tasks-axi.sh" add p2-transport-verify "Verify sync transports: relay client and manual .flosync file exchange" --kind scout --repo flo --blocked-by p2-transport --body "Phase P2 · verify · risk high · wave P2-W6 · features F-025 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-transport-verify"
"$FM/fm-tasks-axi.sh" add p2-pairing "In-person pairing: two-way QR, safety code, fallback code" --kind ship --repo flo --blocked-by p2-share-keys-verify --blocked-by p2-relay-worker-verify --body "Phase P2 · feature · risk high · wave P2-W5 · features F-055 · route: rule 2 (design/extensive/ambiguous or escalation) → github-copilot/claude-opus-5.5, effort high; required independent verify p2-pairing-verify before merge · brief: docs/plan/task-briefs.md#p2-pairing"
"$FM/fm-tasks-axi.sh" add p2-pairing-verify "Verify in-person pairing: two-way QR, safety code, fallback code" --kind scout --repo flo --blocked-by p2-pairing --body "Phase P2 · verify · risk high · wave P2-W6 · features F-055 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-pairing-verify"
"$FM/fm-tasks-axi.sh" add p2-share-controls "Sharing controls: enable, pause, revoke, start date, preview, consent log" --kind ship --repo flo --blocked-by p2-projection-verify --blocked-by p2-pairing-verify --body "Phase P2 · feature · risk high · wave P2-W7 · features F-060, F-101 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-share-controls-verify before merge · brief: docs/plan/task-briefs.md#p2-share-controls"
"$FM/fm-tasks-axi.sh" add p2-share-controls-verify "Verify sharing controls: enable, pause, revoke, start date, preview, consent log" --kind scout --repo flo --blocked-by p2-share-controls --body "Phase P2 · verify · risk high · wave P2-W8 · features F-060, F-101 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-share-controls-verify"
"$FM/fm-tasks-axi.sh" add p2-partner-view "Partner Today/Calendar from shared projections only; tips from her data" --kind ship --repo flo --blocked-by p2-projection-verify --blocked-by p2-transport-verify --body "Phase P2 · feature · risk high · wave P2-W7 · features F-056, F-057, F-061 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-partner-view-verify before merge · brief: docs/plan/task-briefs.md#p2-partner-view"
"$FM/fm-tasks-axi.sh" add p2-partner-view-verify "Verify partner Today/Calendar from shared projections only; tips from her data" --kind scout --repo flo --blocked-by p2-partner-view --body "Phase P2 · verify · risk high · wave P2-W8 · features F-056, F-057, F-061 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-partner-view-verify"
"$FM/fm-tasks-axi.sh" add p2-couple-space "Couple space: entries, love notes, support cards, insight flags" --kind ship --repo flo --blocked-by p2-transport-verify --blocked-by p2-pairing-verify --body "Phase P2 · feature · risk high · wave P2-W7 · features F-102, F-115, F-117 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-couple-space-verify before merge · brief: docs/plan/task-briefs.md#p2-couple-space"
"$FM/fm-tasks-axi.sh" add p2-couple-space-verify "Verify couple space: entries, love notes, support cards, insight flags" --kind scout --repo flo --blocked-by p2-couple-space --body "Phase P2 · verify · risk high · wave P2-W8 · features F-102, F-115, F-117 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-couple-space-verify"
"$FM/fm-tasks-axi.sh" add p2-backup "Encrypted backup file, restore, restore test, optional relay backup" --kind ship --repo flo --blocked-by p2-transport-verify --body "Phase P2 · feature · risk high · wave P2-W9 · features F-119, F-025 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-backup-verify before merge · brief: docs/plan/task-briefs.md#p2-backup"
"$FM/fm-tasks-axi.sh" add p2-backup-verify "Verify encrypted backup file, restore, restore test, optional relay backup" --kind scout --repo flo --blocked-by p2-backup --body "Phase P2 · verify · risk high · wave P2-W10 · features F-119, F-025 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-backup-verify"
"$FM/fm-tasks-axi.sh" add p2-unpair-delete "Unpair from either side; remote parts of delete-all" --kind ship --repo flo --blocked-by p2-share-controls-verify --blocked-by p2-couple-space-verify --body "Phase P2 · feature · risk high · wave P2-W9 · features F-060, F-022 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-unpair-delete-verify before merge · brief: docs/plan/task-briefs.md#p2-unpair-delete"
"$FM/fm-tasks-axi.sh" add p2-unpair-delete-verify "Verify unpair from either side; remote parts of delete-all" --kind scout --repo flo --blocked-by p2-unpair-delete --body "Phase P2 · verify · risk high · wave P2-W10 · features F-060, F-022 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-unpair-delete-verify"
"$FM/fm-tasks-axi.sh" add p2-push "Generic Web Push: subscription, SW handler, relay cron sender" --kind ship --repo flo --blocked-by p2-relay-worker-verify --body "Phase P2 · feature · risk high · wave P2-W4 · features F-018, F-058, F-114 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-push-verify before merge · brief: docs/plan/task-briefs.md#p2-push"
"$FM/fm-tasks-axi.sh" add p2-push-verify "Verify generic Web Push: subscription, SW handler, relay cron sender" --kind scout --repo flo --blocked-by p2-push --body "Phase P2 · verify · risk high · wave P2-W9 · features F-018, F-058, F-114 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-push-verify"
"$FM/fm-tasks-axi.sh" add p2-preview-relay-deploy "Deploy the verified relay, D1 schema, preview-only secrets and cron to the preview relay (synthetic only)" --kind ship --repo flo --blocked-by p2-relay-worker-verify --blocked-by p2-push-verify --body "Phase P2 · chore · risk high · wave P2-W10 · features F-025 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-preview-relay-deploy-verify before merge · brief: docs/plan/task-briefs.md#p2-preview-relay-deploy"
"$FM/fm-tasks-axi.sh" add p2-preview-relay-deploy-verify "Verify deploy the verified relay, D1 schema, preview-only secrets and cron to the preview relay (synthetic only)" --kind scout --repo flo --blocked-by p2-preview-relay-deploy --body "Phase P2 · verify · risk high · wave P2-W11 · features F-025 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-preview-relay-deploy-verify"
"$FM/fm-tasks-axi.sh" add p2-quick-hide "Quick-hide: neutral screen and immediate lock" --kind ship --repo flo --blocked-by gate-phase-1 --body "Phase P2 · feature · risk high · wave P2-W2 · features F-113 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-quick-hide-verify before merge · brief: docs/plan/task-briefs.md#p2-quick-hide"
"$FM/fm-tasks-axi.sh" add p2-quick-hide-verify "Verify quick-hide: neutral screen and immediate lock" --kind scout --repo flo --blocked-by p2-quick-hide --body "Phase P2 · verify · risk high · wave P2-W11 · features F-113 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-quick-hide-verify"
"$FM/fm-tasks-axi.sh" add p2-passkey-unlock "Optional Face ID unlock via passkey PRF (feasibility-gated)" --kind ship --repo flo --blocked-by gate-phase-1 --body "Phase P2 · feature · risk high · wave P2-W11 · features F-024 · route: rule 4 (bounded high-risk implementation with approved design + tests) → github-copilot/gpt-6-luna, effort high; required independent verify p2-passkey-unlock-verify before merge · brief: docs/plan/task-briefs.md#p2-passkey-unlock"
"$FM/fm-tasks-axi.sh" add p2-passkey-unlock-verify "Verify optional Face ID unlock via passkey PRF (feasibility-gated)" --kind scout --repo flo --blocked-by p2-passkey-unlock --body "Phase P2 · verify · risk high · wave P2-W12 · features F-024 · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-passkey-unlock-verify"
"$FM/fm-tasks-axi.sh" add p2-integration "P2 integration: two-device journeys, settings sync/backup wiring" --kind ship --repo flo --blocked-by p2-unpair-delete-verify --blocked-by p2-push-verify --blocked-by p2-backup-verify --blocked-by p2-partner-view-verify --blocked-by p2-quick-hide-verify --blocked-by p2-passkey-unlock-verify --body "Phase P2 · chore · risk medium · wave P2-W13 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p2-integration"
"$FM/fm-tasks-axi.sh" add p2-demo-deploy "Deploy the integrated P2 build against the preview relay for the two-phone demo" --kind ship --repo flo --blocked-by p2-integration --blocked-by p2-preview-relay-deploy-verify --body "Phase P2 · chore · risk medium · wave P2-W14 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p2-demo-deploy"
"$FM/fm-tasks-axi.sh" add p2-lowrisk-review "P2 wave review of low/medium-risk work" --kind scout --repo flo --blocked-by p2-integration --body "Phase P2 · verify · risk low · wave P2-W14 · features none · route: rule 5 (bounded routine/low-risk) → github-copilot/gpt-6-luna, effort high · brief: docs/plan/task-briefs.md#p2-lowrisk-review"
"$FM/fm-tasks-axi.sh" add p2-phase-verify "P2 phase verification report (privacy/consent focus)" --kind scout --repo flo --blocked-by p2-lowrisk-review --blocked-by p2-demo-deploy --body "Phase P2 · verify · risk high · wave P2-W15 · features none · route: rule 1 (high-risk independent verification) → github-copilot/claude-opus-5.5, effort high · brief: docs/plan/task-briefs.md#p2-phase-verify"
"$FM/fm-tasks-axi.sh" add gate-phase-2 "Phase 2 gate: demo and captain approval" --kind gate --repo flo --blocked-by p2-phase-verify --body "Phase P2 · gate · risk high · wave P2-W16 · features none · route: captain hold (first mate; no crewmate) · brief: docs/plan/task-briefs.md#gate-phase-2"
```
