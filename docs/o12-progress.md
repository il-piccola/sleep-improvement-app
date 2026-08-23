# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c CODEX NEEDED（C1 COMPLETE / C2実装済み・N100検証待ち）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Processed Data Contract: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
Migration Source Map: [`o12-migration-source-map.md`](./o12-migration-source-map.md)  
O-12c設計: [`o12c-processor-independence.md`](./o12c-processor-independence.md)  
C2設計: [`o12c-c2-implementation-plan.md`](./o12c-c2-implementation-plan.md)  
C2検証: [`o12c-c2-validation.md`](./o12c-c2-validation.md)  
最終更新日: **2026-08-23**

この文書はO-12の中心進捗台帳です。基準文書と矛盾する場合は基準文書を優先します。

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
| O-12c | Processor独立化 | **ACTIVE — C1 COMPLETE / C2 N100検証待ち** |
| O-12d | Processor堅牢化 | **NOT STARTED** |
| O-12e | 既存データ移行 | **NOT STARTED** |
| O-12f | Sleep Compass独立化 | **NOT STARTED** |
| O-12g | Local Web + Tailscale | **NOT STARTED** |
| O-12h | 並行検証・復旧試験 | **NOT STARTED** |
| O-12i | Cloud運用停止 | **NOT STARTED** |
| O-12j | Cloud完全撤去 | **NOT STARTED** |

# O-12a — 現状監査

## 3. Exit Gate: COMPLETE

- Git/repository architecture確認済み
- Node.js `v22.23.1` / npm `10.9.8`確認済み
- connected Drive `Health Auto Export/Sleep` raw source確認済み
- N100 raw root観測: `L:\マイドライブ\Health Auto Export`。`L:`は観測値のみでhardcode禁止
- repo直下 `server-data: ABSENT`
- GoogleDriveFS running
- Tailscale Windows service Running / Automatic
- GCP project `sleep-improvement-cloud` ACTIVE / Billing enabled
- Cloud Run / Scheduler / Artifact Registry / Firestore / Secret names / Storage / Hosting / relevant APIsをread-only inventory済み
- `maya-daily-observation-console` はinventory済み、Sleep Compass repo参照なし、用途不明のnon-Sleep-Compass candidate。停止・削除禁止。O-12jのproject shutdown判定前に再確認する

# O-12b — Processed Data Contract

## 4. Exit Gate: COMPLETE — v1.0.0

確定済み:

- canonical JSON/JSONL dataset
- schema/version/provenance
- deterministic ID / path portability
- processing config / sleep-day provenance
- source integration policy versioning
- overlap provenance
- sleep block / sleep day objective data
- daily + sleep-window health metric contract
- immutable completed snapshot / manifest / `complete.json`
- legacy reader / migration manifest / retention / contract tests
- Web/Cloud/local mapping

snapshot writer / atomic publicationはO-12dで実装する。

# O-12c — Processor独立化

## 5. 実装slice

1. **C1 Import boundary + one-shot — COMPLETE**
2. **C2 Objective integration policy extraction — 実装済み / N100検証待ち**
3. **C3 Cloud objective metrics回収 — 未着手**

O-12dのatomic write / corruption / portable path finalization / fingerprint / watcher hardeningは混ぜない。

## 6. C1 — COMPLETE

remote `master`へ実装済み:

- `processor/healthAutoExport.ts`: raw JSON parse/audit/normalize
- `processor/runOnce.ts`: serverなしdirect one-shot CLI
- `server/importHealthExports.ts`: Processor adapter化、legacy store保存はserver側
- synthetic processor test
- root scripts / Node typecheck対象更新

### N100最終結果

`CX-O12C-007`: **PASS**

- branch `master`
- start/final worktree `CLEAN`
- root `node_modules`復旧済み
- `cloud-api/node_modules` before: ABSENT
- `npm ci --prefix cloud-api --include=dev`: PASS
- `firebase-admin` after: PASS
- `npm test`: **PASS**
- tracked変更なし。`cloud-api/node_modules`復旧のみ

C1通過根拠:

- processor targeted test: PASS (`CX-O12C-006`)
- root build: PASS (`CX-O12C-006`)
- one-shot CLI usage: PASS / exit code 2 (`CX-O12C-006`)
- full test: PASS (`CX-O12C-007`)
- final worktree CLEAN

**C1 Exit Check: COMPLETE**

## 7. C2 — 実装済み / N100検証待ち

ChatGPTがremote `master`へ追加実装した。

### 新規Processor modules

- `processor/types.ts`
  - `ProcessorConfig`
  - `SourceIntegrationPolicy`
  - canonical block / overlap / integration / sleep-day型
  - v1既定config: `Asia/Tokyo`, boundary `18`, merge `30`, nap `<90`, evening `16-22`, policy version `1`, overlap `0.8/0.3`
- `processor/sleepBlocks.ts`
  - input order非依存のdeterministic block構築
  - array indexをblock IDに使用しない
  - canonical source key生成でabsolute `sourceFile`をidentityへ混ぜない
- `processor/overlaps.ts`
  - full / partial overlap thresholdをProcessorConfigから取得
  - deterministic overlap ID
- `processor/integrateSleep.ts`
  - `SleepSourcePreferenceMap` / UI preferenceを受け取らない
  - deterministic source priority
  - objective reason codeのみ。UI messageなし
  - In Bedはactual sleep overlap時support、非overlap時fallback
