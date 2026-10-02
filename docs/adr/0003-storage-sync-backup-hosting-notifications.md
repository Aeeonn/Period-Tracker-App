# ADR-0003: Storage, sync, backup, hosting and notifications

- **Status:** Proposed (Stage C, 2026-10-02). Depends on Phase 0 feasibility blockers FB-01, FB-02, FB-06 and FB-09.
- **Context:** Step 5 constraints: $0, no always-on server, no user accounts, ciphertext only off the phones, easy to move away. Evidence: R5 and R4, as checked by the cross-check.
- **Decision** (weighted matrix in [storage-sync-decision.md §2](../plan/storage-sync-decision.md#2-weighted-decision-matrix); recommended combination 1 + 3, scoring 415/500):
  - Local-first storage on each phone.
  - Sync through a ciphertext-only mailbox on Cloudflare Workers + D1 (Free plan, no R2), using signed device requests and opaque slot ids.
  - Encrypted backup files to Files or iCloud Drive, with reminders and restore tests. An encrypted relay backup is available as an opt-in.
  - Manual `.flosync` exchange as a first-class fallback.
  - App hosted as static files on Cloudflare Pages with `_headers`.
  - Generic daily Web Push from a cron job, with details shown only after unlock.
- **Rejected:**
  - Supabase/Firebase: anonymous auth creates accounts, the free tiers pause or require Blaze, and terms eligibility is unclear.
  - Peer-to-peer: no asynchronous delivery.
  - Home server: not allowed.
  - CloudKit JS: requires US$99/year.
  - GitHub Pages: requires public source and cannot set headers.
- **Fallbacks:** If FB-01 or FB-02 fail, use manual exchange alone, or the GitHub data-repo transport with an account per person (AP-12). If push fails, use in-app reminders only.
- **Open:** Retaining the encrypted backup feature itself is AP-01. It is retained by default until the captain decides.
