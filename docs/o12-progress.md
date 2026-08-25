# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c COMPLETE / O-12d COMPLETE / O-12e ACTIVE（Firestore preservation scope確定・backup実行待ち）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Processed Data Contract: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
Migration Source Map: [`o12-migration-source-map.md`](./o12-migration-source-map.md)  
O-12c最終結果: [`o12c-final-validation-result-cx-o12c-012.md`](./o12c-final-validation-result-cx-o12c-012.md)  
O-12d最終結果: [`o12d-final-validation-result-cx-o12d-001.md`](./o12d-final-validation-result-cx-o12d-001.md)  
O-12e scope決定: [`o12e-preservation-scope-decision.md`](./o12e-preservation-scope-decision.md)  
O-12e計画: [`o12e-existing-data-migration.md`](./o12e-existing-data-migration.md)  
O-12e Firestore backup: [`o12e-firestore-evidence-runbook.md`](./o12e-firestore-evidence-runbook.md)  
O-12e N100 preservation: [`o12e-n100-final-migration-runbook.md`](./o12e-n100-final-migration-runbook.md)  
最終更新日: **2026-08-26**

## 1. 運用原則

- O-12は **ChatGPT優先・Codex最小化** で進める。
- Codex確認は安全にまとめられるtest/build/runtime checkを1回へ統合する。
- 既知environment issueだけを理由に安全な後続確認を小分けにしない。
- 一度PASSした項目を理由なく再確認しない。
- Exit Gateは `O-12a → b → c → d → e → f → g → h → i → j` の順序を守る。
- **O-12eはデータ保全gate、O-12hはCloud/local parity・recovery gate、O-12jは削除gateとして分離する。**
- O-12e完了後もFirestoreを直ちに削除しない。
- O-12h完了前にCloud operationを停止しない。
- O-12i local-only確認前にFirestore削除 / Billing disable / project shutdownを行わない。
- raw health data、secret、token、OAuth credentialをrepositoryや作業ログへ記録しない。
- implementationへN100固有drive letter / mount pathをhardcodeしない。

## 2. Phase一覧

| Phase | 内容 | 状態 |
| --- | --- | --- |
| O-12a | 現状監査 | **COMPLETE** |
| O-12b | Processed Data Contract | **COMPLETE — v1.0.0** |
| O-12c | Processor独立化 | **COMPLETE** |
| O-12d | Processor堅牢化 | **COMPLETE** |
| O-12e | 既存データ保全 | **ACTIVE — preservation scope確定 / Firestore backup待ち** |
| O-12f | Sleep Compass独立化 | **NOT STARTED** |
| O-12g | Local Web + Tailscale | **NOT STARTED** |
| O-12h | 並行検証・復旧試験 | **NOT STARTED** |
| O-12i | Cloud運用停止 | **NOT STARTED** |
| O-12j | Cloud完全撤去 | **NOT STARTED** |

# O-12a — COMPLETE

確認済み:

- N100 raw source観測: `L:\マイドライブ\Health Auto Export`、`Sleep`存在
- 上記pathはhost境界のみ。implementation hardcode禁止
- repo直下`server-data: ABSENT`
- GoogleDriveFS running
- Tailscale Windows service Running / Automatic
- GCP project/Billing/Cloud Run/Scheduler/Artifact Registry/Firestore/Secrets names/Storage/Hosting/APIs inventory
- `maya-daily-observation-console`は用途不明non-Sleep-Compass candidateとしてinventory済み

`maya-daily-observation-console`は停止・削除禁止。O-12j project shutdown判定前に用途再確認する。

# O-12b — COMPLETE v1.0.0

確定済み:

- canonical JSON/JSONL
- schema/version/provenance
- deterministic ID / path portability
- canonical source integration / overlap / sleep block / sleep day
- daily + sleep-window health metrics
- immutable snapshot / manifest / `complete.json`
- migration/retention/compatibility policy

# O-12c — COMPLETE

実装済み:

- C1 standalone Health Auto Export Processor + direct one-shot
- C2 UI source preferenceから独立したcanonical integration
- C2 deterministic block / overlap / sleep-day / main sleep
- C3 Processor-owned daily + sleep-window health metrics
- Processor canonical metric型からCloud/Firestore identityを分離
- existing Cloud metric runtimeは変更せず保護

最終根拠 `CX-O12C-012`: **PASS_WITH_ENVIRONMENT_EXCEPTION**

- C1/C2/C3 native PASS
- build PASS
- Processor forbidden scan PASS
- Cloud metric runtime unchanged PASS
- watcher Processor adapter PASS
- application errorなし
- final worktree CLEAN
- full regressionのみ既知`uv_os_get_passwd ENOMEM`

**O-12c Exit Gate: COMPLETE**

# O-12d — COMPLETE

実装済み:

