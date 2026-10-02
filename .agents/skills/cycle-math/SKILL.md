---
name: cycle-math
description: Use when implementing, reviewing, or testing cycle calculations, dates, predictions, or uncertainty in Flo.
---

# Cycle-math reference

Before changing cycle calculations, read [`docs/plan/algorithms-spec.md`](../../../docs/plan/algorithms-spec.md), including the pure versioned engine contract, A0 LocalDate model, and the applicable algorithm and test vectors. That document is authoritative; this skill intentionally contains **no copied formulas or vectors**.

- Keep the engine pure, deterministic, and versioned: inputs include the caller-provided `today`; calculations do not read clocks, randomness, locale, or browser state. Use the specified `LocalDate` engine for calendar arithmetic; never construct a `Date` from a `LocalDate`.
- Preserve source labels for claims and choices (`FLO-DOC`, `EVID`, `DESIGN`) and cite the source or rationale. Do not infer undisclosed Flo formulas, reuse Flo assets/content, or claim Flo-equivalent accuracy.
- Treat prediction ranges as source-labelled uncertainty, not calibrated probability intervals. Preserve every required suppression and uncertainty state; never call a day safe or pregnancy chance zero. Medical rules remain informational, not diagnosis.
- Derive expected vector results independently from the spec before reading implementation. Test only with synthetic fixtures; never use real health records or public health datasets unless separately approved.
- Follow consent and privacy separation: desire and personal tendencies are not fertility estimates or consent. See [`security-privacy.md` §2](../../../docs/plan/security-privacy.md#2-consent-and-privacy-rules-testable).
