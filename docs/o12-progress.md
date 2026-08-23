# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c CODEX NEEDED（C1検証待ち）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Processed Data Contract: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
Migration Source Map: [`o12-migration-source-map.md`](./o12-migration-source-map.md)  
O-12c設計: [`o12c-processor-independence.md`](./o12c-processor-independence.md)  
C1検証: [`o12c-c1-validation.md`](./o12c-c1-validation.md)  
最終更新日: **2026-08-23**

この文書はO-12の実作業を管理する中心文書です。基準文書と矛盾する場合は基準文書を優先します。

## 1. 運用原則

- O-12は **ChatGPT優先・Codex最小化** で進める。
- CodexはN100 local runtime/build/testなどChatGPTから直接検証できない作業だけ担当する。
- 一度PASSした項目を理由なく再確認しない。
- Exit Gateは `O-12a → b → c → d → e → f → g → h → i → j` の順番を崩さない。
- O-12e完了前にCloud dataを削除しない。
- O-12h完了前にCloud operationを停止しない。
- O-12i local-only確認前にBilling disable / project shutdownしない。
- raw health data、secret、token、OAuth credentialをrepositoryや作業ログへ記録しない。

## 2. Phase一覧

| Phase | 内容 | 状態 |
| --- | --- | --- |
| O-12a | 現状監査 | **COMPLETE** |
| O-12b | Processed Data Contract | **COMPLETE — v1.0.0** |
| O-12c | Processor独立化 | **CODEX NEEDED — C1実装済み、N100検証待ち** |
| O-12d | Processor堅牢化 | **NOT STARTED** |
| O-12e | 既存データ移行 | **NOT STARTED** |
| O-12f | Sleep Compass独立化 | **NOT STARTED** |
| O-12g | Local Web + Tailscale | **NOT STARTED** |
| O-12h | 並行検証・復旧試験 | **NOT STARTED** |
| O-12i | Cloud運用停止 | **NOT STARTED** |
| O-12j | Cloud完全撤去 | **NOT STARTED** |

# O-12a — 現状監査

## 3. Exit Gate判定: COMPLETE

read-only inventory完了。

### Local / Drive / runtime

- [x] Git/repository architecture
- [x] Node.js `v22.23.1` / npm `10.9.8`
- [x] connected Drive `Health Auto Export/Sleep` raw source
- [x] N100 OS-visible raw root `L:\マイドライブ\Health Auto Export`
- [x] `Sleep` directory
- [x] `L:` は観測値のみ。hardcode禁止
- [x] repo直下 `server-data: ABSENT`
- [x] GoogleDriveFS running
- [x] Tailscale service Running / Automatic

### GCP

詳細: [`o12-gcp-audit-result.md`](./o12-gcp-audit-result.md)

- [x] project `sleep-improvement-cloud`: `ACTIVE`
- [x] Billing: `billingEnabled: true`
- [x] Cloud Run `sleep-improvement-api`
- [x] Cloud Run `sleep-improvement-drive-sync-api`
- [x] Scheduler `sleep-drive-sync-daily` / ENABLED
- [x] Artifact Registry `cloud-run-source-deploy`
- [x] Firestore `(default)` / `asia-northeast1` / `FIRESTORE_NATIVE`
- [x] Secret names `drive-sync-api-token`, `health-export-api-token`
- [x] Storage `run-sources-sleep-improvement-cloud-asia-northeast1`
- [x] Service Accounts count `5`
- [x] Cloud Build trigger list: empty
- [x] relevant enabled APIs
- [x] Firebase Hosting site `sleep-improvement-cloud`
- [x] Cloud Asset Inventory API未有効。APIは有効化せずservice-specific inventoryで代替

### 用途不明resourceの扱い

Cloud Run `maya-daily-observation-console`:

- region: `asia-northeast1`
- creationTimestamp: `2026-05-26T01:32:37.322920Z`
- latest revision: `maya-daily-observation-console-00009-vpx`
- same-name Artifact Registry imageからdeploy
- Sleep Compass repository内にservice名参照なし

分類: **inventory済み / non-Sleep-Compass candidate / 用途不明**。

O-12aでは存在とmetadataを把握したためinventory gateを満たす。停止・削除・変更は禁止。O-12jのdedicated-project判定前に用途を再確認し、別用途ならproject shutdownは禁止する。

# O-12b — Processed Data Contract

## 4. Exit Gate判定: COMPLETE

正式契約: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
Schema: `sleep-compass.processed-data` **v1.0.0**

確定済み:

- [x] canonical JSON/JSONL dataset
- [x] schema/version/provenance
- [x] deterministic ID / path portability
- [x] sleep-day processing config
- [x] source integration policy versioning
- [x] overlap provenance
- [x] sleep block / sleep day objective data
- [x] daily + sleep-window health metric contract
- [x] immutable completed snapshot
- [x] manifest hash/count
- [x] `complete.json` publication marker
- [x] legacy reader policy
- [x] migration manifest
- [x] retention rule
- [x] contract test cases
- [x] Web/Cloud/local schema mapping
- [x] O-12a実機/GCP inventory反映

実際のsnapshot writer/atomic publication/test implementationはO-12c/O-12dで行う。

