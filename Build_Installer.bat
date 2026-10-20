@echo off
title Build ProxyLaunch installer
cd /d "%~dp0"

echo [1/3] Installing build tools (only slow the first time)...
call npm install
if errorlevel 1 goto fail

echo [2/3] Building the app...
call npm run build
if errorlevel 1 goto fail

rem electron-builder's signing helper (winCodeSign) contains Mac symlinks that
rem Windows refuses to extract without Developer Mode / admin. We unpack it
rem ourselves once, skipping those Mac-only files, so the build never needs it.
set "WCS_DIR=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
set "WCS=%WCS_DIR%\winCodeSign-2.6.0"
if not exist "%WCS%\rcedit-x64.exe" (
  echo Preparing the Windows build helper - one time only...
  if not exist "%WCS_DIR%" mkdir "%WCS_DIR%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z' -OutFile '%WCS_DIR%\winCodeSign-2.6.0.7z'"
  "%~dp0node_modules\7zip-bin\win\x64\7za.exe" x -y -bd "%WCS_DIR%\winCodeSign-2.6.0.7z" "-o%WCS%" -xr!darwin >nul 2>&1
  del /q "%WCS_DIR%\winCodeSign-2.6.0.7z" >nul 2>&1
  if not exist "%WCS%\rcedit-x64.exe" (
    echo Could not prepare the build helper. Check your internet connection and try again.
    goto fail
  )
)

echo [3/3] Packaging the installer...
call npx electron-builder --win nsis portable --publish never
if errorlevel 1 goto fail

echo.
echo Done! Files are in the "release" folder.
echo   To publish an update on GitHub, attach these 3 files to a new release:
echo     ProxyLaunch-Setup-x.x.x.exe
echo     ProxyLaunch-Setup-x.x.x.exe.blockmap
echo     latest.yml
echo   (Portable .exe is optional - it does not auto-update.)
start "" "%~dp0release"
pause
exit /b 0

:fail
echo.
echo Something went wrong. Scroll up for the red error text and send it over.
pause
exit /b 1
