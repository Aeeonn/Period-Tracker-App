---
name: verification-protocol
description: Use when independently verifying an exact task revision, acceptance criteria, code, algorithms, accessibility, privacy, consent, security, or medical content.
---

# Independent verification protocol

Follow the verifier brief and [`docs/plan/agent-operating-model.md` §§3–6](../../../docs/plan/agent-operating-model.md#3-the-loop-for-every-task). A verifier (the `flo-verifier` agent, or any agent given a verify brief) does not implement, edit reviewed source, commit, merge, or verify their own work.

## Pin the evidence

- Record the exact candidate commit SHA supplied by the orchestrator. Confirm the inspected source is that revision (`git rev-parse HEAD` in the detached laboratory, before and after); report any mismatch or later change. A changed patch normally needs review on its new SHA. For a rebase with identical stable patch-id, re-run the task tests and re-point the review record to the rebased SHA without a new review, even if `main` touched the same files.
- Map each applicable acceptance criterion to evidence. Reuse the builder evidence for the same exact SHA; run targeted probes and only other checks the verifier doubts, not the full suite by default. Record exact commands/results and relevant inputs, and use synthetic fixtures only.
- Write the report to the brief's external report path (`~/firstmate/data/<task-id>/report.md`, never inside the reviewed source). State the revision, verifier types, verdict, findings, evidence, and open issues. A PASS applies only to the exact reviewed SHA; do not infer device, clinical, or security assurance from unrelated checks.
- A review FAILs only for correctness, security, data-loss or spec defects. Low-severity issues and nits go on a follow-up list and never fail the gate. After a FAIL, re-review only that the findings are closed and nothing adjacent regressed; low-severity closure may use the cheaper `flo-verifier` with `gpt-6-luna`.
- For algorithm audits, derive expected vector results from the specification and record them before examining implementation.

## Choose the applicable review type

- **Code reviewer:** inspect the scoped diff for correctness, regressions, unsafe behavior, and maintainability; cite paths and cases.
- **Spec/acceptance verifier:** trace each Given/When/Then criterion to implementation and reproducible evidence; list gaps explicitly.
- **Algorithm auditor:** use source-labelled specification and independently derived vectors; check determinism, boundaries, and uncertainty claims.
- **UX/accessibility verifier:** inspect required journeys, copy, keyboard/screen-reader behavior, contrast and target sizing with synthetic data.
- **Privacy/consent/security reviewer:** trace controls to the consent, privacy, and security requirements in [`security-privacy.md`](../../../docs/plan/security-privacy.md); distinguish code evidence from design intent and residual risk.
- **Medical-content fact-checker:** check every medical claim and action against its cited authoritative source and the population it covers. Canadian localization must be sourced and independently reviewed before P1 content is accepted.

Use only the types relevant to the brief; one type does not substitute for another. Report exact failing cases, not just an overall opinion.

## Be honest about isolation

No verifier sandbox exists. The captain declined the extra reviewer-isolation feature and approved ordinary independent review on 2026-10-28 ([agent-operating-model.md §6](../../../docs/plan/agent-operating-model.md#6-verifier-safeguards)). A separate subagent, context or worktree is **not** a read-only boundary. Every verify report says **"isolation not enforced"** and describes the residual risk: the verifier runs as the same OS user and could alter its own laboratory or read host files. This does not change what lands, because the orchestrator lands only the builder's branch at the exact reviewed SHA. Never claim sandboxing, read-only enforcement or source-write prevention.
