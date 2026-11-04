@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autostart.ps1" remove
echo.
echo  Stopped and removed from autostart. You can now delete this folder.
echo  (Remove the userscripts in Tampermonkey too.)
echo.
pause
