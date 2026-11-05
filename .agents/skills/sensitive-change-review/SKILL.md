---
name: sensitive-change-review
description: Use when independently reviewing a Flo change in a sensitive area — prediction or medical engine, crypto and keys, lock, pairing/sync, consent and sharing, migrations, backup/restore, delete-all, medical content, CSP/network policy — or when asked for a code, spec, accessibility, privacy or security review of a diff.
---

# Sensitive-change review

Use this checklist to review one change (a commit or diff range) independently. It is used by the [`flo-reviewer`](../../../.github/agents/flo-reviewer.agent.md) agent, and by any agent asked to review.

## Pick the review types

Run every type that the change touches:

| Type                | When                                                   | Check                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code                | Always                                                 | Correctness, edge cases, error paths, types, module contracts in [architecture.md](../../../docs/plan/architecture.md), test quality and determinism                                                                              |
| Spec                | Always                                                 | The change does what its spec, roadmap item or [status.md](../../../docs/status.md) entry says, and nothing it should not                                                                                                         |
| Algorithm           | Engine, dates, predictions, warnings                   | Against [algorithms-spec.md](../../../docs/plan/algorithms-spec.md) and the [`cycle-math`](../cycle-math/SKILL.md) skill                                                                                                          |
| Accessibility       | UI                                                     | Keyboard and focus order, labels, contrast, reduced motion, screen-reader text, touch targets                                                                                                                                     |
| Privacy and consent | Sharing, sync, export, notifications, logs             | [security-privacy.md §2](../../../docs/plan/security-privacy.md#2-consent-and-privacy-rules-testable): off by default, per category, pause/revoke/preview/unpair semantics, desire and mood never imply consent, minimal metadata |
| Security            | Crypto, keys, lock, storage, relay, CSP, network, deps | Key lifecycle, nonce/IV use, no plaintext at rest or in transit, no new endpoints, analytics or third-party assets, pinned approved dependencies, no secrets                                                                      |
| Data safety         | Migrations, backup/restore, import, delete-all         | No silent data loss, round-trips, partial-failure behaviour, honest user messaging                                                                                                                                                |
| Medical content     | Education, warnings, fertility wording                 | Informational only, never "safe" or zero-chance days, uncertainty shown, claims cited, Canadian guidance where selected, original wording                                                                                         |

## Method

1. Read the intent and the governing spec sections **before** the code.
2. For algorithm reviews, derive your own expected outputs (test vectors, boundaries such as day 0/1, cycle length limits, DST-free `LocalDate` arithmetic) from the spec first, then compare them with the code and tests.
3. Read the full diff (`git diff <range>`) and enough surrounding code to judge it.
4. Run the relevant checks yourself: targeted tests, and `npm run check` when feasible. For UI, run the E2E specs that cover it. Never claim a check ran when it did not; say what you could not run and why.
5. Confirm tests would fail without the change where it matters (read them critically or mutate locally in a scratch copy, never in the reviewed tree).
6. Check that all data in tests, fixtures and screenshots is clearly synthetic.

## Verdict

- **FAIL** only for a correctness, security, data-loss, privacy/consent or spec defect.
- **PASS** otherwise. List low-severity issues and nits as follow-ups; they never fail the review.

## Report format

Return this as your final message:

```text
Verdict: PASS | FAIL
Reviewed: <range / SHA>, review types run
Findings (blocking): numbered, each with file:line, why it is a defect, evidence, suggested fix
Follow-ups (non-blocking): numbered, short
Checks run: exact commands and results; checks not run and why
Assumptions: anything inferred about intent or scope
```
