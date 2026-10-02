# ADR-0005: Single-writer records, HLC last-writer-wins and conflict copies

- **Status:** Proposed (Stage C, 2026-10-02; reviewed in Stage D/E, unchanged)
- **Context:** Both phones write, and sync must never silently lose edits (constitution rule 6). CRDTs would add complexity that this two-person app does not need.
- **Decision:**
  - Every record has exactly one author device. Her flags on couple entries are separate records that she writes.
  - Merges use a hybrid logical clock (HLC) with last-writer-wins.
  - Deletions use tombstones, kept for at least 180 days.
  - When two edits are truly concurrent, the losing version is kept as a visible conflict copy for 30 days.
  - Projections are replace-in-place snapshots. Couple entries and control messages go in an append log.
- **Consequences:** Conflicts are rare and easy to reason about, and the property tests are tractable. A device that stays offline longer than the tombstone horizon has to do a full resync.
