# O-12e N100 final migration / validation — CX-O12E-001

Status: **READY — Cloud evidence bundle download後に1回だけ実行**  
Updated: **2026-08-24**

## 1. 目的

O-12eのN100側作業を1回へ統合する。

このtask内で:

1. synthetic O-12e tests
2. build
3. Firestore evidence bundle展開 / SHA確認
4. real Health Auto Export rawからcanonical rebuild
5. completed snapshot local validation
6. completed snapshot Google Drive backup
7. local legacy state evidence
8. Cloud + local evidence merge
9. private evidence ZIP生成 + Google Drive copy + SHA一致
10. migration snapshot生成
11. rebuild parity / archive completeness
12. O-12e Exit Gate判定

をまとめて実行する。

## 2. 安全境界

許可:

- configured raw Health Auto Export JSONのread
- local Processed Data directoryへのwrite
- Google Driveの新規Processed Data backup directoryへのwrite
- `migration-input/` / `migration-output/`へのlocal write
- local legacy stateのread/private archive

禁止:

- raw Health Auto Export fileの変更・削除
- Firestore / Cloud Run / Scheduler / Billing変更
- Git code/docs編集
- git reset / stash / rebase / force
- health valueのterminal返却
- archive JSONL本文のterminal返却
- Secret/token/OAuth credential表示

## 3. 現在のN100 host boundary

観測済みraw root:

```text
L:\マイドライブ\Health Auto Export\Sleep
```

これはrunbook上の現在host値であり、implementationにはhardcodeしない。

Google Drive backup root候補:

```text
L:\マイドライブ\Health Auto Export\Processed Data Backup
```

raw watch root `...\Sleep` の外側に置く。

## 4. Precondition

repo rootで:

- branch `master`
- worktree CLEAN
- `migration-input/o12e-firestore-evidence*.zip` が1個以上存在
- `L:\マイドライブ\Health Auto Export\Sleep` が存在

Cloud evidence ZIPがない場合はBLOCKED。Cloud再queryはこのtaskから行わない。

## 5. Git sync

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

## 6. O-12e synthetic validation

```powershell
npm run test:processor
npm run build
```

application/compile/assertion errorならFAIL。

既知 `uv_os_get_passwd ENOMEM` がO-12e targeted testではなく無関係なfull regressionで出ることを理由に追加full regressionは実施しない。

## 7. Evidence bundle

最新ZIPを選ぶ。

```powershell
$bundle = Get-ChildItem -LiteralPath "migration-input" -Filter "o12e-firestore-evidence*.zip" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
```

ZIP SHA:

```powershell
$cloudBundleSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $bundle.FullName).Hash.ToLowerInvariant()
```

展開先はZIP basename専用directoryとし、既存directoryを削除しない。

```powershell
$evidenceRoot = Join-Path "migration-input" $bundle.BaseName
if (Test-Path -LiteralPath $evidenceRoot) { throw "Evidence extraction directory already exists" }
Expand-Archive -LiteralPath $bundle.FullName -DestinationPath $evidenceRoot
```

必須:

```text
o12e-firestore-evidence.json
```

## 8. Runtime paths

```powershell
$RAW_ROOT = "L:\マイドライブ\Health Auto Export\Sleep"
$BACKUP_ROOT = "L:\マイドライブ\Health Auto Export\Processed Data Backup"
$PROCESSED_ROOT = Join-Path $env:LOCALAPPDATA "SleepCompass\processed-data"
$MIGRATION_OUTPUT = Join-Path (Get-Location) "migration-output"
New-Item -ItemType Directory -Force -Path $MIGRATION_OUTPUT | Out-Null
```

`dataDir`はcode defaultを決め打ちせず、現在configから取得する。

```powershell
$tsx = Join-Path (Get-Location) "node_modules\.bin\tsx.cmd"
$configJson = & $tsx -e "import { loadHealthImportConfig } from './server/config.ts'; const c=loadHealthImportConfig(); console.log(JSON.stringify({dataDir:c.dataDir}))"
$config = $configJson | ConvertFrom-Json
$DATA_DIR = $config.dataDir
```

## 9. Real raw rebuild snapshot

実Healthデータ値は出力しない。Processor summaryだけ取得する。

```powershell
$env:PROCESSOR_REVISION = (git rev-parse HEAD).Trim()
$rawJson = & $tsx processor/runDirectory.ts $RAW_ROOT $PROCESSED_ROOT $BACKUP_ROOT
if ($LASTEXITCODE -ne 0) { throw "Real raw rebuild failed" }
$rawResult = ($rawJson -join "`n") | ConvertFrom-Json
$sourceSnapshot = Join-Path $PROCESSED_ROOT (Join-Path "snapshots" $rawResult.snapshotId)
```

必須:

- `failedFileCount = 0` が原則
- `sleepRecordCount > 0`
- local snapshot complete validation PASS
- Drive backup complete validation PASS

validation:

```powershell
& $tsx -e "import { validateCompletedSnapshot } from './processor/snapshot.ts'; await validateCompletedSnapshot(process.argv[1]); console.log('LOCAL_SNAPSHOT_VALID')" $sourceSnapshot
$sourceBackupSnapshot = Join-Path $BACKUP_ROOT (Join-Path "snapshots" $rawResult.snapshotId)
& $tsx -e "import { validateCompletedSnapshot } from './processor/snapshot.ts'; await validateCompletedSnapshot(process.argv[1]); console.log('DRIVE_SNAPSHOT_VALID')" $sourceBackupSnapshot
```

## 10. Local + Cloud evidence merge

```powershell
$cloudEvidence = Join-Path $evidenceRoot "o12e-firestore-evidence.json"
$mergedEvidence = Join-Path $evidenceRoot "o12e-migration-evidence.json"
& $tsx processor/runLocalMigrationEvidence.ts --data-dir $DATA_DIR --evidence-root $evidenceRoot --output $mergedEvidence --cloud-evidence $cloudEvidence
if ($LASTEXITCODE -ne 0) { throw "Migration evidence merge failed" }
```

## 11. Preserve evidence bundle to Google Drive

Cloud archive + local legacy archive + merged evidenceを1つのprivate ZIPへまとめる。

```powershell
$stamp = Get-Date -Format "yyyyMMddTHHmmss"
$finalEvidenceZip = Join-Path $MIGRATION_OUTPUT "o12e-final-evidence-$stamp.zip"
Compress-Archive -Path (Join-Path $evidenceRoot "*") -DestinationPath $finalEvidenceZip
$finalEvidenceSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $finalEvidenceZip).Hash.ToLowerInvariant()

