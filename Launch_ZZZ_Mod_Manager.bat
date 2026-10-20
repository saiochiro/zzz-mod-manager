@echo off
title ZZZ Mod Manager // Launcher
cd /d "%~dp0"

echo [1/3] Compiling backend...
call node "node_modules\typescript\bin\tsc" -p tsconfig.electron.json
if errorlevel 1 echo [warning] Backend compile reported problems above - continuing.

echo [2/3] Building the interface...
call node "node_modules\vite\bin\vite.js" build
if errorlevel 1 goto fail

REM Refresh the "ZZZ Mod Manager" shortcuts (here and on the Desktop) so they show the app icon
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; foreach($p in @('%~dp0ZZZ Mod Manager.lnk', (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ZZZ Mod Manager.lnk'))){ $s=$w.CreateShortcut($p); $s.TargetPath='%~dp0ZZZ_Mod_Manager.vbs'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0assets\icon\icon.ico,0'; $s.Save() }" >nul 2>&1

echo [3/3] Launching ZZZ Mod Manager...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0

:fail
echo.
echo The build failed, so the app was NOT updated. Screenshot the red text above and send it over.
pause
exit /b 1
