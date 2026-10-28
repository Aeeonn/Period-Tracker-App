---
name: task-brief
description: "Use when creating or executing a self-contained Flo task brief (ship, verify, research, critique or plan) for a Copilot subagent; task-brief canary: identify owned files, acceptance criteria, and evidence."
---

# Task brief workflow

Read the common section and the named task in [`docs/plan/task-briefs.md`](../../../docs/plan/task-briefs.md), then follow its references for scope, approvals and acceptance. The assigned brief governs the current task. This skill grants no extra authority.

## Write a brief (orchestrator)

Start from the template that matches the task and save the result to `~/firstmate/data/<task-id>/brief.md`, outside the repository:

| Task | Template | Agent |
|---|---|---|
| Ship (implementation, fix, docs, integration) | [ship-brief.md](./assets/ship-brief.md) | `flo-builder` |
| `*-verify` or a narrow review | [verify-brief.md](./assets/verify-brief.md) | `flo-verifier` |
| Research, critique, planning | [scout-brief.md](./assets/scout-brief.md) | `flo-researcher`, `flo-critic`, `flo-planner` |

Fill every `{…}` placeholder and delete the options that do not apply.

- **Captain's intent** holds the captain's own words and the context needed to read them. Never widen it into a goal list; reviewers treat it as acceptance.
- **Firstmate spec** holds only the build instructions the ask needs: owned paths, explicit must-not-touch paths, interfaces, Given/When/Then acceptance with the command that shows each, the route (rule, agent, model, effort, prior failed rounds), the required review and approval preconditions. State what is out of scope. Link to specs rather than pasting them.
- **Setup** names the exact slot path and base SHA (from `flo-worktree`), with the WSL execution notes.
- **Rules** and **Definition of done** keep the template's safety lines. Change them only when the task genuinely differs.
- Correction rounds add `correction-note.md` (round N, findings, what to change, the new review scope). Continuations after a cancelled worker add `continuation-note.md`. Neither replaces the brief.
- Distinguish a missing approval from a failed check. Plan approval authorizes no account, credential, install, deployment, payment or destructive action.

## Execute a brief (worker)

- Confirm the worktree and branch first. Never work in `/home/justi/code/flo`.
- Change only owned files. Use synthetic data only in examples, tests, logs and artifacts. Never copy health records, identifying details, or Flo wording or assets.
- Report the exact revision, changed files, commands with real results, evidence and open issues. Mark checks that were unavailable or not run as such. Never manufacture evidence.

A safe criterion example: "Given a **synthetic fixture** in `tests/fixtures/example.json`, when the named check runs, then it reports the expected result." Replace the paths and result with the real task's requirements, and never use private data.
