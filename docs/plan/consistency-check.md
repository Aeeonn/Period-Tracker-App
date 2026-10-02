# Consistency check (Step 11 part 2 — mechanical checks only)

**Status:** re-run in Stage E, 2026-10-02, on the corrected plan (Stage C draft plus the Stage E fixes for the Stage D critique).

This file records the **mechanical** checks run on the plan: their commands and their results. These checks are **not** the Step 11 part 1 plan critique.

- The **Stage D** plan critique (an independent Opus scout) is at `~/firstmate/data/flo-plan-critique/report.md`.
- The **Stage E** fixes for its findings, with the check for each one and what remains, are in [stage-e-resolution.md](stage-e-resolution.md).
- Passing these checks shows the documents agree with each other. It is not a security, medical or device proof, and it is not plan approval.

## How the task files were produced

[task-briefs.md](task-briefs.md) and [backlog-import.md](backlog-import.md) were first generated in Stage C from one task table, so that IDs, dependencies, waves and owned files stay identical in both files. In Stage E a one-off transform script (scratch only, not committed) applied the structural fixes to both files at once: the new deploy and verify items, changed dependencies and owned paths, recomputed waves and the regenerated import script. **The committed Markdown is the source of truth**; later edits change it directly and re-run the checker.

Waves are assigned greedily in topological order under these rules:
- at most 3 crewmates per wave;
- foundation tasks run with no other ship task;
- no two tasks in a wave own overlapping paths;
- no task shares a wave with any of its dependencies.

## The checker

The checker is committed as [tools/check_plan.py](tools/check_plan.py) (Stage D suggestion D-O03). It reads the Markdown planning documents only: it runs no project code, needs only the Python 3 standard library, makes no network calls and writes nothing.

```text
python3 docs/plan/tools/check_plan.py <repo-root>
```

## Checks and results

| # | Check | Command | Result (Stage E, 2026-10-02) |
|---|---|---|---|
| 1 | Research copies are verbatim (body after the 2-line provenance note) | `tail -n +3 docs/plan/research/<file> \| cmp - ~/firstmate/data/<task>/report.md` for all 7 | **identical** ×7; `git diff 894a6f7 -- docs/plan/research` is empty |
| 2 | Only planning docs changed: no application code, prompt, AGENTS.md or dispatch edits | `git status --porcelain`; `git diff --stat 894a6f7` | Only `docs/plan/**` and `docs/adr/**` changed; the one non-Markdown file is the checker `docs/plan/tools/check_plan.py`. `PLANNING_PROMPT.md`, `AGENTS.md`/`CLAUDE.md` and `crew-dispatch.json` untouched |
| 3 | Test-vector arithmetic, old and new | Python `datetime` and `fractions` re-computation in a scratch directory (not committed), implementing A2 exactly as specified | 23/23 pass: TV-D2, TV-D3, TV-P1–P6, TV-F1, TV-F3, TV-X3, TV-Q3, TV-W3, TV-W3b, TV-G1, TV-G3, TV-G4, TV-K1, TV-PM1, TV-A1, TV-A2 (v1 errors [4,4,4,4,0,0], BAVG [4,4,3,3,3,2], MAE 16/6 and 19/6). TV-T1 and TV-T2 descriptive values re-derived; their chance-check p-values were computed by exact enumeration of 21,952 rotation combinations (432/21,952 and 7,427/21,952). Unchanged vectors (TV-P7, TV-P8, A5, TV-B, TV-H, TV-M, TV-X1/X2, TV-T3–T6, TV-G2, TV-K2) were also re-computed by Stage D |
| 4 | All structural and cross-document checks (list below) | `python3 docs/plan/tools/check_plan.py .` | **ALL CHECKS PASSED (0 failures)**, output below |
| 5 | No health-data rows or dataset files in any artefact | `git status --porcelain \| grep -v '\.md$'` | Only `docs/plan/tools/check_plan.py`; the documents contain only synthetic test vectors |
| 6 | Negative control: the extended checker detects the Stage D findings in the uncorrected draft | `git archive 894a6f7 docs \| tar -x -C <tmp>`; `python3 docs/plan/tools/check_plan.py <tmp>` | **33 failures**, covering D-C02 (X6), D-C01/D-M01/D-M02/D-M04/D-M07/D-C03 wording (X7), D-M06 (X11), D-M11 (X12), D-M12 (X1, X3, X4), D-M13 (X5) and the missing resolution record (X9); so the passing result above is not vacuous |

### Checker output

