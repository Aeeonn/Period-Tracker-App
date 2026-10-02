---
name: verification-protocol
description: Use when independently verifying an exact task revision, acceptance criteria, code, algorithms, accessibility, privacy, consent, security, or medical content.
---

# Independent verification protocol

Follow the verifier brief and [`docs/plan/agent-operating-model.md` §§5–7](../../../docs/plan/agent-operating-model.md). A verifier does not implement, edit reviewed source, commit, merge, or verify their own work.

## Pin the evidence

- Record the exact candidate commit SHA supplied by the first mate. Confirm the inspected source is that revision; report any mismatch or later change. A changed candidate requires renewed verification.
- Map each applicable acceptance criterion to evidence. Run only the commands authorized by the brief, record exact commands/results and relevant inputs, and use synthetic fixtures only.
- Write the report to the brief's external report path. State the revision, verifier types, findings, evidence, and open issues. A PASS applies only to the exact reviewed SHA; do not infer device, clinical, or security assurance from unrelated checks.
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

Do not call a verifier sandbox, read-only boundary, or source-write prevention proven until the disposable-fixture checks in [`agent-operating-model.md` §6.3–6.4](../../../docs/plan/agent-operating-model.md#63-required-disposable-fixture-proof) have actually passed and the evidence record supports that claim. The plan's proposed safeguards are not proof. If enforcement is absent or unproven, say **“isolation not enforced”** where required and describe the residual risk; never imply that a separate session or worktree is a sandbox.
