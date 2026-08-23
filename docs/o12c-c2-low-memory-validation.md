# O-12c C2 N100 低メモリ再検証

Status: **READY — environment retry only**  
Phase: **O-12c — Processor independence / C2**  
依頼ID: **CX-O12C-009**  
Updated: **2026-08-23**

## 1. 背景

`CX-O12C-008` は次の状態だった。

- branch: `master`
- start/final worktree: CLEAN
- `build`: PASS
- Processor forbidden import scan: PASS
- `processor targeted test`: FAIL
- `full test`: FAIL
- failure: `node:os:306 — uv_os_get_passwd returned ENOMEM (not enough memory)`

repo内に `node:os` / `os.userInfo()` / `os.homedir()` の直接利用は確認されていない。

したがって現時点ではC2ロジックFAILと判定せず、N100のNode/tsx実行環境で一時的なOS-level memory allocation failureが起きた可能性を先に切り分ける。

この依頼ではコード・docs・packageを変更しない。

## 2. 安全確認

repository rootで:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
```

必須:

- branch = `master`
- worktree = CLEAN

満たさなければBLOCKED。

## 3. Node OS API最小確認

ユーザー名やhome pathは出力しない。

```powershell
node -e "require('node:os').userInfo(); console.log('OS_USERINFO_OK')"
node -e "require('node:os').homedir(); console.log('OS_HOMEDIR_OK')"
```

ここで同じ `ENOMEM` が出る場合:

- C2 testは実行しない
- `ENVIRONMENT BLOCKED`で終了
- コード変更しない

## 4. read-only memory inventory

```powershell
$os = Get-CimInstance Win32_OperatingSystem
[PSCustomObject]@{
  TotalVisibleMemoryMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
  FreePhysicalMemoryMB = [math]::Round($os.FreePhysicalMemory / 1024)
}

Get-CimInstance Win32_PageFileUsage | Select-Object AllocatedBaseSize,CurrentUsage,PeakUsage
```

数値のみ返し、process名一覧やユーザー情報は不要。

## 5. C2 targeted testを単独実行

npm script全体ではなくC2 testだけを直接実行する。

```powershell
$oldNodeOptions = $env:NODE_OPTIONS
try {
  $env:NODE_OPTIONS = '--max-old-space-size=512'
  .\node_modules\.bin\tsx.cmd tests\processor-canonical-integration.test.ts
} finally {
  if ($null -eq $oldNodeOptions) {
    Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  } else {
    $env:NODE_OPTIONS = $oldNodeOptions
  }
}
```

判定:

- assertion / TypeScript / application error: **C2 FAIL**
- `ENOMEM` / `uv_os_get_passwd`: **ENVIRONMENT BLOCKED**
- exit 0: targeted PASS

## 6. C1 processor regressionだけ確認

C2 targeted PASS後のみ:

```powershell
.\node_modules\.bin\tsx.cmd tests\processor-health-auto-export.test.ts
```

PASSしたら次へ。

## 7. full test

C2 targeted + C1 regression PASS後のみ:

```powershell
npm test
```

- PASS: C2 validation PASS候補
- assertion/application error: FAIL
- `ENOMEM`のみ: ENVIRONMENT BLOCKED

`build`とforbidden import scanは`CX-O12C-008`でPASS済みのため再実行しない。

## 8. 禁止事項

- code/docs編集
- package install/update
- `npm ci`
- `npm install`
- `npm audit fix`
- Git reset/stash/rebase/force操作
- process強制終了
- Windows設定/pagefile設定変更
- real Health Auto Export JSON read
- server起動
- Cloud/Firebase/Drive/Tailscale設定変更

## 9. 返却形式

```text
依頼ID: CX-O12C-009
結果: PASS / FAIL / ENVIRONMENT BLOCKED
branch: master
start git status: CLEAN / DIRTY
master SHA: <sha>
OS userInfo probe: PASS / ENOMEM / FAIL
OS homedir probe: PASS / ENOMEM / FAIL
TotalVisibleMemoryMB: <number / unknown>
FreePhysicalMemoryMB: <number / unknown>
PageFile: allocated/current/peak または unknown
C2 targeted test: PASS / FAIL / ENOMEM / 未実行
C1 processor regression: PASS / FAIL / ENOMEM / 未実行
full test: PASS / FAIL / ENOMEM / 未実行
build: PASS (CX-O12C-008で確認済み)
forbidden import scan: PASS (CX-O12C-008で確認済み)
final git status: CLEAN / DIRTY
変更: なし
エラー/ブロッカー: あれば簡潔に
```

## 10. 判定ルール

- OS API probe自体がENOMEM: C2コードとは切り離してenvironment blockerとして扱う。
- C2 targeted testがapplication/assertion failure: C2コードFAILとしてChatGPTが修正する。
- targeted + regression + full test PASS、かつ`CX-O12C-008`のbuild/forbidden scan PASSを合わせてC2 COMPLETEとする。
