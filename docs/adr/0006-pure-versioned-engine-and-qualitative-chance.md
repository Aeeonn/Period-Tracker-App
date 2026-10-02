# ADR-0006: Pure, versioned prediction engine; qualitative pregnancy chance

- **Status:** Proposed (Stage C, 2026-10-02)
- **Context:** Flo's ML formulas are unpublished (R2). Step 3 requires a deterministic, versioned engine that can be backtested. No calibrated personal conception curve exists (R3 §3).
- **Decision:**
  - `runEngine(input, params)` is pure and carries `engineVersion` and `paramsHash`.
  - Prediction method `cycle-stats-v1`: Flo's documented history rules plus a recency-weighted median and a MAD-based window.
  - Fertile window: Flo's 7-day core window plus a luteal-uncertainty band.
  - Pregnancy chance is shown as **Lower / Medium / Higher**: never zero, and never a percentage (AP-04).
  - Tendencies (A12) are kept separate from fertility.
- **Consequences:** Results are explainable and comparable between versions. We do not claim exact Flo parity or measured accuracy. Personal accuracy is shown as an on-device track record.
