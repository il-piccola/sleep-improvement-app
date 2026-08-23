# O-12c C3実装 + O-12c最終統合検証

Status: **READY**  
Task ID: **CX-O12C-011**  
Phase: **O-12c — Processor independence / C3 + final gate**  
Date: **2026-08-23**

## 1. 方針

この依頼はC3単体確認だけで終わらせず、**O-12cの残りExit Gateを1回でまとめて検証する**。

途中のread-only probe失敗だけを理由に小分けの追加依頼へ分割しない。

停止条件は次だけ:

1. worktreeがdirtyで安全に同期できない
2. destructive/設定変更が必要
3. compile/application/assertion failureを確認した

既知の `uv_os_get_passwd ENOMEM` はN100環境例外として記録済みであり、それだけを理由に他の安全な検証を中止しない。

## 2. C2確定状態

`CX-O12C-010`:

- native C2 targeted test: PASS
- build: PASS
- forbidden import scan: PASS
- application error: なし
- full testのみ `uv_os_get_passwd ENOMEM`
- worktree CLEAN

よってC2は **COMPLETE**。

証拠: `docs/o12c-c2-validation-result-cx-o12c-010.md`

## 3. C3実装

Processor側へ追加:

- `processor/healthMetricTypes.ts`
  - Processed Data Contractのcanonical health metric型
  - Firestore `userId/runId`なし
- `processor/time.ts`
  - processing configのtimeZoneを使うdate/window helper
- `processor/dailyHealthMetrics.ts`
  - `step_count`
  - `walking_running_distance`
  - `active_energy`
  - `daily_total`
- `processor/sleepWindowHealthMetrics.ts`
  - `heart_rate`
  - `respiratory_rate`
  - `heart_rate_variability`
  - C2 canonical classified blocksを入力に` sleep_window_summary`を生成
- `tests/processor-health-metrics.test.ts`
  - synthetic dataのみ

root `test:processor`へC3 testを追加済み。

### Cloud runtime安全境界

`cloud-api/src/lib/healthMetricAggregator.ts` と
`cloud-api/src/lib/sleepWindowMetricAggregator.ts` は、現在のCloud build境界を壊さないため **変更しない**。

理由:

- `cloud-api`は独立package
- `cloud-api/tsconfig.json`は `rootDir: src`
- repo直下 `processor/*.ts` を直接importするadapter化は現在のCloud Run build/deploy境界を壊す可能性がある

したがってO-12cでは:

- canonical objective metric logicをProcessor側へ独立実装する
- 既存Cloud runtime implementationは互換保護のため残す
- Cloud停止前にruntime build構造を不用意に変更しない

Processed Data consumerへ切り替えるO-12f以降ではCloud implementationをcanonical sourceとして扱わない。

## 4. Git安全確認

repository rootで:

```powershell
git status --short
git branch --show-current
git fetch origin master
```

必須:

- branch = `master`
- worktree = CLEAN

満たす場合のみ:

```powershell
git merge --ff-only origin/master
git status --short
git rev-parse HEAD
node --version
```

満たさなければ変更せずBLOCKED。

## 5. Processor native tests

`tsx`を使わずNode 22 native TypeScript strippingで実行する。

```powershell
node tests/processor-health-auto-export.test.ts
$c1 = $LASTEXITCODE

node tests/processor-canonical-integration.test.ts
$c2 = $LASTEXITCODE

node tests/processor-health-metrics.test.ts
$c3 = $LASTEXITCODE
```

いずれかがapplication/assertion errorで失敗した場合はFAIL。

## 6. Build

```powershell
npm run build
$buildExit = $LASTEXITCODE
```

build FAILはFAIL。

## 7. Processor禁止依存scan

```powershell
$forbidden = 'SleepSourcePreferenceMap|sourcePreferences|firebase-admin|firebase/|React|react|cloud-api|server/healthStore|server/server|Tailscale|googleapis|\buserId\b|\brunId\b'
$hits = Get-ChildItem '.\processor' -Filter '*.ts' -Recurse |
  Select-String -Pattern $forbidden

if ($hits) {
  $hits | Select-Object Path, LineNumber, Line
} else {
  'PROCESSOR_FORBIDDEN_IMPORT_SCAN=PASS'
}
```

