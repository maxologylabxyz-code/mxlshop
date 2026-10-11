@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MXLSHOP Server
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
rem To change the port, remove "rem" from the next line:
rem set PORT=3000
:loop
node server.js
echo.
echo Server stopped. Restarting in 5 seconds... (close this window to stop it)
timeout /t 5 /nobreak >nul
goto loop
