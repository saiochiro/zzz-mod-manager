@echo off
title ProxyLaunch // Launcher
cd /d "%~dp0"

echo [1/3] Compiling backend...
call node "node_modules\typescript\bin\tsc" -p tsconfig.electron.json
if errorlevel 1 echo [warning] Backend compile reported problems above - continuing.

echo [2/3] Building the interface...
call node "node_modules\vite\bin\vite.js" build
if errorlevel 1 goto fail

REM Refresh the "ProxyLaunch (Dev)" shortcuts (here and on the Desktop). The old dev "ZZZ Mod Manager" shortcuts are removed; the installed app's own shortcut is never touched.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); foreach($o in @('%~dp0ZZZ Mod Manager.lnk', (Join-Path $d 'ZZZ Mod Manager.lnk'))){ if(Test-Path $o){ if($w.CreateShortcut($o).TargetPath -like '*ZZZ_Mod_Manager.vbs'){ Remove-Item $o -Force } } }; foreach($p in @('%~dp0ProxyLaunch (Dev).lnk', (Join-Path $d 'ProxyLaunch (Dev).lnk'))){ $s=$w.CreateShortcut($p); $s.TargetPath='%~dp0ZZZ_Mod_Manager.vbs'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0assets\icon\icon.ico,0'; $s.Save() }" >nul 2>&1

echo [3/3] Launching ProxyLaunch...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0

:fail
echo.
echo The build failed, so the app was NOT updated. Screenshot the red text above and send it over.
pause
exit /b 1