```text
NOTES
 - matrix: 74 Flo groups, 20 Beyond-Flo; Flo decisions {'Replicate': 25, 'Adapt': 34, 'Replace': 8, 'Not applicable': 5, 'Not feasible on iOS web': 2}
 - plan.md sections: 18
 - backlog items: 98 ({'gate': 5, 'scout': 40, 'ship': 53})
 - waves: 46; max workers per wave 3
 - features with P0–P2 implementing tasks: 43
 - enforcement rows: 27; consent rules: 21
 - relative links checked: 352
 - X1 acceptance paths checked: 22
 - X3 catalogue tests: 64; later-phase only: ['T-ENG-02', 'T-ENG-05']
 - X4 roadmap phases with feature lists: P0=1, P1=26, P2=18, P3=14, P4=18, P5=14, P6=0, P7=1
 - X8 approval rows: 27 (+AP-02/AP-03 grouped tables)
 - X12 P1 warning rules ['W-01', 'W-02', 'W-03', 'W-04', 'W-05', 'W-06', 'W-07', 'W-11']; vectors cover ['W-01', 'W-02', 'W-03', 'W-04', 'W-05', 'W-06', 'W-07', 'W-11']
ALL CHECKS PASSED 0
```

What the checker verifies, in plain words. **C1–C13** are the Stage C checks, kept unchanged in substance; **X1–X12** were added in Stage E for the Stage D findings.

