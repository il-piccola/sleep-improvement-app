# O-12 Processed Data Contract

Status: **APPROVED — O-12b Exit Gate通過済み**  
Phase: **O-12b — Processed Data Contract**  
Schema version: **1.0.0**  
Baseline: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Progress: [`o12-progress.md`](./o12-progress.md)  
Migration source map: [`o12-migration-source-map.md`](./o12-migration-source-map.md)

## 1. 目的

この文書は、Data Processorが生成し、Sleep Compassおよび他のアプリケーションが読み取る **Processed Data Contract** の正式契約です。

O-12の依存方向は次の一方向とします。

```text
Raw data
  ↓
Data Processor
  ↓
Processed Data Contract
  ↓
Sleep Compass / 他のアプリ・ツール
```

Processed DataはSleep Compass内部の一時キャッシュではなく、長期保存可能で外部からも利用できるユーザーデータ資産として扱います。

この文書は現行 [`DATA_CONTRACT.md`](../DATA_CONTRACT.md) を置き換えるものではありません。役割を次のように分離します。

- `DATA_CONTRACT.md`: 既存入力形式と `SleepRecord[]` 正規化の互換仕様
- 本文書: Data Processorが外部へ公開する加工済み出力の正式契約

O-12a current-state auditの結果は本契約と [`o12-migration-source-map.md`](./o12-migration-source-map.md) へ反映済みです。N100固有path、Cloud resource ID、Firestore運用履歴などの環境固有情報はcanonical schemaへ混入させず、migration/runtime inventoryとして分離します。

## 2. 設計原則

Processed Data Contractは次を満たします。

1. **Cloud非依存**: Cloud Run、Firestore、Firebase、Google Drive API固有のIDやtimestampを必須にしない。
2. **OS非依存**: drive letterやホスト固有の絶対pathを永続データへ保存しない。
3. **Processor独立**: React、Sleep Compass API、Tailscaleがなくても生成できる。
4. **外部利用可能**: JSON / JSONLをcanonical形式とし、特定DBを必須にしない。
5. **再現可能**: 同一sourceと同一processing configから、論理的に同一のrecord/block IDを再生成できる。
6. **破損検出可能**: datasetごとの件数、byte数、SHA-256をmanifestに記録する。
7. **versioned**: schema変更は明示的にversion管理し、breaking changeを黙って適用しない。
8. **immutable snapshot**: 完成済みsnapshotは上書きしない。
9. **安全な公開**: 未完成snapshotをconsumerが正式データとして読まない。
10. **客観処理とアプリ解釈を分離**: Processorは正規化・統合・block・sleep day・health metric等を担当し、改善アクションやユーザー向け評価はSleep Compass側に残す。

## 3. ProcessorとSleep Compassの責務境界

### Data Processorが所有するもの

- input format detection / legacy reader
- sleep record normalization
- source identity normalization
- duplicate / overlap detection
- deterministic source integration結果
- sleep block構築
- sleep stage segment
- sleep day割当
- block type / main sleepの客観的分類
- daily health metric aggregation
- sleep-window health metric aggregation
- conversion / rejection / data-quality diagnostics
- schema migration
- snapshot validation / publication

### Sleep Compassが所有するもの

- 改善アクション
- ユーザー向け診断表示
- fragmentation / circadian等のアプリ固有score
- UI表示文言
- ユーザー向け優先順位・行動提案
- Web/API presentation

したがって、現行 `SleepDaySummary` の `fragmentation`、`circadian`、`ImprovementAction` はProcessed Dataのcanonical必須項目にはしません。

## 4. Canonical snapshot構造

Processed Dataの正式な保存単位は **snapshot directory** とします。

```text
snapshots/
  <snapshotId>/
    manifest.json
    input-files.jsonl
    sleep-records.jsonl
    sleep-blocks.jsonl
    sleep-days.jsonl
    source-summaries.jsonl
    overlaps.jsonl
    health-metrics.jsonl
    diagnostics.json
    migration-manifest.json      # migration snapshotの場合のみ
    complete.json
```

### canonical / optional

