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

- Status: **Not configured**. Neither a push URL nor a VAPID public key was supplied at build time; no relay endpoint was used and the probe makes no push request.
- A separate relay change and probe rebuild are required. The intended route is `https://flo-preview-relay.my-app123.workers.dev/push-test`; that change must be origin-bound, credential-free, and serve CORS for the deployed probe origin `https://a9508ed8.flo-preview-cm6.pages.dev`. If using the project's stable origin instead, allow `https://flo-preview-cm6.pages.dev` explicitly as well.
