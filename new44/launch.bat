@echo off
setlocal
rem ============================================================
rem  Circular Colosseum Simulator - local launcher
rem
rem  The site root MUST be the repository root (the parent of
rem  new44), because new44/index.html loads ../gt.html in an
rem  iframe to compute player stats. Same layout as GitHub Pages.
rem
rem  Keep this file ASCII-only + CRLF. Non-ASCII text in a .bat is
rem  read with the console code page and can break parsing (cmd
rem  then splits lines at stray bytes) if the file is re-saved as
rem  UTF-8. English messages are used on purpose.
rem ============================================================

cd /d "%~dp0.."

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY (
    where py >nul 2>nul && set "PY=py -3"
)
if not defined PY (
    echo [ERROR] python not found. Install Python and add it to PATH.
    pause
    exit /b 1
)

set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%/new44/index.html"

echo.
echo   Site root : %CD%
echo   URL       : %URL%
echo   To stop   : close the window titled "new44-server"
echo.

start "new44-server" cmd /k "%PY% -m http.server %PORT% --bind 127.0.0.1"
ping -n 3 127.0.0.1 >nul
start "" "%URL%"

endlocal