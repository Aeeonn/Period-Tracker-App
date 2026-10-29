#!/usr/bin/env bash
# FB-02 measurement on the live preview relay (synthetic data only).
# Sends 50 signed synthetic requests (ECDSA P-256 verify + D1 read/write), then 50 more that also
# VAPID-sign and encrypt one push (built, not sent), and reports per-phase CPU-time p50/p95 from
# Cloudflare's GraphQL Workers analytics and whether 10 ms is exceeded.
# The preview enrollment secret goes only to the request generator and the Cloudflare credential
# only to the analytics reader; neither is printed.
set -euo pipefail
set +x
export WRANGLER_SEND_METRICS=false

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"
relay_url="${FLO_PREVIEW_RELAY_URL:-https://flo-preview-relay.my-app123.workers.dev}"
preview_env="${FLO_PREVIEW_ENV:-$HOME/.config/flo-deploy/preview-relay.env}"
cloudflare_env="${FLO_CLOUDFLARE_ENV:-$HOME/.config/flo-deploy/cloudflare.env}"
count="${FLO_MEASURE_COUNT:-50}"

windows="$(mktemp)"
trap 'rm -f "$windows"' EXIT

(
  set -a && . "$preview_env" && set +a
  FLO_PREVIEW_RELAY_URL="$relay_url" npx --no-install tsx relay-spike/scripts/measure.ts "$windows" "$count"
)
(
  set -a && . "$cloudflare_env" && set +a
  npx --no-install tsx relay-spike/scripts/analytics.ts "$windows"
)
