; ProxyLaunch installer hooks (electron-builder NSIS).
;
; Replaces the default "is ProxyLaunch running?" check, which could get stuck on
; "ProxyLaunch cannot be closed" when an extra copy was running in the background.
; Close every copy (and anything it started under the same exe) before installing.
!macro customCheckAppRunning
  DetailPrint "Closing ProxyLaunch..."
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /im "${APP_EXECUTABLE_FILENAME}" /t`
  Sleep 1200
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /t`
  Sleep 600
!macroend
