# Sends WM_CLOSE to a process's main window, as its title bar close button does.
param([Parameter(Mandatory = $true)][int]$ProcessId)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SuiteClose {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
"@
$handle = (Get-Process -Id $ProcessId).MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { Write-Output "no main window"; exit 1 }
[void][SuiteClose]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Output "WM_CLOSE sent"
exit 0
