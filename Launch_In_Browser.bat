@echo off
title ZZZ Mod Manager // Browser Server (http://localhost:5173)
cd /d "%~dp0"
echo =====================================================================
echo   ZZZ MOD MANAGER // FAIRY OS HDD TERMINAL (WEB SERVER MODE)
echo   Opening http://localhost:5173 in your browser...
echo =====================================================================
start "" "http://localhost:5173"
node "node_modules\vite\bin\vite.js" --port 5173
pause
