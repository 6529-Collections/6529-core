# Restores the minimized top-level windows of a process (Win32 ShowWindow),
# as clicking them in the taskbar does. Works without an attached session.
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [int]$TimeoutSec = 20
)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SuiteRestore {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  public static int RestoreMinimized(uint processId) {
    int restored = 0;
    EnumWindows((hWnd, lParam) => {
      uint owner;
      GetWindowThreadProcessId(hWnd, out owner);
      if (owner == processId && IsIconic(hWnd)) { ShowWindow(hWnd, 9); restored++; }
      return true;
    }, IntPtr.Zero);
    return restored;
  }
}
"@
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  $restored = [SuiteRestore]::RestoreMinimized([uint32]$ProcessId)
  if ($restored -gt 0) {
    Write-Output "restored $restored window(s)"
    exit 0
  }
  Start-Sleep -Milliseconds 300
}
Write-Output "no minimized window for process $ProcessId"
exit 1