`sourceFileCount`等の文字列は対象外。`userId` / `runId`そのものがProcessor sourceに存在すればFAIL。

## 8. Cloud runtime無変更確認

C2開始前のbaseline commit `c723c8d1b58136b3fc283d40ed5bb271640ab2b4` と比較する。

```powershell
git diff --exit-code c723c8d1b58136b3fc283d40ed5bb271640ab2b4 -- `
  cloud-api/src/lib/healthMetricAggregator.ts `
  cloud-api/src/lib/sleepWindowMetricAggregator.ts
$cloudDiffExit = $LASTEXITCODE
```

期待: exit `0`。

これによりC3作業で現在のCloud metric runtime implementationを変更していないことを確認する。

## 9. watcher/server adapter経路

read-only static確認:

```powershell
$importAdapter = Select-String `
  -Path '.\server\importHealthExports.ts' `
  -Pattern 'processHealthAutoExportText'

$watchAdapter = Select-String `
  -Path '.\server\watchHealthExports.ts' `
  -Pattern 'importHealthExportFile'

if ($importAdapter -and $watchAdapter) {
  'WATCHER_PROCESSOR_ADAPTER_SCAN=PASS'
} else {
  'WATCHER_PROCESSOR_ADAPTER_SCAN=FAIL'
}
```

実Health Auto Export JSONは読まない。

## 10. full regressionは1回だけ試行

```powershell
$fullOutput = & npm test 2>&1
$fullExit = $LASTEXITCODE
```

判定:

- exit 0: `PASS`
- exit non-zeroで最初のapplication/assertion/compile errorあり: `FAIL`
- exit non-zeroで既知の `uv_os_get_passwd ENOMEM` のみ: `ENVIRONMENT_EXCEPTION`

既知ENOMEMでも前のstepは最後まで実施する。Windows設定変更やprocess killは行わない。

長いlogは返さず、最初のapplication errorまたはenvironment exceptionだけ返す。

## 11. O-12c COMPLETE条件

次をすべて満たした場合、`PASS`または`PASS_WITH_ENVIRONMENT_EXCEPTION`とする。

- C1 native processor test PASS
- C2 native processor test PASS
- C3 native processor test PASS
- build PASS
- Processor forbidden import scan PASS
- Cloud metric runtime files unchanged PASS
- watcher → server importer → Processor adapter scan PASS
- final worktree CLEAN
- full regressionがPASS、または既知`uv_os_get_passwd ENOMEM`のみのenvironment exception
- application/assertion/compile errorなし

この条件を満たせば **O-12c Exit GateをCOMPLETEとして閉じられる**。

## 12. 禁止事項

- code/docs編集
- package install/update
- `npm ci` / `npm install`
- `npm audit fix`
- Git reset/stash/rebase/force操作
- Windows/pagefile設定変更
- process強制終了
- real Health Auto Export JSON read
- server起動
- Cloud/Firebase/Drive/Tailscale設定変更

## 13. 返却形式

```text
依頼ID: CX-O12C-011
結果: PASS / PASS_WITH_ENVIRONMENT_EXCEPTION / BLOCKED / FAIL
branch: master / other
start git status: CLEAN / DIRTY
master SHA: <sha>
node version: <version>
C1 native processor test: PASS / FAIL
C2 native processor test: PASS / FAIL
C3 native processor test: PASS / FAIL
build: PASS / FAIL
processor forbidden import scan: PASS / FAIL
cloud metric runtime unchanged: PASS / FAIL
watcher processor adapter scan: PASS / FAIL
full regression: PASS / ENVIRONMENT_EXCEPTION / FAIL
final git status: CLEAN / DIRTY
変更: なし
最初のapplication error: なし / 最小限
environment exception: なし / uv_os_get_passwd ENOMEM
```
