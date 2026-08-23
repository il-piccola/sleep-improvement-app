# O-12 作業進捗管理

状態: **O-12a BLOCKED（未説明Cloud Run 1件の分類のみ残り） / O-12b PREPARATION（静的設計ほぼ完了）**  
基準文書: [`o12-local-first-cloud-exit-plan.md`](./o12-local-first-cloud-exit-plan.md)  
O-12b契約: [`o12-processed-data-contract.md`](./o12-processed-data-contract.md)  
O-12b JSON Schema: [`o12-processed-data-schema.json`](./o12-processed-data-schema.json)  
GCP監査手順: [`o12-gcp-readonly-audit.md`](./o12-gcp-readonly-audit.md)  
GCP監査結果: [`o12-gcp-audit-result.md`](./o12-gcp-audit-result.md)  
主フェーズ: **O-12a — 現状監査**  
並行準備: **O-12b — Processed Data Contract**  
次の担当: **Cloud Shellで未説明Cloud Run 1件をread-only分類 / 結果レビューはChatGPT**  
最終更新日: **2026-08-23**

この文書はO-12の実作業を管理する中心文書です。進捗、ChatGPT/Codexの分担、証拠、判断、ブロッカーを日本語で管理します。基準文書と矛盾する場合は基準文書を優先します。

## 1. 運用原則

- O-12は **ChatGPT優先・Codex最小化** で進める。
- ChatGPTがGitHub/code/docs/connected Drive/公開仕様/設計/review/gate判定を担当する。
- CodexはN100 local filesystem/runtime/build/testなど、ChatGPTから直接実行できない作業だけ担当する。
- 一度PASSした項目を理由なく再確認しない。
- 前フェーズ待ちでもChatGPTは1フェーズ先の非破壊・非確定作業をPREPARATIONとして進められる。
- Exit Gateは `O-12a → b → c → d → e → f → g → h → i → j` の順番を崩さない。
- 停止、削除、無効化、移行、上書き、Billing変更、Project shutdownは該当gateとユーザー明示承認後のみ実行する。
- raw health data、secret、token、OAuth credential、不要なaccount/tailnet識別情報をrepositoryへ記録しない。

## 2. Phase一覧

| Phase | 内容 | 状態 |
| --- | --- | --- |
| O-12a | 現状監査 | **BLOCKED — 未説明Cloud Run 1件の分類のみ残り** |
| O-12b | Processed Data Contract | **PREPARATION — 静的設計ほぼ完了** |
| O-12c | Processor独立化 | **NOT STARTED** |
| O-12d | Processor堅牢化 | **NOT STARTED** |
| O-12e | 既存データ移行 | **NOT STARTED** |
| O-12f | Sleep Compass独立化 | **NOT STARTED** |
| O-12g | Local Web + Tailscale | **NOT STARTED** |
| O-12h | 並行検証・復旧試験 | **NOT STARTED** |
| O-12i | Cloud運用停止 | **NOT STARTED** |
| O-12j | Cloud完全撤去 | **NOT STARTED** |

# O-12a — 現状監査

## 3. 既に確認済み

### GitHub / local architecture

- [x] `master` code/docs/dependency/Cloud/Firebase参照を監査
- [x] `server/server.ts` local HTTP API + watcherを確認
- [x] serverが `0.0.0.0` bind、起動時watcher開始
- [x] `server/importHealthExports.ts` が `mergeAndAnalyzeSleepRecords` を直接呼びProcessor未独立
- [x] `server/config.ts` に旧Windows drive-letter既定pathが残る
- [x] `health-store.json` / `processed-files.json` の直接上書き・read失敗時empty state問題
- [x] processed ledger 500件上限とfull-file SHA-256 fingerprint

### Connected Google Drive / N100

- [x] connected Driveで `Health Auto Export/Sleep` raw source存在
- [x] 2026-08-23までの日付付きHealth Auto Export JSON存在
- [x] N100で `L:` driveを目視確認
- [x] `L:\マイドライブ\Health Auto Export` を目視確認
- [x] 配下の `Sleep` directoryを目視確認
- [x] `L:` は現環境の観測値であり実装へhardcodeしない
- [x] `server-data: ABSENT` をcurrent-stateとして受理
- [x] GoogleDriveFS process running

### Tailscale

