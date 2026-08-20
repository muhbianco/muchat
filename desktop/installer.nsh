!macro customInstall
  ExecWait "taskkill /F /IM Muchat.exe /T"
  RMDir /r "$APPDATA\muchat\Service Worker"
  RMDir /r "$APPDATA\Muchat\Service Worker"
  RMDir /r "$APPDATA\muchat\Cache"
  RMDir /r "$APPDATA\Muchat\Cache"
  RMDir /r "$LOCALAPPDATA\muchat\Service Worker"
  RMDir /r "$LOCALAPPDATA\Muchat\Service Worker"
!macroend

!macro customUnInstall
  ExecWait "taskkill /F /IM Muchat.exe /T"
!macroend
