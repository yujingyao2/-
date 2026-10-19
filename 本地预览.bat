@echo off
setlocal
cd /d "%~dp0"
title One Shot Badminton - Local Preview

set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODE_EXE (
  echo.
  echo   Node.js is required for local preview.
  echo   Install it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

"%NODE_EXE%" server.js
echo.
echo   Server stopped.
pause