- [x] Windows service存在
- [x] Status `Running`
- [x] StartType `Automatic`
- [x] Serve configured状態はO-12gで新しいlocalhost-only構成を検証するためO-12a必須証拠から外す

### Git/runtime/schema

- [x] Git `master`, clean, `origin/master`同期（Codex監査時点）
- [x] Node.js `v22.23.1`
- [x] npm `10.9.8`
- [x] O-12b JSON Schema JSON構文PASS

## 4. `GCP-O12A-001` 結果レビュー

詳細: [`o12-gcp-audit-result.md`](./o12-gcp-audit-result.md)

判定: **PARTIAL PASS**

確認済み:

- [x] project `sleep-improvement-cloud` lifecycleState `ACTIVE`
- [x] `billingEnabled: true`
- [x] Cloud Run `sleep-improvement-api` / `asia-northeast1`
- [x] Cloud Run `sleep-improvement-drive-sync-api` / `asia-northeast1`
- [x] Cloud Scheduler `sleep-drive-sync-daily` / `asia-northeast1` / `ENABLED`
- [x] Artifact Registry `cloud-run-source-deploy` / `DOCKER`
- [x] Firestore `(default)` / `asia-northeast1` / `FIRESTORE_NATIVE`
- [x] Secret Manager names: `drive-sync-api-token`, `health-export-api-token`
- [x] Cloud Storage bucket `run-sources-sleep-improvement-cloud-asia-northeast1`
- [x] Service Account count `5`
- [x] Cloud Build trigger一覧は空
- [x] relevant enabled APIsを確認
- [x] Firebase Hosting site ID `sleep-improvement-cloud`
- [x] Cloud Asset Inventory APIは未有効のため未実行。APIは有効化しない。
- [x] GCP resource/Billing/Firestore/Drive設定変更なし

### 未説明resource

Cloud Runに次のserviceを追加で確認した。

- `maya-daily-observation-console` / `asia-northeast1`

Sleep Compass repository内を検索しても参照を確認できなかった。

O-12の「重要な未説明resourceを残さない」という監査目的により、このserviceの用途/由来をread-only metadataで1回だけ分類するまではO-12aをCOMPLETEにしない。

**停止・削除・変更はしない。**

## 5. O-12a Exit Gate

残りは1点だけ:

- [ ] `maya-daily-observation-console` を Sleep Compass関連 / 他用途 / 不明 のいずれかへ分類する

すでに満たしたもの:

- [x] Git/repository architecture
- [x] connected Drive raw source existence
- [x] N100 OS-visible Drive boundary
- [x] local runtime Node/npm
- [x] `server-data` current state
- [x] Tailscale Windows service current state
- [x] GCP project/Billing/control-plane主要category
- [x] Firestore database metadata
- [x] Hosting / Secrets / Storage / Artifact Registry / Scheduler

Firestore document本文やhistorical migration実行はO-12eで扱う。

# O-12b — Processed Data Contract

## 6. 状態

**PREPARATION。静的設計ほぼ完了。O-12a完了後にfinal reviewしてExit Gate判定。**

ChatGPT完了:

- [x] canonical dataset / format
- [x] `schemaVersion` / `processorVersion` / `generatedAt` / provenance
- [x] processing config / sleep-day provenance
- [x] legacy reader compatibility policy
- [x] snapshot publication / completion marker / retention
- [x] migration manifest
- [x] raw/local/Cloud schema対応
- [x] contract test case
- [x] machine-readable JSON Schema
- [x] JSON Schema JSON構文PASS
- [x] source integration / overlap / block classification static cross-check
- [x] `server-data: ABSENT` をmigration前提へ反映
- [x] N100 raw root観測値をportable-path方針へ反映
- [x] GCP実在resource/Firestore database metadataをmigration前提へ反映可能な状態まで取得

O-12a結果からの現在の扱い:

- `health-store.json` / `processed-files.json` は現時点でrepo直下`server-data`に存在しない。
- connected Drive raw sourceとFirestoreデータcategoryは主要migration source候補。
- Firestore実在databaseは `(default)` / `asia-northeast1` / `FIRESTORE_NATIVE`。
- Cloud運用履歴resource（Scheduler / Artifact Registry / Storage / Secrets / Cloud Run）はO-12e/O-12jでRebuild/Migrate/Archiveまたは撤去対象として分類する。
- N100 raw rootの `L:\マイドライブ\Health Auto Export` は環境境界でありcontract identityには含めない。

