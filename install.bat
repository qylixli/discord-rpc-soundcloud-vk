@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Discord RPC for SoundCloud and VK - install

echo.
echo  Discord RPC for SoundCloud and VK Music - installation
echo  Установка. Это займёт пару минут.
echo.

rem ---- 1. Node.js ----
where node >nul 2>nul
if errorlevel 1 goto no_node
node -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)"
if errorlevel 1 goto old_node
goto node_ok

:no_node
echo [!] Node.js is not installed / Node.js не установлен.
echo     Download the LTS version from https://nodejs.org , install it, then run install.bat again.
echo     Скачайте версию LTS на https://nodejs.org , установите и запустите install.bat снова.
pause
exit /b 1

:old_node
echo [!] Node.js is too old (need 18+) / Node.js слишком старый (нужна версия 18 или новее).
echo     Update it from https://nodejs.org and run install.bat again.
pause
exit /b 1

:node_ok

rem ---- 2. Dependencies ----
if exist "companion\node_modules\@xhayper\discord-rpc" goto deps_ok
echo Installing dependencies / Устанавливаю зависимости...
pushd companion
call npm install --omit=dev --no-audit --no-fund
set NPM_ERR=%errorlevel%
popd
if not "%NPM_ERR%"=="0" goto npm_failed
goto deps_ok

:npm_failed
echo.
echo [!] npm install failed. Check your internet connection and run install.bat again.
echo     Не удалось скачать зависимости. Проверьте интернет и запустите install.bat снова.
pause
exit /b 1

:deps_ok

rem ---- 3. Discord Application ID ----
if exist "companion\config.json" goto config_ok
echo.
echo Create an application at https://discord.com/developers/applications ("New Application"),
echo then copy its "Application ID" from the General Information page.
echo Создайте приложение на https://discord.com/developers/applications (кнопка "New Application"),
echo затем на вкладке General Information скопируйте "Application ID" (17-20 цифр).
echo.
set /p APPID=Application ID:
node -e "const id=String(process.argv[1]||'').trim(); if(!/^\d{17,20}$/.test(id)){console.error('This does not look like an Application ID (17-20 digits).');process.exit(1)} require('fs').writeFileSync('companion/config.json', JSON.stringify({clientId:id,statusDisplay:'artist',showButton:false},null,4)+'\n')" "%APPID%"
if errorlevel 1 goto bad_id
goto config_ok

:bad_id
echo.
echo [!] Wrong Application ID / Неверный Application ID. Run install.bat again.
pause
exit /b 1

:config_ok

rem ---- 4. Stop an already running copy ----
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*companion*index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul

rem ---- 5. Autostart (hidden, at every Windows login) ----
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\discord-rpc-soundcloud-vk.vbs" echo CreateObject("WScript.Shell").Run "wscript.exe ""%~dp0run-hidden.vbs""", 0, False

rem ---- 6. Start now ----
wscript.exe "%~dp0run-hidden.vbs"

echo.
echo  Done! / Готово!
echo  The program now runs in the background and starts with Windows.
echo  Программа работает в фоне и будет запускаться вместе с Windows.
echo.
echo  Next: install the userscripts in Tampermonkey (see README.md, step 4).
echo  Дальше: поставьте скрипты в Tampermonkey (README.md, шаг 4).
echo.
pause
