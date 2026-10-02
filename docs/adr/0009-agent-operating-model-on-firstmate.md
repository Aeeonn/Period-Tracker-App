# ADR-0009: Agent operating model on Firstmate (no second orchestrator)

- **Status:** Proposed (Stage C, 2026-10-02)
- **Context:** The prompt's Step 9. Firstmate already supplies orchestration, worktrees, supervision and the backlog. `~/firstmate/config/crew-dispatch.json` is the routing source of truth.
- **Decision:**
  - **Roles.** The first mate orchestrates. Ship crewmates implement. Independent scout verifiers review the exact revision. Verifiers never edit source.
  - **Routing priority:** Opus high-risk verification → Opus design/extensive/escalated work → Sol research → Luna bounded high-risk implementation (required Opus verify) → Luna routine work. High thinking is the minimum.
  - **Fix rounds.** Escalate to Opus after 2 documented failed fix rounds. After 3 rounds, stop and block. Changing the model does not reset the count.
  - **Parallelism.** At most 3 workers. Foundation tasks run one at a time. Integration runs after each wave. Gates are captain holds.
  - **Verifier safeguards** are proven on a disposable fixture in Phase 0. If they cannot be enforced, that is recorded as FB-08 and read-only enforcement is not claimed.
- **Consequences:** No new tooling. The policy is enforced by the first mate's discipline plus backlog dependencies, not by the JSON file. Credit costs must be validated against measured use.
