@echo off
setlocal
rem ============================================================
rem  Circular Colosseum Simulator + stat calculator : local launcher
rem
rem  Keep this file ASCII-only + CRLF. Non-ASCII text in a .bat is
rem  read with the console code page and can break parsing (cmd
rem  then splits lines at stray bytes) if the file is re-saved as
rem  UTF-8. English messages are used on purpose.
rem
rem  The site root MUST be the repository root (the parent of
rem  new44), because new44/index.html loads ../gt.html in an
rem  iframe to compute player stats. Same layout as GitHub Pages.
rem  launcher.mjs detects this automatically.
rem
rem  What it starts (both bound to 127.0.0.1 only):
rem    8000  static files
rem    8799  API proxy  <- required: the API checks the request
rem          origin and a web page is not allowed to set it
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

node "%~dp0launcher.mjs" %*
if errorlevel 1 (
    echo.
    echo   Launcher exited with an error. See the messages above.
    pause
)

endlocal
