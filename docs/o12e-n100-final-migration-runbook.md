# N100 final preservation integrity — O-12i

Status: **READY — DO NOT RUN NOW / execute after O-12i Cloud write freeze**  
Prepared in: **O-12e**  
Execution phase: **O-12i**  
Updated: **2026-08-26**  
Decision: [`o12e-preservation-scope-decision.md`](./o12e-preservation-scope-decision.md)

## 1. 目的

O-12i cutoverで取得したFirestore final backupについて、N100側で **バックアップ完全性確認と二重保存** を行う。

このtask内で:

1. Firestore preservation ZIP SHA-256取得
2. ZIP展開
3. evidence JSON読取
4. six collection JSONLの存在・件数・byteLength・SHA-256確認
5. original ZIPをN100 localに保持
6. original ZIPをGoogle Drive backup locationへcopy
7. local / Drive ZIP SHA-256一致確認
8. local legacy state presence / absence確認
9. present local legacy stateをprivate archiveしてDriveへcopy
10. O-12i final-preservation gate判定

をまとめて行う。

**npm test / build / real raw rebuild / semantic parity / migration snapshotは実施しない。**

## 2. 実行タイミング

**今は実行しない。**

必須precondition:

- O-12f COMPLETE
- O-12g COMPLETE
- O-12h COMPLETE
- O-12iでCloud automatic ingest/syncを可逆停止済み
- manual sync / ingestを行わないmaintenance window中
- in-flight Cloud writeがないことを確認済み
- このwrite freeze後にFirestore collectorを実行し、最新ZIPをN100へdownload済み

backup後にCloud writeを再開した場合、この結果はfinal preservationとして無効になる。その場合は次回cutoverでcollectorからやり直す。

## 3. 安全境界

許可:

- `migration-input/`のCloud evidence ZIP read
- local preservation directoryへのwrite
- Google Drive backup directoryへのnew file copy
- local legacy stateのread/private copy

禁止:

- raw Health Auto Export fileの変更・削除
- Firestore write/update/delete
- Git code/docs編集
- git reset / stash / rebase / force
- health valueのterminal返却
- archive JSONL本文のterminal返却
- Secret/token/OAuth credential表示

Cloud write freeze自体は本runbook開始前のO-12i operation-stop手順で実施する。

## 4. Repository precondition

repo rootで:

- branch `master`
- worktree CLEAN
- `migration-input/o12e-firestore-evidence*.zip` が1個以上存在
- Google Drive filesystemが利用可能

Cloud evidence ZIPがない場合はBLOCKED。Cloud再queryはこのtaskから行わない。

## 5. Git sync

repository codeは実行しないが、正式runbook/versionを揃えるためsyncだけ行う。

```powershell
git status --short
git branch --show-current
git fetch origin master
```

CLEAN + masterの場合のみ:

```powershell
git merge --ff-only origin/master
git status --short
git rev-parse HEAD
```

## 6. Cloud preservation ZIPを選ぶ

```powershell
$bundle = Get-ChildItem -LiteralPath "migration-input" -Filter "o12e-firestore-evidence*.zip" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $bundle) { throw "Firestore final preservation ZIP not found" }
$cloudBundleSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $bundle.FullName).Hash.ToLowerInvariant()
```

O-12i write freeze前に作成された古いbundleを誤採用しないこと。cutover中に取得した最新bundleだけを使う。

## 7. ZIP展開

既存directoryは削除しない。

```powershell
$evidenceRoot = Join-Path "migration-input" $bundle.BaseName
if (Test-Path -LiteralPath $evidenceRoot) { throw "Evidence extraction directory already exists" }
Expand-Archive -LiteralPath $bundle.FullName -DestinationPath $evidenceRoot

$evidencePath = Join-Path $evidenceRoot "o12e-firestore-evidence.json"
if (-not (Test-Path -LiteralPath $evidencePath -PathType Leaf)) {
  throw "o12e-firestore-evidence.json missing"
}
$evidence = Get-Content -Raw -LiteralPath $evidencePath | ConvertFrom-Json
```

## 8. six collection archive integrity

必須collection:

```powershell
$required = @(
  'sleep_records',
  'health_metric_records',
  'processed_drive_files',
  'drive_sync_runs',
  'ingest_batches',
  'metric_audit_summaries'
)
```

各collectionについて:

- evidence entryが1件だけ存在
- `sourceCount >= 0`
- count 0なら`presence=absent`
- count > 0なら`presence=present`
- presentなら`archiveArtifact`必須
- artifact file存在
- artifact byteLength一致
- artifact SHA-256一致
- JSONL non-empty line count = sourceCount

PowerShell例:

