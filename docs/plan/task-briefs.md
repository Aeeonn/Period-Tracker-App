# Task briefs — P0–P2 (Step 9/10)

**Status:** Stage E revision, 2026-10-02 (Stage C draft corrected after the Stage D critique; see [stage-e-resolution.md](stage-e-resolution.md)). These briefs are written for the work *after* approval. Each one is self-contained by reference: it points to plan files by path rather than pasting them. Firstmate wraps each brief with `bin/fm-brief.sh`, which adds the worktree-isolation assertion, the status protocol, the delivery mode and the Definition of Done.

## Common sections (apply to every brief below)

- **Constitution.** [plan.md §4](plan.md#4-assumptions-and-decisions) and the Section 4 rules listed in each brief. **No real health data anywhere.** Only synthetic data, made with `tools/synthetic` (from P0 onward).
- **Must not touch.** everything not listed under Owns — in particular `src/contracts/**` (P0 foundation only), `src/app/**` (integration tasks only), `docs/plan/**` (except where listed), `AGENTS.md`, other tasks' owned paths, and anything outside the worktree.
- **Definition of Ready / Done.** [test-strategy.md §4–5](test-strategy.md#4-definition-of-ready-task). One Conventional Commit per task, rebased on the current `main`.
- **Landing.** Crewmates never merge. A ship task ends with a clean ready branch; the first mate lands it with `bin/fm-merge-local.sh` after its required verify passes and the merge authority approves ([agent-operating-model.md §3](agent-operating-model.md#3-the-loop-for-every-task)). "Depends on" always means the predecessor has **landed** on `main`.
- **Approval preconditions.** A task that needs an account, credential, install, deploy or money waits for the matching explicit answer recorded in `p0-approvals` (plan.md §18 B). Plan approval alone authorizes none of them.
- **Startup check.** Print `PI_PROVIDER`, `PI_MODEL` and `PI_REASONING_LEVEL`. If they do not match the route, report `blocked`; never substitute.
- **Fix rounds.** Prior failed rounds are 0 at first dispatch. The first mate updates this count and the escalation evidence ([agent-operating-model.md §4](agent-operating-model.md#4-escalation-fix-rounds-and-blockers)).
- **Report format** (~15 lines): revision or commit; files changed (or revision reviewed); commands run with results; evidence; open issues.
- **Verifier extras** (scout `*-verify` items):
  - the first mate fills in the **exact candidate revision**;
  - the report is written to `~/firstmate/data/<id>/report.md`, outside the reviewed source;
  - every verify brief runs commands, so it uses the test-running verifier configuration of [agent-operating-model.md §6.2](agent-operating-model.md#62-proposed-verifier-launch-configuration-to-prove-in-p0-verifier-sandbox-proof), including the Firstmate status, inbox and report commands listed there; if FB-08 stands, the captain's AP-16 interim option applies and the report says "isolation not enforced". The first mate never runs these commands on a verifier's behalf;
  - source writes are forbidden and must be prevented by those safeguards where they are proven;
  - **this review is a mandatory independent gate.** The implementation cannot merge without a PASS for this exact revision. Changed source needs a renewed review.
  - Algorithm auditors write down expected vector results from the spec *before* reading the code.

## P0

### p0-approvals

**Collect all P0 account, credential, install and deployment approvals** · gate / gate · phase P0 · wave P0-W1 · risk **high** · features —

- **Route:** captain hold (first mate; no crewmate). Prior failed fix rounds: 0.
- **Depends on:** flo-plan-approval
- **Goal:** The only captain hold set at import. It collects the concrete Section 3 answers that P0–P2 need, so that later phases need the captain only for landing approvals (while `yolo` is off), gates, production, money and destructive actions. Each item needs its own explicit answer; nothing here is approved by default or by plan approval:
  - AP-10: the Cloudflare account (Free plan, no payment method; Pages + Workers + D1), **who holds it** (her-owned, joint, or captain-owned with the T13 disclosure), and the scoped deploy credential (holder, storage outside the repository, minimum permissions; FB-01, FB-09);
  - AP-18: synthetic-only preview deployments (Pages preview project, preview relay Worker + D1, preview-only enrollment secret and VAPID keys, the live push-test endpoint) and whether deploy crewmates or the captain run the deploy commands;
  - AP-16: the verifier-sandbox prerequisites (bubblewrap system package, sandbox extension npm dependency) and, if FB-08 stands, the interim verification option;
  - AP-28: the pinned npm dependency set;
  - AP-12: the fallback transport if Cloudflare fails.
  The repository mode is not asked: `local-only` is settled (AP-17).
- **Acceptance (Given/When/Then):**
  - Given the approval list in plan.md §18 B is answered, When the captain replies to this hold, Then the first mate records each approval or refusal in this item's note, and the next integration task copies them into the progress log
  - Given any item is refused, When dependent tasks are evaluated, Then they stay blocked and the documented fallback path (storage-sync-decision.md §3) is scheduled instead
- **Constitution/sections:** Section 3 approval checkpoints 2, 3, 5

### p0-dispatch-validate

**Validate crew-dispatch routing rules, model availability and actual thinking** · scout / chore · phase P0 · wave P0-W1 · risk **low** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** flo-plan-approval
- **Goal:** Confirm ~/firstmate/config/crew-dispatch.json still matches agent-operating-model.md §2 (five rules, priority order, high minimum) without editing it; run `pi --list-models` for the three IDs; record what PI_MODEL/PI_REASONING_LEVEL each profile actually reports at startup (from task records). Report mismatches; never create a project-local dispatch file.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Acceptance (Given/When/Then):**
  - Given the current crew-dispatch.json, When compared with §2, Then every rule maps to exactly one row and any drift is listed in the report
  - Given `pi --list-models`, When run, Then github-copilot/claude-opus-5.5, gpt-6-luna and gpt-6.1-sol are present or the absence is reported as blocked
- **Commands:** `pi --list-models | grep -E 'claude-opus-5.5|gpt-6-luna|gpt-6.1-sol'`
- **Constitution/sections:** Section 3 sub-agent models

### p0-agents-skills

**Project AGENTS.md (<150 lines) and reusable skills** · ship / chore · phase P0 · wave P0-W1 · risk **low** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** flo-plan-approval
- **Goal:** Write the root AGENTS.md (constitution summary, coding standards, Definition of Done, pointers to docs/plan) under ~150 lines, and three skills: task-brief format, verification protocol per verifier type (agent-operating-model.md §5–7), and a cycle-math reference that points to algorithms-spec.md (no duplicated formulas). Start docs/progress.md.
- **Owns:** `AGENTS.md`, `.agents/skills/task-brief/SKILL.md`, `.agents/skills/verification-protocol/SKILL.md`, `.agents/skills/cycle-math/SKILL.md`, `docs/progress.md`
- **Acceptance (Given/When/Then):**
  - Given AGENTS.md, When counted with `wc -l`, Then it has ≤150 lines and links docs/plan/plan.md, test-strategy.md §4–5 and security-privacy.md §2
  - Given a Pi session started in the repo, When a canary phrase from .agents/skills/task-brief/SKILL.md description is queried, Then Pi lists the skill (Pi's skills documentation describes `.agents/skills` discovery); otherwise the documented folder is used and AGENTS.md references it
  - Given the skills, When grepped for health-data examples, Then only synthetic examples appear
- **Commands:** `wc -l AGENTS.md`; `grep -c 'docs/plan' AGENTS.md`
- **Constitution/sections:** 4.9, 4.10

### p0-verifier-sandbox-proof

**Prove verifier tool/OS safeguards on a disposable fixture** · ship / chore · phase P0 · wave P0-W2 · risk **high** · features —

- **Route:** rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p0-verifier-sandbox-proof-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-approvals
- **Goal:** Implement and run the agent-operating-model.md §6 proof: build a throwaway fixture repo (no health data), launch the test-running verifier configuration of §6.2 (the review-only configuration is not usable under Firstmate and is only recorded as such), keep every Firstmate status, inbox and report path in the §6.2 table working, and attempt every write/read/network path in §6.3, including reads through the Pi `read` tool as well as `bash`. Record the exact launch commands, versions and per-check outputs in §6.4 (only that section of agent-operating-model.md). Do not modify Firstmate code or global Pi settings; if the Firstmate adapter cannot pass the flags, record FB-08 as a blocker.
- **Owns:** `tools/verifier-sandbox/README.md`, `tools/verifier-sandbox/sandbox.json`, `tools/verifier-sandbox/fixture-proof.sh`, `docs/plan/agent-operating-model.md`
- **Acceptance (Given/When/Then):**
  - Given the fixture, When each §6.3 check runs, Then its command, output and pass/fail are recorded verbatim in §6.4
  - Given any write path succeeds or the adapter cannot apply the config, When the report is written, Then §6.4 says 'NOT ENFORCED' for that path and FB-08 is raised; read-only enforcement is not claimed
  - Given the run finishes, When `git status` is checked in unrelated repos, Then nothing changed outside the fixture and tools/verifier-sandbox
- **Commands:** `bash tools/verifier-sandbox/fixture-proof.sh`
- **Constitution/sections:** Step 9 verifier safeguards

### p0-verifier-sandbox-proof-verify

**Verify prove verifier tool/OS safeguards on a disposable fixture** · scout / verify · phase P0 · wave P0-W3 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-verifier-sandbox-proof
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p0-verifier-sandbox-proof` candidate revision. Re-run tools/verifier-sandbox/fixture-proof.sh independently on a fresh fixture and confirm every recorded result; try at least two additional write paths not in the script.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** agent-operating-model.md §6
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-verifier-sandbox-proof`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-verifier-sandbox-proof` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `bash tools/verifier-sandbox/fixture-proof.sh`; `npm run check`
- **Constitution/sections:** Step 9 verifier safeguards

### p0-toolchain

**Pinned TypeScript/Vite/Vitest/Playwright toolchain and local check scripts** · ship / chore · phase P0 · wave P0-W2 · risk **high** · features —

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-toolchain-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-approvals, p0-agents-skills
- **Goal:** Create the strict TypeScript toolchain (architecture.md §2) with exact version pins and `npm ci --ignore-scripts`; npm scripts named in test-strategy.md §1; check scripts: dependency pins/licence allowlist/audit, secret scan, no-real-data (fixture provenance header + canary patterns), copy lint (banned phrases, ux-spec.md §7), bundle-size budget. Install only the approved list.
- **Owns:** `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.prettierrc`, `.gitignore`, `tools/check-deps.ts`, `tools/check-secrets.ts`, `tools/check-no-real-data.ts`, `tools/copy-lint.ts`, `tools/check-size.ts`, `tools/allowed-licenses.json`, `tests/golden/README.md`
- **Acceptance (Given/When/Then):**
  - Given a clean clone, When `npm ci --ignore-scripts && npm run check` runs, Then it passes with zero source files beyond a placeholder test
  - Given a dependency with a caret range or a GPL/AGPL licence is added in a scratch branch, When `npm run check:deps` runs, Then it fails naming the package
  - Given a string 'safe day' in any src file, When `npm run check` runs, Then copy lint fails
  - Given tsconfig.json, When inspected, Then strict and noUncheckedIndexedAccess are true
- **Commands:** `npm ci --ignore-scripts`; `npm run check`; `npm run check:deps`
- **Tests:** T-SEC-05, T-UX-03, T-CON-14 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.2, 4.3 dependencies, 4.9, 4.10

### p0-toolchain-verify

**Verify pinned TypeScript/Vite/Vitest/Playwright toolchain and local check scripts** · scout / verify · phase P0 · wave P0-W3 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-toolchain
- **Goal:** Independent privacy, consent and security reviewer, code reviewer review of the exact `p0-toolchain` candidate revision. Supply-chain review: every dependency's licence, maintainer status, install scripts, pin and audit result; check scripts actually fail on seeded violations.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer, code reviewer. **Spec:** architecture.md §2, security-privacy.md §6, test-strategy.md §1
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-toolchain`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-toolchain` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run check:deps`; `npm audit --omit=dev`; `npm ci --ignore-scripts`; `npm run check`
- **Tests:** T-SEC-05, T-UX-03, T-CON-14 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.2, 4.3 dependencies, 4.9, 4.10

### p0-relay-spike

**Cloudflare free-plan relay spike and live preview push-test endpoint (FB-01, FB-02, FB-09; serves FB-06)** · ship / chore · phase P0 · wave P0-W4 · risk **high** · features —

- **Route:** rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p0-relay-spike-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-approvals, p0-toolchain-verify
- **Approval precondition:** runs only after `p0-approvals` records explicit answers for AP-10 (account and custody), AP-18 (preview deployments, deploy credential and who runs deploys) and AP-28 (pinned dependencies including `wrangler`). Plan approval alone authorizes none of these. If AP-18 chose captain-run deploys, the crewmate prepares the code and the exact command and the captain runs it.
- **Goal:** Write a minimal Worker + D1 under `relay-spike/` (synthetic data only) and deploy it as the **preview relay environment** (placeholder names `flo-preview-relay` / `flo-preview`, recorded in the deploy record), using the approved scoped deploy credential from its approved location outside the repository; never print or commit it. Measure FB-02 (CPU time for one ECDSA P-256 verification plus a D1 read/write, and VAPID JWT signing per push); confirm FB-01 (Free plan, no payment method, quota exceeded = errors, not charges); record the terms relevant to personal use (FB-09). Add an enrollment-secret-protected, rate-limited `POST /push-test` route that sends one push with fixed generic text to a subscription supplied by the probe (serves FB-06). Configure **no** Workers logs or observability, no Logpush and no tail consumer, and record which request metadata the account owner can still see through the dashboard, analytics and `wrangler tail` (factual gap D-G01; disabling logs does not hide traffic from the account owner or Cloudflare). **Keep the deployment live**: `p2-preview-relay-deploy` later replaces its code on the same preview Worker. Report only measurements and settings; no health data.
- **Owns:** `relay-spike/**`, `docs/deploy/p0-relay-spike.md`
- **Acceptance (Given/When/Then):**
  - Given the deployed spike, When 50 signed synthetic requests run, Then docs/deploy/p0-relay-spike.md lists p50/p95 CPU ms and whether 10 ms is exceeded
  - Given the billing page, When the account holder inspects it, Then the record states the plan name and whether a payment method exists, with no account identifiers
  - Given a synthetic push subscription, When `POST /push-test` is called with the preview enrollment secret, Then exactly one notification with the fixed generic text is sent; When called without the secret, Then it returns 401
  - Given relay-spike/wrangler.toml, When inspected, Then observability/logs are disabled and no Logpush or tail consumer is configured; the record lists what the owner can still see (T-RELAY-02, configuration part)
  - Given any of FB-01, FB-02 or FB-09 fails, When recorded, Then the record recommends the storage-sync-decision.md §3 fallback and the endpoint is not used for anything but the probe
- **Commands:** `npx wrangler deploy --config relay-spike/wrangler.toml` (approved credential in the environment only); `bash relay-spike/measure.sh`
- **Tests:** T-RELAY-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** Section 3 budget and checkpoints 2 and 5 (approved preview only), 4.2

### p0-relay-spike-verify

**Verify cloudflare free-plan relay spike and live preview push-test endpoint** · scout / verify · phase P0 · wave P0-W5 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-relay-spike
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p0-relay-spike` candidate revision and its recorded deployment. Check that no secret or account identifier is committed, that `/push-test` refuses unauthenticated calls and sends only fixed text, that logging and observability are off in the committed configuration, and that the record of owner-visible metadata is complete and not overstated as invisibility.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** storage-sync-decision.md §5, §10; security-privacy.md T10, T13, PR-07
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-relay-spike`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-relay-spike` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `git grep -n -i -E 'token|secret|account' -- relay-spike docs/deploy`; `curl -s -o /dev/null -w '%{http_code}' -X POST <preview-relay>/push-test` (expect 401)
- **Tests:** T-RELAY-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** Section 3 budget, 4.2

### p0-feasibility-probe

**Device feasibility probe page (synthetic, no health data)** · ship / feature · phase P0 · wave P0-W4 · risk **medium** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-toolchain-verify
- **Goal:** A standalone Vite page that, on a real iPhone Home Screen install, runs and displays checks for FB-03 (persist(), estimate(), IndexedDB write/read-back across launches), FB-04 (share/download of .json/.csv/.flobak synthetic files and re-import), FB-05 (camera QR scan via getUserMedia + a test QR), FB-06 (push permission and a test notification through the preview relay push-test endpoint, whose URL is supplied at build time by `p0-probe-deploy`), FB-07 (passkey create/get with PRF, offline retry), FB-10 (PBKDF2 600k timing). Results are copyable text without identifiers.
- **Owns:** `probe/index.html`, `probe/probe.ts`, `probe/README.md`
- **Acceptance (Given/When/Then):**
  - Given Playwright WebKit iPhone emulation, When the probe runs, Then every check renders a result row and none throws uncaught
  - Given the network recorder, When the probe runs without push, Then only same-origin requests occur
- **Commands:** `npm run check`; `npm run e2e -- --grep @probe`
- **Tests:** T-NET-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** Section 3 platform

### p0-probe-deploy

**Deploy the synthetic feasibility probe to a Cloudflare Pages preview URL** · ship / chore · phase P0 · wave P0-W6 · risk **medium** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-feasibility-probe, p0-relay-spike-verify
- **Approval precondition:** AP-10 and AP-18 are answered in `p0-approvals`. If AP-18 chose captain-run deploys, this task prepares the scripts and the exact command, and the captain runs it.
- **Goal:** Write `tools/deploy/pages-preview.sh` (builds a named entry, `probe` or `app`, and uploads it to the approved Cloudflare Pages **preview** project with the approved scoped credential read from its approved location outside the repository; it never echoes the credential) and `tools/deploy/check-preview.ts` (fetches every built file from a URL and compares its bytes with the local build output). Deploy the synthetic probe and record the preview URL, commit and build hash in docs/deploy/p0-probe.md. The probe's FB-06 check uses the preview relay push-test endpoint recorded in docs/deploy/p0-relay-spike.md. Synthetic data only.
- **Owns:** `tools/deploy/**`, `docs/deploy/p0-probe.md`
- **Acceptance (Given/When/Then):**
  - Given the approved credential, When the deploy runs, Then the preview URL serves the probe over HTTPS and docs/deploy/p0-probe.md records the URL, commit and build hash, with no secret and no account identifier
  - Given the preview URL, When check-preview runs, Then every served file byte-equals the build output, so no host feature injected a script such as an analytics beacon or email obfuscation (T-SEC-08; factual gap D-G03)
  - Given the probe served from the preview URL, When its push check runs on a phone, Then it targets the preview relay push-test endpoint and no other third-party origin
- **Commands:** `bash tools/deploy/pages-preview.sh probe`; `npx tsx tools/deploy/check-preview.ts <preview-url>`
- **Tests:** T-SEC-08 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** Section 3 checkpoints 2 and 5 (approved preview only), 4.2, 4.10

### p0-device-feasibility

**Run the probe on both iPhones and record results (captain + partner)** · gate / gate · phase P0 · wave P0-W7 · risk **high** · features —

- **Route:** captain hold (first mate; no crewmate). Prior failed fix rounds: 0.
- **Depends on:** p0-probe-deploy
- **Goal:** Captain hold, set when `p0-probe-deploy` is Done (not at import): both users install the synthetic probe from the preview URL recorded in docs/deploy/p0-probe.md and run it, sending the copied results to the first mate. The push check uses the live preview relay push-test endpoint from `p0-relay-spike`. Results decide FB-03..FB-07, FB-10 and whether P2 passkey/push/camera paths are enabled.
- **Acceptance (Given/When/Then):**
  - Given both result sets, When recorded in this item's note, Then each FB item is marked pass/fail/partial with iOS version and model
- **Constitution/sections:** Section 3 platform

### p0-contracts

**Shared contracts: types, enums, engine/crypto/store/share/sync interfaces** · ship / feature · phase P0 · wave P0-W5 · risk **high** · features —

- **Route:** rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p0-contracts-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-toolchain-verify
- **Goal:** Encode architecture.md §3–§5 as TypeScript: LocalDate brand, every enumeration in §5.2 (versioned), entity types §5.1, EngineInput/EngineOutput (algorithms-spec.md §0), CryptoApi, RecordStore, ShareService, SyncTransport, PairingService, BackupService, ReminderService, ContentIndex. Types and pure constants only; no implementation.
- **Owns:** `src/contracts/**`
- **Interfaces/contracts:** architecture.md §3, architecture.md §5, algorithms-spec.md §0
- **Acceptance (Given/When/Then):**
  - Given src/contracts, When `tsc --noEmit` runs, Then it compiles with strict settings and exports every interface named in architecture.md §3
  - Given enums.ts, When compared with architecture.md §5.2, Then every tracker and value is present with ENUM_VERSION=1
  - Given the contracts, When grepped, Then no runtime code other than constant tables exists
- **Commands:** `npm run check`
- **Constitution/sections:** 4.6, 4.9

### p0-contracts-verify

**Verify shared contracts: types, enums, engine/crypto/store/share/sync interfaces** · scout / verify · phase P0 · wave P0-W6 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-contracts
- **Goal:** Independent spec and acceptance verifier, code reviewer review of the exact `p0-contracts` candidate revision. Check completeness and consistency against architecture.md §3–5 and algorithms-spec.md §0; flag any field that could carry raw private data into shared types.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** spec and acceptance verifier, code reviewer. **Spec:** architecture.md §3–5, algorithms-spec.md §0, security-privacy.md §2
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-contracts`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-contracts` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run check`
- **Constitution/sections:** 4.6, 4.9

### p0-design-tokens

**Design tokens and base components (light/dark, 44px targets)** · ship / feature · phase P0 · wave P0-W7 · risk **low** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-contracts-verify
- **Goal:** Colour, type, spacing tokens meeting 4.5:1/3:1 contrast in light and dark; base Button, Chip, Sheet, Card, Toast components with 44×44 targets, focus styles, reduced motion.
- **Owns:** `src/ui/tokens.css`, `src/ui/tokens.ts`, `src/ui/components/base/**`
- **Acceptance (Given/When/Then):**
  - Given each base component in light and dark, When axe runs in a component test, Then 0 serious/critical violations
  - Given Chip, When measured, Then its hit area is ≥44×44 CSS px
- **Commands:** `npm run check`
- **Tests:** T-A11Y-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.7

### p0-localdate

**LocalDate library (A0) with time-zone and DST tests** · ship / feature · phase P0 · wave P0-W8 · risk **high** · features —

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-localdate-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-contracts-verify
- **Goal:** Implement A0: parse/format, epochDay/fromEpochDay (days-from-civil), addDays, diffDays, compare, todayLocal(tz-aware via Intl, injectable clock). No Date construction from LocalDate anywhere.
- **Owns:** `src/lib/localdate/**`, `tests/golden/a0-dates.json`
- **Reference vectors:** algorithms-spec.md A0 (in [algorithms-spec.md](algorithms-spec.md))
- **Acceptance (Given/When/Then):**
  - Given TV-D1..TV-D6, When run, Then all pass in every zone of the TZ matrix
  - Given 10,000 random dates (fast-check), When round-tripped through epochDay, Then identity holds
- **Commands:** `npm run test:tz`; `npm run test:golden`
- **Tests:** T-DATE-01, T-ENG-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p0-localdate-verify

**Verify localDate library (A0) with time-zone and DST tests** · scout / verify · phase P0 · wave P0-W9 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-localdate
- **Goal:** Independent algorithm auditor review of the exact `p0-localdate` candidate revision. Derive TV-D results by hand first, then review implementation for hidden Date/UTC use.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** algorithm auditor. **Spec:** algorithms-spec.md A0. **Vectors:** TV-D1..TV-D6
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-localdate`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-localdate` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:tz`; `npm run test:golden`; `npm run check`
- **Tests:** T-DATE-01, T-ENG-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p0-crypto-core

**WebCrypto primitives, envelopes and key hierarchy helpers** · ship / feature · phase P0 · wave P0-W8 · risk **high** · features —

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-crypto-core-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-contracts-verify
- **Goal:** Implement CryptoApi per security-privacy.md §3: AES-256-GCM seal/open with AAD, HKDF, PBKDF2 (600k), ECDH-ES wrap/unwrap with HKDF, ECDSA sign/verify, HMAC opaque ids, LMK wrap under passphrase/recovery/PRF KEKs. Non-extractable keys where specified. Known-answer tests where published vectors exist.
- **Owns:** `src/crypto/primitives/**`, `src/crypto/envelope/**`, `src/crypto/keyring/**`
- **Reference vectors:** security-privacy.md §3 (in [algorithms-spec.md](algorithms-spec.md))
- **Acceptance (Given/When/Then):**
  - Given random plaintexts, When sealed and opened, Then they round-trip; When one ciphertext byte or AAD field changes, Then open fails
  - Given a wrong passphrase, When unwrapping the LMK, Then a typed WrongSecret error is returned (no partial data)
  - Given RFC 5869 HKDF vectors, When derived, Then outputs match
  - Given PBKDF2 params, When read from meta, Then iterations=600000 and salt length 16
- **Commands:** `npm run test:crypto`
- **Tests:** T-SEC-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p0-crypto-core-verify

**Verify webCrypto primitives, envelopes and key hierarchy helpers** · scout / verify · phase P0 · wave P0-W9 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-crypto-core
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p0-crypto-core` candidate revision. Check algorithm/parameter choices, IV uniqueness, AAD binding, key extractability, error handling and side channels in the exact revision; run the crypto suite in WebKit too.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** security-privacy.md §3
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-crypto-core`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-crypto-core` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:crypto`; `npm run e2e -- --grep @crypto`; `npm run check`
- **Tests:** T-SEC-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p0-app-shell

**App shell, manifest, icons and tab layout** · ship / feature · phase P0 · wave P0-W8 · risk **low** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-design-tokens
- **Goal:** Static shell with header, bottom tabs (her and partner variants), placeholder screens, neutral original icon and placeholder name (AP-20), safe-area insets for iPhone, light/dark.
- **Owns:** `index.html`, `public/manifest.webmanifest`, `public/icons/**`, `src/ui/layout/**`
- **Acceptance (Given/When/Then):**
  - Given iPhone descriptors, When the shell loads, Then tabs render within safe areas and axe shows 0 serious issues
  - Given the manifest, When validated, Then display=standalone and icons are original files
- **Commands:** `npm run check`; `npm run e2e -- --grep @shell`
- **Tests:** T-A11Y-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.5, 4.7

### p0-service-worker

**Service worker: precache, offline boot, safe update protocol** · ship / feature · phase P0 · wave P0-W9 · risk **high** · features —

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-service-worker-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-app-shell
- **Goal:** Implement architecture.md §7: versioned precache, offline navigation, update-ready message, SKIP_WAITING only on request after the app confirms no pending writes, old-cache cleanup only; never touch IndexedDB/OPFS.
- **Owns:** `src/sw/**`, `tools/build-precache.ts`
- **Acceptance (Given/When/Then):**
  - Given offline mode, When the app cold-starts, Then the shell renders (T-SW-01)
  - Given v1 active and v2 waiting with a pending write, When the user taps restart, Then the write completes before activation and no record is lost (T-SW-02)
  - Given the SW source, When grepped, Then no indexedDB or storage.getDirectory usage exists
- **Commands:** `npm run e2e -- --grep @sw`
- **Tests:** T-SW-01, T-SW-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p0-service-worker-verify

**Verify service worker: precache, offline boot, safe update protocol** · scout / verify · phase P0 · wave P0-W10 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-service-worker
- **Goal:** Independent code reviewer, spec and acceptance verifier review of the exact `p0-service-worker` candidate revision. Update-safety review against architecture.md §7 and R4 service-worker notes; attempt to induce data loss with interleaved writes and updates.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** code reviewer, spec and acceptance verifier. **Spec:** architecture.md §7, research/R4 §5–6
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-service-worker`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-service-worker` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run e2e -- --grep @sw`; `npm run check`
- **Tests:** T-SW-01, T-SW-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p0-db-store

**Encrypted IndexedDB record store, opaque ids and migration framework** · ship / feature · phase P0 · wave P0-W10 · risk **high** · features —

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-db-store-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-crypto-core-verify, p0-localdate-verify
- **Goal:** Implement RecordStore (architecture.md §5.3, §6): stores meta/records/outbox/snapshots, HMAC opaque ids, sealed records, transactions, migration runner with pre-migration snapshot, abort safety, no-downgrade read-only mode, persist() request/status.
- **Owns:** `src/data/store/**`, `src/data/migrations/**`, `tests/fixtures/schema/**`
- **Acceptance (Given/When/Then):**
  - Given canary values logged, When the raw IndexedDB is dumped, Then no canary or LocalDate string appears (T-SEC-01)
  - Given a v0 fixture, When migrated to v1, Then data equals expectations; running twice is a no-op; an injected failure leaves v0 intact (T-MIG-01)
  - Given a DB with a newer schema, When opened, Then the store is read-only and reports NEWER_SCHEMA (T-SW-03)
- **Commands:** `npm run test:migrations`; `npm run test`
- **Tests:** T-SEC-01, T-MIG-01, T-SW-03 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3, 4.6

### p0-db-store-verify

**Verify encrypted IndexedDB record store, opaque ids and migration framework** · scout / verify · phase P0 · wave P0-W11 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-db-store
- **Goal:** Independent code reviewer, privacy, consent and security reviewer review of the exact `p0-db-store` candidate revision. Review encryption-at-rest coverage, opaque-id leakage, migration atomicity and snapshot handling on the exact revision; run migration tests in WebKit.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** code reviewer, privacy, consent and security reviewer. **Spec:** architecture.md §5.3, §6, security-privacy.md §3
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-db-store`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-db-store` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:migrations`; `npm run test`; `npm run check`
- **Tests:** T-SEC-01, T-MIG-01, T-SW-03 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3, 4.6

### p0-csp-network

**Security headers, CSP and network-allowlist e2e test** · ship / feature · phase P0 · wave P0-W10 · risk **high** · features —

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-csp-network-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-app-shell, p0-toolchain-verify
- **Goal:** Write public/_headers exactly per security-privacy.md §4, with the relay origin in `connect-src` injected at build time from `RELAY_ORIGIN` (omitted when unset); a Playwright recorder test that fails on any request outside tools/allowed-endpoints.json; a header test against the built output. Both tests also run against a deployed origin when `BASE_URL` is set, which the `*-demo-deploy` tasks use. Allowed endpoints are the app's own first-party origin and the relay origin only; no third-party asset, SDK or CDN origin (security-privacy.md PR-01).
- **Owns:** `public/_headers`, `tools/allowed-endpoints.json`, `tests/e2e/p0-network.spec.ts`, `tests/e2e/p0-headers.spec.ts`
- **Acceptance (Given/When/Then):**
  - Given the built app, When headers are checked, Then CSP and all listed headers match exactly (T-SEC-04)
  - Given an injected third-party fetch in a test build, When the network test runs, Then it fails naming the origin (T-NET-01)
  - Given `BASE_URL` set to a served build, When `npm run e2e -- --grep "@headers|@network"` runs, Then both tests run against that origin instead of the local server
- **Commands:** `npm run e2e -- --grep @network`; `npm run e2e -- --grep @headers`
- **Tests:** T-SEC-04, T-NET-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.2, 4.3

### p0-csp-network-verify

**Verify security headers, CSP and network-allowlist e2e test** · scout / verify · phase P0 · wave P0-W11 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-csp-network
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p0-csp-network` candidate revision. Check the CSP for bypasses (unsafe-*, wildcards, data: scripts), verify the network recorder sees fetch/XHR/img/worker/manifest requests, and seed a violation to confirm failure.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** security-privacy.md §4, security-privacy.md §2 PR-05
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-csp-network`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-csp-network` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run e2e -- --grep @network`; `npm run e2e -- --grep @headers`; `npm run check`
- **Tests:** T-SEC-04, T-NET-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.2, 4.3

### p0-synthetic-data

**Seeded synthetic data generator and fixture provenance rules** · ship / feature · phase P0 · wave P0-W11 · risk **medium** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-contracts-verify, p0-localdate-verify
- **Goal:** Seeded generator producing synthetic DayBundles and cycle histories for the scenarios in algorithms-spec.md A18 (stable, drift, outliers, skipped logs, irregular, post-pill), plus demo data for previews; every output carries a `synthetic: true` provenance header recognised by check-no-real-data. The scenario parameters live in `tools/synthetic/scenarios.json` exactly as listed in algorithms-spec.md A18, each with its source or DESIGN label, under generator version 1. This file is **frozen** when this task lands, before any engine code exists; later changes need an ADR and must never be made to help an engine pass.
- **Owns:** `tools/synthetic/**`
- **Acceptance (Given/When/Then):**
  - Given seed 42, When generated twice, Then outputs are byte-identical
  - Given tools/synthetic/scenarios.json, When compared with algorithms-spec.md A18, Then every parameter value and its source/DESIGN label match, and the report records the file's SHA-256
  - Given generated fixtures, When `npm run check` runs, Then check-no-real-data accepts them and rejects a fixture lacking the header
- **Commands:** `npm run check`
- **Constitution/sections:** 4.10

### p0-lock

**Passphrase setup, recovery code, unlock and auto-lock** · ship / feature · phase P0 · wave P0-W12 · risk **high** · features F-024

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p0-lock-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p0-db-store-verify
- **Goal:** LockService: first-run passphrase (suggested 4 words or ≥10 chars) + recovery code (120-bit, confirm 4 chars), unlock via passphrase or recovery code, LMK only in memory while unlocked, auto-lock on hide > timeout (default 60 s) and on cold start, change passphrase (re-wrap only).
- **Owns:** `src/lock/core/**`, `src/ui/screens/lock/core/**`
- **Acceptance (Given/When/Then):**
  - Given a cold start, When the app opens, Then it shows the lock screen and no decrypted data is in the DOM (T-SEC-02)
  - Given the app backgrounded for longer than the timeout, When it returns, Then it is locked and the key handle is null
  - Given a forgotten passphrase, When the recovery code is entered, Then unlock succeeds and a new passphrase can be set without re-encrypting records
- **Commands:** `npm run test`; `npm run e2e -- --grep @lock`
- **Tests:** T-SEC-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p0-lock-verify

**Verify passphrase setup, recovery code, unlock and auto-lock** · scout / verify · phase P0 · wave P0-W13 · risk **high** · features F-024

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-lock
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p0-lock` candidate revision. Check key lifetime, timeout handling, recovery-code entropy and confirmation flow, and that no plaintext persists after lock.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** security-privacy.md §3, ux-spec.md §3.1
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p0-lock`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p0-lock` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run e2e -- --grep @lock`; `npm run test`; `npm run check`
- **Tests:** T-SEC-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p0-lowrisk-review

**P0 wave review of low/medium-risk work** · scout / verify · phase P0 · wave P0-W12 · risk **low** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-design-tokens, p0-app-shell, p0-feasibility-probe, p0-synthetic-data, p0-agents-skills, p0-probe-deploy
- **Goal:** One independent Luna review of p0-design-tokens, p0-app-shell, p0-feasibility-probe, p0-synthetic-data and p0-agents-skills: code quality, a11y, screenshots at iPhone sizes, brief compliance.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** code reviewer, UX and accessibility verifier. **Spec:** ux-spec.md §7, test-strategy.md §1
- **Acceptance (Given/When/Then):**
  - Given each listed revision, When reviewed, Then findings list file:line evidence and screenshots are attached for UI
- **Commands:** `npm run check`; `npm run e2e:shots`
- **Tests:** T-A11Y-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.7, 4.9

### p0-integration

**P0 integration: shell + lock + store wiring, feasibility record** · ship / chore · phase P0 · wave P0-W14 · risk **medium** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-lock-verify, p0-service-worker-verify, p0-csp-network-verify, p0-lowrisk-review, p0-device-feasibility, p0-verifier-sandbox-proof-verify, p0-dispatch-validate
- **Goal:** Wire app routing, lock gate, store and SW registration; write docs/feasibility/device-report.md from the recorded probe results; run the full P0 suite.
- **Owns:** `src/app/**`, `tests/e2e/p0-shell.spec.ts`, `tests/e2e/p0-lock.spec.ts`, `tests/e2e/p0-offline.spec.ts`, `docs/feasibility/**`, `docs/progress.md`, `docs/adr/**`
- **Acceptance (Given/When/Then):**
  - Given the integrated main, When `npm run check && npm run e2e` run, Then all pass
  - Given docs/feasibility/device-report.md, When read, Then each FB item has a result and source (probe run date, iOS version)
- **Commands:** `npm run check`; `npm run e2e`
- **Tests:** T-SW-01, T-SEC-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p0-demo-deploy

**Deploy the integrated P0 build to the preview URL for the phase demo** · ship / chore · phase P0 · wave P0-W15 · risk **medium** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-integration
- **Approval precondition:** the AP-18 preview approval recorded in `p0-approvals` covers this deploy. If AP-18 chose captain-run deploys, this task prepares the exact command and the captain runs it.
- **Goal:** Build the landed `main` revision produced by `p0-integration` with the synthetic demo-data generator enabled and the "Preview — synthetic data only" banner on, deploy it with `tools/deploy/pages-preview.sh app`, then run the deployed-origin checks: served bytes equal the build, the response headers equal security-privacy.md §4, and only allow-listed origins are contacted (security-privacy.md PR-01: the first-party app origin served by the host is allowed; third-party asset, SDK and CDN origins are not). Record the URL, revision and build hash in docs/deploy/p0-demo.md. This URL is the phase demo URL used by `gate-phase-0`.
- **Owns:** `docs/deploy/p0-demo.md`
- **Acceptance (Given/When/Then):**
  - Given the preview URL, When `BASE_URL=<url> npm run e2e -- --grep "@headers|@network"` runs, Then the deployed headers equal security-privacy.md §4 and only allow-listed origins are contacted (T-SEC-04, T-NET-01)
  - Given check-preview, When run against the URL, Then no served file differs from the build (T-SEC-08)
  - Given docs/deploy/p0-demo.md, When read, Then it records the URL, the exact landed revision and build hash, and states that only synthetic data is used
- **Commands:** `bash tools/deploy/pages-preview.sh app`; `npx tsx tools/deploy/check-preview.ts <preview-url>`; `BASE_URL=<preview-url> npm run e2e -- --grep "@headers|@network"`
- **Tests:** T-SEC-04, T-NET-01, T-SEC-08 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** Section 3 checkpoints 5 and 6, 4.2, 4.3, 4.10

### p0-phase-verify

**P0 phase verification report** · scout / verify · phase P0 · wave P0-W16 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p0-demo-deploy
- **Goal:** Run every P0 gate command on the landed main revision, confirm all required verify reports PASS for the revisions landed, re-check the deploy records (docs/deploy/p0-relay-spike.md, p0-probe.md, p0-demo.md: synthetic only, no secrets, deployed-origin checks passed), and write the phase verification report for the demo package.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** spec and acceptance verifier. **Spec:** roadmap.md P0, test-strategy.md §6
- **Acceptance (Given/When/Then):**
  - Given integrated main, When gate commands run, Then the report lists each command, result and revision
  - Given any failing check, When reported, Then the gate is not presented for approval until the failure is fixed and re-verified
- **Commands:** `npm run check`; `npm run e2e`; `npm run test:tz`
- **Constitution/sections:** Section 3 approval checkpoint 6

### gate-phase-0

**Phase 0 gate: demo and captain approval** · gate / gate · phase P0 · wave P0-W17 · risk **high** · features —

- **Route:** captain hold (first mate; no crewmate). Prior failed fix rounds: 0.
- **Depends on:** p0-phase-verify
- **Goal:** Captain hold, set when `p0-phase-verify` is Done (not at import): present the P0 demo package (agent-operating-model.md §11) with the preview URL from docs/deploy/p0-demo.md; approve with 'continue'.
- **Acceptance (Given/When/Then):**
  - Given the demo package and smoke checklist results, When the captain replies 'continue', Then the first mate records approval and P1 tasks become ready
- **Constitution/sections:** Section 3 approval checkpoint 6

## P1

### p1-log-repo

**Log repository and settings repository on the encrypted store** · ship / feature · phase P1 · wave P1-W1 · risk **high** · features F-009, F-013

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-log-repo-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** gate-phase-0
- **Goal:** LogRepo/SettingsRepo over RecordStore: DayBundle per LocalDate with per-field HLC, upsert/clear tracker values, overrides, contraception state, profile; change events for the engine worker; tombstones.
- **Owns:** `src/data/repos/**`
- **Acceptance (Given/When/Then):**
  - Given a tracker value set then cleared, When reloaded, Then the bundle reflects the clear with a tombstone and HLC ordering
  - Given 2 years of synthetic bundles, When loaded after unlock, Then load completes within the architecture.md §8 budget in the bench
- **Commands:** `npm run test`; `npm run bench`
- **Tests:** T-PERF-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p1-log-repo-verify

**Verify log repository and settings repository on the encrypted store** · scout / verify · phase P1 · wave P1-W2 · risk **high** · features F-009, F-013

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-log-repo
- **Goal:** Independent code reviewer, spec and acceptance verifier review of the exact `p1-log-repo` candidate revision. Data-layer review: field-level HLC, tombstones, no plaintext leakage, performance.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** code reviewer, spec and acceptance verifier. **Spec:** architecture.md §4.5, §5
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p1-log-repo`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p1-log-repo` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test`; `npm run bench`; `npm run check`
- **Tests:** T-PERF-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p1-episodes

**Engine A1/A3: bleeding episodes, spotting, assumed days, period length** · ship / feature · phase P1 · wave P1-W2 · risk **high** · features F-001, F-011

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-episodes-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** gate-phase-0
- **Goal:** Implement algorithms-spec.md A1 and A3 exactly as pure functions over EngineInput.
- **Owns:** `src/engine/episodes/**`, `tests/golden/p1-episodes.json`
- **Reference vectors:** TV-E1..E5, TV-L1..L3 (in [algorithms-spec.md](algorithms-spec.md))
- **Acceptance (Given/When/Then):**
  - Given TV-E1..TV-E5 and TV-L1..TV-L3, When run, Then outputs match exactly
  - Given shuffled input order, When run, Then output is identical (E2)
- **Commands:** `npm run test:golden`; `npm run test`
- **Tests:** T-ENG-01, T-ENG-03 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4, 4.6

### p1-episodes-verify

**Verify engine A1/A3: bleeding episodes, spotting, assumed days, period length** · scout / verify · phase P1 · wave P1-W3 · risk **high** · features F-001, F-011

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-episodes
- **Goal:** Independent algorithm auditor review of the exact `p1-episodes` candidate revision. Derive TV-E/TV-L expectations from the spec before reading code; add adversarial cases (gaps, overrides, withdrawal kind).
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** algorithm auditor. **Spec:** algorithms-spec.md A1, A3. **Vectors:** TV-E1..E5, TV-L1..L3
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p1-episodes`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p1-episodes` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:golden`; `npm run test`; `npm run check`
- **Tests:** T-ENG-01, T-ENG-03 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4, 4.6

### p1-onboarding

**Onboarding (no account): install check, role, basics, reminders opt-in** · ship / feature · phase P1 · wave P1-W2 · risk **medium** · features F-020, F-015

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** gate-phase-0
- **Goal:** Screens per ux-spec.md §3.1 steps 2, 3, 6, 7, 8 and 9 (lock steps reuse P0 lock screens via props), including the fixed operator-disclosure text of step 8 for both roles; writes Profile and ContraceptionState through SettingsRepo interface.
- **Owns:** `src/ui/screens/onboarding/**`
- **Acceptance (Given/When/Then):**
  - Given a new install, When onboarding completes with 'not sure' answers, Then Profile stores no typical lengths and Today shows the first-cycle state
  - Given the browser is not standalone, When onboarding opens, Then the install guide appears with the Safari-data warning
  - Given either role, When onboarding runs, Then the fixed operator-disclosure text from ux-spec.md §3.1 is shown before pairing is offered (T-UX-05)
- **Commands:** `npm run check`; `npm run e2e -- --grep @onboarding`
- **Tests:** T-A11Y-01, T-UX-05 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.2 no accounts, 4.7

### p1-quick-log

**Quick log sheet (≤3 taps) with undo** · ship / feature · phase P1 · wave P1-W3 · risk **medium** · features F-001, F-009, F-010

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** gate-phase-0, p1-log-repo-verify
- **Goal:** Quick log sheet per ux-spec.md §3.3 with pinned trackers, instant save, undo toast.
- **Owns:** `src/ui/screens/quicklog/**`
- **Acceptance (Given/When/Then):**
  - Given Today, When logging a symptom, Then it takes exactly 2 taps and is persisted (T-UX-01 component level)
  - Given VoiceOver labels, When inspected, Then every chip has a meaningful accessible name
- **Commands:** `npm run check`
- **Tests:** T-UX-01, T-A11Y-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.7

### p1-cycle-engine

**Engine v1: A2 prediction, A4 fertility + suppression, A5 chance, A16 P1 modifiers, runEngine** · ship / feature · phase P1 · wave P1-W4 · risk **high** · features F-002, F-003, F-004, F-007, F-008, F-015, F-019, F-071, F-072

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-cycle-engine-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p1-episodes-verify
- **Goal:** Implement A2 (including the planning-range explanation text), A4 with every named suppression reason, A5 with the category table for every suppression state, and the rows of A16 marked P1 (any hormonal method: suppression and the ≥3-episode rule; copper IUD; post-pill settling), plus runEngine with engineVersion/paramsHash, explanations and invariants E1–E7. Pack-aware withdrawal-bleed prediction (A16 rows marked P4, TV-K1, F-016) is **not** in scope. No randomness, clock or locale.
- **Owns:** `src/engine/cycle/**`, `src/engine/index.ts`, `src/engine/params.ts`, `tests/golden/p1-cycle.json`
- **Reference vectors:** TV-P1..P8, TV-F1..F3, TV-Q1..Q6, TV-K2, TV-K3 and the A5 vectors (in [algorithms-spec.md](algorithms-spec.md))
- **Acceptance (Given/When/Then):**
  - Given TV-P1..TV-P8, TV-F1..TV-F3, TV-Q1..TV-Q6, TV-K2, TV-K3 and the A5 vectors, When run, Then outputs match exactly
  - Given each A4 suppression reason, When chanceByDay is produced, Then every covered day carries that reason's named A5 category and fixed text
  - Given fast-check generated histories, When run, Then E1–E7 hold for ≥1,000 runs each
  - Given any input, When chanceByDay is produced, Then no value is zero/none/safe (E4)
  - Given two inputs differing only in desire/energy/mood logs, When run, Then fertility, prediction and chance outputs are identical (T-CON-15)
- **Commands:** `npm run test:golden`; `npm run test`
- **Tests:** T-ENG-01, T-ENG-03, T-UX-04, T-CON-15 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4, 4.6

### p1-cycle-engine-verify

**Verify engine v1: A2 prediction, A4 fertility + suppression, A5 chance, A16 P1 modifiers, runEngine** · scout / verify · phase P1 · wave P1-W5 · risk **high** · features F-002, F-003, F-004, F-007, F-008, F-015, F-019, F-071, F-072

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-cycle-engine
- **Goal:** Independent algorithm auditor, medical-content fact-checker (medical-safety wording) review of the exact `p1-cycle-engine` candidate revision. Recompute every vector from algorithms-spec.md before reading code; review suppression and chance wording for any safe-day implication; run the backtest if available.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** algorithm auditor, medical-content fact-checker (medical-safety wording). **Spec:** algorithms-spec.md A2, A4, A5, A16 (P1 rows). **Vectors:** TV-P1..P8, TV-F1..F3, TV-Q1..Q6, TV-K2, TV-K3
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p1-cycle-engine`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p1-cycle-engine` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:golden`; `npm run test`; `npm run check`
- **Tests:** T-ENG-01, T-ENG-03, T-UX-04, T-CON-15 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4, 4.6

### p1-log-forms

**Log detail forms for every P1 tracker and tracker customization** · ship / feature · phase P1 · wave P1-W3 · risk **medium** · features F-009, F-010, F-011, F-012, F-013, F-014, F-105

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-log-repo-verify
- **Goal:** Forms per architecture.md §5.2 for flow (+heavy detail), period pain, discharge, symptoms, mood, energy, stress, desire, sex (private), tests, weight, water, sleep, activity, alcohol, notes; pin/hide/reorder trackers.
- **Owns:** `src/ui/screens/log/**`
- **Acceptance (Given/When/Then):**
  - Given heavy flow selected, When the form renders, Then heavy-detail options appear
  - Given the sex form, When rendered, Then the 'Private. There's no way to share this' note is present
  - Given a note containing `<script>` and `onerror=` payloads, When saved and shown again, Then it renders as text and nothing executes (T-SEC-06, notes)
  - Given all forms, When axe runs, Then 0 serious issues
- **Commands:** `npm run check`; `npm run e2e -- --grep @log`
- **Tests:** T-A11Y-01, T-UX-03, T-SEC-06 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.7

### p1-calendar

**Calendar month/year views, day detail, overrides and cycle exclusion** · ship / feature · phase P1 · wave P1-W4 · risk **medium** · features F-005, F-019

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-log-repo-verify
- **Goal:** Calendar per ux-spec.md §3.4 using EngineOutput types (fixtures until integration); non-colour markers; day detail edits and overrides.
- **Owns:** `src/ui/screens/calendar/**`
- **Acceptance (Given/When/Then):**
  - Given a fixture EngineOutput, When the month renders, Then predicted window, assumed days, core fertile days and logs use distinct shapes (not colour only)
  - Given VoiceOver, When a day is focused, Then its label states all its markers
- **Commands:** `npm run check`; `npm run e2e -- --grep @calendar`
- **Tests:** T-A11Y-01, T-UX-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4, 4.7

### p1-today

**Today screen: cycle day, prediction window, chance card, prompts, cards** · ship / feature · phase P1 · wave P1-W6 · risk **medium** · features F-002, F-004, F-006, F-033

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-cycle-engine-verify
- **Goal:** Today per ux-spec.md §3.2 with Why? sheet, permanent no-safe-days line, still-bleeding prompt, warning card slot (EMERGENCY non-dismissable), content card slot.
- **Owns:** `src/ui/screens/today/**`
- **Acceptance (Given/When/Then):**
  - Given any EngineOutput fixture, When Today renders, Then a window and 'Why?' are shown for every prediction (T-UX-02)
  - Given an EMERGENCY warning fixture, When the user tries to dismiss, Then it stays visible while the condition persists
- **Commands:** `npm run check`; `npm run e2e -- --grep @today`
- **Tests:** T-UX-01, T-UX-02, T-UX-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4, 4.7

### p1-content-core

**P1 core education cards (15) with sources and selection (A17)** · ship / feature · phase P1 · wave P1-W4 · risk **high** · features F-035

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-content-core-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** gate-phase-0
- **Goal:** Write the 15 P1 cards listed in ux-spec.md §8 in original wording, each claim mapped to a retrieved source with URL and access date; implement A17 selection; W-11 crisis resource chosen and cited for her country (ask first mate if country unknown → blocked).
- **Owns:** `src/content/cards/core/**`, `src/content/sources.json`, `src/content/index.ts`
- **Reference vectors:** TV-I1 (in [algorithms-spec.md](algorithms-spec.md))
- **Acceptance (Given/When/Then):**
  - Given every card, When T-CONTENT-01 runs, Then each has ≥1 source, lastReviewed and passes copy lint
  - Given TV-I1, When selection runs, Then cramps-basics is chosen
  - Given a card body containing `<script>` and `onerror=` payloads, When rendered, Then they appear as text and nothing executes (T-SEC-06, cards)
- **Commands:** `npm run test`; `npm run check`
- **Tests:** T-CONTENT-01, T-UX-03, T-CON-14, T-SEC-06 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4, 4.5

### p1-content-core-verify

**Verify p1 core education cards (15) with sources and selection (A17)** · scout / verify · phase P1 · wave P1-W5 · risk **high** · features F-035

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-content-core
- **Goal:** Independent medical-content fact-checker review of the exact `p1-content-core` candidate revision. Open every cited source, confirm each claim and its currency, check safety wording (no safe days, no diagnosis), originality vs Flo text.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** medical-content fact-checker. **Spec:** ux-spec.md §8, algorithms-spec.md A17. **Vectors:** TV-I1
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p1-content-core`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p1-content-core` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test`; `npm run check`
- **Tests:** T-CONTENT-01, T-UX-03, T-CON-14 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4, 4.5

### p1-warnings-v1

**Engine A11 warnings v1 (W-01..W-07, W-11)** · ship / feature · phase P1 · wave P1-W6 · risk **high** · features F-033

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-warnings-v1-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p1-cycle-engine-verify, p1-content-core-verify
- **Goal:** Implement A11 rules W-01..W-07 and W-11 with source ids per card, severities, dismissal/cooldown semantics, and add `warnings` to `EngineOutput` in src/engine/index.ts (this task takes over that file from `p1-cycle-engine`). Each card's source id resolves in the registry landed by `p1-content-core`.
- **Owns:** `src/engine/warnings/**`, `tests/golden/p1-warnings.json`, `src/engine/index.ts`
- **Reference vectors:** TV-W1..W12 and TV-W3b (in [algorithms-spec.md](algorithms-spec.md))
- **Acceptance (Given/When/Then):**
  - Given TV-W1..TV-W12 and TV-W3b, When run, Then outputs match exactly
  - Given runEngine, When called on any TV-W input, Then its output includes the same warnings as the rule module (src/engine/index.ts wiring)
  - Given each card, When inspected, Then it carries a source id resolvable in src/content/sources.json
- **Commands:** `npm run test:golden`
- **Tests:** T-ENG-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4

### p1-warnings-v1-verify

**Verify engine A11 warnings v1 (W-01..W-07, W-11)** · scout / verify · phase P1 · wave P1-W7 · risk **high** · features F-033

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-warnings-v1
- **Goal:** Independent medical-content fact-checker (medical-safety wording), algorithm auditor review of the exact `p1-warnings-v1` candidate revision. Check each threshold against the cited guideline text (R3 citations 16–23), severity choices, and that no card diagnoses; re-derive TV-W.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** medical-content fact-checker (medical-safety wording), algorithm auditor. **Spec:** algorithms-spec.md A11 (including the population column), research/R3 §6. **Vectors:** TV-W1..W12, TV-W3b
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p1-warnings-v1`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p1-warnings-v1` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:golden`; `npm run check`
- **Tests:** T-ENG-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4

### p1-backtest

**Backtesting harness with baselines (A18)** · ship / feature · phase P1 · wave P1-W6 · risk **medium** · features F-003

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-cycle-engine-verify
- **Goal:** Walk-forward harness over the frozen tools/synthetic scenarios computing MAE, ±1/±2, coverage, width; baselines B28 and BAVG exactly as defined in algorithms-spec.md A18; a report per scenario and prior-cycle stratum; engine-version comparison mode. The report states that synthetic results show neither real-world nor Flo-equivalent accuracy.
- **Owns:** `tools/backtest/**`
- **Acceptance (Given/When/Then):**
  - Given the TV-A1 error list, When metrics are computed, Then MAE 1.5, ±1 50%, ±2 75%, coverage 75%
  - Given the TV-A2 drift history, When the harness runs it, Then v1 errors are [+4,+4,+4,+4,0,0], BAVG errors [+4,+4,+3,+3,+3,+2] and B28 errors all +4
  - Given seed 42 scenarios, When `npm run backtest` runs, Then a deterministic report is produced and each per-scenario T-ENG-04 target is reported as met or not met, with no target silently relaxed
  - Given tools/synthetic/scenarios.json, When compared with the version landed by `p0-synthetic-data`, Then it is unchanged (frozen generator)
- **Commands:** `npm run backtest`
- **Tests:** T-ENG-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4

### p1-export-import

**JSON and CSV export/import** · ship / feature · phase P1 · wave P1-W5 · risk **high** · features F-023

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-export-import-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p1-log-repo-verify
- **Goal:** Versioned JSON export of all records (decrypted, schema version, engine version) and per-tracker CSV; import with validation, dry-run summary, merge-by-HLC; file download/share using in-memory Blob (R4 T6).
- **Owns:** `src/backup/portable/**`
- **Acceptance (Given/When/Then):**
  - Given a 2-year synthetic dataset, When exported and imported into a fresh store, Then data is equal (T-BAK-01)
  - Given a malformed or newer-version file, When imported, Then nothing is written and a clear error is shown
  - Given a store that also holds synthetic `proj` records, category keys and couple entries written by another device, When exported, Then the files contain none of the projections or keys, and couple entries follow the AP-08 export rule (T-BAK-04)
- **Commands:** `npm run test -- backup`; `npm run e2e -- --grep @export`
- **Tests:** T-BAK-01, T-BAK-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.8, 4.6

### p1-export-import-verify

**Verify jSON and CSV export/import** · scout / verify · phase P1 · wave P1-W7 · risk **high** · features F-023

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-export-import
- **Goal:** Independent code reviewer, spec and acceptance verifier review of the exact `p1-export-import` candidate revision. Round-trip equality, validation, CSV escaping/injection safety, no data written on failure.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** code reviewer, spec and acceptance verifier. **Spec:** architecture.md §5, test-strategy.md T-BAK-01
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p1-export-import`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p1-export-import` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test -- backup`; `npm run e2e -- --grep @export`; `npm run check`
- **Tests:** T-BAK-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.8, 4.6

### p1-delete-all

**Delete all my data (local crypto-erasure)** · ship / feature · phase P1 · wave P1-W7 · risk **high** · features F-022

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p1-delete-all-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p1-log-repo-verify
- **Goal:** security-privacy.md §5 steps 1, 2 and 4 (relay/partner steps arrive in P2): crypto-erase, delete DBs/OPFS/caches, unregister SW, final screen listing what cannot be erased.
- **Owns:** `src/data/wipe/**`, `src/ui/screens/settings/delete/**`
- **Acceptance (Given/When/Then):**
  - Given synthetic data, When delete-all confirms with 'DELETE', Then IndexedDB databases, caches and SW registrations are gone and a fresh onboarding starts (T-CON-20 local part)
- **Commands:** `npm run e2e -- --grep @delete`
- **Tests:** T-CON-20 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p1-delete-all-verify

**Verify delete all my data (local crypto-erasure)** · scout / verify · phase P1 · wave P1-W8 · risk **high** · features F-022

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-delete-all
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p1-delete-all` candidate revision. Confirm ordering (crypto-erase first), completeness of stores, and honest final-screen text.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** security-privacy.md §5
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p1-delete-all`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p1-delete-all` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run e2e -- --grep @delete`; `npm run check`
- **Tests:** T-CON-20 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p1-reminders-inapp

**In-app reminders: still bleeding, symptom log, period window, custom** · ship / feature · phase P1 · wave P1-W8 · risk **medium** · features F-017

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-cycle-engine-verify
- **Goal:** ReminderService evaluation while unlocked per storage-sync-decision.md §9 row 1 and ux-spec.md §3.7.
- **Owns:** `src/reminders/inapp/**`, `src/ui/components/reminder-banner/**`
- **Acceptance (Given/When/Then):**
  - Given an open bleeding episode, When Today renders at or after the reminder time, Then the 'Still bleeding today?' prompt shows (T-REM-01)
  - Given no period recorded, When evaluated, Then no period-specific reminder fires
- **Commands:** `npm run test`
- **Tests:** T-REM-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.7

### p1-settings

**Settings: units, week start, theme, lock timeout, trackers, about** · ship / feature · phase P1 · wave P1-W8 · risk **low** · features F-021

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-log-repo-verify
- **Goal:** Settings per ux-spec.md §3.11 except backup/sync (P2) and delete (separate task).
- **Owns:** `src/ui/screens/settings/main/**`
- **Acceptance (Given/When/Then):**
  - Given °F selected, When a temperature is shown, Then it converts for display only while stored °C is unchanged
- **Commands:** `npm run check`
- **Tests:** T-A11Y-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.7

### p1-lowrisk-review

**P1 wave review of low/medium-risk work** · scout / verify · phase P1 · wave P1-W9 · risk **low** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-onboarding, p1-quick-log, p1-log-forms, p1-calendar, p1-today, p1-backtest, p1-reminders-inapp, p1-settings
- **Goal:** Independent Luna review of the listed P1 low/medium tasks with iPhone screenshots (light/dark) and a11y evidence.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** code reviewer, UX and accessibility verifier. **Spec:** ux-spec.md §3, §5–7
- **Acceptance (Given/When/Then):**
  - Given each revision, When reviewed, Then findings cite file:line and screenshots
- **Commands:** `npm run check`; `npm run e2e:shots`
- **Tests:** T-A11Y-01, T-UX-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.7

### p1-integration

**P1 integration: routes, engine worker, Today/Calendar/Log wiring, e2e** · ship / chore · phase P1 · wave P1-W10 · risk **medium** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-lowrisk-review, p1-warnings-v1-verify, p1-export-import-verify, p1-delete-all-verify, p1-content-core-verify
- **Goal:** Wire screens, run the engine in a Web Worker, connect repos and reminders, add P1 journey e2e (three-tap, offline, TZ matrix, network), update progress log.
- **Owns:** `src/app/**`, `tests/e2e/p1-journeys.spec.ts`, `tests/e2e/p1-tz.spec.ts`, `docs/progress.md`, `docs/adr/**`
- **Acceptance (Given/When/Then):**
  - Given the integrated app, When P1 journeys run on both iPhone descriptors, Then three-tap, uncertainty, no-safe-day, a11y and network tests pass
- **Commands:** `npm run check`; `npm run e2e`; `npm run test:tz`
- **Tests:** T-UX-01, T-UX-04, T-NET-01, T-DATE-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.4, 4.6, 4.7

### p1-demo-deploy

**Deploy the integrated P1 build to the preview URL for the phase demo** · ship / chore · phase P1 · wave P1-W11 · risk **medium** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-integration
- **Approval precondition:** the AP-18 preview approval recorded in `p0-approvals` covers this deploy. If AP-18 chose captain-run deploys, this task prepares the exact command and the captain runs it.
- **Goal:** Build the landed `main` revision produced by `p1-integration` with the synthetic demo-data generator enabled and the "Preview — synthetic data only" banner on, deploy it with `tools/deploy/pages-preview.sh app`, then run the deployed-origin checks: served bytes equal the build, the response headers equal security-privacy.md §4, and only allow-listed origins are contacted (security-privacy.md PR-01: the first-party app origin served by the host is allowed; third-party asset, SDK and CDN origins are not). Record the URL, revision and build hash in docs/deploy/p1-demo.md. This URL is the phase demo URL used by `gate-phase-1`.
- **Owns:** `docs/deploy/p1-demo.md`
- **Acceptance (Given/When/Then):**
  - Given the preview URL, When `BASE_URL=<url> npm run e2e -- --grep "@headers|@network"` runs, Then the deployed headers equal security-privacy.md §4 and only allow-listed origins are contacted (T-SEC-04, T-NET-01)
  - Given check-preview, When run against the URL, Then no served file differs from the build (T-SEC-08)
  - Given docs/deploy/p1-demo.md, When read, Then it records the URL, the exact landed revision and build hash, and states that only synthetic data is used
- **Commands:** `bash tools/deploy/pages-preview.sh app`; `npx tsx tools/deploy/check-preview.ts <preview-url>`; `BASE_URL=<preview-url> npm run e2e -- --grep "@headers|@network"`
- **Tests:** T-SEC-04, T-NET-01, T-SEC-08 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** Section 3 checkpoints 5 and 6, 4.2, 4.3, 4.10

### p1-phase-verify

**P1 phase verification report** · scout / verify · phase P1 · wave P1-W12 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p1-demo-deploy
- **Goal:** Run P1 gate commands (incl. backtest, reporting each T-ENG-04 target) on the landed main; confirm required verify reports PASS; re-check docs/deploy/p1-demo.md; write the phase report.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** spec and acceptance verifier. **Spec:** roadmap.md P1, test-strategy.md §6
- **Acceptance (Given/When/Then):**
  - Given integrated main, When gate commands run, Then the report lists commands, results and revision
- **Commands:** `npm run check`; `npm run e2e`; `npm run backtest`
- **Constitution/sections:** Section 3 approval checkpoint 6

### gate-phase-1

**Phase 1 gate: demo and captain approval** · gate / gate · phase P1 · wave P1-W13 · risk **high** · features —

- **Route:** captain hold (first mate; no crewmate). Prior failed fix rounds: 0.
- **Depends on:** p1-phase-verify
- **Goal:** Captain hold, set when `p1-phase-verify` is Done: the P1 demo package with the preview URL from docs/deploy/p1-demo.md; approve with 'continue'.
- **Acceptance (Given/When/Then):**
  - Given the demo package and smoke results, When the captain replies 'continue', Then approval is recorded and P2 tasks become ready
- **Constitution/sections:** Section 3 approval checkpoint 6

## P2

### p2-identity

**Device and owner/partner identity keys and certificates** · ship / feature · phase P2 · wave P2-W1 · risk **high** · features F-025

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-identity-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** gate-phase-1
- **Goal:** Device signing/agreement keys (non-extractable), owner/partner identity keys sealed under LMK and included in backups, device certificates, verification helpers (architecture.md §4.1).
- **Owns:** `src/crypto/identity/**`
- **Acceptance (Given/When/Then):**
  - Given a new device, When identity is created, Then device keys are non-extractable and the identity key is only stored sealed
  - Given a certificate signed by another identity, When verified, Then it is rejected
- **Commands:** `npm run test:crypto`
- **Tests:** T-PAIR-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.3

### p2-identity-verify

**Verify device and owner/partner identity keys and certificates** · scout / verify · phase P2 · wave P2-W2 · risk **high** · features F-025

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-identity
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-identity` candidate revision. Review key types/extractability, certificate format and verification edge cases.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** architecture.md §4.1, security-privacy.md §3
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-identity`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-identity` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:crypto`; `npm run check`
- **Tests:** T-PAIR-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.3

### p2-share-keys

**Category key epochs, wrap/unwrap to partner, rotation** · ship / feature · phase P2 · wave P2-W3 · risk **high** · features F-060, F-101

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-share-keys-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-identity-verify
- **Goal:** CK_{c,e}/CPK_e lifecycle per security-privacy.md §3: create, ECDH-ES wrap signed by her device, unwrap and re-seal on his device, rotate on revoke/unpair/device change.
- **Owns:** `src/share/keys/**`
- **Acceptance (Given/When/Then):**
  - Given only cycle_overview enabled, When keys are wrapped, Then his device holds exactly one CK (T-CON-02)
  - Given revoke, When epoch e+1 is created, Then data sealed under e+1 cannot be opened with his keys (T-CON-05, T-PAIR-04)
- **Commands:** `npm run test:consent`; `npm run test:crypto`
- **Tests:** T-CON-01, T-CON-02, T-CON-05, T-PAIR-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1

### p2-share-keys-verify

**Verify category key epochs, wrap/unwrap to partner, rotation** · scout / verify · phase P2 · wave P2-W4 · risk **high** · features F-060, F-101

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-share-keys
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-share-keys` candidate revision. Attempt to obtain any unshared category key from partner-side state; review rotation completeness and signature checks.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** security-privacy.md §2–3
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-share-keys`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-share-keys` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:consent`; `npm run test:crypto`; `npm run check`
- **Tests:** T-CON-01, T-CON-02, T-CON-05, T-PAIR-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1

### p2-sync-core

**Sync core: HLC, merge, tombstones, conflict copies, outbox/inbox** · ship / feature · phase P2 · wave P2-W3 · risk **high** · features F-025

- **Route:** rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p2-sync-core-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-identity-verify
- **Goal:** Implement architecture.md §4.5: single-writer records, HLC LWW, tombstones ≥180 days, conflict copies (30 days, visible), durable outbox, cursors, full resync beyond tombstone horizon.
- **Owns:** `src/sync/core/**`
- **Acceptance (Given/When/Then):**
  - Given random operation sets, When merged in any order, Then results are equal and idempotent (T-SYNC-01)
  - Given concurrent edits, When merged, Then the loser appears in conflict copies (T-SYNC-02)
  - Given an app restart with queued envelopes, When restarted, Then they replay in order (T-SYNC-03)
- **Commands:** `npm run test:sync`
- **Tests:** T-SYNC-01, T-SYNC-02, T-SYNC-03, T-SYNC-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p2-sync-core-verify

**Verify sync core: HLC, merge, tombstones, conflict copies, outbox/inbox** · scout / verify · phase P2 · wave P2-W4 · risk **high** · features F-025

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-sync-core
- **Goal:** Independent code reviewer, spec and acceptance verifier review of the exact `p2-sync-core` candidate revision. Property-test review, clock-skew cases, tombstone horizon, no silent loss.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** code reviewer, spec and acceptance verifier. **Spec:** architecture.md §4.5
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-sync-core`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-sync-core` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:sync`; `npm run check`
- **Tests:** T-SYNC-01, T-SYNC-02, T-SYNC-03, T-SYNC-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p2-relay-worker

**Relay Worker + D1: signed requests, slots, couple log, deletion** · ship / feature · phase P2 · wave P2-W2 · risk **high** · features F-025

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-relay-worker-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** gate-phase-1
- **Goal:** Implement storage-sync-decision.md §5 endpoints (not push/cron) with signature auth, roles, nonces, size limits, CORS to app origin only, sequence-number cursors and the metadata minimisation of security-privacy.md PR-07 (no logging, no IP or location reads, opaque ids); local tests with wrangler local mode.
- **Owns:** `relay/src/api/**`, `relay/schema.sql`, `relay/wrangler.toml`, `relay/package.json`, `relay/test/**`
- **Acceptance (Given/When/Then):**
  - Given unsigned/expired/replayed/wrong-role requests, When sent, Then 401/403 (T-RELAY-01)
  - Given a partner-signed slot PUT, When sent, Then 403 (T-CON-07)
  - Given a DB dump after synthetic traffic, When scanned, Then no canary appears (T-SEC-03)
  - Given relay/wrangler.toml, relay/schema.sql and relay/src, When checked, Then logs/observability are off, no Logpush or tail consumer is configured, no code reads the client IP or `cf` location fields, and the schema has no IP, user-agent or precise wall-clock columns (T-RELAY-02)
- **Commands:** `npm run relay:test`
- **Tests:** T-RELAY-01, T-CON-07, T-SEC-03, T-RELAY-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.2, Section 3 budget

### p2-relay-worker-verify

**Verify relay Worker + D1: signed requests, slots, couple log, deletion** · scout / verify · phase P2 · wave P2-W3 · risk **high** · features F-025

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-relay-worker
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-relay-worker` candidate revision. Authz matrix, replay, CORS, logging, quota-error behaviour, metadata minimisation.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** storage-sync-decision.md §5, security-privacy.md §1
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-relay-worker`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-relay-worker` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run relay:test`; `npm run check`
- **Tests:** T-RELAY-01, T-CON-07, T-SEC-03 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.2, Section 3 budget

### p2-projection

**Share categories and projection builder (allow-listed fields)** · ship / feature · phase P2 · wave P2-W5 · risk **high** · features F-056, F-059, F-101

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-projection-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-share-keys-verify
- **Goal:** Projection schemas per category (architecture.md §4.3), start-date filter, per-entry opt-in, life-stage suppression indistinguishable from manual pause.
- **Owns:** `src/share/projection/**`
- **Acceptance (Given/When/Then):**
  - Given random private data and category sets (fast-check), When projected, Then only allow-listed fields of enabled categories appear and canaries from notes never do (T-CON-08)
  - Given pregnancy mode with life_stage off, When projections are generated, Then partner-visible state equals the manual-pause state byte-for-byte (T-CON-09)
  - Given a start date, When projected, Then no earlier data appears (T-CON-11); only ticked entries appear (T-CON-12)
- **Commands:** `npm run test:consent`
- **Tests:** T-CON-08, T-CON-09, T-CON-11, T-CON-12 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1

### p2-projection-verify

**Verify share categories and projection builder (allow-listed fields)** · scout / verify · phase P2 · wave P2-W6 · risk **high** · features F-056, F-059, F-101

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-projection
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-projection` candidate revision. Try to leak any non-allow-listed field or a mode change through projections, sizes or versions.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** security-privacy.md §2, architecture.md §4.3
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-projection`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-projection` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:consent`; `npm run check`
- **Tests:** T-CON-08, T-CON-09, T-CON-11, T-CON-12 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1

### p2-transport

**Sync transports: relay client and manual .flosync file exchange** · ship / feature · phase P2 · wave P2-W5 · risk **high** · features F-025

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-transport-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-sync-core-verify, p2-relay-worker-verify
- **Goal:** SyncTransport implementations: signed relay client with retry/backoff and quota-error queueing; file transport producing/consuming sealed envelope bundles via share sheet/file input.
- **Owns:** `src/sync/transport/**`
- **Acceptance (Given/When/Then):**
  - Given two in-memory devices and the local relay, When entries are exchanged, Then both converge
  - Given the relay is unreachable, When exchanging via .flosync files, Then both converge identically
- **Commands:** `npm run test:sync`
- **Tests:** T-SYNC-01, T-SYNC-03 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p2-transport-verify

**Verify sync transports: relay client and manual .flosync file exchange** · scout / verify · phase P2 · wave P2-W6 · risk **high** · features F-025

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-transport
- **Goal:** Independent code reviewer, privacy, consent and security reviewer review of the exact `p2-transport` candidate revision. Signature construction, retry safety, file transport integrity and metadata in file names.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** code reviewer, privacy, consent and security reviewer. **Spec:** storage-sync-decision.md §5
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-transport`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-transport` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:sync`; `npm run check`
- **Tests:** T-SYNC-01, T-SYNC-03 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.6

### p2-pairing

**In-person pairing: two-way QR, safety code, fallback code** · ship / feature · phase P2 · wave P2-W5 · risk **high** · features F-055

- **Route:** rule 2 (design/extensive/ambiguous or escalation) → `github-copilot/claude-opus-5.5`, effort high; required independent verify `p2-pairing-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-share-keys-verify, p2-relay-worker-verify
- **Goal:** architecture.md §4.2 commit-then-reveal sequence exactly: QR-A with the commitment and no secret, QR-B with his keys and nonce, QR-C revealing her nonce only after QR-B is recorded, the commitment check on his phone, the 6-digit safety code over the full transcript, explicit "Codes match" confirmation on both phones, 10-minute single-use sessions, mismatch logging in her consent history, camera scan with the `.flopair` AirDrop-file fallback (FB-05 result decides the default), and couple-key creation; sharing stays off. Use a single canonical, length-prefixed transcript encoding and document it in the module. This is a planner design, not a formally analysed protocol: report any ambiguity instead of improvising.
- **Owns:** `src/pairing/core/**`, `src/ui/screens/pairing/**`
- **Acceptance (Given/When/Then):**
  - Given two browser contexts, When pairing completes, Then safety codes match and the partner view shows 'Nothing shared yet' (T-PAIR-01, T-CON-01)
  - Given an attacker who has seen QR-A and substitutes keys in QR-B, When both phones show their codes, Then the codes differ and confirming the mismatch aborts pairing (T-PAIR-02 a)
  - Given a QR-C whose nonce does not match QR-A's commitment, When his phone processes it, Then pairing aborts (T-PAIR-02 b); and her phone never displays QR-C before it has recorded a QR-B (T-PAIR-02 c)
  - Given random changes to any single transcript field, When the code is recomputed, Then it changes (property test, T-PAIR-02 d); and QR-A's fields equal the allowlist {v, sessionId, spaceId, relayUrl, H.signPub, H.agreePub, C, expires} (T-PAIR-02 e)
  - Given an expired or reused session, When used, Then it is rejected (T-PAIR-03)
- **Commands:** `npm run e2e -- --grep @pairing`
- **Tests:** T-PAIR-01, T-PAIR-02, T-PAIR-03, T-CON-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1

### p2-pairing-verify

**Verify in-person pairing: two-way QR, safety code, fallback code** · scout / verify · phase P2 · wave P2-W6 · risk **high** · features F-055

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-pairing
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-pairing` candidate revision. Audit the commit-then-reveal ordering, the transcript encoding (canonical, length-prefixed, every QR field included), the abort paths, code derivation, expiry and replay, and that no category key is wrapped at pairing; attempt substitution as an attacker who has seen every QR code or file. State plainly in the report that this is a design review, not a formal proof.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** architecture.md §4.2, security-privacy.md §3
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-pairing`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-pairing` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run e2e -- --grep @pairing`; `npm run check`
- **Tests:** T-PAIR-01, T-PAIR-02, T-PAIR-03, T-CON-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1

### p2-share-controls

**Sharing controls: enable, pause, revoke, start date, preview, consent log** · ship / feature · phase P2 · wave P2-W7 · risk **high** · features F-060, F-101

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-share-controls-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-projection-verify, p2-pairing-verify
- **Goal:** ShareService + UI per ux-spec.md §3.8: per-category toggles with preview-before-confirm, one-tap pause without reason, revoke with plain 'can't unsee' text, start date, consent history, Today sharing line.
- **Owns:** `src/share/service/**`, `src/ui/screens/sharing/**`
- **Acceptance (Given/When/Then):**
  - Given a category on, When preview opens, Then it renders the exact published ciphertext decrypted with the same renderer as the partner view (T-CON-03)
  - Given pause, When tapped, Then no new slot versions publish and no reason prompt exists (T-CON-04)
  - Given revoke, When confirmed, Then the fixed 'can't unsee' text was shown (T-CON-06) and rotation ran (T-CON-05)
  - Given the UI, When searched, Then no share-request, streak or receipt feature exists (T-CON-17)
  - Given Sharing help, When opened, Then it shows the fixed operator-disclosure text naming the AP-10 account holder and what that person could see or change (T-UX-05)
- **Commands:** `npm run test:consent`; `npm run e2e -- --grep @sharing`
- **Tests:** T-CON-03, T-CON-04, T-CON-05, T-CON-06, T-CON-10, T-CON-17, T-UX-05 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1

### p2-share-controls-verify

**Verify sharing controls: enable, pause, revoke, start date, preview, consent log** · scout / verify · phase P2 · wave P2-W8 · risk **high** · features F-060, F-101

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-share-controls
- **Goal:** Independent privacy, consent and security reviewer, UX and accessibility verifier review of the exact `p2-share-controls` candidate revision. Consent flows end to end in two contexts; discoverability; wording; pressure mechanics absent.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer, UX and accessibility verifier. **Spec:** security-privacy.md §2, ux-spec.md §3.8
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-share-controls`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-share-controls` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:consent`; `npm run e2e -- --grep @sharing`; `npm run check`
- **Tests:** T-CON-03, T-CON-04, T-CON-05, T-CON-06, T-CON-10, T-CON-17 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1

### p2-partner-view

**Partner Today/Calendar from shared projections only; tips from her data** · ship / feature · phase P2 · wave P2-W7 · risk **high** · features F-056, F-057, F-061

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-partner-view-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-projection-verify, p2-transport-verify
- **Goal:** Partner mode screens per ux-spec.md §3.10 rendering only decrypted projections, 'Paused by her' states, tips derived only from projections and support cards, permanent no-safe-days line on fertility.
- **Owns:** `src/ui/screens/partner/**`
- **Acceptance (Given/When/Then):**
  - Given only cycle_overview shared, When the partner view renders, Then no other category's UI appears and no edit control exists (T-CON-07)
  - Given tips, When generated, Then each cites the projection or support card it came from (T-CON-16)
- **Commands:** `npm run e2e -- --grep @partner`
- **Tests:** T-CON-07, T-CON-16, T-UX-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.7

### p2-partner-view-verify

**Verify partner Today/Calendar from shared projections only; tips from her data** · scout / verify · phase P2 · wave P2-W8 · risk **high** · features F-056, F-057, F-061

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-partner-view
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-partner-view` candidate revision. Confirm partner screens cannot render or request unshared data; stereotype-free tips.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** ux-spec.md §3.10, security-privacy.md §2
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-partner-view`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-partner-view` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run e2e -- --grep @partner`; `npm run check`
- **Tests:** T-CON-07, T-CON-16, T-UX-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.7

### p2-couple-space

**Couple space: entries, love notes, support cards, insight flags** · ship / feature · phase P2 · wave P2-W7 · risk **high** · features F-102, F-115, F-117

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-couple-space-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-transport-verify, p2-pairing-verify
- **Goal:** CoupleRepo + UI per ux-spec.md §3.9: author-only edit/delete, hide-for-me, her 'use in my insights' flag records, love notes with her display mode (off/Today/collection) and no health triggers, support cards sent deliberately.
- **Owns:** `src/couple/**`, `src/ui/screens/couple/**`
- **Acceptance (Given/When/Then):**
  - Given an entry by him, When she tries to edit, Then only hide-for-me is offered
  - Given her flag off, When the engine input is built, Then the entry is excluded (T-CON-13)
  - Given love-note display off, When Today renders, Then no note appears; the note schema has no health fields (T-CON-18)
- **Commands:** `npm run test`; `npm run e2e -- --grep @couple`
- **Tests:** T-CON-13, T-CON-18 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.7

### p2-couple-space-verify

**Verify couple space: entries, love notes, support cards, insight flags** · scout / verify · phase P2 · wave P2-W8 · risk **high** · features F-102, F-115, F-117

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-couple-space
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-couple-space` candidate revision. Authorship enforcement, flag semantics, love-note triggers and notification text.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** architecture.md §4.4, ux-spec.md §3.9
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-couple-space`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-couple-space` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test`; `npm run e2e -- --grep @couple`; `npm run check`
- **Tests:** T-CON-13, T-CON-18 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.7

### p2-backup

**Encrypted backup file, restore, restore test, optional relay backup** · ship / feature · phase P2 · wave P2-W9 · risk **high** · features F-119, F-025

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-backup-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-transport-verify
- **Goal:** storage-sync-decision.md §7: .flobak format, passphrase or recovery-code restore, reminders cadence, restore test without writes, opt-in relay backup chunks; neutral file names. Retained as default pending AP-01.
- **Owns:** `src/backup/encrypted/**`, `src/ui/screens/backup/**`
- **Acceptance (Given/When/Then):**
  - Given synthetic data, When backed up, wiped and restored with the passphrase and separately with the recovery code, Then data is equal (T-BAK-02)
  - Given restore test, When run, Then the DB is unchanged (T-BAK-03)
  - Given a wrong secret or truncated file, When restoring, Then nothing is written
  - Given his phone with her shared projections and category keys cached, When he backs up, Then the .flobak contains no projection (plaintext or ciphertext), no category key and no couple key, and only couple entries he wrote (T-BAK-04, canary scan)
- **Commands:** `npm run test -- backup`; `npm run e2e -- --grep @backup`
- **Tests:** T-BAK-02, T-BAK-03, T-BAK-04 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.8, 4.3

### p2-backup-verify

**Verify encrypted backup file, restore, restore test, optional relay backup** · scout / verify · phase P2 · wave P2-W10 · risk **high** · features F-119, F-025

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-backup
- **Goal:** Independent privacy, consent and security reviewer, code reviewer review of the exact `p2-backup` candidate revision. Format, KDF use, chunk integrity, restore atomicity, reminder cadence.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer, code reviewer. **Spec:** storage-sync-decision.md §7
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-backup`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-backup` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test -- backup`; `npm run e2e -- --grep @backup`; `npm run check`
- **Tests:** T-BAK-02, T-BAK-03 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.8, 4.3

### p2-unpair-delete

**Unpair from either side; remote parts of delete-all** · ship / feature · phase P2 · wave P2-W9 · risk **high** · features F-060, F-022

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-unpair-delete-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-share-controls-verify, p2-couple-space-verify
- **Goal:** storage-sync-decision.md §4 unpair semantics (AP-08 default for couple entries) and security-privacy.md §5 step 3 (relay space deletion, push removal, partner purge request).
- **Owns:** `src/share/unpair/**`, `src/data/wipe-remote/**`
- **Acceptance (Given/When/Then):**
  - Given either side unpairs, When processed, Then his device purges her projections, keys rotate and couple entries follow the AP-08 default (T-CON-19, T-PAIR-05)
  - Given delete-all while paired, When run, Then the relay space is deleted and a purge request is sent (T-CON-20)
- **Commands:** `npm run e2e -- --grep @unpair`
- **Tests:** T-CON-19, T-CON-20, T-PAIR-05 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.3

### p2-unpair-delete-verify

**Verify unpair from either side; remote parts of delete-all** · scout / verify · phase P2 · wave P2-W10 · risk **high** · features F-060, F-022

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-unpair-delete
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-unpair-delete` candidate revision. Offline partner, replayed unpair, partial failures and honest messaging.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** storage-sync-decision.md §4, security-privacy.md §5
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-unpair-delete`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-unpair-delete` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run e2e -- --grep @unpair`; `npm run check`
- **Tests:** T-CON-19, T-CON-20, T-PAIR-05 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.3

### p2-push

**Generic Web Push: subscription, SW handler, relay cron sender** · ship / feature · phase P2 · wave P2-W4 · risk **high** · features F-018, F-058, F-114

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-push-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-relay-worker-verify
- **Goal:** storage-sync-decision.md §9 (register the handler from the service-worker entry src/sw/entry.ts and add the cron trigger to relay/wrangler.toml, both taken over from their earlier owners): opt-in subscription after tap, schedule {IANA tz, HH:MM}, cron every 15 min sending empty/declarative pushes with fixed generic text, SW shows generic text only; partner daily push opt-in; event push only if she enables it.
- **Owns:** `src/reminders/push/**`, `src/sw/push-handler.ts`, `relay/src/cron/**`, `src/sw/entry.ts`, `relay/wrangler.toml`
- **Acceptance (Given/When/Then):**
  - Given a push event while locked, When handled, Then the notification text is one of the fixed generic strings (T-CON-16)
  - Given her schedule, When the cron runs, Then send times do not depend on any health data (code review + unit test)
- **Commands:** `npm run test`; `npm run relay:test`
- **Tests:** T-CON-16, T-REM-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.2

### p2-push-verify

**Verify generic Web Push: subscription, SW handler, relay cron sender** · scout / verify · phase P2 · wave P2-W9 · risk **high** · features F-018, F-058, F-114

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-push
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-push` candidate revision. Metadata review, VAPID secret handling, generic text, no health-derived timing; FB-02/FB-06 results honoured.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** storage-sync-decision.md §9
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-push`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-push` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test`; `npm run relay:test`; `npm run check`
- **Tests:** T-CON-16, T-REM-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.2

### p2-preview-relay-deploy

**Deploy the verified relay, D1 schema, preview-only secrets and cron to the preview relay (synthetic only)** · ship / chore · phase P2 · wave P2-W10 · risk **high** · features F-025

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-preview-relay-deploy-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** p2-relay-worker-verify, p2-push-verify
- **Approval precondition:** AP-10 and AP-18 answered in `p0-approvals`. This is a **preview** deployment with synthetic data only (AP-29 defines the boundary); it is not production and must never receive real health data.
- **Goal:** Replace the P0 spike code on the preview relay Worker with the verified relay (`relay/`): add an `[env.preview]` section to relay/wrangler.toml, apply relay/schema.sql to the preview D1 database, create **preview-only** enrollment secret and VAPID key pair as Worker secrets (never reused for production), enable the cron trigger, and keep Workers logs/observability, Logpush and tail consumers off. Write `tools/deploy/relay-preview.sh` and record the relay origin, revision and settings in docs/deploy/p2-relay.md. State in the record that disabling logs does not stop the account owner from re-enabling them or tailing live requests (security-privacy.md T13).
- **Owns:** `relay/wrangler.toml`, `tools/deploy/relay-preview.sh`, `docs/deploy/p2-relay.md`
- **Acceptance (Given/When/Then):**
  - Given the deployed preview relay, When the T-RELAY-01 request matrix is replayed against it with synthetic devices, Then the results equal the local run
  - Given relay/wrangler.toml and the deployed settings, When checked, Then logs/observability are off, no Logpush or tail consumer exists, and the D1 schema has no IP, user-agent or precise wall-clock columns (T-RELAY-02)
  - Given docs/deploy/p2-relay.md and the commit, When grepped, Then no secret value or account identifier appears
- **Commands:** `npm run relay:test`; `bash tools/deploy/relay-preview.sh`
- **Tests:** T-RELAY-01, T-RELAY-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.2, Section 3 budget and checkpoints 2 and 5

### p2-preview-relay-deploy-verify

**Verify deploy the verified relay, D1 schema, preview-only secrets and cron to the preview relay (synthetic only)** · scout / verify · phase P2 · wave P2-W11 · risk **high** · features F-025

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-preview-relay-deploy
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-preview-relay-deploy` candidate revision and its deployed preview relay: authorization matrix against the live preview, metadata minimisation settings, secret handling, the preview/production separation and the honesty of the owner-visibility statement.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** storage-sync-decision.md §5, security-privacy.md T13 and PR-07, plan.md §18 AP-29
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-preview-relay-deploy`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-preview-relay-deploy` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run relay:test`; `npm run check`
- **Tests:** T-RELAY-01, T-RELAY-02 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.2

### p2-quick-hide

**Quick-hide: neutral screen and immediate lock** · ship / feature · phase P2 · wave P2-W2 · risk **high** · features F-113

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-quick-hide-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** gate-phase-1
- **Goal:** ux-spec.md §4: one tap shows a neutral screen, drops keys and clears decrypted DOM; returning requires unlock; nothing deleted.
- **Owns:** `src/lock/quickhide/**`, `src/ui/components/hide-button/**`
- **Acceptance (Given/When/Then):**
  - Given unlocked app, When Hide is tapped, Then keys are null and decrypted text is absent from the DOM (T-CON-21)
- **Commands:** `npm run e2e -- --grep @hide`
- **Tests:** T-CON-21 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p2-quick-hide-verify

**Verify quick-hide: neutral screen and immediate lock** · scout / verify · phase P2 · wave P2-W11 · risk **high** · features F-113

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-quick-hide
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-quick-hide` candidate revision. DOM/memory residue and app-switcher snapshot behaviour.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** ux-spec.md §4
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-quick-hide`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-quick-hide` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run e2e -- --grep @hide`; `npm run check`
- **Tests:** T-CON-21 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p2-passkey-unlock

**Optional Face ID unlock via passkey PRF (feasibility-gated)** · ship / feature · phase P2 · wave P2-W11 · risk **high** · features F-024

- **Route:** rule 4 (bounded high-risk implementation with approved design + tests) → `github-copilot/gpt-6-luna`, effort high; required independent verify `p2-passkey-unlock-verify` before merge. Prior failed fix rounds: 0.
- **Depends on:** gate-phase-1
- **Goal:** security-privacy.md §3 passkey design, enabled only if FB-07 passed on both phones; otherwise ship hidden behind a disabled flag with the reason shown in Settings.
- **Owns:** `src/lock/passkey/**`, `src/ui/screens/lock/passkey/**`
- **Acceptance (Given/When/Then):**
  - Given FB-07 passed, When enrolling and unlocking offline on a real phone, Then unlock works and cancellation falls back to passphrase (T-SEC-07)
  - Given FB-07 failed, When Settings renders, Then Face ID is unavailable with the explanation
- **Commands:** `npm run test:crypto`; `npm run e2e -- --grep @passkey`
- **Tests:** T-SEC-07 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p2-passkey-unlock-verify

**Verify optional Face ID unlock via passkey PRF (feasibility-gated)** · scout / verify · phase P2 · wave P2-W12 · risk **high** · features F-024

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-passkey-unlock
- **Goal:** Independent privacy, consent and security reviewer review of the exact `p2-passkey-unlock` candidate revision. PRF salt handling, KEK derivation, RP-ID/domain coupling, fallback paths.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer. **Spec:** security-privacy.md §3, research/R4 §4
- **Acceptance (Given/When/Then):**
  - Given the exact candidate revision of `p2-passkey-unlock`, When the verifier runs the listed commands and re-derives the spec expectations, Then the report records each command/output and every finding with a reproducing input; verdict PASS only if all acceptance criteria of `p2-passkey-unlock` hold
  - Given any source change after this review, When re-submitted, Then a renewed review of the changed scope is required
- **Commands:** `npm run test:crypto`; `npm run e2e -- --grep @passkey`; `npm run check`
- **Tests:** T-SEC-07 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.3

### p2-integration

**P2 integration: two-device journeys, settings sync/backup wiring** · ship / chore · phase P2 · wave P2-W13 · risk **medium** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-unpair-delete-verify, p2-push-verify, p2-backup-verify, p2-partner-view-verify, p2-quick-hide-verify, p2-passkey-unlock-verify
- **Goal:** Wire partner mode, sharing, couple space, backup, push and quick-hide into the app; two-context e2e journeys covering every T-CON test end to end with the local relay.
- **Owns:** `src/app/**`, `tests/e2e/p2-two-device.spec.ts`, `tests/e2e/p2-consent.spec.ts`, `docs/progress.md`, `docs/adr/**`
- **Acceptance (Given/When/Then):**
  - Given two browser contexts and the local relay, When P2 journeys run, Then all T-CON, T-PAIR and T-SYNC end-to-end tests pass
- **Commands:** `npm run check`; `npm run e2e`; `npm run test:consent`; `npm run relay:test`
- **Tests:** T-CON-01, T-CON-19, T-PAIR-05, T-NET-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.1, 4.6

### p2-demo-deploy

**Deploy the integrated P2 build against the preview relay for the two-phone demo** · ship / chore · phase P2 · wave P2-W14 · risk **medium** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-integration, p2-preview-relay-deploy-verify
- **Approval precondition:** the AP-18 preview approval recorded in `p0-approvals` covers this deploy. If AP-18 chose captain-run deploys, this task prepares the exact command and the captain runs it.
- **Goal:** Build the landed `main` revision produced by `p2-integration` with `RELAY_ORIGIN` set to the preview relay recorded in docs/deploy/p2-relay.md, the synthetic two-phone demo data and the "Preview — synthetic data only" banner; deploy with `tools/deploy/pages-preview.sh app`; run the deployed-origin checks (bytes equal the build; headers equal security-privacy.md §4 with the relay origin in `connect-src`; only the app and preview relay origins are contacted). Record the URL, revision and build hash in docs/deploy/p2-demo.md. This is the two-phone demo URL used by `gate-phase-2`.
- **Owns:** `docs/deploy/p2-demo.md`
- **Acceptance (Given/When/Then):**
  - Given the preview URL, When `BASE_URL=<url> npm run e2e -- --grep "@headers|@network"` runs, Then the deployed headers equal security-privacy.md §4 and only the app origin and the preview relay origin are contacted (T-SEC-04, T-NET-01)
  - Given check-preview, When run against the URL, Then no served file differs from the build (T-SEC-08)
  - Given docs/deploy/p2-demo.md, When read, Then it records the URL, the exact landed revision, the relay origin and build hash, and states that only synthetic data is used
- **Commands:** `bash tools/deploy/pages-preview.sh app`; `npx tsx tools/deploy/check-preview.ts <preview-url>`; `BASE_URL=<preview-url> npm run e2e -- --grep "@headers|@network"`
- **Tests:** T-SEC-04, T-NET-01, T-SEC-08 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** Section 3 checkpoints 5 and 6, 4.1, 4.2, 4.10

### p2-lowrisk-review

**P2 wave review of low/medium-risk work** · scout / verify · phase P2 · wave P2-W14 · risk **low** · features —

- **Route:** rule 5 (bounded routine/low-risk) → `github-copilot/gpt-6-luna`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-integration
- **Goal:** Independent Luna UX/a11y review of all P2 screens with iPhone screenshots (light/dark) on the integrated build.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** UX and accessibility verifier. **Spec:** ux-spec.md §3.8–3.11, §7
- **Acceptance (Given/When/Then):**
  - Given P2 screens, When reviewed, Then axe evidence and screenshots are attached and findings cite file:line
- **Commands:** `npm run e2e:shots`
- **Tests:** T-A11Y-01 ([test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan))
- **Constitution/sections:** 4.7

### p2-phase-verify

**P2 phase verification report (privacy/consent focus)** · scout / verify · phase P2 · wave P2-W15 · risk **high** · features —

- **Route:** rule 1 (high-risk independent verification) → `github-copilot/claude-opus-5.5`, effort high. Prior failed fix rounds: 0.
- **Depends on:** p2-lowrisk-review, p2-demo-deploy
- **Goal:** Run P2 gate commands on the landed main incl. full consent suite; confirm every required verify report PASS; re-check docs/deploy/p2-relay.md and p2-demo.md (preview-only secrets, logging off, synthetic data); produce the phase report.
- **Owns:** no repository files. Its report goes to `~/firstmate/data/<id>/report.md`
- **Verifier types:** privacy, consent and security reviewer, spec and acceptance verifier. **Spec:** roadmap.md P2, security-privacy.md §2, test-strategy.md §6
- **Acceptance (Given/When/Then):**
  - Given integrated main, When the consent suite runs, Then every CR has a passing test listed with revision
- **Commands:** `npm run check`; `npm run e2e`; `npm run test:consent`
- **Constitution/sections:** 4.1

### gate-phase-2

**Phase 2 gate: demo and captain approval** · gate / gate · phase P2 · wave P2-W16 · risk **high** · features —

- **Route:** captain hold (first mate; no crewmate). Prior failed fix rounds: 0.
- **Depends on:** p2-phase-verify
- **Goal:** Captain hold, set when `p2-phase-verify` is Done: the P2 demo package with the two-phone preview URL from docs/deploy/p2-demo.md and the preview relay from docs/deploy/p2-relay.md; approve with 'continue'. P3 tasks are written after this gate.
- **Acceptance (Given/When/Then):**
  - Given the demo package and two-phone smoke results, When the captain replies 'continue', Then approval is recorded and P3 task writing begins
- **Constitution/sections:** Section 3 approval checkpoint 6
