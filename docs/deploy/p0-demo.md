# P0 synthetic app demo deployment

## Redeployment (2026-10-31)

- Deployment ID: `d1ff9b33` (deployment URL slug: https://d1ff9b33.flo-preview-cm6.pages.dev)
- Pages project / branch: `flo-preview` / `app` (production `main` was not changed).
- Source revision: `ac6003aff3140658586cc4323056df434ae17325`
- Stable alias: https://app.flo-preview-cm6.pages.dev
- Build listing SHA-256: `a951aa4feda51b5a8bcef8f48bebd1ddb10ca0ba3a3fbf07813c9ee8e81da494`
- Deploy command: `bash tools/deploy/pages-preview.sh app --branch app` (PASS; 80 modules, 7 service-worker precache URLs).
- Smoke check: `npx --no-install tsx tools/deploy/check-preview.ts https://app.flo-preview-cm6.pages.dev app` (PASS; 7 served files byte-equal; `_headers` is Pages configuration, not a served file).
- `npm run check`: PASS; 29 test files and 266 tests passed; typecheck, lint, formatting, dependency, secrets, real-data, copy, and bundle-size checks passed.
- Synthetic data only; no real health data or secrets were recorded.
- `?today=synthetic` shows the synthetic Today preview; on a fresh device the default Today is live and empty.


## Redeployment (2026-10-30)

- Deployment ID: `9c4e354e` (deployment URL slug: https://9c4e354e.flo-preview-cm6.pages.dev)
- Pages project / branch: `flo-preview` / `app` (production `main` was not changed)
- Source revision: `6c43ceaf928b5cd13026c6c8c4d918c5134d97eb`
- Stable alias: https://app.flo-preview-cm6.pages.dev
- Build listing SHA-256: `01fbca18efe9b89e97483e2db0392ad1f21c2465bbc0084075dd92e09f7b00ab`
- Deploy command: `bash tools/deploy/pages-preview.sh app --branch app` (PASS; 57 modules, service worker precache has 7 URLs).
- Smoke check: `npx --no-install tsx tools/deploy/check-preview.ts https://app.flo-preview-cm6.pages.dev app` (PASS; 7 served files byte-equal; `_headers` is Pages configuration, not a served file).
- `npm run check`: PASS; 24 test files and 240 tests passed; typecheck, lint, formatting, dependency/secrets/data/copy checks and bundle-size budget passed.
- Synthetic data only; no real health data or secrets were recorded.

## Previous deployment (retained for history)

- Date: 2026-10-30
- Pages project / branch: `flo-preview` / `app` (production branch `main` was not changed)
- Source revision: `6ca0172257f9e6f8f2e41c31dfab3fac41b8ca1e`
- Deployment URL: https://cdaff697.flo-preview-cm6.pages.dev
- Stable alias: https://app.flo-preview-cm6.pages.dev
- Build listing SHA-256: `8762db116fa67c43a75a269f2e68d47edc7fa3747daa9d6198592643685924ca`
- Deploy command: `bash tools/deploy/pages-preview.sh app --branch app` (PASS; 57 modules, service worker precache has 7 URLs).

## Current demo content

`?today=synthetic` shows the synthetic Today preview. On a fresh device, the default Today view is live and empty. Preview data is synthetic only; no real health data is present.

## Verification

- The deployment script writes `/tmp/flo-preview-build/app`. A fresh build using the script's app build command and environment produced the same listing hash as that staging directory. The old worktree `dist/` had different hashed assets (`index-akb07qiI.js`); `npm run e2e` rebuilt `dist/` with `index-BJ1cimrj.js`, matching the deployed app asset. The build is reproducible; no redeploy was needed.
- T-SEC-08 served-byte comparison: all 7 served files matched the app build byte-for-byte at both URLs (14/14 total, HTTP 200). `_headers` is Pages configuration, not a served file.
- `npx tsx tools/deploy/check-preview.ts <url>` was attempted for both URLs. Its default input is the probe build at `${tmpdir}/flo-preview-build/probe`, which expected `assets/index-BbqXqgfl.js`; an app request for that missing path receives the SPA index fallback. Pointing `TMPDIR` at a copy of the matching app build still returned `PENDING` on `index.html`, because the script's block-page heuristic requires the probe title. These are tool/build-selection limitations, not a network block; the manual byte comparison above passed.
- Follow-up (not fixed here): make `check-preview` accept the target build and expected page identity, and report an SPA fallback for a missing asset as a missing file rather than a network block.
- Checker usage: `npx tsx tools/deploy/check-preview.ts <url> [probe|app]` compares `/tmp/flo-preview-build/<entry>` (entry defaults to `probe`); an app build is selected with `app`. A 200 HTML SPA fallback for a non-HTML asset reports `missing file`, while block pages remain `PENDING`.
- `BASE_URL=https://app.flo-preview-cm6.pages.dev npm run e2e -- --grep "@headers|@network"`: PASS, 10 passed, 4 skipped. Header and first-party network checks passed; 0 failed requests, 0 CSP violations, 0 browser errors.
- `https://flo-preview-cm6.pages.dev/`: probe title present; `/probe-sw.js`: HTTP 200. Production probe remains intact.
- `npm run check`: PASS; 23 test files and 234 tests passed; typecheck, lint, formatting, dependency/secrets/data/copy checks and bundle-size budget passed.

## Privacy

No secrets or real health data are recorded here. The app preview uses synthetic fixture content only.
