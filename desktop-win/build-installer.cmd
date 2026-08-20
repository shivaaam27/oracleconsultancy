@echo off
REM Builds the installer you hand to somebody: installer\out\Oracle Consultancy Setup.exe
REM
REM Verified working UNSIGNED on a machine with Windows Smart App Control
REM enforced: it installs per-user, makes the shortcuts, and the app runs. The
REM one thing that must not change is that it ships an unpacked FOLDER — see
REM build.cmd and README.md.
REM
REM Needs WiX 5 (free). Once, on a new machine:
REM   dotnet tool install --global wix --version 5.*
REM   wix extension add -g WixToolset.BootstrapperApplications.wixext/5.0.2
REM ⚠️ NOT WiX 7 — it demands a paid maintenance-fee licence.
setlocal
cd /d "%~dp0"

call build.cmd || exit /b 1

echo.
echo Packaging...
wix build installer\Package.wxs -o "installer\out\Oracle Consultancy Setup.msi" || exit /b 1
wix build installer\Bundle.wxs -ext WixToolset.BootstrapperApplications.wixext -o "installer\out\Oracle Consultancy Setup.exe" || exit /b 1

echo.
echo Done:
echo   %~dp0installer\out\Oracle Consultancy Setup.exe
