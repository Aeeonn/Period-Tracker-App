#!/usr/bin/env bash
# FB-06 relay half against the live preview relay: 401 without the secret, 401 with a wrong one,
# and with the preview secret exactly one encrypted Web Push attempt to a synthetic subscription.
# The preview enrollment secret is loaded only into the client process and never printed.
set -euo pipefail
set +x

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"
relay_url="${FLO_PREVIEW_RELAY_URL:-https://flo-preview-relay.my-app123.workers.dev}"
preview_env="${FLO_PREVIEW_ENV:-$HOME/.config/flo-deploy/preview-relay.env}"

(
  set -a && . "$preview_env" && set +a
  FLO_PREVIEW_RELAY_URL="$relay_url" npx --no-install tsx relay-spike/scripts/push-test.ts
)
