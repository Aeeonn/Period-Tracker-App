# Storage, sync, backup, hosting and notifications decision (Step 5)

**Status:** Stage E revision, 2026-10-02 (Stage C draft corrected after the Stage D critique; see [stage-e-resolution.md](stage-e-resolution.md)). Recorded as [ADR-0003](../adr/0003-storage-sync-backup-hosting-notifications.md). Provider facts come from [R5](research/R5-storage-sync-hosting.md) and platform facts from [R4](research/R4-ios-pwa-capabilities.md), both checked by the [cross-check](research/crosscheck-stage-b.md) §4–5. Provider plan numbers are what the providers publish. They are **not** a guarantee of $0 (cross-check 24).

## 1. Plain-language recommendation

Each phone keeps its own encrypted copy of the data. The app works fully offline.

**Day-to-day sync** goes through a tiny "mailbox" program on Cloudflare's free tier: a Worker with a D1 database. The mailbox only ever sees scrambled (encrypted) data. Her phone posts the encrypted summaries she chose to share. His phone fetches them. Both phones post and fetch encrypted couple entries.

**Backup** is separate. She saves an encrypted backup file to Files or iCloud Drive, and the app reminds her to do it. She can also turn on an extra encrypted copy kept in the mailbox. If Cloudflare ever stops working for us, nothing is lost. Each phone still has all its data, and the two phones can swap encrypted files with AirDrop instead. That manual exchange is built in from the start.

The **app itself** is hosted as static files on Cloudflare Pages. Pages lets us set strict security headers and keep the code repository private or local-only.

**Reminders** come as a generic daily notification at a time she picks, such as "Time for your check-in". The specific reminder appears inside the app after she unlocks it. A locked app cannot read its own encrypted data, and generic text also hides health details from the lock screen.

**Who runs the mailbox and the website.** One person must hold the Cloudflare account. Whoever holds it can see *when* the phones talk to the mailbox and roughly from where, and could change the app's code. They still cannot read the encrypted contents unless they change the code. If that person is him, he gains that view of her, so the plan asks the captain to choose who holds the account (AP-10: her, both together, or him with this disclosure shown to her in the app). [security-privacy.md T13](security-privacy.md#1-threat-model) states the remaining risk honestly.

**Preview first, real use later.** Until the production deploy at P6 (AP-29), every deployed copy is a *preview* that holds synthetic data only. Real day-to-day use starts only after that separate, concrete approval.

## 2. Weighted decision matrix

**Weights** (sum 100):

| Criterion | Weight |
|---|---|
| Privacy | 25 |
| Persistence and durability | 15 |
| Effort to build and maintain | 15 |
| Availability anywhere and offline | 15 |
| Attack surface | 10 |
| Cost | 10 |
| Export and switch-away | 10 |

Cost is also a **hard gate**: anything that can incur a charge or needs payment is excluded.

**Scores** are 1–5, where 5 is best. They are DESIGN judgements based on R5 evidence, with medium confidence.