- `processor/sleepDays.ts`
  - `sleepDayBoundaryHour`でsleep day割当
  - main sleep = sleep dayごとのlongest block
  - tie-break = duration desc → start asc → block ID lexical
  - block type = main / evening / nap / supplemental / unknown
- `processor/canonicalSleep.ts`
  - blocks → overlaps → integration → sleep daysを1本のpure canonical入口へ統合

### Test

`tests/processor-canonical-integration.test.ts` を追加。

synthetic dataのみで:

- input order変更でもcanonical block ID/result不変
- absolute source path表現変更でもcanonical block identity不変
- overlap 0.8 / 0.3 threshold
- config変更によるoverlap判定変更
- Processorに`SleepSourcePreferenceMap` / `sourcePreferences`なし
- main sleep longest rule
- deterministic tie-break
- In Bed support/fallback objective reason code
- decisionにUI `message`不要

root `test:processor`へC2 testを追加済み。

### Web compatibility

C2では既存 `src/lib/analysis/buildUnifiedSleepTimeline.ts` を変更していない。

既存Web挙動を維持したままProcessor canonical pathを別に確立し、O-12fでWeb consumerをProcessed Data側へ移す。

### C2検証

`CX-O12C-008`: [`o12c-c2-validation.md`](./o12c-c2-validation.md)

- latest `master`へff-only
- 既存root/cloud-api dependenciesを再利用
- `npm run test:processor`
- `npm run build`
- `npm test`
- Processor forbidden import scan
- final worktree CLEAN
- code/docs編集・package install禁止

C2 PASSまではC3コードを重ねない。

## 8. C3 — 未着手

C2 PASS後にCloud側pure logicをProcessorへ回収する。

対象:

- `cloud-api/src/lib/healthMetricAggregator.ts`
- `cloud-api/src/lib/sleepWindowMetricAggregator.ts`

方針:

- Firestore型をProcessor canonical型へ置換
- Processorから`userId` / `runId`を除去
- Cloud側は必要ならadapterで既存document shapeへ戻す
- daily health metrics / sleep-window metricsをC2 canonical block/configと共有

## 9. O-12c Exit Gate

- [x] C1 standalone importer implementation
- [x] C1 direct one-shot implementation
- [x] C1 targeted processor test PASS
- [x] C1 root build PASS
- [x] C1 one-shot CLI usage PASS / exit 2
- [x] C1 full test PASS
- [ ] C2 canonical source integrationがUI preferenceから独立 — **実装済み、検証待ち**
- [ ] C2 canonical block/sleep-day ruleがv1.0.0と一致 — **実装済み、検証待ち**
- [ ] daily health metricsがProcessor側で生成可能
- [ ] sleep-window health metricsがProcessor側で生成可能
- [ ] watcher/serverがProcessor Core adapterとして動作確認
- [ ] Processor CoreにReact/Firebase/Cloud Run/Firestore/Tailscale/Drive API依存なし
- [ ] O-12c final targeted/full tests + build PASS

# O-12d〜O-12j 安全順序

- O-12d: atomic/versioned snapshot、corruption handling、portable path、fingerprint、watcher/rescan、Drive backup
- O-12e: Rebuild/Migrate/Archive、reconstruction。完了前にCloud dataを削除しない
- O-12f: Sleep CompassをProcessed Data-backed local APIへ移行
- O-12g: same-origin、`127.0.0.1`、Tailscale Serve、Funnel不使用
- O-12h: Cloud/local parity、restart/recovery。完了前にCloud operationを停止しない
- O-12i: Cloud automatic processingを最小・可逆に停止
- O-12j: final resource/Billing audit。`maya-daily-observation-console`用途再確認。Billing disable / project shutdownは安全確認と明示承認後のみ

# 進捗・証拠

## 10. 主要進捗ID

| ID | Phase | 状態 | 結果 |
| --- | --- | --- | --- |
| `GPT-O12A-001..014` | O-12a | COMPLETE | repo/Drive/N100/GCP inventory完了 |
| `GCP-O12A-001..002` | O-12a | PASS | GCP/Billing + `maya` metadata inventory |
| `GPT-O12B-PREP-001..008` | O-12b | COMPLETE | contract設計/schema/inventory反映 |
| `GPT-O12B-FINAL-001` | O-12b | COMPLETE | v1.0.0 Exit Gate |
| `GPT-O12C-001` | O-12c | COMPLETE | coupling map / C1-C3設計 |
| `GPT-O12C-002` | O-12c | COMPLETE | C1 remote implementation |
| `CX-O12C-001..005` | O-12c | CLOSED | worktree hygiene / environment前処理 |
| `CX-O12C-006` | O-12c | PARTIAL PASS | processor test/build/CLI PASS |
| `CX-O12C-007` | O-12c | PASS | Cloud API依存復旧 + full test PASS、C1 COMPLETE |
| `GPT-O12C-003` | O-12c | COMPLETE | C2 canonical objective integration remote implementation |
| `CX-O12C-008` | O-12c | READY | C2 N100 targeted/build/full/依存境界検証 |

## 11. 現在の次作業

### Codex

`CX-O12C-008`のみ。C2のtest/build/full test + forbidden import scan。編集禁止。

### ChatGPT

`CX-O12C-008`をreviewする。PASSならC2を閉じてC3実装へ進む。FAILなら最初のfailureだけを根拠にremote側を修正する。