| File | 種別 | 必須 | 内容 |
| --- | --- | --- | --- |
| `manifest.json` | JSON | 必須 | schema、processor、config、dataset一覧、hash/count |
| `input-files.jsonl` | JSONL | 必須 | raw source fileのprovenanceと処理結果 |
| `sleep-records.jsonl` | JSONL | 必須 | 正規化済みsleep record |
| `sleep-blocks.jsonl` | JSONL | 必須 | 統合済みsleep block / stage segment |
| `sleep-days.jsonl` | JSONL | 必須 | sleep day単位の客観summary |
| `source-summaries.jsonl` | JSONL | 必須 | sourceの客観的coverage/quality情報 |
| `overlaps.jsonl` | JSONL | 必須 | duplicate / overlap判定根拠 |
| `health-metrics.jsonl` | JSONL | 必須 | daily / sleep-window metric。0件でも空fileを作る |
| `diagnostics.json` | JSON | 必須 | conversion / rejection / warning等の構造化診断 |
| `migration-manifest.json` | JSON | 条件付き | O-12e migration/rebuild/archiveを伴うsnapshot |
| `complete.json` | JSON | 必須 | 完成snapshotであることを示す最終marker |

CSVを補助出力してもよいですが、CSVだけをcanonicalにしてはいけません。

## 5. Snapshot IDとimmutableルール

`snapshotId` は人間が時系列を追え、衝突しない文字列とします。

推奨形式:

```text
YYYYMMDDTHHMMSSZ-<short-id>
```

例:

```text
20260823T010203Z-a1b2c3d4
```

snapshot directoryは完成後に内容を変更しません。

修正が必要な場合は新しいsnapshotを生成します。

## 6. manifest.json

`manifest.json` はsnapshot全体のauthoritative metadataです。

### 必須schema

```json
{
  "schemaId": "sleep-compass.processed-data",
  "schemaVersion": "1.0.0",
  "snapshotId": "20260823T010203Z-a1b2c3d4",
  "processorVersion": "<processor-version>",
  "processorRevision": "<git-revision-if-known>",
  "generatedAt": "2026-08-23T01:02:03.000Z",
  "processingConfig": {
    "timeZone": "Asia/Tokyo",
    "sleepDayBoundaryHour": 18,
    "mergeGapMinutes": 30,
    "napCandidateMaxMinutes": 90,
    "eveningSleepStartHour": 16,
    "eveningSleepEndHour": 22,
    "mainSleepRule": "longest_block_per_sleep_day",
    "sourceIntegrationPolicyVersion": "1"
  },
  "identityPolicyVersion": "1",
  "datasets": [
    {
      "name": "sleep-records",
      "path": "sleep-records.jsonl",
      "mediaType": "application/x-ndjson",
      "recordType": "SleepRecordV1",
      "recordCount": 0,
      "byteLength": 0,
      "sha256": "<sha256>"
    }
  ]
}
```

### manifest必須field

| Field | 内容 |
| --- | --- |
| `schemaId` | contract識別子。`sleep-compass.processed-data` |
| `schemaVersion` | Processed Data schema version |
| `snapshotId` | snapshotの一意識別子 |
| `processorVersion` | Data Processor version |
| `processorRevision` | Git revision等。取得可能な場合 |
| `generatedAt` | snapshot生成日時。ISO 8601 UTC推奨 |
| `processingConfig` | 派生値を再解釈するために必要な処理設定 |
| `identityPolicyVersion` | stable ID生成policy version |
| `datasets` | snapshot内dataset metadata |

`processorRevision` は実行環境で取得不能な場合 `null` を許可します。ただし `processorVersion` は必須です。

## 7. Versioning policy

`schemaVersion` はSemVer形式 `MAJOR.MINOR.PATCH` を使用します。

### MAJOR

次の場合はMAJORを上げます。

- 必須field削除
- field型変更
- datasetの意味変更
- ID semantics変更
- consumerが旧schemaのまま安全に解釈できない変更

### MINOR

後方互換な追加に使用します。

- optional field追加
- optional dataset追加
- consumerが未知値を許容することを契約で定義済みのenum追加

### PATCH

