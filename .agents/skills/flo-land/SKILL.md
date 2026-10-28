---
name: flo-land
description: "Use when the Flo orchestrator lands a verified task branch on main or uploads main to GitHub: guarded fast-forward of fm/<task-id> at the exact reviewed SHA, merge-authority check, main-only push after verifying the remote and its live head, then backlog/progress/slot cleanup."
argument-hint: "land <task-id> <reviewed-sha> [--push] | push | preflight"
---

# Guarded landing and main-only upload

Only the orchestrator lands. Builders and verifiers never merge or push. [`land.sh`](./scripts/land.sh) replaces Firstmate's `bin/fm-merge-local.sh`, whose task records do not exist for Copilot workers.

## Before landing: authority

Land a branch only when **all** of these hold. Otherwise ask the captain or wait.

1. The builder reported a clean, one-commit branch, and `npm run check` (plus the brief's commands) passed on that exact SHA.
2. Every required review passed **for that exact SHA**: the `-verify` PASS for high-risk work, or the narrow review the brief named. A candidate changed after review needs a renewed review.
3. Merge authority, from `~/firstmate/data/captain.md`:
   - **Routine** passing work lands and uploads automatically (captain's standing "yes").
   - **Security-sensitive** work (crypto, keys, lock, store, sync, consent, CSP/network, backup, migrations), destructive or irreversible work, and anything touching accounts, credentials, billing or deployment needs the captain's explicit approval for that change. Record it in the item first. A conditional approval ("land automatically if the review passes") counts only when its condition is met.
4. Dependencies are landed, and the branch fast-forwards from `main`. If `main` moved, the builder rebases (`flo-commit`). Land a rebased tip with `--rebased-from <reviewed-sha>`. The script refuses unless the patch-id is identical **and** `main` changed none of the files the reviewed patch touches; otherwise renew the review. Record the comparison in the backlog notes.

## Commands (inside WSL)

```bash
L=/home/justi/code/flo/.agents/skills/flo-land/scripts/land.sh
$L preflight                                   # read-only: primary clean on main, remote URL, live head
$L land p0-lock 1a2b3c4d5e6f --push            # land the exact reviewed SHA (hex only), then push main only
$L land p0-lock <new-tip> --rebased-from <reviewed-sha> --push   # identity-preserving rebase
$L push                                        # upload orchestrator chore commits (backlog/progress)
```

The script stops before changing anything if: the primary checkout is dirty or not on `main`; the remote's fetch or push URL is not `git@github.com:Aeeonn/Period-Tracker-App.git`; live remote `main` has commits local `main` lacks; the reviewed SHA is not a hex SHA (branch names are refused) or is not the branch tip; the branch is not exactly one non-merge fast-forward commit ahead; or, with `--rebased-from`, the patch or overlapping files changed. After the merge and push, it re-reads both heads.

## After landing (same turn)

1. Backlog: `backlog.py set <id> status done` and `set <id> landed "main \`<sha7>\`"`. For the `-verify` item: `status done` and `report`. Commit and push with `chore(backlog): land <id>` (see `flo-backlog`).
2. `docs/progress.md`: add one line (date, id, main SHA, verify report path), in the same chore commit.
3. Release the slots: `flo-worktree.sh release <id>` and `release <id>-verify`. Keep the branch.
4. Re-evaluate `backlog.py ready` and dispatch newly unblocked work.
5. Tell the captain the outcome in one line: what landed and that GitHub `main` matches.

## Never

Force-push, push any ref but `main`, delete refs or branches, reconfigure remotes, push unfinished branches, rewrite published history, or land a SHA nobody reviewed.
