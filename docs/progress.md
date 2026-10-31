# Progress and decisions

This log records approved choices separately from completed evidence and pending permissions. The authoritative plan and execution gates are in [`docs/plan/plan.md`](plan/plan.md), [`task-briefs.md`](plan/task-briefs.md), and [`agent-operating-model.md`](plan/agent-operating-model.md).

## Approved choices

- **2026-10-02 — Plan approval:** retain encrypted backup/restore, joint hosting custody, and Canadian guidance. The approval of plan defaults alone did not authorize infrastructure or operational actions; the separately approved pinned local dependency set is recorded below.
- Canadian guidance is selected, but **Canadian localization is not ready for P1**: content needs cited Canadian sources and independent review first.
- Optional administrative help remains exploratory only. It is not permission to access or edit private data, operate an account, change records, or bypass category consent.

## Completed evidence

- **2026-10-02 — `flo-plan` — main `ccc7be6`:** Stage C planning documents; no separate verify report.
- **2026-10-02 — `flo-plan-fixes` — main `4dba4fa`:** Stage E plan corrections; no separate verify report.
- **2026-10-02 — `p0-agents-skills` — main `8ff2d5e`:** project instructions and reusable skills; no separate verify report. Awaiting `p0-lowrisk-review`.
- **2026-10-05 — `p0-toolchain` — main `821e5a9`:** only the pinned local dependencies approved by `p0-local-install-approval` were installed. Verify: `/home/justi/firstmate/data/p0-toolchain-verify/report.md` (PASS for the exact candidate).
- **2026-10-05 — `p0-feasibility-probe` — main `3e4051c`:** synthetic-only feasibility probe; no separate verify report. Awaiting `p0-lowrisk-review`.
- **2026-10-05 — `p0-contracts` — main `1bc2261`:** verify: `/home/justi/firstmate/data/p0-contracts-verify/report.md` (PASS for the exact candidate; type contracts do not prove runtime behavior).
- **2026-10-05 — `p0-design-tokens` — main `4527268`:** no separate verify report. Awaiting `p0-lowrisk-review`.
- **2026-10-05 — `p0-app-shell` — main `8d81a42`:** task evidence: `/home/justi/firstmate/data/p0-app-shell/report.md`; no separate verify. Awaiting `p0-lowrisk-review`.
- **2026-10-05 — `p0-localdate` — main `1e82364`:** verify: `/home/justi/firstmate/data/p0-localdate-verify/report.md` (PASS for the exact candidate).
- **2026-10-05 — `p0-service-worker` — main `e425742`:** verify: `/home/justi/firstmate/data/p0-service-worker-verify/report.md` (PASS for the exact candidate).
- **2026-10-05 — `p0-synthetic-data` — main `c88a0a2`:** task evidence: `/home/justi/firstmate/data/p0-synthetic-data/report.md`; awaiting `p0-lowrisk-review`.
- **2026-10-28 — `p0-crypto-core` — main `c9535f6`:** landed rebased from reviewed candidate `dc34523` with an identical patch. Verify: `/home/justi/firstmate/data/p0-crypto-core-verify/report.md` (PASS for the reviewed candidate).
- **2026-10-28 — `p0-csp-network` — main `5f4ac35`:** landed rebased from reviewed candidate `768ecac` with an identical patch. Verify: `/home/justi/firstmate/data/p0-csp-network-verify/report.md` (round 1 PASS for the exact candidate; round-0 FAIL preserved at `/home/justi/firstmate/data/p0-csp-network-verify/report-round-0.md`).
- **2026-10-28 — `vscode-agent-ops` — main `98f91fe`:** VS Code Copilot agents, Firstmate-style skills and the repository backlog ([ADR-0011](adr/0011-vscode-copilot-orchestration.md)). Verify: `/home/justi/firstmate/data/vscode-agent-ops-verify/report.md` (round 1 PASS for the exact candidate; round 0 at `report-round-0.md`).
- **2026-10-28 — `p0-app-shell-a11y-fix` — main `efbb10e` and `p0-probe-contrast-fix` — main `d2bb096`:** the two blocking contrast findings of `p0-lowrisk-review`. Round-1 review: `/home/justi/firstmate/data/p0-lowrisk-review/report.md` (PASS for both).
- **2026-10-28 — `p0-db-store` — main `a3e2f36`:** encrypted IndexedDB record store and migrations. Verify: `/home/justi/firstmate/data/p0-db-store-verify/report.md` (PASS for the exact candidate; round 0 at `report-round-0.md`).
- **2026-10-28 — `p0-db-store-followups` — main `1ed3bc4`:** migration-lock and record-change tests. Review: `/home/justi/firstmate/data/p0-db-store-followups-verify/report.md`.
- **2026-10-28 — `ops-worker-cap-10` — main `9ee271f`:** the live-subagent limit is now 10 in the dispatch skill, orchestrator agent, operating model, plan note and ADR-0009/0011. Review: `/home/justi/firstmate/data/ops-worker-cap-10-verify/report.md` (PASS for the exact candidate).
- **2026-10-28 — `p1-episodes` — main `f5920cb`:** engine A1/A3 (bleeding episodes, spotting, assumed days, period length); early start before the Phase 0 gate approved by the captain. Verify: `/home/justi/firstmate/data/p1-episodes-verify/report.md` (round 1 PASS for the exact candidate; round 0 at `report-round-0.md`).
- **2026-10-28 — `p0-lock-contract` — main `9e31c9c`:** LockService key lifecycle, re-authenticated passphrase change and service-enforced recovery-code confirmation ([ADR-0010](adr/0010-lock-service-key-lifecycle.md), Proposed). Verify: `/home/justi/firstmate/data/p0-lock-contract-verify/report.md` (round 4 PASS for the exact candidate under the captain-approved bar; rounds 0–3 kept). Type contracts do not prove runtime behaviour; `p0-lock-verify` tests it.
- **2026-10-28 — `p1-content-core` — main `49429b6`:** 15 core education cards with cited sources (Canadian sources preferred; W-11: 9-8-8 plus 9-1-1) and A17 selection; early start before the Phase 0 gate approved by the captain. Landed rebased from reviewed candidate `e31fab1` with an identical patch. Verify: `/home/justi/firstmate/data/p1-content-core-verify/report.md` (round 2 PASS; rounds 0–1 kept). Not a clinician's review.
- **2026-10-28 — `p0-lock` — main `dc7cc22`:** passphrase setup (10+ characters), 120-bit recovery code with service-enforced confirmation, unlock by passphrase or recovery code, re-authenticated re-wrap-only passphrase change, auto-lock on hide and cold start, and closing open stores on lock; lock screen with a synthetic fixture. Verify: `/home/justi/firstmate/data/p0-lock-verify/report.md` (round 1 PASS for the exact candidate; round 0 FAIL kept). App wiring is `p0-integration`'s. WebKit emulation is not iPhone proof; the hidden-interval clock still needs a real-iPhone check.

