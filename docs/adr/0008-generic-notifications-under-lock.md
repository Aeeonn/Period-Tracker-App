# ADR-0008: Generic notifications while locked

- **Status:** Proposed (Stage C, 2026-10-02)
- **Context:** iOS Web Push must always show a visible notification and allows no silent push (R4 §3). A locked app's service worker has no decryption key. Empty payloads still leak timing (R5 N1–N4).
- **Decision:**
  - At most one generic daily push, at a fixed time she chooses, with fixed text.
  - Details appear only inside the unlocked app.
  - Partner notifications follow the same pattern and cover only shared categories.
  - Event push for support cards is opt-in by her.
  - No plaintext health cache is kept for notifications.
  - `.ics` export is backlog-only and content-free.
- **Consequences:** No health-derived timing leaks, and nothing sensitive appears on the lock screen. Reminders are less specific until she unlocks the app. Exact delivery time is not guaranteed.
