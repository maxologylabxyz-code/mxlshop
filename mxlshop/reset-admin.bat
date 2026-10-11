@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MXLSHOP - reset admin password
echo Stop the server first (close the start.bat window), then continue.
echo.
node server.js --reset-admin
echo.
pause
