# O-12a N100最小read-only監査

Status: **READY**  
Phase: **O-12a — 現状監査**  
Codex依頼ID: **CX-O12A-002**

## 1. 目的

`CX-O12A-001` で未取得だったN100側の事実だけを確認する。

再確認しない:

- Git branch / sync
- Node/npm version
- JSON Schema構文
- GCP control-plane

確認するのは次の2カテゴリだけ。

1. Google Drive for DesktopのOS-visible path境界
2. Tailscale Windows serviceの存在・状態

`server-data` が存在しない場合は、それ自体を現在状態として記録し、作成しない。

## 2. Codexへ渡す正式依頼

```text
依頼ID: CX-O12A-002
フェーズ: O-12a 現状監査
目的: N100上で、Google Drive/Health Auto Exportの実pathとTailscale Windows service状態だけをread-only確認する。

前提:
- repositoryは sleep-improvement-app。
- CX-O12A-001でGit/Node/npm/JSON Schemaは確認済み。再確認しない。
- GCP監査は別手順で行う。gcloud/Firebase CLIをinstallしない。

PowerShellで次だけ確認する。

A. filesystem境界
1. FileSystem driveの Name / Root を確認する。
2. C:以外のFileSystem driveを対象に、深さ2まで exact directory name `Health Auto Export` を探す。
3. 見つかった場合、そのfull pathだけ返す。
4. その直下に `Sleep` directoryが存在するか true/falseだけ返す。
5. health JSON本文やfile名一覧は読まない/返さない。
6. repository root直下の `server-data` の存在をtrue/falseで確認し、存在する場合だけfull pathを返す。中身は読まない。

B. Tailscale
1. Windows service一覧からNameまたはDisplayNameに`Tailscale`を含むserviceを探す。
2. service Name / Status / StartTypeだけ返す。
3. tailscale CLIは実行しない。
4. service restart/start/stopはしない。
5. IP、device name、tailnet name、Serve URLは返さない。

参考PowerShell:

$drives = Get-PSDrive -PSProvider FileSystem | Select-Object Name, Root
$drives

$matches = @()
$nonSystem = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -ne 'C' }
foreach ($drive in $nonSystem) {
  $level1 = Get-ChildItem -LiteralPath $drive.Root -Directory -ErrorAction SilentlyContinue
  foreach ($dir1 in $level1) {
    if ($dir1.Name -eq 'Health Auto Export') { $matches += $dir1.FullName }
    $level2 = Get-ChildItem -LiteralPath $dir1.FullName -Directory -ErrorAction SilentlyContinue
    foreach ($dir2 in $level2) {
      if ($dir2.Name -eq 'Health Auto Export') { $matches += $dir2.FullName }
    }
  }
}
$matches | Sort-Object -Unique

foreach ($path in ($matches | Sort-Object -Unique)) {
  [PSCustomObject]@{
    HealthAutoExportPath = $path
    SleepDirectoryExists = Test-Path -LiteralPath (Join-Path $path 'Sleep') -PathType Container
  }
}

$repo = (Get-Location).Path
$serverData = Join-Path $repo 'server-data'
[PSCustomObject]@{
  ServerDataExists = Test-Path -LiteralPath $serverData -PathType Container
  ServerDataPath = if (Test-Path -LiteralPath $serverData -PathType Container) { $serverData } else { $null }
}

Get-Service | Where-Object {
  $_.Name -like '*Tailscale*' -or $_.DisplayName -like '*Tailscale*'
} | Select-Object Name, Status, StartType

禁止事項:
- git操作
- file作成/変更/削除
- health file本文read
- package/CLI install
- gcloud/firebase実行
- tailscale CLI実行
- Windows service状態変更
- Drive/Tailscale設定変更

返却形式だけ使用する:
依頼ID: CX-O12A-002
結果: PASS / BLOCKED
FileSystem drives: drive letter + rootのみ
Health Auto Export path: path または NOT FOUND
Sleep directory exists: true / false / unknown
server-data: EXISTS <path> / ABSENT
Tailscale service: Name / Status / StartType または NOT FOUND
変更: なし
エラー/ブロッカー: あれば簡潔に
Commit SHA: なし
```

## 3. 判定ルール

- `server-data: ABSENT` は失敗ではなくcurrent-state inventoryとして受理する。
- Tailscale serviceが見つかり状態を取得できれば、O-12aではruntime inventoryとして十分とする。
- 現在のTailscale Serve configured状態はO-12gで新しいlocalhost-only構成を設定・検証するため、O-12a Exit Gateの必須条件にはしない。
- `Health Auto Export` pathが見つからない場合のみN100 filesystem境界をBLOCKEDとする。
