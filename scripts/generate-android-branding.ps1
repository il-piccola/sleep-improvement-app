$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$resRoot = Join-Path $repoRoot 'android\app\src\main\res'
$iconSource = Join-Path $repoRoot 'scripts\android-branding\sleep-compass-icon.png'
$splashSource = Join-Path $repoRoot 'scripts\android-branding\sleep-compass-splash.png'

function Save-ResizedPng {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][int]$Width,
    [Parameter(Mandatory = $true)][int]$Height,
    [Parameter(Mandatory = $true)][ValidateSet('Fit', 'Cover')][string]$Mode,
    [bool]$TransparentBlack = $false
  )

  $src = [System.Drawing.Image]::FromFile($Source)
  try {
    $bitmap = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

        $scaleX = $Width / $src.Width
        $scaleY = $Height / $src.Height
        if ($Mode -eq 'Cover') {
          $scale = [Math]::Max($scaleX, $scaleY)
        } else {
          $scale = [Math]::Min($scaleX, $scaleY)
        }

        $drawWidth = [int][Math]::Round($src.Width * $scale)
        $drawHeight = [int][Math]::Round($src.Height * $scale)
        $x = [int][Math]::Round(($Width - $drawWidth) / 2)
        $y = [int][Math]::Round(($Height - $drawHeight) / 2)

        $graphics.DrawImage($src, $x, $y, $drawWidth, $drawHeight)
      } finally {
        $graphics.Dispose()
      }

      if ($TransparentBlack) {
        for ($px = 0; $px -lt $bitmap.Width; $px++) {
          for ($py = 0; $py -lt $bitmap.Height; $py++) {
            $color = $bitmap.GetPixel($px, $py)
            if ($color.R -lt 18 -and $color.G -lt 18 -and $color.B -lt 18) {
              $bitmap.SetPixel($px, $py, [System.Drawing.Color]::Transparent)
            }
          }
        }
      }

      $directory = Split-Path -Parent $Destination
      New-Item -ItemType Directory -Force -Path $directory | Out-Null
      $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $src.Dispose()
  }
}

$iconSizes = @{
  'mipmap-mdpi' = @{ Legacy = 48; Foreground = 108 }
  'mipmap-hdpi' = @{ Legacy = 72; Foreground = 162 }
  'mipmap-xhdpi' = @{ Legacy = 96; Foreground = 216 }
  'mipmap-xxhdpi' = @{ Legacy = 144; Foreground = 324 }
  'mipmap-xxxhdpi' = @{ Legacy = 192; Foreground = 432 }
}

foreach ($density in $iconSizes.Keys) {
  $legacySize = $iconSizes[$density].Legacy
  $foregroundSize = $iconSizes[$density].Foreground
  $densityDir = Join-Path $resRoot $density

  Save-ResizedPng -Source $iconSource -Destination (Join-Path $densityDir 'ic_launcher.png') -Width $legacySize -Height $legacySize -Mode Fit -TransparentBlack $true
  Save-ResizedPng -Source $iconSource -Destination (Join-Path $densityDir 'ic_launcher_round.png') -Width $legacySize -Height $legacySize -Mode Fit -TransparentBlack $true
  Save-ResizedPng -Source $iconSource -Destination (Join-Path $densityDir 'ic_launcher_foreground.png') -Width $foregroundSize -Height $foregroundSize -Mode Fit -TransparentBlack $true
}

$splashTargets = @{
  'drawable\splash.png' = @(480, 320)
  'drawable-land-mdpi\splash.png' = @(480, 320)
  'drawable-land-hdpi\splash.png' = @(800, 480)
  'drawable-land-xhdpi\splash.png' = @(1280, 720)
  'drawable-land-xxhdpi\splash.png' = @(1600, 960)
  'drawable-land-xxxhdpi\splash.png' = @(1920, 1280)
  'drawable-port-mdpi\splash.png' = @(320, 480)
  'drawable-port-hdpi\splash.png' = @(480, 800)
  'drawable-port-xhdpi\splash.png' = @(720, 1280)
  'drawable-port-xxhdpi\splash.png' = @(960, 1600)
  'drawable-port-xxxhdpi\splash.png' = @(1280, 1920)
}

foreach ($target in $splashTargets.Keys) {
  $size = $splashTargets[$target]
  Save-ResizedPng -Source $splashSource -Destination (Join-Path $resRoot $target) -Width $size[0] -Height $size[1] -Mode Cover
}

Write-Host 'Android branding assets generated.'
