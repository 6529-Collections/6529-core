# Restores the minimized top-level window(s) of a process (Windows UI Automation).
param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [int]$TimeoutSec = 20
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$condition = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $ProcessId)
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  $windows = $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
  foreach ($window in $windows) {
    $pattern = $null
    if ($window.TryGetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern, [ref]$pattern)) {
      if ($pattern.Current.WindowVisualState -eq [System.Windows.Automation.WindowVisualState]::Minimized) {
        $pattern.SetWindowVisualState([System.Windows.Automation.WindowVisualState]::Normal)
        Write-Output "restored '$($window.Current.Name)'"
        exit 0
      }
    }
  }
  Start-Sleep -Milliseconds 300
}
Write-Output "no minimized window for process $ProcessId"
exit 1
