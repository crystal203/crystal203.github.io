@echo off
setlocal
chcp 65001 >nul
title GTLibrary - Local Server and Agent
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22+ or add node.exe to PATH, then try again.
  pause
  exit /b 1
)
rem Keep development tools outside the website. GT_VIDEO_TOOLS can override it.
if not defined GT_VIDEO_TOOLS if exist "%~dp0..\gtlibrary-workbench\tools\gtvideo\start-local.mjs" set "GT_VIDEO_TOOLS=%~dp0..\gtlibrary-workbench\tools\gtvideo"
if not defined GT_VIDEO_TOOLS if exist "E:\GTFiles\gtlibrary-workbench\tools\gtvideo\start-local.mjs" set "GT_VIDEO_TOOLS=E:\GTFiles\gtlibrary-workbench\tools\gtvideo"
node "%~dp0core\serve-local.cjs" %*
set "GT_LOCAL_EXIT=%errorlevel%"
if not "%GT_LOCAL_EXIT%"=="0" pause
endlocal & exit /b %GT_LOCAL_EXIT%
