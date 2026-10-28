#!/usr/bin/env bash
# Install Flo's custom agents for the Windows user so they also load in chats that have no Flo
# workspace (VS Code / Copilot user agents folder). The repository copy in .github/agents is the
# source of truth; re-run this from the primary checkout (on main) after any agent change lands.
#
# Usage: tools/agent-ops/install-user-agents.sh [--check]
#   --check   report differences only; exit 1 if the installed copies are missing or stale
# Env: COPILOT_AGENTS_DIR (default: <Windows %USERPROFILE%>/.copilot/agents via WSL interop,
#      falling back to /mnt/c/Users/$USER/.copilot/agents)
# Only flo-*.agent.md files are written; other agents in the folder are never touched.
set -euo pipefail

src="$(cd "$(dirname "$0")/../.." && pwd)/.github/agents"
dest=${COPILOT_AGENTS_DIR:-}
if [[ -z $dest ]]; then
  if win_home=$(cmd.exe /c 'echo %USERPROFILE%' </dev/null 2>/dev/null | tr -d '\r') && [[ -n $win_home ]]; then
    dest="$(wslpath "$win_home")/.copilot/agents"
  else
    dest="/mnt/c/Users/$USER/.copilot/agents"
  fi
fi
check=0
case ${1:-} in
  "") ;;
  --check) check=1 ;;
  *) echo "usage: install-user-agents.sh [--check]  (run from the primary checkout on main)" >&2; exit 2 ;;
esac

shopt -s nullglob
files=("$src"/flo-*.agent.md)
[[ ${#files[@]} -gt 0 ]] || { echo "install-user-agents: no flo-*.agent.md in $src" >&2; exit 1; }
[[ $check == 1 ]] || mkdir -p "$dest"

stale=0
for f in "${files[@]}"; do
  name=$(basename "$f")
  if cmp -s "$f" "$dest/$name"; then
    echo "up to date  $name"
  elif [[ $check == 1 ]]; then
    if [[ -e $dest/$name ]]; then echo "stale       $name"; else echo "missing     $name"; fi
    stale=1
  else
    cp "$f" "$dest/$name"
    echo "installed   $name -> $dest"
  fi
done
for f in "$dest"/flo-*.agent.md; do
  [[ -e $src/$(basename "$f") ]] || echo "extra       $(basename "$f") (not in the repository; left in place)"
done
exit $stale
