# ADR-0004: Key hierarchy, per-category sharing keys and revocation

- **Status:** Proposed (Stage C, 2026-10-02)
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
- **Consequences:** His phone cannot decrypt anything she has not shared, and future data stays protected after a revoke. Already-seen data cannot be unseen, and the app says so. A PIN is not offered (AP-07).
