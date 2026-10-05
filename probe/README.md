# Synthetic device feasibility probe

This is a standalone Vite-compatible page for P0 feasibility checks. It is deliberately separate from the tracker: it does not accept health information, does not integrate with the product, and uses only synthetic fixtures. The only non-platform runtime import is `jsqr`, an already approved QR decoder in the architecture; QR fixture pixels are embedded locally. No package or build configuration is added here.

## Run and verify

The corrected, reviewed project toolchain is a prerequisite for running these commands. Do not install or reconstruct it from an unlanded candidate. After the approved toolchain handoff, run from the repository root:

```sh
npm run check
npm run e2e -- --grep @probe
```

The focused acceptance run must contain an actual `@probe` test and report its test count; a zero-test grep is not evidence. The test is disposable synthetic Playwright work and should be kept outside the three owned files, then removed. It should assert that all six result rows render without page errors and record requests with push unconfigured, confirming all requests are same-origin. Do not claim either check passed until it has actually run.

For a local browser session after the toolchain is installed, run `./node_modules/.bin/vite --host 127.0.0.1` and open `http://127.0.0.1:5173/probe/`. This is a local development check only, not real-iPhone evidence.

For real-device checks, use only the approved HTTPS preview after `p0-probe-deploy` has been authorized and completed. Add the synthetic preview to the iPhone Home Screen from Safari, then launch it as a web app. A local HTTP server, desktop browser, simulator, or Playwright WebKit device profile is not evidence of iPhone behavior. No preview is deployed by this task.

## Controls and result meanings

No sensitive permission prompt is automatic. Camera access, notification permission, file selection, and passkey creation each require a page control. Push is **Not configured** until an approved preview handoff supplies its endpoint and public VAPID key; with neither supplied, the page makes no push request and asks for no notification permission. The page never asks for an administrator or enrollment secret and does not embed or retain credentials. The endpoint handoff must also make the push-test authorization and CORS contract compatible with this credential-free synthetic client; the currently specified enrollment-secret-protected endpoint is not sufficient by itself. If that is unresolved, leave push not configured rather than adding a secret to the page.

Result states mean:

- **Untested:** no result has been demonstrated, the action was cancelled, or a human delivery confirmation is still pending.
- **Not configured:** a required approved preview input is absent or invalid; no network call is made.
- **Unsupported:** the browser does not expose the required API or authenticator capability.
- **Successful:** the specific local operation succeeded, or (for push only) the user confirmed seeing the fixed generic notification. This is not a device-wide support guarantee.
- **Failed:** the requested operation failed or the user reported no notification. Raw browser errors are not retained.

“Successful” storage means only that this page wrote a synthetic IndexedDB marker, closed and reopened the database, and read the marker back. A prior marker is noted if found. `persist()` can be denied, and `estimate()` is approximate; neither promises durability. The copy summary omits origins, device/browser IDs, file names, passkey IDs, push subscription details, raw errors, and key material.

## Synthetic checks

- **FB-03 — storage:** tap **Run storage check**. It requests persistence, reads the approximate quota, then writes and reads back one generic synthetic marker. To collect actual-device evidence, rerun after force-quitting and reopening; separately check after a reboot and after at least seven days. Record `persist()`/quota observations from the device itself. The page cannot simulate or prove those conditions.
- **FB-04 — files:** try the separate share and download controls for the synthetic `.json`, `.csv`, and `.flobak` fixtures, then select a generated file for re-import. A share-sheet handoff or a download request does not prove that Files/AirDrop saved durable bytes. The `.flobak` content here is an unencrypted test fixture, **not** an application backup and contains no key material.
- **FB-05 — camera QR:** the displayed QR contains only `SYNTHETIC-PROBE-V1`. On the target phone, tap **Start camera and scan**, allow access if asked, and point the camera at the QR shown on a second screen. Stop the camera control or a scan timeout releases the stream. A missing decoder/camera API is reported honestly; no camera permission is requested at startup.
- **FB-06 — push:** no endpoint is configured in this source checkout. A future approved handoff must supply the preview `POST /push-test` URL and its public VAPID key at build time, plus resolve the endpoint's authorization/CORS contract without putting an enrollment secret in client code. Only then can the button request permission, create/reuse a synthetic subscription, and submit one test. A successful HTTP response is not proof of delivery; confirm only after seeing the fixed generic notification. Focus mode, closed-app delivery, and actual iPhone behavior still need real-device checks. Without the handoff, the row stays **Not configured** and the page makes no push request.
- **FB-07 — passkey PRF:** after reading the warning, explicitly opt in and tap **Create passkey and test PRF**. This creates a synthetic discoverable passkey in the authenticator/provider; the Web API does not provide this page a delete operation. It does not store the credential ID or PRF output. For offline retry, keep the page open, disconnect the device from the network, check the offline confirmation, and tap **Retry PRF while offline**. The page compares a one-way digest held only in memory and clears comparison state when the page is hidden. This does not test iCloud restoration/provider changes or guarantee retry on other authenticators.
- **FB-10 — KDF timing:** tap **Measure PBKDF2 timing** for one PBKDF2-SHA-256 derivation at exactly 600,000 iterations with synthetic input. Output bytes and input buffers are discarded. A desktop timing is not an iPhone benchmark; measure both actual phones. The planned work factor is never lowered by this page.

All file contents, labels, QR data, database marker values, passkey user labels, and KDF inputs are synthetic. Do not type health, personal, account, or credential data into this probe. Nothing in a Linux or WebKit run establishes actual iPhone support; both iPhones, their iOS versions, Safari/Home Screen context, and each device-specific result must be recorded separately at the P0 device-feasibility gate.
