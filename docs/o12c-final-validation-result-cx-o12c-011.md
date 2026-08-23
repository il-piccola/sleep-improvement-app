# CX-O12C-011 結果

状態: **FAIL — native Node module resolution compatibility**  
Phase: **O-12c final validation**  
Date: **2026-08-23**

## 結果

- branch: `master`
- start/final git status: CLEAN
- tested SHA: `fb06977d717e63dbdcbd10b185c3f5493c649bd5`
- Node: `v22.23.1`
- C1 native processor test: **FAIL**
- C2 native processor test: **PASS**
- C3 native processor test: **PASS**
- build: **PASS**
- Processor forbidden import scan: **PASS**
- Cloud metric runtime unchanged: **PASS**
- watcher Processor adapter scan: **PASS**
- full regression: 未実行
- repository変更: なし

最初のapplication error:

`ERR_MODULE_NOT_FOUND: src/lib/source/resolveSleepSource`

## Review

C1の変換・正規化ロジック自体のassertion failureではない。

`processor/healthAutoExport.ts` が既存 `src/lib/importers/*` を再利用しており、その既存importer群にextensionless TypeScript importが残っていた。`tsx`では解決できるが、Node 22 native TypeScript executionでは明示的specifierが必要になる。

対応はロジック変更ではなく以下3ファイルのimport specifierを `.ts` 明示へ統一するだけとする。

- `src/lib/importers/importTypes.ts`
- `src/lib/importers/healthAutoExportJsonAuditor.ts`
- `src/lib/importers/healthAutoExportJsonNormalizer.ts`

C2/C3、Cloud metric runtime、watcher adapter、Processor forbidden dependencyは本runでPASS済みなので次回は再実行しない。
