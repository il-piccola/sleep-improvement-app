$ErrorActionPreference = 'Stop'
$taskName = 'Sleep Compass Production Web'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($task) {
  if ($task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $taskName
  }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Write-Output "Production Web scheduled task removed: $taskName"
