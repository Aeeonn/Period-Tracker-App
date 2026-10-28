---
name: flo-backlog
description: "Use when reading or updating Flo's backlog in docs/plan/backlog.md (the VS Code replacement for Firstmate's tasks-axi data/backlog.md): find ready tasks, mark dispatch/candidate/done/blocked, add correction or follow-up items, record captain holds, validate dependencies, regenerate the board."
argument-hint: "check | ready | show <id> | set <id> <field> <value> | add <id> --title ... --kind ..."
---

# Flo backlog

[`docs/plan/backlog.md`](../../../docs/plan/backlog.md) is the single source of truth for Flo work items. It replaced Firstmate's `tasks-axi` backlog for Flo on 2026-10-28. Its header states the status meanings, dependency semantics and privacy rules. Briefs, reports and status logs stay in `~/firstmate/data/<id>/` and `~/firstmate/state/<id>.status`.

## Tool

```bash
B=/home/justi/code/flo/.agents/skills/flo-backlog/scripts/backlog.py
python3 $B check                     # fields, statuses, unknown deps, cycles, board in sync
python3 $B ready                     # dispatchable now: queued, no hold, deps done/superseded
python3 $B show p0-lock
python3 $B set p0-lock status in-flight
python3 $B set p0-lock branch '`fm/p0-lock` (slot 5)'
python3 $B set p0-lock candidate '`1a2b3c4`'     # makes p0-lock-verify ready
python3 $B set p0-lock status done
python3 $B set p0-lock landed 'main `1a2b3c4`'
python3 $B add p0-lock-fix --title "Correction: ..." --kind ship --risk high --blocked-by p0-lock-verify --owns '`src/lock/**`' --route 'rule 4 → flo-builder'
```

Each `set` stamps `updated` and regenerates the board. Run `check` before every commit of the file.

## Lifecycle per item

| Moment | Update |
|---|---|
| Dispatch | `status in-flight`, `branch`, plus a one-line `notes` with the agent, model, effort and round number |
| Builder reports ready | `candidate` (short SHA); this unblocks `<id>-verify` |
| Verify dispatched / reported | verify `status in-flight`; on PASS keep it in flight until the ship lands, then `done` + `report` |
| Correction round | `notes` gains round N, the findings, and the new candidate after the fix |
| Blocked | `status blocked`; `notes` gives the evidence and a proposed alternative |
| Captain decision needed | `status held`, `hold` naming the concrete decision; clear both when answered and record the answer in `notes` |
| Landed | `status done`, `landed`, verify `done` |
| Superseded or cancelled | only on a captain decision; work and branches are preserved |

## Committing backlog updates

The orchestrator commits backlog and `docs/progress.md` updates **directly on `main`** in the primary checkout (captain decision, 2026-10-28). The commit contains only those two files. Use subject `chore(backlog): <what changed>` and no trailer. Commit right after the landing it records, or batch it at the end of a supervision turn, then upload with `flo-land` (`land.sh push`). Never mix source changes into these commits. Never make one while the primary checkout has unrelated changes.

## Rules

- Add work only from the approved plan, a captain request, or a review finding. Follow-ups that were not requested become notes or held proposals, not silent scope.
- Keep notes short and durable. Leave out temporary paths, copied logs, health data, credentials and captain-private wording. Point to `~/firstmate/data/<id>/` for detail.
- Firstmate's old `~/firstmate/data/backlog.md` is frozen for Flo. Do not update Flo items there.
