# ADR-0004: Key hierarchy, per-category sharing keys and revocation

- **Status:** Proposed (Stage C, 2026-10-02; revised in Stage E after the Stage D critique)
- **Context:** Constitution rule 1 requires that consent is enforced by encryption and data separation, not by hiding things in the UI.
- **Decision:**
  - **Unlock keys.** A passphrase (PBKDF2 600k), a recovery code (HKDF) and an optional passkey PRF (HKDF) each wrap the LMK.
  - **Keys under the LMK:**
    - PDK, for her private records;
    - per-category, per-epoch keys CK_{c,e} for *projections* only;
    - a couple key CPK_e;
    - the identity keys.
  - **Sharing a category.** The category key is wrapped to his device using ECDH-ES (P-256) and signed by her device.
  - **Pause** stops publishing; **revoke** rotates the epoch and deletes old slots.
  - Several things have **no share category in v1**: raw records, notes, sex logs, tests and warnings.
  - **Pairing** uses a commit-then-reveal exchange: her first QR code commits to a nonce and carries no secret, his reply carries his keys and nonce, and only then does her phone reveal its nonce; both phones show a 6-digit code over the whole transcript. A planner design using the standard short-authentication-string pattern, to be audited, not a formal proof ([architecture.md §4.2](../plan/architecture.md#42-pairing-in-person)).
  - **His backups and exports** exclude her projections and every category or couple key, so a revoke or unpair is not undone by restoring an old backup of his phone.
- **Consequences:** His phone cannot decrypt anything she has not shared, and future data stays protected after a revoke, as long as the app code she runs is genuine (threats T6 and T13). Already-seen data cannot be unseen, and the app says so. Restoring his phone means pairing again in person. A PIN is not offered (AP-07).
