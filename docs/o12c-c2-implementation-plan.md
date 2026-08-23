# O-12c C2 Objective Integration 実装計画

Status: **IMPLEMENTED — N100検証待ち**  
Phase: **O-12c — Processor independence / C2**  
Updated: **2026-08-23**  
Validation: [`o12c-c2-validation.md`](./o12c-c2-validation.md)

## 1. 目的

canonical sleep integrationをSleep Compass UI preferenceから切り離し、Processed Data Contract v1.0.0に沿うdeterministicなProcessor policyへ移す。

C1は`CX-O12C-007`でCOMPLETE。C2コードはremote `master`へ実装済みで、現在はN100 test/build検証待ち。

## 2. 解消対象

### 既存Web側

`src/lib/analysis/buildUnifiedSleepTimeline.ts`には次のUI/runtime責務がある。

- `SleepSourcePreferenceMap`
- `primary / fallback / ignored`ユーザー設定
- 日本語integration message
- source quality + preferenceによるwinner selection

C2ではこの既存Web関数を直接置換せず、Processor側へ別のcanonical pure pathを追加した。

### 既存block / overlap

- Web block IDの`array index`依存
- overlap threshold `0.8 / 0.3` module固定
- `AnalysisConfig`にUI/score設定が混在
- main sleep判定のruntime差

これらをProcessor専用config / deterministic identityへ分離した。

## 3. 実装済みProcessor型

`processor/types.ts`:

- `ProcessorConfig`
- `SourceIntegrationPolicy`
- `ProcessorSleepBlock`
- `ProcessorOverlap`
- `ProcessorIntegrationResult`
- `ClassifiedProcessorSleepBlock`
- `ProcessedSleepDay`

v1既定config:

```text
timeZone: Asia/Tokyo
sleepDayBoundaryHour: 18
mergeGapMinutes: 30
napCandidateMaxMinutes: 90
eveningSleepStartHour: 16
eveningSleepEndHour: 22
mainSleepRule: longest_block_per_sleep_day
sourceIntegrationPolicyVersion: 1
fullDuplicateOverlapRatio: 0.8
partialOverlapRatio: 0.3
```

UIの`SleepSourcePreferenceMap`はProcessor型へ入れない。

## 4. 実装単位

### A. `processor/sleepBlocks.ts`

- normalized `SleepRecord[]`をsource/kind単位でdeterministicにmerge
- `mergeGapMinutes`をProcessorConfigから取得
- block IDはSHA-256ベースのlogical content identity
- array index不使用
- absolute `sourceFile`をcanonical source key / block IDへ混ぜない
- input順に依存しないoutput ordering

### B. `processor/overlaps.ts`

- overlap ratioをshorter block基準で計算
- `fullDuplicateOverlapRatio` / `partialOverlapRatio`をconfig化
- deterministic overlap ID
- UI表示文言を生成しない

### C. `processor/integrateSleep.ts`

入力:

- Processor sleep blocks
- overlap candidates
- `SourceIntegrationPolicy`
- `ProcessorConfig`

出力:

- adopted block IDs
- excluded duplicate IDs
- pending overlap IDs
- support IDs
- record integration status
- objective reason code

reason code:

- `independent`
- `full_duplicate_lower_priority`
- `partial_overlap_lower_priority`
- `in_bed_support_only`
- `in_bed_fallback`

日本語messageは生成しない。

初期priorityはdeterministicに:

1. detailed stage coverage
2. actual timestamp coverage
3. non-manual source
4. source key lexical
5. block ID lexical

UI preferenceは使用しない。

### D. `processor/sleepDays.ts`

- `sleepDayBoundaryHour`でsleep dayを割当
- main sleep = sleep dayごとのlongest block
- tie-break = duration desc → start asc → block ID lexical
- block type = `main / evening / nap / supplemental / unknown`
- fragmentation / circadian scoreは生成しない

### E. `processor/canonicalSleep.ts`

次のpure pipelineを1本の入口へ統合:

```text
SleepRecord[]
  → deterministic blocks
  → overlaps
  → source integration
  → sleep day / main sleep / block type
```

React / HTTP / Firebase / Firestore / Tailscale / Drive APIを要求しない。

## 5. Web compatibility

C2では既存React UIを変更しない。

`buildUnifiedSleepTimeline()`は当面Web compatibility pathとして維持する。O-12fでWebをProcessed Data consumerへ移行するとき、UI preferenceはpresentation/filter側へ限定する。

## 6. Test

`tests/processor-canonical-integration.test.ts`を追加済み。

synthetic dataのみで:

1. input order変更でもblock ID/resultが同じ
2. absolute source path表現変更でもcanonical block identityが変わらない
3. 80%以上をfull duplicate
4. 30%以上80%未満をpartial overlap
5. threshold config変更が判定へ反映
6. Processorに`SleepSourcePreferenceMap` / `sourcePreferences`なし
7. 同一sleep dayのlongest blockがmain
8. main tie-breakがdeterministic
9. In Bed support/fallback reason code
10. decisionにUI message不要

root `test:processor`へC2 testを追加済み。

## 7. C2でやらないこと

- snapshot writer / `complete.json`
- atomic write
- watcher hardening
- fingerprint改善
- Cloud metric移植
- Firebase/Web削除
- local API parity

Cloud objective metricsはC3、snapshot/watcher hardeningはO-12dへ残す。

## 8. Exit check

C2 COMPLETE条件:

- [x] Processor canonical integration実装
- [x] UI preferenceをProcessor APIから除外
- [x] deterministic block/overlap IDs
- [x] config-driven overlap thresholds
- [x] sleep-day longest-main rule
- [x] synthetic targeted tests追加
- [ ] N100 `npm run test:processor` PASS
- [ ] N100 `npm run build` PASS
- [ ] N100 `npm test` PASS
- [ ] Processor forbidden import scan PASS
- [ ] final worktree CLEAN

検証task: **`CX-O12C-008`**。
