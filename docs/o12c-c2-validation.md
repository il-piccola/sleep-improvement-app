# O-12c C2 N100検証

Status: **READY — 実装済み、N100 test/build待ち**  
Task ID: **CX-O12C-008**  
Phase: **O-12c — Processor independence / C2**  
Updated: **2026-08-23**

## 1. 目的

C2 Objective Integrationのremote実装をN100で検証する。

C2追加:

- `processor/types.ts`
- `processor/sleepBlocks.ts`
- `processor/overlaps.ts`
- `processor/integrateSleep.ts`
- `processor/sleepDays.ts`
- `processor/canonicalSleep.ts`
- `tests/processor-canonical-integration.test.ts`
- root `test:processor`へC2 targeted test追加

既存Webの`buildUnifiedSleepTimeline()`はこのsliceでは変更していない。

## 2. Git安全境界

repository rootで:

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

cleanでなければBLOCKED。

## 3. 依存確認

C1でroot / cloud-api `node_modules`は復旧済み。再installは原則不要。

```powershell
Test-Path '.\node_modules\.bin\tsx.cmd'
Test-Path '.\node_modules\.bin\tsc.cmd'
Test-Path '.\cloud-api\node_modules\firebase-admin'
```

いずれか欠けている場合は、勝手にpackage追加せずBLOCKEDとして返す。今回は`npm ci`も再実行しない。

## 4. C2検証

```powershell
npm run test:processor
npm run build
npm test
```

期待:

- C1 processor test: PASS
- C2 canonical integration test: PASS
- build: PASS
- full test: PASS

## 5. 静的依存境界確認

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

注意:

- `sourcePreferences` / `SleepSourcePreferenceMap` がProcessorにあればFAIL。
- C1から存在する `../src/lib/importers/*` / `../src/types/sleep.ts` はこのscanの禁止対象ではない。
- health data本文は表示しない。

## 6. C2の判定

PASS条件:

1. `npm run test:processor` PASS
2. `npm run build` PASS
3. `npm test` PASS
4. forbidden import scan PASS
5. final `git status --short` CLEAN

FAIL時は最初のerror messageと該当file/lineだけ返す。長いlogは不要。

## 7. 禁止事項

- code/docs編集
- package install/update
- `npm ci`再実行
- `npm audit fix`
- Git reset/stash/rebase/force操作
- real Health Auto Export JSON read
- server起動
- Cloud/Firebase/Drive/Tailscale設定変更

## 8. 返却形式

```text
依頼ID: CX-O12C-008
結果: PASS / BLOCKED / FAIL
branch: master / other
start git status: CLEAN / DIRTY
master SHA: <sha>
root tsx: PASS / ABSENT
root tsc: PASS / ABSENT
cloud firebase-admin: PASS / ABSENT
processor targeted test: PASS / FAIL / 未実行
build: PASS / FAIL / 未実行
full test: PASS / FAIL / 未実行
forbidden import scan: PASS / FAIL / 未実行
final git status: CLEAN / DIRTY
変更: なし
エラー/ブロッカー: なし / 最小限
```
