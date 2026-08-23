# O-12c Processor独立化 実装設計

Status: **ACTIVE — O-12a/O-12b Exit Gate通過後の正式実装計画**  
Phase: **O-12c — Processor independence**  
Updated: **2026-08-23**

## 1. 目的

Data ProcessorをSleep Compass runtimeから切り離し、次がなくても直接実行できる状態にする。

- React / Web UI
- Sleep Compass HTTP API
- Firebase / Firebase Auth
- Cloud Run
- Firestore
- Tailscale
- Google Drive API

O-12cは**依存関係の切断**に集中する。atomic snapshot、corruption recovery、portable path設定、fingerprint最適化、watcher hardening、Drive completed-snapshot backupはO-12dで扱う。

正式な出力境界は [`o12-processed-data-contract.md`](./o12-processed-data-contract.md) v1.0.0 とする。

## 2. 現在の結合点

### 2.1 Importer → Sleep Compass state

`server/importHealthExports.ts` はHealth Auto Export JSONをparse/audit/normalizeした直後に `mergeAndAnalyzeSleepRecords()` を呼ぶ。

そのため、現状のimport処理は:

```text
read raw JSON
  → parse/audit
  → normalize SleepRecord[]
  → healthStoreへmerge
  → Sleep Compass分析
  → health-store.json保存
```

となり、Processor単独処理になっていない。

### 2.2 `healthStore.ts` に客観処理とアプリ解釈が混在

`healthStore.ts` は次を同時に担当する。

- dedupe / merge
- persisted state
- unified timeline
- sleep-day summaries
- source/data quality
- `generateImprovementActions`

`generateImprovementActions` はSleep Compass側責務でありProcessor Coreへ含めない。

### 2.3 Unified integrationがUI preference型へ依存

`src/lib/analysis/buildUnifiedSleepTimeline.ts` は `SleepSourcePreferenceMap` を引数に持ち、`ignored` / `fallback` / `primary` 等のユーザー設定をcanonical integration判断へ直接使う。

またintegration logにユーザー向け日本語messageを生成している。

O-12b契約では、canonical integrationはUIの一時設定ではなくversioned Processor policyで決定するため、この依存を切る必要がある。

### 2.4 Cloud objective metric処理がFirestore型へ依存

`cloud-api/src/lib/healthMetricAggregator.ts` はactivity daily metricを生成するが、戻り値が `HealthMetricRecordDocument` で `userId` / `runId` 等を要求する。

`cloud-api/src/lib/sleepWindowMetricAggregator.ts` もvitals sleep-window metricを生成するが:

- Firestore document型依存
- `userId` / `runId` 依存
- fixed `MERGE_GAP_MINUTES=30`
- fixed `NAP_MAX_MINUTES=90`
- fixed `EVENING_START_HOUR=16`
- 全処理対象のlongest blockをmainにする

というCloud/runtime couplingを持つ。

これらの客観集計ロジックはProcessorへ移し、Cloud側は移行期間中必要ならadapterとしてProcessor Coreを呼ぶ方向にする。

### 2.5 Watcher / server

`server/watchHealthExports.ts` は `importHealthExportFile()` を直接呼び、`server/server.ts` は起動時にwatcherを自動startする。

O-12cではwatcherから呼ばれる処理をProcessor Core wrapperへ変更する。ただしwatcher scan/fingerprintの堅牢化はO-12dへ残す。

## 3. Target dependency

```text
raw file / raw JSON
      ↓
processor/*
  ├─ parse / normalize
  ├─ source integration policy
  ├─ sleep blocks / sleep day
  ├─ daily health metrics
  ├─ sleep-window metrics
  └─ diagnostics
      ↓
Processed Data model (in-memory)
      ↓
  ┌──────────────┬─────────────────┐
  ↓              ↓                 ↓
run-once CLI   server adapter    future snapshot writer(O-12d)
                 ↓
             Sleep Compass state
```

依存方向は必ずProcessor → contract modelまでで止める。

Processor Coreから次をimportしてはいけない。

- `server/server.ts`
- `server/healthStore.ts`
- React component / `App.tsx`
- Firebase client/admin
- Cloud API route
- Firestore persistence module
- Tailscale
- Google Drive API

## 4. Processor Coreの最小interface

O-12c完了時には概念的に次を提供する。

```ts
export type ProcessorConfig = {
  timeZone: string
  sleepDayBoundaryHour: number
  mergeGapMinutes: number
  napCandidateMaxMinutes: number
  eveningSleepStartHour: number
  eveningSleepEndHour: number
  mainSleepRule: 'longest_block_per_sleep_day'
  sourceIntegrationPolicyVersion: string
}

export type ProcessRawResult = {
  sleepRecords: ProcessedSleepRecord[]
  sleepBlocks: ProcessedSleepBlock[]
  sleepDays: ProcessedSleepDay[]
  sourceSummaries: ProcessedSourceSummary[]
  overlaps: ProcessedOverlap[]
  healthMetrics: ProcessedHealthMetric[]
  diagnostics: ProcessorDiagnostics
}

export function processHealthAutoExport(
  input: unknown,
  source: ProcessorSourceRef,
  config: ProcessorConfig,
): ProcessRawResult
```

実装上は小さな関数へ分割してよい。重要なのは上位interfaceがHTTP/server/Firestoreを要求しないこと。

