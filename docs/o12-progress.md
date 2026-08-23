# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c COMPLETE / O-12d ACTIVE（実装済み・最終統合検証待ち）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Processed Data Contract: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
Migration Source Map: [`o12-migration-source-map.md`](./o12-migration-source-map.md)  
O-12c最終結果: [`o12c-final-validation-result-cx-o12c-012.md`](./o12c-final-validation-result-cx-o12c-012.md)  
O-12d実装: [`o12d-processor-hardening.md`](./o12d-processor-hardening.md)  
O-12d最終検証: [`o12d-final-validation.md`](./o12d-final-validation.md)  
最終更新日: **2026-08-24**

## 1. 運用原則

- O-12は **ChatGPT優先・Codex最小化** で進める。
- Codex確認は実装sliceごとにまとめ、safeなtest/build/static checkを1回へ統合する。
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
| O-12d | Processor堅牢化 | **ACTIVE — implementation complete / validation pending** |
| O-12e | 既存データ移行 | **NOT STARTED** |
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

## C1

- standalone Health Auto Export Processor
- direct one-shot CLI
- server importerはProcessor adapter

## C2

- UI `SleepSourcePreferenceMap`からcanonical integrationを分離
- deterministic source integration
- canonical block / overlap / sleep-day
- main sleep = sleep dayごとのlongest block
- absolute host pathをcanonical block identityへ混ぜない

## C3

- Processor-owned daily health metrics
- Processor-owned sleep-window health metrics
- Processor canonical metric型に`userId` / `runId` / Firestore依存なし
- existing Cloud metric runtimeは変更せず保護

## 最終根拠

`CX-O12C-012`: **PASS_WITH_ENVIRONMENT_EXCEPTION**

- C1 native: PASS
- C2 native: PASS
- C3 native: PASS
- build: PASS
- Processor forbidden scan: PASS
- Cloud metric runtime unchanged: PASS
- watcher Processor adapter scan: PASS
- application error: なし
- final git status: CLEAN
- full regressionのみ既知`uv_os_get_passwd ENOMEM`

`CX-O12C-009`でNode `os.userInfo()`単独でも同じENOMEMを再現しているため、N100 environment exceptionとして分離した。

**O-12c Exit Gate: COMPLETE**

# O-12d — ACTIVE

## 3. 実装済み

### State safety

- `server/safeJsonFile.ts`
  - crash-recoverable write
  - primary/backup
  - valid backup recovery + primary repair
  - primary/backup双方invalid時のexplicit corruption error
- `server/healthStore.ts`
  - safe state利用
  - load status区別
  - import history 50件truncate撤廃

### Portable processed-file ledger

- `server/processedFiles.ts`
  - absolute `path` → raw root基準`relativePath`
  - importer version 3
  - 500件truncate撤廃
  - metadata-first unchanged判定
  - metadata変更時のみstreaming SHA-256
  - same-content metadata changeは再importしない
  - partial corrupt ledgerをsilent dropしない

### Watcher / rescan / config

- watcherのmetadata-first処理
- deterministic recursive scan
- standalone `rescan`。HTTP server不要
- watcher enable/disable
- `HEALTH_IMPORT_DATA_DIR`
- `PROCESSED_DATA_DIR`
- `PROCESSED_DATA_BACKUP_DIR`
- state/processed/backupをraw watch root配下へ置く設定をreject
- `.env.example`から旧`K:` hardcode削除

### Canonical snapshot

- `processor/snapshot.ts`
  - immutable snapshot publication
  - stable JSON serialization
  - required dataset validation
  - recordCount / byteLength / SHA-256
  - manifest / complete marker validation
  - overwrite拒否
  - corruption/tamper reject
  - completed snapshotのみbackup
  - backup `complete.json`は最後にcopy

### Standalone directory Processor

- `processor/processDirectory.ts`
  - raw root → C1/C2/C3 → canonical snapshot
  - relative input provenance
  - sourceFileId
  - sleep-records/blocks/days/source summaries/overlaps/health metrics/diagnostics
  - raw bodyをdiagnosticsへ保存しない
- `processor/runDirectory.ts`
- `npm run processor:snapshot -- <raw-root> <processed-data-root> [backup-root]`

### Synthetic hardening test

`tests/processor-hardening.test.ts`

- safe state recovery/corruption
- portable ledger
- conditional hash
- standalone watcher rescan + second-run skip
- portable config
- immutable snapshot + backup
- overwrite reject
- tamper reject
- synthetic raw → canonical snapshot
- absolute raw path non-persistence

## 4. O-12d Exit Gate

- [x] atomic/safe local state実装
- [x] corruption distinction/recovery実装
- [x] OS/path portable config実装
- [x] portable unbounded processed ledger実装
- [x] conditional fingerprint実装
- [x] watcher/rescan hardening実装
- [x] immutable snapshot publication実装
- [x] completed-snapshot backup実装
- [x] raw directory standalone snapshot Processor実装
- [ ] `CX-O12D-001` synthetic hardening test PASS
- [ ] root build PASS
- [ ] static safety scans PASS
- [ ] snapshot CLI usage PASS / exit 2
- [ ] final worktree CLEAN
- [ ] full regression PASSまたは既知ENOMEMのみ

## 5. 次作業

### Codex

**`CX-O12D-001` 1回だけ。**  
[`o12d-final-validation.md`](./o12d-final-validation.md) を最後まで一括実行する。実Health data/実Driveは使用しない。

### ChatGPT

結果をreviewする。

- PASS系ならO-12dを正式COMPLETE
- application/compile/assertion failureならfailureをまとめて修正
- O-12d COMPLETE後のみO-12e migration/reconstructionへ進む

# 後続安全順序

- O-12e: Rebuild/Migrate/Archive、既存データreconstruction。完了前にCloud data削除禁止
- O-12f: Sleep CompassをProcessed Data-backed local APIへ移行
- O-12g: same-origin、`127.0.0.1`、Tailscale Serve、Funnel不使用
- O-12h: Cloud/local parity、restart/recovery。完了前にCloud operation停止禁止
- O-12i: Cloud automatic processingを可逆に停止
- O-12j: final resource/Billing audit、`maya`用途再確認。Billing disable/project shutdownは安全確認と明示承認後のみ
