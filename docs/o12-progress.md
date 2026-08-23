# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c COMPLETE / O-12d COMPLETE / O-12e ACTIVE（E1 tooling実装済み・Cloud evidence取得待ち）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Processed Data Contract: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
Migration Source Map: [`o12-migration-source-map.md`](./o12-migration-source-map.md)  
O-12c最終結果: [`o12c-final-validation-result-cx-o12c-012.md`](./o12c-final-validation-result-cx-o12c-012.md)  
O-12d最終結果: [`o12d-final-validation-result-cx-o12d-001.md`](./o12d-final-validation-result-cx-o12d-001.md)  
O-12e計画: [`o12e-existing-data-migration.md`](./o12e-existing-data-migration.md)  
O-12e Cloud evidence: [`o12e-firestore-evidence-runbook.md`](./o12e-firestore-evidence-runbook.md)  
O-12e N100 final: [`o12e-n100-final-migration-runbook.md`](./o12e-n100-final-migration-runbook.md)  
最終更新日: **2026-08-24**

## 1. 運用原則

- O-12は **ChatGPT優先・Codex最小化** で進める。
- Codex確認は安全にまとめられるtest/build/runtime checkを1回へ統合する。
- 既知environment issueだけを理由に安全な後続確認を小分けにしない。
- 一度PASSした項目を理由なく再確認しない。
- Exit Gateは `O-12a → b → c → d → e → f → g → h → i → j` の順序を守る。
- O-12e完了前にCloud dataを削除しない。
- O-12h完了前にCloud operationを停止しない。
- O-12i local-only確認前にBilling disable / project shutdownしない。
- raw health data、secret、token、OAuth credentialをrepositoryや作業ログへ記録しない。
- implementationへN100固有drive letter / mount pathをhardcodeしない。

## 2. Phase一覧

| Phase | 内容 | 状態 |
| --- | --- | --- |
| O-12a | 現状監査 | **COMPLETE** |
| O-12b | Processed Data Contract | **COMPLETE — v1.0.0** |
| O-12c | Processor独立化 | **COMPLETE** |
| O-12d | Processor堅牢化 | **COMPLETE** |
| O-12e | 既存データ移行 | **ACTIVE — E1 tooling実装済み / Cloud evidence待ち** |
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

## E1 Migration tooling — 実装済み

追加:

- `processor/migration.ts`
  - migration evidence validation
  - rebuild semantic parity
  - archive artifact byteLength/SHA-256 verification
  - required evidence category check
  - `migration-manifest.json`
  - migration snapshot publication
- `processor/localMigrationEvidence.ts`
  - local legacy state presence/absence
  - local private archive
  - `health-store` semantic hash
  - Cloud/local evidence merge
- `processor/runLocalMigrationEvidence.ts`
- `processor/runMigration.ts`
- `scripts/o12e-firestore-evidence.py`
  - six Firestore collection groups read-only scan
  - rebuild collectionはcount + semantic SHA-256
  - archive collectionはprivate JSONL
  - document本文/health value/user IDをterminalへ表示しない
  - Firestore write/delete = 0
- `tests/processor-migration.test.ts`
- `tests/processor-local-migration-evidence.test.ts`
- `migration-input/`, `migration-output/` をGit ignore

## O-12e確定分類

- Health Auto Export JSON: **Rebuild**
- local health-store: **Rebuild if reproducible / otherwise block**
- local processed-files: **Archive**
- Firestore sleep_records: **Rebuild + semantic parity**
- Firestore health_metric_records: **Rebuild + core semantic parity**
- Firestore processed_drive_files: **Archive**
- Firestore drive_sync_runs: **Archive**
- Firestore ingest_batches: **Archive**
- Firestore metric_audit_summaries: **Archive**

Cloud旧実装とcanonicalで意図的に変えたmain-sleep分類はhealth metric rebuild hashから除外し、O-12h presentation parityへ分離する。

## 次作業

### User / Cloud Shell

[`o12e-firestore-evidence-runbook.md`](./o12e-firestore-evidence-runbook.md) を **1回だけ** 実行し、private ZIP bundleをN100へdownloadする。

Cloud ShellはFirestore read-only。Cloud resource変更なし。

### Codex

Cloud bundleを `migration-input/` へ置いた後、**`CX-O12E-001` 1回だけ**。

[`o12e-n100-final-migration-runbook.md`](./o12e-n100-final-migration-runbook.md) に従い:

- synthetic tests/build
- real raw rebuild
- local/Drive completed snapshot
- local evidence
- Cloud/local evidence merge
- private evidence ZIP Drive backup + SHA
- migration snapshot
- Firestore rebuild parity
- archive completeness
- final O-12e gate

まで一括実行する。

### ChatGPT

`CX-O12E-001`をreviewする。PASS系ならO-12eをCOMPLETEにし、O-12fへ進む。

# O-12e Exit Gate

- [ ] real rawからcanonical snapshot生成
- [ ] local completed snapshot validation
- [ ] Google Drive completed snapshot validation
- [ ] local legacy state presence/absence確定
- [ ] Firestore six category evidence取得
- [ ] sleep_records rebuild parity
- [ ] health_metric_records core rebuild parity
- [ ] present archive sourceのartifact保存
- [ ] final evidence ZIPをGoogle Driveへ保存しSHA一致
- [ ] migration snapshot local/Drive validation
- [ ] migration manifest `unresolved=[]`
- [ ] final worktree CLEAN

# 後続安全順序

- O-12f: Sleep CompassをProcessed Data-backed local APIへ移行
- O-12g: same-origin、`127.0.0.1`、Tailscale Serve、Funnel不使用
- O-12h: Cloud/local parity、restart/recovery。完了前にCloud operation停止禁止
- O-12i: Cloud automatic processingを可逆に停止
- O-12j: final resource/Billing audit、`maya`用途再確認。Billing disable/project shutdownは安全確認と明示承認後のみ
