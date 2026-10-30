---
name: flo-land
description: 'Use when the Flo orchestrator lands a verified task branch on main or uploads main to GitHub: guarded fast-forward of fm/<task-id> at the exact reviewed SHA, merge-authority check, main-only push after verifying the remote and its live head, then backlog/progress/slot cleanup.'
argument-hint: 'land <task-id> <reviewed-sha> [--push] | push | preflight'
---

# Guarded landing and main-only upload

Only the orchestrator lands. Builders and verifiers never merge or push. [`land.sh`](./scripts/land.sh) replaces Firstmate's `bin/fm-merge-local.sh`, whose task records do not exist for Copilot workers.

## Before landing: authority

Land a branch only when **all** of these hold. Otherwise ask the captain or wait.

1. The builder reported a clean, one-commit branch, and `npm run check` (plus the brief's commands) passed on that exact SHA.
2. Required review evidence is PASS for the candidate: a dedicated Opus `-verify` for prediction/medical engine algorithms, crypto and keys, pairing and sync merge, consent enforcement, migrations and backup/restore, and medical content; otherwise builder gates plus the batched rule-5 wave review. FAIL only for correctness, security, data-loss or spec defects. After FAIL, re-review only finding closure and adjacent regression. A patch-identical rebase that passes its tests is re-pointed to the rebased SHA without a new review, even if touched files overlap.
3. Standing authority:
   - Security-sensitive work lands automatically when its required review passes for the exact SHA.
   - Synthetic-only previews/redeploys from reviewed landed `main` run without per-deploy approval.
   - Production, real data, accounts/credentials, money and phase gates remain captain decisions.
   - Destructive or irreversible changes and installs not already approved retain explicit captain approval.
4. Dependencies are landed, and the branch fast-forwards from `main`. If `main` moved, the builder rebases and re-runs the task tests. If stable patch-id is identical and tests pass, re-point the existing review to the rebased SHA and land without a new review, even if `main` touched the same files; a changed patch requires renewed review. `land.sh --rebased-from` reports overlapping files for information but does not refuse an identical patch. Record the comparison in the backlog notes.

## Commands (inside WSL)

```bash
L=/home/justi/code/flo/.agents/skills/flo-land/scripts/land.sh
$L preflight                                   # read-only: primary clean on main, remote URL, live head
$L land p0-lock 1a2b3c4d5e6f --push            # land the exact reviewed SHA (hex only), then push main only
$L land p0-lock <new-tip> --rebased-from <reviewed-sha> --push   # identity-preserving rebase
$L push                                        # upload orchestrator chore commits (backlog/progress)
```

The script stops before changing anything if: the primary checkout is dirty or not on `main`; the remote's fetch or push URL is not `git@github.com:Aeeonn/Period-Tracker-App.git`; live remote `main` has commits local `main` lacks; the reviewed SHA is not a hex SHA (branch names are refused) or is not the branch tip; the branch is not exactly one non-merge fast-forward commit ahead; or, with `--rebased-from`, the patch-id differs. Overlapping files are informational. After the merge and push, it re-reads both heads.

## After landing (same turn)

1. Backlog: `backlog.py set <id> status done` and `set <id> landed "main \`<sha7>\`"`. For the `-verify`item:`status done`and`report`. Commit and push with `chore(backlog): land <id>`(see`flo-backlog`).
2. `docs/progress.md`: add one line (date, id, main SHA, verify report path), in the same chore commit.
3. Release the slots: `flo-worktree.sh release <id>` and `release <id>-verify`. Keep the branch.
4. Re-evaluate `backlog.py ready` and dispatch newly unblocked work.
5. Tell the captain the outcome in one line: what landed and that GitHub `main` matches.

## Never

Force-push, push any ref but `main`, delete refs or branches, reconfigure remotes, push unfinished branches, rewrite published history, or land a SHA nobody reviewed.
