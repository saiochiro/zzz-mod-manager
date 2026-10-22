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

; Replaces "Failed to uninstall old application files. Please try running the installer again.: 2".
; The old version's uninstaller stops when a file in the install folder is in use (ProxyLaunch
; still closing, or another program that has the folder open). Close ProxyLaunch again and retry;
; if it still fails, let the user retry or install over the old files instead of quitting.
!macro proxyLaunchRetryOldUninstall SUFFIX ROOT_KEY
  ; Errors here mean the old uninstaller couldn't even start (same as the default check: carry on).
  ${if} ${Errors}
    ClearErrors
    StrCpy $R0 0
  ${endif}
  ${if} $R0 != 0
    retryOldUninstall${SUFFIX}:
      DetailPrint "The old version couldn't be removed (code $R0). Trying again..."
      nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /t`
      Pop $R1
      Sleep 1500
      ; Runs electron-builder's own "remove the old version" step again (it retries a few times itself).
      Push "${ROOT_KEY}"
      Call uninstallOldVersion
      ${if} ${Errors}
        ClearErrors
        StrCpy $R0 0
      ${endif}
      ${if} $R0 != 0
        MessageBox MB_ABORTRETRYIGNORE|MB_ICONEXCLAMATION "Some ProxyLaunch files are still in use, so the old version can't be removed.$\r$\n$\r$\nClose ProxyLaunch (check the tray), and any program that has the ProxyLaunch folder open, then click Retry.$\r$\n$\r$\nIgnore installs over the old version anyway. Your mods and settings are kept either way." /SD IDIGNORE IDRETRY retryOldUninstall${SUFFIX} IDIGNORE skipOldUninstall${SUFFIX}
        SetErrorLevel 2
        Quit
      ${endif}
    skipOldUninstall${SUFFIX}:
    ClearErrors
  ${endif}
!macroend

!macro customUnInstallCheck
  !insertmacro proxyLaunchRetryOldUninstall Shell SHELL_CONTEXT
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro proxyLaunchRetryOldUninstall User HKEY_CURRENT_USER
!macroend
