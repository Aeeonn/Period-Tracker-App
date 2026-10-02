# Progress and decisions

This log records approved choices separately from completed evidence and pending permissions. The authoritative plan and execution gates are in [`docs/plan/plan.md`](plan/plan.md), [`task-briefs.md`](plan/task-briefs.md), and [`agent-operating-model.md`](plan/agent-operating-model.md).

## Approved choices

- **2026-10-02 — Captain approval, recorded in this task's launch brief: plan defaults accepted and this P0 documentation task authorized.** Keep the app's encrypted backup/restore; hosting custody is joint; use Canadian guidance. This plan approval does not authorize accounts, credentials, dependency or sandbox installation, deployment, payment, or destructive action.
- Canadian guidance is selected, but **Canadian localization is not yet ready for P1**: content must have cited Canadian sources and independent review first.
- Optional administrative help is exploratory only. It is not permission to access or edit private data, operate her account, change her records, or bypass category consent.

## Completed evidence

- Planning documents landed on local `master` at `4dba4fa` after preserving the pre-existing `PLANNING_PROMPT.md` edit and deleted project `crew-dispatch.json`. Neither the prompt edit nor deletion is to be reverted or recreated by this work.
- Firstmate runtime/routing, model-catalog, and startup validation is complete; its report is [`/home/justi/firstmate/data/p0-dispatch-validate/report.md`] (outside this repository). It reported the five routing rules and required model profiles matched, with this session on `github-copilot/gpt-6-luna` at high reasoning.
- This P0 task creates only the project constitution, reusable skills, and this progress log. `AGENTS.md` is 31 lines; `grep -c docs/plan AGENTS.md` returned 5. Link, anchor, and Pi-parsed skill-frontmatter checks passed for all five Markdown files and three skills; skills contain no copied formulas.
- **Pi discovery evidence:** installed Pi 0.99.2 `DefaultResourceLoader`, run from the repository with in-memory settings and extensions disabled (no model invocation), discovered all three `.agents/skills/*/SKILL.md` files with no skill diagnostics. Its parsed `task-brief` description contains and matches the `task-brief canary` phrase. The documented discovery mechanism is therefore confirmed without a paid model call.
- No application code or project test toolchain exists in this checkout. No application tests were run or dependencies installed.

## Pending permissions and proof

The following remain separate, pending items for `p0-approvals`; none is implied by plan approval:

- **Hosting account:** create/use the jointly held hosting account (AP-10).
- **Scoped credential:** issue and store any scoped hosting credential (AP-10).
- **Verifier sandbox:** install the approved sandbox prerequisites/dependencies, if later approved (AP-16).
- **Project dependencies:** install the pinned npm dependency set (AP-28).
- **Synthetic preview deployment:** create or deploy preview hosting, relay, secrets, or push-test endpoint (AP-18).

No infrastructure account was created, no credential or secret was issued, no package or sandbox prerequisite was installed, and no preview deployment was made for this task. No administrative override was exercised or authorized.

## Phase and verification status

- Phase demos, captain approval pauses, and concurrency limits remain as specified in [plan §14](plan/plan.md#14-roadmap-phases-and-gates) and [agent-operating-model §§8, 10–11](plan/agent-operating-model.md#8-parallelism-and-waves); this log does not relax them.
- No application implementation, project test, phone check, medical review, or security proof has occurred. Documentation and skill-discovery checks are not evidence for those foundations. Record any later results against the exact task revision and required verifier report.
