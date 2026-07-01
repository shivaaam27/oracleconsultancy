#!/usr/bin/env bash
# dispatcher-guard.sh — launch the ORI dispatcher ONCE, in the background.
# Called from the Claude Code SessionStart hook. If a dispatcher this guard
# started is still alive, it does nothing (no duplicate workers). Otherwise it
# starts a fresh one, detached, logging to dispatcher.log.
set -euo pipefail

# Repo root = the parent of this script's directory, regardless of caller cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOCK="$ROOT/.dispatcher.lock"
LOG="$ROOT/dispatcher.log"

# Already running? (lock holds a live PID → nothing to do.)
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  exit 0
fi

# Make sure the npm global bin (where `claude` lives) is on PATH for the daemon.
export PATH="$PATH:${APPDATA:-}/npm"

# Launch detached; survives the hook returning. Record its PID for the guard.
nohup npx tsx scripts/agent-dispatcher.ts >> "$LOG" 2>&1 &
echo $! > "$LOCK"
disown || true
exit 0