データ意味を変えない修正に使用します。

- 文書明確化
- validation metadata追加でconsumer意味が変わらない場合

### consumer rule

- 同じMAJOR内の未知optional fieldは無視できる。
- 未対応MAJORは黙って読み込まず、明示エラーにする。
- breaking schemaにはmigration adapterまたは明示的compatibility pathを用意する。
- 既存snapshotをin-place変換しない。新schema snapshotを別に生成する。

## 8. IDとpath portability

永続IDに次を含めてはいけません。

- `C:\...`、`L:\...` 等のabsolute path
- Unix/macOSのhost固有absolute path
- Google Drive mount letter
- Firestore auto-generated document IDだけに依存するidentity

### sourceFileId

raw source fileのidentityは次の論理情報から決定します。

- raw rootからのnormalized relative path
- file size
- modified time
- content hashを計算した場合はそのhash
- `identityPolicyVersion`

content hashを常に計算する必要はありません。unchanged判定でmetadataが十分な場合はhashを省略でき、必要時だけhashを計算できます。

### recordId

sleep recordのIDは、source file identityとrowの論理内容からdeterministicに生成します。

再処理で同じsource rowが別IDにならないことを必須とします。

### blockId

sleep block IDは、採用されたsource record ID、sleep day、開始・終了等の論理内容からdeterministicに生成します。

array indexだけをIDにしてはいけません。

## 9. input-files.jsonl

1行につき1source fileです。

```json
{"sourceFileId":"src-...","relativePath":"Sleep/example.json","fileName":"example.json","size":12345,"modifiedAt":"2026-01-01T00:00:00Z","sha256":null,"format":"health_auto_export_json","status":"processed","processedRecordCount":10,"rejectedRowCount":0,"warningCount":0}
```

### required fields

- `sourceFileId`
- `relativePath`
- `fileName`
- `size`
- `modifiedAt` またはsource filesystemで取得不能であることを示す `null`
- `sha256` または `null`
- `format`
- `status`: `processed | skipped | failed | unsupported`
- `processedRecordCount`
- `rejectedRowCount`
- `warningCount`

`relativePath` はraw root基準でありabsolute pathではありません。

## 10. sleep-records.jsonl

既存 `SleepRecord[]` をProcessed Data向けに安定化したcanonical recordです。

### SleepRecordV1

```json
{
  "recordId": "rec-...",
  "stage": "asleep_core",
  "originalValue": "<source-value>",
  "start": "2026-01-01T00:00:00+09:00",
  "end": "2026-01-01T01:00:00+09:00",
  "durationMinutes": 60,
  "sourceKey": "source-key",
  "sourceFormat": "health_auto_export_json",
  "sourceFileId": "src-...",
  "sourceName": null,
  "integrationStatus": "adopted",
  "integrationReasonCode": "independent"
}
```

### required fields

- `recordId`
- `stage`
- `start` / `end`。時刻を持たないlegacy rowでは `null` を許容
- `durationMinutes`
- `sourceKey`
- `sourceFormat`
- `sourceFileId`
- `integrationStatus`
- `integrationReasonCode`

### stage

- `awake`
- `in_bed`
- `asleep`
- `asleep_core`
- `asleep_rem`
- `asleep_deep`
- `asleep_unspecified`
- 将来追加値

未知stageを理由にraw/normalized recordを消してはいけません。readerが意味を確定できない場合は `asleep_unspecified` 等の既定分類と `originalValue` / diagnosticsを併用します。

### integrationStatus

- `adopted`
- `excluded_duplicate`
- `pending_overlap`
- `support`
- `ignored`

`ignored` はProcessor-level policyで明示除外された場合だけ使用します。Sleep Compass UIの一時的な表示設定をProcessorのcanonical dataへ暗黙反映しません。

## 11. sleep-blocks.jsonl

1行につき1つの統合済みsleep blockです。

