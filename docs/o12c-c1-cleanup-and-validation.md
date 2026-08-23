# O-12c C1 worktree cleanup + N100検証

Status: **READY**  
Phase: **O-12c — Processor independence / C1**  
依頼ID: **CX-O12C-005**  
Updated: **2026-08-23**

## 1. 前提

`CX-O12C-004` で次の4文書はすべて `SAFE_DISCARD` と判定済み。

- `docs/o12-progress.md`
- `docs/o12-drive-mount-readonly-audit.md`
- `docs/o12-gcp-readonly-audit.md`
- `docs/o12-n100-readonly-audit.md`

また:

- branch: `master`
- HEAD-only commits: `0`
- origin/master-only commits: `31`（監査時点）
- 3件がuntrackedで、`git restore`では処理できなかったため安全停止した

したがって、この依頼では上記4文書だけを対象に、tracked/untrackedを分けてcleanupし、最新`master`へfast-forward後、C1 test/buildを実行する。

## 2. 安全条件

最初に:

```powershell
git status --short
git branch --show-current
git fetch origin master
git rev-list --left-right --count HEAD...origin/master
```

次をすべて満たす場合のみ続行する。

- branchが`master`
- HEAD-only commit数が`0`
- dirty pathが次の4件だけ
  - `docs/o12-progress.md`
  - `docs/o12-drive-mount-readonly-audit.md`
  - `docs/o12-gcp-readonly-audit.md`
  - `docs/o12-n100-readonly-audit.md`

1つでも満たさなければ変更せず`BLOCKED`。

## 3. 対象4文書だけcleanup

PowerShell:

```powershell
$files = @(
  'docs/o12-progress.md',
  'docs/o12-drive-mount-readonly-audit.md',
  'docs/o12-gcp-readonly-audit.md',
  'docs/o12-n100-readonly-audit.md'
)

foreach ($file in $files) {
  $tracked = git ls-files --error-unmatch -- $file 2>$null

  if ($LASTEXITCODE -eq 0) {
    git restore --worktree -- $file
    if ($LASTEXITCODE -ne 0) { throw "restore failed: $file" }
  } elseif (Test-Path -LiteralPath $file -PathType Leaf) {
    Remove-Item -LiteralPath $file -Force
  }
}

git status --short
```

この操作で削除してよいuntracked fileは上記4 pathだけ。directoryや他fileを削除しない。

cleanup後に`git status --short`が空でなければ`BLOCKED`。

## 4. 最新masterへfast-forward

worktree cleanの場合のみ:

```powershell
git merge --ff-only origin/master
git status --short
git rev-parse HEAD
```

merge後もworktreeがcleanでなければ`BLOCKED`。

## 5. C1検証

最新masterへfast-forwardできた場合のみ:

```powershell
npm run test:processor
npm run build
npm test
npm run processor:once
```

期待:

- `test:processor`: PASS
- `build`: PASS
- full `npm test`: PASS
- `processor:once`: 引数なしなのでusage表示、exit code 2でPASS
- HTTP serverは起動しない
- real Health Auto Export JSONは開かない

`npm run build`等が通常生成物を更新しても、source/docs/package lock等の意図しない変更が残った場合は最終状態を`DIRTY`として報告し、勝手にresetしない。

## 6. 禁止

- `git reset`
- `git stash`
- `git rebase`
- force操作
- `git clean`
- commit
- code/docsの手編集
- 上記4件以外のfile削除
- package install/update
- `npm audit fix`
- real health data read
- server起動
- Cloud/Firebase/GCP/Drive/Tailscale変更

## 7. 返却形式

```text
依頼ID: CX-O12C-005
結果: PASS / BLOCKED / FAIL
branch: master / other
HEAD-only commits: n
origin/master-only commits: n
tracked cleanup: path一覧またはNONE
untracked cleanup: path一覧またはNONE
worktree cleanup: PASS / BLOCKED
fast-forward: PASS / 未実行
processor test: PASS / FAIL / 未実行
build: PASS / FAIL / 未実行
full test: PASS / FAIL / 未実行
one-shot CLI usage: PASS / FAIL / 未実行
final git status: CLEAN / DIRTY
変更: SAFE_DISCARD済み4 docsのcleanup + ff-onlyのみ / なし
エラー/ブロッカー: あれば簡潔に
master SHA: <検証したSHA>
```

長いnpm logやhealth dataは返さない。
