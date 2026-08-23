# O-12a Drive mount 最小read-only監査

Status: **READY**  
Phase: **O-12a — 現状監査**  
Codex依頼ID: **CX-O12A-003**

## 1. 目的

`CX-O12A-002` では `Health Auto Export` が `NOT FOUND` だったが、前回手順はC:を検索対象から除外していた。

Google Drive for desktopの現行Windows仕様では、ストリーミング場所は仮想drive letterだけでなく、既存drive上のfolder pathにも設定できる。そのため `NOT FOUND` を「N100にGoogle Drive/Health Auto Exportが存在しない」という証拠にはしない。

この依頼では、DriveFSの設定と実行状態からmount point候補だけをread-onlyで取得し、その候補配下で `Health Auto Export` の存在だけを確認する。

再確認しない:

- Git branch / sync
- Node/npm
- JSON Schema
- `server-data`
- Tailscale
- GCP

## 2. Codexへ渡す正式依頼

```text
依頼ID: CX-O12A-003
フェーズ: O-12a 現状監査
目的: Google Drive for desktopのOS-visible mount point候補と Health Auto Export pathだけをread-only確認する。

重要:
- file内容は読まない。
- Google account ID/email等は返さない。
- registry値を丸ごと表示しない。
- mount_point_path / DefaultMountPointだけを抽出して返す。
- Drive設定変更、再起動、installはしない。

PowerShellで次を確認する。

A. Drive for desktop実行状態
$driveProcess = Get-Process -Name 'GoogleDriveFS' -ErrorAction SilentlyContinue
[PSCustomObject]@{
  GoogleDriveFSRunning = [bool]$driveProcess
}

B. 明示されたDefaultMountPointだけを読む
$registryPaths = @(
  'HKCU:\Software\Google\DriveFS',
  'HKLM:\Software\Google\DriveFS',
  'HKLM:\Software\Policies\Google\DriveFS'
)

$mountCandidates = @()
foreach ($regPath in $registryPaths) {
  $value = (Get-ItemProperty -Path $regPath -Name 'DefaultMountPoint' -ErrorAction SilentlyContinue).DefaultMountPoint
  if ($value) {
    $mountCandidates += [Environment]::ExpandEnvironmentVariables([string]$value)
  }
}

C. user preference内にmount_point_pathがある場合、mount pathだけ抽出する
$prefs = (Get-ItemProperty -Path 'HKCU:\Software\Google\DriveFS' -Name 'PerAccountPreferences' -ErrorAction SilentlyContinue).PerAccountPreferences
if ($prefs) {
  $matches = [regex]::Matches([string]$prefs, '"mount_point_path"\s*:\s*"([^"]+)"')
  foreach ($m in $matches) {
    $candidate = $m.Groups[1].Value -replace '\\\\','\'
    if ($candidate) { $mountCandidates += [Environment]::ExpandEnvironmentVariables($candidate) }
  }
}

D. Windowsから見えるlogical driveを補助確認する
Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, DriveType, VolumeName

E. mount候補を正規化し、候補配下だけでHealth Auto Exportを確認する
$normalized = @()
foreach ($candidate in ($mountCandidates | Sort-Object -Unique)) {
  if ($candidate -match '^[A-Za-z]$') { $candidate = "$candidate`:" }
  if ($candidate -match '^[A-Za-z]:$') { $candidate = "$candidate\" }
  $normalized += $candidate
}

$results = @()
foreach ($mount in ($normalized | Sort-Object -Unique)) {
  $paths = @(
    (Join-Path $mount 'Health Auto Export'),
    (Join-Path $mount 'My Drive\Health Auto Export'),
    (Join-Path $mount 'マイドライブ\Health Auto Export')
  )
  foreach ($path in $paths) {
    if (Test-Path -LiteralPath $path -PathType Container) {
      $results += $path
    }
  }
}

$results | Sort-Object -Unique

禁止事項:
- registry変更
- Google Drive設定変更
- GoogleDriveFS restart/kill/start
- file本文read
- recursive health file listing
- account ID/email/tokenの表示
- Git操作
- package/CLI install
- GCP/Tailscale操作

返却形式だけ使用する:
依頼ID: CX-O12A-003
結果: PASS / BLOCKED
GoogleDriveFS running: true / false
Mount candidates: pathだけ。なければ NONE
Logical drives: DeviceID / DriveType / VolumeNameだけ
Health Auto Export path: path または NOT FOUND
変更: なし
エラー/ブロッカー: あれば簡潔に
Commit SHA: なし
```

## 3. 判定ルール

- `Health Auto Export path` が取得できればN100 filesystem境界はPASS。
- `GoogleDriveFS running: false` でpathが見つからない場合は、mount不存在とは断定せず「DriveFS非稼働/実行context差」によるBLOCKEDとする。
- mount candidateがfolder pathであっても正常。drive letter前提にしない。
- pathはO-12aのcurrent-state evidenceとしてのみ扱い、Processed Data Contractの永続identityには使用しない。

## 4. 根拠

Google Workspaceの公式Drive for desktop高度設定では、WindowsのDriveFS設定場所として以下が示されている。

- `HKEY_LOCAL_MACHINE\Software\Google\DriveFS`
- `HKEY_CURRENT_USER\Software\Google\DriveFS`
- `HKEY_LOCAL_MACHINE\Software\Policies\Google\DriveFS`

`DefaultMountPoint` はmounted drive letterだけでなく、既存drive上のpathも設定可能である。一般ユーザー向け設定でもWindowsのGoogle Drive streaming locationをdrive letterまたはfolderへ変更できる。