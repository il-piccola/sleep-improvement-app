# O-12 作業進捗管理

状態: **O-12a COMPLETE / O-12b COMPLETE / O-12c CODEX NEEDED（C1依存復旧 + 再検証待ち）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
Processed Data Contract: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
Migration Source Map: [`o12-migration-source-map.md`](./o12-migration-source-map.md)  
O-12c設計: [`o12c-processor-independence.md`](./o12c-processor-independence.md)  
C1検証: [`o12c-c1-validation.md`](./o12c-c1-validation.md)  
C1依存復旧: [`o12c-c1-dependency-restore-and-validation.md`](./o12c-c1-dependency-restore-and-validation.md)  
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
| O-12c | Processor独立化 | **CODEX NEEDED — C1実装済み、N100依存復旧 + 再検証待ち** |
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
- Cloud Run `sleep-improvement-api` / `sleep-improvement-drive-sync-api`
- Scheduler `sleep-drive-sync-daily` ENABLED
- Artifact Registry / Firestore / Secret names / Storage / Hosting / relevant APIsをread-only inventory済み
- Cloud Asset Inventory APIは未有効のため有効化せず
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
- immutable completed snapshot
- manifest hash/count
- `complete.json` publication marker
- legacy reader policy
- migration manifest / retention / contract tests
- Web/Cloud/local mapping

snapshot writer/atomic publicationはO-12c/O-12dで実装する。

# O-12c — Processor独立化

## 5. 実装slice

1. **C1 Import boundary + one-shot**
2. **C2 Objective integration policy extraction**
3. **C3 Cloud objective metrics回収**

O-12dのatomic write / corruption / portable path finalization / fingerprint / watcher hardeningは混ぜない。

## 6. C1 — 実装済み / N100再検証待ち

remote `master`へ実装済み:

- `processor/healthAutoExport.ts`
  - raw JSON parse/audit/normalize
  - `HealthStore` / HTTP / Firebase / Firestore依存なし
- `processor/runOnce.ts`
  - serverを起動しないdirect one-shot CLI
  - stdoutへhealth valueを出さない
- `tests/processor-health-auto-export.test.ts`
  - synthetic JSONのみ
- `server/importHealthExports.ts`
  - parse/normalizeをProcessorへ委譲
  - legacy `healthStore` merge/saveはserver adapter側
- `package.json`
  - `processor:once`
  - `test:processor`
  - full test chainへprocessor test追加
- `tsconfig.node.json`
  - `processor`をtypecheck対象へ追加

### C1 N100検証履歴

- `CX-O12C-001`: **BLOCKED**。dirty worktreeを検出しtest/build前に安全停止。
- `CX-O12C-002`: **PASS**。dirty docs 4件をread-only確認、変更なし。
- `CX-O12C-003`: **BLOCKED**。N100側`origin/master`が古く、比較手順書未取得。Git変更なし。
- `CX-O12C-004`: **BLOCKED**。4 docs全件 `SAFE_DISCARD` 判定。3件untrackedのため`git restore` pathspec errorで安全停止。
- `CX-O12C-005`: **ENVIRONMENT BLOCKED**としてreview。SAFE_DISCARD済み4 docs cleanup **PASS**、`master` fast-forward **PASS**、final worktree **CLEAN**。検証対象SHA `f68485027a92fc1b3546da22c20739896d30aef0`。ただし`tsx` / `tsc` が認識されず、processor test/build/full test/one-shot CLIは実処理へ到達しなかった。

`CX-O12C-005`のFAILは現時点でC1コードFAILとみなさない。`package.json` / `package-lock.json`には`tsx`と`typescript`がdevDependenciesとして存在する。N100の`node_modules`未導入またはdevDependencies省略状態を先に復旧する。

### 次の検証

`CX-O12C-006`: [`o12c-c1-dependency-restore-and-validation.md`](./o12c-c1-dependency-restore-and-validation.md)

- clean `master`のみで実行
- `node_modules/.bin/tsx.cmd` / `tsc.cmd`存在確認
- 欠けている場合だけ `npm ci --include=dev`
- `npm install` / package update / global installは禁止
- 依存復旧後に `test:processor → build → npm test → processor:once`
- real Health Auto Export JSONは開かない
- `node_modules`以外のtracked変更が出たらBLOCKED

判定:

- `npm ci`がnetwork/permissionで失敗: BLOCKED
- 依存復旧後にtest/build/CLIが失敗: C1実装側FAILとして調査
- 全PASS: C1を閉じてC2へ進む

## 7. C2 — 設計準備済み / コード未着手

C1 PASSまでコードを積まない。

- `SleepSourcePreferenceMap` 依存をcanonical integrationから除去
- versioned Processor `SourceIntegrationPolicy`
- objective reason codeとUI message分離
- overlap thresholdをconfig/provenanceへ接続
- deterministic canonical block ID
- main sleep = longest block per sleep day

設計: [`o12c-c2-implementation-plan.md`](./o12c-c2-implementation-plan.md)

## 8. C3 — 未着手

Cloud側pure logicをProcessorへ回収する。

- `cloud-api/src/lib/healthMetricAggregator.ts`
- `cloud-api/src/lib/sleepWindowMetricAggregator.ts`

Firestore `userId` / `runId` / document型をProcessor canonical modelから除去し、Cloud側はadapter化する。

## 9. O-12c Exit Gate

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
| `CX-O12C-001` | O-12c | BLOCKED | dirty worktree安全停止 |
| `CX-O12C-002` | O-12c | PASS | dirty docs read-only確認 |
| `CX-O12C-003` | O-12c | BLOCKED | stale origin/master、変更なし |
| `CX-O12C-004` | O-12c | BLOCKED / SAFE_DISCARD CONFIRMED | 4 docs全件保存不要確定 |
| `CX-O12C-005` | O-12c | ENVIRONMENT BLOCKED | cleanup/ff-only/CLEAN PASS、tsx/tsc欠落で検証未到達 |
| `CX-O12C-006` | O-12c | READY | devDependencies復旧 + C1再検証 |

## 11. 現在の次作業

### Codex

`CX-O12C-006`のみ。既存lockfile依存の復旧とC1 validation。コード編集禁止。

### ChatGPT

`CX-O12C-006`結果をreviewする。依存復旧後のtest/buildがPASSならC1を閉じ、C2実装へ進む。FAILならログを最小限取得しChatGPT側で修正する。
