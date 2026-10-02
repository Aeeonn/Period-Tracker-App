# ADR-0009: Agent operating model on Firstmate (no second orchestrator)

- **Status:** Proposed (Stage C, 2026-10-02; revised in Stage E after the Stage D critique)
- **Context:** The prompt's Step 9. Firstmate already supplies orchestration, worktrees, supervision and the backlog. `~/firstmate/config/crew-dispatch.json` is the routing source of truth.
- **Decision:**
  - **Roles.** The first mate orchestrates. Ship crewmates implement. Independent scout verifiers review the exact revision. Verifiers never edit source.
  - **Routing priority:** Opus high-risk verification → Opus design/extensive/escalated work → Sol research → Luna bounded high-risk implementation (required Opus verify) → Luna routine work. High thinking is the minimum.
  - **Fix rounds.** Escalate to Opus after 2 documented failed fix rounds. After 3 rounds, stop and block. Changing the model does not reset the count.
  - **Parallelism.** At most 3 workers. Foundation tasks run one at a time. Gates are captain holds, set when they become actionable; only `p0-approvals` is held at import.
  - **Landing.** The project is registered `local-only` (settled). Crewmates never merge; the first mate lands each ready branch with `bin/fm-merge-local.sh` after its required verify passes and the merge authority approves (`yolo` off: the captain approves each landing; security-sensitive landings escalate even with `yolo` on). Dependents start only from landed work.
  - **Integration cadence** is continuous at every landing, plus one integration task and one low-risk review per phase: a justified deviation from "after each wave", listed for approval in AP-17.
  - **Tests** run only in crewmates. The first mate never runs project code.
  - **Verifier safeguards** are proven on a disposable fixture in Phase 0, using a bash sandbox that keeps Firstmate's status, inbox and report paths writable. If they cannot be enforced, that is recorded as FB-08, read-only enforcement is not claimed, and high-risk landings wait for the captain's AP-16 interim choice.
- **Consequences:** No new tooling. The policy is enforced by the first mate's discipline plus backlog dependencies, not by the JSON file. Credit costs must be validated against measured use.
