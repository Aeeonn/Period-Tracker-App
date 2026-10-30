#!/usr/bin/env bash
set -euo pipefail
set +x

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"

if [[ "$#" -ne 1 ]]; then
  printf 'Usage: %s <probe|app>\n' "${0##*/}" >&2
  exit 2
fi

entry="$1"
case "$entry" in
  probe|app|--self-check-project-parser) ;;
  *)
    printf 'Unknown entry: %s (expected probe or app)\n' "$entry" >&2
    exit 2
    ;;
esac

redact_wrangler_output() {
  sed -E \
    -e 's/(account([[:space:]_-]*id|[[:space:]]+in use has id)[[:space:]:=]*)[[:xdigit:]]{32}/\1[redacted]/Ig' \
    -e 's/("account_id"[[:space:]]*:[[:space:]]*")[[:xdigit:]]{32}(")/\1[redacted]\2/Ig' \
    -e 's/[[:xdigit:]]{32}/[redacted]/Ig' \
    -e 's/(authorization[[:space:]:=]+(bearer[[:space:]]+)?)[[:alnum:]_./+=-]+/\1[redacted]/Ig' \
    -e 's/((bearer|api[_ -]?token)[[:space:]:=]+)[[:alnum:]_./+=-]+/\1[redacted]/Ig'
}

load_cloudflare_credentials() {
  set +v +x
  set -a
  . "$HOME/.config/flo-deploy/cloudflare.env"
  set +a
}

parse_project_list() {
  env -i PATH="$PATH" node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const starts = [input.indexOf("["), input.indexOf("{")].filter((index) => index >= 0);
        if (starts.length === 0) { process.exitCode = 2; return; }
        const start = Math.min(...starts);
        let parsed;
        try { parsed = JSON.parse(input.slice(start)); }
        catch { process.exitCode = 2; return; }
        const projects = Array.isArray(parsed) ? parsed :
          Array.isArray(parsed?.result) ? parsed.result :
          Array.isArray(parsed?.projects) ? parsed.projects :
          Array.isArray(parsed?.data) ? parsed.data : null;
        if (!projects) { process.exitCode = 2; return; }
        const found = projects.some((project) =>
          project?.["Project Name"] === "flo-preview" || project?.name === "flo-preview"
        );
        process.stdout.write(found ? "present" : "absent");
      });
    '
}

check_project_fixture() {
  local label="$1" expected="$2" fixture="$3" actual
  if ! actual="$(printf '%s\n' "$fixture" | parse_project_list)"; then
    printf 'Project parser failed for %s fixture.\n' "$label" >&2
    return 1
  fi
  if [[ "$actual" != "$expected" ]]; then
    printf 'Project parser returned %s for %s fixture; expected %s.\n' "$actual" "$label" "$expected" >&2
    return 1
  fi
  printf '%s fixture: %s\n' "$label" "$actual"
}

self_check_project_parser() {
  check_project_fixture \
    'Wrangler-shaped' \
    present \
    '[{"Project Name":"flo-preview","Project Domains":[],"Git Provider":null,"Last Modified":null}]'
  check_project_fixture 'legacy name' present '[{"name":"flo-preview"}]'
  check_project_fixture 'absent project' absent '[{"Project Name":"another-project"}]'
}

if [[ "$#" -eq 1 && "$1" == --self-check-project-parser ]]; then
  self_check_project_parser
  exit $?
fi

run_wrangler() {
  (
    load_cloudflare_credentials
    npx --no-install wrangler "$@"
  ) 2>&1 | redact_wrangler_output
}

run_wrangler_json() {
  (
    load_cloudflare_credentials
    npx --no-install wrangler "$@"
  ) 2> >(redact_wrangler_output >&2) | redact_wrangler_output
}

export WRANGLER_SEND_METRICS=false
export WRANGLER_HIDE_BANNER=true
export VITE_PREVIEW_PUSH_URL=''
export VITE_PREVIEW_VAPID_PUBLIC_KEY=''
unset RELAY_ORIGIN CUSTOM_DOMAIN_ORIGIN

out_dir="/tmp/flo-preview-build/$entry"
mkdir -p "$(dirname "$out_dir")"

if [[ "$entry" == probe ]]; then
  npx --no-install vite build probe --config "$repo/vite.config.ts" --outDir "$out_dir" --base ./ --emptyOutDir
  cp -R "$repo/public/." "$out_dir/"
  sed -i 's/__RELAY_ORIGIN__//g; /^__CUSTOM_DOMAIN_HSTS_RULE__$/d' "$out_dir/_headers"
  if grep -Fq '__RELAY_ORIGIN__' "$out_dir/_headers" || grep -Fq '__CUSTOM_DOMAIN_HSTS_RULE__' "$out_dir/_headers"; then
    printf 'Unresolved security-header build marker.\n' >&2
    exit 1
  fi
else
  npm run build -- --outDir "$out_dir"
fi

build_hash="$(cd "$out_dir" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d ' ' -f 1)"
printf 'Build directory: %s\n' "$out_dir"
printf 'Build listing SHA-256: %s\n' "$build_hash"

project_state=''
project_list_status=0
set +e
project_state="$(
  run_wrangler_json pages project list --json |
    parse_project_list
)"
project_list_status=$?
set -e

if [[ "$project_list_status" -ne 0 ]]; then
  printf 'Could not verify whether Pages project flo-preview exists (project-list status %s).\n' "$project_list_status" >&2
  exit "$project_list_status"
fi
if [[ "$project_state" != present && "$project_state" != absent ]]; then
  printf 'Could not parse Wrangler Pages project-list output.\n' >&2
  exit 1
fi

if [[ "$project_state" == absent ]]; then
  printf 'Pages project flo-preview is absent; creating the approved project once.\n'
  run_wrangler pages project create flo-preview --production-branch main
else
  printf 'Pages project flo-preview already exists; skipping creation.\n'
fi

run_wrangler pages deploy "$out_dir" --project-name flo-preview --branch main --commit-dirty=false
