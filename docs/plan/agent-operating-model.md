# Agent operating model on Firstmate (Step 9)

**Status:** Stage E revision, 2026-10-02 (Stage C draft corrected after the Stage D critique; see [stage-e-resolution.md](stage-e-resolution.md)). This document describes how execution will run **after** Stage F approval. Nothing in it has been set up yet. Phase 0 tasks set it up and prove it ([roadmap.md](roadmap.md#p0--foundation)). Decision recorded in [ADR-0009](../adr/0009-agent-operating-model-on-firstmate.md).

**No second orchestrator.** Firstmate already provides the orchestration loop, worktree isolation, supervision, the backlog (`tasks-axi`, markdown backend `data/backlog.md`) and dispatch. This model adds only *policy* on top: routing, risk, verification and gates. It adds no new tool, daemon, task database or project-local dispatch file.

## 1. Roles mapped to Firstmate

| Role | Firstmate mechanism | Notes |
|---|---|---|
| **Orchestrator** | The first mate (MAIN) | Owns the backlog and dependency graph. Writes briefs with `bin/fm-brief.sh`, dispatches with `bin/fm-spawn.sh`, enforces gates and brings decisions to the captain. **Read-only over project files.** It never runs project code or tests. It lands verified task branches only through Firstmate's guarded fast-forward path (§3 step 7), which moves `main` to an already-verified commit and authors no file content. Integration is a ship task (cadence in §8) |
| **Implementer** | One `ship` task per backlog item, one crewmate, its own disposable worktree | Runs the build, lint and tests itself before reporting. There is no separate test-runner agent. One Conventional Commit per task |
| **Independent verifier** | A `scout` task in a separate session reviewing the **exact candidate revision** in its own workspace | Never edits reviewed source, commits, merges or ships. Reports and artefacts go outside the reviewed source (e.g. `~/firstmate/data/<task-id>/report.md`). Types: code reviewer, spec/acceptance verifier, algorithm auditor, UX/accessibility verifier, privacy/consent/security reviewer, medical-content fact-checker |
| **Plan critic / researcher** | `scout` tasks | Stage D critique; later, content-source retrieval |
| **Integrator** | `ship` task `pN-integration` | Wires screens into `src/app/**`, runs the full e2e suite, and fixes only integration glue. It is a crewmate like any implementer; it never merges branches |
| **Deployer** | `ship` tasks `*-deploy` and `p0-relay-spike` | Deploy **synthetic-only previews** with the credential approved in AP-10/AP-18, run the deployed-origin checks and commit a deploy record under `docs/deploy/`. If AP-18 chose captain-run deploys, they prepare the exact command and the captain runs it |

## 2. Model and credit policy

`~/firstmate/config/crew-dispatch.json` is the **only** routing source of truth. This plan was checked against its five rules on 2026-10-02. The JSON states the rules in prose; it does not count retries, restrict tools or gate merges. The first mate applies the rules at dispatch, **in this priority order**:

| Priority | Rule (crew-dispatch.json) | Applies to (this project) | Model (provider-qualified) | Minimum effort |
|---|---|---|---|---|
| 1 | High-risk independent verification | Algorithm audits; privacy/consent/security reviews; medical-content fact-checks; reviews of crypto, sync, data layer, migrations, backup and recovery code | `github-copilot/claude-opus-5.5` | high |
| 2 | Plan synthesis/critique, architectural decisions, extensive or ambiguous multi-file work, high-risk work without an approved design and clear tests, and any implementation after **2 documented failed fix-and-test rounds** | Stage D critique; `p0-contracts`, `p0-verifier-sandbox-proof`, `p0-relay-spike`, `p2-sync-core`, `p2-pairing`; any escalated task | `github-copilot/claude-opus-5.5` | high |
| 3 | Research and evidence cross-checks | Re-verifying facts at gates; gathering sources for content | `github-copilot/gpt-6.1-sol` (documented per-task override `github-copilot/gpt-6-luna`) | high |
| 4 | Bounded high-risk implementation **with** an approved design and clear acceptance tests | Most engine, crypto, data, share, sync, backup and content tasks in P0–P2 | `github-copilot/gpt-6-luna`, **plus a required Opus verify task before merge** | high |
| 5 | Bounded routine work: UI, tests, docs, integration, low-risk reviews | UI screens, toolchain, docs, integration, wave UI reviews | `github-copilot/gpt-6-luna` | high |

**Dispatch rules:**
- When conditions overlap, use the more specific, higher-priority profile.
- **Unknown risk is not low risk.**
- High is the minimum effort everywhere. Use a higher effort only when it is supported and the task warrants it, and record the choice. Request `max` only when a task explicitly says so.

**Checks at worker startup.** Each brief requires the worker to print `PI_PROVIDER`, `PI_MODEL` and `PI_REASONING_LEVEL`. A mismatch is reported (`blocked`), never silently replaced. Pi clamps thinking to what the model supports, so the actual value must be read back, not assumed.

**Before each phase**, the first mate runs `pi --list-models` and confirms all three IDs are present. In Stage C this check found `claude-opus-5.5`, `gpt-6-luna` and `gpt-6.1-sol` under `github-copilot`. Availability does not prove price or quality.

**Credit validation.** At each gate, the first mate records the measured Copilot usage, latency and failure rate for each model, taken from task records and the provider dashboard if the captain shares it. The Luna/Opus split stays a *policy to validate* (cross-check: "the catalog proves availability, not relative price or quality").

## 3. The loop for every task

1. **Brief.** The first mate builds it with `bin/fm-brief.sh` from [task-briefs.md](task-briefs.md). The brief points to files by path instead of pasting them.
2. **Implement with tests.** The ship crewmate works in its own worktree.
3. **Gates.** The implementer runs the brief's commands and `npm run check`.
4. **Independent verification.**
   - High risk: an Opus verify scout reviews the exact revision.
   - Low-risk UI: one Luna review scout per wave.
5. **Fix.** At most 3 rounds in total (see escalation below).
6. **Done or blocked.** Done needs the evidence; blocked needs the evidence plus a proposed alternative.
7. **Land.** When the implementer's branch is clean and ready, its required verify reports PASS for that exact commit, and the configured merge authority has approved, the first mate lands it on local `main` with `bin/fm-merge-local.sh` (Firstmate's guarded fast-forward path for `local-only` projects). The project is registered `local-only`; there is no remote, PR or pipeline (AP-17 records this as settled).
   - **Merge authority** follows the project's `yolo` setting. It is currently **off**, so the captain approves every landing. The first mate batches the ready branches of a wave into one request, but each landing still needs the captain's explicit yes. With `yolo` on, the first mate may land green, verified, in-scope work itself; destructive, irreversible and security-sensitive landings still escalate to the captain, and in this project most P0–P2 landings are security-sensitive. Changing the setting is a captain choice inside `flo-plan-approval` (AP-17); approving the plan does not change it.
   - **Dependents consume landed predecessors.** A task is dispatched only after every task it depends on has landed, and its branch starts from that `main`. Before landing, an implementer rebases onto the current `main` and re-runs `npm run check`; if `main` moved in a way that touches reviewed files, the verify is renewed for the new commit.
   - Crewmates (including integration and deploy tasks) only commit to their own task branches. None of them merges.

**Verifiers never review their own work.** The verifier receives:
- the specification sections;
- the acceptance criteria;
- the **exact candidate revision (commit SHA)**;
- the test vectors and source evidence;

not just the implementer's summary.

**Algorithm auditors** write down their expected results for every vector *from the spec and citations first*. Only after recording those do they read the implementation.

**Verifiers report evidence, not opinions:** commands run, outputs, and failing cases with inputs.

**If reviewed source changes after a verification**, the affected gates are re-run and a renewed review of the changed scope is required against the new revision.

## 4. Escalation, fix rounds and blockers

**What counts as a fix round.** One attempted correction, followed by the relevant tests and a review of any outstanding findings.

**What the first mate records for each round,** in backlog notes and in the next brief:
- the round number;
- model and actual effort;
- the candidate revision;
- the failed checks or independent findings;
- the attempted fix;
- the retest evidence.

**Escalation and limits:**
- After **2 documented failed rounds**, the next attempt goes to `github-copilot/claude-opus-5.5` (rule 2).
- After **3 total rounds**, stop that approach. Mark the task `blocked` with evidence and propose a different approach or a plan revision. A revised approach needs a new explicit brief and a recorded rationale.
- **Changing the model never resets the 3-round limit.**

**Blockers are not failed rounds.** Missing credentials, infrastructure failures (including the shared `no-mistakes` daemon or the worktree pool) and unresolved requirements are blockers. Workers report them with `blocked:` and never administer shared infrastructure.

**Decisions** go to the captain only at the Section 3 checkpoints. Everything else is decided by the first mate and logged in an ADR or the progress log. Account, credential, install and deploy requests are collected in `p0-approvals`, so later phases need the captain only for the remaining checkpoints: landing approvals while `yolo` is off (§3 step 7), phase gates, the production deploy (AP-29), money, and destructive actions. Approving the plan grants none of the `p0-approvals` items by default.

## 5. Risk-based verification depth

| Risk | Areas | Verification |
|---|---|---|
| **High** | Prediction and medical algorithms, encryption, key exchange, sync, permissions and consent, data layer, migrations, backup and recovery, service-worker update safety, CSP/network, medical content, relay deployments with secrets | A dedicated `<task>-verify` scout on Opus (high or above), using only the verifier types that apply (usually 1–2). Filed as a **required dependency** of every dependent task and the gate, and of the task's own landing. Passing tests, a first-try success or an Opus implementer **never** waive it |
| **Medium/Low** | UI screens, settings, toolchain glue, docs, preview deploys | Automated gates plus **one** Luna (high) review scout per phase (`pN-lowrisk-review`) covering the low-risk tasks; preview deploy records are re-checked by the Opus `pN-phase-verify`. Low-risk tasks land after their own gates pass; review findings become fix tasks before the phase gate |

Verifier type by area:

| Area | Verifier type(s) |
|---|---|
| Engine algorithms | Algorithm auditor, spec verifier |
| Crypto, pairing, sync, relay | Privacy/security reviewer, code reviewer |
| Consent and sharing UI | Privacy/consent reviewer, UX/a11y verifier |
| Data layer, migrations, backup, SW | Code reviewer, spec verifier |
| Content cards and warnings | Medical-content fact-checker |

## 6. Verifier safeguards (Phase 0 proof required)

**Why this is needed.** A scout label or a separate worktree is **not** a read-only boundary. Pi has no built-in sandbox or per-call approval. Disabling `edit` and `write` is not enough while `bash`, extensions or other executable tools can still write files.

### 6.1 Facts observed during Stage C (read-only inspection, 2026-10-02)

| Observation | Evidence |
|---|---|
| Pi can restrict tools: `--tools <allowlist>`, `--no-tools`, `--exclude-tools`, `--no-extensions`, `-e <extension>` | `pi --help` output |
| Pi's bundle defines built-in `grep`/`find`/`ls` tools besides `read`/`bash`/`edit`/`write`; `grep` calls `ensureTool("rg")`, which may download ripgrep | `pi-coding-agent/dist` bundle inspection |
| Pi ships an example sandbox extension that wraps `bash` with `@anthropic-ai/sandbox-runtime`, which uses **bubblewrap** on Linux and has filesystem allow/deny lists and network domain lists | `…/pi-coding-agent/examples/extensions/sandbox/index.ts` header |
| `bwrap` is **not installed** on this host | `which bwrap` → no output |
| Firstmate's Pi adapter (`bin/fm-spawn.sh`) launches Pi with model and effort flags plus `-e <turn-end extension>`. It has **no tool-restriction or sandbox flag**. The usage line accepts `--harness <name>\|harness\|launch-command`; whether a custom launch command can safely add `--tools`/`-e sandbox` while keeping Firstmate's status/turn-end contract is **untested** | `bin/fm-spawn.sh` lines ~2032–2038 and usage header |
| (Stage E) For `local-only` projects the worker stops with a clean ready branch, and firstmate lands it with the guarded fast-forward path `bin/fm-merge-local.sh` after the configured merge authority. With `yolo` off the captain approves every local-only landing; with it on firstmate lands green, in-scope work; destructive, irreversible and security-sensitive merges still escalate | `~/firstmate/AGENTS.md`, "Selected delivery path and merge authority" (read-only, 2026-10-02) |
| (Stage E) The worker status command appends to `state/<task>.status` and, only when the opt-in `config/fleet-ledger` flag file exists, runs `bin/fm-fleet-ledger.sh`, which writes `state/fleet-ledger.jsonl` and a per-task offset file; with the flag absent it performs one existence test and writes nothing | `bin/fm-fleet-ledger.sh` header; `docs/fleet-ledger.md` (read-only, 2026-10-02) |

### 6.2 Proposed verifier launch configuration (to prove in `p0-verifier-sandbox-proof`)

**Status: proposed and unproven.** Nothing below has been run. Whether the installed Firstmate adapter can launch it, and whether the sandbox can express these path rules, are exactly what Phase 0 must prove (FB-08).

**What every verifier must be able to do under Firstmate.** A verifier is a crewmate, so it must follow the same supervision contract as any worker. These are the exact paths and commands the proof must keep working (`<id>` is the verify task id):

| Purpose | Command (as in the Firstmate brief) | Reads | Writes |
|---|---|---|---|
| Status line | `echo "<state> [at=<epoch>]: <text>" >> ~/firstmate/state/<id>.status && { [ ! -e ~/firstmate/config/fleet-ledger ] \|\| ~/firstmate/bin/fm-fleet-ledger.sh appended ~/firstmate/config ~/firstmate/state/<id>.status >/dev/null 2>&1 \|\| true; }` | `~/firstmate/config/fleet-ledger` (existence test); `~/firstmate/bin/**` and, only when the ledger flag exists, the config files that script reads | `~/firstmate/state/<id>.status` (append); only when the ledger flag exists: `~/firstmate/state/fleet-ledger.jsonl` and `~/firstmate/state/.<id>.fleet-ledger-offset` |
| Steering inbox | `ls ~/firstmate/state/<id>.inbox/*.msg`; `mv ~/firstmate/state/<id>.inbox/NNN.msg ~/firstmate/state/<id>.inbox/handled/` | `~/firstmate/state/<id>.inbox/` | `~/firstmate/state/<id>.inbox/` and its `handled/` (a rename needs write access to both directories) |
| Report | write `~/firstmate/data/<id>/report.md` | — | `~/firstmate/data/<id>/` |
| Review and tests | `git archive <sha>` export, then the brief's `npm run …` commands | the exported copy in `<scratch>/flo-verify-<id>/src` | `<scratch>/flo-verify-<id>/out`, `<scratch>/flo-verify-<id>/tmp` |

`~/firstmate/config` therefore **cannot** be denied wholesale; the proof records which files under it the status command actually reads, and denies the rest only if the sandbox can express that.

**Test-running verifier (the only configuration proposed for use).** Every verify brief in [task-briefs.md](task-briefs.md) runs commands, so every verifier uses this configuration:
- `pi --tools read,bash -e <pinned sandbox extension> -e <firstmate turn-end ext>`, launched by the first mate with the model and effort flags only if the adapter supports it (untested).
- The sandbox extension wraps **bash only**, using `@anthropic-ai/sandbox-runtime` (bubblewrap on Linux). Proposed rules:
  - `filesystem.allowWrite` = exactly the write paths in the table above, nothing else;
  - the reviewed source is an exported copy of the exact revision, mounted **read-only**;
  - `denyRead` = `~/.ssh`, `~/.config/gh`, `~/.aws`, `~/.gnupg`, the deploy-credential directory (`~/.config/flo-deploy`), other project worktrees and every Firstmate path not listed in the table;
  - `network.allowedDomains = []` (tests run offline; `npm ci --ignore-scripts` runs before the sandbox starts, from the lockfile).
- **Known limits, stated plainly:**
  - Pi's own `read` tool and any extension run inside the Pi process, **outside** the bash sandbox. The bash sandbox therefore cannot stop the `read` tool from reading `~/.ssh` (check 6). Closing that needs the whole Pi process run inside the OS sandbox, which means a launch-command change to Firstmate's adapter: a separate Firstmate task with its own captain approval, not something this project does.
  - The verifier can write fake messages into its own inbox directory, because a rename needs write access there.
  - `chmod` is not a boundary: the same user can undo it.

**Review-only verifier (no bash): not usable under Firstmate as specified.** A Pi session with only `read,grep,find,ls` cannot append its status line, acknowledge inbox messages or write its report, so it cannot meet the worker contract. The first mate does not write reports or run commands on a verifier's behalf. This configuration stays unused until a minimal, approved write channel exists (for example a Firstmate-provided tool that can only append to the task's status file, move its inbox messages and write its report path). Building such a channel is a Firstmate change outside this plan.

