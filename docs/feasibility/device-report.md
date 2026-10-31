# P0 device feasibility: recorded evidence

This consolidates the existing feasibility records; it is not a new device run or a blanket security, privacy, clinical, or production approval. All reported test data is synthetic.

## Device runs

- **Captain:** iPhone 12, iOS 18.6.7, Home Screen app; probe `df38093c`, 2026-10-30. Results below follow the `p0-device-feasibility` backlog note.
- **Partner:** iPhone 16 Pro, iOS 26; not run. The captain waived the partner run on 2026-10-30 so device reports would not hold up work. Partner-device issues remain to be found in normal use.

## Findings

| Item  | Recorded result       | Evidence and limits                                                                                                                                                                                                                                                     |
| ----- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FB-01 | **PASS**              | Account holder confirmed Workers Free and no payment method (2026-10-28); see `~/firstmate/data/p0-relay-spike/report.md`. This is an account-holder statement, not an independent account audit.                                                                       |
| FB-02 | **PASS**              | Relay measurement stayed below the 10 ms CPU limit: 50 signed requests p95 3.86 ms (max 4.24 ms); push-sign p95 3.25 ms (max 3.50 ms). See `p0-relay-spike/report.md`.                                                                                                  |
| FB-03 | **PASS-accepted**     | On-device IndexedDB read-back passed and `persist()` was granted. The captain accepts laptop evidence of storage persisting for about a week. No iPhone force-quit, reboot, or seven-day run was done; this is not durable-retention proof.                             |
| FB-04 | **PARTIAL**           | Download was triggered, but saving to Files and re-import were not confirmed. Text/Blob fallback remains available.                                                                                                                                                     |
| FB-05 | **PASS**              | Status recorded for the captain's iPhone 12 / iOS 18.6.7 probe; no broader device compatibility claim is made.                                                                                                                                                          |
| FB-06 | **PASS**              | Offline PRF was stable in the recorded probe.                                                                                                                                                                                                                           |
| FB-07 | **PASS**              | Status recorded for the captain's iPhone 12 / iOS 18.6.7 probe.                                                                                                                                                                                                         |
| FB-08 | **PARTIAL / OPEN**    | Existing verifier-sandbox evidence does not establish process/tool isolation. The sandbox-proof task was superseded; ordinary independent review was accepted, isolation is not enforced, and no sandbox proof or security PASS is claimed.                             |
| FB-09 | **PASS-WITH-CAVEATS** | The terms report found no personal/non-commercial Free-plan ban for the stated owner-operated two-person use. This is a scoped interpretation, not legal advice, blanket health-data clearance, or production approval; see `~/firstmate/data/p0-fb09-terms/report.md`. |
| FB-10 | **PASS**              | PBKDF2 600,000 iterations measured 140 ms in the recorded probe.                                                                                                                                                                                                        |

## Open checks

- Verify the hidden-interval auto-lock clock on a real iPhone, including device sleep/backgrounded Home Screen app behavior. WebKit emulation does not prove this. This check is open and does not block this integration task.
- The partner iPhone run remains waived; partner-device issues are not ruled out.
- FB-04 Files save/re-import remains unconfirmed. FB-08 remains partial/open as described above.
- The p0-lock report also records that a manual VoiceOver pass was not run; automated checks are not a substitute.
