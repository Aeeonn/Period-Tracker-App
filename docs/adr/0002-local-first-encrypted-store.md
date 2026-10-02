# ADR-0002: Local-first encrypted store on each phone

- **Status:** Proposed (Stage C, 2026-10-02; reviewed in Stage D/E, unchanged)
- **Context:** Health data must stay on storage we control and be encrypted at rest (constitution rules 2–3). The app must be fully usable offline. Home Screen storage can still be evicted or deleted (R4 §2).
- **Decision:**
  - Each phone keeps its full working set in IndexedDB, as AES-GCM-sealed records with HMAC opaque ids.
  - A local master key (LMK) is held in memory only while the app is unlocked.
  - Schema versions are integers. Migrations run with a pre-migration snapshot. A newer schema forces read-only mode, so data is never downgraded.
  - The app calls `persist()` and shows the result.
- **Consequences:** The app is fast and works offline. Durability depends on backups ([ADR-0003](0003-storage-sync-backup-hosting-notifications.md)). Device keys stored as non-extractable CryptoKeys are not LMK-protected; this remaining risk is documented in [security-privacy.md §3](../plan/security-privacy.md#3-encryption-design).
