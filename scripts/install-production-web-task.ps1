param(
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'
$taskName = 'Sleep Compass Production Web'
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$scriptPath = Join-Path $projectRoot 'scripts\serve-production-web.mjs'
$buildPath = Join-Path $projectRoot 'dist\index.html'
$nodePath = (Get-Command node -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $buildPath -PathType Leaf)) {
  throw "Production build is missing: $buildPath. Run npm run build first."
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$scriptPath`"" -WorkingDirectory $projectRoot
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