残り:

- [ ] 未説明Cloud Run 1件の分類結果を反映
- [ ] final review
- [ ] Exit Gate判定

成果物:

- `docs/o12-processed-data-contract.md`
- `docs/o12-processed-data-schema.json`

## 7. O-12b主要設計

- completed/versioned immutable snapshot
- canonical JSON/JSONL
- `manifest.json` にschema/processor/config/count/hash
- `complete.json` を最終publication marker
- raw watch rootとprocessed backupを分離
- host absolute path/drive letterをpersistent IDへ含めない
- fragmentation/circadian/actionはSleep Compass側へ残す
- source integration policyをUI preferenceから独立させる
- overlap policy 80%/30%をprovenance/policy versionで追跡
- canonical block IDをdeterministicにする
- main sleepはsleep day単位で整合させる

# O-12c〜O-12j

## 8. O-12c — Processor独立化

状態: **NOT STARTED**

O-12b Exit Gate通過後に開始する。

ChatGPT:

- importer / `healthStore` / API / React / Cloud coupling確定
- Processor Core boundary/interface
- Cloud objective metrics/sleep-window処理回収範囲
- file単位実装指示
- Codex diff/test review

Codex:

- reviewed bounded refactor
- direct one-shot processor
- watcherをsame core wrapperへ変更
- targeted test/build

Exit Gate: ProcessorがSleep Compass Web/API、Firebase、Cloud Run、Firestore、Tailscale、Google Drive APIなしで動く。

## 9. O-12d〜O-12j 安全順序

- O-12d: Processor堅牢化、portable path、atomic snapshot、fingerprint、watcher/rescan、Drive backup
- O-12e: Rebuild/Migrate/Archive、clean-room reconstruction。**完了前にCloud dataを削除しない**
- O-12f: Sleep CompassをProcessed Data-backed local APIへ移行
- O-12g: same-origin、`127.0.0.1`、Tailscale Serve、Funnel不使用
- O-12h: Cloud/local parity、restart/recovery。**完了前にCloud operationを停止しない**
- O-12i: 最小・可逆のCloud automatic processing停止
- O-12j: final audit、Billing disable、dedicated project shutdown（安全確認・明示承認後のみ）

# 進捗・証拠管理

## 10. ChatGPT進捗ログ

| ID | Phase | 状態 | 作業 | 結果 |
| --- | --- | --- | --- | --- |
| `GPT-O12A-001` | O-12a | COMPLETE | GitHub/Cloud/Firebase/local architecture監査 | dependencyとmigration seam特定 |
| `GPT-O12A-002` | O-12a | COMPLETE | connected Drive監査 | raw `Health Auto Export/Sleep`確認 |
| `GPT-O12A-003` | O-12a | COMPLETE | Web Cloud API/Auth依存監査 | O-12f minimum parity特定 |
| `GPT-O12A-004` | O-12a | COMPLETE | Firestore category整理 | O-12e分類対象特定 |
| `GPT-O12A-005` | O-12a | COMPLETE | `CX-O12A-001`設計/review | Git/runtime/schema確定 |
| `GPT-O12A-006` | O-12a | COMPLETE | 残監査をGCP/N100へ分離 | 重複Codex作業削減 |
| `GPT-O12A-007` | O-12a | COMPLETE | Cloud Shell GCP監査手順作成 | `GCP-O12A-001` READY |
| `GPT-O12A-008` | O-12a | COMPLETE | `CX-O12A-002` review | Tailscale + server-data確定 |
| `GPT-O12A-009` | O-12a | COMPLETE | Drive streaming location仕様再確認 | drive letter/folder双方を考慮 |
| `GPT-O12A-010` | O-12a | COMPLETE | `CX-O12A-003` review | DriveFS running確定、Codex権限制約特定 |
| `GPT-O12A-011` | O-12a | COMPLETE | Drive mount確認経路を目視read-onlyへ変更 | 追加Codex不要化 |
| `GPT-O12A-012` | O-12a | COMPLETE | N100 Drive目視結果review | Drive boundary PASS |
| `GPT-O12A-013` | O-12a | COMPLETE | `GCP-O12A-001`結果review | GCP主要category確定、未説明Cloud Run 1件を特定 |
| `GPT-O12A-014` | O-12a | COMPLETE | repositoryで未説明service名を検索 | Sleep Compass repo内に参照なし |
| `GPT-O12B-PREP-001` | O-12b | COMPLETE | existing contract/schema比較 | 継承/分離方針確定 |
| `GPT-O12B-PREP-002` | O-12b | COMPLETE | Processed Data Contract作成 | contract draft作成 |
| `GPT-O12B-PREP-003` | O-12b | COMPLETE | snapshot/version/provenance/migration/test設計 | 静的主要設計完了 |
| `GPT-O12B-PREP-004` | O-12b | COMPLETE | JSON Schema作成 | machine-readable schema |
| `GPT-O12B-PREP-005` | O-12b | COMPLETE | integration/overlap/block static review | O-12c refactor論点特定 |
| `GPT-O12B-PREP-006` | O-12b | COMPLETE | Codex schema syntax result review | JSON syntax PASS |
| `GPT-O12B-PREP-007` | O-12b | COMPLETE | `server-data: ABSENT` をmigration前提へ反映 | legacy-local sourceを条件付き扱いに変更 |
| `GPT-O12B-PREP-008` | O-12b | COMPLETE | N100 raw root観測をportable-path方針へ反映 | `L:` hardcode禁止、configured root利用 |

