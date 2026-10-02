# ADR-0007: ACOG pregnancy dating; warning thresholds tied to their source

- **Status:** Proposed (Stage C, 2026-10-02)
- **Context:** Flo's help says "LMP + 41 weeks", while its glossary and ACOG CO700 (reaffirmed 2025) say 280 days (cross-check 12). The bleeding thresholds published by FIGO, ACOG, NHS and the PCOS guideline differ, because each serves a different purpose (cross-check 13).
- **Decision:**
  - Pregnancy dating follows ACOG CO700: LMP + 280 days; IVF uses transfer date + (266 − embryo age); a due date from a clinician always overrides. The app suggests asking about redating but never redates automatically.
  - Each warning rule carries its own source and population. Trigger counts are design choices, flagged for medical audit.
- **Consequences:** This deviates from Flo's help text (AP-05). Medical-safety review is required before merge.
