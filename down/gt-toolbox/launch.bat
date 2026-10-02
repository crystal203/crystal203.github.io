@echo off
setlocal
rem ============================================================
rem  gt-toolbox launcher (Windows)
rem
rem  Keep this file ASCII-only + CRLF. Non-ASCII text in a .bat is
rem  read with the console code page and can break parsing.
rem  English messages are used on purpose.
rem
rem  Starts launcher.mjs, which serves site/ and forwards the API
rem  calls the pages need. Requires Node.js 18+ (for fetch).
rem ============================================================

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   [ERROR] Node.js not found.
    echo.
    echo   These tools need Node.js 18 or newer.
    echo   Download it from https://nodejs.org/  then run this file again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODEMAJOR=%%v"
if %NODEMAJOR% LSS 18 (
    echo.
    echo   [ERROR] Node.js 18 or newer is required. Found:
    node -v
    echo   Download it from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

node "%~dp0launcher.mjs"
if errorlevel 1 (
    echo.
    echo   Launcher exited with an error. See the messages above.
    pause
)

endlocal
