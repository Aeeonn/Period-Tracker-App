# Agent operating model (Step 9)

**Status:** Revised 2026-10-30 for the lighter review and testing policy ([ADR-0012](../adr/0012-lighter-review-and-testing.md)); Copilot orchestration is recorded in [ADR-0011](../adr/0011-vscode-copilot-orchestration.md). The six selected changes narrow high-risk review, set its severity and closure rules, waive review for clean rebases, lighten per-task test runs, and establish standing landing approvals. The three-round cap and escalation after two failed rounds remain unchanged.

**One orchestrator, no new services.** The orchestrator is a VS Code Copilot chat running the `flo-orchestrator` agent. Workers are Copilot subagents. The backlog is [backlog.md](backlog.md). Tooling is a few bash and python scripts inside skills. Nothing runs between turns.

## 1. Roles

| Role                          | Mechanism                                                                                                                                                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Orchestrator (first mate)** | [`flo-orchestrator`](../../.github/agents/flo-orchestrator.agent.md), the captain's chat, following the [`flo-dispatch`](../../.agents/skills/flo-dispatch/SKILL.md) skill | Owns the backlog and dependency graph. Writes briefs, dispatches subagents, enforces gates and brings decisions to the captain. Writes no project source and never runs project code or tests (that is the workers' job). Its only repository writes are backlog and progress-log `chore(backlog)` commits on `main` (§10) and guarded landings (§3 step 7)                              |
| **Implementer**               | [`flo-builder`](../../.github/agents/flo-builder.agent.md), one per ship task, in its own worktree on `fm/<task-id>`                                                       | Runs the build, lint and tests itself before reporting. There is no separate test-runner agent. One Conventional Commit per task ([`flo-commit`](../../.agents/skills/flo-commit/SKILL.md))                                                                                                                                                                                              |
| **Independent verifier**      | [`flo-verifier`](../../.github/agents/flo-verifier.agent.md), a separate subagent reviewing the **exact candidate revision** in its own detached laboratory                | Never edits reviewed source, commits, merges or ships. Reports go to `~/firstmate/data/<task-id>/report.md`, outside the reviewed source. Types: code reviewer, spec/acceptance verifier, algorithm auditor, UX/accessibility verifier, privacy/consent/security reviewer, medical-content fact-checker ([`verification-protocol`](../../.agents/skills/verification-protocol/SKILL.md)) |
| **Researcher**                | [`flo-researcher`](../../.github/agents/flo-researcher.agent.md) (scout)                                                                                                   | Sources and evidence cross-checks; content-source retrieval                                                                                                                                                                                                                                                                                                                              |
| **Critic**                    | [`flo-critic`](../../.github/agents/flo-critic.agent.md) (scout)                                                                                                           | Independent critique of plans, plan revisions, ADRs, briefs and process changes before they are built on                                                                                                                                                                                                                                                                                 |
| **Planner**                   | [`flo-planner`](../../.github/agents/flo-planner.agent.md) (scout)                                                                                                         | Turns decisions, findings and new phases into backlog item proposals and draft briefs. The orchestrator records them                                                                                                                                                                                                                                                                     |
| **Integrator**                | `flo-builder` on the ship task `pN-integration`                                                                                                                            | Wires screens into `src/app/**`, runs the full e2e suite and fixes only integration glue. Never merges branches                                                                                                                                                                                                                                                                          |
| **Deployer**                  | `flo-builder` on the `*-deploy` and `p0-relay-spike` ship tasks                                                                                                            | Deploys **synthetic-only previews** with the credential approved in AP-10/AP-18, runs the deployed-origin checks and commits a deploy record under `docs/deploy/`. If AP-18 chose captain-run deploys, the deployer prepares the exact command and the captain runs it                                                                                                                   |

## 2. Model and credit policy

`~/firstmate/config/crew-dispatch.json` remains the routing source of truth (its `harness: pi` field no longer applies). The orchestrator maps its five rules to agents **in this priority order**. Agent frontmatter carries the default model and `reasoning-effort: high`:

