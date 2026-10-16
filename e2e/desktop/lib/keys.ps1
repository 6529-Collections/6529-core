# Brings a process's main window to the foreground and sends it keys, as a
# user's keyboard would (SendKeys syntax, e.g. "^f" for Ctrl+F). Exits 2
# without sending anything if the window cannot be made the foreground window.
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$Keys,
  [string]$TitleLike = '*'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SuiteWin32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
$window = Get-Process -Id $ProcessId -ErrorAction Stop
$handle = $window.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { Write-Output "no main window"; exit 2 }
# An Alt tap lets this process move the foreground window.
[SuiteWin32]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
[SuiteWin32]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
[void][SuiteWin32]::ShowWindow($handle, 9)
[void][SuiteWin32]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 400
$foregroundPid = 0
[void][SuiteWin32]::GetWindowThreadProcessId([SuiteWin32]::GetForegroundWindow(), [ref]$foregroundPid)
if ($foregroundPid -ne $ProcessId) { Write-Output "foreground is process $foregroundPid, not $ProcessId"; exit 2 }
[System.Windows.Forms.SendKeys]::SendWait($Keys)
Write-Output "sent $Keys"
exit 0
