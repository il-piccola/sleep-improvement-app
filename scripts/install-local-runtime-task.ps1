param(
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'
$taskName = 'Sleep Compass Local Runtime'
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runnerPath = Join-Path $projectRoot 'scripts\run-local-runtime.ps1'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$argument = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""

$action = New-ScheduledTaskAction -Execute $powershellPath -Argument $argument -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

if ($StartNow) {
  Start-ScheduledTask -TaskName $taskName
}

Get-ScheduledTask -TaskName $taskName |
  Select-Object TaskName, State, @{Name='User'; Expression={$_.Principal.UserId}}