| Priority | Rule                                                                                                                                                                                                               | Applies to (this project)                                                                                                                              | Agent → model                                                                                                   | Minimum effort |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------- |
| 1        | Dedicated high-risk verification                                                                                                                                                                                   | Prediction/medical engine algorithms, crypto and keys, pairing and sync merge, consent enforcement, migrations and backup/restore, and medical content | `flo-verifier` -> Claude Opus 5.5                                                                               | high           |
| 2        | Plan synthesis/critique, architecture, extensive or ambiguous multi-file work, high-risk work without an approved design and clear tests, and any implementation after **2 documented failed fix-and-test rounds** | Plan critique, contract and foundation changes, `p0-relay-spike`, `p2-sync-core`, `p2-pairing`, any escalated task                                     | `flo-planner`, `flo-critic` → Claude Opus 5.5; builds: `flo-builder` with a per-task `claude-opus-5.5` override | high           |
| 3        | Research and evidence cross-checks                                                                                                                                                                                 | Re-verifying facts at gates; gathering sources for content                                                                                             | `flo-researcher` → GPT-6.1 Sol (GPT-6 Luna only as a per-task override recorded at dispatch)                    | high           |
| 4        | Bounded implementation **with** an approved design and clear acceptance tests                                                                                                                                      | Sensitive changes in the rule-1 list above; other bounded implementation with builder gates and one batched rule-5 review per wave                     | `flo-builder` -> GPT-6 Luna; rule-1 verify only for the listed high-risk areas                                  | high           |
| 5        | Routine and lighter-reviewed work                                                                                                                                                                                  | Relay glue, CSP/header tweaks, settings, UI, docs, preview deploys, tests and integration                                                              | `flo-builder` -> GPT-6 Luna; one batched rule-5 review per wave: `flo-verifier` with `gpt-6-luna`               | high           |

**Dispatch rules:**

- When conditions overlap, use the more specific, higher-priority profile. **Unknown risk is not low risk.**
- High is the minimum effort everywhere. It is set in each worker agent's frontmatter and passed explicitly at dispatch.
- Luna and Sol run on the default (smaller) context tier, never the 1M tier (captain, 2026-10-28).
- The orchestrator records the agent, model, effort and round in the backlog item's notes at dispatch. That record replaces Pi's `PI_PROVIDER`/`PI_MODEL`/`PI_REASONING_LEVEL` startup check, and workers do not print or block on those variables.

**Credit validation.** At each gate, the orchestrator records the measured Copilot usage, latency and failure rate for each model, from task records and the provider dashboard if the captain shares it. The Luna/Opus split stays a _policy to validate_.

## 3. The loop for every task

1. **Brief.** The orchestrator writes `~/firstmate/data/<task-id>/brief.md` from the [`task-brief`](../../.agents/skills/task-brief/SKILL.md) templates and [task-briefs.md](task-briefs.md). The brief points to files by path instead of pasting them.
2. **Implement with tests.** A `flo-builder` subagent works in its own worktree ([`flo-worktree`](../../.agents/skills/flo-worktree/SKILL.md)).
3. **Gates.** Builders run targeted tests while working, then run `npm run check` once at the end and the `flo-commit` scope check. E2E subsets run only when named in the brief; full e2e, TZ matrix and coverage run at phase integration and the phase gate.
4. **Independent verification.** The six areas in rule 1 get a dedicated Opus `<task>-verify`. Other work uses builder gates plus one batched rule-5 Luna review per wave. A review FAILs only for correctness, security, data-loss or spec defects; low-severity items and nits go on a follow-up list and never fail the gate.
5. **Fix.** At most 3 rounds in total (Section 4). Each round amends the task's one commit. After a FAIL, re-review only finding closure and adjacent regression; low-severity closure may use `flo-verifier` with `gpt-6-luna`.
6. **Done or blocked.** Done needs the evidence. Blocked needs the evidence plus a proposed alternative.
7. **Land.** When the builder's branch is clean and one commit ahead, its required review reports PASS for that exact commit, and the merge authority allows it, the orchestrator runs [`land.sh`](../../.agents/skills/flo-land/scripts/land.sh). That is a guarded fast-forward of `main` to the exact reviewed SHA, then a push of `main` only after the remote URL and live remote head are checked ([`flo-land`](../../.agents/skills/flo-land/SKILL.md)).
   - **Standing approvals:** security-sensitive work lands automatically when its required review passes for the exact SHA. Synthetic-only previews/redeploys from reviewed landed `main` run without per-deploy approval. Production, real data, accounts/credentials, money and phase gates remain captain decisions. Destructive or irreversible changes and installs not already approved retain explicit approval.
   - **Dependents consume landed predecessors.** A task is dispatched only after every task it depends on has landed, and its branch starts from that `main`. After a rebase, re-run the task's tests and compare stable patch-id. If the patch is identical and tests pass, re-point the review record to the rebased SHA and land without a new review, even if `main` touched the same files. A changed patch needs review. `land.sh --rebased-from` still refuses overlapping changes; that script change is proposed, not made here.
   - Subagents only commit to their own task branches. None of them merges or pushes.

