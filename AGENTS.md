# Flo project constitution

This repository plans and builds a private cycle-tracking app. The approved project plan and its specifications are authoritative; this file summarizes rules, not algorithm details.

## Authority and scope

- Follow the assigned task brief, its owned-file list, and approval preconditions. Do not widen scope or make an unapproved account, credential, install, deploy, payment, or data-access change.
- Start with [the approved plan](docs/plan/plan.md). Use its linked architecture, ADRs, roadmap, and task briefs as applicable. The [agent operating model](docs/plan/agent-operating-model.md#8-parallelism-and-waves) and its phase-gate sections define phase demos, approval pauses, and concurrency constraints.
- Required task readiness and completion criteria are [Definition of Ready](docs/plan/test-strategy.md#4-definition-of-ready-task) and [Definition of Done](docs/plan/test-strategy.md#5-definition-of-done-task).

## Engineering standards

- Use the planned mainstream stack: strict TypeScript, Preact, Vite, browser IndexedDB, and Web Crypto. Prefer small, typed modules and explicit contracts over implicit cross-module behavior.
- Keep dependencies minimal, exactly pinned, license-checked, and installed only after the relevant explicit approval. Do not add tooling or dependencies to work around a missing approval.
- Write deterministic automated tests for behavior and edge cases. Use the test strategy and task-specific commands; never claim a check ran when it did not.
- Store health dates as `LocalDate` calendar values and use the specified date engine. Do not treat local dates as timestamps or introduce UTC/DST conversions; see [algorithms-spec.md, A0 and the engine contract](docs/plan/algorithms-spec.md).

## Privacy, consent, and safety

- **Synthetic data only.** Never put real health or identifying data in source, tests, fixtures, logs, screenshots, issues, or examples. Clearly identify synthetic fixtures; never copy a person's records into the repository.
- Sharing is off by default and controlled category by category. Preserve pause, revoke, preview, and unpair semantics; desire, mood, and patterns are never consent. Follow [the consent and privacy rules](docs/plan/security-privacy.md#2-consent-and-privacy-rules-testable).
- Health data stored or transmitted off-device must remain end-to-end encrypted with keys held by the users. Minimize metadata; do not add analytics, telemetry, third-party assets, hosted fonts, or unapproved network endpoints. Encryption does not protect against malicious app code.
- Medical content is informational, not diagnosis or contraception advice. Never call a day safe or chance zero; display uncertainty and source claims. Use Canadian guidance as selected, but do not create localized P1 content until sources are cited and independently reviewed.
- Use original wording, assets, and implementation. Do not copy Flo content, branding, assets, or proprietary methods. Implement only documented behavior or explicitly labelled, sourced alternatives; do not claim Flo parity or validated clinical accuracy.
- Keep secrets and personal data out of the repository. Follow [security and privacy requirements](docs/plan/security-privacy.md), especially §2, and the dependency/secrets policy in §6.

## Definition of Done

- Meet the assigned brief's acceptance criteria and the linked Definition of Done; run applicable checks and tests that are available and authorized.
- Keep examples and tests synthetic, include evidence for claims, and state unrun or unproven checks plainly. Do not imply phone, medical, privacy, or security proof from documentation or plan review alone.
- Deliver only the brief's owned files, with no secrets or unrelated changes, and use one Conventional Commit per task as the plan requires.
