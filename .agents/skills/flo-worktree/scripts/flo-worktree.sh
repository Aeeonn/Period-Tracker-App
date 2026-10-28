#!/usr/bin/env bash
# Flo worktree slots for fm/<task-id> work. Replaces Firstmate's spawn-time isolation for the
# VS Code Copilot orchestrator. Slots live in the treehouse pool, but `treehouse get/return/prune`
# cannot see Copilot workers, so this script claims slots with native `git worktree lock`.
#
# Usage:
#   flo-worktree.sh list                                  every slot: state, branch/HEAD, dirty files, lock reason
#   flo-worktree.sh acquire <task-id> [--base <ref>]      ship: new branch fm/<task-id> from <ref> (default main)
#   flo-worktree.sh acquire <task-id> --detach <sha>      verify laboratory: detached at the exact candidate
#   flo-worktree.sh acquire <task-id> --resume            existing fm/<task-id>: its current slot, or a free one
#     add --new to any acquire to skip reuse and create a fresh slot (e.g. while an older session is live)
#   flo-worktree.sh path <task-id>                        print the slot claimed by <task-id>
#   flo-worktree.sh release <task-id>                     clean slot only: detach at main and unlock
#
# A slot is free only when it is in the pool, unlocked, detached, clean and its HEAD is already on main.
# Nothing here deletes a branch, discards changes, forces, or touches the primary checkout's files.
# Env: FLO_REPO (default ~/code/flo), FLO_POOL (default ~/.treehouse/flo-333f10)
set -euo pipefail

REPO=${FLO_REPO:-$HOME/code/flo}
POOL=${FLO_POOL:-$HOME/.treehouse/flo-333f10}

die() { echo "flo-worktree: $*" >&2; exit 1; }
g() { git -C "$REPO" "$@"; }

# One line per worktree: path<TAB>branch-or-'-'<TAB>head<TAB>lock-reason-or-'-'
worktrees() {
  g worktree list --porcelain | awk '
    function emit() { if (p != "") print p "\t" b "\t" h "\t" l }
    /^worktree / { emit(); p = substr($0, 10); b = "-"; h = ""; l = "-" }
    /^HEAD / { h = $2 }
    /^branch / { b = substr($2, 12) }
    /^locked/ { l = substr($0, 8); if (l == "") l = "locked" }
    END { emit() }'
}

dirty_count() { git -C "$1" status --porcelain | wc -l | tr -d ' '; }

