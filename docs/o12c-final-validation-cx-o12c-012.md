# O-12c 最終再検証 — CX-O12C-012

Status: **READY — 最終1回**  
Phase: **O-12c**  
Updated: **2026-08-23**

## 1. 目的

`CX-O12C-011`で確認されたnative Node module resolutionだけを修正した後、O-12cを閉じられるか最終確認する。

前回PASS済みのC2/C3 native tests、Processor forbidden import scan、Cloud metric runtime unchanged、watcher Processor adapter scanは再実行しない。

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

## 3. C1 native test

Node 22 native TypeScript executionで直接実行する。

```powershell
node tests/processor-health-auto-export.test.ts
```

PASS必須。

`ERR_MODULE_NOT_FOUND`、assertion、compile/runtime errorがあればapplication FAILとして記録する。

## 4. Build

```powershell
npm run build
```

PASS必須。

今回変更した `.ts` import specifierがroot TypeScript/Vite buildと互換であることを確認する。

## 5. Full regression

1回だけ試行する。

```powershell
npm test
```

判定:

- PASS: full regression PASS
- `uv_os_get_passwd returned ENOMEM` のみで停止: **ENVIRONMENT_EXCEPTION**として記録し、これだけではO-12cをFAILにしない
- assertion / compile / module resolution / application error: **FAIL**

既知ENOMEMが出ても追加probeや再試行はしない。

## 6. Final Git status

```powershell
git status --short
```

CLEAN必須。

## 7. O-12c判定

次をすべて満たせば **PASS** または **PASS_WITH_ENVIRONMENT_EXCEPTION**:

1. C1 native test PASS
2. build PASS
3. full regression PASS、または既知 `uv_os_get_passwd ENOMEM` のみ
4. final worktree CLEAN
5. `CX-O12C-011`で以下がPASS済み
   - C2 native processor test
   - C3 native processor test
   - Processor forbidden import scan
   - Cloud metric runtime unchanged
   - watcher Processor adapter scan
6. C1 one-shot CLIは`CX-O12C-006`でPASS済み
7. C1 full regressionは`CX-O12C-007`で一度PASS済み

この条件を満たせばO-12c Exit GateをCOMPLETEとしてよい。

## 8. 禁止事項

- code/docs編集
- package install/update
- npm ci
- npm audit fix
- git reset / stash / rebase / force
- Windows/pagefile設定変更
- process強制終了
- real Health Auto Export JSON read
- server起動
- Cloud/Firebase/Drive/Tailscale変更

## 9. 返却形式

```text
依頼ID: CX-O12C-012
結果: PASS / PASS_WITH_ENVIRONMENT_EXCEPTION / FAIL / BLOCKED
branch: master / other
start git status: CLEAN / DIRTY
master SHA: <sha>
C1 native processor test: PASS / FAIL / 未実行
build: PASS / FAIL / 未実行
full regression: PASS / ENVIRONMENT_EXCEPTION / FAIL / 未実行
prior C2 native: PASS
prior C3 native: PASS
prior forbidden scan: PASS
prior cloud runtime unchanged: PASS
prior watcher adapter scan: PASS
final git status: CLEAN / DIRTY
変更: なし
最初のapplication error: なし / 最小限
環境例外: なし / uv_os_get_passwd ENOMEM
```
