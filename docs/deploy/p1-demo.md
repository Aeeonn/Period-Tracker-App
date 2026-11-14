# P1 preview deployment record — phase gate pending

The latest synthetic preview's served-byte and deployed-origin header/network checks passed. The
owner's real-iPhone smoke (2026-11-14) passed install, offline reopen and Delete All on her phone,
and install/setup/unlock on his phone. This is not P1 phase approval.

## Real-iPhone smoke — 2026-11-14 (owner-reported)

Run by the owner against https://p1-gate-0171a80.flo-preview-cm6.pages.dev (revision `0171a80`),
installed from Safari to the Home Screen, with made-up data only.

| Phone                                   | Check                                                       | Result                                                           |
| --------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| iPhone 16 Pro, iOS 26.7.3 (cycle owner) | Home Screen install; “Preview — synthetic data only” banner | PASS                                                             |
| iPhone 16 Pro                           | Synthetic period start and symptom logged                   | PASS                                                             |
| iPhone 16 Pro                           | Airplane Mode → force-quit → reopen                         | PASS: unlock screen appeared; Today showed the synthetic entries |
| iPhone 16 Pro                           | Delete All                                                  | PASS: “Your local data was removed” (no cleanup failures listed) |
| iPhone 12, iOS 18.6.7 (partner)         | Home Screen install, banner, setup, unlock after reopening  | PASS                                                             |