is_free() { # path branch head lock
  [[ $1 == "$POOL"/* && $2 == "-" && $4 == "-" ]] || return 1
  [[ $(dirty_count "$1") == 0 ]] || return 1
  g merge-base --is-ancestor "$3" main
}

claimed_by() { # task-id -> path (pool slots only; never the primary checkout)
  local id=$1 p b h l
  while IFS=$'\t' read -r p b h l; do
    [[ $p == "$POOL"/* ]] || continue
    if [[ $b == "fm/$id" || $l == "fm:$id" || $l == "fm:$id "* ]]; then
      echo "$p"
      return 0
    fi
  done < <(worktrees)
  return 1
}

branch_of() { git -C "$1" symbolic-ref --quiet --short HEAD || true; }

next_slot_path() {
  local n=1
  while [[ -e $POOL/$n ]]; do n=$((n + 1)); done
  echo "$POOL/$n/flo"
}

new_slot() {
  local path
  path=$(next_slot_path)
  mkdir -p "$(dirname "$path")"
  g worktree add --detach "$path" main >&2
  if cmp -s "$REPO/package-lock.json" "$path/package-lock.json" && [[ -d $REPO/node_modules ]]; then
    cp -a "$REPO/node_modules" "$path/node_modules"
  else
    echo "flo-worktree: no matching node_modules copied; the worker runs 'npm ci --ignore-scripts' from the approved lockfile" >&2
  fi
  echo "$path"
}

pick_slot() {
  local p b h l
  while IFS=$'\t' read -r p b h l; do
    if is_free "$p" "$b" "$h" "$l"; then
      echo "$p"
      return 0
    fi
  done < <(worktrees)
  new_slot
}

cmd_list() {
  local p b h l state
  printf '%-44s %-9s %-38s %-6s %s\n' SLOT STATE BRANCH@HEAD DIRTY LOCK
  while IFS=$'\t' read -r p b h l; do
    if [[ $p == "$REPO" ]]; then state=primary
    elif is_free "$p" "$b" "$h" "$l"; then state=free
    elif [[ $l != "-" ]]; then state=claimed
    else state=in-use?
    fi
    printf '%-44s %-9s %-38s %-6s %s\n' "${p/#$HOME/\~}" "$state" "$b@${h:0:7}" "$(dirty_count "$p")" "$l"
  done < <(worktrees)
  echo "in-use? = unlocked but not free (a branch, local changes, or an unlanded HEAD); never reuse it blindly." >&2
}

cmd_acquire() {
  local id=${1:-} mode=ship base=main sha="" path fresh=0
  [[ -n $id ]] || die "usage: acquire <task-id> [--base <ref> | --detach <sha> | --resume] [--new]"
  shift
  while [[ $# -gt 0 ]]; do
    case $1 in
      --base) base=${2:?}; shift 2 ;;
      --detach) mode=detach; sha=${2:?}; shift 2 ;;
      --resume) mode=resume; shift ;;
      --new) fresh=1; shift ;;
      *) die "unknown option $1" ;;
    esac
  done
  [[ $id =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "invalid task id '$id'"
  local branch="fm/$id"

  if path=$(claimed_by "$id"); then
    [[ $mode == resume || $mode == detach ]] || die "$id already has $path; use --resume"
    if [[ $mode == detach ]]; then
      [[ -z $(branch_of "$path") ]] || die "$path holds branch $(branch_of "$path"); verify laboratories use their own id (e.g. <ship-id>-verify)"
      [[ $(dirty_count "$path") == 0 ]] || die "$path has local changes; not moving it"
      g rev-parse --verify --quiet "$sha^{commit}" >/dev/null || die "unknown commit $sha"
      git -C "$path" switch --quiet --detach "$sha"
    elif [[ $(branch_of "$path") != "$branch" ]]; then
      die "$path is claimed by $id but is not on $branch; resolve by hand"
    fi
    git -C "$REPO" worktree lock --reason "fm:$id" "$path" 2>/dev/null || true
    echo "$path"
    return 0
  fi

  case $mode in
    ship)
      g show-ref --verify --quiet "refs/heads/$branch" && die "$branch already exists; use --resume"
      g rev-parse --verify --quiet "$base^{commit}" >/dev/null || die "unknown base $base" ;;
    resume) g show-ref --verify --quiet "refs/heads/$branch" || die "$branch does not exist" ;;
    detach) g rev-parse --verify --quiet "$sha^{commit}" >/dev/null || die "unknown commit $sha" ;;
  esac

  if [[ $fresh == 1 ]]; then path=$(new_slot); else path=$(pick_slot); fi
  g worktree lock --reason "fm:$id" "$path"
  if ! case $mode in
    ship) git -C "$path" switch --quiet -c "$branch" "$base" ;;
    resume) git -C "$path" switch --quiet "$branch" ;;
    detach) git -C "$path" switch --quiet --detach "$sha" ;;
  esac; then
    g worktree unlock "$path"
    die "checkout failed in $path; slot unlocked"
  fi
  if ! cmp -s "$REPO/package-lock.json" "$path/package-lock.json"; then
    echo "flo-worktree: package-lock.json differs from the primary checkout; run 'npm ls --depth=0' before trusting node_modules" >&2
  fi
  echo "$path"
}

cmd_path() {
  claimed_by "${1:?usage: path <task-id>}" || die "no slot claimed by ${1}"
}

cmd_release() {
  local id=${1:?usage: release <task-id>} path
  path=$(claimed_by "$id") || die "no slot claimed by $id"
  [[ $path == "$POOL"/* ]] || die "$path is not a pool slot"
  [[ $(dirty_count "$path") == 0 ]] || die "$path has local changes; commit or report them first (nothing discarded)"
  git -C "$path" switch --quiet --detach main
  g worktree unlock "$path" 2>/dev/null || true
  echo "released $path (branch fm/$id, if any, is kept)"
}

case ${1:-} in
  list) cmd_list ;;
  acquire) shift; cmd_acquire "$@" ;;
  path) shift; cmd_path "$@" ;;
  release) shift; cmd_release "$@" ;;
  *) awk 'NR > 1 && /^#/ { print; next } NR > 1 { exit }' "$0"; exit 2 ;;
esac
