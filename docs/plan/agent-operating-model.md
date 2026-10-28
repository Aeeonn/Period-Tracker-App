# Agent operating model (Step 9)

**Status:** Revised 2026-10-28 for VS Code Copilot orchestration ([ADR-0011](../adr/0011-vscode-copilot-orchestration.md)). The Stage E policy approved with the plan is unchanged: roles, routing rules, risk-based verification, fix-round limits, landing discipline, waves and gates. Only the mechanism moved from Firstmate + Pi + Herdr + `tasks-axi` to Copilot custom agents, repository skills and a repository backlog. Pi can no longer sign in (Microsoft Entra Conditional Access). The Pi-era text is in git history and [ADR-0009](../adr/0009-agent-operating-model-on-firstmate.md).

**One orchestrator, no new services.** The orchestrator is a VS Code Copilot chat running the `flo-orchestrator` agent. Workers are Copilot subagents. The backlog is [backlog.md](backlog.md). Tooling is a few bash and python scripts inside skills. Nothing runs between turns.

## 1. Roles

| Role | Mechanism | Notes |
|---|---|---|
| **Orchestrator (first mate)** | [`flo-orchestrator`](../../.github/agents/flo-orchestrator.agent.md), the captain's chat, following the [`flo-dispatch`](../../.agents/skills/flo-dispatch/SKILL.md) skill | Owns the backlog and dependency graph. Writes briefs, dispatches subagents, enforces gates and brings decisions to the captain. Writes no project source and never runs project code or tests (that is the workers' job). Its only repository writes are backlog and progress-log `chore(backlog)` commits on `main` (§10) and guarded landings (§3 step 7) |
| **Implementer** | [`flo-builder`](../../.github/agents/flo-builder.agent.md), one per ship task, in its own worktree on `fm/<task-id>` | Runs the build, lint and tests itself before reporting. There is no separate test-runner agent. One Conventional Commit per task ([`flo-commit`](../../.agents/skills/flo-commit/SKILL.md)) |
| **Independent verifier** | [`flo-verifier`](../../.github/agents/flo-verifier.agent.md), a separate subagent reviewing the **exact candidate revision** in its own detached laboratory | Never edits reviewed source, commits, merges or ships. Reports go to `~/firstmate/data/<task-id>/report.md`, outside the reviewed source. Types: code reviewer, spec/acceptance verifier, algorithm auditor, UX/accessibility verifier, privacy/consent/security reviewer, medical-content fact-checker ([`verification-protocol`](../../.agents/skills/verification-protocol/SKILL.md)) |
| **Researcher** | [`flo-researcher`](../../.github/agents/flo-researcher.agent.md) (scout) | Sources and evidence cross-checks; content-source retrieval |
| **Critic** | [`flo-critic`](../../.github/agents/flo-critic.agent.md) (scout) | Independent critique of plans, plan revisions, ADRs, briefs and process changes before they are built on |
| **Planner** | [`flo-planner`](../../.github/agents/flo-planner.agent.md) (scout) | Turns decisions, findings and new phases into backlog item proposals and draft briefs. The orchestrator records them |
| **Integrator** | `flo-builder` on the ship task `pN-integration` | Wires screens into `src/app/**`, runs the full e2e suite and fixes only integration glue. Never merges branches |
| **Deployer** | `flo-builder` on the `*-deploy` and `p0-relay-spike` ship tasks | Deploys **synthetic-only previews** with the credential approved in AP-10/AP-18, runs the deployed-origin checks and commits a deploy record under `docs/deploy/`. If AP-18 chose captain-run deploys, the deployer prepares the exact command and the captain runs it |

## 2. Model and credit policy

`~/firstmate/config/crew-dispatch.json` remains the routing source of truth (its `harness: pi` field no longer applies). The orchestrator maps its five rules to agents **in this priority order**. Agent frontmatter carries the default model and `reasoning-effort: high`:

| Priority | Rule | Applies to (this project) | Agent → model | Minimum effort |
|---|---|---|---|---|
| 1 | High-risk independent verification | Algorithm audits; privacy/consent/security reviews; medical-content fact-checks; reviews of crypto, sync, data layer, migrations, backup, recovery, SW update safety and CSP/network code | `flo-verifier` → Claude Opus 5.5 | high |
| 2 | Plan synthesis/critique, architecture, extensive or ambiguous multi-file work, high-risk work without an approved design and clear tests, and any implementation after **2 documented failed fix-and-test rounds** | Plan critique, contract and foundation changes, `p0-relay-spike`, `p2-sync-core`, `p2-pairing`, any escalated task | `flo-planner`, `flo-critic` → Claude Opus 5.5; builds: `flo-builder` with a per-task `claude-opus-5.5` override | high |
| 3 | Research and evidence cross-checks | Re-verifying facts at gates; gathering sources for content | `flo-researcher` → GPT-6.1 Sol (GPT-6 Luna only as a per-task override recorded at dispatch) | high |
| 4 | Bounded high-risk implementation **with** an approved design and clear acceptance tests | Most engine, crypto, data, share, sync, backup and content tasks in P0–P2 | `flo-builder` → GPT-6 Luna, **plus a required rule-1 verify before merge** | high |
| 5 | Bounded routine work: UI, tests, docs, integration, low-risk reviews | UI screens, toolchain, docs, integration, wave UI reviews | `flo-builder` → GPT-6 Luna; low-risk reviews: `flo-verifier` with a per-task `gpt-6-luna` override | high |

**Dispatch rules:**
- When conditions overlap, use the more specific, higher-priority profile. **Unknown risk is not low risk.**
- High is the minimum effort everywhere. It is set in each worker agent's frontmatter and passed explicitly at dispatch.
- Luna and Sol run on the default (smaller) context tier, never the 1M tier (captain, 2026-10-28).
- The orchestrator records the agent, model, effort and round in the backlog item's notes at dispatch. That record replaces Pi's `PI_PROVIDER`/`PI_MODEL`/`PI_REASONING_LEVEL` startup check, and workers do not print or block on those variables.

**Credit validation.** At each gate, the orchestrator records the measured Copilot usage, latency and failure rate for each model, from task records and the provider dashboard if the captain shares it. The Luna/Opus split stays a *policy to validate*.

## 3. The loop for every task

1. **Brief.** The orchestrator writes `~/firstmate/data/<task-id>/brief.md` from the [`task-brief`](../../.agents/skills/task-brief/SKILL.md) templates and [task-briefs.md](task-briefs.md). The brief points to files by path instead of pasting them.
2. **Implement with tests.** A `flo-builder` subagent works in its own worktree ([`flo-worktree`](../../.agents/skills/flo-worktree/SKILL.md)).
3. **Gates.** The builder runs the brief's commands and `npm run check`, and the `flo-commit` scope check.
4. **Independent verification.**
   - High risk: a rule-1 `flo-verifier` reviews the exact revision.
   - Low-risk UI: one rule-5 review per phase (`pN-lowrisk-review`), or the narrow review a brief names.
5. **Fix.** At most 3 rounds in total (§4). Each round amends the task's one commit and renews the review of the changed scope.
6. **Done or blocked.** Done needs the evidence. Blocked needs the evidence plus a proposed alternative.
7. **Land.** When the builder's branch is clean and one commit ahead, its required review reports PASS for that exact commit, and the merge authority allows it, the orchestrator runs [`land.sh`](../../.agents/skills/flo-land/scripts/land.sh). That is a guarded fast-forward of `main` to the exact reviewed SHA, then a push of `main` only after the remote URL and live remote head are checked ([`flo-land`](../../.agents/skills/flo-land/SKILL.md)).
   - **Merge authority** (recorded in `~/firstmate/data/captain.md`): routine passing changes land and upload automatically (captain, 2026-10-05). Security-sensitive, destructive and irreversible landings, deployments and phase gates need the captain's explicit approval for that change. Most P0–P2 landings are security-sensitive.
   - **Dependents consume landed predecessors.** A task is dispatched only after every task it depends on has landed, and its branch starts from that `main`. Before landing, a builder rebases onto the current `main` if asked and re-runs `npm run check`. The review is renewed if the rebased patch differs from the reviewed patch **or** `main` changed any file the reviewed patch touches. `land.sh --rebased-from` checks both (patch-id equality and no overlapping changes), and the comparison is recorded in the backlog notes.
   - Subagents only commit to their own task branches. None of them merges or pushes.

**Verifiers never review their own work.** The verifier receives the specification sections, the acceptance criteria, the **exact candidate revision (commit SHA)**, and the test vectors and source evidence. It does not receive only the implementer's summary.

**Algorithm auditors** write down their expected results for every vector *from the spec and citations first*. Only after recording those do they read the implementation.

**Verifiers report evidence, not opinions:** commands run, outputs, and failing cases with inputs.

**If reviewed source changes after a verification**, the affected gates are re-run and a renewed review of the changed scope is required against the new revision.

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

**Decisions** go to the captain only at the plan's Section 3 checkpoints, for landing approvals that the merge authority does not cover (§3 step 7), phase gates, the production deploy (AP-29), money and destructive actions. Everything else is decided by the orchestrator and logged in an ADR or the progress log. Account, credential, install and deploy requests stay collected in `p0-approvals`.