## Pending permissions and proof

- The pinned local dependency installation above does not authorize hosting or deployment actions.
- **2026-10-28 — P0 approvals answered (`p0-approvals` closed):** AP-10: one Cloudflare Free-plan account held by the captain (custody option c); the in-app custody disclosure is not required. A scoped deploy token (this account only; Workers scripts, D1 and Pages edit) is approved, held by the captain and stored outside the repository. AP-18: synthetic-only preview deployments, run by deploy crewmates with that token. AP-12: the fallback is manual encrypted export/import only. Production deployment and real data remain separate approvals. The account and token are created by the captain; until then the deploy items wait.
- **2026-10-28:** the captain approved starting `p1-episodes` and `p1-content-core` before the Phase 0 gate, as items independent of P0; no other P1 work starts before the gate.
- **2026-10-28:** the concurrent-worker limit was raised from 3 to 6, then to 10.
- **2026-10-28:** orchestration moved from Firstmate/Pi/Herdr to VS Code Copilot agents and skills, with the backlog in [`docs/plan/backlog.md`](plan/backlog.md) ([ADR-0011](adr/0011-vscode-copilot-orchestration.md)). Pi cannot sign in under the company's Conditional Access policy. Briefs and reports stay in `~/firstmate/data/<id>/`.
- **2026-10-28:** `p0-verifier-sandbox-proof` and its verify task were closed as superseded. Ordinary independent review without the declined extra isolation feature is accepted; verifier isolation is not enforced and no sandbox proof or security PASS is claimed. The evidence branch is preserved, not landed.

## Phase and verification status

- P0 integration, phase verification and demo remain pending; `p0-lowrisk-review` is done except its probe-deploy delta (`p0-lowrisk-review-probe-deploy`). Phase demos and captain approval pauses remain as specified in [plan §14](plan/plan.md#14-roadmap-phases-and-gates) and [agent-operating-model §§8, 10–11](plan/agent-operating-model.md#8-parallelism-and-waves).
- No phone, medical, privacy, or security proof is claimed beyond the scope of the cited verify reports. WebKit emulation is not iPhone proof.
- **2026-10-30 — `p0-integration` candidate:** app shell, lock/store lifecycle, migration ordering and multi-window update coordination are wired in `fm/p0-integration`; the device record is in [device-report.md](feasibility/device-report.md). Task verification and the P0 phase demo remain pending. The brief path typo `docs/architecture.md` was handled at the captain-approved canonical `docs/plan/architecture.md`.
