@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*companion*index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\discord-rpc-soundcloud-vk.vbs" 2>nul
echo.
echo  Stopped and removed from autostart. You can now delete this folder.
echo  Остановлено и убрано из автозапуска. Теперь папку можно удалить.
echo  (Remove the userscripts in Tampermonkey too / Скрипты в Tampermonkey тоже удалите.)
echo.
pause
