#!/usr/bin/env bash
# Creates the preview-only enrollment secret and VAPID key pair once, outside the repository, in
# ~/.config/flo-deploy/preview-relay.env (mode 600), and uploads them as Worker secrets of the
# preview Worker flo-preview-relay. The Worker receives only the SHA-256 of the enrollment secret.
# No secret value is printed. The Cloudflare credential is loaded only into the wrangler processes.
set -euo pipefail
set +x
export WRANGLER_SEND_METRICS=false
# Skips wrangler's banner and with it the npm-registry version check (no extra endpoint).
export WRANGLER_HIDE_BANNER=true

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"
preview_env="${FLO_PREVIEW_ENV:-$HOME/.config/flo-deploy/preview-relay.env}"
cloudflare_env="${FLO_CLOUDFLARE_ENV:-$HOME/.config/flo-deploy/cloudflare.env}"
config="relay-spike/wrangler.toml"

if [ ! -f "$preview_env" ]; then
  (
    umask 077
    npx --no-install tsx relay-spike/scripts/preview-secrets.ts new >"$preview_env.tmp"
    mv "$preview_env.tmp" "$preview_env"
  )
  echo "created $preview_env (preview-only values, not printed)"
fi
chmod 600 "$preview_env"

secret() {
  (set -a && . "$preview_env" && set +a && npx --no-install tsx relay-spike/scripts/preview-secrets.ts "$1")
}

put() {
  (set -a && . "$cloudflare_env" && set +a && npx --no-install wrangler secret put "$1" --config "$config")
}

secret hash | put ENROLLMENT_SECRET_HASH
secret vapid | put VAPID_PRIVATE_JWK
