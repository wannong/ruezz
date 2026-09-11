; GNU-built WikiHome.exe loads WebView2Loader.dll from the exe directory,
; but Tauri resource globs install it under resources\. Copy it next to the exe.
!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  IfFileExists "$INSTDIR\resources\WebView2Loader.dll" 0 skip_wv2_dll
    CopyFiles /SILENT "$INSTDIR\resources\WebView2Loader.dll" "$INSTDIR"
  skip_wv2_dll:
  ; Drop Mark-of-the-Web so Windows will run the bundled node/python.
  System::Call 'kernel32::DeleteFile(t "$INSTDIR\wikihome.exe:Zone.Identifier")i.n'
  System::Call 'kernel32::DeleteFile(t "$INSTDIR\WikiHome.exe:Zone.Identifier")i.n'
  System::Call 'kernel32::DeleteFile(t "$INSTDIR\resources\runtime\node.exe:Zone.Identifier")i.n'
  System::Call 'kernel32::DeleteFile(t "$INSTDIR\resources\runtime\python\python.exe:Zone.Identifier")i.n'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
