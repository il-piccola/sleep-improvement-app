Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$androidDir = Join-Path $repoRoot 'android'
$apkSource = Join-Path $androidDir 'app\build\outputs\apk\debug\app-debug.apk'
$archiveDir = Join-Path $repoRoot 'dist-apk'

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Label,
    [Parameter(Mandatory = $true)]
    [scriptblock] $Command
  )

  Write-Host ""
  Write-Host "==> $Label"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Get-GitValue {
  param(
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments,
    [AllowEmptyString()]
    [string] $Fallback
  )

  try {
    $value = & git @Arguments 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
      return $Fallback
    }
    return ($value | Select-Object -First 1).Trim()
  } catch {
    return $Fallback
  }
}

$javaVersion = $null
try {
  $javaCommand = 'java'
  if ($env:JAVA_HOME) {
    $javaHomeCommand = Join-Path $env:JAVA_HOME 'bin\java.exe'
    if (Test-Path -LiteralPath $javaHomeCommand) {
      $javaCommand = $javaHomeCommand
    }
  }

  $javaVersion = & $javaCommand -version 2>&1 | Select-Object -First 1
} catch {
  Write-Warning 'java was not found on PATH or JAVA_HOME. Gradle may fail unless Android Studio provides a JDK.'
}

if ($javaVersion) {
  Write-Host "Java: $javaVersion"
}

Invoke-Step 'Build web assets' {
  Push-Location $repoRoot
  try {
    npm run build
  } finally {
    Pop-Location
  }
}

Invoke-Step 'Sync Capacitor Android project' {
  Push-Location $repoRoot
  try {
    npx cap sync android
  } finally {
    Pop-Location
  }
}

Invoke-Step 'Build Android debug APK' {
  Push-Location $androidDir
  try {
    .\gradlew.bat assembleDebug
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $apkSource)) {
  throw "Debug APK was not found: $apkSource"
}

if (-not (Test-Path -LiteralPath $archiveDir)) {
  New-Item -ItemType Directory -Path $archiveDir | Out-Null
}

$dateStamp = Get-Date -Format 'yyyyMMdd'
$shortCommit = Get-GitValue -Arguments @('-C', $repoRoot, 'rev-parse', '--short', 'HEAD') -Fallback 'unknown'
$status = Get-GitValue -Arguments @('-C', $repoRoot, 'status', '--porcelain') -Fallback ''
$dirtySuffix = ''
if (-not [string]::IsNullOrWhiteSpace($status)) {
  $dirtySuffix = '-dirty'
}

$archiveName = "SleepCompass-debug-$dateStamp-$shortCommit$dirtySuffix.apk"
$archivePath = Join-Path $archiveDir $archiveName

Copy-Item -LiteralPath $apkSource -Destination $archivePath -Force

Write-Host ""
Write-Host "Debug APK archived:"
Write-Host $archivePath