```json
{
  "blockId": "blk-...",
  "sleepDay": "2026-01-01",
  "start": "2026-01-01T00:00:00+09:00",
  "end": "2026-01-01T01:00:00+09:00",
  "durationMinutes": 60,
  "timeConfidence": "actual",
  "blockType": "nap",
  "isMainSleep": false,
  "sourceRecordIds": ["rec-..."],
  "sourceKeys": ["source-key"],
  "stageSegments": [
    {
      "start": "2026-01-01T00:00:00+09:00",
      "end": "2026-01-01T01:00:00+09:00",
      "durationMinutes": 60,
      "stage": "asleep_core"
    }
  ]
}
```

### blockType

Processed Dataではhealth sleep-window metricとSleep Compassの双方が利用できるよう、1blockにつきprimary `blockType` を持ちます。

- `main`
- `nap`
- `evening`
- `supplemental`
- `unknown`

優先順位は次を正式ルールとします。

1. sleep day内のmain sleep
2. evening window内で開始
3. nap threshold未満
4. supplemental

`isMainSleep` は `blockType=main` と整合しなければなりません。

### main sleep rule

O-12bのcanonical ruleは **sleep dayごとの最長blockをmain sleepとする** です。同長の場合は開始時刻が早いblock、それでも同じ場合は `blockId` lexical orderで決定します。

これは現行Webがsleep day内で実質的に最長blockを主睡眠候補として表示する動作に合わせます。

## 12. sleep-days.jsonl

Processed Dataに含めるsleep day summaryは客観値だけにします。

```json
{
  "sleepDay": "2026-01-01",
  "boundaryStart": "2026-01-01T18:00:00+09:00",
  "boundaryEnd": "2026-01-02T18:00:00+09:00",
  "blockIds": ["blk-..."],
  "mainSleepBlockId": "blk-...",
  "blockCount": 1,
  "totalSleepMinutes": 420,
  "longestBlockMinutes": 420,
  "napBlockCount": 0,
  "eveningBlockCount": 0
}
```

canonical必須項目には次を含めません。

- fragmentation score
- circadian score
- improvement action
- UI向けlabel / message

これらはSleep Compass側でProcessed Dataから再計算します。

## 13. source-summaries.jsonl

sourceごとの客観的なcoverageと統合情報を保持します。

例として次を含めます。

- `sourceKey`
- `sourceName` / `sourceApp` / `deviceName`。元データに存在する場合のみ
- `recordCount`
- `firstRecordAt`
- `lastRecordAt`
- `stageCoverage`
- `fullDuplicateCount`
- `partialOverlapCount`
- `adoptedRecordCount`
- `excludedDuplicateCount`
- `warningCodes`

Sleep Compass固有の `recommendedUse` やユーザーのsource preferenceはcanonical必須項目にしません。

## 14. overlaps.jsonl

duplicate / overlap候補を削除せず、判断根拠として保存します。

```json
{
  "overlapId": "ovl-...",
  "kind": "full_duplicate_candidate",
  "recordOrBlockIds": ["blk-a", "blk-b"],
  "sourceKeys": ["source-a", "source-b"],
  "overlapMinutes": 45,
  "overlapRatio": 1.0,
  "resolution": "excluded_duplicate",
  "adoptedBlockId": "blk-a",
  "reasonCode": "same_window_higher_priority_source"
}
```

`kind` は最低限次を扱います。

- `full_duplicate_candidate`
- `partial_overlap_candidate`

未確定のpartial overlapは `resolution: pending` として保持できます。

## 15. health-metrics.jsonl

Cloud pathで既に生成しているhealth metricとsleep-window metricをData Processor側へ回収します。

### 対象metric

現行Cloud実装で確認済みの対象:

- `step_count`
- `walking_running_distance`
- `active_energy`
- `heart_rate`
- `respiratory_rate`
- `heart_rate_variability`

### HealthMetricRecordV1

```json
{
  "metricRecordId": "met-...",
  "metricName": "heart_rate",
  "metricGroup": "vitals",
  "aggregation": "sleep_window_summary",
  "granularity": "sleep_block",
  "date": null,
  "sleepDay": "2026-01-01",
  "sleepDayBoundaryHour": 18,
  "sleepBlockId": "blk-...",
  "sleepBlockType": "main",
  "isMainSleep": true,
  "windowStart": "2026-01-01T23:00:00+09:00",
  "windowEnd": "2026-01-02T06:00:00+09:00",
  "timeZone": "Asia/Tokyo",
  "value": null,
  "valueAvg": 60.0,
  "valueMin": 50.0,
  "valueMax": 75.0,
  "valueCount": 10,
  "unit": "bpm",
  "sourceKey": "source-key",
  "sourceFileCount": 1,
  "sourceRowCount": 10
}
```