# O-12c — Processor独立化

## 5. 実装設計

設計: [`o12c-processor-independence.md`](./o12c-processor-independence.md)

3 sliceで進める。

1. **C1 Import boundary + one-shot**
2. **C2 Objective integration policy extraction**
3. **C3 Cloud objective metrics回収**

O-12dのatomic write / corruption / path finalization / fingerprint / watcher hardeningは混ぜない。

## 6. C1 — 実装済み / N100検証待ち

ChatGPTがremote `master`へ実装済み。

追加:

- `processor/healthAutoExport.ts`
  - raw JSON parse/audit/normalize
  - `HealthStore` / HTTP / Firebase / Firestore依存なし
- `processor/runOnce.ts`
  - serverを起動しないdirect one-shot CLI
  - stdoutはfile名・件数・statusのみ。health valuesを出さない
- `tests/processor-health-auto-export.test.ts`
  - synthetic JSONのみ使用

変更:

- `server/importHealthExports.ts`
  - parse/normalizeをProcessor Coreへ委譲
  - legacy `healthStore` merge/saveはserver adapter側に残す
- `package.json`
  - `processor:once`
  - `test:processor`
  - full test chainへprocessor test追加
- `tsconfig.node.json`
  - `processor`をtypecheck対象へ追加

静的review:

- C1 diffは6 files
- Processor moduleから`server/healthStore.ts` importなし
- existing watcher/serverは従来の`server/importHealthExports.ts` interfaceを維持
- real health data fixtureをrepositoryへ追加していない

検証task: **`CX-O12C-001`**  
手順: [`o12c-c1-validation.md`](./o12c-c1-validation.md)

状態: **CODEX NEEDED — test/buildのみ。編集禁止。**

## 7. C1 PASS後の次作業

### C2

- `SleepSourcePreferenceMap` 依存をcanonical integrationから除去
- versioned Processor `SourceIntegrationPolicy`
- objective reason codeとUI message分離
- overlap thresholdsをconfig/provenanceへ接続
- deterministic canonical block ID
- main sleep = longest block per sleep day

### C3

Cloud側pure logicをProcessorへ回収:

- `cloud-api/src/lib/healthMetricAggregator.ts`
- `cloud-api/src/lib/sleepWindowMetricAggregator.ts`

Firestore `userId` / `runId` / document型をProcessor canonical modelから除去し、Cloud側は必要ならadapter化する。

## 8. O-12c Exit Gate

- [x] C1 standalone importer implementation
- [x] C1 direct one-shot implementation
- [ ] C1 N100 targeted test/build PASS
- [ ] canonical source integrationがUI preferenceから独立
- [ ] canonical block/sleep-day ruleがv1.0.0と一致
- [ ] daily health metricsがProcessor側で生成可能
- [ ] sleep-window health metricsがProcessor側で生成可能
- [ ] watcher/serverがProcessor Core adapterとして動作確認
- [ ] Processor CoreにReact/Firebase/Cloud Run/Firestore/Tailscale/Drive API依存なし
- [ ] targeted/full tests + build PASS

# O-12d〜O-12j 安全順序

- O-12d: atomic/versioned snapshot、corruption handling、portable path、fingerprint、watcher/rescan、Drive backup
- O-12e: Rebuild/Migrate/Archive、reconstruction。**完了前にCloud dataを削除しない**
- O-12f: Sleep CompassをProcessed Data-backed local APIへ移行
- O-12g: same-origin、`127.0.0.1`、Tailscale Serve、Funnel不使用
- O-12h: Cloud/local parity、restart/recovery。**完了前にCloud operationを停止しない**
- O-12i: Cloud automatic processingを最小・可逆に停止
- O-12j: final resource/Billing audit。`maya-daily-observation-console`用途再確認。Billing disable / project shutdownは安全確認と明示承認後のみ

# 進捗・証拠

## 9. 主要進捗ID

| ID | Phase | 状態 | 結果 |
| --- | --- | --- | --- |
| `GPT-O12A-001..014` | O-12a | COMPLETE | repo/Drive/N100/GCP inventory完了 |
| `OBS-O12A-DRIVE-001` | O-12a | PASS | OS-visible raw root確認 |
| `GCP-O12A-001` | O-12a | PASS | GCP/Billing/control-plane inventory |
| `GCP-O12A-002` | O-12a | PASS | `maya-daily-observation-console` metadata inventory |
| `GPT-O12B-PREP-001..008` | O-12b | COMPLETE | contract設計・schema・inventory反映 |
| `GPT-O12B-FINAL-001` | O-12b | COMPLETE | v1.0.0 Exit Gate判定 |
| `GPT-O12C-001` | O-12c | COMPLETE | coupling map / C1-C3設計 |
| `GPT-O12C-002` | O-12c | COMPLETE | C1 remote implementation |
| `CX-O12C-001` | O-12c | READY | N100 C1 test/build validation |

## 10. 現在の次作業

### Codex

`CX-O12C-001` のみ。コード編集なし。

### ChatGPT

`CX-O12C-001`結果をreviewし、PASSならC1を閉じてC2実装設計/差分へ進む。