Prerequisites needing approval in `p0-approvals` (AP-16): installing `bubblewrap` (a system package) and the sandbox extension's npm dependency.

### 6.3 Required disposable-fixture proof

A throwaway repository with dummy files and no health data. All results are recorded in this section by `p0-verifier-sandbox-proof` and independently re-checked by `p0-verifier-sandbox-proof-verify`.

| # | Check | Expected |
|---|---|---|
| 1 | Verifier reads the exported fixture source and runs a fixture test | Works |
| 2 | Verifier writes `~/firstmate/data/<id>/report.md` and appends to `~/firstmate/state/<id>.status` with the exact status command above | Works |
| 3 | Write attempts on fixture source via `edit` and `write` tools | Refused (tool absent) |
| 4 | Write attempts via `bash`: `touch`, shell redirect, `python3 -c open(...,'w')`, `node -e fs.writeFileSync`, `git commit`, `chmod u+w` then write, `mv`/`rm` | All refused |
| 5 | Write attempts via any loaded extension tool | Refused or tool absent |
| 6 | Read attempts on `~/.ssh`, the deploy-credential directory, other project worktrees and unlisted Firstmate paths, **separately through `bash` and through the `read` tool** | Refused through `bash`; the `read` tool result is recorded as is (expected **not enforced**, see limits) |
| 7 | Network request from `bash` | Refused |
| 8 | Firstmate supervision, using the exact commands in the table above: status append (with and without the ledger flag present), `ls` and `mv` of a test inbox message into `handled/`, report write, and the turn-end extension firing | All work |