Cloud固有の次のfieldはcanonical必須にしません。

- `userId`
- Firestore `createdAt` / `updatedAt`
- Cloud sync `runId`
- Firestore document path

これらはsnapshot provenanceやmigration archiveで必要に応じて保持します。

## 16. diagnostics.json

Processorのwarning/errorを、UI文言ではなく構造化code中心で保存します。

```json
{
  "status": "completed_with_warnings",
  "inputFileCount": 10,
  "processedFileCount": 9,
  "failedFileCount": 1,
  "sleepRecordCount": 100,
  "rejectedRowCount": 2,
  "warningCount": 3,
  "warnings": [
    {
      "code": "AGGREGATED_SLEEP_ONLY",
      "severity": "warning",
      "sourceFileId": "src-...",
      "count": 1
    }
  ]
}
```

raw health valueをdiagnostic messageへ不要に埋め込みません。

## 17. Processing config provenance

derived dataの意味に影響する設定はmanifestへ必ず保存します。

最低限:

- `timeZone`
- `sleepDayBoundaryHour`
- `mergeGapMinutes`
- `napCandidateMaxMinutes`
- `eveningSleepStartHour`
- `eveningSleepEndHour`
- `mainSleepRule`
- `sourceIntegrationPolicyVersion`

### 現行実装差異とcanonical解決

現在のWebとCloud sleep-window処理にはblock分類ルールの差があります。

- Web `AnalysisConfig` は `mergeGapMinutes=30`、`napCandidateMaxMinutes=90`、`eveningSleepStartHour=16`、`nightStartHour=22` 等を設定可能。
- Webのblock分類では `mainSleepMinMinutes` 以上のblockへ `main` labelを付けるが、表示時にはsleep day内の最長blockを主睡眠候補として選ぶ。
- Cloud sleep-window集計は `merge=30`、`nap<90`、`evening>=16` を固定値で使い、最長blockをmainとしている。
- Cloud側の現行main判定は処理対象全体の最長blockを選ぶ実装であり、multi-day処理時のcanonical ruleにはそのまま採用しない。

O-12 canonical ruleは、同じprocessing configをProcessor内のsleep blockとsleep-window metricの双方で共有し、**sleep dayごとに一貫した分類**を使います。

## 18. Deterministic ordering

同一source + 同一configでdataset hashを安定させるため、JSONL出力順を固定します。

- `input-files`: `relativePath`, `sourceFileId`
- `sleep-records`: `start`, `end`, `recordId`。時刻なしは最後
- `sleep-blocks`: `sleepDay`, `start`, `blockId`
- `sleep-days`: `sleepDay`
- `source-summaries`: `sourceKey`
- `overlaps`: `overlapId`
- `health-metrics`: `metricName`, `windowStart`, `sourceKey`, `metricRecordId`

JSON object key順もserializerで安定させることを推奨します。

## 19. Snapshot publication rule

### Local working area

1. Drive同期領域外のlocal working directoryで生成する。
2. temporary snapshotとして全datasetを生成する。
3. schema validation、count、SHA-256を検証する。
4. `manifest.json` を確定する。
5. local snapshotを完成directoryとして確定する。
6. `complete.json` を最後に生成する。

consumerは `complete.json` がないsnapshotを読んではいけません。

### Google Drive backup

1. localで完成済みsnapshotのみをcopy対象にする。
2. raw Health Auto Export watch rootとは別directoryへcopyする。
3. dataset filesとmanifestをcopyする。
4. `complete.json` は最後にcopyする。
5. Drive側で `complete.json` が存在しmanifestとのsnapshot IDが一致するsnapshotだけを完成扱いにする。

Google Drive同期directory内でworking fileを継続更新しません。

