# P0 relay spike: preview relay deploy record

Task `p0-relay-spike` (FB-01, FB-02, FB-09; serves FB-06). Synthetic data only. Specs: [storage-sync-decision.md](../plan/storage-sync-decision.md) §3, §5 and §10; security-privacy.md T10, T13 and PR-07.

## Deployment

| Item                 | Value                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Environment          | Preview only (AP-18). Synthetic data only. Not for production or real data                                 |
| Worker               | `flo-preview-relay`, code in `relay-spike/`, config `relay-spike/wrangler.toml`                            |
| URL                  | `https://flo-preview-relay.my-app123.workers.dev` (workers.dev only; preview URLs off; no route or domain) |
| D1 database          | `flo-preview` (binding `DB`), schema `relay-spike/schema.sql`: `devices`, `nonces`, `rate_limits`          |
| Deployed             | 2026-10-29 with wrangler 4.147.0, compatibility date 2026-10-01, bundle 16.25 KiB (5.02 KiB gzip)          |
| Worker secrets       | `ENROLLMENT_SECRET_HASH` (SHA-256 of the preview enrollment secret) and `VAPID_PRIVATE_JWK`. Preview-only  |
| Local secret copy    | Outside the repository, mode 600, on the deploying machine only. Never printed or committed                |
| Public VAPID key     | Served by `GET /vapid-public-key`. The probe can fetch it there, so it is not repeated in this record      |
| Status after the run | Kept live. `p2-preview-relay-deploy` will replace the code on the same Worker                              |

Routes:

- `GET /vapid-public-key`: the public VAPID key.
- `POST /push-test`: enrollment-secret bearer, a 16 KB body limit, and subscription/push-host validation, then a global D1 rate limit (5 per 10 min) before exactly one Web Push attempt with the fixed text "Synthetic probe test" / "This is a synthetic notification test."
- `POST /spike/devices`, `/spike/signed` and `/spike/push-sign`: measurement only. They need the enrollment secret or a §5 signed request from a registered synthetic device.

There is no CORS, no `console` output, and no reading of the client IP, user agent or `cf` request fields.

## FB-01: Free plan, no payment method

| Check                                | Result                                                                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan name                            | **Workers Free**. Confirmed by the account holder from the account's billing page on 2026-10-28. The deploy token cannot read billing                                                                                               |
| Payment method                       | **No payment method**. Confirmed by the account holder on 2026-10-28                                                                                                                                                                |
| Paid products enabled                | None was enabled by this spike: Workers, D1 and workers.dev only, with no R2, Logpush, Workers Logs or custom domain. A paid add-on cannot be charged without a payment method, but the token cannot list subscriptions to prove it |
| Quota exceeded = errors, not charges | On Free, over-limit Worker requests and D1 operations fail rather than bill (storage-sync-decision.md §3, R5 C1 and C3–C4). This spike did not trigger an over-limit case                                                           |

**Verdict: passes**, based on the account holder's billing-page confirmation.

## FB-02: Worker CPU time

Command: `bash relay-spike/measure.sh` on 2026-10-29 (14:18 to 14:20 UTC).

| Phase                                      | Work per request                                                                                                  | Invocations | CPU p50 | CPU p95 | CPU p99 | CPU max | Over 10 ms |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------- | ------- | ------- | ------- | ------- | ---------- |
| `signed` (50 signed synthetic requests)    | §5 signature parse, ECDSA P-256 verify, D1 read of the device, D1 batch (expired-nonce delete + nonce insert)     | 50 of 50    | 2.72 ms | 3.86 ms | 4.24 ms | 4.24 ms | No         |
| `push-sign` (50 signed synthetic requests) | Everything in `signed`, plus a VAPID ES256 JWT signature and RFC 8291 aes128gcm encryption of one push (not sent) | 51 for 50   | 2.11 ms | 3.25 ms | 3.50 ms | 3.50 ms | No         |

All 100 requests returned HTTP 200 and analytics recorded 0 errors.

**Verdict: passes.** The 10 ms Free-plan CPU limit was not exceeded in any phase; the highest single invocation used 4.24 ms.

Method and limits:

- **Source:** CPU time comes from Cloudflare's GraphQL Workers analytics (`workersInvocationsAdaptive`: `cpuTimeP50`, `cpuTimeP95`, `cpuTimeP99`, `max.cpuTime`), filtered on the script and each phase's time window (±1 s). It needs no Workers Logs or observability. In-Worker timing cannot measure CPU because Workers timers do not advance during execution.
- **Analytics caveats:** the dataset is adaptively sampled; at this volume every invocation was counted, but sampling could apply at higher volume. It lags by minutes: 11 of 50 invocations were visible after 2 min, and all of them appeared within about 2 min more.
- **Extra invocation:** the `push-sign` window held 51 invocations for 50 requests sent. The extra one is probably unrelated traffic to the newly public hostname, such as a scanner. Request logs are off by design, so it cannot be attributed. It does not change the verdict: the maximum over all 51 was 3.50 ms.
- **What CPU time excludes:** waiting on D1 and on the network is not CPU time. The single outbound fetch of a real `/push-test` adds network wait, not encryption work. That encryption work was measured in `push-sign`.
- **Client round trips:** these reflect the network, not CPU. `signed` had p50 158 ms and p95 441 ms; `push-sign` had p50 164 ms and p95 381 ms.

## FB-09: terms for personal use

**Verdict: PASS-with-caveats**, based on official Cloudflare terms read on 2026-10-29; this is a scoped terms reading, not production approval.

The intended use:

- One account holder runs the relay for the personal, non-commercial use of two people.
- There is no resale and no public service.
- Traffic is far below the Free quotas: fewer than 100 writes per day are expected (storage-sync-decision.md §3).
- Only ciphertext and opaque ids reach the relay (§5).

No personal/non-commercial Free-use ban was found in the [Self-Serve Agreement](https://www.cloudflare.com/terms/) or [Developer Platform terms](https://www.cloudflare.com/service-specific-terms-developer-platform/) covering Workers, D1 and Pages. The owner operates their own app; the partner is an app user, not a resale customer or an account opened on their behalf (§§2.2.1(a), 2.3).

PHI as defined by US HIPAA requires Cloudflare's written consent (§2.2.1(i)); encryption supplies no exception. Lawful permissions remain necessary (§2.5.2), and sensitive-information disclosure is restricted (Developer Platform clause 8).

The fixed-function mailbox and consented generic push test are inferred not to be a VPN/similar proxy (§2.2.1(j)) or spam (§2.7); neither is expressly prohibited. The [Website Terms](https://www.cloudflare.com/website-terms/) exclude these account-based services.

[Workers](https://developers.cloudflare.com/workers/platform/limits/) and [D1](https://developers.cloudflare.com/d1/platform/pricing/) Free overages produce limits/errors, not automatic Paid upgrades; count rows and all account usage, not just app writes. Free service can end without notice (§§2.6, 8), terms can change (§14), and post-termination retention is not assured: phones/backups stay authoritative; export while available and switch transport if necessary.

## FB-06 relay half: `POST /push-test`

Commands: `curl -s -o /dev/null -w '%{http_code}' -X POST https://flo-preview-relay.my-app123.workers.dev/push-test` and `bash relay-spike/push-test.sh`, on 2026-10-29.

| Call                                                  | Result                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| No secret (curl, empty body)                          | `401 {"error":"unauthorized"}`                                                                           |
| No secret, empty body (`push-test.sh` step 1)         | `401 {"error":"unauthorized"}`                                                                           |
| Wrong secret, synthetic subscription (step 2)         | `401 {"error":"unauthorized"}`                                                                           |
| Preview secret, synthetic Apple subscription (step 3) | `200 {"attempted":1,"pushService":"web.push.apple.com","pushStatus":400,"pushReason":"BadWebPushToken"}` |
| `GET /push-test`, `GET /nope`                         | 405 and 404                                                                                              |

**Demonstrated live:**

- 401 without the secret or with a wrong one.
- With the secret, exactly one Web Push request reached Apple's push service. It carried a VAPID JWT and an aes128gcm body with the fixed generic text.
- Apple answered `400 BadWebPushToken`. The synthetic subscription has a random device token, so this is expected, and nothing was delivered anywhere.

**Demonstrated by unit tests, not live:**

- Well-formedness. The single captured request decrypts with an independent RFC 8291 implementation to exactly the fixed text, and its VAPID JWT verifies.
- The RFC 8291 Appendix A test vector is reproduced byte for byte.
- These live in `relay-spike/test/`.

**Not demonstrated here:** delivery to a real device. `p0-device-feasibility` confirms that end to end with the probe.

## T-RELAY-02 (configuration part): logging off, and what stays visible

`relay-spike/wrangler.toml` sets the following, and `relay-spike/test/config.test.ts` checks it:

- `[observability] enabled = false`.
- `[observability.logs]` has `enabled = false`, `invocation_logs = false` and `persist = false`.
- `[observability.traces]` has `enabled = false` and `persist = false`.
- `logpush = false`, `tail_consumers = []` and `streaming_tail_consumers = []`.
- No `[triggers]` (no cron) and no `routes` or custom domain.
- `upload_source_maps = false` and `send_metrics = false`.

The Worker code makes no `console` calls and reads no IP, user agent or `cf` fields.

Turning logs off does **not** hide traffic from the account holder or from Cloudflare (gap D-G01, threat T13). The account holder can still see or obtain:

- **Workers analytics** in the dashboard and GraphQL, per invocation group: request counts, CPU time and wall time quantiles, status (success or error), subrequest counts, time buckets, and the Cloudflare data center (colo). This spike's measurement used exactly this.
- **Live traffic through `wrangler tail`** or the dashboard's live log stream. These work with logging off. For each request they show the full URL and path, the method, request headers, the client IP and `cf` fields such as country, colo and ASN, the response status, and any exceptions. They show nothing for traffic that happened before the tail started.
- **Re-enabled logging.** Any account member with Workers edit rights, or anyone holding a scoped deploy token with Workers Scripts Edit permission, can turn Workers Logs, observability, Logpush or a tail consumer back on at any time by redeploying.
- **D1 contents.** The `devices`, `nonces` and `rate_limits` tables can be read through the dashboard, `wrangler d1 execute` or an export. In the real relay they hold opaque ids, public keys, sequence numbers (sequence-number cursors) and ciphertext only (§5).
- **Account and API audit logs:** deploys, secret changes and token use.

Cloudflare itself always processes the client IP, TLS and request metadata for every request, whatever these settings are (T13). The same applies to any network-level DNS or TLS inspection on the client's network.

## Outcome and fallback

FB-01 and FB-02 pass, FB-09 is PASS-with-caveats based on the scoped terms reading, and the relay half of FB-06 works live.

If FB-01, FB-02 or FB-09 fails, use the storage-sync-decision.md §3 fallback: option 1 (manual exchange) alone, plus the optional option 2 transport (AP-12). Until then, this preview endpoint is used for nothing but the feasibility probe, and only with synthetic data.
