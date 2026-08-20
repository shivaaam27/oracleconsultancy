@echo off
REM Builds the installer you hand to somebody: installer\out\Oracle Consultancy Setup.exe
REM
REM ⚠️ READ desktop-win\README.md FIRST. On a machine with Windows Smart App
REM Control switched on, an UNSIGNED build of this will not run at all — Windows
REM blocks it outright, wherever it is installed from. Signing, or the Microsoft
REM Store, is what makes it work. This script exists so the packaging is ready
REM for that day; it does not make an unsigned build usable.
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
