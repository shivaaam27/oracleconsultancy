@echo off
REM ── Start ORI's fast helper (the dispatcher) ──────────────────────────────
REM Double-click this after a PC restart to bring back the FAST ORI worker.
REM Leave the window open; close it to stop. The Claude app must be open + logged in.
cd /d "%~dp0"
set "PATH=%PATH%;%APPDATA%\npm"
echo Starting ORI fast helper... (keep this window open)
npx tsx scripts/agent-dispatcher.ts
pause
