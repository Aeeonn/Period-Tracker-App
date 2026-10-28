---
name: flo-commit
description: "Use when a Flo builder is ready to commit, amend after a correction round, or rebase a task branch: one Conventional Commit per task on fm/<task-id>, owned-files scope check, no co-author trailer, whitespace and check gates, never on main."
argument-hint: "<base-ref> <owned-glob>..."
---

# One Conventional Commit per task

Each Flo ship task delivers **exactly one** Conventional Commit on its own `fm/<task-id>` branch, in its own worktree. That commit is what the verifier reviews and what the orchestrator lands.

## Procedure

1. Confirm the location: `git rev-parse --show-toplevel` is a pool slot, not `/home/justi/code/flo`, and `git branch --show-current` is `fm/<task-id>`. If either is wrong, stop with `blocked`.
2. Run the brief's commands and `npm run check`. Record the real pass counts; record any command you did not run.
3. Run the scope check with the brief's owned globs (it also checks whitespace, commit count, subject format and trailers):
   ```bash
   bash /home/justi/code/flo/.agents/skills/flo-commit/scripts/scope-check.sh main 'src/x/**' 'tests/x/**'
   ```
   Fix every `OUT OF SCOPE` line by reverting your own change to that file. If the task truly needs a file it does not own, stop with `needs-decision`.
4. Commit only owned files, staging paths explicitly (never `git add -A` blindly):
   ```bash
   git add -- <owned paths>
   git commit -m "feat(store): add encrypted IndexedDB record store"
   ```
   - Subject: `type(scope): imperative summary`. Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
   - Add a body only when it helps a reviewer. **No `Co-authored-by` trailer** and no agent names: Flo's history carries none.
5. Re-run the scope check. It must print `scope-check: OK` with `1 commit(s)`.
6. Report the full SHA (`git rev-parse HEAD`) in the report and the status line.

## Correction rounds and rebases

- After a review finding, fix it in the same worktree, then `git commit --amend --no-edit` (or reword it). The branch stays one commit. Re-run the checks and report the **new** SHA. A changed SHA always needs a renewed review.
- Rebase onto the current `main` only when the brief or orchestrator asks for it: `git rebase main`, then re-run `npm run check` and compare patches (`git range-diff main...<old> main...HEAD` and `git patch-id --stable`). Report whether the patch is identical **and** whether `main` changed any file your reviewed patch touches. Either change means a renewed review.
- Never push, merge, force-push, reset main, delete branches, or commit on `main` or another task's branch. Landing belongs to the orchestrator (`flo-land`).
