@echo off
title The Last Resort
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run The Last Resort. Get it from https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies, one moment...
  call npm install --no-audit --no-fund
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