- atomic JSON state + backup recovery + corruption distinction
- health-store / processed-files silent truncation撤廃
- relative-path unbounded processed ledger
- metadata-first fingerprint + conditional SHA
- standalone watcher/rescan hardening
- OS/path configurable runtime boundary
- immutable/versioned Processed Data snapshot
- manifest dataset count / bytes / SHA-256 validation
- `complete.json` final marker
- completed snapshot backup + final-marker-last-copy
- raw directory → Processor → canonical snapshot standalone path
- synthetic end-to-end hardening tests

最終根拠 `CX-O12D-001`: **PASS_WITH_ENVIRONMENT_EXCEPTION**

- synthetic hardening PASS
- build PASS
- hardcoded host path scan PASS
- state truncation scan PASS
- Processor forbidden import scan PASS
- snapshot CLI usage PASS / exit `2`
- final git status CLEAN
- application errorなし
- full regressionのみ既知`uv_os_get_passwd ENOMEM`

**O-12d Exit Gate: COMPLETE**

# O-12e — ACTIVE

## 3. 2026-08-26 scope整理

O-12eの主目的を **Cloud/Firestoreデータのサルベージと外部保全** に限定した。

旧案でO-12eへ含めていた次はExit Gateから外した。

- Firestore `sleep_records` とlocal canonicalのsemantic parity
- Firestore `health_metric_records` とlocal canonicalのsemantic parity
- real raw rebuildをO-12e完了条件にすること
- migration snapshotをO-12e完了条件にすること
- clean-room reconstruction test

理由:

- データ保全は完全なprivate file backupで達成できる
- 新Processor / Sleep Compassの正当性確認は別問題
- Cloud/local parity・new data・dedupe・restart・clean-room recoveryはO-12hでまとめて確認する方が責務が明確

## 4. O-12e Firestore確定handling

Firestore既知6 categoryをすべて **Archive** する。

- `sleep_records`
- `health_metric_records`
- `processed_drive_files`
- `drive_sync_runs`
- `ingest_batches`
- `metric_audit_summaries`

`scripts/o12e-firestore-evidence.py` は6 categoryすべてをprivate JSONLへ保存するよう更新済み。

各categoryのevidence:

- document count
- presence
- archive relative path
- byteLength
- SHA-256

Firestore write/update/deleteは0。

## 5. Local / Drive preservation

Cloud Shellで作成したoriginal ZIPを:

1. N100 localで保持
2. Google Driveのraw watch root外へcopy
3. local / Drive SHA-256一致確認

する。

local `health-store.json` / `processed-files.json`はpresence / absenceを確認し、presentならprivate archiveする。

## 6. 旧migration toolingの扱い

O-12e準備中に実装したsemantic parity / migration manifest toolingは削除しないが、**現行O-12e Exit Gateでは使用しない**。

将来O-12hのcomparison/recovery補助として利用可能だが、O-12eをblockする条件にはしない。

## 7. 次作業

### User / Cloud Shell

[`o12e-firestore-evidence-runbook.md`](./o12e-firestore-evidence-runbook.md) を1回実行し、private ZIP bundleをN100へdownloadする。

### N100

[`o12e-n100-final-migration-runbook.md`](./o12e-n100-final-migration-runbook.md) に従い、application testではなくbackup integrityだけを確認する。

- six JSONL archive integrity
- count / byteLength / SHA
- original ZIP local preservation
- Google Drive copy + SHA一致
- local legacy state presence/absence + present時archive

### ChatGPT

結果をreviewし、backup integrityが揃えばO-12eをCOMPLETEにする。semantic parityの追加確認はO-12eでは要求しない。

# O-12e Exit Gate

- [ ] Firestore six category read-only取得
- [ ] six category document count記録
- [ ] present categoryすべてprivate JSONL archive
- [ ] archive artifact byteLength / SHA-256一致
- [ ] original preservation ZIPをN100 localで保持
- [ ] original preservation ZIPをGoogle Driveへcopy
- [ ] local / Drive ZIP SHA-256一致
- [ ] local legacy state presence / absence確定
- [ ] present local legacy state private archive
- [ ] Firestore write/update/delete = 0
- [ ] Cloud runtime変更 = 0
- [ ] final worktree CLEAN

# Firestore削除ゲート

O-12e COMPLETE後もFirestoreを削除しない。

- O-12f: Sleep CompassをProcessed Data-backed local APIへ移行
- O-12g: same-origin、`127.0.0.1`、Tailscale Serve
- O-12h: Cloud/local parity、新データ、dedupe、restart、clean-room recovery
- O-12i: Cloud automatic processingを可逆停止しlocal-only確認
- O-12j: final audit後にFirestore/Cloud resource削除を判断

削除直前にFirestore native backup等の追加ロールバック保険を使う場合は、その時点で必要性と料金を確認する。
