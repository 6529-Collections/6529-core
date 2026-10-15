# Clicks a button in a top-level dialog found by its title (Windows UI Automation).
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Button,
  [int]$TimeoutSec = 20
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$titleCondition = New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $Title)
$buttonCondition = New-Object System.Windows.Automation.AndCondition(
  (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)),
  (New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $Button))
)
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  $window = $AE::RootElement.FindFirst($scope::Children, $titleCondition)
  if ($window) {
    $target = $window.FindFirst($scope::Descendants, $buttonCondition)
    if ($target) {
      $target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      Write-Output "clicked $Button"
      exit 0
    }
  }
  Start-Sleep -Milliseconds 300
}
Write-Output "dialog '$Title' with button '$Button' not found"
exit 1
