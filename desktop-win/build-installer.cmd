@echo off
REM Builds the installer you hand to somebody:
REM   installer\out\Oracle Consultancy Setup.exe
REM
REM NOTE: plain ASCII on purpose - see the note in build.cmd.
REM
REM WiX runs through "dotnet wix", NOT the global wix.exe, and that is
REM deliberate. Windows Smart App Control BLOCKED the global tool's wix.exe on
REM this machine part-way through the work - the same delayed verdict that
REM blocks any unsigned executable. Running it as a LOCAL dotnet tool means the
REM process that starts is dotnet.exe, which Microsoft signs, so it is allowed.
REM It also pins the version in .config/dotnet-tools.json, so a new machine gets
REM the same toolset with one "dotnet tool restore".
REM
REM Verified working UNSIGNED on a machine with Smart App Control enforced: it
REM installs per-user, makes the shortcuts, and the app runs. The one thing that
REM must not change is that it ships an unpacked FOLDER.
REM
REM WiX 5, NOT 7 - 7 demands a paid maintenance-fee licence.
setlocal
cd /d "%~dp0"

call "%~dp0build.cmd"
if errorlevel 1 exit /b 1

echo.
echo Restoring the installer toolset...
dotnet tool restore
if errorlevel 1 exit /b 1

echo.
echo Packaging...
dotnet wix build installer\Package.wxs -o "installer\out\Oracle Consultancy Setup.msi"
if errorlevel 1 exit /b 1
dotnet wix build installer\Bundle.wxs -ext WixToolset.BootstrapperApplications.wixext -ext WixToolset.Netfx.wixext -o "installer\out\Oracle Consultancy Setup.exe"
if errorlevel 1 exit /b 1

echo.
echo Done:
echo   %~dp0installer\out\Oracle Consultancy Setup.exe
echo.
echo Next: npm run desktop:hash, then update src/lib/desktop-release.ts