### 6.4 Evidence record

**Status: NOT YET RUN.** It will be filled in during Phase 0, with:
- the exact launch command;
- the versions;
- each check's command, output and pass/fail result.

**If any check cannot be enforced with the installed Firstmate adapter** (for example because a launch-command override is not supported, or because the `read` tool is outside the sandbox), the result is recorded as **Phase 0 blocker FB-08**. In that case:
- we do **not** claim read-only enforcement;
- the launcher is **not** silently changed. Any change to Firstmate's adapter is a separate Firstmate task needing captain approval;
- **high-risk landings wait** (the default) until the captain picks one of the interim options in AP-16. **No option has the first mate run project code or tests**: running `npm` scripts, Vitest or Playwright config executes the candidate's code, and doing that in the first mate's own unsandboxed session would expose Firstmate's configuration, state and shared daemons. The options are:
  - **(a) Unenforced test-running verifier.** The verifier runs the brief's commands in its own disposable worktree under the same OS user as every implementer, with the report labelled **"isolation not enforced"**. Residual risk accepted by the captain: the verifier could alter its own copy or read host files; this does not change what lands, because the first mate lands only the implementer's exact verified commit and checks that the landed SHA equals the reviewed SHA.
  - **(b) Read-only review plus crewmate test runs.** The verifier reviews by reading only (it still uses `bash` for the status, inbox and report commands, which is equally unenforced), and the test commands are run by a ship crewmate (the implementer's re-run or the phase integration task) whose output the verifier inspects. Weaker evidence, same residual risk.

We never administer Herdr, the `no-mistakes` daemon or the worktree pool.

## 7. Task briefs (self-contained)

Every brief ([task-briefs.md](task-briefs.md)) contains:
- goal and background;
- **owned files** and **files it must not touch**;
- interfaces and contracts (paths);
- acceptance criteria as Given/When/Then;
- test commands, reference test vectors and source evidence (paths);
- relevant constitution rules;
- risk level, matched dispatch rule, resolved model and effort, prior fix-round count, and escalation evidence;
- **for verifiers:** the exact candidate revision, the report location, the source-write restrictions (§6), and the statement that this review is a mandatory independent gate;
- the expected report format: revision or files changed, evidence, and open issues, in about 15 lines or fewer.

## 8. Parallelism and waves

- **At most 3 crewmates at once**, counting implementers, verifiers and integrators together, unless the captain raises the limit.
- **Foundation tasks** (contracts, schema, design tokens, interfaces) run **one at a time** before any wave.
- **Wave rule:** tasks in the same wave never own the same file. This is checked mechanically ([consistency-check.md](consistency-check.md)).
- **Integration cadence (a justified deviation, listed for approval in AP-17).** The prompt asks for an integration ship task after each wave. This plan instead integrates **continuously at every landing** and runs **one integration ship task per phase**:
  - every task branch is rebased on the current `main`, re-runs `npm run check` and its brief's tests, and lands only after its verify passes, so `main` after each wave's last landing has already passed the unit, golden, property and static suites;
  - what remains is wiring screens into `src/app/**` and the cross-screen e2e journeys, which only make sense once a phase's screens exist; a per-wave integration item would be empty for most of the 46 P0–P2 waves and would add a captain landing approval each time while `yolo` is off;
  - the low-risk review likewise runs once per phase (`pN-lowrisk-review`) rather than once per wave, for the same reason.

  The per-phase `pN-integration` task owns `src/app/**` and `tests/e2e/<phase>-*.spec.ts`. If the captain prefers the prompt's literal cadence, the first mate adds a `pN-wK-integration` item after each wave that touched screens; nothing else in the graph changes.
- **Verification is its own backlog item** (`<task>-verify`). A verifier owns no repository files.

## 9. Backlog and tracking

- **Source of truth:** Firstmate's backlog. There is one item per implementation task, verify task and gate, with:
  - dependencies (`blocked-by`);
  - phase, type (feature / verify / gate / chore) and risk;
  - feature IDs.

  The import file is [backlog-import.md](backlog-import.md). It is loaded by the first mate **after Stage F approval**, never by a crewmate.
- **Delivery:** `local-only`, as registered (settled; AP-17 records it). Landings use `bin/fm-merge-local.sh` (§3 step 7). A GitHub repository would need a future account approval and is not part of this plan.
- **Optional GitHub Projects board:** phases and gates only, updated at gates. Not used while the project is local-only.

## 10. State and traceability

- Each phase ends with `gate-phase-N`, a **captain hold**. Every task in the next phase depends on it. The first mate sets the hold **when the gate becomes actionable** (its `pN-phase-verify` is Done), not at import; only `p0-approvals` is held at import. The captain approves by replying "continue", and the first mate records the approval in the gate's note.
- One git commit per task, using Conventional Commits.
- ADRs in `docs/adr/`.
- Progress log in `docs/progress.md`: one line per task or gate, with the date, ID, revision and verify report link.
- To keep waves free of file conflicts, implementers *propose* ADR text and progress lines in their reports. The phase's integration task writes them. `p0-agents-skills` creates `docs/progress.md`.
- Deploy records live in `docs/deploy/` (one file per deploy item): URL, landed revision, build hash and check results, never secrets or account identifiers.

## 11. Phase demo package

At every phase gate the captain gets:
1. what's new;
2. how to try it: the preview URL with synthetic data from `pN-demo-deploy` (recorded in `docs/deploy/pN-demo.md`), plus the [smoke checklist](test-strategy.md#7-real-iphone-smoke-checklist-both-phones-at-every-phase-demo-synthetic-data-only);
3. screenshots at iPhone sizes;
4. the test and verification report, with links to each verify report;
5. known issues and decisions made, as ADR and progress-log links;
6. what's next.

Then the first mate stops and waits for "continue".

## 12. Phase 0 setup of this model (after approval)

These are tasks in [backlog-import.md](backlog-import.md); none of them are done now.

| Task | What it sets up |
|---|---|
| (registration) | The local-only repository is already registered as Firstmate project `flo` (intake). This is settled and not re-asked (AP-17 is informational) |
| `p0-agents-skills` | Root `AGENTS.md` (≤150 lines: constitution summary, coding standards, DoD, pointers to docs). Skills in `.agents/skills/<name>/SKILL.md` (task-brief format, verification protocol per verifier type, cycle-math reference). Pi documents `.agents/skills/` discovery (pi `docs/skills.md`); the task verifies loading with a canary skill |
| `p0-dispatch-validate` | Checks the five rules in `crew-dispatch.json` against this model; runs `pi --list-models`; records each model's actual startup thinking level; reports mismatches. It does **not** create a project-local dispatch file |
| `p0-verifier-sandbox-proof` | §6 |
| (load backlog) | The first mate loads [backlog-import.md](backlog-import.md) after Stage F |
