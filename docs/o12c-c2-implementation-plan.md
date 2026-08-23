# O-12c C2 Objective Integration 実装計画

Status: **PREPARATION — C1検証PASS後に実装**  
Phase: **O-12c — Processor independence**  
Updated: **2026-08-23**

## 1. 目的

canonical sleep integrationをSleep Compass UI preferenceから切り離し、Processed Data Contract v1.0.0に沿うdeterministicなProcessor policyへ移す。

C1未検証中はこの文書だけを確定し、C2 codeは積まない。

## 2. 現行問題

### `buildUnifiedSleepTimeline.ts`

- `SleepSourcePreferenceMap` をcanonical integration判断へ直接使う。
- `primary / fallback / ignored` がUI設定由来。
- integration logに日本語UI messageを埋め込む。
- winner selectionがsource quality + preferenceへ依存する。

### `buildSleepBlocks.ts`

- block IDが `sleep-block-${index}` でarray order依存。
- `AnalysisConfig` 全体を受け、Processorに不要なUI/score設定まで同じ型へ混在する。

### `detectSleepOverlaps.ts`

- full duplicate `0.8` / partial `0.3` がmodule定数固定。
- thresholdがmanifest processing config/provenanceと直接結び付いていない。

### sleep-day / main sleep

- `groupBySleepDay` はsleep-day groupingとして再利用可能だが`AnalysisConfig`型へ依存する。
- current summary/classificationはSleep Compass score/UI向け処理を含む。
- canonical main sleepは **sleep dayごとのlongest block**、同長ならstart、さらに同じならdeterministic block ID lexical orderで決める。

## 3. C2で新設するProcessor型

候補: `processor/types.ts`

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
  fullDuplicateOverlapRatio: number
  partialOverlapRatio: number
}

export type SourceIntegrationPolicy = {
  version: string
  sourcePriority: 'quality_then_source_key'
  unknownSourceMode: 'usable'
  inBedMode: 'fallback_when_no_sleep_overlap'
  partialOverlapMode: 'single_winner_pending'
}
```

UIの`SleepSourcePreferenceMap`はProcessor型へ入れない。

## 4. 実装単位

### A. deterministic block builder

候補: `processor/sleepBlocks.ts`

- normalized `SleepRecord[]` をsource単位でmerge。
- `mergeGapMinutes` はProcessorConfigから受ける。
- block IDはsource record IDs + start/end + policy version等の論理内容からSHA-256等で生成する。
- absolute path / array indexをIDへ含めない。
- output orderingを固定する。

既存`buildSleepBlocks.ts`はSleep Compass wrapperとして残してよい。C2で巨大置換しない。

### B. overlap detection

候補: `processor/overlaps.ts`

- overlap ratio計算自体は現行logicと同義。
- `fullDuplicateOverlapRatio` / `partialOverlapRatio`を引数化。
- candidate IDもdeterministicにする。
- `timeRangeLabel`のようなUI表示文言はcanonical outputへ必須にしない。

### C. source integration

候補: `processor/integrateSleep.ts`

入力:

- deterministic blocks
- overlap candidates
- `SourceIntegrationPolicy`
- ProcessorConfig

出力:

- adopted block IDs
- excluded duplicate IDs
- pending overlap IDs
- record integration status
- objective reason code

reason code例:

- `independent`
- `full_duplicate_lower_priority`
- `partial_overlap_lower_priority`
- `in_bed_support_only`
- `in_bed_fallback`

日本語messageは生成しない。

### D. source priority

初期canonical policyはUI設定を使わずdeterministicにする。

優先材料候補:

1. detailed sleep stagesを持つsource
2. actual timestamp coverage
3. non-manual/non-in-bed primary sleep data
4. source key lexical orderを最終tie-breaker

既存`evaluateSourceQuality()`をそのままcanonical truthにする場合は、内部に現在時刻依存やUI recommended-use依存がないか再確認してから採用する。現在の`buildUnifiedSleepTimeline`は`new Date()`を使うため、そのままProcessorへ持ち込まない。

### E. sleep day + main sleep

候補: `processor/sleepDays.ts`

- `sleepDayBoundaryHour`でgrouping。
- 1 sleep day内でlongest blockをmainにする。
- tie-break: duration desc → start asc → blockId lexical。
- `blockType`: `main / evening / nap / supplemental / unknown`。
- fragmentation/circadian scoreは生成しない。

## 5. Web compatibility

C2では既存React UIを壊さない。

推奨:

- Processor canonical integrationを新規pure moduleとして追加。
- existing `buildUnifiedSleepTimeline()`は当面UI用wrapperとして維持。
- O-12fでWebがProcessed Dataを読む段階でUI preferenceをpresentation/filterへ限定する。

UI preferenceをcanonical Processor resultへ逆流させない。

## 6. Test

synthetic dataのみで最低限:

1. input order変更でもblock ID/resultが同じ。
2. absolute source file path表現が変わってもcanonical identityが不必要に変わらない。
3. 80% threshold以上をfull duplicateとして分類。
4. 30% threshold以上80%未満をpartial overlapとして分類。
5. threshold config変更がresultとprovenanceへ反映される。
6. UI source preference変更をProcessorへ渡す経路が存在しない。
7. 同一sleep dayのlongest blockがmain。
8. main tie-breakがdeterministic。
9. reason codeにUI messageを必要としない。

## 7. C2でやらないこと

- snapshot writer / `complete.json`
- atomic write
- watcher hardening
- fingerprint改善
- Cloud metric移植
- Firebase/Web削除
- local API parity

これらはC3または後続phaseへ残す。

## 8. 実装開始条件

- `CX-O12C-001` C1 targeted/full test + build PASS
- N100 worktree clean

条件を満たすまではこのC2計画のみをPREPARATIONとして保持する。
