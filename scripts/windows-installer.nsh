!include LogicLib.nsh

; 0.3.15 left SQLite's install-time tools outside app.asar. Its NSIS
; uninstaller recursively renames them into $PLUGINSDIR\old-install during
; updates, exceeding MAX_PATH. Move only that unused subtree as one directory
; before invoking the unchanged old uninstaller. Never remove runtime files or
; user data. A sibling backup survives cancellation/failure and later upgrades.
!macro corePrepareLegacySqliteTools ROOT_KEY
  ReadRegStr $coreLegacyVersion ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  ReadRegStr $coreLegacyDir ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $coreLegacyVersion == "0.3.15"
  ${AndIf} $coreLegacyDir != ""
  ${AndIf} ${FileExists} "$coreLegacyDir\${APP_EXECUTABLE_FILENAME}"
  ${AndIf} ${FileExists} "$coreLegacyDir\resources\app.asar.unpacked\node_modules\better-sqlite3\build\Release\better_sqlite3.node"
    StrCpy $coreLegacyTool "$coreLegacyDir\resources\app.asar.unpacked\node_modules\better-sqlite3\node_modules\prebuild-install"
    ${If} ${FileExists} "$coreLegacyTool\package.json"
      ClearErrors
      CreateDirectory "$coreLegacyDir.0.3.15-build-tools-backup"
      ${IfNot} ${Errors}
        ; Unique name handles a cancelled upgrade followed by a 0.3.15 repair.
        GetTempFileName $coreLegacyBackup "$coreLegacyDir.0.3.15-build-tools-backup"
        ${IfNot} ${Errors}
          Delete "$coreLegacyBackup"
          ${IfNot} ${Errors}
            ; Rename the directory itself, without traversing its long paths.
            Rename "$coreLegacyTool" "$coreLegacyBackup"
          ${EndIf}
        ${EndIf}
      ${EndIf}
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONSTOP "Unable to prepare the 0.3.15 upgrade. The unused SQLite build-tool folder could not be moved. Your app data has not been changed. Close Setup and contact support.$\r$\n$\r$\n$coreLegacyTool" /SD IDOK
        SetErrorLevel 2
        Quit
      ${EndIf}
      DetailPrint "Preserved legacy SQLite build tools at $coreLegacyBackup"
    ${EndIf}
  ${EndIf}
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    Var coreLegacyVersion
    Var coreLegacyDir
    Var coreLegacyTool
    Var coreLegacyBackup

    ; A hidden, mandatory section runs only after Install is chosen, including
    ; silent updates. customInit would modify files even if Setup is cancelled
    ; on the welcome page. electron-builder inserts customHeader before its
    ; normal install section, which retains all process/uninstall/data checks.
    Section "-Prepare legacy SQLite build tools"
      SectionIn RO
      !insertmacro corePrepareLegacySqliteTools HKLM
      !insertmacro corePrepareLegacySqliteTools HKCU
    SectionEnd
  !endif
!macroend
