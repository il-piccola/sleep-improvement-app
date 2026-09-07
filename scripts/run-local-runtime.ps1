$ErrorActionPreference = 'Continue'

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logRoot = Join-Path $projectRoot 'runtime-logs'
$logPath = Join-Path $logRoot 'supervisor.log'

New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
Set-Location -LiteralPath $projectRoot

while ($true) {
  $startedAt = Get-Date
  Add-Content -LiteralPath $logPath -Value "[$startedAt] starting npm run dev:all"
  & npm.cmd run dev:all *>> $logPath
  $exitCode = $LASTEXITCODE
  $endedAt = Get-Date
  Add-Content -LiteralPath $logPath -Value "[$endedAt] dev:all exited with code $exitCode; restarting in 5 seconds"
  Start-Sleep -Seconds 5
}
