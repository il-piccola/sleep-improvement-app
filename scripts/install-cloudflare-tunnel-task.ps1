param(
  [switch]$StartNow,
  [string]$TokenFile
)

$ErrorActionPreference = 'Stop'
$taskName = 'Sleep Compass Cloudflare Tunnel'
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$runnerPath = Join-Path $projectRoot 'scripts\run-cloudflare-tunnel.mjs'
$binaryPath = Join-Path $projectRoot 'runtime-bin\cloudflared.exe'
if (-not $TokenFile) {
  $TokenFile = Join-Path $projectRoot 'runtime-secrets\cloudflare-tunnel-token.txt'
}
$logPath = Join-Path $projectRoot 'runtime-logs\cloudflare-tunnel.log'
$nodePath = (Get-Command node -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $binaryPath -PathType Leaf)) {
  throw "cloudflared is missing: $binaryPath"
}
if (-not (Test-Path -LiteralPath $TokenFile -PathType Leaf)) {
  throw "Tunnel token file is missing: $TokenFile"
}

$action = New-ScheduledTaskAction `
  -Execute $nodePath `
  -Argument "`"$runnerPath`" `"$binaryPath`" `"$TokenFile`" `"$logPath`"" `
  -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited
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
