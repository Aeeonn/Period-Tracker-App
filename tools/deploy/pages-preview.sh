#!/usr/bin/env bash
# Deploy a synthetic-data preview of the app to Cloudflare Pages.
# Usage: tools/deploy/pages-preview.sh --branch <alias>
# Set VITE_RELAY_URL in the environment to turn on sharing in the preview.
set -euo pipefail
set +x

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"

if [[ "$#" -ne 2 || "$1" != --branch ]]; then
  printf 'Usage: %s --branch <alias>\n' "${0##*/}" >&2
  exit 2
fi
branch="$2"
# "main" is the Pages production branch; previews always use another alias.
if [[ "$branch" == main || ! "$branch" =~ ^[a-z0-9][a-z0-9-]{0,27}$ ]]; then
  printf 'The alias must be 1-28 lowercase letters, digits or hyphens, and not main.\n' >&2
  exit 2
fi

redact() {
  sed -E \
    -e 's/[[:xdigit:]]{32}/[redacted]/g' \
    -e 's/((authorization|bearer|api[_ -]?token)[[:space:]:=]+)[[:alnum:]_./+=-]+/\1[redacted]/Ig'
}

out_dir=/tmp/flo-preview-build/app
rm -rf "$out_dir"
npm run build -- --outDir "$out_dir" --emptyOutDir

export WRANGLER_SEND_METRICS=false WRANGLER_HIDE_BANNER=true
(
  set -a
  . "$HOME/.config/flo-deploy/cloudflare.env"
  set +a
  npx --no-install wrangler pages deploy "$out_dir" --project-name flo-preview \
    --branch "$branch" --commit-dirty=false
) 2>&1 | redact
