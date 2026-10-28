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

## Pending permissions and proof

- The pinned local dependency installation above does not authorize hosting or deployment actions. The hosting account and scoped credential (AP-10), synthetic preview deployment and related actions (AP-18) remain pending.
- **2026-10-28:** the concurrent-worker limit was raised from 3 to 6.
- **2026-10-28:** orchestration moved from Firstmate/Pi/Herdr to VS Code Copilot agents and skills, with the backlog in [`docs/plan/backlog.md`](plan/backlog.md) ([ADR-0011](adr/0011-vscode-copilot-orchestration.md)). Pi cannot sign in under the company's Conditional Access policy. Briefs and reports stay in `~/firstmate/data/<id>/`.
- **2026-10-28:** `p0-verifier-sandbox-proof` and its verify task were closed as superseded. Ordinary independent review without the declined extra isolation feature is accepted; verifier isolation is not enforced and no sandbox proof or security PASS is claimed. The evidence branch is preserved, not landed.

## Phase and verification status

- P0 integration, phase verification, demo, and `p0-lowrisk-review` remain pending. Phase demos and captain approval pauses remain as specified in [plan §14](plan/plan.md#14-roadmap-phases-and-gates) and [agent-operating-model §§8, 10–11](plan/agent-operating-model.md#8-parallelism-and-waves).
- No phone, medical, privacy, or security proof is claimed beyond the scope of the cited verify reports. WebKit emulation is not iPhone proof.