**Verifiers never review their own work.** The verifier receives the specification sections, the acceptance criteria, the **exact candidate revision (commit SHA)**, and the test vectors and source evidence. It does not receive only the implementer's summary.

**Algorithm auditors** write down their expected results for every vector _from the spec and citations first_. Only after recording those do they read the implementation.

**Verifiers report evidence, not opinions:** commands run, outputs, and failing cases with inputs.

**After a FAIL**, the correction review checks only that findings are closed and nothing adjacent regressed. A source change normally needs review on its new SHA; a patch-identical rebase whose tests pass is the exception: update the review reference to the rebased SHA without a new review, even when touched files overlap on `main`.

## 4. Escalation, fix rounds and blockers

**What counts as a fix round.** One attempted correction, followed by the relevant tests and a review of any outstanding findings.

**What the orchestrator records for each round,** in the backlog notes and in `~/firstmate/data/<task-id>/correction-note.md`:

- the round number;
- model and actual effort;
- the candidate revision;
- the failed checks or independent findings;
- the attempted fix;
- the retest evidence.

**Escalation and limits:**

- After **2 documented failed rounds**, the next attempt goes to Claude Opus 5.5 (rule 2).
- After **3 total rounds**, stop that approach. Mark the task `blocked` with evidence and propose a different approach or a plan revision. A revised approach needs a new explicit brief and a recorded rationale.
- **Changing the model never resets the 3-round limit.**

**Blockers are not failed rounds.** Missing credentials, infrastructure failures, unresolved requirements, and a subagent cancelled by a captain message are blockers. Workers report them with `blocked:` and never administer shared infrastructure. A cancelled worker's slot and drafts are preserved, and the task continues with a continuation note.

**Decisions** go to the captain only at the plan's Section 3 checkpoints, for landing approvals not covered by standing authority (Section 3 step 7), phase gates, production deploys, real data, accounts/credentials, money, installs not already approved, and destructive or irreversible actions. Security-sensitive work and synthetic-only previews/redeploys follow the standing approvals above. Everything else is decided by the orchestrator and logged in an ADR or the progress log. Account, credential, install, production-deploy and money requests stay collected in `p0-approvals`.

## 5. Risk-based verification depth

| Risk               | Areas                                                                                                                                              | Verification                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **High**           | Prediction/medical engine algorithms; crypto and keys; pairing and sync merge; consent enforcement; migrations and backup/restore; medical content | A dedicated `<task>-verify` by `flo-verifier` on Opus, using only applicable verifier types. It is required for the task landing and dependent gates. Passing tests, a first-try success or an Opus implementer never waive it |
| **Lighter review** | Relay glue, CSP/header tweaks, settings, UI, docs, preview deploys and other work outside the high-risk list                                       | Builder gates plus one batched rule-5 Luna review per wave. A PASS/FAIL uses the severity bar above; low-severity notes are follow-ups and do not fail a gate                                                                  |

Verifier type by area:

