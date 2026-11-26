#!/usr/bin/env bash
# Deploy Flo Lite for real use to https://flo-lite.pages.dev (owner-approved, 2026-11-25).
# Usage: tools/deploy/app.sh
# Deploys the committed working tree only; refuses uncommitted changes.
set -euo pipefail
set +x

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"

relay_url=https://flo-lite-relay.my-app123.workers.dev

if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Commit your changes first; this deploys exactly what is committed.\n' >&2
  exit 2
fi

redact() {
  sed -E \
    -e 's/[[:xdigit:]]{32}/[redacted]/g' \
    -e 's/((authorization|bearer|api[_ -]?token)[[:space:]:=]+)[[:alnum:]_./+=-]+/\1[redacted]/Ig'
}

out_dir=/tmp/flo-lite-build/app
rm -rf "$out_dir"
VITE_RELAY_URL="$relay_url" npm run build -- --outDir "$out_dir" --emptyOutDir
grep -q "connect-src 'self' $relay_url" "$out_dir/_headers"

export WRANGLER_SEND_METRICS=false WRANGLER_HIDE_BANNER=true
(
  set -a
  . "$HOME/.config/flo-deploy/cloudflare.env"
  set +a
  npx --no-install wrangler pages deploy "$out_dir" --project-name flo-lite \
    --branch main --commit-hash "$(git rev-parse HEAD)" --commit-dirty=false
) 2>&1 | redact