$driveArchiveDir = Join-Path $BACKUP_ROOT "migration-archives"
New-Item -ItemType Directory -Force -Path $driveArchiveDir | Out-Null
$driveEvidenceZip = Join-Path $driveArchiveDir (Split-Path $finalEvidenceZip -Leaf)
Copy-Item -LiteralPath $finalEvidenceZip -Destination $driveEvidenceZip
$driveEvidenceSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $driveEvidenceZip).Hash.ToLowerInvariant()
if ($finalEvidenceSha -ne $driveEvidenceSha) { throw "Drive migration evidence ZIP SHA mismatch" }
```

ZIP本文をterminalへ表示しない。

## 12. Migration snapshot

```powershell
$migrationId = "mig-$stamp"
$migrationJson = & $tsx processor/runMigration.ts --source-snapshot $sourceSnapshot --processed-data-root $PROCESSED_ROOT --evidence $mergedEvidence --backup-root $BACKUP_ROOT --migration-id $migrationId
$migrationExit = $LASTEXITCODE
$migrationResult = ($migrationJson -join "`n") | ConvertFrom-Json
$migrationSnapshot = Join-Path $PROCESSED_ROOT (Join-Path "snapshots" $migrationResult.snapshotId)
$migrationBackupSnapshot = Join-Path $BACKUP_ROOT (Join-Path "snapshots" $migrationResult.snapshotId)
```

exit `3` はmanifest `blocked`を意味する。snapshot/evidenceを削除せず、unresolvedを返す。

local/Drive migration snapshot validation:

```powershell
& $tsx -e "import { validateCompletedSnapshot } from './processor/snapshot.ts'; await validateCompletedSnapshot(process.argv[1]); console.log('MIGRATION_LOCAL_VALID')" $migrationSnapshot
& $tsx -e "import { validateCompletedSnapshot } from './processor/snapshot.ts'; await validateCompletedSnapshot(process.argv[1]); console.log('MIGRATION_DRIVE_VALID')" $migrationBackupSnapshot
```

## 13. Migration result inspection

`migration-manifest.json`はhealth valueを含まないmigration evidenceなので、status/parity/countだけ読んでよい。

確認:

- `unresolved.length`
- Firestore `sleep_records.parity`
- Firestore `health_metric_records.parity`
- archive 4 categoryのpresence/sourceCount/archiveArtifact有無
- local health-store / processed-files presence

archive本文は読まない・表示しない。

## 14. O-12e PASS判定

**PASS**:

- synthetic tests PASS
- build PASS
- real raw snapshot local/Drive validation PASS
- failedFileCount = 0
- sleepRecordCount > 0
- final evidence ZIP local/Drive SHA一致
- migration snapshot local/Drive validation PASS
- migration `unresolved=[]`
- `sleep_records.parity=matched` またはFirestore側0件/local側0件
- `health_metric_records.parity=matched` またはFirestore側0件/local側0件
- present archive sourceすべてartifactあり
- final git status CLEAN

**PASS_WITH_WARNINGS**:

- `unresolved=[]`
- rebuild parity matched
- warnings/rejected rowsがあるが重要データ欠落を示さない

**BLOCKED**:

- evidence bundleなし
- multiple-user evidence bundleが生成されていない
- parity mismatch / not compared
- archive artifact不足
- unreadable local legacy state
- Drive backup SHA不一致

**FAIL**:

- compile/application/assertion failure
- snapshot validation failure

## 15. 返却形式

```text
依頼ID: CX-O12E-001
結果: PASS / PASS_WITH_WARNINGS / BLOCKED / FAIL
branch: master
master SHA:
synthetic migration tests: PASS / FAIL
build: PASS / FAIL
cloud evidence ZIP sha256:
raw input files:
raw processed files:
raw failed files:
sleep records:
health metrics:
raw local snapshot: PASS / FAIL
raw Drive snapshot: PASS / FAIL
local health-store: PRESENT / ABSENT
local processed-files: PRESENT / ABSENT
Firestore sleep_records count:
Firestore sleep_records parity: MATCHED / DIFFERENT / NOT_COMPARED
Firestore health_metric_records count:
Firestore health_metric_records parity: MATCHED / DIFFERENT / NOT_COMPARED
Firestore processed_drive_files archive: PASS / ABSENT / FAIL
Firestore drive_sync_runs archive: PASS / ABSENT / FAIL
Firestore ingest_batches archive: PASS / ABSENT / FAIL
Firestore metric_audit_summaries archive: PASS / ABSENT / FAIL
final evidence ZIP Drive sha: PASS / FAIL
migration status: completed / completed_with_warnings / blocked
migration unresolved count:
migration local snapshot: PASS / FAIL
migration Drive snapshot: PASS / FAIL
final git status: CLEAN / DIRTY
変更: local processed-data + Google Drive backup + ignored migration-input/outputのみ
application error:
environment exception:
```

health values、archive本文、user ID、tokenは返却しない。