1. **C1 Feature matrix.** Each row has an ID, a tier, inputs and outputs, an allowed decision, a justification, a MoSCoW priority and a phase. The 2026 perimenopause leads are present.
2. **C2 Approval list.** [plan.md §18](plan.md#18-open-questions-and-items-needing-approval) contains every non-Replicate Flo feature and every Beyond-Flo Add; the AP-02 rows match the matrix exactly; the §5 counts match.
3. **C3 plan.md structure.** Exactly the 18 required sections, in order.
4. **C4 Backlog fields.** All 13 fields on every item; ship tasks own files, scouts and gates own none; every high-risk ship task has a `-verify` item; no task consumes a high-risk ship task before its verify.
5. **C5 Dependency graph.** Acyclic; import order topological; every P0 item depends on `flo-plan-approval`; every item is upstream of its phase gate; every P1/P2 item depends on the previous gate.
6. **C6 Waves.** At most 3 workers per wave, no owned-file overlap within a wave, no same-wave or out-of-order dependencies, and the waves table matches the item fields.
7. **C7 Briefs.** One brief per item, each with Given/When/Then and a route, commands for every ship task, and a header wave, "Depends on" and "Owns" identical to the backlog.
8. **C8 Feature coverage.** Every P0–P2 feature maps to an implementing ship task and a task with tests.
9. **C9 Test catalogue.** Every test ID in the backlog exists in [test-strategy.md §2](test-strategy.md#2-test-catalogue-ids-referenced-by-the-plan).
10. **C10 Consent rules.** All 21 consent rules have enforcement and an assigned test.
11. **C11 Enforcement matrix.** Every Section 3 and Section 4 rule has an enforcement mechanism and a check.
12. **C12 Links.** Every relative Markdown link and anchor resolves.
13. **C13 Wording.** No unqualified "safe day" outside the research copies.
14. **X1 Acceptance-file ownership and ancestry.** Every repository path named in a brief's acceptance criteria is owned by that task or one of its transitive dependencies (D-M12).
15. **X2 Ownership across unordered tasks.** No two ship tasks without a dependency path between them own overlapping paths, which is stronger than the per-wave rule (D-M12).
16. **X3 Test assignment.** Every catalogue test is assigned to a P0–P2 item, except T-ENG-02 and T-ENG-05, whose catalogue rows name their later phase (D-M12, T-SEC-06).
17. **X4 Feature/phase coverage.** Every matrix phase of a feature appears in that phase's roadmap feature list (D-M12: F-003, F-061).
18. **X5 Hold timing.** The import script holds only `p0-approvals`; every other gate has a "hold when actionable" command in the import procedure, and the roadmap states the timing (D-M13).
19. **X6 Deploy traceability.** Each `gate-phase-N` has an ancestor deploy item producing `docs/deploy/pN-demo.md`; `p0-device-feasibility` has the probe deploy and the live push-test spike upstream; no brief deletes the spike before the probe (D-C02).
20. **X7 Forbidden or re-opened wording.** No first-mate test execution, no re-opened repository mode, no wording that presents BBT as proof of ovulation, no "None" residual for T1, no first-mate-written verifier reports, no typed pairing-code fallback (the exact patterns are in the checker source) (D-C01, D-M01, D-M02, D-M04, D-C03, D-M07).
21. **X8 Approval list integrity.** AP-01…AP-29 each appear exactly once (AP-02/AP-03 as grouped tables), with no references to unknown approval IDs.
22. **X9 Resolution record.** [stage-e-resolution.md](stage-e-resolution.md) has a complete row for each of D-C01…D-C03 and D-M01…D-M14.
23. **X10 Counts.** plan.md §15 and the backlog-import header match the parsed backlog.
24. **X11 Chance categories.** Every named A4 suppression reason has an A5 category row, none of which is zero, none or safe (D-M06).
25. **X12 Warning vectors.** Every W-rule implemented in P1 has at least one TV-W vector (D-M11).

## Prompt §8 quality checklist — status after Stage E

| Checklist item | Status | Evidence |
|---|---|---|
| Every Flo feature in the matrix with a decision; deviations justified and listed for approval | Mechanically checked | C1–C2 |
| Beyond-Flo candidates scored and marked Add/Backlog/Reject | Mechanically checked; plan-scored rows now named consistently (D-O06) | Matrix Beyond table |
| Every computation states Flo-documented vs substitute, with citations, edge cases and test vectors | Stage D gaps fixed: luteal default relabelled DESIGN with its excluded tail, named suppression categories, symptothermal cross-check, P1 warning vectors, A12 chance check, per-scenario backtest targets (D-M05, D-M06, D-M09, D-M10, D-M11). **Still needs the Opus algorithm and medical audits in each phase** | algorithms-spec.md; X11, X12; check 3 |
| Every consent rule enforced by encryption/separation and has a test | Mechanically checked; his backups now excluded from holding her data (D-M08). The infrastructure-operator channel (T13) **cannot** be enforced by encryption; it is disclosed and minimised, with a custody choice (AP-10). **Tests not yet written or run** | C10; security-privacy T13, PR-07, PR-08 |
| No screen, insight or notification implies safe days or birth control | Design rule, copy lint and T-UX-04 planned; every suppression state now has fixed text (D-M06); wording scan passed | C13, X11; ux-spec §6–7 |
| Storage/sync decision has scored options, a plain-language recommendation and a tested plan for pairing, backup, restore and recovery | Pairing redesigned as commit-then-reveal with attacker-aware tests (D-M07); preview/production split and deploy items added (D-C02). Tests planned, **not executed** | storage-sync-decision.md, architecture.md §4.2, T-PAIR-02, T-BAK-04 |
| Every privacy and security rule has an automated check or a named review step | Mechanically checked; T-SEC-06 now assigned; PR-07/PR-08 and T-SEC-08 added (D-M12, D-M14, D-C03) | C11, X3 |
| P0–P2 tasks small and self-contained, with owned files, criteria, commands and risk; graph acyclic; waves disjoint; ready to load | Mechanically checked, including acceptance-file ancestry and unordered-overlap (X1, X2). Splitting the largest tasks (D-O02) was not done; see the resolution record | C4–C7, X1, X2 |
| Every phase ends with a gate, a verification report and a demo | Mechanically checked for P0–P2, now including a deploy item that produces each demo URL (X6); P3–P7 in roadmap.md | C5, X6, roadmap.md |
| Research ran on Sol or a documented Luna override; every execution role has a recorded model with high or above | Research: all scout reports record `gpt-6.1-sol` high. Roles: every item has a route | R1–R6 and cross-check method sections; backlog `route` |
| Operating model covers routing priority, escalation after 2 failed rounds, Opus verify before high-risk merge, and that model changes don't reset the 3-round limit | Drafted; landing now through Firstmate's guarded local path with per-landing merge authority (D-M03) | agent-operating-model.md §2–5 |
| Phase 0 includes disposable-fixture verification of verifier safeguards, with gaps recorded as blockers | Planned with the exact Firstmate supervision paths (D-M01); interim options never use the first mate to run tests (D-C01); **not run**; FB-08 defined | agent-operating-model.md §6 |
| Nothing depends on paid services, an always-on server or a cloud AI | Drafted; the hard-$0 claim is **pending FB-01/FB-09** | storage-sync-decision.md §3 |
| Nothing copies Flo's content or branding | Planned (original content, placeholder name with a trademark note, fact-check plus originality review); not mechanically checkable | ux-spec.md §8, AP-20 |
| A non-expert can follow the executive summary and glossary | Executive summary and glossary rewritten for the Stage D points (operator disclosure, preview vs real use, chance patterns, BBT and ovulation wording); still a judgement | plan.md §1–2 |
