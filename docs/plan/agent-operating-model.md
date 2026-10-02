# Agent operating model on Firstmate (Step 9)

**Status:** Stage C draft, 2026-10-02. This document describes how execution will run **after** Stage F approval. Nothing in it has been set up yet. Phase 0 tasks set it up and prove it ([roadmap.md](roadmap.md#p0--foundation)). Decision recorded in [ADR-0009](../adr/0009-agent-operating-model-on-firstmate.md).

**No second orchestrator.** Firstmate already provides the orchestration loop, worktree isolation, supervision, the backlog (`tasks-axi`, markdown backend `data/backlog.md`) and dispatch. This model adds only *policy* on top: routing, risk, verification and gates. It adds no new tool, daemon, task database or project-local dispatch file.

## 1. Roles mapped to Firstmate

| Role | Firstmate mechanism | Notes |
|---|---|---|
| **Orchestrator** | The first mate (MAIN) | Owns the backlog and dependency graph. Writes briefs with `bin/fm-brief.sh`, dispatches with `bin/fm-spawn.sh`, enforces gates and brings decisions to the captain. **Read-only over project files.** Integration is a ship task after each wave |
| **Implementer** | One `ship` task per backlog item, one crewmate, its own disposable worktree | Runs the build, lint and tests itself before reporting. There is no separate test-runner agent. One Conventional Commit per task |
| **Independent verifier** | A `scout` task in a separate session reviewing the **exact candidate revision** in its own workspace | Never edits reviewed source, commits, merges or ships. Reports and artefacts go outside the reviewed source (e.g. `~/firstmate/data/<task-id>/report.md`). Types: code reviewer, spec/acceptance verifier, algorithm auditor, UX/accessibility verifier, privacy/consent/security reviewer, medical-content fact-checker |
| **Plan critic / researcher** | `scout` tasks | Stage D critique; later, content-source retrieval |
| **Integrator** | `ship` task `pN-integration-wK` | Wires screens into `src/app/**`, runs the full e2e suite, and fixes only integration glue |

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
7. **Merge.** The integration ship task merges to local `main`, or a PR is used if the repository mode changes (AP-17). Merging happens only after the required verify reports PASS.

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

**Decisions** go to the captain only at the Section 3 checkpoints. Everything else is decided by the first mate and logged in an ADR or the progress log. Account, repository and credential requests are collected in `p0-approvals`, so later phases can run without the captain.

## 5. Risk-based verification depth

| Risk | Areas | Verification |
|---|---|---|
| **High** | Prediction and medical algorithms, encryption, key exchange, sync, permissions and consent, data layer, migrations, backup and recovery, service-worker update safety, CSP/network, medical content | A dedicated `<task>-verify` scout on Opus (high or above), using only the verifier types that apply (usually 1–2). Filed as a **required dependency** of the next integration task and the gate. Passing tests, a first-try success or an Opus implementer **never** waive it |
| **Medium/Low** | UI screens, settings, toolchain glue, docs | Automated gates plus **one** Luna (high) review scout per wave (`pN-wK-ui-review`) covering every low-risk task in that wave |

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

### 6.2 Proposed verifier launch configuration (to prove in `p0-verifier-sandbox-proof`)

**Review-only verifiers** (code/spec review with no test execution):
- `pi --tools read,grep,find,ls --no-extensions -e <firstmate turn-end ext>`. The installed Pi bundle defines built-in `grep`, `find` and `ls` tools. Its `grep` tool can try to download ripgrep if `rg` is missing, which is a network and write side effect. `rg` must therefore be present beforehand, and the proof must check that no download happens.
- These verifiers have no `bash`, `edit` or `write`. The report goes back to the first mate in the session output, and the first mate writes it to `data/<id>/report.md`.

**Test-running verifiers** (algorithm auditor, privacy/security reviewer):
- `pi --tools read,bash -e <pinned sandbox extension> -e <firstmate turn-end ext>`.
- Sandbox config:
  - `filesystem.allowWrite = [<scratch>/flo-verify-<id>/out, <scratch>/flo-verify-<id>/tmp, ~/firstmate/state/<id>.status (append)]`;
  - reviewed source mounted **read-only**: an exported copy of the exact revision (`git archive <sha>`) in `<scratch>/flo-verify-<id>/src`;
  - `denyRead = [~/.ssh, ~/.config/gh, ~/.aws, other project worktrees, ~/firstmate/config]`;
  - `network.allowedDomains = []` (tests run offline; `npm ci` happens before the sandbox starts, from the lockfile).
- **`chmod` alone is not a boundary.** The same user can undo it.

Both configs need approval in `p0-approvals` (AP-16):
- installing `bubblewrap`, a system package;
- the sandbox extension's npm dependency.

### 6.3 Required disposable-fixture proof

A throwaway repository with dummy files and no health data. All results are recorded in this section by `p0-verifier-sandbox-proof` and independently re-checked by `p0-verifier-sandbox-proof-verify`.

| # | Check | Expected |
|---|---|---|
| 1 | Verifier reads fixture source and runs a fixture test | Works |
| 2 | Verifier writes its report to the output area and appends to its status file | Works |
| 3 | Write attempts on fixture source via `edit` and `write` tools | Refused (tool absent) |
| 4 | Write attempts via `bash`: `touch`, shell redirect, `python3 -c open(...,'w')`, `node -e fs.writeFileSync`, `git commit`, `chmod u+w` then write, `mv`/`rm` | All refused |
| 5 | Write attempts via any loaded extension tool | Refused or tool absent |
| 6 | Read attempts on `~/.ssh`, other project worktrees, `~/firstmate/config` | Refused |
| 7 | Network request from `bash` | Refused |
| 8 | Firstmate supervision (status, turn-end, inbox) still works | Works |

### 6.4 Evidence record

**Status: NOT YET RUN.** It will be filled in during Phase 0, with:
- the exact launch command;
- the versions;
- each check's command, output and pass/fail result.

**If any check cannot be enforced with the installed Firstmate adapter** (for example because a launch-command override is not supported), the result is recorded as **Phase 0 blocker FB-08**. In that case:
- we do **not** claim read-only enforcement;
- the launcher is **not** silently changed. Any change to Firstmate's adapter is a separate Firstmate task needing captain approval;
- high-risk merges wait until the captain decides an interim policy.

The interim policy proposed in AP-16 is review-only verifiers (no bash) plus first-mate-run test commands on the exact revision.

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
- **Integration after each wave.** An integration ship task follows each wave and owns `src/app/**` and `tests/e2e/<phase>-*.spec.ts`.
- **Verification is its own backlog item** (`<task>-verify`). A verifier owns no repository files.

## 9. Backlog and tracking

- **Source of truth:** Firstmate's backlog. There is one item per implementation task, verify task and gate, with:
  - dependencies (`blocked-by`);
  - phase, type (feature / verify / gate / chore) and risk;
  - feature IDs.

  The import file is [backlog-import.md](backlog-import.md). It is loaded by the first mate **after Stage F approval**, never by a crewmate.
- **Delivery:** local-only merges by default, since the project is registered local-only. Moving to a private GitHub repository with PRs is AP-17.
- **Optional GitHub Projects board:** phases and gates only, updated at gates. Not used while the project is local-only.

## 10. State and traceability

- Each phase ends with `gate-phase-N`, a **captain hold**. Every task in the next phase depends on it. The captain approves by replying "continue", and the first mate records the approval in the gate's note.
- One git commit per task, using Conventional Commits.
- ADRs in `docs/adr/`.
- Progress log in `docs/progress.md`: one line per task or gate, with the date, ID, revision and verify report link.
- To keep waves free of file conflicts, implementers *propose* ADR text and progress lines in their reports. The wave's integration task writes them. `p0-agents-skills` creates `docs/progress.md`.

## 11. Phase demo package

At every phase gate the captain gets:
1. what's new;
2. how to try it: a preview URL with synthetic data, plus the [smoke checklist](test-strategy.md#7-real-iphone-smoke-checklist-both-phones-at-every-phase-demo-synthetic-data-only);
3. screenshots at iPhone sizes;
4. the test and verification report, with links to each verify report;
5. known issues and decisions made, as ADR and progress-log links;
6. what's next.

Then the first mate stops and waits for "continue".

## 12. Phase 0 setup of this model (after approval)

These are tasks in [backlog-import.md](backlog-import.md); none of them are done now.

| Task | What it sets up |
|---|---|
| (registration) | The local-only repository is already registered as Firstmate project `flo` (intake). Repository mode is confirmed in `p0-approvals` (AP-17) |
| `p0-agents-skills` | Root `AGENTS.md` (≤150 lines: constitution summary, coding standards, DoD, pointers to docs). Skills in `.agents/skills/<name>/SKILL.md` (task-brief format, verification protocol per verifier type, cycle-math reference). Pi documents `.agents/skills/` discovery (pi `docs/skills.md`); the task verifies loading with a canary skill |
| `p0-dispatch-validate` | Checks the five rules in `crew-dispatch.json` against this model; runs `pi --list-models`; records each model's actual startup thinking level; reports mismatches. It does **not** create a project-local dispatch file |
| `p0-verifier-sandbox-proof` | §6 |
| (load backlog) | The first mate loads [backlog-import.md](backlog-import.md) after Stage F |
