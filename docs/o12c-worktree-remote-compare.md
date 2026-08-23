# O-12c N100 dirty docs remote比較

Status: **READY — read-only / no Git state change**  
Phase: **O-12c — Processor independence**  
依頼ID: **CX-O12C-003**  
Updated: **2026-08-23**

## 1. 目的

`CX-O12C-002` でdirty docs 4件のread-only差分確認はPASSしたが、返却summaryにdiff本文が含まれなかった。

この依頼では大量のdiffを返さず、N100 local fileとGitHub `master` の最新fileを比較し、各fileを次のどちらかへ分類する。

- `REMOTE_EQUIVALENT`: 改行差を除きlocal内容がremote最新と同一。保存不要。
- `LOCAL_UNIQUE`: localとremote最新が異なる。内容を捨てず追加reviewが必要。

Git worktree、index、refs、stash、branchは一切変更しない。

## 2. 対象

- `docs/o12-progress.md`
- `docs/o12-drive-mount-readonly-audit.md`
- `docs/o12-gcp-readonly-audit.md`
- `docs/o12-n100-readonly-audit.md`

## 3. 実行

PowerShellでrepository rootから実行する。

```powershell
$repoRoot = (Get-Location).Path
$baseUrl = 'https://raw.githubusercontent.com/il-piccola/sleep-improvement-app/master'
$files = @(
  'docs/o12-progress.md',
  'docs/o12-drive-mount-readonly-audit.md',
  'docs/o12-gcp-readonly-audit.md',
  'docs/o12-n100-readonly-audit.md'
)

function Normalize-Text([string]$text) {
  return (($text -replace "`r`n", "`n") -replace "`r", "`n").TrimEnd("`n")
}

foreach ($file in $files) {
  $localPath = Join-Path $repoRoot $file
  if (-not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
    [PSCustomObject]@{ File = $file; Classification = 'BLOCKED_LOCAL_MISSING' }
    continue
  }

  try {
    $local = Normalize-Text ([IO.File]::ReadAllText($localPath))
    $remoteUrl = "$baseUrl/$file"
    $remote = Normalize-Text ((Invoke-WebRequest -UseBasicParsing -Uri $remoteUrl).Content)

    if ($local -ceq $remote) {
      [PSCustomObject]@{ File = $file; Classification = 'REMOTE_EQUIVALENT' }
    } else {
      $localLines = $local -split "`n"
      $remoteLines = $remote -split "`n"
      $compare = Compare-Object -ReferenceObject $remoteLines -DifferenceObject $localLines
      $localOnly = @($compare | Where-Object SideIndicator -eq '=>').Count
      $remoteOnly = @($compare | Where-Object SideIndicator -eq '<=').Count
      [PSCustomObject]@{
        File = $file
        Classification = 'LOCAL_UNIQUE'
        LocalOnlyLineCount = $localOnly
        RemoteOnlyLineCount = $remoteOnly
      }
    }
  } catch {
    [PSCustomObject]@{
      File = $file
      Classification = 'BLOCKED_REMOTE_COMPARE'
      Error = $_.Exception.Message
    }
  }
}

# 状態が変わっていないことだけ確認
git status --short
```

`LOCAL_UNIQUE` がある場合、Codexはそのfileの差分を読んで次の**要約だけ**を返す。

- local-only変更の目的を1〜3行
- 新しい事実/証拠/判断がlocalにだけ存在するか: `YES / NO / UNCLEAR`
- remoteへ救出すべき内容があるか: `YES / NO / UNCLEAR`

全文diffは返さなくてよい。

## 4. 禁止事項

- `git fetch`
- `git pull`
- `git reset`
- `git restore`
- `git checkout`
- `git stash`
- `git rebase`
- `git merge`
- `git commit`
- file作成/編集/削除
- package install
- test/build
- Cloud/Drive/Tailscale操作

`Invoke-WebRequest` はpublic GitHub raw fileをメモリ上で読むだけに使用する。

## 5. 返却形式

```text
依頼ID: CX-O12C-003
結果: PASS / BLOCKED

docs/o12-progress.md: REMOTE_EQUIVALENT / LOCAL_UNIQUE / BLOCKED
  local-only要約: LOCAL_UNIQUEの場合のみ
  新しい事実: YES / NO / UNCLEAR
  救出必要: YES / NO / UNCLEAR

docs/o12-drive-mount-readonly-audit.md: ...
docs/o12-gcp-readonly-audit.md: ...
docs/o12-n100-readonly-audit.md: ...

最終 git status --short: dirty file名のみ
変更: なし
Commit SHA: なし
エラー/ブロッカー: あれば簡潔に
```

## 6. 次段階

- 4件とも `REMOTE_EQUIVALENT`、または`LOCAL_UNIQUE`でも救出不要とChatGPTが判定した場合のみ、別依頼で対象4 docsをremote版へ戻してworktreeをclean化する。
- 救出必要なlocal-only内容があれば、破棄前にremoteへ反映する。
- clean化後に `CX-O12C-001` のC1 test/buildを再実行する。