## 20. complete.json

```json
{
  "snapshotId": "20260823T010203Z-a1b2c3d4",
  "schemaVersion": "1.0.0",
  "manifestSha256": "<sha256>",
  "completedAt": "2026-08-23T01:02:04.000Z"
}
```

consumerは次を検証します。

- `complete.json.snapshotId === manifest.json.snapshotId`
- `schemaVersion` が一致
- `manifestSha256` が一致
- manifest内dataset hash/countが一致

一致しないsnapshotは破損または未完成として使用しません。

## 21. Retention rule

O-12移行中は安全性を優先し、次をルールとします。

- Drive上の完成snapshotをProcessorが自動削除しない。
- migration/reconstructionの証拠snapshotをO-12完了前に自動削除しない。
- localでも最低1つの既知正常snapshotを保持する。
- 新snapshot失敗時に直前の既知正常snapshotを消さない。
- 将来retentionを導入する場合も、versioned snapshotをin-place overwriteしない。

容量管理が必要になった場合のretention数は運用設定として別途定義し、O-12b schemaの意味とは分離します。

## 22. Legacy reader compatibility

Data Processorは少なくとも次のinput adapterを維持します。

1. Health Auto Export JSON
2. 既存 `normalized-sleep-records.json`
3. 対応済みApple Health XML (`HKCategoryTypeIdentifierSleepAnalysis`)
4. O-12移行で必要性が確認された旧processed format

ルール:

- file名だけでformat判定しない。
- formatはcontent/schemaから検出する。
- unsupported formatを黙って無視しない。
- 読めない重要データはdiagnostics / migration manifestへ記録し、Cloud削除gateをblockできる。
- legacy readerはcanonical Processed Dataへ変換し、Sleep Compassへlegacy formatを直接要求しない。

## 23. migration-manifest.json

O-12eで既存データを移行する際、健康値そのものではなくmigration結果を記録します。

```json
{
  "migrationId": "mig-...",
  "generatedAt": "2026-08-23T01:02:03Z",
  "status": "completed_with_warnings",
  "sources": [
    {
      "sourceSystem": "legacy-local",
      "dataset": "health-store",
      "classification": "rebuild",
      "sourceCount": 100,
      "targetDataset": "sleep-records",
      "targetCount": 100,
      "rejectedCount": 0
    }
  ],
  "unresolved": []
}
```

### classification

- `rebuild`
- `migrate`
- `archive`

各重要datasetは必ずいずれかへ分類します。

### Cloud履歴の扱い

Firestoreのserver timestamp、sync run、ingest batch等は、raw sourceからbyte-for-byte再生成できない可能性があります。

これらをcanonical user dataへ無理に混ぜず、O-12eで次を判断します。

- 計算に必要なら `migrate`
- 現行raw sourceから再現可能なら `rebuild`
- 運用履歴として残す価値があるが計算不要なら `archive`

O-12a current-state auditで実在database/resource categoryは確認済みです。document count/history preservation要否はO-12eで確定します。

## 24. Snapshot validation / contract test

O-12bでは次のtest caseを**実装可能な契約要件**として確定します。実際のtest implementation/executionはO-12c/O-12dで行います。

### Schema

- [ ] manifest required fieldsが欠けるとfail
- [ ] unsupported MAJOR versionをreject
- [ ] 同一MAJORのunknown optional fieldを許容
- [ ] JSONL各行がrecord schemaを満たす

### Integrity

- [ ] dataset `recordCount` が実件数と一致
- [ ] `byteLength` が一致
- [ ] SHA-256が一致
- [ ] `complete.json` がないsnapshotをreject
- [ ] `manifestSha256` 不一致をreject

### Determinism / dedupe

- [ ] 同一sourceを再処理して同一logical record IDになる
- [ ] absolute path / drive letter変更でlogical record identityが不必要に壊れない
- [ ] 同一source + configでcanonical record順が安定する
- [ ] duplicate inputで意図しないrecord増加が起きない

### Processing semantics

- [ ] sleepDay boundary変更時、manifestにboundary値が残る
- [ ] main sleepはsleep day単位で一意
- [ ] block classificationとsleep-window metricが同一configを使う
- [ ] health metricのdaily / sleep-window aggregationを区別できる

