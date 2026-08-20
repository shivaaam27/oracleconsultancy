@echo off
REM Builds the app into publish-folder\.
REM
REM ⚠️ DO NOT ADD -p:PublishSingleFile=true. A single-file build is a compressed
REM self-extracting executable, which is the shape of a malware dropper, and
REM Windows Smart App Control BLOCKS it outright — signed or not, wherever it
REM sits. Measured both ways on 20 Aug 2026: packed = blocked, unpacked = runs.
REM The original ORI shell on this machine is also unsigned C# + WebView2 and
REM runs perfectly well, and the only difference is that it ships as files.
REM
REM Self-contained, so there is no .NET runtime for anyone to install first.
REM To hand someone ONE file, run build-installer.cmd instead.
setlocal
cd /d "%~dp0"
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o publish-folder
if errorlevel 1 exit /b 1
echo.
echo Done: %~dp0publish-folder\Oracle Consultancy.exe
echo For one shareable file, run build-installer.cmd
