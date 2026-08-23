# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c ACTIVE（C1 COMPLETE / C2 COMPLETE / C3実装済み・最終統合検証待ち）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Processed Data Contract: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
Migration Source Map: [`o12-migration-source-map.md`](./o12-migration-source-map.md)  
O-12c設計: [`o12c-processor-independence.md`](./o12c-processor-independence.md)  
C2最終結果: [`o12c-c2-validation-result-cx-o12c-010.md`](./o12c-c2-validation-result-cx-o12c-010.md)  
C3 + O-12c最終検証: [`o12c-c3-implementation-and-final-validation.md`](./o12c-c3-implementation-and-final-validation.md)  
最終更新日: **2026-08-23**

## 1. 運用原則

- O-12は **ChatGPT優先・Codex最小化** で進める。
- Codex確認は小分けにせず、1つの実装sliceについて安全にまとめられるtest/build/static checkを1回へ統合する。
- 途中で停止するのは、破壊的操作が必要、ローカル固有情報を失う恐れ、application/compile/assertion failureを確認した場合を原則とする。
- 既知environment issueだけを理由に安全な後続確認を小分けにしない。
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
| O-12c | Processor独立化 | **ACTIVE — C1/C2 COMPLETE、C3実装済み・最終検証待ち** |
| O-12d | Processor堅牢化 | **NOT STARTED** |
| O-12e | 既存データ移行 | **NOT STARTED** |
| O-12f | Sleep Compass独立化 | **NOT STARTED** |
| O-12g | Local Web + Tailscale | **NOT STARTED** |
| O-12h | 並行検証・復旧試験 | **NOT STARTED** |
| O-12i | Cloud運用停止 | **NOT STARTED** |
| O-12j | Cloud完全撤去 | **NOT STARTED** |

# O-12a — COMPLETE

確認済み:

- repository / Node / npm inventory
- N100 raw root `L:\マイドライブ\Health Auto Export` と `Sleep`
- `L:`は観測値のみ、hardcode禁止
- repo直下 `server-data: ABSENT`
- GoogleDriveFS running
- Tailscale Windows service Running / Automatic
- GCP project / Billing / Cloud Run / Scheduler / Artifact Registry / Firestore / Secret names / Storage / Hosting / APIs
- `maya-daily-observation-console` はinventory済みの用途不明non-Sleep-Compass candidate

`maya-daily-observation-console`は停止・削除禁止。O-12jのproject shutdown判定前に用途を再確認する。

# O-12b — COMPLETE v1.0.0

Processed Data Contractで確定済み:

- canonical JSON/JSONL
- schema/version/provenance
- deterministic ID / path portability
- source integration policy / overlap provenance
- canonical block / sleep day
- daily + sleep-window health metrics
- immutable snapshot / manifest / `complete.json`
- migration / retention / compatibility policy

snapshot publication/atomic writeはO-12dで実装する。

# O-12c — Processor独立化

## 3. C1 Import boundary + one-shot — COMPLETE

実装:

- `processor/healthAutoExport.ts`
- `processor/runOnce.ts`
- `server/importHealthExports.ts` adapter
- synthetic processor test

根拠:

- `CX-O12C-006`: targeted processor test PASS / build PASS / one-shot CLI PASS exit 2
- `CX-O12C-007`: full test PASS
- worktree CLEAN

## 4. C2 Objective integration — COMPLETE

実装:

- `processor/types.ts`
- `processor/sleepBlocks.ts`
- `processor/overlaps.ts`
- `processor/integrateSleep.ts`
- `processor/sleepDays.ts`
- `processor/canonicalSleep.ts`
- `tests/processor-canonical-integration.test.ts`

確定内容:

- UI `SleepSourcePreferenceMap`からcanonical integrationを分離
- deterministic source priority
- objective reason codeのみ、UI messageなし
- overlap threshold `0.8 / 0.3`をconfig化
- absolute `sourceFile`をcanonical identityへ混ぜない
- canonical record/block IDへidentity policy versionを反映
- sleep day grouping
- main sleep = longest block per sleep day
- tie-break = duration desc → start asc → block ID lexical
- `SleepDay` required summary fieldsをProcessed Data schemaへ整合

### CX-O12C-010

**PASS_WITH_ENVIRONMENT_EXCEPTION / C2 COMPLETE**

