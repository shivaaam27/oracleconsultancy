@echo off
REM Builds the app into publish-folder\ (9 files).
REM
REM NOTE: this file is deliberately plain ASCII. cmd.exe reads batch files in a
REM legacy codepage, so a smart dash or an emoji in a REM line gets treated as a
REM COMMAND and the script dies with "'...' is not recognized". It happened.
REM
REM TWO RULES, BOTH LEARNED THE HARD WAY:
REM
REM  1. NEVER ADD -p:PublishSingleFile=true. A single-file build is a compressed
REM     self-extracting executable, the shape of a malware dropper, and Windows
REM     Smart App Control BLOCKS it outright - signed or not, wherever it sits.
REM     Measured 20 Aug 2026: packed = blocked, unpacked = runs.
REM
REM  2. --self-contained FALSE. Self-contained ships the whole Windows Desktop
REM     runtime (145 MB, a 51 MB installer), which does not fit the 50 MB ceiling
REM     of the store the installer is hosted in, so one-click updates stop
REM     working. Framework-dependent is 1.4 MB and needs the .NET 8 Desktop
REM     Runtime on the machine; the installer checks for it and says so.
REM
REM To hand someone ONE file, run build-installer.cmd instead.
setlocal
cd /d "%~dp0"
dotnet publish -c Release -r win-x64 --self-contained false -p:PublishSingleFile=false -o publish-folder
if errorlevel 1 exit /b 1
echo.
echo Done: %~dp0publish-folder\Oracle Consultancy.exe
echo For one shareable file, run build-installer.cmd
