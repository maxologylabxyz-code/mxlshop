@echo off
chcp 65001 >nul
cd /d "%~dp0"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set TS=%%i
set DEST=%~dp0..\mxlshop-backup\%TS%
robocopy "%~dp0data" "%DEST%\data" /E /NFL /NDL /NJH /NJS /NP >nul
robocopy "%~dp0uploads" "%DEST%\uploads" /E /NFL /NDL /NJH /NJS /NP >nul
echo Backup saved to: %DEST%
echo Copy that folder to a USB drive or cloud storage as well.
pause
