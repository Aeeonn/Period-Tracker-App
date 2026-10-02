# ADR-0006: Pure, versioned prediction engine; qualitative pregnancy chance

- **Status:** Proposed (Stage C, 2026-10-02; revised in Stage E after the Stage D critique)
- **Context:** Flo's ML formulas are unpublished (R2). Step 3 requires a deterministic, versioned engine that can be backtested. No calibrated personal conception curve exists (R3 §3).
- **Decision:**
  - `runEngine(input, params)` is pure and carries `engineVersion` and `paramsHash`.
  - Prediction method `cycle-stats-v1`: Flo's documented history rules plus a recency-weighted median and a MAD-based window.
  - Fertile window: Flo's 7-day core window plus a luteal-uncertainty band.
  - The prediction range is a rule-of-thumb planning range, not a calibrated interval; the app shows her its observed hit rate after 6 predictions.
  - Backtest targets are set per synthetic scenario (parity within 0.25 day on stable data, better than the plain average after a drift), on scenario parameters frozen before the engine is written. Synthetic results never claim real-world or Flo-equivalent accuracy.
  - An engine upgrade replaces the old version on her device only after at least 6 shadow predictions have resolved.
  - Pregnancy chance is shown as **Lower / Medium / Higher**: never zero, and never a percentage (AP-04). Every state where it cannot be estimated has a named category with fixed text.
  - The calendar luteal default 12–16 is a DESIGN choice; the short-luteal tail it misses is stated, and personal marker evidence can only widen it.
  - Tendencies (A12) are kept separate from fertility, analyse a short metric list and must pass a chance check (target ≤5% false patterns per metric).
- **Consequences:** Results are explainable and comparable between versions. We do not claim exact Flo parity or measured accuracy. Personal accuracy is shown as an on-device track record.
