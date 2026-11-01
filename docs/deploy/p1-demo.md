# P1 preview redeployment record — partial, acceptance incomplete

This is the fresh synthetic preview of the already reviewed navigation fix. Deployment and
byte/header checks passed; the live interactive evidence below is partial and is not a P1 phase
approval.

## Deployment identity

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

## Served bytes, headers, and network

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

## Fresh live synthetic smoke — partial

One six-outcome A/B/C matrix was run across both descriptors. The C outcome used a separate fresh
target context for import. A single focused C-only continuation corrected the probe's import
readiness/navigation sequence and completed the delete-all observation; the A/B matrix was not
repeated. Full timestamped events and command output are retained privately at
`~/firstmate/data/p1-demo-redeploy-navigation/`.

| Scenario | WebKit descriptor | Observed outcome |
|---|---|---|
| A — online navigation | iPhone SE | **PARTIAL.** Activated controller; 8 cached entries; cached `/` was nonredirected, cached `/index.html` reflected the canonical redirect, and `/?today=synthetic` was uncached before navigation. The query navigation returned 200 from the service worker with 949 matching bytes, matching security headers, no request/network redirect, and no captured online page/console/CSP error. The subsequent Today-heading, banner, and synthetic-summary assertions timed out, so post-navigation UI acceptance is **not proved**. |
| A — online navigation | iPhone 13 | **PARTIAL.** Same observed cache and query-response results as iPhone SE. The post-navigation Today-heading, banner, and synthetic-summary assertions timed out; no online page/console/CSP error was captured. UI acceptance is **not proved**. |
| B — offline and restore | iPhone SE | **PARTIAL.** Warm online controller and 8 cache entries including the engine worker were observed. Offline query navigation and offline reload each returned `WebKit encountered an internal error`; first timestamped offline error was `2026-11-01T03:01:19.733Z`. Offline behavior is **NOT PROVED**. After restoring online, the actual `#calendar` route rendered Calendar and its grid; explicit Today showed synthetic `Flow: Medium` and `Symptoms: Cramps`. No online errors or CSP violations were captured. |
| B — offline and restore | iPhone 13 | **PARTIAL.** Warm online controller and 8 cache entries including the engine worker were observed. Offline query navigation and reload each returned `WebKit encountered an internal error`; first timestamped offline error was `2026-11-01T03:03:06.886Z`. Offline behavior is **NOT PROVED**. After restoring online, `#calendar` rendered Calendar and its grid; explicit Today showed synthetic `Flow: Medium` and `Symptoms: Cramps`. No online errors or CSP violations were captured. |
| C — export/import/wipe | iPhone SE | **PARTIAL.** Synthetic JSON export contained 5 records; Flow CSV contained 1 data row. Import into a fresh target context applied after a no-change dry run; `Flow: Medium` and `Symptoms: Cramps` were visible and the round-trip JSON contained 6 records. Delete-all displayed **“Some cleanup could not be confirmed”** with failure list `OPFS`. Observed local/session storage, IndexedDB, Cache Storage, and service-worker registrations were empty. |
| C — export/import/wipe | iPhone 13 | **PARTIAL.** Same record counts, fresh-context import/value checks, delete-all warning and observed empty stores as iPhone SE. |

The deployed query response had the expected bytes and headers on both devices, and the former
service-worker redirection page error was not captured in these online query runs. However, the
post-query app heading/banner/persistence assertions did not pass; this record does not claim the
full online query journey passed.

Both delete-all UIs listed `OPFS`; the follow-up read-only `getDirectory()` probe surfaced a generic
automation `Error`, so this run does not assert a specific native exception name. A prior private
diagnostic recorded an OPFS `UnknownError`; the current visible failure remains a legitimate
incomplete-cleanup warning, not proof of a runtime defect or successful OPFS cleanup. Physical
flash erasure is not established.

## Limits and evidence

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
