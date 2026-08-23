# O-12c C1 N100依存復旧 + 検証

Status: **READY**  
Phase: **O-12c — Processor independence / C1**  
依頼ID: **CX-O12C-006**  
Updated: **2026-08-23**

## 1. 背景

`CX-O12C-005` ではworktree cleanupと`origin/master`へのfast-forwardはPASSしたが、`tsx` / `tsc` が認識されず、C1のtest/buildは実行段階まで到達しなかった。

これは現時点ではC1コードのFAILとは扱わない。`package.json`と`package-lock.json`には`tsx`と`typescript`がdevDependenciesとして存在するため、N100側の`node_modules`未導入またはdevDependencies省略状態をまず復旧する。

この依頼ではtracked source/docsを編集しない。`node_modules`は`.gitignore`対象であり、lockfile準拠の`npm ci --include=dev`だけを許可する。

新しい有料serviceは使わない。npm registryから既存lockfile依存を取得するだけで、追加課金契約は発生しない。

## 2. 安全確認

repository rootで実行する。

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
```

必須:

- branch = `master`
- worktree = CLEAN

dirtyなら何も変更せずBLOCKED。

## 3. 現在の依存状態確認

```powershell
$tsxExists = Test-Path -LiteralPath '.\node_modules\.bin\tsx.cmd' -PathType Leaf
$tscExists = Test-Path -LiteralPath '.\node_modules\.bin\tsc.cmd' -PathType Leaf
$nodeModulesExists = Test-Path -LiteralPath '.\node_modules' -PathType Container
$npmOmit = npm config get omit
$nodeEnv = $env:NODE_ENV

[PSCustomObject]@{
  NodeModulesExists = $nodeModulesExists
  TsxExists = $tsxExists
  TscExists = $tscExists
  NpmOmit = $npmOmit
  NodeEnv = $nodeEnv
}
```

値にかかわらず、`tsx`または`tsc`が存在しなければ次へ進む。

## 4. lockfile準拠でdevDependenciesを復旧

`tsx`または`tsc`が欠けている場合のみ:

```powershell
npm ci --include=dev
```

禁止:

- `npm install`（lockfileを書き換える可能性があるため）
- package追加/更新
- `npm audit fix`
- global install

`npm ci`後:

```powershell
Test-Path -LiteralPath '.\node_modules\.bin\tsx.cmd' -PathType Leaf
Test-Path -LiteralPath '.\node_modules\.bin\tsc.cmd' -PathType Leaf
.\node_modules\.bin\tsx.cmd --version
.\node_modules\.bin\tsc.cmd --version
git status --short
```

ここでtracked worktreeがdirtyになった場合は検証せずBLOCKED。`node_modules`だけの変更は`git status`に出ない想定。

## 5. C1検証

依存復旧後のみ実行:

```powershell
npm run test:processor
npm run build
npm test
```

one-shot usage:

```powershell
npm run processor:once
$cliExit = $LASTEXITCODE
Write-Output "PROCESSOR_ONCE_EXIT=$cliExit"
```

期待:

- processor test: PASS
- build: PASS
- full test: PASS
- `processor:once`: usage表示、serverを起動しない、exit code `2`

実Health Auto Export JSONは開かない。

## 6. 禁止事項

- code/docs編集
- package.json/package-lock.json編集
- `npm install`
- package update
- global npm install
- `npm audit fix`
- Git reset/stash/rebase/force操作
- real health data read
- server起動
- Cloud/Firebase/Drive/Tailscale設定変更

## 7. 判定

- `npm ci --include=dev`自体がnetwork/permission等で失敗: **BLOCKED**
- 依存復旧後にprocessor test/build/full test/CLIのいずれかが失敗: **FAIL**。この時点で初めてC1コード/設定側の調査対象とする。
- すべてPASS: **PASS**。C1 Exit Checkを閉じる。

## 8. 返却形式

```text
依頼ID: CX-O12C-006
結果: PASS / BLOCKED / FAIL
branch: master / other
start git status: CLEAN / DIRTY
master SHA: <sha>
node_modules before: EXISTS / ABSENT
tsx before: EXISTS / ABSENT
tsc before: EXISTS / ABSENT
npm omit: <value>
NODE_ENV: <value or empty>
npm ci --include=dev: PASS / FAIL / SKIPPED
tsx after: PASS / FAIL
tsc after: PASS / FAIL
processor test: PASS / FAIL / 未実行
build: PASS / FAIL / 未実行
full test: PASS / FAIL / 未実行
one-shot CLI usage: PASS / FAIL / 未実行
processor:once exit: 2 / other / 未実行
final git status: CLEAN / DIRTY
変更: node_modules復旧のみ / なし
エラー/ブロッカー: あれば簡潔に
```