- native C2 targeted test: PASS
- build: PASS
- forbidden import scan: PASS
- application error: なし
- final git status: CLEAN
- full testのみ既知 `uv_os_get_passwd ENOMEM`

`CX-O12C-009`で `os.userInfo()` 単独でも同じENOMEMを再現済み。C2 code failureとは扱わない。

## 5. C3 Objective health metrics — 実装済み / 最終検証待ち

Processorへ追加:

- `processor/healthMetricTypes.ts`
  - Processed Data canonical health metric型
  - `userId` / `runId` / Firestore型なし
- `processor/time.ts`
  - processing config `timeZone`を使うdate/window helper
- `processor/dailyHealthMetrics.ts`
  - `step_count`
  - `walking_running_distance`
  - `active_energy`
  - `daily_total`
- `processor/sleepWindowHealthMetrics.ts`
  - `heart_rate`
  - `respiratory_rate`
  - `heart_rate_variability`
  - C2 canonical classified blockを使う`sleep_window_summary`
- `tests/processor-health-metrics.test.ts`
  - synthetic dataのみ

`test:processor`へC3 testを追加済み。

### Cloud runtime安全境界

C3実装時にCloud aggregatorからrepo直下Processorを直接importする案を静的確認したが、`cloud-api/tsconfig.json`が独立 `rootDir: src` であるため、現在のCloud Run build境界を壊す可能性があると判断した。

そのため:

- `cloud-api/src/lib/healthMetricAggregator.ts`
- `cloud-api/src/lib/sleepWindowMetricAggregator.ts`

は **C3前baselineと同一内容を維持**する。

O-12cの目的はProcessor単独でcanonical metricsを生成可能にすること。Cloud runtimeの削除/再配線はCloud停止前に不用意に行わない。

## 6. C3 + O-12c最終統合検証

`CX-O12C-011`のみを実施する。

手順: [`o12c-c3-implementation-and-final-validation.md`](./o12c-c3-implementation-and-final-validation.md)

1回で確認:

- C1 native processor test
- C2 native processor test
- C3 native processor test
- root build
- Processor forbidden import scan
- Cloud metric runtime filesがbaselineと同一
- watcher → server importer → Processor adapter static path
- full regressionを1回だけ試行
- final worktree CLEAN

full regressionが既知`uv_os_get_passwd ENOMEM`だけで止まる場合でも、application errorなし・その他全PASSなら `PASS_WITH_ENVIRONMENT_EXCEPTION` とし、O-12cを閉じられる。

## 7. O-12c Exit Gate

- [x] C1 standalone importer
- [x] C1 direct one-shot
- [x] C1 targeted/build/CLI/full test根拠
- [x] C2 canonical integrationがUI preferenceから独立
- [x] C2 deterministic canonical block/sleep-day実装
- [x] C2 build + native test + forbidden scan
- [ ] daily health metricsがProcessor側で生成可能 — **実装済み、CX-O12C-011検証待ち**
- [ ] sleep-window health metricsがProcessor側で生成可能 — **実装済み、CX-O12C-011検証待ち**
- [ ] watcher/server → Processor adapter確認 — **CX-O12C-011で同時確認**
- [x] ProcessorにCloud/Firebase/React/Tailscale/Drive API runtime dependencyを導入していない
- [ ] O-12c final integrated gate — **CX-O12C-011待ち**

# O-12d〜O-12j 安全順序

- O-12d: atomic/versioned snapshot、corruption handling、portable path、fingerprint、watcher/rescan、Drive backup
- O-12e: Rebuild/Migrate/Archive、reconstruction。完了前にCloud dataを削除しない
- O-12f: Sleep CompassをProcessed Data-backed local APIへ移行
- O-12g: same-origin、`127.0.0.1`、Tailscale Serve、Funnel不使用
- O-12h: Cloud/local parity、restart/recovery。完了前にCloud operationを停止しない
- O-12i: Cloud automatic processingを可逆に停止
- O-12j: final resource/Billing audit、`maya`用途再確認、Billing disable / project shutdownは安全確認と明示承認後のみ

## 8. 現在の次作業

### Codex

**`CX-O12C-011` 1回のみ。** C3 + O-12c final consolidated validation。コード編集禁止。

### ChatGPT

`CX-O12C-011`をreviewする。PASS系ならO-12cを正式COMPLETEにしてO-12dへ進む。application/compile/assertion failureがある場合のみ、そのfailureをまとめて修正して次の確認を設計する。