| Area                               | Verifier type(s)                           |
| ---------------------------------- | ------------------------------------------ |
| Engine algorithms                  | Algorithm auditor, spec verifier           |
| Crypto, pairing, sync, relay       | Privacy/security reviewer, code reviewer   |
| Consent and sharing UI             | Privacy/consent reviewer, UX/a11y verifier |
| Data layer, migrations, backup, SW | Code reviewer, spec verifier               |
| Content cards and warnings         | Medical-content fact-checker               |

## 6. Verifier safeguards

**No verifier sandbox exists, and none is claimed.** The Stage E plan proposed proving a Pi bash sandbox (bubblewrap) on a disposable fixture (`p0-verifier-sandbox-proof`, FB-08). That proof ran in Phase 0 and could not enforce read-only review: 48 checks passed, 24 failed or were unenforced, and 1 was untested. The captain then declined the extra Firstmate isolation feature and approved ordinary independent review (2026-10-28). Both proof tasks are `superseded`. The evidence branch `fm/p0-verifier-sandbox-proof` is preserved and not landed.

What applies now:

- A verifier is a separate Copilot subagent with its own context, a verify brief and a detached laboratory worktree at the exact candidate SHA. This is process separation, **not** a security boundary. It runs as the same OS user with the same file access as every worker.
- Every verify report says **"isolation not enforced"**. Residual risk: a verifier could alter its own laboratory or read host files. This does not change what lands, because the orchestrator lands only the builder's branch, and `land.sh` refuses unless the branch tip equals the reviewed SHA.
- Verifiers write only their report, status file and scratch folder. Their laboratory must end clean at the candidate (`git status`, `git rev-parse HEAD` before and after).
- The orchestrator never runs a candidate's project code on a verifier's behalf.

## 7. Task briefs (self-contained)

Every brief (templates in [`.agents/skills/task-brief/assets/`](../../.agents/skills/task-brief/assets/), task content in [task-briefs.md](task-briefs.md)) contains:

- **Captain's intent:** the captain's own words and the context to read them;
- **Firstmate spec:** goal, **owned files** and **files it must not touch**, interfaces and contracts (paths), acceptance criteria as Given/When/Then, test commands, reference vectors and source evidence (paths), constitution rules, risk level, matched rule, agent, model and effort, prior fix-round count and escalation evidence;
- **Setup:** the exact worktree slot and base SHA, and the WSL execution notes;
- **Rules:** isolation, scope, credential and privacy boundaries, and the status protocol;
- **for verifiers:** the exact candidate revision, review scope, builder evidence to reuse for that SHA, targeted probes, report location and source-write restrictions (Section 6); re-reviews after FAIL are closure-only;
- **Definition of done:** the expected report format (revision or files changed, evidence, open issues) in about 15 lines or fewer, and the final status line.

## 8. Parallelism and waves

- **At most 10 live subagents at once**, counting builders, verifiers, scouts and integrators together (raised from 3 to 6, then to 10, by the captain on 2026-10-28). **One orchestrator chat at a time.**
- **Foundation tasks** (contracts, schema, design tokens, interfaces) run **one at a time**.
- **Wave rule:** tasks in the same wave never own the same file. This is checked mechanically ([consistency-check.md](consistency-check.md)). A planner proposal for new items must keep it.
- **Integration cadence (the approved deviation in AP-17).** Integration is continuous at every landing, with **one integration ship task per phase**:
  - builders run targeted tests while working and `npm run check` once at the end; after a rebase they re-run the task's tests. Full e2e, the TZ matrix and coverage run at phase integration and the phase gate, not on every task (except e2e subsets named in a brief);
  - what remains is wiring screens into `src/app/**` and the cross-screen e2e journeys, which only make sense once a phase's screens exist;
  - the lighter rule-5 review runs once per wave.
  - The per-phase `pN-integration` task owns `src/app/**` and `tests/e2e/<phase>-*.spec.ts`.
- **Verification is its own backlog item** (`<task>-verify`). A verifier owns no repository files.

## 9. Backlog and tracking

