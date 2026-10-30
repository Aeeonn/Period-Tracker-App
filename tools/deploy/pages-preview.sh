#!/usr/bin/env bash
set -euo pipefail
set +x

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"

usage() {
  printf 'Usage: %s <probe|app> [--push-url <https URL> --vapid-public-key <base64url>]\n' "${0##*/}" >&2
}

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
  local project_name="$1"
  env -i PATH="$PATH" PAGES_PROJECT_NAME="$project_name" node -e '
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
        const projectName = process.env.PAGES_PROJECT_NAME;
        const found = projects.some((project) =>
          project?.["Project Name"] === projectName || project?.name === projectName
        );
        process.stdout.write(found ? "present" : "absent");
      });
    '
}

check_project_fixture() {
  local label="$1" project_name="$2" expected="$3" fixture="$4" actual
  if ! actual="$(printf '%s\n' "$fixture" | parse_project_list "$project_name")"; then
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
    flo-preview \
    present \
    '[{"Project Name":"flo-preview","Project Domains":[],"Git Provider":null,"Last Modified":null}]'
  check_project_fixture 'legacy name' flo-preview present '[{"name":"flo-preview"}]'
  check_project_fixture 'absent project' flo-preview absent '[{"Project Name":"another-project"}]'
}

substitute_relay_origin() {
  local headers_file="$1" origin="$2"
  if [[ -n "$origin" ]]; then
    sed -i "s|__RELAY_ORIGIN__| $origin|g" "$headers_file"
  else
    sed -i 's/__RELAY_ORIGIN__//g' "$headers_file"
  fi
}

self_check_csp_substitution() {
  local fixture expected actual
  fixture="$(mktemp)"
  printf '%s\n' "connect-src 'self'__RELAY_ORIGIN__;" > "$fixture"
  substitute_relay_origin "$fixture" 'https://relay.example.test'
  expected="connect-src 'self' https://relay.example.test;"
  actual="$(cat "$fixture")"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "$fixture"
    printf 'CSP substitution returned an unexpected configured directive.\n' >&2
    return 1
  fi

  printf '%s\n' "connect-src 'self'__RELAY_ORIGIN__;" > "$fixture"
  substitute_relay_origin "$fixture" ''
  expected="connect-src 'self';"
  actual="$(cat "$fixture")"
  rm -f "$fixture"
  if [[ "$actual" != "$expected" ]]; then
    printf 'CSP substitution returned an unexpected unconfigured directive.\n' >&2
    return 1
  fi
  printf 'CSP relay-origin substitution: PASS (configured and unconfigured).\n'
}

validate_push_configuration() {
  node - "$push_url" "$vapid_public_key" <<'NODE'
const [urlText, key] = process.argv.slice(2);
function fail(message) {
  console.error(message);
  process.exit(2);
}
if (!urlText || urlText !== urlText.trim()) fail('Push URL must be an HTTPS URL with a path.');
let url;
try {
  url = new URL(urlText);
} catch {
  fail('Push URL must be an HTTPS URL with a path.');
}
if (
  url.protocol !== 'https:' ||
  !url.hostname ||
  url.pathname === '/' ||
  url.username !== '' ||
  url.password !== '' ||
  url.search !== '' ||
  url.hash !== ''
) {
  fail('Push URL must be an HTTPS URL with a path and no credentials, query, or fragment.');
}
if (!/^[A-Za-z0-9_-]+$/.test(key)) {
  fail('VAPID public key must be canonical base64url decoding to 65 bytes.');
}
const decoded = Buffer.from(key, 'base64url');
if (decoded.length !== 65 || decoded.toString('base64url') !== key) {
  fail('VAPID public key must be canonical base64url decoding to 65 bytes.');
}
process.stdout.write(url.origin);
NODE
}

if [[ "$#" -eq 1 && "$1" == --self-check-project-parser ]]; then
  self_check_project_parser
  exit $?
fi
if [[ "$#" -eq 1 && "$1" == --self-check-csp-substitution ]]; then
  self_check_csp_substitution
  exit $?
