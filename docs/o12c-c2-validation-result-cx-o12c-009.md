# CX-O12C-009 結果

Date: **2026-08-23**  
Phase: **O-12c / C2**  
Result: **ENVIRONMENT BLOCKED**

## 結果

- branch: `master`
- start git status: `CLEAN`
- tested SHA: `ee8b1c963f93f8cb48cfad6370d570d88a918d20`
- `os.userInfo()` probe: `ENOMEM`
- `os.homedir()` probe: PASS
- TotalVisibleMemoryMB: `16159`
- FreePhysicalMemoryMB: `5593`
- PageFile: unknown
- C2 targeted test: 未実行
- C1 processor regression: 未実行
- full test: 未実行
- build: PASS（CX-O12C-008）
- forbidden import scan: PASS（CX-O12C-008）
- final git status: `CLEAN`
- repository変更: なし

## Review

`uv_os_get_passwd returned ENOMEM` はC2 assertion/application failureではない。

このprobeを今後のC2検証gateにはしない。Node 22.23.1のnative TypeScript type strippingを使い、`tsx`を介さないC2 targeted testを先に実行する。

次の正式検証は `CX-O12C-010` (`o12c-c2-consolidated-validation.md`) とし、安全に続けられる確認を1回にまとめる。
