#!/usr/bin/env bash
# Fails if any tracked or site file matches a private pattern.
# The pattern list lives outside the repo on purpose: it is private itself.
set -euo pipefail
PATTERNS="${MAZE_PRIVATE_PATTERNS:-$HOME/.config/maze-labs/private-patterns.txt}"
[ -f "$PATTERNS" ] || { echo "missing pattern file: $PATTERNS" >&2; exit 2; }
cd "$(git rev-parse --show-toplevel)"
files=$( { git ls-files; find site -type f; } | sort -u | grep -v '^docs/superpowers/' || true)
hits=$(echo "$files" | xargs grep -nIiE -f "$PATTERNS" -- 2>/dev/null || true)
names=$(echo "$files" | grep -iE -f "$PATTERNS" || true)
if [ -n "$hits$names" ]; then printf '%s\n%s\n' "$hits" "$names"; exit 1; fi
echo "privacy-check: clean"