### Compatibility

- [ ] Health Auto Export JSON reader → Processed Data
- [ ] normalized sleep records reader → Processed Data
- [ ] Apple Health XML reader → Processed Data
- [ ] breaking schema migration adapter test

### Safety

- [ ] manifest / datasetにabsolute host pathがない
- [ ] secret/token/OAuth credentialが出力されない
- [ ] raw JSON/XML全文をdiagnosticsへ埋め込まない
- [ ] incomplete Drive copyをconsumerが使用しない

## 25. 現行schemaとの対応

| Existing | O-12 Processed Data | 方針 |
| --- | --- | --- |
| `SleepRecord[]` | `sleep-records.jsonl` | 継承・安定化 |
| `SleepBlock` / `UnifiedSleepBlock` | `sleep-blocks.jsonl` | canonical blockへ統合 |
| `SleepDaySummary` objective fields | `sleep-days.jsonl` | objective fieldsのみ継承 |
| `fragmentation` / `circadian` | Sleep Compass側 | canonicalから分離 |
| `ImprovementAction` | Sleep Compass側 | canonicalから分離 |
| source quality / overlap | `source-summaries.jsonl`, `overlaps.jsonl` | 客観情報を保存 |
| Firestore `health_metric_records` | `health-metrics.jsonl` | Cloud固有fieldを除去して継承 |
| Firestore `processed_drive_files` | `input-files.jsonl` + local processor state | provenanceは継承、runtime ledgerとは分離 |
| Firestore `drive_sync_runs` | diagnostics / migration archive | canonical user dataとは分離 |
| Firestore `ingest_batches` | diagnostics / migration archive | canonical user dataとは分離 |
| Firestore `metric_audit_summaries` | `diagnostics.json` / archive | 客観監査結果を継承 |
| local `health-store.json` | migration input | canonical outputではない |
| local `processed-files.json` | migration input / local processor state | canonical outputではない |

## 26. O-12a current-state audit反映

O-12aで次を確認し、本契約のportable schemaとmigration policyへ反映しました。

- N100のraw sourceはOS-visibleで、現在の観測pathは `L:\マイドライブ\Health Auto Export`。`Sleep` directoryも存在する。
- `L:` / `マイドライブ` / absolute pathは環境境界であり、canonical IDやschemaへ含めない。
- repo直下の `server-data` は現時点でABSENT。`health-store.json` / `processed-files.json` を必須migration sourceと仮定しない。
- Firestore実在databaseは `(default)` / `asia-northeast1` / `FIRESTORE_NATIVE`。
- Firestore既知categoryは `sleep_records`, `health_metric_records`, `processed_drive_files`, `drive_sync_runs`, `ingest_batches`, `metric_audit_summaries`。
- Cloud runtime/operational resourceは [`o12-migration-source-map.md`](./o12-migration-source-map.md) へ分離して管理する。
- Cloud Run `maya-daily-observation-console` は用途不明だが棚卸し済みで、Processed Data schemaとは無関係。O-12j dedicated-project判定前の再確認対象とし、停止・削除しない。

未確認のFirestore document countやhistorical preservation要否はschema未確定事項ではなく、O-12e migration executionの判断事項です。

## 27. O-12b完了判定

O-12b Exit Gateを **COMPLETE** とします。

- [x] O-12a current-state audit完了
- [x] schema / versioning / provenance確定
- [x] canonical dataset一覧確定
- [x] snapshot publication / completion marker / retention rule確定
- [x] legacy reader policy確定
- [x] migration manifest形式確定
- [x] Web/Cloud/local既存schemaとの対応を定義
- [x] contract test caseを実装可能な粒度で定義
- [x] machine-readable JSON Schema `1.0.0` を確定
- [x] 未解決resource/data issueを後続gateへ明示的に引き継ぎ

これ以降、O-12cのProcessor独立化は本契約 `1.0.0` を実装境界として進めます。breaking changeが必要になった場合はVersioning policyに従い、黙ってcontract意味を変更しません。