```powershell
$results = @()
foreach ($name in $required) {
  $entries = @($evidence.sources | Where-Object { $_.sourceSystem -eq 'firestore' -and $_.dataset -eq $name })
  if ($entries.Count -ne 1) { throw "Invalid evidence entry count: $name" }
  $entry = $entries[0]
  $count = [int]$entry.sourceCount

  if ($count -eq 0) {
    if ($entry.presence -ne 'absent') { throw "Zero-count presence mismatch: $name" }
    $results += [pscustomobject]@{ dataset=$name; count=0; archive='ABSENT' }
    continue
  }

  if ($entry.presence -ne 'present' -or -not $entry.archiveArtifact) {
    throw "Archive metadata missing: $name"
  }

  $artifactPath = Join-Path $evidenceRoot $entry.archiveArtifact.relativePath
  if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
    throw "Archive file missing: $name"
  }

  $file = Get-Item -LiteralPath $artifactPath
  if ($file.Length -ne [int64]$entry.archiveArtifact.byteLength) {
    throw "Archive byteLength mismatch: $name"
  }

  $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifactPath).Hash.ToLowerInvariant()
  if ($sha -ne ([string]$entry.archiveArtifact.sha256).ToLowerInvariant()) {
    throw "Archive SHA mismatch: $name"
  }

  $lineCount = (Get-Content -LiteralPath $artifactPath | Where-Object { $_.Trim().Length -gt 0 }).Count
  if ($lineCount -ne $count) { throw "Archive count mismatch: $name" }

  $results += [pscustomobject]@{ dataset=$name; count=$count; archive='PASS' }
}
```

JSONL本文はterminalへ表示しない。

## 9. Google Driveへoriginal Firestore ZIPをcopy

現在のhost boundary候補:

```text
L:\マイドライブ\Health Auto Export\Processed Data Backup\firestore-archives
```

これはrunbook上の現在値でありimplementation hardcodeではない。raw watch root `...\Sleep` の外側に置く。

```powershell
$DRIVE_ARCHIVE_DIR = "L:\マイドライブ\Health Auto Export\Processed Data Backup\firestore-archives"
New-Item -ItemType Directory -Force -Path $DRIVE_ARCHIVE_DIR | Out-Null

$driveBundle = Join-Path $DRIVE_ARCHIVE_DIR $bundle.Name
if (Test-Path -LiteralPath $driveBundle) { throw "Drive backup already exists; refusing overwrite" }
Copy-Item -LiteralPath $bundle.FullName -Destination $driveBundle

$driveBundleSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $driveBundle).Hash.ToLowerInvariant()
if ($driveBundleSha -ne $cloudBundleSha) { throw "Firestore preservation ZIP SHA mismatch" }
```

Cloud Shellからdownloadしたoriginal ZIPそのものをcopyする。再圧縮による差異を入れない。

## 10. Local legacy state

local stateはcutover時点で存在する場合だけprivate archiveする。

確認候補:

- `.env.local`の`HEALTH_IMPORT_DATA_DIR`
- 未設定ならrepo `server-data/`

対象:

- `health-store.json`
- `processed-files.json`
- 各`.bak`が存在する場合はそれも含める

不在ならABSENTと記録する。存在する場合は本文をterminalへ出さず、ZIPへまとめてGoogle Driveの同じpreservation areaへcopyし、local/Drive SHA-256一致を確認する。

local legacy stateが存在しないこと自体はBLOCKERではない。

## 11. O-12i final-preservation PASS判定

**PASS**:

- Firestore six evidence entriesがすべて存在
- present collectionのJSONL artifactがすべて存在
- present artifactのcount / byteLength / SHA-256が一致
- original Firestore ZIPをN100 localで保持
- original Firestore ZIPをGoogle Driveへcopy
- local / Drive ZIP SHA-256一致
- local legacy state presence / absence確認済み
- present local legacy stateはprivate backup済み
- Cloud write freezeが維持されている
- final git status CLEAN

**BLOCKED**:

- write freeze未完了
- write freeze後のfinal evidence ZIPなし
- multiple-userのためCloud collectorがbundleを生成できていない
- required collection evidence欠落
- archive artifact欠落
- count / byteLength / SHA mismatch
- Google Drive copy不可またはSHA mismatch

**FAIL**:

- preservation script / PowerShell処理自体のapplication error

semantic parity mismatchはこの判定項目ではない。

## 12. 返却形式

```text
依頼ID: CX-O12I-FINAL-BACKUP-001
結果: PASS / BLOCKED / FAIL
branch: master
master SHA:
Cloud write freeze: CONFIRMED / NOT_CONFIRMED
cloud evidence ZIP sha256:
sleep_records count:
sleep_records archive: PASS / ABSENT / FAIL
health_metric_records count:
health_metric_records archive: PASS / ABSENT / FAIL
processed_drive_files count:
processed_drive_files archive: PASS / ABSENT / FAIL
drive_sync_runs count:
drive_sync_runs archive: PASS / ABSENT / FAIL
ingest_batches count:
ingest_batches archive: PASS / ABSENT / FAIL
metric_audit_summaries count:
metric_audit_summaries archive: PASS / ABSENT / FAIL
Firestore ZIP Drive copy: PASS / FAIL
Firestore ZIP Drive sha: PASS / FAIL
local health-store: PRESENT_BACKED_UP / ABSENT / FAIL
local processed-files: PRESENT_BACKED_UP / ABSENT / FAIL
final git status: CLEAN / DIRTY
変更: private preservation files + Google Drive backupのみ
application error:
```

health values、archive本文、user ID、tokenは返却しない。

## 13. Firestore削除について

このrunbookがPASSしても、その場でFirestoreを削除しない。

write freezeを維持したままO-12i local-only operationを確認し、そのPASS後にO-12j final auditへ進む。

O-12jではこのfinal backupが存在し、かつbackup後にCloud writeを再開していないことを削除前提として確認する。