| Option | Privacy | Durability | Effort | Availability | Attack surface | Cost | Export | **Weighted /500** | Gates |
|---|---|---|---|---|---|---|---|---|---|
| 1. Local-first + encrypted manual exchange/backups (AirDrop, Files/iCloud Drive) | 5 | 3 | 4 | 2 | 5 | 5 | 5 | **410** | Pass. But he only sees updates when she sends a file (fails the "usable sync" goal) |
| 2. Local-first + separate private GitHub data repo through the API (fine-grained token) | 3 | 4 | 3 | 4 | 2 | 5 | 5 | **360** | Pass, with caveats: the token gives write access to the whole repo; history keeps ciphertext; GitHub forbids shared logins (R5 G6), so each person needs their own GitHub account with repo access |
| 3. Local-first + Cloudflare Workers + D1 (no R2) | 4 | 4 | 3 | 5 | 3 | 4 | 4 | **390** | Pass, **pending FB-01/FB-02** (no-charge setup, CPU limits) |
| 4. Local-first + Supabase or Firebase | 3 | 2 | 3 | 3 | 3 | 4 | 4 | **305** | **Fails "no accounts"** (anonymous auth creates user accounts, R5 S5/F5). Supabase pauses after 7 inactive days; Firebase Storage needs Blaze; terms eligibility unclear |
| 5. Peer-to-peer (WebRTC) | 4 | 2 | 2 | 1 | 3 | 3 | 4 | **275** | Both phones must be online at once; needs signalling; free TURN not verified |
| 6a. Self-hosting at home | — | — | — | — | — | — | — | excluded | Violates "no always-on home server" |
| 6b. CloudKit JS | — | — | — | — | — | — | — | excluded | Needs the paid Apple Developer Program, US$99/year (R5 M4) |
| **Recommended: 1 + 3 combined** | 4 | 5 | 3 | 5 | 3 | 4 | 5 | **415** | Pass, pending FB-01/FB-02. Manual mode is the built-in fallback |
| Alternative: 1 + 2 combined | 3 | 5 | 3 | 4 | 2 | 5 | 5 | 375 | Fallback if Cloudflare fails Phase 0 |

**Reading the result.** The recommended combination (415) only narrowly beats manual-only (410). Manual-only wins on privacy but cannot give him timely updates. That is why manual exchange stays a **first-class, always-available mode**, not just an emergency path. If the privacy weight rose above about 30 with the other weights unchanged, manual-only would win (DESIGN sensitivity note; option 1 scores 1 point higher on privacy, so each extra weight point adds 1 to its lead, and it starts 5 points behind). The approval list asks the captain to confirm the trade-off (AP-11).

## 3. Hard limits ($0, no user accounts) and fallback paths

| Limit | How the design meets it | What could break it, and the fallback |
|---|---|---|
| $0 recurring | Workers Free + D1 Free + Pages Free. No R2 (it needs a metered subscription, R5 C6). D1/KV over-limit operations **fail** rather than bill (R5 C3–C4) | **FB-01:** Phase 0 must show the Cloudflare account works with **no payment method**, that the plan shows "Free", and that no paid product is enabled. If not → fallback: option 1, plus the optional option 2 transport (AP-12) |
| No accounts for the two users | Device keys only. The relay knows opaque ids. The only setup step is a one-time enrollment secret | None for users. **One infrastructure account** (Cloudflare) is needed; who holds it is a custody choice in AP-10 (her-owned, joint, or captain-owned with disclosure), and the holder is the operator in threat T13 |
| Ciphertext only off the phones | All bodies are sealed with AES-GCM before upload. Slot and record ids are HMAC values | Metadata still leaks (§7) |
| Move away easily | Same envelope format for relay and file transports. `wrangler d1 export` dump. Full local copies on both phones | Swap the transport (`SyncTransport` interface) |
| Free-tier quotas | Estimated use is <100 writes/day and <50 MB/year, far under D1's 100,000 writes/day and 5 GB (I-M estimate, to measure) | On quota errors, writes queue locally and retry the next day |
| Worker CPU 10 ms/request (R5 C1) | Requests do one ECDSA verification plus a D1 query | **FB-02:** measure on Free. If over the limit → batch requests, or fall back as above |
| Provider terms may change or end service (R5 C8) | Not depended on for durability: phones plus backup files remain authoritative | Export, then switch transport |

## 4. Pairing, key exchange, revocation and unpairing (summary; full design in [security-privacy.md §3](security-privacy.md#3-encryption-design))

