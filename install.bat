@echo off
setlocal
cd /d "%~dp0"
title Discord RPC for SoundCloud and VK - install

echo.
echo  Discord RPC for SoundCloud and VK Music - installation
echo.

rem ---- 1. Node.js ----
where node >nul 2>nul
if errorlevel 1 goto no_node
node -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)"
if errorlevel 1 goto old_node
goto node_ok

:no_node
echo [!] Node.js is not installed.
echo     Download the LTS version from https://nodejs.org , install it,
echo     then run install.bat again.
pause
exit /b 1

:old_node
echo [!] Node.js is too old (version 18 or newer is needed).
echo     Update it from https://nodejs.org and run install.bat again.
pause
exit /b 1

:node_ok

rem ---- 2. Dependencies ----
if exist "companion\node_modules\@xhayper\discord-rpc" goto deps_ok
echo Installing dependencies...
pushd companion
call npm install --omit=dev --no-audit --no-fund
set NPM_ERR=%errorlevel%
popd
if not "%NPM_ERR%"=="0" goto npm_failed
goto deps_ok

:npm_failed
echo.
echo [!] npm install failed. Check your internet connection and run install.bat again.
pause
exit /b 1

:deps_ok

rem ---- 3. Discord Application ID ----
if exist "companion\config.json" goto config_ok
echo.
echo Create an application at https://discord.com/developers/applications
echo (button "New Application"), then open its "General Information" page
echo and copy the "Application ID" (17-20 digits).
echo.
set /p APPID=Application ID: 
node -e "const id=String(process.argv[1]||'').trim(); if(!/^\d{17,20}$/.test(id)){console.error('This does not look like an Application ID (17-20 digits).');process.exit(1)} require('fs').writeFileSync('companion/config.json', JSON.stringify({clientId:id,statusDisplay:'artist',showButton:false},null,4)+'\n')" "%APPID%"
if errorlevel 1 goto bad_id
goto config_ok

:bad_id
echo.
echo [!] Wrong Application ID. Run install.bat again.
pause
exit /b 1

:config_ok

rem ---- 4. Autostart (hidden, at every Windows login); also stops an already running copy ----
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autostart.ps1" install
if errorlevel 1 goto autostart_failed

rem ---- 5. Start now ----
wscript.exe "%~dp0run-hidden.vbs"

echo.
echo  Done!
echo  The program now runs in the background and starts with Windows.
echo  Log file: companion.log (in this folder)
echo.
echo  Next: install the userscripts in Tampermonkey (see README.md, step 4).
echo.
pause
exit /b 0

:autostart_failed
echo.
echo [!] Could not set up autostart. The program was NOT started.
echo     Send a screenshot of this window to the project page (Issues).
pause
exit /b 1