Not covered in that run: checklist items 4–6 of
[test-strategy.md §7](../plan/test-strategy.md#7-real-iphone-smoke-checklist-both-phones-at-every-phase-demo-synthetic-data-only)
(auto-lock after backgrounding, prediction copy/Calendar marks, VoiceOver and large text).
Results are as reported by the owner; no device logs or screenshots were collected. Delete All
reporting success means the app confirmed each cleanup step; physical flash erasure is not
guaranteed (crypto-erasure is the guarantee).

## Additional owner-reported checks — 2026-11-14

After being asked to test the main address with synthetic data, the owner reported that all
requested checks passed on both the iPhone 16 Pro and iPhone 12: immediate auto-lock after
switching apps; prediction wording and Calendar marks; VoiceOver and large text; Face ID setup
and unlock; passphrase fallback after cancelling; and offline Face ID unlock. See the
[Face ID deployment record](face-id-preview.md). No device logs or screenshots were collected.
The confirmation did not separately describe every detailed assertion in the full smoke checklist,
and does not constitute P1 approval.

On the real iPhone, offline reopen worked and OPFS cleanup was confirmed. This is consistent with
the diagnosis below that the Playwright WebKit failures came from the automation environment.

## P1 demo package — draft, 2026-11-14

- **Try it:** https://flo-preview-cm6.pages.dev. This is the owner-approved production address,
  but it is still a synthetic-only preview, not approval to use real health data. The deployed
  app is from `c9ced53`; deployment and served-byte checks are in the
  [Face ID deployment record](face-id-preview.md).
- **What's new:** account-free onboarding and a local encrypted lock; period, symptom and other
  logging; Today and Calendar with prediction windows, cited warnings and educational cards;
  JSON/CSV export, import and Delete All. Optional Face ID and the Lock-after setting were added
  early. Face ID must be set up separately on each hostname.
- **Demo:** with made-up data, set up the app, log a period and symptom, inspect Today and Calendar,
  try export/import and Delete All, and try Face ID and the lock timeout. The
  [roadmap](../plan/roadmap.md#p1--core-tracking-her) lists the full P1 demo.
- **Screenshots:** [Today](p1-screenshots/today.png) and [Calendar](p1-screenshots/calendar.png),
  captured from the main address with its synthetic fixture in an isolated Playwright WebKit
  iPhone 13 emulation. They are illustrations, not real-iPhone evidence.
- **Evidence:** the earlier integrated P1 checks and real-iPhone results are recorded in
  [status.md](../status.md#next-up-finish-p1) and above. For the later Face ID change,
  `npm run build && npm run check` passed with 462 unit tests, `npm run test:crypto` passed, and
  the affected browser specs passed serially. The default parallel full E2E run had seven
  iPhone 13 timeouts; the affected specs subsequently passed serially. A later full
  `npm run e2e -- --workers=1` passed all 218 tests on the same app code. A fresh
  `npm run check` passed 462 tests. The five-zone `npm run test:tz` passed on retry; its first
  attempt timed out in one passkey test in the fifth zone. The initial coverage run also timed
  out in an engine property test, and a one-worker rerun timed out on two engine properties.
  Coverage passed with one worker and a 30-second test timeout. Details and the remaining phase
  verification work are below; the owner-reported phone checks are above.
- **Known issues and limits:** final-revision phase verification remains to be completed. The
  owner confirmed the requested phone checks generally, not each detailed assertion
  in the full smoke checklist. Test-run timeouts occurred as described above; these are not
  treated as proof of the cause. Further Face ID and accessibility follow-ups are listed in
  [status.md](../status.md#open-follow-ups). Neither automated testing nor the reported phone checks
  establish clinical accuracy or guarantee physical storage erasure.
- **Decisions:** the owner approved early Face ID and a production-address deployment of the
  synthetic-only build; the P1 phase gate remains open. See
  [decisions.md](../decisions.md#lock-and-unlock-2026-11-14) and
  [ADR-0016](../adr/0016-passkey-face-id-unlock.md).
- **What's next:** complete the phase evidence and demo package, then present the P1 gate for the
  owner's decision. P2 couple features remain gated.

## Current P1 verification evidence — 2026-11-14

The app code checked here is the same as deployed revision `c9ced53`; subsequent changes through
`c77865c` were documentation only. The full browser run began at `ff79b1d`. This is a compilation
of evidence, not a completed independent phase review or approval.

| Check | Result and limitations |
| --- | --- |
| `npm run check` | PASS: 62 files, 462 tests, plus typecheck, lint, dependency, copy, secret, synthetic-data and size checks. |
| `npm run e2e -- --workers=1` | PASS: 218 tests on emulated iPhone SE and iPhone 13. An earlier default-parallel run had 7 timeouts. |
| `npm run test:tz` | PASS on retry: 462 tests in each of five zones. The first attempt passed four zones and had one passkey-test timeout in Los Angeles. |
| `npx vitest run --coverage --maxWorkers=1 --testTimeout=30000` | PASS: 462 tests; overall line coverage 81.98%, engine 97.75%, crypto 95.82%, data 95.14%, backup 95.10%. P2 share, sync and pairing have no source yet. Default coverage and one-worker coverage with the default timeout had engine-property timeouts. The 30-second limit was a command-line adjustment, not a source or configuration change. |
| `npm run backtest` | PASS: generator v2, synthetic seeds 1–1,000, no skipped scenarios; all five gated targets met. This does not establish real-world accuracy. |
| `npm run bench` | PASS: 730 synthetic rows, 20 samples, mean 359.53 ms and p95 472.99 ms against the 1.5 s target; passphrase KDF excluded. |
| Live headers/network | `BASE_URL=https://flo-preview-cm6.pages.dev npx playwright test tests/e2e/p0-headers.spec.ts tests/e2e/p0-network.spec.ts --grep '@headers\|@network' --workers=1`: 12 passed, 4 expected local-only checks skipped. Four passes checked live headers/network on both descriptors; other passes used local fixtures. |

The synthetic backtest's gated targets were: stable MAE for 3–5 prior cycles 2.413 versus
2.530 days maximum; stable MAE for 6+ cycles 2.210 versus 2.377 days maximum; stable 6+ cycle
window coverage 82.81% versus a 70% minimum; drift MAE 2.675 versus the 3.160-day baseline;
and outlier MAE 3.020 versus 3.257 days maximum. Stable strata 0–2, skipped-logs, irregular
and post-pill scenarios are report-only.

Still needed: synthesize the full roadmap criteria and applicable reviews on the current code;
resolve or explicitly present the detailed smoke-checklist gaps; and obtain the owner's P1 gate
decision. The timeout-adjusted coverage result is recorded alongside, not in place of, the two
failed attempts.

## Latest deployment — 2026-12-19

- Immutable preview URL: https://0adba595.flo-preview-cm6.pages.dev
- Pages project / branch: `flo-preview` / `p1-gate-0171a80`; branch alias:
  https://p1-gate-0171a80.flo-preview-cm6.pages.dev. Production branch `main` was not deployed.
- Deployed source revision: `0171a809b0ed4d4bac6c8bbb2a607c72b15c2fc9`
  (`feat(today): show sourced guidance and education cards`).
- Build listing SHA-256:
  `f4f05fffd10038e40e747476e107b839d66c07b068d307c59af1daaed0a2ee0d`.
- Built app shell: 949 bytes, SHA-256
  `0cec8e0cc550d4a803bfe7353741ca8d035fef15305c68545e86bdb587201781`.
- Built service worker: `sw.js`, SHA-256
  `fe2b2e62cb2e1f344ebd575f536d0835509067b0a53dd875f014e4cbafe237cc`.
- Engine worker: `assets/engine.worker-9hiALv3-.js`, SHA-256
  `13cee88e3237a90fd890d675befb514d9cc134851bd849dbb422bd83ec51a3c4`.
- `bash tools/deploy/pages-preview.sh app --branch p1-gate-0171a80`: PASS; deployed the synthetic
  app preview at the immutable URL and branch alias above.
- `npx tsx tools/deploy/check-preview.ts https://0adba595.flo-preview-cm6.pages.dev app`: PASS;
  all 8 served files were byte-equal to the app build. `_headers` is Pages configuration, not a
  served asset.
- `BASE_URL=https://0adba595.flo-preview-cm6.pages.dev npm run e2e -- --grep
'@headers|@network' --workers=1`: **12 passed, 4 skipped, 0 failed** across WebKit iPhone SE
  and iPhone 13 descriptors. Four passing tests checked the deployed origin (header equality and
  first-party network policy on each descriptor); eight were local fixtures or validation checks.
  The four expected skips were the local-only HSTS-scope and seeded third-party-path checks.
- Each deployed-origin network recorder observed 5 requests, 0 failed requests, 0 CSP violations,
  0 browser errors, and an activated/controlling service worker; requests stayed on the deployed
  first-party origin. Exact approved security headers were verified on `/` and `/sw.js`.
  Application HSTS was omitted on the Pages host; platform HSTS was not simulated.
- These deployment checks cover bytes, headers and network policy; the separate current-revision
  interactive smoke below is partial. Real-iPhone behavior remains unverified.

## Latest live synthetic smoke — partial

- `npx tsx tools/deploy/current-preview-smoke.ts`: one-off Playwright driver against this
  deployment, run with fresh contexts for both WebKit iPhone descriptors and removed afterward.
  It exited 1 because offline reload failed on both descriptors; the other outcomes are listed
  below.
- All app data entered was synthetic. Export/import used a fresh target context; no export contents
  or identifiers are recorded here. These are emulated WebKit results, not physical-iPhone proof.

| Scenario                | WebKit descriptor | Observed outcome                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — online navigation   | iPhone SE         | **PASS, limited.** `?today=synthetic` returned 200; after lock setup Today and the synthetic-data banner were visible. The service worker activated and controlled the page; online reload and restore rendered Today. No page errors were captured.                                                                                                                                                                                                       |
| A — online navigation   | iPhone 13         | **PASS, limited.** Same observed result as iPhone SE.                                                                                                                                                                                                                                                                                                                                                                                                      |
| B — offline and restore | iPhone SE         | **PARTIAL.** Offline `page.reload()` failed with `WebKit encountered an internal error` while waiting for `domcontentloaded`. After restoring network, the synthetic Today page reopened.                                                                                                                                                                                                                                                                  |
| B — offline and restore | iPhone 13         | **PARTIAL.** Same offline reload error; online restore reopened Today.                                                                                                                                                                                                                                                                                                                                                                                     |
| C — export/import/wipe  | iPhone SE         | **PARTIAL.** A synthetic JSON export contained 4 records. Import into a fresh context succeeded; Flow and Cramps were visible. Delete All showed **“Some cleanup could not be confirmed”** and listed `OPFS`. Afterward, local/session storage, IndexedDB databases, Cache Storage and service-worker registrations were empty; the read-only OPFS probe raised `UnknownError: The operation failed for an unknown transient reason (e.g. out of memory).` |
| C — export/import/wipe  | iPhone 13         | **PARTIAL.** Same export count, import result, Delete All warning, empty observed stores and OPFS probe error as iPhone SE.                                                                                                                                                                                                                                                                                                                                |

This smoke confirms the older offline and OPFS observations also occur on the current deployment.
It does not establish why WebKit failed the offline reload, whether cleanup completely removed
OPFS data, or physical flash erasure. No app defect or safe code fix is established by this
emulation. Both physical-phone smoke checks are needed to determine whether an app fix is warranted.

## Follow-up diagnosis — 2026-12-19

- `npm run e2e -- --grep '@sw' --workers=1`: **10 passed** across both WebKit descriptors.
  The local controlled-outage tests served the cached root and query shell from the service worker
  with HTTP 200, preserved shell headers, and no page errors. These tests exercise the app against
  a local server; they are not a live-preview airplane-mode test.
- `npx vitest run tests/data/wipe/browser-wipe.test.ts tests/data/wipe/wipe.test.ts`: **12 passed**.
- Before running Delete All in a fresh context on the live preview, a read-only probe found the
  service worker activated/controlling, the `flo-static-*` cache present, and both `/` and
  `/index.html` in that cache. The same pre-wipe probe of
  `navigator.storage.getDirectory()` already raised
  `UnknownError: The operation failed for an unknown transient reason (e.g. out of memory).`
  Therefore this automation environment cannot enumerate OPFS even before the wipe starts; changing
  the UI to report success would be unsafe.
- With Playwright WebKit `context.setOffline(true)`, both same-page reload and fresh-page navigation
  failed with `WebKit encountered an internal error` despite the active worker and cached shell.
  Playwright returned no document response to inspect. The controlled-outage tests pass, so the
  live emulation error is not evidence that the worker's offline fallback is broken.
- No application code was changed: current evidence points to WebKit automation limitations, not
  an identified app defect. Real-device checks are required before attributing either result to Flo.

## Previous deployment (34b38d5) — interactive smoke partial

This historical record is for an older deployment and is not validation of the latest revision.
The same offline and OPFS outcomes were reproduced on the latest deployment above; this section
preserves the older run's detailed context.

### Deployment identity

- Immutable preview URL: https://e056cc9b.flo-preview-cm6.pages.dev
- Pages project / branch: `flo-preview` / `app`; stable alias:
  https://app.flo-preview-cm6.pages.dev. Production branch `main` was not deployed.
- Deployed source revision: `34b38d5a7ba9c685e76ebb1b72a3a2675f6bef8f`.
- Reviewed product-source revision: `3c96d610bd155227943c0ec9df1d1931d6af3c87`
  (`fix(sw): normalize redirected cached navigation responses`). The deployed revision adds only
  landed bookkeeping relative to that product revision; no product source changed for this task.
- Build listing SHA-256: `8dab0989fe4d1fc1bce062f8c0238e8307938a0ed11f8386cbb124093ee9b5eb`.
- Built service worker: `sw.js`, SHA-256
  `ec5b7e3af6a66ecc29f931fd7fcbc1baeadae421b2a4f430be8547abadb18dfd`.
- Engine worker: `assets/engine.worker-FpVJjbOS.js`, SHA-256
  `cfade3abf373a593e1b2a13357c083f84858944c541328a11b0d3cfe5fdc1eab`.
- The unmodified helper reported that the existing `flo-preview` project was present and skipped
  creation. The private execution guard refused the project-create command if reached. No resource
  was created.
- `bash tools/deploy/pages-preview.sh app --branch app`: PASS; 126 modules, 8 service-worker
  precache URLs. The helper reported the immutable URL and `app` alias above.
- Prior deployment retained for history: `a0946fab16164487cbf69aa0c30204265c09f788` at
  https://afe7d83a.flo-preview-cm6.pages.dev, listing SHA-256
  `24fc170f2f5aaa02ee023eb4bc85eae17ad4cb73cdfe52ff051dc91c3e6f5b9e`. That older deployment
  predates the reviewed navigation fix; this redeployment does not rewrite its immutable URL.

### Served bytes, headers, and network

- `npx --no-install tsx tools/deploy/check-preview.ts
https://e056cc9b.flo-preview-cm6.pages.dev app`: PASS; all 8 non-reserved served files were
  byte-equal to this app build. `_headers` is Pages configuration, not a served asset.
- `BASE_URL=https://e056cc9b.flo-preview-cm6.pages.dev npm run e2e -- --grep
"@headers|@network" --workers=2`: **12 passed, 4 skipped, 0 failed** across WebKit iPhone SE and
  iPhone 13 descriptors. Four passing tests were live-origin checks (header equality and
  first-party network checks on each descriptor); the other eight passes were local fixtures or
  validation-only checks. Four expected skips were the local-only Host/HSTS and seeded third-party
  CSP checks, one each per descriptor.
- Each live network recorder observed 5 requests, 0 failed requests, 0 CSP violations, 0 browser
  errors, an activated/controlling service worker, and only the deployed first-party origin.
- Live responses matched the approved security policy: CSP
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; require-trusted-types-for 'script'; upgrade-insecure-requests`;
  `Referrer-Policy: no-referrer`; `X-Content-Type-Options: nosniff`; the approved
  `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()`;
  and `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Resource-Policy: same-origin`.
  The app-shell response was `Content-Type: text/html; charset=utf-8` with
  `Cache-Control: public, max-age=0, must-revalidate`. The Pages response had no application HSTS;
  platform HSTS was not simulated. The deployed service-worker response retained
  `Cache-Control: no-cache`.
- The live app-shell response was **949 bytes**, SHA-256
  `099c35bafc338ff9009d7c147d1acae0c90884f0d18497037b450ddc988633bc`.

### Fresh live synthetic smoke — partial

One six-outcome A/B/C matrix was run across both descriptors. The C outcome used a separate fresh
target context for import. A single focused C-only continuation corrected the probe's import
readiness/navigation sequence and completed the delete-all observation; the A/B matrix was not
repeated. Full timestamped events and command output are retained privately at
`~/firstmate/data/p1-demo-redeploy-navigation/`.

| Scenario                | WebKit descriptor | Observed outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — online navigation   | iPhone SE         | **PARTIAL.** Activated controller; 8 cached entries; cached `/` was nonredirected, cached `/index.html` reflected the canonical redirect, and `/?today=synthetic` was uncached before navigation. The query navigation returned 200 from the service worker with 949 matching bytes, matching security headers, no request/network redirect, and no captured online page/console/CSP error. The subsequent Today-heading, banner, and synthetic-summary assertions timed out, so post-navigation UI acceptance is **not proved**. |
| A — online navigation   | iPhone 13         | **PARTIAL.** Same observed cache and query-response results as iPhone SE. The post-navigation Today-heading, banner, and synthetic-summary assertions timed out; no online page/console/CSP error was captured. UI acceptance is **not proved**.                                                                                                                                                                                                                                                                                  |
| B — offline and restore | iPhone SE         | **PARTIAL.** Warm online controller and 8 cache entries including the engine worker were observed. Offline query navigation and offline reload each returned `WebKit encountered an internal error`; first timestamped offline error was `2026-11-01T03:01:19.733Z`. Offline behavior is **NOT PROVED**. After restoring online, the actual `#calendar` route rendered Calendar and its grid; explicit Today showed synthetic `Flow: Medium` and `Symptoms: Cramps`. No online errors or CSP violations were captured.            |
| B — offline and restore | iPhone 13         | **PARTIAL.** Warm online controller and 8 cache entries including the engine worker were observed. Offline query navigation and reload each returned `WebKit encountered an internal error`; first timestamped offline error was `2026-11-01T03:03:06.886Z`. Offline behavior is **NOT PROVED**. After restoring online, `#calendar` rendered Calendar and its grid; explicit Today showed synthetic `Flow: Medium` and `Symptoms: Cramps`. No online errors or CSP violations were captured.                                     |
| C — export/import/wipe  | iPhone SE         | **PARTIAL.** Synthetic JSON export contained 5 records; Flow CSV contained 1 data row. Import into a fresh target context applied after a no-change dry run; `Flow: Medium` and `Symptoms: Cramps` were visible and the round-trip JSON contained 6 records. Delete-all displayed **“Some cleanup could not be confirmed”** with failure list `OPFS`. Observed local/session storage, IndexedDB, Cache Storage, and service-worker registrations were empty.                                                                      |
| C — export/import/wipe  | iPhone 13         | **PARTIAL.** Same record counts, fresh-context import/value checks, delete-all warning and observed empty stores as iPhone SE.                                                                                                                                                                                                                                                                                                                                                                                                    |

The deployed query response had the expected bytes and headers on both devices, and the former
service-worker redirection page error was not captured in these online query runs. However, the
post-query app heading/banner/persistence assertions did not pass; this record does not claim the
full online query journey passed.

Both delete-all UIs listed `OPFS`; the follow-up read-only `getDirectory()` probe surfaced a generic
automation `Error`, so this run does not assert a specific native exception name. A prior private
diagnostic recorded an OPFS `UnknownError`; the current visible failure remains a legitimate
incomplete-cleanup warning, not proof of a runtime defect or successful OPFS cleanup. Physical
flash erasure is not established.

### Limits and evidence

- Synthetic data only; no real health data, credentials, or export contents are recorded here.
- This is not a physical-iPhone Safari/Home Screen test and does not prove offline document loading,
  crypto-erasure, or physical deletion. The offline internal errors remain unproved rather than
  being attributed to an application defect.
- The interactive smoke is partial because the A query's app UI assertions timed out and C delete
  reported OPFS. Do not treat the passing byte/header/network subset as full interactive acceptance.
- Private report and sanitized command logs:
  `~/firstmate/data/p1-demo-redeploy-navigation/report.md`,
  `deploy.stdout.log`, `byte-check.stdout.log`, `headers-network.stdout.log`,
  `matrix.stdout.log`, and `continuation-c.stdout.log`.
- Task build/check results are in the private task report and are separate from deployed-origin
  evidence. Broad e2e, TZ matrix, backtest, physical-device smoke, and P1 phase verification are not
  claimed here.