- **Pairing** happens in person. Her phone shows a code that commits to a secret number, his phone answers with its own, her phone then reveals hers, and both people compare a 6-digit safety code ([architecture.md §4.2](architecture.md#42-pairing-in-person)). The fallback when a camera cannot scan is AirDropping the same three payloads as files.
- **Per-category encryption.** Each share category c has its own key CK_{c,e}, where e is the "epoch" (key version). A category key is wrapped to his device **only while she has that category on**. His phone holds no key for anything she has not shared, so it cannot decrypt it.
- **Pause** stops publishing new projections immediately. His phone keeps the old projection, labelled "paused" (it was already seen). There is no key change, so resuming is instant.
- **Revoke** (a category, or everything):
  1. Her phone creates epoch e+1 and does not wrap it to him.
  2. It deletes the relay slots for epochs ≤ e.
  3. It sends a signed instruction asking his phone to delete its local copies.

  His phone obeys if it is running genuine app code. The app says plainly: **"He may already have seen this. Revoking stops future sharing; it cannot make him unsee or forget it, or remove screenshots."**
- **Unpair** can be done by either person:
  - If she unpairs: she revokes everything, rotates the couple key, removes his device from the relay space, and sends a signed unpair message.
  - If he unpairs: his phone deletes her shared projections and sends a signed unpair message. Her phone then rotates the keys.
  - **Couple entries (proposed default, AP-08):** each phone keeps the couple entries its owner wrote and deletes the other person's entries. Before unpairing, either person can export the whole couple space, since both could already read it.

## 5. Relay protocol summary

The relay is a Cloudflare Worker with a D1 database. CORS allows only the app origin. Nothing is logged: Workers logs/observability, Logpush and tail consumers stay off, the code never reads the client IP or location fields, and cursors (`since=`, `after=`) are increasing sequence numbers rather than timestamps ([security-privacy.md PR-07](security-privacy.md#2-consent-and-privacy-rules-testable), T-RELAY-02). This minimises what is kept; it does not stop the account owner from switching logging back on or tailing live requests (T13).

| Endpoint | Who | Purpose |
|---|---|---|
| `POST /v1/spaces` | Her device, with the enrollment secret | Create a space: owner identity public key plus device certificate |
| `POST /v1/spaces/:id/devices` / `DELETE …/devices/:dev` | Owner-signed / owner or self | Add his device / remove a device |
| `PUT/DELETE /v1/spaces/:id/slots/:slot`, `GET …/slots?since=` | Write: owner devices; read: members | Replace-in-place projection snapshots. One opaque slot per category; version only increases |
| `POST /v1/spaces/:id/log`, `GET …/log?after=`, `DELETE …/log/:seq` | Members (delete: author or owner compaction) | Couple entries and control messages (sealed envelopes ≤64 KB) |
| `PUT/DELETE /v1/spaces/:id/push/:dev` | That device | Web Push subscription plus `{tz: IANA, time: "HH:MM", enabled}` |
| `PUT/GET/DELETE /v1/spaces/:id/backup/:dev` | That device | **Opt-in** encrypted backup chunks (≤1.5 MB each, under D1's 2 MB row limit) |
| `DELETE /v1/spaces/:id` | Owner-signed | Delete everything for the space |

**Authentication.** The header is `Sig: deviceId, ts, nonce, ECDSA-P256-SHA256(method|path|ts|nonce|SHA-256(body))`. The relay checks:
- the device is a member of the space;
- the timestamp is within ±300 s;
- the nonce has not been seen before (nonce table with a 10-minute TTL);
- the role is allowed to call this endpoint.

**Scheduled job.** A cron trigger runs every 15 minutes. It sends **empty-payload** pushes (or declarative pushes with fixed generic text) to subscriptions whose local time falls in the current window. The VAPID private key is a Worker secret. It is a push signing credential, not a health-data key (AP-10).

## 6. iOS data-loss risks and how the design survives them

| Risk (source) | Survives via |
|---|---|
| Storage eviction under pressure or inactivity (R4 §2) | `persist()` request and status display. Encrypted backup file with reminders. Optional relay backup. His phone holds shared projections, but not her private data |
| She deletes the Home Screen app, or clears Safari website data (exact behaviour **untested**, R4 §2) | Treated as total local loss → restore from the backup file or relay backup. Onboarding warns about this |
| Data started in a Safari tab does not move into the Home Screen app (R4 S19) | Install-first onboarding; encrypted export/import if needed |
| IndexedDB bugs (R4 T4/T5) or an iOS update problem | Pre-migration snapshots. Read-back verification after backup. Restore test. Conflict copies |
| Phone lost, stolen or broken | Local data stays encrypted under her passphrase. New phone → restore backup → owner identity key re-certifies the new device → remove the old device from the relay → re-wrap category keys to him |
| Forgotten passphrase | Passkey unlock (if set up) **or** recovery code. If both are lost, her data is unrecoverable by design, and this is stated at setup |
| Relay unavailable, quota hit, or provider ends service | Local copies; outbox retries; manual `.flosync` exchange; backup files |

## 7. Key management, recovery and backup routine

- **Recovery code.** Created at setup: 120 random bits, shown once as 24 grouped characters. It wraps the LMK and the backup content key. She keeps it offline, for example on paper or in a password manager.
- **Backup file** (`.flobak`):
  - format: header with format version, KDF params, salts and wrapped content key, followed by AES-GCM-sealed chunks of the full record set plus the schema version;
  - opens with the passphrase **or** the recovery code;
  - exported through the share sheet or a download, to Files or iCloud Drive;
  - iCloud sees only ciphertext plus the file name, size and time (R5 M2), so the file name is neutral, e.g. `backup-2026-10-02.flobak`.
- **Frequency.**
  - An in-app reminder appears weekly if anything has changed since the last backup.
  - After 14 days without a backup, a persistent banner shows.
  - A monthly prompt runs a **restore test**: the app decrypts the latest file into memory, checks record counts and the checksum, and writes nothing.
  - The opt-in relay backup runs daily while she is unlocked and online.
- **His phone.** Same mechanisms, with a narrower content list. His backup holds only his identity, his settings and the couple entries **he** wrote. It never holds her shared projections, any category key or the couple key (T-BAK-04), so a revoke or unpair cannot be undone by restoring one of his old backups. After a restore his phone pairs again in person and fetches only what she shares at that moment. His JSON/CSV export likewise excludes her projections; exporting the couple space before unpairing follows AP-08. What he saw on screen, screenshots and notes he made outside the app remain beyond the app's reach ("can't unsee").
- **Open question.** Whether to keep this whole backup feature is approval item **AP-01**. It stays the default until the captain decides.

## 8. Static hosting comparison

| Host | Private source | Custom security headers | Preview deploys | Access restriction | Fit |
|---|---|---|---|---|---|
| GitHub Pages (Free) | ✘ public source only (R5 H1) | ✘ no custom response headers documented (only a meta CSP, which cannot set `frame-ancestors`) | ✘ | ✘ | Poor |
| **Cloudflare Pages** | ✔ (R5 H2); direct local upload also possible (**untested**, I-M) for local-only repos | ✔ `_headers` (R5 H4) | ✔ but public by default (R5 H5) | Access needs payment details at onboarding (R5 H6) → not used | **Chosen** |
| Firebase Hosting (Spark) | ✔ through Actions | ✔ | ✔ public | ✘ | OK; 360 MB/day transfer; adds a Google account and a service-account key |

Public preview URLs are acceptable because the app bundle contains **no data**. Preview builds run with the synthetic data generator and a "Preview — synthetic data only" banner, and the network allowlist, header and served-bytes checks run against every deployed preview origin (T-NET-01, T-SEC-04, T-SEC-08).

**Preview versus production (AP-18, AP-29).**

| | Preview (P0–P5 demos) | Production (P6, separate approval) |
|---|---|---|
| Data | Synthetic only; may be wiped at any time | Her real data |
| Origins | A Pages preview project and a preview relay Worker + D1 | A separate Pages production project and a separate relay Worker + D1 |
| Secrets | Preview-only enrollment secret and VAPID keys | New production secrets, never shared with preview |
| Produced by | `p0-relay-spike`, `p0-probe-deploy`, `pN-demo-deploy`, `p2-preview-relay-deploy` | A P6 deploy task written at gate-phase-5, run only after the captain's concrete AP-29 approval |
| Real use | Never | Day-to-day use starts here |

The preview relay's push-test route (from `p0-relay-spike`) stays live for the P0 phone probe; `p2-preview-relay-deploy` replaces it with the verified relay on the same preview Worker.

## 9. Reminders and notifications: options, metadata and the lock conflict

| Option | What it can do | Metadata leaked | Decision |
|---|---|---|---|
| In-app reminders | Exact health-aware prompts while unlocked: "Still bleeding today?" (during a recorded period), symptom log, pill, "period may start in ~2 days" | None new | **Always on** (F-017) |
| Generic daily Web Push from the cron job | One visible notification per day at her chosen time, fixed text; the detail appears after unlock | Push endpoint (Apple), the daily time and IANA zone, that the app is in use. **No health-derived timing**: the same time every day whatever her cycle (R5 N1–N4) | **Opt-in** (F-018, F-114) |
| Partner push | His own generic daily push. Details such as "her period will probably start in about 2 days" show only in his unlocked app, and only for shared categories. Optional event push "Something new in your couple space" when she sends a support card or he gets a love note | The same, plus the *timing* of her sending a support card if event push is on | Daily: opt-in for him. Event push: **opt-in by her** (AP-14) |
| Calendar `.ics` | Real alarms with the app closed | Plaintext in Calendar, and iCloud Calendar is not end-to-end encrypted (R5 M2) | Backlog (F-120). Content-free events only, if ever |

**Lock conflict, resolved.** While locked, the service worker has no key, by design. It therefore shows only a fixed generic string. Nothing health-related is ever cached in plaintext for notifications. Real-iPhone tests in Phase 0 (FB-06) confirm that the notification arrives at a Home Screen app and that Focus mode behaves. **There is no promise of exact delivery time** (R5 §4).

## 10. Named Phase 0 feasibility blockers

| ID | Must be shown before relying on it | If it fails |
|---|---|---|
| FB-01 | Cloudflare account on the Free plan with no payment method; no paid products; quota-exceeded = errors, not charges | Option 1 alone, or option 2 (AP-12) |
| FB-02 | Worker CPU ≤10 ms for a signed request plus D1 query, and for VAPID signing per push | Batch/simplify; or drop push (in-app only) |
| FB-03 | On both iPhones: `persist()` result, IndexedDB read-back after force-quit, reboot and 7+ days, quota estimate | Stronger backup cadence; relay backup recommended |
| FB-04 | Web Share / download of `.flobak`, `.json`, `.csv` to Files and AirDrop, and re-import (R4 T6 zero-byte upload bug) | Use an in-memory `Blob` workaround; text-file fallback |
| FB-05 | Camera QR scan inside the Home Screen app | Typed/AirDrop pairing code (always available) |
| FB-06 | Home Screen Web Push permission, delivery, generic text, Focus behaviour, using the live preview relay push-test endpoint from `p0-relay-spike` | In-app reminders only |
| FB-07 | Passkey PRF on their phones and providers; offline behaviour; stability after iCloud restore (R4 §4) | Passphrase plus recovery code only |
| FB-08 | Verifier sandbox enforceable with the installed Firstmate adapter ([agent-operating-model.md §6](agent-operating-model.md#6-verifier-safeguards-phase-0-proof-required)) | Record as a blocker; high-risk landings wait until the captain picks an AP-16 interim option (no option has the first mate execute project code) |
| FB-09 | Cloudflare terms allow this personal use (R5 C8) | Fallback as for FB-01 |
| FB-10 | PBKDF2 600k timing on the slower phone | Recommend passkey unlock; keep the iteration count |
