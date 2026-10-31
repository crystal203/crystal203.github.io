@echo off
setlocal
chcp 65001 >nul
title GTLibrary - Local Server
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js or add node.exe to PATH, then try again.
  pause
  exit /b 1
)
node "%~dp0core\serve-local.cjs" %*
if errorlevel 1 pause
endlocal
