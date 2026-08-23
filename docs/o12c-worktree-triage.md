# O-12c N100 worktree 差分トリアージ

Status: **READY — read-only**  
Phase: **O-12c — Processor independence**  
依頼ID: **CX-O12C-002**  
Updated: **2026-08-23**

## 1. 目的

`CX-O12C-001` は、N100 worktreeがdirtyだったため安全にBLOCKEDとなった。

対象dirty file:

- `docs/o12-progress.md`
- `docs/o12-drive-mount-readonly-audit.md`
- `docs/o12-gcp-readonly-audit.md`
- `docs/o12-n100-readonly-audit.md`

これらはすべて文書ファイルであり、C1実装コードではない。ただしlocal変更を内容確認なしにreset/stash/checkoutしてはいけない。

本依頼では **差分を読むだけ** とし、local変更が:

1. remote masterに既に反映済みの重複・旧版なのか
2. remoteに未反映で保存すべき内容なのか

をChatGPTが判定できる材料だけ取得する。

## 2. 実行手順

repository rootで次だけ実行する。

```bash
git status --short

git diff -- docs/o12-progress.md
git diff -- docs/o12-drive-mount-readonly-audit.md
git diff -- docs/o12-gcp-readonly-audit.md
git diff -- docs/o12-n100-readonly-audit.md
```

出力が長い場合は、各fileについて次を追加してよい。

```bash
git diff --stat -- docs/o12-progress.md docs/o12-drive-mount-readonly-audit.md docs/o12-gcp-readonly-audit.md docs/o12-n100-readonly-audit.md
```

## 3. 禁止事項

- `git reset`
- `git restore`
- `git checkout -- <file>`
- `git stash`
- `git pull`
- `git rebase`
- `git merge`
- `git commit`
- file編集/削除/作成
- package install
- test/build
- health data read
- Cloud/Drive/Tailscale設定変更

## 4. 返却形式

diff本文をそのまま返してよい。raw health dataやsecretは対象docに含めない前提だが、もしtoken/email等を見つけた場合は値を伏せて存在だけ報告する。

最後に次を付ける。

```text
依頼ID: CX-O12C-002
結果: PASS / BLOCKED
対象dirty files: 4件または実際の件数
変更: なし
Commit SHA: なし
エラー/ブロッカー: あれば簡潔に
```

## 5. ChatGPT判定後

ChatGPTがdiffをremote masterと比較し:

- 保存不要な旧版/重複だけなら、次の別依頼で対象4 docsだけをremote版へ戻す安全手順を出す。
- 保存すべき差分があれば、先にremoteへ必要内容を取り込むか別fileへ救出してからworktreeをcleanにする。
- worktree clean後に `CX-O12C-001` のtest/build検証を再実行する。

C1実装コードをこのトリアージ中に変更しない。
