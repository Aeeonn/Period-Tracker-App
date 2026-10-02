---
name: task-brief
description: "Use when creating or executing a self-contained Firstmate task brief; task-brief canary: identify owned files, acceptance criteria, and evidence."
---

# Task brief workflow

Read the common section and the named task in [`docs/plan/task-briefs.md`](../../../docs/plan/task-briefs.md), then follow its references for scope, approvals, and acceptance. The assigned brief and worker wrapper govern the current task; this skill does not grant extra authority.

## Make the work self-contained

- State the goal, dependencies, exact owned paths, explicit must-not-touch paths, interfaces, and any approval preconditions.
- Give observable Given/When/Then acceptance criteria and the available commands or evidence that demonstrate each criterion.
- Specify route/risk as supplied by the project, the expected report location and format, and any required independent verifier. Link to authoritative specifications rather than duplicating long policy or formulas.
- Distinguish missing approval from a failed check. Do not assume plan approval authorizes accounts, credentials, installs, deployments, payments, or destructive actions.

## Execute within the brief

- Change only owned files in the assigned worktree. Do not edit shared routing, application code, packages, tooling, or other task files unless the brief explicitly owns them.
- Use synthetic-only data in all examples, tests, logs, and artifacts. Never copy health records, identifying details, or Flo wording/assets into a task.
- Report the exact revision, changed files, commands and results, evidence, and open issues. Mark unavailable or unrun checks as such; do not manufacture evidence.

A safe criterion example is: “Given a **synthetic fixture** in `tests/fixtures/example.json`, when the named check runs, then it reports the expected result.” Replace the paths and result with the real task's requirements; do not use private data.
