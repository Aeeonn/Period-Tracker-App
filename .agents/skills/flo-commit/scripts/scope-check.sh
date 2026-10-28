#!/usr/bin/env bash
# Check a Flo task branch before its one Conventional Commit (or after it, before reporting).
#
# Usage: scope-check.sh <base-ref> <owned-glob>...
#   e.g. scope-check.sh main 'src/data/store/**' 'tests/data/**' 'tests/e2e/p0-db-store.spec.ts'
#
# Fails when: run in the primary checkout; any changed, staged or untracked file (both sides of a
# rename) is outside the owned globs (`*` and `**` both match across `/`); `git diff --check` finds
# whitespace errors; more than one commit exists since <base-ref>; or a commit since <base-ref> is
# not a Conventional
# Commit subject or carries a Co-authored-by trailer.
set -euo pipefail

base=${1:?usage: scope-check.sh <base-ref> <owned-glob>...}
shift
[[ $# -gt 0 ]] || { echo "scope-check: list at least one owned glob" >&2; exit 2; }
top=$(git rev-parse --show-toplevel)
primary=${FLO_REPO:-$HOME/code/flo}
fail=0

if [[ $(cd "$top" && pwd -P) == $(cd "$primary" && pwd -P) ]]; then
  echo "scope-check: refusing to run in the primary checkout $primary" >&2
  exit 1
fi

mapfile -t files < <(
  {
    git diff --name-only --no-renames "$base"...HEAD
    git diff --name-only --no-renames --cached
    git diff --name-only --no-renames
    git ls-files --others --exclude-standard
  } | sort -u
)

for f in "${files[@]}"; do
  [[ -n $f ]] || continue
  ok=0
  for glob in "$@"; do
    # Pattern matching in [[ ]] lets `*` cross `/`, so `dir/**` covers the whole subtree.
    # shellcheck disable=SC2053
    if [[ $f == $glob ]]; then ok=1; break; fi
  done
  if [[ $ok == 0 ]]; then
    echo "OUT OF SCOPE: $f"
    fail=1
  fi
done

fork=$(git merge-base "$base" HEAD)
if ! git diff --check "$fork" >/dev/null 2>&1 || ! git diff --cached --check >/dev/null 2>&1; then
  echo "WHITESPACE: git diff --check reports problems"
  git diff --check "$fork" || true
  fail=1
fi

count=$(git rev-list --count "$base"..HEAD)
if [[ $count -gt 1 ]]; then
  echo "COMMITS: $count commits since $base; a task ships exactly one (amend, never force-push)"
  fail=1
fi
conv='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+'
while read -r sha; do
  [[ -n $sha ]] || continue
  subject=$(git log -1 --format=%s "$sha")
  [[ $subject =~ $conv ]] || { echo "SUBJECT: '$subject' is not a Conventional Commit"; fail=1; }
  if git log -1 --format=%B "$sha" | grep -qi '^co-authored-by:'; then
    echo "TRAILER: $sha has a Co-authored-by trailer (Flo commits carry none)"
    fail=1
  fi
done < <(git rev-list "$base"..HEAD)

echo "scope-check: ${#files[@]} changed file(s), $count commit(s) since $base"
[[ $fail == 0 ]] && echo "scope-check: OK" || echo "scope-check: FAILED"
exit $fail
