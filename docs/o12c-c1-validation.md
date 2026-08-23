# O-12c C1 N100検証

Status: **READY — 実装済み、N100 test/build待ち**  
Task ID: **CX-O12C-001**  
Phase: **O-12c — Processor independence / C1**

## 1. 目的

ChatGPTがremote `master`へ実装したC1をN100で検証する。

C1内容:

- standalone `processor/healthAutoExport.ts`
- direct `processor/runOnce.ts`
- server importerをProcessor adapterへ変更
- synthetic processor test
- `processor:once` / `test:processor` scripts
- `processor`をNode TypeScript build対象へ追加

**Codexは今回は実装変更しない。test/build専用。**

## 2. Git安全境界

最初に:

```powershell
git status --short
git fetch origin master
```

### worktreeがcleanの場合

```powershell
git pull --ff-only origin master
```

その後検証へ進む。

### worktreeがdirtyの場合

- `git reset` しない
- `git checkout --` / `git restore` しない
- stashしない
- commitしない
- pull/rebaseしない
- fileを編集しない

この場合は変更pathだけ返して **BLOCKED** とする。既存作業を消してまで検証しない。

## 3. 検証command

最新masterへ安全に同期できた場合のみ実行:

```powershell
npm run test:processor
npm run build
npm test
```

追加でCLI usageだけ確認:

```powershell
npm run processor:once
```

引数なしなのでexit code 2 / usage表示でよい。実Health Auto Export fileはこの検証では開かない。

期待:

- `test:processor`: PASS
- `build`: PASS
- full `npm test`: PASS
- `processor:once` no-argument: usageを表示し、serverを起動しない

## 4. 禁止

- code/docs編集
- package install/update
- `npm audit fix`
- Cloud/Firebase/GCP操作
- Drive設定変更
- real health JSON本文の表示
- server起動
- Git reset/stash/rebase/force操作

## 5. 返却形式

```text
依頼ID: CX-O12C-001
結果: PASS / BLOCKED / FAIL
Git: clean + ff-only sync済み / dirty BLOCKED
Dirty paths: なければ NONE
processor test: PASS / FAIL / 未実行
build: PASS / FAIL / 未実行
full test: PASS / FAIL / 未実行
one-shot CLI usage: PASS / FAIL / 未実行
変更: なし
エラー/ブロッカー: あれば簡潔に
master SHA: <検証したSHA>
```

長いnpm logやhealth dataは返さない。