## 5. Risk-based verification depth

| Risk | Areas | Verification |
|---|---|---|
| **High** | Prediction and medical algorithms, encryption, key exchange, sync, permissions and consent, data layer, migrations, backup and recovery, service-worker update safety, CSP/network, medical content, relay deployments with secrets | A dedicated `<task>-verify` by `flo-verifier` on Opus (high or above), using only the verifier types that apply (usually 1–2). It is a **required dependency** of every dependent task, of the gate, and of the task's own landing. Passing tests, a first-try success or an Opus implementer **never** waive it |
| **Medium/Low** | UI screens, settings, toolchain glue, docs, preview deploys | Automated gates plus **one** rule-5 review per phase (`pN-lowrisk-review`) covering the low-risk tasks. Preview deploy records are re-checked by the Opus `pN-phase-verify`. Low-risk tasks land after their own gates pass; review findings become fix tasks before the phase gate |

Verifier type by area:

| Area | Verifier type(s) |
|---|---|
| Engine algorithms | Algorithm auditor, spec verifier |
| Crypto, pairing, sync, relay | Privacy/security reviewer, code reviewer |
| Consent and sharing UI | Privacy/consent reviewer, UX/a11y verifier |
| Data layer, migrations, backup, SW | Code reviewer, spec verifier |
| Content cards and warnings | Medical-content fact-checker |

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
- **for verifiers:** the exact candidate revision, the report location, the source-write restrictions (§6), and the statement that this review is a mandatory independent gate;
- **Definition of done:** the expected report format (revision or files changed, evidence, open issues) in about 15 lines or fewer, and the final status line.

## 8. Parallelism and waves

- **At most 10 live subagents at once**, counting builders, verifiers, scouts and integrators together (raised from 3 to 6, then to 10, by the captain on 2026-10-28). **One orchestrator chat at a time.**
- **Foundation tasks** (contracts, schema, design tokens, interfaces) run **one at a time**.
- **Wave rule:** tasks in the same wave never own the same file. This is checked mechanically ([consistency-check.md](consistency-check.md)). A planner proposal for new items must keep it.
- **Integration cadence (the approved deviation in AP-17).** Integration is continuous at every landing, with **one integration ship task per phase**:
  - every task branch starts from the current `main`, re-runs `npm run check` and its brief's tests, and lands only after its review passes, so `main` after each wave's last landing has already passed the unit, golden, property and static suites;
  - what remains is wiring screens into `src/app/**` and the cross-screen e2e journeys, which only make sense once a phase's screens exist;
  - the low-risk review likewise runs once per phase (`pN-lowrisk-review`).

  The per-phase `pN-integration` task owns `src/app/**` and `tests/e2e/<phase>-*.spec.ts`.
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
- **Record writers.** Builders *propose* ADR text and progress lines in their reports, which keeps waves free of file conflicts. The phase integration task writes ADRs and phase-level progress. The orchestrator commits backlog changes and per-landing progress lines directly on `main` as `chore(backlog): …` (captain decision, 2026-10-28). These commits touch only `docs/plan/backlog.md` and `docs/progress.md`.
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

| Firstmate/Pi mechanism | Replacement (2026-10-28) |
|---|---|
| First mate session, `bin/fm-spawn.sh`, Herdr panes | `flo-orchestrator` chat; task-tool subagents in background mode ([`flo-dispatch`](../../.agents/skills/flo-dispatch/SKILL.md)) |
| `crew-dispatch.json` harness `pi`, `PI_*` startup check | Agent frontmatter models plus the documented overrides; dispatch record in backlog notes |
| `bin/fm-brief.sh` scaffold | [`task-brief`](../../.agents/skills/task-brief/SKILL.md) templates |
| Treehouse leases inside `fm-spawn` | [`flo-worktree.sh`](../../.agents/skills/flo-worktree/scripts/flo-worktree.sh) with `git worktree lock` |
| `tasks-axi` / `data/backlog.md` | [backlog.md](backlog.md) and [`backlog.py`](../../.agents/skills/flo-backlog/scripts/backlog.py) |
| `bin/fm-merge-local.sh` | [`land.sh`](../../.agents/skills/flo-land/scripts/land.sh) |
| Steering inbox and `fm-send` | A follow-up message to an idle subagent, or a correction/continuation note plus a resumed builder |
| Pi verifier sandbox proposal | None; ordinary review, "isolation not enforced" (§6) |

User-level copies of the agents (for chats without a Flo workspace) are installed with [`tools/agent-ops/install-user-agents.sh`](../../tools/agent-ops/install-user-agents.sh).