## 5. 実装slice

### C1 — Import boundary + direct one-shot

目的: parse/audit/normalizeを `healthStore` から切り離し、serverなしで実行できる入口を作る。

新規候補:

- `processor/types.ts`
- `processor/healthAutoExport.ts`
- `processor/runOnce.ts`

変更:

- `server/importHealthExports.ts`
- `package.json`
- targeted tests

ルール:

1. `processor/healthAutoExport.ts` はraw textまたはparsed inputからaudit + normalized `SleepRecord[]` を返す。
2. Processor moduleは `server/healthStore.ts` をimportしない。
3. 既存 `server/importHealthExports.ts` はcompatibility adapterとしてProcessor結果を `mergeAndAnalyzeSleepRecords` へ渡してよい。
4. `runOnce.ts` はHTTP serverを起動せず1ファイルを直接処理できる。
5. 初回sliceではraw health valueをstdoutへ出さず、file名・件数・reject/warning数程度だけ表示する。
6. snapshot writerはまだ作らない。O-12dまでの一時的なone-shot proofとする。
7. 既存Web/server動作を壊さない。

C1 exit check:

- Processor importerを単体importできる
- direct CLIがserverなしで起動する
- existing server importは同じnormalized record pathを使う
- build/test PASS

### C2 — Objective integration policy extraction

目的: canonical block/integration処理をUI preferenceから独立させる。

作業:

1. `SleepSourcePreferenceMap` をProcessor Coreのcanonical policy入力にしない。
2. Processor用 `SourceIntegrationPolicy` / policy versionを定義する。
3. `ignored`, `fallback`, source priority等をdeterministic policyへ変換する。
4. canonical overlap thresholdsをprocessing config/provenanceへ接続する。
5. canonical block IDをarray indexに依存させない。
6. main sleepを**sleep dayごとのlongest block**へ統一する。
7. user-facing message textとobjective reason codeを分離する。
8. Sleep Compass UI preferenceはProcessed Data生成後の表示/解釈に使い、canonical source exclusionを暗黙変更しない。

既存 `buildUnifiedSleepTimeline` を直接巨大改修するより、pure integration primitivesをProcessor側へ抽出し、Web側wrapperが必要なら同primitiveを利用する形を優先する。

C2 exit check:

- Processor integrationにReact/UI preference型依存なし
- same input/configでdeterministic block/integration result
- reason codeはUI messageなしでも解釈可能

### C3 — Cloud objective metrics回収

目的: Cloud/Firestore型なしでdaily + sleep-window health metricを生成する。

対象logic:

- `cloud-api/src/lib/healthMetricAggregator.ts`
- `cloud-api/src/lib/sleepWindowMetricAggregator.ts`

Processor側へpure functionとして移す/抽出する。

必須変更:

- `userId` / `runId` をProcessor canonical recordから除去
- Firestore document型をProcessor型へ置換
- `timezone` をconfig化
- merge/nap/evening/main-sleep ruleをProcessor config共通値へ統合
- sleep-window blockをC2のcanonical blockから生成し、Cloud独自block再構築を止める
- activity: `step_count`, `walking_running_distance`, `active_energy`
- vitals: `heart_rate`, `respiratory_rate`, `heart_rate_variability`

移行期間中Cloud APIの既存testを守る必要がある場合、Cloud wrapperがProcessor resultへ `userId` / `runId` を付与するadapter方式にする。

C3 exit check:

- objective metric generatorがFirestore/Firebaseをimportしない
- O-12b `health-metrics.jsonl` shapeへ変換可能
- existing cloud metric behaviorとのtargeted parity testがある

## 6. O-12cでやらないこと

次はO-12dへ明確に残す。

- `health-store.json` atomic write
- corrupt/missing stateの区別
- snapshot directory publication
- `complete.json`
- Drive backup
- `HEALTH_EXPORT_WATCH_DIR`等portable path finalization
- hardcoded default drive path除去
- processed ledger 500件cap除去
- metadata-first conditional SHA
- raw/processed directory exclusion
- watcher recursive scan最適化

O-12c中にこれらを必要以上に混ぜるとdiffが肥大化するため禁止する。

## 7. Test方針

最低限:

- Health Auto Export JSON → normalized record count/reject count
- invalid JSON → explicit error
- Processor importerが`healthStore`なしで動く
- one-shot CLI smoke test
- same input + config → deterministic integration result
- source preference UI変更がcanonical resultを暗黙変更しない
- main sleep per sleep day
- daily health metric parity
- sleep-window metric parity
- root `npm run build`

health value本文をtest logへ大量表示しない。

## 8. O-12c Exit Gate

次をすべて満たしたらCOMPLETEとする。

- [ ] direct one-shot Processor execution path
- [ ] Processor CoreがSleep Compass HTTP serverを要求しない
- [ ] Processor CoreがReact/Firebase/Cloud Run/Firestore/Tailscale/Drive APIをimportしない
- [ ] canonical source integrationがUI preferenceから独立
- [ ] canonical block/sleep-day ruleがO-12b v1.0.0と一致
- [ ] daily health metricsがProcessor側で生成可能
- [ ] sleep-window health metricsがProcessor側で生成可能
- [ ] watcher/serverはProcessor Coreのadapterとして動作
- [ ] targeted tests + build PASS

このgate通過前にO-12dをCOMPLETE扱いにしない。
