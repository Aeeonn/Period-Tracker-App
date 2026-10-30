# P0 synthetic probe preview

- Pages project: `flo-preview`; production branch: `main`. The project was created once for this task.
- Assigned project origin: `https://flo-preview-cm6.pages.dev`.
- Deployment URL from Wrangler: `https://a9508ed8.flo-preview-cm6.pages.dev`.
- Deployment ID: `a9508ed8-45d6-48fc-b831-37c17292ab63`.
- Deployed landed-main commit: `8e5466d8f1357df06903afd5e350cdc5253fd338`.
- Wrangler: `4.147.0`.
- Build listing SHA-256: `dc87a9101b769c986a7594789e108c44ab61255e3acf8dc9e103289de5af4995`.
  This is SHA-256 over the sorted `sha256sum` listing, binding each relative path to its file digest. The listing covers six build files, including `_headers`; Wrangler uploaded the five served assets. Cloudflare Pages treats `_headers` as configuration rather than a served asset.

## Verification

- `npx --no-install tsx tools/deploy/check-preview.ts https://a9508ed8.flo-preview-cm6.pages.dev`: **PASS**, all five served files byte-equal. The checker excludes `_headers`, which Cloudflare Pages consumes as configuration rather than serving as an asset.
- Root GETs on both `https://a9508ed8.flo-preview-cm6.pages.dev/` and `https://flo-preview-cm6.pages.dev/` returned HTTP/2 200 with the same policy headers.
- Pages retained the local CSP (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; require-trusted-types-for 'script'; upgrade-insecure-requests`), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, the configured `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and `Cross-Origin-Resource-Policy: same-origin`. No expected policy header was dropped.
- Pages added `Access-Control-Allow-Origin: *` (Pages default), `Cache-Control: public, max-age=0, must-revalidate`, and `X-Robots-Tag: noindex` only on the per-deployment URL; the stable project origin did not return it. It also returned Cloudflare `Report-To`/`NEL` headers (the reporting endpoint is `a.nel.cloudflare.com`), `Server`, `CF-Ray`, `Date`, `Content-Type`, `Content-Length`, `ETag`, and `Alt-Svc`. HSTS is omitted for `pages.dev` as expected.
- `/sw.js` has `Cache-Control: no-cache` in the local `_headers` config; the probe output has no `sw.js`, so that path rule was not exercised.

## FB-06 push

- Status: **Configured**. Push URL and VAPID public key were configured from the relay's public endpoint; the public key is not recorded here.
- Pages project: `flo-preview`.
- Deployment ID/URL: `f1ace8e6` (identifier in the Wrangler deployment URL), `https://f1ace8e6.flo-preview-cm6.pages.dev`.
- Build commit (HEAD at build): `85ea971588e5c29596bdfa626aa46b12b18d90c3`.
- Build listing SHA-256: `21b67600b8ffa2c9ed90ea3b44169552516322a74460a47b2f447abc46d6b2b3`.
- Smoke: `npx --no-install tsx tools/deploy/check-preview.ts https://f1ace8e6.flo-preview-cm6.pages.dev` **PASS**, all five served files byte-equal.
- Smoke: `curl -sI https://flo-preview-cm6.pages.dev/` returned HTTP 200; the served CSP includes `connect-src 'self' https://flo-preview-relay.my-app123.workers.dev`.
- Smoke: deployed JavaScript bundle contains `https://flo-preview-relay.my-app123.workers.dev/push-test`.
- Smoke: OPTIONS preflight from `https://flo-preview-cm6.pages.dev` returned HTTP 204 with exact `Access-Control-Allow-Origin: https://flo-preview-cm6.pages.dev`. No POST was sent.
- History: the initial deployment was **Not configured** because no push URL or VAPID public key was supplied; no relay endpoint or probe push request was used. A separate relay change and probe rebuild were required. The intended endpoint was `https://flo-preview-relay.my-app123.workers.dev/push-test`, with origin-bound, credential-free access and CORS for the then-deployed origin `https://a9508ed8.flo-preview-cm6.pages.dev`; the stable origin `https://flo-preview-cm6.pages.dev` could be explicitly allowed instead.

## Manifest-link redeploy (2026-10-30)

- Source commit: `17064af` (landed on `main`).
- Pages project: `flo-preview`; deployment: `https://ef4b1386.flo-preview-cm6.pages.dev`.
- Reason: the probe manifest link lets an iOS Home Screen launch expose the push APIs.
- Smoke checks passed at `https://flo-preview-cm6.pages.dev` and the deployment URL: root HTML contains manifest and apple-touch-icon links; `/manifest.webmanifest` returned 200 with `display: standalone`; `/icons/icon-192.png` returned 200; CSP allows the relay origin; and the bundle contains the `/push-test` URL.
- `check-preview.ts` passed for both origins; all five served files matched the built probe.

## Dedicated push-worker redeploy (2026-10-30)

- Source commit: `627a745` (the push-worker fix), included in landed `main` commit `c80408d`.
- Pages project: `flo-preview`; deployment: `https://df38093c.flo-preview-cm6.pages.dev`.
- Reason: the probe main bundle contains DOM-based modulepreload code; this build serves a dedicated classic worker at `/probe-sw.js` instead.
- Push configuration used the relay's `/push-test` URL and a public VAPID key fetched at build time; the public key is not recorded. No push-test POST was sent.
- `check-preview.ts` on the stable origin and deployment URL: **PASS**, six served files matched on each.
- Orchestrator smoke checks passed on both origins: `/probe-sw.js` returned HTTP 200 with `application/javascript` and a push handler; HTML contained manifest and apple-touch-icon links; `/manifest.webmanifest` returned HTTP 200 with `display: standalone`; `/icons/icon-192.png` returned HTTP 200; CSP retained `connect-src 'self' https://flo-preview-relay.my-app123.workers.dev` and `worker-src 'self'`; the bundle contained `/push-test` and `/probe-sw.js`.
