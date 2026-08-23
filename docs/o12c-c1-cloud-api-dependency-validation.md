# O-12c C1 Cloud API依存復旧 + 最終検証

Status: **READY**  
Phase: **O-12c — Processor independence / C1**  
依頼ID: **CX-O12C-007**  
Updated: **2026-08-23**

## 1. 背景

`CX-O12C-006` ではroot `node_modules` を `npm ci --include=dev` で復旧し、次がPASSした。

- `npm run test:processor`
- `npm run build`
- `npm run processor:once` usage / exit code 2
- final git status CLEAN

`npm test` だけが `firebase-admin` 不在でFAILした。

これはC1 Processor実装そのもののFAILとは現時点で扱わない。

root `npm test` には `tests/drive-sync-auth.test.ts` などCloud API moduleを直接importするtestが含まれる。`cloud-api/src/lib/viewAuth.ts` は `firebase-admin/auth` をimportする。一方 `firebase-admin` はroot packageではなく `cloud-api/package.json` のdependencyとして、`cloud-api/package-lock.json` で固定されている。

したがってN100ではroot dependenciesだけでなく `cloud-api/node_modules` もlockfile準拠で復旧してからfull testを実行する。

## 2. 料金・安全境界

- 新しい有料service契約はしない。
- npm registryから既存lockfile依存をlocal `node_modules`へ取得するだけ。
- `package.json` / `package-lock.json` / source / docsを編集しない。
- Cloud/Firebaseへ接続・deploy・resource変更しない。
- real health dataを読まない。

## 3. Git安全確認

repository rootで:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
```

必須:

- branch = `master`
- worktree = CLEAN

そうでなければBLOCKED。

## 4. Cloud API依存状態

```powershell
$cloudNodeModules = Test-Path -LiteralPath '.\cloud-api\node_modules' -PathType Container
$firebaseAdmin = Test-Path -LiteralPath '.\cloud-api\node_modules\firebase-admin' -PathType Container
$cloudTsx = Test-Path -LiteralPath '.\cloud-api\node_modules\.bin\tsx.cmd' -PathType Leaf
$cloudTsc = Test-Path -LiteralPath '.\cloud-api\node_modules\.bin\tsc.cmd' -PathType Leaf

[PSCustomObject]@{
  CloudNodeModules = $cloudNodeModules
  FirebaseAdmin = $firebaseAdmin
  CloudTsx = $cloudTsx
  CloudTsc = $cloudTsc
}
```

`firebase-admin` / Cloud API dependenciesが欠けている場合のみ:

```powershell
npm ci --prefix cloud-api --include=dev
```

禁止:

- `npm install`
- package追加/更新
- global install
- `npm audit fix`

## 5. 依存復旧確認

```powershell
Test-Path -LiteralPath '.\cloud-api\node_modules\firebase-admin' -PathType Container
Test-Path -LiteralPath '.\cloud-api\node_modules\.bin\tsx.cmd' -PathType Leaf
Test-Path -LiteralPath '.\cloud-api\node_modules\.bin\tsc.cmd' -PathType Leaf
git status --short
```

tracked worktreeがdirtyになったらBLOCKED。

## 6. C1最終検証

まず、前回PASSしたtargeted項目を再確認しすぎない。依存復旧後はfull testを主対象にする。

```powershell
npm test
```

full testがPASSしたら、C1の既存PASS証拠と合わせて次を成立とする。

- processor test PASS (`CX-O12C-006`)
- build PASS (`CX-O12C-006`)
- one-shot CLI usage PASS / exit 2 (`CX-O12C-006`)
- full test PASS (`CX-O12C-007`)

最後に:

```powershell
git status --short
git rev-parse HEAD
```

## 7. 判定

- `npm ci --prefix cloud-api --include=dev` がnetwork/permissionで失敗: **BLOCKED**
- Cloud API依存復旧後も `firebase-admin` resolve失敗: **FAIL**、詳細を最小限返す
- full testが別のtest failureで落ちる: **FAIL**、最初のfailure名/messageだけ返す
- full test PASS + worktree CLEAN: **PASS**。C1を閉じる

## 8. 禁止事項

- code/docs編集
- package/lockfile編集
- `npm install`
- package update
- global install
- `npm audit fix`
- Git reset/stash/rebase/force
- server起動
- real Health Auto Export JSON read
- Cloud/Firebase/Drive/Tailscale設定変更

## 9. 返却形式

```text
依頼ID: CX-O12C-007
結果: PASS / BLOCKED / FAIL
branch: master / other
start git status: CLEAN / DIRTY
master SHA: <sha>
cloud-api node_modules before: PRESENT / ABSENT
firebase-admin before: PRESENT / ABSENT
cloud npm ci --include=dev: PASS / FAIL / SKIPPED
firebase-admin after: PASS / FAIL
full test: PASS / FAIL / 未実行
final git status: CLEAN / DIRTY
変更: cloud-api/node_modules復旧のみ / なし
エラー/ブロッカー: あれば最初のfailureだけ
```
