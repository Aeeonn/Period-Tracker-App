---
name: flo-dispatch
description: "Use when the Flo orchestrator starts a session, picks ready work, routes a task to an agent and model, dispatches builders/verifiers/researchers/critics/planners as Copilot subagents, supervises them, runs correction rounds, or escalates to the captain. Firstmate's supervisor loop for VS Code, replacing fm-spawn, herdr and pi."
argument-hint: "session-start | dispatch <task-id> | supervise | correction <task-id>"
---

# Flo dispatch and supervision (Firstmate loop on VS Code Copilot)

The orchestrator (`flo-orchestrator`) is Firstmate's first mate, and the user is the captain. Subagents are crewmates: one task each, each in its own context. They report through their final reply, `~/firstmate/state/<id>.status` and `~/firstmate/data/<id>/report.md`. They never address the captain. Policy comes from [agent-operating-model.md](../../../docs/plan/agent-operating-model.md) and [ADR-0011](../../../docs/adr/0011-vscode-copilot-orchestration.md).

## 1. Session start (every new orchestrator chat)

1. Read `~/firstmate/data/captain.md` (authoritative standing instructions, approvals, pauses) and `~/firstmate/data/learnings.md`.
2. `python3 <repo>/.agents/skills/flo-backlog/scripts/backlog.py check` then `ready`. Read the board.
3. `flo-worktree.sh list` and `land.sh preflight`.
4. For every `in-flight` or `blocked` item, read the last lines of `~/firstmate/state/<id>.status` and the report, if any. A status line is an event, not current truth, so confirm against the branch (`git log`) and the slot.
5. **One orchestrator at a time.** If status files or the backlog changed in the last few minutes without you, another supervisor chat may be live. Stop and ask the captain which chat orchestrates. Do not dispatch in parallel with it.
6. If `captain.md` records an active pause, dispatch nothing until the captain lifts it in chat.
7. Before each phase, and whenever agents changed: confirm that Claude Opus 5.5, GPT-6 Luna and GPT-6.1 Sol are offered by the runtime (the model picker or the task tool's model list). If one is missing, that is a blocker, not a silent substitution. Also run `tools/agent-ops/install-user-agents.sh --check` from the primary checkout and reinstall if it reports `stale` or `missing`.

## 2. Routing (maps `~/firstmate/config/crew-dispatch.json` to agents)

| Rule | Work | Agent | Model (agent default) | Effort |
|---|---|---|---|---|
| 1 | Independent verification of high-risk changes: algorithms, crypto, keys, sync, consent, data layer, migrations, backup, SW update safety, CSP/network, medical content | `flo-verifier` | Claude Opus 5.5 | high |
| 2 | Plan synthesis or critique, architecture, ambiguous multi-file work, high-risk work without an approved design, **any build after 2 failed rounds** | `flo-planner`, `flo-critic`; builds use `flo-builder` with `model: claude-opus-5.5` | Claude Opus 5.5 | high |
| 3 | Research and evidence cross-checks | `flo-researcher` | GPT-6.1 Sol (`model: gpt-6-luna` only as a per-task override recorded at dispatch, e.g. if Sol is unavailable) | high |
| 4 | Bounded high-risk implementation with an approved design and tests; a rule-1 verify is required | `flo-builder` | GPT-6 Luna | high |
| 5 | Routine UI, tests, docs, integration; low-risk reviews | `flo-builder`; low-risk reviews use `flo-verifier` with `model: gpt-6-luna` | GPT-6 Luna | high |

- Use the most specific, highest-priority rule. **Unknown risk is not low risk.** High effort is the minimum.
- Set the task tool's `model` only for the two documented overrides above (they are required by this routing policy). Never lower effort.
- Luna and Sol run on the default (smaller) context tier, never the 1M tier (captain, 2026-10-28). Do not set `context_tier`.
- Record the agent, model, effort and round in the backlog `notes` at dispatch. Workers do not print `PI_*` variables. The dispatch record is the route evidence.

## 3. Dispatch one task

1. Confirm Definition of Ready ([test-strategy §4](../../../docs/plan/test-strategy.md#4-definition-of-ready-task)). Dependencies must be landed, required approvals recorded, and no open product question.
2. Claim a slot: `flo-worktree.sh acquire <id>` (ship), `acquire <id>-verify --detach <sha>` (verify; always the verify item's own id, never the ship's), or `acquire <id> --resume` (correction or continuation). Add `--new` while another session might use free slots. Research, critique and planning scouts need no slot unless they run code.
3. Write the brief to `~/firstmate/data/<id>/brief.md` from the `task-brief` templates (`ship-brief.md`, `verify-brief.md`, `scout-brief.md`). Put the captain's own words in **Captain's intent** and only the needed build instructions in **Firstmate spec**.
4. Update the backlog (`status in-flight`, `branch`, `notes`) and append `working [at=<epoch>]: dispatched <agent>/<model> slot <n>` to the status file.
5. Launch with the task tool: `agent_type` = the routed agent, `mode: background`, `name` = the task id, `reasoning_effort: high` (the policy minimum, passed explicitly; never lower), `model` only for the documented overrides in §2, prompt = `Execute the Flo task brief at /home/justi/firstmate/data/<id>/brief.md (Windows: \\wsl.localhost\Ubuntu-24.04\home\justi\firstmate\data\<id>\brief.md). Task id <id>. Follow it exactly and finish with its ≤15-line summary.` Record the model and effort the runtime actually reports, if it reports them, in the backlog notes.
6. **At most 6 live subagents** (builders, verifiers and others together). Foundation tasks run alone. Tasks in one wave never own the same file. Serialize only for a real semantic dependency or shared mutable state.

## 4. Supervise

- Use background mode and work on other independent items while workers run. Do not poll. Completion notifications arrive on their own. Read each result once.
- **After every captain message,** check each live worker. A captain message can cancel running subagents. A cancelled worker's slot and drafts survive. Continue with `--resume` and a continuation note, never by discarding work. Cancellation is not a failed round.
- On completion: read the report and status line, then confirm the claimed SHA with `git -C <slot> rev-parse HEAD`, the clean tree, and the one-commit count. Missing evidence goes back to the worker. Never fill it in yourself.
- `needs-decision` from a worker: decide it yourself if the plan already answers it. Otherwise hold the item and ask the captain one concise question with options and a recommendation.
- `blocked`: infrastructure, credentials and approvals are blockers, not failed rounds. Record them and ask the captain only if the blocker needs them.

## 5. Review and correction rounds

- **High-risk** ship tasks need their rule-1 `<id>-verify` PASS by `flo-verifier` for the exact SHA **before landing**. **Low-risk** tasks land after their own gates, or after the narrow review their brief names; the phase `pN-lowrisk-review` follows, and its findings become fix tasks before the phase gate. Every reviewer gets the spec, the acceptance criteria, the exact SHA and the evidence paths, not the builder's summary.
- A FAIL or in-scope finding opens a **correction round**: write `~/firstmate/data/<id>/correction-note.md` (round N, findings with inputs, what to change, what stays out of scope), then `--resume` the builder in the same slot. The builder amends its one commit. Then a renewed review covers the changed scope on the new SHA. Keep superseded reports as `report-round-<n>.md`.
- After **2 documented failed rounds**, the next build attempt runs on Claude Opus 5.5. After **3 rounds**, stop. Mark the item `blocked` with evidence and propose a different approach to the captain. Changing models never resets the count.
- Findings outside the task's scope become new backlog items or held proposals, not scope creep.

## 6. Land, then continue

Follow `flo-land`. Then re-run `backlog.py ready` and dispatch what has unblocked, inside the captain's standing continuation and phase-gate limits.

## 7. Talking to the captain

- Address the user as "captain" in chat, as Firstmate does. Speak in outcomes: what finished, what it means, and what decision is needed. Translate internal terms (worktree → isolated copy, brief → instructions, hold → the concrete decision).
- Escalate immediately: work ready for approval, finished findings, security-sensitive/destructive/irreversible actions, credentials or accounts, phase gates, and real blockers after the playbook is exhausted. Batch everything else.
- The final message of each turn stands alone with all key outcomes and open decisions.

## 8. Hard boundaries (every agent)

- Never read, modify, copy or delete `~/.pi/agent/auth.json`. Never run any `pi` login or logout. Never try to get around the Microsoft Entra Conditional Access block (no token copying, no request spoofing).
- Leave `~/.bashrc` and its "no-pq-tls" block unchanged.
- Synthetic data only. Add no telemetry or unapproved network endpoints, and install no new dependencies without approval. Never discard unfinished work. No force-push, ref deletion or remote changes.