## 11. 外部実行キュー

| ID | Phase | 状態 | 内容 | ChatGPT review |
| --- | --- | --- | --- | --- |
| `CX-O12A-001` | O-12a | PARTIAL PASS | Git/runtime/schema + 広域監査試行 | 確定項目を再確認対象から除外 |
| `CX-O12A-002` | O-12a | PARTIAL PASS | N100 filesystem + Tailscale | Tailscale/server-data PASS |
| `CX-O12A-003` | O-12a | PARTIAL PASS / BLOCKED | DriveFS mount再監査 | DriveFS running PASS、mount列挙は権限制約。再実行しない |
| `OBS-O12A-DRIVE-001` | O-12a | PASS | N100上のDrive目視 | `L:\マイドライブ\Health Auto Export\Sleep` 確認済み |
| `GCP-O12A-001` | O-12a | **PARTIAL PASS** | Cloud Shell read-only control-plane/Billing監査 | 主要category確認。未説明Cloud Run 1件のみ残り |
| `GCP-O12A-002` | O-12a | **READY** | `maya-daily-observation-console` の最小read-only metadata確認 | 未実行 |

## 12. 証拠台帳

| Evidence ID | Phase | Source | 内容 |
| --- | --- | --- | --- |
| `EV-BASELINE-001` | 全体 | GitHub | O-12基準文書 |
| `EV-PROGRESS-001` | 全体 | GitHub | 本進捗文書 |
| `EV-O12A-GH-001` | O-12a | GitHub | code/local/Cloud dependency audit |
| `EV-O12A-DRIVE-001` | O-12a | connected Drive | raw source経路と最新JSON |
| `EV-O12A-CX-001` | O-12a | Codex | Git/runtime/schema + blocker |
| `EV-O12A-CX-002` | O-12a | Codex | Tailscale Running/Automatic + server-data ABSENT |
| `EV-O12A-CX-003` | O-12a | Codex | DriveFS running + mount列挙権限制約 |
| `EV-O12A-DRIVE-OBS-001` | O-12a | N100 user observation | OS-visible raw root確認 |
| `EV-O12A-GCP-001` | O-12a | Cloud Shell | Project/Billing/Run/Scheduler/Artifact/Firestore/Secrets/Storage/APIs/Hosting |
| `EV-O12B-CONTRACT-001` | O-12b | GitHub | Processed Data Contract |
| `EV-O12B-SCHEMA-001` | O-12b | GitHub/Codex | JSON Schema + JSON syntax PASS |

## 13. 現在の次の作業

### Codex

**追加Codexなし。** O-12aのlocal/N100確認は完了。

### GCP

Cloud Shellで `docs/o12-gcp-audit-result.md` の「次の最小確認」にある `GCP-O12A-002` 相当のread-only `gcloud run services describe` を1回だけ実行する。

### ChatGPT

結果をreviewし:

1. `maya-daily-observation-console` を分類
2. O-12a Exit Gate判定
3. O-12a COMPLETEならO-12bへ最終結果反映
4. Processed Data Contract final review
5. 静的に十分なら追加CodexなしでO-12b Exit Gate判定
6. O-12b COMPLETE後にのみO-12cを開始
