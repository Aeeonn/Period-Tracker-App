#!/usr/bin/env bash
# Guarded landing for Flo (replaces Firstmate's bin/fm-merge-local.sh for the Copilot orchestrator).
#
# Usage:
#   land.sh land <task-id> <reviewed-sha> [--rebased-from <reviewed-sha>] [--push]
#       Fast-forward the primary checkout's main to fm/<task-id>, whose tip must be exactly
#       <reviewed-sha> (hex, 7-40 chars) and exactly one commit ahead of main. With --push, then
#       publish refs/heads/main only.
#       --rebased-from: the tip is a rebase of the reviewed commit. Pass the tip as <reviewed-sha>
#       and the reviewed commit here; landing proceeds only if both have the same patch-id.
#       Overlapping files changed by main are reported as information, not a refusal.
#       Otherwise the review must be renewed.
#   land.sh push
#       Publish local main only (for orchestrator chore commits such as backlog updates).
#   land.sh preflight
#       Run the checks shared by both commands and print the state; changes nothing.
#
# Guards (any failure stops before changing anything):
#   - primary checkout is on main and fully clean (no staged, unstaged or untracked files);
#   - the remote's fetch and push URLs are exactly the configured one; live remote main is local
#     main or an ancestor of it;
#   - the branch tip equals the reviewed SHA, is one non-merge commit, and fast-forwards from main;
#   - after landing/pushing, local main and live remote main are re-read and compared.
# Never forces, never deletes refs, never pushes anything but refs/heads/main, never reconfigures remotes.
# Env: FLO_REPO (~/code/flo), FLO_REMOTE (Period-Tracker-App),
#      FLO_REMOTE_URL (git@github.com:Aeeonn/Period-Tracker-App.git)
set -euo pipefail

REPO=${FLO_REPO:-$HOME/code/flo}
REMOTE=${FLO_REMOTE:-Period-Tracker-App}
REMOTE_URL=${FLO_REMOTE_URL:-git@github.com:Aeeonn/Period-Tracker-App.git}
HEX='^[0-9a-f]{7,40}$'

die() { echo "land: STOP: $*" >&2; exit 1; }
g() { git -C "$REPO" "$@"; }

remote_main() {
  local out
  out=$(g ls-remote "$REMOTE_URL" refs/heads/main) || die "cannot read live remote main from $REMOTE_URL"
  awk '{print $1}' <<<"$out"
}

resolve_sha() { # hex prefix -> full commit SHA (refuses branch names and revision expressions)
  [[ $1 =~ $HEX ]] || die "'$1' is not a commit SHA (7-40 lowercase hex); branch names and expressions are refused"
  g rev-parse --verify --quiet "$1^{commit}" || die "unknown commit $1"
}

patch_id() { g show "$1" | git patch-id --stable | awk '{print $1}'; }

preflight() {
  [[ $(g rev-parse --abbrev-ref HEAD) == main ]] || die "primary checkout $REPO is not on main"
  [[ -z $(g status --porcelain) ]] || die "primary checkout has local changes; nothing landed"
  local fetch_url push_url
  fetch_url=$(g remote get-url "$REMOTE") || die "remote $REMOTE is not configured"
  push_url=$(g remote get-url --push "$REMOTE")
  [[ $fetch_url == "$REMOTE_URL" && $push_url == "$REMOTE_URL" ]] ||
    die "remote $REMOTE points to $fetch_url (push $push_url), expected $REMOTE_URL"
  LOCAL=$(g rev-parse refs/heads/main)
  LIVE=$(remote_main)
  [[ -n $LIVE ]] || die "remote has no main branch"
  if [[ $LIVE != "$LOCAL" ]]; then
    g cat-file -e "$LIVE^{commit}" 2>/dev/null || die "live remote main $LIVE is unknown locally; fetch and reconcile first"
    g merge-base --is-ancestor "$LIVE" "$LOCAL" || die "live remote main $LIVE has commits local main lacks; reconcile first"
  fi
  echo "preflight: local main ${LOCAL:0:12}, live main ${LIVE:0:12}, remote URLs ok, primary clean"
}

push_main() {
  local before=$LIVE after
  if [[ $before == "$LOCAL" ]]; then
    echo "push: live remote main already at ${LOCAL:0:12}"
    return 0
  fi
  g push "$REMOTE" "refs/heads/main:refs/heads/main"
  after=$(remote_main)
  [[ $after == "$LOCAL" ]] || die "after push live remote main is $after, expected $LOCAL"
  echo "push: main ${before:0:12} -> ${after:0:12}"
}

check_rebase() { # tip reviewed
  local tip=$1 reviewed=$2 parent overlap
  [[ $(g rev-list --count "$reviewed^..$reviewed") == 1 ]] || die "reviewed commit $reviewed is not a single non-root commit"
  [[ $(patch_id "$tip") == "$(patch_id "$reviewed")" ]] ||
    die "rebased tip's patch differs from the reviewed patch; review must be renewed"
  parent=$(g rev-parse "$reviewed^")
  overlap=$(comm -12 \
    <(g diff --name-only --no-renames "$reviewed^" "$reviewed" | sort -u) \
    <(g diff --name-only --no-renames "$parent" "$LOCAL" | sort -u))
  if [[ -n $overlap ]]; then
    local files
    files=$(printf '%s\n' "$overlap" | awk 'BEGIN { ORS=", " } { print }' | sed 's/, $//')
    echo "land: note: main also changed reviewed patch file(s): $files"
  fi
  echo "land: identity-preserving rebase of ${reviewed:0:12} (same patch-id)"
}

cmd_land() {
  local id=${1:?usage: land <task-id> <reviewed-sha> [--rebased-from <sha>] [--push]} want=${2:?reviewed sha required}
  shift 2
  local push=0 from=""
  while [[ $# -gt 0 ]]; do
    case $1 in
      --push) push=1; shift ;;
      --rebased-from) from=${2:?}; shift 2 ;;
      *) die "unknown option $1" ;;
    esac
  done
  [[ $id =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "invalid task id '$id'"
  preflight
  local branch="fm/$id" tip reviewed
  tip=$(g rev-parse --verify --quiet "refs/heads/$branch") || die "no branch $branch"
  reviewed=$(resolve_sha "$want")
  [[ $tip == "$reviewed" ]] || die "$branch is at $tip, not ${reviewed}; renewed review needed"
  g merge-base --is-ancestor "$LOCAL" "$tip" || die "$branch does not fast-forward from main; the worker must rebase"
  [[ $(g rev-list --count "$LOCAL..$tip") == 1 ]] || die "$branch must be exactly one commit ahead of main"
  [[ $(g rev-list --merges --count "$LOCAL..$tip") == 0 ]] || die "$branch contains a merge commit"
  if [[ -n $from ]]; then
    check_rebase "$tip" "$(resolve_sha "$from")"
  fi
  g merge --ff-only --quiet "$tip"
  LOCAL=$(g rev-parse refs/heads/main)
  [[ $LOCAL == "$tip" ]] || die "main is $LOCAL after fast-forward, expected $tip"
  echo "land: main -> ${tip:0:12} ($branch)"
  if [[ $push == 1 ]]; then
    push_main
  fi
}

case ${1:-} in
  land) shift; cmd_land "$@" ;;
  push) preflight; push_main ;;
  preflight) preflight ;;
  *) awk 'NR > 1 && /^#/ { print; next } NR > 1 { exit }' "$0"; exit 2 ;;
esac