- **Source of truth:** [backlog.md](backlog.md), edited through [`backlog.py`](../../.agents/skills/flo-backlog/scripts/backlog.py) ([`flo-backlog`](../../.agents/skills/flo-backlog/SKILL.md)). There is one item per implementation task, verify task and gate, with:
  - status, dependencies (`blocked-by`), phase, wave, type (feature / verify / gate / chore) and risk;
  - owned paths, route, branch, candidate SHA, landed SHA and report path;
  - feature IDs.

  It was migrated on 2026-10-28 from [backlog-import.md](backlog-import.md) and Firstmate's `tasks-axi` backlog, which is now frozen for Flo.

- **Delivery:** task branches are local. Landed `main` is uploaded to the captain's GitHub repository (`Period-Tracker-App`, branch `main`) after each landing, and only `main` (captain, 2026-10-05).

## 10. State and traceability

- Each phase ends with `gate-phase-N`, a **captain hold**. Every task in the next phase depends on it. The orchestrator sets the hold **when the gate becomes actionable** (its `pN-phase-verify` is done), not before. The captain approves by replying "continue", and the orchestrator records the approval in the gate's notes.
- One git commit per task, using Conventional Commits with no co-author trailer.
- ADRs in `docs/adr/`.
- Progress log in `docs/progress.md`: one line per task or gate, with the date, ID, landed revision and verify report path.
- **Record writers.** Builders _propose_ ADR text and progress lines in their reports, which keeps waves free of file conflicts. The phase integration task writes ADRs and phase-level progress. The orchestrator commits backlog changes and per-landing progress lines directly on `main` as `chore(backlog): …` (captain decision, 2026-10-28). These commits touch only `docs/plan/backlog.md` and `docs/progress.md`.
- Private records: briefs, correction and continuation notes, and reports in `~/firstmate/data/<task-id>/`; status events in `~/firstmate/state/<task-id>.status`; standing instructions in `~/firstmate/data/captain.md`; operational learnings in `~/firstmate/data/learnings.md`.
- Deploy records live in `docs/deploy/` (one file per deploy item): URL, landed revision, build hash and check results, never secrets or account identifiers.

## 11. Phase demo package

At every phase gate the captain gets:

1. what's new;
2. how to try it: the preview URL with synthetic data from `pN-demo-deploy` (recorded in `docs/deploy/pN-demo.md`), plus the [smoke checklist](test-strategy.md#7-real-iphone-smoke-checklist-both-phones-at-every-phase-demo-synthetic-data-only);
3. screenshots at iPhone sizes;
4. the test and verification report, with links to each verify report;
5. known issues and decisions made, as ADR and progress-log links;
6. what's next.

Then the orchestrator stops and waits for "continue".

## 12. Setup of this model

| Firstmate/Pi mechanism                                  | Replacement (2026-10-28)                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| First mate session, `bin/fm-spawn.sh`, Herdr panes      | `flo-orchestrator` chat; task-tool subagents in background mode ([`flo-dispatch`](../../.agents/skills/flo-dispatch/SKILL.md)) |
| `crew-dispatch.json` harness `pi`, `PI_*` startup check | Agent frontmatter models plus the documented overrides; dispatch record in backlog notes                                       |
| `bin/fm-brief.sh` scaffold                              | [`task-brief`](../../.agents/skills/task-brief/SKILL.md) templates                                                             |
| Treehouse leases inside `fm-spawn`                      | [`flo-worktree.sh`](../../.agents/skills/flo-worktree/scripts/flo-worktree.sh) with `git worktree lock`                        |
| `tasks-axi` / `data/backlog.md`                         | [backlog.md](backlog.md) and [`backlog.py`](../../.agents/skills/flo-backlog/scripts/backlog.py)                               |
| `bin/fm-merge-local.sh`                                 | [`land.sh`](../../.agents/skills/flo-land/scripts/land.sh)                                                                     |
| Steering inbox and `fm-send`                            | A follow-up message to an idle subagent, or a correction/continuation note plus a resumed builder                              |
| Pi verifier sandbox proposal                            | None; ordinary review, "isolation not enforced" (§6)                                                                           |

User-level copies of the agents (for chats without a Flo workspace) are installed with [`tools/agent-ops/install-user-agents.sh`](../../tools/agent-ops/install-user-agents.sh).
