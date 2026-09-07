param(
  [switch]$Confirm
)

$ErrorActionPreference = 'Stop'
$taskName = 'Sleep Compass Local Runtime'

if (-not $Confirm) {
  throw '削除する場合は -Confirm を指定してください。'
}

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
