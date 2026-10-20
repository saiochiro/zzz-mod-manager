@echo off
title ProxyLaunch // Browser Server (http://localhost:5173)
cd /d "%~dp0"
echo =====================================================================
echo   PROXYLAUNCH // WEB SERVER MODE
echo   Opening http://localhost:5173 in your browser...
echo =====================================================================
start "" "http://localhost:5173"
node "node_modules\vite\bin\vite.js" --port 5173
pause
