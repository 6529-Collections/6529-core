# Presses a button of a process's message box (an Electron dialog) by sending
# TDM_CLICK_BUTTON to the task dialog window. Works without a foreground
# window or an attached session, where UI Automation cannot see the dialog.
#
# Electron's Windows message box gives a "Cancel" button the common IDCANCEL
# (2) and numbers the other buttons from 100 in the order they are listed.
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][int]$ButtonId,
  [int]$TimeoutSec = 20
)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SuiteDialog {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  public static IntPtr Find(uint processId, string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hWnd, lParam) => {
      uint owner;
      GetWindowThreadProcessId(hWnd, out owner);
      if (owner != processId) return true;
      var text = new StringBuilder(256);
      var name = new StringBuilder(64);
      GetWindowText(hWnd, text, 256);
      GetClassName(hWnd, name, 64);
      if (name.ToString() == "#32770" && text.ToString() == title) { found = hWnd; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
$TDM_CLICK_BUTTON = 0x0400 + 102
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  $dialog = [SuiteDialog]::Find([uint32]$ProcessId, $Title)
  if ($dialog -ne [IntPtr]::Zero) {
    [void][SuiteDialog]::SendMessage($dialog, $TDM_CLICK_BUTTON, [IntPtr]$ButtonId, [IntPtr]::Zero)
    Write-Output "pressed button $ButtonId"
    exit 0
  }
  Start-Sleep -Milliseconds 300
}
Write-Output "dialog '$Title' not found for process $ProcessId"
exit 1
