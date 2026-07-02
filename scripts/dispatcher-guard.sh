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

# Already running? The dispatcher heartbeats the lock file every ~30s, so a
# FRESH lock (< 3 minutes old) means a live dispatcher. A PID check alone was
# fooled by PID reuse / bash-vs-Windows PID mismatch, which silently kept the
# agent off — freshness is the truth.
if [ -f "$LOCK" ]; then
  NOW=$(date +%s)
  MTIME=$(stat -c %Y "$LOCK" 2>/dev/null || stat -f %m "$LOCK" 2>/dev/null || echo 0)
  if [ $((NOW - MTIME)) -lt 180 ]; then
    exit 0
  fi
  # Stale lock — a previous dispatcher died. Clear it and start fresh.
  rm -f "$LOCK"
fi

# Make sure the npm global bin (where `claude` lives) is on PATH for the daemon.
export PATH="$PATH:${APPDATA:-}/npm"

# Launch detached; survives the hook returning. Record its PID for the guard.
nohup npx tsx scripts/agent-dispatcher.ts >> "$LOG" 2>&1 &
echo $! > "$LOCK"
disown || true
exit 0
