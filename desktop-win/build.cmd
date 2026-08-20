@echo off
REM Builds the one file you hand to somebody.
REM
REM Self-contained on purpose: it carries .NET inside it, so it runs on any
REM Windows 10/11 machine with nothing to install first. The alternative is
REM 2 MB but needs the .NET 8 Desktop Runtime on every machine, which is one
REM more download, one more thing IT can block, and one more thing to explain.
REM
REM Output: publish\Oracle Consultancy.exe
setlocal
cd /d "%~dp0"
dotnet publish -c Release -r win-x64 --self-contained true ^
  -p:PublishSingleFile=true ^
  -p:IncludeNativeLibrariesForSelfExtract=true ^
  -p:EnableCompressionInSingleFile=true ^
  -o publish
if errorlevel 1 exit /b 1
echo.
echo Done. Share this file:
echo   %~dp0publish\Oracle Consultancy.exe
