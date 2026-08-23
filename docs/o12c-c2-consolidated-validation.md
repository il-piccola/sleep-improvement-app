# O-12c C2 統合検証

Status: **READY — one-pass validation**  
Task ID: **CX-O12C-010**  
Phase: **O-12c — Processor independence / C2**  
Updated: **2026-08-23**

## 1. 方針

Codexとの往復を減らすため、この依頼は安全に継続できる確認を1回にまとめる。

既知のN100環境事象:

- `os.userInfo()` が `uv_os_get_passwd returned ENOMEM` を返す
- `os.homedir()` はPASS
- 物理メモリは約16GB、確認時free約5.6GB
- repo内に `node:os` / `os.userInfo()` / `os.homedir()` の直接利用なし

この既知事象を再probeせず、C2 testをNode 22.23.1のnative TypeScript type strippingで直接実行して`tsx`経路を回避する。

C1では既にprocessor targeted/build/CLI/full testがPASS済み。C2では既存Web/Cloud runtime sourceを変更していないため、C2の新規Processor経路を直接検証し、full testが同じOS/libuv ENOMEMだけで止まる場合はC2 application failureとは扱わない。

## 2. Git安全確認

repository rootで実行:

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

Nodeは既知の`v22.23.1`想定。22.18以降ではTypeScript type strippingが既定有効。

## 3. C2 native targeted test

`tsx`を使わず直接Nodeで実行:

```powershell
node tests/processor-canonical-integration.test.ts
```

PASS条件:

- exit code 0
- `processor canonical integration tests passed`

assertion / syntax / module errorなら **C2 FAIL**。

`uv_os_get_passwd ENOMEM`がこのnative実行でも発生した場合だけ **ENVIRONMENT BLOCKED** とする。

## 4. build

C2修正後のsource typecheck/build確認:

```powershell
npm run build
```

compile/type errorなら **C2 FAIL**。

## 5. Processor依存境界

```powershell
$forbidden = 'SleepSourcePreferenceMap|sourcePreferences|firebase-admin|firebase/|React|react|cloud-api|server/healthStore|server/server|Tailscale|googleapis'
$hits = Get-ChildItem '.\processor' -Filter '*.ts' -Recurse |
  Select-String -Pattern $forbidden

if ($hits) {
  $hits | Select-Object Path, LineNumber, Line
} else {
  'PROCESSOR_FORBIDDEN_IMPORT_SCAN=PASS'
}
```

hitがあれば **C2 FAIL**。

## 6. full regressionは1回だけ試行

native targeted / build / forbidden scanが全てPASSした場合のみ:

```powershell
npm test
```

判定:

- PASS: C2 validation全体PASS
- assertion / compile / module resolution等のapplication error: **C2 FAIL**
- failureが既知の `uv_os_get_passwd returned ENOMEM` のみ: **ENVIRONMENT_EXCEPTION** と記録し、C2の新規Processor経路はnative targeted + build + dependency boundaryのPASS、およびC1時点のfull test PASSを根拠にC2 application validationをPASS扱いできる

同じENOMEMの再試行を何度も行わない。

## 7. 最終確認

```powershell
git status --short
```

CLEAN必須。

## 8. 禁止事項

- code/docs編集
- package install/update
- `npm ci` / `npm install`
- `npm audit fix`
- Git reset/stash/rebase/force操作
- process kill
- Windows/pagefile設定変更
- real Health Auto Export JSON read
- server起動
- Cloud/Firebase/Drive/Tailscale設定変更

## 9. 返却形式

```text
依頼ID: CX-O12C-010
結果: PASS / PASS_WITH_ENVIRONMENT_EXCEPTION / FAIL / BLOCKED
branch: master / other
start git status: CLEAN / DIRTY
master SHA: <sha>
node version: <version>
native C2 targeted test: PASS / FAIL / 未実行
build: PASS / FAIL / 未実行
forbidden import scan: PASS / FAIL / 未実行
full test: PASS / ENVIRONMENT_EXCEPTION / FAIL / 未実行
final git status: CLEAN / DIRTY
変更: なし
最初のapplication error: なし / 最小限
環境例外: なし / uv_os_get_passwd ENOMEM
```

途中の既知probe異常だけで小刻みに停止せず、上記の安全な検証を可能なところまで一括実行する。
