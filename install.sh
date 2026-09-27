#!/usr/bin/env bash
# Install the manifest skill for Claude Code and Codex.
#
#   ./install.sh                 on this machine
#   ./install.sh host [host...]  on other machines, over ssh
#
# Claude Code loads skills from ~/.claude/skills, Codex from ~/.agents/skills. The second copy
# is skipped when ~/.agents/skills already resolves to ~/.claude/skills.
set -euo pipefail

cd "$(dirname "$0")"
RSYNC=(rsync -a --delete --exclude .DS_Store)

# Prints the skill directories to install into, relative to $HOME.
dests() {
  mkdir -p ~/.claude/skills
  echo .claude/skills/manifest
  local agents claude
  agents="$(cd ~/.agents/skills 2>/dev/null && pwd -P || true)"
  claude="$(cd ~/.claude/skills && pwd -P)"
  if [ "$agents" != "$claude" ]; then
    mkdir -p ~/.agents/skills
    echo .agents/skills/manifest
  fi
}

if [ $# -eq 0 ]; then
  dirs="$(dests)"
  for d in $dirs; do
    "${RSYNC[@]}" skill/ ~/"$d"/
    echo "~/$d"
  done
  exit 0
fi

for host in "$@"; do
  dirs="$(ssh "$host" bash -s < <(declare -f dests; echo dests))"
  for d in $dirs; do
    "${RSYNC[@]}" skill/ "$host:$d/"
    echo "$host:~/$d"
  done
done
