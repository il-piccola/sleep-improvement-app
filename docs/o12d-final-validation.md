# O-12d 最終統合検証 — CX-O12D-001

Status: **READY — O-12dはこの1回で判定する**  
Phase: **O-12d — Processor hardening**  
Updated: **2026-08-24**

## 1. 原則

この検証は小分けにしない。

- synthetic temp dataのみ使用
- 実Health Auto Export JSONは開かない
- 実Google Driveへ書き込まない
- serverを起動しない
- Cloud/Firebase/Tailscale設定を変更しない
- code/docsを編集しない
- package.json / lockfileを変更しない
- 既知`uv_os_get_passwd ENOMEM`だけを理由に安全な後続checkを途中停止しない

## 2. Git安全境界

```powershell
git status --short
git branch --show-current
git fetch origin master
```

必須:

- branch = `master`
- worktree = CLEAN

条件を満たす場合のみ:

```powershell
git merge --ff-only origin/master
git status --short
git rev-parse HEAD
```

HEAD側だけのcommitがある、またはworktree DIRTYなら変更せずBLOCKED。

## 3. 依存確認と同一タスク内復旧

```powershell
$rootTsx = Test-Path '.\node_modules\.bin\tsx.cmd'
$rootTsc = Test-Path '.\node_modules\.bin\tsc.cmd'
$cloudFirebaseAdmin = Test-Path '.\cloud-api\node_modules\firebase-admin'
```

root依存が欠けている場合のみ:

```powershell
npm ci --include=dev
```

Cloud依存が欠けている場合のみ:

```powershell
npm ci --prefix cloud-api --include=dev
```

許可する変更はignored `node_modules`復旧のみ。

禁止:

- `npm install`
- package追加/update
- global install
- `npm audit fix`

## 4. O-12d synthetic hardening test

```powershell
node tests/processor-hardening.test.ts
```

この1本で確認する:

- safe JSON state write / backup recovery
- corruption explicit failure
- portable processed-file ledger
- metadata-first / conditional hash
- standalone watcher rescan
- second rescan skip
- portable path config
- immutable snapshot
- complete/manifest/dataset integrity
- synthetic backup copy
- raw directory → canonical snapshot end-to-end
- absolute raw path non-persistence

PASS必須。

assertion / module resolution / application runtime errorならFAIL。

## 5. Build

```powershell
npm run build
```

PASS必須。

## 6. Static safety checks

### hardcoded host path

```powershell
$hostPathHits = Get-ChildItem '.\processor','.\server' -Filter '*.ts' -Recurse |
  Select-String -Pattern 'K:\\|L:\\|マイドライブ'

if ($hostPathHits) {
  $hostPathHits | Select-Object Path, LineNumber, Line
} else {
  'HARDCODED_HOST_PATH_SCAN=PASS'
}
```

### truncation regression

```powershell
$truncateHits = @()
$truncateHits += Select-String -Path '.\server\processedFiles.ts' -Pattern 'slice\(0,\s*500'
$truncateHits += Select-String -Path '.\server\healthStore.ts' -Pattern 'slice\(0,\s*50'

if ($truncateHits) {
  $truncateHits | Select-Object Path, LineNumber, Line
} else {
  'STATE_TRUNCATION_SCAN=PASS'
}
```

### Processor forbidden runtime dependency

```powershell
$forbidden = 'SleepSourcePreferenceMap|sourcePreferences|firebase-admin|firebase/|React|react|cloud-api|server/healthStore|server/server|Tailscale|googleapis'
$forbiddenHits = Get-ChildItem '.\processor' -Filter '*.ts' -Recurse |
  Select-String -Pattern $forbidden

if ($forbiddenHits) {
  $forbiddenHits | Select-Object Path, LineNumber, Line
} else {
  'PROCESSOR_FORBIDDEN_IMPORT_SCAN=PASS'
}
```

3項目ともPASS必須。

## 7. Standalone snapshot CLI usage

実dataは渡さずusageだけ確認する。

```powershell
node processor/runDirectory.ts
$snapshotUsageExit = $LASTEXITCODE
"SNAPSHOT_USAGE_EXIT=$snapshotUsageExit"
```

exit code `2` がPASS。

## 8. Full regression

1回だけ試行する。

```powershell
npm test
```

判定:

- PASS: full regression PASS
- `uv_os_get_passwd returned ENOMEM`だけ: ENVIRONMENT_EXCEPTION。O-12d FAILにはしない
- assertion / module resolution / compile / application error: FAIL

既知ENOMEM時に追加probeや再試行はしない。

## 9. Final Git status

```powershell
git status --short
```

CLEAN必須。

## 10. O-12d判定

### PASS

次が全て満たされる:

- synthetic hardening test PASS
- build PASS
- hardcoded host path scan PASS
- truncation scan PASS
- Processor forbidden import scan PASS
- snapshot CLI usage exit 2
- full regression PASS
- final worktree CLEAN

### PASS_WITH_ENVIRONMENT_EXCEPTION

上記のうちfull regressionだけが既知`uv_os_get_passwd ENOMEM`で停止し、application errorがなく、その他全項目PASS。

この場合もO-12d Exit Gateは通過可能。

### FAIL

application/assertion/compile/module-resolution errorが1件でもある。

安全に実行可能な後続static checkとfinal git statusは可能な限り続け、failureをまとめて返す。

## 11. 返却形式

```text
依頼ID: CX-O12D-001
結果: PASS / PASS_WITH_ENVIRONMENT_EXCEPTION / FAIL / BLOCKED
branch: master / other
start git status: CLEAN / DIRTY
master SHA: <sha>
root dependency restore: PASS / 不要 / FAIL
cloud dependency restore: PASS / 不要 / FAIL
O-12d synthetic hardening test: PASS / FAIL / 未実行
build: PASS / FAIL / 未実行
hardcoded host path scan: PASS / FAIL / 未実行
state truncation scan: PASS / FAIL / 未実行
processor forbidden import scan: PASS / FAIL / 未実行
snapshot CLI usage: PASS / FAIL / 未実行
snapshot CLI exit: <code / 未実行>
full regression: PASS / ENVIRONMENT_EXCEPTION / FAIL / 未実行
final git status: CLEAN / DIRTY
変更: node_modules復旧のみ / なし
最初のapplication error: なし / <最小限>
環境例外: なし / uv_os_get_passwd ENOMEM
```
