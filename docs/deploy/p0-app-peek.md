# P0 app preview deployments

## Redeployment (2026-10-30)

- Deployment ID: `9c4e354e` (deployment URL slug: https://9c4e354e.flo-preview-cm6.pages.dev)
- Pages project / branch: `flo-preview` / `app` (production `main` was not changed)
- Source SHA: `6c43ceaf928b5cd13026c6c8c4d918c5134d97eb`
- Deployment URL: https://9c4e354e.flo-preview-cm6.pages.dev
- Stable branch alias: https://app.flo-preview-cm6.pages.dev
- Build listing SHA-256: `01fbca18efe9b89e97483e2db0392ad1f21c2465bbc0084075dd92e09f7b00ab`
- Deploy command: `tools/deploy/pages-preview.sh app --branch app` (PASS; 57 modules and 7 service-worker precache URLs).
- Read-only smoke: `npx --no-install tsx tools/deploy/check-preview.ts https://app.flo-preview-cm6.pages.dev app` (PASS; 7 served files byte-equal).
- `npm run check`: PASS; 24 test files and 240 tests passed; all type, lint, formatting, dependency, secrets, real-data, copy, and bundle-size checks passed.
- Synthetic data only; no real health data or secrets were recorded.

## Previous deployment (retained for history)

- Date: 2026-10-30
- Pages project / branch: `flo-preview` / `app` (production `main` was not changed)
- Source SHA: `0b9d3e1` (`0b9d3e10a29ba30b3aa53bce90951aac74a98717`)
- Wrangler deployment URL: https://ce12c775.flo-preview-cm6.pages.dev
- Stable branch alias: https://app.flo-preview-cm6.pages.dev
- Build listing SHA-256: `3776b8fa68bbea18e800d5cdc4f3a6f1638a24def48731ae090e6b995b2b7be9`
- Deploy command: `tools/deploy/pages-preview.sh app --branch app` (PASS; Vite built 30 modules and the service worker precache contains 7 URLs).

## Verification

- Used the permitted `curl` + `sha256sum` comparison for the app build. All 7 served assets matched the local build byte-for-byte at both the deployment URL and stable alias. `_headers` is Pages configuration, not a served asset.
- Both origins returned HTTP 200 for the app entry; the built mount point and asset links are present. Browser rendering passed on both origins: owner navigation, Today heading, synthetic-preview banner, and `Next period: around Nov 8` were visible with no page errors.
- Security headers at both origins exactly matched the built `_headers`: CSP, Referrer-Policy, X-Content-Type-Options, Permissions-Policy, COOP, and CORP. `/sw.js` returned HTTP 200 with `Cache-Control: no-cache`. HSTS was absent on `pages.dev`, as expected for the custom-domain-only rule.
- `T-NET-01 @network` WebKit smoke on the stable alias: 1 test passed; 5 requests, 0 failed, 0 CSP violations, 0 browser errors; service worker activated and controlled the page.
- Production probe `https://flo-preview-cm6.pages.dev/`: HTTP 200, probe title present, manifest link present. `/probe-sw.js` returned HTTP 200; `/manifest.webmanifest` returned HTTP 200. This confirms the production origin still serves the probe.

## Privacy and method

- The app build uses synthetic preview data only. No secrets or real health data are recorded here.
- `tools/deploy/check-preview.ts` was not used because it is bound to the probe build directory; the authorized `curl` + SHA-256 alternative verified the app build.
