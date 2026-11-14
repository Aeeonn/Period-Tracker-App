# Face ID preview deployment record

Synthetic-data-only preview of optional Face ID unlock and the honoured Lock after setting
([ADR-0016](../adr/0016-passkey-face-id-unlock.md)). This is not P1 or P2 phase approval.

## Production branch deployment — 2026-11-14

The owner explicitly approved putting the current app on the production address
("put everything that's working in the main app", then chose "production").

- Revision: `c9ced53` (merged `main`). Command: `tools/deploy/pages-preview.sh app` (no `--branch`, so the Pages production branch `main`).
- Address: https://flo-preview-cm6.pages.dev (deployment https://3388e641.flo-preview-cm6.pages.dev). This replaces the feasibility probe that was served there.
- `npx --no-install tsx tools/deploy/check-preview.ts https://flo-preview-cm6.pages.dev app`: PASS (8 served files byte-equal). The response has the strict first-party CSP, and the bundle contains the Face ID copy.
- This is the same build as the previews: it still shows "Preview — synthetic data only". It is not the P6 launch and not approval for real health data. P1 gate is still pending.

## Deployment — 2026-11-14

- Revision: `4f74962` (merged `main`).
- Command: `tools/deploy/pages-preview.sh app --branch face-id`.
- Alias: https://face-id.flo-preview-cm6.pages.dev (deployment https://f0b52b1c.flo-preview-cm6.pages.dev).
- Checked after deploy: the alias returns HTTP 200, and the served app bundle contains the
  "Unlock with Face ID" copy.
- Before deploy: `npm run build && npm run check` (462 unit tests), `npm run test:crypto`, and the
  affected Playwright specs with `--workers=1` passed. Face ID was exercised only with a synthetic
  WebAuthn stub, which is not real-iPhone proof.

Passkeys are tied to the hostname, so Face ID set up on another preview link does not carry over.

## Owner-reported real-iPhone checks — 2026-11-14

The owner reported that all requested checks passed on both the iPhone 16 Pro and iPhone 12:
immediate auto-lock after switching apps; Today prediction wording and Calendar marks; VoiceOver
and large text; Face ID setup and unlock; passphrase fallback after cancelling Face ID; and offline
Face ID unlock. The owner was asked to use the main address above and synthetic data. Results are
owner-reported; no device logs or screenshots were collected. This is not P1 or P2 gate approval.

The specific check of setting up Face ID while Lock after is already set to "Immediately" was not
included in that confirmation and remains a follow-up.

### Requested Face ID procedure

1. Open the main address from Safari, add it to the Home Screen, and set up the lock with made-up data.
2. Settings → Face ID → turn it on with the passphrase.
3. Force-quit, reopen, and tap "Unlock with Face ID".
4. Cancel the Face ID prompt and check the passphrase still unlocks.
5. Set Lock after to "Immediately", switch apps, return, and check that the app is locked.
6. Turn on Airplane Mode, force-quit, reopen, and unlock with Face ID.
