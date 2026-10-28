---
name: flo-worktree
description: "Use when claiming, finding, listing or releasing a git worktree slot for a Flo task: new fm/<task-id> branches for builders, detached verify laboratories at an exact candidate SHA, resuming a kept branch, or freeing a slot after landing. Worktree shortcut for the VS Code orchestrator."
argument-hint: "list | acquire <task-id> [--base <ref> | --detach <sha> | --resume] | path <task-id> | release <task-id>"
---

# Flo worktree slots

Every Flo task runs in its own git worktree, never in the primary checkout `/home/justi/code/flo`. Slots live in the treehouse pool `~/.treehouse/flo-333f10/<n>/flo`. Use [`flo-worktree.sh`](./scripts/flo-worktree.sh) for every slot operation.

## Why not `treehouse get`

`treehouse status` only sees processes that run inside a slot. Copilot subagents run one command at a time, so treehouse reports slots with live workers as "available", and `treehouse get/return/prune/destroy` could reset them. Do not use those commands on the Flo pool. The script claims a slot with native `git worktree lock --reason "fm:<task-id>"`. Git also refuses to prune a locked worktree.

## Commands (run inside WSL)

```bash
S=/home/justi/code/flo/.agents/skills/flo-worktree/scripts/flo-worktree.sh
$S list                                   # state per slot: primary, free, claimed, in-use?
$S acquire p0-lock                        # builder: new fm/p0-lock from main, prints the slot path
$S acquire p0-lock-verify --detach <sha>  # verifier laboratory at the exact candidate
$S acquire p0-lock --resume               # continue a kept branch (correction round, continuation)
$S acquire p0-lock-verify --detach <sha> --new   # always a fresh slot (another session may use free ones)
$S path p0-lock                           # where is it?
$S release p0-lock                        # after landing or report: detach at main, unlock
```

- **free** means: in the pool, unlocked, detached, clean, and its HEAD is already on `main`. `acquire` reuses the first free slot. If none is free, it creates the next numbered slot with `git worktree add` and copies `node_modules` from the primary checkout when the lockfiles match.
- **in-use?** means unlocked but holding a branch, local changes or unlanded commits. These are usually from an older session. Never reuse one without reading the backlog record that owns it.
- `release` refuses a dirty slot and never deletes a branch. A kept branch stays available to `--resume`.
- Run it from Windows PowerShell with: `wsl -d Ubuntu-24.04 -u justi -- bash -lc "<command>"`.

## Rules

- Builders work only on `fm/<task-id>`, one commit, in their own claimed slot. Verifiers work detached at the exact SHA under review.
- Record the slot in the backlog item (`branch:` field) and in the brief's Setup section.
- Never `git worktree remove`, `prune`, `reset --hard`, `clean`, `stash`, or delete a branch to free a slot. If no slot can be freed safely, `acquire` makes a new one. Disk is cheaper than lost work.
- If `package-lock.json` differs from `node_modules`, the worker runs `npm ci --ignore-scripts` from the approved lockfile only. Never add or upgrade a dependency to repair a slot.