fi

if [[ "$#" -lt 1 ]]; then
  usage
  exit 2
fi

entry="$1"
shift
case "$entry" in
  probe|app) ;;
  *)
    printf 'Unknown entry: %s (expected probe or app)\n' "$entry" >&2
    usage
    exit 2
    ;;
esac

push_url=''
vapid_public_key=''
push_url_seen=false
vapid_key_seen=false
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --push-url)
      if [[ "$push_url_seen" == true || "$#" -lt 2 ]]; then
        printf 'Provide --push-url exactly once with an HTTPS URL.\n' >&2
        exit 2
      fi
      push_url="$2"
      push_url_seen=true
      shift 2
      ;;
    --vapid-public-key)
      if [[ "$vapid_key_seen" == true || "$#" -lt 2 ]]; then
        printf 'Provide --vapid-public-key exactly once.\n' >&2
        exit 2
      fi
      vapid_public_key="$2"
      vapid_key_seen=true
      shift 2
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ "$push_url_seen" != "$vapid_key_seen" ]]; then
  printf 'Push configuration requires both --push-url and --vapid-public-key.\n' >&2
  exit 2
fi
if [[ "$push_url_seen" == true && "$entry" != probe ]]; then
  printf 'Preview push settings are only supported for the probe build.\n' >&2
  exit 2
fi

relay_origin=''
if [[ "$push_url_seen" == true ]]; then
  relay_origin="$(validate_push_configuration)"
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
export VITE_PREVIEW_PUSH_URL="$push_url"
export VITE_PREVIEW_VAPID_PUBLIC_KEY="$vapid_public_key"
unset RELAY_ORIGIN CUSTOM_DOMAIN_ORIGIN

out_dir="/tmp/flo-preview-build/$entry"
mkdir -p "$(dirname "$out_dir")"

if [[ "$entry" == probe ]]; then
  npx --no-install vite build probe --config "$repo/vite.config.ts" --outDir "$out_dir" --base ./ --emptyOutDir
  cp -R "$repo/public/." "$out_dir/"
  substitute_relay_origin "$out_dir/_headers" "$relay_origin"
  sed -i '/^__CUSTOM_DOMAIN_HSTS_RULE__$/d' "$out_dir/_headers"
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

project_name=flo-preview
project_list_output=''
project_list_status=0
set +e
project_list_output="$(run_wrangler_json pages project list --json)"
project_list_status=$?
set -e

if [[ "$project_list_status" -ne 0 ]]; then
  printf 'Could not verify whether Pages project %s exists (project-list status %s).\n' "$project_name" "$project_list_status" >&2
  exit "$project_list_status"
fi
project_parse_status=0
set +e
project_state="$(printf '%s\n' "$project_list_output" | parse_project_list "$project_name")"
project_parse_status=$?
set -e
if [[ "$project_parse_status" -ne 0 ]]; then
  printf 'Could not parse Wrangler Pages project-list output.\n' >&2
  printf 'Sanitized project-list output: %s\n' "$project_list_output" >&2
  exit "$project_parse_status"
fi
if [[ "$project_state" != present && "$project_state" != absent ]]; then
  printf 'Could not parse Wrangler Pages project-list output.\n' >&2
  printf 'Sanitized project-list output: %s\n' "$project_list_output" >&2
  exit 1
fi
if [[ "$project_state" == absent ]]; then
  if [[ "$entry" == probe ]]; then
    printf 'Pages project %s is absent; refusing to create a resource.\n' "$project_name" >&2
    printf 'Sanitized project-list output: %s\n' "$project_list_output" >&2
    exit 1
  fi
  printf 'Pages project %s is absent; creating the approved project once.\n' "$project_name"
  run_wrangler pages project create "$project_name" --production-branch main
else
  printf 'Pages project %s already exists; skipping creation.\n' "$project_name"
fi

run_wrangler pages deploy "$out_dir" --project-name "$project_name" --branch main --commit-dirty=false
