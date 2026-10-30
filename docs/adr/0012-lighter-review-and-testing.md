# ADR-0012: Lighter review and testing

- **Status:** Accepted (captain decision, 2026-10-30).
- **Context:** Several P0/P1 items needed multiple review rounds. `p0-lock-contract` took five rounds, including a FAIL for a low-severity type-only issue; the relay spike also incurred repeated approvals and renewed reviews after rebases. The per-task full test burden slowed delivery.
- **Decision:**
  - Reserve a dedicated Opus `<task>-verify` for prediction/medical engine algorithms, crypto and keys, pairing and sync merge, consent enforcement, migrations and backup/restore, and medical content. Relay glue, CSP/header tweaks, settings, UI, docs and preview deploys use builder gates plus one batched rule-5 Luna review per wave.
  - A review FAILs only for correctness, security, data-loss or spec defects. Low-severity issues and nits go on a follow-up list and never fail the gate.
  - After a FAIL, re-review only finding closure and adjacent regressions; low-severity closure may use the cheaper model. Reuse builder evidence for the same SHA.
  - A patch-identical rebase that passes its tests lands without a new review, even if `main` touched the same files.
  - Builders run targeted tests while working and `npm run check` once at the end. Full e2e, the TZ matrix and coverage run at phase integration and the phase gate; only e2e subsets named in a brief run per task.
  - Security-sensitive changes land automatically when required review passes for the exact SHA. Synthetic-only previews/redeploys from reviewed landed `main` run without per-deploy approval. Production, real data, accounts/credentials, money and phase gates remain captain decisions.
- **Trade-off:** Fewer repeated reviews and broader checks on each task reduce turnaround time but increase the chance that a subtle low-severity or cross-task issue waits for the wave or phase gate. Narrow deep reviews, builder evidence and strict integration/phase gates retain the principal correctness and safety checks.
